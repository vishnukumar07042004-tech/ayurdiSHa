/**
 * Mentor-assist drafts: a career question the trusted sources do not cover gets a pending,
 * high-risk "Limited sources — mentor to complete" draft instead of an "insufficient source" block.
 * Unsourced numbers / dates / amounts are stripped deterministically; medical, restricted and
 * off-topic keep their triage routes; approve works; the redraft backfill is idempotent.
 */
import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setRuntimeForTests } from "../../server/ai/runtime.js";
import { setKbForTests, setGoldenForTests, resetRetrievalCache } from "../../server/ai/retrieve.js";
import { setAllowListForTests, officialHomepages, shortSourceName } from "../../server/ai/sources.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { patchConfig } from "../../server/ai/config.js";
import { runWorker, invalidateConfigCache } from "../../server/ai/queue.js";
import { handleAiOp, onQuestionSaved, annotateLookupHits, deskTier } from "../../server/ai/ops.js";
import { resetTriageCacheForTests } from "../../server/ai/triage.js";
import {
  sanitizeMentorAssist, needsSource, splitSentences, finishMentorAssist, templateNote, pickHomepageResources,
  MENTOR_ASSIST_MAX_CONFIDENCE, isSkillLearningQuestion, homepagesFor, LEARNING_HOMEPAGES, SKILL_TEMPLATE_ACTIONS,
} from "../../server/ai/mentorAssist.js";
import { verifyDraft } from "../../server/ai/verify.js";
import { ClustersVersionConflictError } from "../../server/store.js";
import { CHUNKS, ALLOW, mockProvider, memoryStore } from "./helpers.mjs";

const THEME_PG = "Academics, Teaching & Higher Education";
const THIN = "Which PG branch suits someone who loves yoga philosophy and Sanskrit poetry?";

function q(id, question, extra = {}) {
  return {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Meera Iyer", email: `${id.toLowerCase()}@student.in`,
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
  await ai.setConfig(patchConfig(await ai.getConfig(), { enabled: true, shadowMode: false, streams: { "pg-entrance": true, "govt-jobs": true }, ...patch }));
  invalidateConfigCache();
}

async function ask(store, rec) {
  await store.set(`aym:q:${rec.id}`, rec);
  return onQuestionSaved(store, rec);
}

let provider;
before(() => setAllowListForTests(ALLOW));
beforeEach(() => {
  resetRetrievalCache();
  resetTriageCacheForTests();
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  provider = mockProvider();
  setRuntimeForTests({ provider });
  invalidateConfigCache();
});
afterEach(() => { delete process.env.AI_MENTOR_ASSIST; });

/* ---------------------------------------------------------------- post-check units */

test("needsSource: digits, dates, currency, percentages and links need a source; plain advice does not", () => {
  for (const s of ["The fee is Rs 2,700.", "Apply by 30 June.", "Applications open in March.", "It costs ₹ fifty thousand.", "About 40% clear it.", "Seats rose by ten per cent.", "See https://example.org for more.", "Coaching costs a few lakh."]) {
    assert.equal(needsSource(s), true, s);
  }
  for (const s of ["Talk to seniors who chose each path.", "You may want to compare both routes.", "Check the official notice from NTA before you apply."]) {
    assert.equal(needsSource(s), false, s);
  }
});

test("splitSentences keeps a trailing citation on its sentence", () => {
  assert.deepEqual(splitSentences("First fact. [c:a] Second idea."), ["First fact. [c:a]", "Second idea."]);
});

test("sanitize: unbacked specifics are stripped; a cited passage that states the number keeps the sentence", () => {
  const byId = new Map(CHUNKS.map(c => [c.id, c]));
  const out = sanitizeMentorAssist({
    answer: "Start from what you enjoy. The General fee is Rs 2,700 [c:nta-aiapget-2026-1]. The fee is Rs 9,999 [c:nta-aiapget-2026-1]. Internship must finish by 30 June 2026 [c:nta-aiapget-2026-1]. Results come out in August [c:nta-aiapget-2026-1]. There are 500 seats. Read the notice yourself.",
    actions: ["Read the notice", "Apply before 15 May", "Ask a senior"],
    mistake: "Paying Rs 50,000 for coaching.",
  }, byId);
  assert.match(out.answer, /Rs 2,700 \[c:nta-aiapget-2026-1\]/, "backed number kept with its citation");
  assert.match(out.answer, /30 June 2026/, "backed date kept");
  assert.doesNotMatch(out.answer, /9,999|500 seats|August/, "unbacked number, count and month stripped");
  assert.deepEqual(out.actions, ["Read the notice", "Ask a senior"]);
  assert.equal(out.mistake, "");
  assert.equal(out.stripped.length, 5);
});

test("finish: too little left → templated note; actions and mistake topped up; template has no digits", () => {
  const homes = [{ name: "National Commission for Indian System of Medicine (NCISM)", short: "NCISM", url: "https://ncismindia.org/" }];
  const done = finishMentorAssist({ answer: "Good question.", actions: ["Read the notice"], mistake: "" }, homes);
  assert.equal(done.templated, true);
  assert.match(done.answer, /NCISM/);
  assert.equal(done.actions.length, 3);
  assert.ok(done.mistake);
  assert.ok(!/\d/.test(JSON.stringify(templateNote(homes))));
  assert.equal(shortSourceName("National Testing Agency — AIAPGET"), "National Testing Agency");
});

test("resources: only official homepages from the allow-list, the model's valid picks first", () => {
  const homes = officialHomepages("pg-entrance");
  assert.ok(homes.length >= 2, JSON.stringify(homes));
  assert.ok(homes.every(h => /^https:\/\/[^/]+\/$/.test(h.url)), "homepages only");
  assert.ok(homes.some(h => h.url === "https://exams.nta.ac.in/"), "NTA (pg-entrance) offered");
  const picked = pickHomepageResources([{ title: "x", url: "https://random-coaching-blog.example/" }, { title: "NCISM", url: "https://ncismindia.org/some/deep/page" }], homes);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].url, "https://ncismindia.org/");
  assert.ok(picked.every(p => homes.some(h => h.url === p.url)));
});

