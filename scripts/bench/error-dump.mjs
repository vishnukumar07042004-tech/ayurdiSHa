#!/usr/bin/env node
/**
 * Dump every co-grouped pair with different intents (a "wrong merge") that an engine makes on the
 * benchmark datasets, with the direct pair score and whether the packing pass was needed.
 *
 *   node scripts/bench/error-dump.mjs                    # live shared/merge.js, 0.48, kept + mixed
 *   node scripts/bench/error-dump.mjs --engine scripts/bench/merge-hybrid-lite.js --t 0.48
 *   node scripts/bench/error-dump.mjs --datasets A-1200,B-dev,Fresh-403   # tuning sets only
 *
 * Writes docs/merge/error-dump.json. Pure local computation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const enginePath = flag("engine", "shared/merge.js");
const T = Number(flag("t", "0.48"));
const M = await import(pathToFileURL(path.join(ROOT, enginePath)).href);

const load = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const norm = s => ({
  id: String(s.id), createdAt: s.createdAt || 0, theme: s.theme || "", subtheme: s.subtheme || "",
  question: s.question || "", context: s.context || "", intent: s.intent, fam: s.fam || s.family || s.intent,
});
const bq = load("tests/fixtures/merge-benchmark.json").questions;
const ALL = {
  "A-1200": load("tests/fixtures/merge-1200.json").subs.map(norm),
  "B-dev": bq.filter(q => q.split === "dev").map(norm),
  "B-heldout": bq.filter(q => q.split === "test").map(norm),
  "Fresh-403": load("scripts/bench/fresh-400.json").subs.map(norm),
};
const want = flag("datasets", Object.keys(ALL).join(",")).split(",");
const DATASETS = Object.fromEntries(Object.entries(ALL).filter(([k]) => want.includes(k)));

function idf() { let n = 0; return () => `C${String(++n).padStart(5, "0")}`; }
const build = (items, useSub, packTarget = 6) => M.buildClusters(items, T, useSub, [], { maxPack: 7, packTarget, packFloor: 0.28, idFactory: idf() });

const out = [];
for (const [ds, items] of Object.entries(DATASETS)) {
  const byId = new Map(items.map(q => [q.id, q]));
  for (const useSub of [true, false]) {
    const cl = build(items, useSub);
    const noPack = build(items, useSub, 1);
    const pass1 = new Map();
    noPack.forEach((c, gi) => c.memberIds.forEach(id => pass1.set(String(id), gi)));
    let wrongPairs = 0;
    cl.forEach(c => {
      const ms = c.memberIds.map(id => byId.get(String(id)));
      if (ms.length < 2) return;
      const rep = ms.find(m => m.id === String(c.representativeId)) || ms[0];
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i];
        const b = ms[j];
        if (a.intent === b.intent) continue;
        wrongPairs++;
        out.push({
          dataset: ds, useSub, group: c.id, size: ms.length,
          viaPacking: pass1.get(a.id) !== pass1.get(b.id),
          sameFamily: a.fam === b.fam,
          score: Math.round(M.scorePair(a, b) * 1000) / 1000,
          repIntent: rep.intent,
          a: { id: a.id, intent: a.intent, q: a.question, ctx: a.context },
          b: { id: b.id, intent: b.intent, q: b.question, ctx: b.context },
          shared: c.sharedTerms,
        });
      }
    });
    console.log(`${ds} ${useSub ? "kept " : "mixed"}: ${wrongPairs} wrong pairs`);
  }
}
const file = path.join(ROOT, flag("out", "docs/merge/error-dump.json"));
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`wrote ${path.relative(ROOT, file)} (${out.length} pairs)`);
