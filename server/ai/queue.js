/**
 * Draft jobs. Submitting a question only enqueues (`ai_jobs`) — the student never waits for a
 * model. `runWorker` (api/ai-worker: a kick after submit, the Vercel cron, or staff "Process now")
 * sweeps for new questions / merged groups, then drains jobs inside a 45 s budget with
 * per-job locks, retries with exponential backoff, and the daily spend cap.
 * Idempotent: one job per question (`q_<id>`) and per merged group (`c_<id>`); an approved draft
 * is never regenerated or overwritten.
 * Time: provider calls end by the run's hard deadline (budget + `HARD_GRACE_MS`, under the 60 s
 * function limit); a job that would start a provider call with < 30 s left is re-queued for the
 * next run (no attempt used). In compare mode the non-primary side that runs out of time is saved
 * later: the same job is re-queued with `only: <side>` once the primary draft is stored.
 */

import crypto from "node:crypto";
import { K_Q, K_CLUSTERS } from "../store.js";
import { clusterAnswerText } from "../../shared/merge.js";
import { aiStoreFor } from "./aiStore.js";
import { streamEnabled, istDay, normalizeConfig } from "./config.js";
import { classifyQuestion } from "./classify.js";
import { redactQuestion } from "./redact.js";
import { redactTarget, MIN_PROVIDER_MS } from "./draft.js";
import { triagedDraft, triageBypassesStreams } from "./triage.js";
import { legacyVariant, sideOfDraft, blockAsMedical, isMedical, ensureHybridSide, canonicalSide } from "./compare.js";
import { getProvider, getPersonas, envValue } from "./runtime.js";
import { sumUsage } from "./usage.js";
import { isLoadProbeQuestion } from "../../shared/probe.js";
import { displayAskerEmail, displayAskerName } from "../../shared/account.js";
import { putOverflowDraft, overflowReasonFromError } from "./overflow.js";

export const WORKER_BUDGET_MS = 45000;
export const MIN_JOB_MS = 36000;
/** Provider calls may run this long past the budget (jobs only start inside it); keeps the run under maxDuration 60 s. */
export const HARD_GRACE_MS = 10000;
export const JOB_LOCK_MS = 90000;
export const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 60000;
const PROVIDER_WAIT_MS = 15 * 60000;
const SWEEP_EVERY_MS = 10 * 60000;
const SWEEP_LOOKBACK_MS = 14 * 24 * 3600 * 1000;
const CONFIG_TTL_MS = 15000;

export const REVIEWED = new Set(["approved", "edited"]);
const OPEN_CLUSTER_STATUSES = new Set(["", "New", "Composed"]);
const COVERED_BY_GROUP = "covered by its merged group's draft";
/** Provider failures that hit every job the same way: pause the queue instead of burning retries. */
export const ACCOUNT_LEVEL_CODES = new Set(["credits_depleted", "billing_disabled", "key_blocked", "api_disabled", "unauthenticated", "permission_denied", "unconfigured"]);
/** Free-tier / daily limits, billing, and timeouts: keep the question, mark the job for staff retry. */
export const QUOTA_DEFERRED_CODES = new Set(["quota", "credits_depleted", "billing_disabled", "timeout"]);

export function isAccountLevelError(err) {
  return Boolean(err && ACCOUNT_LEVEL_CODES.has(String(err.code || "")));
}

export function isQuotaDeferredError(err) {
  if (!err) return false;
  const code = String(err.code || err.reason || "");
  if (QUOTA_DEFERRED_CODES.has(code)) return true;
  if (Number(err.status || 0) === 429) return true;
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|insufficient_quota|credits? (depleted|exhausted)|billing/i.test(String(err.message || err.reason || ""));
}

export function isQuotaDeferredJob(job) {
  if (!job) return false;
  if (job.deferClass === "quotaDeferred") return true;
  return isQuotaDeferredError({ code: job.deferReason || "", message: job.error || "" });
}

/** Staff-visible reason — no keys, tokens, or raw provider bodies. */
export function deferReasonFromError(err) {
  const code = String(err && (err.code || err.reason) || "");
  if (code === "credits_depleted" || code === "billing_disabled") return "AI account billing or credit limit";
  if (code === "timeout") return "AI request timed out";
  if (code === "quota" || Number(err && err.status) === 429) return "AI daily quota or rate limit";
  if (isQuotaDeferredError(err)) return "AI daily quota or rate limit";
  return "AI provider temporarily unavailable";
}

