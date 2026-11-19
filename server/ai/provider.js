/**
 * Provider-agnostic LLM + embedding client (server-only — never import from src/).
 *
 * Env (read from .env.local / .env / process.env via server/env.js):
 *   AI_PROVIDER        anthropic | openai | gemini | vertex   (optional; auto-detected from whichever
 *                      key exists — vertex is only used when asked for explicitly)
 *   AI_DRAFT_MODEL     drafting model             (default: provider's Pro-class model)
 *   AI_VERIFY_MODEL    claim-check model          (default: provider's Flash-class model)
 *   AI_VERIFY_ESCALATE_MODEL  re-check for borderline / high-risk drafts ("off" disables)
 *   AI_CLASSIFY_MODEL  medical second-opinion     (default: Flash-Lite-class model)
 *   AI_DRAFT_THINKING / AI_VERIFY_THINKING / AI_CLASSIFY_THINKING  Gemini thinking level
 *                      (minimal | low | medium | high | off; defaults low / low / minimal)
 *   AI_THINKING_HEADROOM  extra output tokens allowed for thoughts (default 1536)
 *   AI_EMBED_MODEL     embedding model id         (default: provider's embedding model)
 *   AI_EMBED_DIM       embedding dimensions       (default 768; Firestore vector indexes cap at 2048)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
 *
 * OpenAI (Responses API; also reachable pinned with chat({provider:"openai"}) for compare mode):
 *   OPENAI_DRAFT_MODEL / OPENAI_VERIFY_MODEL / OPENAI_ESCALATE_MODEL / OPENAI_CLASSIFY_MODEL
 *                      (AI_*_MODEL apply to OpenAI only when it is the primary provider)
 *   OPENAI_DRAFT_REASONING / OPENAI_VERIFY_REASONING / OPENAI_CLASSIFY_REASONING  reasoning.effort
 *                      (none | minimal | low | medium | high; defaults low / low / none; "none" becomes
 *                      "minimal" on the original gpt-5 line and "low" on models that reject both)
 *   OPENAI_REASONING_HEADROOM  extra max_output_tokens for reasoning tokens (default 2048). Reasoning
 *                      counts against max_output_tokens: a cut-off / empty reply is retried once with
 *                      lower effort and a doubled cap, then fails with code "incomplete_output".
 *
 * Vertex AI (bills the Google Cloud project — post-paid billing and Cloud credits):
 *   VERTEX_API_KEY     express-mode API key (global endpoint, no service account), or a service account:
 *   VERTEX_SA_JSON     path to (or inline) service-account JSON; else GOOGLE_APPLICATION_CREDENTIALS;
 *                      else FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (+ FIREBASE_PROJECT_ID)
 *   VERTEX_PROJECT     default: the service account's project / FIREBASE_PROJECT_ID
 *   VERTEX_LOCATION    default "global"; regional e.g. "asia-south1" (non-global costs ~10% more)
 *
 * Anthropic has no embedding API, so embeddings use OpenAI, Gemini or Vertex when available.
 * Keys and tokens are never logged or returned.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadServerEnv, PREVIEW_ROOT } from "../env.js";

/**
 * USD per 1M tokens, paid tier, text. Checked 28 Oct 2026 against
 * https://ai.google.dev/gemini-api/docs/pricing and https://cloud.google.com/vertex-ai/generative-ai/pricing
 * (Vertex "global" = Gemini API price; Vertex regional endpoints are ×1.1). Tiers apply through `until`
 * (inclusive, UTC day); `cached` is the implicit-cache input rate. Unknown model → cost null.
 */
const PRICES = {
  "gemini-4-argon": [{ until: "2026-11-30", in: 2.0, out: 10.0, cached: 0.1 }, { in: 4.0, out: 20.0, cached: 0.2 }],
  "gemini-3.8-flash": [{ until: "2026-12-31", in: 0.75, out: 3.75, cached: 0.075 }, { in: 1.5, out: 7.5, cached: 0.15 }],
  "gemini-3.7-flash": [{ until: "2026-12-31", in: 0.75, out: 3.75, cached: 0.075 }, { in: 1.5, out: 7.5, cached: 0.15 }],
  "gemini-3.6-flash": [{ until: "2026-12-31", in: 0.75, out: 3.75, cached: 0.075 }, { in: 1.5, out: 7.5, cached: 0.15 }],
  "gemini-3.5-flash-lite": [{ in: 0.3, out: 2.5, cached: 0.03 }],
  "gemini-3.1-flash-lite": [{ in: 0.25, out: 1.5, cached: 0.025 }],
  "gemini-3.1-pro-preview": [{ in: 2.0, out: 12.0, cached: 0.2 }],
  "gemini-embedding-001": [{ in: 0.15, out: 0 }],
  "gemini-embedding-2": [{ in: 0.2, out: 0 }],
  "text-embedding-005": [{ in: 0.025, out: 0 }],
  "claude-fable-5-1": [{ in: 10.0, out: 50.0 }],
  "claude-opus-5-5": [{ in: 4.0, out: 20.0 }],
  "claude-sonnet-5-5": [{ in: 2.0, out: 10.0 }],
  "claude-haiku-5-5": [{ in: 0.1, out: 0.5 }],
  // OpenAI Standard tier, short context (≤272K input), checked 7 Nov 2026 at
  // https://platform.openai.com/docs/pricing. `out` includes reasoning tokens (billed as output).
  "gpt-6-astra": [{ in: 10.0, out: 50.0, cached: 1.0 }],
  "gpt-6.1-sol": [{ in: 2.0, out: 10.0, cached: 0.1 }],
  "gpt-6.1-terra": [{ in: 1.0, out: 5.0, cached: 0.05 }],
  "gpt-6-sol": [{ in: 2.0, out: 10.0, cached: 0.2 }],
  "gpt-6-luna": [{ in: 0.1, out: 0.5, cached: 0.01 }],
  "gpt-5.6-sol": [{ in: 4.0, out: 20.0, cached: 0.4 }],
  "gpt-5.6-terra": [{ in: 2.0, out: 12.0, cached: 0.2 }],
  "gpt-5.6-luna": [{ in: 0.2, out: 1.2, cached: 0.02 }],
  "gpt-5.5": [{ in: 5.0, out: 30.0, cached: 0.5 }],
  "gpt-5.5-pro": [{ in: 30.0, out: 180.0 }],
  "gpt-5.4": [{ in: 2.5, out: 15.0, cached: 0.25 }],
  "gpt-5.4-pro": [{ in: 30.0, out: 180.0 }],
  "gpt-5.4-mini": [{ in: 0.75, out: 4.5, cached: 0.075 }],
  "gpt-5.4-nano": [{ in: 0.2, out: 1.25, cached: 0.02 }],
  "gpt-5.2": [{ in: 1.75, out: 14.0, cached: 0.175 }],
  "gpt-5.2-pro": [{ in: 21.0, out: 168.0 }],
  "gpt-5.1": [{ in: 1.25, out: 10.0, cached: 0.125 }],
  "gpt-5": [{ in: 1.25, out: 10.0, cached: 0.125 }],
  "gpt-5-pro": [{ in: 15.0, out: 120.0 }],
  "gpt-5-mini": [{ in: 0.25, out: 2.0, cached: 0.025 }],
  "gpt-5-nano": [{ in: 0.05, out: 0.4, cached: 0.005 }],
  "gpt-4.1": [{ in: 2.0, out: 8.0, cached: 0.5 }],
  "gpt-4.1-mini": [{ in: 0.4, out: 1.6, cached: 0.1 }],
  "gpt-4o": [{ in: 2.5, out: 10.0, cached: 1.25 }],
  "gpt-4o-mini": [{ in: 0.15, out: 0.6, cached: 0.075 }],
  "text-embedding-3-large": [{ in: 0.13, out: 0 }],
  "text-embedding-3-small": [{ in: 0.02, out: 0 }],
};
export const PRICING_CHECKED = {
  date: "2026-11-07",
  urls: ["https://ai.google.dev/gemini-api/docs/pricing", "https://cloud.google.com/vertex-ai/generative-ai/pricing", "https://platform.openai.com/docs/pricing"],
};

