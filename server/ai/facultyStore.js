/**
 * Staff-side state of the faculty Q&A bank, one record per entry so a full enriched stream
 * workbook fits (Firestore caps a document at ~1 MiB):
 *   - Firestore `faculty_bank/<streamId>__<entryId>`: `{ kind: "faculty-entry", id, streamId,
 *     updatedAt, data, review, hasPart }` — `data` = the uploaded entry, `review` = the staff
 *     review overlay (status, reviewer, notes, edited answer). An entry still over
 *     ENTRY_SOFT_MAX_BYTES keeps its long fields in the child doc `…/parts/long`.
 *   - Firestore `faculty_streams/<streamId>`: manifest `{ streamId, stream, count, version,
 *     updatedAt, lastUploadAt, lastUploadBy, source, sources, instructions }`. `version` bumps on
 *     every write so other instances know to reload.
 *   - File / Blob / in-memory stores mirror this with `aym:faculty:doc:<docId>`,
 *     `aym:faculty:part:<docId>` and `aym:faculty:manifest:<streamId>` keys.
 * The legacy format (one `stream~<id>` doc per whole stream + `entry~<id>` overlays; KV
 * `aym:faculty:stream:` / `aym:faculty:entry:`) is migrated on the first read (idempotent).
 * The bundled `data/faculty/<streamId>.json` stays the baseline; `facultyBank.js` layers this on top.
 */

import { streamIdFromQuestionId } from "../../shared/facultyWorkbook.js";

export const FACULTY_COLLECTION = "faculty_bank";
export const FACULTY_STREAMS_COLLECTION = "faculty_streams";
export const K_FACULTY_DOC = "aym:faculty:doc:";
export const K_FACULTY_PART = "aym:faculty:part:";
export const K_FACULTY_MANIFEST = "aym:faculty:manifest:";
export const K_LEGACY_ENTRY = "aym:faculty:entry:";
export const K_LEGACY_STREAM = "aym:faculty:stream:";
export const BATCH_MAX = 450;
export const ENTRY_SOFT_MAX_BYTES = 200 * 1024;
export const MAX_PARAPHRASES = 12;
export const MAX_CITATIONS = 6;
/** Moved to the child doc (largest first) when an entry is still over ENTRY_SOFT_MAX_BYTES. */
const LONG_FIELDS = ["answerMarked", "variants", "enrichNotes", "paraphrases", "citations", "enrichedAnswer", "approvedAnswer", "draftAnswer", "verifyLocally", "actions"];
const FIREBASE_APP = "aym-preview";

function clean(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

const bytes = v => Buffer.byteLength(JSON.stringify(v == null ? null : v));

let dbPromise = null;
async function firestoreDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const { getApps } = await import("firebase-admin/app");
        const { getFirestore } = await import("firebase-admin/firestore");
        const app = getApps().find(a => a.name === FIREBASE_APP);
        return app ? getFirestore(app) : null;
      } catch {
        return null;
      }
    })();
  }
  const db = await dbPromise;
  if (!db) dbPromise = null;
  return db;
}

const safeId = s => encodeURIComponent(String(s || "")).slice(0, 600);

/** `clinical-practice__CP-01-001`. */
export function entryDocId(streamId, id) {
  return `${safeId(streamId || "unassigned")}__${safeId(id)}`;
}

/**
 * `handle` = an app store (`{ name, get, set, list }`), an AI store adapter (`{ backend }`) or
 * `{ facultyFirestore: db }` (tests: an in-memory Firestore).
 * Returns `{ kind: "firestore", db } | { kind: "kv", store } | null`.
 */
export async function facultyBackend(handle) {
  if (!handle) return null;
  if (handle.facultyFirestore) return { kind: "firestore", db: handle.facultyFirestore };
  if (handle.name === "firestore" || handle.backend === "firestore") {
    const db = await firestoreDb();
    return db ? { kind: "firestore", db } : null;
  }
  if (typeof handle.get === "function" && typeof handle.list === "function") return { kind: "kv", store: handle };
  return null;
}

/** Entry as stored: paraphrases ≤ 12, citations ≤ 6, no undefined values. */
export function trimEntry(entry) {
  const e = clean(entry) || {};
  if (Array.isArray(e.paraphrases)) e.paraphrases = e.paraphrases.slice(0, MAX_PARAPHRASES);
  if (Array.isArray(e.citations)) e.citations = e.citations.slice(0, MAX_CITATIONS);
  return e;
}

/** `{ main, part }`: `part` holds the long fields when `data` is over ENTRY_SOFT_MAX_BYTES, else null. */
export function splitLongFields(data, max = ENTRY_SOFT_MAX_BYTES) {
  if (!data || bytes(data) <= max) return { main: data, part: null };
  const main = { ...data };
  const part = {};
  for (const k of LONG_FIELDS) {
    if (bytes(main) <= max) break;
    if (main[k] == null) continue;
    part[k] = main[k];
    delete main[k];
  }
  return { main, part: Object.keys(part).length ? part : null };
}

