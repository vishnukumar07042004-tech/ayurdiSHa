/**
 * Offline checks for scripts/faculty/enrich.mjs: prompt building, output parsing / grounding
 * checks, applying onto the bundle, and the enriched workbook (export → re-import). Mock provider.
 */
import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { ENRICH_OVERRIDE, ENRICH_RULES, alreadyEnriched, applyEnrichment, buildEnrichPrompt, enrichedWorkbookName, parseEnrichOutput, personaBrief, selectPassages } from "../../scripts/faculty/enrichLib.mjs";
import { parseJsonLoose, parseOpenAIResponse } from "../../server/ai/provider.js";
import { loadPersona } from "../../server/ai/personas/index.js";
import { enrichedWorkbookBuffer, streamTemplateBuffer } from "../../server/ai/facultyExport.js";
import { ENRICHED_ORDER, FACULTY_COLUMNS, mergeEntry, parseFacultyWorkbook } from "../../shared/facultyWorkbook.js";
import { buildBm25 } from "../../server/ai/retrieve.js";
import { readWorkbookSheets } from "../../scripts/faculty/lib.mjs";
import { parseAllowList } from "../../server/ai/sources.js";

const ALLOW = { entries: parseAllowList([{ domain: "ncismindia.org", authority: "regulator" }, { domain: "ncism.org.in", authority: "regulator" }]), loaded: true };
// Built from the static source workbook, not data/faculty/clinical-practice.json: a live enrichment run rewrites that file.
const SOURCE = new URL("../../data/faculty/source/DISHA_Stream_1_Clinical_Practice_100_QA_Draft.xlsx", import.meta.url);
const parsed = parseFacultyWorkbook(readWorkbookSheets(SOURCE));
const bank = { version: 1, stream: parsed.stream, streamId: "clinical-practice", sources: parsed.sources, instructions: parsed.instructions, entries: parsed.entries.map(e => mergeEntry(undefined, { ...e, streamId: "clinical-practice" })) };
const entry = bank.entries.find(e => e.id === "CP-01-002");

const CHUNKS = [
  { id: "ncism-reg-1", url: "https://ncism.org.in/ayurveda.html", title: "NCISM — Ayurveda", text: "A person holding a recognised BAMS qualification must be registered with a State Board or the Central Register of Indian Medicine before practising Ayurveda." },
  { id: "ncism-intern-1", url: "https://ncismindia.org/internship", title: "Compulsory rotatory internship", text: "Completion of the compulsory rotatory internship of one year is required before registration." },
  { id: "blog-1", url: "https://random-blog.example/clinic", title: "Blog", text: "Open your private clinic immediately after BAMS, no registration needed." },
];
const kb = { chunks: CHUNKS, bm25: buildBm25(CHUNKS, c => `${c.title} ${c.text}`) };

function sentences(n) {
  return Array.from({ length: n }, (_, i) => `Build supervised clinical experience and a safe practice plan step ${i + 1} before you see patients on your own.`).join(" ");
}