test("verify guidance mode: advice is labelled guidance; a number without a source is unsupported", async () => {
  const v = await verifyDraft({
    draft: { answer: "Talk to seniors who chose each path. Check the eligibility section of the official notice. Exactly 500 seats are open.", actions: [], mistake: "", citations: [] },
    chunksById: new Map(),
    provider: null,
    guidanceMode: true,
  });
  const by = Object.fromEntries(v.claimChecks.map(c => [c.claim, c]));
  assert.equal(by["Talk to seniors who chose each path."].status, "guidance");
  assert.equal(by["Talk to seniors who chose each path."].note, "guidance (no source needed)");
  assert.equal(by["Check the eligibility section of the official notice."].status, "guidance", "where-to-check advice is not a fact");
  assert.equal(by["Exactly 500 seats are open."].status, "unsupported");
});

/* ---------------------------------------------------------------- pipeline */

test("thin sources → mentor-assist draft: pending (not blocked), high risk, capped confidence, numbers stripped, homepage resources, on the desk", async () => {
  const store = memoryStore();
  await enable(store);
  await ask(store, q("M1", THIN));
  const rep = await runWorker(store, { minJobMs: 0 });
  assert.equal(rep.done, 1, JSON.stringify(rep));
  const ai = await aiStoreFor(store);
  const d = (await ai.getDraft("q:M1")).aiDraft;
  assert.equal(d.status, "pending");
  assert.equal(d.mode, "mentor-assist");
  assert.equal(d.risk, "high");
  assert.ok(d.confidence <= MENTOR_ASSIST_MAX_CONFIDENCE, String(d.confidence));
  assert.deepEqual(d.flags, ["limited-sources"]);
  assert.equal(d.blockedReason, undefined);
  assert.ok(d.answer.length > 100);
  assert.doesNotMatch(JSON.stringify([d.answer, d.actions, d.mistake]), /1,20,000|500 seats|March|30 June/, "unsourced specifics stripped");
  assert.equal(d.actions.length, 3);
  assert.ok(d.mentorAssist.stripped.length >= 3, JSON.stringify(d.mentorAssist));
  assert.equal(d.mentorAssist.hint, "Add specific facts from official sources before sending");
  assert.ok(d.resources.length >= 1 && d.resources.length <= 2);
  const homes = officialHomepages((await ai.getDraft("q:M1")).stream);
  assert.ok(d.resources.every(r => homes.some(h => h.url === r.url)), `homepages only: ${JSON.stringify(d.resources)}`);
  assert.ok(!d.resources.some(r => /coaching-blog/.test(r.url)));
  assert.ok(d.claimChecks.some(c => c.status === "guidance" && c.note === "guidance (no source needed)"));
  assert.ok(d.verifyFlags[0].startsWith("Limited sources — mentor to complete"));
  assert.ok(provider.calls.some(c => /MENTOR-ASSIST MODE/.test(c.system)), "mentor-assist prompt used");

  const queue = await op(store, "aiQueue", {});
  assert.equal(queue.body.items.length, 1, "visible in the review queue");
  assert.equal(queue.body.counts.mentorAssist, 1);
  assert.equal(queue.body.counts.blocked, 0);
  const hits = await annotateLookupHits(store, [{ id: "M1", individualAnswer: "" }]);
  assert.equal(hits[0].reviewStage, "review", "Track: being reviewed, like any draft");
});

