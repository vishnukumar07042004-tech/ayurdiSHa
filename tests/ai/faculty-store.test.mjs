/**
 * Faculty bank per-entry storage: KV + (in-memory) Firestore records, batched writes, long-field
 * child docs, legacy single-doc migration, bundle ⊕ stored precedence and the manifest-version cache.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import XLSX from "xlsx";
import { handleFacultyOp } from "../../server/ai/facultyOps.js";
import { effectiveBanks, facultyBanks, loadFacultyBundles, refreshFacultyState, registerFacultyStore } from "../../server/ai/facultyBank.js";
import {
  BATCH_MAX, ENTRY_SOFT_MAX_BYTES, K_FACULTY_DOC, K_FACULTY_MANIFEST, K_FACULTY_PART, K_LEGACY_ENTRY, K_LEGACY_STREAM,
  bumpManifest, entryDocId, readFacultyState, splitLongFields, trimEntry, upsertEntries,
} from "../../server/ai/facultyStore.js";
import { memoryStore } from "./helpers.mjs";

const BUNDLE = JSON.parse(fs.readFileSync(new URL("../../data/faculty/clinical-practice.json", import.meta.url), "utf8"));
const ENRICHED = new URL("../../docs/faculty/DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx", import.meta.url);
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Just enough of the Firestore Admin API for facultyStore.js (collections, docs, batches, mergeFields, increment). */
function fakeFirestore() {
  const docs = new Map();
  const batches = [];
  const applySet = (path, value, opts = {}) => {
    const prev = docs.get(path) || {};
    let next;
    if (opts.mergeFields) { next = { ...prev }; for (const f of opts.mergeFields) next[f] = value[f]; }
    else if (opts.merge) next = { ...prev, ...value };
    else next = { ...value };
    for (const [k, v] of Object.entries(next)) {
      if (v && v.constructor && v.constructor.name === "NumericIncrementTransform") next[k] = (Number(prev[k]) || 0) + v.operand;
    }
    docs.set(path, clone(next));
  };
  const docRef = path => ({
    path,
    collection: name => colRef(`${path}/${name}`),
    async get() { return { exists: docs.has(path), data: () => clone(docs.get(path)) }; },
    async set(v, o) { applySet(path, v, o); },
    async delete() { docs.delete(path); },
  });
  const colRef = path => ({
    doc: id => docRef(`${path}/${id}`),
    async get() {
      const depth = path.split("/").length + 1;
      const keys = [...docs.keys()].filter(k => k.startsWith(`${path}/`) && k.split("/").length === depth);
      return { docs: keys.map(k => ({ id: k.split("/").pop(), ref: docRef(k), data: () => clone(docs.get(k)) })) };
    },
  });
  return {
    docs,
    batches,
    collection: colRef,
    batch() {
      const ops = [];
      return {
        set: (ref, v, o) => ops.push(() => applySet(ref.path, v, o)),
        delete: ref => ops.push(() => docs.delete(ref.path)),
        async commit() { assert.ok(ops.length <= 500, "Firestore batch limit"); batches.push(ops.length); ops.forEach(f => f()); },
      };
    },
  };
}

const synthetic = n => Array.from({ length: n }, (_, i) => ({ ...BUNDLE.entries[i % 100], id: `CP-${String(50 + Math.floor(i / 100)).padStart(2, "0")}-${String((i % 100) + 1).padStart(3, "0")}`, updatedAt: "2099-01-01T00:00:00Z" }));

