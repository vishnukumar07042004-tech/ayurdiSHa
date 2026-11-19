/**
 * Merge benchmark — runs the real shared merge (`buildClusters`) on the labelled corpus in
 * tests/fixtures/merge-benchmark.json and scores the groups against the ground-truth intents.
 * Pure local computation: no network, no store, nothing written to Firestore.
 *
 *   npm run bench:merge                         # dev + test + all, sub-areas kept and mixed
 *   npm run bench:merge -- --split test         # held-out intents only
 *   npm run bench:merge -- --module scripts/bench/merge-v1.js   # score the pre-tuning module
 *   npm run bench:merge -- --example 0.42       # worked example at one threshold
 *   npm run bench:merge -- --errors dev 0.42    # list wrong merges / missed pairs (dev only)
 *   npm run bench:merge -- --json out.json      # machine-readable results
 *
 * Metrics (all over the questions in the chosen split):
 *   P / R / F1   pairwise: a "predicted pair" = two questions in the same group; correct when
 *                they share an intent. R counts every same-intent pair, so it can never reach 1
 *                when an intent has more than `maxPack` questions — `R/ceil` divides by the best
 *                recall any pack-capped grouping could reach.
 *   P~           lenient precision: pair also counted correct when the intents share a family
 *                (one broader mentor answer would still serve both).
 *   F0.5         precision-weighted F (a wrong merge hurts a student more than a missed one).
 *   B3           B-cubed F1 (per-question precision / recall, averaged).
 *   purity       Σ max-intent count per group / N.
 *   missrv       % of students whose own intent differs from the group's shown question
 *                (the representative) — they would read an answer to a different question.
 *   merged       % of questions that sit in a group of 2+.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, n = 1) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  return n === 1 ? (args[i + 1] ?? true) : args.slice(i + 1, i + 1 + n);
};

const modulePath = flag("module") ? path.resolve(ROOT, flag("module")) : path.join(ROOT, "shared/merge.js");
const M = await import(pathToFileURL(modulePath).href);
const { buildClusters, MERGE_DEFAULTS } = M;
/** `--opts '{"packTarget":1}'` passes extra buildClusters options (ablations). */
const EXTRA_OPTS = flag("opts") ? JSON.parse(flag("opts")) : {};
const MAX_PACK = EXTRA_OPTS.maxPack || MERGE_DEFAULTS.maxPack;

/** `--fixture other.json` scores any labelled corpus ({questions:[…intent,family]} or {subs:[…intent,fam]}). */
const FIXTURE = path.resolve(ROOT, flag("fixture") || "tests/fixtures/merge-benchmark.json");
const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const data = raw.questions ? raw : {
  meta: { testIntents: 0 },
  intents: [...new Set(raw.subs.map(s => s.intent))],
  questions: raw.subs.map(s => ({ ...s, family: s.family || s.fam || s.intent, split: s.split || "external" })),
};
const ALL = data.questions;
const subsetOf = split => (split === "all" ? ALL : ALL.filter(q => q.split === split));

function idFactory() {
  let n = 0;
  return () => `AYM-C-B${String(++n).padStart(4, "0")}`;
}

const pairs = n => (n * (n - 1)) / 2;

