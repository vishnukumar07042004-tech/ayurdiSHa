/**
 * "Draft existing questions": queues AI drafts for questions that arrived before AI drafting (or
 * their stream) was switched on. Live submits only enqueue while enabled, and the worker sweep
 * looks back 14 days, so older questions would otherwise never get a draft.
 *
 * A target is a single question, or ONE job per open merged group (size ≥ 2). Skipped: anything
 * answered or with a mentor, demo records, rule-screened medical questions, targets that already
 * have a draft or a queued / running job, and streams that are off (unless `allStreams`).
 * Oldest first, at most `limit` jobs per run; re-running never duplicates a job.
 * `redraftInsufficient: true` instead re-queues drafts that ended "insufficient source".
 */

import { K_Q, K_CLUSTERS } from "../store.js";
import { clusterAnswerText } from "../../shared/merge.js";
import { isDemoDelegate } from "../register.js";
import { isLoadProbeQuestion } from "../../shared/probe.js";
import { aiStoreFor } from "./aiStore.js";
import { normalizeConfig, istDay } from "./config.js";
import { classifyQuestion } from "./classify.js";
import { redactQuestion } from "./redact.js";
import { triageBypassesStreams } from "./triage.js";
import { getPersonas } from "./runtime.js";
import {
  enqueueQuestion, enqueueCluster, draftIdFor, jobIdFor, clusterOpen, isAnsweredQuestion, invalidateConfigCache, membershipChanged,
} from "./queue.js";
import { compareEligible, missingSides, sideOfDraft } from "./compare.js";

export const BACKFILL_DEFAULT_LIMIT = 50;
export const BACKFILL_MAX_LIMIT = 300;
/** Rough cost of one draft + verify (data/kb/cost-model.json, recommended models), for the preview only. */
export const EST_COST_PER_DRAFT_USD = 0.05;
const SAMPLE = 8;

function clampLimit(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return BACKFILL_DEFAULT_LIMIT;
  return Math.min(BACKFILL_MAX_LIMIT, n);
}

async function allQuestions(store) {
  if (typeof store.listQuestions === "function") return (await store.listQuestions()).filter(q => q && q.id);
  const out = [];
  for (const k of await store.list(K_Q)) {
    const q = await store.get(k);
    if (q && q.id) out.push(q);
  }
  return out;
}

