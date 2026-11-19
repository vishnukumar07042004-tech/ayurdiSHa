#!/usr/bin/env node
/**
 * Enrich a faculty stream bundle with the configured AI provider(s): per row, a DISHA-standard
 * answer (150–250 words, 3 next steps, one mistake, 2–3 cited official passages, verify-locally),
 * confidence + flags and 8–10 paraphrases; then write the enriched validation workbook.
 * NEEDS NETWORK + provider keys (.env.local). Resumable: rows already enriched by a provider are
 * skipped, per side with --both (use --force to redo); the bundle is written atomically
 * (`<file>.tmp` + rename) every 5 completed rows, at the end and on Ctrl-C.
 *
 *   node scripts/faculty/enrich.mjs [--stream=clinical-practice] [--provider=gemini|openai] [--both]
 *        [--concurrency=4] [--limit=N] [--ids=CP-01-001,CP-01-002] [--spend-cap=5] [--force] [--dry-run] [--export-only] [--debug-raw]
 *
 *   --both         primary provider (gemini) writes the row; openai is stored in variants.openai.
 *                  Re-running it fills only the missing sides (e.g. GPT variants that failed).
 *   --provider     writes the PRIMARY answer; refuses (exit 2) when rows already have another
 *                  provider's primary answer, unless --force
 *   --concurrency  rows in parallel (default 4, max 8); with --both both sides of a row run together.
 *                  429 / 5xx back off (Retry-After honoured); repeated 429s lower a provider's concurrency
 *   --limit        at most N rows that still need work
 *   --spend-cap    no new call once this many USD (spent + in-flight estimate) would be passed in this run
 *                  (default 5; alias --max-usd); in-flight calls finish
 *   --dry-run      print the first row's prompt + passages, no calls, nothing written
 *   --export-only  only rebuild docs/faculty/<…>_Enriched.xlsx from the bundle
 *   --debug-raw    per failed side write tmp/enrich-debug/<id>-<provider>.json (reply text, parsed
 *                  JSON keys, finish status, tokens, error; no prompt or keys). tmp/ is gitignored.
 *
 * GPT gets the persona's identity + expertise only (its Ask Desk "Rules" / "Output" sections made GPT
 * answer {"insufficient": true}) and one corrective turn when a reply has no answer.
 */

import path from "node:path";
import { ROOT, bankPath, loadBank } from "./lib.mjs";
import { buildEnrichPrompt, enrichedWorkbookName, parseEnrichOutput, selectPassages } from "./enrichLib.mjs";
import { MAX_CONCURRENCY, createBankWriter, formatEta, parseConcurrency, runEnrichment, writeFileAtomic, writeJsonAtomic } from "./enrichRunner.mjs";
import { enrichedWorkbookBuffer } from "../../server/ai/facultyExport.js";
import { loadKb } from "../../server/ai/retrieve.js";
import { loadAllowList } from "../../server/ai/sources.js";
import { loadPersona } from "../../server/ai/personas/index.js";
import { getProvider, pinProvider, providerReady } from "../../server/ai/runtime.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const streamId = String(args.stream || "clinical-practice");
const cap = Number(args["spend-cap"] ?? args["max-usd"] ?? 5);
const limit = args.limit ? Number(args.limit) : Infinity;
const ids = args.ids ? new Set(String(args.ids).split(",").map(s => s.trim().toUpperCase())) : null;
const primaryId = String(args.provider || "gemini");
const both = Boolean(args.both);
const concurrency = parseConcurrency(args.concurrency);
if (Number(args.concurrency) > MAX_CONCURRENCY) console.log(`--concurrency capped at ${MAX_CONCURRENCY}.`);

let bank = loadBank(streamId);
if (!bank) {
  console.error(`No data/faculty/${streamId}.json — run scripts/faculty/import-bank.mjs first.`);
  process.exit(2);
}

