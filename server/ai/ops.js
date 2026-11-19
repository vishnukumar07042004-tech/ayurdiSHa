/**
 * Staff ops for the AI drafts desk (all staff-PIN gated by the caller) and the two small hooks
 * the public paths need: enqueue after an Ask Desk submit, and the honest "being reviewed" stage
 * on Track. Approval writes the SAME fields a human answer uses (individual* on the question,
 * answer / actions / mistake / resources / mentorName / status on the cluster, with the clusters
 * version check), so Track and the mentor pack keep working unchanged.
 */

import { K_Q } from "../store.js";
import { clusterAnswerText, sanitizeClusters } from "../../shared/merge.js";
import { aiStoreFor } from "./aiStore.js";
import { patchConfig, normalizeConfig, istDay } from "./config.js";
import { enqueueQuestion, enqueueCluster, getConfigCached, invalidateConfigCache, draftIdFor, jobIdFor, membershipChanged, REVIEWED, isQuotaDeferredJob, askerSnapshot, deferReasonFromError } from "./queue.js";
import { AWAITING_AI, isOverflowDraft, overflowItemFromJob } from "./overflow.js";
import { getPersonas, getProvider, providerReady, getCompareProviders } from "./runtime.js";
import { compareModels, computeCompareStats, sideOfDraft, isMedical, primaryOf, normalizeDrafts, ensureHybridSide } from "./compare.js";
import { PROVIDER_LABELS, COMPARE_PROVIDERS } from "./config.js";
import { stripCitationMarks } from "./verify.js";
import { invalidateBank, kbSummary } from "./retrieve.js";
import { loadAllowList } from "./sources.js";
import { computeStats } from "./stats.js";
import { triagedDraft } from "./triage.js";
import { TRIAGE_OPS, handleTriageOp } from "./triageOps.js";
import { SCRIPTED_CATEGORIES } from "../../shared/triageRules.js";
import { presentAskerRecord } from "../../shared/account.js";
import { normalizeUsage } from "./usage.js";
import { backfillDrafts, compareBackfill } from "./backfill.js";
import { MENTOR_ASSIST_MODE, isMentorAssist } from "./mentorAssist.js";

const RISK_ORDER = { high: 0, medium: 1, low: 2 };
const QUEUE_MAX = 300;
const DESK_KICK_GAP_MS = 60000;
let lastDeskKickAt = 0;

function str(v, max = 2000) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** Track shows resources as text lines; keep the link visible. */
export function resourceLine(r) {
  if (!r) return "";
  if (typeof r === "string") return str(r, 300);
  const title = str(r.title, 160);
  const url = str(r.url, 400);
  if (title && url) return `${title} — ${url}`;
  return title || url;
}

function cleanFields(src, fallback = {}) {
  const pick = (k, d) => (src && k in src ? src[k] : d);
  const actions = (pick("actions", fallback.actions) || []).map(a => str(a, 300)).filter(Boolean).slice(0, 3);
  const resources = (pick("resources", fallback.resources) || []).map(r => (typeof r === "string" ? { title: str(r, 160), url: "" } : { title: str(r && r.title, 160), url: str(r && r.url, 400) }))
    .filter(r => r.title || r.url).slice(0, 2);
  return {
    answer: str(pick("answer", fallback.answer), 6000),
    actions,
    mistake: str(pick("mistake", fallback.mistake), 600),
    resources,
    mentorName: str(pick("mentorName", fallback.mentorName || ""), 120),
  };
}

function words(s) {
  return String(s || "").toLowerCase().match(/[a-z0-9\u0900-\u097f]+/g) || [];
}

/** Size of a reviewer's edit: 0 = untouched, 1 = rewritten. */
export function editDiff(before, after) {
  const fields = ["answer", "mistake"];
  const changed = [];
  let num = 0;
  let den = 0;
  const lcs = (a, b) => {
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    let prev = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      const cur = new Array(n + 1).fill(0);
      for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      prev = cur;
    }
    return prev[n];
  };
  for (const f of fields) {
    const a = words(stripCitationMarks(before[f])).slice(0, 600);
    const b = words(after[f]).slice(0, 600);
    const common = lcs(a, b);
    const size = Math.max(a.length, b.length);
    if (size && common !== size) changed.push(f);
    num += size - common;
    den += size;
  }
  const ba = (before.actions || []).join("\n");
  const aa = (after.actions || []).join("\n");
  if (ba.trim() !== aa.trim()) changed.push("actions");
  const br = JSON.stringify((before.resources || []).map(r => r.url || r.title));
  const ar = JSON.stringify((after.resources || []).map(r => r.url || r.title));
  if (br !== ar) changed.push("resources");
  return {
    ratio: den ? Math.round((num / den) * 1000) / 1000 : 0,
    changed,
    before: { answer: stripCitationMarks(before.answer), actions: before.actions || [], mistake: before.mistake || "", resources: before.resources || [] },
    after: { answer: after.answer, actions: after.actions, mistake: after.mistake, resources: after.resources },
  };
}

/* ---------------------------------------------------------------- */
/* Public hooks                                                      */
/* ---------------------------------------------------------------- */

/**
 * After a new Ask Desk question is saved. Bounded so a slow store never delays the student;
 * returns whether the worker should be kicked.
 */
let enqueueImpl = enqueueQuestion;

/** Tests only: swap the enqueue step (e.g. one that throws or hangs). `null` restores it. */
export function setEnqueueForTests(fn) {
  enqueueImpl = typeof fn === "function" ? fn : enqueueQuestion;
}

export async function onQuestionSaved(store, rec, { timeoutMs = 1500 } = {}) {
  try {
    const work = (async () => {
      const aiStore = await aiStoreFor(store);
      const cfg = await getConfigCached(aiStore);
      if (!cfg.enabled) return { queued: false };
      return enqueueImpl(store, rec, { cfg });
    })().catch(err => {
      // Also reached after the timeout has already answered — never an unhandled rejection.
      console.error("[aym-ai] enqueue failed:", err && err.message ? err.message : err);
      return { queued: false, reason: "error" };
    });
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ queued: false, reason: "timeout" }), timeoutMs); });
    const r = await Promise.race([work, timeout]);
    clearTimeout(timer);
    return r;
  } catch (err) {
    console.error("[aym-ai] enqueue failed:", err && err.message ? err.message : err);
    return { queued: false };
  }
}

