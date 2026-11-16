import crypto from "node:crypto";
import { ENV_FILES, parseEnvFile } from "./env.js";
import {
  resolveStaff, staffRefusal, staffStart, staffVerify, staffMe, staffLogout, staffRequests, staffDecide,
  staffAuditList, staffRetentionSet, getRetention, runRetentionCleanup, probeStaffRequest, probeStaffPurge,
  staffSessionsList, staffSessionRevoke, clearStaffCookie,
  audit, loadPasscode, passcodeConfigured, ADMIN_ONLY_OPS, K_STAFF,
} from "./staffAuth.js";
import { isProbeQuestion } from "../shared/probe.js";
import { createAymStore, K_Q, K_CLUSTERS, K_CONFIG, K_WAC_RESULTS, K_PODCASTS, ClustersVersionConflictError, WacVersionConflictError } from "./store.js";
import {
  regStart, regResend, regVerify, regMe, regSaveWac, regRecover, regUsers, K_USER, K_EMAIL, K_REGNO, isDemoDelegate,
  upsertDelegateIntoDb, backfillDelegatesFromQuestions, delegateCardsFromDb,
  validRegNo, publicProfile, wacOwnedByOtherEmail, ensureSessionIssuedRegNo, regnoIndexKey,
} from "./register.js";
import { appendCookie, readSessTicket, makeSessTicket, setSessCookie } from "./otpTicket.js";
import { sendSelectionEmail, sendAskReceivedEmail } from "./mailer.js";
import { notifyAnswerOnce, notifyNewlyPublishedClusters, trackLink } from "./answerNotify.js";
import { knowledgeChatHandler } from "./knowledgeChat.js";
import { publicStats } from "./publicStats.js";
import { recordVisitSource, readVisitSources, visitRateOk } from "./visitSources.js";
import { sanitizeSource } from "../shared/source.js";
import { normalizeAskRecord, askRecordProblem, offListAskFields } from "../shared/askOptions.js";
import { detectAskSafetyFlags } from "../shared/askSafety.js";
import { resolveTrackSelection } from "../shared/tracks.js";
import { KEY_DATES, isIntakeOpen } from "../shared/productConfig.js";
import { makeWindowLimiter, clientIp } from "./otpLimits.js";
import { probeSessionStart, probeRegister, probePurge } from "./testProbe.js";

/** File-store / QA harness submits many questions from one identity — keep limits loose there. */
const askLimitsRelaxed = process.env.AYM_STORE === "file" || process.env.AYM_ASK_RATE_RELAXED === "1";
/** Public Ask Desk submit: per-IP throttle (venue Wi-Fi shares one address — keep generous). */
const askIpLimiter = makeWindowLimiter({ windowMs: 10 * 60 * 1000, max: askLimitsRelaxed ? 500 : 40 });
/** Per signed-in pass / email key: tighter anti double-spam. */
const askUserLimiter = makeWindowLimiter({ windowMs: 10 * 60 * 1000, max: askLimitsRelaxed ? 200 : 8 });
import { WAC_OPS, handleWacOp } from "./wacSignIn.js";
import { accountGet, accountWacShare } from "./account.js";
import { FACULTY_OPS, handleFacultyOp } from "./ai/facultyOps.js";
import { bestEffort } from "./passIssuer.js";
import { normalizeLookupQuery } from "../shared/ticket.js";
import { mergeClusterGroup, sanitizeClusters, MergeConflictError } from "../shared/merge.js";
import { AI_OPS, handleAiOp, onQuestionSaved, annotateLookupHits, dryRunDraft } from "./ai/ops.js";
import { runWorker, WORKER_BUDGET_MS } from "./ai/queue.js";
import { mailHealth, retryMail, runMailQueue, tickMailQueue, sendOrQueue } from "./mailQueue.js";
import { aiStoreFor } from "./ai/aiStore.js";
import { STAFF_DATA_OPS, handleStaffDataOp, invalidateStaffData } from "./staffData.js";

const AI_KICK_HEADER = "x-aym-ai-kick";
const AI_UNAUTH_MIN_GAP_MS = 60000;
const SUBMIT_KICK_GAP_MS = 15000;
/** Kick-triggered worker runs across all instances: at most one start per this window. */
const AI_KICK_MIN_GAP_MS = 10000;
const PUBLIC_CLUSTERS_TTL_MS = 10000;
const PUBLIC_STATS_CACHE = "public, max-age=15, s-maxage=30, stale-while-revalidate=120";
const PUBLIC_CLUSTERS_CACHE = "public, max-age=15, s-maxage=20, stale-while-revalidate=60";
const PUBLIC_PODCASTS_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=300";
/** Every other API answer may carry a session cookie or personal / staff data. */
const PRIVATE_CACHE = "private, no-store";
const PUBLIC_GET_OPS = new Set(["publicStats", "publicClusters", "podcastsList"]);
/** Track lookups read the full groups doc; a crowd shares one read per instance per window. */
const LOOKUP_CLUSTERS_TTL_MS = 5000;
const SLOW_OP_MS = 1500;
/** The serverless response limit is 4.5 MB; the one-shot snapshot refuses well before it. */
const SNAPSHOT_MAX_BYTES = 4_000_000;
let lastSubmitKickAt = 0;
let publicClustersCache = null;
let lookupClustersCache = null;

function dropClusterCaches() {
  publicClustersCache = null;
  lookupClustersCache = null;
}

async function publicClustersValue(store) {
  const now = Date.now();
  if (!publicClustersCache || now - publicClustersCache.at > PUBLIC_CLUSTERS_TTL_MS) {
    publicClustersCache = { at: now, value: publishedClusters((await store.get(K_CLUSTERS)) || []) };
  }
  return publicClustersCache.value;
}

async function lookupClustersValue(store) {
  const now = Date.now();
  if (!lookupClustersCache || now - lookupClustersCache.at > LOOKUP_CLUSTERS_TTL_MS) {
    const v = (await store.get(K_CLUSTERS)) || [];
    lookupClustersCache = { at: now, value: Array.isArray(v) ? v : [] };
  }
  return lookupClustersCache.value;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

/** Demo seed / wipe: local dev only, or when AYM_DEMO_OPS=1 is set on a non-production deploy. */
function demoOpsAllowed(env = process.env) {
  if (String(env.VERCEL_ENV || "").toLowerCase() === "production") return false;
  if (String(env.AYM_DEMO_OPS || "").trim() === "1") return true;
  return !env.VERCEL && String(env.NODE_ENV || "").toLowerCase() !== "production";
}

/** Server-to-server token for the post-submit worker kick (never sent to a browser). */
function aiKickToken() {
  const pin = loadPasscode();
  if (!pin) return "";
  return crypto.createHmac("sha256", sha256(pin)).update("aym-ai-kick").digest("hex").slice(0, 40);
}

function cronSecret() {
  for (const p of ENV_FILES) {
    const v = (parseEnvFile(p).CRON_SECRET || "").trim();
    if (v) return v;
  }
  return String(process.env.CRON_SECRET || "").trim();
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Fire-and-forget POST to /api/ai-worker. Awaits only long enough for the request to leave, so
 * the student's submit is never held up by drafting.
 */
function kickWorker(req, opts = {}) {
  if (process.env.AYM_AI_NO_KICK === "1") return;
  // A submit burst must not become a worker-invocation burst: one post-submit kick per instance
  // per window is enough (the worker drains everything queued).
  if (opts.afterSubmit) {
    const now = Date.now();
    if (now - lastSubmitKickAt < SUBMIT_KICK_GAP_MS) return;
    lastSubmitKickAt = now;
  }
  const token = aiKickToken();
  const host = req && (req.headers["x-forwarded-host"] || req.headers.host);
  if (!token || !host) return;
  const proto = process.env.VERCEL ? "https" : (req.headers["x-forwarded-proto"] || "http");
  const url = `${proto}://${host}/api/ai-worker`;
  const ctrl = new AbortController();
  const p = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [AI_KICK_HEADER]: token },
    body: JSON.stringify({ sweep: opts.sweep === true }),
    signal: ctrl.signal,
  }).catch(() => {});
  setTimeout(() => ctrl.abort(), 1500).unref?.();
  return p;
}

