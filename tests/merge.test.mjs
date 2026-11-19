import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClusters, mergeClusterGroup, detachMember, sanitizeClusters, auditClusters,
  scorePair, analyzeQuestion, suggestMerges, MERGE_DEFAULTS, MergeConflictError,
} from "../shared/merge.js";

const PG = ["Academics, Teaching & Higher Education", "Choosing a PG branch"];
const PHD = ["Academics, Teaching & Higher Education", "PhD pathway"];
const CLINIC = ["Clinical Practice & Integrative Care", "Setting up private practice"];
const PK = ["Clinical Practice & Integrative Care", "Panchakarma & therapy services"];
const STARTUP = ["Entrepreneurship & Start-ups", "Validating the idea"];
const ABROAD = ["Practice Abroad & Practitioner Mobility", "Country-wise recognition"];
const RESEARCH = ["Research, Evidence & Publication", "Framing a research question"];

let seq = 0;
function q(id, [theme, subtheme], question, context = "") {
  seq += 1;
  return { id, ticket: `AYM-Q-${id}`, theme, subtheme, question, context, createdAt: 1_700_000_000_000 + seq };
}

function idFactory() {
  let n = 0;
  return () => `AYM-C-T${String(++n).padStart(3, "0")}`;
}

function groupOf(clusters, id) {
  return clusters.find(c => c.memberIds.includes(id));
}

function sameGroup(clusters, ...ids) {
  const g = groupOf(clusters, ids[0]);
  return Boolean(g) && ids.every(id => g.memberIds.includes(id));
}

function assertIntegrity(clusters, subs, { useSub = true, maxPack = MERGE_DEFAULTS.maxPack } = {}) {
  const audit = auditClusters(clusters, subs);
  assert.deepEqual(audit.unclustered, [], "every question is in a group");
  assert.deepEqual(audit.duplicated, [], "no question is in two groups");
  assert.deepEqual(audit.orphaned, [], "no group points at a missing question");
  const ids = clusters.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, "group ids are unique");
  const byId = new Map(subs.map(s => [String(s.id), s]));
  clusters.forEach(c => {
    assert.ok(c.memberIds.length >= 1, "no empty group");
    assert.ok(c.memberIds.length <= maxPack, `pack cap ${maxPack} honoured (got ${c.memberIds.length})`);
    assert.equal(c.kind, c.memberIds.length >= 2 ? "merged" : "unique");
    const themes = new Set(c.memberIds.map(id => byId.get(id).theme));
    assert.equal(themes.size, 1, `group ${c.id} never mixes themes`);
    assert.equal(c.theme, [...themes][0]);
    if (useSub) {
      const subsets = new Set(c.memberIds.map(id => byId.get(id).subtheme));
      assert.equal(subsets.size, 1, `group ${c.id} keeps sub-areas apart`);
    }
  });
}

/* ---------------- tokenisation ---------------- */

test("tokeniser: PG / MD / postgraduate / AIAPGET collapse onto shared tokens", () => {
  const a = analyzeQuestion("Which MD branch should I choose?");
  const b = analyzeQuestion("Which post-graduation branch should I choose?");
  const c = analyzeQuestion("AIAPGET preparation strategy");
  assert.ok(a.set.has("pg") && b.set.has("pg") && c.set.has("pg"));
  assert.ok(c.set.has("aiapget") && c.set.has("prepare"));
});

test("tokeniser: Panchakarma spellings and stems line up", () => {
  const variants = ["Panchakarma", "panchkarma", "Pancha Karma", "panch-karma"];
  variants.forEach(v => assert.ok(analyzeQuestion(`${v} training`).set.has("panchakarma"), v));
  assert.ok(analyzeQuestion("preparing").set.has("prepare"));
  assert.ok(analyzeQuestion("licensing").set.has("licence"));
});

test("tokeniser: stopword-only question falls back instead of going empty", () => {
  const a = analyzeQuestion("What should I do after BAMS?");
  assert.ok(a.set.size > 0);
  assert.equal(a.fallback, true);
});

test("tokeniser: Devanagari and Hinglish keep topic words", () => {
  const dev = analyzeQuestion("बीएएमएस के बाद पीजी की तैयारी कैसे करें?");
  assert.ok(dev.set.has("pg") && dev.set.has("prepare"));
  const hing = analyzeQuestion("BAMS ke baad PG ki taiyari kaise kare?");
  assert.ok(hing.set.has("pg") && hing.set.has("prepare"));
  assert.ok(!hing.set.has("kaise") && !hing.set.has("baad"));
});

