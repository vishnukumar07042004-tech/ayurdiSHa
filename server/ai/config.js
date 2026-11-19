/**
 * AI answer pipeline feature flags. Stored in Firestore (`ai_config/settings`, or the KV key
 * `aym:ai:config` on file / Blob stores) and edited by staff from the AI drafts desk.
 * Production ships with `enabled: false` — nothing is queued, drafted or shown until staff turn it on.
 * Env `AI_KILL_SWITCH=off` forces disabled regardless of Settings (see scopePolicy.js).
 */

import { killSwitchOff } from "./scopePolicy.js";

export const AI_CONFIG_DEFAULTS = Object.freeze({
  enabled: false,
  /** Per-stream switch: `{ [streamId]: true }`. A stream missing here is off. */
  streams: {},
  /** Drafts are generated but hidden from the review queue unless "show shadow drafts" is on. */
  shadowMode: true,
  dailySpendCapUSD: 5,
  /** Optional LLM second opinion on questions the medical rules flag as "maybe". */
  medicalLlmCheck: false,
  /**
   * Who writes the draft students' answers start from. "hybrid" = GPT drafts, Gemini checks
   * (verify / escalate), rules + the cheapest Gemini model classify; a GPT failure falls back to a
   * Gemini draft. "gemini" = Gemini for every step (rollback). docs/ai/AI-ANSWER-PIPELINE.md.
   * When GPT paid credits are exhausted, Hybrid flips draft to AI_GPT_CREDIT_FALLBACK_MODEL
   * (default gpt-4.1-mini) while Gemini verify stays paid — see server/ai/scopePolicy.js.
   */
  primary: "hybrid",
  /**
   * Evaluation only: every DISHA job also drafts the same question with the other set-up in
   * `providers` (same triage, same retrieved passages) → `aiDrafts.<id>`; `aiDraft` is the primary's.
   * Prefer AI_COMPARE_SAMPLE_RATE env for sampled eval; leave this false in production.
   */
  compareMode: false,
  /** DISHA V2 scope: "v2" welcome-by-default; "v1" legacy keyword OFF_TOPIC. */
  scopePolicyVersion: "v2",
  /** When false, OFF_TOPIC / UNFOCUSED are not answered with scripted decline / rephrase. */
  allowScriptedOfftopic: false,
  providers: ["hybrid", "gemini"],
  /** Per-provider model overrides from Settings; blank = OPENAI_*_MODEL env, else the code default. */
  models: { openai: { draft: "", verify: "" } },
  updatedAt: 0,
  updatedBy: "",
});

export const COMPARE_PROVIDERS = ["hybrid", "gemini"];
export const PRIMARY_IDS = ["hybrid", "gemini"];
/** `openai` labels compare drafts stored before the hybrid switch. */
export const PROVIDER_LABELS = { hybrid: "Hybrid (GPT draft + Gemini check)", gemini: "Gemini only", openai: "GPT" };
export const SHORT_LABELS = { hybrid: "Hybrid", gemini: "Gemini", openai: "GPT" };
const MAX_CAP_USD = 500;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/;

function cleanModels(raw) {
  const out = { openai: { draft: "", verify: "" } };
  const src = raw && typeof raw === "object" ? raw : {};
  for (const p of Object.keys(out)) {
    const m = src[p] && typeof src[p] === "object" ? src[p] : {};
    for (const role of Object.keys(out[p])) {
      const v = String(m[role] || "").trim();
      out[p][role] = MODEL_ID.test(v) ? v : "";
    }
  }
  return out;
}

/** Compare sides are always Hybrid vs Gemini only (a stored ["gemini", "openai"] migrates). */
function cleanProviders() {
  return [...COMPARE_PROVIDERS];
}

export function cleanPrimary(raw) {
  const p = String(raw || "").trim().toLowerCase();
  return PRIMARY_IDS.includes(p) ? p : AI_CONFIG_DEFAULTS.primary;
}

export function normalizeConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const streams = {};
  if (src.streams && typeof src.streams === "object") {
    for (const [k, v] of Object.entries(src.streams)) {
      const id = String(k || "").trim().slice(0, 60);
      if (id) streams[id] = v === true;
    }
  }
  let cap = Number(src.dailySpendCapUSD);
  if (!Number.isFinite(cap) || cap < 0) cap = AI_CONFIG_DEFAULTS.dailySpendCapUSD;
  cap = Math.min(MAX_CAP_USD, Math.round(cap * 100) / 100);
  const scopeRaw = String(src.scopePolicyVersion || AI_CONFIG_DEFAULTS.scopePolicyVersion).trim().toLowerCase();
  const out = {
    enabled: src.enabled === true && !killSwitchOff(),
    streams,
    shadowMode: src.shadowMode !== false,
    dailySpendCapUSD: cap,
    medicalLlmCheck: src.medicalLlmCheck === true,
    primary: cleanPrimary(src.primary),
    compareMode: src.compareMode === true,
    scopePolicyVersion: scopeRaw === "v1" || scopeRaw === "legacy" ? "v1" : "v2",
    allowScriptedOfftopic: src.allowScriptedOfftopic === true,
    providers: cleanProviders(src.providers),
    models: cleanModels(src.models),
    updatedAt: Number(src.updatedAt) || 0,
    updatedBy: String(src.updatedBy || "").slice(0, 80),
  };
  if (src.alert && typeof src.alert === "object") {
    out.alert = {
      type: String(src.alert.type || "").slice(0, 40),
      message: String(src.alert.message || "").slice(0, 300),
      day: String(src.alert.day || "").slice(0, 12),
      at: Number(src.alert.at) || 0,
    };
  }
  return out;
}

/** Apply a staff patch; only known keys are accepted. */
export function patchConfig(current, patch, who = "staff") {
  const base = normalizeConfig(current);
  const p = patch && typeof patch === "object" ? patch : {};
  const next = { ...base, streams: { ...base.streams } };
  if ("enabled" in p) next.enabled = p.enabled === true;
  if ("shadowMode" in p) next.shadowMode = p.shadowMode !== false;
  if ("medicalLlmCheck" in p) next.medicalLlmCheck = p.medicalLlmCheck === true;
  if ("compareMode" in p) next.compareMode = p.compareMode === true;
  if ("allowScriptedOfftopic" in p) next.allowScriptedOfftopic = p.allowScriptedOfftopic === true;
  if ("scopePolicyVersion" in p) {
    const v = String(p.scopePolicyVersion || "").trim().toLowerCase();
    next.scopePolicyVersion = v === "v1" || v === "legacy" ? "v1" : "v2";
  }
  if ("primary" in p) next.primary = cleanPrimary(p.primary);
  if (p.models && typeof p.models === "object") {
    next.models = cleanModels({ ...base.models, ...Object.fromEntries(Object.entries(p.models).map(([k, v]) => [k, { ...(base.models[k] || {}), ...(v || {}) }])) });
  }
  if ("dailySpendCapUSD" in p) next.dailySpendCapUSD = p.dailySpendCapUSD;
  if (p.streams && typeof p.streams === "object") {
    for (const [k, v] of Object.entries(p.streams)) next.streams[k] = v === true;
  }
  if (p.clearAlert) delete next.alert;
  next.updatedAt = Date.now();
  next.updatedBy = String(who || "staff").slice(0, 80);
  return normalizeConfig(next);
}

export function streamEnabled(config, streamId) {
  const c = normalizeConfig(config);
  if (!c.enabled || !streamId) return false;
  return c.streams[streamId] === true;
}

/** India Standard Time calendar day — the spend cap resets at IST midnight. */
export function istDay(ts = Date.now()) {
  return new Date(ts + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
