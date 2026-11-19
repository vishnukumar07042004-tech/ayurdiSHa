/**
 * Durable outbound mail. When Resend and SMTP both fail or rate-limit, the message is stored
 * (`aym:mail:*`) and retried by the worker / staff tick. Ask, register, and staff flows never
 * fail because mail failed.
 *
 * OTP digits are sealed (AES-256-GCM) — never in staff-visible payloads, never in publicJob,
 * never printed on Vercel. Rebuild html/text at send time from the sealed blob.
 *
 * Env (names only — set on Vercel Production, never commit values):
 *   RESEND_API_KEY          primary transactional provider (preferred for volume)
 *   MAIL_FROM               verified sender, e.g. AYURDISHA <no-reply@yourdomain.com>
 *   MAIL_PROVIDER           optional: resend | smtp | auto (default auto = Resend then SMTP)
 *   SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS   optional Gmail/SMTP fallback
 *
 * Recommended production path: dedicated transactional provider (Resend / Postmark / SendGrid)
 * as primary, Gmail SMTP as fallback, so a free Gmail quota never interrupts OTP.
 */

import crypto from "node:crypto";
import { loadServerEnv } from "./env.js";
import { maskEmail } from "../shared/wacId.js";
import {
  sendMail, mailErrorRetryable, mailErrorClass, sanitizeMailError, otpHtml, staffMailHtml, mailProviderSummary,
  answerNoticeHtml, answerNoticeText, answerNoticeSubject,
  askReceivedHtml, askReceivedText, askReceivedSubject,
} from "./mailer.js";

export const K_MAIL = "aym:mail:";
export const K_MAIL_HEALTH = "aym:mail:health";
export const MAIL_OPS = new Set(["mailQueue", "mailRetry", "mailHealth"]);