test("trim + split: paraphrases ≤ 12, citations ≤ 6; an entry over 200 KB keeps long fields in a child record", async () => {
  const e = trimEntry({ ...BUNDLE.entries[0], paraphrases: Array(30).fill({ text: "p" }), citations: Array(20).fill({ url: "https://ncismindia.org/" }), nope: undefined });
  assert.equal(e.paraphrases.length, 12);
  assert.equal(e.citations.length, 6);
  assert.ok(!("nope" in e));
  assert.equal(splitLongFields(e).part, null);

  const store = memoryStore();
  const huge = { ...BUNDLE.entries[0], answerMarked: "x".repeat(300 * 1024), updatedAt: "2099-01-01T00:00:00Z" };
  await upsertEntries(store, [{ id: huge.id, streamId: "clinical-practice", data: huge }]);
  const key = entryDocId("clinical-practice", huge.id);
  assert.ok(Buffer.byteLength(JSON.stringify(store.db[K_FACULTY_DOC + key])) < ENTRY_SOFT_MAX_BYTES);
  assert.equal(store.db[K_FACULTY_DOC + key].hasPart, true);
  assert.equal(store.db[K_FACULTY_PART + key].answerMarked.length, 300 * 1024);
  const state = await readFacultyState(store);
  assert.equal(state.entries[huge.id].data.answerMarked.length, 300 * 1024);
  assert.equal(state.entries[huge.id].data.enrichedAnswer, huge.enrichedAnswer);

  await upsertEntries(store, [{ id: huge.id, streamId: "clinical-practice", data: BUNDLE.entries[0] }]);
  assert.equal(store.db[K_FACULTY_PART + key], undefined, "a shrunk entry drops its child record");
});

test("overlay precedence: bundle baseline, stored entry wins only when newer, reviews on top, manifest metadata", () => {
  const [a, b] = BUNDLE.entries;
  const { paraphrases, ...aNoParas } = a;
  const state = {
    entries: {
      [a.id]: { id: a.id, streamId: "clinical-practice", data: { ...aNoParas, question: "Newer stored question?", updatedAt: "2099-01-01T00:00:00Z" } },
      [b.id]: { id: b.id, streamId: "clinical-practice", data: { ...b, question: "Older stored question?", status: "rejected", updatedAt: "2000-01-01T00:00:00Z" } },
      "CP-99-001": { id: "CP-99-001", streamId: "clinical-practice", data: { id: "CP-99-001", question: "Brand new row?", draftAnswer: "x", status: "draft", updatedAt: "2099-01-01T00:00:00Z" } },
      "PG-01-001": { id: "PG-01-001", streamId: "pg-entrance", data: { id: "PG-01-001", stream: "PG Entrance", question: "When is AIAPGET?", draftAnswer: "y", status: "draft", updatedAt: "2099-01-01T00:00:00Z" } },
    },
    overlays: { [a.id]: { id: a.id, status: "approved", reviewer: "Dr Z" } },
    manifests: { "pg-entrance": { streamId: "pg-entrance", stream: "PG Entrance", lastUploadAt: "2099-01-01T00:00:00Z", source: "pg.xlsx", version: 2 } },
  };
  const banks = effectiveBanks(loadFacultyBundles(), state);
  const cp = banks.find(x => x.streamId === "clinical-practice");
  assert.equal(cp.origin, "bundle+uploaded");
  assert.equal(cp.entries.length, 101);
  assert.equal(cp.entries[0].question, "Newer stored question?");
  assert.equal(cp.entries[0].paraphrases.length, paraphrases.length, "bundle enrichment fills what the stored row lacks");
  assert.deepEqual([cp.entries[0].status, cp.entries[0].reviewer], ["approved", "Dr Z"]);
  assert.equal(cp.entries[1].question, b.question, "an older stored row loses to the bundle…");
  assert.equal(cp.entries[1].status, "rejected", "…but a draft bundle row never demotes its stored status");
  assert.equal(cp.entries[100].id, "CP-99-001");
  const pg = banks.find(x => x.streamId === "pg-entrance");
  assert.deepEqual([pg.origin, pg.stream, pg.filename, pg.importedAt, pg.manifest.version], ["uploaded", "PG Entrance", "pg.xlsx", "2099-01-01T00:00:00Z", 2]);
});