/* ---------------- pairwise scores ---------------- */

test("score: near-duplicates clear the default threshold", () => {
  const T = MERGE_DEFAULTS.threshold;
  const pairs = [
    ["How should I prepare for AIAPGET?", "AIAPGET preparation tips for final year BAMS"],
    ["How to prepare for PG entrance after BAMS?", "BAMS ke baad PG entrance ki taiyari kaise kare?"],
    ["Which PG branch is best for clinical practice?", "Which MD branch is best for clinical practise?"],
    ["Panchakarma training course duration?", "panchkarma traning course duraton"],
    ["What should I do after BAMS?", "what should i do after bams??"],
  ];
  pairs.forEach(([x, y]) => {
    const s = scorePair({ question: x }, { question: y });
    assert.ok(s >= T, `"${x}" ~ "${y}" scored ${s.toFixed(3)}`);
  });
});

test("score: distinct asks in the same sub-area stay below threshold", () => {
  const T = MERGE_DEFAULTS.threshold;
  const pairs = [
    ["What licences do I need to open a clinic?", "How do I get my first patients in a new clinic?"],
    ["How should I prepare for AIAPGET?", "Is Kayachikitsa or Shalya better for a PG branch with surgery interest?"],
    ["What should I do after BAMS?", "What should I do for research after BAMS?"],
  ];
  pairs.forEach(([x, y]) => {
    const s = scorePair({ question: x }, { question: y });
    assert.ok(s < T, `"${x}" vs "${y}" scored ${s.toFixed(3)}`);
  });
});

/* ---------------- automatic merge ---------------- */

test("merge: duplicates merge, distinct questions stay singletons", () => {
  const subs = [
    q("a1", PG, "How should I prepare for AIAPGET?"),
    q("a2", PG, "AIAPGET preparation tips for final year BAMS"),
    q("a3", PG, "How do I prepare for the AIAPGET PG entrance exam during internship?"),
    q("a4", PG, "aiapget ki taiyari kaise kare"),
    q("b1", PG, "Is Kayachikitsa or Shalya better if I like surgery?"),
    q("c1", CLINIC, "What licences do I need to open an Ayurveda clinic?"),
    q("c2", CLINIC, "Which licence is required to start a small Ayurvedic clinic?"),
    q("c3", CLINIC, "How do I get my first patients in a new clinic?"),
  ];
  const out = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.ok(sameGroup(out, "a1", "a2", "a4"), "AIAPGET asks merge");
  assert.ok(!sameGroup(out, "a1", "a3"), "'during internship' asks more than a general plan — never auto-merged");
  const sugg = suggestMerges(out, subs, { threshold: 0.42 });
  assert.ok(sugg.some(s => [s.a, s.b].includes(groupOf(out, "a3").id) && [s.a, s.b].includes(groupOf(out, "a1").id)),
    "…but staff are offered it as a suggested merge");
  assert.ok(!groupOf(out, "b1").memberIds.includes("a1"), "branch choice stays out of AIAPGET prep");
  assert.ok(sameGroup(out, "c1", "c2"), "clinic licence asks merge");
  assert.ok(!sameGroup(out, "c1", "c3"), "first-patients ask stays apart");
});

test("merge: same theme, different sub-area never merges when sub-areas are kept apart", () => {
  const subs = [
    q("p1", PG, "How do I prepare for PG and PhD entrance after BAMS?"),
    q("p2", PHD, "How do I prepare for PG and PhD entrance after BAMS?"),
  ];
  const kept = buildClusters(subs, 0.15, true, [], { idFactory: idFactory() });
  assertIntegrity(kept, subs, { useSub: true });
  assert.equal(kept.length, 2);
  const joined = buildClusters(subs, 0.42, false, [], { idFactory: idFactory() });
  assertIntegrity(joined, subs, { useSub: false });
  assert.equal(joined.length, 1, "identical wording merges once sub-areas are allowed to mix");
});

