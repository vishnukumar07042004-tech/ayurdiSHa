/**
 * Staff ops for the faculty Q&A bank (PIN-gated: every op needs the staff cookie). Upload a stream
 * workbook (parsed in the browser into `{ sheetName: grid }`, sent in parts of ~100 rows by
 * `chunkFacultyWorkbook`) → preview / validate → import (one record per entry in Firestore
 * `faculty_bank` or KV, on top of the bundled `data/faculty/*.json`); list entries;
 * approve / edit / reject with notes; export the enriched workbook; try the matcher.
 * Returns `{ code, body }` like the WAC ops.
 */

import { FACULTY_STREAMS, STATUSES, STATUS_LABEL, mergeEntry, parseFacultyWorkbook } from "../../shared/facultyWorkbook.js";
import { enrichedWorkbookBuffer, enrichedWorkbookName } from "./facultyExport.js";
import { applyOverlay, facultyBanks, facultyState, invalidateFaculty, match, refreshFacultyState, registerFacultyStore } from "./facultyBank.js";
import { bumpManifest, upsertEntries, writeOverlay } from "./facultyStore.js";
import { loadAllowList, urlAllowed } from "./sources.js";

export const FACULTY_OPS = new Set(["facultyStreams", "facultyList", "facultyPreview", "facultyImport", "facultyReview", "facultyExport", "facultyMatchTest"]);

const STALE_DAYS = 180;

const str = (v, max = 4000) => String(v == null ? "" : v).trim().slice(0, max);
const int = (v, max = 100000) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

async function banks(store) {
  registerFacultyStore(store);
  await refreshFacultyState(store, { check: true });
  return facultyBanks();
}

/**
 * Import merge rule for one row. `prev` = the row before this import without staff reviews,
 * `review` = its in-app review (or null). An uploaded "draft" never demotes an approved / edited /
 * rejected row (from an earlier upload or an in-app review); any other uploaded status wins and
 * replaces the in-app review. Reviewer notes are kept unless the upload brings its own.
 * `workbookWins`: the workbook's review columns always win (notes are still kept).
 * @returns {{ data: object, review: object|null|undefined }}  `review` undefined = leave as stored
 */
export function mergeUploaded(prev, review, up, { workbookWins = false } = {}) {
  const current = review && review.status ? review.status : prev ? prev.status : "draft";
  const keep = !workbookWins && up.status === "draft" && current !== "draft";
  const notes = up.reviewerNotes || (review && review.notes) || (prev && prev.reviewerNotes) || "";
  const next = { ...up, reviewerNotes: notes, reviewer: up.reviewer || (!keep && review && review.reviewer) || (prev && prev.reviewer) || "" };
  if (keep && prev) Object.assign(next, { status: prev.status, statusText: prev.statusText });
  const data = mergeEntry(prev, next);
  if (!review) return { data, review: undefined };
  if (keep) return { data, review: review.notes || !notes ? undefined : { ...review, notes } };
  return { data, review: null };
}

function counts(entries) {
  const out = { total: entries.length };
  for (const s of STATUSES) out[s] = entries.filter(e => e.status === s).length;
  return out;
}

function compact(e, now) {
  const age = e.updatedAt ? (now - Date.parse(e.updatedAt)) / 864e5 : 0;
  return {
    id: e.id, subcategory: e.subcategory, audience: e.audience, question: e.question, draftAnswer: e.draftAnswer,
    enrichedAnswer: e.enrichedAnswer || "", approvedAnswer: e.approvedAnswer || "", actions: e.actions || [], mistake: e.mistake || "",
    verifyLocally: e.verifyLocally || "", status: e.status, statusLabel: STATUS_LABEL[e.status] || e.status, reviewer: e.reviewer || "",
    reviewerNotes: e.reviewerNotes || "", priority: e.priority, confidence: typeof e.confidence === "number" ? e.confidence : null,
    flags: e.flags || [], sources: e.sources || [], citations: (e.citations || []).map(c => c.url), paraphrases: (e.paraphrases || []).length,
    reviewedAt: e.reviewedAt || null, reviewedBy: e.reviewedBy || "", stale: age > STALE_DAYS,
  };
}

