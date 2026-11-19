/**
 * Token / cost accounting for the daily spend cap. Providers report usage in different shapes;
 * `normalizeUsage` accepts `{inputTokens, outputTokens, costUSD}`, OpenAI-style
 * `{prompt_tokens, completion_tokens}` and Anthropic-style `{input_tokens, output_tokens}`.
 * When the provider gives no cost, it is estimated from AI_PRICE_INPUT_PER_MTOK /
 * AI_PRICE_OUTPUT_PER_MTOK (USD per million tokens). Defaults are the dearest model in the routing
 * (Gemini 4 Argon from 1 Dec 2026: $4 in / $20 out, ai.google.dev/gemini-api/docs/pricing, checked
 * 28 Oct 2026) so an unpriced model can only over-count against the daily cap. Per-model prices
 * live in provider.js.
 */

import { loadServerEnv } from "../env.js";

const DEFAULT_IN_PER_MTOK = 4;
const DEFAULT_OUT_PER_MTOK = 20;

function prices() {
  const env = loadServerEnv();
  const pin = Number(env.AI_PRICE_INPUT_PER_MTOK);
  const pout = Number(env.AI_PRICE_OUTPUT_PER_MTOK);
  return {
    input: Number.isFinite(pin) && pin >= 0 ? pin : DEFAULT_IN_PER_MTOK,
    output: Number.isFinite(pout) && pout >= 0 ? pout : DEFAULT_OUT_PER_MTOK,
  };
}

const round6 = x => Math.round(x * 1e6) / 1e6;

/** Provider family for spend reporting: Vertex bills Gemini models, so both count as "gemini". */
export function providerFamily(provider, model = "") {
  const p = String(provider || "").toLowerCase();
  if (p === "vertex" || p === "gemini") return "gemini";
  if (p === "openai" || p === "anthropic") return p;
  const m = String(model || "").toLowerCase();
  if (/^(gemini|text-embedding-0)/.test(m)) return "gemini";
  if (/^(gpt-|o\d|text-embedding-3|chatgpt)/.test(m)) return "openai";
  if (/^claude/.test(m)) return "anthropic";
  return p || "other";
}

export function normalizeUsage(u, model = "") {
  const src = u && typeof u === "object" ? u : {};
  const inputTokens = Number(src.inputTokens ?? src.input_tokens ?? src.prompt_tokens ?? src.promptTokens ?? 0) || 0;
  const outputTokens = Number(src.outputTokens ?? src.output_tokens ?? src.completion_tokens ?? src.completionTokens ?? 0) || 0;
  let costUSD = Number(src.costUSD ?? src.costUsd ?? src.cost_usd ?? src.cost ?? NaN);
  if (src.costUsd === null && src.costUSD == null) costUSD = NaN;
  if (!Number.isFinite(costUSD)) {
    const p = prices();
    costUSD = (inputTokens * p.input + outputTokens * p.output) / 1e6;
  }
  const out = {
    inputTokens,
    outputTokens,
    costUSD: round6(costUSD),
    calls: u ? 1 : 0,
    models: model ? [String(model)] : [],
  };
  if (u) {
    const fam = providerFamily(src.provider, model || src.model);
    if (fam !== "other") out.byProvider = { [fam]: { inputTokens, outputTokens, costUSD: out.costUSD, calls: 1 } };
  }
  return out;
}

/** Merge `{ [provider]: {inputTokens, outputTokens, costUSD, calls} }` maps. */
export function sumByProvider(a, b) {
  const out = {};
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src || {})) {
      const row = (out[k] ||= { inputTokens: 0, outputTokens: 0, costUSD: 0, calls: 0 });
      row.inputTokens += Number(v && v.inputTokens) || 0;
      row.outputTokens += Number(v && v.outputTokens) || 0;
      row.costUSD = round6(row.costUSD + (Number(v && v.costUSD) || 0));
      row.calls += Number(v && v.calls) || 0;
    }
  }
  return out;
}

export function sumUsage(a, b) {
  const x = a || normalizeUsage(null);
  const y = b || normalizeUsage(null);
  const out = {
    inputTokens: (x.inputTokens || 0) + (y.inputTokens || 0),
    outputTokens: (x.outputTokens || 0) + (y.outputTokens || 0),
    costUSD: round6((x.costUSD || 0) + (y.costUSD || 0)),
    calls: (x.calls || 0) + (y.calls || 0),
    models: [...new Set([...(x.models || []), ...(y.models || [])])],
  };
  if (x.byProvider || y.byProvider) out.byProvider = sumByProvider(x.byProvider, y.byProvider);
  return out;
}
