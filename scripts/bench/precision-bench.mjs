#!/usr/bin/env node
/**
 * Precision-first benchmark: frozen baseline vs live hybrid vs the precision-first engine.
 * Pure local computation — no store, no network, nothing written to Firestore.
 *
 *   node scripts/bench/precision-bench.mjs              # tuning sets only (A-1200, B-dev, Fresh-403)
 *   node scripts/bench/precision-bench.mjs --errors     # + every wrong pair the new engine makes (tuning sets)
 *   node scripts/bench/precision-bench.mjs --final      # + report sets (B-heldout, New-460) → docs/merge/precision-bench.*
 *
 * Engines  A    scripts/bench/merge-a-live-oct24.js       (frozen baseline)
 *          H    scripts/bench/merge-live-hybrid-oct24.js  (frozen live hybrid before this work)
 *          P    shared/merge.js                           (precision-first; suggestions via suggestMerges)
 *
 * Metrics (pairs = two students in the same group)
 *   wrong     % of students whose intent differs from their group's mentor question
 *   P         same-intent pairs / co-grouped pairs (automatic groups)
 *   R auto    same-intent co-grouped pairs / best reachable (same intent + theme, packs ≤ 7)
 *   R +sugg   same, after staff accept every suggestion (suggestions recomputed after each round)
 *   P sugg    share of pairs added by accepting all suggestions that are same-intent
 *   x-intent  co-grouped pairs from look-alike sibling intents (same family, different intent)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const has = k => args.includes(`--${k}`);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const T = Number(flag("t", "0.48"));
const FINAL = has("final");

const ENGINE_PATHS = { A: "scripts/bench/merge-a-live-oct24.js", H: "scripts/bench/merge-live-hybrid-oct24.js", P: "shared/merge.js" };
const ENGINES = {};
for (const [k, p] of Object.entries(ENGINE_PATHS)) ENGINES[k] = await import(pathToFileURL(path.join(ROOT, p)).href);
const OLD_GATES = { maxPack: 7, packTarget: 6, packFloor: 0.28 };
const CAP = 7;

const load = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const norm = s => ({
  id: String(s.id), createdAt: s.createdAt || 0, theme: s.theme || "", subtheme: s.subtheme || "",
  question: s.question || "", context: s.context || "", intent: s.intent, fam: s.fam || s.family || s.intent,
});
const bq = load("tests/fixtures/merge-benchmark.json").questions;
const DATASETS = {
  "A-1200": load("tests/fixtures/merge-1200.json").subs.map(norm),
  "B-dev": bq.filter(q => q.split === "dev").map(norm),
  "Fresh-403": load("scripts/bench/fresh-400.json").subs.map(norm),
};
if (FINAL) {
  DATASETS["B-heldout"] = bq.filter(q => q.split === "test").map(norm);
  DATASETS["New-460"] = load("tests/fixtures/merge-new-460.json").subs.map(norm);
  DATASETS["New2-499"] = load("tests/fixtures/merge-new2-500.json").subs.map(norm);
}
const ROLE = {
  "A-1200": "tuning", "B-dev": "tuning", "Fresh-403": "tuning", "B-heldout": "report",
  "New-460": "report (frozen; errors inspected after round 1)", "New2-499": "report (frozen 25 Oct, never inspected)",
};

const C2 = n => (n * (n - 1)) / 2;
function packedPairs(n) {
  const k = Math.ceil(n / CAP);
  const base = Math.floor(n / k);
  const big = n - base * k;
  return big * C2(base + 1) + (k - big) * C2(base);
}
const countBy = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };
function idf() { let n = 0; return () => `C${String(++n).padStart(5, "0")}`; }

const build = (k, items, useSub, prev = []) => (k === "P"
  ? ENGINES.P.buildClusters(items, T, useSub, prev, { idFactory: idf() })
  : ENGINES[k].buildClusters(items, T, useSub, prev, { ...OLD_GATES, idFactory: idf() }));

/** Staff accept every suggestion; suggestions are recomputed after each round (as the desk does). */
function acceptAll(clusters, items) {
  let cl = clusters.map(c => ({ ...c, memberIds: [...c.memberIds] }));
  for (let round = 0; round < 8; round++) {
    const sugg = ENGINES.P.suggestMerges(cl, items, { threshold: T });
    if (!sugg.length) break;
    const touched = new Set();
    let changed = false;
    sugg.forEach(s => {
      if (touched.has(s.a) || touched.has(s.b)) return;
      const A = cl.find(c => c.id === s.a);
      const B = cl.find(c => c.id === s.b);
      if (!A || !B || A.memberIds.length + B.memberIds.length > CAP) return;
      touched.add(s.a); touched.add(s.b);
      cl = cl.filter(c => c !== B).map(c => (c === A ? { ...A, memberIds: [...A.memberIds, ...B.memberIds] } : c));
      changed = true;
    });
    if (!changed) break;
  }
  return cl;
}