test("merge: different themes with overlapping words never merge, even at the lowest threshold", () => {
  const subs = [
    q("t1", PK, "How do I start a Panchakarma centre after BAMS?"),
    q("t2", STARTUP, "How do I start a Panchakarma centre after BAMS?"),
    q("t3", ABROAD, "Can I start a Panchakarma centre abroad after BAMS?"),
  ];
  [0.15, 0.42, 0.7].forEach(t => {
    const out = buildClusters(subs, t, false, [], { idFactory: idFactory() });
    assertIntegrity(out, subs, { useSub: false });
    assert.equal(out.length, 3, `threshold ${t}`);
  });
});

test("merge: very short questions", () => {
  const subs = [
    q("s1", PG, "PG?"),
    q("s2", PG, "MD?"),
    q("s3", PG, "post graduation?"),
    q("s4", PG, "Thesis?"),
    q("s5", PG, "?"),
  ];
  const out = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.ok(sameGroup(out, "s1", "s2", "s3"));
  assert.ok(!sameGroup(out, "s1", "s4"));
  assert.ok(groupOf(out, "s5"), "an empty question still gets a group");
});

test("merge: stopword-heavy questions", () => {
  const subs = [
    q("w1", PG, "Sir please tell me what should I do after BAMS?"),
    q("w2", PG, "What should I do after BAMS"),
    q("w3", PG, "what to do after bams sir??"),
    q("w4", PG, "What should I do after BAMS for research?"),
  ];
  const out = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.ok(sameGroup(out, "w1", "w2", "w3"));
});

test("merge: pack size cap of 7 is honoured and the 6–7 target is reached", () => {
  const forms = [
    "How should I prepare for AIAPGET?",
    "AIAPGET preparation strategy please",
    "Best way to prepare for AIAPGET in final year?",
    "aiapget ki taiyari kaise kare",
  ];
  const subs = Array.from({ length: 20 }, (_, i) => q(`cap${i}`, PG, forms[i % forms.length]));
  const out = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  assertIntegrity(out, subs);
  const sizes = out.map(c => c.memberIds.length).sort((a, b) => b - a);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 20);
  assert.ok(sizes.every(n => n <= 7), sizes.join(","));
  assert.ok(sizes[0] >= 6, `largest pack ${sizes[0]}`);
  const small = buildClusters(subs, 0.42, true, [], { idFactory: idFactory(), maxPack: 4 });
  assert.ok(small.every(c => c.memberIds.length <= 4));
});

test("merge: anti-chaining — a bridge question does not drag unrelated asks together", () => {
  const subs = [
    q("x1", CLINIC, "Licence needed to open a clinic in Kerala"),
    q("x2", CLINIC, "Licence needed to open a clinic and Panchakarma unit in Kerala"),
    q("x3", CLINIC, "Staff needed to run a Panchakarma unit"),
  ];
  const out = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.ok(!sameGroup(out, "x1", "x3"));
  assert.ok(!sameGroup(out, "x2", "x3"));
  const sugg = suggestMerges(out, subs, { threshold: 0.42 });
  const g = id => groupOf(out, id).id;
  assert.ok(sugg.some(s => [s.a, s.b].includes(g("x1")) && [s.a, s.b].includes(g("x2"))),
    "clinic licence vs clinic + Panchakarma unit licence: offered to staff, not auto-merged");
  assert.ok(!sugg.some(s => [s.a, s.b].includes(g("x1")) && [s.a, s.b].includes(g("x3"))), "licence vs staff is never suggested");
});

test("merge: deterministic — same input, same groups", () => {
  const subs = realisticCorpus();
  const a = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  const b = buildClusters([...subs].reverse(), 0.42, true, [], { idFactory: idFactory() });
  const norm = cl => cl.map(c => [...c.memberIds].sort().join("|")).sort();
  assert.deepEqual(norm(a), norm(b));
});

test("merge: duplicate submissions in the input are counted once", () => {
  const one = q("dup1", PG, "PG branch choice?");
  const out = buildClusters([one, { ...one }], 0.42, true, [], { idFactory: idFactory() });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].memberIds, ["dup1"]);
});

test("merge: realistic corpus keeps every question exactly once at several thresholds", () => {
  const subs = realisticCorpus();
  [0.15, 0.3, 0.42, 0.55, 0.7].forEach(t => {
    [true, false].forEach(useSub => {
      const out = buildClusters(subs, t, useSub, [], { idFactory: idFactory() });
      assertIntegrity(out, subs, { useSub });
    });
  });
});

/* ---------------- re-merge ---------------- */