const GEMINI_MODELS = {
  draft: "gemini-4-argon",
  verify: "gemini-3.8-flash",
  escalate: "gemini-4-argon",
  classify: "gemini-3.5-flash-lite",
  fallbacks: {
    draft: ["gemini-3.1-pro-preview", "gemini-3.8-flash"],
    verify: ["gemini-3.6-flash"],
    escalate: ["gemini-3.1-pro-preview"],
    classify: ["gemini-3.1-flash-lite", "gemini-3.8-flash"],
  },
  embed: "gemini-embedding-001",
  thinking: { draft: "low", verify: "low", escalate: "low", classify: "minimal" },
};

const PROVIDERS = {
  gemini: { label: "Gemini API", keyEnv: "GEMINI_API_KEY", ...GEMINI_MODELS },
  vertex: { label: "Vertex AI", keyEnv: null, ...GEMINI_MODELS },
  anthropic: {
    label: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    draft: "claude-fable-5-1",
    verify: "claude-sonnet-5-5",
    escalate: "claude-fable-5-1",
    classify: "claude-haiku-5-5",
    fallbacks: { draft: ["claude-opus-5-5", "claude-sonnet-5-5"], verify: ["claude-opus-5-5"], escalate: ["claude-opus-5-5"], classify: ["claude-sonnet-5-5"] },
    embed: null,
  },
  // Drafting: GPT-6.1 Sol ("near-Astra" quality at $2/$10, same price class as Gemini 4 Argon);
  // checking: GPT-6.1 Terra (Flash class); classify: GPT-6 Luna. Astra ($10/$50) is 5× the cost
  // and too slow at useful effort for the worker's 20 s draft slot. docs/ai/AI-ANSWER-PIPELINE.md.
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    draft: "gpt-6.1-sol",
    verify: "gpt-6.1-terra",
    escalate: "gpt-6.1-sol",
    classify: "gpt-6-luna",
    fallbacks: { draft: ["gpt-6-sol", "gpt-5.5"], verify: ["gpt-6-luna"], escalate: ["gpt-6-sol"], classify: ["gpt-6.1-terra"] },
    reasoning: { draft: "low", verify: "low", escalate: "low", classify: "none" },
    embed: "text-embedding-3-large",
  },
};

const ROLE_ENV = { draft: "AI_DRAFT_MODEL", verify: "AI_VERIFY_MODEL", escalate: "AI_VERIFY_ESCALATE_MODEL", classify: "AI_CLASSIFY_MODEL" };
const THINK_ENV = { draft: "AI_DRAFT_THINKING", verify: "AI_VERIFY_THINKING", escalate: "AI_VERIFY_THINKING", classify: "AI_CLASSIFY_THINKING" };
const OPENAI_MODEL_ENV = { draft: "OPENAI_DRAFT_MODEL", verify: "OPENAI_VERIFY_MODEL", escalate: "OPENAI_ESCALATE_MODEL", classify: "OPENAI_CLASSIFY_MODEL" };
const OPENAI_REASONING_ENV = { draft: "OPENAI_DRAFT_REASONING", verify: "OPENAI_VERIFY_REASONING", escalate: "OPENAI_VERIFY_REASONING", classify: "OPENAI_CLASSIFY_REASONING" };
const REASONING_LEVELS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
/** GPT-6 Astra / GPT-6.1 Sol (and the gpt-5 "pro" line) reject reasoning.effort "none". */
const NO_NONE_EFFORT = /^(gpt-6-astra|gpt-6\.1-sol|gpt-5(\.\d+)?-pro|gpt-5(-\d{4}|$)|gpt-5-(mini|nano))/;
/** The original GPT-5 line (gpt-5 / -mini / -nano) has "minimal" as its lowest effort instead of "none". */
const MINIMAL_EFFORT = /^gpt-5(-mini|-nano)?(-\d{4}|$)/;
/** Non-reasoning models: no reasoning parameter at all. */
const NO_REASONING = /^(gpt-4|gpt-3|chatgpt-)/;
const FIXED_SAMPLING = /^(gpt-5|gpt-6|o\d)/;
const OFF = new Set(["off", "none", "0", "false", "no"]);

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_RETRIES = 3;

let envOverride = null;

/** Tests: replace the whole env (no .env.local / process.env). Pass null to restore. */
export function setEnvForTests(e) {
  envOverride = e ? { ...e } : null;
  tokenCache.clear();
  queryEmbedCache.clear();
}

function env() {
  return envOverride || loadServerEnv();
}

function clean(v) {
  const s = String(v || "").trim();
  // `vercel env pull` writes this placeholder for Sensitive values.
  return s && s !== "[SENSITIVE]" ? s : "";
}

// ---------------------------------------------------------------- Vertex credentials

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function saFrom(obj, source) {
  if (!obj || typeof obj !== "object") return null;
  const clientEmail = clean(obj.client_email);
  const privateKey = String(obj.private_key || "").replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey, projectId: clean(obj.project_id), source };
}

function saFromRef(ref, source) {
  const v = clean(ref);
  if (!v) return null;
  if (v.startsWith("{")) { try { return saFrom(JSON.parse(v), source); } catch { return null; } }
  const p = path.isAbsolute(v) ? v : path.resolve(PREVIEW_ROOT, v);
  return saFrom(readJson(p), source);
}

