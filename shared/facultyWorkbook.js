/**
 * Faculty Q&A workbook — pure helpers (no XLSX import, no DOM) shared by the importer script, the
 * staff ops and the staff upload panel, so every path validates and normalises rows the same way.
 * Input is a sheet grid (array of rows, first row = headers) as produced by
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })`.
 */

/** The 12 template columns, in workbook order. */
export const FACULTY_COLUMNS = Object.freeze([
  "Question ID", "Stream", "Subcategory", "Target audience", "Student question", "DISHA draft answer",
  "Keywords / intent", "Source links (context)", "Validation priority", "Expert reviewer",
  "Approval status", "Reviewer edits / notes",
]);

/** Columns the enriched workbook adds (between the draft answer block and the review block). */
export const ENRICHED_COLUMNS = Object.freeze([
  "DISHA enriched answer", "Next steps", "Mistake to avoid", "Citations (URLs)", "Confidence",
  "Flags (e.g. needs state-specific check / limited sources)", "Paraphrases (sample)",
]);

/** Column order of the enriched workbook: original columns with the review block kept last. */
export const ENRICHED_ORDER = Object.freeze([
  ...FACULTY_COLUMNS.slice(0, 9), ...ENRICHED_COLUMNS, ...FACULTY_COLUMNS.slice(9),
]);

const FIELD_BY_HEADER = {
  "question id": "id", id: "id",
  stream: "stream",
  subcategory: "subcategory", "sub category": "subcategory",
  "target audience": "audience", audience: "audience",
  "student question": "question", question: "question",
  "disha draft answer": "draftAnswer", "draft answer": "draftAnswer",
  "keywords intent": "keywords", keywords: "keywords",
  "source links context": "sources", "source links": "sources", sources: "sources",
  "validation priority": "priority", priority: "priority",
  "expert reviewer": "reviewer", reviewer: "reviewer",
  "approval status": "statusText", status: "statusText",
  "reviewer edits notes": "reviewerNotes", "reviewer notes": "reviewerNotes", notes: "reviewerNotes",
  "disha enriched answer": "enrichedAnswer", "enriched answer": "enrichedAnswer",
  "next steps": "actions",
  "mistake to avoid": "mistake",
  "citations urls": "citationUrls", citations: "citationUrls",
  confidence: "confidence",
  "flags e g needs state specific check limited sources": "flags", flags: "flags",
  "paraphrases sample": "paraphraseSample", paraphrases: "paraphraseSample",
};

const REQUIRED = ["id", "question", "draftAnswer"];

/**
 * Every DISHA stream (server/ai/personas/index.js) with the workbook "Stream" names that map to it
 * and a Question ID prefix for new faculty workbooks.
 */
export const FACULTY_STREAMS = Object.freeze([
  { id: "clinical-practice", prefix: "CP", names: ["Clinical Practice", "Clinical Practice & Integrative Care"] },
  { id: "pg-entrance", prefix: "PG", names: ["PG Entrance", "PG entrance & MD/MS branch", "AIAPGET"] },
  { id: "govt-jobs", prefix: "GJ", names: ["Government Jobs", "Govt Jobs", "Government Service"] },
  { id: "panchakarma-wellness", prefix: "PK", names: ["Panchakarma & Wellness", "Panchakarma", "Wellness & Medical Value Travel"] },
  { id: "research-phd", prefix: "RS", names: ["Research & PhD", "Research", "Research, Evidence & Publication"] },
  { id: "teaching-academia", prefix: "TA", names: ["Teaching & Academia", "Teaching", "Academics"] },
  { id: "industry-pharma", prefix: "IP", names: ["Industry & Pharma", "Manufacturing, Quality & GMP", "Industry"] },
  { id: "entrepreneurship", prefix: "EN", names: ["Entrepreneurship", "Entrepreneurship & Start-ups", "Start-ups"] },
  { id: "export-trade", prefix: "EX", names: ["Export & Global Trade", "Export"] },
  { id: "digital-branding", prefix: "DB", names: ["Digital Branding", "Brand Building & Communication", "Digital presence"] },
  { id: "practice-abroad", prefix: "PA", names: ["Practice Abroad", "Practice Abroad & Practitioner Mobility"] },
  { id: "abroad-gulf", prefix: "AG", names: ["Abroad – Gulf", "Gulf", "Practice in the Gulf"] },
  { id: "abroad-usa", prefix: "AU", names: ["Abroad – USA", "USA"] },
  { id: "abroad-uk-eu", prefix: "AE", names: ["Abroad – UK & Europe", "UK & Europe", "UK/EU"] },
  { id: "public-health-policy", prefix: "PH", names: ["Public Health & Policy", "Policy, Public Health & Global Agencies"] },
  { id: "internship-early-career", prefix: "IC", names: ["Internship & Early Career", "Early Career", "Internship"] },
]);

