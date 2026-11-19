import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildClusters, auditClusters, analyzeQuestion, scorePair, stripBoilerplate, tidyQuestion,
  typoFoldMap, MERGE_DEFAULTS,
} from "../shared/merge.js";

const PG = ["Academics, Teaching & Higher Education", "Choosing a PG branch"];
const CLINIC = ["Clinical Practice & Integrative Care", "Setting up private practice"];
const ABROAD = ["Practice Abroad & Practitioner Mobility", "Country-wise recognition"];
const NS = ["Not sure — help me classify", ""];
const T = MERGE_DEFAULTS.threshold;

let seq = 0;
const q = (id, [theme, subtheme], question, context = "") =>
  ({ id, theme, subtheme, question, context, createdAt: 1_700_000_000_000 + ++seq });
const ids = () => { let n = 0; return () => `AYM-C-A${String(++n).padStart(3, "0")}`; };
const groupOf = (cl, id) => cl.find(c => c.memberIds.includes(id));

/* ---------------- boilerplate ---------------- */

test("boilerplate: greetings, self-introductions and sign-offs are ignored", () => {
  assert.equal(stripBoilerplate("Sir, I am a final year BAMS student. How to prepare for AIAPGET? Please guide."), "How to prepare for AIAPGET?");
  assert.equal(stripBoilerplate("Respected mentor, what should I do after BAMS? Thank you."), "what should I do after BAMS?");
  assert.equal(stripBoilerplate("I am an intern from Kerala, can I practise in UK?"), "can I practise in UK?");
  assert.equal(stripBoilerplate("I am confused about my career after BAMS"), "I am confused about my career after BAMS");
  assert.equal(stripBoilerplate("Sir please guide"), "Sir please guide", "a question that is only boilerplate is kept");
  const a = analyzeQuestion("I am a final year BAMS student. Which licence do I need for a clinic?");
  const b = analyzeQuestion("I am a final year BAMS student. How do I get my first patients?");
  assert.ok(!a.set.has("final") && !a.set.has("year"));
  assert.equal([...a.set].filter(t => b.set.has(t)).length, 0, "self-introductions share no tokens");
});

test("tokeniser: B.A.M.S. with dots is BAMS, not an M.S. (PG) degree", () => {
  assert.ok(!analyzeQuestion("Kya B.A.M.S. ka future accha hai?").set.has("pg"));
  assert.ok(analyzeQuestion("Which M.S. branch is good?").set.has("pg"));
});

test("tokeniser: Hindi 'after BAMS' questions line up with the English ones", () => {
  const subs = [
    q("h1", NS, "What should I do after BAMS?"),
    q("h2", NS, "bams ke baad kya kare?"),
    q("h3", NS, "What are the best options after completing BAMS?"),
    q("h4", NS, "How do I patent my formulation?"),
  ];
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const g = groupOf(out, "h1");
  assert.ok(["h2", "h3"].every(id => g.memberIds.includes(id)), g.memberIds.join(","));
  assert.ok(!g.memberIds.includes("h4"));
});

/* ---------------- typos ---------------- */

test("typos: short misspellings snap onto known terms; real neighbours are protected", () => {
  const subs = ["How do I patetn my formulation", "crack aiaget entrance", "What sohuld I do", "how many patients", "my parents want PG"]
    .map((question, i) => ({ id: String(i), question }));
  const fold = typoFoldMap(subs);
  assert.equal(fold.get("patetn"), "patent");
  assert.equal(fold.get("aiaget"), "aiapget");
  assert.equal(fold.get("sohuld"), "should");
  assert.ok(!fold.has("patients") && !fold.has("parents"), "real words never fold");
  assert.ok(scorePair({ question: "How to patent my formulation?" }, { question: "How do I patetn my formulation?" }) >= T);
});

/* ---------------- ask-type (facet) damping ---------------- */

test("facets: same topic, different ask stays apart at the default threshold", () => {
  const pairs = [
    ["What licences do I need to open a clinic?", "How much money is needed to open a small clinic?"],
    ["Is BAMS recognised in the UK?", "Is BAMS recognised in the USA?"],
    ["Best books for AIAPGET preparation?", "What AIAPGET rank is needed for a government college?"],
    ["What licence do I need for my clinic?", "How do I get patients in my clinic?"],
  ];
  pairs.forEach(([x, y]) => {
    const s = scorePair({ question: x }, { question: y });
    assert.ok(s < T, `"${x}" vs "${y}" scored ${s.toFixed(3)}`);
  });
  const same = scorePair({ question: "What licences do I need to open a clinic?" }, { question: "Which licence is required to open an Ayurveda clinic?" });
  assert.ok(same >= T, `same ask scored ${same.toFixed(3)}`);
});