/** How Vertex calls authenticate: express-mode API key, or a service account (OAuth2 JWT bearer). */
export function vertexAuth(e = env()) {
  const apiKey = clean(e.VERTEX_API_KEY);
  const location = clean(e.VERTEX_LOCATION) || "global";
  if (apiKey) return { mode: "api-key", key: apiKey, project: clean(e.VERTEX_PROJECT) || null, location: "global" };
  const sa = saFromRef(e.VERTEX_SA_JSON, "VERTEX_SA_JSON")
    || saFromRef(e.GOOGLE_APPLICATION_CREDENTIALS, "GOOGLE_APPLICATION_CREDENTIALS")
    || saFrom({ client_email: e.FIREBASE_CLIENT_EMAIL, private_key: e.FIREBASE_PRIVATE_KEY, project_id: e.FIREBASE_PROJECT_ID }, "FIREBASE_*")
    || saFromRef(e.FIREBASE_SERVICE_ACCOUNT_JSON, "FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!sa) return null;
  const project = clean(e.VERTEX_PROJECT) || sa.projectId || clean(e.FIREBASE_PROJECT_ID) || clean(e.GOOGLE_CLOUD_PROJECT);
  if (!project) return null;
  return { mode: "service-account", sa, project, location };
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_EARLY_MS = 5 * 60 * 1000;
const tokenCache = new Map();

const b64url = buf => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** OAuth2 access token for a service account, cached until 5 minutes before expiry. */
export async function vertexAccessToken(sa, { timeoutMs = 15_000 } = {}) {
  const hit = tokenCache.get(sa.clientEmail);
  if (hit && (hit.pending || hit.expiresAt - TOKEN_EARLY_MS > Date.now())) return hit.pending || hit.token;
  const pending = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
    let sig;
    try {
      sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(`${head}.${claim}`), sa.privateKey));
    } catch {
      throw new ProviderError("Vertex AI: the service-account private key could not be read (check FIREBASE_PRIVATE_KEY / the JSON file).", { provider: "vertex", code: "bad_key" });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }).toString(),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new ProviderError(`Vertex AI: could not reach ${TOKEN_URL} (${err?.name === "AbortError" ? "timeout" : err?.message || err})`, { provider: "vertex", retryable: true, code: "network" });
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const bad = /invalid_grant|invalid_client|account not found/i.test(text);
      throw new ProviderError(bad
        ? `Vertex AI: Google rejected the service account ${sa.clientEmail} (key revoked/deleted or clock skew).`
        : `Vertex AI: token exchange failed (${res.status}): ${redact(text)}`,
      { status: res.status, provider: "vertex", code: bad ? "bad_key" : "token_failed", retryable: RETRYABLE_STATUS.has(res.status) });
    }
    let data = {};
    try { data = JSON.parse(text); } catch { /* handled below */ }
    if (!data.access_token) throw new ProviderError("Vertex AI: token response had no access_token", { provider: "vertex", code: "token_failed" });
    const expiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    tokenCache.set(sa.clientEmail, { token: data.access_token, expiresAt });
    return data.access_token;
  })();
  tokenCache.set(sa.clientEmail, { pending });
  try {
    return await pending;
  } catch (err) {
    tokenCache.delete(sa.clientEmail);
    throw err;
  }
}

export function vertexHost(location) {
  return !location || location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
}

export function vertexModelUrl(auth, model, method) {
  const m = encodeURIComponent(model);
  if (auth.mode === "api-key") return `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:${method}`;
  return `https://${vertexHost(auth.location)}/v1/projects/${encodeURIComponent(auth.project)}/locations/${encodeURIComponent(auth.location)}/publishers/google/models/${m}:${method}`;
}

async function vertexHeaders(auth, timeoutMs) {
  if (auth.mode === "api-key") return { "x-goog-api-key": auth.key };
  return { Authorization: `Bearer ${await vertexAccessToken(auth.sa, { timeoutMs: Math.min(timeoutMs, 15_000) })}` };
}

// ---------------------------------------------------------------- detection / config

function keyFor(provider, e = env()) {
  if (provider === "vertex") return vertexAuth(e) ? "vertex" : "";
  const spec = PROVIDERS[provider];
  if (!spec || !spec.keyEnv) return "";
  return clean(e[spec.keyEnv]);
}

/** Which provider chat() uses: AI_PROVIDER if its credentials exist, else the first API key found. */
export function detectProvider(e = env()) {
  const wanted = String(e.AI_PROVIDER || "").trim().toLowerCase();
  if (wanted && PROVIDERS[wanted] && keyFor(wanted, e)) return wanted;
  for (const p of ["anthropic", "openai", "gemini"]) if (keyFor(p, e)) return p;
  return wanted && PROVIDERS[wanted] ? wanted : null;
}

function detectEmbedProvider(e = env()) {
  const main = detectProvider(e);
  if (main && PROVIDERS[main].embed && keyFor(main, e)) return main;
  for (const p of ["openai", "gemini"]) if (keyFor(p, e)) return p;
  return null;
}

/**
 * Model for a role. AI_*_MODEL belong to the primary provider (they name Gemini models in
 * production), so a provider pinned for compare mode reads only its own OPENAI_*_MODEL.
 */
function modelFor(role, e, spec, provider = detectProvider(e)) {
  const r = ROLE_ENV[role] ? role : "draft";
  const own = provider === "openai" ? clean(e[OPENAI_MODEL_ENV[r]]) : "";
  const generic = provider === detectProvider(e) ? clean(e[ROLE_ENV[r]]) : "";
  const explicit = own || generic;
  if (r === "escalate" && OFF.has(explicit.toLowerCase())) return null;
  return explicit || (spec && spec[r]) || null;
}

function thinkingFor(role, e, spec) {
  const r = THINK_ENV[role] ? role : "draft";
  const v = clean(e[THINK_ENV[r]]).toLowerCase();
  if (v) return OFF.has(v) ? null : v;
  return (spec && spec.thinking && spec.thinking[r]) || null;
}

/** OpenAI reasoning.effort for a role (env, else the spec default). */
function reasoningFor(role, e, spec) {
  const r = OPENAI_REASONING_ENV[role] ? role : "draft";
  const v = clean(e[OPENAI_REASONING_ENV[r]]).toLowerCase();
  if (v) return OFF.has(v) ? "none" : v;
  return (spec && spec.reasoning && spec.reasoning[r]) || null;
}

/**
 * The effort a model accepts: Gemini-style levels ("minimal", "off") map onto OpenAI's, "none"
 * becomes "low" on models without it, and non-reasoning models get no parameter.
 */
export function openaiEffort(model, level) {
  if (level == null || NO_REASONING.test(String(model))) return null;
  let v = String(level).toLowerCase();
  if (v === "minimal" || OFF.has(v)) v = "none";
  if (/^\d+$/.test(v)) v = "low";
  if (!REASONING_LEVELS.has(v)) v = "low";
  if (v === "none" && MINIMAL_EFFORT.test(String(model))) v = "minimal";
  else if (v === "none" && NO_NONE_EFFORT.test(String(model))) v = "low";
  return v;
}

/** One effort step below `level` that `model` accepts (the same level when it is already the floor). */
export function lowerEffort(model, level) {
  const cur = openaiEffort(model, level);
  if (!cur) return null;
  const i = EFFORT_ORDER.indexOf(cur);
  for (let j = i - 1; j >= 0; j--) {
    const v = openaiEffort(model, EFFORT_ORDER[j]);
    if (EFFORT_ORDER.indexOf(v) < i) return v;
  }
  return cur;
}

/** Resolved configuration (no secrets). `forProvider` describes a provider pinned for compare mode. */
export function providerInfo(forProvider) {
  const e = env();
  const provider = forProvider && PROVIDERS[forProvider] ? forProvider : detectProvider(e);
  const embedProvider = detectEmbedProvider(e);
  const spec = provider ? PROVIDERS[provider] : null;
  const out = {
    provider,
    label: spec ? spec.label : null,
    configured: Boolean(provider && keyFor(provider, e)),
    draftModel: modelFor("draft", e, spec, provider),
    verifyModel: modelFor("verify", e, spec, provider),
    escalateModel: modelFor("escalate", e, spec, provider),
    classifyModel: modelFor("classify", e, spec, provider),
    thinking: spec && spec.thinking ? { draft: thinkingFor("draft", e, spec), verify: thinkingFor("verify", e, spec), classify: thinkingFor("classify", e, spec) } : null,
    ...(spec && spec.reasoning ? { reasoning: { draft: reasoningFor("draft", e, spec), verify: reasoningFor("verify", e, spec), classify: reasoningFor("classify", e, spec) } } : {}),
    embedProvider,
    embedConfigured: Boolean(embedProvider),
    embedModel: resolveEmbedModel(e, embedProvider),
    embedDimensions: embedDim(e),
  };
  if (provider === "vertex") {
    const a = vertexAuth(e);
    out.vertex = a
      ? { auth: a.mode, project: a.project, location: a.location, host: vertexHost(a.location), serviceAccount: a.sa ? a.sa.clientEmail : null, credentialSource: a.sa ? a.sa.source : "VERTEX_API_KEY" }
      : { auth: null, project: clean(e.VERTEX_PROJECT) || clean(e.FIREBASE_PROJECT_ID) || null, location: clean(e.VERTEX_LOCATION) || "global" };
  }
  return out;
}

