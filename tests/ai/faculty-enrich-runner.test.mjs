/**
 * Offline checks for scripts/faculty/enrichRunner.mjs (the concurrent driver behind enrich.mjs):
 * worker-pool limits, both sides of a row in parallel, atomic + debounced writes, resume skipping,
 * the global spend cap and 429 / 5xx backoff. Mock provider and temp-dir fixtures only — never the
 * real data/faculty bundle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ENRICH_REPAIR, applyEnrichment, parseEnrichOutput } from "../../scripts/faculty/enrichLib.mjs";
import { backoffDelay, createBankWriter, failureRecord, formatEta, parseConcurrency, redactSecrets, retryAfterMs, runEnrichment, writeJsonAtomic } from "../../scripts/faculty/enrichRunner.mjs";

const GEMINI = { id: "gemini", variant: false };
const OPENAI = { id: "openai", variant: true };
const OUT = { ok: true, answerMarked: "", actions: [], mistake: "", verifyLocally: "", citations: [], confidence: 0.5, flags: [], notes: "", paraphrases: [], words: 3 };

function fixtureBank(n) {
  return {
    version: 1, stream: "Test Stream", streamId: "test-stream", sources: [],
    entries: Array.from({ length: n }, (_, i) => ({ id: `TS-01-${String(i + 1).padStart(3, "0")}`, question: `Question ${i + 1}?`, draftAnswer: "Draft.", status: "Draft – pending validation" })),
  };
}

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enrich-runner-"));
  return path.join(dir, "test-stream.json");
}

/** Mock provider: records calls and in-flight peaks; `behave(callNo, entryId)` may throw or return a cost. */
function mockProvider(name, { delayMs = 0, cost = 0.01, behave, active } = {}) {
  const p = {
    calls: 0, inFlight: 0, maxInFlight: 0, ids: [],
    async chat(args) {
      const id = args.messages[0].content;
      const n = ++p.calls;
      p.ids.push(id);
      p.inFlight++;
      p.maxInFlight = Math.max(p.maxInFlight, p.inFlight);
      if (active) active.add(`${name}:${id}`);
      try {
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        if (active && active.has(`${name === "gemini" ? "openai" : "gemini"}:${id}`)) active.overlap = true;
        const c = behave ? behave(n, id) : cost;
        return { json: { answer: `${name} answer for ${id}` }, usage: { costUSD: c ?? cost }, model: `mock-${name}` };
      } finally {
        p.inFlight--;
        if (active) active.delete(`${name}:${id}`);
      }
    },
  };
  return p;
}

const prepare = e => ({ passages: [], prompt: { system: "s", messages: [{ role: "user", content: e.id }] } });
const parse = raw => ({ ...OUT, enrichedAnswer: raw.answer, answerMarked: raw.answer });
const noSleep = delays => async ms => { delays.push(ms); };

function run(bank, opts) {
  const lines = [];
  const saves = [];
  const writer = createBankWriter({ bank, save: opts.save || (b => saves.push(b)), every: opts.every ?? 5 });
  const p = runEnrichment({ writer, rows: bank.entries, prepare, parse, log: l => lines.push(l), sleep: noSleep([]), ...opts });
  return p.then(res => ({ res, lines, saves, writer }));
}

test("parseConcurrency: default 4, clamped to 1..8", () => {
  assert.equal(parseConcurrency(undefined), 4);
  assert.equal(parseConcurrency(true), 4);
  assert.equal(parseConcurrency("6"), 6);
  assert.equal(parseConcurrency("20"), 8);
  assert.equal(parseConcurrency("0"), 1);
  assert.equal(parseConcurrency("abc"), 4);
  assert.equal(formatEta(125_000), "2m05s");
  assert.equal(formatEta(0), "0s");
});