/**
 * Adds `reviewStage: "review"` to Track hits whose question (or group) has a draft waiting for an
 * official — only when AI is on and the draft is visible to reviewers (not shadow). No AI wording.
 */
export async function annotateLookupHits(store, hits) {
  if (!Array.isArray(hits) || !hits.length) return hits;
  try {
    const aiStore = await aiStoreFor(store);
    const cfg = await getConfigCached(aiStore);
    if (!cfg.enabled) return hits;
    for (const h of hits) {
      const answered = Boolean(String(h.individualAnswer || "").trim()) || Boolean(h.cluster && String(h.cluster.answer || "").trim());
      if (answered) continue;
      const ids = [draftIdFor("question", h.id)];
      if (h.cluster && h.cluster.id && (h.cluster.memberIds || []).length >= 2) ids.unshift(draftIdFor("cluster", h.cluster.id));
      for (const id of ids) {
        const d = await aiStore.getDraft(id);
        if (d && d.aiDraft && d.aiDraft.status === "pending" && !d.shadow) { h.reviewStage = "review"; break; }
      }
    }
  } catch (err) {
    console.error("[aym-ai] lookup annotate failed:", err && err.message ? err.message : err);
  }
  return hits;
}

/* ---------------------------------------------------------------- */
/* Staff ops                                                         */
/* ---------------------------------------------------------------- */

/** Hybrid is still in the queue, so the desk should say it continues rather than show a missing-key error. */
function hybridStillQueued(job) {
  if (!job) return false;
  const only = job.only === "openai" ? "hybrid" : job.only;
  return only === "hybrid" && (job.status === "queued" || job.status === "running");
}

function queueItem(d, extra = {}) {
  const a = d.aiDraft || {};
  const item = {
    id: d.id,
    targetType: d.targetType,
    targetId: d.targetId,
    ticket: d.ticket || "",
    theme: d.theme,
    subtheme: d.subtheme,
    stream: d.stream,
    question: d.question,
    context: d.context,
    members: d.members || [],
    memberCount: d.memberCount || 1,
    shadow: Boolean(d.shadow),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    aiDraft: a,
    ...(d.asker ? { asker: d.asker } : {}),
    ...(d.pendingDraft ? { pendingDraft: true } : {}),
    ...(isOverflowDraft(d) ? { overflow: true, overflowReason: d.overflowReason || "" } : {}),
    ...(d.aiDrafts ? { aiDrafts: ensureHybridSide(d.aiDrafts, { pending: hybridStillQueued(extra.job || d.job) }) } : {}),
    ...(d.compareSkipped ? { compareSkipped: d.compareSkipped } : {}),
    meta: d.meta || {},
    history: d.history || [],
    ...extra,
  };
  if (item.asker) item.asker = presentAskerRecord(item.asker);
  return item;
}

async function pendingJobItems(store, jobs, draftIds) {
  const out = [];
  for (const j of jobs) {
    if (j.status !== "queued" && j.status !== "running" && j.status !== "failed") continue;
    const did = draftIdFor(j.type, j.targetId);
    if (draftIds.has(did)) continue;
    const rec = j.type === "question" ? await store.get(K_Q + j.targetId) : null;
    const item = overflowItemFromJob(j, rec, { job: pickJob(j), pendingDraft: true, asker: askerSnapshot(rec), shadow: false });
    if (isQuotaDeferredJob(j)) item.quotaDeferred = true;
    out.push(item);
  }
  return out;
}

