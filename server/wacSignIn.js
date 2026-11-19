/**
 * "I'm registered for WAC 2026" sign-in: WAC ID + WAC-site email → code to the email on WAC's
 * record → AYURDISHA account linked or created, prefilled from the WAC record.
 *
 * Reuses the email-registration machinery: the signed OTP cookie (otpTicket.js, tagged with the
 * WAC key so a normal registration code can't be used here), the per-email / per-network send
 * limits (otpLimits.js), the mailer, and completeRegistration() for the user doc, pass number and
 * session. Extra limits: per WAC ID (cross-instance) and per network for lookups.
 *
 *   aym:waclink:<key>   WAC ID → the one AYURDISHA user it belongs to (create-if-absent)
 *   aym:wacalert:<id>   staff alert: a second account tried to use a linked WAC ID
 *   aym:wacrate:<hash>  per-WAC-ID attempt window
 */
import crypto from "node:crypto";
import { sendOtpEmail } from "./mailer.js";
import { sendOrQueue } from "./mailQueue.js";
import {
  OTP_COOKIE, OTP_TTL_MS, makeOtpTicket, readOtpTicket, otpTicketMatches, setOtpCookie, clearCookie,
  resignOtpTicket, makeSessTicket, setSessCookie,
} from "./otpTicket.js";
import { otpIpLimiter, clientIp, reserveOtpSend, releaseOtpSend, makeWindowLimiter } from "./otpLimits.js";
import { updateKey, createKeyIfAbsent, bestEffort } from "./passIssuer.js";
import {
  K_USER, K_EMAIL, regnoIndexKey, validRegNo, completeRegistration, publicProfile, stableDelegateId, sessionUser,
} from "./register.js";
import { sanitizeSource } from "../shared/source.js";
import { ASK_STAGES } from "../shared/askOptions.js";
import {
  normalizeWacId, validWacId, wacIdKey, normEmail, validEmail, maskEmail, maskPhone,
  WAC_NO_MATCH, WAC_ALREADY_LINKED, WAC_CLEAR_PHRASE, WAC_CONSENT_TEXT, DEFAULT_WAC_ID_PATTERN,
} from "../shared/wacId.js";
import {
  wacEnv, wacAdapter, delegateRepo, importDelegates, delegateStats, clearUnlinkedDelegates,
  markDelegateLinked, findDelegates, IMPORT_MAX_ROWS, K_WACLINK, K_WACALERT, raiseWacAlert,
} from "./wacDelegates.js";
import { linkUserToDelegate, stampQuestionsWithWacId, wacAutoLinkAll, resetAutoLinkCache } from "./wacAutoLink.js";

export { K_WACLINK, K_WACALERT };
export const K_WACRATE = "aym:wacrate:";

export const WAC_ID_WINDOW_MS = 15 * 60 * 1000;
export const WAC_ID_MAX = 6;
const RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const CONFIG_TTL_MS = 60 * 1000;

/** Lookups (match or not) per network address. Generous: a venue shares one Wi-Fi NAT. */
export const wacIpLimiter = makeWindowLimiter({ windowMs: 10 * 60 * 1000, max: 600 });

const UNAVAILABLE = "WAC verification is unavailable right now. Try again shortly, or register with your email instead.";
const NOT_CONFIGURED = "Verification is not configured on this server. Try again shortly.";

const noMatch = () => ({ code: 400, body: { error: WAC_NO_MATCH, code: "no_match" } });
const digitsOnly = s => String(s || "").replace(/\D/g, "").slice(0, 6);
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");

/* ------------------------------------------------------------------ */
/* Public config                                                       */
/* ------------------------------------------------------------------ */

let configCache = null;
export function resetWacConfigCache() { configCache = null; }