function aiCtx(req, res, store) {
  return {
    send: (code, body) => send(res, code, body),
    clustersMeta,
    persistClusters,
    ClustersVersionConflictError,
    sendClustersConflict: v => sendClustersConflict(res, v),
    notifyAnswerOnce,
    notifyNewlyPublishedClusters,
    kickWorker: opts => { kickWorker(req, opts); },
    runWorker: opts => runWorker(store, opts),
  };
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  if (code >= 300 || !res.getHeader("Cache-Control")) res.setHeader("Cache-Control", PRIVATE_CACHE);
  res.end(JSON.stringify(body));
}

function applyCookies(res, cookies) {
  if (!cookies || !cookies.length) return;
  for (const c of cookies) {
    if (typeof res.appendHeader === "function") res.appendHeader("Set-Cookie", c);
    else {
      const prev = res.getHeader("Set-Cookie");
      if (!prev) res.setHeader("Set-Cookie", c);
      else res.setHeader("Set-Cookie", [].concat(prev, c));
    }
  }
}

function publishedClusters(clusters) {
  return (Array.isArray(clusters) ? clusters : [])
    .filter(c => c.status === "Published" && c.answer)
    .map(c => ({
      id: c.id, theme: c.theme, subtheme: c.subtheme, status: c.status,
      composite: c.composite, representative: c.representative,
      answer: c.answer, actions: c.actions, mistake: c.mistake,
      resources: c.resources, mentorName: c.mentorName,
      memberIds: c.memberIds || [],
      aiAssisted: Boolean(c.aiAssisted),
    }));
}

function clusterOwnsQuestion(c, s) {
  const ids = (c.memberIds || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!ids.length || !s) return false;
  const id = String(s.id || "").trim();
  const ticket = String(s.ticket || "").trim();
  return (id && ids.includes(id)) || (ticket && ids.includes(ticket));
}

function pickStoredAnswer(rec) {
  if (!rec || typeof rec !== "object") return "";
  return String(rec.individualAnswer || rec.answer || rec.mentorAnswer || rec.mergedAnswer || "").trim();
}

function clusterAnswerText(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim();
}

function clusterStatusFor(s, clusters) {
  const c = (clusters || []).find(x => clusterOwnsQuestion(x, s));
  if (!c) return null;
  const ready = Boolean(clusterAnswerText(c));
  return {
    id: c.id,
    memberIds: c.memberIds || [],
    status: c.status,
    kind: c.kind || ((c.memberIds || []).length >= 2 ? "merged" : "unique"),
    answer: ready ? clusterAnswerText(c) : "",
    composite: ready ? (c.composite || "") : "",
    representative: ready ? (c.representative || "") : "",
    actions: ready ? (c.actions || []) : [],
    mistake: ready ? (c.mistake || "") : "",
    resources: ready ? (c.resources || []) : [],
    mentorName: ready ? (c.mentorName || "") : "",
    aiAssisted: ready ? Boolean(c.aiAssisted) : false,
  };
}

function publicConfig() {
  return {
    hasPin: passcodeConfigured(),
    intakeOpen: isIntakeOpen(),
    keyDates: KEY_DATES,
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const WAC_MAIL_BATCH = 6;
const WAC_MAIL_GAP_MS = 400;
const WAC_MAX_ROWS = 2000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STORE_BODY_TIMEOUT_MS = 30000;
const STORE_BODY_MAX_BYTES = 4 * 1024 * 1024;

function normalizeWacRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const selectedRaw = r && r.selected;
    const selected = selectedRaw === false || /^(no|n|0|false)$/i.test(String(selectedRaw ?? "").trim())
      ? false
      : true;
    return {
      name: String(r && r.name || "").trim().slice(0, 120),
      email: String(r && r.email || "").trim().slice(0, 160),
      institute: String(r && r.institute || "").trim().slice(0, 180),
      regNo: String(r && r.regNo || "").trim().slice(0, 24),
      selected,
    };
  }).filter(r => r.name || r.email || r.regNo).slice(0, WAC_MAX_ROWS);
}

function wacPayload(data, staff) {
  const rec = data && typeof data === "object" ? data : {};
  const published = Boolean(rec.published);
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  if (!staff && !published) {
    return { published: false };
  }
  const selected = rows.filter(r => r && r.selected !== false);
  return {
    published,
    filename: rec.filename || "",
    updatedAt: rec.updatedAt || 0,
    publishedAt: rec.publishedAt || null,
    version: rec.version || 1,
    count: selected.length,
    total: rows.length,
    rows: staff || published ? rows : [],
    mail: staff ? (rec.mail || null) : undefined,
  };
}

const PODCAST_MAX = 50;

function httpUrl(s, max = 600) {
  const u = String(s || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  if (u.length > max) return "";
  return u;
}

function normalizeTalk(raw, i = 0) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 160);
  const videoUrl = httpUrl(raw.videoUrl);
  if (!title || !videoUrl) return null;
  const id = String(raw.id || `talk-${Date.now().toString(36)}-${i}`).replace(/[^\w.-]/g, "").slice(0, 80)
    || `talk-${Date.now().toString(36)}-${i}`;
  const thumbnail = httpUrl(raw.thumbnail) || "";
  return {
    id,
    title,
    mentorName: String(raw.mentorName || "").trim().slice(0, 120),
    description: String(raw.description || "").trim().slice(0, 800),
    videoUrl,
    ...(thumbnail ? { thumbnail } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

function normalizeTalks(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < (Array.isArray(list) ? list.length : 0); i++) {
    const talk = normalizeTalk(list[i], i);
    if (!talk || seen.has(talk.id)) continue;
    seen.add(talk.id);
    out.push(talk);
    if (out.length >= PODCAST_MAX) break;
  }
  return out;
}

function podcastPayload(rec) {
  const talks = normalizeTalks(rec && rec.talks);
  return { ok: true, talks, updatedAt: rec && rec.updatedAt ? rec.updatedAt : 0 };
}

async function persistPodcasts(store, writer) {
  const prev = (await store.get(K_PODCASTS)) || {};
  const rec = writer(prev && typeof prev === "object" ? prev : {}) || {};
  rec.talks = normalizeTalks(rec.talks);
  rec.updatedAt = Date.now();
  await store.set(K_PODCASTS, rec);
  return rec;
}

function backendInfo(store) {
  return {
    backend: store.name,
    firestore: store.name === "firestore",
    projectId: store.projectId || null,
  };
}

async function clustersMeta(store) {
  if (typeof store.getClustersMeta === "function") {
    return store.getClustersMeta();
  }
  const value = (await store.get(K_CLUSTERS)) || [];
  return { value: Array.isArray(value) ? value : [], version: 1, updatedAt: 0 };
}

async function persistClusters(store, clusters, expectedVersion) {
  dropClusterCaches();
  if (typeof store.saveClusters === "function") {
    return store.saveClusters(clusters, expectedVersion);
  }
  await store.set(K_CLUSTERS, clusters);
  return { clusters, version: (expectedVersion || 1) + 1, updatedAt: Date.now() };
}

function sendClustersConflict(res, currentVersion) {
  send(res, 409, {
    error: "The curation desk was updated by another staff member. Reload to see their changes before saving again.",
    conflict: true,
    clustersVersion: currentVersion,
  });
}

function sendWacConflict(res, currentVersion) {
  send(res, 409, {
    error: "The WAC selection list was updated by another staff member. Reload before saving again.",
    conflict: true,
    wacVersion: currentVersion,
  });
}

async function loadKvChunk(store, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 12) {
    const slice = keys.slice(i, i + 12);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => { if (vals[j] != null) out[k] = vals[j]; });
  }
  return out;
}