async function listQueue(store, msg, kick) {
  const aiStore = await aiStoreFor(store);
  const [drafts, jobs, cfg] = await Promise.all([aiStore.listDrafts(), aiStore.listJobs(), aiStore.getConfig()]);
  const clusters = (await store.get("aym:clusters")) || [];
  const mergedOf = new Map();
  (Array.isArray(clusters) ? clusters : []).forEach(c => {
    if ((c.memberIds || []).length >= 2) (c.memberIds || []).forEach(m => mergedOf.set(String(m), c));
  });
  const clusterById = new Map((Array.isArray(clusters) ? clusters : []).map(c => [String(c.id), c]));
  const jobByTarget = new Map(jobs.map(j => [draftIdFor(j.type, j.targetId), j]));
  const draftIds = new Set(drafts.map(d => d.id));
  const answeredQ = await answeredQuestionIds(store, drafts);

  const showShadow = msg.shadow === true || msg.shadow === "all";
  const status = str(msg.status, 20) || "open";
  const stream = str(msg.stream, 60);
  const mode = str(msg.mode, 30);

  const items = drafts.map(d => {
    const job = jobByTarget.get(d.id);
    const extra = { job: job ? pickJob(job) : null };
    // Only while its job is still queued / running; a failed redraft leaves the old draft usable.
    extra.regenerating = Boolean(d.regenerating && job && (job.status === "queued" || job.status === "running"));
    if (job && isQuotaDeferredJob(job) && isOverflowDraft(d)) extra.quotaDeferred = true;
    if (isOverflowDraft(d) || extra.quotaDeferred) extra.overflow = true;
    if (d.targetType === "question") {
      const c = mergedOf.get(String(d.targetId));
      if (c) extra.inGroup = { id: c.id, size: (c.memberIds || []).length, hasDraft: draftIds.has(draftIdFor("cluster", c.id)), answered: Boolean(clusterAnswerText(c)) };
      if (answeredQ.has(String(d.targetId))) extra.answeredElsewhere = "briefing";
    } else {
      const c = clusterById.get(String(d.targetId));
      extra.groupNow = c ? { size: (c.memberIds || []).length, status: c.status || "New", answered: Boolean(clusterAnswerText(c)), changed: membershipChanged(d.memberIds, c.memberIds || []) } : { missing: true };
      if (c && clusterAnswerText(c)) extra.answeredElsewhere = "curation";
    }
    return queueItem(d, extra);
  });
  const pending = await pendingJobItems(store, jobs, draftIds);
  items.push(...pending.map(d => queueItem(d, { job: d.job, pendingDraft: true, asker: d.asker })));

  // A mentor answered on the briefing board / Curation desk / Excel before anyone reviewed the draft.
  const superseded = it => (it.aiDraft.status || "pending") === "pending" && Boolean(it.answeredElsewhere);
  const visible = items.filter(it => {
    const s = it.aiDraft.status || "pending";
    if (!showShadow && it.shadow && s === "pending") return false;
    if (stream && it.stream !== stream) return false;
    if (mode === MENTOR_ASSIST_MODE && !isMentorAssist(it.aiDraft)) return false;
    if (mode === "grounded" && isMentorAssist(it.aiDraft)) return false;
    if (status === "open") return (s === "pending" || s === AWAITING_AI || s === "quotaDeferred" || s === "aiPending") && !superseded(it);
    if (status === "all") return true;
    return s === status;
  });
  visible.sort((a, b) =>
    deskTier(a) - deskTier(b)
    || (RISK_ORDER[a.aiDraft.risk] ?? 3) - (RISK_ORDER[b.aiDraft.risk] ?? 3)
    || (a.createdAt || 0) - (b.createdAt || 0));

  const queuedJobs = jobs.filter(j => j.status === "queued" || j.status === "running");
  // Vercel Hobby runs the cron once a day; an official opening the desk drains anything due.
  const now = Date.now();
  if (cfg && cfg.enabled && typeof kick === "function" && now - lastDeskKickAt >= DESK_KICK_GAP_MS
    && jobs.some(j => j.status === "queued" && (j.nextAt || 0) <= now && (j.lockedUntil || 0) <= now)) {
    lastDeskKickAt = now;
    kick();
  }
  return {
    items: visible.slice(0, QUEUE_MAX),
    total: visible.length,
    counts: {
      pending: items.filter(i => i.aiDraft.status === "pending" && !superseded(i) && (!i.shadow || showShadow)).length,
      shadow: items.filter(i => i.aiDraft.status === "pending" && !superseded(i) && i.shadow).length,
      superseded: items.filter(superseded).length,
      blocked: items.filter(i => i.aiDraft.status === "blocked").length,
      mentorAssist: items.filter(i => i.aiDraft.status === "pending" && isMentorAssist(i.aiDraft) && !superseded(i) && (!i.shadow || showShadow)).length,
      quotaDeferred: items.filter(i => i.overflow || i.aiDraft.status === AWAITING_AI || i.aiDraft.status === "quotaDeferred" || i.quotaDeferred).length,
      aiPending: items.filter(i => i.aiDraft.status === "aiPending" || i.aiDraft.status === AWAITING_AI).length,
      awaitingAi: items.filter(i => i.overflow || i.aiDraft.status === AWAITING_AI || i.aiDraft.status === "quotaDeferred" || i.aiDraft.status === "aiPending").length,
      jobsQueued: queuedJobs.length,
      jobsFailed: jobs.filter(j => j.status === "failed").length,
    },
    working: queuedJobs.map(pickJob).slice(0, 50),
    deferred: jobs.filter(isQuotaDeferredJob).map(pickJob).slice(0, 50),
    failed: jobs.filter(j => j.status === "failed").map(pickJob).slice(0, 30),
    config: cfg,
  };
}

/** Desk order: urgent safety cases, then normal drafts, then mentor-assist drafts, then blocked / medical. */
export function deskTier(item) {
  const a = (item && item.aiDraft) || {};
  if (a.triage && a.triage.urgent) return 0;
  if (a.status === AWAITING_AI || a.status === "quotaDeferred" || item.quotaDeferred || item.overflow) return 0;
  if (a.status === "aiPending") return 1;
  if (a.status === "blocked") return 3;
  if (isMentorAssist(a)) return 2;
  return 1;
}

function pickJob(j) {
  return {
    id: j.id, type: j.type, targetId: j.targetId, status: j.status, attempts: j.attempts || 0,
    nextAt: j.nextAt || 0, error: j.error || "", updatedAt: j.updatedAt || 0, stream: j.stream || "",
    ...(j.only ? { only: j.only } : {}),
    ...(j.deferClass ? { deferClass: j.deferClass } : {}),
    ...(j.deferReason ? { deferReason: j.deferReason } : {}),
  };
}

/** Ids of questions that drafts point at and that already carry a personal answer. */
async function answeredQuestionIds(store, drafts) {
  const wanted = new Set(drafts.filter(d => d.targetType === "question" && (d.aiDraft || {}).status === "pending").map(d => String(d.targetId)));
  const out = new Set();
  if (!wanted.size) return out;
  const has = q => Boolean(String(q && (q.individualAnswer || q.answer) || "").trim());
  if (typeof store.listQuestions === "function") {
    for (const q of await store.listQuestions()) if (q && wanted.has(String(q.id)) && has(q)) out.add(String(q.id));
    return out;
  }
  for (const id of wanted) if (has(await store.get(K_Q + id))) out.add(id);
  return out;
}

async function loadDraftOr404(aiStore, id, ctx) {
  const d = await aiStore.getDraft(str(id, 200));
  if (!d) { ctx.send(404, { error: "That draft is no longer on the desk. Refresh the queue." }); return null; }
  return d;
}

