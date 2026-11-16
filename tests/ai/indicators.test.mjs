/**
 * Indicator truth: Insight/DISHA/Track chips must match store state.
 * Overflow only while awaiting AI; a pending Hybrid letter clears false quota.
 * repairHybridDraftSlots must not stamp "Hybrid missing" while a Hybrid follow-up is queued.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests, hybridProvider } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, enqueueQuestion, invalidateConfigCache, repairHybridDraftSlots } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved, annotateLookupHits } from "../../server/ai/ops.js";
import { AWAITING_AI, isOverflowDraft } from "../../server/ai/overflow.js";
import { ensureHybridSide } from "../../server/ai/compare.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";
const THEME_PG = "Academics, Teaching & Higher Education";

/** Mirror src/TrackAnswer.jsx trackStatusOf (no JSX import in node:test). */
function trackStatusOf(s) {
  const c = s && s.cluster;
  const merged = Boolean(c && String(c.answer || "").trim());
  const individual = Boolean(String(s && s.individualAnswer || "").trim());
  const published = merged && String(c.status || "").toLowerCase() === "published";
  if (published) return { label: "On the stage", tone: "green" };
  if (merged || individual) return { label: "Answered", tone: "green" };
  if (s && s.reviewStage === "review") return { label: "Being reviewed by the desk", tone: "gold" };
  if (c) return { label: "With mentor", tone: "gold" };
  return { label: "Received", tone: "grey" };
}

/** Mirror src/staff/AiReviewDesk.jsx isOverflowItem. */
function isOverflowItem(item) {
  if (!item) return false;
  const s = item.aiDraft && item.aiDraft.status;
  if (s === "awaiting_ai" || s === "quotaDeferred" || s === "aiPending") return true;
  if (s === "pending" || s === "blocked" || s === "to-mentor" || s === "approved" || s === "edited") return false;
  return Boolean(item.overflow || item.quotaDeferred || item.pendingDraft);
}

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera.iyer@gmail.com",
    wacId: "TEST-WAC-0001", theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern",
    ...extra,
  };
}

function quotaErr() {
  const e = new Error("gemini 429: RESOURCE_EXHAUSTED quota exceeded");
  e.status = 429;
  e.code = "quota";
  return e;
}

function ctxFor(store) {
  return {
    out: null,
    send(code, body) { this.out = { code, body }; },
    clustersMeta: s => s.getClustersMeta(),
    persistClusters: (s, clusters, v) => s.saveClusters(clusters, v),
    ClustersVersionConflictError,
    sendClustersConflict(v) { this.out = { code: 409, body: { conflict: true, clustersVersion: v } }; },
    notifyAnswerOnce: async () => null,
    notifyNewlyPublishedClusters: async () => {},
    kickWorker: () => {},
    runWorker: opts => runWorker(store, opts),
  };
}

async function op(store, name, msg = {}) {
  const ctx = ctxFor(store);
  await handleAiOp(name, msg, store, ctx);
  return ctx.out;
}

async function enable(store, patch = {}) {
  const ai = await aiStoreFor(store);
  const next = patchConfig(await ai.getConfig(), {
    enabled: true, shadowMode: false, compareMode: true, primary: "hybrid",
    streams: { "pg-entrance": true, "govt-jobs": true }, ...patch,
  });
  await ai.setConfig(next);
  invalidateConfigCache();
  return next;
}

function fastGpt() {
  const p = mockProvider({ model: "mock-gpt" });
  const chat = p.chat.bind(p);
  p.chat = async args => {
    const out = await chat(args);
    if (out && out.json && typeof out.json === "object") out.json.answer = out.json.answer || "GPT hybrid letter for the desk.";
    return out;
  };
  return p;
}

before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  setRuntimeForTests({ provider: mockProvider() });
  invalidateConfigCache();
});

