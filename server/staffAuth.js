/**
 * Staff access: verified email session + role (spec: docs/security/STAFF-ACCESS-SPEC.md).
 *
 *   - admin: the addresses in STAFF_ADMIN_EMAILS (default: the owner). Auto-approved.
 *   - co-admin: anyone else who passes passcode + email code, once an admin approves the request.
 *   - service: `Authorization: Bearer <STAFF_SERVICE_TOKEN>` (scripts) acts as admin.
 *
 * The staff passcode (ADMIN_PIN) only lets someone ask for an email code; it never opens the staff
 * area by itself. After a full sign-in the browser becomes a trusted device: a per-device record in
 * `staff_sessions` (rolling, 90 days idle) referenced by the signed `aym_staff` cookie, while the role
 * is re-checked on every request. On Firestore the records live in `staff_members`, `staff_sessions`,
 * `staff_audit`, `staff_attempts`, `staff_settings`; on the file / Blob / memory stores under
 * `aym:staff:*` KV keys. Passcodes and codes are never stored or logged; IP addresses only as keyed hashes.
 */
import crypto from "node:crypto";
import { loadServerEnv } from "./env.js";
import {
  parseCookies, appendCookie, encodeSigned, decodeSigned, keyedHash,
  makeOtpTicket, resignOtpTicket, otpTicketMatches, OTP_TTL_MS,
} from "./otpTicket.js";
import { reserveOtpSend, releaseOtpSend, clientIp, K_OTP_RATE, makeWindowLimiter } from "./otpLimits.js";
import { sendStaffCodeEmail, sendStaffRequestEmail } from "./mailer.js";
import { sendOrQueue } from "./mailQueue.js";
import { updateKey, bestEffort } from "./passIssuer.js";
import { isProbeEmail } from "../shared/probe.js";
import { ADMIN_DISPLAY, staffIdentityName, isDroppedHallPass } from "../shared/account.js";

export const STAFF_COOKIE = "aym_staff";
export const STAFF_OTP_COOKIE = "aym_staff_otp";
export const DEFAULT_ADMIN_EMAILS = ["vishnukumar07042004@gmail.com"];

/** One-time staff review invite (hashed in `aym:staff:review:*`). Default 45 min; clamp 15–60. */
export const K_REVIEW = "aym:staff:review:";
export const REVIEW_DEFAULT_TTL_MS = 45 * 60 * 1000;
export const REVIEW_MIN_TTL_MS = 15 * 60 * 1000;
export const REVIEW_MAX_TTL_MS = 60 * 60 * 1000;
/** Ops a review-only session may call (browse / whoami / logout). Writes are refused with `review_only`. */
export const REVIEW_ALLOWED_OPS = new Set([
  "whoami", "staffMe", "ping", "logout", "staffLogout",
  "staffCounts", "staffClusters", "staffQuestionsPage", "staffDelegatesPage", "staffSnapshot",
  "list", "stats", "get", "lookup",
  "visitSourcesGet", "regUsers",
  "aiQueue", "aiConfigGet", "aiStats", "aiCompareStats", "aiIndex",
  "wacDelegatesStats", "wacResultsGet", "podcastsList", "mailHealth",
  "publicStats", "publicClusters",
]);

/** Trusted device: no absolute limit; ends after 90 days without use, sign-out or a revoke. */
export const SESSION_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_MS = 180 * 24 * 60 * 60 * 1000;
export const SESSION_ROTATE_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 10 * 60 * 1000;
/** A cookie copy this much older than the device's latest rotation is refused. */
const SESSION_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const LEGACY_IDLE_MS = 12 * 60 * 60 * 1000;
const LEGACY_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const ROLE_CACHE_MS = 30 * 1000;
const SESSION_CACHE_MS = 30 * 1000;
const PENDING_CACHE_MS = 15 * 1000;

export const LOCK_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;
const DELAY_STEP_MS = 400;
const DELAY_MAX_MS = 2000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export const MIN_SERVICE_TOKEN_LEN = 32;
export const STRONG_PASSCODE_LEN = 12;

export const K_STAFF = "aym:staff:";
const K_MEMBER = "aym:staff:member:";
const K_AUDIT = "aym:staff:audit:";
const K_ATTEMPT = "aym:staff:att:";
const K_SETTINGS = "aym:staff:settings";
const K_SESSION = "aym:staff:sess:";
const COL = { members: "staff_members", sessions: "staff_sessions", audit: "staff_audit", attempts: "staff_attempts", settings: "staff_settings" };
const FIREBASE_APP = "aym-preview";
const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_DEFAULTS = Object.freeze({
  auditDays: 365,
  otpRateDays: 2,
  wacRateDays: 2,
  sessionDays: 45,
  probeDays: 7,
});
const RETENTION_LIMITS = { auditDays: [30, 3650], otpRateDays: [1, 90], wacRateDays: [1, 90], sessionDays: [31, 365], probeDays: [1, 90] };

/** Ops a co-admin may NOT run (admin or service token only). */
export const ADMIN_ONLY_OPS = new Set([
  "aiConfigSet", "aiBackfill", "aiCompareBackfill",
  "wacDelegatesImport", "wacDelegatesClear", "wacAutoLinkAll",
  "facultyImport",
  "testProbeSession", "testProbeRegister", "testProbePurge", "testProbeStaffRequest", "testProbeStaffPurge",
  "del",
  "staffRequests", "staffDecide", "staffAudit", "staffRetentionGet", "staffRetentionSet", "staffCleanup",
  "staffReviewInviteCreate",
]);

/**
 * Bearer STAFF_SERVICE_TOKEN may only call these ops (scripts / cron helpers).
 * Everything else requires an interactive staff session. Expand deliberately.
 */
export const SERVICE_ALLOWED_OPS = new Set([
  "ping", "whoami", "staffMe",
  "aiConfigGet", "aiConfigSet", "aiQueue", "aiStats", "aiCompareStats", "aiRunNow",
  "aiBackfill", "aiCompareBackfill", "aiRetryFailed", "aiRetryDeferred", "aiProviderTest",
  "staffCleanup", "staffRetentionGet", "staffCounts",
  "staffClusters", "staffQuestionsPage", "staffDelegatesPage",
  // Scripted WAC list maintenance (still audited; never staff access admin / probes / desk dump)
  "wacDelegatesImport", "wacDelegatesClear", "wacDelegatesStats", "wacAutoLinkAll",
]);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = text => crypto.createHash("sha256").update(String(text)).digest("hex");
const normEmail = s => String(s || "").trim().toLowerCase().slice(0, 160);

function env() { return loadServerEnv(); }

/** Session clock (tests move `now` forward by days). */
export const staffClock = { now: () => Date.now() };

/* ------------------------------------------------------------------ config */

export function adminEmails() {
  const raw = String(env().STAFF_ADMIN_EMAILS || "").trim();
  const list = raw ? raw.split(/[,;\s]+/) : DEFAULT_ADMIN_EMAILS;
  return [...new Set(list.map(normEmail).filter(e => EMAIL_RE.test(e)))];
}

export function isAdminEmail(email) {
  return adminEmails().includes(normEmail(email));
}

/** The staff passcode, from env only (process env, then .env.local / .env). */
export function loadPasscode() {
  return String(env().ADMIN_PIN || "").trim();
}

/** Fail closed: staff access is off unless ADMIN_PIN is at least STRONG_PASSCODE_LEN. */
export function passcodeConfigured() {
  return loadPasscode().length >= STRONG_PASSCODE_LEN;
}

/** Always false when configured (short pins never open staff). Kept for whoami compatibility. */
export function passcodeIsWeak() {
  const p = loadPasscode();
  return p.length > 0 && p.length < STRONG_PASSCODE_LEN;
}

