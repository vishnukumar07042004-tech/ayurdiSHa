#!/usr/bin/env node
/**
 * Worked example of the AYURDISHA merge engine on 14 realistic questions.
 *   node scripts/merge-demo.mjs                 # current shared/merge.js
 *   node scripts/merge-demo.mjs --engine <path> # any other copy (e.g. a frozen baseline)
 */
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argEngine = process.argv.indexOf("--engine");
const enginePath = argEngine > 0 ? path.resolve(process.argv[argEngine + 1]) : path.join(here, "../shared/merge.js");
const M = await import(pathToFileURL(enginePath).href);

const PG = ["Academics, Teaching & Higher Education", "Choosing a PG branch"];
const PK = ["Clinical Practice & Integrative Care", "Panchakarma & therapy services"];
const CLINIC = ["Clinical Practice & Integrative Care", "Setting up private practice"];
const GOVT = ["Policy, Public Health & Global Agencies", "Government service routes"];

const RAW = [
  ["q01", PG, "What should I do after BAMS — PG or practice?"],
  ["q02", PG, "Is MD Ayurveda better than starting a clinic?"],
  ["q03", PG, "How to prepare for AIAPGET?"],
  ["q04", PG, "Best books for AIAPGET preparation?"],
  ["q05", PG, "BAMS ke baad AIAPGET ki taiyari kaise kare?"],
  ["q06", PG, "How should I prepare for the PG entrance exam during internship?"],
  ["q07", PG, "aiapget prepration startegy for final year"],
  ["q08", PK, "How to start a Panchakarma centre?"],
  ["q09", PK, "How can I open my own panchkarma center after BAMS?"],
  ["q10", PK, "Is a separate certificate needed to run Panchakarma therapy?"],
  ["q11", GOVT, "Govt job options after BAMS?"],
  ["q12", GOVT, "What sarkari naukri can I get after BAMS?"],
  ["q13", GOVT, "How to prepare for state PSC Ayurveda medical officer exam?"],
  ["q14", CLINIC, "Which licence is required to start a clinic?"],
];
const subs = RAW.map(([id, [theme, subtheme], question], i) => ({
  id, ticket: `AYM-Q-${id}`, theme, subtheme, question, context: "", createdAt: 1_760_000_000_000 + i,
}));
const byId = new Map(subs.map(s => [s.id, s]));
const short = t => ({ "Academics, Teaching & Higher Education": "T02", "Clinical Practice & Integrative Care": "T01", "Policy, Public Health & Global Agencies": "T10" }[t] || t);

console.log(`Engine: ${path.relative(process.cwd(), enginePath)}  threshold ${M.MERGE_DEFAULTS.threshold}  maxPack ${M.MERGE_DEFAULTS.maxPack}\n`);
console.log("1) TOKENS (after normalising, stopwords, synonyms, stemming)");
subs.forEach(s => {
  const a = M.analyzeQuestion(s.question, s.context);
  console.log(`  ${s.id} [${short(s.theme)} · ${s.subtheme}]  "${s.question}"\n       → {${[...a.set].join(", ")}}${a.fallback ? "  (fallback: only stopwords)" : ""}`);
});

console.log("\n2) PAIR SCORES (scorePair, same theme + sub-area only; ✔ = clears the threshold)");
const T = M.MERGE_DEFAULTS.threshold;
const groups = new Map();
subs.forEach(s => { const k = `${s.theme}|${s.subtheme}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
groups.forEach(list => {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const v = M.scorePair(list[i], list[j]);
    if (v > 0.05) console.log(`  ${list[i].id}–${list[j].id}  ${v.toFixed(3)} ${v >= T ? "✔" : " "}`);
  }
});

console.log(`\n3) GROUPS from buildClusters(threshold ${T}, keep sub-areas separate)`);
let n = 0;
const out = M.buildClusters(subs, T, true, [], { idFactory: () => `G${String(++n).padStart(2, "0")}` });
out.forEach(c => {
  console.log(`\n  ${c.id} · ${c.kind.toUpperCase()} · ${c.memberIds.length} student(s) · ${short(c.theme)} / ${c.subtheme}` +
    (c.cohesion != null ? ` · cohesion ${c.cohesion.toFixed(2)}` : "") +
    (c.sharedTerms && c.sharedTerms.length ? ` · merged on: ${c.sharedTerms.join(", ")}` : ""));
  console.log(`    QUESTION FOR THE MENTOR → "${c.representative}"`);
  c.memberIds.forEach(id => console.log(`      - ${id}: ${byId.get(id).question}`));
});
const audit = M.auditClusters(out, subs);
console.log(`\n  ${subs.length} questions → ${out.length} groups (${out.filter(c => c.kind === "merged").length} merged, ${out.filter(c => c.kind === "unique").length} single). ` +
  `Lost: ${audit.unclustered.length}, duplicated: ${audit.duplicated.length}.`);
