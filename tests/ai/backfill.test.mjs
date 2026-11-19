/**
 * "Draft existing questions" (aiBackfill): questions submitted before AI drafting was switched on
 * get queued — one job per open merged group — without touching answered / with-mentor /
 * medical / demo records, respecting stream flags, limit, spend cap and idempotency.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig, istDay } from "../../server/ai/config.js";
import { runWorker, invalidateConfigCache } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved } from "../../server/ai/ops.js";
import { backfillDrafts } from "../../server/ai/backfill.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";
const THEME_CLINIC = "Clinical Practice & Integrative Care";
const OLD = Date.now() - 60 * 24 * 3600 * 1000;

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: OLD, name: "Meera Iyer", email: "meera.iyer@gmail.com",
    theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern", ...extra,
  };
}

function ctxFor(log) {
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
  };
}

async function op(store, name, msg = {}, log = { kicks: 0 }) {
  const ctx = ctxFor(log);
  await handleAiOp(name, msg, store, ctx);
  return ctx.out;
}

async function setCfg(store, patch) {
  const ai = await aiStoreFor(store);
  await ai.setConfig(patchConfig(await ai.getConfig(), patch));
  invalidateConfigCache();
}

/** A desk that existed before AI: every question below was saved while AI was off. */
async function seededStore() {
  const store = memoryStore();
  const rows = [
    q("P1", "Who conducts AIAPGET 2026 and what is the application fee?", { createdAt: OLD + 1 }),
    q("P2", "Can BAMS graduates write NEET-PG or only AIAPGET?", { createdAt: OLD + 2 }),
    q("G1", "AIAPGET application fee for general category?", { createdAt: OLD + 3 }),
    q("G2", "AIAPGET fee 2026 for general candidates?", { createdAt: OLD + 4 }),
    q("V1", "How do I become a Medical Officer (Ayurveda) through UPSC or a State PSC?", { theme: "Policy, Public Health & Global Agencies", subtheme: "Government service routes", createdAt: OLD + 5 }),
    q("C1", "What licences do I need to open my own Ayurveda clinic?", { theme: THEME_CLINIC, subtheme: "Setting up private practice", createdAt: OLD + 6 }),
    q("A1", "Is AIAPGET conducted by NTA?", { individualAnswer: "Yes — NTA conducts it.", createdAt: OLD + 7 }),
    q("M1", "My mother has diabetes — which Ayurvedic medicine and dose should she take?", { createdAt: OLD + 8 }),
    q("S1", "What is the AIAPGET internship deadline?", { createdAt: OLD + 9 }),
    q("S2", "AIAPGET internship cut-off date?", { createdAt: OLD + 10 }),
    q("D1", "Which books for AIAPGET?", { email: "demo1@example.com", name: "Demo Student", createdAt: OLD + 11 }),
  ];
  for (const r of rows) await store.set(`aym:q:${r.id}`, r);
  await store.saveClusters([
    { id: "CL-OPEN", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["G1", "G2"], kind: "merged", status: "New", representative: "AIAPGET application fee for general category?" },
    { id: "CL-SENT", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["S1", "S2"], kind: "merged", status: "Sent to mentor", representative: "AIAPGET internship deadline?" },
    { id: "CL-P1", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["P1"], kind: "unique", status: "New", representative: "x" },
  ], 1);
  return store;
}

let provider;
before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  provider = mockProvider();
  setRuntimeForTests({ provider });
  invalidateConfigCache();
});

