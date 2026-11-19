/**
 * OpenAI Responses API: reasoning tokens count against max_output_tokens, so a GPT-5.x / 6.x reply
 * can come back `status: "incomplete"` (max_output_tokens) or with no visible text at all. The
 * provider reads every text part, retries such a reply once with lower effort and a doubled cap,
 * then fails with a clear `incomplete_output` error. Mocked fetch, no network.
 */
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { setEnvForTests, chat, parseOpenAIResponse, openaiShortfall, openaiEffort, lowerEffort, resetUsage, getUsage } from "../../server/ai/provider.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  setEnvForTests(null);
});

const USAGE = { input_tokens: 1000, output_tokens: 5048, output_tokens_details: { reasoning_tokens: 5048 } };
const INCOMPLETE = { model: "gpt-6.1-sol", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "reasoning", summary: [] }], usage: USAGE };
const CUT_OFF = {
  model: "gpt-6.1-sol", status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
  output: [{ type: "reasoning" }, { type: "message", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: '{"answer": "Start with the' }] }],
  usage: { input_tokens: 1000, output_tokens: 5048, output_tokens_details: { reasoning_tokens: 4200 } },
};
const EMPTY = { model: "gpt-5.5", status: "completed", output: [{ type: "reasoning" }], usage: { input_tokens: 900, output_tokens: 1500, output_tokens_details: { reasoning_tokens: 1500 } } };
const OK = {
  model: "gpt-6.1-sol", status: "completed",
  output: [{ type: "reasoning" }, { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":' }, { type: "output_text", text: '"ok"}' }] }],
  usage: { input_tokens: 1000, output_tokens: 2600, output_tokens_details: { reasoning_tokens: 900 } },
};

function replay(...responses) {
  const bodies = [];
  globalThis.fetch = async (url, init = {}) => {
    bodies.push(JSON.parse(init.body));
    const r = responses[Math.min(bodies.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  return bodies;
}

const ask = extra => chat({ provider: "openai", model: "gpt-6.1-sol", role: "draft", json: true, messages: [{ role: "user", content: "Q (json)" }], maxTokens: 3000, timeoutMs: 5000, retries: 0, ...extra });

test("parseOpenAIResponse: output_text (string / array), every message text part, refusal, incomplete", () => {
  assert.equal(parseOpenAIResponse(OK).text, '{"answer":"ok"}', "joins all output_text parts of the message");
  assert.equal(parseOpenAIResponse({ output_text: " hi " }).text, "hi");
  assert.equal(parseOpenAIResponse({ output_text: ["a", "b"] }).text, "ab");
  assert.equal(parseOpenAIResponse({ output_text: "", output: OK.output }).text, '{"answer":"ok"}', "empty output_text falls back to the parts");
  const mixed = { output: [
    { type: "message", role: "assistant", content: [{ type: "text", text: "one " }, { type: "output_text", text: { value: "two" } }] },
    { type: "message", role: "assistant", content: "three" },
    { type: "function_call", content: [{ type: "output_text", text: "not a message" }] },
  ] };
  assert.equal(parseOpenAIResponse(mixed).text, "one twothree");
  const refused = parseOpenAIResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }] });
  assert.equal(refused.text, "");
  assert.equal(refused.refusal, "I can't help with that.");
  assert.equal(refused.stop, "refusal");

  const inc = parseOpenAIResponse(INCOMPLETE, "gpt-6.1-sol");
  assert.equal(inc.text, "");
  assert.equal(inc.incomplete, "max_output_tokens");
  assert.equal(inc.stop, "incomplete:max_output_tokens");
  assert.equal(inc.thoughtTokens, 5048);
  assert.equal(parseOpenAIResponse(CUT_OFF).text, '{"answer": "Start with the');
});

test("openaiShortfall: cut off or empty is a shortfall; a normal reply or a refusal is not", () => {
  assert.equal(openaiShortfall(parseOpenAIResponse(INCOMPLETE)), "max_output_tokens");
  assert.equal(openaiShortfall(parseOpenAIResponse(CUT_OFF)), "max_output_tokens");
  assert.equal(openaiShortfall(parseOpenAIResponse(EMPTY)), "empty_output");
  assert.equal(openaiShortfall(parseOpenAIResponse({ status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] })), "content_filter");
  assert.equal(openaiShortfall(parseOpenAIResponse(OK)), "");
  assert.equal(openaiShortfall(parseOpenAIResponse({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })), "");
});

test("reasoning effort: minimal where supported, one step lower for the retry, never below a model's floor", () => {
  assert.equal(openaiEffort("gpt-5", "minimal"), "minimal");
  assert.equal(openaiEffort("gpt-5-mini-2025-08-07", "none"), "minimal");
  assert.equal(openaiEffort("gpt-5.5", "minimal"), "none");
  assert.equal(openaiEffort("gpt-6.1-sol", "minimal"), "low", "Sol rejects none");
  assert.equal(lowerEffort("gpt-5.5", "low"), "none");
  assert.equal(lowerEffort("gpt-5", "low"), "minimal");
  assert.equal(lowerEffort("gpt-5.5", "medium"), "low");
  assert.equal(lowerEffort("gpt-6.1-sol", "low"), "low");
  assert.equal(lowerEffort("gpt-4.1", "low"), null);
});