export function isConfigured() {
  return providerInfo().configured;
}

/** Whether a specific provider (e.g. "openai" in compare mode) has credentials. */
export function isConfiguredFor(provider) {
  return Boolean(PROVIDERS[provider] && keyFor(provider, env()));
}

export function isEmbedConfigured() {
  return providerInfo().embedConfigured;
}

function embedDim(e) {
  const n = Number(e.AI_EMBED_DIM || 768);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 768;
}

function resolveEmbedModel(e, embedProvider) {
  const explicit = String(e.AI_EMBED_MODEL || "").trim();
  if (explicit) return explicit;
  return embedProvider ? PROVIDERS[embedProvider].embed : null;
}

/** Embedding model id that embed() will use right now (stored on chunks as `embeddingModel`). */
export function getEmbedModel() {
  return providerInfo().embedModel;
}

/** Embedding model at module load time; prefer getEmbedModel() if env can change at runtime. */
export const embedModel = getEmbedModel();

// ---------------------------------------------------------------- usage / cost tracking

const totals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: {} };
let usageListener = null;

/** Register fn(usageRecord) called after every successful request (e.g. to persist cost). */
export function setUsageListener(fn) {
  usageListener = typeof fn === "function" ? fn : null;
}

export function getUsage() {
  return JSON.parse(JSON.stringify(totals));
}

export function resetUsage() {
  Object.assign(totals, { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: {} });
}