test("dry run with AI off previews pre-AI questions and writes nothing", async () => {
  const store = await seededStore();
  // Saved while AI was off: the live hook queued nothing.
  assert.equal((await onQuestionSaved(store, await store.get("aym:q:P2"))).queued, false);
  const r = await op(store, "aiBackfill", { dryRun: true, allStreams: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const b = r.body;
  assert.equal(b.dryRun, true);
  assert.equal(b.enabled, false);
  // P1, P2, V1, C1 as questions + one job for CL-OPEN.
  assert.equal(b.eligible, 5, JSON.stringify(b));
  assert.equal(b.eligibleStudents, 6);
  assert.equal(b.skipped.answered, 1);
  assert.equal(b.skipped["with-mentor"], 2);
  assert.equal(b.skipped.medical, 1);
  assert.equal(b.skipped.demo, 1);
  assert.equal(b.skipped["in-group"], 1, "second member of the open group folds into the group job");
  assert.equal(b.enqueued, 0);
  assert.equal(b.sample[0].id, "P1", "oldest first");
  assert.ok(b.spend.estimatedUSD > 0);
  const ai = await aiStoreFor(store);
  assert.equal((await ai.listJobs()).length, 0, "dry run never writes jobs");
});

test("real run refuses while AI is off", async () => {
  const store = await seededStore();
  const r = await op(store, "aiBackfill", { allStreams: true });
  assert.equal(r.code, 409);
  assert.equal(r.body.code, "disabled");
  assert.equal((await (await aiStoreFor(store)).listJobs()).length, 0);
});

test("respects stream toggles; one job per merged group; idempotent; kicks the worker", async () => {
  const store = await seededStore();
  await setCfg(store, { enabled: true, shadowMode: false, streams: { "pg-entrance": true, "govt-jobs": true } });
  const dry = await op(store, "aiBackfill", { dryRun: true });
  assert.equal(dry.body.eligible, 4, JSON.stringify(dry.body));
  assert.equal(dry.body.skipped["stream-off"], 1, "clinic stream is off");
  assert.equal(dry.body.byStream["pg-entrance"], 3);
  assert.equal(dry.body.byStream["govt-jobs"], 1);

  const log = { kicks: 0 };
  const real = await op(store, "aiBackfill", {}, log);
  assert.equal(real.code, 200, JSON.stringify(real.body));
  assert.equal(real.body.enqueued, 4);
  assert.deepEqual(real.body.enqueuedIds.sort(), ["c_CL-OPEN", "q_P1", "q_P2", "q_V1"]);
  assert.equal(log.kicks, 1);
  const ai = await aiStoreFor(store);
  const jobs = await ai.listJobs();
  assert.equal(jobs.length, 4);
  assert.ok(jobs.every(j => j.priority === -1), "backfill sits below live questions");

  const again = await op(store, "aiBackfill", {});
  assert.equal(again.body.enqueued, 0, "re-running never duplicates");
  assert.equal(again.body.skipped.queued, 5, "4 targets queued (the group counts its 2 students)");
  assert.equal((await ai.listJobs()).length, 4);

  const report = await runWorker(store, { minJobMs: 0 });
  assert.equal(report.done, 4, JSON.stringify(report));
  assert.ok(await ai.getDraft("c:CL-OPEN"), "group drafted once");
  assert.equal(await ai.getDraft("q:G1"), null, "members are covered by the group draft");
  const after = await op(store, "aiBackfill", { dryRun: true });
  assert.equal(after.body.eligible, 0);
  assert.equal(after.body.skipped.drafted, 5);
});

test("allStreams ignores stream toggles; limit caps the run, the rest stays eligible", async () => {
  const store = await seededStore();
  await setCfg(store, { enabled: true, streams: {} });
  const off = await op(store, "aiBackfill", { dryRun: true });
  assert.equal(off.body.eligible, 0, "no stream on");
  const r = await op(store, "aiBackfill", { allStreams: true, limit: 2 });
  assert.equal(r.body.enqueued, 2);
  assert.equal(r.body.skipped["over-limit"], 3);
  const next = await op(store, "aiBackfill", { allStreams: true, limit: 50 });
  assert.equal(next.body.enqueued, 3, "the next run picks up the rest");
  assert.ok(next.body.enqueuedIds.includes("q_C1"), "disabled stream drafted with allStreams");
});

test("spend cap reached: nothing is queued", async () => {
  const store = await seededStore();
  await setCfg(store, { enabled: true, dailySpendCapUSD: 1, streams: { "pg-entrance": true } });
  const ai = await aiStoreFor(store);
  await ai.addUsage(istDay(), { costUSD: 1.2, calls: 3 });
  const r = await op(store, "aiBackfill", {});
  assert.equal(r.code, 409);
  assert.equal(r.body.code, "spend-cap");
  assert.equal(r.body.spend.capReached, true);
  assert.equal((await ai.listJobs()).length, 0);
});

test("existing medical draft, finished jobs without a draft, and answered groups", async () => {
  const store = await seededStore();
  await setCfg(store, { enabled: true, streams: { "pg-entrance": true } });
  const ai = await aiStoreFor(store);
  await ai.putDraft({ id: "q:P2", targetType: "question", targetId: "P2", aiDraft: { status: "blocked", blockedReason: "medical" } });
  // P1 was skipped earlier (e.g. while its group was with a mentor) and has no draft.
  await ai.putJob({ id: "q_P1", type: "question", targetId: "P1", status: "skipped", result: "already answered or with a mentor" });
  const meta = await store.getClustersMeta();
  await store.saveClusters(meta.value.map(c => (c.id === "CL-OPEN" ? { ...c, answer: "Mentor answer", status: "Published" } : c)), meta.version);
  const r = await backfillDrafts(store, {});
  assert.equal(r.skipped.medical, 2, JSON.stringify(r));
  assert.equal(r.skipped.answered, 3, "A1 + both answered-group members");
  assert.deepEqual(r.enqueuedIds, ["q_P1"]);
  assert.equal((await ai.getJob("q_P1")).status, "queued");
});

test("redraftScripted: requeues pending OFF_TOPIC scripted drafts; skips approved", async () => {
  const store = memoryStore();
  await setCfg(store, { enabled: true, streams: { "pg-entrance": true, "digital-branding": true } });
  const ai = await aiStoreFor(store);
  const skill = q("SK1", "how can I develop my own application", {
    theme: "Brand Building & Communication",
    subtheme: "Digital presence",
    context: "I dont know anything about coding.",
    createdAt: OLD + 20,
  });
  const sport = q("SP1", "Who will win the IPL final this year?", { createdAt: OLD + 21 });
  const done = q("OK1", "How do I prepare for AIAPGET?", { createdAt: OLD + 22 });
  for (const r of [skill, sport, done]) await store.set(`aym:q:${r.id}`, r);
  await ai.putDraft({
    id: "q:SK1", targetType: "question", targetId: "SK1", stream: "digital-branding", createdAt: OLD + 20,
    aiDraft: { status: "pending", scripted: { templateId: "OFF_TOPIC" }, triage: { category: "OFF_TOPIC", confidence: 0.9 }, answer: "outside that" },
  });
  await ai.putDraft({
    id: "q:SP1", targetType: "question", targetId: "SP1", stream: "pg-entrance", createdAt: OLD + 21,
    aiDraft: { status: "pending", scripted: { templateId: "OFF_TOPIC" }, triage: { category: "OFF_TOPIC", confidence: 0.9 }, answer: "outside that" },
  });
  await ai.putDraft({
    id: "q:OK1", targetType: "question", targetId: "OK1", stream: "pg-entrance", createdAt: OLD + 22,
    aiDraft: { status: "approved", scripted: { templateId: "OFF_TOPIC" }, triage: { category: "OFF_TOPIC", confidence: 0.9 }, answer: "kept" },
  });
  const dry = await op(store, "aiBackfill", { dryRun: true, redraftScripted: true });
  assert.equal(dry.code, 200);
  assert.equal(dry.body.mode, "redraft-scripted");
  assert.equal(dry.body.eligible, 2);
  assert.equal(dry.body.willEnqueue, 2);
  const real = await op(store, "aiBackfill", { redraftScripted: true });
  assert.equal(real.code, 200);
  assert.equal(real.body.enqueued, 2);
  assert.ok(real.body.enqueuedIds.includes("q_SK1"));
  assert.ok(real.body.enqueuedIds.includes("q_SP1"));
  assert.equal((await ai.getJob("q_SK1")).status, "queued");
});