async function addToBank(aiStore, d, fields, reviewer, status, src = d.aiDraft) {
  const a = src || {};
  await aiStore.addBank({
    id: d.id,
    source: "approved-draft",
    approved: true,
    status,
    targetType: d.targetType,
    targetId: d.targetId,
    theme: d.theme,
    subtheme: d.subtheme,
    stream: d.stream,
    intentKey: d.intentKey || "",
    persona: a.persona || (d.aiDraft && d.aiDraft.persona) || "",
    ...(a.provider ? { provider: a.provider } : {}),
    mode: a.mode || "",
    question: d.question,
    answer: fields.answer,
    answerMarked: status === "approved" ? a.answer : fields.answer,
    actions: fields.actions,
    mistake: fields.mistake,
    resources: fields.resources,
    citations: (a.citations || []).filter(c => c.valid !== false),
    claimChecks: status === "approved" ? (a.claimChecks || []) : [],
    approvedAt: Date.now(),
    reviewer,
  });
  invalidateBank();
}

/** Write an approved answer onto the question or cluster through the existing fields. */
async function publish(store, d, fields, ctx, { aiAssisted = true } = {}) {
  if (d.targetType === "question") {
    const rec = await store.get(K_Q + d.targetId);
    if (!rec || !rec.id) { ctx.send(404, { error: "That question is not on the desk." }); return null; }
    if (String(rec.individualAnswer || "").trim()) {
      ctx.send(409, { error: "This question already has an answer on the briefing board. Open it there to edit.", code: "answered" });
      return null;
    }
    rec.individualAnswer = fields.answer;
    rec.individualMentor = fields.mentorName;
    rec.individualActions = fields.actions;
    rec.individualMistake = fields.mistake;
    rec.individualResources = fields.resources.map(resourceLine).filter(Boolean).slice(0, 2);
    rec.individualMustKnow = Array.isArray(fields.mustKnow)
      ? fields.mustKnow.map(x => String(x || "").trim()).filter(Boolean).slice(0, 4)
      : ((d.aiDraft && d.aiDraft.mustKnow) || []).map(x => String(x || "").trim()).filter(Boolean).slice(0, 4);
    rec.individualAt = Date.now();
    // Students must not see AI disclosure — keep flag for staff analytics only.
    rec.individualAiAssisted = aiAssisted;
    await store.set(K_Q + rec.id, rec);
    const notified = await ctx.notifyAnswerOnce(store, rec, { answer: fields.answer });
    return { question: notified || rec };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const meta = await ctx.clustersMeta(store);
    const clusters = meta.value || [];
    const c = clusters.find(x => String(x.id) === String(d.targetId));
    if (!c) { ctx.send(404, { error: "That merged group no longer exists. It may have been re-merged — regenerate from the Curation desk." }); return null; }
    if (clusterAnswerText(c)) { ctx.send(409, { error: "This group already has a mentor answer. Edit it on the Curation desk.", code: "answered" }); return null; }
    if (membershipChanged(d.memberIds, c.memberIds || [])) {
      ctx.send(409, { error: "The group's members changed since this draft was written. Regenerate before approving.", code: "membership-changed" });
      return null;
    }
    const next = clusters.map(x => (String(x.id) === String(d.targetId) ? {
      ...x,
      answer: fields.answer,
      actions: fields.actions,
      mistake: fields.mistake,
      resources: fields.resources.map(resourceLine).filter(Boolean).slice(0, 2),
      mentorName: fields.mentorName || x.mentorName || "",
      status: "Published",
      aiAssisted,
    } : x));
    try {
      const saved = await ctx.persistClusters(store, sanitizeClusters(next).clusters, meta.version);
      await ctx.notifyNewlyPublishedClusters(store, clusters, saved.clusters);
      return { clustersVersion: saved.version };
    } catch (err) {
      if (err instanceof ctx.ClustersVersionConflictError && attempt === 0) continue;
      if (err instanceof ctx.ClustersVersionConflictError) {
        ctx.sendClustersConflict(err.currentVersion);
        return null;
      }
      throw err;
    }
  }
  return null;
}

/** Sides staff can regenerate / test; `openai` is also accepted on approval (compare records from before the hybrid switch). */
const COMPARE_SIDES = new Set(COMPARE_PROVIDERS);
const APPROVE_SIDES = new Set([...COMPARE_PROVIDERS, "openai"]);
const sideName = id => PROVIDER_LABELS[id] || id;

/**
 * Which draft the official chose. Compare-mode records offer `aiDrafts.hybrid` / `aiDrafts.gemini`;
 * `aiDraft` (the primary's, see `sideOfDraft`) is the default. A question routed to a mentor as
 * medical stays blocked whichever side is picked. Returns `{ src, provider }` or `{ error }`.
 */
function chosenDraft(d, want) {
  const a = d.aiDraft || {};
  const p = str(want, 20).toLowerCase();
  const sides = d.aiDrafts ? normalizeDrafts(d.aiDrafts) : null;
  const top = sides ? sideOfDraft(a) : "";
  if (!p) return { src: a, provider: top };
  if (!APPROVE_SIDES.has(p)) return { error: "Pick the Hybrid or the Gemini-only draft." };
  if (p === top || isMedical(a)) return { src: a, provider: p === "openai" ? "hybrid" : p };
  const v = sides && (sides[p] || (p === "openai" ? sides.hybrid : null));
  if (!v) return { error: `There is no ${sideName(p === "openai" ? "hybrid" : p)} draft for this question yet. Use Regenerate → ${sideName(p === "openai" ? "hybrid" : p)}.` };
  if (v.status === "error") return { error: `The ${sideName(p === "openai" ? "hybrid" : p)} draft failed (${v.error || "error"}). Regenerate it or approve the ${sideName(top)} draft.` };
  return { src: { ...v, persona: a.persona, triage: a.triage, scripted: a.scripted }, provider: p === "openai" ? "hybrid" : p };
}

