/**
 * Merge benchmark guards (tests/fixtures/merge-benchmark.json, scripts/merge-benchmark.mjs).
 * - The live shared merge keeps its hard guarantees on a realistic 539-question desk.
 * - The benchmark-tuned candidate (scripts/bench/merge-candidate.js) keeps its held-out gains
 *   over the frozen pre-tuning module (scripts/bench/merge-v1.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as live from "../shared/merge.js";
import * as v1 from "../scripts/bench/merge-v1.js";
import * as cand from "../scripts/bench/merge-candidate.js";

const data = JSON.parse(fs.readFileSync(new URL("./fixtures/merge-benchmark.json", import.meta.url), "utf8"));
const ALL = data.questions;
const TEST = ALL.filter(q => q.split === "test");

function idFactory() {
  let n = 0;
  return () => `AYM-C-T${String(++n).padStart(4, "0")}`;
}

function pairwise(clusters, items) {
  const byId = new Map(items.map(q => [q.id, q]));
  const size = new Map();
  items.forEach(q => size.set(q.intent, (size.get(q.intent) || 0) + 1));
  let truth = 0;
  size.forEach(n => { truth += (n * (n - 1)) / 2; });
  let pred = 0;
  let tp = 0;
  let crossTheme = 0;
  clusters.forEach(c => {
    const m = c.memberIds.map(id => byId.get(id));
    if (new Set(m.map(x => x.theme)).size > 1) crossTheme++;
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { pred++; if (m[i].intent === m[j].intent) tp++; }
  });
  return { P: pred ? tp / pred : 1, R: truth ? tp / truth : 1, crossTheme };
}

test("benchmark fixture: 500–600 labelled questions, ~30% of intents held out", () => {
  assert.ok(ALL.length >= 500 && ALL.length <= 600, `${ALL.length} questions`);
  assert.ok(data.intents.length >= 60, `${data.intents.length} intents`);
  const testShare = data.intents.filter(i => i.split === "test").length / data.intents.length;
  assert.ok(testShare > 0.25 && testShare < 0.36, `test share ${testShare.toFixed(2)}`);
  assert.equal(new Set(ALL.map(q => q.id)).size, ALL.length, "unique ids");
  ALL.forEach(q => assert.ok(q.theme && q.intent && q.question, q.id));
});

test("live merge on the benchmark desk: every question once, cap honoured, never across themes", () => {
  [0.3, 0.45, 0.6].forEach(t => [true, false].forEach(useSub => {
    const out = live.buildClusters(ALL, t, useSub, [], { idFactory: idFactory() });
    const audit = live.auditClusters(out, ALL);
    assert.deepEqual([audit.unclustered.length, audit.duplicated.length, audit.orphaned.length], [0, 0, 0], `t=${t} sub=${useSub}`);
    assert.ok(out.every(c => c.memberIds.length <= live.MERGE_DEFAULTS.maxPack));
    assert.equal(pairwise(out, ALL).crossTheme, 0);
  }));
});

test("candidate: AIAPGET and 'PG entrance' are one concept; NEET-PG is a different exam", () => {
  const a = cand.analyzeQuestion("How should I prepare for AIAPGET?");
  const b = cand.analyzeQuestion("How to prepare for PG entrance exam after BAMS?");
  const n = cand.analyzeQuestion("Are BAMS doctors eligible for NEET-PG exam?");
  assert.ok(a.set.has("aiapget") && b.set.has("aiapget") && !a.set.has("pg"));
  assert.ok(n.set.has("neetpg") && !n.set.has("aiapget"));
  assert.ok(cand.scorePair({ question: "How should I prepare for AIAPGET?" }, { question: "How to prepare for PG entrance exam after BAMS?" }) >= 0.9);
  assert.ok(cand.scorePair({ question: "Are BAMS doctors eligible for NEET-PG exam?" }, { question: "How should I prepare for AIAPGET?" }) < 0.1);
});

test("candidate: synonyms line up allopathy / CCRAS / PhD asks that v1 kept apart", () => {
  const T = 0.45;
  [
    ["Can BAMS doctors prescribe allopathic medicines?", "Is it legal for me to give allopathy medicines in my clinic?"],
    ["How to get a job in CCRAS?", "Does CCRAS hire BAMS graduates without MD?"],
    ["How do I get into a PhD in Ayurveda?", "Which universities offer PhD in Ayurveda and how to apply?"],
  ].forEach(([x, y]) => {
    assert.ok(v1.scorePair({ question: x }, { question: y }) < T, `v1 "${x}"`);
    assert.ok(cand.scorePair({ question: x }, { question: y }) >= T, `candidate "${x}" ~ "${y}"`);
  });
});

test("candidate: different PG branches or countries are pushed apart (contrast rule)", () => {
  const s = (x, y) => cand.scorePair({ question: x }, { question: y });
  assert.ok(s("Is Shalya a good PG branch if I like surgery?", "Is Kayachikitsa a good PG branch for clinical practice?") < 0.3);
  assert.ok(s("Ayurveda career in the US — license and scope?", "dubai me bams ke liye license kaise milega?") < 0.3);
  const a = cand.analyzeQuestion("Is MD Kayachikitsa worth it?");
  assert.equal(cand.contrastFactor(a, cand.analyzeQuestion("Is MD Shalya worth it?")), 0.5);
  assert.equal(cand.contrastFactor(a, cand.analyzeQuestion("Career options after MD Kayachikitsa?")), 1);
  assert.equal(cand.contrastFactor(a, cand.analyzeQuestion("Is MD worth it?")), 0.8);
});

test("candidate: the group's shown question is the most central member, not the longest", () => {
  const PG = ["Academics, Teaching & Higher Education", "Choosing a PG branch"];
  const subs = [
    "How should I prepare for AIAPGET?",
    "AIAPGET preparation tips please",
    "aiapget ki taiyari kaise kare",
    "Can I prepare for AIAPGET while doing a rural internship posting far from home?",
  ].map((question, i) => ({ id: `r${i}`, theme: PG[0], subtheme: PG[1], question, createdAt: i }));
  const out = cand.buildClusters(subs, 0.45, true, [], { idFactory: idFactory() });
  const g = out.find(c => c.memberIds.includes("r0"));
  assert.ok(g.memberIds.length >= 3);
  assert.notEqual(g.representative, subs[3].question);
});

test("candidate beats v1 on held-out intents at the recommended 0.45 (precision and recall)", () => {
  const base = pairwise(v1.buildClusters(TEST, 0.42, true, [], { idFactory: idFactory() }), TEST);
  const next = pairwise(cand.buildClusters(TEST, 0.45, true, [], { idFactory: idFactory() }), TEST);
  assert.equal(next.crossTheme, 0);
  assert.ok(next.P >= 0.85, `precision ${next.P.toFixed(3)}`);
  assert.ok(next.P > base.P, `precision ${next.P.toFixed(3)} vs v1 ${base.P.toFixed(3)}`);
  assert.ok(next.R > base.R * 1.25, `recall ${next.R.toFixed(3)} vs v1 ${base.R.toFixed(3)}`);
});

test("candidate is deterministic under input order", () => {
  const norm = cl => cl.map(c => [...c.memberIds].sort().join("|")).sort();
  const a = cand.buildClusters(ALL, 0.45, true, [], { idFactory: idFactory() });
  const b = cand.buildClusters([...ALL].reverse(), 0.45, true, [], { idFactory: idFactory() });
  assert.deepEqual(norm(a), norm(b));
});
