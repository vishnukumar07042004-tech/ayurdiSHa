/**
 * When Gemini/GPT hit 429, quota, billing or timeout: the question and asker stay saved,
 * DISHA lists a queued Hybrid job, Insights index marks awaiting_ai, staff retry after
 * recharge still never auto-publishes.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, invalidateConfigCache } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved } from "../../server/ai/ops.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(),
    name: "Meera Iyer", email: "meera.iyer@gmail.com", wacId: "BHA10101",
    theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern",
    ...extra,
  };
}

function ctxFor(store, log = {}) {
  log.kicks = 0;
  return {
    out: null,
    send(code, body) { this.out = { code, body }; },
    clustersMeta: s => s.getClustersMeta(),
    persistClusters: (s, clusters, v) => s.saveClusters(clusters, v),
    ClustersVersionConflictError,
    sendClustersConflict(v) { this.out = { code: 409, body: { conflict: true, clustersVersion: v } }; },
    notifyAnswerOnce: async () => null,
    notifyNewlyPublishedClusters: async () => {},
    kickWorker: () => { log.kicks++; },
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
    enabled: true, shadowMode: false, streams: { "pg-entrance": true, "govt-jobs": true }, ...patch,
  });
  await ai.setConfig(next);
  invalidateConfigCache();
  return next;
}

function quotaErr(status = 429, code = "quota") {
  const e = new Error(`openai ${status}: You exceeded your current quota`);
  e.code = code;
  e.status = status;
  return e;
}

before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  setRuntimeForTests({ provider: mockProvider() });
  invalidateConfigCache();
});

test("429 / quota: question and asker stay saved; Hybrid is queued, never published", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("QD1", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:QD1", rec);
  assert.equal((await onQuestionSaved(store, rec)).queued, true);

  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });
  const report = await runWorker(store, { minJobMs: 0 });
  assert.equal(report.stopped, "ai quota");
  assert.ok((report.quotaDeferred || 0) >= 1);
  assert.equal(report.failed, 0);

  const saved = await store.get("aym:q:QD1");
  assert.equal(saved.question, rec.question);
  assert.equal(saved.name, "Meera Iyer");
  assert.equal(saved.email, "meera.iyer@gmail.com");
  assert.equal(saved.wacId, "BHA10101");
  assert.equal(saved.individualAnswer, undefined, "worker never writes the student-facing answer");
  assert.equal(saved.age, undefined);
  assert.equal(saved.sex, undefined);

  const ai = await aiStoreFor(store);
  const jobs = await ai.listJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "queued");
  assert.equal(jobs[0].deferClass, "quotaDeferred");
  assert.match(String(jobs[0].deferReason || jobs[0].error), /quota|rate limit/i);
  assert.ok(!/sk-|AIza|re_/.test(JSON.stringify(jobs[0])), "no keys in the job");

  const draft = await ai.getDraft("q:QD1");
  assert.ok(draft && draft.overflow);
  assert.equal(draft.aiDraft.status, "awaiting_ai");
  assert.equal(draft.asker.name, "Meera Iyer");
  assert.equal(draft.asker.email, "meera.iyer@gmail.com");
  assert.equal(draft.asker.wacId, "BHA10101");
  assert.equal(draft.asker.org, undefined, "WAC org only with share consent");

  const desk = await op(store, "aiQueue", {});
  assert.equal(desk.code, 200);
  assert.ok(desk.body.counts.quotaDeferred >= 1);
  const item = desk.body.items.find(i => i.targetId === "QD1" || i.id === "q:QD1");
  assert.ok(item, "DISHA drafts lists the deferred job");
  assert.ok(item.overflow || item.quotaDeferred || item.aiDraft.status === "awaiting_ai");
  assert.ok(desk.body.deferred.some(j => j.deferClass === "quotaDeferred" || j.id === jobs[0].id));

  const index = await op(store, "aiIndex", {});
  assert.equal(index.body.index["q:QD1"].overflow, true);
  assert.ok(["awaiting_ai", "quotaDeferred", "aiPending"].includes(index.body.index["q:QD1"].status));

  const approve = await op(store, "aiApprove", { id: "q:QD1", mentorName: "Dr. A. Sharma" });
  assert.equal(approve.code, 400, "placeholder drafts cannot be approved as-is");
  assert.equal((await store.get("aym:q:QD1")).individualAnswer, undefined, "never auto-published");
});

test("staff retry after recharge: Hybrid drafts, still unpublished until approve", async () => {
  const store = memoryStore();
  const kicks = { n: 0 };
  await enable(store);
  const rec = q("QD2", "Can BAMS graduates write NEET-PG or only AIAPGET?");
  await store.set("aym:q:QD2", rec);
  await onQuestionSaved(store, rec);
  const failing = mockProvider();
  failing.chat = async () => { throw quotaErr(); };
  setRuntimeForTests({ provider: failing });
  await runWorker(store, { minJobMs: 0 });

  const ctx = ctxFor(store, kicks);
  setRuntimeForTests({ provider: mockProvider() });
  await handleAiOp("aiRetryDeferred", {}, store, ctx);
  assert.equal(ctx.out.code, 200);
  assert.ok(ctx.out.body.requeued >= 1);
  assert.ok(kicks.kicks >= 1);

  const afterRetry = await runWorker(store, { minJobMs: 0, forceSweep: true });
  assert.ok(afterRetry.done >= 1, JSON.stringify(afterRetry));
  const d = await (await aiStoreFor(store)).getDraft("q:QD2");
  assert.equal(d.aiDraft.status, "pending");
  assert.ok(String(d.aiDraft.answer || "").length > 20);
  assert.equal((await store.get("aym:q:QD2")).individualAnswer, undefined, "still unpublished");

  const ok = await op(store, "aiApprove", { id: "q:QD2", mentorName: "Dr. A. Sharma" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.ok((await store.get("aym:q:QD2")).individualAnswer.length > 20);
});

test("timeout is quota-deferred the same way; extra WAC org only with share consent", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("QD3", "Who conducts AIAPGET 2026 and what is the application fee?", {
    wacShareConsent: true,
    wac: { institution: "Example Ayurveda College", category: "delegate", country: "India", state: "Odisha" },
  });
  await store.set("aym:q:QD3", rec);
  await onQuestionSaved(store, rec);
  const failing = mockProvider();
  failing.chat = async () => {
    const e = new Error("gemini timeout");
    e.code = "timeout";
    throw e;
  };
  setRuntimeForTests({ provider: failing });
  const report = await runWorker(store, { minJobMs: 0 });
  assert.equal(report.stopped, "ai quota");
  const d = await (await aiStoreFor(store)).getDraft("q:QD3");
  assert.equal(d.asker.org.institution, "Example Ayurveda College");
  assert.equal(d.asker.org.state, "Odisha");
});