function priceTier(model, at) {
  const key = Object.keys(PRICES)
    .filter(k => model === k || String(model).startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  return PRICES[key].find(t => !t.until || day <= t.until) || PRICES[key][PRICES[key].length - 1];
}

/**
 * @param {string} model
 * @param {number} inputTokens   all prompt tokens (cached ones included)
 * @param {number} outputTokens  response + thinking tokens
 * @param {{cachedTokens?: number, regional?: boolean, at?: number|string|Date}} [o]
 */
export function estimateCostUsd(model, inputTokens, outputTokens, { cachedTokens = 0, regional = false, at = Date.now() } = {}) {
  const p = priceTier(model, at);
  if (!p) return null;
  const cached = Math.min(cachedTokens || 0, inputTokens);
  const cachedRate = p.cached != null ? p.cached : p.in;
  const usd = ((inputTokens - cached) * p.in + cached * cachedRate + outputTokens * p.out) / 1e6;
  return round6(regional ? usd * 1.1 : usd);
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function recordUsage(kind, provider, model, inputTokens, outputTokens, extra = {}) {
  const { cachedTokens = 0, regional = false, ...rest } = extra;
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens, { cachedTokens, regional });
  const usage = { kind, provider, model, inputTokens, outputTokens, costUsd, ...(cachedTokens ? { cachedTokens } : {}), ...rest };
  totals.calls += 1;
  totals.inputTokens += inputTokens;
  totals.outputTokens += outputTokens;
  if (costUsd != null) totals.costUsd = round6(totals.costUsd + costUsd);
  const m = (totals.byModel[model] ||= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
  m.calls += 1;
  m.inputTokens += inputTokens;
  m.outputTokens += outputTokens;
  if (costUsd != null) m.costUsd = round6(m.costUsd + costUsd);
  if (usageListener) {
    try { usageListener(usage); } catch { /* listener errors never break a call */ }
  }
  return usage;
}

// ---------------------------------------------------------------- HTTP with retry / timeout

export class ProviderError extends Error {
  constructor(message, { status = 0, provider = "", model = "", retryable = false, modelUnavailable = false, code = "", detail = "", thinkingRejected = false, schemaRejected = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.provider = provider;
    this.model = model;
    this.retryable = retryable;
    this.modelUnavailable = modelUnavailable;
    this.code = code;
    this.detail = detail;
    this.thinkingRejected = thinkingRejected;
    this.schemaRejected = schemaRejected;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function backoffMs(attempt, retryAfterHeader) {
  const ra = Number(retryAfterHeader);
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 60_000);
  const base = 1000 * 2 ** attempt;
  return Math.min(base + Math.floor(Math.random() * 400), 30_000);
}

function redact(text) {
  return String(text || "")
    .replace(/(key=|api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-.]+/gi, "$1***")
    .replace(/\bAQ\.[A-Za-z0-9_-]{8,}/g, "AQ.***")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "AIza***")
    .replace(/\bya29\.[A-Za-z0-9_.-]+/g, "ya29.***")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .slice(0, 400);
}

/** OpenAI failures that need a person (key, quota, billing, model access), as one actionable line. */
export function friendlyOpenAIError(httpStatus, text) {
  let err = {};
  try { err = (JSON.parse(text) || {}).error || {}; } catch { err = {}; }
  const code = `${err.code || ""} ${err.type || ""}`;
  const msg = String(err.message || text || "");
  if (httpStatus === 401 || /invalid_api_key|incorrect api key/i.test(code + msg)) {
    return { code: "unauthenticated", message: "The OpenAI API key was rejected. Check OPENAI_API_KEY on the server." };
  }
  if (/insufficient_quota|credit_balance|billing_hard_limit|exceeded your current quota|no credits remaining/i.test(code + msg)) {
    return { code: "credits_depleted", message: "The OpenAI account is out of credit or hit its billing limit (platform.openai.com → Billing)." };
  }
  if (httpStatus === 404 || /model_not_found|does not exist|do not have access to (?:the )?model/i.test(code + msg)) {
    return { code: "model_not_found", message: `OpenAI model not available to this key: ${redact(msg).slice(0, 160)}` };
  }
  if (httpStatus === 429) return { code: "quota", message: `OpenAI rate limit: ${redact(msg).slice(0, 160)}` };
  return null;
}

function googleError(text) {
  try {
    const j = JSON.parse(text);
    const err = Array.isArray(j) ? j[0]?.error : j.error;
    if (!err) return null;
    const details = Array.isArray(err.details) ? err.details : [];
    const reasons = details.map(d => d && d.reason).filter(Boolean);
    const consumer = details.map(d => d && d.metadata && (d.metadata.consumer || d.metadata.containerInfo)).find(Boolean) || "";
    return { status: err.status || "", message: String(err.message || ""), reasons, consumer: String(consumer).replace(/^projects\//, "") };
  } catch {
    return null;
  }
}

/** Turn Google (Gemini API / Vertex) failures into one-line instructions a staff member can act on. */
export function friendlyGoogleError(httpStatus, text, { provider = "vertex", model = "", project = "", location = "", serviceAccount = "" } = {}) {
  const g = googleError(text) || { status: "", message: String(text || ""), reasons: [], consumer: "" };
  const msg = g.message;
  const proj = g.consumer || project || (msg.match(/project[s]?[ /]+([a-z0-9-]+)/i) || [])[1] || "your project";
  const has = re => g.reasons.some(r => re.test(r)) || re.test(msg) || re.test(g.status);
  if (httpStatus === 402 || /prepayment credits are depleted/i.test(msg)) {
    return { code: "credits_depleted", message: "Gemini API prepaid credits are used up. Top up in AI Studio (ai.studio/projects → Billing), or switch to Vertex AI (AI_PROVIDER=vertex) to bill Google Cloud credits." };
  }
  if (has(/API_KEY_SERVICE_BLOCKED|requests to this api .* are blocked/i)) {
    return { code: "key_blocked", message: `This API key is not allowed to call ${provider === "vertex" ? "Vertex AI" : "this API"}. In Cloud console → APIs & Services → Credentials, edit the key's API restrictions to include the Vertex AI API (aiplatform.googleapis.com).` };
  }
  if (has(/SERVICE_DISABLED|has not been used in project|is disabled/i) && !has(/billing/i)) {
    return { code: "api_disabled", message: `Enable the Vertex AI API in project ${proj}: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=${proj}` };
  }
  if (has(/BILLING_DISABLED|billing/i)) {
    return { code: "billing_disabled", message: `Billing is not enabled for project ${proj}. Link a billing account (with your credits) in Cloud console → Billing, then retry.` };
  }
  if (httpStatus === 404 || has(/NOT_FOUND|was not found|does not have access to it|not supported in|is not available in/i)) {
    return { code: "model_not_found", message: `Model ${model || "(unknown)"} is not available${location ? ` in ${location}` : ""}. Try VERTEX_LOCATION=global (newest models launch there first) or set AI_DRAFT_MODEL / AI_VERIFY_MODEL to a model listed for that region.` };
  }
  if (httpStatus === 403 || has(/PERMISSION_DENIED|IAM_PERMISSION_DENIED/i)) {
    return { code: "permission_denied", message: serviceAccount
      ? `Grant roles/aiplatform.user to ${serviceAccount} in project ${proj} (Cloud console → IAM → Grant access).`
      : `Permission denied in project ${proj}: ${msg.slice(0, 160)}` };
  }
  if (httpStatus === 429 || has(/RESOURCE_EXHAUSTED|quota/i)) {
    return { code: "quota", message: `Quota exceeded for ${model || provider}${location ? ` in ${location}` : ""}. Wait a minute, or request a higher quota in Cloud console → IAM & Admin → Quotas.` };
  }
  if (httpStatus === 401 || has(/UNAUTHENTICATED|API key not valid/i)) {
    return { code: "unauthenticated", message: "The credentials were rejected (API key invalid or service-account token expired)." };
  }
  return null;
}

/** `deadlineAt` (epoch ms, optional) bounds every attempt and backoff: no request outlives the caller's time budget. */
async function postJson(url, headers, body, { provider, model, timeoutMs, retries, ctx = {}, deadlineAt = 0 }) {
  let lastErr;
  const left = () => (deadlineAt ? deadlineAt - Date.now() : Infinity);
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (left() < 1000) {
      throw lastErr || new ProviderError(`${provider} timeout: no time left in this run's budget`, { provider, model, retryable: true, code: "timeout" });
    }
    const ms = Math.min(timeoutMs, left());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(typeof headers === "function" ? await headers() : headers) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderError) throw err;
      const timedOut = err?.name === "AbortError";
      lastErr = new ProviderError(`${provider} ${timedOut ? `timeout after ${ms}ms` : `network: ${err?.message || err}`}`,
        { provider, model, retryable: true, code: timedOut ? "timeout" : "network" });
      const wait = backoffMs(attempt);
      if (attempt < retries && left() > wait + 1000) { await sleep(wait); continue; }
      throw lastErr;
    }
    clearTimeout(timer);
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    const google = provider === "gemini" || provider === "vertex";
    const friendly = google ? friendlyGoogleError(res.status, text, { provider, model, ...ctx }) : (provider === "openai" ? friendlyOpenAIError(res.status, text) : null);
    const thinkingRejected = res.status === 400 && (/thinking/i.test(text) || (provider === "openai" && /reasoning/i.test(text)));
    const schemaRejected = res.status === 400 && provider === "openai" && !thinkingRejected && /text\.format|json_schema|response_format|schema/i.test(text);
    // Quota 429s stay retryable; a 403 quota/billing/permission message is not.
    const retryable = RETRYABLE_STATUS.has(res.status) && !(friendly && ["credits_depleted", "billing_disabled", "api_disabled"].includes(friendly.code));

    // Account-level failures stop the fallback chain; every model would fail the same way.
    const accountLevel = friendly && ["credits_depleted", "key_blocked", "api_disabled", "billing_disabled", "unauthenticated"].includes(friendly.code);
    const modelUnavailable = !accountLevel && (
      (friendly && friendly.code === "model_not_found")
      || res.status === 404
      || (res.status === 400 && !thinkingRejected && !schemaRejected && /model|not (?:found|supported|available)/i.test(text))
      || (res.status === 403 && /model|tier|not available|permission/i.test(text)));
    const message = friendly ? `${provider} ${res.status}: ${friendly.message}` : `${provider} ${res.status}: ${redact(text)}`;
    lastErr = new ProviderError(message, { status: res.status, provider, model, retryable, modelUnavailable, code: friendly ? friendly.code : "", detail: redact(text), thinkingRejected, schemaRejected });
    const wait = retryable && attempt < retries ? backoffMs(attempt, res.headers.get("retry-after")) : 0;
    if (retryable && attempt < retries && left() > wait + 1000) { await sleep(wait); continue; }
    throw lastErr;
  }
  throw lastErr;
}

// ---------------------------------------------------------------- JSON helpers

/** Parse the first JSON object/array out of model text (tolerates code fences and trailing commas). */
export function parseJsonLoose(text) {
  let raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  const starts = [raw.indexOf("{"), raw.indexOf("[")].filter(i => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const close = raw[start] === "{" ? "}" : "]";
  const end = raw.lastIndexOf(close);
  if (end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { /* try lenient */ }
  try { return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
}

const JSON_RULE = "Respond with a single valid JSON object only — no prose, no code fences.";

// ---------------------------------------------------------------- chat adapters

function normMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.content != null)
    .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
}

async function chatAnthropic({ key, model, system, messages, maxTokens, timeoutMs, retries, temperature, deadlineAt }) {
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  if (temperature != null) body.temperature = temperature;
  const data = await postJson("https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2023-06-01" }, body,
    { provider: "anthropic", model, timeoutMs, retries, deadlineAt });
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  const u = data.usage || {};
  return { text, model: data.model || model, inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0), outputTokens: u.output_tokens || 0, stop: data.stop_reason };
}

/**
 * Responses API body. `max_output_tokens` covers reasoning + visible tokens, so reasoning gets
 * headroom on top of the visible budget. `jsonSchema` → Structured Outputs (strict); plain `json`
 * → JSON mode. `store: false`: drafts (redacted student text) are not kept by OpenAI for 30 days.
 */
export const OPENAI_JSON_INPUT_RULE = "Respond only with a valid JSON object.";

/**
 * JSON mode (`json_object`) is rejected with HTTP 400 unless the input messages themselves contain
 * the word "json" — `instructions` do not count. Appends the rule to the last user message if needed.
 */
export function withJsonWord(input) {
  if (input.some(m => /json/i.test(String(m.content)))) return input;
  let last = -1;
  input.forEach((m, i) => { if (m.role === "user") last = i; });
  if (last < 0) return [...input, { role: "user", content: OPENAI_JSON_INPUT_RULE }];
  return input.map((m, i) => (i === last ? { ...m, content: `${m.content}\n\n${OPENAI_JSON_INPUT_RULE}` } : m));
}

export function openaiBody({ model, system, messages, maxTokens, json, jsonSchema, temperature, reasoning, headroom = 2048 }) {
  const effort = openaiEffort(model, reasoning);
  const input = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const jsonObject = Boolean(json && !(jsonSchema && jsonSchema.schema));
  const body = {
    model,
    input: jsonObject ? withJsonWord(input) : input,
    max_output_tokens: maxTokens + (effort && effort !== "none" ? headroom : 0),
    store: false,
  };
  if (system) body.instructions = system;
  if (effort) body.reasoning = { effort };
  // GPT-5 / GPT-6 / o-series accept only the default temperature; sampling is also rejected while thinking.
  if (temperature != null && !FIXED_SAMPLING.test(String(model)) && (!effort || effort === "none")) body.temperature = temperature;
  if (json && jsonSchema && jsonSchema.schema) {
    body.text = { format: { type: "json_schema", name: String(jsonSchema.name || "result").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64), schema: jsonSchema.schema, strict: true } };
  } else if (json) {
    body.text = { format: { type: "json_object" } };
  }
  return body;
}