function pairStats(clusters, byId) {
  let pairs = 0, tp = 0, xIntent = 0;
  clusters.forEach(c => {
    const ms = c.memberIds.map(id => byId.get(String(id)));
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      pairs++;
      if (ms[i].intent === ms[j].intent) tp++;
      else if (ms[i].fam === ms[j].fam) xIntent++;
    }
  });
  return { pairs, tp, xIntent };
}

function evaluate(clusters, items) {
  const byId = new Map(items.map(q => [q.id, q]));
  const ceil = [...countBy(items, s => `${s.intent}\u0000${s.theme}`).values()].reduce((a, n) => a + packedPairs(n), 0);
  let wrong = 0, inMerged = 0, cross = 0, overCap = 0;
  const seen = new Map();
  clusters.forEach(c => {
    c.memberIds.forEach(id => seen.set(String(id), (seen.get(String(id)) || 0) + 1));
    const ms = c.memberIds.map(id => byId.get(String(id)));
    if (new Set(ms.map(m => m.theme)).size > 1) cross++;
    if (ms.length > CAP) overCap++;
    if (ms.length < 2) return;
    inMerged += ms.length;
    const rep = ms.find(m => m.id === String(c.representativeId)) || ms[0];
    ms.forEach(m => { if (m.intent !== rep.intent) wrong++; });
  });
  const ps = pairStats(clusters, byId);
  const N = items.length;
  const mergedGroups = clusters.filter(c => c.memberIds.length >= 2).length;
  return {
    N, wrongN: wrong, wrong: wrong / N, P: ps.pairs ? ps.tp / ps.pairs : 1, R: ceil ? ps.tp / ceil : 1, tp: ps.tp, pairs: ps.pairs,
    xIntent: ps.xIntent, mergedPct: inMerged / N, avgMerged: mergedGroups ? inMerged / mergedGroups : 0, groups: clusters.length,
    crossTheme: cross, overCap,
    lost: items.filter(q => !seen.has(q.id)).length, duplicated: [...seen.values()].filter(k => k > 1).length, ceil,
  };
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(list, seed) { const r = rng(seed); const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const partition = cl => cl.map(c => [...c.memberIds].map(String).sort().join("|")).sort().join("\n");
const shapeWithIds = cl => cl.map(c => `${c.id}=${[...c.memberIds].map(String).sort().join("|")}=>${c.representative}`).sort().join("\n");

function invariants(k, items) {
  const r = {};
  for (const useSub of [true, false]) {
    const base = build(k, items, useSub);
    r[useSub ? "kept" : "mixed"] = {
      orderIndependent: [11, 22, 33].every(seed => partition(build(k, shuffle(items, seed), useSub)) === partition(base)),
      remergeStable: shapeWithIds(build(k, items, useSub, base)) === shapeWithIds(base),
    };
  }
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const wave1 = build(k, sorted.slice(0, Math.floor(sorted.length * 0.75)), true);
  let n = 0;
  const prev = wave1.map(c => {
    n++;
    if (n % 3 === 0) return { ...c, answer: `Answer for ${c.id}`, status: "Published" };
    if (n % 7 === 0) return { ...c, status: "Sent to mentor" };
    return c;
  });
  const locked = prev.filter(c => c.answer || c.status === "Sent to mentor");
  const wave2 = build(k, items, true, prev);
  r.lockedKept = locked.every(c => { const now = wave2.find(x => x.id === c.id); return now && (now.answer || "") === (c.answer || "") && partition([now]) === partition([c]); });
  r.answersCopied = wave2.filter(c => String(c.answer || "").trim()).length !== prev.filter(c => c.answer).length;
  const ev = evaluate(wave2, items);
  r.afterRemerge = { lost: ev.lost, duplicated: ev.duplicated, crossTheme: ev.crossTheme, overCap: ev.overCap };
  return r;
}

const pct = x => `${(x * 100).toFixed(1)}%`;
const f3 = x => x.toFixed(3);
const lines = [];
const say = s => { lines.push(s); console.log(s); };
const results = [];

say(`# Precision-first benchmark — threshold ${T}${FINAL ? " (final: report sets included)" : " (tuning sets only)"}\n`);
for (const useSub of [true, false]) {
  say(`\n## Sub-areas ${useSub ? "kept (default)" : "mixed"}\n`);
  say("| dataset | role | engine | wrong (n) | P auto | R auto | R auto+sugg | P sugg | x-intent pairs | merged | avg merged group | suggestions | x-theme | >7 | lost/dup | ms |");
  say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const [ds, items] of Object.entries(DATASETS)) {
    for (const k of Object.keys(ENGINES)) {
      const t0 = performance.now();
      const cl = build(k, items, useSub);
      const ms = performance.now() - t0;
      const ev = evaluate(cl, items);
      let rs = "—", psug = "—", nsug = "—";
      const row = { dataset: ds, engine: k, useSub, ms, ...ev };
      if (k === "P") {
        const sugg = ENGINES.P.suggestMerges(cl, items, { threshold: T });
        const acc = acceptAll(cl, items);
        const ev2 = evaluate(acc, items);
        const addedPairs = ev2.pairs - ev.pairs;
        const addedTp = ev2.tp - ev.tp;
        row.Rsugg = ev2.R; row.Psugg = addedPairs ? addedTp / addedPairs : 1; row.suggestions = sugg.length; row.wrongAfterAccept = ev2.wrong;
        rs = f3(ev2.R); psug = addedPairs ? f3(addedTp / addedPairs) : "—"; nsug = String(sugg.length);
      }
      results.push(row);
      say(`| ${ds} | ${ROLE[ds]} | ${k} | ${pct(ev.wrong)} (${ev.wrongN}) | ${f3(ev.P)} | ${f3(ev.R)} | ${rs} | ${psug} | ${ev.xIntent} | ${pct(ev.mergedPct)} | ${ev.avgMerged.toFixed(2)} | ${nsug} | ${ev.crossTheme} | ${ev.overCap} | ${ev.lost}/${ev.duplicated} | ${Math.round(ms)} |`);
    }
  }
}

/* Runtime at 1,500 questions: A-1200 + 300 Fresh questions with fresh ids. */
const big = [...DATASETS["A-1200"], ...DATASETS["Fresh-403"].slice(0, 300).map(s => ({ ...s, id: `X${s.id}` }))];
say("\n## Runtime at 1,500 questions (median of 5)\n");
say("| engine | buildClusters (kept) | buildClusters (mixed) | suggestMerges (kept) |");
say("|---|---|---|---|");
const runtime = {};
for (const k of Object.keys(ENGINES)) {
  const time = fn => { const ts = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); fn(); ts.push(performance.now() - t0); } return ts.sort((a, b) => a - b)[2]; };
  const kept = time(() => build(k, big, true));
  const mixed = time(() => build(k, big, false));
  const cl = build(k, big, true);
  const sugg = k === "P" ? time(() => ENGINES.P.suggestMerges(cl, big, { threshold: T })) : null;
  runtime[k] = { kept, mixed, sugg };
  say(`| ${k} | ${kept.toFixed(0)} ms | ${mixed.toFixed(0)} ms | ${sugg == null ? "—" : `${sugg.toFixed(0)} ms`} |`);
}

