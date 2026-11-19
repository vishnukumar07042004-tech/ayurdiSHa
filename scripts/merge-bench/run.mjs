#!/usr/bin/env node
/**
 * Accuracy benchmark for the merge engine on the labelled fixture.
 *   node scripts/merge-bench/run.mjs [--engine path] [--fixture path] [--label name] [--opts '{"packTarget":1}']
 * Prints a markdown table and writes docs/merge/bench-<label>.json.
 *
 * Metrics (pairs = two students in the same group):
 *   precision      same-intent pairs / all co-grouped pairs
 *   soft-prec      same-intent-family pairs / all co-grouped pairs (answers overlap)
 *   recall         same-intent co-grouped pairs / best achievable (same theme, packs ≤ maxPack)
 *   F0.5           precision weighted 2× over recall — wrong merges cost more than missed ones
 *   wrong-answer   students whose intent differs from their group's mentor question (representative)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const enginePath = path.resolve(arg("--engine", path.join(here, "../../shared/merge.js")));
const fixture = path.resolve(arg("--fixture", path.join(here, "../../tests/fixtures/merge-1200.json")));
const label = arg("--label", "current");
const extra = JSON.parse(arg("--opts", "{}"));
const M = await import(pathToFileURL(enginePath).href);
const { subs } = JSON.parse(fs.readFileSync(fixture, "utf8"));
const byId = new Map(subs.map(s => [s.id, s]));
const CAP = extra.maxPack || M.MERGE_DEFAULTS.maxPack;

const C2 = n => (n * (n - 1)) / 2;
function bestPairs(n, cap) {
  const packs = Math.ceil(n / cap);
  const base = Math.floor(n / packs);
  const big = n - base * packs;
  return big * C2(base + 1) + (packs - big) * C2(base);
}
const countBy = (list, key) => { const m = new Map(); list.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };
const achievable = [...countBy(subs, s => `${s.intent}|${s.theme}`).values()].reduce((a, n) => a + bestPairs(n, CAP), 0);
const allSame = [...countBy(subs, s => s.intent).values()].reduce((a, n) => a + C2(n), 0);

function idf() { let n = 0; return () => `C${String(++n).padStart(5, "0")}`; }

function evaluate(clusters) {
  let pairs = 0, tp = 0, fam = 0, wrong = 0, wrongSoft = 0, inMerged = 0, cross = 0, overCap = 0;
  clusters.forEach(c => {
    const ms = c.memberIds.map(id => byId.get(id));
    if (new Set(ms.map(m => m.theme)).size > 1) cross++;
    if (ms.length > CAP) overCap++;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      pairs++;
      if (ms[i].intent === ms[j].intent) tp++;
      else if (ms[i].fam === ms[j].fam) fam++;
    }
    if (ms.length >= 2) {
      inMerged += ms.length;
      const rep = ms.find(m => m.question === c.representative) || ms[0];
      ms.forEach(m => { if (m.intent !== rep.intent) { wrong++; if (m.fam !== rep.fam) wrongSoft++; } });
    }
  });
  const audit = M.auditClusters(clusters, subs);
  const precision = pairs ? tp / pairs : 1;
  const recall = tp / achievable;
  const fb = b => (precision + recall ? ((1 + b * b) * precision * recall) / (b * b * precision + recall) : 0);
  return {
    groups: clusters.length,
    singles: clusters.filter(c => c.memberIds.length === 1).length,
    mergedPct: inMerged / subs.length,
    avgSize: subs.length / clusters.length,
    avgMergedSize: inMerged / Math.max(1, clusters.filter(c => c.memberIds.length >= 2).length),
    maxSize: Math.max(...clusters.map(c => c.memberIds.length)),
    precision, softPrecision: pairs ? (tp + fam) / pairs : 1,
    recall, rawRecall: tp / allSame, f1: fb(1), f05: fb(0.5),
    wrongAnswer: wrong / subs.length, wrongAnswerFamily: wrongSoft / subs.length,
    wrongAmongMerged: inMerged ? wrong / inMerged : 0,
    crossTheme: cross, overCap,
    lost: audit.unclustered.length, duplicated: audit.duplicated.length, orphaned: audit.orphaned.length,
  };
}

const thresholds = [];
for (let t = 0.30; t <= 0.6001; t += 0.02) thresholds.push(Math.round(t * 100) / 100);
const rows = [];
[true, false].forEach(useSub => thresholds.forEach(t => {
  const t0 = performance.now();
  const cl = M.buildClusters(subs, t, useSub, [], { idFactory: idf(), ...extra });
  const ms = performance.now() - t0;
  rows.push({ threshold: t, useSub, ms, ...evaluate(cl) });
}));

/* Runtime + operational checks at the default threshold. */
const T0 = M.MERGE_DEFAULTS.threshold;
const times = [];
let first;
for (let k = 0; k < 5; k++) {
  const t0 = performance.now();
  first = M.buildClusters(subs, T0, true, [], { idFactory: idf(), ...extra });
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const shape = cl => cl.map(c => `${c.id}=${[...c.memberIds].sort().join("|")}`).sort().join("\n");
const again = M.buildClusters(subs, T0, true, first, { idFactory: idf(), ...extra });
const stable = shape(again) === shape(first);
const shuffled = M.buildClusters([...subs].reverse(), T0, true, [], { idFactory: idf(), ...extra });
const norm = cl => cl.map(c => [...c.memberIds].sort().join("|")).sort().join("\n");
const orderFree = norm(shuffled) === norm(first);

/* Incremental event flow: 1,000 questions merged, a third of the groups answered, 200 more arrive. */
const early = subs.slice(0, 1000);
const wave1 = M.buildClusters(early, T0, true, [], { idFactory: idf(), ...extra });
const answered = wave1.map((c, i) => (i % 3 === 0 ? { ...c, answer: `Answer ${c.id}`, status: "Published" } : c));
const wave2 = M.buildClusters(subs, T0, true, answered, { idFactory: idf(), ...extra });
const lockedKept = answered.filter(c => c.answer).every(c => {
  const now = wave2.find(x => x.id === c.id);
  return now && now.answer === c.answer && [...now.memberIds].sort().join() === [...c.memberIds].sort().join();
});
const wave2Audit = M.auditClusters(wave2, subs);
const answersCopied = wave2.filter(c => c.answer).length === answered.filter(c => c.answer).length;

/* Representative wording quality at the default threshold. */
const reps = first.filter(c => c.memberIds.length >= 2).map(c => c.representative);
const hinglish = /\b(kya|kaise|kare|karu|hai|ke|ki|baad|liye|kahan|milegi|chahiye)\b/i;
const salute = /^(sir|respected|hello|dear|namaste|ma'?am|i am)/i;
const repQuality = {
  groups: reps.length,
  hinglishOrDevanagari: reps.filter(r => hinglish.test(r) || /[\u0900-\u097f]/.test(r)).length,
  salutation: reps.filter(r => salute.test(r)).length,
  avgChars: Math.round(reps.reduce((a, r) => a + r.length, 0) / Math.max(1, reps.length)),
};

const pct = x => `${(x * 100).toFixed(1)}%`;
const f = x => x.toFixed(3);
console.log(`\nEngine ${path.relative(process.cwd(), enginePath)} · ${subs.length} questions · cap ${CAP} · opts ${JSON.stringify(extra)}`);
console.log(`Achievable same-intent pairs ${achievable} (of ${allSame} total; the rest are split across themes by the students' own picks)\n`);
console.log("| sub-gate | thr | groups | singles | merged | avg merged size | precision | soft-prec | recall | F1 | F0.5 | wrong-answer | cross-theme | >cap | lost/dup | ms |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
rows.forEach(r => console.log(`| ${r.useSub ? "on" : "off"} | ${r.threshold.toFixed(2)} | ${r.groups} | ${r.singles} | ${pct(r.mergedPct)} | ${r.avgMergedSize.toFixed(2)} | ${f(r.precision)} | ${f(r.softPrecision)} | ${f(r.recall)} | ${f(r.f1)} | ${f(r.f05)} | ${pct(r.wrongAnswer)} (${pct(r.wrongAnswerFamily)}) | ${r.crossTheme} | ${r.overCap} | ${r.lost}/${r.duplicated} | ${Math.round(r.ms)} |`));
const best = key => [true, false].map(u => rows.filter(r => r.useSub === u).reduce((a, r) => (r[key] > a[key] ? r : a)));
console.log(`\nBest F1:   sub on ${best("f1")[0].threshold}  ·  sub off ${best("f1")[1].threshold}`);
console.log(`Best F0.5: sub on ${best("f05")[0].threshold}  ·  sub off ${best("f05")[1].threshold}`);
console.log(`Runtime @${T0} (1 run of ${subs.length}): median ${times[2].toFixed(0)} ms, max ${times[4].toFixed(0)} ms`);
console.log(`Re-merge stable: ${stable} · input-order independent: ${orderFree}`);
console.log(`Incremental (1000 → 1200, every 3rd group answered): locked groups kept ${lockedKept}, answers not copied ${answersCopied}, lost ${wave2Audit.unclustered.length}, duplicated ${wave2Audit.duplicated.length}`);
console.log(`Representative wording @${T0}: ${JSON.stringify(repQuality)}`);

const outDir = path.join(here, "../../docs/merge");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `bench-${label}.json`), JSON.stringify({
  engine: path.relative(path.join(here, "../.."), enginePath), opts: extra, count: subs.length, achievable, allSame,
  rows, runtimeMs: { median: times[2], max: times[4] }, stable, orderFree,
  incremental: { lockedKept, answersCopied, lost: wave2Audit.unclustered.length, duplicated: wave2Audit.duplicated.length },
  repQuality,
}, null, 1));
