/**
 * Late binding to the provider adapter (`./provider.js`) and persona registry
 * (`./personas/index.js`), both owned by the knowledge-base build. Either may be missing in a
 * given deploy: the pipeline then reports "provider not configured" and never calls out.
 * Tests inject a mock with `setRuntimeForTests`.
 */

import { FALLBACK_STREAMS } from "./classify.js";
import { normalizeUsage } from "./usage.js";
import { loadServerEnv } from "../env.js";

const NULL_PROVIDER = Object.freeze({
  isConfigured: () => false,
  async chat() { throw new Error("AI provider is not configured"); },
  async embed() { throw new Error("AI provider is not configured"); },
});

let override = null;
let providerPromise = null;
let personasPromise = null;

export function setRuntimeForTests(rt) {
  override = rt || null;
  if (rt && rt.resetProvider) providerPromise = null;
}

/** `AI_PROVIDER=mock` (local QA / E2E only): ignored on Vercel and with NODE_ENV=production. */
export function mockProviderRequested(env = process.env) {
  if (String(env.AI_PROVIDER || "").trim().toLowerCase() !== "mock") return false;
  return !env.VERCEL && !env.VERCEL_ENV && String(env.NODE_ENV || "").toLowerCase() !== "production";
}

export async function getProvider() {
  if (override && override.provider) return override.provider;
  if (!providerPromise) {
    providerPromise = (mockProviderRequested() ? import("./mockProvider.js") : import("./provider.js"))
      .then(m => {
        const p = m && (m.default && typeof m.default.chat === "function" ? m.default : m);
        return p && typeof p.chat === "function" ? p : NULL_PROVIDER;
      })
      .catch(() => NULL_PROVIDER);
  }
  return providerPromise;
}

export function providerReady(p) {
  try { return Boolean(p && typeof p.isConfigured === "function" && p.isConfigured()); }
  catch { return false; }
}

/**
 * The base provider pinned to one provider id (compare mode's "openai" side): every chat names
 * the provider, keeps the role's fallback chain, and readiness checks that provider's own key.
 */
export function pinProvider(base, id) {
  return {
    id,
    pinned: true,
    isConfigured() {
      if (!base) return false;
      if (typeof base.isConfiguredFor === "function") return base.isConfiguredFor(id);
      return providerReady(base);
    },
    chat: args => base.chat({ ...args, provider: id, allowFallback: true }),
    embed: (...a) => base.embed(...a),
    providerInfo: () => (typeof base.providerInfo === "function" ? base.providerInfo(id) : null),
    testConnection: () => (typeof base.testConnection === "function" ? base.testConnection({ provider: id }) : null),
  };
}

/** A GPT draft that fails is redrafted by Gemini only when at least this much of the run is left. */
export const HYBRID_MIN_FALLBACK_MS = 8000;
export const HYBRID_DEFAULT_DRAFT_MODEL = "gpt-5.4";