export function passcodeMatches(entered) {
  const expected = loadPasscode();
  if (expected.length < STRONG_PASSCODE_LEN) return false;
  const a = Buffer.from(sha256(String(entered || "").trim()), "hex");
  const b = Buffer.from(sha256(expected), "hex");
  return crypto.timingSafeEqual(a, b);
}

function serviceToken() {
  const t = String(env().STAFF_SERVICE_TOKEN || "").trim();
  return t.length >= MIN_SERVICE_TOKEN_LEN ? t : "";
}

function safeEqual(a, b) {
  const x = Buffer.from(sha256(String(a || "")), "hex");
  const y = Buffer.from(sha256(String(b || "")), "hex");
  return Boolean(a) && Boolean(b) && crypto.timingSafeEqual(x, y);
}

function delayBase() {
  const v = Number(process.env.AYM_STAFF_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, DELAY_STEP_MS) : DELAY_STEP_MS;
}

export function failureDelayMs(fails) {
  return Math.min(DELAY_MAX_MS, delayBase() * Math.max(0, fails));
}

function ipHashFor(req) {
  try { return keyedHash("staff-ip|" + clientIp(req)).slice(0, 16); } catch { return ""; }
}

function idHash(kind, value) {
  try { return keyedHash(`staff-${kind}|${value}`).slice(0, 32); } catch { return sha256(`staff-${kind}|${value}`).slice(0, 32); }
}

/* ------------------------------------------------------------------ storage */

function clean(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
const docId = s => encodeURIComponent(String(s || "")).slice(0, 600);

async function firestoreFor(store) {
  if (!store || store.name !== "firestore") return null;
  try {
    const { getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = getApps().find(a => a.name === FIREBASE_APP);
    return app ? getFirestore(app) : null;
  } catch {
    return null;
  }
}

function withTtl(rec) {
  const out = clean(rec);
  if (out && Number(out.expireAtMs) > 0) out.expireAt = new Date(out.expireAtMs);
  return out;
}

function fromDoc(snap) {
  if (!snap || !snap.exists) return null;
  const { expireAt, ...rest } = snap.data() || {};
  return rest;
}

function firestoreBackend(db) {
  const col = n => db.collection(COL[n]);
  async function deleteDocs(docs) {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  return {
    kind: "firestore",
    async getMember(email) { return fromDoc(await col("members").doc(docId(email)).get()); },
    async putMember(rec) { await col("members").doc(docId(rec.email)).set(clean(rec)); return rec; },
    async delMember(email) { await col("members").doc(docId(email)).delete(); },
    async listMembers() { return (await col("members").get()).docs.map(fromDoc).filter(Boolean); },
    async touchMember(email, at) {
      try { await col("members").doc(docId(email)).update({ lastSeenAt: at }); } catch { /* no record */ }
    },
    async getSession(id) { return fromDoc(await col("sessions").doc(docId(id)).get()); },
    async putSession(rec) { await col("sessions").doc(docId(rec.id)).set(withTtl(rec)); return rec; },
    /** Field-level update (never overwrites a concurrent revoke); false when the record is gone. */
    async patchSession(id, fields) {
      try {
        await col("sessions").doc(docId(id)).update(withTtl(fields));
        return true;
      } catch (err) {
        if (err && (err.code === 5 || /NOT_FOUND/i.test(String(err.message || "")))) return false;
        throw err;
      }
    },
    async listSessions(email) {
      const q = email ? col("sessions").where("email", "==", normEmail(email)) : col("sessions");
      return (await q.get()).docs.map(fromDoc).filter(Boolean);
    },
    async purgeSessions(now, max, dryRun) {
      const snap = await col("sessions").where("expireAtMs", "<", now).limit(max).get();
      if (!dryRun) await deleteDocs(snap.docs);
      return snap.size;
    },
    async addAudit(entry) { await col("audit").doc(entry.id).set(withTtl(entry)); },
    async listAudit({ limit = 200, before = 0 } = {}) {
      let q = col("audit");
      if (before > 0) q = q.where("at", "<", before);
      return (await q.orderBy("at", "desc").limit(limit).get()).docs.map(fromDoc).filter(Boolean);
    },
    async updateAttempt(id, fn) {
      const ref = col("attempts").doc(docId(id));
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const next = fn(fromDoc(snap));
        tx.set(ref, withTtl(next));
        return next;
      });
    },
    async getAttempt(id) { return fromDoc(await col("attempts").doc(docId(id)).get()); },
    async getSettings() { return fromDoc(await col("settings").doc("retention").get()); },
    async setSettings(s) { await col("settings").doc("retention").set(clean(s)); },
    async purgeAudit(cutoff, max, dryRun) {
      const snap = await col("audit").where("at", "<", cutoff).limit(max).get();
      if (!dryRun) await deleteDocs(snap.docs);
      return snap.size;
    },
    async purgeAttempts(now, max, dryRun) {
      const snap = await col("attempts").where("expireAtMs", "<", now).limit(max).get();
      if (!dryRun) await deleteDocs(snap.docs);
      return snap.size;
    },
  };
}

async function getMany(store, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 16) {
    const slice = keys.slice(i, i + 16);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => out.push([k, vals[j]]));
  }
  return out;
}

function kvBackend(store) {
  return {
    kind: "kv",
    async getMember(email) { return store.get(K_MEMBER + normEmail(email)); },
    async putMember(rec) { await store.set(K_MEMBER + normEmail(rec.email), clean(rec)); return rec; },
    async delMember(email) { await store.del(K_MEMBER + normEmail(email)); },
    async listMembers() { return (await getMany(store, await store.list(K_MEMBER))).map(([, v]) => v).filter(Boolean); },
    async touchMember(email, at) {
      await updateKey(store, K_MEMBER + normEmail(email), cur => (cur ? { ...cur, lastSeenAt: at } : undefined));
    },
    async getSession(id) { return store.get(K_SESSION + id); },
    async putSession(rec) { await store.set(K_SESSION + rec.id, clean(rec)); return rec; },
    async patchSession(id, fields) {
      return Boolean(await updateKey(store, K_SESSION + id, cur => (cur ? { ...cur, ...clean(fields) } : undefined)));
    },
    async listSessions(email) {
      const all = (await getMany(store, await store.list(K_SESSION))).map(([, v]) => v).filter(Boolean);
      return email ? all.filter(s => normEmail(s.email) === normEmail(email)) : all;
    },
    async purgeSessions(now, max, dryRun) {
      const old = [];
      for (const [k, v] of await getMany(store, await store.list(K_SESSION))) {
        if (old.length >= max) break;
        if (!v || (v.expireAtMs || 0) < now) old.push(k);
      }
      if (!dryRun) for (const k of old) await store.del(k);
      return old.length;
    },
    async addAudit(entry) { await store.set(K_AUDIT + entry.id, clean(entry)); },
    async listAudit({ limit = 200, before = 0 } = {}) {
      const keys = (await store.list(K_AUDIT)).sort().reverse();
      const out = [];
      for (let i = 0; i < keys.length && out.length < limit; i += 64) {
        for (const [, v] of await getMany(store, keys.slice(i, i + 64))) {
          if (v && (!before || v.at < before)) out.push(v);
          if (out.length >= limit) break;
        }
      }
      return out;
    },
    async updateAttempt(id, fn) {
      return updateKey(store, K_ATTEMPT + id, cur => fn(cur || null));
    },
    async getAttempt(id) { return store.get(K_ATTEMPT + id); },
    async getSettings() { return store.get(K_SETTINGS); },
    async setSettings(s) { await store.set(K_SETTINGS, clean(s)); },
    async purgeAudit(cutoff, max, dryRun) {
      const keys = (await store.list(K_AUDIT)).sort();
      const old = [];
      for (const [k, v] of await getMany(store, keys.slice(0, max * 2))) {
        if (old.length >= max) break;
        if (!v || v.at < cutoff) old.push(k);
      }
      if (!dryRun) for (const k of old) await store.del(k);
      return old.length;
    },
    async purgeAttempts(now, max, dryRun) {
      const old = [];
      for (const [k, v] of await getMany(store, await store.list(K_ATTEMPT))) {
        if (old.length >= max) break;
        if (!v || (v.expireAtMs || 0) < now) old.push(k);
      }
      if (!dryRun) for (const k of old) await store.del(k);
      return old.length;
    },
  };
}

