/**
 * Overflow drafts: when Gemini/GPT hit quota, billing, 429 or timeout the question stays saved
 * and a placeholder draft (`aiDraft.status: awaiting_ai`) appears on DISHA drafts + Insight.
 * Staff retry after recharge. Nothing here publishes an answer.
 */

import { K_Q, K_CLUSTERS } from "../store.js";
import { clusterAnswerText } from "../../shared/merge.js";
import { aiStoreFor } from "./aiStore.js";
import { redactQuestion } from "./redact.js";
import { displayAskerEmail, displayAskerName } from "../../shared/account.js";

export const AWAITING_AI = "awaiting_ai";
export const OVERFLOW_NOTE = "Waiting for AI / quota — retry after recharge.";

const REVIEWED = new Set(["approved", "edited"]);
const draftIdFor = (type, id) => `${type === "cluster" ? "c" : "q"}:${id}`;
const QUOTA_CODES = new Set(["quota", "credits_depleted", "billing_disabled", "quota_exceeded", "key_blocked", "api_disabled", "unauthenticated", "permission_denied", "unconfigured"]);

/** True only while the desk is still waiting on AI — not after a real pending/blocked letter lands. */
export function isOverflowDraft(d) {
  if (!d) return false;
  const s = (d.aiDraft || {}).status;
  if (s === AWAITING_AI || s === "quotaDeferred" || s === "aiPending") return true;
  if (s === "pending" || s === "blocked" || s === "to-mentor" || REVIEWED.has(s)) return false;
  return Boolean(d.overflow);
}

export function isOverflowItem(item) {
  if (!item) return false;
  const s = (item.aiDraft || {}).status;
  if (s === AWAITING_AI || s === "quotaDeferred" || s === "aiPending") return true;
  if (item.pendingDraft && !String((item.aiDraft || {}).answer || "").trim()) return true;
  if (s === "pending" || s === "blocked" || s === "to-mentor" || REVIEWED.has(s)) return false;
  return Boolean(item.overflow || item.quotaDeferred);
}

/** 429 / quota / billing pause the whole queue; timeout stays per-job. */
export function overflowReasonFromError(err) {
  if (!err) return "awaiting_ai";
  const code = String(err.code || err.reason || "");
  const status = Number(err.status || 0);
  const msg = String(err.message || "");
  if (QUOTA_CODES.has(code) || status === 429 || /quota|insufficient_quota|RESOURCE_EXHAUSTED|credits? (are )?deplet|billing/i.test(code + " " + msg)) {
    return "quota_exceeded";
  }
  if (code === "timeout" || /timeout/i.test(msg)) return "timeout";
  if (QUOTA_CODES.has(code)) return "quota_exceeded";
  return "awaiting_ai";
}

export function overflowNote(reason) {
  if (reason === "timeout") return "AI timed out. The question is saved — retry after recharge, or write the answer yourself.";
  if (reason === "quota_exceeded") return OVERFLOW_NOTE;
  return OVERFLOW_NOTE;
}

function emptyDraft(reason, error, now) {
  return {
    status: AWAITING_AI,
    answer: "",
    actions: [],
    mistake: "",
    resources: [],
    citations: [],
    claimChecks: [],
    risk: "high",
    confidence: 0,
    blockedReason: reason || "quota_exceeded",
    blockedNote: overflowNote(reason),
    overflowError: String(error || "").replace(/^\w+ \d{3}: /, "").slice(0, 220),
    createdAt: now,
  };
}

async function loadOverflowTarget(store, job) {
  if (job.type === "cluster") {
    const clusters = (await store.get(K_CLUSTERS)) || [];
    const cluster = (Array.isArray(clusters) ? clusters : []).find(c => String(c.id) === String(job.targetId));
    if (!cluster) return null;
    const members = [];
    for (const mid of cluster.memberIds || []) {
      const rec = await store.get(K_Q + mid);
      if (rec) members.push(rec);
    }
    const head = members[0] || {};
    const text = cluster.composite || cluster.representative || head.question || "";
    return {
      targetType: "cluster",
      targetId: String(cluster.id),
      ticket: "",
      theme: cluster.theme || head.theme || "",
      subtheme: cluster.subtheme || head.subtheme || "",
      question: text,
      context: "",
      members: (members.map(m => redactQuestion(m).question).filter(Boolean)).slice(0, 8),
      memberIds: (cluster.memberIds || []).map(String),
      memberCount: (cluster.memberIds || []).length,
      rec: head,
    };
  }
  const rec = await store.get(K_Q + job.targetId);
  if (!rec) return null;
  const redacted = redactQuestion(rec);
  return {
    targetType: "question",
    targetId: String(rec.id),
    ticket: String(rec.ticket || ""),
    theme: rec.theme || "",
    subtheme: rec.subtheme || "",
    question: redacted.question || rec.question || "",
    context: redacted.context || "",
    members: [],
    memberIds: [String(rec.id)],
    memberCount: 1,
    rec,
  };
}