async function review(store, msg, ctx, kind) {
  const aiStore = await aiStoreFor(store);
  const d = await loadDraftOr404(aiStore, msg.id, ctx);
  if (!d) return;
  const a = d.aiDraft || {};
  if (REVIEWED.has(a.status)) { ctx.send(409, { error: "This draft was already approved.", code: "reviewed" }); return; }
  const pick = chosenDraft(d, msg.provider);
  if (pick.error) { ctx.send(400, { error: pick.error, code: "no-draft" }); return; }
  const src = pick.src;
  if ((src.status === "blocked" || src.status === AWAITING_AI || src.status === "quotaDeferred" || src.status === "aiPending") && kind !== "edit") {
    ctx.send(400, { error: src.status === "blocked"
      ? "Blocked drafts cannot be approved as-is. Write the answer with Edit then send, or send it to a mentor."
      : "This question is still waiting for AI. Retry AI after recharge, or write the answer with Edit then send." });
    return;
  }
  const reviewer = str(msg.reviewer, 80) || "staff";
  const draftFields = cleanFields({ ...src, answer: stripCitationMarks(src.answer), mentorName: msg.mentorName || "" });
  const fields = kind === "edit" ? cleanFields(msg, draftFields) : draftFields;
  if (!fields.answer) { ctx.send(400, { error: "Write the answer before sending." }); return; }

  // An official writing the answer for a blocked (never drafted) question is not AI-assisted.
  const aiAssisted = src.status !== "blocked" && Boolean(String(src.answer || "").trim());
  const out = await publish(store, d, fields, ctx, { aiAssisted });
  if (!out) return;
  const now = Date.now();
  const status = kind === "edit" ? "edited" : "approved";
  const diff = kind === "edit" ? editDiff(src, fields) : null;
  const next = {
    ...d,
    updatedAt: now,
    ...(pick.provider ? { approvedProvider: pick.provider } : {}),
    aiDraft: {
      ...a,
      status: diff && diff.ratio === 0 && !diff.changed.length ? "approved" : status,
      reviewer,
      reviewedAt: now,
      aiAssisted,
      ...(pick.provider ? { approvedProvider: pick.provider, approvedModel: src.model || "" } : {}),
      ...(diff ? { editDiff: diff } : {}),
      published: { answer: fields.answer, actions: fields.actions, mistake: fields.mistake, resources: fields.resources, mentorName: fields.mentorName },
    },
  };
  await aiStore.putDraft(next);
  // A decline or clarifying reply must never be reused as the answer to a genuine question.
  if (!(a.triage && SCRIPTED_CATEGORIES.has(a.triage.category))) await addToBank(aiStore, d, fields, reviewer, next.aiDraft.status, src);
  ctx.send(200, { ok: true, item: queueItem(next), ...out });
}

async function setStatus(store, msg, ctx, status) {
  const aiStore = await aiStoreFor(store);
  const d = await loadDraftOr404(aiStore, msg.id, ctx);
  if (!d) return;
  const a = d.aiDraft || {};
  if (REVIEWED.has(a.status)) { ctx.send(409, { error: "This draft was already approved.", code: "reviewed" }); return; }
  const now = Date.now();
  const patch = { status, reviewer: str(msg.reviewer, 80) || "staff", reviewedAt: now };
  if (status === "rejected") {
    const reason = str(msg.reason, 400);
    if (!reason) { ctx.send(400, { error: "Add a short reason — it teaches the next draft." }); return; }
    patch.rejectReason = reason;
    patch.rejectTag = str(msg.tag, 40);
  }
  let extra = {};
  if (status === "to-mentor" && d.targetType === "cluster") {
    const meta = await ctx.clustersMeta(store);
    const c = (meta.value || []).find(x => String(x.id) === String(d.targetId));
    if (c && !clusterAnswerText(c) && c.status !== "Sent to mentor") {
      const next = meta.value.map(x => (String(x.id) === String(d.targetId) ? { ...x, status: "Sent to mentor" } : x));
      try {
        const saved = await ctx.persistClusters(store, sanitizeClusters(next).clusters, meta.version);
        extra = { clustersVersion: saved.version };
      } catch (err) {
        if (err instanceof ctx.ClustersVersionConflictError) { ctx.sendClustersConflict(err.currentVersion); return; }
        throw err;
      }
    }
  }
  const next = { ...d, updatedAt: now, aiDraft: { ...a, ...patch } };
  await aiStore.putDraft(next);
  ctx.send(200, { ok: true, item: queueItem(next), ...extra });
}

async function regenerate(store, msg, ctx) {
  const aiStore = await aiStoreFor(store);
  const id = str(msg.id, 200);
  const [type, targetId] = id.startsWith("c:") ? ["cluster", id.slice(2)] : id.startsWith("q:") ? ["question", id.slice(2)] : [str(msg.targetType, 20), str(msg.targetId, 200)];
  if (!targetId || (type !== "cluster" && type !== "question")) { ctx.send(400, { error: "Pick a question or merged group to draft." }); return; }
  const d = await aiStore.getDraft(draftIdFor(type, targetId));
  if (d && d.aiDraft && REVIEWED.has(d.aiDraft.status)) { ctx.send(409, { error: "This answer was already approved; it will not be regenerated.", code: "reviewed" }); return; }
  const cfg = await aiStore.getConfig();
  // Staff asked explicitly: honour it for any stream, but never while AI is globally off.
  if (!cfg.enabled) { ctx.send(409, { error: "Turn AI drafting on in Settings first.", code: "disabled" }); return; }
  // Compare mode: "hybrid" / "gemini" redraft one side and keep the other; blank = both (a fresh job).
  const side = str(msg.provider, 20).toLowerCase();
  if (side && !COMPARE_SIDES.has(side)) { ctx.send(400, { error: "Regenerate Hybrid, Gemini only or both." }); return; }
  const only = side && d && d.aiDraft ? side : "";
  let r;
  if (type === "cluster") {
    const clusters = (await store.get("aym:clusters")) || [];
    const c = (Array.isArray(clusters) ? clusters : []).find(x => String(x.id) === targetId);
    if (!c) { ctx.send(404, { error: "That merged group no longer exists." }); return; }
    r = await enqueueCluster(store, c, { cfg, force: true, priority: 10, anyStream: true, only });
  } else {
    const rec = await store.get(K_Q + targetId);
    if (!rec) { ctx.send(404, { error: "That question is not on the desk." }); return; }
    r = await enqueueQuestion(store, rec, { cfg, force: true, priority: 10, anyStream: true, only });
  }
  if (!r.queued) { ctx.send(409, { error: r.reason === "answered" ? "This already has an answer." : `Could not queue (${r.reason}).`, code: r.reason }); return; }
  if (d && d.aiDraft && d.aiDraft.status === "pending") {
    await aiStore.putDraft({ ...d, updatedAt: Date.now(), regenerating: true });
  }
  ctx.kickWorker();
  ctx.send(200, { ok: true, queued: r.id, ...(only ? { only } : {}) });
}

