import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  setEnvForTests, chat, embed, providerInfo, detectProvider, estimateCostUsd, friendlyGoogleError,
  vertexModelUrl, testConnection, resetUsage,
} from "../../server/ai/provider.js";
import { passageWindow, needsEscalation } from "../../server/ai/draft.js";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const SA_EMAIL = "firebase-adminsdk-test@demo-proj.iam.gserviceaccount.com";
const SA_ENV = { AI_PROVIDER: "vertex", FIREBASE_PROJECT_ID: "demo-proj", FIREBASE_CLIENT_EMAIL: SA_EMAIL, FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, "\\n") };

const realFetch = globalThis.fetch;
let calls;
let routes;

function jsonRes(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function mockFetch() {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const call = { url: u, method: init.method, headers: init.headers || {}, body: init.body };
    calls.push(call);
    for (const [match, handler] of routes) if (match(u)) return handler(call);
    return jsonRes(500, { error: { message: `no route for ${u}` } });
  };
}

const tokenRoute = (expiresIn = 3600) => [u => u === "https://oauth2.googleapis.com/token", () => jsonRes(200, { access_token: `tok-${calls.length}`, expires_in: expiresIn, token_type: "Bearer" })];
const genOk = (extra = {}) => ({
  candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"ok":true}' }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 100, cachedContentTokenCount: 400 },
  modelVersion: "gemini-4-argon",
  ...extra,
});
const genRoute = (handler = () => jsonRes(200, genOk())) => [u => u.includes(":generateContent"), handler];

beforeEach(() => { routes = []; mockFetch(); resetUsage(); });
afterEach(() => { globalThis.fetch = realFetch; setEnvForTests(null); });

test("vertex: service-account token is a valid RS256 JWT and is cached until 5 min before expiry", async () => {
  setEnvForTests(SA_ENV);
  routes = [tokenRoute(3600), genRoute()];
  await chat({ messages: [{ role: "user", content: "hi" }], model: "gemini-4-argon" });
  await chat({ messages: [{ role: "user", content: "hi again" }], model: "gemini-4-argon" });
  const tokenCalls = calls.filter(c => c.url.includes("oauth2"));
  assert.equal(tokenCalls.length, 1, "second call reuses the cached token");
  const form = new URLSearchParams(tokenCalls[0].body);
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, p, s] = form.get("assertion").split(".");
  const claim = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(claim.iss, SA_EMAIL);
  assert.equal(claim.scope, "https://www.googleapis.com/auth/cloud-platform");
  assert.ok(crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url")), "signature verifies");
  const gen = calls.filter(c => c.url.includes(":generateContent"));
  assert.match(gen[0].headers.Authorization, /^Bearer tok-/);
  assert.equal(JSON.stringify(gen).includes(PEM.slice(40, 80)), false, "private key never sent");

  // A token that expires in under 5 minutes is refreshed on every call.
  setEnvForTests({ ...SA_ENV, FIREBASE_CLIENT_EMAIL: "other@demo-proj.iam.gserviceaccount.com" });
  routes = [tokenRoute(200), genRoute()];
  calls.length = 0;
  await chat({ messages: [{ role: "user", content: "a" }], model: "gemini-4-argon" });
  await chat({ messages: [{ role: "user", content: "b" }], model: "gemini-4-argon" });
  assert.equal(calls.filter(c => c.url.includes("oauth2")).length, 2);
});

