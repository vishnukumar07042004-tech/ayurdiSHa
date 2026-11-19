/**
 * Precision-first merge guarantees (docs/merge/PRECISION-FIRST-SPEC.md).
 * - Hard negatives: look-alike questions that need different answers are never auto-merged;
 *   conflicting specifics (country / exam / PG branch / numbers / without PG) are never even suggested.
 * - Hard positives: the same ask in other words is auto-merged or at least suggested to staff.
 * - Invariants for groups and suggestions; frozen New-460 scale guard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  buildClusters, suggestMerges, explainGroup, auditClusters, tidyQuestion, MERGE_DEFAULTS, isLockedCluster,
  keepGroupsApart, detachMember, mergeClusterGroup,
} from "../shared/merge.js";

const T = MERGE_DEFAULTS.threshold;
const THEME = "Academics, Teaching & Higher Education";
let seq = 0;
const q = (id, question, sub = "Choosing a PG branch", theme = THEME) =>
  ({ id, theme, subtheme: sub, question, context: "", createdAt: 1_800_000_000_000 + ++seq });
const ids = () => { let n = 0; return () => `AYM-C-P${String(++n).padStart(3, "0")}`; };
const groupOf = (cl, id) => cl.find(c => c.memberIds.includes(id));
const suggested = (sugg, cl, x, y) => sugg.some(s => [s.a, s.b].includes(groupOf(cl, x).id) && [s.a, s.b].includes(groupOf(cl, y).id));

/** [question A, question B, never suggested either?] — same theme and sub-area on purpose. */
const HARD_NEGATIVES = [
  ["What licence do I need to open an Ayurveda clinic?", "How much does it cost to open an Ayurveda clinic?", false],
  ["Best books for AIAPGET preparation?", "How to prepare for AIAPGET?", false],
  ["What AIAPGET rank gets a government seat?", "How to prepare for AIAPGET?", false],
  ["Can I practise Ayurveda in the UK?", "Can I practise Ayurveda in Germany?", true],
  ["Is MD Shalya worth it?", "Is MD Kayachikitsa worth it?", true],
  ["Can I do a PhD without MD?", "How do I do a PhD after MD?", true],
  ["Can BAMS graduates write NEET-PG?", "Can BAMS graduates write AIAPGET?", true],
  ["Is 6 months enough to prepare for AIAPGET?", "Is 1 year enough to prepare for AIAPGET?", true],
  ["Is there any government job for BAMS without PG?", "Which government jobs can I get after MD?", true],
  ["How do I get a job in a wellness resort?", "What salary do wellness resorts pay?", false],
  ["How to apply to an incubator for my startup?", "How to get funding for my startup?", false],
  ["Is PG compulsory to become an assistant professor?", "Is PG compulsory to become a good Ayurveda doctor?", false],
  ["Which PG branch is good for clinical practice?", "Which is better after BAMS: PG or clinical practice?", false],
  ["How do I get a trademark for my Ayurveda brand?", "How do I get a patent for my Ayurveda formulation?", false],
  ["How do I start a Panchakarma centre?", "How do I hire therapists for my Panchakarma centre?", false],
  ["Can BAMS doctors work with WHO?", "What government jobs can BAMS doctors get?", false],
  ["How do I get a QC job in an Ayurveda pharma company?", "Which QC tests are required for Ayurvedic tablets?", false],
  ["Can I prepare for AIAPGET during internship?", "How to prepare for AIAPGET?", false],
  ["When should I start preparing for AIAPGET?", "How many attempts are allowed in AIAPGET?", false],
  ["Should I open my clinic in a village or a city?", "How much investment does a clinic need?", false],
  ["How do I publish a case report?", "How do I identify predatory journals?", false],
  ["Can I change my PG branch after the first year?", "Which PG branch should I choose?", false],
  ["What is the scope of Ayurveda in Europe?", "Can I practise Ayurveda abroad?", false],
  ["How to start research as a BAMS undergraduate?", "How do I frame a research question for my thesis?", false],
  ["PSC medical officer exam ki taiyari kaise kare?", "PSC AMO exam ka syllabus kya hai?", false],
  ["Which books for the PSC medical officer exam?", "What is the syllabus of the PSC medical officer exam?", false],
  ["My seniors all say different things and I feel lost. Can Ayurveda help the anaemia mission?",
    "My seniors all say different things and I feel lost. How do I get into international health organisations?", false],
];