/**
 * Write (or refresh) an awaiting_ai placeholder. Never overwrites an approved draft, a medical
 * block, or a real pending letter. Returns the record or null if the target is gone / already answered.
 */
export async function putOverflowDraft(store, job, { reason, error, now = Date.now() } = {}) {
  if (!job || !job.targetId) return null;
  const aiStore = await aiStoreFor(store);
  const did = draftIdFor(job.type || "question", job.targetId);
  const prev = await aiStore.getDraft(did);
  const a = prev && prev.aiDraft;
  if (a && REVIEWED.has(a.status)) return prev;
  if (a && a.status === "blocked" && a.blockedReason === "medical") return prev;
  if (a && a.status === "pending" && String(a.answer || "").trim()) return prev;
  if (a && a.status === "to-mentor") return prev;

  const loaded = await loadOverflowTarget(store, job);
  if (!loaded) return null;
  if (loaded.targetType === "question" && String(loaded.rec.individualAnswer || loaded.rec.answer || "").trim()) return prev;
  if (loaded.targetType === "cluster") {
    const clusters = (await store.get(K_CLUSTERS)) || [];
    const cluster = (Array.isArray(clusters) ? clusters : []).find(c => String(c.id) === String(job.targetId));
    if (cluster && clusterAnswerText(cluster)) return prev;
  }

  const why = reason || overflowReasonFromError({ code: "", message: error });
  const rec = {
    id: did,
    targetType: loaded.targetType,
    targetId: loaded.targetId,
    ticket: loaded.ticket,
    theme: loaded.theme,
    subtheme: loaded.subtheme,
    stream: job.stream || (prev && prev.stream) || "",
    intentKey: (prev && prev.intentKey) || "",
    question: loaded.question,
    context: loaded.context,
    members: loaded.members,
    memberIds: loaded.memberIds,
    memberHash: (prev && prev.memberHash) || "",
    memberCount: loaded.memberCount,
    overflow: true,
    overflowReason: why,
    asker: loaded.rec ? {
      name: displayAskerName(loaded.rec).slice(0, 80),
      email: displayAskerEmail(loaded.rec).slice(0, 120),
      wacId: String(loaded.rec.wacId || "").trim().slice(0, 40),
      ...(loaded.rec.wacShareConsent && loaded.rec.wac && typeof loaded.rec.wac === "object" ? {
        org: {
          institution: String(loaded.rec.wac.institution || "").trim().slice(0, 120),
          category: String(loaded.rec.wac.category || "").trim().slice(0, 60),
          country: String(loaded.rec.wac.country || "").trim().slice(0, 60),
          state: String(loaded.rec.wac.state || "").trim().slice(0, 60),
        },
      } : {}),
    } : undefined,
    shadow: false,
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
    aiDraft: emptyDraft(why, error, now),
    meta: (prev && prev.meta) || {},
    history: (prev && prev.history) || [],
  };
  await aiStore.putDraft(rec);
  return rec;
}

/** Build a desk item from a job that has no draft yet (listQueue fallback). */
export function overflowItemFromJob(job, rec, extra = {}) {
  const now = job.updatedAt || job.createdAt || Date.now();
  const why = overflowReasonFromError({ message: job.error || "", code: "" });
  const redacted = rec ? redactQuestion(rec) : { question: "", context: "" };
  return {
    id: draftIdFor(job.type || "question", job.targetId),
    targetType: job.type === "cluster" ? "cluster" : "question",
    targetId: job.targetId,
    ticket: (rec && rec.ticket) || "",
    theme: (rec && rec.theme) || "",
    subtheme: (rec && rec.subtheme) || "",
    stream: job.stream || "",
    question: redacted.question || (rec && rec.question) || "",
    context: redacted.context || "",
    members: [],
    memberCount: 1,
    overflow: true,
    overflowReason: why,
    shadow: false,
    createdAt: job.createdAt || now,
    updatedAt: now,
    aiDraft: emptyDraft(why, job.error, now),
    meta: {},
    history: [],
    job: extra.job || null,
    ...extra,
  };
}