/** What Settings shows about the provider — names, models, project/location; never keys or tokens. */
function providerSummary(provider, models = null) {
  const out = { configured: providerReady(provider) };
  let info = null;
  try { info = typeof provider.providerInfo === "function" ? provider.providerInfo() : null; } catch { info = null; }
  try {
    if (typeof provider.gptConfigured === "function") out.gptConfigured = Boolean(provider.gptConfigured());
    else if (info && typeof info.gptConfigured === "boolean") out.gptConfigured = info.gptConfigured;
  } catch { /* ignore */ }
  if (models) {
    return { ...out, id: (info && info.provider) || provider.id || "", label: (info && info.label) || provider.id || "", draftModel: models.draft || "", verifyModel: models.verify || "", escalateModel: models.escalate || "" };
  }
  if (!info) return out;
  return {
    ...out,
    id: info.provider || "",
    label: info.label || info.provider || "",
    draftModel: info.draftModel || "",
    verifyModel: info.verifyModel || "",
    escalateModel: info.escalateModel || "",
    embedModel: info.embedModel || "",
    embedDimensions: info.embedDimensions || 0,
    vertex: info.vertex ? { auth: info.vertex.auth, project: info.vertex.project, location: info.vertex.location, serviceAccount: info.vertex.serviceAccount || "" } : null,
  };
}

async function providerTest(aiStore, side = "") {
  const base = await getProvider();
  const provider = side && side !== "gemini" ? (await getCompareProviders(base, [side]))[side] : base;
  if (!provider || typeof provider.testConnection !== "function") return { ok: false, error: "This deploy has no provider test." };
  const r = (await provider.testConnection()) || { ok: false, error: "This deploy has no provider test." };
  const cost = Number(r.chat && r.chat.costUsd) || 0;
  if (cost) await aiStore.addUsage(istDay(), normalizeUsage({ costUSD: cost, provider: r.provider || side }, r.chat.model));
  if (r.ok && !(side && side !== "gemini")) {
    const cfg = await aiStore.getConfig();
    if (cfg.alert && cfg.alert.type === "provider") {
      const { alert, ...rest } = cfg;
      await aiStore.setConfig(rest);
      invalidateConfigCache();
    }
  }
  return r;
}

/** Which provider / model runs each pipeline step for the configured primary (Settings; names only). */
export function pipelineSteps(cfg, provider) {
  let g = null;
  try { g = typeof provider.providerInfo === "function" ? provider.providerInfo() : null; } catch { g = null; }
  const gem = g || {};
  const gLabel = gem.label || "Gemini";
  const classify = { step: "classify", provider: "rules", label: `Rules first, then ${gLabel}`, model: gem.classifyModel || "" };
  const verify = { step: "verify", provider: "gemini", label: gLabel, model: gem.verifyModel || "" };
  const escalate = { step: "escalate", provider: "gemini", label: gLabel, model: gem.escalateModel || "" };
  const geminiDraft = { step: "draft", provider: "gemini", label: gLabel, model: gem.draftModel || "" };
  if (primaryOf(cfg) === "gemini") return { primary: "gemini", label: PROVIDER_LABELS.gemini, steps: [classify, geminiDraft, verify, escalate] };
  const m = compareModels("hybrid", cfg);
  return {
    primary: "hybrid",
    label: PROVIDER_LABELS.hybrid,
    steps: [classify, { step: "draft", provider: "openai", label: "GPT (OpenAI)", model: m.draft, fallback: { provider: "gemini", label: gLabel, model: gem.draftModel || "" } }, verify, escalate],
  };
}

async function configOut(store) {
  const aiStore = await aiStoreFor(store);
  const [cfg, personas, provider] = await Promise.all([aiStore.getConfig(), getPersonas(), getProvider()]);
  const day = istDay();
  const usage = await aiStore.getUsage(day);
  const kbInfo = await kbSummary(aiStore);
  const allow = loadAllowList();
  // Both compare sides (names / models only), so Settings can show what GPT would use before compare mode is on.
  const sides = await getCompareProviders(provider, cfg.providers);
  const gem = providerSummary(provider);
  const compareProviders = (cfg.providers || []).filter(id => sides[id]).map(id => {
    if (id === "gemini") return { side: id, label: PROVIDER_LABELS[id], ...providerSummary(sides[id]) };
    const s = providerSummary(sides[id], compareModels(id, cfg, sides[id]));
    // Hybrid checks with Gemini: blank env = the Gemini provider's role default.
    if (id === "hybrid") Object.assign(s, { verifyModel: s.verifyModel || gem.verifyModel || "", escalateModel: s.escalateModel || gem.escalateModel || "" });
    return { side: id, label: PROVIDER_LABELS[id] || id, ...s };
  });
  const hybridSide = compareProviders.find(s => s.side === "hybrid") || {};
  let gptConfigured;
  if (typeof hybridSide.gptConfigured === "boolean") gptConfigured = hybridSide.gptConfigured;
  else if (sides.hybrid && typeof sides.hybrid.gptConfigured === "function") {
    try { gptConfigured = Boolean(sides.hybrid.gptConfigured()); } catch { gptConfigured = undefined; }
  }
  return {
    config: cfg,
    streams: personas.streams.map(s => ({ id: s.id, label: s.label })),
    personaSource: personas.source,
    provider: providerSummary(provider),
    pipeline: pipelineSteps(cfg, provider),
    ...(typeof gptConfigured === "boolean" ? {
      gptConfigured,
      gpt: gptConfigured
        ? { configured: true }
        : { configured: false, hint: "GPT not configured on this deploy. Set OPENAI_API_KEY on the Vercel production environment, then redeploy." },
    } : {}),
    compareProviders,
    kb: kbInfo,
    allowList: { loaded: allow.loaded, domains: allow.entries.length },
    today: { day, ...usage },
    backend: aiStore.backend,
  };
}

