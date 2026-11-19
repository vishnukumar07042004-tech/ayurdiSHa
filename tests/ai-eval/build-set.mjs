#!/usr/bin/env node
/**
 * Builds the frozen AI evaluation set `tests/ai-eval/eval-set.json` (~400 questions):
 *  - every hand-crafted tricky case (`tricky.json`: NEET-PG vs AIAPGET, countries, outdated
 *    fees / dates, medical questions, career questions that only sound medical, PII);
 *  - a round-robin-by-intent sample of the question bank (`data/qbank/*.json|jsonl`, ~45% of
 *    the set, expected stream from `intents.json`) and an evenly spaced sample of golden
 *    questions (`data/golden/*.json`, ~20%) when the knowledge-base build has produced them;
 *  - topped up from the merge benchmark fixture (realistic, noisy student wording), sampled
 *    round-robin by intent so every topic is represented, with synthetic PII injected into
 *    every 8th item to measure leakage.
 * Deterministic: same inputs → same file. Re-run only when you deliberately refresh the set.
 *
 *   node tests/ai-eval/build-set.mjs [--size 400]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");
const OUT = path.join(DIR, "eval-set.json");
const argSize = process.argv.indexOf("--size");
const SIZE = argSize > 0 ? Number(process.argv[argSize + 1]) || 400 : 400;

const FAKE_PEOPLE = [
  ["Pooja Verma", "pooja.verma21@gmail.com", "+91 98111 22334"],
  ["Rahul Deshpande", "rahul.d@outlook.com", "9822001122"],
  ["Fathima Beevi", "fathima.b@yahoo.in", "+91-94470-55667"],
  ["Suresh Patil", "sureshpatil.bams@gmail.com", "080 4123 4567"],
  ["Divya Krishnan", "divya.k@college.edu.in", "9445566778"],
];

function readJsonMaybe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function readQbank() {
  const dir = path.join(ROOT, "data/qbank");
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files.sort()) {
    const p = path.join(dir, f);
    if (f.endsWith(".jsonl")) {
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean)) {
        try { out.push(JSON.parse(line)); } catch { /* skip */ }
      }
    } else if (f.endsWith(".json")) {
      const j = readJsonMaybe(p);
      const list = Array.isArray(j) ? j : j && [j.questions, j.items].find(Array.isArray);
      if (Array.isArray(list)) out.push(...list);
    }
  }
  return out.filter(q => q && (q.question || q.text));
}

function readGolden() {
  const dir = path.join(ROOT, "data/golden");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort(); } catch { return []; }
  return files.map(f => readJsonMaybe(path.join(dir, f))).filter(g => g && g.question);
}

const tricky = readJsonMaybe(path.join(DIR, "tricky.json")) || [];
const items = tricky.map(t => ({ source: "tricky", ...t, context: t.context || "" }));

/** Stream per intent from `data/qbank/intents.json`, used as the expected persona routing. */
function readIntentStreams() {
  const list = readJsonMaybe(path.join(ROOT, "data/qbank/intents.json"));
  return new Map((Array.isArray(list) ? list : []).filter(i => i && i.intentId && i.stream).map(i => [i.intentId, i.stream]));
}

/** One question per intent per round, so every topic is represented before any repeats. */
function sampleByIntent(list, cap) {
  const groups = new Map();
  for (const q of list) {
    const k = q.intentId || q.intent || "other";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(q);
  }
  const keys = [...groups.keys()].sort();
  const out = [];
  for (let round = 0; out.length < cap && keys.some(k => groups.get(k).length > round); round++) {
    for (const k of keys) {
      if (out.length >= cap) break;
      const q = groups.get(k)[round];
      if (q) out.push(q);
    }
  }
  return out;
}