/** Name / email / WAC id as already collected. Never invents age or sex. Extra WAC org only with share consent. */
export function askerSnapshot(rec) {
  if (!rec || typeof rec !== "object") return { name: "", email: "", wacId: "" };
  const out = {
    name: displayAskerName(rec).slice(0, 80),
    email: displayAskerEmail(rec).slice(0, 120),
    wacId: String(rec.wacId || "").trim().slice(0, 40),
  };
  if (rec.wacShareConsent && rec.wac && typeof rec.wac === "object") {
    out.org = {
      institution: String(rec.wac.institution || rec.institution || "").trim().slice(0, 120),
      category: String(rec.wac.category || "").trim().slice(0, 60),
      country: String(rec.wac.country || "").trim().slice(0, 60),
      state: String(rec.wac.state || "").trim().slice(0, 60),
    };
  }
  return out;
}

export const jobIdFor = (type, id) => `${type === "cluster" ? "c" : "q"}_${id}`;
export const draftIdFor = (type, id) => `${type === "cluster" ? "c" : "q"}:${id}`;

export function memberHash(ids) {
  const list = [...new Set((ids || []).map(x => String(x || "").trim()).filter(Boolean))].sort();
  return crypto.createHash("sha1").update(list.join("|")).digest("hex").slice(0, 12);
}

/** Group membership changed enough that the old draft may not fit (Jaccard < 0.75). */
export function membershipChanged(prevIds, nextIds) {
  const a = new Set((prevIds || []).map(String));
  const b = new Set((nextIds || []).map(String));
  if (!a.size || !b.size) return a.size !== b.size;
  let inter = 0;
  a.forEach(x => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter) < 0.75;
}

let cfgCache = null;
export async function getConfigCached(aiStore, { fresh = false } = {}) {
  if (!fresh && cfgCache && cfgCache.store === aiStore && Date.now() - cfgCache.at < CONFIG_TTL_MS) return cfgCache.cfg;
  const cfg = await aiStore.getConfig();
  cfgCache = { store: aiStore, at: Date.now(), cfg };
  return cfg;
}
export function invalidateConfigCache() {
  cfgCache = null;
}

export function isAnsweredQuestion(rec) {
  return Boolean(String(rec && (rec.individualAnswer || rec.answer || "") || "").trim());
}

export function clusterOpen(c) {
  return c && !clusterAnswerText(c) && OPEN_CLUSTER_STATUSES.has(String(c.status || ""));
}

async function putQueued(aiStore, job, now) {
  return aiStore.putJob({
    attempts: 0,
    priority: 0,
    ...job,
    status: "queued",
    nextAt: job.nextAt || now,
    lockedUntil: 0,
    createdAt: job.createdAt || now,
    updatedAt: now,
  });
}

/** Called right after a question lands. Cheap no-op unless AI is on for its stream. */
export async function enqueueQuestion(store, rec, { cfg, personas, now = Date.now(), force = false, priority = 0, anyStream = false, delay = true, requeueFinished = false, only = "" } = {}) {
  if (!rec || !rec.id) return { queued: false, reason: "missing" };
  // Load-test traffic must never spend the daily cap, even through sweep, backfill or regenerate.
  if (isLoadProbeQuestion(rec)) return { queued: false, reason: "load-probe" };
  const aiStore = await aiStoreFor(store);
  const c = cfg || await getConfigCached(aiStore);
  if (!c.enabled) return { queued: false, reason: "disabled" };
  if (isAnsweredQuestion(rec)) return { queued: false, reason: "answered" };
  const ps = personas || await getPersonas();
  const redacted = redactQuestion(rec);
  const cls = classifyQuestion(redacted, ps);
  // Confident scripted triage (self-harm, exam cheating, off-topic, …) reaches an official in any stream.
  if (!anyStream && !streamEnabled(c, cls.stream) && !triageBypassesStreams(redacted)) return { queued: false, reason: "stream-off", stream: cls.stream };
  const id = jobIdFor("question", rec.id);
  const existing = await aiStore.getJob(id);
  // A finished job with no draft behind it (skipped while it sat in a closed group) may be re-queued by a backfill.
  const finishedEarlier = requeueFinished && existing && (existing.status === "done" || existing.status === "skipped");
  if (existing && !force && existing.status !== "failed" && !finishedEarlier) return { queued: false, reason: "exists", stream: cls.stream };
  const draft = await aiStore.getDraft(draftIdFor("question", rec.id));
  if (draft && draft.aiDraft && REVIEWED.has(draft.aiDraft.status)) return { queued: false, reason: "reviewed" };
  if (draft && !force) return { queued: false, reason: "drafted" };
  // AI_QUESTION_DELAY_MIN > 0 holds new questions so staff auto-merge first; the group then gets one draft.
  const delayMin = Number(envValue("AI_QUESTION_DELAY_MIN"));
  const nextAt = delay && !force && Number.isFinite(delayMin) && delayMin > 0 ? now + delayMin * 60_000 : now;
  await putQueued(aiStore, { id, type: "question", targetId: rec.id, stream: cls.stream, priority, force, nextAt, only: only || "" }, now);
  return { queued: true, id, stream: cls.stream };
}