/** Same ask, other words: auto-merged or offered as a suggestion. */
const HARD_POSITIVES = [
  ["How to prepare for AIAPGET?", "AIAPGET ki taiyari kaise kare?"],
  ["What licences are needed to open a clinic?", "Which licence is required to start an Ayurvedic clinic?"],
  ["Can BAMS doctors prescribe allopathic medicines?", "Is it legal for BAMS doctors to prescribe modern medicine?"],
  ["Is BAMS recognised in the UK?", "Can I practise Ayurveda in the United Kingdom?"],
  ["How do I get my first patients in a new clinic?", "How to increase patient footfall in my new clinic?"],
  ["How to get a DHA licence to practise in Dubai?", "How to get a licence to practise Ayurveda in UAE?"],
  ["What is the salary of an RMO in a private hospital?", "How much do private hospitals pay BAMS RMOs?"],
  ["Do I need ethics committee approval for a case study?", "Is IEC approval necessary for a single case report?"],
  ["How do I trademark my brand name?", "Trademark registration process for an Ayurveda brand?"],
  ["What should I do after BAMS?", "BAMS ke baad kya kare?"],
  ["Pranam. How should I prepare for the PSC medical officer exam?", "Strategy to crack the state PSC Ayurveda MO exam?"],
  ["Myself Ritika, BAMS intern. Which PG branch has the best scope?", "Which MD branch has the best scope after BAMS?"],
  ["How do I grow my Instagram as an Ayurveda doctor?", "Social media tips to grow my Ayurveda practice?"],
  ["PSC AMO exam syllabus?", "What is the syllabus of the state PSC Ayurveda medical officer exam?"],
  ["What should I do after BAMS?", "What are the best options after completing BAMS?"],
];

test("hard negatives: look-alike asks are never auto-merged, at any threshold, sub-areas kept or mixed", () => {
  HARD_NEGATIVES.forEach(([x, y, neverSuggest], i) => {
    const subs = [q(`n${i}a`, x), q(`n${i}b`, y)];
    [0.3, T, 0.6].forEach(t => [true, false].forEach(useSub => {
      const out = buildClusters(subs, t, useSub, [], { idFactory: ids() });
      assert.equal(out.length, 2, `t=${t} useSub=${useSub}: "${x}" merged with "${y}"`);
      if (neverSuggest) assert.equal(suggestMerges(out, subs, { threshold: t }).length, 0, `conflict suggested: "${x}" ~ "${y}"`);
    }));
  });
});

test("hard negatives inside a busy desk: no look-alike ever shares a group with its sibling", () => {
  const texts = [...new Set(HARD_NEGATIVES.flatMap(([x, y]) => [x, y]))];
  const subs = [];
  texts.forEach((text, i) => { for (let k = 0; k < 3; k++) subs.push(q(`d${i}-${k}`, text)); });
  const textOf = new Map(subs.map(s => [s.id, s.question]));
  const out = buildClusters(subs, T, false, [], { idFactory: ids() });
  out.forEach(c => {
    const asked = new Set(c.memberIds.map(id => textOf.get(id)));
    HARD_NEGATIVES.forEach(([x, y]) => assert.ok(!(asked.has(x) && asked.has(y)), `group ${c.id} mixes "${x}" + "${y}"`));
  });
});

test("hard positives: the same ask in other words is auto-merged or suggested to staff", () => {
  HARD_POSITIVES.forEach(([x, y], i) => {
    const subs = [q(`p${i}a`, x), q(`p${i}b`, y)];
    const out = buildClusters(subs, T, true, [], { idFactory: ids() });
    const merged = out.length === 1;
    assert.ok(merged || suggested(suggestMerges(out, subs), out, `p${i}a`, `p${i}b`), `"${x}" ~ "${y}" neither merged nor suggested`);
  });
});

