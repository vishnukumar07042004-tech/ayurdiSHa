/**
 * Verification-code send limits, tuned for a congress venue where thousands of delegates share
 * one Wi-Fi NAT address:
 *   - per browser: one send per 60 s (the signed OTP cookie, register.js).
 *   - per email (strict, shared across instances): at most 5 sends per 15 min.
 *     One small doc per email (`aym:otp:<hash>`), so there is no shared hot document.
 *   - per network address (generous, per instance, in memory): 300 sends per 10 min.
 * The OTP itself never touches the store — it lives in a signed httpOnly cookie (otpTicket.js).
 * If the store is slow or down the per-email check fails open; the cookie cooldown still applies.
 */
import crypto from "node:crypto";
import { updateKey, bestEffort } from "./passIssuer.js";

export const K_OTP_RATE = "aym:otp:";
export const OTP_EMAIL_WINDOW_MS = 15 * 60 * 1000;
export const OTP_EMAIL_MAX = 5;
export const OTP_IP_WINDOW_MS = 10 * 60 * 1000;
export const OTP_IP_MAX = 300;

export function otpRateKey(emailLower) {
  return K_OTP_RATE + crypto.createHash("sha256").update("aym-otp:" + String(emailLower || "").trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function clientIp(req) {
  const h = (req && req.headers) || {};
  const fwd = h["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  if (typeof h["x-real-ip"] === "string" && h["x-real-ip"]) return h["x-real-ip"].trim();
  return (req && req.socket && req.socket.remoteAddress) || "unknown";
}

/** Sliding-window counter in memory. The key (an IP) is never persisted or logged. */
export function makeWindowLimiter({ windowMs, max, maxKeys = 20000 }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return { ok: false, retryIn: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= windowMs) hits.delete(k);
      }
      return { ok: true };
    },
    reset() { hits.clear(); },
  };
}

export const otpIpLimiter = makeWindowLimiter({ windowMs: OTP_IP_WINDOW_MS, max: OTP_IP_MAX });

/**
 * Decide from the per-email record; pure so it can run inside a transaction. The 60 s resend
 * cooldown stays per browser (signed cookie) so a delegate can switch from phone to laptop.
 */
export function otpEmailVerdict(rec, now = Date.now()) {
  const sends = (rec && Array.isArray(rec.sends) ? rec.sends : []).filter(t => now - t < OTP_EMAIL_WINDOW_MS);
  if (sends.length >= OTP_EMAIL_MAX) {
    return { ok: false, reason: "window", retryIn: Math.ceil((Math.min(...sends) + OTP_EMAIL_WINDOW_MS - now) / 1000), sends };
  }
  return { ok: true, sends };
}

/** Claims a send slot for this email (cross-instance). Fails open if the store is unavailable. */
export async function reserveOtpSend(store, emailLower, now = Date.now()) {
  let verdict = { ok: true };
  const r = await bestEffort(() => updateKey(store, otpRateKey(emailLower), cur => {
    verdict = otpEmailVerdict(cur, now);
    if (!verdict.ok) return undefined;
    return { sends: [...verdict.sends, now], updatedAt: now };
  }), { ms: 2500, label: "otp rate check" });
  if (!r.ok) return { ok: true, degraded: true };
  return { ok: verdict.ok, reason: verdict.reason, retryIn: verdict.retryIn };
}

/** Gives the slot back when the email could not be sent, so the delegate can retry at once. */
export async function releaseOtpSend(store, emailLower, at) {
  await bestEffort(() => updateKey(store, otpRateKey(emailLower), cur => {
    if (!cur || !Array.isArray(cur.sends)) return undefined;
    return { ...cur, sends: cur.sends.filter(t => t !== at), updatedAt: Date.now() };
  }), { ms: 1500, label: "otp rate release" });
}