test("re-merge: answered / sent-out groups keep members; ids never duplicate", () => {
  const subs = [
    q("r1", CLINIC, "How do I start a Panchakarma centre after BAMS?"),
    q("r2", CLINIC, "Licences needed to open an ayurveda clinic in Kerala"),
    q("r3", CLINIC, "Which licence do I need to open an Ayurveda clinic?"),
    q("r4", CLINIC, "Licence required to open a clinic in Kerala?"),
  ];
  const prev = [
    { id: "AYM-C-ANS", theme: CLINIC[0], subtheme: CLINIC[1], memberIds: ["r1", "r2"], answer: "Start with state registration…", status: "Published" },
    { id: "AYM-C-OUT", theme: CLINIC[0], subtheme: CLINIC[1], memberIds: ["r3"], answer: "", status: "Sent to mentor" },
  ];
  const out = buildClusters(subs, 0.9, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  const ans = out.find(c => c.id === "AYM-C-ANS");
  assert.deepEqual(ans.memberIds, ["r1", "r2"], "answered group untouched");
  assert.equal(ans.answer, "Start with state registration…");
  assert.deepEqual(out.find(c => c.id === "AYM-C-OUT").memberIds, ["r3"]);
  assert.equal(out.filter(c => c.answer).length, 1, "answer is not copied to another group");
  assert.ok(!groupOf(out, "r4").answer, "new question does not inherit someone else's answer");
});

test("re-merge: composite wording carries over when most members stay together", () => {
  const subs = [
    q("k1", PG, "How should I prepare for AIAPGET?"),
    q("k2", PG, "AIAPGET preparation tips"),
    q("k3", PG, "aiapget ki taiyari kaise kare"),
  ];
  const prev = [{ id: "AYM-C-KEEP", memberIds: ["k1", "k2"], composite: "How do I plan AIAPGET preparation?", status: "Composed", mentor: "Dr A" }];
  const out = buildClusters(subs, 0.42, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  const g = groupOf(out, "k1");
  assert.equal(g.id, "AYM-C-KEEP");
  assert.equal(g.composite, "How do I plan AIAPGET preparation?");
  assert.equal(g.mentor, "Dr A");
  assert.ok(g.memberIds.includes("k3"));
});

test("re-merge: deleted questions drop out of locked groups; empty locked groups disappear", () => {
  const subs = [q("z1", PG, "PG?")];
  const prev = [
    { id: "AYM-C-L1", memberIds: ["z1", "gone"], answer: "x", status: "Published" },
    { id: "AYM-C-L2", memberIds: ["gone2"], answer: "y", status: "Published" },
  ];
  const out = buildClusters(subs, 0.42, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.deepEqual(out.map(c => c.id), ["AYM-C-L1"]);
  assert.deepEqual(out[0].memberIds, ["z1"]);
});

test("re-merge: running twice is stable — same ids, same members", () => {
  const subs = realisticCorpus();
  const first = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  const second = buildClusters(subs, 0.42, true, first, { idFactory: idFactory() });
  assertIntegrity(second, subs);
  const shape = cl => cl.map(c => `${c.id}=${[...c.memberIds].sort().join("|")}`).sort();
  assert.deepEqual(shape(second), shape(first));
});

test("re-merge: a stale unlocked group that mixed themes is split back by theme", () => {
  const subs = [
    q("s1", PG, "How should I prepare for AIAPGET?"),
    q("s2", STARTUP, "How should I prepare to pitch my startup?"),
  ];
  const prev = [{ id: "AYM-C-MIX", memberIds: ["s1", "s2"], status: "Composed", composite: "x", mixedThemes: true }];
  const out = buildClusters(subs, 0.42, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.ok(!sameGroup(out, "s1", "s2"));
  assert.equal(out.filter(c => c.id === "AYM-C-MIX").length, 1, "old id reused at most once");
});

test("re-merge: two locked groups claiming the same question — first keeps it, no duplicate", () => {
  const subs = [q("d1", PG, "PG branch choice?"), q("d2", PG, "Which PG branch suits me?")];
  const prev = [
    { id: "AYM-C-A", memberIds: ["d1", "d2"], answer: "a", status: "Published" },
    { id: "AYM-C-B", memberIds: ["d2"], answer: "b", status: "Published" },
  ];
  const out = buildClusters(subs, 0.42, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.deepEqual(out.map(c => c.id), ["AYM-C-A"]);
});

test("re-merge: a new look-alike question never slips into an answered group", () => {
  const subs = [
    q("n1", PG, "How should I prepare for AIAPGET?"),
    q("n2", PG, "AIAPGET preparation tips"),
    q("n3", PG, "How do I prepare for AIAPGET?"),
  ];
  const prev = [{ id: "AYM-C-PUB", memberIds: ["n1", "n2"], answer: "Plan 6 months…", status: "Published" }];
  const out = buildClusters(subs, 0.42, true, prev, { idFactory: idFactory() });
  assertIntegrity(out, subs);
  assert.deepEqual(out.find(c => c.id === "AYM-C-PUB").memberIds, ["n1", "n2"]);
  const g = groupOf(out, "n3");
  assert.notEqual(g.id, "AYM-C-PUB");
  assert.equal(g.answer, "", "staff decide via manual merge; no silent answer inheritance");
});

/* ---------------- manual merge / detach ---------------- */

function clustered() {
  const subs = [
    q("m1", PG, "How should I prepare for AIAPGET?"),
    q("m2", PG, "AIAPGET preparation tips"),
    q("m3", PG, "Is Kayachikitsa a good PG branch?"),
    q("m4", PG, "Is Shalya a good PG branch?"),
    q("m5", CLINIC, "Clinic licence?"),
  ];
  const clusters = buildClusters(subs, 0.42, true, [], { idFactory: idFactory() });
  return { subs, clusters, byId: Object.fromEntries(subs.map(s => [s.id, s])) };
}

test("manual merge: union of members, answer kept, nothing duplicated", () => {
  const { subs, clusters, byId } = clustered();
  const g1 = groupOf(clusters, "m1");
  const g3 = groupOf(clusters, "m3");
  const withAnswer = clusters.map(c => (c.id === g3.id ? { ...c, answer: "Pick by interest", status: "Published" } : c));
  const { clusters: next, merged } = mergeClusterGroup(withAnswer, [g1.id, g3.id], byId);
  assertIntegrity(next, subs);
  assert.equal(merged.answer, "Pick by interest", "answer of the answered group survives");
  assert.equal(merged.status, "Published");
  const expected = new Set([...g1.memberIds, ...g3.memberIds]);
  assert.deepEqual(new Set(merged.memberIds), expected);
  assert.equal(next.length, clusters.length - 1);
});

test("manual merge: two different answers is refused", () => {
  const { clusters } = clustered();
  const a = clusters[0];
  const b = clusters[1];
  const conflicting = clusters.map(c => (c.id === a.id ? { ...c, answer: "A" } : c.id === b.id ? { ...c, answer: "B" } : c));
  assert.throws(() => mergeClusterGroup(conflicting, [a.id, b.id]), e => e instanceof MergeConflictError && e.code === "ANSWER_CONFLICT");
  assert.throws(() => mergeClusterGroup(clusters, [a.id, "AYM-C-NOPE"]), e => e.code === "MISSING");
});

test("manual merge across themes is allowed (staff override) but flagged", () => {
  const { clusters, byId } = clustered();
  const pg = groupOf(clusters, "m1");
  const clinic = groupOf(clusters, "m5");
  const { merged } = mergeClusterGroup(clusters, [pg.id, clinic.id], byId);
  assert.equal(merged.mixedThemes, true);
});

test("detach: member moves to its own group; totals preserved; kinds updated", () => {
  const { subs, clusters, byId } = clustered();
  const g = groupOf(clusters, "m1");
  assert.ok(g.memberIds.length >= 2);
  const next = detachMember(clusters, g.id, "m1", byId, idFactory());
  assertIntegrity(next, subs);
  const solo = groupOf(next, "m1");
  assert.notEqual(solo.id, g.id);
  assert.deepEqual(solo.memberIds, ["m1"]);
  assert.equal(solo.answer, "");
  const left = next.find(c => c.id === g.id);
  assert.ok(!left.memberIds.includes("m1"));
  assert.equal(left.kind, left.memberIds.length >= 2 ? "merged" : "unique");
  assert.equal(detachMember(next, solo.id, "m1", byId), next, "cannot detach the last member");
});

test("detach → manual merge → re-merge round trip keeps data consistent", () => {
  const { subs, clusters, byId } = clustered();
  const g = groupOf(clusters, "m1");
  let next = detachMember(clusters, g.id, "m2", byId, idFactory());
  next = mergeClusterGroup(next, [groupOf(next, "m2").id, groupOf(next, "m1").id], byId).clusters;
  assertIntegrity(next, subs);
  next = next.map(c => (c.memberIds.includes("m1") ? { ...c, answer: "Plan 12 months", status: "Published" } : c));
  const again = buildClusters(subs, 0.42, true, next, { idFactory: idFactory() });
  assertIntegrity(again, subs);
  assert.equal(groupOf(again, "m1").answer, "Plan 12 months");
  assert.ok(sameGroup(again, "m1", "m2"));
});

test("sanitize: duplicate members, empty groups and duplicate ids are repaired", () => {
  const { clusters, fixes } = sanitizeClusters([
    { id: "A", memberIds: ["1", "2"], kind: "merged" },
    { id: "B", memberIds: ["2", "3"], kind: "merged" },
    { id: "C", memberIds: [] },
    { id: "A", memberIds: ["4"] },
  ]);
  assert.deepEqual(clusters.map(c => [c.id, c.memberIds, c.kind]), [["A", ["1", "2"], "merged"], ["B", ["3"], "unique"]]);
  assert.deepEqual(fixes, { duplicateMembers: 1, emptyDropped: 1, duplicateIds: 1 });
});

/* ---------------- version locking (file store) ---------------- */

test("version locking: stale saves are rejected with a conflict", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const file = path.join(os.tmpdir(), `aym-merge-test-${process.pid}.json`);
  fs.writeFileSync(file, "{}");
  process.env.AYM_STORE_FILE = file;
  const { createFileStore, ClustersVersionConflictError } = await import("../server/store.js");
  const store = createFileStore();
  const v0 = (await store.getClustersMeta()).version;
  const first = await store.saveClusters([{ id: "A", memberIds: ["1"] }], v0);
  assert.equal(first.version, v0 + 1);
  await assert.rejects(() => store.saveClusters([{ id: "B", memberIds: ["1"] }], v0), ClustersVersionConflictError);
  const ok = await store.saveClusters([{ id: "B", memberIds: ["1"] }], first.version);
  assert.equal(ok.version, v0 + 2);
  fs.unlinkSync(file);
  delete process.env.AYM_STORE_FILE;
});

/* ---------------- corpus ---------------- */

function realisticCorpus() {
  const rows = [
    [PG, "How should I prepare for AIAPGET?"],
    [PG, "AIAPGET preparation tips for final year"],
    [PG, "aiapget ki taiyari kaise kare"],
    [PG, "When should I start AIAPGET preparation — internship or final prof?"],
    [PG, "Which PG branch has the best scope?"],
    [PG, "Which MD branch is good for clinical practice?"],
    [PG, "Kayachikitsa vs Panchakarma for PG — which is better?"],
    [PG, "What should I do after BAMS?"],
    [PG, "what to do after bams"],
    [PG, "बीएएमएस के बाद पीजी की तैयारी कैसे करें?"],
    [PHD, "How do I get into a PhD in Ayurveda?"],
    [PHD, "Is PhD possible without MD?"],
    [PHD, "PhD after MD — fellowship options?"],
    [CLINIC, "What licences do I need to open an Ayurveda clinic?"],
    [CLINIC, "Licence needed to start a clinic in Kerala"],
    [CLINIC, "How much money is needed to start a small clinic?"],
    [CLINIC, "How do I get my first patients?"],
    [CLINIC, "Clinic registration process in Maharashtra"],
    [PK, "Panchakarma training course duration?"],
    [PK, "panchkarma traning course duraton"],
    [PK, "How to set up a Panchakarma therapy unit?"],
    [PK, "Is a separate certificate needed to run Panchakarma therapy?"],
    [STARTUP, "How do I validate an Ayurvedic skincare product idea?"],
    [STARTUP, "How to test if my herbal product has a market?"],
    [STARTUP, "Start-up idea: Panchakarma at home — is it viable?"],
    [ABROAD, "Can BAMS graduates practise in the UK?"],
    [ABROAD, "Is BAMS recognised in the USA?"],
    [ABROAD, "Which countries recognise BAMS degree?"],
    [ABROAD, "Can I work abroad as an Ayurveda doctor?"],
    [RESEARCH, "How do I frame a research question for my thesis?"],
    [RESEARCH, "How to choose a thesis topic in Ayurveda research?"],
    [RESEARCH, "How do I publish a case report?"],
  ];
  return rows.map(([pair, text], i) => q(`rc${i}`, pair, text));
}