test("model says the sources fall short → mentor-assist keeps cited, backed specifics and strips the rest", async () => {
  provider = mockProvider({
    draft: () => ({ insufficient: true, reason: "The sources do not say how hard each branch is." }),
    mentorAssist: payload => ({
      answer: `Think about the kind of practice you want. The application fee for General category candidates is Rs 2,700 [c:${payload.SOURCES[0].id}]. Applications close on 15 May. Read the bulletin yourself before you decide.`,
      actions: ["Read the bulletin", "List your options", "Ask a senior"],
      mistake: "Trusting coaching blogs.",
      resources: [],
      citations: [{ chunkId: payload.SOURCES[0].id, quote: "The application fee for General category candidates is Rs 2,700." }],
    }),
  });
  setRuntimeForTests({ provider });
  const store = memoryStore();
  await enable(store);
  await ask(store, q("M2", "What is the AIAPGET 2026 application fee and which branch is easiest?"));
  await runWorker(store, { minJobMs: 0 });
  const d = (await (await aiStoreFor(store)).getDraft("q:M2")).aiDraft;
  assert.equal(d.status, "pending");
  assert.equal(d.mode, "mentor-assist");
  assert.match(d.answer, /Rs 2,700 \[c:nta-aiapget-2026-1\]/);
  assert.doesNotMatch(d.answer, /15 May/);
  assert.ok(d.citations.length === 1 && d.citations[0].valid);
  assert.ok(d.claimChecks.some(c => c.status === "supported"), JSON.stringify(d.claimChecks));
  assert.ok(d.claimChecks.some(c => c.status === "guidance"));
  assert.ok(d.confidence <= 0.4);
});