/** Best pairwise recall reachable when no group may exceed `maxPack` (and sub-areas, when kept apart). */
function ceilingPairs(items, useSub) {
  const counts = new Map();
  items.forEach(q => {
    const k = useSub ? `${q.intent}\u0000${q.subtheme}` : q.intent;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  let total = 0;
  counts.forEach(n => {
    const k = Math.ceil(n / MAX_PACK);
    const base = Math.floor(n / k);
    const extra = n % k;
    total += extra * pairs(base + 1) + (k - extra) * pairs(base);
  });
  return total;
}

export function evaluate(clusters, items, useSub) {
  const byId = new Map(items.map(q => [q.id, q]));
  const intentSize = new Map();
  items.forEach(q => intentSize.set(q.intent, (intentSize.get(q.intent) || 0) + 1));
  let truePairs = 0;
  intentSize.forEach(n => { truePairs += pairs(n); });

  let predPairs = 0, tp = 0, tpLenient = 0, purityHits = 0, missrv = 0, missrvLenient = 0, merged = 0;
  let b3p = 0, b3r = 0, crossTheme = 0, overCap = 0, maxSize = 0;
  clusters.forEach(c => {
    const members = c.memberIds.map(id => byId.get(id));
    const n = members.length;
    maxSize = Math.max(maxSize, n);
    if (n > MAX_PACK) overCap++;
    if (new Set(members.map(m => m.theme)).size > 1) crossTheme++;
    if (n >= 2) merged += n;
    const perIntent = new Map();
    members.forEach(m => perIntent.set(m.intent, (perIntent.get(m.intent) || 0) + 1));
    purityHits += Math.max(...perIntent.values());
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        predPairs++;
        if (members[i].intent === members[j].intent) tp++;
        if (members[i].family === members[j].family) tpLenient++;
      }
    }
    members.forEach(m => {
      const same = perIntent.get(m.intent);
      b3p += same / n;
      b3r += same / intentSize.get(m.intent);
    });
    if (n >= 2) {
      const rep = members.find(m => String(m.question) === String(c.representative)) || members[0];
      members.forEach(m => {
        if (m.intent !== rep.intent) missrv++;
        if (m.family !== rep.family) missrvLenient++;
      });
    }
  });
  const N = items.length;
  const P = predPairs ? tp / predPairs : 1;
  const R = truePairs ? tp / truePairs : 1;
  const ceil = ceilingPairs(items, useSub);
  const fb = (b, p, r) => (p + r ? ((1 + b * b) * p * r) / (b * b * p + r) : 0);
  const B3P = b3p / N;
  const B3R = b3r / N;
  const mergedGroups = clusters.filter(c => c.memberIds.length >= 2);
  return {
    N,
    P, Plenient: predPairs ? tpLenient / predPairs : 1, R, Rceil: ceil ? tp / ceil : 1,
    F1: fb(1, P, R), F05: fb(0.5, P, R),
    B3P, B3R, B3F1: fb(1, B3P, B3R),
    purity: purityHits / N,
    missrv: missrv / N, missrvLenient: missrvLenient / N,
    mergedPct: merged / N,
    groups: clusters.length,
    mergedGroups: mergedGroups.length,
    singles: clusters.length - mergedGroups.length,
    avgSize: N / clusters.length,
    avgMergedSize: mergedGroups.length ? merged / mergedGroups.length : 0,
    maxSize, overCap, crossTheme,
    idealGroups: [...intentSize.values()].reduce((a, n) => a + Math.ceil(n / MAX_PACK), 0),
  };
}

export function run(items, threshold, useSub) {
  const t0 = performance.now();
  const clusters = buildClusters(items, threshold, useSub, [], { ...EXTRA_OPTS, idFactory: idFactory() });
  const ms = performance.now() - t0;
  return { clusters, ms, ...evaluate(clusters, items, useSub) };
}

function thresholds() {
  const [from, to, step] = [Number(flag("from") || 0.25), Number(flag("to") || 0.70), Number(flag("step") || 0.025)];
  const out = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  if (!out.includes(MERGE_DEFAULTS.threshold)) out.push(MERGE_DEFAULTS.threshold);
  return out.sort((a, b) => a - b);
}

const pct = x => (x * 100).toFixed(1).padStart(5);
const f3 = x => x.toFixed(3);
const HEAD = "thr    |   P     P~    R   R/ceil  F1    F0.5  B3F1 | purity missrv |merged% groups (merged/single) avg  max >cap xTheme |   ms";

function row(t, r) {
  return `${t.toFixed(3)}  | ${f3(r.P)} ${f3(r.Plenient)} ${f3(r.R)} ${f3(r.Rceil)} ${f3(r.F1)} ${f3(r.F05)} ${f3(r.B3F1)} | ${f3(r.purity)} ${pct(r.missrv)}% | ${pct(r.mergedPct)}% ${String(r.groups).padStart(5)} (${String(r.mergedGroups).padStart(3)}/${String(r.singles).padStart(3)})  ${r.avgSize.toFixed(2)} ${String(r.maxSize).padStart(3)} ${String(r.overCap).padStart(3)}  ${String(r.crossTheme).padStart(4)}   | ${r.ms.toFixed(0).padStart(4)}`;
}