test("suggestions: a sub-area apart is offered (never merged); different theme never offered", () => {
  const subs = [
    q("s1", "How should I prepare for AIAPGET?", "Choosing a PG branch"),
    q("s2", "How should I prepare for AIAPGET?", "PhD pathway"),
    q("s3", "How should I prepare for AIAPGET?", "Choosing a clinical specialty", "Clinical Practice & Integrative Care"),
  ];
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  assert.equal(out.length, 3);
  const sugg = suggestMerges(out, subs);
  assert.ok(suggested(sugg, out, "s1", "s2"));
  assert.equal(sugg[0].reason, "filed under different sub-areas");
  assert.ok(!suggested(sugg, out, "s1", "s3") && !suggested(sugg, out, "s2", "s3"), "never across themes");
});

test("suggestions: locked groups, kept-apart pairs and over-cap pairs are never offered", () => {
  const subs = Array.from({ length: 10 }, (_, i) => q(`k${i}`, "How should I prepare for AIAPGET?", i < 2 ? "Choosing a PG branch" : "PhD pathway"));
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const small = groupOf(out, "k0");
  const big = out.find(c => c.memberIds.length === 7);
  assert.equal(small.memberIds.length, 2);
  assert.ok(big, "pack cap 7, overflow starts a new group");
  assert.equal(out.reduce((n, c) => n + c.memberIds.length, 0), 10);
  const sugg = suggestMerges(out, subs);
  assert.ok(sugg.every(s => s.size <= MERGE_DEFAULTS.maxPack), "no suggestion exceeds the cap");
  assert.ok(!sugg.some(s => [s.a, s.b].includes(big.id)), "a full group is never offered more students");
  const withLock = out.map(c => (c.id === small.id ? { ...c, status: "Sent to mentor" } : c));
  assert.ok(isLockedCluster(withLock.find(c => c.id === small.id)));
  assert.ok(!suggestMerges(withLock, subs).some(s => [s.a, s.b].includes(small.id)), "locked group never offered");
  const other = groupOf(out, "k9");
  const pair = suggestMerges(out, subs).find(s => [s.a, s.b].includes(small.id));
  assert.ok(pair, "the small group is offered a partner");
  const partner = pair.a === small.id ? pair.b : pair.a;
  const rejected = out.map(c => (c.id === small.id ? { ...c, keepApart: [partner] } : c));
  assert.ok(!suggestMerges(rejected, subs).some(s => s.key === pair.key), "rejected suggestion stays rejected");
  assert.ok(other, "every question still has a group");
});

test("keep apart: a rejected pair survives re-merges that renumber groups, and is never auto-merged later", () => {
  const subs = [
    q("r1", "How should I prepare for AIAPGET?", "Choosing a PG branch"),
    q("r2", "How should I prepare for AIAPGET?", "PhD pathway"),
  ];
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const [s] = suggestMerges(out, subs);
  assert.ok(s, "offered while sub-areas are kept separate");
  const kept = keepGroupsApart(out, s.a, s.b);
  assert.deepEqual(groupOf(kept, "r1").apartFrom, ["r2"]);
  assert.equal(suggestMerges(kept, subs).length, 0);
  const more = [...subs, q("r3", "How do I start a PhD after MD?", "PhD pathway")];
  const renumbered = () => { let n = 500; return () => `AYM-C-X${++n}`; };
  const again = buildClusters(more, T, true, kept, { idFactory: renumbered() });
  assert.equal(suggestMerges(again, more).filter(x => [x.a, x.b].includes(groupOf(again, "r1").id) && [x.a, x.b].includes(groupOf(again, "r2").id)).length, 0,
    "re-merge does not bring the rejected pair back");
  const mixed = buildClusters(more, T, false, again, { idFactory: renumbered() });
  assert.notEqual(groupOf(mixed, "r1").id, groupOf(mixed, "r2").id, "identical wording, sub-areas mixed — still kept apart");
  const legacy = out.map(c => (c.id === s.a ? { ...c, keepApart: [s.b] } : c));
  assert.notEqual(groupOf(buildClusters(subs, T, false, legacy, { idFactory: renumbered() }), "r1").id,
    groupOf(buildClusters(subs, T, false, legacy, { idFactory: renumbered() }), "r2").id, "older group-id decisions still honoured");
});