function preview(msg) {
  const sheets = msg.sheets && typeof msg.sheets === "object" ? msg.sheets : null;
  if (!sheets) return { error: "Upload a workbook first." };
  const allow = loadAllowList();
  const parsed = parseFacultyWorkbook(sheets, { allowedHost: u => urlAllowed(u, allow), rowOffset: int(msg.rowOffset) });
  const streamId = str(msg.streamId, 60) || parsed.streamId;
  return { parsed, streamId };
}

async function opPreview(store, msg) {
  const { parsed, streamId, error } = preview(msg);
  if (error) return { code: 400, body: { error } };
  const { rows, before } = await planImport(store, parsed, streamId, msg, new Date().toISOString());
  const added = rows.filter(r => !before.has(r.id)).length;
  const statusChanges = rows.filter(r => before.has(r.id) && before.get(r.id).status !== r.status).map(r => ({ id: r.id, from: before.get(r.id).status, to: r.status }));
  return {
    code: 200,
    body: {
      ok: !parsed.errors.length && Boolean(streamId),
      sheet: parsed.sheet || "", stream: parsed.stream, streamId, knownStream: FACULTY_STREAMS.some(s => s.id === streamId),
      rows: parsed.entries.length, counts: counts(parsed.entries), errors: parsed.errors.slice(0, 50), warnings: parsed.warnings.slice(0, 80),
      warningCount: parsed.warnings.length, unknownHeaders: parsed.unknownHeaders || [], sources: (parsed.sources || []).length,
      added, updated: parsed.entries.length - added, statusChanges: statusChanges.slice(0, 50),
      sample: parsed.entries.slice(0, 5).map(e => ({ id: e.id, subcategory: e.subcategory, question: e.question, status: e.status })),
    },
  };
}

/** Merge every parsed row onto the current bank: records to write + the rows as they will read back. */
async function planImport(store, parsed, streamId, msg, at) {
  const effective = (await banks(store)).find(b => b.streamId === streamId);
  const base = facultyBanks({ reviews: false }).find(b => b.streamId === streamId);
  const state = facultyState();
  const prevById = new Map(((base && base.entries) || []).map(e => [e.id, e]));
  const before = new Map(((effective && effective.entries) || []).map(e => [e.id, e]));
  const workbookWins = msg.mode === "workbook-wins";
  const items = [];
  const rows = [];
  for (const e of parsed.entries) {
    const review = (state.overlays || {})[e.id] || null;
    const { data, review: nextReview } = mergeUploaded(prevById.get(e.id), review, { ...e, streamId, updatedAt: at }, { workbookWins });
    items.push({ id: e.id, streamId, data, ...(nextReview !== undefined ? { review: nextReview } : {}) });
    rows.push(applyOverlay(data, nextReview === undefined ? review : nextReview));
  }
  return { items, rows, before, effective, state };
}

async function opImport(store, msg, now) {
  const { parsed, streamId, error } = preview(msg);
  if (error) return { code: 400, body: { error } };
  if (parsed.errors.length) return { code: 400, body: { error: `Fix the workbook first: ${parsed.errors.slice(0, 3).join(" ")}`, errors: parsed.errors } };
  if (!FACULTY_STREAMS.some(s => s.id === streamId)) return { code: 400, body: { error: "Pick the DISHA stream this workbook belongs to." } };
  const at = new Date(now).toISOString();
  const { items, rows, before, effective, state } = await planImport(store, parsed, streamId, msg, at);
  await upsertEntries(store, items, { now: at });
  const stored = new Set(Object.values(state.entries || {}).filter(r => r.streamId === streamId).map(r => r.id));
  items.forEach(it => stored.add(it.id));
  const after = new Map(before);
  rows.forEach(r => after.set(r.id, r));
  await bumpManifest(store, streamId, {
    stream: parsed.stream || (effective && effective.stream) || "",
    count: stored.size,
    lastUploadAt: at,
    lastUploadBy: str(msg.reviewer, 80) || "staff",
    source: str(msg.filename, 200),
    ...(parsed.sources.length ? { sources: parsed.sources.slice(0, 300) } : {}),
    ...(parsed.instructions.length ? { instructions: parsed.instructions.slice(0, 100) } : {}),
  }, { now: at });
  invalidateFaculty();
  return {
    code: 200,
    body: {
      ok: true, streamId, imported: rows.length, counts: counts(rows), streamCounts: counts([...after.values()]),
      stored: stored.size, part: int(msg.part), parts: int(msg.parts), warnings: parsed.warnings.length,
    },
  };
}