/** One draft per merged group; regenerated only when membership changes materially. */
export async function enqueueCluster(store, cluster, { cfg, personas, members, now = Date.now(), force = false, priority = 0, anyStream = false, only = "" } = {}) {
  const ids = (cluster && cluster.memberIds) || [];
  if (!cluster || !cluster.id || ids.length < 2) return { queued: false, reason: "not-merged" };
  if (!clusterOpen(cluster) && !force) return { queued: false, reason: "closed" };
  if (clusterAnswerText(cluster)) return { queued: false, reason: "answered" };
  const aiStore = await aiStoreFor(store);
  const c = cfg || await getConfigCached(aiStore);
  if (!c.enabled) return { queued: false, reason: "disabled" };
  const ps = personas || await getPersonas();
  const head = (members && members[0]) || (await store.get(K_Q + ids[0])) || {};
  const cls = classifyQuestion({
    question: cluster.composite || cluster.representative || head.question || "",
    context: "",
    theme: cluster.theme || head.theme || "",
    subtheme: cluster.subtheme || head.subtheme || "",
  }, ps);
  if (!anyStream && !streamEnabled(c, cls.stream)) return { queued: false, reason: "stream-off", stream: cls.stream };
  const hash = memberHash(ids);
  const draft = await aiStore.getDraft(draftIdFor("cluster", cluster.id));
  if (draft && draft.aiDraft && REVIEWED.has(draft.aiDraft.status)) return { queued: false, reason: "reviewed" };
  if (draft && !force && (draft.memberHash === hash || !membershipChanged(draft.memberIds, ids))) return { queued: false, reason: "drafted" };
  const id = jobIdFor("cluster", cluster.id);
  const existing = await aiStore.getJob(id);
  if (existing && !force && (existing.status === "queued" || existing.status === "running") && existing.memberHash === hash) {
    return { queued: false, reason: "exists" };
  }
  await putQueued(aiStore, { id, type: "cluster", targetId: cluster.id, stream: cls.stream, memberHash: hash, priority, force, only: only || "" }, now);
  return { queued: true, id, stream: cls.stream };
}

/** Catch questions whose enqueue was lost (serverless freeze) and newly merged groups. */
export async function sweep(store, { cfg, personas, now = Date.now(), force = false } = {}) {
  const aiStore = await aiStoreFor(store);
  const state = await aiStore.getState();
  if (!force && state.lastSweepAt && now - state.lastSweepAt < SWEEP_EVERY_MS) return { swept: false };
  const since = force ? now - SWEEP_LOOKBACK_MS : Math.max(now - SWEEP_LOOKBACK_MS, (state.lastSweepAt || 0) - 3600 * 1000);
  const recent = await aiStore.listRecentQuestions(since);
  let questions = 0;
  for (const q of recent) {
    const r = await enqueueQuestion(store, q, { cfg, personas, now });
    if (r.queued) questions++;
  }
  let clusters = 0;
  const all = (await store.get(K_CLUSTERS)) || [];
  const inOpenGroup = new Set();
  for (const c of Array.isArray(all) ? all : []) {
    if (!clusterOpen(c) || (c.memberIds || []).length < 2) continue;
    (c.memberIds || []).forEach(m => inOpenGroup.add(String(m)));
    const r = await enqueueCluster(store, c, { cfg, personas, now });
    if (r.queued) clusters++;
  }
  // A question skipped because its group would be drafted, then detached or the group dissolved.
  let detached = 0;
  for (const j of await aiStore.listJobs({ status: "skipped" })) {
    if (j.type !== "question" || j.result !== COVERED_BY_GROUP || inOpenGroup.has(String(j.targetId))) continue;
    if (await aiStore.getDraft(draftIdFor("question", j.targetId))) continue;
    const rec = await store.get(K_Q + j.targetId);
    if (!rec || isAnsweredQuestion(rec)) continue;
    await putQueued(aiStore, { ...j, attempts: 0, force: false, error: "", result: "", nextAt: now }, now);
    detached++;
  }
  await aiStore.setState({ lastSweepAt: now });
  return { swept: true, questions, clusters, detached };
}