/** One backend per store instance. */
export async function staffBackend(store) {
  if (store.__staffBe) return store.__staffBe;
  const db = await firestoreFor(store);
  store.__staffBe = db ? firestoreBackend(db) : kvBackend(store);
  return store.__staffBe;
}

/* ------------------------------------------------------------------ member cache */

const memberCache = new Map();
const sessionCache = new Map();
let pendingCache = null;

export function resetStaffCaches() {
  memberCache.clear();
  sessionCache.clear();
  pendingCache = null;
  memAttempts.clear();
  settingsCache = null;
  try { reviewRedeemLimiter.reset(); } catch { /* defined later in module load */ }
}

function invalidateMember(email) {
  memberCache.delete(normEmail(email));
  pendingCache = null;
}

async function cachedMember(store, email, now) {
  const key = normEmail(email);
  const hit = memberCache.get(key);
  if (hit && now - hit.at < ROLE_CACHE_MS) return hit.rec;
  const be = await staffBackend(store);
  const rec = await be.getMember(key);
  memberCache.set(key, { at: now, rec: rec || null });
  return rec || null;
}

async function cachedSession(store, id, now) {
  const hit = sessionCache.get(id);
  if (hit && now - hit.at < SESSION_CACHE_MS) return hit.rec;
  const be = await staffBackend(store);
  const rec = (await be.getSession(id)) || null;
  sessionCache.set(id, { at: now, rec });
  if (sessionCache.size > 2000) {
    for (const [k, v] of sessionCache) if (now - v.at >= SESSION_CACHE_MS) sessionCache.delete(k);
  }
  return rec;
}

async function pendingCount(store, now) {
  if (pendingCache && now - pendingCache.at < PENDING_CACHE_MS) return pendingCache.n;
  const be = await staffBackend(store);
  const n = (await be.listMembers()).filter(m => m && m.status === "pending" && !isAdminEmail(m.email)).length;
  pendingCache = { at: now, n };
  return n;
}

/* ------------------------------------------------------------------ settings */

let settingsCache = null;

export function normalizeRetention(raw) {
  const out = { ...RETENTION_DEFAULTS };
  for (const [k, [lo, hi]] of Object.entries(RETENTION_LIMITS)) {
    const v = Math.round(Number(raw && raw[k]));
    if (Number.isFinite(v) && v > 0) out[k] = Math.max(lo, Math.min(hi, v));
  }
  return out;
}

export async function getRetention(store, now = Date.now()) {
  if (settingsCache && now - settingsCache.at < 60000) return settingsCache.value;
  let value = { ...RETENTION_DEFAULTS };
  try {
    const be = await staffBackend(store);
    value = normalizeRetention(await be.getSettings());
  } catch { /* defaults */ }
  settingsCache = { at: now, value };
  return value;
}

/* ------------------------------------------------------------------ audit */

/**
 * Best effort: never fails or delays the staff action by more than ~1.5 s.
 * `ctx` = the resolved staff identity (or `{ email }` for sign-in attempts).
 */
export async function audit(store, req, ctx, action, { target = "", ok = true, detail } = {}) {
  const now = Date.now();
  const r = await bestEffort(async () => {
    const be = await staffBackend(store);
    const retention = await getRetention(store, now);
    const entry = {
      id: `${String(now).padStart(14, "0")}-${crypto.randomBytes(4).toString("hex")}`,
      at: now,
      who: String((ctx && (ctx.actor || ctx.email)) || "anonymous").slice(0, 160),
      role: (ctx && ctx.role) || "",
      action: String(action).slice(0, 60),
      target: String(target || "").slice(0, 200),
      ok: Boolean(ok),
      ipHash: req ? ipHashFor(req) : "",
      expireAtMs: now + retention.auditDays * DAY_MS,
    };
    if (detail !== undefined) entry.detail = typeof detail === "string" ? detail.slice(0, 300) : clean(detail);
    await be.addAudit(entry);
    return entry;
  }, { ms: 1500, label: "staff audit" });
  return r.ok ? r.value : null;
}

/* ------------------------------------------------------------------ cookies */

function cookieAttrs(maxAgeSec) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}${secure}`;
}

function setStaffCookie(res, ticket) {
  if (!res) return;
  appendCookie(res, `${STAFF_COOKIE}=${encodeSigned(ticket)}; ${cookieAttrs(SESSION_COOKIE_MS / 1000)}`);
}

/** Cookie value for a device session; `iat` = this rotation (the value changes daily with use). */
function sessionTicket(rec, now) {
  return { v: 3, kind: "staff", email: rec.email, sid: rec.id, iat: now, n: crypto.randomBytes(6).toString("base64url"), epoch: rec.epoch || 0 };
}

export function clearStaffCookie(res) {
  if (res) appendCookie(res, `${STAFF_COOKIE}=; ${cookieAttrs(0)}`);
}

function clearStaffOtpCookie(res) {
  if (res) appendCookie(res, `${STAFF_OTP_COOKIE}=; ${cookieAttrs(0)}`);
}

/**
 * Valid ticket, `{ expired: "idle" | "max" }`, or null.
 * - v4 `staff_review` = one-time review invite session (checked against `aym:staff:review:*`)
 * - v3 = device session (checked against its `staff_sessions` record)
 * - v2 = a pre-trusted-device ticket (12 h idle / 7 days), upgraded on use
 */
export function readStaffSession(req, now = staffClock.now()) {
  const raw = parseCookies(req)[STAFF_COOKIE];
  if (!raw) return null;
  let t;
  try { t = decodeSigned(raw); } catch { return null; }
  if (!t) return null;
  if (t.v === 4 && t.kind === "staff_review") {
    if (!t.rid || typeof t.rid !== "string") return null;
    if ((t.exp || 0) > 0 && now > t.exp) return { expired: "max", review: true };
    return t;
  }
  if ((t.v !== 2 && t.v !== 3) || t.kind !== "staff" || !EMAIL_RE.test(String(t.email || ""))) return null;
  if (t.v === 2) {
    if (now - (t.iat || 0) > LEGACY_MAX_MS) return { expired: "max" };
    if (now - (t.seen || 0) > LEGACY_IDLE_MS) return { expired: "idle" };
    return t;
  }
  if (!t.sid) return null;
  if (now - (t.iat || 0) > SESSION_IDLE_MS) return { expired: "idle" };
  return t;
}

function reviewTicket(rid, now, exp) {
  return { v: 4, kind: "staff_review", rid, iat: now, exp, n: crypto.randomBytes(6).toString("base64url") };
}

function setReviewCookie(res, ticket, maxAgeSec) {
  if (!res) return;
  appendCookie(res, `${STAFF_COOKIE}=${encodeSigned(ticket)}; ${cookieAttrs(maxAgeSec)}`);
}

function reviewInviteBaseUrl(req) {
  const fromEnv = String(env().PUBLIC_SITE_URL || env().SITE_ORIGIN || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const host = req && req.headers && String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (host) {
    const proto = String((req.headers["x-forwarded-proto"] || "https")).split(",")[0].trim() || "https";
    return `${proto}://${host}`;
  }
  return "https://ayushmarg.vercel.app";
}

