/**
 * Regressions found in the end-to-end audit (Oct 2026). In-memory store + mock provider, no network.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests, mockProviderRequested } from "../../server/ai/runtime.js";
import { mockAllowed } from "../../server/ai/mockProvider.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, invalidateConfigCache, MAX_ATTEMPTS, JOB_LOCK_MS } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved, dryRunDraft } from "../../server/ai/ops.js";
import { sanitizeClusters } from "../../shared/merge.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera@example.com",
    theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern", ...extra,
  };
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
  await ai.setConfig(patchConfig(await ai.getConfig(), { enabled: true, shadowMode: false, streams: { "pg-entrance": true }, ...patch }));
  invalidateConfigCache();
}

function providerError(code, status) {
  const e = new Error(`gemini ${status}: Gemini API prepaid credits are used up.`);
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

test("mock provider can never be selected on Vercel or in production", () => {
  assert.equal(mockProviderRequested({ AI_PROVIDER: "mock" }), true);
  assert.equal(mockProviderRequested({ AI_PROVIDER: "mock", VERCEL: "1" }), false);
  assert.equal(mockProviderRequested({ AI_PROVIDER: "mock", VERCEL_ENV: "production" }), false);
  assert.equal(mockProviderRequested({ AI_PROVIDER: "mock", NODE_ENV: "production" }), false);
  assert.equal(mockProviderRequested({ AI_PROVIDER: "gemini" }), false);
  assert.equal(mockAllowed({ VERCEL: "1" }), false);
});

test("402 credits depleted: job is kept (no attempt burnt), alert is raised, run stops; recovers after top-up", async () => {
  const store = memoryStore();
  await enable(store);
  for (const id of ["R1", "R2"]) {
    const rec = q(id, "Who conducts AIAPGET 2026 and what is the application fee?");
    await store.set(`aym:q:${id}`, rec);
    await onQuestionSaved(store, rec);
  }
  const failing = mockProvider();
  failing.chat = async () => { throw providerError("credits_depleted", 402); };
  setRuntimeForTests({ provider: failing });
  const r1 = await runWorker(store, { minJobMs: 0 });
  assert.equal(r1.stopped, "provider unavailable");
  assert.equal(r1.failed, 0);
  const ai = await aiStoreFor(store);
  const jobs = await ai.listJobs();
  assert.ok(jobs.every(j => j.status === "queued"), JSON.stringify(jobs.map(j => j.status)));
  assert.ok(jobs.every(j => (j.attempts || 0) === 0), "attempts are not consumed by an account-level failure");
  const cfg = await ai.getConfig();
  assert.equal(cfg.alert.type, "provider");
  assert.match(cfg.alert.message, /credits/i);

  // Staff fixes billing and presses "Process queue": paused jobs become due immediately.
  setRuntimeForTests({ provider: mockProvider() });
  const run = await op(store, "aiRunNow", { wait: true });
  assert.equal(run.code, 200);
  assert.equal(run.body.report.done, 2, JSON.stringify(run.body.report));
  assert.equal((await ai.getConfig()).alert, undefined, "alert clears after a successful draft");
});

test("approve while a regenerate is drafting: the worker never overwrites the approved draft", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("R3", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:R3", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });
  assert.equal((await op(store, "aiRegenerate", { id: "q:R3" })).code, 200);

  const slow = mockProvider();
  const inner = slow.chat.bind(slow);
  slow.chat = async args => {
    if (/strict fact checker/.test(args.system) === false && slow.calls.length === 0) {
      // Official approves the existing draft while the redraft is in flight.
      const ok = await op(store, "aiApprove", { id: "q:R3" });
      assert.equal(ok.code, 200, JSON.stringify(ok.body));
    }
    return inner(args);
  };
  setRuntimeForTests({ provider: slow });
  const report = await runWorker(store, { minJobMs: 0 });
  assert.equal(report.skipped, 1, JSON.stringify(report));
  const ai = await aiStoreFor(store);
  const d = await ai.getDraft("q:R3");
  assert.equal(d.aiDraft.status, "approved");
  assert.ok((await store.get("aym:q:R3")).individualAnswer);
});

test("answered on the briefing board before review: draft leaves Waiting and cannot be approved", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("R4", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:R4", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });
  assert.equal((await op(store, "aiQueue")).body.items.length, 1);
  await store.set("aym:q:R4", { ...rec, individualAnswer: "A mentor wrote this.", individualAt: Date.now() });
  const queue = await op(store, "aiQueue");
  assert.equal(queue.body.items.length, 0);
  assert.equal(queue.body.counts.superseded, 1);
  const all = await op(store, "aiQueue", { status: "all" });
  assert.equal(all.body.items[0].answeredElsewhere, "briefing");
  assert.equal((await op(store, "aiApprove", { id: "q:R4" })).code, 409);
});

test("edit-approving a blocked (medical) question is not labelled AI-assisted", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("R5", "Which Ayurvedic medicine and dose should my mother take for her diabetes?");
  await store.set("aym:q:R5", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });
  const ai = await aiStoreFor(store);
  assert.equal((await ai.getDraft("q:R5")).aiDraft.status, "blocked");
  const r = await op(store, "aiEditApprove", { id: "q:R5", answer: "Please consult a registered Ayurveda physician in person; we cannot advise on treatment here." });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const saved = await store.get("aym:q:R5");
  assert.ok(saved.individualAnswer);
  assert.equal(saved.individualAiAssisted, false);
});

test("leaving shadow mode moves pending shadow drafts into the review queue", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: true });
  const rec = q("R6", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:R6", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });
  assert.equal((await op(store, "aiQueue")).body.items.length, 0, "hidden while in shadow");
  const set = await op(store, "aiConfigSet", { patch: { shadowMode: false } });
  assert.equal(set.body.promoted, 1);
  const queue = await op(store, "aiQueue");
  assert.equal(queue.body.items.length, 1);
  assert.equal(queue.body.items[0].shadow, false);
});

test("a question detached from its merged group gets its own draft on the next sweep", async () => {
  const store = memoryStore();
  await enable(store);
  const a = q("R7", "Who conducts AIAPGET 2026 and what is the application fee?");
  const b = q("R8", "AIAPGET 2026 application fee and conducting body?");
  await store.set("aym:q:R7", a);
  await store.set("aym:q:R8", b);
  await store.saveClusters([{ id: "G1", theme: THEME_PG, subtheme: a.subtheme, memberIds: ["R7", "R8"], kind: "merged", status: "New", representative: a.question }], 1);
  await onQuestionSaved(store, a);
  await onQuestionSaved(store, b);
  await runWorker(store, { minJobMs: 0, forceSweep: true });
  const ai = await aiStoreFor(store);
  assert.equal((await ai.getJob("q_R7")).result, "covered by its merged group's draft");
  // Staff splits the group.
  await store.saveClusters([
    { id: "G1", theme: THEME_PG, memberIds: ["R8"], kind: "unique", status: "New" },
    { id: "G2", theme: THEME_PG, memberIds: ["R7"], kind: "unique", status: "New" },
  ], 2);
  const report = await runWorker(store, { minJobMs: 0, forceSweep: true });
  assert.ok(report.sweep.detached >= 1, JSON.stringify(report.sweep));
  assert.ok(await ai.getDraft("q:R7"), "detached question drafted");
});

test("a job whose worker keeps timing out ends as failed instead of looping", async () => {
  const store = memoryStore();
  await enable(store);
  const ai = await aiStoreFor(store);
  await ai.putJob({ id: "q_R9", type: "question", targetId: "R9", status: "running", attempts: MAX_ATTEMPTS, lockedUntil: Date.now() - JOB_LOCK_MS, nextAt: 0, createdAt: 0 });
  await runWorker(store, { minJobMs: 0 });
  assert.equal((await ai.getJob("q_R9")).status, "failed");
});

test("regenerating flag only shows while its job is still queued", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("R10", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:R10", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });
  await op(store, "aiRegenerate", { id: "q:R10" });
  assert.equal((await op(store, "aiQueue")).body.items[0].regenerating, true);
  const ai = await aiStoreFor(store);
  const job = await ai.getJob("q_R10");
  await ai.putJob({ ...job, status: "failed" });
  assert.equal((await op(store, "aiQueue")).body.items[0].regenerating, false);
});

test("raising the spend cap clears the 'cap reached' banner", async () => {
  const store = memoryStore();
  await enable(store, { dailySpendCapUSD: 0 });
  const rec = q("R11", "Who conducts AIAPGET 2026?");
  await store.set("aym:q:R11", rec);
  await onQuestionSaved(store, rec);
  const r = await runWorker(store, { minJobMs: 0 });
  assert.equal(r.stopped, "spend cap");
  const ai = await aiStoreFor(store);
  assert.equal((await ai.getConfig()).alert.type, "spend-cap");
  await op(store, "aiConfigSet", { patch: { dailySpendCapUSD: 5 } });
  assert.equal((await ai.getConfig()).alert, undefined);
});

test("dry run on depleted credits returns a friendly error with a code (no crash)", async () => {
  const store = memoryStore();
  const failing = mockProvider();
  failing.chat = async () => { throw providerError("credits_depleted", 402); };
  setRuntimeForTests({ provider: failing });
  const r = await dryRunDraft(store, { question: "Who conducts AIAPGET 2026 and what is the application fee?", theme: THEME_PG, subtheme: "Choosing a PG branch" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "credits_depleted");
  assert.match(r.error, /^The AI provider failed: Gemini API prepaid credits/);
});

test("clearing a group's answer drops its AI-assisted note", () => {
  const { clusters } = sanitizeClusters([
    { id: "G1", memberIds: ["a", "b"], kind: "merged", answer: "", aiAssisted: true },
    { id: "G2", memberIds: ["c", "d"], kind: "merged", answer: "Kept", aiAssisted: true },
  ]);
  assert.equal(clusters[0].aiAssisted, undefined);
  assert.equal(clusters[1].aiAssisted, true);
});