function raceUntil(promise, until) {
  let timer;
  const late = new Promise((_, reject) => {
    const ms = Math.max(0, until - Date.now());
    timer = setTimeout(() => reject(Object.assign(new Error(`GPT draft did not finish within ${Math.round(ms / 100) / 10} s`), { code: "timeout" })), ms + 100);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function hasJson(res) {
  if (!res) return false;
  if (res.json && typeof res.json === "object") return true;
  try { return Boolean(JSON.parse(String(res.text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))); } catch { return false; }
}

/**
 * Hybrid drafter: the "draft" role goes to GPT (`gpt`, pinned OpenAI), every other role (classify,
 * verify, escalate, embeddings) to Gemini (`gemini`, the base provider). GPT gets at most
 * `gptTimeoutMs` (OPENAI_DRAFT_TIMEOUT_MS) of the caller's time; if it fails, times out or returns
 * no JSON — or OpenAI is not configured — the same call is redrafted by Gemini and the result
 * carries `draftFallback` (+ the failed attempt's billed spend in `extraUsage`). A "deferred"
 * error or too little time left for a Gemini draft is re-thrown (the worker retries the job).
 */
export function hybridProvider(gemini, gpt, { draftModel = HYBRID_DEFAULT_DRAFT_MODEL, fallbackDraftModel = "", gptTimeoutMs = 20000, minFallbackMs = HYBRID_MIN_FALLBACK_MS } = {}) {
  const gptOk = () => providerReady(gpt);
  const geminiOk = () => providerReady(gemini);
  return {
    id: "hybrid",
    hybrid: true,
    isConfigured: () => geminiOk() || gptOk(),
    gptConfigured: gptOk,
    async chat(args = {}) {
      if (args.role !== "draft") {
        if (geminiOk() || !gptOk()) return gemini.chat(args);
        return gpt.chat({ ...args, model: undefined });
      }
      const fallback = async (reason, extraUsage) => {
        const res = await gemini.chat({ ...args, model: fallbackDraftModel || undefined });
        return { ...res, draftFallback: { from: "openai", to: "gemini", reason: String(reason || "").slice(0, 200) }, ...(extraUsage ? { extraUsage } : {}) };
      };
      if (!gptOk()) {
        if (!geminiOk()) return gpt.chat(args);
        return fallback("GPT (OpenAI) is not configured on the server");
      }
      const now = Date.now();
      // Leave the Gemini fallback its minimum when the run's deadline allows it.
      const reserve = args.deadlineAt && args.deadlineAt - now - minFallbackMs >= 1000 ? minFallbackMs : 0;
      const until = Math.min(args.deadlineAt ? args.deadlineAt - reserve : Infinity, now + gptTimeoutMs);
      try {
        // Hard stop: a hung connection that ignores `deadlineAt` cannot eat the fallback's time.
        const res = await raceUntil(gpt.chat({ ...args, model: args.model || draftModel || undefined, timeoutMs: Math.min(args.timeoutMs || gptTimeoutMs, gptTimeoutMs), deadlineAt: until }), until);
        if (args.json && !hasJson(res)) throw Object.assign(new Error("GPT returned no JSON"), { code: "bad_json", usage: res && res.usage, model: res && res.model });
        return res;
      } catch (err) {
        if (err && err.code === "deferred") throw err;
        const left = args.deadlineAt ? args.deadlineAt - Date.now() : Infinity;
        if (!geminiOk() || left < minFallbackMs) throw err;
        const billed = err && err.usage ? normalizeUsage({ provider: "openai", ...err.usage }, (err.usage && err.usage.model) || err.model || args.model || draftModel) : null;
        return fallback(`GPT draft failed (${String((err && (err.code || err.message)) || "error").slice(0, 120)})`, billed);
      }
    },
    embed: (...a) => gemini.embed(...a),
    providerInfo: () => {
      let g = null;
      try { g = typeof gemini.providerInfo === "function" ? gemini.providerInfo() : null; } catch { g = null; }
      return { ...(g || {}), provider: "hybrid", label: "Hybrid (GPT draft + Gemini check)", configured: geminiOk() || gptOk(), draftModel, gptConfigured: gptOk(), fallbackDraftModel: fallbackDraftModel || (g && g.draftModel) || "" };
    },
    testConnection: () => (typeof gpt.testConnection === "function" ? gpt.testConnection() : null),
  };
}

/**
 * Providers by side id: `gemini` = the base provider, `openai` = pinned OpenAI (legacy compare
 * records), `hybrid` = GPT draft + Gemini check. `opts.hybrid` passes models / time limits.
 * Tests inject sides with `setRuntimeForTests({ providers: { openai } })`.
 */
export async function getCompareProviders(primary, ids = ["hybrid", "gemini"], opts = {}) {
  const base = primary || await getProvider();
  const injected = id => (override && override.providers && override.providers[id]) || null;
  const out = {};
  for (const id of ids) {
    if (injected(id)) out[id] = injected(id);
    else if (id === "gemini") out[id] = base;
    else if (id === "hybrid") out[id] = hybridProvider(base, injected("openai") || pinProvider(base, "openai"), opts.hybrid || {});
    else out[id] = pinProvider(await getProvider(), id);
  }
  return out;
}

function normalizeStreams(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") list = Object.entries(raw).map(([id, v]) => (v && typeof v === "object" ? { id, ...v } : { id, label: String(v) }));
  return list
    .map(s => (typeof s === "string" ? { id: s, label: s } : s))
    .filter(s => s && s.id)
    .map(s => ({ id: String(s.id), label: String(s.label || s.name || s.id), themes: Array.isArray(s.themes) ? s.themes : [] }));
}

export async function getPersonas() {
  if (override && override.personas) {
    return { streams: normalizeStreams(override.personas.STREAMS || override.personas.streams), personaFor: override.personas.personaFor, source: "test" };
  }
  if (override && override.fallbackPersonas) {
    return { streams: FALLBACK_STREAMS, personaFor: null, source: "fallback" };
  }
  if (!personasPromise) {
    personasPromise = import("./personas/index.js")
      .then(m => {
        const streams = normalizeStreams(m.STREAMS || (m.default && m.default.STREAMS));
        const pick = m.personaFor || (m.default && m.default.personaFor);
        const load = m.loadPersona || (m.default && m.default.loadPersona);
        if (!streams.length || typeof pick !== "function") throw new Error("persona registry incomplete");
        const labels = new Map(streams.map(s => [s.id, s.label]));
        // The registry returns a stream id; the persona body lives in `<id>.md`.
        const personaFor = (theme, subtheme, question = "") => {
          const got = pick(theme, subtheme, question);
          if (got && typeof got === "object") return got;
          const id = String(got || "");
          if (!id) return null;
          let p = null;
          try { p = typeof load === "function" ? load(id) : null; } catch { p = null; }
          const meta = (p && p.meta) || {};
          return { id: (p && p.id) || id, stream: (p && p.id) || id, label: meta.label || labels.get(id) || id, system: (p && p.prompt) || "", meta };
        };
        return { streams, personaFor, source: "personas" };
      })
      .catch(() => ({ streams: FALLBACK_STREAMS, personaFor: null, source: "fallback" }));
  }
  return personasPromise;
}

/** Persona body / system prompt, whatever the registry calls it. */
export function personaPrompt(persona) {
  if (!persona) return "";
  return String(persona.system || persona.systemPrompt || persona.body || persona.prompt || "").trim();
}

/**
 * Identity + expertise only (everything before the first `## ` heading). GPT-routed drafts use this
 * so the persona's own `## Rules` / `## Output` (Ask Desk JSON / `{"insufficient": true}`) cannot
 * conflict with RULES / MENTOR_ASSIST_RULES. Gemini keeps the full persona for prompt caching.
 */
export function personaBrief(personaOrText) {
  const s = typeof personaOrText === "string" ? String(personaOrText || "").trim() : personaPrompt(personaOrText);
  if (!s) return "";
  const i = s.search(/^##\s/m);
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

/** True when the draft role goes to GPT (hybrid primary or a pinned openai compare side). */
export function usesGptDraftSystem(provider) {
  return Boolean(provider && (provider.hybrid || provider.id === "openai"));
}

export function envValue(name, fallback = "") {
  const env = loadServerEnv();
  return String(env[name] || fallback || "").trim();
}
