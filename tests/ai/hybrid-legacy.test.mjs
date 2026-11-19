/**
 * GPT letters stored as `aiDrafts.openai` (compare mode before the Hybrid switch) must appear on
 * the Hybrid card, count as Hybrid for backfill/stats, and be approvable as Hybrid. Gemini drafts
 * are never deleted. In-memory store; no network.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { invalidateConfigCache } from "../../server/ai/queue.js";
import { handleAiOp } from "../../server/ai/ops.js";
import { normalizeDrafts, missingSides, computeCompareStats, canonicalSide } from "../../server/ai/compare.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";

function q(id, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera.iyer@gmail.com",
    theme: THEME_PG, subtheme: "Choosing a PG branch",
    question: "Who conducts AIAPGET 2026 and what is the application fee?", context: "", stage: "Intern",
    ...extra,
  };
}

async function op(store, name, msg = {}) {
  const ctx = {
    out: null,
    send(code, body) { this.out = { code, body }; },
    clustersMeta: s => s.getClustersMeta(),
    persistClusters: (s, clusters, v) => s.saveClusters(clusters, v),
    ClustersVersionConflictError,
    sendClustersConflict(v) { this.out = { code: 409, body: { conflict: true, clustersVersion: v } }; },
    notifyAnswerOnce: async () => null,
    notifyNewlyPublishedClusters: async () => {},
    kickWorker: () => {},
  };
  await handleAiOp(name, msg, store, ctx);
  return ctx.out;
}

function side(provider, over = {}) {
  return {
    provider, status: "pending",
    answer: provider === "gemini" ? "Gemini letter: NCISM first." : "GPT letter: start from the NTA bulletin.",
    actions: ["Step one"], mistake: "A common mistake", resources: [], citations: [], claimChecks: [],
    confidence: 0.8, risk: "low", mode: "grounded", verifyFlags: [],
    model: provider === "gemini" ? "gemini-4-argon" : "gpt-5.5",
    verifyModel: provider === "gemini" ? "gemini-3.8-flash" : "gpt-5.4-mini",
    latencyMs: 1000, usage: { costUSD: 0.01 }, createdAt: 1,
    ...over,
  };
}

before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  setRuntimeForTests({ provider: mockProvider() });
  invalidateConfigCache();
});

test("canonicalSide / normalizeDrafts: openai GPT fills Hybrid without dropping Gemini or openai", () => {
  assert.equal(canonicalSide("openai"), "hybrid");
  assert.equal(canonicalSide("hybrid"), "hybrid");
  assert.equal(canonicalSide("gemini"), "gemini");
  const raw = { gemini: side("gemini"), openai: side("openai") };
  const n = normalizeDrafts(raw);
  assert.equal(n.hybrid.answer, raw.openai.answer);
  assert.equal(n.hybrid.provider, "hybrid");
  assert.equal(n.hybrid.legacyGpt, true);
  assert.equal(n.hybrid.model, "gpt-5.5");
  assert.equal(n.openai.answer, raw.openai.answer, "original GPT side kept");
  assert.equal(n.gemini.answer, raw.gemini.answer, "Gemini kept");
  const both = normalizeDrafts({ hybrid: side("hybrid", { answer: "New hybrid" }), openai: side("openai"), gemini: side("gemini") });
  assert.equal(both.hybrid.answer, "New hybrid", "existing Hybrid is not overwritten by openai");
});

test("missingSides: a stored openai GPT draft means Hybrid is not missing", () => {
  const rec = { aiDraft: { drafter: "gemini", status: "pending" }, aiDrafts: { gemini: side("gemini"), openai: side("openai") } };
  assert.deepEqual(missingSides(rec), []);
  assert.deepEqual(missingSides({ aiDraft: { drafter: "gemini" }, aiDrafts: { gemini: side("gemini") } }), ["hybrid"]);
  assert.deepEqual(missingSides({ aiDraft: { drafter: "hybrid" }, aiDrafts: { hybrid: { ...side("hybrid"), status: "error" }, gemini: side("gemini") } }), ["hybrid"]);
});

test("computeCompareStats counts openai+gemini records as Hybrid vs Gemini", () => {
  const drafts = [{
    aiDraft: { status: "pending" },
    aiDrafts: { gemini: side("gemini"), openai: side("openai") },
  }];
  const stats = computeCompareStats(drafts, ["hybrid", "gemini"]);
  assert.equal(stats.compared, 1);
  const hy = stats.providers.find(p => p.provider === "hybrid");
  const ge = stats.providers.find(p => p.provider === "gemini");
  assert.equal(hy.drafts, 1);
  assert.equal(ge.drafts, 1);
});

test("queue lists legacy openai as Hybrid; Approve Hybrid sends the GPT letter; Gemini is unchanged", async () => {
  const store = memoryStore();
  const rec = q("LEG1");
  await store.set("aym:q:LEG1", rec);
  const ai = await aiStoreFor(store);
  await ai.setConfig(patchConfig(await ai.getConfig(), { enabled: true, shadowMode: false, compareMode: true, streams: { "pg-entrance": true } }));
  const gemini = side("gemini");
  const openai = side("openai");
  await ai.putDraft({
    id: "q:LEG1", targetType: "question", targetId: "LEG1", ticket: rec.ticket, theme: rec.theme, subtheme: rec.subtheme,
    stream: "pg-entrance", question: rec.question, members: [], memberIds: ["LEG1"], memberCount: 1,
    createdAt: Date.now(), updatedAt: Date.now(),
    aiDraft: { ...gemini, persona: "pg", drafter: "gemini", status: "pending" },
    aiDrafts: { gemini, openai },
  });

  const listed = await op(store, "aiQueue", { status: "open" });
  assert.equal(listed.code, 200);
  const item = listed.body.items.find(i => i.id === "q:LEG1");
  assert.ok(item, JSON.stringify(listed.body));
  assert.ok(item.aiDrafts.hybrid, "queue aliases openai onto hybrid");
  assert.equal(item.aiDrafts.hybrid.answer, openai.answer);
  assert.equal(item.aiDrafts.hybrid.model, "gpt-5.5");
  assert.equal(item.aiDrafts.gemini.answer, gemini.answer, "Gemini draft still present");
  assert.equal(item.aiDrafts.openai.answer, openai.answer, "stored openai key kept");

  const ok = await op(store, "aiApprove", { id: "q:LEG1", provider: "hybrid", reviewer: "Dr Test", mentorName: "Dr Test" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const published = await store.get("aym:q:LEG1");
  assert.equal(published.individualAnswer, openai.answer);
  const after = await ai.getDraft("q:LEG1");
  assert.equal(after.aiDraft.approvedProvider, "hybrid");
  assert.equal(after.aiDrafts.gemini.answer, gemini.answer, "approving Hybrid does not delete Gemini");
  assert.equal(after.aiDrafts.openai.answer, openai.answer);
});