/* ---------------- domain vocabulary ---------------- */

test("vocabulary: same ask in different words clears the threshold", () => {
  const pairs = [
    ["What is the AIAPGET cut-off for a government seat?", "AIAPGET cutoff for govt seat?"],
    ["Can BAMS doctors prescribe modern medicine?", "Can BAMS doctors prescribe allopathic medicines?"],
    ["How to get a DHA licence to practise in Dubai?", "How to get a licence to practise Ayurveda in UAE?"],
    ["Do corporate hospitals hire BAMS doctors?", "Do corporate hospitals give jobs to BAMS doctors?"],
    ["How much investment is needed to start a clinic?", "What is the cost of starting a clinic?"],
    ["How do I use Instagram to grow my practice?", "How to use social media to grow my practice?"],
  ];
  pairs.forEach(([x, y]) => {
    const s = scorePair({ question: x }, { question: y });
    assert.ok(s >= T, `"${x}" vs "${y}" scored ${s.toFixed(3)}`);
  });
});

test("vocabulary: NEET-PG, budget vs licence, and 'posts' stay distinct asks", () => {
  const neet = analyzeQuestion("Are BAMS doctors eligible for NEET-PG?");
  assert.ok(neet.set.has("neetpg") && !neet.set.has("aiapget"));
  assert.ok(scorePair({ question: "Are BAMS doctors eligible for NEET-PG?" }, { question: "How should I prepare for AIAPGET?" }) < 0.1);
  assert.ok(scorePair({ question: "How to prepare for PG entrance exam?" }, { question: "How should I prepare for AIAPGET?" }) >= T);
  assert.ok(scorePair({ question: "What budget is needed to open a clinic?" }, { question: "Which licence is needed to open a clinic?" }) < T);
  assert.ok(!analyzeQuestion("How to write social media posts for my clinic?").set.has("job"), "'posts' is ambiguous — never a job");
  assert.ok(!analyzeQuestion("Do spas abroad hire BAMS doctors?").set.has("resort"), "a spa abroad is not a wellness resort");
});

/* ---------------- representative wording ---------------- */

test("representative: central, clean wording wins over the longest or Hinglish one", () => {
  const subs = [
    q("r1", PG, "Sir, I am a final year BAMS student from a small town. How should I prepare for AIAPGET? Please guide."),
    q("r2", PG, "AIAPGET ki taiyari kaise kare?"),
    q("r3", PG, "How to prepare for AIAPGET?"),
    q("r4", PG, "how should i prepare for aiapget"),
  ];
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const g = groupOf(out, "r3");
  assert.equal(g.memberIds.length, 4);
  assert.equal(g.representative, "How to prepare for AIAPGET?");
  assert.equal(g.representativeId, "r3");
  assert.ok(!g.variants.includes(g.representative));
});

test("representative: tidy drops greetings and doubled punctuation but never rewrites words", () => {
  assert.equal(tidyQuestion("sir, which pg branch has the best scope??"), "Which pg branch has the best scope?");
  assert.equal(tidyQuestion("Thank you"), "Thank you");
});

test("re-merge: an answered group keeps the wording students already saw", () => {
  const subs = [q("w1", CLINIC, "Licence to open a clinic?"), q("w2", CLINIC, "Which licence is required to open an Ayurveda clinic?")];
  const prev = [{ id: "AYM-C-LOCK", theme: CLINIC[0], subtheme: CLINIC[1], memberIds: ["w1", "w2"], representative: "Which licence is required to open an Ayurveda clinic?", variants: ["Licence to open a clinic?"], answer: "Register under…", status: "Published" }];
  const out = buildClusters(subs, T, true, prev, { idFactory: ids() });
  assert.equal(out[0].representative, prev[0].representative);
});

/* ---------------- scale benchmark guard ---------------- */

