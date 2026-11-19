#!/usr/bin/env node
/**
 * Head-to-head merge-engine comparison. Same inputs, same gate settings, same scoring code for
 * every engine. Pure local computation — no store, no network, nothing written to Firestore.
 *
 *   node scripts/bench/compare-engines.mjs                       # A, B, hybrid on all datasets
 *   node scripts/bench/compare-engines.mjs --engines A,B --ops 0.44,0.48
 *
 * Engines   A = scripts/bench/merge-a-live-oct24.js (live before this comparison) · B = scripts/bench/merge-candidate.js
 *           H = scripts/bench/merge-hybrid.js (A + all of B's vocabulary)
 *           L = scripts/bench/merge-hybrid-lite.js (H minus the vocabulary items that misfired on the tuning sets; adopted into shared/merge.js)
 * Datasets  A-1200     tests/fixtures/merge-1200.json (A's tuning set)
 *           B-dev      tests/fixtures/merge-benchmark.json split=dev (B's tuning set)
 *           B-heldout  tests/fixtures/merge-benchmark.json split=test (intents B never saw while tuning)
 *           Fresh-403  scripts/bench/fresh-400.json (written for this comparison; nobody tuned on it)
 *
 * Shared gate settings: threshold, useSub, maxPack 7, packTarget 6, packFloor 0.28. Each engine keeps
 * its own internal link-mean ratios (A 0.6 / 0.75, B 0.8 / 0.8) — those are part of the engine.
 *
 * Metrics (pairs = two students in the same group):
 *   P        same-intent pairs / co-grouped pairs
 *   R        same-intent co-grouped pairs / best reachable (same intent + same theme, packs ≤ 7)
 *   F1       harmonic mean of P and R
 *   wrong    % of all students whose intent differs from their group's mentor question (representative)
 *   wrongMaj % of all students whose intent differs from their group's majority intent
 *   merged   % of students in a group of 2+
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };

const ENGINE_PATHS = {
  A: "scripts/bench/merge-a-live-oct24.js", B: "scripts/bench/merge-candidate.js",
  H: "scripts/bench/merge-hybrid.js", L: "scripts/bench/merge-hybrid-lite.js",
};
const engineKeys = flag("engines", "A,B,H,L").split(",").filter(k => ENGINE_PATHS[k] && fs.existsSync(path.join(ROOT, ENGINE_PATHS[k])));
const ENGINES = {};
for (const k of engineKeys) ENGINES[k] = await import(pathToFileURL(path.join(ROOT, ENGINE_PATHS[k])).href);

const GATES = { maxPack: 7, packTarget: 6, packFloor: 0.28 };
const CAP = GATES.maxPack;
const THRESHOLDS = [];
for (let t = 0.40; t <= 0.5601; t += 0.02) THRESHOLDS.push(Math.round(t * 100) / 100);
const OPS_AT = flag("ops", "0.44,0.48").split(",").map(Number);

/* ------------------------------------------------------------------ */
/* Datasets                                                            */
/* ------------------------------------------------------------------ */

const load = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const norm = s => ({
  id: String(s.id), createdAt: s.createdAt || 0, theme: s.theme || "", subtheme: s.subtheme || "",
  question: s.question || "", context: s.context || "", intent: s.intent, fam: s.fam || s.family || s.intent,
});
const a1200 = load("tests/fixtures/merge-1200.json").subs.map(norm);
const bq = load("tests/fixtures/merge-benchmark.json").questions;
const fresh = load("scripts/bench/fresh-400.json").subs.map(norm);
const DATASETS = {
  "A-1200": a1200,
  "B-dev": bq.filter(q => q.split === "dev").map(norm),
  "B-heldout": bq.filter(q => q.split === "test").map(norm),
  [`Fresh-${fresh.length}`]: fresh,
};

/* ------------------------------------------------------------------ */
/* Scoring (engine-independent)                                        */
/* ------------------------------------------------------------------ */

