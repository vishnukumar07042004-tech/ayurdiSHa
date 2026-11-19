/**
 * Faculty bank → drafting hook: retrieve() adds the confident faculty match, the drafter gets it as
 * FACULTY_ANSWER (status-labelled) and the draft record carries facultyBankId + status. Mock
 * provider, in-memory store, no network.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { draftAnswer } from "../../server/ai/draft.js";
import { retrieve, setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { setFacultyStateForTests } from "../../server/ai/facultyBank.js";
import { ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const CLINIC_CHUNK = {
  id: "ncism-practice-1",
  url: "https://ncismindia.org/registration/practice",
  title: "Registration to practise Indian System of Medicine",
  text: "A person holding a recognised BAMS qualification must be registered with a State Board or the Central Register of Indian Medicine before practising. Completion of the compulsory rotatory internship is required for registration.",
  authority: "regulator",
  publishedAt: "2026-01-10",
  streams: ["clinical-practice"],
};

function target(question) {
  return {
    type: "question",
    id: "fq1",
    rec: { id: "fq1", ticket: "AYM-Q-fq1", createdAt: Date.now(), theme: "Clinical Practice & Integrative Care", subtheme: "Starting a clinic", question, context: "", stage: "Final-year student" },
  };
}

async function setup() {
  setAllowListForTests(ALLOW);
  setKbForTests([CLINIC_CHUNK]);
  setGoldenForTests([]);
  return aiStoreFor(memoryStore());
}

after(() => {
  setFacultyStateForTests(null);
  resetRetrievalCache();
  setKbForTests(null);
  setGoldenForTests(null);
  setAllowListForTests(null);
});

test("retrieve() puts a confident faculty match first, never as an approved answer", async () => {
  const aiStore = await setup();
  setFacultyStateForTests({ overlays: {}, streams: {} });
  const r = await retrieve({ question: "Can I start private clinical practice right after BAMS?", stream: "clinical-practice" }, { aiStore });
  assert.equal(r.faculty.facultyBankId, "CP-01-002");
  assert.equal(r.bank[0].targetType, "faculty");
  assert.equal(r.bank[0].approved, false);
  assert.equal(r.reuse, null);
  const none = await retrieve({ question: "Which AIAPGET books should I read?", stream: "pg-entrance" }, { aiStore });
  assert.equal(none.faculty, null);
});

test("draft prompt gets FACULTY_ANSWER (draft label) and the record keeps provenance", async () => {
  const aiStore = await setup();
  setFacultyStateForTests({ overlays: {}, streams: {} });
  const provider = mockProvider();
  const out = await draftAnswer({ target: target("BAMS ke baad seedha private practice kar sakte hai kya?"), aiStore, provider, cfg: {} });
  assert.equal(out.aiDraft.facultyBankId, "CP-01-002");
  assert.deepEqual({ id: out.aiDraft.faculty.id, status: out.aiDraft.faculty.status }, { id: "CP-01-002", status: "draft" });
  assert.equal(out.aiDraft.status, "pending", "a faculty match never auto-approves");
  const draftCall = provider.calls.find(c => !/strict fact checker/.test(c.system));
  const payload = JSON.parse(draftCall.messages[0].content);
  assert.match(payload.FACULTY_ANSWER, /^FACULTY_ANSWER CP-01-002 \(faculty draft, unvalidated/);
  assert.deepEqual(payload.approvedAnswersForSimilarQuestions, []);
  assert.ok(out.meta.retrieval.bank.some(b => b.id === "CP-01-002" && b.source === "faculty-draft"));
});

test("approved faculty row is labelled authoritative; medical questions still go to a mentor first", async () => {
  const aiStore = await setup();
  setFacultyStateForTests({ overlays: { "CP-01-002": { id: "CP-01-002", status: "approved", reviewer: "Dr Faculty" } }, streams: {} });
  const provider = mockProvider();
  const out = await draftAnswer({ target: target("Can I start private clinical practice immediately after completing BAMS?"), aiStore, provider, cfg: {} });
  assert.equal(out.aiDraft.faculty.status, "approved");
  const payload = JSON.parse(provider.calls.find(c => !/strict fact checker/.test(c.system)).messages[0].content);
  assert.match(payload.FACULTY_ANSWER, /faculty-validated/);
  assert.equal(out.aiDraft.status, "pending");

  const med = await draftAnswer({ target: target("My patient has chest pain, which dose of Arjuna should I prescribe?"), aiStore, provider: mockProvider(), cfg: {} });
  assert.equal(med.aiDraft.facultyBankId, undefined);
  assert.notEqual(med.aiDraft.status, "approved");
});