async function loadDelegateKv(store) {
  const prefixes = [K_USER, K_EMAIL, K_REGNO];
  if (typeof store.getPrefix === "function") {
    return Object.assign({}, ...(await Promise.all(prefixes.map(p => store.getPrefix(p)))));
  }
  const keys = (await Promise.all(prefixes.map(p => store.list(p)))).flat();
  return loadKvChunk(store, keys);
}

async function buildStaffSnapshot(store) {
  if (typeof store.listQuestions !== "function") return null;

  const [questions, meta, db] = await Promise.all([
    store.listQuestions(),
    clustersMeta(store),
    loadDelegateKv(store),
  ]);
  questions.forEach(q => {
    if (q && q.id) db[K_Q + q.id] = q;
  });

  const patch = backfillDelegatesFromQuestions(db);
  if (patch && Object.keys(patch).length) {
    try {
      if (typeof store.merge === "function") await store.merge(patch);
      else {
        for (const [k, v] of Object.entries(patch)) await store.set(k, v);
      }
      Object.assign(db, patch);
    } catch (err) {
      console.error("[aym-store] delegate backfill persist failed:", err && err.message ? err.message : err);
    }
  }

  const filtered = questions.filter(s => s && s.id && !isDemoDelegate(s));
  filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return {
    questions: filtered,
    users: delegateCardsFromDb(db),
    clusters: meta.value,
    clustersVersion: meta.version,
  };
}

async function persistWac(store, writer, expectedVersion) {
  if (typeof store.saveVersionedKv === "function") {
    return store.saveVersionedKv(K_WAC_RESULTS, writer, expectedVersion);
  }
  const prev = (await store.get(K_WAC_RESULTS)) || {};
  const currentVersion = prev.version || 1;
  if (expectedVersion != null && expectedVersion !== currentVersion) {
    throw new WacVersionConflictError(currentVersion);
  }
  const rec = writer(prev) || prev;
  rec.version = currentVersion + 1;
  await store.set(K_WAC_RESULTS, rec);
  return rec;
}

/** Staff actions recorded in the audit log: op → action (+ target picker). Read-only ops are not logged. */
const AUDITED_OPS = {
  aiApprove: "answer.approve", aiEditApprove: "answer.edit", aiReject: "answer.reject", aiSendToMentor: "answer.send",
  aiRegenerate: "answer.regenerate", aiRefile: "answer.refile", aiAskRephrase: "answer.rephrase",
  aiConfigSet: "settings.ai", aiBackfill: "ai.backfill", aiCompareBackfill: "ai.compare_backfill", aiRunNow: "ai.run", aiRetryFailed: "ai.retry", aiRetryDeferred: "ai.retry",
  mailRetry: "mail.retry",
  answerIndividual: "answer.individual", clustersSave: "clusters.save", clustersMerge: "clusters.merge",
  wacDelegatesImport: "wac.import", wacDelegatesClear: "wac.clear", wacAutoLinkAll: "wac.autolink",
  wacResultsSave: "wac.results.save", wacResultsPublish: "wac.results.publish", wacResultsMail: "wac.results.mail",
  facultyImport: "faculty.import", facultyReview: "faculty.review", facultyExport: "export",
  podcastsSave: "podcasts.save", set: "kv.set", del: "kv.del",
  testProbeSession: "probe.session", testProbeRegister: "probe.register", testProbePurge: "probe.purge",
  staffCleanup: "retention.cleanup",
};

function auditTarget(op, msg) {
  if (op === "set" || op === "del") return String(msg.key || "");
  if (op === "wacDelegatesImport") return `${Array.isArray(msg.rows) ? msg.rows.length : 0} rows${msg.batchId ? ` · ${msg.batchId}` : ""}`;
  if (op === "facultyImport" || op === "facultyExport") return String(msg.streamId || msg.stream || msg.filename || "");
  if (op === "clustersMerge") return (Array.isArray(msg.ids) ? msg.ids : []).join(",");
  if (op === "wacAutoLinkAll" || op === "testProbePurge" || op === "staffCleanup") return msg.dryRun === false ? "apply" : "dry run";
  return String(msg.id || msg.questionId || msg.clusterId || msg.email || "");
}

/** Credentials and limiter state: never reachable through the generic get / list / set / del. */
const SECRET_PREFIXES = [K_STAFF, "aym:sess:", "aym:otp:", "aym:wacrate:", "aym:mail:"];
const isStaffKey = k => SECRET_PREFIXES.some(p => String(k || "").startsWith(p));
/** A co-admin's generic `set` may touch only questions and groups; config, identities and links have their own (admin) ops. */
const coAdminMaySet = k => String(k || "").startsWith(K_Q) || k === K_CLUSTERS;

/** Always staff-only: refused up front with a reason code (pending / revoked / expired …). */
const STAFF_ONLY_OPS = new Set([
  ...AI_OPS, ...FACULTY_OPS, ...STAFF_DATA_OPS, "staffSnapshot", "regUsers", "visitSourcesGet", "answerIndividual", "clustersSave", "clustersMerge",
  "list", "stats", "podcastsSave", "wacResultsSave", "wacResultsPublish", "wacResultsMail", "wacDelegatesStats", "staffAuditExport",
  "staffSessions", "staffSessionRevoke", "staffSessionRevokeAll", "mailHealth", "mailRetry",
]);

/** Ops that never change questions, delegates or groups (everything else drops the staff data cache). */
const NO_DESK_WRITE_OPS = new Set([
  ...STAFF_DATA_OPS, "staffSnapshot", "ping", "whoami", "staffMe", "get", "list", "stats", "lookup", "publicStats",
  "podcastsList", "wacResultsGet", "visitSource", "visitSourcesGet", "regUsers", "regStart", "regResend", "wacConfig",
  "wacStart", "accountGet", "wacDelegatesStats", "staffRequests", "staffAudit", "staffRetentionGet", "staffAuditExport", "aiQueue", "aiConfigGet", "mailHealth",
  "staffSessions", "staffSessionRevoke", "staffSessionRevokeAll",
]);

async function handleOp(req, res, msg, store) {
  const op = msg && msg.op;
  const t0 = Date.now();
  const who = await resolveStaff(req, res, store);
  if (ADMIN_ONLY_OPS.has(op) || STAFF_ONLY_OPS.has(op)) {
    if (!who.ok) { send(res, 403, staffRefusal(who)); return; }
    if (ADMIN_ONLY_OPS.has(op) && who.role !== "admin") {
      send(res, 403, { error: "Admin only — ask the admin to do this.", code: "admin_only" });
      return;
    }
  }
  try {
    await handleOpInner(req, res, msg, store, who);
  } finally {
    if (!NO_DESK_WRITE_OPS.has(op)) invalidateStaffData();
    const ms = Date.now() - t0;
    if (ms >= SLOW_OP_MS) console.warn(`[aym-store] slow op=${String(op).slice(0, 40)} ms=${ms} status=${res.statusCode}`);
  }
  const action = AUDITED_OPS[op];
  if (!action || !who.ok) return;
  if (op === "set" && String(msg.key || "").startsWith(K_Q)) return;
  if (op === "wacAutoLinkAll" && msg.dryRun !== false) return;
  await audit(store, req, who, action, { target: auditTarget(op, msg), ok: res.statusCode < 400 });
}