function clampReviewTtlMs(rawMinutes) {
  const mins = Number(rawMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return REVIEW_DEFAULT_TTL_MS;
  return Math.max(REVIEW_MIN_TTL_MS, Math.min(REVIEW_MAX_TTL_MS, Math.round(mins * 60 * 1000)));
}

/** Redeem attempts per IP: 20 / 15 min (success and failure both count). */
const reviewRedeemLimiter = makeWindowLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

/* ------------------------------------------------------------------ device sessions */

/** Coarse browser label for the device list (the full user agent is never stored). */
export function browserLabel(ua) {
  const s = String(ua || "");
  const browser = /Edg(e|A|iOS)?\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows"
    : /CrOS/.test(s) ? "ChromeOS" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  return browser && os ? `${browser} on ${os}` : browser || os || "Unknown browser";
}

const sessionExpiry = at => at + SESSION_IDLE_MS + DAY_MS;

async function createSession(store, req, { email, role, epoch, now }) {
  const be = await staffBackend(store);
  const id = crypto.randomBytes(16).toString("base64url");
  const ua = String((req && req.headers && req.headers["user-agent"]) || "").slice(0, 500);
  const rec = {
    id, device: idHash("dev", id).slice(0, 12), email, role, epoch: epoch || 0,
    createdAt: now, lastSeenAt: now, rotatedAt: now,
    uaHash: ua ? idHash("ua", ua).slice(0, 16) : "", browser: browserLabel(ua), ipHash: req ? ipHashFor(req) : "",
    revokedAt: 0, revokedBy: "", revokeReason: "", expireAtMs: sessionExpiry(now),
  };
  await be.putSession(rec);
  sessionCache.set(id, { at: now, rec });
  return rec;
}

/** Why a device session no longer counts ("" = still valid). */
function sessionEnd(rec, t, email, now) {
  if (!rec || normEmail(rec.email) !== email) return "unknown";
  if (rec.revokedAt) return "revoked";
  if (now - (rec.lastSeenAt || 0) > SESSION_IDLE_MS) return "idle";
  if ((t.iat || 0) < (rec.rotatedAt || 0) - SESSION_STALE_MS) return "stale";
  return "";
}

/** Rolls the device: lastSeen at most every 10 min, a fresh cookie value at most daily. */
async function keepAlive(store, res, t, rec, member, now) {
  const rotate = now - (t.iat || 0) >= SESSION_ROTATE_MS;
  if (!rotate && now - (rec.lastSeenAt || 0) < SESSION_TOUCH_MS) return;
  const fields = { lastSeenAt: now, expireAtMs: sessionExpiry(now), ...(rotate ? { rotatedAt: now } : {}) };
  const r = await bestEffort(async () => {
    const be = await staffBackend(store);
    const ok = await be.patchSession(rec.id, fields);
    if (ok && member) await be.touchMember(rec.email, now);
    return ok;
  }, { ms: 1500, label: "staff session" });
  if (!r.ok || !r.value) return;
  sessionCache.set(rec.id, { at: now, rec: { ...rec, ...fields } });
  if (rotate) {
    try { setStaffCookie(res, { ...sessionTicket(rec, now), epoch: t.epoch || 0 }); } catch { /* keep the old cookie */ }
  }
}

function dropSession(id) { sessionCache.delete(id); }

async function revokeSessions(store, sessions, { by, reason, now }) {
  const be = await staffBackend(store);
  let n = 0;
  for (const s of sessions) {
    if (!s || s.revokedAt) continue;
    if (await be.patchSession(s.id, { revokedAt: now, revokedBy: by, revokeReason: reason, expireAtMs: now + DAY_MS })) n += 1;
    dropSession(s.id);
  }
  return n;
}

function readStaffOtp(req) {
  const raw = parseCookies(req)[STAFF_OTP_COOKIE];
  if (!raw) return null;
  const t = decodeSigned(raw);
  if (!t || t.v !== 1 || t.purpose !== "staff") return null;
  return t;
}

function setStaffOtpCookie(res, ticket) {
  const maxAge = Math.ceil(((ticket.exp || 0) - Date.now()) / 1000);
  appendCookie(res, `${STAFF_OTP_COOKIE}=${encodeSigned(ticket)}; ${cookieAttrs(maxAge)}`);
}

/* ------------------------------------------------------------------ identity */

const NOT_STAFF = Object.freeze({ ok: false, status: "none", role: "", email: "" });

/**
 * Who is calling: the service token, else the staff cookie → its device record (not revoked, used in
 * the last 90 days) → the member record (≤ 30 s cache each). Rolls the device while it is in use.
 * @returns {{ ok, status, role, email, actor?, via?, sid? }}  ok = may use staff ops
 */
export async function resolveStaff(req, res, store, { now = staffClock.now() } = {}) {
  const auth = String((req && req.headers && req.headers.authorization) || "");
  if (/^Bearer\s+/i.test(auth)) {
    const tok = serviceToken();
    if (tok && safeEqual(auth.replace(/^Bearer\s+/i, "").trim(), tok)) {
      return { ok: true, status: "approved", role: "admin", email: "", actor: "service", via: "service" };
    }
  }
  const t = readStaffSession(req, now);
  if (!t) return NOT_STAFF;
  if (t.expired) {
    clearStaffCookie(res);
    return { ...NOT_STAFF, status: "expired", expired: t.expired };
  }
  if (t.v === 4 && t.kind === "staff_review") {
    let rec = null;
    try { rec = await store.get(K_REVIEW + t.rid); }
    catch (err) {
      console.error("[aym-staff] review lookup failed:", err && err.message ? err.message : err);
      return { ...NOT_STAFF, status: "unavailable" };
    }
    const exp = Number((rec && (rec.sessionExpireAtMs || rec.expireAtMs)) || t.exp || 0);
    if (!rec || !rec.redeemedAt || rec.revokedAt || exp <= now) {
      clearStaffCookie(res);
      return { ...NOT_STAFF, status: "expired", expired: "review" };
    }
    return {
      ok: true, status: "approved", role: "review", email: "", actor: "review", via: "review",
      reviewOnly: true, rid: t.rid, expiresAt: exp,
    };
  }
  const email = normEmail(t.email);
  const admin = isAdminEmail(email);
  let member = null;
  try { member = await cachedMember(store, email, now); }
  catch (err) {
    console.error("[aym-staff] member lookup failed:", err && err.message ? err.message : err);
    if (!admin) return { ...NOT_STAFF, email, status: "unavailable" };
  }
  let session = null;
  if (t.v === 3) {
    let known = true;
    try { session = await cachedSession(store, t.sid, now); }
    catch (err) {
      known = false;
      console.error("[aym-staff] session lookup failed:", err && err.message ? err.message : err);
      if (!admin) return { ...NOT_STAFF, email, status: "unavailable" };
    }
    const ended = known ? sessionEnd(session, t, email, now) : "";
    if (ended) {
      clearStaffCookie(res);
      return { ...NOT_STAFF, status: "expired", expired: ended };
    }
  }
  let status = admin ? "approved" : (member ? member.status : "pending");
  if (!admin && member && (member.epoch || 0) !== (t.epoch || 0)) status = member.status === "approved" ? "signed-out" : member.status;
  const role = admin ? "admin" : "co-admin";
  if (res && (status === "approved" || status === "pending")) {
    if (t.v === 2) {
      const r = await bestEffort(() => createSession(store, req, { email, role, epoch: t.epoch, now }), { ms: 2000, label: "staff session upgrade" });
      if (r.ok && r.value) {
        session = r.value;
        try { setStaffCookie(res, sessionTicket(session, now)); } catch { /* keep the old cookie */ }
      }
    } else if (session) {
      await keepAlive(store, res, t, session, member, now);
    }
  }
  return {
    ok: status === "approved", status, role, email, actor: email, via: "session",
    sid: session ? session.id : "", seen: session ? Math.max(session.lastSeenAt || 0, now) : t.seen,
    displayName: String((member && member.displayName) || "").trim(),
  };
}

/**
 * The single gate for staff ops. `role: "admin"` also refuses co-admins.
 * @returns {{ ok: true, ctx } | { ok: false, code, body, ctx }}
 */
export function staffRefusal(ctx) {
  const status = (ctx && ctx.status) || "none";
  const code = status === "pending" ? "pending" : status === "expired" ? "session_expired"
    : ["denied", "revoked", "signed-out"].includes(status) ? status.replace("-", "_") : "staff_only";
  return { error: "staff only", code, ...(status === "pending" ? { message: "Waiting for admin approval." } : {}) };
}

export async function requireStaff(req, res, store, { role = "co-admin", now = staffClock.now() } = {}) {
  const ctx = await resolveStaff(req, res, store, { now });
  if (!ctx.ok) return { ok: false, ctx, code: 403, body: staffRefusal(ctx) };
  if (role === "admin" && ctx.role !== "admin") {
    return { ok: false, ctx, code: 403, body: { error: "Admin only — ask the admin to do this.", code: "admin_only" } };
  }
  return { ok: true, ctx };
}

/* ------------------------------------------------------------------ attempts / lockout */

const memAttempts = new Map();

function attemptState(rec, now) {
  const fails = (rec && Array.isArray(rec.fails) ? rec.fails : []).filter(t => now - t < LOCK_WINDOW_MS);
  const lockedUntil = rec && rec.lockedUntil > now ? rec.lockedUntil : 0;
  return { fails, lockedUntil };
}

function nextFail(rec, now) {
  const { fails, lockedUntil } = attemptState(rec, now);
  const all = [...fails, now];
  const until = all.length >= LOCK_MAX_FAILS ? Math.max(lockedUntil, now + LOCK_MS) : lockedUntil;
  return { fails: all.slice(-20), lockedUntil: until, updatedAt: now, expireAtMs: Math.max(until, now + LOCK_WINDOW_MS) + DAY_MS };
}

async function readAttempt(be, id, now) {
  const mem = attemptState(memAttempts.get(id), now);
  let stored = { fails: [], lockedUntil: 0 };
  try { stored = attemptState(await be.getAttempt(id), now); } catch { /* memory only */ }
  return {
    fails: stored.fails.length >= mem.fails.length ? stored.fails : mem.fails,
    lockedUntil: Math.max(stored.lockedUntil, mem.lockedUntil),
  };
}

async function recordFail(be, id, now) {
  const mem = nextFail(memAttempts.get(id), now);
  memAttempts.set(id, mem);
  if (memAttempts.size > 5000) {
    for (const [k, v] of memAttempts) if ((v.expireAtMs || 0) < now) memAttempts.delete(k);
  }
  try {
    const stored = await be.updateAttempt(id, cur => nextFail(cur, now));
    return stored && stored.fails.length >= mem.fails.length ? stored : mem;
  } catch {
    return mem;
  }
}

async function clearAttempt(be, id, now) {
  memAttempts.delete(id);
  try { await be.updateAttempt(id, () => ({ fails: [], lockedUntil: 0, updatedAt: now, expireAtMs: now + DAY_MS })); } catch { /* fine */ }
}

export function lockedMessage(retryInSec) {
  const min = Math.max(1, Math.ceil(retryInSec / 60));
  return `Too many attempts — try again in ${min} minute${min === 1 ? "" : "s"}.`;
}

/* ------------------------------------------------------------------ sign-in ops */

/** Step 2 of the dialog: passcode + email → email code. */
export async function staffStart(msg, store, req, res, { now = Date.now() } = {}) {
  if (!passcodeConfigured()) return { code: 503, body: { error: "Staff access is not configured on this server." } };
  const email = normEmail(msg && msg.email);
  const passcode = String((msg && msg.passcode) || "").trim();
  if (!passcode) return { code: 400, body: { error: "Enter the staff passcode.", code: "bad_passcode" } };
  if (!EMAIL_RE.test(email)) return { code: 400, body: { error: "Enter a valid email address.", code: "bad_email" } };

  const be = await staffBackend(store);
  const ids = [`ip-${idHash("ip", clientIp(req))}`, `em-${idHash("em", email)}`];
  const states = await Promise.all(ids.map(id => readAttempt(be, id, now)));
  const lockedUntil = Math.max(...states.map(s => s.lockedUntil));
  if (lockedUntil > now) {
    const retryIn = Math.ceil((lockedUntil - now) / 1000);
    await audit(store, req, { email }, "passcode.locked", { target: email, ok: false });
    return { code: 429, body: { error: lockedMessage(retryIn), code: "locked", retryIn } };
  }

  if (!passcodeMatches(passcode)) {
    const after = await Promise.all(ids.map(id => recordFail(be, id, now)));
    const fails = Math.max(...after.map(a => a.fails.length));
    const until = Math.max(...after.map(a => a.lockedUntil || 0));
    await audit(store, req, { email }, "passcode.fail", { target: email, ok: false, detail: { fails } });
    await sleep(failureDelayMs(fails));
    if (until > now) {
      const retryIn = Math.ceil((until - now) / 1000);
      return { code: 429, body: { error: lockedMessage(retryIn), code: "locked", retryIn } };
    }
    const left = Math.max(0, LOCK_MAX_FAILS - fails);
    return {
      code: 403,
      body: { error: `That passcode does not match.${left <= 2 ? ` ${left} attempt${left === 1 ? "" : "s"} left before a 15-minute lock.` : ""}`, code: "bad_passcode", attemptsLeft: left },
    };
  }
  await clearAttempt(be, ids[1], now);
  await audit(store, req, { email }, "passcode.ok", { target: email });

  let existing = null;
  try { existing = readStaffOtp(req); } catch { existing = null; }
  if (existing && existing.email === email && now - (existing.lastSentAt || 0) < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    return { code: 429, body: { error: `Please wait ${wait}s before requesting another code.`, retryIn: wait, code: "cooldown" } };
  }
  const gate = await reserveOtpSend(store, email, now);
  if (!gate.ok) {
    const wait = gate.retryIn || 60;
    return { code: 429, body: { error: `Several codes were already sent to this email. Check your inbox (and spam), or try again in ${Math.ceil(wait / 60)} min.`, retryIn: wait, code: "email_rate" } };
  }
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  let ticket;
  try {
    ticket = resignOtpTicket(makeOtpTicket({ email, otp, profile: null, now, lastSentAt: now }), { purpose: "staff" });
  } catch (err) {
    await releaseOtpSend(store, email, now);
    console.error("[aym-staff] code sign failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Staff sign-in is not configured on this server." } };
  }
  let delivery;
  try {
    ({ delivery } = await sendOrQueue(store, {
      send: () => sendStaffCodeEmail(email, otp),
      template: "staff-otp",
      to: email,
      payload: {},
      otp,
      now,
    }));
  } catch (err) {
    console.error("[aym-staff] code email failed:", err && err.message ? err.message : err);
    delivery = "queued";
  }
  if (!res) return { code: 500, body: { error: "Staff sign-in is not configured on this server." } };
  setStaffOtpCookie(res, ticket);
  return { code: 200, body: { ok: true, delivery, resendIn: RESEND_COOLDOWN_MS / 1000, expiresIn: OTP_TTL_MS / 1000 } };
}

