/**
 * DISHA V2 scope policy + feature flags (docs/ai/DISHA-V2.md).
 * Welcome-by-default: rules catch spam / abuse / unsafe / medical only;
 * OFF_TOPIC keyword declines and scripted rephrase are off unless explicitly re-enabled.
 */

import { envValue } from "./runtime.js";

const OFF = new Set(["off", "0", "false", "no", "none"]);
const ON = new Set(["on", "1", "true", "yes"]);

function envFlag(name, defaultOn) {
  const raw = String(envValue(name) || "").trim().toLowerCase();
  if (!raw) return defaultOn;
  if (OFF.has(raw)) return false;
  if (ON.has(raw)) return true;
  return defaultOn;
}

function envNum(name, fallback) {
  const n = Number(envValue(name));
  return Number.isFinite(n) ? n : fallback;
}

/** "v2" = welcome-by-default (Phase 1). Set AI_SCOPE_POLICY_VERSION=v1 to restore legacy keyword OFF_TOPIC. */
export function scopePolicyVersion() {
  const v = String(envValue("AI_SCOPE_POLICY_VERSION") || "v2").trim().toLowerCase();
  return v === "v1" || v === "legacy" ? "v1" : "v2";
}

export function isWelcomeByDefault() {
  return scopePolicyVersion() === "v2";
}

/** When false (default), OFF_TOPIC / UNFOCUSED do not get scripted decline / rephrase replies. */
export function allowScriptedOfftopic() {
  return envFlag("AI_ALLOW_SCRIPTED_OFFTOPIC", false);
}

/** Kill switch mirror — also `ai.enabled` in Settings. Env wins when set to off. */
export function killSwitchOff() {
  return OFF.has(String(envValue("AI_KILL_SWITCH") || "").trim().toLowerCase());
}

/** free | paid — informational for ops; does not change product copy. */
export function planMode() {
  const p = String(envValue("PLAN_MODE") || envValue("AYM_PLAN_MODE") || "free").trim().toLowerCase();
  return p === "paid" || p === "blaze" ? "paid" : "free";
}

/**
 * Compare-mode sample rate 0–1. When > 0 and Settings compareMode is off, that fraction of
 * jobs still run a second-side draft for eval. Default 0.
 */
export function compareSampleRate() {
  const n = envNum("AI_COMPARE_SAMPLE_RATE", 0);
  return Math.max(0, Math.min(1, n));
}

export function shouldSampleCompare(seed = Date.now()) {
  const rate = compareSampleRate();
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const x = typeof seed === "number" ? seed : String(seed).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (Math.abs(x) % 1000) / 1000 < rate;
}

/**
 * Categories that produce a scripted desk reply (no grounded draft).
 * V2 default: only RESTRICTED + DUPLICATE (+ empty chit-chat OFF_TOPIC).
 */
export function isScriptedTriageCategory(category, subtype = "") {
  const cat = String(category || "").toUpperCase();
  const sub = String(subtype || "").toLowerCase();
  if (cat === "RESTRICTED" || cat === "DUPLICATE") return true;
  if (allowScriptedOfftopic()) {
    return cat === "OFF_TOPIC" || cat === "UNFOCUSED";
  }
  // Empty greetings + pure homework dumps still get a short scripted nudge; everything else is drafted.
  return cat === "OFF_TOPIC" && (sub === "chit-chat" || sub === "chitchat" || sub === "homework");
}

/**
 * Cheap / free GPT draft model used only after paid GPT credits are exhausted
 * (429 RESOURCE_EXHAUSTED / billing). Until then Hybrid keeps the quality draft model.
 */
export function gptCreditFallbackModel() {
  return String(envValue("AI_GPT_CREDIT_FALLBACK_MODEL") || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
}

export function gptCreditFallbackEnabled() {
  return envFlag("AI_GPT_CREDIT_FALLBACK", true);
}

/** True when an error means OpenAI paid credits / quota / billing are gone. */
export function isGptCreditsExhaustedError(err) {
  if (!err) return false;
  const code = String(err.code || err.reason || "");
  const status = Number(err.status || 0);
  const msg = String(err.message || "");
  const blob = `${code} ${msg}`.toLowerCase();
  if (status === 429) return /resource_exhausted|insufficient_quota|quota|billing|credits?/.test(blob);
  return /resource_exhausted|insufficient_quota|credits? (are )?(deplet|exhaust)|billing_disabled|billing/.test(blob);
}

export function scopePolicySnapshot() {
  return {
    version: scopePolicyVersion(),
    welcomeByDefault: isWelcomeByDefault(),
    allowScriptedOfftopic: allowScriptedOfftopic(),
    compareSampleRate: compareSampleRate(),
    planMode: planMode(),
    gptCreditFallback: gptCreditFallbackEnabled(),
    gptCreditFallbackModel: gptCreditFallbackModel(),
    killSwitchEnv: killSwitchOff(),
  };
}