function partText(c) {
  if (!c || typeof c !== "object") return "";
  if (typeof c.text === "string") return c.text;
  if (c.text && typeof c.text.value === "string") return c.text.value;
  return "";
}

/**
 * Text + usage out of a Responses API result. `output_tokens` already includes reasoning tokens.
 * Reads `output_text` (string or array) and else every text part of every `message` item (reasoning
 * items carry no visible text). `incomplete` is the reason when `status: "incomplete"` (e.g.
 * "max_output_tokens": reasoning used the budget and the visible output is cut off or empty).
 */
export function parseOpenAIResponse(data, model) {
  const top = Array.isArray(data?.output_text) ? data.output_text.filter(t => typeof t === "string").join("")
    : (typeof data?.output_text === "string" ? data.output_text : "");
  const items = Array.isArray(data?.output) ? data.output : [];
  const parts = items
    .filter(o => o && (o.type === "message" || (!o.type && o.content != null)) && o.role !== "user")
    .flatMap(o => (Array.isArray(o.content) ? o.content : typeof o.content === "string" ? [{ type: "output_text", text: o.content }] : []));
  const fromParts = parts.filter(c => c && (c.type === "output_text" || c.type === "text")).map(partText).join("");
  const refusal = parts.filter(c => c && c.type === "refusal").map(c => (typeof c.refusal === "string" ? c.refusal : partText(c))).join(" ").trim();
  const text = (top.trim() ? top : fromParts).trim();
  const u = data?.usage || {};
  const incomplete = data?.status === "incomplete" ? String((data.incomplete_details && data.incomplete_details.reason) || "incomplete") : "";
  return {
    text,
    model: data?.model || model,
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cachedTokens: (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0,
    thoughtTokens: (u.output_tokens_details && u.output_tokens_details.reasoning_tokens) || 0,
    incomplete,
    refusal,
    stop: incomplete ? `incomplete:${incomplete}` : (refusal && !text ? "refusal" : data?.status),
  };
}

/** The budget ran out (on reasoning) before a usable answer: cut off at the cap, or nothing visible at all. */
export function openaiShortfall(out) {
  if (!out) return "";
  if (out.incomplete === "max_output_tokens") return "max_output_tokens";
  if (!out.text && !out.refusal) return out.incomplete || "empty_output";
  return "";
}

const MAX_RETRY_TOKENS = 32_000;

/** Two usage records of one logical call (a cut-off attempt is billed too). */
function mergeUsage(a, b) {
  const cost = a.costUsd == null || b.costUsd == null ? null : round6(a.costUsd + b.costUsd);
  return {
    ...b,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: cost,
    ...(a.cachedTokens || b.cachedTokens ? { cachedTokens: (a.cachedTokens || 0) + (b.cachedTokens || 0) } : {}),
    ...(a.thoughtTokens || b.thoughtTokens ? { thoughtTokens: (a.thoughtTokens || 0) + (b.thoughtTokens || 0) } : {}),
    ms: (a.ms || 0) + (b.ms || 0),
    attempts: (a.attempts || 1) + 1,
  };
}

function shortfallError(out, { provider, model, short, usage, retried }) {
  const why = short === "max_output_tokens"
    ? `output cut off at max_output_tokens=${out.cap || "?"} (${out.thoughtTokens || 0} of ${out.outputTokens || 0} output tokens were reasoning, effort ${out.effort || "default"})`
    : short === "empty_output" ? `no visible output (${out.thoughtTokens || 0} reasoning tokens, effort ${out.effort || "default"})`
      : `response incomplete: ${short}`;
  const err = new ProviderError(
    `${provider} ${model}: ${why}${retried ? " — also after a retry with lower reasoning effort and a doubled cap" : ""}. Raise maxTokens / OPENAI_REASONING_HEADROOM or lower OPENAI_*_REASONING.`,
    { provider, model, code: "incomplete_output", detail: short },
  );
  err.usage = usage;
  return err;
}

async function chatOpenAI({ key, model, system, messages, maxTokens, timeoutMs, retries, json, jsonSchema, temperature, reasoning, reasoningHeadroom, deadlineAt }) {
  const body = openaiBody({ model, system, messages, maxTokens, json, jsonSchema, temperature, reasoning, headroom: reasoningHeadroom });
  const data = await postJson("https://api.openai.com/v1/responses",
    { Authorization: `Bearer ${key}` }, body,
    { provider: "openai", model, timeoutMs, retries, deadlineAt });
  return { ...parseOpenAIResponse(data, model), cap: body.max_output_tokens, effort: body.reasoning ? body.reasoning.effort : "" };
}

/** generateContent body shared by the Gemini API and Vertex AI. maxOutputTokens includes thoughts. */
export function geminiBody({ system, messages, maxTokens, json, temperature, thinking, headroom = 1536, schema }) {
  const thinks = thinking && !OFF.has(String(thinking));
  const body = {
    contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: maxTokens + (thinks && thinking !== "minimal" ? headroom : 0) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = "application/json";
  if (json && schema) body.generationConfig.responseSchema = schema;
  if (temperature != null) body.generationConfig.temperature = temperature;
  if (thinks) {
    body.generationConfig.thinkingConfig = /^\d+$/.test(String(thinking))
      ? { thinkingBudget: Number(thinking) }
      : { thinkingLevel: String(thinking) };
  }
  return body;
}

/** Text + token usage out of a generateContent response (thought parts skipped). */
export function parseGeminiResponse(data, model) {
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("").trim();
  const u = data?.usageMetadata || {};
  return {
    text,
    model: data?.modelVersion || model,
    inputTokens: u.promptTokenCount || 0,
    outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    cachedTokens: u.cachedContentTokenCount || 0,
    thoughtTokens: u.thoughtsTokenCount || 0,
    stop: cand?.finishReason,
  };
}

async function chatGemini({ key, model, system, messages, maxTokens, timeoutMs, retries, json, temperature, thinking, headroom, schema, deadlineAt }) {
  const body = geminiBody({ system, messages, maxTokens, json, temperature, thinking, headroom, schema });
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key }, body,
    { provider: "gemini", model, timeoutMs, retries, deadlineAt });
  return parseGeminiResponse(data, model);
}