test("vertex: global vs regional endpoints, express-mode API key", () => {
  const sa = { mode: "service-account", project: "demo-proj" };
  assert.equal(vertexModelUrl({ ...sa, location: "global" }, "gemini-4-argon", "generateContent"),
    "https://aiplatform.googleapis.com/v1/projects/demo-proj/locations/global/publishers/google/models/gemini-4-argon:generateContent");
  assert.equal(vertexModelUrl({ ...sa, location: "asia-south1" }, "gemini-3.8-flash", "generateContent"),
    "https://asia-south1-aiplatform.googleapis.com/v1/projects/demo-proj/locations/asia-south1/publishers/google/models/gemini-3.8-flash:generateContent");
  assert.equal(vertexModelUrl({ mode: "api-key", location: "global" }, "gemini-3.8-flash", "predict"),
    "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:predict");
  setEnvForTests({ ...SA_ENV, VERTEX_LOCATION: "asia-south1", VERTEX_PROJECT: "billing-proj" });
  const info = providerInfo();
  assert.equal(info.provider, "vertex");
  assert.deepEqual([info.vertex.project, info.vertex.location, info.vertex.host, info.vertex.serviceAccount], ["billing-proj", "asia-south1", "asia-south1-aiplatform.googleapis.com", SA_EMAIL]);
});

test("vertex: API-key mode sends x-goog-api-key and no OAuth call", async () => {
  setEnvForTests({ AI_PROVIDER: "vertex", VERTEX_API_KEY: "AQ.test-key-value" });
  routes = [genRoute()];
  await chat({ messages: [{ role: "user", content: "hi" }], model: "gemini-3.8-flash" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers["x-goog-api-key"], "AQ.test-key-value");
  assert.ok(calls[0].url.startsWith("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash"));
  assert.equal(providerInfo().vertex.auth, "api-key");
});

test("vertex: JSON mode, system instruction, thinking level and output cap in the request", async () => {
  setEnvForTests(SA_ENV);
  routes = [tokenRoute(), genRoute()];
  const r = await chat({ system: "Be terse.", messages: [{ role: "user", content: "x" }], role: "draft", json: true, maxTokens: 900 });
  const body = JSON.parse(calls.find(c => c.url.includes(":generateContent")).body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "low");
  assert.equal(body.generationConfig.maxOutputTokens, 900 + 1536, "thoughts share maxOutputTokens, so headroom is added");
  assert.match(body.systemInstruction.parts[0].text, /^Be terse\./);
  assert.equal(body.contents[0].role, "user");
  assert.deepEqual(r.json, { ok: true }, "thought parts are skipped");
  assert.ok(calls.some(c => c.url.includes("/models/gemini-4-argon:generateContent")), "draft role → Pro model");
});

test("vertex: usage parsing and cost (cached input, thinking tokens, regional uplift, dated tiers)", async () => {
  setEnvForTests({ ...SA_ENV, VERTEX_LOCATION: "asia-south1" });
  routes = [tokenRoute(), genRoute()];
  const r = await chat({ messages: [{ role: "user", content: "x" }], model: "gemini-4-argon" });
  assert.equal(r.usage.inputTokens, 1000);
  assert.equal(r.usage.outputTokens, 300, "candidates + thoughts");
  assert.equal(r.usage.cachedTokens, 400);
  const nov = estimateCostUsd("gemini-4-argon", 1000, 300, { cachedTokens: 400, at: "2026-11-15" });
  assert.equal(nov, Math.round(((600 * 2 + 400 * 0.1 + 300 * 10) / 1e6) * 1e6) / 1e6);
  const dec = estimateCostUsd("gemini-4-argon", 1000, 300, { cachedTokens: 400, at: "2026-12-10" });
  assert.equal(dec, Math.round(((600 * 4 + 400 * 0.2 + 300 * 20) / 1e6) * 1e6) / 1e6);
  assert.equal(estimateCostUsd("gemini-3.8-flash", 1e6, 0, { at: "2026-12-10", regional: true }), 0.825);
  assert.equal(estimateCostUsd("gemini-3.5-flash-lite-001", 1e6, 0), 0.3, "versioned ids match the longest prefix");
  assert.equal(estimateCostUsd("unknown-model", 10, 10), null);
});

test("vertex: friendly errors — API disabled, IAM role, billing, region, blocked key, prepaid credits", async () => {
  const disabled = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Vertex AI API has not been used in project demo-proj before or it is disabled.", details: [{ reason: "SERVICE_DISABLED", metadata: { consumer: "projects/demo-proj" } }] } });
  assert.equal(friendlyGoogleError(403, disabled).code, "api_disabled");
  assert.match(friendlyGoogleError(403, disabled).message, /Enable the Vertex AI API in project demo-proj/);
  const iam = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Permission 'aiplatform.endpoints.predict' denied on resource", details: [{ reason: "IAM_PERMISSION_DENIED" }] } });
  const f = friendlyGoogleError(403, iam, { project: "demo-proj", serviceAccount: SA_EMAIL });
  assert.equal(f.code, "permission_denied");
  assert.match(f.message, new RegExp(`roles/aiplatform.user to ${SA_EMAIL.replace(/\./g, "\\.")}`));
  const billing = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "This API method requires billing to be enabled.", details: [{ reason: "BILLING_DISABLED" }] } });
  assert.equal(friendlyGoogleError(403, billing, { project: "demo-proj" }).code, "billing_disabled");
  const notFound = JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "Publisher Model `gemini-4-argon` was not found or your project does not have access to it." } });
  assert.match(friendlyGoogleError(404, notFound, { model: "gemini-4-argon", location: "asia-south1" }).message, /VERTEX_LOCATION=global/);
  const blocked = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Requests to this API aiplatform.googleapis.com method x are blocked.", details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } });
  assert.equal(friendlyGoogleError(403, blocked).code, "key_blocked");
  const prepay = JSON.stringify({ error: { code: 402, status: "RESOURCE_EXHAUSTED", message: "Your prepayment credits are depleted." } });
  assert.equal(friendlyGoogleError(402, prepay).code, "credits_depleted");

  // Account-level failures stop the fallback chain; the error carries the instruction, not the raw body.
  setEnvForTests(SA_ENV);
  routes = [tokenRoute(), genRoute(() => jsonRes(403, disabled))];
  await assert.rejects(chat({ messages: [{ role: "user", content: "x" }] }), err => err.code === "api_disabled" && /Enable the Vertex AI API/.test(err.message));
  assert.equal(calls.filter(c => c.url.includes(":generateContent")).length, 1, "no retries / no fallback models for a disabled API");
});