function mockOutput(passages) {
  return {
    answer: `Not on day one: first finish your internship and get registered. [c:ncism-reg-1] Registration needs the compulsory rotatory internship of one year. [c:ncism-intern-1] The registration fee is Rs 5,000 in every state. [c:ncism-reg-1] A made-up claim cites a passage that was never offered. [c:ghost-9] ${sentences(9)}`,
    actions: ["Check your State Board registration steps", "Find a supervised clinical post", "Draft a clinic compliance checklist"],
    mistake: "Opening a clinic before registration is complete.",
    verifyLocally: "Clinic registration rules differ by state.",
    citations: [
      { chunkId: "ncism-reg-1", quote: "must be registered with a State Board or the Central Register of Indian Medicine" },
      { chunkId: "ncism-intern-1", quote: "compulsory rotatory internship of one year" },
      { chunkId: "blog-1", quote: "no registration needed" },
      { chunkId: "ncism-reg-1", quote: "duplicate" },
    ],
    flags: ["time-sensitive", "made-up-flag"],
    paraphrases: [
      { text: "BAMS ke baad seedha private practice kar sakte hai kya", lang: "hinglish", persona: "student" },
      { text: "क्या बीएएमएस के बाद तुरंत प्रैक्टिस शुरू कर सकते हैं", persona: "intern" },
      { text: "can i open my own clinic right after bams", persona: "intern" },
      { text: "Can I start private clinical practice immediately after completing BAMS?" },
      { text: "can i open my own clinic right after bams" },
      ...["is private practice allowed straight after bams", "own practice after bams possible?", "bams pass karke clinic khol sakte hai", "start practising right after graduation?", "do i need anything before private practice after bams", "private practice immediately after internship ok?", "fresher bams can do private practice?"].map(text => ({ text, persona: "practitioner" })),
    ],
    passages,
  };
}

test("passages: row's own source first, allow-listed only", () => {
  const p = selectPassages(entry, kb, { allow: ALLOW });
  assert.equal(p[0].url, "https://ncism.org.in/ayurveda.html");
  assert.ok(!p.some(x => x.id === "blog-1"), "non-allow-listed blog never offered");
});

test("prompt carries the DISHA answer standard, the faculty row and the passages", () => {
  const passages = selectPassages(entry, kb, { allow: ALLOW });
  const { system, messages } = buildEnrichPrompt(entry, { persona: "You are an experienced Ayurveda physician.", passages, sources: bank.sources });
  assert.match(system, /^You are an experienced Ayurveda physician\./);
  assert.match(system, /150–250 words/);
  assert.match(system, /Exactly 3 actionable next steps/);
  assert.match(system, /8–10 different ways/);
  const payload = JSON.parse(messages[0].content);
  assert.equal(payload.FACULTY_ROW.id, "CP-01-002");
  assert.equal(payload.FACULTY_ROW.facultyDraftAnswer, entry.draftAnswer);
  assert.deepEqual(payload.SOURCES.map(s => s.id), passages.map(s => s.id));
  assert.ok(payload.OFFICIAL_SOURCES_SHEET.length >= 1);
});

/** A completed Responses API result of ~110 output tokens, as GPT returned for every --both row. */
function gptResponse(text, { output = 112, reasoning = 64 } = {}) {
  return {
    id: "resp_mock", status: "completed", model: "gpt-6.1-sol",
    output: [
      { type: "reasoning", id: "rs_mock", summary: [] },
      { type: "message", id: "msg_mock", role: "assistant", status: "completed", content: [{ type: "output_text", annotations: [], text }] },
    ],
    usage: { input_tokens: 4200, output_tokens: output, output_tokens_details: { reasoning_tokens: reasoning } },
  };
}

