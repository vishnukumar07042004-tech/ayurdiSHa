/**
 * Primary drafter + evaluation compare mode.
 *
 * Primary (`ai.primary`, default "hybrid"): GPT drafts (OPENAI_DRAFT_MODEL, default gpt-5.4),
 * Gemini verifies / escalates (AI_VERIFY_MODEL / AI_VERIFY_ESCALATE_MODEL), rules + the cheapest
 * Gemini model classify. A failed or late GPT draft is redrafted by Gemini (`draftFallback`), so a
 * student is never left without a draft. "gemini" = Gemini for every step (rollback).
 *
 * Compare mode (`ai.compareMode`, evaluation only): one DISHA job drafts the same question as
 * Hybrid and as Gemini only. Triage runs once and `prepareDraft` (medical screen, retrieval) runs
 * once, so both get identical passages; then `composeDraft` runs per side in parallel. `aiDraft` is
 * the primary's draft and `aiDrafts.<side>` holds both for the desk's side-by-side view. A failure
 * on the other side never fails the job. A Hybrid (primary) failure is stored on `aiDrafts.hybrid`
 * as the GPT letter's error — the Gemini letter is kept when it finished — so the desk never shows
 * a blank Hybrid card. Quota or billing with no Gemini letter still fails the job (the queue
 * pauses) after that error is attached. If either side's models flag the question as medical, the
 * whole job goes to a mentor. Nothing here publishes an answer.
 *
 * Time: each side gets `SIDE_TIMEOUT_MS` (never past the worker run's deadline), and no side starts
 * with less than `MIN_PROVIDER_MS` left (`deferred` → the job waits for the next run). The other
 * side running out of time next to the primary is not an error: it is returned in `deferred`, the
 * primary draft is saved, and the worker re-queues the job with `only: <side>` (a one-side sub-job).
 * Timing out again in that sub-job is recorded as an error variant ("Regenerate").
 */

import { prepareDraft, composeDraft, envModels, providerDeadline, withDeadline, DRAFT_TIMEOUT_MS, VERIFY_TIMEOUT_MS } from "./draft.js";
import { getCompareProviders, envValue, HYBRID_DEFAULT_DRAFT_MODEL } from "./runtime.js";
import { shouldSampleCompare } from "./scopePolicy.js";
import { normalizeUsage, sumUsage, providerFamily } from "./usage.js";
import { PROVIDER_LABELS, COMPARE_PROVIDERS, cleanPrimary } from "./config.js";
import { draftLetter } from "../../shared/draftLetter.js";

/** Default primary; `primaryOf(cfg)` is what a job actually uses. */
export const PRIMARY = "hybrid";

export function primaryOf(cfg = {}) {
  return cleanPrimary(cfg && cfg.primary);
}

/** Compare-side models when neither env nor Settings name one (prices in provider.js PRICES). */
export const COMPARE_DEFAULT_MODELS = Object.freeze({
  openai: Object.freeze({ draft: "gpt-5.5", verify: "gpt-5.4-mini" }),
  hybrid: Object.freeze({ draft: HYBRID_DEFAULT_DRAFT_MODEL }),
});

/** Per-call ceiling for a compare side, so a slow GPT call cannot hold the worker past its limit. */
export const MAX_SIDE_TIMEOUT_MS = 40_000;

function envMs(name, fallback) {
  const n = Number(envValue(name));
  return Number.isFinite(n) && n >= 1000 ? Math.min(Math.floor(n), MAX_SIDE_TIMEOUT_MS) : fallback;
}

/**
 * Models for one side. gemini: the AI_* env. hybrid: draft = OPENAI_DRAFT_MODEL → Settings →
 * gpt-5.4; verify / escalate = the Gemini AI_VERIFY_MODEL / AI_VERIFY_ESCALATE_MODEL (blank = role
 * default). openai (legacy compare side): env → Settings → compare default → provider default.
 */