test("worker pool honours --concurrency; --both runs Gemini and GPT for the same row in parallel; progress lines", async () => {
  const active = new Set();
  const gemini = mockProvider("gemini", { delayMs: 15, active });
  const openai = mockProvider("openai", { delayMs: 15, active });
  const { res, lines, writer } = await run(fixtureBank(10), { plan: [GEMINI, OPENAI], providers: { gemini, openai }, concurrency: 3 });
  assert.equal(gemini.maxInFlight, 3);
  assert.equal(openai.maxInFlight, 3);
  assert.equal(active.overlap, true, "both sides of one row were in flight together");
  assert.equal(res.done, 10);
  assert.equal(res.failed, 0);
  for (const e of writer.bank.entries) {
    assert.match(e.enrichedAnswer, /^gemini answer/);
    assert.match(e.variants.openai.enrichedAnswer, /^openai answer/, `${e.id}: GPT side not lost when merged after the Gemini side`);
  }
  const progress = lines.filter(l => l.startsWith("["));
  assert.equal(progress.length, 10);
  assert.match(progress[0], /^\[1\/10\] TS-01-\d{3} gemini ✓ \(\d+\.\ds\) gpt ✓ \(\d+\.\ds\) · \$0\.\d{3} · ETA \d+s$/);
  assert.match(progress[9], /^\[10\/10\] .* · ETA 0s$/);

  const one = mockProvider("gemini", { delayMs: 5 });
  await run(fixtureBank(4), { plan: [GEMINI], providers: { gemini: one }, concurrency: 1 });
  assert.equal(one.maxInFlight, 1);
});

