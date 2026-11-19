/**
 * Queue → worker → review desk → existing answer fields, on an in-memory store with a mock
 * provider. Covers: AI off = zero behaviour change, per-stream flags, shadow mode, PII never sent,
 * medical routing, insufficient sources, approval through individual* / cluster fields with the
 * clusters version, edit diffs, rejects, reuse, retries, spend cap.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, enqueueQuestion, invalidateConfigCache, MAX_ATTEMPTS } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved, annotateLookupHits } from "../../server/ai/ops.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";
const THEME_CLINIC = "Clinical Practice & Integrative Care";

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera.iyer@gmail.com",
    regNo: "11WAC/2026/0101", theme: THEME_PG, subtheme: "Choosing a PG branch", question, context: "", stage: "Intern",
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
  const next = patchConfig(await ai.getConfig(), { enabled: true, streams: { "pg-entrance": true, "govt-jobs": true }, ...patch });
  await ai.setConfig(next);
  invalidateConfigCache();
  return next;
}

let provider;

before(() => {
  setAllowListForTests(ALLOW);
});

beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  provider = mockProvider();
  setRuntimeForTests({ provider });
  invalidateConfigCache();
});

test("AI off (default): nothing is queued, worker does nothing, Track unchanged", async () => {
  const store = memoryStore();
  const rec = q("Q1", "How should I prepare for AIAPGET 2026?");
  await store.set("aym:q:Q1", rec);
  const r = await onQuestionSaved(store, rec);
  assert.equal(r.queued, false);
  const report = await runWorker(store);
  assert.equal(report.stopped, "disabled");
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(Object.keys(store.db).filter(k => k.startsWith("aym:ai:job:") || k.startsWith("aym:ai:draft:")), []);
  const hits = await annotateLookupHits(store, [{ id: "Q1", individualAnswer: "" }]);
  assert.equal(hits[0].reviewStage, undefined);
});

test("per-stream flags: only enabled streams queue; enqueue is idempotent", async () => {
  const store = memoryStore();
  await enable(store);
  const pg = q("Q2", "What is the AIAPGET application fee this year?");
  const clinic = q("Q3", "What licences do I need to open a clinic?", { theme: THEME_CLINIC, subtheme: "Setting up private practice" });
  assert.equal((await onQuestionSaved(store, pg)).queued, true);
  assert.equal((await onQuestionSaved(store, pg)).queued, false, "second enqueue is a no-op");
  const off = await enqueueQuestion(store, clinic);
  assert.equal(off.queued, false);
  assert.equal(off.reason, "stream-off");
});

test("worker: shadow draft with citations, claim checks; no PII reaches the provider; hidden from default queue", async () => {
  const store = memoryStore();
  await enable(store);
  const rec = q("Q4", "Hi, my name is Meera Iyer (meera.iyer@gmail.com, 9876543210). What is the AIAPGET 2026 application fee and who conducts it?");
  await store.set("aym:q:Q4", rec);
  await onQuestionSaved(store, rec);
  const report = await runWorker(store, { minJobMs: 0 });
  assert.equal(report.done, 1, JSON.stringify(report));
  const sent = JSON.stringify(provider.calls);
  for (const pii of ["Meera", "Iyer", "meera.iyer@gmail.com", "9876543210", "11WAC/2026/0101", "AYM-Q-Q4"]) {
    assert.ok(!sent.includes(pii), `${pii} must never be sent to the provider`);
  }
  const ai = await aiStoreFor(store);
  const d = await ai.getDraft("q:Q4");
  assert.equal(d.aiDraft.status, "pending");
  assert.equal(d.shadow, true);
  assert.ok(d.aiDraft.citations.some(c => c.chunkId === "nta-aiapget-2026-1" && c.authority === "regulator" && c.url.includes("nta.ac.in")));
  assert.ok(d.aiDraft.claimChecks.length > 0);
  assert.ok(["low", "medium", "high"].includes(d.aiDraft.risk));
  assert.ok(d.aiDraft.confidence >= 0 && d.aiDraft.confidence <= 1);
  assert.ok(d.aiDraft.usage.calls >= 2, "draft + verify calls");

  const def = await op(store, "aiQueue", {});
  assert.equal(def.body.items.length, 0, "shadow drafts are hidden by default");
  assert.equal(def.body.counts.shadow, 1);
  const shadow = await op(store, "aiQueue", { shadow: true });
  assert.equal(shadow.body.items.length, 1);
  const hits = await annotateLookupHits(store, [{ id: "Q4", individualAnswer: "" }]);
  assert.equal(hits[0].reviewStage, undefined, "shadow drafts are not 'being reviewed'");
});

test("review: approve writes the existing individual* fields; Track sees it as AI-assisted only after approval", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: false });
  const rec = q("Q5", "Can BAMS graduates write NEET-PG or only AIAPGET?");
  await store.set("aym:q:Q5", rec);
  await onQuestionSaved(store, rec);
  await runWorker(store, { minJobMs: 0 });

  const before = await store.get("aym:q:Q5");
  assert.equal(before.individualAnswer, undefined, "the worker never writes to the question");
  const hits = await annotateLookupHits(store, [{ id: "Q5", individualAnswer: "" }]);
  assert.equal(hits[0].reviewStage, "review");

  const queue = await op(store, "aiQueue", {});
  assert.equal(queue.body.items.length, 1);
  const item = queue.body.items[0];
  const ok = await op(store, "aiApprove", { id: item.id, mentorName: "Dr. A. Sharma", reviewer: "desk-1" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const after = await store.get("aym:q:Q5");
  assert.ok(after.individualAnswer.length > 20);
  assert.ok(!/\[c:/.test(after.individualAnswer), "citation markers are stripped for students");
  assert.equal(after.individualMentor, "Dr. A. Sharma");
  assert.equal(after.individualActions.length, 3);
  assert.ok(after.individualResources.every(r => / — https:\/\//.test(r)), JSON.stringify(after.individualResources));
  assert.equal(after.individualAiAssisted, true);
  assert.ok(after.individualAt > 0);

  const again = await op(store, "aiApprove", { id: item.id });
  assert.equal(again.code, 409);
  const ai = await aiStoreFor(store);
  const bank = await ai.listBank();
  assert.equal(bank.length, 1);
  assert.equal(bank[0].targetId, "Q5");
});

test("review: edit then send stores an edit diff; reject needs a reason; send to mentor", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: false });
  for (const [id, text] of [["Q6", "Who conducts AIAPGET 2026 and what is the fee?"], ["Q7", "What is the AIAPGET internship deadline in 2026?"], ["Q8", "Is AIAPGET conducted by NTA?"]]) {
    const rec = q(id, text);
    await store.set(`aym:q:${id}`, rec);
    await onQuestionSaved(store, rec);
  }
  await runWorker(store, { minJobMs: 0 });
  const edited = await op(store, "aiEditApprove", {
    id: "q:Q6",
    answer: "AIAPGET 2026 is conducted by NTA. Check the official bulletin for the current fee before you apply.",
    actions: ["Read the bulletin", "Plan", "Apply early"],
    mistake: "Trusting blogs.",
    resources: [{ title: "AIAPGET bulletin", url: "https://exams.nta.ac.in/AIAPGET/notice-2026" }],
  });
  assert.equal(edited.code, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.item.aiDraft.status, "edited");
  assert.ok(edited.body.item.aiDraft.editDiff.ratio > 0);
  assert.ok(edited.body.item.aiDraft.editDiff.changed.includes("answer"));
  assert.equal((await store.get("aym:q:Q6")).individualAnswer.startsWith("AIAPGET 2026 is conducted by NTA."), true);

  assert.equal((await op(store, "aiReject", { id: "q:Q7" })).code, 400);
  const rej = await op(store, "aiReject", { id: "q:Q7", reason: "Wrong deadline year", tag: "outdated" });
  assert.equal(rej.body.item.aiDraft.status, "rejected");
  assert.equal((await store.get("aym:q:Q7")).individualAnswer, undefined, "rejected drafts never reach Track");

  const mentor = await op(store, "aiSendToMentor", { id: "q:Q8" });
  assert.equal(mentor.body.item.aiDraft.status, "to-mentor");

  const stats = await op(store, "aiStats");
  assert.equal(stats.body.stats.totals.edited, 1);
  assert.equal(stats.body.stats.totals.rejected, 1);
  assert.equal(stats.body.stats.totals.toMentor, 1);
  assert.equal(stats.body.stats.topRejectReasons[0].reason, "outdated");
  assert.ok(stats.body.stats.spend.todayUSD > 0);
});

test("medical questions are blocked before any provider call; insufficient sources become a mentor-assist draft, not a guess", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: false, streams: { "pg-entrance": true } });
  const med = q("Q9", "My mother has diabetes, which Ayurvedic medicine should she take before AIAPGET?");
  const none = q("Q10", "Which PG branch suits someone who loves yoga philosophy and Sanskrit poetry?");
  for (const r of [med, none]) { await store.set(`aym:q:${r.id}`, r); await onQuestionSaved(store, r); }
  await runWorker(store, { minJobMs: 0 });
  const ai = await aiStoreFor(store);
  const dm = await ai.getDraft("q:Q9");
  assert.equal(dm.aiDraft.status, "blocked");
  assert.equal(dm.aiDraft.blockedReason, "medical");
  assert.equal(dm.aiDraft.answer, "");
  const dn = await ai.getDraft("q:Q10");
  assert.equal(dn.aiDraft.status, "pending");
  assert.equal(dn.aiDraft.mode, "mentor-assist");
  assert.equal(dn.aiDraft.risk, "high");
  assert.ok(!/\d/.test(dn.aiDraft.answer), "no unsourced numbers");
  assert.ok(!JSON.stringify(provider.calls).includes("diabetes"), "medical text never sent");
  assert.ok(provider.calls.every(c => !/Ayurvedic medicine/.test(c.messages[0].content)), "only the career question reached the provider");
  assert.equal((await op(store, "aiApprove", { id: "q:Q9" })).code, 400, "blocked drafts cannot be approved as-is");
});

test("merged groups: one draft per cluster, approval via cluster fields + version, membership guard", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: false });
  const a = q("Q11", "Who conducts AIAPGET and what is the application fee?");
  const b = q("Q12", "AIAPGET application fee for general category?");
  const c = q("Q13", "AIAPGET fee 2026 for general candidates?");
  for (const r of [a, b, c]) await store.set(`aym:q:${r.id}`, r);
  await store.saveClusters([
    { id: "CL-1", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["Q11", "Q12"], kind: "merged", status: "New", representative: a.question },
    { id: "CL-2", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["Q13"], kind: "unique", status: "New", representative: c.question },
  ], 1);
  const report = await runWorker(store, { minJobMs: 0, forceSweep: true });
  assert.ok(report.sweep.clusters >= 1, JSON.stringify(report));
  const ai = await aiStoreFor(store);
  const d = await ai.getDraft("c:CL-1");
  assert.ok(d, "merged group drafted");
  assert.equal(d.memberCount, 2);
  assert.equal(await ai.getDraft("c:CL-2"), null, "singletons are drafted as questions, not groups");

  const queue = await op(store, "aiQueue", {});
  const group = queue.body.items.find(i => i.id === "c:CL-1");
  assert.equal(group.memberCount, 2);
  assert.equal(queue.body.items.find(i => i.id === "q:Q11"), undefined, "members of an open group are covered by the group draft");
  assert.ok(await ai.getDraft("q:Q13"), "the singleton is drafted as a question");

  const v0 = (await store.getClustersMeta()).version;
  const ok = await op(store, "aiApprove", { id: "c:CL-1", mentorName: "Dr. Rao" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const meta = await store.getClustersMeta();
  assert.equal(meta.version, v0 + 1, "clusters version bumped like any curation save");
  const cl = meta.value.find(x => x.id === "CL-1");
  assert.ok(cl.answer && !/\[c:/.test(cl.answer));
  assert.equal(cl.status, "Published");
  assert.equal(cl.mentorName, "Dr. Rao");
  assert.equal(cl.aiAssisted, true);
  assert.equal((await op(store, "aiApprove", { id: "c:CL-1" })).code, 409, "approved answers are never overwritten");

  // A new group whose membership then changes must be regenerated before approval.
  const e = q("Q14", "Who conducts AIAPGET 2026?");
  const f = q("Q15", "Which agency conducts AIAPGET 2026?");
  for (const r of [e, f]) await store.set(`aym:q:${r.id}`, r);
  const m1 = await store.getClustersMeta();
  await store.saveClusters([...m1.value, { id: "CL-3", theme: THEME_PG, memberIds: ["Q14", "Q15"], kind: "merged", status: "New", representative: e.question }], m1.version);
  await runWorker(store, { minJobMs: 0, forceSweep: true });
  assert.ok(await ai.getDraft("c:CL-3"));
  const m2 = await store.getClustersMeta();
  await store.saveClusters(m2.value.map(x => (x.id === "CL-3" ? { ...x, memberIds: ["Q14", "Q13"] } : x)).filter(x => x.id !== "CL-2"), m2.version);
  const stale = await op(store, "aiApprove", { id: "c:CL-3" });
  assert.equal(stale.code, 409);
  assert.equal(stale.body.code, "membership-changed");
});

test("reuse: an approved answer for the same intent is reused without a new draft call", async () => {
  const store = memoryStore();
  await enable(store, { shadowMode: false });
  const first = q("Q16", "Who conducts AIAPGET 2026 and what is the application fee?");
  await store.set("aym:q:Q16", first);
  await onQuestionSaved(store, first);
  await runWorker(store, { minJobMs: 0 });
  await op(store, "aiApprove", { id: "q:Q16" });
  const callsBefore = provider.calls.length;
  const second = q("Q17", "Who conducts AIAPGET 2026 and what is the application fee for it?");
  await store.set("aym:q:Q17", second);
  await onQuestionSaved(store, second);
  await runWorker(store, { minJobMs: 0 });
  const d = await (await aiStoreFor(store)).getDraft("q:Q17");
  assert.ok(d.aiDraft.reusedFrom, JSON.stringify(d.aiDraft));
  assert.equal(d.aiDraft.reusedFrom.id, "q:Q16");
  assert.equal(provider.calls.length, callsBefore, "no provider call for a reused answer");
  assert.equal(d.aiDraft.status, "pending", "reused answers still need an official's approval");
});

test("retries with backoff, then failed; provider not configured keeps the job waiting", async () => {
  const store = memoryStore();
  await enable(store);
  provider = mockProvider({ fail: () => true });
  setRuntimeForTests({ provider });
  const rec = q("Q18", "What is the AIAPGET 2026 application fee?");
  await store.set("aym:q:Q18", rec);
  await onQuestionSaved(store, rec);
  const ai = await aiStoreFor(store);
  let t = Date.now();
  const clock = () => t;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    await runWorker(store, { now: clock, minJobMs: 0, sweepFirst: false });
    const job = await ai.getJob("q_Q18");
    if (i < MAX_ATTEMPTS) {
      assert.equal(job.status, "queued");
      assert.equal(job.attempts, i);
      assert.ok(job.nextAt > t, "backoff pushes the next attempt out");
      t = job.nextAt + 1;
    } else {
      assert.equal(job.status, "failed");
    }
  }
  const overflow = await ai.getDraft("q:Q18");
  assert.ok(overflow, "failed jobs still leave a DISHA overflow card");
  assert.equal(overflow.aiDraft.status, "awaiting_ai");
  assert.equal(overflow.overflow, true);
  const saved = await store.get("aym:q:Q18");
  assert.equal(saved.question, rec.question);
  assert.ok(!String(saved.individualAnswer || "").trim(), "never auto-published");

  const store2 = memoryStore();
  await enable(store2);
  setRuntimeForTests({ provider: mockProvider({ configured: false }) });
  const rec2 = q("Q19", "What is the AIAPGET 2026 application fee?");
  await store2.set("aym:q:Q19", rec2);
  await onQuestionSaved(store2, rec2);
  const rep = await runWorker(store2, { minJobMs: 0, sweepFirst: false });
  assert.equal(rep.stopped, "provider not configured");
  const ai2 = await aiStoreFor(store2);
  assert.equal((await ai2.getJob("q_Q19")).status, "queued");
  assert.equal(await ai2.getDraft("q:Q19"), null);
});

test("spend cap: the worker stops and raises a staff alert", async () => {
  const store = memoryStore();
  await enable(store, { dailySpendCapUSD: 0.01 });
  for (const id of ["Q20", "Q21"]) {
    const rec = q(id, "What is the AIAPGET 2026 application fee and eligibility?");
    await store.set(`aym:q:${id}`, rec);
    await onQuestionSaved(store, rec);
  }
  const rep = await runWorker(store, { minJobMs: 0, sweepFirst: false });
  assert.equal(rep.done, 1);
  assert.equal(rep.stopped, "spend cap");
  const cfg = await (await aiStoreFor(store)).getConfig();
  assert.equal(cfg.alert.type, "spend-cap");
  const conf = await op(store, "aiConfigGet");
  assert.ok(conf.body.today.costUSD > 0);
});

test("config ops: staff flags round-trip; unknown keys ignored; regenerate needs AI on", async () => {
  const store = memoryStore();
  const off = await op(store, "aiConfigGet");
  assert.equal(off.body.config.enabled, false);
  assert.equal(off.body.config.shadowMode, true);
  assert.ok(off.body.streams.some(s => s.id === "pg-entrance") && off.body.streams.some(s => s.id === "govt-jobs"));
  const set = await op(store, "aiConfigSet", { patch: { enabled: true, streams: { "pg-entrance": true }, dailySpendCapUSD: 12.5, evil: 1 } });
  assert.equal(set.body.config.enabled, true);
  assert.equal(set.body.config.streams["pg-entrance"], true);
  assert.equal(set.body.config.dailySpendCapUSD, 12.5);
  assert.equal(set.body.config.evil, undefined);
  const rec = q("Q22", "Who conducts AIAPGET?");
  await store.set("aym:q:Q22", rec);
  const regen = await op(store, "aiRegenerate", { targetType: "question", targetId: "Q22" });
  assert.equal(regen.code, 200, JSON.stringify(regen.body));
  await op(store, "aiConfigSet", { patch: { enabled: false } });
  const blocked = await op(store, "aiRegenerate", { targetType: "question", targetId: "Q22" });
  assert.equal(blocked.code, 409);
});