const kvBatch = async (store, patch) => {
  if (typeof store.merge === "function") return store.merge(patch);
  for (const [k, v] of Object.entries(patch)) await store.set(k, v);
};

const kvDel = async (store, keys) => {
  for (const k of keys) if (typeof store.del === "function") await store.del(k);
};

/** Firestore writes in batches of ≤ BATCH_MAX ops. `ops` = `[(batch) => void]`. */
async function commitOps(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_MAX).forEach(op => op(batch));
    await batch.commit();
  }
}

/**
 * Upsert entry records. Each item: `{ id, streamId, data?, review? }` — `data` / `review`
 * left `undefined` keep the stored value; `null` clears it.
 * @returns {Promise<number>} records written
 */
export async function upsertEntries(handle, items, { now = new Date().toISOString() } = {}) {
  const be = await facultyBackend(handle);
  if (!be) throw new Error("No store for the faculty bank.");
  const list = (items || []).filter(it => it && it.id);
  if (be.kind === "firestore") {
    const col = be.db.collection(FACULTY_COLLECTION);
    const ops = [];
    for (const it of list) {
      const ref = col.doc(entryDocId(it.streamId, it.id));
      const rec = { kind: "faculty-entry", id: it.id, streamId: it.streamId || "", updatedAt: now };
      const fields = ["kind", "id", "streamId", "updatedAt"];
      if (it.data !== undefined) {
        const { main, part } = splitLongFields(it.data ? trimEntry(it.data) : null);
        Object.assign(rec, { data: main, hasPart: Boolean(part) });
        fields.push("data", "hasPart");
        if (part) ops.push(b => b.set(ref.collection("parts").doc("long"), clean(part)));
      }
      if (it.review !== undefined) {
        rec.review = it.review ? clean(it.review) : null;
        fields.push("review");
      }
      ops.push(b => b.set(ref, rec, { mergeFields: fields }));
    }
    await commitOps(be.db, ops);
    return list.length;
  }
  const { store } = be;
  const patch = {};
  const dropParts = [];
  for (const it of list) {
    const docId = entryDocId(it.streamId, it.id);
    const prev = (await store.get(K_FACULTY_DOC + docId)) || {};
    const rec = { ...prev, kind: "faculty-entry", id: it.id, streamId: it.streamId || "", updatedAt: now };
    if (it.data !== undefined) {
      const { main, part } = splitLongFields(it.data ? trimEntry(it.data) : null);
      rec.data = main;
      rec.hasPart = Boolean(part);
      if (part) patch[K_FACULTY_PART + docId] = clean(part);
      else if (prev.hasPart) dropParts.push(K_FACULTY_PART + docId);
    }
    if (it.review !== undefined) rec.review = it.review ? clean(it.review) : null;
    patch[K_FACULTY_DOC + docId] = clean(rec);
  }
  await kvBatch(store, patch);
  await kvDel(store, dropParts);
  return list.length;
}

/** Bump a stream manifest's version (+ optional fields such as count / lastUploadAt / source). */
export async function bumpManifest(handle, streamId, patch = {}, { now = new Date().toISOString() } = {}) {
  const be = await facultyBackend(handle);
  if (!be) throw new Error("No store for the faculty bank.");
  const fields = clean({ ...patch, streamId, updatedAt: now });
  if (be.kind === "firestore") {
    const { FieldValue } = await import("firebase-admin/firestore");
    await be.db.collection(FACULTY_STREAMS_COLLECTION).doc(safeId(streamId)).set({ ...fields, version: FieldValue.increment(1) }, { merge: true });
    return;
  }
  const key = K_FACULTY_MANIFEST + streamId;
  const prev = (await be.store.get(key)) || {};
  await be.store.set(key, { ...prev, ...fields, version: (Number(prev.version) || 0) + 1 });
}

/** Save the staff review of one entry (updates only that entry's record) and bump its manifest. */
export async function writeOverlay(handle, overlay, streamId = streamIdFromQuestionId(overlay && overlay.id)) {
  const rec = clean(overlay);
  await upsertEntries(handle, [{ id: rec.id, streamId, review: rec }]);
  await bumpManifest(handle, streamId);
  return rec;
}

export async function clearOverlay(handle, id, streamId = streamIdFromQuestionId(id)) {
  await upsertEntries(handle, [{ id, streamId, review: null }]);
  await bumpManifest(handle, streamId);
}

async function readManifests(be) {
  const out = {};
  if (be.kind === "firestore") {
    const snap = await be.db.collection(FACULTY_STREAMS_COLLECTION).get();
    snap.docs.forEach(d => { const v = d.data() || {}; if (v.streamId) out[v.streamId] = v; });
    return out;
  }
  for (const k of await be.store.list(K_FACULTY_MANIFEST)) {
    const v = await be.store.get(k);
    if (v && v.streamId) out[v.streamId] = v;
  }
  return out;
}

