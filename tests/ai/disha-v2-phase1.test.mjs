/**
 * DISHA V2 Phase 1 gates: welcome-by-default scope, coding in scope, track as hint,
 * no rephrase-only for in-scope, medical escalate, PII redaction, link scrub.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesTriage } from "../../shared/triageRules.js";
import { isScriptedTriageCategory, scopePolicySnapshot, gptCreditFallbackModel } from "../../server/ai/scopePolicy.js";
import { classifyQuestion, fallbackStreamFor, medicalScreen } from "../../server/ai/classify.js";
import { scrubFalseLinkClaims, finishMentorAssist, homepagesFor, SKILL_TEMPLATE_ACTIONS } from "../../server/ai/mentorAssist.js";
import { redactQuestion } from "../../server/ai/redact.js";
import { riskReasonsFrom, riskBadgeLabel } from "../../server/ai/riskSignals.js";
import { noteGptCreditFailure, resetGptCreditFallbackForTests, gptDraftOnFallback, resolveGptDraftModel } from "../../server/ai/gptCreditFallback.js";
import { HYBRID_DEFAULT_DRAFT_MODEL } from "../../server/ai/runtime.js";

const TECH = "Tech, AI & Digital Health";
const HEALTH_TECH = "Health-tech products & platforms";

test("coding / app from zero is in scope and not scripted-declined", () => {
  const r = rulesTriage({
    question: "how can I develop my own application",
    context: "I don't know anything about coding",
    theme: TECH,
    subtheme: HEALTH_TECH,
  }, { scopePolicyVersion: "v2" });
  assert.equal(r.category, "ON_TOPIC");
  assert.equal(r.subtype, "skill-learning");
  assert.equal(isScriptedTriageCategory(r.category, r.subtype), false);
});

test("track mismatch still answers (not scripted rephrase)", () => {
  const r = rulesTriage({
    question: "What licences do I need to start a small Ayurveda clinic after internship?",
    theme: TECH,
    subtheme: HEALTH_TECH,
  }, { scopePolicyVersion: "v2" });
  assert.ok(["ON_TOPIC", "WRONG_AREA"].includes(r.category), r.category);
  assert.equal(isScriptedTriageCategory(r.category, r.subtype), false);
});

test("PERSONAL_HEALTH / WELLBEING escalate as MEDICAL restricted", () => {
  const q = "I have chronic acidity — which herbs should I take daily for wellbeing?";
  const medical = medicalScreen(q, "");
  const r = rulesTriage({ question: q, theme: "Clinical Practice & Integrative Care", subtheme: "Hospital employment" }, { medical, scopePolicyVersion: "v2" });
  assert.equal(r.category, "RESTRICTED");
  assert.equal(r.subtype, "MEDICAL");
  assert.equal(isScriptedTriageCategory(r.category, r.subtype), true);
});

test("Tech / coding does not fall through to Internship stream", () => {
  const cls = classifyQuestion({
    question: "how can I develop my own application",
    context: "I don't know anything about coding",
    theme: TECH,
    subtheme: HEALTH_TECH,
  }, {});
  assert.notEqual(cls.stream, "internship-early-career");
  assert.equal(fallbackStreamFor(TECH, HEALTH_TECH, null), "entrepreneurship");
});

test("false links-below claims are scrubbed when no resources", () => {
  const raw = "Step 5 — Keep going. A mentor can refine this path for your exact goal; the links below are solid free starting points.";
  const scrubbed = scrubFalseLinkClaims(raw, []);
  assert.doesNotMatch(scrubbed, /links below/i);
  const kept = scrubFalseLinkClaims(raw, [{ title: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/" }]);
  assert.match(kept, /links below/i);
});

test("skill template includes mustKnow and resources path; beginner actions from zero", () => {
  const homes = homepagesFor("entrepreneurship", { question: "how can I develop my own application", context: "I don't know anything about coding" });
  const done = finishMentorAssist({ answer: "Too short.", actions: [], mistake: "", stripped: [] }, homes);
  assert.ok((done.mustKnow || []).length >= 2);
  assert.ok((done.resources || []).length >= 1);
  assert.deepEqual(done.actions, SKILL_TEMPLATE_ACTIONS);
  assert.doesNotMatch(done.answer, /links below/i);
});

test("PII is redacted before any LLM-shaped payload", () => {
  const r = redactQuestion({
    question: "Call me at 9876543210 or email vishnu@example.com about coding careers",
    context: "My name is Vishnu Kumar",
    name: "Vishnu Kumar",
    email: "vishnu@example.com",
  });
  assert.doesNotMatch(r.question + " " + r.context, /9876543210/);
  assert.doesNotMatch(r.question + " " + r.context, /vishnu@example\.com/i);
});

test("risk badge uses explainable reasons, not fake %", () => {
  const reasons = riskReasonsFrom({
    risk: "high",
    claimChecks: [{ status: "unsupported" }, { status: "supported" }],
    mode: "mentor-assist",
    flags: ["limited-sources"],
  });
  assert.ok(reasons.some(x => /unsupported/i.test(x)));
  assert.ok(reasons.some(x => /Limited sources/i.test(x)));
  const label = riskBadgeLabel("high", reasons);
  assert.doesNotMatch(label, /%\s*confidence/i);
});

test("GPT credit fallback flips draft model only after quota/billing errors", () => {
  resetGptCreditFallbackForTests();
  assert.equal(gptDraftOnFallback(), false);
  assert.equal(resolveGptDraftModel(HYBRID_DEFAULT_DRAFT_MODEL), HYBRID_DEFAULT_DRAFT_MODEL);
  noteGptCreditFailure(Object.assign(new Error("openai 429: RESOURCE_EXHAUSTED"), { status: 429, code: "RESOURCE_EXHAUSTED" }));
  assert.equal(gptDraftOnFallback(), true);
  assert.equal(resolveGptDraftModel(HYBRID_DEFAULT_DRAFT_MODEL), gptCreditFallbackModel());
  resetGptCreditFallbackForTests();
});

test("scope policy snapshot documents Phase 1 flags", () => {
  const s = scopePolicySnapshot();
  assert.equal(s.version, "v2");
  assert.equal(s.welcomeByDefault, true);
  assert.equal(s.allowScriptedOfftopic, false);
  assert.ok(s.gptCreditFallbackModel);
});