/** `{ enabled, mode, comingSoon }` — enabled when the list has rows (list mode) or the API is set. */
export async function wacConfig(store, { now = Date.now() } = {}) {
  const env = wacEnv();
  if (env.off) return { enabled: false, mode: env.mode, comingSoon: false };
  if (configCache && configCache.store === store && configCache.mode === env.mode && now - configCache.at < CONFIG_TTL_MS) {
    return configCache.value;
  }
  const r = await bestEffort(() => wacAdapter(store, env).available(), { ms: 2500, label: "wac config" });
  const enabled = Boolean(r.ok && r.value);
  const value = { enabled, mode: env.mode, comingSoon: !enabled };
  configCache = { store, mode: env.mode, at: now, value };
  return value;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function userByEmail(store, emailLower) {
  try {
    const idx = await store.get(K_EMAIL + emailLower);
    if (!idx || !idx.userId) return null;
    const u = await store.get(K_USER + idx.userId);
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

/** Per WAC ID, across instances. Fails open if the store is slow (the other limits still apply). */
export async function reserveWacAttempt(store, key, now = Date.now()) {
  let verdict = { ok: true };
  const r = await bestEffort(() => updateKey(store, K_WACRATE + sha("aym-wac:" + key).slice(0, 32), cur => {
    const hits = (cur && Array.isArray(cur.hits) ? cur.hits : []).filter(t => now - t < WAC_ID_WINDOW_MS);
    if (hits.length >= WAC_ID_MAX) {
      verdict = { ok: false, retryIn: Math.max(1, Math.ceil((Math.min(...hits) + WAC_ID_WINDOW_MS - now) / 1000)) };
      return undefined;
    }
    verdict = { ok: true };
    return { hits: [...hits, now], updatedAt: now };
  }), { ms: 2500, label: "wac id rate" });
  if (!r.ok) return { ok: true, degraded: true };
  return verdict;
}

const raiseAlert = raiseWacAlert;

/** Would signing in `emailLower` with this WAC key reach a different account than its link? */
async function linkConflict(store, key, emailLower) {
  const existing = await userByEmail(store, emailLower);
  if (existing && existing.wacId && wacIdKey(existing.wacId) !== key) return "account-has-other-wac-id";
  const link = await store.get(K_WACLINK + key).catch(() => null);
  if (!link || !link.userId) return "";
  const id = existing ? existing.id : stableDelegateId(emailLower);
  return link.userId === id ? "" : "wac-id-linked-elsewhere";
}

/** The WAC record as the delegate sees it on "Confirm your details" (phone masked). */
export function lockedView(rec, user) {
  const w = (user && user.wac) || {};
  return {
    wacId: (rec && rec.wacId) || (user && user.wacId) || "",
    name: (rec && rec.name) || (user && user.name) || "",
    email: (rec && rec.email) || (user && user.email) || "",
    institution: (rec && rec.institution) || w.institution || (user && user.institute) || "",
    category: (rec && rec.category) || w.category || "",
    country: (rec && rec.country) || w.country || "",
    state: (rec && rec.state) || w.state || "",
    attendance: (rec && rec.attendance) || w.attendance || "",
    phone: maskPhone(rec && rec.phone),
  };
}

/* ------------------------------------------------------------------ */
/* Sign-in                                                             */
/* ------------------------------------------------------------------ */

/** Link mode: a signed-in account may take this WAC ID (it has none / the same, nobody else has it). */
async function linkModeConflict(store, key, user) {
  if (user.wacId && wacIdKey(user.wacId) !== key) return "account-has-other-wac-id";
  const link = await store.get(K_WACLINK + key).catch(() => null);
  return link && link.userId && link.userId !== user.id ? "wac-id-linked-elsewhere" : "";
}

export async function wacStart(msg, store, req, res, { now = Date.now() } = {}) {
  const env = wacEnv();
  if (env.off) return { code: 403, body: { error: "Sign in with WAC ID is not available.", code: "wac_off" } };
  const wacId = normalizeWacId(msg && msg.wacId);
  const typedEmail = normEmail(msg && msg.email);
  if (!wacId || !typedEmail) {
    return { code: 400, body: { error: "Enter your WAC Delegate ID and the email you used on the WAC site." } };
  }
  let linkUser = null;
  if (msg && msg.link === true) {
    const sess = await sessionUser(msg, store, req);
    if (!sess || !sess.user || !sess.user.id) return { code: 403, body: { error: "Sign in first, then link your WAC Delegate ID." } };
    linkUser = sess.user;
  }
  const ipGate = wacIpLimiter.hit(clientIp(req), now);
  if (!ipGate.ok) {
    return { code: 429, body: { error: `Many delegates on this network are signing in right now. Please wait ${ipGate.retryIn}s and try again.`, retryIn: ipGate.retryIn, code: "network_busy" } };
  }
  if (!validWacId(wacId, env.pattern) || !validEmail(typedEmail)) return noMatch();
  const key = wacIdKey(wacId);

  const idGate = await reserveWacAttempt(store, key, now);
  if (!idGate.ok) {
    const mins = Math.ceil(idGate.retryIn / 60);
    return { code: 429, body: { error: `Too many sign-in attempts for this WAC ID. Try again in ${mins} min, or ask the help desk.`, retryIn: idGate.retryIn, code: "wac_rate" } };
  }

  let pending;
  try { pending = readOtpTicket(req); }
  catch { return { code: 500, body: { error: NOT_CONFIGURED } }; }
  if (pending && pending.wac === key && pending.lastSentAt && now - pending.lastSentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - pending.lastSentAt)) / 1000);
    return { code: 429, body: { error: `Please wait ${wait}s before requesting another code.`, retryIn: wait } };
  }

  let found;
  try { found = await wacAdapter(store, env).lookup(wacId, typedEmail); }
  catch { found = { ok: false, reason: "unavailable" }; }
  if (!found || !found.ok) {
    if (found && found.reason === "unavailable") return { code: 503, body: { error: UNAVAILABLE, code: "wac_unavailable", retryIn: 20 } };
    console.log("[aym-wac] sign-in start: no match");
    return noMatch();
  }
  const record = found.record;
  const recordEmail = record.emailLower;

  const conflict = linkUser ? await linkModeConflict(store, key, linkUser) : await linkConflict(store, key, recordEmail);
  if (conflict) {
    await raiseAlert(store, { kind: conflict, wacId, emailLower: recordEmail, now });
    return { code: 409, body: { error: WAC_ALREADY_LINKED, code: "wac_linked" } };
  }

  const sendGate = otpIpLimiter.hit(clientIp(req), now);
  if (!sendGate.ok) {
    return { code: 429, body: { error: `Many delegates on this network are requesting codes right now. Please wait ${sendGate.retryIn}s and try again.`, retryIn: sendGate.retryIn, code: "network_busy" } };
  }
  const emailGate = await reserveOtpSend(store, recordEmail, now);
  if (!emailGate.ok) {
    const wait = emailGate.retryIn || 60;
    return { code: 429, body: { error: `Several codes were already sent to this email. Check your inbox (and spam), or try again in ${Math.ceil(wait / 60)} min.`, retryIn: wait, code: "email_rate" } };
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  let ticket;
  try {
    ticket = makeOtpTicket({
      email: recordEmail, otp, now, lastSentAt: now, attempts: 0,
      profile: { name: record.name, email: record.email, institute: record.institution, regNo: record.wacId },
    });
    ticket = resignOtpTicket(ticket, linkUser ? { wac: key, linkUser: linkUser.id } : { wac: key });
  } catch {
    await releaseOtpSend(store, recordEmail, now);
    return { code: 500, body: { error: NOT_CONFIGURED } };
  }

  let delivery;
  try {
    ({ delivery } = await sendOrQueue(store, {
      send: () => sendOtpEmail(record.email || recordEmail, otp, record.name),
      template: "otp",
      to: record.email || recordEmail,
      payload: { name: record.name || "" },
      otp,
      now,
    }));
  } catch (err) {
    console.error("[aym-wac] code email failed:", err && err.message ? err.message : err);
    delivery = "queued";
  }
  if (!res) return { code: 500, body: { error: NOT_CONFIGURED } };
  setOtpCookie(res, ticket);
  return {
    code: 200,
    body: { ok: true, maskedEmail: maskEmail(recordEmail), delivery, resendIn: RESEND_COOLDOWN_MS / 1000, expiresIn: OTP_TTL_MS / 1000 },
  };
}

/**
 * Link the WAC record to the account for its email (existing → link, else create). One WAC ID
 * links to one account; a new account's pass number is the WAC ID when that is a safe pass number.
 */
export async function linkOrCreate(store, record, { source, req, res, now = Date.now() } = {}) {
  const emailLower = normEmail(record.emailLower || record.email);
  const key = record.key || wacIdKey(record.wacId);
  const existing = await userByEmail(store, emailLower);
  const id = (existing && existing.id) || stableDelegateId(emailLower);

  if (existing && existing.wacId && wacIdKey(existing.wacId) !== key) {
    await raiseAlert(store, { kind: "account-has-other-wac-id", wacId: record.wacId, emailLower, now });
    return { code: 409, body: { error: WAC_ALREADY_LINKED, code: "wac_linked" } };
  }
  const linkKey = K_WACLINK + key;
  if (!(await createKeyIfAbsent(store, linkKey, { userId: id, at: now }))) {
    const cur = await store.get(linkKey).catch(() => null);
    if (!cur || cur.userId !== id) {
      await raiseAlert(store, { kind: "wac-id-linked-elsewhere", wacId: record.wacId, emailLower, now });
      return { code: 409, body: { error: WAC_ALREADY_LINKED, code: "wac_linked" } };
    }
  }

  let passNo = validRegNo(existing && existing.regNo) || "";
  if (!passNo) {
    const safe = validRegNo(record.wacId);
    const idx = safe ? regnoIndexKey(safe) : "";
    if (idx) {
      let mine = await createKeyIfAbsent(store, idx, { userId: id });
      if (!mine) {
        const cur = await store.get(idx).catch(() => null);
        mine = Boolean(cur && cur.userId === id);
      }
      if (mine) passNo = safe;
    }
  }

  const src = sanitizeSource(source);
  const wac = {
    category: record.category || "", country: record.country || "", state: record.state || "",
    attendance: record.attendance || "", institution: record.institution || "",
  };
  const user = await updateKey(store, K_USER + id, cur => {
    const base = cur || existing || {};
    const next = {
      ...base,
      id,
      name: record.name || base.name || "",
      email: record.email || base.email || emailLower,
      emailLower,
      institute: record.institution || base.institute || "",
      regNo: validRegNo(base.regNo) || passNo,
      wacId: record.wacId,
      passLabel: record.wacId,
      wacVerified: true,
      authSource: "wac",
      wac,
      wacLinkedAt: base.wacLinkedAt || now,
      createdAt: base.createdAt || now,
    };
    if (!cur && !existing) next.source = src || "wac";
    return next;
  });

  const done = await completeRegistration(store, {
    profile: { name: user.name, age: user.age, sex: user.sex, institute: user.institute, email: user.email },
    emailLower, source, req, res,
  });
  if (done.code !== 200) return done;
  await bestEffort(() => markDelegateLinked(store, key, id), { ms: 2000, label: "wac mark linked" });
  const saved = (await store.get(K_USER + id).catch(() => null)) || user;
  return {
    code: 200,
    body: {
      ...done.body,
      profile: publicProfile(saved),
      record: lockedView(record, saved),
      needsConfirm: !saved.wacConfirmedAt,
      linked: Boolean(existing),
    },
  };
}

export async function wacVerify(msg, store, req, res) {
  const env = wacEnv();
  if (env.off) return { code: 403, body: { error: "Sign in with WAC ID is not available.", code: "wac_off" } };
  const wacId = normalizeWacId(msg && msg.wacId);
  const key = wacIdKey(wacId);
  const code = digitsOnly(msg && msg.otp);
  if (!/^\d{6}$/.test(code)) return { code: 400, body: { error: "Enter the 6-digit code from your email." } };

  let t;
  try { t = readOtpTicket(req); }
  catch { return { code: 500, body: { error: NOT_CONFIGURED } }; }
  if (!key || !t || t.wac !== key) {
    return { code: 400, body: { error: "No pending sign-in. Start again with your WAC ID." } };
  }
  if (Date.now() > (t.exp || 0)) {
    if (res) clearCookie(res, OTP_COOKIE);
    return { code: 400, body: { error: "That code has expired. Request a new one." } };
  }
  const attempts = t.attempts || 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    if (res) clearCookie(res, OTP_COOKIE);
    return { code: 429, body: { error: "Too many wrong attempts. Start again with your WAC ID." } };
  }
  if (!otpTicketMatches(t, t.email, code)) {
    if (res) {
      const next = resignOtpTicket(t, { attempts: attempts + 1 });
      if (next) setOtpCookie(res, next);
    }
    const left = OTP_MAX_ATTEMPTS - attempts - 1;
    return {
      code: 403,
      body: { error: left > 0 ? `That code does not match. ${left} attempt${left === 1 ? "" : "s"} left.` : "That code does not match. Start again with your WAC ID." },
    };
  }

  let found;
  try { found = await wacAdapter(store, env).lookup(wacId, t.email); }
  catch { found = { ok: false, reason: "unavailable" }; }
  if (!found || !found.ok) {
    if (found && found.reason === "unavailable") return { code: 503, body: { error: UNAVAILABLE, code: "wac_unavailable", retryIn: 5 } };
    if (res) clearCookie(res, OTP_COOKIE);
    return noMatch();
  }
  const r = t.linkUser
    ? await linkSignedIn(msg, store, req, res, found.record, t.linkUser)
    : await linkOrCreate(store, found.record, { source: msg && msg.source, req, res });
  // Keep the code until the account is saved, so a busy-retry with the same code works.
  if ((r.code === 200 || r.code === 409) && res) clearCookie(res, OTP_COOKIE);
  return r;
}

