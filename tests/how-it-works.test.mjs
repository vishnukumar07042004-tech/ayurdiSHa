/**
 * How it works explainer: the public page must match Register, Ask Desk, Track
 * and the privacy rules — and must not invent a turnaround, a stat or an auto-publish.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  HOW_AUDIENCE, HOW_FAQS, HOW_JOURNEY, HOW_PATH, HOW_PRIVACY, HOW_QUESTION, HOW_STEPS,
} from "../src/content/howItWorks.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const header = read("src/AppHeader.jsx");
const app = read("src/App.jsx");
const page = read("src/pages/HowItWorksPage.jsx");
const footer = read("src/SiteFooter.jsx");

test("How It Works is its own route in the primary nav, footer and router", () => {
  assert.equal(HOW_PATH, "/how-it-works");
  assert.match(header, /key: "how"[\s\S]*?label: "How It Works"[\s\S]*?to: "\/how-it-works"/);
  assert.match(footer, /<Link to="\/how-it-works">How It Works<\/Link>/);
  assert.match(app, /<Route path="\/how-it-works" element={<HowItWorksPage \/>} \/>/);
});

test("the seven flow steps name Ask through Act", () => {
  assert.deepEqual(HOW_STEPS.map((s) => s.title), ["Ask", "Tag", "Cluster", "Spotlight", "Answer", "Meet", "Act"]);
  const blob = HOW_STEPS.map((s) => `${s.lead} ${s.do} ${s.get} ${s.time}`).join(" ");
  assert.match(blob, /one focused career question/i);
  assert.match(blob, /AYM-Q-/);
  assert.match(blob, /T1–T9|T1-T9|tracks T1/);
  assert.match(blob, /answer bank|clustered/i);
  assert.match(blob, /Bhubaneswar/);
  assert.match(blob, /in-person|live/i);
  assert.match(blob, /Action Card|next step/i);
});

test("audience, question, journey and privacy stay accurate", () => {
  assert.deepEqual(HOW_AUDIENCE.groups.map((g) => g.kicker), ["WAC delegates", "Students and practitioners", "Guests"]);
  assert.ok(HOW_QUESTION.examples.length >= 3);
  assert.ok(HOW_QUESTION.avoid.some((line) => /treatment|Prakriti/i.test(line)));
  const journey = HOW_JOURNEY.steps.map((s) => s.body).join(" ");
  assert.match(journey, /DISHA/);
  assert.match(journey, /person approves|official approves/i);
  assert.match(journey, /Nothing is emailed as the answer/);
  assert.match(journey, /Medical questions are not drafted/);
  assert.doesNotMatch(journey, /auto-?publish/i);
  assert.match(HOW_PRIVACY.lead + HOW_PRIVACY.points.map((p) => p.body).join(" "), /masked/);
  assert.match(HOW_PRIVACY.points.map((p) => p.title).join(" "), /consent/i);
});

test("FAQ is a short set of real desk questions, with no fake counts", () => {
  assert.ok(HOW_FAQS.length >= 5 && HOW_FAQS.length <= 8);
  const blob = HOW_FAQS.map((f) => `${f.q} ${f.a}`).join(" ");
  assert.match(blob, /no fixed|no promised/i);
  assert.match(blob, /on its own|until an official approves/i);
  assert.doesNotMatch(blob, /\b\d{1,3},\d{3}\b/);
  assert.doesNotMatch(blob, /auto-?publish/i);
});

test("the page renders every section and the secondary actions", () => {
  for (const id of ["hiw-steps", "hiw-who", "hiw-question", "hiw-after", "hiw-privacy", "hiw-congress", "hiw-faq"]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /Enter the Hall/);
  assert.match(page, /Register & ask/);
  assert.match(page, /Track my answer/);
  assert.match(page, /prefers-reduced-motion|scrollToId/);
});