test("stuck overflow flag on a pending letter is not Waiting for AI", () => {
  const stuck = {
    id: "q:STUCK", overflow: true, overflowReason: "quota_exceeded",
    aiDraft: { status: "pending", answer: "A real Hybrid letter after recharge.", risk: "low" },
    aiDrafts: { hybrid: { status: "pending", answer: "A real Hybrid letter after recharge." }, gemini: { status: "pending", answer: "Gem." } },
  };
  assert.equal(isOverflowDraft(stuck), false);
  assert.equal(isOverflowItem(stuck), false);

  const waiting = {
    id: "q:WAIT", overflow: true,
    aiDraft: { status: AWAITING_AI, answer: "", blockedNote: "Waiting for AI / quota — retry after recharge." },
  };
  assert.equal(isOverflowDraft(waiting), true);
  assert.equal(isOverflowItem(waiting), true);
});

test("aiIndex: pending letter clears false quota; overflow still defers correctly", async () => {
  const store = memoryStore();
  await enable(store);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });

  const rec = q("IND1", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:IND1", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0, sweepFirst: false });

  let idx = await op(store, "aiIndex");
  assert.equal(idx.body.index["q:IND1"].status, AWAITING_AI);
  assert.equal(idx.body.index["q:IND1"].overflow, true);

  const openai = fastGpt();
  const gemini = mockProvider();
  setRuntimeForTests({ provider: gemini, providers: { openai, hybrid: hybridProvider(gemini, openai, { minFallbackMs: 50 }) } });
  const retry = await op(store, "aiRetryDeferred", { id: "q:IND1" });
  assert.equal(retry.code, 200);
  const report = await runWorker(store, { minJobMs: 0, sweepFirst: false });
  assert.ok(report.done >= 1, JSON.stringify(report));

  const draft = await (await aiStoreFor(store)).getDraft("q:IND1");
  assert.equal(draft.aiDraft.status, "pending");
  assert.ok(String(draft.aiDraft.answer || "").trim());
  assert.ok(!draft.overflow, "successful draft must not keep overflow");
  assert.ok(draft.aiDrafts && (draft.aiDrafts.hybrid || draft.aiDrafts.gemini), "compare sides present");

  idx = await op(store, "aiIndex");
  assert.equal(idx.body.index["q:IND1"].status, "pending");
  assert.ok(!idx.body.index["q:IND1"].overflow, "Insight chip must not say Waiting for AI");

  const hits = await annotateLookupHits(store, [{ id: "IND1", individualAnswer: "" }]);
  assert.equal(hits[0].reviewStage, "review");
  assert.equal(trackStatusOf(hits[0]).label, "Being reviewed by the desk");

  const published = await store.get("aym:q:IND1");
  assert.ok(!String(published.individualAnswer || "").trim(), "never auto-publish");
});

test("repairHybridDraftSlots: queued Hybrid follow-up is not stamped missing", async () => {
  const store = memoryStore();
  const ai = await aiStoreFor(store);
  await ai.putDraft({
    id: "q:REP1", targetType: "question", targetId: "REP1",
    aiDraft: { status: "pending", answer: "Gem letter", drafter: "gemini" },
    aiDrafts: { gemini: { provider: "gemini", status: "pending", answer: "Gem letter" } },
    updatedAt: Date.now(), createdAt: Date.now(),
  });
  await ai.putJob({
    id: "q_REP1", type: "question", targetId: "REP1", status: "queued",
    only: "hybrid", nextAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
  });
  const n = await repairHybridDraftSlots(ai);
  const d = await ai.getDraft("q:REP1");
  assert.equal(n, 0, "must not rewrite while Hybrid is queued");
  assert.equal(d.aiDrafts.hybrid, undefined, "no false Hybrid error persisted");
  const deskView = ensureHybridSide(d.aiDrafts, { pending: true });
  assert.equal(deskView.hybrid, undefined);
});

test("429 still defers with awaiting_ai and never publishes", async () => {
  const store = memoryStore();
  await enable(store);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });
  const rec = q("IND2", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:IND2", rec);
  await enqueueQuestion(store, rec);
  const report = await runWorker(store, { minJobMs: 0, sweepFirst: false });
  assert.ok(report.quotaDeferred >= 1);
  const draft = await (await aiStoreFor(store)).getDraft("q:IND2");
  assert.equal(draft.aiDraft.status, AWAITING_AI);
  assert.equal(isOverflowDraft(draft), true);
  assert.ok(!String((await store.get("aym:q:IND2")).individualAnswer || "").trim());
});
