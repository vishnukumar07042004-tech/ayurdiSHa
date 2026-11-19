#!/usr/bin/env node
/**
 * Write docs/faculty/STREAM-TEMPLATE.xlsx: the 12 faculty columns (+ one example row), an
 * Instructions sheet, a Sources sheet and the Streams list (name → DISHA stream id → ID prefix).
 * Offline.  node scripts/faculty/make-template.mjs [--out=docs/faculty/STREAM-TEMPLATE.xlsx]
 */

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib.mjs";
import { streamTemplateBuffer } from "../../server/ai/facultyExport.js";

const INSTRUCTIONS = [
  ["DISHA – <Stream name> Knowledge Bank", "Draft 1.0 • <date>"],
  ["Purpose", "Editable question-and-answer bank for faculty validation before DISHA uses it as its highest-priority source for matching student questions."],
  ["One row per question", "Question ID = <prefix>-<subcategory 01–10>-<question 001–010>, e.g. GJ-03-004 (prefixes on the Streams sheet). IDs must be unique and never reused for a different question."],
  ["Stream", "Type the stream name exactly as on the Streams sheet (or the DISHA stream id)."],
  ["Student question", "Write it the way a student would ask it — one ask per row. DISHA adds English, Hinglish and Hindi paraphrases itself."],
  ["DISHA draft answer", "2–4 sentences of faculty guidance. No invented fees, dates, cut-offs, salaries or eligibility; name the authority to check instead."],
  ["Keywords / intent", "Subcategory first, then a few words separated by semicolons."],
  ["Source links (context)", "Official pages only (regulator, ministry, council, exam body). One or more URLs; DISHA cites passages from these pages."],
  ["Validation priority", "High – regulatory/clinical review (law, prescribing, emergencies, procedures, privacy, overseas rules) or Standard – subject expert review."],
  ["Expert reviewer / Approval status / Reviewer edits / notes", "Reviewer's name; Draft – pending validation, Approved, Approved with edits, or Rejected; comments and exact citations. Edit the answer cell in place when you correct it."],
  ["Status", "Only Approved / Approved with edits rows are authoritative. Draft rows are used only as unvalidated framing; Rejected rows are never used. A mentor still approves every DISHA reply."],
  ["No patient advice", "DISHA is a career-guidance assistant; no personal diagnosis, prescriptions, doses or emergency treatment directions. Emergencies → qualified emergency medical services."],
  ["Data privacy", "Never put identifiable patient or student details in this workbook."],
  ["Review cadence", "Review time-sensitive rows before each launch and periodically; rows older than 180 days are flagged in the staff panel."],
];

const SOURCES = [
  ["National Commission for Indian System of Medicine (NCISM)", "https://ncismindia.org/", "Regulator: registration, curriculum, professional conduct."],
  ["Ministry of Ayush", "https://ayush.gov.in/", "Government schemes, notifications, guidelines."],
  ["National AYUSH Mission", "https://namayush.gov.in/", "Guidelines and publications (e.g. telemedicine)."],
  ["<Official source for this stream>", "https://<official domain>/", "<What it is used for and its limits>"],
];

const arg = process.argv.find(a => a.startsWith("--out="));
const out = arg ? path.resolve(arg.slice(6)) : path.join(ROOT, "docs/faculty/STREAM-TEMPLATE.xlsx");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, streamTemplateBuffer({ instructions: INSTRUCTIONS, sources: SOURCES }));
console.log(`Wrote ${path.relative(ROOT, out)}`);
