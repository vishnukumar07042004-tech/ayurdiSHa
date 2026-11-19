#!/usr/bin/env node
/**
 * Faculty Q&A bank evaluation (offline, no API calls): matching on the held-out paraphrases
 * (never used for tuning) and unrelated eval-set questions, plus checks of enriched answers
 * (structure, citation validity, medical-safety wording). Writes
 * tests/ai-eval/reports/faculty-bank-<date>.md.
 *
 *   node tests/ai-eval/faculty-bank-eval.mjs [--stream=clinical-practice] [--no-report]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FACULTY_MATCH, buildFacultyIndex, loadFacultyBundles, match } from "../../server/ai/facultyBank.js";
import { loadKb } from "../../server/ai/retrieve.js";
import { loadAllowList, urlAllowed } from "../../server/ai/sources.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const streamId = String(args.stream || "clinical-practice");
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

const bank = loadFacultyBundles({ fresh: true }).find(b => b.streamId === streamId);
if (!bank) { console.error(`No data/faculty/${streamId}.json`); process.exit(2); }
const index = buildFacultyIndex(bank.entries);
const confident = r => r[0] && r[0].decision !== "weak";

/* Matching: held-out paraphrases */
const held = read("faculty-heldout.json").items.filter(x => x.id.startsWith(bank.entries[0].id.slice(0, 2)));
const byLang = {};
let top1 = 0; let recall = 0; let wrong = 0;
const misses = [];
for (const it of held) {
  const r = match(it.q, { index, streamId });
  const ok = r[0] && r[0].id === it.id;
  if (ok) top1++;
  if (ok && confident(r)) recall++;
  if (!ok && confident(r)) wrong++;
  if (!(ok && confident(r))) misses.push(`${it.id} [${it.lang}] "${it.q}" → ${r[0] ? `${r[0].id} ${r[0].score} ${r[0].decision}` : "none"}`);
  const l = (byLang[it.lang] = byLang[it.lang] || { n: 0, ok: 0 });
  l.n++; if (ok && confident(r)) l.ok++;
}

/* Matching: unrelated streams (false matches) and in-domain eval questions (informational) */
const NEG = new Set(["abroad-gulf", "abroad-usa", "abroad-uk-eu", "practice-abroad", "research-phd", "entrepreneurship", "teaching-academia", "export-trade", "industry-pharma", "public-health-policy"]);
const evalItems = read("eval-set.json").items;
const negs = evalItems.filter(x => x.expect && NEG.has(x.expect.stream));
const falseHits = negs.map(x => ({ x, r: match(x.question, { index, streamId: x.expect.stream }) })).filter(h => confident(h.r));
const inDomain = evalItems.filter(x => x.expect && x.expect.stream === streamId);
const inHits = inDomain.filter(x => confident(match(x.question, { index, streamId })));

/* Enriched answers */
const kb = await loadKb(null);
const allow = loadAllowList();
const chunkById = new Map(kb.chunks.map(c => [c.id, c]));
const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const enriched = bank.entries.filter(e => e.enrichedAnswer);
const q = { words: 0, steps: 0, mistake: 0, sources: 0, verify: 0, citeTotal: 0, citeValid: 0, clinical: 0, paraphrases: 0 };
for (const e of enriched) {
  const n = e.enrichedAnswer.split(/\s+/).filter(Boolean).length;
  if (n >= 150 && n <= 250) q.words++;
  if ((e.actions || []).length === 3) q.steps++;
  if (e.mistake) q.mistake++;
  const cites = e.citations || [];
  if (cites.length >= 2 && cites.length <= 3) q.sources++;
  if (!(e.flags || []).includes("needs-state-specific-check") || e.verifyLocally) q.verify++;
  for (const c of cites) {
    q.citeTotal++;
    const ch = chunkById.get(c.chunkId);
    if (ch && urlAllowed(c.url, allow) && norm(ch.text).includes(norm(c.quote))) q.citeValid++;
  }
  if (/\b(?:dose|dosage|\d+\s*mg|twice daily|thrice daily)\b/i.test(e.enrichedAnswer)) q.clinical++;
  if ((e.paraphrases || []).filter(p => p.source === "enrich").length >= 8) q.paraphrases++;
}

const lines = [
  `# Faculty Q&A bank evaluation — ${bank.stream} (${streamId})`,
  "",
  `Run ${new Date().toISOString()} · ${bank.entries.length} rows · ${index.variants.length} indexed variants · thresholds match ${FACULTY_MATCH.match}, margin ${FACULTY_MATCH.margin}, reuse ${FACULTY_MATCH.reuse}`,
  "",
  "## Matching",
  "",
  "| Metric | Value |",
  "|---|---|",
  `| Held-out paraphrases | ${held.length} |`,
  `| Top-1 accuracy | ${top1}/${held.length} (${pct(top1, held.length)}) |`,
  `| Confident and correct (used in drafting) | ${recall}/${held.length} (${pct(recall, held.length)}) |`,
  `| Confident but wrong row | ${wrong}/${held.length} (${pct(wrong, held.length)}) |`,
  ...Object.entries(byLang).map(([l, s]) => `| — ${l} | ${s.ok}/${s.n} (${pct(s.ok, s.n)}) |`),
  `| False matches, unrelated streams | ${falseHits.length}/${negs.length} (${pct(falseHits.length, negs.length)}; target ≤ 2%) |`,
  `| In-domain eval-set questions matched (informational) | ${inHits.length}/${inDomain.length} (${pct(inHits.length, inDomain.length)}) |`,
  "",
  ...(misses.length ? ["Held-out not used:", "", ...misses.map(m => `- ${m}`), ""] : []),
  ...(falseHits.length ? ["False matches:", "", ...falseHits.map(h => `- "${h.x.question}" → ${h.r[0].id} ${h.r[0].score}`), ""] : []),
  "## Enriched answers",
  "",
  enriched.length ? [
    "| Check | Rows |",
    "|---|---|",
    `| Enriched | ${enriched.length}/${bank.entries.length} |`,
    `| 150–250 words | ${q.words}/${enriched.length} |`,
    `| 3 next steps | ${q.steps}/${enriched.length} |`,
    `| Mistake to avoid | ${q.mistake}/${enriched.length} |`,
    `| 2–3 sources | ${q.sources}/${enriched.length} |`,
    `| Verify-locally when state-specific | ${q.verify}/${enriched.length} |`,
    `| Citations valid (in KB, allow-listed, verbatim quote) | ${q.citeValid}/${q.citeTotal} |`,
    `| Dose / prescription wording | ${q.clinical} |`,
    `| ≥ 8 generated paraphrases | ${q.paraphrases}/${enriched.length} |`,
  ].join("\n") : "Not enriched yet — run `node scripts/faculty/enrich.mjs --both --spend-cap=5`.",
  "",
];
const report = lines.join("\n");
console.log(report);
if (!args["no-report"]) {
  const out = path.join(DIR, "reports", `faculty-bank-${new Date().toISOString().slice(0, 10)}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, report);
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}