export function compareModels(id, cfg = {}, provider = null) {
  if (id === "gemini") return envModels();
  const set = (cfg.models && cfg.models.openai) || {};
  if (id === "hybrid") {
    const gem = envModels();
    return { draft: envValue("OPENAI_DRAFT_MODEL") || set.draft || COMPARE_DEFAULT_MODELS.hybrid.draft, verify: gem.verify, escalate: gem.escalate };
  }
  let info = null;
  try { info = provider && typeof provider.providerInfo === "function" ? provider.providerInfo() : null; } catch { info = null; }
  const own = (cfg.models && cfg.models[id]) || {};
  const def = COMPARE_DEFAULT_MODELS[id] || {};
  const up = id.toUpperCase();
  const draft = envValue(`${up}_DRAFT_MODEL`) || own.draft || def.draft || (info && info.draftModel) || "";
  return {
    draft,
    verify: envValue(`${up}_VERIFY_MODEL`) || own.verify || def.verify || (info && info.verifyModel) || "",
    escalate: envValue(`${up}_ESCALATE_MODEL`) || (def.draft ? draft : "") || (info && info.escalateModel) || "",
  };
}

/** Per-call timeouts: Gemini (and the hybrid's Gemini check) use the defaults; OPENAI_*_TIMEOUT_MS for GPT. */
export function timeoutsFor(id) {
  if (id === "gemini" || id === "hybrid") return { draft: DRAFT_TIMEOUT_MS, verify: VERIFY_TIMEOUT_MS };
  const up = id.toUpperCase();
  return { draft: envMs(`${up}_DRAFT_TIMEOUT_MS`, DRAFT_TIMEOUT_MS), verify: envMs(`${up}_VERIFY_TIMEOUT_MS`, VERIFY_TIMEOUT_MS) };
}

/** Router options for the hybrid drafter (GPT model + its own draft timeout, Gemini fallback model). */
export function hybridOptions(cfg = {}) {
  return { draftModel: compareModels("hybrid", cfg).draft, fallbackDraftModel: envValue("AI_DRAFT_MODEL"), gptTimeoutMs: timeoutsFor("openai").draft };
}

/** The drafter for a normal (non-compare) job: `{ id, provider, models, timeouts }`. */
export async function primarySetup(cfg = {}, base) {
  const id = primaryOf(cfg);
  if (id === "gemini") return { id, provider: base, models: envModels(), timeouts: timeoutsFor("gemini") };
  const p = (await getCompareProviders(base, ["hybrid"], { hybrid: hybridOptions(cfg) })).hybrid;
  return { id, provider: p, models: compareModels("hybrid", cfg), timeouts: timeoutsFor("hybrid") };
}

/** Spend per provider family: model-derived when the provider reported it (hybrid splits GPT / Gemini), else the side id. */
function tagUsage(u, id) {
  const x = u || normalizeUsage(null);
  if (x.byProvider && Object.keys(x.byProvider).length) return x;
  return { ...x, byProvider: { [providerFamily(id === "hybrid" ? "openai" : id)]: { inputTokens: x.inputTokens || 0, outputTokens: x.outputTokens || 0, costUSD: x.costUSD || 0, calls: x.calls || 0 } } };
}

function usageSummary(u) {
  const x = u || {};
  return { inputTokens: x.inputTokens || 0, outputTokens: x.outputTokens || 0, costUSD: x.costUSD || 0, calls: x.calls || 0, models: x.models || [], ...(x.byProvider ? { byProvider: x.byProvider } : {}) };
}