/**
 * Recommended default = highest F0.5 on the dev split with sub-areas kept apart, among
 * thresholds where at most 3% of students would see a different question's answer.
 */
function recommend(sweep) {
  const ok = sweep.filter(s => s.missrv <= 0.03);
  const pool = ok.length ? ok : sweep;
  return pool.reduce((a, b) => (b.F05 > a.F05 + 1e-9 ? b : a));
}

function sweepSplit(split, useSub) {
  const items = subsetOf(split);
  return thresholds().map(t => ({ t, ...run(items, t, useSub) }));
}

function printSweep(split, useSub, sweep) {
  const items = subsetOf(split);
  const ideal = sweep[0].idealGroups;
  console.log(`\n=== split=${split} (${items.length} questions, ${new Set(items.map(q => q.intent)).size} intents, ideal ≈ ${ideal} groups) · sub-areas ${useSub ? "KEPT SEPARATE" : "MIXED"} ===`);
  console.log(HEAD);
  sweep.forEach(s => console.log(row(s.t, s) + (s.t === MERGE_DEFAULTS.threshold ? "  ← current default" : "")));
}

/* ------------------------------------------------------------------ */
/* Worked example + error listing                                      */
/* ------------------------------------------------------------------ */

/** Exact in-run scores: same typo folding and rare-term counts the merge uses for that bucket. */
function bucketScorer(items, q, useSub) {
  const bucket = items.filter(x => x.theme === q.theme && (!useSub || x.subtheme === q.subtheme));
  const fold = M.typoFoldMap(bucket);
  const an = new Map(bucket.map(x => [x.id, M.analyzeQuestion(x.question, x.context, fold)]));
  const df = new Map();
  an.forEach(a => a.set.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  return { bucket, an, score: (a, b) => M.questionSimilarity(an.get(a.id), an.get(b.id), df) };
}

function example(threshold, useSub = true) {
  const items = ALL;
  const { clusters } = run(items, threshold, useSub);
  const byId = new Map(items.map(q => [q.id, q]));
  const want = flag("intent") || "aiapget-preparation-strategy";
  const share = c => c.memberIds.filter(id => byId.get(id).intent === want).length / c.memberIds.length;
  const target = clusters
    .filter(c => c.memberIds.length >= 2 && c.memberIds.some(id => byId.get(id).intent === want))
    .sort((a, b) => (share(b) - share(a)) || (b.memberIds.length - a.memberIds.length) || a.id.localeCompare(b.id))[0];
  const members = target.memberIds.map(id => byId.get(id));
  const { bucket, an, score } = bucketScorer(items, members[0], useSub);
  console.log(`\n=== Worked example @ threshold ${threshold} (sub-areas ${useSub ? "kept" : "mixed"}) — group ${target.id} ===`);
  console.log(`theme: ${target.theme} · sub-area: ${target.subtheme} · cohesion (weakest pair) ${target.cohesion} · merged on: ${(target.sharedTerms || []).join(" · ")}`);
  members.forEach((m, i) => console.log(`  [${i + 1}] ${m.id} (${m.intent}) "${m.question}"${m.context ? `  ‹context: ${m.context}›` : ""}\n       tokens: ${[...an.get(m.id).set].join(" ")}`));
  console.log("  pairwise scores:");
  console.log("        " + members.map((_, j) => `  [${j + 1}]`).join(""));
  members.forEach((a, i) => console.log(`   [${i + 1}]  ` + members.map((b, j) => (i === j ? "   — " : ` ${score(a, b).toFixed(2)}`)).join("")));
  console.log(`  representative shown to the mentor: "${target.representative}"`);
  if (target.variants?.length) console.log(`  variants listed under it: ${target.variants.map(v => `"${v}"`).join(" | ")}`);

  const inGroup = new Set(target.memberIds);
  const near = bucket.filter(x => !inGroup.has(x.id)).map(x => {
    const ss = members.map(m => score(x, m));
    return { x, best: Math.max(...ss), mean: ss.reduce((a, b) => a + b, 0) / ss.length, home: clusters.find(c => c.memberIds.includes(x.id)) };
  }).sort((a, b) => b.best - a.best).slice(0, 8);
  console.log("  nearest questions NOT in this group (best / mean score to members → where they went):");
  near.forEach(({ x, best, mean, home }) => console.log(`    ${best.toFixed(2)} / ${mean.toFixed(2)}  ${x.id} (${x.intent}) "${x.question}" → ${home.id} [${home.memberIds.length}]`));

  const negIntents = new Set((data.intents.find(i => i.intent === want) || {}).hardNegOf || []);
  const looks = items.filter(x => negIntents.has(x.intent) && !inGroup.has(x.id));
  if (looks.length) {
    console.log(`  look-alike intents (${[...negIntents].join(", ")}) — scored against the members with the merge's own rules:`);
    looks.forEach(x => {
      const same = x.theme === members[0].theme && (!useSub || x.subtheme === members[0].subtheme);
      if (!same) { console.log(`    —           ${x.id} (${x.intent}) "${x.question}" → different ${x.theme === members[0].theme ? "sub-area" : "theme"}: never compared`); return; }
      const ss = members.map(m => score(x, m));
      const home = clusters.find(c => c.memberIds.includes(x.id));
      console.log(`    ${Math.max(...ss).toFixed(2)} / ${(ss.reduce((a, b) => a + b, 0) / ss.length).toFixed(2)}  ${x.id} (${x.intent}) "${x.question}" → ${home.id} [${home.memberIds.length}]  tokens: ${[...an.get(x.id).set].join(" ")}`);
    });
  }
}

function errors(split, threshold, useSub = true) {
  const items = subsetOf(split);
  const { clusters } = run(items, threshold, useSub);
  const byId = new Map(items.map(q => [q.id, q]));
  console.log(`\n=== Wrong merges @ ${threshold} split=${split} ===`);
  clusters.filter(c => new Set(c.memberIds.map(id => byId.get(id).intent)).size > 1).forEach(c => {
    console.log(`  ${c.id} [${c.memberIds.length}] rep="${c.representative}"`);
    c.memberIds.forEach(id => { const q = byId.get(id); console.log(`     ${q.intent.padEnd(32)} ${q.question}`); });
  });
  console.log(`\n=== Intents split over several groups (beyond the pack cap) @ ${threshold} ===`);
  const where = new Map();
  clusters.forEach(c => c.memberIds.forEach(id => where.set(id, c.id)));
  const byIntent = new Map();
  items.forEach(q => { if (!byIntent.has(q.intent)) byIntent.set(q.intent, []); byIntent.get(q.intent).push(q); });
  byIntent.forEach((qs, intent) => {
    if (qs.length < 2) return;
    const groups = new Set(qs.map(q => where.get(q.id)));
    if (groups.size <= Math.ceil(qs.length / MAX_PACK)) return;
    console.log(`  ${intent} (${qs.length} q → ${groups.size} groups)`);
    const g = new Map();
    qs.forEach(q => { const k = where.get(q.id); if (!g.has(k)) g.set(k, []); g.get(k).push(q.question); });
    g.forEach((list, k) => {
      const c = clusters.find(x => x.id === k);
      console.log(`     ${k} [${c.memberIds.length}]: ${list.map(s => `"${s}"`).join(" | ")}`);
    });
  });
}

/** How many mis-served students staff would catch by reviewing groups below a cohesion floor. */
function review(split, threshold, useSub = true) {
  const items = subsetOf(split);
  const { clusters } = run(items, threshold, useSub);
  const byId = new Map(items.map(q => [q.id, q]));
  const merged = clusters.filter(c => c.memberIds.length >= 2).map(c => {
    const members = c.memberIds.map(id => byId.get(id));
    const rep = members.find(m => m.question === c.representative) || members[0];
    return { c, bad: members.filter(m => m.intent !== rep.intent).length };
  });
  const totalBad = merged.reduce((a, g) => a + g.bad, 0);
  console.log(`\n=== Staff review by cohesion @ ${threshold} split=${split} (${merged.length} merged groups, ${totalBad} mis-served students) ===`);
  console.log("review groups with cohesion <  | groups to review | % of merged groups | mis-served caught");
  [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].forEach(floor => {
    const flagged = merged.filter(g => (g.c.cohesion ?? 1) < floor);
    const caught = flagged.reduce((a, g) => a + g.bad, 0);
    console.log(`  ${floor.toFixed(2).padEnd(29)}| ${String(flagged.length).padStart(16)} | ${pct(flagged.length / merged.length)}%            | ${caught}/${totalBad} (${pct(totalBad ? caught / totalBad : 1)}%)`);
  });
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

console.log(`AYURDISHA merge benchmark · module ${path.relative(ROOT, modulePath)} · default threshold ${MERGE_DEFAULTS.threshold} · pack cap ${MAX_PACK}`);
console.log(`corpus: ${ALL.length} questions, ${data.intents.length} intents (${data.meta.testIntents} held-out test intents)`);

if (flag("example")) {
  example(Number(flag("example")), !args.includes("--mixed"));
} else if (flag("review")) {
  const [split, t] = flag("review", 2);
  review(split || "all", Number(t || MERGE_DEFAULTS.threshold), !args.includes("--mixed"));
} else if (flag("errors")) {
  const [split, t] = flag("errors", 2);
  errors(split || "dev", Number(t || MERGE_DEFAULTS.threshold), !args.includes("--mixed"));
} else {
  const splits = flag("split") ? [flag("split")] : ["dev", "test", "all"];
  const results = {};
  splits.forEach(split => {
    [true, false].forEach(useSub => {
      const sweep = sweepSplit(split, useSub);
      results[`${split}/${useSub ? "kept" : "mixed"}`] = sweep.map(({ clusters, ...rest }) => rest);
      if (!args.includes("--brief")) { printSweep(split, useSub, sweep); return; }
      const best = recommend(sweep);
      const bestF1 = sweep.reduce((a, b) => (b.F1 > a.F1 ? b : a));
      console.log(`${split}/${useSub ? "kept " : "mixed"}  best F0.5 ${row(best.t, best)}`);
      console.log(`${split}/${useSub ? "kept " : "mixed"}  best F1   ${row(bestF1.t, bestF1)}`);
      const cur = sweep.find(s => s.t === MERGE_DEFAULTS.threshold);
      console.log(`${split}/${useSub ? "kept " : "mixed"}  @default  ${row(cur.t, cur)}`);
    });
  });
  const devKey = results["dev/kept"] ? "dev/kept" : Object.keys(results)[0];
  const bestF05 = results[devKey].reduce((a, b) => (b.F05 > a.F05 + 1e-9 ? b : a));
  const safe = recommend(results[devKey]);
  const rec = { t: Number(flag("compare") || 0.45) };
  console.log(`\nOn ${devKey}: best F0.5 at ${bestF05.t}; best F0.5 with ≤ 3% mis-served at ${safe.t}. Comparing current default with --compare ${rec.t}:`);
  ["dev", "test", "all", "external"].filter(s => results[`${s}/kept`]).forEach(s => {
    const cur = results[`${s}/kept`].find(x => x.t === MERGE_DEFAULTS.threshold);
    const r = results[`${s}/kept`].find(x => Math.abs(x.t - rec.t) < 1e-9);
    if (!cur || !r) return;
    console.log(`  ${s.padEnd(4)} current ${MERGE_DEFAULTS.threshold}: P ${f3(cur.P)} R ${f3(cur.R)} F1 ${f3(cur.F1)} missrv ${pct(cur.missrv)}% groups ${cur.groups}`
      + `   |  ${rec.t}: P ${f3(r.P)} R ${f3(r.R)} F1 ${f3(r.F1)} missrv ${pct(r.missrv)}% groups ${r.groups}`);
  });
  if (flag("json")) {
    fs.writeFileSync(path.resolve(ROOT, flag("json")), JSON.stringify({ module: path.relative(ROOT, modulePath), recommended: rec.t, results }, null, 1));
    console.log(`wrote ${flag("json")}`);
  }
}