/** "Link your Delegate ID" for a signed-in account: the WAC record joins this account, whatever its email. */
async function linkSignedIn(msg, store, req, res, record, linkUserId) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user || sess.user.id !== linkUserId) {
    return { code: 403, body: { error: "Sign in again, then link your WAC Delegate ID." } };
  }
  const r = await linkUserToDelegate(store, sess.user, record, { via: "wac-code" });
  if (!r.ok) {
    if (r.reason === "no-account") return { code: 403, body: { error: "Sign in again, then link your WAC Delegate ID." } };
    return { code: 409, body: { error: WAC_ALREADY_LINKED, code: "wac_linked" } };
  }
  await bestEffort(() => stampQuestionsWithWacId(store, r.user), { ms: 2500, label: "wac stamp questions" });
  if (res) {
    try { setSessCookie(res, makeSessTicket({ token: sess.token, userId: r.user.id, profile: publicProfile(r.user) })); }
    catch { /* linked even if the cookie refresh fails */ }
  }
  return {
    code: 200,
    body: {
      ok: true, token: sess.token, profile: publicProfile(r.user), record: lockedView(record, r.user),
      needsConfirm: false, linked: true,
    },
  };
}

async function wacSession(msg, store, req) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return { error: { code: 403, body: { error: "not signed in" } } };
  if (!sess.user.wacId) return { error: { code: 404, body: { error: "This account is not linked to a WAC registration." } } };
  return { sess };
}