const intentStreams = readIntentStreams();
const QBANK_CAP = Math.max(0, Math.round(SIZE * 0.45));
const GOLDEN_CAP = Math.max(0, Math.round(SIZE * 0.2));
const qbank = sampleByIntent(readQbank(), QBANK_CAP)
  .map(q => (q.stream || !intentStreams.has(q.intentId) ? q : { ...q, stream: intentStreams.get(q.intentId) }));
qbank.forEach((q, i) => {
  const item = {
    id: `QB-${String(q.id || i).slice(0, 40)}`,
    source: "qbank",
    tags: ["qbank", ...(q.tags || [])],
    theme: q.theme || "",
    subtheme: q.subtheme || "",
    question: q.question || q.text,
    context: q.context || "",
    expect: { route: q.medical ? "mentor" : "draft", ...(q.stream ? { stream: q.stream } : {}), ...(q.medical ? { medical: true } : {}) },
  };
  if (i % 8 === 4) {
    const [name, email, phone] = FAKE_PEOPLE[(i >> 3) % FAKE_PEOPLE.length];
    item.name = name;
    item.email = email;
    item.context = `${item.context ? `${item.context} ` : ""}My ticket is 11WAC/2026/${String(1000 + i).slice(-4)}; ${name}, ${email}, ${phone}.`.trim();
    item.tags.push("pii");
  }
  items.push(item);
});

const golden = readGolden();
const goldenStep = Math.max(1, Math.ceil(golden.length / Math.max(1, GOLDEN_CAP)));
for (const g of golden.filter((_, i) => i % goldenStep === 0).slice(0, GOLDEN_CAP)) {
  items.push({
    id: `GD-${g.intentId}`,
    source: "golden",
    tags: ["golden", String(g.status || "draft")],
    theme: g.theme || "",
    subtheme: g.subtheme || "",
    question: g.question,
    context: "",
    expect: { route: "draft", ...(g.stream ? { stream: g.stream } : {}) },
    golden: { intentId: g.intentId, status: g.status || "draft" },
  });
}

const fixture = readJsonMaybe(path.join(ROOT, "tests/fixtures/merge-1200.json"));
const pool = (fixture && fixture.subs) || [];
const byIntent = new Map();
for (const s of pool) {
  const k = s.intent || s.fam || "other";
  if (!byIntent.has(k)) byIntent.set(k, []);
  byIntent.get(k).push(s);
}
const intents = [...byIntent.keys()].sort();
let round = 0;
let n = 0;
while (items.length < SIZE && intents.some(k => byIntent.get(k).length > round)) {
  for (const k of intents) {
    if (items.length >= SIZE) break;
    const s = byIntent.get(k)[round];
    if (!s) continue;
    const item = {
      id: `FX-${s.id}`,
      source: "merge-fixture",
      tags: ["fixture", k],
      theme: s.theme,
      subtheme: s.subtheme,
      question: s.question,
      context: s.context || "",
      expect: { route: "draft" },
    };
    if (n % 8 === 0) {
      const [name, email, phone] = FAKE_PEOPLE[(n / 8) % FAKE_PEOPLE.length];
      item.name = name;
      item.email = email;
      item.context = `${item.context ? `${item.context} ` : ""}I am ${name}, reach me at ${email} or ${phone}.`.trim();
      item.tags.push("pii");
    }
    items.push(item);
    n++;
  }
  round++;
}

const set = {
  version: 1,
  builtAt: new Date().toISOString().slice(0, 10),
  counts: {
    total: items.length,
    tricky: items.filter(i => i.source === "tricky").length,
    qbank: items.filter(i => i.source === "qbank").length,
    golden: items.filter(i => i.source === "golden").length,
    fixture: items.filter(i => i.source === "merge-fixture").length,
    medical: items.filter(i => i.expect && i.expect.medical).length,
    pii: items.filter(i => (i.tags || []).includes("pii")).length,
  },
  items,
};
fs.writeFileSync(OUT, `${JSON.stringify(set, null, 1)}\n`);
console.log(`eval set → ${path.relative(ROOT, OUT)}`, set.counts);