const C2 = n => (n * (n - 1)) / 2;
function packedPairs(n) {
  const k = Math.ceil(n / CAP);
  const base = Math.floor(n / k);
  const big = n - base * k;
  return big * C2(base + 1) + (k - big) * C2(base);
}
const countBy = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };

const GREETING = /^\s*(?:sir|respected|dear|hello|hii?|hey|namaste|namaskar|pranam|good\s+(?:morning|afternoon|evening)|ma'?am|madam|mam|i\s*am\b|i'm|myself|this\s+is)\b/i;
const HINGLISH = /\b(?:kya|kaise|kare|karu|hai|ke|ki|baad|liye|kahan|kaha|milegi|chahiye|kitna|kitni|kaunsa|kaunsi)\b/i;
const NEUTRAL_STOP = new Set("the and for what how can should which with after from that this are is do does did you your about there have has into will would could bams ayurveda ayurvedic sir please".split(" "));
const bag = q => new Set(String(q).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").split(" ").filter(w => w.length >= 3 && !NEUTRAL_STOP.has(w)));
const cosine = (a, b) => { if (!a.size || !b.size) return 0; let h = 0; a.forEach(x => { if (b.has(x)) h++; }); return h / Math.sqrt(a.size * b.size); };
const loose = s => String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();

function findRep(c, members) {
  if (c.representativeId) { const m = members.find(x => x.id === String(c.representativeId)); if (m) return m; }
  const exact = members.find(x => x.question === c.representative);
  if (exact) return exact;
  const r = loose(c.representative);
  return members.find(x => loose(x.question) === r) || members.find(x => r && loose(x.question).includes(r)) || null;
}

function evaluate(clusters, items) {
  const byId = new Map(items.map(q => [q.id, q]));
  const ceil = [...countBy(items, s => `${s.intent}\u0000${s.theme}`).values()].reduce((a, n) => a + packedPairs(n), 0);
  const allSame = [...countBy(items, s => s.intent).values()].reduce((a, n) => a + C2(n), 0);
  let pairs = 0, tp = 0, tpFam = 0, wrong = 0, wrongFam = 0, wrongMaj = 0, inMerged = 0, cross = 0, overCap = 0, repMissing = 0;
  const seen = new Map();
  const reps = [];
  clusters.forEach(c => {
    (c.memberIds || []).forEach(id => seen.set(String(id), (seen.get(String(id)) || 0) + 1));
    const ms = (c.memberIds || []).map(id => byId.get(String(id))).filter(Boolean);
    const n = ms.length;
    if (new Set(ms.map(m => m.theme)).size > 1) cross++;
    if (n > CAP) overCap++;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      pairs++;
      if (ms[i].intent === ms[j].intent) tp++;
      if (ms[i].fam === ms[j].fam) tpFam++;
    }
    if (n < 2) return;
    inMerged += n;
    const per = countBy(ms, m => m.intent);
    const maj = Math.max(...per.values());
    wrongMaj += n - maj;
    const rep = findRep(c, ms);
    if (!rep) { repMissing++; wrong += n - maj; return; }
    ms.forEach(m => { if (m.intent !== rep.intent) wrong++; if (m.fam !== rep.fam) wrongFam++; });
    const bags = ms.map(m => bag(m.question));
    const cent = ms.map((_, i) => { let s = 0; ms.forEach((__, j) => { if (j !== i) s += cosine(bags[i], bags[j]); }); return s / (n - 1); });
    const ri = ms.indexOf(rep);
    reps.push({
      text: String(c.representative || ""), n,
      isMajority: per.get(rep.intent) === maj,
      centrality: n >= 3 ? (Math.max(...cent) ? cent[ri] / Math.max(...cent) : 1) : null,
    });
  });
  const ids = new Set(items.map(q => q.id));
  const lost = [...ids].filter(id => !seen.has(id)).length;
  const duplicated = [...seen.values()].filter(k => k > 1).length;
  const orphaned = [...seen.keys()].filter(id => !ids.has(id)).length;
  const N = items.length;
  const P = pairs ? tp / pairs : 1;
  const R = ceil ? tp / ceil : 1;
  const cRep = reps.filter(r => r.centrality != null);
  return {
    N, groups: clusters.length, mergedGroups: clusters.filter(c => (c.memberIds || []).length >= 2).length,
    P, Pfam: pairs ? tpFam / pairs : 1, R, Rraw: allSame ? tp / allSame : 1, F1: P + R ? (2 * P * R) / (P + R) : 0,
    wrong: wrong / N, wrongFam: wrongFam / N, wrongMaj: wrongMaj / N,
    mergedPct: inMerged / N, avgSize: N / clusters.length,
    avgMergedSize: inMerged / Math.max(1, clusters.filter(c => (c.memberIds || []).length >= 2).length),
    maxSize: Math.max(0, ...clusters.map(c => (c.memberIds || []).length)),
    crossTheme: cross, overCap, lost, duplicated, orphaned, repMissing,
    rep: {
      groups: reps.length,
      greeting: reps.length ? reps.filter(r => GREETING.test(r.text)).length / reps.length : 0,
      hinglish: reps.length ? reps.filter(r => HINGLISH.test(r.text) || /[\u0900-\u097f]/.test(r.text)).length / reps.length : 0,
      avgChars: reps.length ? reps.reduce((a, r) => a + r.text.length, 0) / reps.length : 0,
      majority: reps.length ? reps.filter(r => r.isMajority).length / reps.length : 1,
      centrality: cRep.length ? cRep.reduce((a, r) => a + r.centrality, 0) / cRep.length : 1,
    },
  };
}