/** Cheap change check: `streamId:version` of every manifest, or null without a backend. */
export async function readFacultySignature(handle) {
  const be = await facultyBackend(handle);
  if (!be) return null;
  return manifestSignature(await readManifests(be));
}

export function manifestSignature(manifests) {
  return Object.values(manifests || {}).map(m => `${m.streamId}:${m.version || 0}`).sort().join("|");
}

/** Legacy whole-stream banks + overlays → per-entry records and manifests (then the legacy docs go). */
async function migrateLegacy(handle, legacy, now) {
  const items = new Map();
  const streamOfId = new Map();
  for (const bank of legacy.streams) {
    for (const e of bank.entries || []) {
      if (!e || !e.id) continue;
      streamOfId.set(e.id, bank.streamId);
      items.set(entryDocId(bank.streamId, e.id), { id: e.id, streamId: bank.streamId, data: { ...e, streamId: e.streamId || bank.streamId } });
    }
  }
  for (const ov of legacy.overlays) {
    const { kind, ...review } = ov;
    const streamId = streamOfId.get(ov.id) || streamIdFromQuestionId(ov.id) || "unassigned";
    const key = entryDocId(streamId, ov.id);
    items.set(key, { ...(items.get(key) || { id: ov.id, streamId }), review });
  }
  if (items.size) await upsertEntries(handle, [...items.values()], { now });
  const touched = new Set([...items.values()].map(it => it.streamId));
  for (const streamId of touched) {
    const bank = legacy.streams.find(b => b.streamId === streamId);
    const patch = bank ? {
      stream: bank.stream || "", count: (bank.entries || []).length, lastUploadAt: bank.importedAt || now,
      lastUploadBy: bank.importedBy || "", source: bank.filename || "", sources: bank.sources || [], instructions: bank.instructions || [],
    } : {};
    await bumpManifest(handle, streamId, { ...patch, migratedAt: now }, { now });
  }
  await legacy.remove();
  return items.size;
}

async function readRaw(be) {
  const docs = [];
  const legacy = { streams: [], overlays: [], remove: async () => {} };
  if (be.kind === "firestore") {
    const snap = await be.db.collection(FACULTY_COLLECTION).get();
    const legacyRefs = [];
    for (const d of snap.docs) {
      const v = d.data() || {};
      if (v.kind === "faculty-entry" && v.id) {
        if (v.hasPart && v.data) {
          const p = await d.ref.collection("parts").doc("long").get();
          if (p.exists) v.data = { ...v.data, ...(p.data() || {}) };
        }
        docs.push(v);
      } else if (v.kind === "entry" && v.id) { legacy.overlays.push(v); legacyRefs.push(d.ref); }
      else if (v.kind === "stream" && v.streamId) { legacy.streams.push(v); legacyRefs.push(d.ref); }
    }
    legacy.remove = () => commitOps(be.db, legacyRefs.map(ref => b => b.delete(ref)));
    return { docs, legacy };
  }
  const { store } = be;
  for (const k of await store.list(K_FACULTY_DOC)) {
    const v = await store.get(k);
    if (!v || !v.id) continue;
    if (v.hasPart && v.data) {
      const p = await store.get(K_FACULTY_PART + k.slice(K_FACULTY_DOC.length));
      if (p) v.data = { ...v.data, ...p };
    }
    docs.push(v);
  }
  const legacyKeys = [];
  for (const k of await store.list(K_LEGACY_ENTRY)) {
    const v = await store.get(k);
    legacyKeys.push(k);
    if (v && v.id) legacy.overlays.push(v);
  }
  for (const k of await store.list(K_LEGACY_STREAM)) {
    const v = await store.get(k);
    legacyKeys.push(k);
    if (v && v.streamId) legacy.streams.push(v);
  }
  legacy.remove = () => kvDel(store, legacyKeys);
  return { docs, legacy };
}

/**
 * `{ entries: { [id]: { id, streamId, updatedAt, data } }, overlays: { [id]: review },
 *    manifests: { [streamId]: manifest }, streams: {}, migrated }` (empty when no backend).
 */
export async function readFacultyState(handle, { now = new Date().toISOString() } = {}) {
  const out = { entries: {}, overlays: {}, manifests: {}, streams: {}, migrated: 0 };
  const be = await facultyBackend(handle);
  if (!be) return out;
  let { docs, legacy } = await readRaw(be);
  if (legacy.streams.length || legacy.overlays.length) {
    out.migrated = await migrateLegacy(handle, legacy, now);
    ({ docs } = await readRaw(be));
  }
  for (const v of docs) {
    if (v.data) out.entries[v.id] = { id: v.id, streamId: v.streamId, updatedAt: v.updatedAt, data: v.data };
    if (v.review && v.review.status) out.overlays[v.id] = v.review;
  }
  out.manifests = await readManifests(be);
  return out;
}
