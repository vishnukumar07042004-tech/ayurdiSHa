/**
 * Node helpers for the faculty Q&A bank scripts: read a stream workbook, load / save the bundled
 * `data/faculty/<streamId>.json`, merge a (re-)import onto the existing bank.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { mergeEntry, parseFacultyWorkbook } from "../../shared/facultyWorkbook.js";
import { urlAllowed, loadAllowList } from "../../server/ai/sources.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FACULTY_DIR = path.join(ROOT, "data/faculty");

export function bankPath(streamId) {
  return path.join(FACULTY_DIR, `${streamId}.json`);
}

export function seedParaphrasePath(streamId) {
  return path.join(FACULTY_DIR, "paraphrases", `${streamId}.seed.json`);
}

/** Workbook file → `{ sheetName: grid }`. */
export function readWorkbookSheets(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const out = {};
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false });
  return out;
}

export function loadBank(streamId) {
  try { return JSON.parse(fs.readFileSync(bankPath(streamId), "utf8")); } catch { return null; }
}

export function saveBank(bank) {
  fs.mkdirSync(FACULTY_DIR, { recursive: true });
  const file = bankPath(bank.streamId);
  fs.writeFileSync(file, `${JSON.stringify(bank, null, 1)}\n`);
  return file;
}

/** Seed paraphrases `{ "<id>": [{ text, lang, persona }] }` written by hand for matching. */
export function loadSeedParaphrases(streamId) {
  try { return JSON.parse(fs.readFileSync(seedParaphrasePath(streamId), "utf8")); } catch { return {}; }
}

function addParaphrases(entry, list, source) {
  const have = new Set((entry.paraphrases || []).map(p => String(p.text || p).toLowerCase().trim()));
  const out = [...(entry.paraphrases || [])];
  for (const p of list || []) {
    const x = typeof p === "string" ? { text: p } : p;
    const k = String(x.text || "").toLowerCase().trim();
    if (!k || have.has(k) || k === entry.question.toLowerCase().trim()) continue;
    have.add(k);
    out.push({ text: String(x.text).trim(), lang: x.lang || "en", persona: x.persona || "", source: x.source || source });
  }
  return out;
}

/**
 * Parse a workbook and merge it onto the existing bundle (enrichment and paraphrases survive a
 * re-import; review columns come from the workbook).
 */
export function importWorkbook(file, { streamId: forced = "", now = new Date().toISOString() } = {}) {
  const allow = loadAllowList();
  const parsed = parseFacultyWorkbook(readWorkbookSheets(file), { now, allowedHost: u => urlAllowed(u, allow) });
  const streamId = forced || parsed.streamId;
  if (parsed.errors.length || !streamId) return { parsed, bank: null, streamId };
  const prev = loadBank(streamId);
  const prevById = new Map(((prev && prev.entries) || []).map(e => [e.id, e]));
  const seeds = loadSeedParaphrases(streamId);
  const entries = parsed.entries.map(e => {
    const merged = mergeEntry(prevById.get(e.id), { ...e, streamId });
    merged.paraphrases = addParaphrases(merged, seeds[e.id], "seed");
    return merged;
  });
  const bank = {
    version: 1,
    stream: parsed.stream || (prev && prev.stream) || "",
    streamId,
    workbook: path.relative(ROOT, path.resolve(file)),
    importedAt: now,
    sources: parsed.sources.length ? parsed.sources : (prev && prev.sources) || [],
    instructions: parsed.instructions.length ? parsed.instructions : (prev && prev.instructions) || [],
    entries,
  };
  return { parsed, bank, streamId, previous: prev };
}

export { addParaphrases };