function idf() { let n = 0; return () => `C${String(++n).padStart(5, "0")}`; }
const build = (M, items, t, useSub, prev = []) => M.buildClusters(items, t, useSub, prev, { ...GATES, idFactory: idf() });

/* ------------------------------------------------------------------ */
/* Sweep                                                               */
/* ------------------------------------------------------------------ */

const sweep = [];
for (const [ds, items] of Object.entries(DATASETS)) {
  for (const useSub of [true, false]) {
    for (const t of THRESHOLDS) {
      for (const [ek, M] of Object.entries(ENGINES)) {
        const t0 = performance.now();
        const cl = build(M, items, t, useSub);
        const ms = performance.now() - t0;
        sweep.push({ dataset: ds, engine: ek, useSub, t, ms, ...evaluate(cl, items) });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Operational checks                                                  */
/* ------------------------------------------------------------------ */

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(list, seed) { const r = rng(seed); const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const partition = cl => cl.map(c => [...c.memberIds].map(String).sort().join("|")).sort().join("\n");
const partitionWithRep = cl => cl.map(c => `${[...c.memberIds].map(String).sort().join("|")}=>${c.representative}`).sort().join("\n");
const shapeWithIds = cl => cl.map(c => `${c.id}=${[...c.memberIds].map(String).sort().join("|")}`).sort().join("\n");

function ops(M, t) {
  const times = [];
  for (let k = 0; k < 5; k++) { const t0 = performance.now(); build(M, a1200, t, true); times.push(performance.now() - t0); }
  times.sort((x, y) => x - y);
  const out = { t, runtimeMs1200: { median: times[2], max: times[4] }, datasets: {} };
  for (const [ds, items] of Object.entries(DATASETS)) {
    const r = {};
    for (const useSub of [true, false]) {
      const base = build(M, items, t, useSub);
      const shuffles = [11, 22, 33].map(seed => build(M, shuffle(items, seed), t, useSub));
      r[useSub ? "kept" : "mixed"] = {
        orderIndependent: shuffles.every(s => partition(s) === partition(base)),
        repOrderIndependent: shuffles.every(s => partitionWithRep(s) === partitionWithRep(base)),
        remergeStable: shapeWithIds(build(M, items, t, useSub, base)) === shapeWithIds(base),
      };
    }
    /* Event flow: first 75 % merged, some groups answered / sent / composed, the rest arrive, re-merge. */
    const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const early = sorted.slice(0, Math.floor(sorted.length * 0.75));
    const wave1 = build(M, early, t, true);
    let k = 0;
    const prev = wave1.map(c => {
      k++;
      if (k % 3 === 0) return { ...c, answer: `Answer for ${c.id}`, status: "Published" };
      if (k % 7 === 0) return { ...c, status: "Sent to mentor" };
      if (k % 5 === 0) return { ...c, composite: `Composite ${c.id}`, status: "Composed" };
      return c;
    });
    const locked = prev.filter(c => c.answer || c.status === "Sent to mentor");
    const wave2 = build(M, items, t, true, prev);
    const lockedKept = locked.every(c => {
      const now = wave2.find(x => x.id === c.id);
      return now && (now.answer || "") === (c.answer || "") && partition([now]) === partition([c]);
    });
    const answered = wave2.filter(c => String(c.answer || "").trim()).length;
    const ev = evaluate(wave2, items);
    const composedPrev = prev.filter(c => c.composite && !c.answer && c.status === "Composed");
    r.reMerge = {
      lockedGroups: locked.length, lockedKept,
      answersCopied: answered !== prev.filter(c => c.answer).length,
      lost: ev.lost, duplicated: ev.duplicated, crossTheme: ev.crossTheme, overCap: ev.overCap,
      composedIdsCarried: composedPrev.filter(c => wave2.some(x => x.id === c.id)).length / Math.max(1, composedPrev.length),
    };
    out.datasets[ds] = r;
  }
  return out;
}

const opsResults = {};
for (const [ek, M] of Object.entries(ENGINES)) opsResults[ek] = OPS_AT.map(t => ops(M, t));

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const pct = x => `${(x * 100).toFixed(1)}%`;
const f3 = x => x.toFixed(3);
const lines = [];
const say = s => { lines.push(s); console.log(s); };

say(`# Merge engine comparison — ${new Date().toISOString().slice(0, 10)}`);
say(`Engines: ${engineKeys.map(k => `${k} = ${ENGINE_PATHS[k]}`).join(" · ")}`);
say(`Gates: ${JSON.stringify(GATES)} · thresholds ${THRESHOLDS[0]}–${THRESHOLDS[THRESHOLDS.length - 1]}`);
say(`Datasets: ${Object.entries(DATASETS).map(([k, v]) => `${k} (${v.length})`).join(" · ")}\n`);

for (const ds of Object.keys(DATASETS)) {
  for (const useSub of [true, false]) {
    say(`\n## ${ds} · sub-areas ${useSub ? "kept" : "mixed"}\n`);
    say("| thr | engine | P | R | F1 | wrong (rep) | wrong (majority) | merged | avg group | groups | x-theme | >7 | lost/dup | ms |");
    say("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    THRESHOLDS.forEach(t => engineKeys.forEach(ek => {
      const r = sweep.find(x => x.dataset === ds && x.engine === ek && x.useSub === useSub && x.t === t);
      say(`| ${t.toFixed(2)} | ${ek} | ${f3(r.P)} | ${f3(r.R)} | ${f3(r.F1)} | ${pct(r.wrong)} | ${pct(r.wrongMaj)} | ${pct(r.mergedPct)} | ${r.avgSize.toFixed(2)} | ${r.groups} | ${r.crossTheme} | ${r.overCap} | ${r.lost}/${r.duplicated} | ${Math.round(r.ms)} |`);
    }));
  }
}

say("\n## Operating points (sub-areas kept): best recall with wrong-answer ≤ cap\n");
say("| dataset | engine | cap | thr | P | R | F1 | wrong | merged |");
say("|---|---|---|---|---|---|---|---|---|");
for (const ds of Object.keys(DATASETS)) for (const cap of [0.02, 0.03]) for (const ek of engineKeys) {
  const ok = sweep.filter(x => x.dataset === ds && x.engine === ek && x.useSub && x.wrong <= cap + 1e-12);
  if (!ok.length) { say(`| ${ds} | ${ek} | ${pct(cap)} | — | | | | none ≤ cap in range | |`); continue; }
  const b = ok.reduce((a, x) => (x.R > a.R + 1e-12 ? x : a));
  say(`| ${ds} | ${ek} | ${pct(cap)} | ${b.t.toFixed(2)} | ${f3(b.P)} | ${f3(b.R)} | ${f3(b.F1)} | ${pct(b.wrong)} | ${pct(b.mergedPct)} |`);
}

say("\n## Invariants over the whole sweep\n");
say("| engine | runs | cross-theme groups | groups > 7 | lost | duplicated | orphaned | unmatched representative |");
say("|---|---|---|---|---|---|---|---|");
engineKeys.forEach(ek => {
  const rs = sweep.filter(x => x.engine === ek);
  const sum = k => rs.reduce((a, x) => a + x[k], 0);
  say(`| ${ek} | ${rs.length} | ${sum("crossTheme")} | ${sum("overCap")} | ${sum("lost")} | ${sum("duplicated")} | ${sum("orphaned")} | ${sum("repMissing")} |`);
});

say("\n## Operations\n");
say("| engine | thr | runtime @1200 median / max | dataset | order-indep. (kept/mixed) | rep order-indep. | re-merge stable | locked kept | answers copied | lost/dup after re-merge | composed ids carried |");
say("|---|---|---|---|---|---|---|---|---|---|---|");
engineKeys.forEach(ek => opsResults[ek].forEach(o => Object.entries(o.datasets).forEach(([ds, r]) => {
  say(`| ${ek} | ${o.t} | ${o.runtimeMs1200.median.toFixed(0)} / ${o.runtimeMs1200.max.toFixed(0)} ms | ${ds} | ${r.kept.orderIndependent}/${r.mixed.orderIndependent} | ${r.kept.repOrderIndependent}/${r.mixed.repOrderIndependent} | ${r.kept.remergeStable}/${r.mixed.remergeStable} | ${r.reMerge.lockedKept} (${r.reMerge.lockedGroups}) | ${r.reMerge.answersCopied} | ${r.reMerge.lost}/${r.reMerge.duplicated} | ${pct(r.reMerge.composedIdsCarried)} |`);
})));

say("\n## Representative question quality (sub-areas kept)\n");
say("| dataset | thr | engine | merged groups | starts with greeting | Hinglish/Devanagari | avg chars | rep = majority intent | centrality (1 = most central) |");
say("|---|---|---|---|---|---|---|---|---|");
for (const ds of Object.keys(DATASETS)) for (const t of OPS_AT) for (const ek of engineKeys) {
  const r = sweep.find(x => x.dataset === ds && x.engine === ek && x.useSub && x.t === t);
  if (!r) continue;
  say(`| ${ds} | ${t} | ${ek} | ${r.rep.groups} | ${pct(r.rep.greeting)} | ${pct(r.rep.hinglish)} | ${r.rep.avgChars.toFixed(0)} | ${pct(r.rep.majority)} | ${r.rep.centrality.toFixed(3)} |`);
}

const outJson = path.join(ROOT, "docs/merge/engine-comparison.json");
fs.writeFileSync(outJson, JSON.stringify({
  engines: Object.fromEntries(engineKeys.map(k => [k, ENGINE_PATHS[k]])), gates: GATES, thresholds: THRESHOLDS,
  datasets: Object.fromEntries(Object.entries(DATASETS).map(([k, v]) => [k, v.length])),
  sweep, ops: opsResults,
}, null, 1));
fs.writeFileSync(path.join(ROOT, "docs/merge/engine-comparison-tables.md"), lines.join("\n") + "\n");
console.log(`\nwrote ${path.relative(ROOT, outJson)} and docs/merge/engine-comparison-tables.md`);