/** The side-by-side record for one provider's draft. */
export function variantOf(id, aiDraft, { latencyMs = 0, usage, models = {}, escalated = false, now = Date.now() } = {}) {
  const a = aiDraft || {};
  return {
    provider: id,
    label: PROVIDER_LABELS[id] || id,
    status: a.status || "pending",
    ...(a.blockedReason ? { blockedReason: a.blockedReason, blockedNote: a.blockedNote || "" } : {}),
    answer: draftLetter(a) || a.answer || "",
    actions: a.actions || [],
    mistake: a.mistake || "",
    resources: a.resources || [],
    citations: a.citations || [],
    claimChecks: a.claimChecks || [],
    confidence: typeof a.confidence === "number" ? a.confidence : 0,
    risk: a.risk || "high",
    mode: a.mode || "grounded",
    ...(a.mentorAssist ? { mentorAssist: a.mentorAssist } : {}),
    ...(a.flags ? { flags: a.flags } : {}),
    ...(a.draftFallback ? { draftFallback: a.draftFallback } : {}),
    verifyFlags: a.verifyFlags || [],
    model: a.model || models.draft || "",
    verifyModel: a.verifyModel || "",
    ...(escalated ? { escalated: true } : {}),
    latencyMs,
    usage: usageSummary(usage || a.usage),
    createdAt: now,
  };
}

/** Today's Hybrid column; `openai` is the GPT compare side stored before the hybrid switch. */
export function canonicalSide(id) {
  return id === "openai" ? "hybrid" : id;
}

/** A side the desk can show: a letter, a blocked note, or an explicit error. An empty pending object is not one. */
export function sideVisible(v) {
  if (!v || typeof v !== "object") return false;
  if (v.status === "error" || v.status === "blocked") return true;
  if (draftLetter(v)) return true;
  if (Array.isArray(v.actions) && v.actions.some(a => String(a || "").trim())) return true;
  if (String(v.mistake || "").trim()) return true;
  return false;
}

/**
 * Compare sides as the desk shows them. A GPT letter stored as `aiDrafts.openai` (Gemini vs GPT,
 * before Hybrid) fills the Hybrid card when `aiDrafts.hybrid` has no letter, so staff still see
 * the GPT answer. The original `openai` key is kept. Does not rewrite stored records.
 */
export function normalizeDrafts(aiDrafts) {
  if (!aiDrafts || typeof aiDrafts !== "object") return {};
  const out = { ...aiDrafts };
  const gptLetter = draftLetter(out.openai);
  const hybridLetter = draftLetter(out.hybrid);
  if (!hybridLetter && (gptLetter || (!sideVisible(out.hybrid) && sideVisible(out.openai)))) {
    const src = out.openai;
    out.hybrid = { ...src, answer: gptLetter || src.answer || "", provider: "hybrid", label: PROVIDER_LABELS.hybrid, legacyGpt: true };
  } else if (out.hybrid && gptLetter && !hybridLetter) {
    out.hybrid = { ...out.hybrid, answer: gptLetter };
  } else if (out.hybrid && hybridLetter && !String(out.hybrid.answer || "").trim()) {
    out.hybrid = { ...out.hybrid, answer: hybridLetter };
  }
  return out;
}

/** Which side wrote a stored `aiDraft`: stamped `drafter`, else Gemini (every draft before the hybrid switch). */
export function sideOfDraft(aiDraft) {
  const d = aiDraft && aiDraft.drafter;
  return d === "hybrid" || d === "gemini" ? d : "gemini";
}

/**
 * The primary's side for a draft written before compare mode: same content, no latency, and its
 * cost includes triage — so `legacy` keeps it out of the latency / cost averages.
 */
export function legacyVariant(aiDraft) {
  return { ...variantOf(sideOfDraft(aiDraft), aiDraft, { usage: aiDraft && aiDraft.usage, now: (aiDraft && aiDraft.createdAt) || Date.now() }), legacy: true };
}

