#!/usr/bin/env node
/**
 * Import a faculty stream workbook (original template or a validated enriched workbook) into
 * `data/faculty/<streamId>.json`. Re-imports keep enrichment + paraphrases and take the review
 * columns (Expert reviewer, Approval status, Reviewer edits / notes) from the workbook.
 *
 *   node scripts/faculty/import-bank.mjs <workbook.xlsx> [--stream=<id>] [--dry-run] [--export=<out.xlsx>]
 */

import fs from "node:fs";
import path from "node:path";
import { importWorkbook, saveBank, ROOT } from "./lib.mjs";
import { enrichedWorkbookBuffer } from "../../server/ai/facultyExport.js";

const args = process.argv.slice(2);
const flag = name => {
  const a = args.find(x => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return null;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const file = args.find(a => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node scripts/faculty/import-bank.mjs <workbook.xlsx> [--stream=<id>] [--dry-run] [--export=<out.xlsx>]");
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(2);
}

const { parsed, bank, streamId, previous } = importWorkbook(file, { streamId: flag("stream") || "" });
const counts = list => list.reduce((m, e) => ({ ...m, [e.status]: (m[e.status] || 0) + 1 }), {});
console.log(`Sheet: ${parsed.sheet || "?"} · rows: ${parsed.entries.length} · stream: ${parsed.stream || "?"} → ${streamId || "?"}`);
if (parsed.unknownHeaders && parsed.unknownHeaders.length) console.log(`Unknown columns (ignored): ${parsed.unknownHeaders.join(", ")}`);
parsed.errors.forEach(e => console.log(`ERROR  ${e}`));
const warn = parsed.warnings;
warn.slice(0, 25).forEach(w => console.log(`warn   ${w}`));
if (warn.length > 25) console.log(`warn   … ${warn.length - 25} more`);
if (!bank) {
  console.error("Import failed — fix the errors above.");
  process.exit(1);
}
console.log(`Statuses: ${JSON.stringify(counts(bank.entries))} · sources sheet: ${bank.sources.length} · paraphrases: ${bank.entries.reduce((n, e) => n + (e.paraphrases || []).length, 0)}`);
if (previous) {
  const before = new Map(previous.entries.map(e => [e.id, e.status]));
  const changed = bank.entries.filter(e => before.has(e.id) && before.get(e.id) !== e.status);
  const added = bank.entries.filter(e => !before.has(e.id));
  console.log(`Re-import: ${added.length} new, ${changed.length} status change(s)${changed.length ? ` (${changed.slice(0, 8).map(e => `${e.id} ${before.get(e.id)}→${e.status}`).join(", ")})` : ""}, ${bank.entries.filter(e => e.answerEditedByFaculty).length} answer(s) edited by faculty`);
}
if (flag("dry-run")) {
  console.log("Dry run — nothing written.");
  process.exit(0);
}
const out = saveBank(bank);
console.log(`Wrote ${path.relative(ROOT, out)}`);
const exp = flag("export");
if (exp) {
  const target = exp === true ? path.join(ROOT, "docs/faculty", `${streamId}-enriched.xlsx`) : path.resolve(exp);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, enrichedWorkbookBuffer(bank));
  console.log(`Wrote ${path.relative(ROOT, target)}`);
}
