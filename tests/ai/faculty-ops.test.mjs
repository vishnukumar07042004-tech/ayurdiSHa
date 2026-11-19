/**
 * Staff ops for the faculty Q&A bank on an in-memory store: staff gate, upload preview /
 * validation, import (review columns + overlays), review → matcher, export, match test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import XLSX from "xlsx";
import { FACULTY_OPS, handleFacultyOp } from "../../server/ai/facultyOps.js";
import { facultyContext } from "../../server/ai/facultyBank.js";
import { ENTRY_SOFT_MAX_BYTES, K_FACULTY_DOC, K_FACULTY_MANIFEST, entryDocId } from "../../server/ai/facultyStore.js";
import { chunkFacultyWorkbook } from "../../shared/facultyWorkbook.js";
import { memoryStore } from "./helpers.mjs";

const SOURCE = new URL("../../data/faculty/source/DISHA_Stream_1_Clinical_Practice_100_QA_Draft.xlsx", import.meta.url);
const ENRICHED = new URL("../../docs/faculty/DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx", import.meta.url);

function sheetsOf(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false })]));
}

const op = (store, name, msg = {}, staff = true) => handleFacultyOp(name, msg, store, { staff });

test("every faculty op is staff-only", async () => {
  const store = memoryStore();
  for (const name of FACULTY_OPS) assert.equal((await op(store, name, {}, false)).code, 403, name);
});

test("streams + list: bundled Clinical Practice bank with status filters", async () => {
  const store = memoryStore();
  const s = await op(store, "facultyStreams");
  const cp = s.body.streams.find(x => x.id === "clinical-practice");
  assert.equal(cp.counts.total, 100);
  assert.equal(s.body.streams.length, 16);
  const all = await op(store, "facultyList", { streamId: "clinical-practice" });
  assert.equal(all.body.entries.length, 100);
  assert.equal(all.body.counts.draft, 100);
  assert.equal((await op(store, "facultyList", { status: "approved" })).body.entries.length, 0);
  assert.equal((await op(store, "facultyList", { query: "inappropriate" })).body.entries.map(e => e.id).join(), "CP-09-002");
});

test("preview validates the upload; import stores the stream and status changes", async () => {
  const store = memoryStore();
  const sheets = sheetsOf(fs.readFileSync(SOURCE));
  const qaName = Object.keys(sheets).find(n => sheets[n][0] && sheets[n][0].includes("Question ID"));
  const grid = sheets[qaName];
  const col = grid[0].indexOf("Approval status");
  const rev = grid[0].indexOf("Expert reviewer");
  const idRow = grid.findIndex(r => r[0] === "CP-03-002");
  grid[idRow][col] = "Approved";
  grid[idRow][rev] = "Dr Faculty";

  const pre = await op(store, "facultyPreview", { sheets });
  assert.equal(pre.code, 200);
  assert.equal(pre.body.ok, true);
  assert.equal(pre.body.rows, 100);
  assert.equal(pre.body.streamId, "clinical-practice");
  assert.deepEqual(pre.body.statusChanges, [{ id: "CP-03-002", from: "draft", to: "approved" }]);

  const broken = { Sheet1: [["Question ID", "Student question", "DISHA draft answer"], ["CP-01-001", "Q?", "A"], ["CP-01-001", "Q2?", "B"]] };
  const bad = await op(store, "facultyPreview", { sheets: broken });
  assert.equal(bad.body.ok, false);
  assert.match(bad.body.errors.join(" "), /duplicate Question ID CP-01-001/);
  assert.equal((await op(store, "facultyImport", { sheets: broken })).code, 400);

  const full = await op(memoryStore(), "facultyImport", { sheets, filename: "validated.xlsx" });
  assert.equal(full.code, 200);
  assert.equal(full.body.imported, 100);

  const subset = { ...sheets, [qaName]: grid.filter((r, i) => i === 0 || String(r[0]).startsWith("CP-03-")) };
  const imp = await op(store, "facultyImport", { sheets: subset, filename: "validated.xlsx" });
  assert.equal(imp.code, 200);
  assert.equal(imp.body.imported, subset[qaName].length - 1);
  assert.equal(imp.body.counts.approved, 1);
  assert.ok(store.db[`${K_FACULTY_DOC}clinical-practice__CP-03-002`]);
  assert.equal(store.db[`${K_FACULTY_MANIFEST}clinical-practice`].count, subset[qaName].length - 1);
  const list = await op(store, "facultyList", { status: "approved" });
  assert.deepEqual(list.body.entries.map(e => [e.id, e.reviewer]), [["CP-03-002", "Dr Faculty"]]);
  const ctx = await facultyContext("which licences does my ayurveda clinic need", "clinical-practice", { store });
  assert.equal(ctx.facultyBankId, "CP-03-002");
  assert.equal(ctx.status, "approved");
});

const QA = "Clinical Practice Q&A";

test("the full enriched Clinical Practice workbook imports in one go, one record per entry", async () => {
  const store = memoryStore();
  const sheets = sheetsOf(fs.readFileSync(ENRICHED));
  const r = await op(store, "facultyImport", { sheets, filename: "DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx", reviewer: "Ops" });
  assert.equal(r.code, 200, r.body.error);
  assert.equal(r.body.imported, 100);
  assert.equal(r.body.stored, 100);
  assert.equal(r.body.streamCounts.total, 100);
  const keys = Object.keys(store.db).filter(k => k.startsWith(K_FACULTY_DOC));
  assert.equal(keys.length, 100);
  const sizes = keys.map(k => Buffer.byteLength(JSON.stringify(store.db[k])));
  assert.ok(Math.max(...sizes) < ENTRY_SOFT_MAX_BYTES / 4, `largest entry ${Math.max(...sizes)} B`);
  assert.ok(sizes.reduce((a, b) => a + b, 0) > 900 * 1024, "the stream would not fit the old single 900 KB document");
  const e = store.db[K_FACULTY_DOC + entryDocId("clinical-practice", "CP-01-001")].data;
  assert.ok(e.enrichedAnswer && !/Verify locally:/.test(e.enrichedAnswer), "the exported 'Verify locally' suffix is split back out");
  assert.ok(e.verifyLocally);
  assert.ok(e.citations.length > 0 && e.citations.length <= 6);
  assert.ok(e.paraphrases.length > 0 && e.paraphrases.length <= 12);
  const m = store.db[`${K_FACULTY_MANIFEST}clinical-practice`];
  assert.deepEqual([m.count, m.version, m.source, m.lastUploadBy], [100, 1, "DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx", "Ops"]);
  assert.ok(m.sources.length > 0);

  const s = await op(store, "facultyStreams");
  const cp = s.body.streams.find(x => x.id === "clinical-practice");
  assert.equal(cp.counts.total, 100);
  assert.equal(cp.stored, 100);
  assert.equal(cp.lastUpload.file, m.source);
  assert.equal((await op(store, "facultyMatchTest", { question: "clinic kholna hai, pehle kya kare" })).body.matches[0].id, "CP-03-001");
  const ex = await op(store, "facultyExport", { streamId: "clinical-practice" });
  assert.equal(sheetsOf(Buffer.from(ex.body.base64, "base64"))[QA].length, 101);
});

test("chunked import: a 300-row workbook goes up in parts of 100; row numbers stay workbook-relative", async () => {
  const sheets = sheetsOf(fs.readFileSync(ENRICHED));
  const grid = sheets[QA];
  const rows = [1, 2, 3].flatMap(k => grid.slice(1).map(r => {
    const c = [...r];
    c[0] = String(r[0]).replace(/^CP-(\d\d)/, (_, n) => `CP-${String(Number(n) + 20 * k).padStart(2, "0")}`);
    return c;
  }));
  const big = { ...sheets, [QA]: [grid[0], ...rows] };
  const parts = chunkFacultyWorkbook(big);
  assert.deepEqual(parts.map(p => [p.from, p.to, p.total]), [[1, 100, 300], [101, 200, 300], [201, 300, 300]]);
  assert.ok(parts[0].sheets.Sources && !parts[1].sheets.Sources && !parts[0].sheets.Coverage && !parts[0].sheets.Paraphrases);
  parts.forEach(p => assert.ok(Buffer.byteLength(JSON.stringify(p)) < 3 * 1024 * 1024));

  const store = memoryStore();
  let last;
  for (const [i, p] of parts.entries()) {
    last = await op(store, "facultyImport", { sheets: p.sheets, rowOffset: p.rowOffset, streamId: "clinical-practice", filename: "big.xlsx", part: i + 1, parts: parts.length });
    assert.equal(last.code, 200, last.body.error);
    assert.equal(last.body.imported, 100);
  }
  assert.equal(last.body.stored, 300);
  assert.equal(last.body.streamCounts.total, 400, "100 bundled + 300 uploaded");
  const m = store.db[`${K_FACULTY_MANIFEST}clinical-practice`];
  assert.deepEqual([m.count, m.version], [300, 3]);
  assert.ok(m.sources.length > 0, "Sources from part 1 survive parts 2–3");
  assert.equal((await op(store, "facultyList", { streamId: "clinical-practice" })).body.counts.total, 400);

  const broken = parts[1].sheets[QA].map(r => [...r]);
  broken[5][grid[0].indexOf("Student question")] = "";
  const pre = await op(store, "facultyPreview", { sheets: { [QA]: broken }, rowOffset: parts[1].rowOffset });
  assert.match(pre.body.errors.join(" "), /Row 106 \(/);
});

test("re-import merge: an uploaded draft never demotes a review; other uploaded statuses win; notes kept", async () => {
  const store = memoryStore();
  const sheets = sheetsOf(fs.readFileSync(ENRICHED));
  const head = sheets[QA][0];
  const col = n => head.indexOf(n);
  await op(store, "facultyReview", { id: "CP-01-001", status: "approved", reviewer: "Dr A", notes: "Checked against NCISM." });
  await op(store, "facultyReview", { id: "CP-01-002", status: "approved", reviewer: "Dr A", notes: "Keep this note." });
  await op(store, "facultyReview", { id: "CP-01-003", status: "edited", reviewer: "Dr A", answer: "Faculty wording." });
  const g = sheets[QA].map(r => [...r]);
  const row = id => g.find(r => r[0] === id);
  row("CP-01-002")[col("Approval status")] = "Rejected";
  row("CP-02-001")[col("Approval status")] = "Approved";
  row("CP-02-001")[col("Expert reviewer")] = "Dr B";
  row("CP-02-001")[col("Reviewer edits / notes")] = "From the workbook.";

  const pre = await op(store, "facultyPreview", { sheets: { ...sheets, [QA]: g } });
  assert.deepEqual(pre.body.statusChanges, [{ id: "CP-01-002", from: "approved", to: "rejected" }, { id: "CP-02-001", from: "draft", to: "approved" }]);
  assert.equal((await op(store, "facultyImport", { sheets: { ...sheets, [QA]: g }, filename: "round1.xlsx" })).code, 200);
  const get = async id => (await op(store, "facultyList", { query: id })).body.entries.find(e => e.id === id);
  let e = await get("CP-01-001");
  assert.deepEqual([e.status, e.reviewer, e.reviewerNotes], ["approved", "Dr A", "Checked against NCISM."]);
  e = await get("CP-01-002");
  assert.deepEqual([e.status, e.reviewerNotes], ["rejected", "Keep this note."]);
  e = await get("CP-01-003");
  assert.deepEqual([e.status, e.approvedAnswer], ["edited", "Faculty wording."]);
  e = await get("CP-02-001");
  assert.deepEqual([e.status, e.reviewer, e.reviewerNotes], ["approved", "Dr B", "From the workbook."]);

  const r2 = await op(store, "facultyImport", { sheets, filename: "round2.xlsx" });
  assert.deepEqual([r2.body.streamCounts.approved, r2.body.streamCounts.edited, r2.body.streamCounts.rejected, r2.body.streamCounts.draft], [2, 1, 1, 96], "the all-draft workbook demotes nothing");

  const r3 = await op(store, "facultyImport", { sheets, filename: "round3.xlsx", mode: "workbook-wins" });
  assert.equal(r3.body.streamCounts.draft, 100);
  assert.equal((await get("CP-01-001")).reviewerNotes, "Checked against NCISM.", "notes survive even when the workbook wins");
});

test("review: approve needs a reviewer, edit needs text, reject removes the row from matching", async () => {
  const store = memoryStore();
  assert.equal((await op(store, "facultyReview", { id: "CP-08-002", status: "approved" })).code, 400);
  assert.equal((await op(store, "facultyReview", { id: "CP-08-002", status: "edited", reviewer: "Dr A" })).code, 400);
  assert.equal((await op(store, "facultyReview", { id: "XX-99-999", status: "approved", reviewer: "Dr A" })).code, 404);
  assert.equal((await op(store, "facultyReview", { id: "CP-08-002", status: "maybe", reviewer: "Dr A" })).code, 400);

  const ed = await op(store, "facultyReview", { id: "CP-08-002", status: "approved", reviewer: "Dr A", notes: "Tightened.", answer: "Only where state law explicitly allows it; check your State Board." });
  assert.equal(ed.code, 200);
  assert.equal(ed.body.entry.status, "edited", "an approval with new text is 'Approved with edits'");
  assert.equal(ed.body.entry.reviewerNotes, "Tightened.");
  assert.equal(store.db[`${K_FACULTY_DOC}clinical-practice__CP-08-002`].review.status, "edited");
  assert.equal(store.db[`${K_FACULTY_DOC}clinical-practice__CP-08-002`].data, undefined, "a review alone stores no entry copy");
  const ctx = await facultyContext("can bams doctors prescribe allopathic medicines", "clinical-practice", { store });
  assert.equal(ctx.status, "edited");
  assert.match(ctx.text, /Answer: Only where state law explicitly allows it/);

  await op(store, "facultyReview", { id: "CP-09-001", status: "rejected", reviewer: "Dr B", notes: "Rewrite" });
  const t = await op(store, "facultyMatchTest", { question: "Can I provide Ayurveda consultations online?" });
  assert.ok(!t.body.matches.some(m => m.id === "CP-09-001"));
  assert.equal((await op(store, "facultyList", { status: "rejected" })).body.entries[0].id, "CP-09-001");
});

test("export returns the enriched workbook; match test explains decisions", async () => {
  const store = memoryStore();
  const ex = await op(store, "facultyExport", { streamId: "clinical-practice" });
  assert.equal(ex.body.filename, "DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx");
  const back = sheetsOf(Buffer.from(ex.body.base64, "base64"));
  assert.equal(back["Clinical Practice Q&A"].length, 101);
  assert.equal((await op(store, "facultyExport", { streamId: "abroad-usa" })).code, 404);
  const m = await op(store, "facultyMatchTest", { question: "clinic kholna hai, pehle kya kare" });
  assert.equal(m.body.matches[0].id, "CP-03-001");
  assert.equal(m.body.matches[0].decision, "high");
});