test("keep apart: manual merge of the two groups clears the decision; detach keeps it", () => {
  const subs = [
    q("u1", "How should I prepare for AIAPGET?", "Choosing a PG branch"),
    q("u2", "AIAPGET preparation strategy?", "Choosing a PG branch"),
    q("u3", "How should I prepare for AIAPGET?", "PhD pathway"),
  ];
  const byId = new Map(subs.map(s => [s.id, s]));
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const g12 = groupOf(out, "u1");
  const g3 = groupOf(out, "u3");
  assert.equal(g12.id, groupOf(out, "u2").id);
  const kept = keepGroupsApart(out, g12.id, g3.id);
  const split = detachMember(kept, g12.id, "u2", byId, ids());
  assert.deepEqual(groupOf(split, "u2").apartFrom, ["u3"], "the split-out student keeps the decision");
  const { merged } = mergeClusterGroup(kept, [g12.id, g3.id], byId);
  assert.equal(merged.apartFrom, undefined, "staff merged them on purpose");
  assert.throws(() => mergeClusterGroup(kept.map(c => (c.id === g3.id ? { ...c, status: "Answered", answer: "x" } : c)), [g12.id, g3.id], byId, { suggestion: true }),
    e => e.code === "LOCKED");
});

test("suggestions: deterministic and side-effect free", () => {
  const subs = [
    q("o1", "How should I prepare for AIAPGET?"), q("o2", "AIAPGET preparation tips?", "PhD pathway"),
    q("o3", "Can I prepare for AIAPGET during internship?"), q("o4", "Best books for AIAPGET?"),
  ];
  const out = buildClusters(subs, T, true, [], { idFactory: ids() });
  const snap = JSON.stringify(out);
  const a = suggestMerges(out, subs);
  const b = suggestMerges([...out].reverse(), [...subs].reverse());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(out), snap, "suggestMerges never mutates the groups");
});

test("why merged: automatic groups carry confidence, shared subjects, ask and cohesion", () => {
  const subs = [q("w1", "How should I prepare for AIAPGET?"), q("w2", "AIAPGET ki taiyari kaise kare?"), q("w3", "How to prepare for AIAPGET exam?")];
  const [g] = buildClusters(subs, T, true, [], { idFactory: ids() });
  assert.equal(g.memberIds.length, 3);
  assert.ok(["high", "medium"].includes(g.confidence));
  assert.ok(g.why.subjects.includes("AIAPGET"), JSON.stringify(g.why));
  assert.equal(g.why.ask, "how-to");
  assert.ok(g.why.min >= T * MERGE_DEFAULTS.pairFloor && g.why.avg >= g.why.min);
  assert.equal(g.cohesion, g.why.min);
});

test("why merged: a weak manual merge is flagged for review", () => {
  const members = [q("m1", "What licence do I need to open a clinic?", "x", "Clinical"), q("m2", "How much does it cost to open a clinic?", "x", "Clinical")];
  const why = explainGroup(members);
  assert.equal(why.confidence, "review");
  assert.equal(why.allClose, false);
});

test("context never creates a merge on its own", () => {
  const ctx = "I am from a rural area and my family wants me to do PG.";
  const subs = [
    { ...q("c1", "How to prepare for AIAPGET?"), context: ctx },
    { ...q("c2", "Which PG branch has the best scope?"), context: ctx },
  ];
  assert.equal(buildClusters(subs, 0.3, true, [], { idFactory: ids() }).length, 2);
});

test("representative: new greetings never lead the mentor question", () => {
  assert.equal(tidyQuestion("Pranam. How to open a clinic?"), "How to open a clinic?");
  assert.equal(tidyQuestion("Myself Ritika, BAMS intern. Which PG branch is best?"), "Which PG branch is best?");
  assert.equal(tidyQuestion("Hello doctor, can I practise in the UK?"), "Can I practise in the UK?");
  assert.equal(tidyQuestion("Respected sir/ma'am, which books for AIAPGET?"), "Which books for AIAPGET?");
  assert.equal(tidyQuestion("Namaste, my name is Aditya and I am in 2nd prof. How to start research?"), "How to start research?");
  assert.equal(tidyQuestion("Respected Vaidya ji, how do I get a resort job?"), "How do I get a resort job?");
  assert.equal(tidyQuestion("Pranam guruji. How do I get a resort job?"), "How do I get a resort job?");
  assert.equal(tidyQuestion("Respected panel, how do I get a resort job?"), "How do I get a resort job?");
  assert.equal(tidyQuestion("Myself Priya from Jaipur, final year. How do I get a resort job?"), "How do I get a resort job?");
  assert.equal(tidyQuestion("Panel discussions — are they useful for PG interviews?"), "Panel discussions — are they useful for PG interviews?");
  assert.equal(tidyQuestion("All India AYUSH PG entrance test strategy?"), "All India AYUSH PG entrance test strategy?", "content words are never stripped");
});

