import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY_DATES,
  META_DESCRIPTION,
  PROMISE_SHORT,
  PLAN_MODE,
  isIntakeOpen,
  intakeClosesAt,
  formatKeyDate,
  intakeStatusLine,
  DATES_ANNOUNCED_COPY,
} from "../shared/productConfig.js";
import { detectAskSafetyFlags } from "../shared/askSafety.js";
import { TRACKS, resolveTrackSelection, LEGACY_THEME_TO_TRACK } from "../shared/tracks.js";
import {
  LIVE_SLOT_RULES,
  liveSlotEligibility,
  institutionSeatCap,
  splitPreBookAndDraw,
} from "../shared/liveSlotRules.js";
import { normalizeAskRecord, normalizeConsent } from "../shared/askOptions.js";

test("deadline fields default empty; congress event days stay informational", () => {
  assert.equal(KEY_DATES.intakeClosesAt, "");
  assert.equal(KEY_DATES.intakeOpensAt, "");
  assert.equal(KEY_DATES.mentorBriefsAt, "");
  assert.equal(KEY_DATES.rosterConfirmedAt, "");
  assert.equal(KEY_DATES.answerBankPublishAt, "");
  assert.equal(KEY_DATES.congressStart, "2026-12-10");
  assert.equal(KEY_DATES.congressEnd, "2026-12-13");
  assert.equal(intakeClosesAt(), null);
  assert.equal(PLAN_MODE, "free");
});

test("intake stays open when close date is unset; closes only after a set date", () => {
  assert.equal(isIntakeOpen(Date.now()), true);
  assert.equal(isIntakeOpen(Date.parse("2030-01-01T00:00:00+05:30")), true);
  const closed = { ...KEY_DATES, intakeClosesAt: "2026-11-25" };
  assert.equal(isIntakeOpen(Date.parse("2026-11-20T12:00:00+05:30"), closed), true);
  assert.equal(isIntakeOpen(Date.parse("2026-11-25T23:59:00+05:30"), closed), true);
  assert.equal(isIntakeOpen(Date.parse("2026-11-26T00:00:01+05:30"), closed), false);
});

test("intake status line has no hard-coded close date when unset", () => {
  assert.equal(intakeStatusLine(), DATES_ANNOUNCED_COPY);
  assert.doesNotMatch(intakeStatusLine(), /25 Nov|November 25|2026-11-25/i);
  assert.match(intakeStatusLine({ ...KEY_DATES, intakeClosesAt: "2026-12-01" }), /1 Dec|Dec 2026|December/i);
  assert.equal(formatKeyDate(""), "");
});

test("meta and promise never guarantee a personal mentor slot", () => {
  for (const s of [META_DESCRIPTION, PROMISE_SHORT]) {
    assert.match(s, /answer bank|cluster/i);
    assert.doesNotMatch(s, /personal mentor (reply|letter) guaranteed/i);
    assert.match(s, /not a personal/i);
  }
  assert.match(META_DESCRIPTION, /Janata Maidan/i);
});

test("nine product tracks T1–T9; legacy themes map without drop", () => {
  assert.equal(TRACKS.length, 9);
  assert.equal(TRACKS[0].code, "T1");
  assert.equal(TRACKS[8].code, "T9");
  assert.equal(LEGACY_THEME_TO_TRACK["Brand Building & Communication"], "T8");
  assert.equal(LEGACY_THEME_TO_TRACK["Practice Abroad & Practitioner Mobility"], "T1");
  const r = resolveTrackSelection("Research, Evidence & Publication");
  assert.equal(r.trackCode, "T3");
  assert.ok(r.theme);
});

test("safety detector flags; never invents block semantics", () => {
  const clean = detectAskSafetyFlags("How do I choose a PG branch for Kayachikitsa?", "", "");
  assert.deepEqual(clean.flags, []);
  const pii = detectAskSafetyFlags("My patient ID is UHID 12345 and lab report shows…", "", "");
  assert.ok(pii.flags.includes("patient-detail") || pii.flags.includes("pii-or-identifier") || pii.medical);
});

test("four consents normalise; unticked stay absent", () => {
  assert.equal(normalizeConsent(true), "Yes");
  assert.equal(normalizeConsent(false), "No");
  assert.equal(normalizeConsent(""), "");
  const rec = normalizeAskRecord({
    id: "x", ticket: "AYM-Q-x", question: "What licences do I need to open a small clinic after internship?",
    consentAnonPublish: true, consentFollow: false, safetyFlags: ["pii-or-identifier"],
  });
  assert.equal(rec.consentAnonPublish, "Yes");
  assert.equal(rec.consentFollow, "No");
  assert.ok(!rec.consentNamedDisplay);
  assert.deepEqual(rec.safetyFlags, ["pii-or-identifier"]);
});

test("live-slot rules: eligibility, institution cap, 80/20 split", () => {
  assert.equal(LIVE_SLOT_RULES.automationMayDecideAccess, false);
  assert.equal(liveSlotEligibility({ registered: "Yes", inPerson: "Yes" }).eligible, true);
  assert.equal(liveSlotEligibility({ registered: "No", inPerson: "Yes" }).eligible, false);
  assert.equal(institutionSeatCap(100), 10);
  assert.equal(institutionSeatCap(0), 0);
  const split = splitPreBookAndDraw(100);
  assert.equal(split.draw, 20);
  assert.equal(split.preBook, 80);
});
