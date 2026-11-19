import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FACULTY_MATCH, buildFacultyIndex, effectiveBanks, facultyContext, facultyProvenance, foldFacultyText,
  loadFacultyBundles, match, ruleParaphrases, setFacultyStateForTests,
} from "../../server/ai/facultyBank.js";

const read = f => JSON.parse(fs.readFileSync(new URL(`../ai-eval/${f}`, import.meta.url), "utf8"));
const bundles = loadFacultyBundles({ fresh: true });
const clinical = bundles.find(b => b.streamId === "clinical-practice");
const index = buildFacultyIndex(clinical.entries);

/** Streams with no Clinical Practice overlap (no relatedStreams link): their questions must not match. */
const NEG_STREAMS = ["abroad-gulf", "abroad-usa", "abroad-uk-eu", "practice-abroad", "research-phd", "entrepreneurship", "teaching-academia", "export-trade", "industry-pharma", "public-health-policy"];
function negatives(n = 20) {
  const items = read("eval-set.json").items;
  const out = [];
  for (let round = 0; out.length < n && round < 10; round++) {
    for (const s of NEG_STREAMS) {
      const list = items.filter(x => x.expect && x.expect.stream === s);
      if (list[round] && out.length < n) out.push(list[round]);
    }
  }
  return out;
}

function confident(r) {
  return r[0] && r[0].decision !== "weak";
}

test("faculty bundle: 100 Clinical Practice rows, all draft, indexed with rule paraphrases", () => {
  assert.equal(clinical.entries.length, 100);
  assert.ok(index.variants.length > 250, `variants ${index.variants.length}`);
  const seeds = ruleParaphrases(clinical.entries.find(e => e.id === "CP-01-001")).map(p => p.text);
  assert.ok(seeds.includes("BAMS ke baad kya kare"));
  const clinic = ruleParaphrases(clinical.entries.find(e => e.id === "CP-03-001"));
  assert.ok(clinic.some(p => p.text === "clinic kholna hai kya kare" && p.lang === "hinglish"));
  assert.ok(clinic.some(p => /^what to do first before opening/.test(p.text)), "question-word swap");
  assert.ok(clinic.every(p => p.source === "rule"));
});

test("cross-lingual fold maps Hinglish / Hindi onto the English canonical words", () => {
  assert.match(foldFacultyText("clinic kholna hai"), /clinic start/);
  assert.match(foldFacultyText("BAMS ke baad"), /after bams/i);
  assert.match(foldFacultyText("मरीज की गोपनीयता"), /patient .*privacy/);
  assert.match(foldFacultyText("when should i not do teleconsultation"), /inappropriate online consultation/);
});

test("held-out paraphrases (EN / Hinglish / Hindi) hit the right faculty row", () => {
  const items = read("faculty-heldout.json").items;
  let top1 = 0;
  let recall = 0;
  let wrong = 0;
  const byLang = {};
  for (const it of items) {
    const r = match(it.q, { index, streamId: "clinical-practice" });
    const ok = r[0] && r[0].id === it.id;
    if (ok) top1++;
    if (ok && confident(r)) recall++;
    if (!ok && confident(r)) wrong++;
    byLang[it.lang] = byLang[it.lang] || { n: 0, ok: 0 };
    byLang[it.lang].n++;
    if (ok && confident(r)) byLang[it.lang].ok++;
  }
  assert.ok(top1 / items.length >= 0.95, `top-1 ${top1}/${items.length}`);
  assert.ok(recall / items.length >= 0.9, `recall@threshold ${recall}/${items.length}`);
  assert.equal(wrong, 0, "a confident match to the wrong row");
  for (const [lang, s] of Object.entries(byLang)) assert.ok(s.ok / s.n >= 0.8, `${lang} ${s.ok}/${s.n}`);
});

test("20 unrelated eval-set questions (other streams) are not matched", () => {
  const negs = negatives(20);
  assert.equal(negs.length, 20);
  const hits = negs.map(n => ({ q: n.question, r: match(n.question, { index, streamId: n.expect.stream }) })).filter(x => confident(x.r));
  assert.deepEqual(hits.map(h => `${h.q} → ${h.r[0].id}`), []);
});

test("conflicting specifics drop or damp a candidate", () => {
  const abroad = match("Can I start private practice in the USA right after BAMS?", { index });
  assert.ok(!confident(abroad), "another country is not the India-specific row");
  const cost = match("how much money to open an ayurveda clinic", { index });
  assert.equal(cost[0].id, "CP-03-003");
});

