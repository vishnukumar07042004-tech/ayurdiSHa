/**
 * Hybrid primary + compare mode under time pressure. The primary (Hybrid: GPT draft, Gemini check)
 * never leaves a student without a draft: a slow or failing GPT call is cut and redrafted by Gemini
 * (marked `draftFallback`). A slow "Gemini only" compare side never holds the worker run: it is cut
 * at the per-provider limit, the Hybrid draft is saved at once, and the same job is re-queued as a
 * Gemini-only sub-job for the next run; a job with < 30 s left is deferred without using an attempt;
 * approved drafts are never overwritten; a medical flag from a sub-job still routes to a mentor.
 * In-memory store + mock providers, no network.
 */
import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests, hybridProvider } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, processJob, invalidateConfigCache } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved } from "../../server/ai/ops.js";
import { getPersonas } from "../../server/ai/runtime.js";
import { MIN_PROVIDER_MS, SIDE_TIMEOUT_MS } from "../../server/ai/draft.js";
import { ensureHybridSide } from "../../server/ai/compare.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const SIDE_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isDraftCall = args => Boolean(args && args.jsonSchema && args.jsonSchema.name === "disha_draft");

function q(id) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: "meera@example.com",
    theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
    question: "Who conducts AIAPGET 2026 and what is the application fee?", context: "", stage: "Intern",
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
    runWorker: opts => runWorker(store, opts),
  };
  await handleAiOp(name, msg, store, ctx);
  return ctx.out;
}

/**
 * A provider whose draft calls wait `delayMs` (ignoring `deadlineAt`, like a hung connection) when
 * `slow(n)` says so for the n-th draft call. `draft` overrides the draft JSON.
 */
function slowMock({ delayMs = 1500, slow = () => true, model = "mock-draft", draft } = {}) {
  const inner = mockProvider(draft ? { draft } : {});
  const p = {
    calls: [], finished: 0,
    isConfigured: () => true,
    async chat(args) {
      p.calls.push(args);
      if (isDraftCall(args) && slow(p.calls.filter(isDraftCall).length)) await sleep(delayMs);
      const out = await inner.chat(args);
      p.finished++;
      return { ...out, model: isDraftCall(args) ? model : out.model };
    },
    embed: texts => inner.embed(texts),
  };
  return p;
}

const fastGpt = () => slowMock({ slow: () => false, model: "mock-gpt" });
const draftCalls = p => p.calls.filter(isDraftCall).length;

async function setup(id, { openai = fastGpt(), gemini = mockProvider(), hybrid, compareMode = true } = {}) {
  const store = memoryStore();
  const ai = await aiStoreFor(store);
  await ai.setConfig(patchConfig(await ai.getConfig(), { enabled: true, shadowMode: false, compareMode, streams: { "pg-entrance": true } }));
  invalidateConfigCache();
  setRuntimeForTests({ provider: gemini, providers: { openai, ...(hybrid ? { hybrid } : {}) } });
  const rec = q(id);
  await store.set(`aym:q:${id}`, rec);
  await onQuestionSaved(store, rec);
  return { store, ai, gemini, openai };
}

before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  invalidateConfigCache();
});

test("ensureHybridSide: Gemini-only records gain a Hybrid error; a queued Hybrid side and a real GPT letter stay put", () => {
  const only = ensureHybridSide({ gemini: { provider: "gemini", status: "pending", answer: "Gem letter" } });
  assert.equal(only.hybrid.status, "error");
  assert.equal(only.hybrid.code, "missing");
  assert.match(only.hybrid.error, /OPENAI_API_KEY/);
  assert.equal(only.gemini.answer, "Gem letter");
  const queued = ensureHybridSide({ gemini: { status: "pending", answer: "Gem letter" } }, { pending: true });
  assert.equal(queued.hybrid, undefined);
  const kept = ensureHybridSide({ hybrid: { status: "pending", answer: "GPT letter" }, gemini: { answer: "Gem letter" } });
  assert.equal(kept.hybrid.answer, "GPT letter");
  const fromGpt = ensureHybridSide({
    hybrid: { provider: "hybrid", status: "pending", answer: "" },
    openai: { provider: "openai", status: "pending", answer: "GPT letter from the openai side" },
    gemini: { answer: "Gem letter" },
  });
  assert.equal(fromGpt.hybrid.answer, "GPT letter from the openai side");
  assert.equal(fromGpt.hybrid.status, "pending");
  const shell = ensureHybridSide({ hybrid: { provider: "hybrid", status: "pending", answer: "" }, gemini: { answer: "Gem letter" } });
  assert.equal(shell.hybrid.status, "error");
  assert.equal(shell.hybrid.code, "missing");
  assert.match(shell.hybrid.error, /quota|timeout|OPENAI_API_KEY/);
  assert.equal(shell.gemini.answer, "Gem letter");
  const alt = ensureHybridSide({ hybrid: { provider: "hybrid", status: "pending", answer: "", letter: "GPT via letter field" }, gemini: { answer: "Gem letter" } });
  assert.equal(alt.hybrid.answer, "GPT via letter field");
  assert.equal(alt.hybrid.status, "pending");
});