test("normal reply: one call, low effort, visible budget + reasoning headroom", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  const bodies = replay(OK);
  const out = await ask({ thinking: "low", reasoningHeadroom: 2000 });
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].reasoning, { effort: "low" });
  assert.equal(bodies[0].max_output_tokens, 5000);
  assert.deepEqual(out.json, { answer: "ok" });
});

test("incomplete (max_output_tokens) → one retry with lower effort and a doubled cap; both attempts billed", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  resetUsage();
  const bodies = replay(INCOMPLETE, OK);
  const out = await chat({ provider: "openai", model: "gpt-5.5", json: true, messages: [{ role: "user", content: "Q (json)" }], maxTokens: 3000, thinking: "medium", timeoutMs: 5000, retries: 0 });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].reasoning, { effort: "medium" });
  assert.deepEqual(bodies[1].reasoning, { effort: "low" }, "one effort step lower");
  assert.equal(bodies[0].max_output_tokens, 3000 + 2048);
  assert.equal(bodies[1].max_output_tokens, 6000 + 4096, "visible budget and reasoning headroom doubled");
  assert.deepEqual(out.json, { answer: "ok" });
  assert.equal(out.usage.inputTokens, 2000, "the cut-off attempt's tokens are in the returned usage");
  assert.equal(out.usage.outputTokens, 5048 + 2600);
  assert.equal(out.usage.attempts, 2);
  assert.equal(getUsage().calls, 2);
});

test("cut-off JSON is retried too (not returned as unparseable text)", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  const bodies = replay(CUT_OFF, OK);
  const out = await ask();
  assert.equal(bodies.length, 2);
  assert.deepEqual(out.json, { answer: "ok" });
});

test("still incomplete after the retry → ProviderError incomplete_output with a clear message and the billed usage", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  const bodies = replay(INCOMPLETE, INCOMPLETE);
  await assert.rejects(ask(), err => {
    assert.equal(err.code, "incomplete_output");
    assert.equal(err.provider, "openai");
    assert.match(err.message, /cut off at max_output_tokens=\d+/);
    assert.match(err.message, /reasoning/);
    assert.match(err.message, /after a retry with lower reasoning effort/);
    assert.equal(err.retryable, false);
    assert.equal(err.usage.inputTokens, 2000);
    assert.ok(err.usage.costUsd > 0, "spend of both attempts travels with the error");
    return true;
  });
  assert.equal(bodies.length, 2, "exactly one retry");
});

test("empty visible output (status completed, reasoning only) → retry, then incomplete_output 'no visible output'", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  const bodies = replay(EMPTY, EMPTY);
  await assert.rejects(
    chat({ provider: "openai", model: "gpt-5.5", json: true, messages: [{ role: "user", content: "Q (json)" }], maxTokens: 900, timeoutMs: 5000, retries: 0 }),
    err => err.code === "incomplete_output" && /no visible output/.test(err.message),
  );
  assert.equal(bodies.length, 2);
  const once = replay(EMPTY, OK);
  const out = await chat({ provider: "openai", model: "gpt-5.5", json: true, messages: [{ role: "user", content: "Q (json)" }], maxTokens: 900, timeoutMs: 5000, retries: 0 });
  assert.equal(once.length, 2);
  assert.deepEqual(out.json, { answer: "ok" });
});

test("retryIncomplete:false and a near deadline skip the retry", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  let bodies = replay(INCOMPLETE, OK);
  await assert.rejects(ask({ retryIncomplete: false }), err => err.code === "incomplete_output" && !/after a retry/.test(err.message));
  assert.equal(bodies.length, 1);
  bodies = replay(INCOMPLETE, OK);
  await assert.rejects(ask({ deadlineAt: Date.now() + 3000 }), err => err.code === "incomplete_output");
  assert.equal(bodies.length, 1, "no retry with < 5 s left before the deadline");
});

test("deadlineAt bounds the request: abort at the deadline, no retry past it, no request once it has passed", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  let calls = 0;
  globalThis.fetch = (url, init = {}) => {
    calls++;
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  };
  const t0 = Date.now();
  await assert.rejects(ask({ timeoutMs: 20_000, retries: 3, deadlineAt: Date.now() + 1300 }), err => err.code === "timeout");
  assert.ok(Date.now() - t0 < 2500, `stopped at the deadline (${Date.now() - t0} ms)`);
  assert.equal(calls, 1, "no retry once the deadline is near");
  calls = 0;
  await assert.rejects(ask({ deadlineAt: Date.now() - 1 }), err => err.code === "timeout");
  assert.equal(calls, 0);
});
