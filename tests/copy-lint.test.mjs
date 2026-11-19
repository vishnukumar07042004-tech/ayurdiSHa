/**
 * Copy lint for user-facing strings (spec: docs/design/copy/ASK-CTA-AND-COPY-SPEC.md).
 * AYURDISHA serves anyone seeking career guidance in Ayurveda, so audience wording must not
 * read as BAMS-only. Factual BAMS mentions (eligibility, recognition, credentials) are allowed
 * through ALLOW below or by living in the excluded reference files.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Reference content where BAMS is the subject (degree facts, credentials), not the audience. */
const EXCLUDED = new Set([
  "src/mentors.js",
  "src/mentorDomains.js",
  "src/MentorCard.jsx",
  "src/podKnowledge.js",
  "src/podKnowledgeEnrichments.js",
  "src/podKnowledgeTabContent.js",
  "src/podcasts.js",
]);

const EXTRA_FILES = [
  "index.html",
  "server/mailer.js",
  "server/answerNotify.js",
  "server/ai/triageTemplates.js",
  "shared/triageRules.js",
];

/** Factual uses: medical officer posts require a BAMS degree; recognition rules are per degree. */
const ALLOW = [
  { file: "src/content/askPrompts.js", text: "AYUSH medical officer post after BAMS" },
  { file: "src/App.jsx", text: "AYUSH medical officer post after BAMS" },
  { file: "shared/triageRules.js", text: "AYUSH medical officer post after BAMS" },
  { file: "src/data/events.js", text: "legal recognition rules for BAMS graduates abroad" },
  { file: "src/App.jsx", text: "open a small Ayurveda clinic after BAMS?\", \"Maharashtra\"" },
];

const AUDIENCE_RULES = [
  [/\bfor BAMS (students|mentees|graduates|scholars)\b/i, "\"for BAMS students\" — say who else is welcome"],
  [/\bBAMS mentees?\b/i, "\"BAMS mentees\" — mentees are not only BAMS"],
  [/\bevery BAMS (student|graduate|mentee)s?\b/i, "\"every BAMS …\" excludes other seekers"],
  [/\bBAMS (students|graduates) only\b/i, "BAMS-only audience"],
  [/\bonly (for )?BAMS\b/i, "BAMS-only audience"],
  [/\bafter[- ]BAMS\b/i, "\"after BAMS\" — use \"next career step\" unless the fact is degree-specific"],
  [/\bBAMS students,? (and )?(interns|scholars)/i, "audience list that starts and ends with BAMS"],
  [/\bthousands of BAMS\b/i, "audience framed as BAMS only"],
];

const LABEL_RULES = [
  [/["'>]\s*Ask the desk\b/, "use the glossary label \"Ask Desk\""],
  [/\bAsk a Mentor\b/, "use \"Ask Desk\" (and sentence case)"],
  [/Track My Answer/, "sentence case: \"Track my answer\""],
  [/Open Theme Stage/, "sentence case: \"Open theme stage\""],
  [/\b1-on-1\b/, "use \"one-to-one\""],
  [/WAC registration number/i, "say \"WAC Delegate ID\" (linked) or \"AYURDISHA pass number\" — see displayPassId()"],
  [/\bWAC (reg\.? )?numbers?\b/i, "the app's number is the \"AYURDISHA pass number\"; WAC's is the \"WAC Delegate ID\""],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "staff") continue;
      walk(p, out);
    } else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function files() {
  const src = walk(join(ROOT, "src")).map((p) => relative(ROOT, p).split("\\").join("/"));
  return [...src.filter((f) => !EXCLUDED.has(f)), ...EXTRA_FILES];
}

/** Lines of copy only: drops whole-line comments and classifier regex rows. */
function copyLines(source) {
  return source.split("\n").map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\/?\*)/.test(line) && !line.includes("/\\b"));
}

function scan(rules, { allow = [] } = {}) {
  const hits = [];
  for (const file of files()) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const { line, n } of copyLines(text)) {
      for (const [re, why] of rules) {
        if (!re.test(line)) continue;
        if (allow.some((a) => a.file === file && line.includes(a.text))) continue;
        hits.push(`${file}:${n} — ${why}\n    ${line.trim().slice(0, 160)}`);
      }
    }
  }
  return hits;
}