test("limits: 35 s per provider, never started with < 30 s left", () => {
  assert.equal(SIDE_TIMEOUT_MS, 35000);
  assert.equal(MIN_PROVIDER_MS, 30000);
});

test("fast GPT: one job drafts both sides — Hybrid is `aiDraft` (GPT draft, Gemini check), Gemini only beside it", async () => {
  const { store, ai, gemini, openai } = await setup("T5");
  const r = await runWorker(store, { sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal(r.done, 1, JSON.stringify(r));
  assert.equal(r.followUps, 0);
  const d = await ai.getDraft("q:T5");
  assert.equal(d.aiDraft.drafter, "hybrid");
  assert.equal(d.aiDraft.model, "mock-gpt");
  assert.equal(d.aiDraft.draftFallback, undefined);
  assert.equal(d.aiDrafts.hybrid.status, "pending");
  assert.equal(d.aiDrafts.hybrid.label, "Hybrid (GPT draft + Gemini check)");
  assert.equal(d.aiDrafts.gemini.status, "pending");
  assert.equal(d.aiDrafts.gemini.label, "Gemini only");
  assert.equal(draftCalls(openai), 1, "GPT drafts the Hybrid side only");
  assert.equal(draftCalls(gemini), 1, "Gemini drafts the Gemini-only side");
  assert.ok(gemini.calls.some(c => /strict fact checker/.test(c.system || "")), "Gemini checks the GPT draft");
  assert.ok(!openai.calls.some(c => /strict fact checker/.test(c.system || "")), "GPT never verifies");
  assert.equal((await ai.getJob("q_T5")).status, "done");
});

test("slow GPT: the Hybrid side falls back to a Gemini draft inside the side limit (marked), no sub-job, student not blocked", async () => {
  const gemini = mockProvider();
  const openai = slowMock({ delayMs: 1500, model: "mock-gpt" });
  // Production proportions, scaled down: GPT gets 20 s of a 35 s side, the fallback keeps ≥ 8 s.
  const hybrid = hybridProvider(gemini, openai, { gptTimeoutMs: 200, minFallbackMs: 80 });
  const { store, ai } = await setup("T6", { openai, gemini, hybrid });
  const t0 = Date.now();
  const r = await runWorker(store, { sweepFirst: false, sideTimeoutMs: 700 });
  assert.ok(Date.now() - t0 < 1400, "the run did not wait for the hung GPT call");
  assert.equal(r.done, 1, JSON.stringify(r));
  assert.equal(r.failed, 0);
  assert.equal(r.followUps, 0);
  const d = await ai.getDraft("q:T6");
  assert.equal(d.aiDraft.status, "pending", "the student still gets a reviewable draft");
  assert.equal(d.aiDraft.draftFallback.from, "openai");
  assert.equal(d.aiDraft.draftFallback.to, "gemini");
  assert.match(d.aiDraft.draftFallback.reason, /GPT draft failed \(timeout\)/);
  assert.ok(d.aiDraft.verifyFlags.some(f => /^Drafted by Gemini \(fallback\)/.test(f)), "the desk says so");
  assert.ok(d.aiDrafts.hybrid.draftFallback, "the Hybrid side is marked as a fallback draft");
  assert.equal(d.aiDrafts.gemini.status, "pending");
  assert.equal(draftCalls(gemini), 2, "fallback draft + Gemini-only side");
});

test("compare off: a failing GPT call is redrafted by Gemini (marked); OpenAI not configured → Gemini draft, never blocked", async () => {
  const failing = { ...fastGpt(), async chat() { throw Object.assign(new Error("OpenAI 500: upstream"), { code: "server_error" }); } };
  const gemA = mockProvider();
  const a = await setup("T7", { openai: failing, gemini: gemA, hybrid: hybridProvider(gemA, failing, { minFallbackMs: 1000 }), compareMode: false });
  await runWorker(a.store, { sweepFirst: false, sideTimeoutMs: 5000 });
  const d = await a.ai.getDraft("q:T7");
  assert.equal(d.aiDraft.status, "pending");
  assert.equal(d.aiDraft.drafter, "hybrid");
  assert.match(d.aiDraft.draftFallback.reason, /GPT draft failed \(server_error\)/);
  assert.equal(d.aiDrafts, undefined, "no compare sides when compare mode is off");

  const off = { ...fastGpt(), isConfigured: () => false };
  const b = await setup("T8", { openai: off, compareMode: false });
  await runWorker(b.store, { sweepFirst: false, sideTimeoutMs: 5000 });
  const e = await b.ai.getDraft("q:T8");
  assert.equal(e.aiDraft.status, "pending");
  assert.match(e.aiDraft.draftFallback.reason, /not configured/);
  assert.equal(draftCalls(off), 0);
});

test("slow Gemini-only side: the run returns at the side limit, Hybrid is saved now, Gemini continues as a one-side sub-job next run", async () => {
  const gemini = slowMock({ delayMs: 1500 });
  const openai = fastGpt();
  const { store, ai } = await setup("T1", { openai, gemini });
  // The injected clock jumps past the start window once GPT drafts, so the sub-job waits for the next run.
  let t = Date.now();
  const gptChat = openai.chat.bind(openai);
  openai.chat = async args => { if (isDraftCall(args)) t += 10_000; return gptChat(args); };

  const t0 = Date.now();
  const r1 = await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.ok(Date.now() - t0 < 1400, "run returned at the side limit, not after Gemini");
  assert.equal(r1.done, 1, JSON.stringify(r1));
  assert.equal(r1.followUps, 1);
  assert.equal(r1.failed, 0);
  const slowCall = gemini.calls.find(isDraftCall);
  assert.ok(slowCall.deadlineAt && slowCall.deadlineAt <= t0 + SIDE_MS + 1000, "the Gemini call carried the side deadline");

  const d1 = await ai.getDraft("q:T1");
  assert.equal(d1.aiDraft.status, "pending");
  assert.equal(d1.aiDraft.drafter, "hybrid");
  assert.ok(d1.aiDrafts.hybrid, "Hybrid side saved immediately");
  assert.equal(d1.aiDrafts.gemini, undefined, "no Gemini error variant for a deferred side");
  const job = await ai.getJob("q_T1");
  assert.equal(job.status, "queued");
  assert.equal(job.only, "gemini");
  assert.equal(job.attempts, 0, "the sub-job has its own attempts");
  assert.match(job.result, /gemini side continues in the next run/);

  const fastGemini = slowMock({ slow: () => false });
  setRuntimeForTests({ provider: fastGemini, providers: { openai } });
  const r2 = await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal(r2.done, 1, JSON.stringify(r2));
  assert.equal(r2.followUps, 0);
  assert.equal(draftCalls(fastGemini), 1);
  const d2 = await ai.getDraft("q:T1");
  assert.equal(d2.aiDrafts.gemini.status, "pending");
  assert.equal(d2.aiDrafts.gemini.provider, "gemini");
  assert.deepEqual(d2.aiDrafts.hybrid, d1.aiDrafts.hybrid);
  assert.equal(d2.aiDraft.answer, d1.aiDraft.answer);
  assert.equal(d2.aiDraft.drafter, "hybrid");
  const done = await ai.getJob("q_T1");
  assert.equal(done.status, "done");
  assert.equal(done.only, "");
});

test("Gemini-only side still too slow in its own sub-job → error variant (timeout), job done, Hybrid kept", async () => {
  const gemini = slowMock({ delayMs: 1500 });
  const { store, ai } = await setup("T2", { gemini });
  // Real clock: the sub-job runs in the same run and times out again.
  const r = await runWorker(store, { sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal(r.followUps, 1, JSON.stringify(r));
  assert.equal(r.done, 2, "main job + Gemini sub-job");
  const d = await ai.getDraft("q:T2");
  assert.equal(d.aiDraft.status, "pending");
  assert.ok(d.aiDrafts.hybrid);
  assert.equal(d.aiDrafts.gemini.status, "error");
  assert.equal(d.aiDrafts.gemini.code, "timeout");
  assert.match(d.aiDrafts.gemini.error, /Gemini only did not finish in time.*Regenerate/);
  assert.equal((await ai.getJob("q_T2")).status, "done", "no endless re-queue");
});

test("Hybrid side times out while Gemini finishes: Gemini letter is kept, Hybrid is an error, nothing is published", async () => {
  const gemini = mockProvider();
  const openai = fastGpt();
  const hybrid = {
    id: "hybrid", hybrid: true, isConfigured: () => true, gptConfigured: () => true,
    async chat(args) {
      if (isDraftCall(args)) throw Object.assign(new Error("GPT draft did not finish within 20 s"), { code: "timeout", sideTimeout: true });
      return gemini.chat(args);
    },
    embed: (...a) => gemini.embed(...a),
  };
  const { store, ai } = await setup("T11", { openai, gemini, hybrid });
  const r = await runWorker(store, { sweepFirst: false, sideTimeoutMs: 5000 });
  assert.equal(r.done, 1, JSON.stringify(r));
  assert.equal(r.failed, 0);
  assert.equal(r.quotaDeferred || 0, 0);
  const d = await ai.getDraft("q:T11");
  assert.equal(d.aiDrafts.hybrid.status, "error");
  assert.equal(d.aiDrafts.hybrid.code, "timeout");
  assert.match(d.aiDrafts.hybrid.error, /Hybrid \(GPT draft \+ Gemini check\) did not finish in time/);
  assert.match(d.aiDrafts.hybrid.error, /Regenerate/);
  assert.equal(d.aiDrafts.gemini.status, "pending");
  assert.ok(d.aiDrafts.gemini.answer, "Gemini letter is saved beside the Hybrid error");
  assert.notEqual(d.aiDraft.status, "approved");
  const q = await store.get("aym:q:T11");
  assert.equal(String((q && (q.individualAnswer || q.answer)) || "").trim(), "");
});

test("approved while the Gemini sub-job waits: the sub-job never overwrites the approved draft", async () => {
  const gemini = slowMock({ delayMs: 1500 });
  const openai = fastGpt();
  const { store, ai } = await setup("T3", { openai, gemini });
  let t = Date.now();
  const gptChat = openai.chat.bind(openai);
  openai.chat = async args => { if (isDraftCall(args)) t += 10_000; return gptChat(args); };
  await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal((await ai.getJob("q_T3")).only, "gemini");

  const ok = await op(store, "aiApprove", { id: "q:T3", provider: "hybrid", reviewer: "Dr Test" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.item.aiDraft.approvedProvider, "hybrid");
  const approved = await ai.getDraft("q:T3");
  const fastGemini = slowMock({ slow: () => false });
  setRuntimeForTests({ provider: fastGemini, providers: { openai } });
  const r = await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal(r.skipped, 1, JSON.stringify(r));
  assert.equal(draftCalls(fastGemini), 0, "no spend on an approved question");
  const after = await ai.getDraft("q:T3");
  assert.equal(after.aiDraft.status, "approved");
  assert.deepEqual(after.aiDrafts, approved.aiDrafts);
});

test("approve picks the chosen side: `gemini` publishes the Gemini-only draft even though Hybrid is on top", async () => {
  const gemini = mockProvider({ draft: p => ({ ...geminiDraft(p) }) });
  const { store, ai } = await setup("T9", { gemini });
  await runWorker(store, { sweepFirst: false, sideTimeoutMs: SIDE_MS });
  const d = await ai.getDraft("q:T9");
  assert.notEqual(d.aiDrafts.gemini.answer, d.aiDrafts.hybrid.answer);
  const bad = await op(store, "aiApprove", { id: "q:T9", provider: "claude" });
  assert.equal(bad.code, 400);
  assert.match(bad.body.error, /Hybrid or the Gemini-only draft/);
  const ok = await op(store, "aiApprove", { id: "q:T9", provider: "gemini", reviewer: "Dr Test" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const after = await ai.getDraft("q:T9");
  assert.equal(after.aiDraft.approvedProvider, "gemini");
  assert.match(after.aiDraft.published.answer, /^Gemini view\./);
});

function geminiDraft(payload) {
  const s = (payload.SOURCES || [])[0];
  return {
    answer: `Gemini view. ${String(s.text).split(/(?<=[.!?])\s+/)[0]} [c:${s.id}] Check the official notice before you apply.`,
    actions: ["Read the bulletin", "Plan your study"], mistake: "Trusting blogs.",
    resources: [{ title: s.title, url: s.url }], citations: [{ chunkId: s.id, quote: String(s.text).split(/(?<=[.!?])\s+/)[0] }],
  };
}

test("medical flag from a Gemini-only sub-job routes the question to a mentor; approving the Hybrid side is refused", async () => {
  const slowGemini = slowMock({ delayMs: 1500 });
  const openai = fastGpt();
  const { store, ai } = await setup("T10", { openai, gemini: slowGemini });
  let t = Date.now();
  const gptChat = openai.chat.bind(openai);
  openai.chat = async args => { if (isDraftCall(args)) t += 10_000; return gptChat(args); };
  await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal((await ai.getDraft("q:T10")).aiDraft.status, "pending");

  const medicalGemini = slowMock({ slow: () => false, draft: () => ({ insufficient: true, reason: "medical", flags: ["medical-advice"] }) });
  setRuntimeForTests({ provider: medicalGemini, providers: { openai } });
  await runWorker(store, { now: () => t, sweepFirst: false, sideTimeoutMs: SIDE_MS });
  const d = await ai.getDraft("q:T10");
  assert.equal(d.aiDrafts.gemini.blockedReason, "medical");
  assert.equal(d.aiDraft.status, "blocked");
  assert.equal(d.aiDraft.blockedReason, "medical");
  assert.equal(d.aiDraft.answer, "");
  assert.match(d.aiDraft.blockedNote, /Gemini only side flagged a medical question/);
  assert.ok(d.aiDrafts.hybrid.answer, "the Hybrid side stays visible for the record");
  for (const provider of ["hybrid", "gemini", ""]) {
    const r = await op(store, "aiApprove", { id: "q:T10", provider });
    assert.equal(r.code, 400, `approve ${provider || "(default)"} must be refused`);
  }
});

test("< 30 s left: the run starts no job; a job that reaches drafting with < 30 s left is deferred (no draft call, no attempt)", async () => {
  const { store, ai, gemini, openai } = await setup("T4");
  const r = await runWorker(store, { sweepFirst: false, hardMs: 20_000 });
  assert.equal(r.stopped, "time budget");
  assert.equal(r.processed, 0);
  const job = await ai.getJob("q_T4");
  assert.equal(job.status, "queued");
  assert.equal(job.attempts || 0, 0);

  const claimed = await ai.claimJob("q_T4", Date.now(), 90_000);
  const cfg = await ai.getConfig();
  const personas = await getPersonas();
  await assert.rejects(
    processJob(store, claimed, { cfg, provider: gemini, personas, deadlineAt: Date.now() + MIN_PROVIDER_MS - 5000 }),
    err => err.code === "deferred" && /next run/.test(err.message),
  );
  assert.equal(draftCalls(gemini), 0);
  assert.equal(draftCalls(openai), 0);
  assert.equal(await ai.getDraft("q:T4"), null);

  // The worker puts a deferred job back without counting the attempt.
  await ai.putJob({ ...claimed, status: "queued", lockedUntil: 0, attempts: 0 });
  const ok = await runWorker(store, { sweepFirst: false, sideTimeoutMs: SIDE_MS });
  assert.equal(ok.done, 1, JSON.stringify(ok));
  const d = await ai.getDraft("q:T4");
  assert.ok(d.aiDrafts.hybrid && d.aiDrafts.gemini, "both sides once there is time");
});