/**
 * Staff "try a question": drafts + verifies one question in memory and returns the result. Writes
 * no question, job or draft (spend still counts toward the daily cap). Works with AI off so
 * officials can judge drafts before enabling a stream.
 */
export async function dryRunDraft(store, input) {
  const aiStore = await aiStoreFor(store);
  const cfg = normalizeConfig(await aiStore.getConfig());
  const day = istDay();
  const spent = await aiStore.getUsage(day);
  if ((spent.costUSD || 0) >= cfg.dailySpendCapUSD) return { ok: false, error: "Daily AI spend cap reached." };
  const rec = {
    id: `dryrun-${Date.now()}`,
    question: str(input && input.question, 1200),
    context: str(input && input.context, 1200),
    theme: str(input && input.theme, 120),
    subtheme: str(input && input.subtheme, 120),
    stage: str(input && input.stage, 60),
  };
  if (!rec.question) return { ok: false, error: "Type a question to try." };
  const [provider, personas] = await Promise.all([getProvider(), getPersonas()]);
  const started = Date.now();
  let out;
  try {
    out = await triagedDraft({ target: { type: "question", id: rec.id, rec }, aiStore, provider, personas, cfg });
  } catch (err) {
    if (err && err.usage && err.usage.costUSD) await aiStore.addUsage(day, err.usage);
    const msg = String(err && err.message || err).split("\n")[0].replace(/^\w+ \d{3}: /, "").slice(0, 240);
    return { ok: false, code: String(err && err.code || "provider_error"), error: `The AI provider failed: ${msg}`, latencyMs: Date.now() - started };
  }
  if (out.usage && out.usage.costUSD) await aiStore.addUsage(day, out.usage);
  const a = out.aiDraft || {};
  return {
    ok: true,
    latencyMs: Date.now() - started,
    stream: out.meta && out.meta.stream,
    redactedQuestion: out.meta && out.meta.redacted && out.meta.redacted.question,
    retrieval: out.meta && out.meta.retrieval && { method: out.meta.retrieval.method, chunks: out.meta.retrieval.chunkIds.length },
    draft: {
      status: a.status, blockedReason: a.blockedReason || "", blockedNote: a.blockedNote || "",
      persona: a.persona, risk: a.risk || "", confidence: a.confidence ?? null,
      answer: a.answer || "", actions: a.actions || [], mistake: a.mistake || "", resources: a.resources || [],
      citations: a.citations || [], claimChecks: a.claimChecks || [], verifyFlags: a.verifyFlags || [],
      model: a.model || "", verifyModel: a.verifyModel || "",
      triage: a.triage || null, scripted: a.scripted || null,
    },
    ...(out.aiDrafts ? { drafts: out.aiDrafts } : {}),
    usage: out.usage,
  };
}

/**
 * @param {string} op
 * @param {object} msg
 * @param {object} store
 * @param {object} ctx  `{ send(code, body), clustersMeta, persistClusters, ClustersVersionConflictError,
 *   sendClustersConflict(version), notifyAnswerOnce, notifyNewlyPublishedClusters, kickWorker, runWorker }`
 */
