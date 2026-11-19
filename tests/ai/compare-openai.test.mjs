import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { setEnvForTests, chat, openaiBody, estimateCostUsd, resetUsage } from "../../server/ai/provider.js";
import { compareModels, timeoutsFor, COMPARE_DEFAULT_MODELS, MAX_SIDE_TIMEOUT_MS } from "../../server/ai/compare.js";
import { loadServerEnv } from "../../server/env.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setEnvForTests(null);
});

function mockOpenAI(responseBody) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {}, body: JSON.parse(init.body || "{}"), signal: init.signal });
    return new Response(JSON.stringify(responseBody), { status: 200, headers: { "content-type": "application/json" } });
  };
  return calls;
}

const OK = {
  model: "gpt-5.5-2026-10-01",
  status: "completed",
  output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }],
  usage: { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 120 } },
};

test("compare defaults: GPT side drafts with gpt-5.5 and verifies with gpt-5.4-mini unless env / Settings say otherwise", () => {
  const env = loadServerEnv();
  assert.deepEqual({ ...COMPARE_DEFAULT_MODELS.openai }, { draft: "gpt-5.5", verify: "gpt-5.4-mini" });
  const m = compareModels("openai", {}, null);
  assert.equal(m.draft, String(env.OPENAI_DRAFT_MODEL || "").trim() || "gpt-5.5");
  assert.equal(m.verify, String(env.OPENAI_VERIFY_MODEL || "").trim() || "gpt-5.4-mini");
  if (!String(env.OPENAI_DRAFT_MODEL || "").trim()) {
    assert.equal(compareModels("openai", { models: { openai: { draft: "gpt-5.4", verify: "" } } }, null).draft, "gpt-5.4");
  }
  const t = timeoutsFor("openai");
  assert.ok(t.draft <= MAX_SIDE_TIMEOUT_MS && t.verify <= MAX_SIDE_TIMEOUT_MS);
});

test("pricing: gpt-5.5 and gpt-5.4-mini are priced (dated snapshots match)", () => {
  assert.ok(estimateCostUsd("gpt-5.5", 1e6, 0) > 0);
  assert.ok(estimateCostUsd("gpt-5.4-mini", 1e6, 0) > 0);
  assert.equal(estimateCostUsd("gpt-5.5-2026-10-01", 1e6, 0), estimateCostUsd("gpt-5.5", 1e6, 0));
  assert.ok(estimateCostUsd("gpt-5.4-mini", 1e6, 1e6) < estimateCostUsd("gpt-5.5", 1e6, 1e6));
});