test("vertex: model missing in a region falls back down the chain; rejected thinking level retries once without it", async () => {
  setEnvForTests(SA_ENV);
  const notFound = JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "Publisher Model was not found." } });
  routes = [tokenRoute(), genRoute(c => (c.url.includes("gemini-4-argon") ? jsonRes(404, notFound) : jsonRes(200, genOk({ modelVersion: "gemini-3.1-pro-preview" }))))];
  const r = await chat({ messages: [{ role: "user", content: "x" }], role: "draft" });
  assert.equal(r.model, "gemini-3.1-pro-preview");

  routes = [tokenRoute(), genRoute(c => (JSON.parse(c.body).generationConfig.thinkingConfig
    ? jsonRes(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "thinking_level minimal is not supported for this model" } })
    : jsonRes(200, genOk())))];
  calls.length = 0;
  const r2 = await chat({ messages: [{ role: "user", content: "x" }], model: "gemini-3.8-flash", thinking: "minimal" });
  assert.equal(r2.text, '{"ok":true}');
  assert.equal(calls.filter(c => c.url.includes(":generateContent")).length, 2);
});

test("vertex: embeddings ask for 768 dims, go one instance per request for gemini-embedding, come back unit-length", async () => {
  setEnvForTests(SA_ENV);
  routes = [tokenRoute(), [u => u.includes(":predict"), c => {
    const b = JSON.parse(c.body);
    return jsonRes(200, { predictions: b.instances.map(() => ({ embeddings: { values: new Array(768).fill(0.5), statistics: { token_count: 7 } } })) });
  }]];
  const v = await embed(["one", "two", "three"], { taskType: "query" });
  const predicts = calls.filter(c => c.url.includes(":predict"));
  assert.equal(predicts.length, 3);
  const body = JSON.parse(predicts[0].body);
  assert.equal(body.parameters.outputDimensionality, 768);
  assert.equal(body.instances[0].task_type, "RETRIEVAL_QUERY");
  assert.ok(predicts[0].url.endsWith("/publishers/google/models/gemini-embedding-001:predict"));
  assert.equal(v.length, 3);
  assert.equal(v[0].length, 768);
  assert.ok(Math.abs(v[0].reduce((s, x) => s + x * x, 0) - 1) < 1e-9);
  assert.equal(v.usage.inputTokens, 21);
  assert.equal(v.dimensions, 768);

  calls.length = 0;
  await embed(["one"], { taskType: "query" });
  await embed(["one"], { taskType: "query" });
  assert.equal(calls.filter(c => c.url.includes(":predict")).length, 1, "repeated query embeddings are cached");
});

