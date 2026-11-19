/**
 * Deterministic offline provider for local QA and the E2E journey (`AI_PROVIDER=mock`).
 * Never used on Vercel or with NODE_ENV=production: `runtime.getProvider` refuses to load it there
 * and every call throws if it somehow is. Drafts only from the SOURCES it is given and labels each
 * cited sentence "supported", so the real verifier, risk scoring and review desk run unchanged.
 *
 * AI_MOCK_MODE (read from process.env on every call, so a script can flip it mid-run):
 *   ok (default) | credits (402 prepaid credits depleted) | timeout | nojson
 * Mentor-assist prompts get general guidance with one unsourced figure for the post-check to strip.
 */

import { citeIds, stripCitationMarks } from "../../shared/citations.js";

export function mockAllowed(env = process.env) {
  return !env.VERCEL && !env.VERCEL_ENV && String(env.NODE_ENV || "").toLowerCase() !== "production";
}

const calls = [];

export function mockCalls() {
  return calls.slice();
}

export function resetMockCalls() {
  calls.length = 0;
}

class MockProviderError extends Error {
  constructor(message, { status = 0, code = "", retryable = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.provider = "mock";
  }
}

function guard() {
  if (!mockAllowed()) throw new MockProviderError("The mock AI provider is disabled in production.", { code: "unconfigured" });
  const mode = String(process.env.AI_MOCK_MODE || "ok").toLowerCase();
  if (mode === "credits") {
    throw new MockProviderError("mock 402: Gemini API prepaid credits are used up. Top up in AI Studio (ai.studio/projects → Billing), or switch to Vertex AI (AI_PROVIDER=vertex) to bill Google Cloud credits.", { status: 402, code: "credits_depleted" });
  }
  if (mode === "timeout") throw new MockProviderError("mock timeout after 20000ms", { code: "timeout", retryable: true });
  return mode;
}

const sentencesOf = text => String(text || "").split(/(?<=[.!?])\s+/).filter(Boolean);

/** A question containing this phrase is answered "insufficient" even when passages exist (exercises mentor-assist in the E2E journey). */
export const MOCK_THIN_PHRASE = "no-source-topic";

function draftJson(payload) {
  const srcs = payload.SOURCES || [];
  if (!srcs.length) return { insufficient: true, reason: "no sources" };
  if (String(payload.question || "").includes(MOCK_THIN_PHRASE)) return { insufficient: true, reason: "The sources do not cover this topic." };
  const top = srcs.slice(0, 2);
  const lines = top.map(s => `${sentencesOf(s.text)[0]} [c:${s.id}]`);
  return {
    answer: `Here is how to approach this. ${lines.join(" ")} Plan your next months around the official rules and check the notices yourself before you apply.`,
    actions: ["Read the official notice end to end", "Make a month-by-month plan", "Bookmark the official website for updates"],
    mistake: "Relying on coaching blogs instead of the official notice.",
    resources: top.map(s => ({ title: s.title, url: s.url })),
    citations: top.map(s => ({ chunkId: s.id, quote: sentencesOf(s.text)[0] })),
  };
}

/** General guidance with one unsourced figure, so the deterministic post-check visibly strips it. */
function mentorAssistJson(payload) {
  const home = (payload.OFFICIAL_HOMEPAGES || [])[0];
  return {
    answer: "This is a decision worth taking slowly. Start from the kind of work you enjoy every day and where you want to be in the long run, then compare the routes open to you. Talk to seniors who took each route recently and ask what they would do differently. Most students pay around Rs 50,000 for coaching. Before you commit, read the latest official notice from the body that runs the exam or recruitment and check your eligibility against it line by line.",
    actions: ["Write down what you want from the next few years", "Read the latest official notice end to end", "Ask a recent senior how the process worked for them"],
    mistake: "Deciding on the basis of coaching blogs instead of the official notice.",
    resources: home ? [{ title: home.name, url: home.url }] : [],
    citations: [],
  };
}

function verifyJson(payload) {
  const claims = [];
  for (const line of String(payload.draft || "").split(/(?<=[.!?])\s+|\n/)) {
    const ids = citeIds(line);
    if (!ids.length) continue;
    claims.push({ claim: stripCitationMarks(line), status: "supported", chunkIds: ids, note: "stated in source" });
  }
  return { claims };
}

export function isConfigured() {
  return mockAllowed();
}

export function providerInfo() {
  return {
    provider: "mock",
    label: "Mock provider (local tests only)",
    configured: mockAllowed(),
    draftModel: "mock-draft",
    verifyModel: "mock-verify",
    escalateModel: "",
    classifyModel: "mock-verify",
    embedProvider: null,
    embedConfigured: false,
    embedModel: null,
    embedDimensions: 0,
  };
}

export function isConfiguredFor() {
  return mockAllowed();
}

export async function chat(args = {}) {
  if (args.provider === "openai") {
    const r = await chat({ ...args, provider: undefined });
    return { ...r, model: String(r.model).replace(/^mock-/, "mock-gpt-"), provider: "openai" };
  }
  const mode = guard();
  const system = String(args.system || "");
  const content = String((args.messages && args.messages[0] && args.messages[0].content) || "");
  calls.push({ role: args.role || "draft", system: system.slice(0, 80), content });
  const usage = { inputTokens: 1200, outputTokens: 300 };
  if (/Decide whether a student's question asks for MEDICAL/.test(system)) {
    const json = { medical: false, reason: "career" };
    return { text: JSON.stringify(json), json, usage: { inputTokens: 80, outputTokens: 10 }, model: "mock-verify", provider: "mock" };
  }
  let payload = {};
  try { payload = JSON.parse(content); } catch { payload = {}; }
  if (/strict fact checker/.test(system)) {
    const json = verifyJson(payload);
    return { text: JSON.stringify(json), json, usage, model: "mock-verify", provider: "mock" };
  }
  if (mode === "nojson") return { text: "Sorry, I cannot help with that.", usage, model: "mock-draft", provider: "mock" };
  if (/MENTOR-ASSIST MODE/.test(system)) {
    const json = mentorAssistJson(payload);
    return { text: JSON.stringify(json), json, usage, model: "mock-draft", provider: "mock" };
  }
  if (!payload.SOURCES && /journals/.test(content)) {
    const json = { journals: [{ title: "Mock journal", source: "mock", url: "https://example.org/mock", snippet: "", publishedHint: "" }] };
    return { text: JSON.stringify(json), json, usage, model: "mock-draft", provider: "mock" };
  }
  const json = draftJson(payload);
  return { text: JSON.stringify(json), json, usage, model: "mock-draft", provider: "mock" };
}

export async function embed() {
  guard();
  throw new MockProviderError("Embeddings are not available on the mock provider", { code: "unconfigured" });
}

export async function testConnection() {
  const info = providerInfo();
  const t0 = Date.now();
  try {
    guard();
    return { ok: true, provider: "mock", label: info.label, configured: true, chat: { ok: true, model: "mock-draft", latencyMs: Date.now() - t0, costUsd: 0 }, embed: null };
  } catch (err) {
    const error = String(err && err.message || err).slice(0, 300);
    return { ok: false, provider: "mock", label: info.label, configured: info.configured, chat: { ok: false, model: "mock-draft", latencyMs: Date.now() - t0, error, code: err.code || "" }, embed: null, error };
  }
}