say("\n## Invariants (new engine P)\n");
say("| dataset | order-independent (kept/mixed) | re-merge stable (kept/mixed) | locked groups kept | answers copied | lost/dup/x-theme/>7 after re-merge |");
say("|---|---|---|---|---|---|");
const inv = {};
for (const [ds, items] of Object.entries(DATASETS)) {
  const r = invariants("P", items);
  inv[ds] = r;
  say(`| ${ds} | ${r.kept.orderIndependent}/${r.mixed.orderIndependent} | ${r.kept.remergeStable}/${r.mixed.remergeStable} | ${r.lockedKept} | ${r.answersCopied} | ${r.afterRemerge.lost}/${r.afterRemerge.duplicated}/${r.afterRemerge.crossTheme}/${r.afterRemerge.overCap} |`);
}

if (has("errors")) {
  say("\n## Wrong pairs made by P (sub-areas kept and mixed, tuning sets only)\n");
  for (const ds of ["A-1200", "B-dev", "Fresh-403"]) {
    const items = DATASETS[ds];
    const byId = new Map(items.map(q => [q.id, q]));
    for (const useSub of [true, false]) {
      build("P", items, useSub).forEach(c => {
        const ms = c.memberIds.map(id => byId.get(id));
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
          if (ms[i].intent === ms[j].intent) continue;
          say(`- ${ds} ${useSub ? "kept" : "mixed"} ${c.id} [${ms[i].intent} | ${ms[j].intent}] "${ms[i].question}" ~ "${ms[j].question}"`);
        }
      });
    }
  }
  if (has("sugg")) {
    say("\n## Wrong suggestions (tuning sets, kept)\n");
    for (const ds of ["A-1200", "B-dev", "Fresh-403"]) {
      const items = DATASETS[ds];
      const byId = new Map(items.map(q => [q.id, q]));
      const cl = build("P", items, true);
      ENGINES.P.suggestMerges(cl, items, { threshold: T }).forEach(s => {
        const A = cl.find(c => c.id === s.a);
        const B = cl.find(c => c.id === s.b);
        const ia = A.memberIds.map(id => byId.get(id).intent);
        const ib = B.memberIds.map(id => byId.get(id).intent);
        if (ia.some(x => ib.includes(x))) return;
        say(`- ${ds} ${s.score} (${s.reason}) [${ia[0]} | ${ib[0]}] "${byId.get(A.memberIds[0]).question}" ~ "${byId.get(B.memberIds[0]).question}"`);
      });
    }
  }
}

if (FINAL) {
  fs.writeFileSync(path.join(ROOT, "docs/merge/precision-bench.json"), JSON.stringify({ threshold: T, engines: ENGINE_PATHS, results, runtime, invariants: inv }, null, 1));
  fs.writeFileSync(path.join(ROOT, "docs/merge/precision-bench-tables.md"), lines.join("\n") + "\n");
  console.log("\nwrote docs/merge/precision-bench.json and docs/merge/precision-bench-tables.md");
}