function vertexCtx(auth) {
  return { project: auth.project || "", location: auth.location, serviceAccount: auth.sa ? auth.sa.clientEmail : "" };
}

async function chatVertex({ auth, model, system, messages, maxTokens, timeoutMs, retries, json, temperature, thinking, headroom, schema, deadlineAt }) {
  const body = geminiBody({ system, messages, maxTokens, json, temperature, thinking, headroom, schema });
  const data = await postJson(vertexModelUrl(auth, model, "generateContent"),
    () => vertexHeaders(auth, timeoutMs), body,
    { provider: "vertex", model, timeoutMs, retries, ctx: vertexCtx(auth), deadlineAt });
  return { ...parseGeminiResponse(data, model), regional: auth.location !== "global" };
}

const CHAT = { anthropic: chatAnthropic, openai: chatOpenAI, gemini: chatGemini, vertex: chatVertex };

/**
 * One chat completion.
 * @param {object} o
 * @param {string} [o.system]
 * @param {{role:"user"|"assistant", content:string}[]} o.messages
 * @param {string} [o.model]       explicit model id (no fallback chain when given)
 * @param {"draft"|"verify"|"escalate"|"classify"} [o.role="draft"]  picks the role's model when model is omitted
 * @param {boolean} [o.json=false] ask for JSON and parse it into `json`
 * @param {string|null} [o.thinking]  Gemini thinking level; default from the role (AI_*_THINKING)
 * @param {object} [o.schema]     Gemini/Vertex responseSchema (with json:true)
 * @param {{name:string, schema:object}} [o.jsonSchema]  OpenAI Structured Outputs schema (strict; with json:true)
 * @param {string} [o.provider]   pin a provider (compare mode: "openai") instead of the detected one
 * @param {boolean} [o.allowFallback=false]  keep the role's fallback chain even when `model` is given
 * @param {number} [o.reasoningHeadroom]  OpenAI: extra max_output_tokens for reasoning (default OPENAI_REASONING_HEADROOM / 2048)
 * @param {number} [o.deadlineAt]  epoch ms: no request or retry runs past it (worker time budget)
 * @param {boolean} [o.retryIncomplete=true]  OpenAI: when reasoning used up the budget (incomplete / empty
 *   output), retry once with one effort step lower and a doubled cap; still short → ProviderError
 *   code "incomplete_output" (with `usage` of the billed attempts)
 * @returns {Promise<{text:string, json?:any, usage:object, model:string, provider:string}>}
 */
export async function chat({
  system = "", messages = [], model, role = "draft", json = false,
  maxTokens = DEFAULT_MAX_TOKENS, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, temperature, thinking, schema,
  jsonSchema, provider: pinned, allowFallback = false, reasoningHeadroom: headroomArg, deadlineAt = 0, retryIncomplete = true,
} = {}) {
  const e = env();
  const provider = pinned && PROVIDERS[pinned] ? pinned : detectProvider(e);
  const key = provider ? keyFor(provider, e) : "";
  if (!provider || !key) throw new ProviderError("AI provider not configured (set GEMINI_API_KEY, AI_PROVIDER=vertex with a service account, ANTHROPIC_API_KEY or OPENAI_API_KEY)", { provider: provider || "", code: "unconfigured" });
  const spec = PROVIDERS[provider];
  const r = ROLE_ENV[role] ? role : "draft";
  const primary = model || modelFor(r, e, spec, provider);
  if (!primary) throw new ProviderError(`no model configured for role ${r}`, { provider, code: "unconfigured" });
  const fb = Array.isArray(spec.fallbacks) ? spec.fallbacks : (spec.fallbacks[r] || []);
  const chain = model && !allowFallback ? [primary] : [...new Set([primary, ...fb])];
  const msgs = normMessages(messages);
  if (!msgs.length) throw new ProviderError("chat() needs at least one message", { provider });
  const sys = json ? [system, JSON_RULE].filter(Boolean).join("\n\n") : system;
  const openai = provider === "openai";
  // Gemini thinking levels come from AI_*_THINKING; OpenAI reasoning from OPENAI_*_REASONING (an explicit `thinking` maps onto it).
  const think = openai
    ? (thinking !== undefined ? (thinking == null ? "none" : thinking) : reasoningFor(r, e, spec))
    : (thinking !== undefined ? thinking : thinkingFor(r, e, spec));
  const headroom = Number(e.AI_THINKING_HEADROOM) > 0 ? Number(e.AI_THINKING_HEADROOM) : 1536;
  const reasoningHeadroom = Number(headroomArg) > 0 ? Number(headroomArg)
    : Number(e.OPENAI_REASONING_HEADROOM) > 0 ? Number(e.OPENAI_REASONING_HEADROOM) : 2048;
  const auth = provider === "vertex" ? vertexAuth(e) : null;

  let lastErr;
  for (const m of chain) {
    let level = think;
    let strict = jsonSchema;
    let budget = maxTokens;
    let room = reasoningHeadroom;
    let billed = null;
    let shortRetried = false;
    for (let pass = 0; pass < 4; pass++) {
      const started = Date.now();
      try {
        const out0 = await CHAT[provider]({
          key, auth, model: m, system: sys, messages: msgs, maxTokens: budget, timeoutMs, retries, json, temperature,
          thinking: level, headroom, schema, jsonSchema: strict, reasoning: level, reasoningHeadroom: room, deadlineAt,
        });
        const usage0 = recordUsage("chat", provider, out0.model, out0.inputTokens, out0.outputTokens, {
          ms: Date.now() - started, stop: out0.stop || null, cachedTokens: out0.cachedTokens || 0, regional: Boolean(out0.regional),
          ...(out0.thoughtTokens ? { thoughtTokens: out0.thoughtTokens } : {}),
        });
        billed = billed ? mergeUsage(billed, usage0) : usage0;
        const short = openai ? openaiShortfall(out0) : "";
        if (short) {
          const enoughTime = !deadlineAt || deadlineAt - Date.now() > 5000;
          if (retryIncomplete && !shortRetried && enoughTime && (short === "max_output_tokens" || short === "empty_output")) {
            shortRetried = true;
            level = lowerEffort(m, level) ?? level;
            budget = Math.min(MAX_RETRY_TOKENS, Math.max(budget * 2, budget + 2000));
            room = Math.min(MAX_RETRY_TOKENS, room * 2);
            continue;
          }
          throw shortfallError(out0, { provider, model: m, short, usage: billed, retried: shortRetried });
        }
        const usage = billed;
        const out = { text: out0.text, usage, model: out0.model, provider };
        if (json) out.json = parseJsonLoose(out0.text);
        return out;
      } catch (err) {
        lastErr = err;
        // A model that rejects this thinking / reasoning level gets a retry without it; a rejected schema falls back to JSON mode.
        if (err instanceof ProviderError && err.thinkingRejected && level && level !== "none") { level = openai ? "none" : null; continue; }
        if (err instanceof ProviderError && err.thinkingRejected && openai && level === "none") { level = null; continue; }
        if (err instanceof ProviderError && err.schemaRejected && strict) { strict = undefined; continue; }
        if (!(err instanceof ProviderError) || !err.modelUnavailable) throw err;
        break;
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- embeddings

async function embedGemini(key, model, texts, { dim, taskType, timeoutMs, retries }) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,
      { "x-goog-api-key": key },
      {
        requests: batch.map(t => ({
          model: `models/${model}`,
          content: { parts: [{ text: t }] },
          taskType: taskType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          outputDimensionality: dim,
        })),
      },
      { provider: "gemini", model, timeoutMs, retries });
    for (const emb of data.embeddings || []) out.push(normalizeVec(emb.values || []));
  }
  // Gemini batch embed does not report tokens; estimate ~4 chars per token for cost tracking.
  const inputTokens = Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4);
  return { vectors: out, inputTokens };
}