test("rejected rows are never matched; overlays set status and authority", () => {
  const banks = effectiveBanks([clinical], { overlays: {
    "CP-03-003": { id: "CP-03-003", status: "rejected" },
    "CP-08-002": { id: "CP-08-002", status: "approved", reviewer: "Dr A", notes: "ok" },
  }, streams: {} });
  const entries = banks[0].entries;
  const idx = buildFacultyIndex(entries);
  assert.notEqual((match("clinic kholne me kitna kharcha aayega", { index: idx })[0] || {}).id, "CP-03-003");
  const approved = match("Can BAMS graduates prescribe modern medicines?", { index: idx })[0];
  assert.equal(approved.id, "CP-08-002");
  assert.equal(approved.status, "approved");
  assert.equal(approved.decision, "reuse");
  assert.equal(approved.entry.approvedAnswer, approved.entry.enrichedAnswer || approved.entry.draftAnswer);

  const fixture = { ...clinical.entries.find(e => e.id === "CP-08-002"), draftAnswer: "Draft only.", enrichedAnswer: undefined };
  const [plain, rich] = effectiveBanks([{ ...clinical, entries: [fixture, { ...fixture, id: "CP-FX-002", enrichedAnswer: "Enriched." }] }], { overlays: {
    "CP-08-002": { id: "CP-08-002", status: "approved" },
    "CP-FX-002": { id: "CP-FX-002", status: "approved" },
  }, streams: {} })[0].entries;
  assert.equal(plain.approvedAnswer, "Draft only.");
  assert.equal(rich.approvedAnswer, "Enriched.");
});

test("facultyContext labels draft vs approved and carries provenance", async () => {
  setFacultyStateForTests({ overlays: {}, streams: {} });
  const draft = await facultyContext("BAMS ke baad seedha private practice kar sakte hai kya", "clinical-practice");
  assert.equal(draft.facultyBankId, "CP-01-002");
  assert.equal(draft.status, "draft");
  assert.equal(draft.authoritative, false);
  assert.match(draft.text, /^FACULTY_ANSWER CP-01-002 \(faculty draft, unvalidated/);
  const row = clinical.entries.find(e => e.id === "CP-01-002");
  assert.ok(draft.text.includes(`\nAnswer: ${row.enrichedAnswer || row.draftAnswer}\n`), "enriched answer when present, else the draft");
  assert.equal(draft.bankEntry.approved, false, "an unvalidated row never counts as an approved answer");
  assert.equal(draft.bankEntry.source, "faculty-draft");

  setFacultyStateForTests({ overlays: { "CP-01-002": { id: "CP-01-002", status: "edited", answer: "Faculty edited answer." } }, streams: {} });
  const ok = await facultyContext("Can I start private clinical practice immediately after completing BAMS?", "clinical-practice");
  assert.equal(ok.status, "edited");
  assert.equal(ok.mode, "reuse");
  assert.match(ok.text, /faculty-validated/);
  assert.match(ok.text, /Answer: Faculty edited answer\./);

  assert.equal(await facultyContext("What is the AIAPGET exam pattern for 2026?", "pg-entrance"), null);
  process.env.AI_FACULTY_BANK = "off";
  assert.equal(await facultyContext("Can I start private clinical practice immediately after completing BAMS?"), null);
  delete process.env.AI_FACULTY_BANK;
  setFacultyStateForTests(null);

  const rec = { facultyBankId: "CP-01-002", meta: { retrieval: { bank: [{ id: "CP-01-002", source: "faculty-draft", approved: false, overlap: 0.8 }] } } };
  assert.deepEqual(facultyProvenance(rec), { facultyBankId: "CP-01-002", status: "draft", score: 0.8 });
});

test("thresholds are sane and matching is fast", () => {
  assert.ok(FACULTY_MATCH.reuse > FACULTY_MATCH.match);
  const q = "how do i start my own ayurveda clinic after bams";
  for (let i = 0; i < 20; i++) match(q, { index });
  let ms = Infinity;
  for (let batch = 0; batch < 5; batch++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 40; i++) match(q, { index });
    ms = Math.min(ms, Number(process.hrtime.bigint() - t0) / 1e6 / 40);
  }
  assert.ok(ms < 5, `${ms.toFixed(2)} ms per query`);
});