test("no BAMS-only audience phrases in user-facing copy", () => {
  const hits = scan(AUDIENCE_RULES, { allow: ALLOW });
  assert.equal(hits.length, 0, `BAMS-only audience wording:\n${hits.join("\n")}`);
});

test("allow-list entries still match real lines (no stale exceptions)", () => {
  for (const a of ALLOW) {
    const text = readFileSync(join(ROOT, a.file), "utf8");
    assert.ok(text.includes(a.text), `stale allow-list entry for ${a.file}: ${a.text}`);
  }
});

test("CTA labels follow the glossary (Ask Desk, Track my answer, sentence case)", () => {
  const hits = scan(LABEL_RULES);
  assert.equal(hits.length, 0, `Off-glossary labels:\n${hits.join("\n")}`);
});

/** The AI assistant is called DISHA on staff screens and in the Track note (internal ids stay "ai"). */
const DISHA_RULES = [
  [/\bAI drafts\b/, "staff label: use DISHA_DRAFTS (\"DISHA drafts\")"],
  [/\bAI drafting\b/, "say \"DISHA\" in staff copy"],
  [/\bAI draft (ready|rejected)\b/, "badge: \"DISHA draft …\""],
  [/Prepared with AI assistance/, "use DISHA_TRACK_NOTE from the glossary"],
  [/reviewed by WAC officials/, "use DISHA_TRACK_NOTE from the glossary"],
];

function scanAll(rules) {
  const all = walkAll(join(ROOT, "src")).map((p) => relative(ROOT, p).split("\\").join("/"));
  const hits = [];
  for (const file of all) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const { line, n } of copyLines(text)) {
      for (const [re, why] of rules) if (re.test(line)) hits.push(`${file}:${n} — ${why}\n    ${line.trim().slice(0, 160)}`);
    }
  }
  return hits;
}

function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAll(p, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

test("the AI assistant is named DISHA in staff labels and the Track note", async () => {
  const hits = scanAll(DISHA_RULES);
  assert.equal(hits.length, 0, `Pre-DISHA AI wording:\n${hits.join("\n")}`);
  const g = await import("../src/content/glossary.js");
  assert.equal(g.DISHA_DRAFTS, "DISHA drafts");
  assert.equal(g.DISHA_ROLE, "DISHA — AI mentor assistant");
  assert.equal(g.DISHA_TRACK_NOTE, "Prepared with DISHA, our AI assistant, and reviewed by WAC mentors.");
  // The note still shows only on AI-assisted answers.
  const track = readFileSync(join(ROOT, "src/TrackAnswer.jsx"), "utf8");
  assert.match(track, /aiAssisted && <p className="trk-ai-note">\{DISHA_TRACK_NOTE\}<\/p>/);
  const app = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  assert.match(app, /c\.aiAssisted && <span className="air-assisted-note">\{DISHA_TRACK_NOTE\}<\/span>/);
});

test("the lint catches what it should", () => {
  const sample = [
    "Career guidance for BAMS students, interns and young practitioners.",
    "What should I do after BAMS?",
    "AYURDISHA is for BAMS mentees.",
  ];
  for (const s of sample) assert.ok(AUDIENCE_RULES.some(([re]) => re.test(s)), s);
  assert.ok(!AUDIENCE_RULES.some(([re]) => re.test("Can a BAMS graduate practise legally in the UAE?")));
  assert.ok(LABEL_RULES.some(([re]) => re.test('label: "Ask the desk"')));
  assert.ok(!LABEL_RULES.some(([re]) => re.test("Ask the help desk staff for it.")));
  assert.ok(LABEL_RULES.some(([re]) => re.test('label="WAC registration number"')));
  assert.ok(LABEL_RULES.some(([re]) => re.test("Your WAC number arrives automatically.")));
  assert.ok(!LABEL_RULES.some(([re]) => re.test('label="WAC Delegate ID"')));
  assert.ok(!LABEL_RULES.some(([re]) => re.test("Your AYURDISHA pass number")));
  assert.ok(DISHA_RULES.some(([re]) => re.test('label: "AI drafts"')));
  assert.ok(!DISHA_RULES.some(([re]) => re.test('label: "DISHA drafts"')));
});