test("skill / coding questions get learning homepages and a step-by-step skill template", () => {
  assert.equal(isSkillLearningQuestion("how can I develop my own application", "I dont know anything about coding."), true);
  assert.equal(isSkillLearningQuestion("Who will win the IPL final this year?", ""), false);
  const homes = homepagesFor("digital-branding", { question: "how can I develop my own application", context: "I dont know anything about coding." });
  assert.ok(homes.some(h => /freecodecamp/i.test(h.url)), JSON.stringify(homes.slice(0, 3)));
  assert.ok(LEARNING_HOMEPAGES.length >= 4);
  const done = finishMentorAssist({ answer: "Too short.", actions: [], mistake: "", stripped: [] }, homes);
  assert.equal(done.templated, true);
  assert.match(done.answer, /freeCodeCamp|beginner|tiny project/i);
  assert.deepEqual(done.actions, SKILL_TEMPLATE_ACTIONS);
  const picked = pickHomepageResources([], homes);
  assert.ok(picked.length >= 1);
  assert.ok(picked.every(r => /^https?:\/\//.test(r.url)));
});

test("medical, restricted and off-topic keep their triage routes (never mentor-assist)", async () => {
  const store = memoryStore();
  await enable(store);
  await ask(store, q("X1", "My mother has diabetes, which Ayurvedic medicine should she take?"));
  await ask(store, q("X2", "Where can I get the leaked AIAPGET question paper?"));
  await ask(store, q("X3", "Who will win the IPL final this year?"));
  await runWorker(store, { minJobMs: 0 });
  const ai = await aiStoreFor(store);
  const med = (await ai.getDraft("q:X1")).aiDraft;
  assert.equal(med.status, "blocked");
  assert.equal(med.blockedReason, "medical");
  assert.equal(med.mode, undefined);
  const restricted = (await ai.getDraft("q:X2")).aiDraft;
  assert.equal(restricted.triage.category, "RESTRICTED");
  assert.ok(restricted.scripted, "scripted reply");
  assert.equal(restricted.mode, undefined);
  const off = (await ai.getDraft("q:X3")).aiDraft;
  assert.equal(off.triage.category, "OFF_TOPIC");
  assert.equal(off.mode, undefined);
  assert.ok(!provider.calls.some(c => /MENTOR-ASSIST MODE/.test(c.system)), "no mentor-assist call");
});

test("kill switch AI_MENTOR_ASSIST=off restores the insufficient-source block", async () => {
  process.env.AI_MENTOR_ASSIST = "off";
  const store = memoryStore();
  await enable(store);
  await ask(store, q("K1", THIN));
  await runWorker(store, { minJobMs: 0 });
  const d = (await (await aiStoreFor(store)).getDraft("q:K1")).aiDraft;
  assert.equal(d.status, "blocked");
  assert.equal(d.blockedReason, "insufficient_source");
});

test("approve sends a mentor-assist draft to Track like any other; approved-as-is text is never reused for a new question", async () => {
  const store = memoryStore();
  await enable(store);
  await ask(store, q("A1", THIN));
  await runWorker(store, { minJobMs: 0 });
  const ok = await op(store, "aiApprove", { id: "q:A1", mentorName: "Dr. Rao", reviewer: "desk" });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  const rec = await store.get("aym:q:A1");
  assert.ok(rec.individualAnswer.length > 100);
  assert.equal(rec.individualAiAssisted, true, "AI-originated text carries the AI note");
  assert.equal(rec.individualActions.length, 3);
  assert.ok(rec.individualResources.every(r => / — https:\/\//.test(r)));
  const ai = await aiStoreFor(store);
  const bank = await ai.listBank();
  assert.equal(bank[0].mode, "mentor-assist");

  const callsBefore = provider.calls.length;
  await ask(store, q("A2", THIN));
  await runWorker(store, { minJobMs: 0 });
  const d2 = (await ai.getDraft("q:A2")).aiDraft;
  assert.equal(d2.reusedFrom, undefined, "not reused");
  assert.equal(d2.mode, "mentor-assist");
  assert.ok(provider.calls.length > callsBefore);

  const edited = await op(store, "aiEditApprove", { id: "q:A2", answer: "Shalakya and Swasthavritta both suit a reflective temperament. Check the NCISM syllabus for each branch and speak to current scholars.", actions: ["Read the syllabus", "Visit a department", "Ask a scholar"], mistake: "Choosing by rank alone.", resources: [] });
  assert.equal(edited.code, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.item.aiDraft.status, "edited");
});

test("desk order: normal drafts, then mentor-assist, then blocked; mode filter", async () => {
  const store = memoryStore();
  await enable(store);
  await ask(store, q("S1", THIN, { createdAt: Date.now() - 9000 }));
  await ask(store, q("S2", "Who conducts AIAPGET 2026 and what is the application fee?", { createdAt: Date.now() - 5000 }));
  await ask(store, q("S3", "Which Ayurvedic medicine should I take for my diabetes?", { createdAt: Date.now() - 1000 }));
  await runWorker(store, { minJobMs: 0 });
  const all = await op(store, "aiQueue", { status: "all" });
  assert.deepEqual(all.body.items.map(i => i.id), ["q:S2", "q:S1", "q:S3"]);
  assert.deepEqual(all.body.items.map(deskTier), [1, 2, 3]);
  const only = await op(store, "aiQueue", { mode: "mentor-assist" });
  assert.deepEqual(only.body.items.map(i => i.id), ["q:S1"]);
  const grounded = await op(store, "aiQueue", { mode: "grounded" });
  assert.deepEqual(grounded.body.items.map(i => i.id), ["q:S2"]);
  const idx = await op(store, "aiIndex", {});
  assert.equal(idx.body.index["q:S1"].mode, "mentor-assist");
});

test("no provider configured and no sources → templated mentor-assist note (no model call)", async () => {
  provider = mockProvider({ configured: false });
  setRuntimeForTests({ provider });
  const store = memoryStore();
  await enable(store);
  await ask(store, q("T1", THIN));
  await runWorker(store, { minJobMs: 0 });
  const d = (await (await aiStoreFor(store)).getDraft("q:T1")).aiDraft;
  assert.equal(d.status, "pending");
  assert.equal(d.mode, "mentor-assist");
  assert.equal(d.mentorAssist.templated, true);
  assert.equal(provider.calls.length, 0);
  assert.ok(!/\d/.test(d.answer));
});

/* ---------------------------------------------------------------- redraft backfill */

function blockedDraft(id, type, targetId, extra = {}) {
  return {
    id, targetType: type, targetId, stream: "pg-entrance", createdAt: Date.now() - 3600_000, updatedAt: Date.now() - 3600_000,
    memberIds: [], shadow: false, history: [],
    aiDraft: { status: "blocked", blockedReason: "insufficient_source", blockedNote: "No trusted source", answer: "", actions: [], mistake: "", resources: [], citations: [], claimChecks: [], confidence: 0, risk: "high", createdAt: Date.now() - 3600_000 },
    ...extra,
  };
}

test("aiBackfill redraftInsufficient: requeues insufficient-source drafts once, redrafts them as mentor-assist, never touches approved or answered", async () => {
  const store = memoryStore();
  await enable(store);
  const ai = await aiStoreFor(store);
  for (const r of [q("R1", THIN), q("R2", "Which branch suits a love of Sanskrit poetry and yoga philosophy?"), q("R3", THIN, { individualAnswer: "A mentor answered." }), q("R4", THIN), q("G1", THIN), q("G2", "Which PG branch fits a love of Sanskrit poetry?")]) {
    await store.set(`aym:q:${r.id}`, r);
  }
  await store.saveClusters([{ id: "CL-T", theme: THEME_PG, subtheme: "Choosing a PG branch", memberIds: ["G1", "G2"], kind: "merged", status: "New", representative: THIN }], 1);
  await ai.putDraft(blockedDraft("q:R1", "question", "R1"));
  await ai.putDraft(blockedDraft("q:R2", "question", "R2"));
  await ai.putDraft(blockedDraft("q:R3", "question", "R3"));
  await ai.putDraft(blockedDraft("q:R4", "question", "R4", { aiDraft: { status: "approved", answer: "Approved answer", actions: [], mistake: "", resources: [] } }));
  await ai.putDraft(blockedDraft("c:CL-T", "cluster", "CL-T", { memberIds: ["G1", "G2"] }));
  await ai.putDraft(blockedDraft("q:M9", "question", "M9", { aiDraft: { status: "blocked", blockedReason: "medical" } }));

  const dry = await op(store, "aiBackfill", { dryRun: true, redraftInsufficient: true });
  assert.equal(dry.code, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.mode, "redraft-insufficient");
  assert.equal(dry.body.eligible, 3, JSON.stringify(dry.body));
  assert.equal(dry.body.eligibleStudents, 4);
  assert.equal(dry.body.skipped.answered, 1);
  assert.equal((await ai.listJobs()).length, 0, "dry run writes nothing");

  const real = await op(store, "aiBackfill", { redraftInsufficient: true });
  assert.equal(real.code, 200, JSON.stringify(real.body));
  assert.deepEqual(real.body.enqueuedIds.sort(), ["c_CL-T", "q_R1", "q_R2"]);
  const again = await op(store, "aiBackfill", { redraftInsufficient: true });
  assert.equal(again.body.enqueued, 0, "queued jobs are not duplicated");
  assert.equal(again.body.skipped.queued, 3);

  const rep = await runWorker(store, { minJobMs: 0 });
  assert.equal(rep.done, 3, JSON.stringify(rep));
  for (const id of ["q:R1", "q:R2", "c:CL-T"]) {
    const d = await ai.getDraft(id);
    assert.equal(d.aiDraft.status, "pending", id);
    assert.equal(d.aiDraft.mode, "mentor-assist", id);
    assert.equal(d.history.at(-1).blockedReason, "insufficient_source", `${id} keeps the old version in history`);
  }
  assert.equal((await ai.getDraft("q:R4")).aiDraft.status, "approved", "approved draft untouched");
  assert.equal((await ai.getDraft("q:R4")).aiDraft.answer, "Approved answer");
  assert.equal((await store.get("aym:q:R3")).individualAnswer, "A mentor answered.");
  assert.equal(await ai.getDraft("q:G1"), null, "group members are covered by the group redraft");

  const after = await op(store, "aiBackfill", { dryRun: true, redraftInsufficient: true });
  assert.equal(after.body.eligible, 0, "idempotent: nothing left to redraft");
  const off = await op(store, "aiConfigSet", { patch: { enabled: false } });
  assert.equal(off.code, 200);
  assert.equal((await op(store, "aiBackfill", { redraftInsufficient: true })).body.code, "disabled");
});
