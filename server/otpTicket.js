import crypto from "node:crypto";
import { loadServerEnv } from "./env.js";

/** Pending OTP (10 min). Survives Vercel serverless via httpOnly cookie. */
export const OTP_COOKIE = "aym_pending";
/** Signed delegate session so verify/regMe work without a shared filesystem. */
export const SESS_COOKIE = "aym_del";

const OTP_TTL_MS = 10 * 60 * 1000;
const SESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  const env = loadServerEnv();
  const raw = String(env.OTP_COOKIE_SECRET || env.OTP_SECRET || env.ADMIN_PIN || "").trim();
  if (!raw) throw new Error("OTP cookie secret is not configured (set OTP_COOKIE_SECRET or ADMIN_PIN)");
  return raw;
}

function hmac(text) {
  return crypto.createHmac("sha256", secret()).update(String(text)).digest("hex");
}

function timingEqualHex(a, b) {
  const x = Buffer.from(String(a || ""), "hex");
  const y = Buffer.from(String(b || ""), "hex");
  if (x.length !== 32 || y.length !== 32 || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function b64urlDecode(raw) {
  try {
    return JSON.parse(Buffer.from(String(raw || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const map = {};
  String(req && req.headers && req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i < 0) return;
    map[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return map;
}

function cookieAttrs(maxAge) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, maxAge)}${secure}`;
}

export function appendCookie(res, cookie) {
  if (!res) return;
  if (typeof res.appendHeader === "function") {
    res.appendHeader("Set-Cookie", cookie);
    return;
  }
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookie);
  else res.setHeader("Set-Cookie", Array.isArray(prev) ? [...prev, cookie] : [prev, cookie]);
}

export function clearCookie(res, name) {
  appendCookie(res, `${name}=; ${cookieAttrs(0)}`);
}

function sign(body) {
  const payload = { ...body };
  delete payload.sig;
  const sig = hmac("sig:" + JSON.stringify(payload));
  return { ...payload, sig };
}

function unsign(ticket) {
  if (!ticket || typeof ticket !== "object" || !ticket.sig) return null;
  const { sig, ...body } = ticket;
  const expect = hmac("sig:" + JSON.stringify(body));
  if (!timingEqualHex(sig, expect)) return null;
  return body;
}

export function otpMac(email, otp, exp) {
  return hmac(`otp|${email}|${otp}|${exp}`);
}

export function makeOtpTicket({ email, otp, profile, now = Date.now(), lastSentAt, attempts = 0 }) {
  const exp = now + OTP_TTL_MS;
  const p = profile && typeof profile === "object" ? {
    name: String(profile.name || "").trim().slice(0, 80),
    age: Number(profile.age),
    sex: String(profile.sex || "").trim(),
    institute: String(profile.institute || "").trim().slice(0, 120),
    email: String(profile.email || "").trim(),
    regNo: String(profile.regNo || "").trim().slice(0, 40),
  } : profile;
  return sign({
    v: 1,
    email: String(email || "").trim().toLowerCase(),
    exp,
    lastSentAt: lastSentAt || now,
    attempts,
    profile: p,
    otpMac: otpMac(String(email || "").trim().toLowerCase(), String(otp), exp),
  });
}

export function readOtpTicket(req) {
  const raw = parseCookies(req)[OTP_COOKIE];
  if (!raw) return null;
  const body = unsign(b64urlDecode(raw));
  if (!body || body.v !== 1) return null;
  return body;
}

export function otpTicketMatches(ticket, emailLower, otp) {
  if (!ticket) return false;
  if (ticket.email !== emailLower) return false;
  if (Date.now() > (ticket.exp || 0)) return false;
  const got = otpMac(emailLower, String(otp), ticket.exp);
  return timingEqualHex(got, ticket.otpMac);
}

export function setOtpCookie(res, ticket) {
  const maxAge = Math.max(0, Math.ceil((((ticket && ticket.exp) || 0) - Date.now()) / 1000));
  appendCookie(res, `${OTP_COOKIE}=${b64urlEncode(ticket)}; ${cookieAttrs(maxAge)}`);
}

export function makeSessTicket({ token, userId, profile, now = Date.now() }) {
  return sign({
    v: 1,
    token,
    userId,
    profile,
    exp: now + SESS_TTL_MS,
  });
}

export function readSessTicket(req) {
  const raw = parseCookies(req)[SESS_COOKIE];
  if (!raw) return null;
  const body = unsign(b64urlDecode(raw));
  if (!body || body.v !== 1) return null;
  if (Date.now() > (body.exp || 0)) return null;
  return body;
}

export function setSessCookie(res, ticket) {
  const maxAge = Math.max(0, Math.ceil((((ticket && ticket.exp) || 0) - Date.now()) / 1000));
  appendCookie(res, `${SESS_COOKIE}=${b64urlEncode(ticket)}; ${cookieAttrs(maxAge)}`);
}

/** Signed base64url cookie value for other server modules (staff session, staff OTP). */
export function encodeSigned(body) {
  return b64urlEncode(sign(body));
}

/** Verified body of `encodeSigned` output, or null. Throws only when no secret is configured. */
export function decodeSigned(raw) {
  if (!raw) return null;
  return unsign(b64urlDecode(raw));
}

/** Keyed hash (same secret, own domain) for identifiers that must not be stored in clear. */
export function keyedHash(text) {
  return hmac("kh:" + String(text));
}

/** Re-sign an existing OTP ticket (keep otpMac + exp) while updating attempts. */
export function resignOtpTicket(ticket, extra = {}) {
  if (!ticket) return null;
  const { sig: _sig, ...body } = ticket;
  return sign({ ...body, ...extra });
}

export { OTP_TTL_MS };