async function opReview(store, msg, now) {
  const id = str(msg.id, 40).toUpperCase();
  let status = str(msg.status, 20);
  if (!STATUSES.includes(status)) return { code: 400, body: { error: "Choose approved, edited, rejected or draft." } };
  const entry = (await banks(store)).flatMap(b => b.entries).find(e => e.id === id);
  if (!entry) return { code: 404, body: { error: "No faculty row with that ID." } };
  const answer = str(msg.answer, 6000);
  if (status === "edited" && !answer) return { code: 400, body: { error: "Write the edited answer before approving with edits." } };
  if (answer && status === "approved") status = "edited";
  const reviewer = str(msg.reviewer, 120);
  if ((status === "approved" || status === "edited") && !reviewer) return { code: 400, body: { error: "Add the reviewer's name before approving." } };
  const overlay = {
    id, status, reviewer, notes: str(msg.notes, 4000), at: new Date(now).toISOString(), by: reviewer || "staff",
    ...(answer && status === "edited" ? { answer } : {}),
  };
  await writeOverlay(store, overlay, entry.streamId);
  invalidateFaculty();
  const updated = (await banks(store)).flatMap(b => b.entries).find(e => e.id === id);
  return { code: 200, body: { ok: true, entry: compact(updated, now) } };
}

/**
 * @param {string} op
 * @param {object} msg
 * @param {object} store  app store
 * @param {{ staff: boolean, now?: number }} ctx
 * @returns {Promise<{ code: number, body: object }>}
 */
export async function handleFacultyOp(op, msg, store, { staff, now = Date.now() } = {}) {
  if (!staff) return { code: 403, body: { error: "staff only" } };
  try {
    if (op === "facultyStreams") {
      const list = await banks(store);
      return {
        code: 200,
        body: {
          ok: true,
          streams: FACULTY_STREAMS.map(s => {
            const b = list.find(x => x.streamId === s.id);
            const m = (b && b.manifest) || {};
            return {
              id: s.id, prefix: s.prefix, name: s.names[0], origin: b ? b.origin : "", importedAt: b ? b.importedAt : null, counts: counts(b ? b.entries : []),
              lastUpload: m.lastUploadAt ? { at: m.lastUploadAt, by: m.lastUploadBy || "", file: m.source || "" } : null,
              stored: m.count || 0, version: m.version || 0,
            };
          }),
        },
      };
    }
    if (op === "facultyList") {
      const streamId = str(msg.streamId, 60);
      const status = str(msg.status, 20);
      const q = str(msg.query, 200).toLowerCase();
      const all = (await banks(store)).filter(b => !streamId || b.streamId === streamId).flatMap(b => b.entries);
      const list = all.filter(e => (!status || e.status === status) && (!q || `${e.id} ${e.question} ${e.subcategory}`.toLowerCase().includes(q)));
      return { code: 200, body: { ok: true, counts: counts(all), entries: list.slice(0, 500).map(e => compact(e, now)) } };
    }
    if (op === "facultyPreview") return opPreview(store, msg);
    if (op === "facultyImport") return opImport(store, msg, now);
    if (op === "facultyReview") return opReview(store, msg, now);
    if (op === "facultyExport") {
      const streamId = str(msg.streamId, 60) || "clinical-practice";
      const bank = (await banks(store)).find(b => b.streamId === streamId);
      if (!bank) return { code: 404, body: { error: "No faculty rows for that stream yet." } };
      return { code: 200, body: { ok: true, filename: enrichedWorkbookName(bank), base64: enrichedWorkbookBuffer(bank).toString("base64") } };
    }
    if (op === "facultyMatchTest") {
      const question = str(msg.question, 1000);
      if (!question) return { code: 400, body: { error: "Type a student question." } };
      await banks(store);
      const r = match(question, { streamId: str(msg.streamId, 60), limit: 3 });
      return { code: 200, body: { ok: true, matches: r.map(m => ({ id: m.id, score: m.score, decision: m.decision, status: m.status, margin: m.margin, question: m.entry.question, via: m.variant })) } };
    }
    return { code: 400, body: { error: "unknown op" } };
  } catch (err) {
    console.error(`[aym-faculty] ${op} failed:`, err && err.message ? err.message : err);
    return { code: 500, body: { error: "The faculty bank hit an error. Try again." } };
  }
}