async function notifyAdmins(store, requester, req) {
  const host = req && (req.headers["x-forwarded-host"] || req.headers.host);
  const proto = process.env.VERCEL ? "https" : (req && req.headers["x-forwarded-proto"]) || "http";
  const link = host ? `${proto}://${host}/staff#access` : "/staff";
  for (const admin of adminEmails()) {
    await bestEffort(() => sendOrQueue(store, {
      send: () => sendStaffRequestEmail(admin, requester, link),
      template: "staff-request",
      to: admin,
      payload: { requesterEmail: requester, link },
    }), { ms: 8000, label: "staff request mail" });
  }
}

/** Step 3: email code → member record + a trusted-device session. */
export async function staffVerify(msg, store, req, res, { now = staffClock.now() } = {}) {
  const email = normEmail(msg && msg.email);
  const entered = String((msg && msg.otp) || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(entered)) return { code: 400, body: { error: "Enter the 6-digit code from your email." } };
  let ticket;
  try { ticket = readStaffOtp(req); } catch { return { code: 500, body: { error: "Staff sign-in is not configured on this server." } }; }
  if (!ticket || ticket.email !== email) return { code: 400, body: { error: "No code is waiting for this email. Start again.", code: "no_code" } };
  if (now > (ticket.exp || 0)) {
    clearStaffOtpCookie(res);
    return { code: 400, body: { error: "That code has expired. Request a new one.", code: "expired" } };
  }
  if (!otpTicketMatches(ticket, email, entered)) {
    const attempts = (ticket.attempts || 0) + 1;
    await audit(store, req, { email }, "email.code_fail", { target: email, ok: false });
    if (attempts >= OTP_MAX_ATTEMPTS) {
      clearStaffOtpCookie(res);
      return { code: 429, body: { error: "Too many wrong codes. Start again.", code: "too_many_codes" } };
    }
    if (res) setStaffOtpCookie(res, resignOtpTicket(ticket, { attempts }));
    return { code: 400, body: { error: "That code does not match. Check the latest email.", code: "bad_code" } };
  }

  const be = await staffBackend(store);
  const admin = isAdminEmail(email);
  let member = await be.getMember(email);
  let isNew = false;
  if (admin) {
    const mapped = ADMIN_DISPLAY[email] || "";
    const stored = String((member && member.displayName) || "").trim();
    const knownName = mapped || (isDroppedHallPass({ name: stored }) ? "" : stored);
    member = {
      ...(member || {}),
      email, role: "admin", status: "approved",
      requestedAt: (member && member.requestedAt) || now,
      decidedAt: (member && member.decidedAt) || now,
      decidedBy: (member && member.decidedBy) || "admin list",
      lastSeenAt: now,
      epoch: (member && member.epoch) || 0,
    };
    if (knownName && !knownName.includes("@")) member.displayName = knownName;
  } else if (!member) {
    isNew = true;
    member = { email, role: "co-admin", status: "pending", requestedAt: now, decidedAt: 0, decidedBy: "", lastSeenAt: now, epoch: 0 };
  } else {
    member = { ...member, role: "co-admin", lastSeenAt: now };
  }
  await be.putMember(member);
  invalidateMember(email);
  let session;
  try {
    session = await createSession(store, req, { email, role: member.role, epoch: member.epoch, now });
  } catch (err) {
    console.error("[aym-staff] session create failed:", err && err.message ? err.message : err);
    return { code: 503, body: { error: "Could not finish signing in. Try the same code again in a moment.", code: "session_unavailable" } };
  }
  clearStaffOtpCookie(res);
  await audit(store, req, { email, role: member.role }, "email.verified", { target: email, detail: { status: member.status, device: session.browser } });
  if (isNew) {
    await audit(store, req, { email, role: "co-admin" }, "access.request", { target: email });
    await notifyAdmins(store, email, req);
  }
  setStaffCookie(res, sessionTicket(session, now));
  return { code: 200, body: { ok: true, email, role: member.role, status: member.status, staff: member.status === "approved" } };
}