async function handleOpInner(req, res, msg, store, who) {
  const staff = who.ok;
  const { op, key, prefix, query } = msg;
  let { val } = msg;

  if (op === "visitSource") {
    if (!visitRateOk(req)) { send(res, 429, { error: "Too many visits from this network." }); return; }
    if (!sanitizeSource(msg.src)) { send(res, 400, { error: "invalid source" }); return; }
    // An anonymous counter: bounded, and a store hiccup is logged, never surfaced.
    const r = await bestEffort(() => recordVisitSource(store, msg.src), { ms: 2000, label: "visitSource" });
    send(res, 200, { ok: true, recorded: Boolean(r.ok && r.value && r.value.ok) });
    return;
  }

  if (op === "visitSourcesGet") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    send(res, 200, { ok: true, ...(await readVisitSources(store)) });
    return;
  }

  if (op === "publicStats") {
    // Aggregate, PII-free numbers: the CDN may serve them briefly (the GET form is cacheable).
    res.setHeader("Cache-Control", PUBLIC_STATS_CACHE);
    send(res, 200, { ok: true, ...(await publicStats(store)) });
    return;
  }

  if (op === "ping") {
    send(res, 200, { ok: true, staff, hasPin: passcodeConfigured(), ...backendInfo(store) });
    return;
  }

  if (op === "whoami" || op === "staffMe") {
    if (staff) tickMailQueue(store);
    send(res, 200, { ok: true, ...(await staffMe(store, req, res, { ctx: who })), hasPin: passcodeConfigured(), ...backendInfo(store) });
    return;
  }
  if (op === "mailHealth") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    tickMailQueue(store);
    send(res, 200, { ok: true, mail: await mailHealth(store) });
    return;
  }
  if (op === "mailRetry") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const r = await retryMail(store);
    tickMailQueue(store, { budgetMs: 4000 });
    send(res, 200, r);
    return;
  }

  if (op === "login") {
    // The passcode alone never opens the staff area any more (docs/security/STAFF-ACCESS-SPEC.md).
    send(res, 410, { error: "Staff sign-in now uses the passcode and an email code. Use Staff access.", code: "use_staff_access" });
    return;
  }

  if (op === "logout" || op === "staffLogout") {
    await staffLogout(store, req, res);
    send(res, 200, { ok: true, staff: false });
    return;
  }

  if (op === "staffStart") {
    const r = await staffStart(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "staffVerify") {
    const r = await staffVerify(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "staffRequests") { send(res, 200, await staffRequests(store)); return; }
  if (op === "staffDecide") {
    const r = await staffDecide(msg, store, req, who);
    send(res, r.code, r.body);
    return;
  }
  if (op === "staffAudit") { send(res, 200, await staffAuditList(msg, store)); return; }
  if (op === "staffRetentionGet") { send(res, 200, { ok: true, retention: await getRetention(store, 0) }); return; }
  if (op === "staffRetentionSet") { send(res, 200, await staffRetentionSet(msg, store, req, who)); return; }
  if (op === "staffCleanup") {
    send(res, 200, { ok: true, ...(await retentionCleanup(store, { dryRun: msg.dryRun !== false })) });
    return;
  }
  if (op === "staffSessions") {
    const r = await staffSessionsList(msg, store, who);
    send(res, r.code, r.body);
    return;
  }
  if (op === "staffSessionRevoke" || op === "staffSessionRevokeAll") {
    const r = await staffSessionRevoke(msg, store, req, who, { all: op === "staffSessionRevokeAll" });
    if (r.body.signedOutSelf) clearStaffCookie(res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "staffAuditExport") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    await audit(store, req, who, "export", { target: String(msg.target || "").slice(0, 200) });
    send(res, 200, { ok: true });
    return;
  }
  if (op === "testProbeStaffRequest") {
    const r = await probeStaffRequest(msg, store, req, res, who);
    send(res, r.code, r.body);
    return;
  }
  if (op === "testProbeStaffPurge") { send(res, 200, await probeStaffPurge(store, req, who, { dryRun: msg.dryRun === true })); return; }

  if (op === "regStart") {
    const r = await regStart(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regResend") {
    const r = await regResend(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regVerify") {
    const r = await regVerify(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regMe") {
    const r = await regMe(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "accountGet") {
    const r = await accountGet(msg, store, req);
    send(res, r.code, r.body);
    return;
  }
  if (op === "accountWacShare") {
    const r = await accountWacShare(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regSaveWac") {
    const r = await regSaveWac(msg, store, req, res, { staff });
    send(res, r.code, r.body);
    return;
  }
  if (op === "regRecover") {
    const r = await regRecover(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (WAC_OPS.has(op)) {
    const r = await handleWacOp(op, msg, store, req, res, { staff });
    send(res, r.code, r.body);
    return;
  }
  if (FACULTY_OPS.has(op)) { const r = await handleFacultyOp(op, msg, store, { staff }); send(res, r.code, r.body); return; }
  if (op === "testProbeSession" || op === "testProbeRegister" || op === "testProbePurge") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      if (op === "testProbeSession") {
        const r = await probeSessionStart(msg, store);
        send(res, r.code, r.body);
      } else if (op === "testProbeRegister") {
        const r = await probeRegister(msg, store);
        send(res, r.code, r.body);
      } else {
        send(res, 200, { ok: true, ...(await probePurge(msg, store, { clustersMeta, persistClusters })) });
      }
    } catch (err) {
      if (err instanceof ClustersVersionConflictError) { sendClustersConflict(res, err.currentVersion); return; }
      console.error(`[aym-store] ${op} failed:`, err && err.message ? err.message : err);
      send(res, 500, { error: `${op} failed: ${String(err && err.message || err).slice(0, 160)}` });
    }
    return;
  }

  if (op === "regUsers") {
    if (!staff) { send(res, 403, { error: "staff only", users: [] }); return; }
    const r = await regUsers(store);
    send(res, r.code, r.body);
    return;
  }

  if (STAFF_DATA_OPS.has(op)) {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      const r = await handleStaffDataOp(op, msg, store, { clustersMeta });
      send(res, r.code, op === "staffCounts" ? { ...r.body, ...backendInfo(store) } : r.body);
    } catch (err) {
      console.error(`[aym-store] ${op} failed:`, err && err.message ? err.message : err);
      send(res, 503, { error: "Could not load this part of the desk. Retrying…", code: "busy" });
    }
    return;
  }

  if (op === "staffSnapshot") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const t0 = Date.now();
    try {
      const targeted = await buildStaffSnapshot(store);
      if (targeted) {
        const body = JSON.stringify({ ok: true, ...targeted, ...backendInfo(store) });
        console.log(`[aym-store] staffSnapshot ${Date.now() - t0}ms questions=${targeted.questions.length} users=${targeted.users.length} bytes=${body.length}`);
        if (body.length > SNAPSHOT_MAX_BYTES) {
          send(res, 413, { error: "The desk is too large for one request — reload the page to use paged loading.", code: "too_large" });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", PRIVATE_CACHE);
        res.end(body);
        return;
      }

      let db = typeof store.snapshot === "function" ? await store.snapshot() : null;
      if (!db || typeof db !== "object") {
        db = {};
        const keys = await store.list("");
        for (let i = 0; i < keys.length; i += 12) {
          const slice = keys.slice(i, i + 12);
          const chunk = await Promise.all(slice.map(k => store.get(k)));
          slice.forEach((k, j) => { db[k] = chunk[j]; });
        }
      }
      const patch = backfillDelegatesFromQuestions(db);
      if (patch && Object.keys(patch).length) {
        try {
          if (typeof store.merge === "function") await store.merge(patch);
          else {
            for (const [k, v] of Object.entries(patch)) await store.set(k, v);
          }
        } catch (err) {
          console.error("[aym-store] delegate backfill persist failed:", err && err.message ? err.message : err);
        }
      }
      const questions = Object.keys(db)
        .filter(k => k.startsWith(K_Q))
        .map(k => db[k])
        .filter(s => s && s.id && !isDemoDelegate(s));
      const users = delegateCardsFromDb(db);
      const meta = await clustersMeta(store);
      const clusters = Array.isArray(db[K_CLUSTERS]) ? db[K_CLUSTERS] : meta.value;
      questions.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      send(res, 200, {
        ok: true, questions, users, clusters, clustersVersion: meta.version, ...backendInfo(store),
      });
    } catch (err) {
      console.error("[aym-store] staffSnapshot failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not load the live desk. Refresh and try again." });
    }
    return;
  }

  if (AI_OPS.has(op)) {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      await handleAiOp(op, msg, store, aiCtx(req, res, store));
    } catch (err) {
      console.error(`[aym-ai] ${op} failed:`, err && err.message ? err.message : err);
      if (!res.writableEnded) send(res, 500, { error: "The AI drafts desk hit an error. Try again." });
    }
    return;
  }

  if (op === "answerIndividual") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const id = String(msg.id || "").trim();
    const answer = String(msg.answer || "").trim();
    if (!id || !answer) { send(res, 400, { error: "Write an answer before saving." }); return; }
    const rec = await store.get(K_Q + id);
    if (!rec || !rec.id) { send(res, 404, { error: "That question is not on the desk." }); return; }
    rec.individualAnswer = answer;
    rec.individualMentor = String(msg.mentorName || "").trim();
    rec.individualActions = Array.isArray(msg.actions) ? msg.actions.map(a => String(a || "").trim()).filter(Boolean).slice(0, 3) : [];
    rec.individualMistake = String(msg.mistake || "").trim();
    rec.individualResources = Array.isArray(msg.resources) ? msg.resources.map(a => String(a || "").trim()).filter(Boolean).slice(0, 2) : [];
    rec.individualAt = Date.now();
    await store.set(K_Q + id, rec);
    const notified = await notifyAnswerOnce(store, rec, { answer });
    send(res, 200, { ok: true, question: notified || rec });
    return;
  }

  if (op === "clustersSave") {
    if (!staff) { send(res, 403, { error: "staff only — sign in to merge questions." }); return; }
    const clusters = Array.isArray(msg.clusters) ? msg.clusters : null;
    if (!clusters) { send(res, 400, { error: "No merged groups to save." }); return; }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    let prevClusters = null;
    try { prevClusters = (await clustersMeta(store)).value; }
    catch { prevClusters = null; }
    try {
      const clean = sanitizeClusters(clusters);
      if (clean.fixes.duplicateMembers || clean.fixes.duplicateIds) {
        console.warn("[aym-store] clustersSave repaired groups:", JSON.stringify(clean.fixes));
      }
      const saved = await persistClusters(store, clean.clusters, expectedVersion);
      if (prevClusters) await notifyNewlyPublishedClusters(store, prevClusters, saved.clusters);
      send(res, 200, { ok: true, clusters: saved.clusters, clustersVersion: saved.version });
    } catch (err) {
      if (err instanceof ClustersVersionConflictError) {
        sendClustersConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] clustersSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save merged groups. Try again." });
    }
    return;
  }

  if (op === "clustersMerge") {
    if (!staff) { send(res, 403, { error: "staff only — sign in to merge questions." }); return; }
    const ids = Array.isArray(msg.ids) ? msg.ids.map(String) : [];
    if (ids.length < 2) {
      send(res, 400, { error: "Select at least two groups, then Merge." });
      return;
    }
    let clusters = [];
    try { clusters = (await store.get(K_CLUSTERS)) || []; }
    catch { clusters = []; }
    if (!Array.isArray(clusters)) clusters = [];
    let next;
    let merged;
    try {
      ({ clusters: next, merged } = mergeClusterGroup(clusters, ids, null, { suggestion: msg.suggestion === true }));
    } catch (err) {
      if (err instanceof MergeConflictError) {
        send(res, err.code === "MISSING" ? 400 : 422, { error: err.message, code: err.code });
        return;
      }
      throw err;
    }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    try {
      const saved = await persistClusters(store, sanitizeClusters(next).clusters, expectedVersion);
      await notifyNewlyPublishedClusters(store, clusters, saved.clusters);
      send(res, 200, {
        ok: true, clusters: saved.clusters, mergedId: merged.id, clustersVersion: saved.version,
      });
    } catch (err) {
      if (err instanceof ClustersVersionConflictError) {
        sendClustersConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] clustersMerge failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the merge. Try again." });
    }
    return;
  }

  if (op === "lookup") {
    const needle = normalizeLookupQuery(query);
    if (!needle) { send(res, 200, { hits: [] }); return; }
    // Ticket lookup is public; email lookup requires staff or a matching delegate session.
    if (needle.includes("@") && !staff) {
      let sessEmail = "";
      try {
        const sess = readSessTicket(req);
        sessEmail = String(sess && sess.profile && sess.profile.email || "").trim().toLowerCase();
      } catch { /* no session */ }
      if (!sessEmail || sessEmail !== needle) {
        send(res, 200, { hits: [] });
        return;
      }
    }
    const [clusters, found] = await Promise.all([lookupClustersValue(store), store.lookup(needle)]);
    const hits = found.map(s => ({
      id: s.id, ticket: s.ticket, question: s.question,
      theme: s.theme, subtheme: s.subtheme, createdAt: s.createdAt,
      consentPublish: s.consentPublish || "",
      individualAnswer: pickStoredAnswer(s),
      individualMentor: s.individualMentor || s.mentorName || "",
      individualAt: s.individualAt || 0,
      individualActions: s.individualActions || [],
      individualMistake: s.individualMistake || "",
      individualResources: s.individualResources || [],
      individualAiAssisted: Boolean(pickStoredAnswer(s) && s.individualAiAssisted),
      cluster: clusterStatusFor(s, Array.isArray(clusters) ? clusters : []),
    }));
    await annotateLookupHits(store, hits);
    send(res, 200, { hits });
    return;
  }

  if (op === "get") {
    if (key === K_CONFIG) { send(res, 200, { value: publicConfig() }); return; }
    if (key === K_CLUSTERS) {
      if (staff) {
        send(res, 200, { value: (await store.get(K_CLUSTERS)) || [] });
        return;
      }
      // Every public page load asks for this; a short per-instance cache keeps a crowd off the doc.
      send(res, 200, { value: await publicClustersValue(store) });
      return;
    }
    if (!staff || isStaffKey(key)) {
      send(res, 403, { error: "staff only", value: null });
      return;
    }
    send(res, 200, { value: await store.get(key) });
    return;
  }

  if (op === "list") {
    if (!staff) {
      send(res, 403, { error: "staff only", keys: [] });
      return;
    }
    send(res, 200, { keys: (await store.list(prefix || "")).filter(k => !isStaffKey(k)) });
    return;
  }

  if (op === "stats") {
    if (!staff) {
      send(res, 403, { error: "staff only", value: null });
      return;
    }
    send(res, 200, { value: await store.stats() });
    return;
  }

  if (op === "set") {
    if (key === K_CONFIG || isStaffKey(key)) {
      send(res, 403, { error: "staff only" });
      return;
    }
    if (key === K_PODCASTS) {
      send(res, 400, { error: "Use podcastsSave to add talks." });
      return;
    }
    const isQuestion = String(key || "").startsWith(K_Q);
    if (!isQuestion && !staff) { send(res, 403, { error: "staff only" }); return; }
    if (staff && who.role !== "admin" && !coAdminMaySet(key)) {
      send(res, 403, { error: "Admin only — ask the admin to do this.", code: "admin_only" });
      return;
    }
    if (isQuestion && !staff) {
      // Students may only write their own Ask Desk fields, at the id the key names.
      const keyId = String(key).slice(K_Q.length);
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(keyId)) {
        send(res, 400, { error: "Your question is missing its ticket. Reload the page and send it again.", code: "invalid" });
        return;
      }
      if (!isIntakeOpen()) {
        send(res, 403, {
          error: "Question intake is closed. Browse the answer bank and Track any ticket you already hold.",
          code: "intake_closed",
          keyDates: KEY_DATES,
        });
        return;
      }
      const ip = clientIp(req);
      const ipHit = askIpLimiter.hit(`ask:${ip}`);
      if (!ipHit.ok) {
        send(res, 429, { error: "Too many questions from this network. Please wait a few minutes.", code: "rate", retryIn: ipHit.retryIn });
        return;
      }
      val = normalizeAskRecord(val);
      val.id = keyId;
      const problem = askRecordProblem(val);
      if (problem) { send(res, 400, { error: problem, code: "invalid" }); return; }
      const offList = offListAskFields(val);
      if (offList.length) console.warn("[aym-store] question with off-list values kept:", offList.join(", "));
      const trackInfo = resolveTrackSelection(val.theme || val.track);
      if (trackInfo.trackCode) {
        val.trackCode = trackInfo.trackCode;
        val.track = trackInfo.trackLabel || val.track;
        if (!val.theme) val.theme = trackInfo.theme;
      }
      const detected = detectAskSafetyFlags(val.question, val.context, val.outcome);
      const incoming = Array.isArray(val.safetyFlags) ? val.safetyFlags : [];
      val.safetyFlags = [...new Set([...incoming, ...detected.flags])].slice(0, 12);
      const existing = await store.get(key);
      if (existing) {
        // A retry of a question that already landed (e.g. after a gateway timeout) is a no-op success.
        if (val && existing.ticket && existing.ticket === val.ticket) {
          send(res, 200, { ok: true, duplicate: true });
          return;
        }
        send(res, 403, { error: "staff only" });
        return;
      }
    }
    if (isQuestion && val && typeof val === "object") {
      if (!val.id || !val.ticket || !val.question) {
        send(res, 400, { error: "invalid question" }); return;
      }
      if (staff && isDemoDelegate(val) && !demoOpsAllowed() && !(await store.get(key))) {
        send(res, 403, { error: "Demo data is disabled in production." }); return;
      }
      let sess = null;
      try { sess = readSessTicket(req); } catch { sess = null; }
      const sessProfile = sess && sess.profile ? sess.profile : null;
      let issuedUser = null;
      if (!staff) {
        try {
          const issued = await ensureSessionIssuedRegNo(msg, store, req);
          issuedUser = issued && issued.user;
        } catch (err) {
          console.error("[aym-store] issue WAC for question failed:", err && err.message ? err.message : err);
          send(res, 503, { error: "The Ask Desk is very busy right now. Your question is still here — press Send again in a moment.", code: "busy" });
          return;
        }
      }
      const wac = staff
        ? (validRegNo(val.regNo) || validRegNo(val.delegateNo) || validRegNo(issuedUser && issuedUser.regNo) || validRegNo(sessProfile && sessProfile.regNo))
        : (validRegNo(issuedUser && issuedUser.regNo) || validRegNo(sessProfile && sessProfile.regNo));
      if (!staff && !wac) {
        send(res, 400, { error: "Register first — the hall issues your AYURDISHA pass number." });
        return;
      }
      if (!staff) {
        const userKey = String((issuedUser && (issuedUser.email || issuedUser.regNo)) || (sessProfile && (sessProfile.email || sessProfile.regNo)) || val.email || val.regNo || "anon").toLowerCase();
        const userHit = askUserLimiter.hit(`ask-user:${userKey}`);
        if (!userHit.ok) {
          send(res, 429, { error: "You have sent several questions recently. Please wait before sending another.", code: "rate", retryIn: userHit.retryIn });
          return;
        }
      }
      val.regNo = wac || String(val.regNo || "").trim();
      val.delegateNo = val.regNo;
      // The WAC Delegate ID comes from the linked account only — never from the submitted form.
      const linkedWacId = String((issuedUser && issuedUser.wacId) || (sessProfile && sessProfile.wacId) || "").trim();
      const staffWacId = staff ? String(val.wacId || "").trim().slice(0, 40) : "";
      if (linkedWacId || staffWacId) val.wacId = linkedWacId || staffWacId;
      else delete val.wacId;
      const source = sanitizeSource(val.source);
      if (source) val.source = source;
      else delete val.source;
      const fields = {
        name: (issuedUser && issuedUser.name) || (sessProfile && sessProfile.name) || val.name,
        email: (issuedUser && issuedUser.email) || (sessProfile && sessProfile.email) || val.email,
        institute: (issuedUser && issuedUser.institute) || (sessProfile && sessProfile.institute) || val.institution,
        institution: val.institution,
        age: (issuedUser && issuedUser.age) || (sessProfile && sessProfile.age),
        sex: (issuedUser && issuedUser.sex) || (sessProfile && sessProfile.sex),
        regNo: val.regNo,
        delegateNo: val.regNo,
        createdAt: (issuedUser && issuedUser.createdAt) || (sessProfile && sessProfile.createdAt) || val.createdAt,
      };
      let savedUser = null;
      const writeQuestion = db => {
        if (wac && wacOwnedByOtherEmail(db, wac, fields.email)) {
          const err = new Error("That pass number is already linked to a different AYURDISHA profile.");
          err.code = 409;
          throw err;
        }
        db[key] = val;
        savedUser = upsertDelegateIntoDb(db, fields);
        return db;
      };
      try {
        if (typeof store.transactKeys === "function") {
          const emailLower = String(fields.email || "").trim().toLowerCase();
          const rawReg = String(wac || "").trim();
          const keys = [
            emailLower && K_EMAIL + emailLower,
            regnoIndexKey(rawReg),
            rawReg && K_REGNO + rawReg,
            issuedUser && issuedUser.id && K_USER + issuedUser.id,
            sess && sess.userId && K_USER + sess.userId,
          ];
          const expand = db => Object.keys(db)
            .filter(k => k.startsWith(K_EMAIL) || k.startsWith(K_REGNO))
            .map(k => db[k] && db[k].userId ? K_USER + db[k].userId : "");
          await store.transactKeys(keys, writeQuestion, expand);
        } else if (typeof store.transact === "function") {
          await store.transact(writeQuestion);
        } else {
          const db = typeof store.snapshot === "function" ? (await store.snapshot()) || {} : {};
          if (wac && wacOwnedByOtherEmail(db, wac, fields.email)) {
            send(res, 409, { error: "That pass number is already linked to a different AYURDISHA profile." });
            return;
          }
          await store.set(key, val);
          db[key] = val;
          savedUser = upsertDelegateIntoDb(db, fields);
          if (savedUser && typeof store.merge === "function") {
            const patch = { [K_USER + savedUser.id]: savedUser };
            if (savedUser.emailLower) patch[K_EMAIL + savedUser.emailLower] = { userId: savedUser.id };
            if (savedUser.regNo) {
              const rk = String(savedUser.regNo).trim().toUpperCase().replace(/[\s_\-/]+/g, "");
              if (rk) patch[K_REGNO + rk] = { userId: savedUser.id };
            }
            await store.merge(patch);
          }
        }
      } catch (err) {
        if (err && err.code === 409) {
          send(res, 409, { error: err.message || "That pass number is already linked to a different AYURDISHA profile." });
          return;
        }
        console.error("[aym-store] question persist failed:", err && err.message ? err.message : err);
        send(res, 500, { error: "We could not save your question just now. It is still on this page — press Send again in a moment.", code: "save_failed" });
        return;
      }
      if (sess && savedUser && res) {
        try {
          setSessCookie(res, makeSessTicket({
            token: sess.token,
            userId: sess.userId || savedUser.id,
            profile: publicProfile(savedUser),
          }));
        } catch { /* question is saved even if cookie refresh fails */ }
      }
      // The question is saved: AI drafting and confirmation mail are best-effort and must never fail the submit.
      try {
        const ai = isDemoDelegate(val) ? null : await onQuestionSaved(store, val);
        if (ai && ai.queued) kickWorker(req, { afterSubmit: true });
      } catch (err) {
        console.error("[aym-ai] post-submit enqueue failed:", err && err.message ? err.message : err);
      }
      try {
        if (!isDemoDelegate(val) && String(val.email || "").includes("@")) {
          await sendOrQueue(store, {
            send: () => sendAskReceivedEmail({ to: val.email, name: val.name, ticket: val.ticket, link: trackLink(val.ticket) }),
            template: "ask-receipt",
            to: val.email,
            payload: { name: val.name || "", ticket: val.ticket || "", link: trackLink(val.ticket) },
            id: `ask-receipt:${val.id}`,
          });
          kickWorker(req, { afterSubmit: true });
        }
      } catch (err) {
        console.error("[aym-mail] ask receipt enqueue failed:", err && err.message ? err.message : err);
      }
      send(res, 200, { ok: true, ticket: val.ticket, profile: savedUser ? publicProfile(savedUser) : undefined });
      return;
    }
    if (key === K_CLUSTERS) dropClusterCaches();
    await store.set(key, val);
    send(res, 200, { ok: true });
    return;
  }

  if (op === "del") {
    if (!staff || isStaffKey(key)) { send(res, 403, { error: "staff only" }); return; }
    if (!demoOpsAllowed() && (key === K_CLUSTERS || String(key || "").startsWith(K_Q))) {
      send(res, 403, { error: "Bulk delete is disabled in production." }); return;
    }
    if (key === K_CLUSTERS) dropClusterCaches();
    await store.del(key);
    send(res, 200, { ok: true });
    return;
  }

  if (op === "podcastsList") {
    const rec = (await store.get(K_PODCASTS)) || {};
    send(res, 200, podcastPayload(rec));
    return;
  }

  if (op === "podcastsSave") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      const rec = await persistPodcasts(store, prev => {
        let talks = normalizeTalks(prev.talks);
        if (Array.isArray(msg.talks)) {
          talks = normalizeTalks(msg.talks);
        }
        if (msg.talk) {
          const added = normalizeTalk(msg.talk, talks.length);
          if (!added) {
            const err = new Error("Title and a https:// video URL are required.");
            err.code = 400;
            throw err;
          }
          talks = normalizeTalks([added, ...talks.filter(t => t.id !== added.id)]);
        }
        if (msg.removeId) {
          const rid = String(msg.removeId);
          talks = talks.filter(t => t.id !== rid);
        }
        return { ...prev, talks };
      });
      send(res, 200, podcastPayload(rec));
    } catch (err) {
      if (err && err.code === 400) {
        send(res, 400, { error: err.message });
        return;
      }
      console.error("[aym-store] podcastsSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the talk. Try again." });
    }
    return;
  }

  if (op === "wacResultsGet") {
    const rec = (await store.get(K_WAC_RESULTS)) || {};
    send(res, 200, { ok: true, ...wacPayload(rec, staff) });
    return;
  }

  if (op === "wacResultsSave") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const rows = normalizeWacRows(msg.rows);
    if (!rows.length) {
      send(res, 400, { error: "No student rows to save. Check the Excel columns (name, email, institute, WAC Delegate ID or pass number)." });
      return;
    }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    try {
      const rec = await persistWac(store, prev => ({
        published: Boolean(prev.published),
        publishedAt: prev.publishedAt || null,
        filename: String(msg.filename || prev.filename || "selected-students.xlsx").slice(0, 180),
        updatedAt: Date.now(),
        rows,
        mail: prev.mail || null,
      }), expectedVersion);
      send(res, 200, { ok: true, ...wacPayload(rec, true) });
    } catch (err) {
      if (err instanceof WacVersionConflictError) {
        sendWacConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] wacResultsSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the selection list. Try again." });
    }
    return;
  }

  if (op === "wacResultsPublish") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    const want = msg.published !== false;
    try {
      const rec = await persistWac(store, prev => {
        const rows = Array.isArray(prev.rows) ? prev.rows : [];
        if (want && !rows.length) {
          const err = new Error("Upload or load a selection list before publishing.");
          err.code = 400;
          throw err;
        }
        return {
          ...prev,
          rows,
          filename: prev.filename || "selected-students.xlsx",
          published: want,
          publishedAt: want ? Date.now() : null,
          updatedAt: Date.now(),
        };
      }, expectedVersion);
      send(res, 200, { ok: true, ...wacPayload(rec, true) });
    } catch (err) {
      if (err instanceof WacVersionConflictError) {
        sendWacConflict(res, err.currentVersion);
        return;
      }
      if (err.code === 400) {
        send(res, 400, { error: err.message });
        return;
      }
      console.error("[aym-store] wacResultsPublish failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not update publication. Try again." });
    }
    return;
  }

  if (op === "wacResultsMail") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const prev = (await store.get(K_WAC_RESULTS)) || {};
    const rows = (Array.isArray(prev.rows) ? prev.rows : []).filter(r => r && r.selected !== false && EMAIL_RE.test(String(r.email || "").trim()));
    if (!rows.length) {
      send(res, 400, { error: "No selected students with an email address." });
      return;
    }
    const offset = Math.max(0, Number(msg.offset) || 0);
    const slice = rows.slice(offset, offset + WAC_MAIL_BATCH);
    let sent = 0;
    let failed = 0;
    const errors = [];
    let delivery = "email";
    for (const row of slice) {
      try {
        const r = await sendOrQueue(store, {
          send: () => sendSelectionEmail(row),
          template: "selection",
          to: row.email,
          payload: { name: row.name, passId: row.passId },
        });
        if (r && r.delivery === "console") delivery = "console";
        if (r && r.delivery === "queued") delivery = delivery === "email" ? "queued" : delivery;
        sent += 1;
      } catch (err) {
        failed += 1;
        errors.push({ email: row.email, error: String(err && err.message ? err.message : err).slice(0, 180) });
      }
      await sleep(WAC_MAIL_GAP_MS);
    }
    const nextOffset = offset + slice.length;
    const remaining = Math.max(0, rows.length - nextOffset);
    const mail = {
      lastAt: Date.now(),
      sent: (prev.mail && prev.mail.sent || 0) + sent,
      failed: (prev.mail && prev.mail.failed || 0) + failed,
      delivery,
    };
    try {
      await persistWac(store, prev => ({ ...prev, mail, updatedAt: Date.now() }), null);
    } catch { /* mail already went out */ }
    send(res, 200, {
      ok: true, sent, failed, remaining, nextOffset, total: rows.length, delivery, errors,
    });
    return;
  }

  send(res, 400, { error: "unknown op" });
}