async function loadTarget(store, job) {
  if (job.type === "cluster") {
    const clusters = (await store.get(K_CLUSTERS)) || [];
    const cluster = (Array.isArray(clusters) ? clusters : []).find(c => String(c.id) === String(job.targetId));
    if (!cluster) return { missing: true };
    const members = [];
    for (const mid of cluster.memberIds || []) {
      const rec = await store.get(K_Q + mid);
      if (rec) members.push(rec);
    }
    return { target: { type: "cluster", id: cluster.id, cluster, members }, closed: !clusterOpen(cluster), answered: Boolean(clusterAnswerText(cluster)) };
  }
  const rec = await store.get(K_Q + job.targetId);
  if (!rec) return { missing: true };
  return { target: { type: "question", id: rec.id, rec }, closed: isAnsweredQuestion(rec), answered: isAnsweredQuestion(rec) };
}

function draftSummary(d) {
  if (!d) return null;
  return { status: d.status, risk: d.risk, confidence: d.confidence, createdAt: d.createdAt, blockedReason: d.blockedReason || "", rejectReason: d.rejectReason || "" };
}

/** Keep a compare side that finished (or failed visibly) when the job itself is not saved as done. Never publishes. */
async function mergeDraftSides(aiStore, did, aiDrafts, now) {
  if (!aiDrafts) return;
  const existing = await aiStore.getDraft(did);
  if (!existing || !existing.aiDraft || REVIEWED.has(existing.aiDraft.status)) return;
  const sides = ensureHybridSide({ ...(existing.aiDrafts || {}), ...aiDrafts }, { now });
  await aiStore.putDraft({ ...existing, updatedAt: now, regenerating: false, aiDrafts: sides });
}

/**
 * Run one claimed job. Returns `{ status, usage, draftStatus?, followUp? }`; `followUp` names a
 * compare side that ran out of time and should be drafted alone in the next job run.
 * `deadlineAt` (epoch ms) bounds every provider call; `sideTimeoutMs` overrides the per-provider limit (tests).
 */
