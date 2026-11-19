import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifyDraft, stripCitationMarks, scoreClaims } from "../../server/ai/verify.js";
import { retrieve, loadKb, findReuse, setKbForTests, setGoldenForTests, resetRetrievalCache, buildBm25 } from "../../server/ai/retrieve.js";
import { setAllowListForTests, parseAllowList, urlAllowed, loadAllowList } from "../../server/ai/sources.js";
import { CHUNKS, ALLOW, NOW, mockProvider } from "./helpers.mjs";

beforeEach(() => {
  setAllowListForTests(ALLOW);
  resetRetrievalCache();
  setGoldenForTests([]);
});

const byId = new Map(CHUNKS.map(c => [c.id, c]));

test("verify: supported claims from a fresh regulator source → low risk", async () => {
  const draft = {
    answer: "AIAPGET 2026 is conducted by the National Testing Agency (NTA) for admission to MD/MS Ayurveda courses [c:nta-aiapget-2026-1]. The application fee for General category candidates is Rs 2,700 [c:nta-aiapget-2026-1].",
    actions: ["Read the bulletin"],
    mistake: "Trusting blogs.",
    citations: [{ chunkId: "nta-aiapget-2026-1" }],
  };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider(), now: NOW, retrievalScores: [0.9] });
  assert.equal(v.risk, "low", JSON.stringify(v.claimChecks));
  assert.ok(v.claimChecks.length >= 2);
  assert.ok(v.claimChecks.every(c => c.status === "supported"));
  assert.ok(v.confidence >= 0.7);
});

test("verify: a number the source does not state is unsupported (even if the model says supported)", async () => {
  const draft = {
    answer: "The AIAPGET 2026 application fee is Rs 3,500 [c:nta-aiapget-2026-1].",
    citations: [{ chunkId: "nta-aiapget-2026-1" }],
  };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider(), now: NOW });
  const fee = v.claimChecks.find(c => /3,500/.test(c.claim));
  assert.equal(fee.status, "unsupported");
  assert.match(fee.note, /3500/);
  assert.equal(v.risk, "high");
  assert.ok(v.confidence <= 0.35);
});

test("verify: fees from an old regulator notice are outdated", async () => {
  const draft = {
    answer: "The AIAPGET application fee for General category candidates was Rs 2,000 [c:nta-aiapget-2023].",
    citations: [{ chunkId: "nta-aiapget-2023" }],
  };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider(), now: NOW });
  assert.equal(v.claimChecks[0].status, "outdated");
  assert.match(v.claimChecks[0].note, /older than 12 months/);
  assert.equal(v.risk, "medium");
});

test("verify: citations outside the allow-list or not retrieved are invalid → high risk", async () => {
  const draft = {
    answer: "AIAPGET 2026 fee is Rs 1,500 [c:blog-aiapget-tips]. NTA runs the test [c:does-not-exist].",
    citations: [{ chunkId: "blog-aiapget-tips" }, { chunkId: "does-not-exist" }],
  };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider(), now: NOW });
  assert.equal(v.risk, "high");
  assert.equal(v.counts.invalidCitations, 2);
  assert.ok(v.flags.some(f => /trusted-source list/.test(f)));
  assert.ok(v.claimChecks.every(c => c.status === "unsupported"));
});

test("verify: an uncited factual sentence is caught by the deterministic safety net", async () => {
  const draft = {
    answer: "NEET-PG is only for MBBS graduates [c:nbems-neetpg-1]. Over 40,000 seats are available every year.",
    citations: [{ chunkId: "nbems-neetpg-1" }],
  };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider(), now: NOW });
  const seats = v.claimChecks.find(c => /40,000/.test(c.claim));
  assert.ok(seats, JSON.stringify(v.claimChecks));
  assert.equal(seats.status, "unsupported");
  assert.equal(v.risk, "high");
});