function errorVariant(id, err, { latencyMs = 0, models = {}, now = Date.now() } = {}) {
  return {
    provider: id,
    label: PROVIDER_LABELS[id] || id,
    status: "error",
    error: String(err && err.message || err || "failed").replace(/^\w+ \d{3}: /, "").slice(0, 300),
    code: String(err && err.code || ""),
    answer: "", actions: [], mistake: "", resources: [], citations: [], claimChecks: [],
    confidence: 0, risk: "high", mode: "grounded", verifyFlags: [],
    model: models.draft || "", verifyModel: "",
    latencyMs,
    usage: usageSummary(err && err.usage),
    createdAt: now,
  };
}

/** Why a prepared result has no model draft to compare (scripted, reused, medical, no sources). */
export function compareSkipReason(aiDraft) {
  const a = aiDraft || {};
  if (a.scripted) return "scripted reply";
  if (a.reusedFrom) return "reused an approved answer";
  if (a.status === "blocked") return a.blockedReason === "medical" ? "medical → mentor" : a.blockedReason === "insufficient_source" ? "no trusted source" : (a.blockedReason || "blocked");
  return "";
}

/**
 * Compare-mode settings for a job, or null when compare mode is off.
 * `only` ("hybrid" | "gemini", or "openai" on a legacy record) redrafts one side.
 */
export async function compareSetup({ cfg = {}, provider, compareProviders, compareOnly, sampleSeed } = {}) {
  // Production default: compareMode off. AI_COMPARE_SAMPLE_RATE can still sample a % of jobs for eval.
  const sampled = !cfg.compareMode && !compareOnly && shouldSampleCompare(sampleSeed ?? Date.now());
  const ids = compareOnly
    ? [compareOnly]
    : ((cfg.compareMode || sampled) ? (cfg.providers || [...COMPARE_PROVIDERS]) : null);
  if (!ids || !ids.length) return null;
  const providers = compareProviders || await getCompareProviders(provider, ids, { hybrid: hybridOptions(cfg) });
  const models = {};
  for (const id of ids) models[id] = compareModels(id, cfg, providers[id]);
  return { ids, only: compareOnly || "", primary: primaryOf(cfg), providers, models, sampled: Boolean(sampled) };
}

export const isMedical = a => Boolean(a && a.status === "blocked" && a.blockedReason === "medical");

/** `aiDraft` routed to a mentor because the `side` draft of the same question was flagged medical. */
export function blockAsMedical(aiDraft, side, note = "") {
  return {
    ...aiDraft, answer: "", actions: [], mistake: "", resources: [], citations: [], claimChecks: [], confidence: 0, risk: "high",
    status: "blocked", blockedReason: "medical",
    blockedNote: `Routed to a mentor: the ${PROVIDER_LABELS[side] || side} side flagged a medical question. ${note || ""}`.trim().slice(0, 300),
  };
}

/**
 * `prepareDraft` once, `composeDraft` per side (in parallel). Same result shape as `draftAnswer`
 * plus `aiDrafts`; `aiDraft` is the primary's draft (null when only the other side was redrafted).
 */