export async function processJob(store, job, { cfg, provider, personas, now = Date.now(), kb, deadlineAt = 0, sideTimeoutMs } = {}) {
  const aiStore = await aiStoreFor(store);
  const loaded = await loadTarget(store, job);
  if (loaded.missing) return { status: "skipped", reason: "target missing" };
  if (loaded.answered || (loaded.closed && !job.force)) return { status: "skipped", reason: "already answered or with a mentor" };
  const did = draftIdFor(job.type, job.targetId);
  const prev = await aiStore.getDraft(did);
  if (prev && prev.aiDraft && REVIEWED.has(prev.aiDraft.status)) return { status: "skipped", reason: "already approved" };

  // One draft per merged group, not per student: a question already in an open group is covered by the group draft.
  if (job.type === "question" && !job.force) {
    const all = (await store.get(K_CLUSTERS)) || [];
    const group = (Array.isArray(all) ? all : []).find(c => (c.memberIds || []).length >= 2 && clusterOpen(c) && (c.memberIds || []).map(String).includes(String(job.targetId)));
    if (group) {
      await enqueueCluster(store, group, { cfg, personas, now });
      return { status: "skipped", reason: COVERED_BY_GROUP };
    }
  }

  // Compare mode: `job.only` redrafts one side (Regenerate Hybrid / Gemini) and keeps the rest of the record.
  // `openai` is a GPT side stored before the hybrid switch — draft it as Hybrid.
  const rawOnly = job.only && prev && prev.aiDraft ? canonicalSide(String(job.only)) : "";
  const only = rawOnly === "hybrid" || rawOnly === "gemini" ? rawOnly : "";
  let result;
  try {
    result = await triagedDraft({ target: loaded.target, aiStore, provider, personas, cfg, now, kb, deadlineAt, sideTimeoutMs, ...(only ? { compareOnly: only } : {}) });
  } catch (err) {
    if (err && err.aiDrafts) {
      try { await mergeDraftSides(aiStore, did, err.aiDrafts, now); } catch { /* surface the original failure */ }
    }
    throw err;
  }
  if (result.retryable) {
    try { await mergeDraftSides(aiStore, did, result.aiDrafts, now); } catch { /* the retry still happens */ }
    return { status: "retry-later", reason: result.aiDraft.blockedReason, usage: result.usage, delayMs: PROVIDER_WAIT_MS };
  }
  const followUp = Array.isArray(result.deferred) && result.deferred.length ? { followUp: String(result.deferred[0]) } : {};

  // Drafting takes seconds: an official may have approved, or a mentor answered, meanwhile.
  const latest = await aiStore.getDraft(did);
  if (latest && latest.aiDraft && REVIEWED.has(latest.aiDraft.status)) return { status: "skipped", reason: "approved while drafting", usage: result.usage };
  const again = await loadTarget(store, job);
  if (again.missing) return { status: "skipped", reason: "target removed while drafting", usage: result.usage };
  if (again.answered || (again.closed && !job.force)) return { status: "skipped", reason: "answered while drafting", usage: result.usage };

  // A record drafted before compare mode (or before the hybrid switch) keeps its draft as that side.
  const keptSides = base => {
    const sides = { ...((base && base.aiDrafts) || {}) };
    const side = base && base.aiDraft ? sideOfDraft(base.aiDraft) : "";
    if (side && !sides[side] && (base.aiDraft.answer || base.aiDraft.status === "blocked")) sides[side] = legacyVariant(base.aiDraft);
    return sides;
  };

  const hybridPending = followUp.followUp === "hybrid";
  const withHybrid = sides => ensureHybridSide(sides, { now, pending: hybridPending });

  if (only && !result.aiDraft) {
    const base = latest || prev;
    // The redrafted side flagged medical: the question goes to a mentor, whichever draft was on top.
    const medical = result.medicalFlag && base.aiDraft && !isMedical(base.aiDraft);
    const merged = {
      ...base,
      updatedAt: now,
      regenerating: false,
      aiDrafts: withHybrid({ ...keptSides(base), ...(result.aiDrafts || {}) }),
      ...(medical ? { aiDraft: blockAsMedical(base.aiDraft, result.medicalFlag, result.medicalNote) } : {}),
      ...(result.compareSkipped ? { compareSkipped: result.compareSkipped } : {}),
    };
    // Clear stuck awaiting_ai / overflow from a prior quota pause.
    delete merged.overflow;
    delete merged.overflowReason;
    await aiStore.putDraft(merged);
    return { status: "done", draftStatus: (base.aiDraft && base.aiDraft.status) || "", usage: result.usage, ...followUp };
  }

  const t = loaded.target;
  const memberIds = t.type === "cluster" ? (t.cluster.memberIds || []).map(String) : [String(t.rec.id)];
  const redacted = result.meta.redacted || redactTarget(t);
  const asker = (prev && prev.asker) || askerSnapshot(t.type === "question" ? t.rec : (t.members && t.members[0]));
  const rec = {
    id: did,
    targetType: t.type,
    targetId: String(t.id),
    ticket: t.type === "question" ? String(t.rec.ticket || "") : "",
    theme: t.type === "cluster" ? (t.cluster.theme || "") : (t.rec.theme || ""),
    subtheme: t.type === "cluster" ? (t.cluster.subtheme || "") : (t.rec.subtheme || ""),
    stream: result.meta.stream || job.stream || "",
    intentKey: result.meta.intentKey || "",
    question: redacted.question,
    context: redacted.context,
    members: (redacted.members || []).slice(0, 8),
    memberIds,
    memberHash: memberHash(memberIds),
    memberCount: memberIds.length,
    // A real draft replaces any awaiting_ai / quota placeholder — never leave overflow stuck.
    shadow: cfg.shadowMode !== false && !(result.aiDraft.triage && result.aiDraft.triage.urgent),
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
    ...(asker && (asker.name || asker.email || asker.wacId) ? { asker } : {}),
    aiDraft: { ...result.aiDraft, usage: result.usage },
    meta: {
      retrieval: result.meta.retrieval || null,
      medical: result.meta.medical || null,
      suggestion: result.meta.suggestion || null,
      redactions: redacted.found || {},
    },
    history: [...((prev && prev.history) || []), ...(prev && prev.aiDraft ? [draftSummary(prev.aiDraft)] : [])].slice(-6),
  };
  if (result.aiDrafts) {
    // Redrafting only the primary keeps the other side it is being compared with.
    rec.aiDrafts = withHybrid(only ? { ...keptSides(latest || prev), ...result.aiDrafts } : result.aiDrafts);
  } else if (only && prev && prev.aiDrafts) {
    rec.aiDrafts = prev.aiDrafts;
  }
  const flagged = rec.aiDrafts && Object.values(rec.aiDrafts).find(isMedical);
  if (flagged && !isMedical(rec.aiDraft)) rec.aiDraft = blockAsMedical(rec.aiDraft, flagged.provider, flagged.blockedNote);
  if (result.compareSkipped) rec.compareSkipped = result.compareSkipped;
  await aiStore.putDraft(rec);
  return { status: "done", draftStatus: rec.aiDraft.status, usage: result.usage, ...followUp };
}