test("auto-detect keeps the Gemini key path; vertex only when AI_PROVIDER=vertex", () => {
  const base = { GEMINI_API_KEY: "AIzaTest", FIREBASE_PROJECT_ID: "demo-proj", FIREBASE_CLIENT_EMAIL: SA_EMAIL, FIREBASE_PRIVATE_KEY: PEM };
  assert.equal(detectProvider(base), "gemini");
  assert.equal(detectProvider({ ...base, AI_PROVIDER: "vertex" }), "vertex");
  assert.equal(detectProvider({ FIREBASE_PROJECT_ID: "demo-proj", FIREBASE_CLIENT_EMAIL: SA_EMAIL, FIREBASE_PRIVATE_KEY: PEM }), null, "service account alone never turns AI on");
  setEnvForTests({ ...base, AI_VERIFY_MODEL: "gemini-3.6-flash", AI_VERIFY_ESCALATE_MODEL: "off" });
  const info = providerInfo();
  assert.deepEqual([info.draftModel, info.verifyModel, info.escalateModel, info.classifyModel, info.embedModel], ["gemini-4-argon", "gemini-3.6-flash", null, "gemini-3.5-flash-lite", "gemini-embedding-001"]);
});

test("testConnection returns the friendly error instead of throwing", async () => {
  setEnvForTests(SA_ENV);
  const disabled = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "API has not been used in project demo-proj before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } });
  routes = [tokenRoute(), [u => u.includes("aiplatform"), () => jsonRes(403, disabled)]];
  const r = await testConnection();
  assert.equal(r.ok, false);
  assert.equal(r.chat.code, "api_disabled");
  assert.equal(r.embed.code, "api_disabled");
  assert.match(r.error, /Enable the Vertex AI API in project demo-proj/);
  assert.equal(r.vertex.serviceAccount, SA_EMAIL);
});

test("cost savers: passage window keeps the matching span; escalation only when the cheap verifier is unsure", () => {
  const filler = "General information about the council and its many offices across the country. ".repeat(20);
  const text = `${filler}The AIAPGET application fee for General candidates is Rs 2,700. ${filler}`;
  const w = passageWindow(text, "AIAPGET application fee", 400);
  assert.ok(w.length <= 400);
  assert.ok(w.includes("Rs 2,700"));
  assert.ok(text.includes(w), "verbatim slice");
  assert.equal(needsEscalation({ verifierUsed: true, confidence: 0.9, counts: { invalidCitations: 0 }, claimChecks: [{ status: "supported" }] }), false);
  assert.equal(needsEscalation({ verifierUsed: true, confidence: 0.7, counts: { invalidCitations: 0 }, claimChecks: [{ status: "supported" }] }), true, "borderline");
  assert.equal(needsEscalation({ verifierUsed: true, confidence: 0.35, counts: { invalidCitations: 0 }, claimChecks: [{ status: "unsupported", note: "" }] }), true, "verifier doubts a claim");
  assert.equal(needsEscalation({ verifierUsed: true, confidence: 0.35, counts: { invalidCitations: 0 }, claimChecks: [{ status: "unsupported", note: "number 2,900 not found in the cited source" }] }), false, "deterministic failures are not re-judged");
  assert.equal(needsEscalation({ verifierUsed: true, confidence: 0.35, counts: { invalidCitations: 1 }, claimChecks: [] }), false);
});