test("GPT repro: the persona's {\"insufficient\": true} escape hatch → completed ~110-token reply with no answer", () => {
  const persona = loadPersona("clinical-practice").prompt;
  assert.match(persona, /return \{"insufficient": true, "reason"/, "persona Rules allow a decline");
  assert.match(persona, /## Output — return JSON only, exactly this shape/, "persona has its own output shape (no paraphrases)");
  const legacy = buildEnrichPrompt(entry, { persona, passages: CHUNKS });
  assert.ok(legacy.system.includes('"insufficient": true'), "the shared prompt carried both contracts");

  const reply = '{"insufficient": true, "reason": "The SOURCES do not state the State Board registration steps or the clinic licence required for CP-01-002."}';
  const out0 = parseOpenAIResponse(gptResponse(reply), "gpt-6.1-sol");
  assert.equal(out0.stop, "completed");
  assert.ok(out0.outputTokens >= 100 && out0.outputTokens <= 140);
  const parsed = parseEnrichOutput(parseJsonLoose(out0.text) || out0.text, { entry, passages: CHUNKS, allow: ALLOW });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.declined, true);
  assert.match(parsed.error, /^no answer in model output — declined as insufficient sources: The SOURCES do not state/);

  const other = parseEnrichOutput({ paraphrases: [{ text: "x" }] }, { entry });
  assert.equal(other.error, "no answer in model output (keys: paraphrases)", "unknown shapes name their keys");
});

test("GPT prompt: persona identity + expertise only, explicit output contract; Gemini prompt unchanged", () => {
  const persona = loadPersona("clinical-practice").prompt;
  const gpt = buildEnrichPrompt(entry, { persona, passages: CHUNKS, sources: bank.sources, provider: "openai" });
  assert.match(gpt.system, /^You are an experienced Ayurveda physician/);
  assert.match(gpt.system, /Setting up a clinic: registration with the State Board/, "expertise kept");
  assert.doesNotMatch(gpt.system, /"insufficient": true, "reason"/);
  assert.doesNotMatch(gpt.system, /## Rules|## Output|exactly this shape|"resources"/);
  assert.ok(gpt.system.includes(ENRICH_RULES) && gpt.system.endsWith(ENRICH_OVERRIDE));
  assert.equal(personaBrief("Plain persona, no sections."), "Plain persona, no sections.");

  const gemini = buildEnrichPrompt(entry, { persona, passages: CHUNKS, sources: bank.sources });
  assert.equal(gemini.system, `${persona.trim()}\n\n${ENRICH_RULES}`, "Gemini system prompt byte-identical to before");
  assert.equal(gemini.messages[0].content, gpt.messages[0].content, "same user payload on both sides");
});

test("GPT reply shapes: fenced JSON and a wrapper object parse to the full enriched answer", () => {
  const full = mockOutput();
  delete full.passages;
  const text = JSON.stringify(full);
  for (const reply of ["```json\n" + text + "\n```", JSON.stringify({ result: full }), `Sure — here it is:\n${text}`]) {
    const out0 = parseOpenAIResponse(gptResponse(reply, { output: 1900, reasoning: 300 }), "gpt-6.1-sol");
    const out = parseEnrichOutput(parseJsonLoose(out0.text) || out0.text, { entry, passages: CHUNKS, allow: ALLOW });
    assert.equal(out.ok, true, reply.slice(0, 40));
    assert.equal(out.actions.length, 3);
    assert.ok(out.mistake && out.citations.length === 2 && out.paraphrases.length === 10 && out.confidence > 0);
  }
  const e = applyEnrichment(entry, parseEnrichOutput(full, { entry, passages: CHUNKS, allow: ALLOW }), { provider: "openai", model: "gpt-6.1-sol", variant: true });
  assert.equal(e.variants.openai.paraphrases.length, 10, "GPT paraphrases kept on the variant");
  assert.deepEqual(e.paraphrases, entry.paraphrases, "primary paraphrases untouched by the GPT side");
});

test("output parsing: grounded citations only, unsupported numbers removed, paraphrases cleaned", () => {
  const passages = CHUNKS;
  const out = parseEnrichOutput(JSON.stringify(mockOutput()), { entry, passages, allow: ALLOW });
  assert.equal(out.ok, true);
  assert.deepEqual(out.citations.map(c => c.chunkId), ["ncism-reg-1", "ncism-intern-1"]);
  assert.doesNotMatch(out.enrichedAnswer, /Rs 5,000/, "fee not stated by any cited passage");
  assert.doesNotMatch(out.answerMarked, /ghost-9/);
  assert.doesNotMatch(out.enrichedAnswer, /\[c:/);
  assert.match(out.answerMarked, /\[c:ncism-reg-1\]/);
  assert.match(out.enrichedAnswer, /one year/, "a number stated by a cited passage survives");
  assert.deepEqual(out.flags, ["needs-state-specific-check", "time-sensitive", "unsupported-claims-removed"]);
  assert.equal(out.actions.length, 3);
  assert.equal(out.paraphrases.length, 10);
  assert.ok(!out.paraphrases.some(p => /completing BAMS\?$/.test(p.text)), "the original question is not a paraphrase");
  assert.equal(out.paraphrases.find(p => /[\u0900-\u097f]/.test(p.text)).lang, "hi");
  assert.ok(out.confidence > 0.6 && out.confidence <= 1, `confidence ${out.confidence}`);
  assert.equal(parseEnrichOutput("not json", { entry, passages }).ok, false);
  const thin = parseEnrichOutput({ answer: "Check with your State Board.", citations: [] }, { entry, passages });
  assert.ok(thin.flags.includes("limited-sources"));
  assert.ok(thin.confidence < 0.5);
});

test("mock provider run → bundle fields, variants, resume, enriched workbook round-trip", async () => {
  const passages = CHUNKS;
  const provider = { calls: 0, async chat(args) { this.calls++; assert.ok(args.json); return { json: mockOutput(), usage: { inputTokens: 3000, outputTokens: 900 }, model: "mock-draft" }; } };
  const r = await provider.chat({ ...buildEnrichPrompt(entry, { passages }), json: true });
  const out = parseEnrichOutput(r.json, { entry, passages, allow: ALLOW });
  let e = applyEnrichment(entry, out, { provider: "gemini", model: r.model, at: "2026-11-07T00:00:00Z" });
  e = applyEnrichment(e, out, { provider: "openai", model: "mock-gpt", variant: true });
  assert.equal(e.enrichedBy.provider, "gemini");
  assert.equal(e.variants.openai.enrichedAnswer, out.enrichedAnswer);
  assert.equal(e.paraphrases.length, 10);
  assert.ok(alreadyEnriched(e, "gemini") && alreadyEnriched(e, "openai", { variant: true }) && !alreadyEnriched(e, "openai"));

  const enriched = { ...bank, entries: bank.entries.map(x => (x.id === e.id ? e : x)) };
  const buf = enrichedWorkbookBuffer(enriched);
  const wb = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["Clinical Practice Q&A", "Instructions", "Sources", "Coverage", "Paraphrases"]);
  const sheets = Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false })]));
  const qa = sheets["Clinical Practice Q&A"];
  assert.deepEqual(qa[0], [...ENRICHED_ORDER]);
  const row = qa.find(rw => rw[0] === "CP-01-002");
  const col = name => row[ENRICHED_ORDER.indexOf(name)];
  assert.match(col("DISHA enriched answer"), /Verify locally: Clinic registration rules differ by state\./);
  assert.match(col("Next steps"), /^1\. Check your State Board/);
  assert.equal(col("Mistake to avoid"), out.mistake);
  assert.match(col("Citations (URLs)"), /https:\/\/ncism\.org\.in\/ayurveda\.html/);
  assert.equal(Number(col("Confidence")), out.confidence);
  assert.match(col("Flags (e.g. needs state-specific check / limited sources)"), /unsupported-claims-removed/);
  assert.match(col("Paraphrases (sample)"), /seedha private practice/);
  assert.equal(qa.length, 101);

  const back = parseFacultyWorkbook(sheets);
  assert.deepEqual(back.errors, []);
  assert.equal(back.entries.length, 100);
  assert.match(back.entries.find(x => x.id === "CP-01-002").enrichedAnswer, /^Not on day one/);
  assert.equal(enrichedWorkbookName(bank), "DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx");
});

test("stream template: 12 columns + Instructions + Sources, parses as an (empty-example) stream", () => {
  const wb = XLSX.read(streamTemplateBuffer({ instructions: [["Purpose", "x"]], sources: [["NCISM", "https://ncismindia.org/", ""]] }), { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["Stream Q&A", "Instructions", "Sources", "Streams"]);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets["Stream Q&A"], { header: 1, defval: "" });
  assert.deepEqual(grid[0], [...FACULTY_COLUMNS]);
});