test("verify: the verifier failing never yields a clean pass", async () => {
  const draft = { answer: "The fee is Rs 2,700 [c:nta-aiapget-2026-1].", citations: [{ chunkId: "nta-aiapget-2026-1" }] };
  const v = await verifyDraft({ draft, chunksById: byId, provider: mockProvider({ fail: () => true }), now: NOW });
  assert.equal(v.verifierUsed, false);
  assert.ok(v.flags.some(f => /verifier unavailable/.test(f)));
});

test("verify: score + strip helpers", () => {
  assert.equal(stripCitationMarks("NTA runs it [c:a]. Fee is Rs 2,700 [c:b] ."), "NTA runs it. Fee is Rs 2,700.");
  const s = scoreClaims({ claims: [], cited: [], retrievalScores: [] });
  assert.equal(s.risk, "high", "no sources at all is never low risk");
});

test("allow-list: tolerant parsing and domain matching", () => {
  const entries = parseAllowList({ sources: [{ url: "https://www.nta.ac.in/x", authority: "regulator" }, "ayush.gov.in"] });
  assert.deepEqual(entries.map(e => e.domain), ["nta.ac.in", "ayush.gov.in"]);
  assert.equal(parseAllowList({ "ncismindia.org": { authority: "regulator" } })[0].authority, "regulator");
  const allow = loadAllowList();
  assert.equal(urlAllowed("https://exams.nta.ac.in/AIAPGET", allow), true);
  assert.equal(urlAllowed("https://random-coaching-blog.example/a", allow), false);
});

test("retrieve: stream-filtered BM25, blog excluded, regulator preferred for fee questions", async () => {
  const kb = await loadKb(null, { chunks: CHUNKS });
  const r = await retrieve({ question: "What is the AIAPGET 2026 application fee?", stream: "pg-entrance", theme: "Academics, Teaching & Higher Education" }, { kb });
  assert.ok(r.chunks.length >= 1);
  assert.equal(r.chunks[0].id, "nta-aiapget-2026-1");
  assert.ok(!r.chunks.some(c => c.id === "blog-aiapget-tips"), "non-allow-listed source never retrieved");
  assert.equal(r.timeSensitive, true);
  assert.equal(r.method, "bm25");
});

test("retrieve: cosine over stored embeddings when the provider can embed", async () => {
  const withVec = CHUNKS.map((c, i) => ({ ...c, embedding: c.id === "upsc-cms-ayush-1" ? [1, 0, 0] : [0, 1, i / 10] }));
  const kb = await loadKb(null, { chunks: withVec });
  const provider = { isConfigured: () => true, embed: async () => [[1, 0, 0]] };
  const r = await retrieve({ question: "government medical officer recruitment", stream: "govt-jobs" }, { kb, provider });
  assert.equal(r.method, "cosine+bm25");
  assert.equal(r.chunks[0].id, "upsc-cms-ayush-1");
});

test("reuse: approved golden answers and same-group approvals are reused; golden drafts are not", () => {
  const entries = [
    { id: "golden:a", source: "golden", approved: false, theme: "T", question: "Can BAMS students write NEET-PG?", answer: "No." },
    { id: "bank:c1", source: "approved-draft", approved: true, targetType: "cluster", targetId: "CL-1", theme: "T", question: "x", answer: "Group answer" },
    { id: "golden:b", source: "golden", approved: true, theme: "T", question: "Can BAMS graduates appear for NEET-PG exam?", answer: "No — NEET-PG is for MBBS." },
  ];
  assert.equal(findReuse({ clusterId: "CL-1", question: "anything", theme: "T" }, entries).entry.id, "bank:c1");
  const near = findReuse({ question: "Can BAMS graduates appear for the NEET-PG exam?", theme: "T" }, entries);
  assert.equal(near.entry.id, "golden:b");
  assert.equal(findReuse({ question: "How to open a clinic?", theme: "T" }, entries), null);
});

test("bm25: rare terms outrank common ones", () => {
  const docs = [{ t: "ayurveda career ayurveda" }, { t: "ayurveda aiapget cutoff" }];
  const idx = buildBm25(docs, d => d.t);
  const [a, b] = idx.search("aiapget cutoff");
  assert.ok(b.score > a.score);
  setKbForTests(null);
});