test("scale: 1,200 labelled questions — precision, recall, integrity and speed hold", () => {
  const { subs } = JSON.parse(fs.readFileSync(new URL("./fixtures/merge-1200.json", import.meta.url), "utf8"));
  const byId = new Map(subs.map(s => [s.id, s]));
  const t0 = performance.now();
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const ms = performance.now() - t0;
  const audit = auditClusters(out, subs);
  assert.deepEqual([audit.unclustered.length, audit.duplicated.length, audit.orphaned.length], [0, 0, 0]);
  let pairs = 0, tp = 0, wrong = 0;
  out.forEach(c => {
    const ms2 = c.memberIds.map(id => byId.get(id));
    assert.ok(ms2.length <= MERGE_DEFAULTS.maxPack);
    assert.equal(new Set(ms2.map(m => m.theme)).size, 1, "never mixes themes");
    assert.equal(new Set(ms2.map(m => m.subtheme)).size, 1, "keeps sub-areas apart");
    for (let i = 0; i < ms2.length; i++) for (let j = i + 1; j < ms2.length; j++) { pairs++; if (ms2[i].intent === ms2[j].intent) tp++; }
    if (ms2.length > 1) {
      assert.ok(c.memberIds.includes(c.representativeId));
      const rep = byId.get(c.representativeId);
      ms2.forEach(m => { if (m.intent !== rep.intent) wrong++; });
    }
  });
  const merged = out.filter(c => c.memberIds.length > 1).reduce((a, c) => a + c.memberIds.length, 0);
  assert.ok(tp / pairs >= 0.94, `pairwise precision ${(tp / pairs).toFixed(3)}`);
  assert.ok(wrong / subs.length <= 0.025, `wrong-answer rate ${((wrong / subs.length) * 100).toFixed(1)}%`);
  assert.ok(merged / subs.length >= 0.7, `merged ${((merged / subs.length) * 100).toFixed(1)}%`);
  assert.ok(ms < 2000, `1,200 questions merged in ${ms.toFixed(0)} ms`);
});

/* ---------------- held-out guard vs the pre-comparison engine ---------------- */

test("held-out: precision-first engine is safer than both frozen engines; auto + suggested recall beats them", async () => {
  const frozen = {
    baseline: await import("../scripts/bench/merge-a-live-oct24.js"),
    hybrid: await import("../scripts/bench/merge-live-hybrid-oct24.js"),
  };
  const { suggestMerges } = await import("../shared/merge.js");
  const load = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));
  const sets = {
    fresh: load("../scripts/bench/fresh-400.json").subs,
    heldout: load("./fixtures/merge-benchmark.json").questions.filter(x => x.split === "test"),
  };
  const score = (clusters, items) => {
    const byId = new Map(items.map(s => [String(s.id), s]));
    let tp = 0, wrong = 0;
    clusters.forEach(c => {
      const ms = c.memberIds.map(id => byId.get(String(id)));
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) if (ms[i].intent === ms[j].intent) tp++;
      if (ms.length > 1) { const rep = byId.get(c.representativeId) || ms[0]; ms.forEach(m => { if (m.intent !== rep.intent) wrong++; }); }
    });
    return { tp, wrong };
  };
  Object.entries(sets).forEach(([name, items]) => {
    const auto = buildClusters(items, T, true, [], { idFactory: ids() });
    const now = score(auto, items);
    let accepted = auto;
    suggestMerges(auto, items).forEach(s => {
      const A = accepted.find(c => c.id === s.a);
      const B = accepted.find(c => c.id === s.b);
      if (!A || !B || A.memberIds.length + B.memberIds.length > MERGE_DEFAULTS.maxPack) return;
      accepted = accepted.filter(c => c !== B).map(c => (c === A ? { ...A, memberIds: [...A.memberIds, ...B.memberIds] } : c));
    });
    const withSugg = score(accepted, items);
    Object.entries(frozen).forEach(([label, M]) => {
      const old = score(M.buildClusters(items, T, true, [], { idFactory: ids(), maxPack: 7, packTarget: 6, packFloor: 0.28 }), items);
      assert.ok(now.wrong <= old.wrong, `${name}: ${now.wrong} mis-served now vs ${old.wrong} (${label})`);
      assert.ok(withSugg.tp > old.tp, `${name}: ${withSugg.tp} same-intent pairs with suggestions vs ${old.tp} (${label})`);
    });
    assert.equal(now.wrong, 0, `${name}: the automatic tier mis-serves nobody`);
  });
});