test("migration (KV): the legacy single-doc stream + overlays become per-entry records on first read, idempotently", async () => {
  const legacyEntries = BUNDLE.entries.slice(0, 3).map(e => ({ ...e, status: e.id === "CP-01-002" ? "approved" : e.status, reviewer: "Dr Old", updatedAt: "2099-01-01T00:00:00Z" }));
  const store = memoryStore({
    [`${K_LEGACY_STREAM}clinical-practice`]: { kind: "stream", version: 1, streamId: "clinical-practice", stream: "Clinical Practice", importedAt: "2026-11-07T10:00:00Z", importedBy: "Ops", filename: "old.xlsx", sources: [{ name: "NCISM", url: "https://ncismindia.org/" }], instructions: [], entries: legacyEntries },
    [`${K_LEGACY_ENTRY}CP-08-002`]: { kind: "entry", id: "CP-08-002", status: "rejected", reviewer: "Dr R", notes: "Wrong", at: "2026-11-07T11:00:00Z", by: "Dr R" },
  });
  const list = await handleFacultyOp("facultyList", { streamId: "clinical-practice" }, store, { staff: true });
  assert.equal(list.body.counts.total, 100);
  const byId = Object.fromEntries(list.body.entries.map(e => [e.id, e]));
  assert.deepEqual([byId["CP-01-002"].status, byId["CP-01-002"].reviewer], ["approved", "Dr Old"]);
  assert.deepEqual([byId["CP-08-002"].status, byId["CP-08-002"].reviewerNotes], ["rejected", "Wrong"]);

  assert.equal(Object.keys(store.db).filter(k => k.startsWith(K_LEGACY_STREAM) || k.startsWith(K_LEGACY_ENTRY)).length, 0, "legacy keys removed");
  assert.equal(Object.keys(store.db).filter(k => k.startsWith(K_FACULTY_DOC)).length, 4);
  const m = store.db[`${K_FACULTY_MANIFEST}clinical-practice`];
  assert.deepEqual([m.count, m.source, m.lastUploadAt, m.version], [3, "old.xlsx", "2026-11-07T10:00:00Z", 1]);

  const again = await readFacultyState(store);
  assert.equal(again.migrated, 0);
  assert.equal(Object.keys(again.entries).length, 3);
  assert.deepEqual(Object.keys(again.overlays), ["CP-08-002"]);
  assert.equal(again.manifests["clinical-practice"].version, 1);
});

test("Firestore: legacy docs migrate in batches of ≤ 450; per-entry docs + faculty_streams manifest; long fields in a child doc", async () => {
  const db = fakeFirestore();
  const handle = { facultyFirestore: db };
  db.docs.set("faculty_bank/stream~clinical-practice", { kind: "stream", streamId: "clinical-practice", stream: "Clinical Practice", filename: "old.xlsx", importedAt: "2026-11-07T10:00:00Z", entries: synthetic(500) });
  db.docs.set("faculty_bank/entry~CP-01-001", { kind: "entry", id: "CP-01-001", status: "approved", reviewer: "Dr F" });
  const state = await readFacultyState(handle);
  assert.equal(state.migrated, 501);
  assert.ok(db.batches.every(n => n <= BATCH_MAX), `batches ${db.batches}`);
  assert.ok(db.batches.length >= 2);
  assert.equal(db.docs.has("faculty_bank/stream~clinical-practice"), false);
  assert.equal(db.docs.has("faculty_bank/entry~CP-01-001"), false);
  assert.equal(Object.keys(state.entries).length, 500);
  assert.equal(state.overlays["CP-01-001"].reviewer, "Dr F");
  assert.deepEqual([state.manifests["clinical-practice"].count, state.manifests["clinical-practice"].version], [500, 1]);
  assert.ok(db.docs.get("faculty_bank/clinical-practice__CP-50-001").data.question);
  assert.equal((await readFacultyState(handle)).migrated, 0);

  const huge = { ...BUNDLE.entries[1], answerMarked: "y".repeat(250 * 1024), updatedAt: "2099-01-01T00:00:00Z" };
  await upsertEntries(handle, [{ id: huge.id, streamId: "clinical-practice", data: huge, review: { id: huge.id, status: "rejected", notes: "n" } }]);
  const doc = db.docs.get(`faculty_bank/clinical-practice__${huge.id}`);
  assert.equal(doc.hasPart, true);
  assert.ok(Buffer.byteLength(JSON.stringify(doc)) < ENTRY_SOFT_MAX_BYTES);
  assert.equal(db.docs.get(`faculty_bank/clinical-practice__${huge.id}/parts/long`).answerMarked.length, 250 * 1024);
  await upsertEntries(handle, [{ id: huge.id, streamId: "clinical-practice", review: null }]);
  const read = await readFacultyState(handle);
  assert.equal(read.entries[huge.id].data.answerMarked.length, 250 * 1024, "a review-only write keeps the entry data");
  assert.equal(read.overlays[huge.id], undefined);
  await bumpManifest(handle, "clinical-practice");
  assert.equal(db.docs.get("faculty_streams/clinical-practice").version, 2);
});

