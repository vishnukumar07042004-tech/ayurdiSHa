/**
 * GPT-routed drafts (hybrid / openai) must not see the persona's Ask Desk `## Rules` /
 * `## Output` / `{"insufficient": true}` hatch — that conflict made mentor-assist decline on
 * thin sources (same root cause as faculty enrichment at 2026-11-09). Gemini keeps the full
 * persona for prompt caching.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { personaBrief, personaPrompt, usesGptDraftSystem } from "../../server/ai/runtime.js";
import { draftSystemFor } from "../../server/ai/draft.js";
import { MENTOR_ASSIST_RULES } from "../../server/ai/mentorAssist.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PERSONA_MD = readFileSync(path.join(ROOT, "server/ai/personas/clinical-practice.md"), "utf8");
// Body after the YAML front matter (personas/index.js loads this shape into `system`).
const PERSONA_BODY = PERSONA_MD.replace(/^---[\s\S]*?---\s*/, "").trim();
const PERSONA = { system: PERSONA_BODY };

test("personaBrief keeps identity + expertise and drops ## Rules / ## Output", () => {
  const brief = personaBrief(PERSONA);
  assert.match(brief, /experienced Ayurveda physician/i);
  assert.doesNotMatch(brief, /^##\s/m);
  assert.doesNotMatch(brief, /insufficient/);
  assert.doesNotMatch(brief, /## Rules/);
  assert.doesNotMatch(brief, /## Output/);
  assert.equal(personaBrief("Plain mentor, no sections."), "Plain mentor, no sections.");
  assert.equal(personaBrief(""), "");
  assert.ok(personaPrompt(PERSONA).includes("## Rules"));
});

test("usesGptDraftSystem is true for hybrid and openai only", () => {
  assert.equal(usesGptDraftSystem({ hybrid: true }), true);
  assert.equal(usesGptDraftSystem({ id: "openai" }), true);
  assert.equal(usesGptDraftSystem({ id: "gemini" }), false);
  assert.equal(usesGptDraftSystem(null), false);
});

test("GPT / hybrid mentor-assist prompt has no Rules/Output/insufficient hatch; Gemini keeps them", () => {
  const gpt = draftSystemFor(PERSONA, { hybrid: true }, MENTOR_ASSIST_RULES);
  const openai = draftSystemFor(PERSONA, { id: "openai" }, MENTOR_ASSIST_RULES);
  const gemini = draftSystemFor(PERSONA, { id: "gemini" }, MENTOR_ASSIST_RULES);

  for (const sys of [gpt, openai]) {
    assert.match(sys, /experienced Ayurveda physician/i);
    assert.match(sys, /MENTOR-ASSIST MODE/);
    assert.match(sys, /Persona habits/);
    assert.doesNotMatch(sys, /## Rules \(always\)/);
    assert.doesNotMatch(sys, /## Output — return JSON only/);
    // Persona hatch gone; MENTOR_ASSIST medical rule still uses the word "insufficient".
    assert.doesNotMatch(sys, /If the SOURCES do not answer the core of what the student asked/);
  }

  assert.match(gemini, /## Rules \(always\)/);
  assert.match(gemini, /## Output — return JSON only/);
  assert.match(gemini, /If the SOURCES do not answer the core of what the student asked/);
  assert.match(gemini, /MENTOR-ASSIST MODE/);
  assert.doesNotMatch(gemini, /Persona habits/);
});