async function setAlert(aiStore, alert) {
  const cfg = await aiStore.getConfig();
  if (cfg.alert && cfg.alert.type === alert.type && cfg.alert.day === alert.day && cfg.alert.message === alert.message) return;
  await aiStore.setConfig({ ...cfg, alert });
  invalidateConfigCache();
}

async function clearAlert(aiStore, type) {
  const cfg = await aiStore.getConfig();
  if (!cfg.alert || cfg.alert.type !== type) return;
  const { alert, ...rest } = cfg;
  await aiStore.setConfig(rest);
  invalidateConfigCache();
}

function providerAlertMessage(err) {
  const reason = deferReasonFromError(err);
  const raw = String(err && err.message || err || "").replace(/^\w+ \d{3}: /, "").replace(/\b(sk-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+|re_[A-Za-z0-9]+)\b/g, "[key]").slice(0, 180);
  return `Drafting is paused (${reason}). ${raw || "The AI provider rejected the request."} Questions stay on Insights and DISHA drafts — Retry AI after recharge, or wait 15 minutes. Nothing is published until an official approves it.`;
}

async function markQuotaDeferred(aiStore, claimed, err, now, extra = {}) {
  const reason = extra.reason || deferReasonFromError(err);
  await aiStore.putJob({
    ...claimed,
    status: "queued",
    attempts: Math.max(0, (claimed.attempts || 1) - 1),
    lockedUntil: 0,
    nextAt: now + (extra.delayMs || PROVIDER_WAIT_MS),
    updatedAt: now,
    deferClass: "quotaDeferred",
    deferReason: reason,
    error: reason,
  });
}

/**
 * Normalize compare `aiDrafts` on stored records (empty Hybrid shell → error or openai→hybrid).
 * Skips a Hybrid "missing" stamp when that side is still queued (`only: hybrid|openai`).
 * Never overwrites approved/edited answers or publishes.
 */
export async function repairHybridDraftSlots(aiStore, { now = Date.now() } = {}) {
  let repaired = 0;
  const jobs = await aiStore.listJobs();
  const hybridPending = new Set();
  for (const j of jobs) {
    if (j.status !== "queued" && j.status !== "running") continue;
    const only = j.only === "openai" ? "hybrid" : j.only;
    if (only === "hybrid") hybridPending.add(draftIdFor(j.type, j.targetId));
  }
  for (const d of await aiStore.listDrafts()) {
    if (!d.aiDrafts || typeof d.aiDrafts !== "object") continue;
    const st = d.aiDraft && d.aiDraft.status;
    if (st === "approved" || st === "edited") continue;
    // Overflow / awaiting_ai placeholders are not compare cards — leave them alone.
    if (d.overflow || st === "awaiting_ai" || st === "quotaDeferred" || st === "aiPending") continue;
    const pending = hybridPending.has(d.id);
    const next = ensureHybridSide(d.aiDrafts, { now, pending });
    if (JSON.stringify(next) === JSON.stringify(d.aiDrafts)) continue;
    await aiStore.putDraft({ ...d, aiDrafts: next, updatedAt: now });
    repaired++;
  }
  return repaired;
}

