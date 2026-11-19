/**
 * Hybrid draft: keep paid GPT quality model until credits/quota fail, then flip draft
 * to the cheap/free fallback model for the process lifetime (or until reset).
 * Verify stays on paid Gemini. See docs/ai/DISHA-V2.md § Hybrid cost fallback.
 */

import { gptCreditFallbackEnabled, gptCreditFallbackModel, isGptCreditsExhaustedError } from "./scopePolicy.js";

let active = false;
let reason = "";
let at = 0;

export function gptDraftOnFallback() {
  return active && gptCreditFallbackEnabled();
}

export function gptCreditFallbackState() {
  return {
    active: gptDraftOnFallback(),
    reason: reason || "",
    at: at || 0,
    model: gptCreditFallbackModel(),
  };
}

/** Call when a GPT draft call fails with quota/billing/429 RESOURCE_EXHAUSTED. */
export function noteGptCreditFailure(err) {
  if (!gptCreditFallbackEnabled()) return false;
  if (!isGptCreditsExhaustedError(err)) return false;
  active = true;
  reason = String((err && (err.code || err.message)) || "quota").slice(0, 200);
  at = Date.now();
  return true;
}

export function resetGptCreditFallbackForTests() {
  active = false;
  reason = "";
  at = 0;
}

/** Resolve which GPT draft model id to use for this Hybrid call. */
export function resolveGptDraftModel(preferred) {
  if (gptDraftOnFallback()) return gptCreditFallbackModel();
  return String(preferred || "").trim();
}