const MAIL_ATTEMPTS = 8;
const BACKOFF_MS = [30_000, 60_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
const DRAIN_DEFAULT_MS = 8000;
const DRAIN_MAX = 25;
const OTP_TTL_MS = 12 * 60 * 1000;
const SECRET_KINDS = new Set(["otp", "staff-otp", "staff_otp"]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function mailId(kind, hint) {
  const h = String(hint || crypto.randomBytes(8).toString("hex")).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  return `${kind || "notice"}:${h || crypto.randomBytes(6).toString("hex")}`;
}

function mailSealKey() {
  try {
    const env = loadServerEnv();
    const raw = String(env.OTP_COOKIE_SECRET || env.OTP_SECRET || env.ADMIN_PIN || "").trim();
    if (!raw) return null;
    return crypto.createHash("sha256").update("aym-mail-otp-v1:" + raw).digest();
  } catch {
    return null;
  }
}

/** AES-256-GCM blob. Empty string if there is nothing to seal or no server secret. */
export function sealOtp(code) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 8);
  const key = mailSealKey();
  if (!digits || !key) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function openOtp(blob) {
  const key = mailSealKey();
  if (!blob || !key) return "";
  try {
    const buf = Buffer.from(String(blob), "base64url");
    if (buf.length < 29) return "";
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function publicPayload(kind, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const out = {};
  if (p.name) out.name = String(p.name).slice(0, 80);
  if (p.ticket) out.ticket = String(p.ticket).slice(0, 40);
  if (p.link) out.link = String(p.link).slice(0, 300);
  if (p.requesterEmail) out.requesterEmail = String(p.requesterEmail).slice(0, 120);
  if (p.subject && !SECRET_KINDS.has(kind)) out.subject = String(p.subject).slice(0, 120);
  return out;
}

/** Staff-visible job: masked recipient, no OTP, no html/text body. */
export function publicMailJob(j) {
  if (!j) return null;
  const secret = SECRET_KINDS.has(j.kind);
  return {
    id: j.id,
    kind: j.kind || "notice",
    toMasked: maskEmail(j.to),
    status: j.status,
    attempts: j.attempts || 0,
    nextAt: j.nextAt || 0,
    lastError: sanitizeMailError(j.lastError),
    lastErrorClass: j.lastErrorClass || "",
    createdAt: j.createdAt || 0,
    updatedAt: j.updatedAt || 0,
    expiresAt: j.expiresAt || 0,
    ...(secret ? {} : { subject: String(j.subject || "").slice(0, 120) }),
  };
}

function buildFromTemplate(kind, { to, payload = {}, otp } = {}) {
  const p = payload || {};
  if (kind === "otp") {
    const name = p.name || "";
    const code = String(otp || "");
    return {
      to, subject: "Your AYURDISHA verification code",
      text: `Namaste${name ? " " + name : ""},\n\nYour AYURDISHA verification code is: ${code}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
      html: otpHtml(name, code),
    };
  }
  if (kind === "staff-otp" || kind === "staff_otp") {
    const code = String(otp || "");
    const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return {
      to, subject: "Your AYURDISHA staff sign-in code",
      text: `Your AYURDISHA staff sign-in code is: ${code}\n\nIt expires in 10 minutes. If you did not try to sign in to the AYURDISHA staff area, ignore this email and tell the admin.`,
      html: staffMailHtml("Staff sign-in code", `
      <p style="margin:0 0 18px">Use this one-time code to finish signing in to the AYURDISHA staff area.</p>
      <div style="font-family:monospace;font-size:32px;letter-spacing:.35em;font-weight:700;color:#1B4332;background:#EDE4D4;border-radius:12px;padding:14px 18px;text-align:center">${esc(code)}</div>
      <p style="margin:18px 0 0;color:#5C6B62;font-size:12.5px">The code expires in 10 minutes. If you did not try to sign in, ignore this email and tell the admin.</p>`),
    };
  }
  if (kind === "staff-request") {
    const requester = p.requesterEmail || "";
    const link = p.link || "";
    const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return {
      to, subject: `New AYURDISHA staff access request — ${requester}`,
      text: `${requester} entered the staff passcode, verified their email and is asking for staff access.\n\nApprove or deny it in the staff area: ${link}\n\nIf you do not recognise this person, deny the request and consider changing the staff passcode.`,
      html: staffMailHtml("New access request", `
      <p style="margin:0 0 14px"><b>${esc(requester)}</b> entered the staff passcode, verified their email and is asking for staff access.</p>
      <p style="margin:0 0 18px"><a href="${esc(link)}" style="color:#1B4332;font-weight:700">Open Access requests</a> to approve or deny.</p>
      <p style="margin:0;color:#5C6B62;font-size:12.5px">If you do not recognise this person, deny the request and consider changing the staff passcode.</p>`),
    };
  }
  if (kind === "answer-notice") {
    const name = p.name || "";
    const ticket = p.ticket || "";
    const link = p.link || "";
    return {
      to, subject: answerNoticeSubject(ticket),
      text: answerNoticeText({ name, ticket, link }),
      html: answerNoticeHtml({ name, ticket, link }),
    };
  }
  if (kind === "ask-receipt") {
    const name = p.name || "";
    const ticket = p.ticket || "";
    const link = p.link || "";
    return {
      to, subject: askReceivedSubject(ticket),
      text: askReceivedText({ name, ticket, link }),
      html: askReceivedHtml({ name, ticket, link }),
    };
  }
  return {
    to,
    subject: String(p.subject || "AYURDISHA"),
    text: String(p.text || ""),
    html: String(p.html || ""),
  };
}

async function listMail(store) {
  const keys = (await store.list(K_MAIL)).filter(k => k !== K_MAIL_HEALTH);
  const out = [];
  for (let i = 0; i < keys.length; i += 20) {
    const vals = await Promise.all(keys.slice(i, i + 20).map(k => store.get(k)));
    vals.forEach(v => { if (v && typeof v === "object" && v.id && v.kind) out.push(v); });
  }
  return out;
}

async function noteMailHealth(store, patch, now = Date.now()) {
  const prev = (await store.get(K_MAIL_HEALTH)) || {};
  await store.set(K_MAIL_HEALTH, { ...prev, ...patch, updatedAt: now });
}

export async function enqueueMail(store, rec, { now = Date.now() } = {}) {
  const kind = String(rec.kind || rec.template || "notice").slice(0, 40);
  const id = String(rec.id || mailId(kind, rec.idempotencyKey || rec.to)).slice(0, 120);
  const prev = await store.get(K_MAIL + id);
  const secret = SECRET_KINDS.has(kind);
  const otp = secret ? String(rec.otp || "").replace(/\D/g, "").slice(0, 8) : "";
  const otpSealed = secret ? sealOtp(otp) : "";
  const built = secret ? { subject: "", text: "", html: "" } : (rec.subject ? rec : buildFromTemplate(kind, rec));
  const job = {
    id,
    kind,
    to: String(rec.to || built.to || "").trim().slice(0, 200),
    subject: secret ? "" : String(built.subject || rec.subject || "").slice(0, 200),
    text: secret ? "" : String(built.text || rec.text || "").slice(0, 8000),
    html: secret ? "" : String(built.html || rec.html || "").slice(0, 20000),
    payload: publicPayload(kind, rec.payload),
    otpSealed: otpSealed || (prev && prev.otpSealed) || "",
    status: "queued",
    attempts: 0,
    nextAt: now,
    lastError: sanitizeMailError(rec.lastError),
    lastErrorClass: rec.lastErrorClass || mailErrorClass(rec.lastError) || "",
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
    expiresAt: Number(rec.expiresAt) || (secret ? now + OTP_TTL_MS : 0),
  };
  if (!job.to) return { queued: false, reason: "missing" };
  if (!secret && !job.subject) return { queued: false, reason: "missing" };
  if (secret && !job.otpSealed) {
    job.status = "failed";
    job.lastError = job.lastError || "OTP not stored (server seal unavailable)";
    job.lastErrorClass = job.lastErrorClass || "rejected";
  }
  await store.set(K_MAIL + id, job);
  return { queued: job.status === "queued", id, status: job.status };
}

/**
 * Try `send()` now. On provider failure, persist a rebuildable job and return `{ delivery: "queued" }`.
 * Never throws to the student / register / staff path.
 */
export async function sendOrQueue(store, { send, template, to, payload, otp, now = Date.now(), id } = {}) {
  try {
    const r = await send();
    await noteMailHealth(store, { lastSentAt: now, lastErrorClass: "", lastError: "" }, now).catch(() => {});
    return r || { delivery: "email" };
  } catch (err) {
    const kind = String(template || "notice");
    const secret = SECRET_KINDS.has(kind);
    const jobId = id || mailId(kind, secret ? `${to}:${now}` : to);
    const klass = mailErrorClass(err);
    const safe = sanitizeMailError(err);
    await enqueueMail(store, {
      id: jobId, kind, template: kind, to, payload, otp,
      lastError: err, lastErrorClass: klass,
      expiresAt: secret ? now + OTP_TTL_MS : 0,
    }, { now }).catch(() => null);
    await noteMailHealth(store, { lastErrorClass: klass, lastError: safe, lastErrorAt: now }, now).catch(() => {});
    return { delivery: "queued" };
  }
}

export const deliverOrQueue = sendOrQueue;

function builtForSend(job) {
  if (SECRET_KINDS.has(job.kind)) {
    const otp = openOtp(job.otpSealed);
    if (!otp) return null;
    return { ...buildFromTemplate(job.kind, { to: job.to, payload: job.payload, otp }), otp };
  }
  if (job.subject && (job.text || job.html)) return job;
  return buildFromTemplate(job.kind, { to: job.to, payload: job.payload });
}

export async function drainMailQueue(store, { now = Date.now(), budgetMs = DRAIN_DEFAULT_MS, limit = DRAIN_MAX, send, wait } = {}) {
  const started = Date.now();
  const report = { ok: true, processed: 0, sent: 0, queued: 0, failed: 0, expired: 0 };
  const jobs = (await listMail(store))
    .filter(j => j.status === "queued" || j.status === "failed")
    .filter(j => (j.nextAt || 0) <= now)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  report.waiting = jobs.length;
  const sendImpl = send || sendMail;
  const pause = wait || sleep;

  for (const job of jobs.slice(0, limit)) {
    if (Date.now() - started > budgetMs) { report.stopped = "time budget"; break; }
    if (job.expiresAt && job.expiresAt < now) {
      await store.del(K_MAIL + job.id);
      report.expired++;
      continue;
    }
    const built = builtForSend(job);
    if (!built) {
      await store.set(K_MAIL + job.id, {
        ...job, status: "failed", updatedAt: now,
        lastError: "OTP expired or could not be opened", lastErrorClass: "rejected",
      });
      report.failed++;
      continue;
    }
    report.processed++;
    try {
      const r = await sendImpl({
        to: job.to, subject: built.subject, text: built.text, html: built.html,
        logLabel: SECRET_KINDS.has(job.kind) ? `${job.kind} queued` : built.subject,
        otp: process.env.VERCEL ? undefined : built.otp,
      });
      if (r && (r.delivery === "email" || r.delivery === "console" || r.delivery === "suppressed")) {
        await store.del(K_MAIL + job.id);
        report.sent++;
        await noteMailHealth(store, { lastSentAt: now, lastErrorClass: "", lastError: "" }, now).catch(() => {});
      } else {
        throw new Error((r && r.delivery) || "not sent");
      }
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      const retryable = mailErrorRetryable(err);
      const t = now;
      const klass = mailErrorClass(err);
      const safe = sanitizeMailError(err);
      if (!retryable || attempts >= MAIL_ATTEMPTS) {
        await store.set(K_MAIL + job.id, {
          ...job, status: "failed", attempts, updatedAt: t, lastError: safe, lastErrorClass: klass,
        });
        report.failed++;
      } else {
        const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
        await store.set(K_MAIL + job.id, {
          ...job, status: "queued", attempts, nextAt: t + delay, updatedAt: t, lastError: safe, lastErrorClass: klass,
        });
        report.queued++;
      }
      await noteMailHealth(store, { lastErrorClass: klass, lastError: safe, lastErrorAt: t }, t).catch(() => {});
      if (err && err.retryAfterMs) await pause(Math.min(500, err.retryAfterMs));
    }
  }
  report.ms = Date.now() - started;
  return report;
}

export async function listMailBacklog(store) {
  const jobs = await listMail(store);
  const pending = jobs.filter(j => j.status === "queued" || j.status === "failed");
  pending.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return {
    ok: true,
    total: pending.length,
    queued: pending.filter(j => j.status === "queued").length,
    failed: pending.filter(j => j.status === "failed").length,
    items: pending.slice(0, 80).map(publicMailJob),
  };
}

export async function retryMailBacklog(store, { id, now = Date.now() } = {}) {
  const jobs = await listMail(store);
  const wanted = (id ? jobs.filter(j => j.id === id) : jobs.filter(j => j.status === "queued" || j.status === "failed"))
    .filter(j => !(j.expiresAt && j.expiresAt < now));
  for (const j of wanted) {
    await store.set(K_MAIL + j.id, { ...j, status: "queued", nextAt: now, updatedAt: now });
  }
  const expired = jobs.filter(j => j.expiresAt && j.expiresAt < now);
  for (const j of expired) await store.del(K_MAIL + j.id);
  const report = await drainMailQueue(store, { now, budgetMs: 12000 });
  return { ok: true, requeued: wanted.length, expired: expired.length, report };
}

export const runMailQueue = drainMailQueue;
export const retryMail = retryMailBacklog;

export function tickMailQueue(store, opts = {}) {
  drainMailQueue(store, opts).catch(err => {
    console.error("[aym-mail] queue tick failed:", err && err.message ? err.message : err);
  });
}

export async function mailHealth(store) {
  const backlog = await listMailBacklog(store);
  const rec = (await store.get(K_MAIL_HEALTH)) || {};
  let providers = { primary: "console", fallback: "" };
  try { providers = mailProviderSummary(); } catch { /* ignore */ }
  return {
    queued: backlog.queued,
    failed: backlog.failed,
    lastErrorClass: rec.lastErrorClass || "",
    lastError: rec.lastError || "",
    lastErrorAt: rec.lastErrorAt || 0,
    lastSentAt: rec.lastSentAt || 0,
    provider: providers,
    providers,
  };
}

export async function handleMailOp(op, msg, store, ctx) {
  if (op === "mailQueue" || op === "mailHealth") {
    ctx.send(200, { ok: true, mail: await mailHealth(store), ...(op === "mailQueue" ? await listMailBacklog(store) : {}) });
    return;
  }
  if (op === "mailRetry") {
    ctx.send(200, await retryMailBacklog(store, { id: String(msg.id || "") }));
    return;
  }
  ctx.send(400, { error: "unknown op" });
}