export async function draftCompared(args, setup) {
  const { now = Date.now() } = args;
  const PRIMARY_ID = setup.primary || PRIMARY;
  const prep = await prepareDraft({ ...args, provider: setup.providers.gemini || setup.providers[PRIMARY_ID] || args.provider });
  if (prep.done) {
    const skipped = compareSkipReason(prep.done.aiDraft) || "not drafted by a model";
    return { ...prep.done, aiDraft: setup.only && setup.only !== PRIMARY_ID ? null : prep.done.aiDraft, aiDrafts: null, compareSkipped: skipped };
  }
  const ctx = prep.ctx;
  const until = providerDeadline({ deadlineAt: args.deadlineAt, sideTimeoutMs: args.sideTimeoutMs, usage: ctx.usage });
  const withPrimary = setup.ids.includes(PRIMARY_ID);
  const runs = await Promise.allSettled(setup.ids.map(async id => {
    const t0 = Date.now();
    try {
      const out = await withDeadline(
        composeDraft(ctx, { provider: setup.providers[id], models: setup.models[id], usage: normalizeUsage(null), timeouts: timeoutsFor(id), deadlineAt: until }),
        until, PROVIDER_LABELS[id] || id);
      return { id, out, ms: Date.now() - t0 };
    } catch (err) {
      if (err && typeof err === "object") err.latencyMs = Date.now() - t0;
      throw err;
    }
  }));

  let usage = ctx.usage;
  const aiDrafts = {};
  const deferred = [];
  let primary = null;
  let primaryErr = null;
  runs.forEach((r, i) => {
    const id = setup.ids[i];
    if (r.status === "fulfilled") {
      const u = tagUsage(r.value.out.usage, id);
      usage = sumUsage(usage, u);
      const a = r.value.out.aiDraft;
      if (id === PRIMARY_ID) primary = r.value.out;
      aiDrafts[id] = variantOf(id, a, { latencyMs: r.value.ms, usage: u, models: setup.models[id], escalated: Boolean(r.value.out.meta && r.value.out.meta.verifyEscalated && r.value.out.meta.verifyEscalated.used), now });
      // A side without credentials is that side's problem in compare mode, not a reason to retry the job.
      if (id !== PRIMARY_ID && r.value.out.retryable) aiDrafts[id] = errorVariant(id, { message: a.blockedNote || "provider not configured", code: "unconfigured" }, { latencyMs: r.value.ms, models: setup.models[id], now });
      // An empty Hybrid slot used to render as a blank card beside a finished Gemini letter.
      else if ((id === "hybrid" || id === "openai") && !sideVisible(aiDrafts[id])) {
        aiDrafts[id] = errorVariant(id, { message: blankHybridMessage(), code: "missing" }, { latencyMs: r.value.ms, models: setup.models[id], now });
      }
    } else {
      const err = r.reason;
      const u = tagUsage(err && err.usage ? normalizeUsage(err.usage, err.usage.model || err.model || "") : null, id);
      usage = sumUsage(usage, u);
      const late = isTimeout(err);
      // The non-primary side (Gemini only) may continue next run. The primary side is always
      // recorded: a timeout used to throw here and drop both the Hybrid card and a finished Gemini letter.
      if (id !== PRIMARY_ID && late && withPrimary) deferred.push(id);
      else {
        aiDrafts[id] = errorVariant(id, { message: sideFailureMessage(id, err), code: late ? "timeout" : err && err.code, usage: u }, { latencyMs: (err && err.latencyMs) || 0, models: setup.models[id], now });
        if (id === PRIMARY_ID) primaryErr = err;
      }
    }
  });
  if (primaryErr && primaryErr.code === "deferred") {
    primaryErr.usage = usage;
    throw primaryErr;
  }
  if (primaryErr) {
    const otherOk = setup.ids.some(id => id !== PRIMARY_ID && aiDrafts[id] && aiDrafts[id].status !== "error");
    if (pausesQueue(primaryErr) && !otherOk) {
      primaryErr.usage = usage;
      primaryErr.aiDrafts = aiDrafts;
      throw primaryErr;
    }
  }
  const extra = deferred.length ? { deferred } : {};
  // Medical on any side sends the question to a mentor, whichever side would have been sent.
  const flagged = Object.values(aiDrafts).find(isMedical);
  if (primary) {
    let aiDraft = { ...primary.aiDraft, usage };
    if (flagged && !isMedical(aiDraft)) aiDraft = blockAsMedical(aiDraft, flagged.provider, flagged.blockedNote);
    return { ...primary, aiDraft, usage, aiDrafts, meta: { ...ctx.meta, ...primary.meta }, ...extra };
  }
  // A one-side redraft of the other provider leaves `aiDraft` null so the stored primary letter is kept.
  if (!setup.ids.includes(PRIMARY_ID)) {
    return { aiDraft: null, meta: ctx.meta, usage, aiDrafts, ...extra, ...(flagged ? { medicalFlag: flagged.provider, medicalNote: flagged.blockedNote || "" } : {}) };
  }
  const gem = aiDrafts.gemini;
  const reviewable = gem && gem.status !== "error" && (gem.answer || gem.status === "blocked");
  let aiDraft = reviewable
    ? { ...gem, drafter: "gemini" }
    : { status: "pending", answer: "", actions: [], mistake: "", resources: [], citations: [], claimChecks: [], confidence: 0, risk: "high", drafter: "gemini", verifyFlags: [] };
  if (flagged && !isMedical(aiDraft)) aiDraft = blockAsMedical(aiDraft, flagged.provider, flagged.blockedNote);
  return { aiDraft, meta: ctx.meta, usage, aiDrafts, ...extra, ...(flagged ? { medicalFlag: flagged.provider, medicalNote: flagged.blockedNote || "" } : {}) };
}