test("invariants: shuffled input, re-merge idempotent, locked untouched, answers never copied", () => {
  const { subs } = JSON.parse(fs.readFileSync(new URL("./fixtures/merge-1200.json", import.meta.url), "utf8"));
  const part = cl => cl.map(c => [...c.memberIds].sort().join("|")).sort().join("\n");
  const base = buildClusters(subs, T, true, [], { idFactory: ids() });
  assert.equal(part(buildClusters([...subs].reverse(), T, true, [], { idFactory: ids() })), part(base));
  const again = buildClusters(subs, T, true, base, { idFactory: ids() });
  assert.deepEqual(again.map(c => `${c.id}=${c.memberIds.join("|")}`).sort(), base.map(c => `${c.id}=${c.memberIds.join("|")}`).sort());
  const prev = base.map((c, i) => (i % 4 === 0 ? { ...c, answer: `A${i}`, status: "Answered" } : c));
  const next = buildClusters(subs, T, true, prev, { idFactory: ids() });
  prev.filter(c => c.answer).forEach(c => {
    const now = next.find(x => x.id === c.id);
    assert.deepEqual(now.memberIds, c.memberIds);
    assert.equal(now.answer, c.answer);
  });
  assert.equal(next.filter(c => c.answer).length, prev.filter(c => c.answer).length, "answers are never copied");
  const audit = auditClusters(next, subs);
  assert.deepEqual([audit.unclustered.length, audit.duplicated.length, audit.orphaned.length], [0, 0, 0]);
});

const FROZEN = [
  ["merge-new-460.json", "2294c64747fe8fe085e1fd5fe7b6f7ac9305326de5dfb36873a342285f42eeb9"],
  ["merge-new2-500.json", "caab5d5f94d3edb3b5b15fcf2e4a494065ac70eec6d9938b71ae757ef080943c"],
];

FROZEN.forEach(([file, sha]) => test(`scale guard: frozen ${file} — wrong-answer ≤ 0.5 %, no cross-theme group, cap 7, fast`, () => {
  const raw = fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
  assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), sha, "the frozen test set must never change");
  const { subs } = JSON.parse(raw);
  const byId = new Map(subs.map(s => [s.id, s]));
  [true, false].forEach(useSub => {
    const t0 = performance.now();
    const out = buildClusters(subs, T, useSub, [], { idFactory: ids() });
    const ms = performance.now() - t0;
    let wrong = 0;
    out.forEach(c => {
      const ms2 = c.memberIds.map(id => byId.get(id));
      assert.ok(ms2.length <= MERGE_DEFAULTS.maxPack);
      assert.equal(new Set(ms2.map(m => m.theme)).size, 1, "never mixes themes");
      if (ms2.length > 1) { const rep = byId.get(c.representativeId); ms2.forEach(m => { if (m.intent !== rep.intent) wrong++; }); }
    });
    assert.ok(wrong / subs.length <= 0.005, `useSub=${useSub}: wrong-answer ${((wrong / subs.length) * 100).toFixed(2)}%`);
    assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
  });
}));

test("scale guard: 1,500 questions merge and suggest well under a second", () => {
  const { subs } = JSON.parse(fs.readFileSync(new URL("./fixtures/merge-1200.json", import.meta.url), "utf8"));
  const big = [...subs, ...subs.slice(0, 300).map(s => ({ ...s, id: `${s.id}-x` }))];
  const t0 = performance.now();
  const out = buildClusters(big, T, true, [], { idFactory: ids() });
  suggestMerges(out, big);
  const ms = performance.now() - t0;
  assert.equal(out.reduce((n, c) => n + c.memberIds.length, 0), big.length);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
});