test("openaiBody: GPT-5.x gets max_output_tokens (no max_tokens), no temperature, JSON schema format", () => {
  const b = openaiBody({
    model: "gpt-5.5", system: "sys", messages: [{ role: "user", content: "hi" }], maxTokens: 1000,
    json: true, jsonSchema: { name: "draft answer", schema: { type: "object" } }, temperature: 0.2, reasoning: "low", headroom: 500,
  });
  assert.equal(b.max_output_tokens, 1500);
  assert.equal("max_tokens" in b, false);
  assert.equal("max_completion_tokens" in b, false);
  assert.equal("temperature" in b, false);
  assert.deepEqual(b.reasoning, { effort: "low" });
  assert.equal(b.text.format.type, "json_schema");
  assert.equal(b.text.format.strict, true);
  assert.equal(b.store, false);
  const none = openaiBody({ model: "gpt-5.4-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 100, temperature: 0.3, reasoning: "none" });
  assert.equal("temperature" in none, false);
  assert.equal(none.max_output_tokens, 100);
  const legacy = openaiBody({ model: "gpt-4.1", messages: [{ role: "user", content: "hi" }], maxTokens: 100, temperature: 0.3, reasoning: "low" });
  assert.equal(legacy.temperature, 0.3);
});

test("chat({provider:'openai'}) posts a Responses API request and parses usage + cost (mocked fetch)", async () => {
  setEnvForTests({ GEMINI_API_KEY: "g-test", OPENAI_API_KEY: "sk-test-not-real" });
  resetUsage();
  const calls = mockOpenAI(OK);
  const out = await chat({
    provider: "openai", model: "gpt-5.5", role: "draft", json: true, messages: [{ role: "user", content: "Q" }],
    system: "S", maxTokens: 2000, timeoutMs: 20_000, retries: 0, temperature: 0.1,
  });
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, "https://api.openai.com/v1/responses");
  assert.equal(c.headers.Authorization, "Bearer sk-test-not-real");
  assert.equal(c.body.model, "gpt-5.5");
  assert.ok(c.body.max_output_tokens >= 2000);
  assert.equal("max_tokens" in c.body, false);
  assert.equal("temperature" in c.body, false);
  assert.equal(c.body.text.format.type, "json_object");
  assert.match(c.body.instructions, /^S/);
  assert.ok(c.signal, "request carries an abort signal (timeout)");
  assert.deepEqual(out.json, { answer: "ok" });
  assert.equal(out.provider, "openai");
  assert.equal(out.usage.inputTokens, 1200);
  assert.equal(out.usage.outputTokens, 300);
  assert.equal(out.usage.cachedTokens, 200);
  assert.equal(out.usage.thoughtTokens, 120);
  assert.ok(out.usage.costUsd > 0);
});

const inputText = body => body.input.map(m => m.content).join("\n");

test("json_object: the input messages always contain 'json' (OpenAI 400 otherwise); json_schema input is untouched", () => {
  const plain = openaiBody({ model: "gpt-5.4-mini", system: "Check claims.", messages: [{ role: "user", content: '{"DRAFT":"x"}' }], maxTokens: 100, json: true });
  assert.equal(plain.text.format.type, "json_object");
  assert.match(inputText(plain), /json/i);
  assert.match(plain.input[plain.input.length - 1].content, /Respond only with a valid JSON object\.$/);
  const multi = openaiBody({ model: "gpt-5.5", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }], maxTokens: 100, json: true });
  assert.equal(multi.input.length, 3);
  assert.equal(multi.input[0].content, "a");
  assert.match(multi.input[2].content, /^c\n\nRespond only with a valid JSON object\.$/);
  const already = openaiBody({ model: "gpt-5.5", messages: [{ role: "user", content: "Reply with JSON {\"ok\":true}" }], maxTokens: 10, json: true });
  assert.equal(already.input[0].content, "Reply with JSON {\"ok\":true}");
  const strict = openaiBody({ model: "gpt-5.5", messages: [{ role: "user", content: "{}" }], maxTokens: 10, json: true, jsonSchema: { name: "x", schema: { type: "object" } } });
  assert.equal(strict.text.format.type, "json_schema");
  assert.equal(strict.input[0].content, "{}");
  const text = openaiBody({ model: "gpt-5.5", messages: [{ role: "user", content: "hi" }], maxTokens: 10 });
  assert.equal(text.input[0].content, "hi");
});

test("chat(): every json_object request sent to OpenAI mentions json in its input — incl. the fallback after a rejected schema", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  const bodies = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (n++ === 0 && body.text.format.type === "json_schema") {
      return new Response(JSON.stringify({ error: { message: "Invalid schema for response_format 'x': text.format.schema" } }), { status: 400 });
    }
    if (body.text.format.type === "json_object" && !/json/i.test(inputText(body))) {
      return new Response(JSON.stringify({ error: { message: "Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'." } }), { status: 400 });
    }
    return new Response(JSON.stringify(OK), { status: 200 });
  };
  const out = await chat({ provider: "openai", model: "gpt-5.5", json: true, jsonSchema: { name: "x", schema: { type: "object" } }, messages: [{ role: "user", content: '{"Q":"hi"}' }], timeoutMs: 5000, retries: 0 });
  assert.deepEqual(out.json, { answer: "ok" });
  assert.deepEqual(bodies.map(b => b.text.format.type), ["json_schema", "json_object"]);
  assert.match(inputText(bodies[1]), /json/i);
  const v = await chat({ provider: "openai", model: "gpt-5.4-mini", role: "verify", json: true, messages: [{ role: "user", content: '{"DRAFT":"x"}' }], timeoutMs: 5000, retries: 0 });
  assert.deepEqual(v.json, { answer: "ok" });
  assert.match(inputText(bodies[2]), /json/i);
});

test("chat({provider:'openai'}) aborts at timeoutMs", async () => {
  setEnvForTests({ OPENAI_API_KEY: "sk-test-not-real" });
  globalThis.fetch = (url, init = {}) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  await assert.rejects(
    chat({ provider: "openai", model: "gpt-5.4-mini", role: "verify", messages: [{ role: "user", content: "Q" }], timeoutMs: 50, retries: 0 }),
    err => err.code === "timeout" && /timeout after 50ms/.test(err.message),
  );
});