test("Firestore: the full enriched workbook imports through the op; a review updates only that entry's doc", async () => {
  const db = fakeFirestore();
  const store = { name: "firestore-test", facultyFirestore: db };
  const wb = XLSX.read(fs.readFileSync(ENRICHED), { type: "buffer" });
  const sheets = Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false })]));
  const r = await handleFacultyOp("facultyImport", { sheets, filename: "enriched.xlsx" }, store, { staff: true });
  assert.equal(r.code, 200, r.body.error);
  const entryDocs = [...db.docs.keys()].filter(k => /^faculty_bank\/[^/]+$/.test(k));
  assert.equal(entryDocs.length, 100);
  assert.ok(entryDocs.every(k => Buffer.byteLength(JSON.stringify(db.docs.get(k))) < ENTRY_SOFT_MAX_BYTES));
  assert.equal(db.docs.get("faculty_streams/clinical-practice").count, 100);

  const before = clone(db.docs.get("faculty_bank/clinical-practice__CP-02-001"));
  const rev = await handleFacultyOp("facultyReview", { id: "CP-02-001", status: "approved", reviewer: "Dr Q" }, store, { staff: true });
  assert.equal(rev.body.entry.status, "approved");
  const after = db.docs.get("faculty_bank/clinical-practice__CP-02-001");
  assert.deepEqual(after.data, before.data);
  assert.equal(after.review.reviewer, "Dr Q");
  assert.equal(db.docs.get("faculty_streams/clinical-practice").version, 2);
});

test("cache: manifests are checked at most every 60 s and entries reload only when a version changed", async () => {
  const store = memoryStore();
  const reads = { docs: 0, manifests: 0 };
  const list = store.list.bind(store);
  store.list = async prefix => {
    if (prefix === K_FACULTY_DOC) reads.docs++;
    if (prefix === K_FACULTY_MANIFEST) reads.manifests++;
    return list(prefix);
  };
  registerFacultyStore(store);
  await refreshFacultyState(store, { fresh: true });
  assert.equal(reads.docs, 1);
  await refreshFacultyState(store);
  assert.deepEqual(reads, { docs: 1, manifests: 1 }, "inside 60 s: no store reads");
  await refreshFacultyState(store, { check: true });
  assert.deepEqual(reads, { docs: 1, manifests: 2 }, "unchanged version: manifests only");

  const [e] = synthetic(1);
  await upsertEntries(store, [{ id: e.id, streamId: "clinical-practice", data: e }]);
  await bumpManifest(store, "clinical-practice", { count: 1 });
  await refreshFacultyState(store);
  assert.ok(!facultyBanks()[0].entries.some(x => x.id === e.id), "another instance's write is not seen inside the window");

  const realNow = Date.now;
  Date.now = () => realNow() + 61 * 1000;
  try { await refreshFacultyState(store); }
  finally { Date.now = realNow; }
  assert.equal(reads.docs, 2);
  assert.ok(facultyBanks()[0].entries.some(x => x.id === e.id));
});