function isTimeout(err) {
  return Boolean(err && (err.sideTimeout || err.code === "timeout"));
}

function blankHybridMessage() {
  return "GPT returned no letter. This is usually an OpenAI quota limit, a timeout, or OPENAI_API_KEY missing on Vercel production. Regenerate Hybrid. Nothing is published until an official approves a draft.";
}

function sideFailureMessage(id, err) {
  if (isTimeout(err)) return `${PROVIDER_LABELS[id] || id} did not finish in time (${String(err && err.message || "timeout").slice(0, 120)}). Regenerate to try again. Nothing is published until an official approves a draft.`;
  const code = String(err && err.code || "");
  if ((id === "hybrid" || id === "openai") && (code === "unconfigured" || /not configured|OPENAI_API_KEY/i.test(String(err && err.message || "")))) {
    return "GPT is not configured on this deploy. Set OPENAI_API_KEY on Vercel production, then redeploy. Regenerate Hybrid after that. Nothing is published until an official approves a draft.";
  }
  if ((id === "hybrid" || id === "openai") && (code === "quota" || code === "credits_depleted" || code === "billing_disabled" || Number(err && err.status) === 429)) {
    return `GPT hit a quota or billing limit (${String(err && err.message || "quota").slice(0, 140)}). Regenerate Hybrid after recharge. Nothing is published until an official approves a draft.`;
  }
  return err && err.message;
}

/** Quota / billing / a missing key should pause the queue. A side timeout is recorded on that side instead. */
function pausesQueue(err) {
  if (!err || isTimeout(err)) return false;
  const code = String(err.code || "");
  if (["quota", "credits_depleted", "billing_disabled", "key_blocked", "api_disabled", "unauthenticated", "permission_denied", "unconfigured"].includes(code)) return true;
  return Number(err.status) === 429;
}

/**
 * A compare record that has a Gemini draft and no Hybrid/GPT draft gets an explicit Hybrid error.
 * `pending` (the GPT side is queued for the next run) leaves the slot empty so the desk can say
 * the draft continues. Does not publish.
 */
export function ensureHybridSide(aiDrafts, { now = Date.now(), pending = false } = {}) {
  const out = normalizeDrafts(aiDrafts);
  if (pending || sideVisible(out.hybrid)) return out;
  if (!out.gemini && !out.openai) return out;
  out.hybrid = errorVariant("hybrid", {
    message: "No GPT draft was saved for this question. This run stored only the Gemini draft — the GPT side timed out, hit a quota, or OPENAI_API_KEY is not set on Vercel production. Regenerate Hybrid. Nothing is published until an official approves it.",
    code: "missing",
  }, { now });
  return out;
}

/* ---------------------------------------------------------------- */
/* Backfill eligibility + stats                                      */
/* ---------------------------------------------------------------- */

/** A draft record whose question was drafted by a model (not scripted / reused / blocked before drafting). */
export function compareEligible(rec) {
  const a = rec && rec.aiDraft;
  if (!a) return false;
  if (rec.compareSkipped) return false;
  return !compareSkipReason(a) || (a.status === "blocked" && a.blockedReason === "provider_unconfigured");
}