export async function handleAiOp(op, msg, store, ctx) {
  const aiStore = await aiStoreFor(store);
  switch (op) {
    case "aiQueue": {
      ctx.send(200, { ok: true, ...(await listQueue(store, msg, ctx.kickWorker)) });
      return;
    }
    case "aiIndex": {
      const [drafts, jobs, cfg] = await Promise.all([aiStore.listDrafts(), aiStore.listJobs(), aiStore.getConfig()]);
      const index = {};
      for (const d of drafts) {
        const s = d.aiDraft && d.aiDraft.status;
        if (!s) continue;
        if (s === "pending" && d.shadow && msg.shadow !== true) continue;
        // A finished pending/blocked/to-mentor letter is never "waiting for AI", even if an old
        // overflow flag was left on the record — Retry AI after recharge clears this via putDraft.
        const waiting = s === AWAITING_AI || s === "quotaDeferred" || s === "aiPending" || (isOverflowDraft(d) && !String(d.aiDraft.answer || "").trim() && s !== "pending" && s !== "blocked" && s !== "to-mentor");
        index[d.id] = {
          status: waiting ? AWAITING_AI : s,
          risk: d.aiDraft.risk || "",
          shadow: Boolean(d.shadow),
          ...(waiting ? { overflow: true, overflowReason: d.overflowReason || "" } : {}),
          ...(isMentorAssist(d.aiDraft) ? { mode: MENTOR_ASSIST_MODE } : {}),
        };
      }
      const draftIds = new Set(drafts.map(d => d.id));
      for (const j of jobs) {
        const did = draftIdFor(j.type, j.targetId);
        if (draftIds.has(did) && index[did]) {
          // Only promote a real letter back to awaiting when the draft itself is still an empty overflow.
          if (isQuotaDeferredJob(j) && (index[did].status === AWAITING_AI || index[did].overflow)) {
            index[did] = { ...index[did], status: AWAITING_AI, overflow: true, deferReason: j.deferReason || deferReasonFromError({ message: j.error }) };
          }
          continue;
        }
        if (j.status !== "queued" && j.status !== "running" && j.status !== "failed") continue;
        index[did] = {
          status: AWAITING_AI,
          overflow: true,
          pending: true,
          deferReason: j.deferReason || "",
        };
      }
      ctx.send(200, { ok: true, enabled: cfg.enabled, index });
      return;
    }
    case "aiApprove": return review(store, msg, ctx, "approve");
    case "aiEditApprove": return review(store, msg, ctx, "edit");
    case "aiReject": return setStatus(store, msg, ctx, "rejected");
    case "aiSendToMentor": return setStatus(store, msg, ctx, "to-mentor");
    case "aiRegenerate": return regenerate(store, msg, ctx);
    case "aiConfigGet": {
      ctx.send(200, { ok: true, ...(await configOut(store)) });
      return;
    }
    case "aiConfigSet": {
      const prev = await aiStore.getConfig();
      const patch = { ...(msg.patch || {}) };
      // Raising (or lowering) the cap re-evaluates it on the next run; a stale "cap reached" banner would mislead.
      if ("dailySpendCapUSD" in patch && prev.alert && prev.alert.type === "spend-cap") patch.clearAlert = true;
      const next = patchConfig(prev, patch, str(msg.reviewer, 80) || "staff");
      await aiStore.setConfig(next);
      invalidateConfigCache();
      let promoted = 0;
      // Leaving shadow mode: drafts written while in shadow go to the review queue (their jobs are done and would never redraft).
      if (prev.shadowMode !== false && next.shadowMode === false) {
        for (const d of await aiStore.listDrafts()) {
          if (!d.shadow || (d.aiDraft && d.aiDraft.status) !== "pending") continue;
          await aiStore.putDraft({ ...d, shadow: false, unshadowedAt: Date.now() });
          promoted++;
        }
      }
      ctx.send(200, { ok: true, promoted, ...(await configOut(store)) });
      return;
    }
    case "aiStats": {
      const [drafts, jobs, usage, cfg] = await Promise.all([aiStore.listDrafts(), aiStore.listJobs(), aiStore.listUsage(), aiStore.getConfig()]);
      const c = normalizeConfig(cfg);
      ctx.send(200, { ok: true, stats: computeStats({ drafts, jobs, usage, cfg: c, today: istDay() }), compare: computeCompareStats(drafts, c.providers) });
      return;
    }
    case "aiCompareStats": {
      const [drafts, cfg] = await Promise.all([aiStore.listDrafts(), aiStore.getConfig()]);
      const day = istDay();
      ctx.send(200, { ok: true, compareMode: cfg.compareMode, compare: computeCompareStats(drafts, cfg.providers), today: { day, ...(await aiStore.getUsage(day)) } });
      return;
    }
    case "aiCompareBackfill": {
      const r = await compareBackfill(store, { dryRun: msg.dryRun === true, limit: msg.limit });
      if (!r.ok) { ctx.send(409, r); return; }
      if (!r.dryRun && r.enqueued) ctx.kickWorker();
      ctx.send(200, r);
      return;
    }
    case "aiRunNow": {
      // Staff asked explicitly (e.g. after topping up credits): jobs waiting out a backoff are due now.
      const now = Date.now();
      for (const j of await aiStore.listJobs({ status: "queued" })) {
        if ((j.nextAt || 0) > now && j.error) await aiStore.putJob({ ...j, nextAt: now, updatedAt: now });
      }
      if (msg.wait === true && typeof ctx.runWorker === "function") {
        // Same 45 s budget as the cron worker (api/aym-store maxDuration 60): a provider call needs ≥ 30 s left to start.
        const report = await ctx.runWorker({ forceSweep: msg.sweep === true });
        ctx.send(200, { ok: true, report });
        return;
      }
      ctx.kickWorker({ sweep: msg.sweep === true });
      ctx.send(200, { ok: true, kicked: true });
      return;
    }
    case "aiProviderTest": {
      const side = str(msg.provider, 20).toLowerCase();
      if (side && !APPROVE_SIDES.has(side)) { ctx.send(400, { error: "Unknown provider." }); return; }
      ctx.send(200, { ok: true, test: await providerTest(aiStore, side) });
      return;
    }
    case "aiBackfill": {
      const r = await backfillDrafts(store, {
        dryRun: msg.dryRun === true,
        allStreams: msg.allStreams === true,
        limit: msg.limit,
        redraftInsufficient: msg.redraftInsufficient === true,
        redraftScripted: msg.redraftScripted === true,
      });
      if (!r.ok) { ctx.send(409, r); return; }
      if (!r.dryRun && r.enqueued) ctx.kickWorker();
      ctx.send(200, r);
      return;
    }
    case "aiRetryFailed":
    case "aiRetryDeferred": {
      const now = Date.now();
      const jobs = await aiStore.listJobs();
      const wanted = op === "aiRetryFailed" ? "" : str(msg.id, 200);
      const picked = jobs.filter(j => {
        if (wanted && j.id !== wanted && draftIdFor(j.type, j.targetId) !== wanted) return false;
        return j.status === "failed" || isQuotaDeferredJob(j) || (j.status === "queued" && j.error);
      });
      for (const j of picked) {
        await aiStore.putJob({ ...j, status: "queued", attempts: 0, nextAt: now, lockedUntil: 0, error: "", deferClass: "", deferReason: "", updatedAt: now });
      }
      const cfg = await aiStore.getConfig();
      if (cfg.alert && cfg.alert.type === "provider") {
        const { alert, ...rest } = cfg;
        await aiStore.setConfig(rest);
        invalidateConfigCache();
      }
      ctx.kickWorker();
      ctx.send(200, { ok: true, requeued: picked.length });
      return;
    }
    default:
      if (TRIAGE_OPS.has(op)) return handleTriageOp(op, msg, store, ctx, handleAiOp);
      ctx.send(400, { error: "unknown op" });
  }
}

export const AI_OPS = new Set(["aiQueue", "aiIndex", "aiApprove", "aiEditApprove", "aiReject", "aiSendToMentor", "aiRegenerate", "aiConfigGet", "aiConfigSet", "aiStats", "aiCompareStats", "aiRunNow", "aiRetryFailed", "aiRetryDeferred", "aiProviderTest", "aiBackfill", "aiCompareBackfill", ...TRIAGE_OPS]);

export { jobIdFor };
