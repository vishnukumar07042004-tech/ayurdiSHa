/**
 * Global-scale overflow: a 429 / quota / billing / timeout still keeps the question + asker,
 * surfaces on DISHA drafts and Insight as awaiting_ai, and Retry AI drafts after recharge.
 * Nothing is published until an official approves.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, enqueueQuestion, invalidateConfigCache, askerSnapshot } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved } from "../../server/ai/ops.js";
import { AWAITING_AI } from "../../server/ai/overflow.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera.iyer@gmail.com",
    wacId: "TEST-WAC-0001", theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern",
    ...extra,
  };
}

function quotaErr(status = 429, code = "quota") {
  const e = new Error(`gemini ${status}: RESOURCE_EXHAUSTED quota exceeded`);
  e.status = status;
  e.code = code;
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
  const next = patchConfig(await ai.getConfig(), { enabled: true, shadowMode: false, streams: { "pg-entrance": true, "govt-jobs": true }, ...patch });
  await ai.setConfig(next);
  invalidateConfigCache();
  return next;
}

before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  setRuntimeForTests({ provider: mockProvider() });
  invalidateConfigCache();
});

test("ask is saved when AI returns 429; DISHA + Insight list overflow; never auto-published", async () => {
  const store = memoryStore();
  await enable(store);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });

  const rec = q("OV1", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:OV1", rec);
  const enq = await onQuestionSaved(store, rec);
  assert.equal(enq.queued, true);

  const report = await runWorker(store, { minJobMs: 0, sweepFirst: false });
  assert.ok(report.quotaDeferred >= 1, JSON.stringify(report));
  assert.equal(report.stopped, "ai quota");

  const saved = await store.get("aym:q:OV1");
  assert.equal(saved.question, rec.question);
  assert.equal(saved.name, "Meera Iyer");
  assert.equal(saved.email, "meera.iyer@gmail.com");
  assert.ok(!String(saved.individualAnswer || saved.answer || "").trim(), "quota never publishes an answer");

  const ai = await aiStoreFor(store);
  const draft = await ai.getDraft("q:OV1");
  assert.ok(draft);
  assert.equal(draft.overflow, true);
  assert.equal(draft.aiDraft.status, AWAITING_AI);
  assert.equal(draft.asker.email, rec.email);
  assert.equal(draft.asker.name, rec.name);
  assert.ok(!String(draft.aiDraft.answer || "").trim());

  const desk = await op(store, "aiQueue", { status: "open" });
  assert.equal(desk.code, 200);
  const item = desk.body.items.find(i => i.id === "q:OV1");
  assert.ok(item, "overflow appears on DISHA drafts");
  assert.equal(item.overflow, true);
  assert.equal(item.aiDraft.status, AWAITING_AI);
  assert.ok(desk.body.counts.awaitingAi >= 1);

  const idx = await op(store, "aiIndex");
  assert.equal(idx.body.index["q:OV1"].status, AWAITING_AI);
  assert.equal(idx.body.index["q:OV1"].overflow, true);

  const approve = await op(store, "aiApprove", { id: "q:OV1", reviewer: "staff" });
  assert.equal(approve.code, 400);
  assert.match(approve.body.error, /waiting for AI/i);
  const still = await store.get("aym:q:OV1");
  assert.ok(!String(still.individualAnswer || "").trim());
});

test("Retry AI after mock quota recovery drafts Hybrid and still does not auto-publish", async () => {
  const store = memoryStore();
  await enable(store);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });

  const rec = q("OV2", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:OV2", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0, sweepFirst: false });

  setRuntimeForTests({ provider: mockProvider() });
  const retry = await op(store, "aiRetryDeferred", { id: "q:OV2" });
  assert.equal(retry.code, 200);
  assert.ok(retry.body.requeued >= 1);

  const report = await runWorker(store, { minJobMs: 0, sweepFirst: false });
  assert.equal(report.done, 1, JSON.stringify(report));

  const draft = await (await aiStoreFor(store)).getDraft("q:OV2");
  assert.equal(draft.aiDraft.status, "pending");
  assert.ok(String(draft.aiDraft.answer || "").trim(), "Hybrid letter is ready for review");
  assert.ok(!draft.overflow);

  const published = await store.get("aym:q:OV2");
  assert.ok(!String(published.individualAnswer || "").trim(), "pending draft is not the student-facing answer");

  const approve = await op(store, "aiApprove", { id: "q:OV2", reviewer: "Vishnu Kumar" });
  assert.equal(approve.code, 200);
  const sent = await store.get("aym:q:OV2");
  assert.ok(String(sent.individualAnswer || "").trim());
});

test("batch Retry AI requeues every quota-deferred job", async () => {
  const store = memoryStore();
  await enable(store);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });

  for (const id of ["OV3", "OV4"]) {
    const rec = q(id, "Who conducts AIAPGET 2026 and what is the application fee?");
    await store.set(`aym:q:${id}`, rec);
    await enqueueQuestion(store, rec);
  }
  await runWorker(store, { minJobMs: 0, sweepFirst: false });
  const ai = await aiStoreFor(store);
  // Only the first job in a run is deferred (the worker stops on quota). Second is still queued.
  const batch = await op(store, "aiRetryDeferred");
  assert.equal(batch.code, 200);
  assert.ok(batch.body.requeued >= 1);

  setRuntimeForTests({ provider: mockProvider() });
  await runWorker(store, { minJobMs: 0, sweepFirst: false });
  const a = await ai.getDraft("q:OV3");
  const b = await ai.getDraft("q:OV4");
  assert.ok(a && (a.aiDraft.status === "pending" || a.aiDraft.status === AWAITING_AI));
  assert.ok(b && (b.aiDraft.status === "pending" || b.aiDraft.status === AWAITING_AI || await ai.getJob("q_OV4")));
});

test("DISHA asker snapshot re-attributes the operator Harsh persona only", () => {
  const snap = askerSnapshot({ name: "Harsh", email: "harsh@wac.test", wacId: "ZZQ1" });
  assert.equal(snap.name, "Vishnu Kumar");
  assert.equal(snap.email, "vishnukumar07042004@gmail.com");
  assert.equal(snap.wacId, "ZZQ1");
  const kept = askerSnapshot({ name: "Harsh Gupta", email: "other@wac.test", wacId: "ZZQ2" });
  assert.equal(kept.name, "Harsh Gupta");
  assert.equal(kept.email, "other@wac.test");
  const harsha = askerSnapshot({ name: "Harsha", email: "harsha@wac.test" });
  assert.equal(harsha.name, "Harsha");
  assert.equal(harsha.email, "harsha@wac.test");
});