async function retentionCleanup(store, { dryRun = false, budgetMs = 8000 } = {}) {
  return runRetentionCleanup(store, {
    dryRun,
    budgetMs,
    deps: {
      probeQuestions: async () => {
        const qs = typeof store.listQuestions === "function" ? await store.listQuestions() : [];
        return qs.filter(q => q && isProbeQuestion(q));
      },
      probePurge: m => probePurge(m, store, { clustersMeta, persistClusters }),
    },
  });
}

const storePromise = createAymStore();

export function aymStoreHandler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    // Only public, PII-free reads are GET-able (aggregate stats, published groups), so the CDN can cache them.
    let op = "";
    try { op = new URL(req.url || "/", "http://local").searchParams.get("op") || ""; } catch { op = ""; }
    if (!PUBLIC_GET_OPS.has(op)) { send(res, 405, { error: "POST only" }); return; }
    storePromise
      .then(async store => {
        if (op === "podcastsList") {
          const rec = (await store.get(K_PODCASTS)) || {};
          res.setHeader("Cache-Control", PUBLIC_PODCASTS_CACHE);
          send(res, 200, podcastPayload(rec));
          return;
        }
        if (op === "publicClusters") {
          const value = await publicClustersValue(store);
          res.setHeader("Cache-Control", PUBLIC_CLUSTERS_CACHE);
          send(res, 200, { ok: true, value });
          return;
        }
        res.setHeader("Cache-Control", PUBLIC_STATS_CACHE);
        send(res, 200, { ok: true, ...(await publicStats(store)) });
      })
      .catch(err => {
        console.error(`[aym-store] ${op} GET failed:`, err && err.message ? err.message : err);
        if (!res.writableEnded) send(res, 503, { error: "temporarily unavailable", code: "busy" });
      });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "POST only" });
    return;
  }
  let body = "";
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    req.destroy();
    if (!res.writableEnded) send(res, 408, { error: "Request timed out. Try again with a smaller change." });
  }, STORE_BODY_TIMEOUT_MS);

  req.on("data", chunk => {
    if (timedOut) return;
    bytes += chunk.length;
    if (bytes > STORE_BODY_MAX_BYTES) {
      timedOut = true;
      req.destroy();
      if (!res.writableEnded) send(res, 413, { error: "Request too large." });
      return;
    }
    body += chunk;
  });
  req.on("end", () => {
    clearTimeout(timer);
    if (timedOut || res.writableEnded) return;
    let msg = {};
    try { msg = body ? JSON.parse(body) : {}; }
    catch { send(res, 400, { error: "invalid json" }); return; }

    storePromise
      .then(store => handleOp(req, res, msg, store))
      .catch(err => {
        console.error("[aym-store] request failed:", err);
        if (!res.writableEnded) send(res, 500, { error: "The server hit a problem. Please try again in a moment.", code: "server_error" });
      });
  });
  req.on("error", () => {
    clearTimeout(timer);
    if (!res.writableEnded) send(res, 400, { error: "Could not read request body." });
  });
}

