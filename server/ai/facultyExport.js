/**
 * Faculty validation workbooks: the enriched stream workbook (original columns + DISHA enriched
 * answer, next steps, mistake, citations, confidence, flags, paraphrases; review columns last) and
 * the blank stream template. Same column contract as `shared/facultyWorkbook.js`, so a validated
 * workbook re-imports with the same parser.
 */

import { writeStyledXlsx } from "./facultyXlsx.js";
import { ENRICHED_COLUMNS, ENRICHED_ORDER, FACULTY_COLUMNS, FACULTY_STREAMS, STATUS_LABEL, enrichedRow } from "../../shared/facultyWorkbook.js";

const WIDTH = {
  "Question ID": 12, Stream: 14, Subcategory: 22, "Target audience": 20, "Student question": 38,
  "DISHA draft answer": 48, "Keywords / intent": 22, "Source links (context)": 34, "Validation priority": 18,
  "DISHA enriched answer": 80, "Next steps": 46, "Mistake to avoid": 36, "Citations (URLs)": 40, Confidence: 11,
  "Flags (e.g. needs state-specific check / limited sources)": 28, "Paraphrases (sample)": 44,
  "Expert reviewer": 18, "Approval status": 20, "Reviewer edits / notes": 40,
};

const REVIEW = new Set(["Expert reviewer", "Approval status", "Reviewer edits / notes"]);
const ENRICHED = new Set(ENRICHED_COLUMNS);

export const ENRICHED_INSTRUCTIONS = [
  ["DISHA enriched answer", "DISHA's longer answer for this question, written to the DISHA answer standard (direct answer → explanation → next steps → common mistake → official sources → verify locally). Grounded only in the faculty draft and fetched official passages."],
  ["How to validate", "1. Put your name in Expert reviewer. 2. Read the enriched answer against the cited sources. 3. Edit the enriched answer cell directly if anything is wrong or missing (DISHA treats an edited cell as 'Approved with edits'). 4. Set Approval status: Approved / Approved with edits / Rejected (or leave Draft – pending validation). 5. Use Reviewer edits / notes for comments and exact citations."],
  ["Confidence", "0–1 from DISHA's checker: how well each statement is supported by the cited official passages. Below 0.6 needs close review."],
  ["Flags", "needs-state-specific-check · limited-sources (few official passages found) · clinical-safety-sensitive · time-sensitive · unsupported-claims-removed."],
  ["Paraphrases", "Other ways students may ask the same thing (English, Hinglish, Hindi, short forms). Used only to match student questions to this row; tell us in notes if one means something different."],
  ["What DISHA does with approved rows", "When a student's question matches an approved row, DISHA uses the faculty answer as its authoritative position and personalises it; a mentor still approves every reply. Draft rows are used only as unvalidated framing."],
];

function qaSheet(bank) {
  const rows = [ENRICHED_ORDER.slice(), ...(bank.entries || []).map(enrichedRow)];
  return {
    name: `${bank.stream || "Faculty"} Q&A`,
    rows,
    widths: ENRICHED_ORDER.map(c => WIDTH[c] || 16),
    fills: ENRICHED_ORDER.map(c => (REVIEW.has(c) ? "review" : ENRICHED.has(c) ? "enriched" : "none")),
    boldFirstColumn: true,
  };
}

function coverageSheet(bank) {
  const bySub = new Map();
  for (const e of bank.entries || []) {
    const s = bySub.get(e.subcategory) || { n: 0, ids: [], status: {} };
    s.n++;
    s.ids.push(e.id);
    s.status[e.status] = (s.status[e.status] || 0) + 1;
    bySub.set(e.subcategory, s);
  }
  const statuses = Object.keys(STATUS_LABEL);
  const rows = [["Subcategory", "Question count", "Questions ID range", ...statuses.map(s => STATUS_LABEL[s])]];
  for (const [sub, s] of bySub) rows.push([sub, s.n, `${s.ids[0]} to ${s.ids[s.ids.length - 1]}`, ...statuses.map(k => s.status[k] || 0)]);
  const all = bank.entries || [];
  rows.push(["TOTAL", all.length, "", ...statuses.map(k => all.filter(e => e.status === k).length)]);
  return { name: "Coverage", rows, widths: [44, 15, 26, 24, 12, 20, 12], fills: [], boldFirstColumn: true };
}

function paraphraseSheet(bank) {
  const rows = [["Question ID", "Student question", "Language", "Asked as", "Paraphrase"]];
  for (const e of bank.entries || []) {
    for (const p of e.paraphrases || []) {
      const x = typeof p === "string" ? { text: p } : p;
      rows.push([e.id, e.question, x.lang || "", x.persona || "", x.text || ""]);
    }
  }
  return { name: "Paraphrases", rows, widths: [12, 44, 11, 16, 60], fills: [] };
}

export function enrichedWorkbookName(bank) {
  return bank.streamId === "clinical-practice"
    ? "DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx"
    : `DISHA_${String(bank.stream || bank.streamId).replace(/[^A-Za-z0-9]+/g, "_")}_QA_Enriched.xlsx`;
}

/** Enriched workbook for faculty validation (Buffer). */
export function enrichedWorkbookBuffer(bank) {
  const instructions = [["Item", "Details"], ...(bank.instructions || []), ["", ""], ["Enriched columns (added by DISHA)", ""], ...ENRICHED_INSTRUCTIONS];
  const sources = [["Source", "Official URL", "Use and limitations"], ...(bank.sources || []).map(s => [s.name, s.url, s.note || ""])];
  return writeStyledXlsx([
    qaSheet(bank),
    { name: "Instructions", rows: instructions, widths: [34, 110], fills: [], boldFirstColumn: true, autoFilter: false },
    { name: "Sources", rows: sources, widths: [40, 70, 70], fills: [] },
    coverageSheet(bank),
    paraphraseSheet(bank),
  ]);
}

/** Blank template for a new stream (same 12 columns + Instructions + Sources sheets). */
export function streamTemplateBuffer({ instructions = [], sources = [] } = {}) {
  const example = ["XX-01-001", "<Stream name>", "<Subcategory>", "BAMS / Intern / New graduate", "<How a student would ask it>", "<Faculty draft answer, 2–4 sentences>", "<keywords; separated; by semicolons>", "https://<official source>", "High – regulatory/clinical review", "Unassigned", "Draft – pending validation", ""];
  const streams = [["Stream (type in the Stream column)", "DISHA stream id", "Question ID prefix"], ...FACULTY_STREAMS.map(s => [s.names[0], s.id, `${s.prefix}-01-001`])];
  return writeStyledXlsx([
    {
      name: "Stream Q&A",
      rows: [FACULTY_COLUMNS.slice(), example],
      widths: FACULTY_COLUMNS.map(c => WIDTH[c] || 16),
      fills: FACULTY_COLUMNS.map(c => (REVIEW.has(c) ? "review" : "none")),
      boldFirstColumn: true,
    },
    { name: "Instructions", rows: [["Item", "Details"], ...instructions], widths: [30, 110], fills: [], boldFirstColumn: true, autoFilter: false },
    { name: "Sources", rows: [["Source", "Official URL", "Use and limitations"], ...sources], widths: [40, 70, 70], fills: [] },
    { name: "Streams", rows: streams, widths: [44, 26, 20], fills: [], autoFilter: false },
  ]);
}