/** whoami / staffMe: identity for the UI (never any staff data). */
export async function staffMe(store, req, res, { now = staffClock.now(), ctx: known } = {}) {
  const ctx = known || await resolveStaff(req, res, store, { now });
  const body = { staff: ctx.ok, email: ctx.email || "", role: ctx.ok ? ctx.role : "", status: ctx.status };
  if (ctx.via === "service") body.service = true;
  if (ctx.reviewOnly) {
    body.reviewOnly = true;
    body.expiresAt = ctx.expiresAt || 0;
    return body;
  }
  if (ctx.ok) {
    const displayName = staffIdentityName({ email: ctx.email, displayName: ctx.displayName });
    if (displayName) body.displayName = displayName;
  }
  if (ctx.ok && ctx.role === "admin") {
    try { body.pendingCount = await pendingCount(store, now); } catch { body.pendingCount = 0; }
    body.weakPasscode = passcodeIsWeak();
  }
  if (ctx.via === "session" && ctx.sid) {
    body.trustedDevice = true;
    body.expiresAt = Math.max(ctx.seen || 0, now) + SESSION_IDLE_MS;
  }
  return body;
}

/** Sign out on this device: its session record is revoked, so a copied cookie stops working too. */
export async function staffLogout(store, req, res, { now = staffClock.now() } = {}) {
  const t = readStaffSession(req, now);
  clearStaffCookie(res);
  clearStaffOtpCookie(res);
  if (!t) return;
  if (t.v === 4 && t.kind === "staff_review" && t.rid) {
    await bestEffort(() => updateKey(store, K_REVIEW + t.rid, cur => (cur ? { ...cur, revokedAt: now } : undefined)), {
      ms: 2000, label: "review signout",
    });
    await audit(store, req, { email: "review", role: "review" }, "review.signout", {
      target: "review", detail: { prefix: String(t.rid).slice(0, 8) },
    });
    return;
  }
  if (!t.email) return;
  const email = normEmail(t.email);
  if (t.sid) {
    await bestEffort(async () => {
      const be = await staffBackend(store);
      const rec = await be.getSession(t.sid);
      if (rec && normEmail(rec.email) === email) await revokeSessions(store, [rec], { by: email, reason: "signout", now });
    }, { ms: 2000, label: "staff signout" });
    dropSession(t.sid);
  }
  await audit(store, req, { email, role: isAdminEmail(email) ? "admin" : "co-admin" }, "session.signout", { target: email });
}

/* ------------------------------------------------------------------ one-time review invites */

/**
 * Admin creates a single-use review URL. The raw token is returned once in `url` (and never stored).
 * Stored server-side as sha256 under `aym:staff:review:*`. Audit logs only the hash prefix.
 */
export async function staffReviewInviteCreate(msg, store, req, ctx, { now = staffClock.now() } = {}) {
  if (!ctx || !ctx.ok || ctx.role !== "admin") {
    return { code: 403, body: { error: "Admin only — ask the admin to do this.", code: "admin_only" } };
  }
  const ttlMs = clampReviewTtlMs(msg && msg.ttlMinutes);
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = sha256(token);
  const rec = {
    tokenHash: hash,
    createdAt: now,
    expireAtMs: now + ttlMs,
    createdBy: String(ctx.actor || ctx.email || "admin").slice(0, 160),
    redeemedAt: 0,
    revokedAt: 0,
    sessionExpireAtMs: 0,
  };
  await store.set(K_REVIEW + hash, clean(rec));
  const prefix = hash.slice(0, 8);
  await audit(store, req, ctx, "review.invite", { target: "review", detail: { prefix, ttlMs } });
  const url = `${reviewInviteBaseUrl(req)}/#staff?review=${token}`;
  return { code: 200, body: { ok: true, url, expiresAt: rec.expireAtMs, ttlMs, prefix } };
}

/**
 * Public redeem: first successful use sets a short-lived review cookie and consumes the invite.
 * Later visits / expired / revoked → "link already used or expired". Rate-limited per IP.
 */