/** Locked WAC details for the confirm screen (after a reload). */
export async function wacMe(msg, store, req) {
  const { sess, error } = await wacSession(msg, store, req);
  if (error) return error;
  const repo = await delegateRepo(store);
  const rec = await repo.get(wacIdKey(sess.user.wacId)).catch(() => null);
  return {
    code: 200,
    body: { ok: true, profile: publicProfile(sess.user), record: lockedView(rec, sess.user), needsConfirm: !sess.user.wacConfirmedAt },
  };
}

/** AYURDISHA-only fields + consent. WAC fields (name, email, institution …) are never changed here. */
export async function wacConfirm(msg, store, req, res) {
  const { sess, error } = await wacSession(msg, store, req);
  if (error) return error;
  if (msg.consent !== true) return { code: 400, body: { error: "Tick the consent box to continue." } };
  const stage = String(msg.stage || "").trim();
  if (!ASK_STAGES.includes(stage)) return { code: 400, body: { error: "Choose your career stage." } };
  const interests = (Array.isArray(msg.interests) ? msg.interests : [])
    .map(s => String(s || "").trim().slice(0, 160)).filter(Boolean).slice(0, 5);
  const now = Date.now();
  const user = await updateKey(store, K_USER + sess.user.id, cur => {
    const base = cur || sess.user;
    return {
      ...base,
      stage,
      interests,
      wacConsentAt: now,
      wacConsentText: sha(WAC_CONSENT_TEXT).slice(0, 12),
      wacShareConsent: true,
      wacShareConsentAt: base.wacShareConsentAt || now,
      wacConfirmedAt: base.wacConfirmedAt || now,
    };
  });
  if (res) {
    try { setSessCookie(res, makeSessTicket({ token: sess.token, userId: user.id, profile: publicProfile(user) })); }
    catch { /* saved even if the cookie refresh fails */ }
  }
  return { code: 200, body: { ok: true, profile: publicProfile(user) } };
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

function staffRow(r) {
  return {
    wacId: r.wacId, name: r.name, email: r.email, maskedEmail: maskEmail(r.emailLower || r.email),
    phone: r.phone || "", maskedPhone: maskPhone(r.phone), institution: r.institution, category: r.category,
    country: r.country, state: r.state, attendance: r.attendance, linked: Boolean(r.linked),
  };
}

async function recentAlerts(store, limit = 20) {
  const keys = (await store.list(K_WACALERT)).sort().reverse().slice(0, limit);
  const vals = await Promise.all(keys.map(k => store.get(k)));
  return vals.filter(Boolean);
}

export async function wacStaffStats(msg, store) {
  const env = wacEnv();
  const [stats, alerts, config, matches] = await Promise.all([
    delegateStats(store),
    recentAlerts(store).catch(() => []),
    wacConfig(store),
    msg && msg.query ? findDelegates(store, msg.query) : Promise.resolve(null),
  ]);
  return {
    code: 200,
    body: {
      ok: true,
      ...stats,
      unlinked: Math.max(0, stats.total - stats.linked),
      alerts,
      mode: env.mode,
      enabled: config.enabled,
      off: env.off,
      apiConfigured: Boolean(env.url && env.key),
      pattern: env.pattern || DEFAULT_WAC_ID_PATTERN,
      clearPhrase: WAC_CLEAR_PHRASE,
      maxRows: IMPORT_MAX_ROWS,
      ...(matches ? { matches: matches.map(staffRow) } : {}),
    },
  };
}

export const WAC_OPS = new Set([
  "wacConfig", "wacStart", "wacVerify", "wacMe", "wacConfirm",
  "wacDelegatesImport", "wacDelegatesStats", "wacDelegatesClear", "wacAutoLinkAll",
]);
const WAC_STAFF_OPS = new Set(["wacDelegatesImport", "wacDelegatesStats", "wacDelegatesClear", "wacAutoLinkAll"]);

/** Router for storePlugin: resolves `{ code, body }`. */
export async function handleWacOp(op, msg, store, req, res, { staff = false } = {}) {
  if (WAC_STAFF_OPS.has(op) && !staff) return { code: 403, body: { error: "staff only" } };
  try {
    if (op === "wacConfig") return { code: 200, body: { ok: true, ...(await wacConfig(store)) } };
    if (op === "wacStart") return await wacStart(msg, store, req, res);
    if (op === "wacVerify") return await wacVerify(msg, store, req, res);
    if (op === "wacMe") return await wacMe(msg, store, req);
    if (op === "wacConfirm") return await wacConfirm(msg, store, req, res);
    if (op === "wacDelegatesStats") return await wacStaffStats(msg, store);
    if (op === "wacDelegatesImport") {
      const rows = Array.isArray(msg.rows) ? msg.rows : null;
      if (!rows || !rows.length) return { code: 400, body: { error: "No delegate rows to import." } };
      const batchId = /^[\w-]{4,40}$/.test(String(msg.batchId || "")) ? String(msg.batchId) : `b${Date.now().toString(36)}`;
      const out = await importDelegates(store, { rows, batchId, filename: msg.filename, pattern: wacEnv().pattern });
      resetWacConfigCache();
      resetAutoLinkCache();
      return { code: 200, body: { ok: true, batchId, ...out } };
    }
    if (op === "wacAutoLinkAll") {
      const out = await wacAutoLinkAll(store, { dryRun: msg.dryRun !== false, cursor: msg.cursor, limit: msg.limit });
      return { code: 200, body: { ok: true, ...out } };
    }
    if (op === "wacDelegatesClear") {
      if (String(msg.confirm || "").trim() !== WAC_CLEAR_PHRASE) {
        return { code: 400, body: { error: `Type ${WAC_CLEAR_PHRASE} to confirm.` } };
      }
      const out = await clearUnlinkedDelegates(store);
      resetWacConfigCache();
      resetAutoLinkCache();
      return { code: 200, body: { ok: true, ...out } };
    }
  } catch (err) {
    console.error(`[aym-wac] ${op} failed:`, err && err.message ? err.message : err);
    return { code: 503, body: { error: "The hall is busy right now. Try again in a moment.", code: "busy", retryIn: 3 } };
  }
  return { code: 400, body: { error: "unknown op" } };
}