/**
 * /api/ai-worker — drains the AI draft queue. Callers: the post-submit kick (HMAC header),
 * Vercel cron (`Authorization: Bearer $CRON_SECRET`, which also runs the daily retention cleanup),
 * a signed-in approved staff member, or the service token. Without a CRON_SECRET, unauthenticated
 * calls are throttled to one run a minute; the worker only ever drafts already-queued items, never
 * publishes, and stops at the daily spend cap.
 */
export function aiWorkerHandler(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST" && req.method !== "GET") { send(res, 405, { error: "GET or POST only" }); return; }
  const kick = String(req.headers[AI_KICK_HEADER] || "");
  const auth = String(req.headers.authorization || "");
  const secret = cronSecret();
  const viaCron = Boolean(secret && safeEqual(auth, `Bearer ${secret}`));
  let body = "";
  req.on("data", c => { if (body.length < 4096) body += c; });
  req.on("end", () => {
    let msg = {};
    try { msg = body ? JSON.parse(body) : {}; } catch { msg = {}; }
    storePromise
      .then(async store => {
        const who = await resolveStaff(req, res, store);
        const staffCaller = who.ok;
        const trusted = staffCaller || viaCron || Boolean(kick && safeEqual(kick, aiKickToken()));
        if (!trusted && secret) { send(res, 401, { error: "unauthorized" }); return; }
        if (msg.dryRun) {
          if (!staffCaller) { send(res, 403, { error: "staff only" }); return; }
          send(res, 200, await dryRunDraft(store, msg.dryRun));
          return;
        }
        if (!trusted) {
          const aiStore = await aiStoreFor(store);
          const state = await aiStore.getState();
          if (state.lastRunAt && Date.now() - state.lastRunAt < AI_UNAUTH_MIN_GAP_MS) {
            send(res, 200, { ok: true, skipped: "throttled" });
            return;
          }
        }
        // Post-submit kicks from many instances collapse into one worker start per window.
        const viaKickOnly = Boolean(kick) && !staffCaller && !viaCron;
        if (viaKickOnly && msg.sweep !== true) {
          const aiStore = await aiStoreFor(store);
          const state = await aiStore.getState();
          const now = Date.now();
          if (state.lastKickAt && now - state.lastKickAt < AI_KICK_MIN_GAP_MS) {
            send(res, 200, { ok: true, skipped: "kick-throttled" });
            return;
          }
          await aiStore.setState({ lastKickAt: now });
        }
        const t0 = Date.now();
        let retention;
        if (viaCron && req.method === "GET") {
          try { retention = await retentionCleanup(store, { budgetMs: 6000 }); }
          catch (err) { retention = { error: String(err && err.message || err).slice(0, 120) }; }
        }
        const workerOpts = { forceSweep: trusted && msg.sweep === true };
        if (retention) workerOpts.budgetMs = Math.max(20000, WORKER_BUDGET_MS - (Date.now() - t0));
        let mail;
        try { mail = await runMailQueue(store, { budgetMs: viaCron ? 8000 : 2500 }); }
        catch (err) { mail = { error: String(err && err.message || err).slice(0, 120) }; }
        const report = await runWorker(store, workerOpts);
        send(res, 200, { ...report, mail, ...(retention ? { retention } : {}) });
      })
      .catch(err => {
        console.error("[aym-ai] worker failed:", err && err.message ? err.message : err);
        if (!res.writableEnded) send(res, 500, { error: "worker failed" });
      });
  });
  req.on("error", () => { if (!res.writableEnded) send(res, 400, { error: "bad request" }); });
}

export function aymStorePlugin() {
  return {
    name: "aym-store",
    configureServer(server) {
      server.middlewares.use("/api/aym-store", aymStoreHandler);
      server.middlewares.use("/api/knowledge-chat", knowledgeChatHandler);
      server.middlewares.use("/api/ai-worker", aiWorkerHandler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/aym-store", aymStoreHandler);
      server.middlewares.use("/api/knowledge-chat", knowledgeChatHandler);
      server.middlewares.use("/api/ai-worker", aiWorkerHandler);
    },
  };
}