/**
 * Drain the queue within the time budget.
 * @returns {Promise<object>} run report
 */
export async function runWorker(store, { now = () => Date.now(), budgetMs = WORKER_BUDGET_MS, minJobMs = MIN_JOB_MS, hardMs = budgetMs + HARD_GRACE_MS, sideTimeoutMs, sweepFirst = true, forceSweep = false } = {}) {
  const started = now();
  // Real clock: provider requests are timed with Date.now() even when tests inject `now`.
  const deadlineAt = Date.now() + hardMs;
  const aiStore = await aiStoreFor(store);
  const cfg = normalizeConfig(await aiStore.getConfig());
  invalidateConfigCache();
  const report = { ok: true, enabled: cfg.enabled, processed: 0, done: 0, failed: 0, retried: 0, skipped: 0, deferred: 0, quotaDeferred: 0, followUps: 0, spendUSD: 0, stopped: "" };
  if (!cfg.enabled) { report.stopped = "disabled"; return report; }

  const [provider, personas] = await Promise.all([getProvider(), getPersonas()]);
  if (sweepFirst) {
    try { report.sweep = await sweep(store, { cfg, personas, now: started, force: forceSweep }); }
    catch (err) { report.sweep = { error: String(err && err.message || err).slice(0, 160) }; }
  }

  // Release jobs whose worker died mid-run.
  for (const j of await aiStore.listJobs({ status: "running" })) {
    if ((j.lockedUntil || 0) >= now()) continue;
    // A job that keeps killing its worker (function timeout) must not loop forever.
    if ((j.attempts || 0) >= MAX_ATTEMPTS) {
      await aiStore.putJob({ ...j, status: "failed", lockedUntil: 0, updatedAt: now(), error: j.error || "The worker timed out on every attempt." });
      report.failed++;
    } else {
      await aiStore.putJob({ ...j, status: "queued", lockedUntil: 0, updatedAt: now() });
    }
  }

  const day = istDay(started);
  const pending = (await aiStore.listJobs({ status: "queued" }))
    .filter(j => (j.nextAt || 0) <= now())
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  report.queued = pending.length;
  let providerOk = !(cfg.alert && cfg.alert.type === "provider");

  for (const job of pending) {
    if (now() - started > budgetMs - minJobMs || deadlineAt - Date.now() < MIN_PROVIDER_MS) { report.stopped = "time budget"; break; }
    const usageToday = await aiStore.getUsage(day);
    if ((usageToday.costUSD || 0) >= cfg.dailySpendCapUSD) {
      report.stopped = "spend cap";
      await setAlert(aiStore, { type: "spend-cap", day, at: now(), message: `Daily AI spend cap of $${cfg.dailySpendCapUSD} reached ($${(usageToday.costUSD || 0).toFixed(2)} today). Drafting is paused until midnight IST or until the cap is raised.` });
      break;
    }
    const claimed = await aiStore.claimJob(job.id, now(), JOB_LOCK_MS);
    if (!claimed) continue;
    report.processed++;
    let out;
    try {
      out = await processJob(store, claimed, { cfg, provider, personas, now: now(), deadlineAt, sideTimeoutMs });
    } catch (err) {
      const status = err && err.code === "deferred" ? "deferred"
        : isAccountLevelError(err) ? "provider-down"
        : isQuotaDeferredError(err) ? "quota-deferred"
        : "error";
      out = { status, error: String(err && err.message || err).slice(0, 300), usage: err && err.usage, err };
    }
    if (out.usage && (out.usage.calls || out.usage.costUSD)) {
      await aiStore.addUsage(day, out.usage);
      report.spendUSD = Math.round((report.spendUSD + (out.usage.costUSD || 0)) * 1e6) / 1e6;
    }
    const t = now();
    if (out.status === "done" && out.followUp) {
      // The finished side is stored (Hybrid as an error if GPT timed out); the side that ran out of time is drafted alone next.
      const next = { ...claimed, status: "queued", only: out.followUp, attempts: 0, lockedUntil: 0, nextAt: t, updatedAt: t, error: "", result: `${out.draftStatus || "done"}; ${out.followUp} side continues in the next run` };
      await aiStore.putJob(next);
      report.done++;
      report.followUps++;
      if (!providerOk) { providerOk = true; await clearAlert(aiStore, "provider"); }
      pending.push(next);
    } else if (out.status === "deferred") {
      // Too little time left to start a provider call: back in the queue, attempt not counted.
      await aiStore.putJob({ ...claimed, status: "queued", attempts: Math.max(0, (claimed.attempts || 1) - 1), lockedUntil: 0, nextAt: t, updatedAt: t });
      report.deferred++;
      report.stopped = "time budget";
      break;
    } else if (out.status === "done" || out.status === "skipped") {
      await aiStore.putJob({ ...claimed, status: out.status === "done" ? "done" : "skipped", lockedUntil: 0, updatedAt: t, finishedAt: t, result: out.draftStatus || out.reason || "", error: "", force: false, only: "" });
      if (out.status === "done") {
        report.done++;
        if (!providerOk) { providerOk = true; await clearAlert(aiStore, "provider"); }
      } else report.skipped++;
    } else if (out.status === "quota-deferred" || (out.status === "retry-later" && isQuotaDeferredError({ code: out.reason, message: out.reason }))) {
      // 429 / quota / billing / timeout: keep the question, pause this run, staff retries after recharge.
      const err = out.err || { code: out.reason || "quota", message: out.reason || out.error };
      await markQuotaDeferred(aiStore, claimed, err, t, { delayMs: out.delayMs });
      await putOverflowDraft(store, claimed, { reason: overflowReasonFromError(err), error: out.error || out.reason, now: t }).catch(() => null);
      await setAlert(aiStore, { type: "provider", day, at: t, message: providerAlertMessage(err) });
      report.retried++;
      report.quotaDeferred = (report.quotaDeferred || 0) + 1;
      report.stopped = "ai quota";
      report.providerError = String(out.err && out.err.code || out.reason || "quota");
      break;
    } else if (out.status === "provider-down") {
      // Credits / billing / key problems: keep the job (attempt not counted), tell staff, stop this run.
      await markQuotaDeferred(aiStore, claimed, out.err || { code: "provider", message: out.error }, t);
      await putOverflowDraft(store, claimed, { reason: overflowReasonFromError(out.err), error: out.error, now: t }).catch(() => null);
      await setAlert(aiStore, { type: "provider", day, at: t, message: providerAlertMessage(out.err) });
      report.retried++;
      report.stopped = "provider unavailable";
      report.providerError = String(out.err && out.err.code || "provider");
      break;
    } else if (out.status === "retry-later") {
      await aiStore.putJob({ ...claimed, status: "queued", attempts: Math.max(0, (claimed.attempts || 1) - 1), lockedUntil: 0, nextAt: t + (out.delayMs || PROVIDER_WAIT_MS), updatedAt: t, error: out.reason || "" });
      report.retried++;
      if (out.reason === "provider_unconfigured") { report.stopped = "provider not configured"; break; }
    } else {
      const attempts = claimed.attempts || 1;
      if (attempts >= MAX_ATTEMPTS) {
        await aiStore.putJob({ ...claimed, status: "failed", lockedUntil: 0, updatedAt: t, error: out.error || "failed" });
        report.failed++;
      } else {
        await aiStore.putJob({ ...claimed, status: "queued", lockedUntil: 0, nextAt: t + BACKOFF_BASE_MS * 2 ** (attempts - 1), updatedAt: t, error: out.error || "" });
        report.retried++;
      }
      await putOverflowDraft(store, claimed, { reason: "awaiting_ai", error: out.error, now: t }).catch(() => null);
    }
  }
  report.ms = now() - started;
  try { report.hybridRepaired = await repairHybridDraftSlots(aiStore, { now: now() }); }
  catch (err) { report.hybridRepairError = String(err && err.message || err).slice(0, 120); }
  await aiStore.setState({ lastRunAt: started, lastRun: { ...report, sweep: undefined } });
  return report;
}

export { sumUsage };
