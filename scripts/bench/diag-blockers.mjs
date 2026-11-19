#!/usr/bin/env node
/**
 * Tuning aid (tuning sets only): for every same-bucket pair, which precision-first rule decides it.
 * Shows how many same-intent pairs each rule blocks and how many different-intent pairs it stops,
 * plus a threshold / pair-floor sweep of wrong pairs vs recall.
 *
 *   node scripts/bench/diag-blockers.mjs [--show ask|unmatched|words|anchor|score]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = await import(pathToFileURL(path.join(ROOT, "shared/merge.js")).href);
const args = process.argv.slice(2);
const show = args.includes("--show") ? args[args.indexOf("--show") + 1] : null;
const load = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const norm = s => ({ id: String(s.id), theme: s.theme || "", subtheme: s.subtheme || "", question: s.question || "", context: s.context || "", intent: s.intent });
const bq = load("tests/fixtures/merge-benchmark.json").questions;
const SETS = {
  "A-1200": load("tests/fixtures/merge-1200.json").subs.map(norm),
  "B-dev": bq.filter(q => q.split === "dev").map(norm),
  "Fresh-403": load("scripts/bench/fresh-400.json").subs.map(norm),
};
const T = 0.48;
const tally = {};
const bump = (k, same) => { tally[k] = tally[k] || { same: 0, diff: 0 }; tally[k][same ? "same" : "diff"]++; };
const examples = [];
for (const [ds, items] of Object.entries(SETS)) {
  const buckets = new Map();
  items.forEach(s => { const k = `${s.theme}\u0000${s.subtheme}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(s); });
  buckets.forEach(list => {
    const fold = M.typoFoldMap(list);
    const an = list.map(s => M.analyzeQuestion(s.question, "", fold));
    const df = new Map();
    an.forEach(a => a.set.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const s = M.questionSimilarity(an[i], an[j], df);
      if (s === 0) continue;
      const v = M.pairVerdict(an[i], an[j], s, T);
      const same = list[i].intent === list[j].intent;
      const x = M.intentSignature(an[i]);
      let k;
      if (v.tier === "auto") k = "auto";
      else if (v.conflict) k = `conflict:${v.conflict}`;
      else if (!v.shared.length && !(v.sharedTokens >= 2)) k = "anchor";
      else if (v.unmatched.length) k = "unmatched";
      else if (v.ask !== "same") k = `ask:${v.ask}`;
      else if (!v.close) k = "words";
      else k = s >= 0.36 ? "score 0.36–0.48" : "score <0.36";
      bump(k, same);
      if (show && k.startsWith(show) && same) examples.push(`${ds} ${s.toFixed(2)} ${k} [${v.unmatched.join(",")}] asks ${[...x.asks]}/${[...M.intentSignature(an[j]).asks]} "${list[i].question}" ~ "${list[j].question}"`);
    }
  });
}
console.log("rule → same-intent pairs blocked / different-intent pairs stopped");
Object.entries(tally).sort((a, b) => b[1].same - a[1].same).forEach(([k, v]) => console.log(`${k.padEnd(34)} ${String(v.same).padStart(6)} ${String(v.diff).padStart(8)}`));
if (show) examples.slice(0, 60).forEach(e => console.log(e));

console.log("\nthreshold × pairFloor sweep (sub-areas kept): wrong pairs / same-intent pairs");
const ids = () => { let n = 0; return () => `C${++n}`; };
for (const t of [0.40, 0.42, 0.44, 0.46, 0.48]) for (const pf of [0.6, 0.75]) {
  const row = Object.entries(SETS).map(([ds, items]) => {
    const byId = new Map(items.map(s => [s.id, s]));
    let w = 0, tp = 0;
    M.buildClusters(items, t, true, [], { idFactory: ids(), pairFloor: pf }).forEach(c => {
      const ms = c.memberIds.map(id => byId.get(id));
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) { if (ms[i].intent === ms[j].intent) tp++; else w++; }
    });
    return `${ds} ${w}/${tp}`;
  });
  console.log(`t=${t.toFixed(2)} floor=${pf}: ${row.join("  ")}`);
}