test("atomic write: tmp + rename, a crash before rename leaves the previous file intact", () => {
  const file = tmpFile();
  writeJsonAtomic(file, { v: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { v: 1 });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  const crashing = { ...fs, renameSync: () => { throw new Error("simulated crash"); } };
  assert.throws(() => writeJsonAtomic(file, { v: 2, big: "x".repeat(100_000) }, { fs: crashing }), /simulated crash/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { v: 1 }, "target never half-written");
  writeJsonAtomic(file, { v: 3 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { v: 3 });
});

test("single writer: debounced saves every 5 completed rows + at the end, each a valid JSON file", async () => {
  const file = tmpFile();
  const snapshots = [];
  const save = b => {
    writeJsonAtomic(file, b);
    const back = JSON.parse(fs.readFileSync(file, "utf8"));
    snapshots.push(back.entries.filter(e => e.enrichedAnswer).length);
  };
  const gemini = mockProvider("gemini");
  const { res } = await run(fixtureBank(12), { plan: [GEMINI], providers: { gemini }, concurrency: 1, save });
  assert.equal(res.done, 12);
  assert.deepEqual(snapshots, [5, 10, 12]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("resume: rows / sides already enriched are skipped unless --force", async () => {
  const bank = fixtureBank(3);
  const [a, b] = bank.entries;
  const done = { ...OUT, enrichedAnswer: "old", answerMarked: "old" };
  bank.entries[0] = applyEnrichment(applyEnrichment(a, done, { provider: "gemini", model: "m" }), done, { provider: "openai", model: "m", variant: true });
  bank.entries[1] = applyEnrichment(b, done, { provider: "gemini", model: "m" });

  const gemini = mockProvider("gemini");
  const openai = mockProvider("openai");
  const { res, lines, writer } = await run(bank, { plan: [GEMINI, OPENAI], providers: { gemini, openai } });
  assert.deepEqual(gemini.ids, ["TS-01-003"]);
  assert.deepEqual(openai.ids.sort(), ["TS-01-002", "TS-01-003"]);
  assert.equal(res.total, 2);
  assert.ok(lines.some(l => /TS-01-002 gemini = already gpt ✓/.test(l)));
  assert.equal(writer.entry("TS-01-001").enrichedAnswer, "old");
  assert.equal(writer.entry("TS-01-002").enrichedAnswer, "old");

  const g2 = mockProvider("gemini");
  const o2 = mockProvider("openai");
  await run(bank, { plan: [GEMINI, OPENAI], providers: { gemini: g2, openai: o2 }, force: true });
  assert.equal(g2.calls, 3);
  assert.equal(o2.calls, 3);

  const g3 = mockProvider("gemini");
  await run(fixtureBank(10), { plan: [GEMINI], providers: { gemini: g3 }, limit: 4 });
  assert.equal(g3.calls, 4, "--limit counts rows that need work");
});

test("spend cap is global: no new call once spent + in-flight estimate would pass it; in-flight calls finish", async () => {
  const seq = mockProvider("gemini", { cost: 0.4 });
  const r1 = await run(fixtureBank(5), { plan: [GEMINI], providers: { gemini: seq }, concurrency: 1, cap: 1 });
  assert.equal(seq.calls, 2);
  assert.equal(r1.res.stoppedByCap, true);
  assert.ok(Math.abs(r1.res.spent - 0.8) < 1e-9);
  assert.ok(r1.lines.some(l => /Spend cap reached/.test(l)));

  const par = mockProvider("gemini", { cost: 0.3, delayMs: 10 });
  const r2 = await run(fixtureBank(8), { plan: [GEMINI], providers: { gemini: par }, concurrency: 2, cap: 1 });
  assert.equal(par.calls, 3, "third call started while one was in flight, then the projection stopped new work");
  assert.ok(r2.res.spent <= 1, `spent ${r2.res.spent}`);
  assert.equal(r2.writer.bank.entries.filter(e => e.enrichedAnswer).length, 3, "every in-flight result was kept");

  const gemini = mockProvider("gemini", { cost: 0.25 });
  const openai = mockProvider("openai", { cost: 0.25 });
  const r3 = await run(fixtureBank(8), { plan: [GEMINI, OPENAI], providers: { gemini, openai }, concurrency: 1, cap: 1 });
  assert.ok(r3.res.spent <= 1, "cap shared by both providers");
  assert.equal(gemini.calls + openai.calls, 4);
});

test("429 / 5xx: exponential backoff with jitter, Retry-After honoured, repeated 429s reduce concurrency", async () => {
  for (let a = 0; a < 4; a++) {
    const lo = backoffDelay(a, { status: 429 }, { baseMs: 1000, random: () => 0 });
    const hi = backoffDelay(a, { status: 429 }, { baseMs: 1000, random: () => 1 });
    assert.equal(lo, 500 * 2 ** a);
    assert.equal(hi, 1000 * 2 ** a);
  }
  assert.equal(backoffDelay(10, { status: 503 }, { maxMs: 60_000, random: () => 1 }), 60_000);
  assert.equal(retryAfterMs({ retryAfter: "3" }), 3000);
  assert.equal(retryAfterMs({ headers: new Headers({ "retry-after": "2" }) }), 2000);
  assert.equal(retryAfterMs({ retryAfter: new Date(10_000).toUTCString() }, 4_000), 6000);

  const rateLimited = Object.assign(new Error("gemini 429: quota"), { status: 429, retryAfter: "2" });
  const flaky = mockProvider("gemini", { behave: n => { if (n <= 2) throw rateLimited; } });
  const delays = [];
  const { res, writer } = await run(fixtureBank(1), { plan: [GEMINI], providers: { gemini: flaky }, sleep: noSleep(delays), random: () => 0.5 });
  assert.equal(flaky.calls, 3);
  assert.equal(res.retries, 2);
  assert.equal(res.failed, 0);
  assert.ok(delays.every(d => d >= 2000 && d <= 2250), `Retry-After honoured: ${delays}`);
  assert.match(writer.entry("TS-01-001").enrichedAnswer, /^gemini answer/);

  const s503 = mockProvider("gemini", { behave: n => { if (n === 1) throw Object.assign(new Error("503"), { status: 503 }); } });
  const d2 = [];
  await run(fixtureBank(1), { plan: [GEMINI], providers: { gemini: s503 }, sleep: noSleep(d2), random: () => 0 });
  assert.equal(s503.calls, 2);
  assert.deepEqual(d2, [500]);

  const bad = mockProvider("gemini", { behave: () => { throw Object.assign(new Error("400 bad request"), { status: 400 }); } });
  const r400 = await run(fixtureBank(1), { plan: [GEMINI], providers: { gemini: bad } });
  assert.equal(bad.calls, 1, "4xx other than 429 is not retried");
  assert.equal(r400.res.failed, 1);
  assert.ok(r400.lines.some(l => /gemini ✗/.test(l)) && r400.lines.some(l => /FAILED — 400 bad request/.test(l)));

  const always = mockProvider("gemini", { behave: () => { throw Object.assign(new Error("429"), { status: 429 }); } });
  const r429 = await run(fixtureBank(2), { plan: [GEMINI], providers: { gemini: always }, concurrency: 4, retries: 4, adaptAfter: 3 });
  assert.equal(always.calls, 10, "1 call + 4 retries per row");
  assert.equal(r429.res.limits.gemini, 1);
  assert.ok(r429.lines.some(l => /repeated 429s — concurrency 4 → 2/.test(l)));
  assert.ok(r429.lines.some(l => /concurrency 2 → 1/.test(l)));
  assert.equal(r429.res.failed, 2);
});

test("GPT side: low effort + reasoning headroom only for openai; a cut-off reply fails clearly, its spend counts, resume redoes only that side", async () => {
  const seen = { gemini: [], openai: [] };
  const spy = (name, inner) => ({ ...inner, chat: args => { seen[name].push(args); return inner.chat(args); } });
  const gemini = spy("gemini", mockProvider("gemini"));
  const cutOff = Object.assign(new Error("openai gpt-6.1-sol: output cut off at max_output_tokens=7000 (6900 of 7000 output tokens were reasoning, effort low) — also after a retry with lower reasoning effort and a doubled cap."), {
    code: "incomplete_output", status: 0, model: "gpt-6.1-sol", usage: { inputTokens: 2000, outputTokens: 21000, costUsd: 0.214 },
  });
  const openai = spy("openai", mockProvider("openai", { behave: (n, id) => { if (id === "TS-01-002") throw cutOff; } }));
  const bank = fixtureBank(3);
  const first = await run(bank, { plan: [GEMINI, OPENAI], providers: { gemini, openai } });
  assert.ok(seen.openai.every(a => a.thinking === "low" && a.maxTokens === 4000 && a.reasoningHeadroom === 3000), "OPENAI_ENRICH_ARGS reach the GPT calls");
  assert.ok(seen.gemini.every(a => a.thinking === undefined && a.maxTokens === 3000 && a.reasoningHeadroom === undefined), "Gemini keeps its own defaults");
  assert.equal(seen.openai.length, 3, "incomplete_output is not retried by the runner (the provider already retried once)");
  assert.equal(first.res.failed, 1);
  assert.ok(first.lines.some(l => /TS-01-002 gpt: FAILED — openai gpt-6\.1-sol: output cut off at max_output_tokens/.test(l)), first.lines.join("\n"));
  assert.ok(Math.abs(first.res.spent - (5 * 0.01 + 0.214)) < 1e-9, `5 good calls + the billed cut-off: ${first.res.spent}`);

  const fixed = spy("openai", mockProvider("openai"));
  seen.openai = [];
  const again = await run(first.writer.bank, { plan: [GEMINI, OPENAI], providers: { gemini, openai: fixed } });
  assert.equal(seen.openai.length, 1, "resume: only the failed GPT row is re-run");
  assert.equal(again.res.done, 1);
  assert.match(again.writer.entry("TS-01-002").variants.openai.enrichedAnswer, /^openai answer/);
});

const DECLINE = '{"insufficient": true, "reason": "The SOURCES do not cover the licence steps."}';
const declineReply = model => ({ text: DECLINE, json: JSON.parse(DECLINE), model, usage: { stop: "completed", inputTokens: 4200, outputTokens: 112, thoughtTokens: 64, costUSD: 0.01 } });
const fullReply = model => ({ text: "", json: { answer: "Register with your State Board first.", actions: ["a", "b", "c"], mistake: "m", paraphrases: [] }, model, usage: { stop: "completed", outputTokens: 1900, costUSD: 0.02 } });
const realParse = (raw, { entry }) => parseEnrichOutput(raw, { entry });

test("GPT decline ({\"insufficient\": true}, ~110 tokens): one corrective turn with the GPT prompt, then the full object is stored", async () => {
  const seen = [];
  let n = 0;
  const openai = { async chat(args) { seen.push(args); return ++n === 1 ? declineReply("gpt-6.1-sol") : fullReply("gpt-6.1-sol"); } };
  const gemini = { calls: 0, async chat(args) { this.calls++; assert.equal(args.system, "gemini-system"); return fullReply("gemini-3-pro"); } };
  const prep = e => ({ passages: [], prompt: { system: "gemini-system", messages: [{ role: "user", content: e.id }] }, prompts: { openai: { system: "gpt-system", messages: [{ role: "user", content: e.id }] } } });
  const { res, lines, writer } = await run(fixtureBank(1), { plan: [GEMINI, OPENAI], providers: { gemini, openai }, prepare: prep, parse: realParse });
  assert.equal(seen.length, 2);
  assert.ok(seen.every(a => a.system === "gpt-system"), "GPT side uses prompts.openai");
  assert.deepEqual(seen[1].messages.map(m => m.role), ["user", "assistant", "user"]);
  assert.equal(seen[1].messages[1].content, DECLINE);
  assert.equal(seen[1].messages[2].content, ENRICH_REPAIR);
  assert.equal(gemini.calls, 1);
  assert.equal(res.failed, 0);
  assert.equal(res.retries, 1);
  assert.ok(Math.abs(res.spent - 0.05) < 1e-9, "both GPT calls are billed");
  assert.match(writer.entry("TS-01-001").variants.openai.enrichedAnswer, /^Register with your State Board/);
  assert.ok(lines.some(l => /gemini ✓ .* gpt ✓/.test(l)));
});

test("a still-unusable GPT reply fails with its stop info; Gemini gets no corrective turn; --debug-raw records have no secrets", async () => {
  const records = [];
  const openai = { calls: 0, async chat() { this.calls++; return declineReply("gpt-6.1-sol"); } };
  const gemini = { calls: 0, async chat() { this.calls++; return declineReply("gemini-3-pro"); } };
  const { res, lines } = await run(fixtureBank(1), { plan: [GEMINI, OPENAI], providers: { gemini, openai }, parse: realParse, onFailure: r => records.push(r) });
  assert.equal(openai.calls, 2);
  assert.equal(gemini.calls, 1, "Gemini behaviour unchanged: no repair turn");
  assert.equal(res.failed, 2);
  assert.ok(lines.some(l => /TS-01-001 gpt: FAILED — no answer in model output — declined as insufficient sources: .* \(stop: completed, 112 output tokens\) — also after a corrective retry/.test(l)), lines.join("\n"));

  const gpt = records.find(r => r.provider === "openai");
  assert.equal(gpt.id, "TS-01-001");
  assert.equal(gpt.variant, true);
  assert.equal(gpt.attempts.length, 2);
  assert.deepEqual(gpt.attempts[0].jsonKeys, ["insufficient", "reason"]);
  assert.equal(gpt.attempts[0].finish, "completed");
  assert.equal(gpt.attempts[0].outputTokens, 112);
  assert.equal(gpt.attempts[0].text, DECLINE);
  assert.equal(records.find(r => r.provider === "gemini").attempts.length, 1);

  const thrown = Object.assign(new Error("openai 401: invalid key sk-proj-ABCDEFGH12345678"), { status: 401 });
  const rec = failureRecord({ entry: { id: "X" }, side: OPENAI, tries: [{ text: "Bearer abcdefgh12345678 AIzaSyA1234567890abcdefghijk", usage: {} }], error: thrown });
  assert.doesNotMatch(JSON.stringify(rec), /sk-proj|AIzaSy|abcdefgh12345678/);
  assert.equal(redactSecrets("key sk-abcdefgh123"), "key [redacted]");

  const file = tmpFile();
  const dir = path.join(path.dirname(file), "enrich-debug");
  const failing = { async chat() { throw thrown; } };
  await run(fixtureBank(1), { plan: [OPENAI], providers: { openai: failing }, parse: realParse, onFailure: r => writeJsonAtomic(path.join(dir, `${r.id}-${r.provider}.json`), r) });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "TS-01-001-openai.json"), "utf8"));
  assert.match(saved.error, /openai 401: invalid key \[redacted\]/);
  assert.deepEqual(saved.attempts, []);
});

test("parseEnrichOutput: JSON wrapped in prose is recovered; an empty reply says so", async () => {
  const { parseEnrichOutput } = await import("../../scripts/faculty/enrichLib.mjs");
  const entry = { id: "TS-01-001", question: "Q?", draftAnswer: "Draft." };
  const wrapped = parseEnrichOutput('Here is the JSON:\n{"answer": "Read the official notice first.", "actions": ["a", "b", "c"]}\nDone.', { entry });
  assert.equal(wrapped.ok, true);
  assert.equal(wrapped.enrichedAnswer, "Read the official notice first.");
  assert.deepEqual(parseEnrichOutput("", { entry }), { ok: false, error: "no answer in model output (empty reply)" });
  assert.equal(parseEnrichOutput('{"answer": "cut', { entry }).error, "no answer in model output");
});