/** Clinical Practice subcategories that also serve a neighbouring persona's routing. */
const SUBCATEGORY_STREAMS = {
  "career opportunities after bams": ["internship-early-career"],
  "clinical competence and skill development": ["internship-early-career"],
  "hospital employment and clinical careers": ["govt-jobs"],
  "panchakarma and specialised services": ["panchakarma-wellness"],
  "clinical specialisation and postgraduate pathways": ["pg-entrance"],
  "digital practice and teleconsultation": ["digital-branding"],
  "career growth reputation and sustainability": ["digital-branding"],
};

export const STATUSES = Object.freeze(["draft", "approved", "edited", "rejected"]);
export const STATUS_LABEL = Object.freeze({
  draft: "Draft – pending validation",
  approved: "Approved",
  edited: "Approved with edits",
  rejected: "Rejected",
});

export const ID_PATTERN = /^[A-Z]{2,4}-\d{2}-\d{3}$/;

function key(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

export function cleanText(s, max = 6000) {
  return String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** DISHA stream id for a workbook "Stream" cell (name, id or prefix), or "". */
export function streamIdFor(name) {
  const k = key(name);
  if (!k) return "";
  for (const s of FACULTY_STREAMS) {
    if (key(s.id) === k || key(s.prefix) === k || s.names.some(n => key(n) === k)) return s.id;
  }
  for (const s of FACULTY_STREAMS) if (s.names.some(n => k.startsWith(key(n)) || key(n).startsWith(k))) return s.id;
  return "";
}

export function streamIdFromQuestionId(id) {
  const p = String(id || "").split("-")[0];
  const s = FACULTY_STREAMS.find(x => x.prefix === p);
  return s ? s.id : "";
}

/** "Approval status" cell → `{ status, known }`. Unknown text stays a draft (and is reported). */
export function mapStatus(text) {
  const k = key(text);
  if (!k) return { status: "draft", known: true };
  if (/\b(reject|rejected|not approved|remove|removed|do not use|withdrawn|discard)\b/.test(k)) return { status: "rejected", known: true };
  if (/\b(edit|edited|edits|revised|revision|modified|corrected)\b/.test(k) && /\b(approv|validat|final|edit|edited|revised|modified|corrected)/.test(k) && !/\bpending\b/.test(k)) return { status: "edited", known: true };
  if (/\bpending\b|\bdraft\b|\bin review\b|\bunder review\b|\bto review\b|\bnot reviewed\b/.test(k)) return { status: "draft", known: true };
  if (/\b(approved|approve|validated|verified|final|ok|accepted)\b/.test(k)) return { status: "approved", known: true };
  return { status: "draft", known: false };
}

export function isAuthoritative(status) {
  return status === "approved" || status === "edited";
}

export function parsePriority(text) {
  const k = key(text);
  if (!k) return "standard";
  return /\bhigh\b|regulatory|urgent|critical/.test(k) ? "high" : "standard";
}

export function splitUrls(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s,;|<>"')\]]+/gi)) {
    const u = m[0].replace(/[.,;:]+$/, "");
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

const KEYWORD_NOISE = new Set("a an the and or of to in on at by for with is are am be can could should would will i my me we you your it its this that what which how when where who why do does did there their them they from as into about vs".split(" "));

/** "Career opportunities after BAMS; what; clinical; career" → ["career opportunities after bams", "clinical", "career"]. */
export function splitKeywords(text) {
  const out = [];
  String(text || "").split(/[;,|\n]+/).forEach(part => {
    const t = part.trim().toLowerCase();
    if (!t || t.length < 3 || KEYWORD_NOISE.has(t) || out.includes(t)) return;
    out.push(t);
  });
  return out.slice(0, 30);
}

function splitLines(text) {
  return String(text || "").split(/\n+|\s*(?:^|\s)\d+[.)]\s+/).map(s => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
}

/** The enriched workbook appends "Verify locally: …" to the answer cell (see `enrichedRow`); split it back out. */
function splitVerifyLocally(text) {
  const m = /\n\n\s*Verify locally:\s*([\s\S]+)$/i.exec(text);
  if (!m) return [text.slice(0, 4000), ""];
  return [text.slice(0, m.index).trim().slice(0, 4000), cleanText(m[1], 600)];
}

/** Header row → `{ field: columnIndex }` plus the list of unknown headers. */
export function headerMap(headers) {
  const map = {};
  const unknown = [];
  (headers || []).forEach((h, i) => {
    const f = FIELD_BY_HEADER[key(h)];
    if (f && map[f] == null) map[f] = i;
    else if (String(h || "").trim() && !f) unknown.push(String(h).trim());
  });
  return { map, unknown };
}

/** The first grid whose header row has a Question ID and a Student question column. */
export function findQaSheet(sheets) {
  for (const [name, grid] of Object.entries(sheets || {})) {
    for (let r = 0; r < Math.min(5, (grid || []).length); r++) {
      const { map } = headerMap(grid[r]);
      if (map.id != null && map.question != null) return { name, grid, headerRow: r };
    }
  }
  return null;
}

/** "Sources" sheet → `[{ name, url, note }]`. */
export function parseSourcesGrid(grid) {
  const rows = Array.isArray(grid) ? grid : [];
  const out = [];
  rows.slice(1).forEach(r => {
    const cells = (r || []).map(c => String(c == null ? "" : c).trim());
    const url = cells.map(c => splitUrls(c)[0]).find(Boolean);
    if (!url) return;
    const name = cells.find(c => c && !/^https?:/i.test(c)) || url;
    const note = cells.filter(c => c && c !== name && !/^https?:/i.test(c)).join(" ");
    out.push({ name: cleanText(name, 200), url, note: cleanText(note, 500) });
  });
  return out;
}

/** "Instructions" sheet → `[[label, text], …]` (verbatim, trimmed). */
export function parseInstructionsGrid(grid) {
  return (Array.isArray(grid) ? grid : [])
    .map(r => (r || []).map(c => cleanText(c, 1000)).filter(Boolean))
    .filter(r => r.length)
    .map(r => [r[0], r.slice(1).join(" ")]);
}

/**
 * Validate + normalise the Q&A grid.
 * @returns {{ entries: object[], errors: string[], warnings: string[], stream: string, streamId: string, unknownHeaders: string[] }}
 */
export function parseQaGrid(grid, { now = new Date().toISOString(), allowedHost, rowOffset = 0 } = {}) {
  const errors = [];
  const warnings = [];
  const rows = Array.isArray(grid) ? grid : [];
  if (!rows.length) return { entries: [], errors: ["The sheet is empty."], warnings, stream: "", streamId: "", unknownHeaders: [] };
  const { map, unknown } = headerMap(rows[0]);
  const label = { id: "Question ID", question: "Student question", draftAnswer: "DISHA draft answer" };
  for (const f of REQUIRED) if (map[f] == null) errors.push(`Missing column "${label[f]}".`);
  if (errors.length) return { entries: [], errors, warnings, stream: "", streamId: "", unknownHeaders: unknown };
  const cell = (r, f) => (map[f] == null ? "" : r[map[f]]);
  const seen = new Set();
  const entries = [];
  const streams = new Map();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2 + rowOffset;
    if (!r || !r.some(c => String(c == null ? "" : c).trim())) return;
    const id = cleanText(cell(r, "id"), 40).toUpperCase();
    const question = cleanText(cell(r, "question"), 600);
    const draftAnswer = cleanText(cell(r, "draftAnswer"), 4000);
    if (!id) { errors.push(`Row ${line}: Question ID is empty.`); return; }
    if (!ID_PATTERN.test(id)) warnings.push(`Row ${line}: Question ID "${id}" does not look like CP-01-001.`);
    if (seen.has(id)) { errors.push(`Row ${line}: duplicate Question ID ${id}.`); return; }
    seen.add(id);
    if (!question) { errors.push(`Row ${line} (${id}): Student question is empty.`); return; }
    if (!draftAnswer) warnings.push(`Row ${line} (${id}): DISHA draft answer is empty.`);
    const stream = cleanText(cell(r, "stream"), 120);
    const streamId = streamIdFor(stream) || streamIdFromQuestionId(id);
    if (!streamId) warnings.push(`Row ${line} (${id}): unknown stream "${stream}".`);
    streams.set(streamId, (streams.get(streamId) || 0) + 1);
    const statusText = cleanText(cell(r, "statusText"), 120);
    const st = mapStatus(statusText);
    if (!st.known) warnings.push(`Row ${line} (${id}): approval status "${statusText}" not recognised — kept as draft.`);
    const sources = splitUrls(cell(r, "sources"));
    if (!sources.length) warnings.push(`Row ${line} (${id}): no source link.`);
    if (allowedHost) sources.filter(u => !allowedHost(u)).forEach(u => warnings.push(`Row ${line} (${id}): source ${u} is not on the trusted-source allow-list.`));
    const reviewer = cleanText(cell(r, "reviewer"), 120);
    const subcategory = cleanText(cell(r, "subcategory"), 160);
    const [enrichedAnswer, verifyLocally] = splitVerifyLocally(cleanText(cell(r, "enrichedAnswer"), 4600));
    const entry = {
      id,
      stream,
      streamId,
      relatedStreams: [...new Set([streamId, ...(SUBCATEGORY_STREAMS[key(subcategory)] || [])].filter(Boolean))],
      subcategory,
      audience: cleanText(cell(r, "audience"), 160),
      question,
      draftAnswer,
      keywords: splitKeywords(cell(r, "keywords")),
      sources,
      priority: parsePriority(cell(r, "priority")),
      reviewer: /^unassigned$/i.test(reviewer) ? "" : reviewer,
      status: st.status,
      statusText,
      reviewerNotes: cleanText(cell(r, "reviewerNotes"), 4000),
      updatedAt: now,
    };
    if (enrichedAnswer) entry.enrichedAnswer = enrichedAnswer;
    if (verifyLocally) entry.verifyLocally = verifyLocally;
    if (map.actions != null && cleanText(cell(r, "actions"))) entry.actions = splitLines(cell(r, "actions")).slice(0, 5);
    if (map.mistake != null && cleanText(cell(r, "mistake"))) entry.mistake = cleanText(cell(r, "mistake"), 600);
    if (isAuthoritative(entry.status)) entry.approvedAnswer = enrichedAnswer || draftAnswer;
    entries.push(entry);
  });
  if (!entries.length && !errors.length) errors.push("No question rows found.");
  const [streamId] = [...streams.entries()].sort((a, b) => b[1] - a[1])[0] || [""];
  if (streams.size > 1) warnings.push(`Rows span ${streams.size} streams; importing as ${streamId || "unknown"}.`);
  const stream = (entries.find(e => e.streamId === streamId) || {}).stream || "";
  return { entries, errors, warnings, stream, streamId, unknownHeaders: unknown };
}

/** Whole workbook (sheet name → grid) → parsed bank. */
export function parseFacultyWorkbook(sheets, opts = {}) {
  const qa = findQaSheet(sheets);
  if (!qa) return { entries: [], errors: ["No sheet with \"Question ID\" and \"Student question\" columns."], warnings: [], stream: "", streamId: "", sources: [], instructions: [] };
  const parsed = parseQaGrid(qa.grid.slice(qa.headerRow), opts);
  const find = re => Object.entries(sheets).find(([n]) => re.test(n));
  const src = find(/^sources?$/i);
  const ins = find(/^instructions?$/i);
  return {
    ...parsed,
    sheet: qa.name,
    sources: src ? parseSourcesGrid(src[1]) : [],
    instructions: ins ? parseInstructionsGrid(ins[1]) : [],
  };
}

/**
 * Split a parsed workbook into request-sized parts: each part carries the Q&A header row plus up to
 * `size` data rows (fewer when the rows' JSON would pass `maxBytes`); the first part also carries
 * the Sources / Instructions sheets. Other sheets (Coverage, Paraphrases) are not sent — the
 * parser ignores them. `rowOffset` keeps error row numbers relative to the whole sheet.
 * @returns {{ sheets: object, rowOffset: number, from: number, to: number, total: number }[]}
 */
export function chunkFacultyWorkbook(sheets, { size = 100, maxBytes = 2.5 * 1024 * 1024 } = {}) {
  const qa = findQaSheet(sheets);
  if (!qa) return [{ sheets, rowOffset: 0, from: 0, to: 0, total: 0 }];
  const head = qa.grid.slice(0, qa.headerRow + 1);
  const rows = qa.grid.slice(qa.headerRow + 1);
  let last = rows.length;
  while (last > 0 && !(rows[last - 1] || []).some(c => String(c == null ? "" : c).trim())) last--;
  const extras = Object.fromEntries(Object.entries(sheets).filter(([n]) => n !== qa.name && /^(sources?|instructions?)$/i.test(n)));
  const parts = [];
  let start = 0;
  while (start < last || !parts.length) {
    let end = start;
    let bytes = 0;
    while (end < last && end - start < size) {
      const b = JSON.stringify(rows[end] || []).length * 2;
      if (end > start && bytes + b > maxBytes) break;
      bytes += b;
      end++;
    }
    parts.push({ sheets: { ...(start === 0 ? extras : {}), [qa.name]: [...head, ...rows.slice(start, end)] }, rowOffset: start, from: start + 1, to: end, total: last });
    if (end === start) break;
    start = end;
  }
  return parts;
}

/** Faculty may edit the answer cell in place: a re-import whose answer text differs → "edited". */
function normForCompare(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Merge a (re-)imported entry onto the existing one: review columns come from the import,
 * enrichment and paraphrases are kept. An approved row whose answer cell was changed becomes
 * `edited`.
 */
export function mergeEntry(prev, next) {
  if (!prev) return next;
  const out = { ...prev, ...next };
  for (const k of ["enrichedAnswer", "actions", "mistake", "citations", "confidence", "flags", "paraphrases", "verifyLocally", "enrichedBy", "variants"]) {
    if (next[k] == null && prev[k] != null) out[k] = prev[k];
  }
  const enrichedChanged = next.enrichedAnswer && prev.enrichedAnswer && normForCompare(next.enrichedAnswer) !== normForCompare(prev.enrichedAnswer);
  const draftChanged = prev.draftAnswer && next.draftAnswer && normForCompare(next.draftAnswer) !== normForCompare(prev.draftAnswer);
  if (enrichedChanged || draftChanged) {
    out.answerEditedByFaculty = true;
    if (out.status === "approved") out.status = "edited";
  }
  if (isAuthoritative(out.status)) out.approvedAnswer = out.enrichedAnswer || out.draftAnswer;
  else delete out.approvedAnswer;
  return out;
}

/** The text a match should present: the faculty-approved answer, else the best draft. */
export function bestAnswer(entry) {
  if (!entry) return "";
  if (isAuthoritative(entry.status)) return entry.approvedAnswer || entry.enrichedAnswer || entry.draftAnswer || "";
  return entry.enrichedAnswer || entry.draftAnswer || "";
}

/** One enriched-workbook row (ENRICHED_ORDER) for an entry. */
export function enrichedRow(e) {
  const paraphrases = (e.paraphrases || []).map(p => (typeof p === "string" ? p : p.text)).filter(Boolean);
  const citationUrls = [...new Set((e.citations || []).map(c => c.url).filter(Boolean))];
  const answer = [e.enrichedAnswer || "", e.verifyLocally ? `Verify locally: ${e.verifyLocally}` : ""].filter(Boolean).join("\n\n");
  const byCol = {
    "Question ID": e.id,
    Stream: e.stream,
    Subcategory: e.subcategory,
    "Target audience": e.audience,
    "Student question": e.question,
    "DISHA draft answer": e.draftAnswer,
    "Keywords / intent": (e.keywords || []).join("; "),
    "Source links (context)": (e.sources || []).join("\n"),
    "Validation priority": e.priority === "high" ? "High – regulatory/clinical review" : "Standard – subject expert review",
    "DISHA enriched answer": answer,
    "Next steps": (e.actions || []).map((a, i) => `${i + 1}. ${a}`).join("\n"),
    "Mistake to avoid": e.mistake || "",
    "Citations (URLs)": citationUrls.join("\n"),
    Confidence: typeof e.confidence === "number" ? Math.round(e.confidence * 100) / 100 : "",
    "Flags (e.g. needs state-specific check / limited sources)": (e.flags || []).join("; "),
    "Paraphrases (sample)": paraphrases.slice(0, 5).join("\n"),
    "Expert reviewer": e.reviewer || "Unassigned",
    "Approval status": e.statusText && mapStatus(e.statusText).status === e.status ? e.statusText : STATUS_LABEL[e.status] || STATUS_LABEL.draft,
    "Reviewer edits / notes": e.reviewerNotes || "",
  };
  return ENRICHED_ORDER.map(c => (byCol[c] == null ? "" : byCol[c]));
}