/** Vertex :predict. gemini-embedding-* accept one instance per request, so those go 1-by-1 (4 in flight). */
async function embedVertex(auth, model, texts, { dim, taskType, timeoutMs, retries }) {
  const perRequest = /^gemini-embedding/.test(model) ? 1 : 100;
  const batches = [];
  for (let i = 0; i < texts.length; i += perRequest) batches.push(texts.slice(i, i + perRequest));
  const results = new Array(batches.length);
  let inputTokens = 0;
  let estimated = false;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = next++;
      const data = await postJson(vertexModelUrl(auth, model, "predict"),
        () => vertexHeaders(auth, timeoutMs),
        {
          instances: batches[b].map(t => ({ content: t, task_type: taskType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" })),
          parameters: { outputDimensionality: dim, autoTruncate: true },
        },
        { provider: "vertex", model, timeoutMs, retries, ctx: vertexCtx(auth) });
      const preds = data.predictions || [];
      results[b] = preds.map(p => normalizeVec((p.embeddings && p.embeddings.values) || []));
      for (const p of preds) {
        const n = p.embeddings && p.embeddings.statistics && p.embeddings.statistics.token_count;
        if (Number.isFinite(n)) inputTokens += n;
        else estimated = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
  if (estimated && !inputTokens) inputTokens = Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4);
  return { vectors: results.flat(), inputTokens, regional: auth.location !== "global" };
}

async function embedOpenAI(key, model, texts, { dim, timeoutMs, retries }) {
  const out = [];
  let inputTokens = 0;
  for (let i = 0; i < texts.length; i += 256) {
    const batch = texts.slice(i, i + 256);
    const data = await postJson("https://api.openai.com/v1/embeddings",
      { Authorization: `Bearer ${key}` }, { model, input: batch, dimensions: dim },
      { provider: "openai", model, timeoutMs, retries });
    for (const d of (data.data || []).sort((a, b) => a.index - b.index)) out.push(d.embedding);
    inputTokens += data.usage?.prompt_tokens || 0;
  }
  return { vectors: out, inputTokens };
}

/** Gemini vectors below 3072 dims are not unit length; normalise so cosine == dot product. */
function normalizeVec(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map(x => x / n);
}

/** Query embeddings repeat (same question re-drafted, golden checks); keep a small in-memory cache. */
const QUERY_CACHE_MAX = 500;
const queryEmbedCache = new Map();

/**
 * Embed texts. Returns number[][] in input order; the array also carries `.model`, `.dimensions`, `.usage`.
 * @param {string[]} texts
 * @param {{taskType?: "document"|"query", timeoutMs?: number, retries?: number}} [opts]
 */
export async function embed(texts, { taskType = "document", timeoutMs = 60_000, retries = DEFAULT_RETRIES } = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map(t => String(t || "").slice(0, 8000));
  const e = env();
  const provider = detectEmbedProvider(e);
  if (!provider) throw new ProviderError("Embeddings not configured (need GEMINI_API_KEY, AI_PROVIDER=vertex or OPENAI_API_KEY)", { code: "unconfigured" });
  const key = keyFor(provider, e);
  const model = resolveEmbedModel(e, provider);
  const dim = embedDim(e);
  if (!list.length) return Object.assign([], { model, dimensions: dim, usage: null });
  const cacheKey = taskType === "query" && list.length === 1 ? `${provider}|${model}|${dim}|${list[0]}` : "";
  if (cacheKey && queryEmbedCache.has(cacheKey)) {
    return Object.assign([queryEmbedCache.get(cacheKey)], { model, dimensions: dim, usage: { kind: "embed", provider, model, inputTokens: 0, outputTokens: 0, costUsd: 0, cached: true } });
  }
  const started = Date.now();
  let r;
  if (provider === "vertex") r = await embedVertex(vertexAuth(e), model, list, { dim, taskType, timeoutMs, retries });
  else if (provider === "gemini") r = await embedGemini(key, model, list, { dim, taskType, timeoutMs, retries });
  else r = await embedOpenAI(key, model, list, { dim, timeoutMs, retries });
  const { vectors, inputTokens } = r;
  if (vectors.length !== list.length) throw new ProviderError(`${provider} returned ${vectors.length} embeddings for ${list.length} texts`, { provider, model });
  const usage = recordUsage("embed", provider, model, inputTokens, 0, { ms: Date.now() - started, count: list.length, regional: Boolean(r.regional) });
  if (cacheKey) {
    if (queryEmbedCache.size >= QUERY_CACHE_MAX) queryEmbedCache.delete(queryEmbedCache.keys().next().value);
    queryEmbedCache.set(cacheKey, vectors[0]);
  }
  return Object.assign(vectors, { model, dimensions: dim, usage });
}

// ---------------------------------------------------------------- connection test

/**
 * Staff "Test connection": one tiny chat on the draft model and one embedding. Never throws;
 * returns friendly errors (enable API / grant role / billing / region) instead.
 */
export async function testConnection({ provider: pinned } = {}) {
  const info = providerInfo(pinned);
  const out = { ok: false, provider: info.provider, label: info.label, configured: info.configured, vertex: info.vertex || null, chat: null, embed: null };
  if (!info.configured) {
    out.error = pinned ? `${info.label || pinned} is not configured on the server.` : "No AI provider is configured on the server.";
    return out;
  }
  const t0 = Date.now();
  try {
    const r = await chat({ messages: [{ role: "user", content: 'Reply with JSON {"ok":true}' }], model: info.draftModel, json: true, maxTokens: 32, thinking: "low", timeoutMs: 12_000, retries: 0, ...(pinned ? { provider: pinned } : {}) });
    out.chat = { ok: true, model: r.model, latencyMs: Date.now() - t0, costUsd: r.usage.costUsd };
  } catch (err) {
    out.chat = { ok: false, model: info.draftModel, latencyMs: Date.now() - t0, error: String(err && err.message || err).slice(0, 300), code: err && err.code || "" };
  }
  // Retrieval (and so embeddings) always runs on the primary provider, also in compare mode.
  if (info.embedConfigured && !pinned) {
    const t1 = Date.now();
    try {
      const v = await embed(["AIAPGET eligibility after BAMS"], { taskType: "document", timeoutMs: 12_000, retries: 0 });
      out.embed = { ok: true, model: v.model, dimensions: v[0] ? v[0].length : 0, latencyMs: Date.now() - t1 };
    } catch (err) {
      out.embed = { ok: false, model: info.embedModel, latencyMs: Date.now() - t1, error: String(err && err.message || err).slice(0, 300), code: err && err.code || "" };
    }
  }
  out.ok = Boolean(out.chat && out.chat.ok && (!out.embed || out.embed.ok));
  if (!out.ok) out.error = (out.chat && !out.chat.ok && out.chat.error) || (out.embed && out.embed.error) || "Test failed.";
  return out;
}
