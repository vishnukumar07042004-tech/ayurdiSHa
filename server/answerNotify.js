import { loadServerEnv } from "./env.js";
import { sendAnswerNotification } from "./mailer.js";
import { sendOrQueue } from "./mailQueue.js";
import { findUserByRegNo, isDemoDelegate } from "./register.js";

const K_Q = "aym:q:";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_SITE = "https://ayushmarg.vercel.app";
const SEND_TIMEOUT_MS = 8000;
/** Keeps one publish inside the 30s function budget and Resend's per-second limit. */
const CLUSTER_NOTIFY_MAX = 20;
const CLUSTER_GAP_MS = 550;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function siteUrl() {
  const env = loadServerEnv();
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || "").trim();
  return (/^https?:\/\//i.test(raw) ? raw : DEFAULT_SITE).replace(/\/+$/, "");
}

export function trackLink(ticket) {
  const t = String(ticket || "").trim();
  return `${siteUrl()}/${t ? `?ticket=${encodeURIComponent(t)}` : ""}#track`;
}

function errText(err) {
  return err && err.message ? err.message : String(err);
}

/** Email stored on the question first, then the registered delegate behind its WAC number. */
export async function resolveRecipient(store, q) {
  if (isDemoDelegate(q || {})) return null;
  const email = String(q && q.email || "").trim();
  if (EMAIL_RE.test(email)) return { email, name: String(q.name || "").trim() };
  const regNo = String(q && (q.regNo || q.delegateNo) || "").trim();
  if (!regNo) return null;
  try {
    const user = await findUserByRegNo(store, regNo);
    const userEmail = String(user && user.email || "").trim();
    if (EMAIL_RE.test(userEmail)) {
      return { email: userEmail, name: String(q.name || user.name || "").trim() };
    }
  } catch (err) {
    console.error("[aym-notify] regNo lookup failed:", errText(err));
  }
  return null;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`mail send timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Sends at most one answer email per question. `answerNotifiedAt` is written only after
 * real delivery, so dev console runs and failed sends leave the question eligible.
 * Never throws — the answer is already saved by the time this runs.
 */
export async function notifyAnswerOnce(store, q, { answer } = {}) {
  try {
    if (!q || !q.id || q.answerNotifiedAt) return null;
    const answerText = String(answer || "").trim();
    if (!answerText) return null;
    const to = await resolveRecipient(store, q);
    const label = q.ticket || q.id;
    if (!to) {
      console.log(`[aym-notify] no email on file for ${label}; answer notice skipped`);
      return null;
    }
    const r = await withTimeout(sendOrQueue(store, {
      send: () => sendAnswerNotification({
        to: to.email,
        name: to.name,
        ticket: q.ticket || "",
        link: trackLink(q.ticket),
      }),
      template: "answer-notice",
      to: to.email,
      payload: { name: to.name, ticket: q.ticket || "", link: trackLink(q.ticket) },
    }), SEND_TIMEOUT_MS);
    if (!r || (r.delivery !== "email" && r.delivery !== "queued")) return null;
    const next = { ...q, answerNotifiedAt: Date.now(), ...(r.delivery === "queued" ? { answerNotifyQueuedAt: Date.now() } : {}) };
    await store.set(K_Q + q.id, next);
    console.log(`[aym-notify] answer notice ${r.delivery === "queued" ? "queued" : "sent"} for ${label}`);
    return next;
  } catch (err) {
    console.error(`[aym-notify] answer notice failed for ${q && (q.ticket || q.id)}:`, errText(err));
    return null;
  }
}

function clusterAnswerText(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim();
}

function isPublishedWithAnswer(c) {
  return Boolean(c && c.status === "Published" && clusterAnswerText(c));
}

async function findMemberQuestion(store, memberId) {
  const mid = String(memberId || "").trim();
  if (!mid) return null;
  const byId = await store.get(K_Q + mid);
  if (byId && byId.id) return byId;
  if (typeof store.lookup !== "function") return null;
  const hits = await store.lookup(mid.toLowerCase());
  return (hits || []).find(s => String(s.ticket || "").trim().toLowerCase() === mid.toLowerCase()) || null;
}

/**
 * Merged-group answers autosave while staff type, so members are only notified when a
 * group first becomes Published with answer text.
 */
export async function notifyNewlyPublishedClusters(store, prevClusters, nextClusters) {
  try {
    const prevById = new Map((Array.isArray(prevClusters) ? prevClusters : [])
      .filter(c => c && c.id != null)
      .map(c => [String(c.id), c]));
    // Newly published groups notify everyone; already-published groups notify only students
    // who just joined them (e.g. a manual merge into an answered group).
    const fresh = [];
    (Array.isArray(nextClusters) ? nextClusters : []).forEach(c => {
      if (!isPublishedWithAnswer(c)) return;
      const before = prevById.get(String(c.id));
      const members = Array.isArray(c.memberIds) ? c.memberIds : [];
      if (!isPublishedWithAnswer(before)) { fresh.push({ c, members }); return; }
      const had = new Set((before.memberIds || []).map(String));
      const joined = members.filter(m => !had.has(String(m)));
      if (joined.length) fresh.push({ c, members: joined });
    });
    if (!fresh.length) return;

    let budget = CLUSTER_NOTIFY_MAX;
    for (const { c, members } of fresh) {
      for (const mid of members) {
        const q = await findMemberQuestion(store, mid);
        if (!q || q.answerNotifiedAt) continue;
        if (budget <= 0) {
          console.warn(`[aym-notify] publish notice cap (${CLUSTER_NOTIFY_MAX}) reached; remaining members of ${c.id} not emailed`);
          return;
        }
        budget -= 1;
        const sent = await notifyAnswerOnce(store, q, { answer: clusterAnswerText(c) });
        if (sent) await sleep(CLUSTER_GAP_MS);
      }
    }
  } catch (err) {
    console.error("[aym-notify] cluster publish notices failed:", errText(err));
  }
}