function exportWorkbook() {
  const out = path.join(ROOT, "docs/faculty", enrichedWorkbookName(bank));
  writeFileAtomic(out, enrichedWorkbookBuffer(bank));
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

if (args["export-only"]) {
  exportWorkbook();
  process.exit(0);
}

const kb = await loadKb(null);
const allow = loadAllowList();
const persona = loadPersona(streamId).prompt;
const rows = bank.entries.filter(e => e.status !== "rejected" && (!ids || ids.has(e.id)));
console.log(`${bank.stream} (${streamId}): ${rows.length} row(s) · KB ${kb.chunks.length} passages · concurrency ${concurrency}${both ? " (×2 providers)" : ""} · spend cap $${cap}`);
if (kb.chunks.length < 5) console.log("! The KB is nearly empty — run scripts/faculty/fetch-sources.mjs first or most rows will be flagged limited-sources.");

if (args["dry-run"]) {
  const e = rows[0];
  const passages = selectPassages(e, kb, { allow });
  const p = buildEnrichPrompt(e, { persona, passages, sources: bank.sources });
  console.log(`--- system (${p.system.length} chars) ---\n${p.system}\n--- user ---\n${p.messages[0].content.slice(0, 4000)}`);
  if (both || primaryId === "openai") {
    const g = buildEnrichPrompt(e, { persona, passages, sources: bank.sources, provider: "openai" });
    console.log(`--- gpt system (${g.system.length} chars) ---\n${g.system}`);
  }
  console.log(`Passages for ${e.id}: ${passages.map(x => x.id).join(", ") || "none"}`);
  process.exit(0);
}

// --provider=X writes the primary answer: rows another provider already enriched would be replaced.
const otherPrimary = rows.filter(e => e.enrichedAnswer && e.enrichedBy && e.enrichedBy.provider && e.enrichedBy.provider !== primaryId).length;
if (!both && otherPrimary && !args.force) {
  console.error(`${otherPrimary} row(s) already have a primary answer from another provider; --provider=${primaryId} would replace them.`);
  console.error(`To fill only missing GPT variants run: node scripts/faculty/enrich.mjs --both [--concurrency=4] [--spend-cap=3] (resume skips sides already done). Add --force to replace on purpose.`);
  process.exit(2);
}

const base = await getProvider();
const plan = [{ id: primaryId, variant: false }];
if (both) plan.push({ id: primaryId === "openai" ? "gemini" : "openai", variant: true });
const providers = Object.fromEntries(plan.map(p => [p.id, p.id === "gemini" ? base : pinProvider(base, p.id)]));
for (const p of plan) {
  if (!providerReady(providers[p.id])) {
    console.error(`Provider "${p.id}" is not configured (keys in .env.local). Nothing done.`);
    process.exit(2);
  }
}

const writer = createBankWriter({ bank, save: b => writeJsonAtomic(bankPath(b.streamId), b), every: 5 });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.once(sig, () => {
    writer.flush();
    console.log(`\n${sig}: progress saved to data/faculty/${streamId}.json — re-run the same command to resume.`);
    process.exit(130);
  });
}

const debugDir = args["debug-raw"] ? path.join(ROOT, "tmp/enrich-debug") : null;
let debugWrites = 0;

const r = await runEnrichment({
  writer, rows, plan, providers, concurrency, cap, limit, force: Boolean(args.force),
  prepare: e => {
    const passages = selectPassages(e, kb, { allow });
    return {
      passages,
      prompt: buildEnrichPrompt(e, { persona, passages, sources: bank.sources }),
      prompts: { openai: buildEnrichPrompt(e, { persona, passages, sources: bank.sources, provider: "openai" }) },
    };
  },
  parse: (raw, { entry, passages }) => parseEnrichOutput(raw, { entry, passages, allow }),
  onFailure: debugDir ? rec => { writeJsonAtomic(path.join(debugDir, `${rec.id}-${rec.provider}.json`.replace(/[^A-Za-z0-9._-]/g, "_")), rec); debugWrites++; } : null,
});
if (debugDir && debugWrites) console.log(`--debug-raw: ${debugWrites} failed side(s) → ${path.relative(ROOT, debugDir)}/`);
bank = writer.bank;

const { stats } = r;
const avg = stats.words.length ? Math.round(stats.words.reduce((a, b) => a + b, 0) / stats.words.length) : 0;
const limits = Object.entries(r.limits).filter(([, n]) => n < concurrency).map(([id, n]) => `${id} ${n}`);
console.log(`Done: ${r.done} row(s) enriched, ${r.failed} failure(s), ${r.retries} retr${r.retries === 1 ? "y" : "ies"}, $${r.spent.toFixed(3)} spent in ${formatEta(r.elapsedMs)} · avg ${avg} words · limited-sources ${stats.limited} · claims removed ${stats.removed}${limits.length ? ` · concurrency reduced (${limits.join(", ")})` : ""}`);
exportWorkbook();