function bump(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

export function isInsufficientDraft(d) {
  const a = d && d.aiDraft;
  return Boolean(a && a.status === "blocked" && a.blockedReason === "insufficient_source");
}

/**
 * `redraftInsufficient`: re-queue drafts that ended "insufficient source" (blocked) so they are
 * redrafted (mentor-assist when the sources are still thin). Only open, unanswered targets;
 * reviewed drafts are never touched; a redraft that is queued or done no longer matches, so
 * re-running is a no-op.
 */
async function redraftInsufficient(store, { dryRun, limit, now, aiStore, cfg, personas, questions, clusters, drafts, jobs }) {
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const qById = new Map(questions.map(q => [String(q.id), q]));
  const clusterById = new Map(clusters.map(c => [String(c.id), c]));
  const skipped = {};
  const byStream = {};
  const candidates = [];
  for (const d of drafts) {
    if (!isInsufficientDraft(d)) continue;
    const type = d.targetType === "cluster" ? "cluster" : "question";
    const j = jobById.get(jobIdFor(type, d.targetId));
    if (j && (j.status === "queued" || j.status === "running")) { bump(skipped, "queued"); continue; }
    if (type === "cluster") {
      const c = clusterById.get(String(d.targetId));
      if (!c || (c.memberIds || []).length < 2) { bump(skipped, "missing"); continue; }
      if (clusterAnswerText(c)) { bump(skipped, "answered"); continue; }
      if (!clusterOpen(c)) { bump(skipped, "with-mentor"); continue; }
      const members = (c.memberIds || []).map(m => qById.get(String(m))).filter(Boolean);
      candidates.push({ type, id: String(c.id), stream: d.stream || "", createdAt: d.createdAt || 0, cluster: c, members, students: members.length || 1 });
    } else {
      const q = qById.get(String(d.targetId));
      if (!q) { bump(skipped, "missing"); continue; }
      if (isAnsweredQuestion(q)) { bump(skipped, "answered"); continue; }
      candidates.push({ type, id: String(q.id), stream: d.stream || "", createdAt: d.createdAt || q.createdAt || 0, rec: q, students: 1 });
    }
  }
  candidates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  candidates.forEach(c => bump(byStream, c.stream || "unknown"));
  const usage = await aiStore.getUsage(istDay(now));
  const spentToday = Number(usage.costUSD) || 0;
  const capReached = spentToday >= cfg.dailySpendCapUSD;
  const picked = candidates.slice(0, limit);
  if (candidates.length > picked.length) bump(skipped, "over-limit", candidates.length - picked.length);
  const out = {
    ok: true,
    dryRun,
    mode: "redraft-insufficient",
    enabled: cfg.enabled,
    shadowMode: cfg.shadowMode !== false,
    allStreams: true,
    limit,
    eligible: candidates.length,
    eligibleStudents: candidates.reduce((n, c) => n + c.students, 0),
    willEnqueue: picked.length,
    enqueued: 0,
    enqueuedIds: [],
    skipped,
    byStream,
    spend: { todayUSD: spentToday, capUSD: cfg.dailySpendCapUSD, capReached, estimatedUSD: Math.round(picked.length * EST_COST_PER_DRAFT_USD * 100) / 100 },
    sample: picked.slice(0, SAMPLE).map(c => ({ type: c.type, id: c.id, stream: c.stream, students: c.students, createdAt: c.createdAt })),
  };
  if (dryRun) return out;
  if (!cfg.enabled) return { ...out, ok: false, code: "disabled", error: "Turn AI drafting on in Settings first." };
  if (capReached) {
    bump(skipped, "spend-cap", picked.length);
    return { ...out, ok: false, code: "spend-cap", error: `Today's AI spend cap of $${cfg.dailySpendCapUSD} is reached. Raise the cap or try after midnight IST.` };
  }
  // These were drafted once already, so their stream was on; `force` replaces the blocked draft (history is kept).
  const common = { cfg, personas, now, priority: -1, anyStream: true, force: true };
  for (const c of picked) {
    const r = c.type === "cluster"
      ? await enqueueCluster(store, c.cluster, { ...common, members: c.members })
      : await enqueueQuestion(store, c.rec, { ...common, delay: false });
    if (r.queued) {
      out.enqueued++;
      out.enqueuedIds.push(r.id);
    } else bump(skipped, r.reason || "not-queued");
  }
  return out;
}

const REVIEW_DONE = new Set(["approved", "edited", "rejected", "to-mentor"]);

/**
 * Re-queue pending scripted OFF_TOPIC / UNFOCUSED drafts so triage + drafting run again
 * (e.g. after skill/coding asks were wrongly declined). Reviewed drafts are never touched.
 */
async function redraftScripted(store, { dryRun, limit, now, aiStore, cfg, personas, questions, clusters, drafts, jobs }) {
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const qById = new Map(questions.map(q => [String(q.id), q]));
  const clusterById = new Map(clusters.map(c => [String(c.id), c]));
  const skipped = {};
  const byStream = {};
  const candidates = [];
  const SCRIPT_CATS = new Set(["OFF_TOPIC", "UNFOCUSED"]);
  for (const d of drafts) {
    const a = d && d.aiDraft;
    if (!a || !a.scripted) continue;
    if (REVIEW_DONE.has(a.status)) { bump(skipped, "reviewed"); continue; }
    if (a.status !== "pending") { bump(skipped, a.status || "not-pending"); continue; }
    const cat = a.triage && a.triage.category;
    if (!SCRIPT_CATS.has(cat)) { bump(skipped, "not-scripted-scope"); continue; }
    const type = d.targetType === "cluster" ? "cluster" : "question";
    const j = jobById.get(jobIdFor(type, d.targetId));
    if (j && (j.status === "queued" || j.status === "running")) { bump(skipped, "queued"); continue; }
    if (type === "cluster") {
      const c = clusterById.get(String(d.targetId));
      if (!c || (c.memberIds || []).length < 2) { bump(skipped, "missing"); continue; }
      if (clusterAnswerText(c)) { bump(skipped, "answered"); continue; }
      if (!clusterOpen(c)) { bump(skipped, "with-mentor"); continue; }
      const members = (c.memberIds || []).map(m => qById.get(String(m))).filter(Boolean);
      candidates.push({ type, id: String(c.id), stream: d.stream || "", createdAt: d.createdAt || 0, cluster: c, members, students: members.length || 1 });
    } else {
      const q = qById.get(String(d.targetId));
      if (!q) { bump(skipped, "missing"); continue; }
      if (isAnsweredQuestion(q)) { bump(skipped, "answered"); continue; }
      candidates.push({ type, id: String(q.id), stream: d.stream || "", createdAt: d.createdAt || q.createdAt || 0, rec: q, students: 1 });
    }
  }
  candidates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  candidates.forEach(c => bump(byStream, c.stream || "unknown"));
  const usage = await aiStore.getUsage(istDay(now));
  const spentToday = Number(usage.costUSD) || 0;
  const capReached = spentToday >= cfg.dailySpendCapUSD;
  const picked = candidates.slice(0, limit);
  if (candidates.length > picked.length) bump(skipped, "over-limit", candidates.length - picked.length);
  const out = {
    ok: true,
    dryRun,
    mode: "redraft-scripted",
    enabled: cfg.enabled,
    shadowMode: cfg.shadowMode !== false,
    allStreams: true,
    limit,
    eligible: candidates.length,
    eligibleStudents: candidates.reduce((n, c) => n + c.students, 0),
    willEnqueue: picked.length,
    enqueued: 0,
    enqueuedIds: [],
    skipped,
    byStream,
    spend: { todayUSD: spentToday, capUSD: cfg.dailySpendCapUSD, capReached, estimatedUSD: Math.round(picked.length * EST_COST_PER_DRAFT_USD * 100) / 100 },
    sample: picked.slice(0, SAMPLE).map(c => ({ type: c.type, id: c.id, stream: c.stream, students: c.students, createdAt: c.createdAt })),
  };
  if (dryRun) return out;
  if (!cfg.enabled) return { ...out, ok: false, code: "disabled", error: "Turn AI drafting on in Settings first." };
  if (capReached) {
    bump(skipped, "spend-cap", picked.length);
    return { ...out, ok: false, code: "spend-cap", error: `Today's AI spend cap of $${cfg.dailySpendCapUSD} is reached. Raise the cap or try after midnight IST.` };
  }
  const common = { cfg, personas, now, priority: -1, anyStream: true, force: true };
  for (const c of picked) {
    const r = c.type === "cluster"
      ? await enqueueCluster(store, c.cluster, { ...common, members: c.members })
      : await enqueueQuestion(store, c.rec, { ...common, delay: false });
    if (r.queued) {
      out.enqueued++;
      out.enqueuedIds.push(r.id);
    } else bump(skipped, r.reason || "not-queued");
  }
  return out;
}

/** Rough cost of the GPT side alone (GPT-6.1 Sol draft + GPT-6.1 Terra check), for the preview only. */
export const EST_COST_PER_GPT_DRAFT_USD = 0.04;
/** Rough cost of one Hybrid draft (GPT-5.4 draft + Gemini check; eval 2026-11-09 ≈ $0.030). */
export const EST_COST_PER_HYBRID_DRAFT_USD = 0.03;
const SIDE_COST = { hybrid: EST_COST_PER_HYBRID_DRAFT_USD, gemini: EST_COST_PER_DRAFT_USD, openai: EST_COST_PER_GPT_DRAFT_USD };

/**
 * Compare-mode backfill (`aiCompareBackfill`): for open, unanswered targets whose draft is still
 * waiting for review, queue the missing side — a one-side job (`only: "hybrid"` / `"gemini"`) for the
 * side `aiDraft` did not come from, or for a side that failed — then, with what is left of `limit`,
 * draft targets that have no draft at all (`backfillDrafts`; both sides when compare mode is on).
 * Approved / edited / rejected / sent-to-mentor drafts are never touched; scripted, reused and
 * medical / no-source drafts have nothing to compare. Re-running never duplicates a job.
 */
export async function compareBackfill(store, opts = {}) {
  const dryRun = opts.dryRun === true;
  const limit = clampLimit(opts.limit);
  const now = opts.now || Date.now();
  const aiStore = await aiStoreFor(store);
  const cfg = normalizeConfig(await aiStore.getConfig());
  invalidateConfigCache();
  const personas = await getPersonas();
  const [questions, rawClusters, drafts, jobs] = await Promise.all([
    allQuestions(store), store.get(K_CLUSTERS), aiStore.listDrafts(), aiStore.listJobs(),
  ]);
  const clusters = Array.isArray(rawClusters) ? rawClusters : [];
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const qById = new Map(questions.map(q => [String(q.id), q]));
  const clusterById = new Map(clusters.map(c => [String(c.id), c]));
  const skipped = {};
  const candidates = [];
  for (const d of drafts) {
    const a = d.aiDraft || {};
    const status = a.status || "pending";
    if (REVIEW_DONE.has(status)) { bump(skipped, "reviewed"); continue; }
    if (!compareEligible(d)) { bump(skipped, "not-model-drafted"); continue; }
    const missing = missingSides(d, cfg.providers);
    if (!missing.length) { bump(skipped, "complete"); continue; }
    const type = d.targetType === "cluster" ? "cluster" : "question";
    const j = jobById.get(jobIdFor(type, d.targetId));
    if (j && (j.status === "queued" || j.status === "running")) { bump(skipped, "queued"); continue; }
    // The other side first; `aiDraft`'s own side is missing only when it errored.
    const top = sideOfDraft(a);
    const only = missing.find(id => id !== top) || missing[0];
    if (type === "cluster") {
      const c = clusterById.get(String(d.targetId));
      if (!c || (c.memberIds || []).length < 2) { bump(skipped, "missing"); continue; }
      if (clusterAnswerText(c)) { bump(skipped, "answered"); continue; }
      if (!clusterOpen(c)) { bump(skipped, "with-mentor"); continue; }
      if (membershipChanged(d.memberIds, c.memberIds || [])) { bump(skipped, "group-changed"); continue; }
      const members = (c.memberIds || []).map(m => qById.get(String(m))).filter(Boolean);
      candidates.push({ type, id: String(c.id), only, stream: d.stream || "", createdAt: d.createdAt || 0, cluster: c, members, students: members.length || 1 });
    } else {
      const q = qById.get(String(d.targetId));
      if (!q) { bump(skipped, "missing"); continue; }
      if (isAnsweredQuestion(q)) { bump(skipped, "answered"); continue; }
      candidates.push({ type, id: String(q.id), only, stream: d.stream || "", createdAt: d.createdAt || q.createdAt || 0, rec: q, students: 1 });
    }
  }
  candidates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const picked = candidates.slice(0, limit);
  if (candidates.length > picked.length) bump(skipped, "over-limit", candidates.length - picked.length);
  const byOnly = {};
  picked.forEach(c => bump(byOnly, c.only));

  // Targets with no draft at all get a normal job (both sides when compare mode is on).
  const fresh = await backfillDrafts(store, { dryRun: true, limit: Math.max(1, limit - picked.length), now });
  const freshN = limit - picked.length > 0 ? fresh.willEnqueue : 0;
  const usage = await aiStore.getUsage(istDay(now));
  const spentToday = Number(usage.costUSD) || 0;
  const capReached = spentToday >= cfg.dailySpendCapUSD;
  const primaryCost = SIDE_COST[cfg.primary] || EST_COST_PER_DRAFT_USD;
  const perFresh = cfg.compareMode ? (cfg.providers || []).reduce((s, id) => s + (SIDE_COST[id] || EST_COST_PER_DRAFT_USD), 0) : primaryCost;
  const estimatedUSD = Object.entries(byOnly).reduce((s, [id, n]) => s + n * (SIDE_COST[id] || EST_COST_PER_DRAFT_USD), 0) + freshN * perFresh;
  const out = {
    ok: true,
    dryRun,
    mode: "compare",
    enabled: cfg.enabled,
    compareMode: cfg.compareMode,
    limit,
    eligible: candidates.length,
    willEnqueue: picked.length,
    missingHybrid: byOnly.hybrid || 0,
    missingGemini: byOnly.gemini || 0,
    undrafted: { eligible: fresh.eligible, willEnqueue: freshN, skipped: fresh.skipped },
    enqueued: 0,
    enqueuedIds: [],
    skipped,
    spend: { todayUSD: spentToday, capUSD: cfg.dailySpendCapUSD, capReached, estimatedUSD: Math.round(estimatedUSD * 100) / 100 },
    sample: picked.slice(0, SAMPLE).map(c => ({ type: c.type, id: c.id, only: c.only, stream: c.stream, students: c.students, createdAt: c.createdAt })),
  };
  if (dryRun) return out;
  if (!cfg.enabled) return { ...out, ok: false, code: "disabled", error: "Turn AI drafting on in Settings first." };
  if (capReached) {
    bump(skipped, "spend-cap", picked.length);
    return { ...out, ok: false, code: "spend-cap", error: `Today's AI spend cap of $${cfg.dailySpendCapUSD} is reached. Raise the cap or try after midnight IST.` };
  }
  const common = { cfg, personas, now, priority: -1, anyStream: true, force: true };
  for (const c of picked) {
    const r = c.type === "cluster"
      ? await enqueueCluster(store, c.cluster, { ...common, members: c.members, only: c.only })
      : await enqueueQuestion(store, c.rec, { ...common, delay: false, only: c.only });
    if (r.queued) {
      out.enqueued++;
      out.enqueuedIds.push(r.id);
    } else bump(skipped, r.reason || "not-queued");
  }
  if (freshN > 0) {
    const r = await backfillDrafts(store, { limit: freshN, now });
    if (r.ok) {
      out.enqueued += r.enqueued;
      out.enqueuedIds.push(...r.enqueuedIds);
      out.undrafted.enqueued = r.enqueued;
    }
  }
  return out;
}

/**
 * @param {object} store
 * @param {{ dryRun?: boolean, allStreams?: boolean, limit?: number, now?: number, redraftInsufficient?: boolean, redraftScripted?: boolean }} opts
 */
export async function backfillDrafts(store, opts = {}) {
  const dryRun = opts.dryRun === true;
  const allStreams = opts.allStreams === true;
  const limit = clampLimit(opts.limit);
  const now = opts.now || Date.now();
  const aiStore = await aiStoreFor(store);
  const cfg = normalizeConfig(await aiStore.getConfig());
  invalidateConfigCache();
  const personas = await getPersonas();
  const [questions, rawClusters, drafts, jobs] = await Promise.all([
    allQuestions(store), store.get(K_CLUSTERS), aiStore.listDrafts(), aiStore.listJobs(),
  ]);
  const clusters = Array.isArray(rawClusters) ? rawClusters : [];
  if (opts.redraftInsufficient === true) {
    return redraftInsufficient(store, { dryRun, limit, now, aiStore, cfg, personas, questions, clusters, drafts, jobs });
  }
  if (opts.redraftScripted === true) {
    return redraftScripted(store, { dryRun, limit, now, aiStore, cfg, personas, questions, clusters, drafts, jobs });
  }
  const draftById = new Map(drafts.map(d => [d.id, d]));
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const qById = new Map(questions.map(q => [String(q.id), q]));
  const groupOf = new Map();
  for (const c of clusters) for (const m of c.memberIds || []) groupOf.set(String(m), c);

  const skipped = {};
  const byStream = {};
  const candidates = [];
  const streamOn = id => cfg.streams[id] === true;

  // Draft / job state shared by question and group targets.
  function existingState(type, id) {
    const d = draftById.get(draftIdFor(type, id));
    if (d && d.aiDraft) {
      if (d.aiDraft.status === "blocked" && d.aiDraft.blockedReason === "medical") return "medical";
      return "drafted";
    }
    const j = jobById.get(jobIdFor(type, id));
    if (j && (j.status === "queued" || j.status === "running")) return "queued";
    return "";
  }

  const seenGroups = new Set();
  for (const q of questions) {
    if (isDemoDelegate(q) || isLoadProbeQuestion(q)) { bump(skipped, "demo"); continue; }
    if (!String(q.question || "").trim()) { bump(skipped, "empty"); continue; }
    if (isAnsweredQuestion(q)) { bump(skipped, "answered"); continue; }
    const g = groupOf.get(String(q.id));
    if (g && clusterAnswerText(g)) { bump(skipped, "answered"); continue; }
    if (g && !clusterOpen(g)) { bump(skipped, "with-mentor"); continue; }

    if (g && (g.memberIds || []).length >= 2) {
      if (seenGroups.has(String(g.id))) { bump(skipped, "in-group"); continue; }
      seenGroups.add(String(g.id));
      const members = (g.memberIds || []).map(m => qById.get(String(m))).filter(Boolean);
      const state = existingState("cluster", g.id);
      if (state) { bump(skipped, state, members.length || 1); continue; }
      const head = members[0] || q;
      const cls = classifyQuestion(redactQuestion({
        question: g.composite || g.representative || head.question || "",
        context: "",
        theme: g.theme || head.theme || "",
        subtheme: g.subtheme || head.subtheme || "",
      }), personas);
      if (cls.medical.verdict === "yes") { bump(skipped, "medical", members.length || 1); continue; }
      if (!allStreams && !streamOn(cls.stream)) { bump(skipped, "stream-off", members.length || 1); continue; }
      const createdAt = Math.min(...members.map(m => m.createdAt || now), q.createdAt || now);
      candidates.push({ type: "cluster", id: String(g.id), stream: cls.stream, createdAt, cluster: g, members, students: members.length || 1 });
      continue;
    }

    const state = existingState("question", q.id);
    if (state) { bump(skipped, state); continue; }
    const redacted = redactQuestion(q);
    const cls = classifyQuestion(redacted, personas);
    if (cls.medical.verdict === "yes") { bump(skipped, "medical"); continue; }
    if (!allStreams && !streamOn(cls.stream) && !triageBypassesStreams(redacted)) { bump(skipped, "stream-off"); continue; }
    candidates.push({ type: "question", id: String(q.id), stream: cls.stream, createdAt: q.createdAt || 0, rec: q, students: 1 });
  }

  candidates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  candidates.forEach(c => bump(byStream, c.stream || "unknown"));
  const usage = await aiStore.getUsage(istDay(now));
  const spentToday = Number(usage.costUSD) || 0;
  const capReached = spentToday >= cfg.dailySpendCapUSD;
  const picked = candidates.slice(0, limit);
  if (candidates.length > picked.length) bump(skipped, "over-limit", candidates.length - picked.length);

  const out = {
    ok: true,
    dryRun,
    enabled: cfg.enabled,
    shadowMode: cfg.shadowMode !== false,
    allStreams,
    limit,
    eligible: candidates.length,
    eligibleStudents: candidates.reduce((n, c) => n + c.students, 0),
    willEnqueue: picked.length,
    enqueued: 0,
    enqueuedIds: [],
    skipped,
    byStream,
    spend: { todayUSD: spentToday, capUSD: cfg.dailySpendCapUSD, capReached, estimatedUSD: Math.round(picked.length * EST_COST_PER_DRAFT_USD * 100) / 100 },
    sample: picked.slice(0, SAMPLE).map(c => ({ type: c.type, id: c.id, stream: c.stream, students: c.students, createdAt: c.createdAt })),
  };
  if (dryRun) return out;
  if (!cfg.enabled) return { ...out, ok: false, code: "disabled", error: "Turn AI drafting on in Settings first." };
  if (capReached) {
    bump(skipped, "spend-cap", picked.length);
    return { ...out, ok: false, code: "spend-cap", error: `Today's AI spend cap of $${cfg.dailySpendCapUSD} is reached. Raise the cap or try after midnight IST.` };
  }

  // Backfilled jobs sit just below fresh Ask Desk questions (priority 0) so a live student never waits behind them.
  const common = { cfg, personas, now, priority: -1, anyStream: allStreams };
  for (const c of picked) {
    const r = c.type === "cluster"
      ? await enqueueCluster(store, c.cluster, { ...common, members: c.members })
      : await enqueueQuestion(store, c.rec, { ...common, delay: false, requeueFinished: true });
    if (r.queued) {
      out.enqueued++;
      out.enqueuedIds.push(r.id);
    } else bump(skipped, r.reason || "not-queued");
  }
  return out;
}