export async function staffReviewRedeem(msg, store, req, res, { now = staffClock.now() } = {}) {
  const limited = reviewRedeemLimiter.hit(`ip:${clientIp(req)}`, now);
  if (!limited.ok) {
    return { code: 429, body: { error: lockedMessage(limited.retryIn), code: "locked", retryIn: limited.retryIn } };
  }
  const token = String((msg && msg.token) || "").trim();
  if (!token || token.length < 20 || token.length > 200) {
    await audit(store, req, { email: "anonymous", role: "" }, "review.redeem", { target: "review", ok: false, detail: { reason: "bad_token" } });
    return { code: 410, body: { error: "This review link is already used or expired.", code: "review_gone" } };
  }
  const hash = sha256(token);
  const prefix = hash.slice(0, 8);
  let outcome = "missing";
  let rec = null;
  try {
    rec = await updateKey(store, K_REVIEW + hash, cur => {
      if (!cur) { outcome = "missing"; return undefined; }
      if (cur.revokedAt) { outcome = "revoked"; return undefined; }
      if ((cur.expireAtMs || 0) <= now) { outcome = "expired"; return undefined; }
      if (cur.redeemedAt) { outcome = "used"; return undefined; }
      outcome = "ok";
      return { ...cur, redeemedAt: now, sessionExpireAtMs: cur.expireAtMs };
    });
  } catch (err) {
    console.error("[aym-staff] review redeem failed:", err && err.message ? err.message : err);
    return { code: 503, body: { error: "Staff access is temporarily unavailable. Try again shortly." } };
  }
  if (outcome !== "ok" || !rec) {
    await audit(store, req, { email: "anonymous", role: "" }, "review.redeem", {
      target: "review", ok: false, detail: { prefix, reason: outcome },
    });
    try {
      const { raiseWacAlert } = await import("./wacDelegates.js");
      await raiseWacAlert(store, { kind: `review-redeem-${outcome}`, wacId: "", emailLower: "", now });
    } catch { /* never block redeem on alert */ }
    return { code: 410, body: { error: "This review link is already used or expired.", code: "review_gone" } };
  }
  const exp = Number(rec.sessionExpireAtMs || rec.expireAtMs || now);
  const maxAge = Math.max(1, Math.ceil((exp - now) / 1000));
  setReviewCookie(res, reviewTicket(hash, now, exp), maxAge);
  await audit(store, req, { email: "review", role: "review" }, "review.redeem", {
    target: "review", detail: { prefix },
  });
  return {
    code: 200,
    body: { ok: true, staff: true, role: "review", reviewOnly: true, expiresAt: exp },
  };
}

/* ------------------------------------------------------------------ device list / remote sign-out */

function deviceView(s, currentSid) {
  return {
    device: s.device, email: s.email, browser: s.browser || "Unknown browser",
    createdAt: s.createdAt || 0, lastSeenAt: s.lastSeenAt || 0, current: Boolean(currentSid) && s.id === currentSid,
  };
}

async function activeSessions(store, email, now) {
  const be = await staffBackend(store);
  const all = await be.listSessions(email);
  const members = new Map();
  const out = [];
  for (const s of all) {
    if (!s || !s.id || s.revokedAt || now - (s.lastSeenAt || 0) > SESSION_IDLE_MS) continue;
    const em = normEmail(s.email);
    if (!isAdminEmail(em)) {
      if (!members.has(em)) members.set(em, await be.getMember(em));
      const m = members.get(em);
      if (!m || (m.epoch || 0) !== (s.epoch || 0) || m.status === "denied" || m.status === "revoked") continue;
    }
    out.push(s);
  }
  return out.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
}

/** Which email a staff caller may manage devices for: the admin any, everyone else only their own. */
function deviceTarget(msg, ctx) {
  const asked = normEmail(msg && msg.email);
  if (ctx.role === "admin") return { ok: true, email: asked };
  if (asked && asked !== normEmail(ctx.email)) return { ok: false };
  return { ok: true, email: normEmail(ctx.email) };
}

/** staffSessions {email?}: active devices (admin: everyone or one email; co-admin: own). */
export async function staffSessionsList(msg, store, ctx, { now = staffClock.now() } = {}) {
  const target = deviceTarget(msg, ctx);
  if (!target.ok) return { code: 403, body: { error: "Admin only — ask the admin to do this.", code: "admin_only" } };
  const sessions = await activeSessions(store, target.email, now);
  return { code: 200, body: { ok: true, sessions: sessions.map(s => deviceView(s, ctx.sid)) } };
}

/** staffSessionRevoke {email, device} / staffSessionRevokeAll {email?}: sign devices out remotely. */
export async function staffSessionRevoke(msg, store, req, ctx, { all = false, now = staffClock.now() } = {}) {
  const target = deviceTarget(msg, ctx);
  if (!target.ok) return { code: 403, body: { error: "Admin only — ask the admin to do this.", code: "admin_only" } };
  const email = target.email || normEmail(ctx.email);
  if (!EMAIL_RE.test(email)) return { code: 400, body: { error: "Choose whose devices to sign out." } };
  const sessions = await activeSessions(store, email, now);
  const device = String((msg && msg.device) || "");
  const doomed = all ? sessions : sessions.filter(s => s.device === device);
  if (!all && !doomed.length) return { code: 404, body: { error: "That device is already signed out." } };
  const by = ctx.actor || ctx.email || "admin";
  const count = await revokeSessions(store, doomed, { by, reason: all ? "signout_all" : "signout_device", now });
  const signedOutSelf = doomed.some(s => s.id === ctx.sid);
  await audit(store, req, ctx, all ? "session.revoke_all" : "session.revoke", {
    target: email, detail: all ? { count } : { device: doomed[0].browser || "", count },
  });
  return { code: 200, body: { ok: true, count, signedOutSelf } };
}

/* ------------------------------------------------------------------ admin ops */

function memberView(m) {
  return {
    email: m.email, role: isAdminEmail(m.email) ? "admin" : "co-admin", status: m.status,
    requestedAt: m.requestedAt || 0, decidedAt: m.decidedAt || 0, decidedBy: m.decidedBy || "", lastSeenAt: m.lastSeenAt || 0,
  };
}

export async function staffRequests(store) {
  const be = await staffBackend(store);
  const all = (await be.listMembers()).filter(m => m && m.email).map(memberView);
  const by = s => all.filter(m => m.status === s).sort((a, b) => (b.decidedAt || b.requestedAt) - (a.decidedAt || a.requestedAt));
  const pending = by("pending").filter(m => m.role !== "admin").sort((a, b) => a.requestedAt - b.requestedAt);
  return { ok: true, pending, approved: by("approved"), denied: by("denied"), revoked: by("revoked"), admins: adminEmails() };
}

const DECISIONS = {
  approve: { from: ["pending", "denied", "revoked"], to: "approved", bump: false },
  deny: { from: ["pending"], to: "denied", bump: true },
  revoke: { from: ["approved"], to: "revoked", bump: true },
};

export async function staffDecide(msg, store, req, ctx, { now = Date.now() } = {}) {
  const email = normEmail(msg && msg.email);
  const decision = String((msg && msg.decision) || "");
  const rule = DECISIONS[decision];
  if (!rule) return { code: 400, body: { error: "Choose approve, deny or revoke." } };
  if (!EMAIL_RE.test(email)) return { code: 400, body: { error: "Unknown request." } };
  if (isAdminEmail(email)) return { code: 400, body: { error: "The admin is set by STAFF_ADMIN_EMAILS and cannot be changed here.", code: "admin_fixed" } };
  const be = await staffBackend(store);
  const cur = await be.getMember(email);
  if (!cur) return { code: 404, body: { error: "No access request for that email." } };
  if (!rule.from.includes(cur.status)) {
    return { code: 409, body: { error: `That request is ${cur.status}; it cannot be ${decision === "deny" ? "denied" : decision + "d"} now.`, code: "bad_state", status: cur.status } };
  }
  const next = {
    ...cur, role: "co-admin", status: rule.to, decidedAt: now,
    decidedBy: ctx.actor || ctx.email || "admin",
    epoch: rule.bump ? (cur.epoch || 0) + 1 : (cur.epoch || 0),
  };
  await be.putMember(next);
  invalidateMember(email);
  await audit(store, req, ctx, `access.${decision}`, { target: email, detail: { from: cur.status } });
  return { code: 200, body: { ok: true, member: memberView(next) } };
}

