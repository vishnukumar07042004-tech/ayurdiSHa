#!/usr/bin/env node
/**
 * Error taxonomy for docs/merge/PRECISION-FIRST-SPEC.md: every wrong merge (two students in one
 * automatic group whose questions need different answers) made by the frozen baseline (A) and the
 * live hybrid before precision-first (H), on every dataset, sub-areas kept and mixed. Each pair is
 * classified by the first precision-first rule (shared/merge.js `pairVerdict`) that rejects it.
 *
 *   node scripts/bench/error-taxonomy.mjs     → docs/merge/error-taxonomy.json + printed tables
 *
 * Pure local computation; nothing is tuned here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const T = 0.48;
const imp = p => import(pathToFileURL(path.join(ROOT, p)).href);
const ENGINES = { A: await imp("scripts/bench/merge-a-live-oct24.js"), H: await imp("scripts/bench/merge-live-hybrid-oct24.js") };
const P = await imp("shared/merge.js");

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
  "B-heldout": bq.filter(q => q.split === "test").map(norm),
  "New-460": load("tests/fixtures/merge-new-460.json").subs.map(norm),
  "New2-499": load("tests/fixtures/merge-new2-500.json").subs.map(norm),
};
function idf() { let n = 0; return () => `C${String(++n).padStart(5, "0")}`; }

const CONFLICT = {
  "different countries": "Different country",
  "different exams": "Different exam",
  "different PG branches": "Different PG branch / specialty",
  "different specialties": "Different PG branch / specialty",
  "different numbers": "Different numbers (months, attempts, lakhs)",
  "with vs without PG": "With vs without PG",
};

function classify(v, engineScore) {
  if (v.conflict) return CONFLICT[v.conflict] || v.conflict;
  if (v.ask === "clash") return "Same subject, different ask";
  if (v.ask === "one-sided") return "One adds a specific ask the other lacks";
  if (v.unmatched.length) return "Extra subject on one side";
  if (!v.shared.length) return "No shared subject anchor";
  if (!v.close) return "Too few shared content words";
  if (engineScore < T) return "Chained (pair below threshold, joined through the group)";
  return "Not caught by pair rules (score / complete linkage only)";
}

const rows = [];
const students = {};
for (const [ds, items] of Object.entries(DATASETS)) {
  const byId = new Map(items.map(q => [q.id, q]));
  for (const useSub of [true, false]) {
    const buckets = new Map();
    items.forEach(s => {
      const k = useSub ? `${s.theme}\u0000${s.subtheme}` : s.theme;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    });
    const ctx = new Map();
    buckets.forEach(list => {
      const fold = P.typoFoldMap(list);
      const an = new Map(list.map(s => [s.id, P.analyzeQuestion(s.question, "", fold)]));
      const df = new Map();
      an.forEach(a => a.set.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
      list.forEach(s => ctx.set(s.id, { a: an.get(s.id), df }));
    });
    for (const [k, M] of Object.entries(ENGINES)) {
      const cl = M.buildClusters(items, T, useSub, [], { maxPack: 7, packTarget: 6, packFloor: 0.28, idFactory: idf() });
      let wrongStudents = 0;
      cl.forEach(c => {
        const ms = c.memberIds.map(id => byId.get(String(id)));
        if (ms.length < 2) return;
        const rep = ms.find(m => m.id === String(c.representativeId)) || ms[0];
        ms.forEach(m => { if (m.intent !== rep.intent) wrongStudents++; });
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
          const x = ms[i];
          const y = ms[j];
          if (x.intent === y.intent) continue;
          const { a, df } = ctx.get(x.id);
          const b = ctx.get(y.id).a;
          const v = P.pairVerdict(a, b, P.questionSimilarity(a, b, df), T);
          const engineScore = M.scorePair(x, y);
          rows.push({
            engine: k, dataset: ds, useSub, category: classify(v, engineScore), lookAlike: x.fam === y.fam,
            engineScore: Math.round(engineScore * 1000) / 1000, a: x.question, b: y.question, intents: [x.intent, y.intent],
          });
        }
      });
      students[`${k}|${ds}|${useSub ? "kept" : "mixed"}`] = { wrong: wrongStudents, n: items.length };
    }
  }
}

const cats = [...new Set(rows.map(r => r.category))];
const table = (engine, useSub) => {
  const sel = rows.filter(r => r.engine === engine && r.useSub === useSub);
  const ds = Object.keys(DATASETS);
  const lines = [`| category | ${ds.join(" | ")} | total | share |`, `|---|${ds.map(() => "---:").join("|")}|---:|---:|`];
  cats.map(c => [c, sel.filter(r => r.category === c).length]).sort((x, y) => y[1] - x[1]).forEach(([c, n]) => {
    if (!n) return;
    lines.push(`| ${c} | ${ds.map(d => sel.filter(r => r.category === c && r.dataset === d).length).join(" | ")} | ${n} | ${((n / sel.length) * 100).toFixed(0)}% |`);
  });
  lines.push(`| **wrong pairs** | ${ds.map(d => sel.filter(r => r.dataset === d).length).join(" | ")} | **${sel.length}** | |`);
  lines.push(`| wrong-answer students | ${ds.map(d => students[`${engine}|${d}|${useSub ? "kept" : "mixed"}`].wrong).join(" | ")} | ${ds.reduce((n, d) => n + students[`${engine}|${d}|${useSub ? "kept" : "mixed"}`].wrong, 0)} | |`);
  lines.push(`| look-alike sibling pairs | ${ds.map(d => sel.filter(r => r.dataset === d && r.lookAlike).length).join(" | ")} | ${sel.filter(r => r.lookAlike).length} | |`);
  lines.push(`| chained (engine pair score < ${T}) | ${ds.map(d => sel.filter(r => r.dataset === d && r.engineScore < T).length).join(" | ")} | ${sel.filter(r => r.engineScore < T).length} | |`);
  return lines.join("\n");
};

let md = "";
for (const e of ["H", "A"]) for (const useSub of [true, false]) {
  md += `\n### Engine ${e} (${e === "H" ? "live before precision-first" : "frozen baseline"}), sub-areas ${useSub ? "kept" : "mixed"}\n\n${table(e, useSub)}\n`;
}
console.log(md);
fs.writeFileSync(path.join(ROOT, "docs/merge/error-taxonomy.json"), JSON.stringify({ threshold: T, students, rows }, null, 1));
fs.writeFileSync(path.join(ROOT, "docs/merge/error-taxonomy-tables.md"), `# Wrong merges by category (threshold ${T})\n${md}`);
console.log("wrote docs/merge/error-taxonomy.json and docs/merge/error-taxonomy-tables.md");