/** Sides a draft record still lacks (an errored side counts as missing; `aiDraft` covers its own side). A stored GPT (`openai`) side counts as Hybrid. */
export function missingSides(rec, ids = [...COMPARE_PROVIDERS]) {
  const v = normalizeDrafts((rec && rec.aiDrafts) || {});
  const top = rec && rec.aiDraft ? sideOfDraft(rec.aiDraft) : "";
  return ids.filter(id => (v[id] ? v[id].status === "error" : id !== top));
}

const avg = (sum, n, digits = 3) => (n ? Math.round((sum / n) * 10 ** digits) / 10 ** digits : null);

/**
 * Per-provider comparison over drafts that have both sides: approvals by provider, edit size,
 * latency, cost per draft, claim support rate, confidence and risk.
 */
export function computeCompareStats(drafts = [], ids = [...COMPARE_PROVIDERS]) {
  const rows = Object.fromEntries(ids.map(id => [id, {
    provider: id, label: PROVIDER_LABELS[id] || id,
    drafts: 0, errors: 0, blocked: 0, approved: 0, edited: 0,
    editRatioSum: 0, editN: 0, latencySum: 0, latencyN: 0, costSum: 0, costN: 0, confSum: 0, confN: 0,
    supported: 0, factual: 0, risk: { low: 0, medium: 0, high: 0 },
  }]));
  let compared = 0;
  let reviewed = 0;
  let rejected = 0;
  let toMentor = 0;
  for (const d of drafts) {
    const v = d && normalizeDrafts(d.aiDrafts);
    if (!v || !ids.every(id => v[id])) continue;
    compared++;
    const a = d.aiDraft || {};
    if (a.status === "rejected") rejected++;
    if (a.status === "to-mentor") toMentor++;
    const chosen = a.approvedProvider || "";
    if ((a.status === "approved" || a.status === "edited") && chosen) reviewed++;
    for (const id of ids) {
      const row = rows[id];
      const x = v[id];
      if (x.status === "error") { row.errors++; continue; }
      row.drafts++;
      if (x.status === "blocked") row.blocked++;
      if (x.latencyMs > 0 && !x.legacy) { row.latencySum += x.latencyMs; row.latencyN++; }
      if (x.usage && Number.isFinite(x.usage.costUSD) && !x.legacy) { row.costSum += x.usage.costUSD; row.costN++; }
      if (x.status !== "blocked") { row.confSum += Number(x.confidence) || 0; row.confN++; if (x.risk in row.risk) row.risk[x.risk]++; }
      for (const c of x.claimChecks || []) {
        if (c.status === "guidance") continue;
        row.factual++;
        if (c.status === "supported") row.supported++;
      }
      if (chosen === id && (a.status === "approved" || a.status === "edited")) {
        if (a.status === "edited") row.edited++; else row.approved++;
        row.editRatioSum += a.editDiff ? Number(a.editDiff.ratio) || 0 : 0;
        row.editN++;
      }
    }
  }
  return {
    compared,
    reviewed,
    rejected,
    toMentor,
    providers: ids.map(id => {
      const r = rows[id];
      return {
        provider: id,
        label: r.label,
        drafts: r.drafts,
        errors: r.errors,
        blocked: r.blocked,
        chosen: r.approved + r.edited,
        approvedAsIs: r.approved,
        edited: r.edited,
        chosenRate: reviewed ? avg(r.approved + r.edited, reviewed) : null,
        avgEditRatio: avg(r.editRatioSum, r.editN),
        avgLatencyMs: r.latencyN ? Math.round(r.latencySum / r.latencyN) : null,
        avgCostUSD: avg(r.costSum, r.costN, 5),
        supportRate: avg(r.supported, r.factual),
        avgConfidence: avg(r.confSum, r.confN, 2),
        risk: r.risk,
      };
    }),
  };
}