export async function staffAuditList(msg, store) {
  const be = await staffBackend(store);
  const limit = Math.max(1, Math.min(500, Math.floor(Number(msg && msg.limit) || 200)));
  const action = String((msg && msg.action) || "").trim();
  const actor = normEmail(msg && msg.actor);
  const before = Math.max(0, Number(msg && msg.before) || 0);
  const scan = action || actor ? Math.min(2000, limit * 5) : limit;
  let rows = await be.listAudit({ limit: scan, before });
  if (action) rows = rows.filter(r => r.action === action || r.action.startsWith(action + "."));
  if (actor) rows = rows.filter(r => normEmail(r.who).includes(actor));
  rows = rows.slice(0, limit).map(({ expireAtMs, ...r }) => r);
  return { ok: true, entries: rows, next: rows.length === limit ? rows[rows.length - 1].at : 0 };
}

export async function staffRetentionSet(msg, store, req, ctx) {
  const be = await staffBackend(store);
  const value = normalizeRetention(msg && msg.retention);
  await be.setSettings(value);
  settingsCache = null;
  await audit(store, req, ctx, "retention.set", { detail: value });
  return { ok: true, retention: value };
}

/* ------------------------------------------------------------------ probes (production smoke) */

/**
 * Service-token smoke only: a pending request for an `aym-probe+…@ayurdisha-qa.test` address (no mail
 * is ever sent there). `session: true` also returns a staff session for that probe address, so the
 * smoke can check pending → approved → revoked from the requester's side.
 */
export async function probeStaffRequest(msg, store, req, res, ctx, { now = Date.now() } = {}) {
  const email = normEmail(msg && msg.email);
  if (!isProbeEmail(email)) return { code: 400, body: { error: "Probe emails must look like aym-probe+<tag>@ayurdisha-qa.test." } };
  const be = await staffBackend(store);
  const member = (await be.getMember(email)) || { email, role: "co-admin", status: "pending", requestedAt: now, decidedAt: 0, decidedBy: "", lastSeenAt: now, epoch: 0 };
  await be.putMember(member);
  invalidateMember(email);
  await audit(store, req, ctx, "probe.access_request", { target: email });
  const body = { ok: true, email, status: member.status };
  if (msg && msg.session === true) {
    const session = await createSession(store, req, { email, role: "co-admin", epoch: member.epoch, now });
    body.cookie = `${STAFF_COOKIE}=${encodeSigned(sessionTicket(session, now))}`;
  }
  return { code: 200, body };
}

export async function probeStaffPurge(store, req, ctx, { dryRun = false } = {}) {
  const be = await staffBackend(store);
  const probes = (await be.listMembers()).filter(m => m && isProbeEmail(m.email));
  if (!dryRun) {
    for (const m of probes) { await be.delMember(m.email); invalidateMember(m.email); }
    const doomed = (await be.listSessions("")).filter(s => s && isProbeEmail(s.email));
    await revokeSessions(store, doomed, { by: ctx.actor || "service", reason: "probe_purge", now: staffClock.now() });
  }
  await audit(store, req, ctx, "probe.staff_purge", { detail: { count: probes.length, dryRun } });
  return { ok: true, dryRun, removed: probes.map(m => m.email) };
}

/* ------------------------------------------------------------------ retention cleanup */

async function purgeKvPrefix(store, prefix, isOld, { max, dryRun, deadline }) {
  let keys = [];
  try { keys = await store.list(prefix); } catch { return { scanned: 0, deleted: 0 }; }
  let scanned = 0;
  const doomed = [];
  for (let i = 0; i < keys.length && doomed.length < max && Date.now() < deadline; i += 32) {
    for (const [k, v] of await getMany(store, keys.slice(i, i + 32))) {
      scanned += 1;
      if (isOld(v)) doomed.push(k);
      if (doomed.length >= max) break;
    }
  }
  if (!dryRun) {
    for (const k of doomed) {
      if (Date.now() > deadline) break;
      try { await store.del(k); } catch { /* next run */ }
    }
  }
  return { scanned, deleted: doomed.length };
}

/**
 * Deletes expired staff attempts, old audit entries, OTP / WAC-ID rate records, old delegate
 * session records and stale test-probe data. Bounded (time + count); safe to repeat.
 * `deps.probePurge(msg)` runs the existing probe purge (skipped while a probe is < 1 h old).
 */
export async function runRetentionCleanup(store, { dryRun = false, now = Date.now(), budgetMs = 8000, maxPerKind = 400, deps = {} } = {}) {
  const deadline = Date.now() + budgetMs;
  const r = await getRetention(store, now);
  const report = { dryRun, retention: r };
  const be = await staffBackend(store);
  const opts = { max: maxPerKind, dryRun, deadline };
  try { report.staffAttempts = await be.purgeAttempts(now, maxPerKind, dryRun); } catch (e) { report.staffAttempts = `error: ${String(e && e.message || e).slice(0, 80)}`; }
  try { report.staffSessions = await be.purgeSessions(now, maxPerKind, dryRun); } catch (e) { report.staffSessions = `error: ${String(e && e.message || e).slice(0, 80)}`; }
  try { report.staffAudit = await be.purgeAudit(now - r.auditDays * DAY_MS, maxPerKind, dryRun); } catch (e) { report.staffAudit = `error: ${String(e && e.message || e).slice(0, 80)}`; }
  const stamp = v => Number(v && (v.updatedAt || v.createdAt)) || 0;
  report.otpRate = (await purgeKvPrefix(store, K_OTP_RATE, v => stamp(v) < now - r.otpRateDays * DAY_MS, opts)).deleted;
  report.staffReview = (await purgeKvPrefix(store, K_REVIEW, v => {
    const until = Math.max(Number(v && v.sessionExpireAtMs) || 0, Number(v && v.expireAtMs) || 0);
    return until > 0 && until < now;
  }, opts)).deleted;
  report.wacRate = (await purgeKvPrefix(store, "aym:wacrate:", v => stamp(v) < now - r.wacRateDays * DAY_MS, opts)).deleted;
  report.sessions = (await purgeKvPrefix(store, "aym:sess:", v => stamp(v) > 0 && stamp(v) < now - r.sessionDays * DAY_MS, opts)).deleted;
  report.wacAlerts = (await purgeKvPrefix(store, "aym:wacalert:", v => Number(v && v.at) > 0 && v.at < now - r.auditDays * DAY_MS, opts)).deleted;
  try {
    const probeMembers = (await be.listMembers()).filter(m => m && isProbeEmail(m.email) && (m.requestedAt || 0) < now - r.probeDays * DAY_MS);
    if (!dryRun) for (const m of probeMembers) await be.delMember(m.email);
    report.probeStaff = probeMembers.length;
  } catch { report.probeStaff = 0; }
  if (typeof deps.probeQuestions === "function" && typeof deps.probePurge === "function" && Date.now() < deadline) {
    try {
      const probes = await deps.probeQuestions();
      const fresh = probes.some(q => (q.createdAt || 0) > now - 60 * 60 * 1000);
      const stale = probes.filter(q => (q.createdAt || 0) < now - r.probeDays * DAY_MS);
      if (!fresh && stale.length) {
        const out = await deps.probePurge({ dryRun });
        report.probeQuestions = Array.isArray(out && out.questions) ? out.questions.length : 0;
      } else {
        report.probeQuestions = 0;
        if (fresh) report.probeSkipped = "a probe is less than 1 hour old";
      }
    } catch (e) { report.probeQuestions = `error: ${String(e && e.message || e).slice(0, 80)}`; }
  }
  report.ms = budgetMs - Math.max(0, deadline - Date.now());
  return report;
}
