import crypto from "node:crypto";
import { sendOtpEmail } from "./mailer.js";
import {
  OTP_COOKIE,
  OTP_TTL_MS,
  makeOtpTicket,
  readOtpTicket,
  otpTicketMatches,
  setOtpCookie,
  clearCookie,
  resignOtpTicket,
  makeSessTicket,
  readSessTicket,
  setSessCookie,
} from "./otpTicket.js";
import { formatIssuedWac, K_WAC_SEQ, WAC_SEQ_DOC } from "./wacRegNo.js";

/**
 * Delegate registration with email OTP verification.
 * Pending OTPs live only in a signed httpOnly cookie (HMAC of OTP + email +
 * expiry). Verify must not depend on store.json or the send-otp instance.
 *
 * Completed records stay in the KV store:
 *   aym:user:<id>        full profile
 *   aym:email:<email>    email -> userId index
 *   aym:regno:<number>   registration-number collision index
 *   aym:sess:<token>     session token -> userId
 *   aym:meta:wac-seq     sequential WAC issuer (file/blob); Firestore uses meta/wac-seq
 */
export const K_USER = "aym:user:";
export const K_EMAIL = "aym:email:";
export const K_REGNO = "aym:regno:";
const K_SESS = "aym:sess:";
const K_Q = "aym:q:";
const SIX_DIGIT = /^\d{6}$/;

const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const SEXES = ["Female", "Male", "Other"];

const normEmail = e => String(e || "").trim().toLowerCase();
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const digitsOnly = s => String(s || "").replace(/\D/g, "").slice(0, 6);

/** Issued or legacy WAC registration number — primary student identity. */
export function cleanWacRegNo(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (t.length < 4 || t.length > 40) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_/ ]{2,38}[A-Za-z0-9]$/.test(t) && !/^[A-Za-z0-9]{4,40}$/.test(t)) return "";
  return t;
}

function normRegNoKey(s) {
  return String(s || "").trim().toUpperCase().replace(/[\s_\-/]+/g, "");
}

function cleanProfile(msg) {
  const name = String(msg.name || "").trim();
  const age = Number(msg.age);
  const sex = String(msg.sex || "").trim();
  const institute = String(msg.institute || "").trim();
  const email = String(msg.email || "").trim();
  const problems = [];
  if (name.length < 2) problems.push("your full name");
  if (!Number.isFinite(age) || age < 15 || age > 100) problems.push("a valid age (15–100)");
  if (!SEXES.includes(sex)) problems.push("your sex");
  if (institute.length < 2) problems.push("your institute name");
  if (!validEmail(email)) problems.push("a valid email address");
  // WAC number is issued on OTP verify — never typed at Register.
  return { profile: { name, age, sex, institute, email, regNo: "" }, problems };
}

export function publicProfile(user) {
  return {
    name: user.name, age: user.age, sex: user.sex,
    institute: user.institute, email: user.email,
    regNo: user.regNo || "", createdAt: user.createdAt,
  };
}

export function sixDigit(s) {
  const t = String(s || "").trim();
  return SIX_DIGIT.test(t) ? t : "";
}

/** Accept issued 11WAC/2026/NNNN codes, staff/legacy WAC strings, or old 6-digit IDs. */
export function validRegNo(s) {
  return cleanWacRegNo(s) || sixDigit(s);
}

function stableDelegateId(emailLower) {
  return crypto.createHash("sha256").update("aym-del:" + emailLower).digest("hex").slice(0, 16);
}

async function applyEntries(store, entries) {
  const patch = entries && typeof entries === "object" ? entries : {};
  if (!Object.keys(patch).length) return;
  if (typeof store.merge === "function") {
    await store.merge(patch);
    return;
  }
  for (const [k, v] of Object.entries(patch)) await store.set(k, v);
}

export function regnoIndexKey(regNo) {
  const key = normRegNoKey(regNo);
  return key ? K_REGNO + key : "";
}

function findUserIdByRegNoInDb(db, regNo) {
  const key = regnoIndexKey(regNo);
  if (!key || !db) return null;
  const idx = db[key];
  if (idx && idx.userId) return idx.userId;
  const raw = String(regNo || "").trim();
  if (raw && raw !== normRegNoKey(raw)) {
    const idx2 = db[K_REGNO + raw];
    if (idx2 && idx2.userId) return idx2.userId;
  }
  return null;
}

/** Registered delegate for a WAC number, read straight from the store indexes. */
export async function findUserByRegNo(store, regNo) {
  const raw = String(regNo || "").trim();
  const key = regnoIndexKey(raw);
  if (!key) return null;
  let idx = await store.get(key);
  if ((!idx || !idx.userId) && raw !== normRegNoKey(raw)) idx = await store.get(K_REGNO + raw);
  if (!idx || !idx.userId) return null;
  const user = await store.get(K_USER + idx.userId);
  return user && user.id ? user : null;
}

/** True when this WAC number already belongs to a different email. Empty numbers never clash. */
export function wacOwnedByOtherEmail(db, regNo, email) {
  const wac = validRegNo(regNo);
  if (!wac) return false;
  const takenBy = findUserIdByRegNoInDb(db, wac);
  if (!takenBy) return false;
  const taken = db[K_USER + takenBy];
  if (!taken) return false;
  return normEmail(taken.email) !== normEmail(email);
}

export async function persistDelegate(store, user) {
  if (!user || !user.id) return;
  const emailLower = normEmail(user.emailLower || user.email);
  const patch = { [K_USER + user.id]: user };
  if (emailLower) patch[K_EMAIL + emailLower] = { userId: user.id };
  const rk = regnoIndexKey(user.regNo);
  if (rk) patch[rk] = { userId: user.id };
  await applyEntries(store, patch);
}

function httpErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function writeDelegateIntoDb(db, user) {
  if (!user || !user.id) return;
  db[K_USER + user.id] = user;
  const emailLower = normEmail(user.emailLower || user.email);
  if (emailLower) db[K_EMAIL + emailLower] = { userId: user.id };
  const rk = regnoIndexKey(user.regNo);
  if (rk) db[rk] = { userId: user.id };
}

function assignNextWacInDb(db, user) {
  const u = user && user.id && db[K_USER + user.id] ? db[K_USER + user.id] : user;
  if (!u) return u;
  if (validRegNo(u.regNo)) return u;
  let n = db[K_WAC_SEQ] && Number(db[K_WAC_SEQ].last);
  if (!Number.isFinite(n)) n = 0;
  let wac = "";
  for (let i = 0; i < 24; i++) {
    n += 1;
    wac = formatIssuedWac(n);
    const taken = findUserIdByRegNoInDb(db, wac);
    if (!taken || taken === u.id) break;
  }
  db[K_WAC_SEQ] = { last: n, updatedAt: Date.now() };
  const next = {
    ...u,
    id: u.id || crypto.randomBytes(8).toString("hex"),
    regNo: wac,
    emailLower: normEmail(u.emailLower || u.email),
    createdAt: u.createdAt || Date.now(),
  };
  writeDelegateIntoDb(db, next);
  return next;
}

/**
 * Staff-safe unique issuer. File/blob: one transact. Firestore: meta/wac-seq
 * transaction then unique regno index. Existing numbers are never replaced.
 */
export async function ensureIssuedRegNo(store, user) {
  if (!user) return user;
  if (validRegNo(user.regNo)) return user;

  if (user.id) {
    try {
      const existing = await store.get(K_USER + user.id);
      if (existing && validRegNo(existing.regNo)) return existing;
    } catch { /* assign below */ }
  }

  const atomicMap = store.name !== "firestore" && typeof store.transact === "function";
  if (atomicMap) {
    let saved = user;
    await store.transact(db => {
      saved = assignNextWacInDb(db, user);
      return db;
    });
    return saved;
  }

  for (let i = 0; i < 12; i++) {
    if (user.id) {
      try {
        const fresh = await store.get(K_USER + user.id);
        if (fresh && validRegNo(fresh.regNo)) return fresh;
        if (fresh) user = fresh;
      } catch { /* continue */ }
    }
    let seq;
    if (typeof store.incrementCounter === "function") {
      seq = await store.incrementCounter(WAC_SEQ_DOC);
    } else {
      seq = Date.now() % 1000000;
    }
    const wac = formatIssuedWac(seq);
    try {
      const idx = await store.get(regnoIndexKey(wac));
      if (idx && idx.userId && idx.userId !== user.id) continue;
    } catch { /* persist anyway */ }
    const next = {
      ...user,
      id: user.id || crypto.randomBytes(8).toString("hex"),
      regNo: wac,
      emailLower: normEmail(user.emailLower || user.email),
      createdAt: user.createdAt || Date.now(),
    };
    await persistDelegate(store, next);
    try {
      const again = await store.get(K_USER + next.id);
      if (again && validRegNo(again.regNo)) return again;
    } catch { /* return next */ }
    return next;
  }
  throw httpErr(500, "We could not issue your WAC registration number. Try again.");
}

async function hydrateUserWac(store, user) {
  if (!user) return user;
  if (validRegNo(user.regNo)) return user;
  return ensureIssuedRegNo(store, user);
}

async function sessionUser(msg, store, req) {
  const token = String(msg && msg.token || "").trim();
  if (/^[0-9a-f]{48}$/.test(token)) {
    try {
      const sess = await store.get(K_SESS + token);
      if (sess && sess.userId) {
        const user = await store.get(K_USER + sess.userId);
        if (user) return { user, token, cookie: null };
      }
    } catch { /* cookie */ }
  }
  const cookie = readSessTicket(req);
  if (!cookie || !cookie.profile) return null;
  if (cookie.userId) {
    try {
      const user = await store.get(K_USER + cookie.userId);
      if (user) return { user, token: cookie.token || token, cookie };
    } catch { /* reconstruct */ }
  }
  const emailLower = normEmail(cookie.profile.email);
  if (emailLower) {
    const fromEmail = await userByEmail(store, emailLower);
    if (fromEmail) return { user: fromEmail, token: cookie.token || token, cookie };
  }
  if (!cookie.profile.email) return null;
  return {
    user: {
      id: cookie.userId || crypto.randomBytes(8).toString("hex"),
      ...cookie.profile,
      emailLower: normEmail(cookie.profile.email),
    },
    token: cookie.token || token,
    cookie,
  };
}

function refreshSess(res, sess, user) {
  if (!res || !sess || !user) return;
  try {
    setSessCookie(res, makeSessTicket({
      token: sess.token,
      userId: sess.user && sess.user.id || user.id,
      profile: publicProfile(user),
    }));
  } catch { /* profile is saved even if cookie refresh fails */ }
}

export async function applyWacToUser(store, user, rawRegNo) {
  const wac = validRegNo(rawRegNo);
  if (!wac) throw httpErr(400, "Enter a valid WAC registration number.");
  if (validRegNo(user.regNo) === wac) return { ...user, regNo: wac };

  const write = (db, u) => {
    if (wacOwnedByOtherEmail(db, wac, u.email)) {
      throw httpErr(409, "That WAC registration number is already linked to a different AYURDISHA profile.");
    }
    const next = { ...u, regNo: wac, emailLower: normEmail(u.emailLower || u.email) };
    db[K_USER + next.id] = next;
    if (next.emailLower) db[K_EMAIL + next.emailLower] = { userId: next.id };
    const rk = regnoIndexKey(wac);
    if (rk) db[rk] = { userId: next.id };
    return next;
  };

  if (typeof store.transact === "function") {
    let saved = user;
    await store.transact(db => {
      saved = write(db, user);
      return db;
    });
    return saved;
  }

  const db = typeof store.snapshot === "function" ? (await store.snapshot()) || {} : {};
  if (wacOwnedByOtherEmail(db, wac, user.email)) {
    throw httpErr(409, "That WAC registration number is already linked to a different AYURDISHA profile.");
  }
  const next = { ...user, regNo: wac, emailLower: normEmail(user.emailLower || user.email) };
  await persistDelegate(store, next);
  return next;
}

export async function assertUserPersisted(store, user) {
  const got = await store.get(K_USER + user.id);
  if (got && got.id && normEmail(got.email) === normEmail(user.email)) return got;
  await persistDelegate(store, user);
  const again = await store.get(K_USER + user.id);
  if (!again || !again.id || normEmail(again.email) !== normEmail(user.email)) {
    throw new Error("delegate-missing");
  }
  return again;
}

/** Mutate a loaded KV map: create/update aym:user + email/reg index. */
export function upsertDelegateIntoDb(db, fields) {
  const name = String(fields && fields.name || "").trim();
  const email = String(fields && fields.email || "").trim();
  const emailLower = normEmail(email);
  if (name.length < 2 || !validEmail(emailLower)) return null;
  if (isDemoDelegate({ name, email })) return null;

  const idx = db[K_EMAIL + emailLower];
  let user = idx && idx.userId ? db[K_USER + idx.userId] : null;
  if (!user) {
    for (const k of Object.keys(db)) {
      if (!k.startsWith(K_USER)) continue;
      const u = db[k];
      if (u && normEmail(u.email) === emailLower) { user = u; break; }
    }
  }

  const incomingReg = validRegNo(fields.regNo) || validRegNo(fields.delegateNo) || validRegNo(fields.wacRegNo);
  const institute = String(fields.institute || fields.institution || (user && user.institute) || "").trim();
  const ageRaw = fields.age != null && fields.age !== "" ? Number(fields.age) : NaN;
  const age = Number.isFinite(ageRaw) ? ageRaw : (user && user.age);
  const sex = String(fields.sex || (user && user.sex) || "").trim();
  const selfId = (user && user.id) || stableDelegateId(emailLower);
  let nextReg = (user && validRegNo(user.regNo)) || "";
  // Never overwrite an issued number from a form. Fill only if the profile has none.
  if (!nextReg && incomingReg) {
    const takenBy = findUserIdByRegNoInDb(db, incomingReg);
    if (!takenBy || takenBy === selfId) nextReg = incomingReg;
  }

  if (user) {
    user = {
      ...user,
      id: selfId,
      name,
      email,
      emailLower,
      institute: institute || user.institute,
      age: age != null ? age : user.age,
      sex: sex || user.sex,
      // Keep the issued WAC number; never invent or overwrite from Ask Desk.
      regNo: nextReg,
    };
    if (!user.createdAt) user.createdAt = fields.createdAt || Date.now();
  } else {
    user = {
      id: selfId,
      name,
      email,
      emailLower,
      institute,
      age,
      sex,
      regNo: nextReg,
      createdAt: fields.createdAt || Date.now(),
    };
  }

  db[K_USER + user.id] = user;
  db[K_EMAIL + emailLower] = { userId: user.id };
  const rk = regnoIndexKey(user.regNo);
  if (rk) db[rk] = { userId: user.id };
  return user;
}

/** Questions with name+email become delegate cards when aym:user is missing. */
export function backfillDelegatesFromQuestions(db) {
  const before = {};
  for (const k of Object.keys(db)) {
    if (k.startsWith(K_USER) || k.startsWith(K_EMAIL) || k.startsWith(K_REGNO)) before[k] = db[k];
  }
  for (const k of Object.keys(db)) {
    if (!k.startsWith(K_Q)) continue;
    upsertDelegateIntoDb(db, db[k]);
  }
  const patch = {};
  for (const k of Object.keys(db)) {
    if (!(k.startsWith(K_USER) || k.startsWith(K_EMAIL) || k.startsWith(K_REGNO))) continue;
    if (!(k in before) || JSON.stringify(before[k]) !== JSON.stringify(db[k])) patch[k] = db[k];
  }
  return patch;
}

export function delegateCardsFromDb(db) {
  const cards = [];
  const seen = new Set();
  for (const k of Object.keys(db || {})) {
    if (!k.startsWith(K_USER)) continue;
    const u = db[k];
    if (!u || !u.email || !u.name || isDemoDelegate(u)) continue;
    const email = normEmail(u.email);
    if (seen.has(email)) continue;
    seen.add(email);
    cards.push({
      name: u.name, age: u.age, sex: u.sex,
      institute: u.institute || u.institution || "",
      email: u.email, regNo: u.regNo, createdAt: u.createdAt,
    });
  }
  cards.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return cards;
}

async function issueSession(store, userId) {
  const token = crypto.randomBytes(24).toString("hex");
  try { await store.set(K_SESS + token, { userId, createdAt: Date.now() }); }
  catch { /* cookie session still issued */ }
  return token;
}

async function userByEmail(store, emailLower) {
  try {
    const idx = await store.get(K_EMAIL + emailLower);
    if (!idx || !idx.userId) return null;
    return store.get(K_USER + idx.userId);
  } catch {
    return null;
  }
}

function pendingFromCookie(req, emailLower) {
  const t = readOtpTicket(req);
  if (!t || t.email !== emailLower) return null;
  return {
    lastSentAt: t.lastSentAt || 0,
    attempts: t.attempts || 0,
    expiresAt: t.exp,
    profile: t.profile,
    ticket: t,
  };
}

async function createOrRefreshOtp(store, profile, { isResend = false, req, res } = {}) {
  const emailLower = normEmail(profile.email);
  let existingCookie = null;
  try {
    existingCookie = pendingFromCookie(req, emailLower);
  } catch (err) {
    console.error("[aym-register] OTP cookie read failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Verification is not configured on this server. Try again shortly." } };
  }
  const now = Date.now();

  const lastSentAt = existingCookie && existingCookie.lastSentAt || 0;
  if (lastSentAt && now - lastSentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000);
    return { code: 429, body: { error: `Please wait ${wait}s before requesting another code.`, retryIn: wait } };
  }

  const keptProfile = isResend && existingCookie && existingCookie.profile ? existingCookie.profile : profile;
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");

  let ticket;
  try {
    ticket = makeOtpTicket({ email: emailLower, otp, profile: keptProfile, now, lastSentAt: now, attempts: 0 });
  } catch (err) {
    console.error("[aym-register] OTP cookie sign failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Verification is not configured on this server. Try again shortly." } };
  }

  let delivery;
  try {
    ({ delivery } = await sendOtpEmail(keptProfile.email, otp, keptProfile.name));
  } catch (err) {
    console.error("[aym-register] OTP email failed:", err && err.message ? err.message : err);
    return { code: 502, body: { error: "We could not send the verification email. Try again in a minute." } };
  }

  if (!res) {
    return { code: 500, body: { error: "Verification is not configured on this server. Try again shortly." } };
  }
  setOtpCookie(res, ticket);

  return { code: 200, body: { ok: true, delivery, resendIn: RESEND_COOLDOWN_MS / 1000, expiresIn: OTP_TTL_MS / 1000 } };
}

export async function regStart(msg, store, req, res) {
  const { profile, problems } = cleanProfile(msg);
  if (problems.length) {
    return { code: 400, body: { error: `Add ${problems.join(", ")} first.` } };
  }
  return createOrRefreshOtp(store, profile, { req, res });
}

export async function regResend(msg, store, req, res) {
  const emailLower = normEmail(msg.email);
  if (!validEmail(emailLower)) return { code: 400, body: { error: "Invalid email." } };
  let cookiePending;
  try {
    cookiePending = pendingFromCookie(req, emailLower);
  } catch (err) {
    console.error("[aym-register] OTP cookie read failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Verification is not configured on this server. Try again shortly." } };
  }
  const profile = cookiePending && cookiePending.profile;
  if (!profile) {
    return { code: 400, body: { error: "Start the registration again — no pending verification for that email." } };
  }
  if (Date.now() > (cookiePending.expiresAt || 0)) {
    if (res) clearCookie(res, OTP_COOKIE);
    return { code: 400, body: { error: "That code has expired. Start the registration again." } };
  }
  return createOrRefreshOtp(store, profile, { isResend: true, req, res });
}

export async function regVerify(msg, store, req, res) {
  const emailLower = normEmail(msg.email);
  const entered = digitsOnly(msg.otp);
  if (!/^\d{6}$/.test(entered)) return { code: 400, body: { error: "Enter the 6-digit code from your email." } };

  let cookieTicket;
  try {
    cookieTicket = readOtpTicket(req);
  } catch (err) {
    console.error("[aym-register] OTP cookie read failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Verification is not configured on this server. Try again shortly." } };
  }

  const cookieOk = otpTicketMatches(cookieTicket, emailLower, entered);

  if (!cookieOk) {
    if (!cookieTicket || cookieTicket.email !== emailLower) {
      return { code: 400, body: { error: "No pending verification. Start the registration again." } };
    }
    if (Date.now() > (cookieTicket.exp || 0)) {
      if (res) clearCookie(res, OTP_COOKIE);
      return { code: 400, body: { error: "That code has expired. Request a new one." } };
    }
    const attempts = cookieTicket.attempts || 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      if (res) clearCookie(res, OTP_COOKIE);
      return { code: 429, body: { error: "Too many wrong attempts. Start the registration again." } };
    }
    if (res) {
      const next = resignOtpTicket(cookieTicket, { attempts: attempts + 1 });
      if (next) setOtpCookie(res, next);
    }
    const left = OTP_MAX_ATTEMPTS - attempts - 1;
    return {
      code: 403,
      body: {
        error: left > 0
          ? `That code does not match. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "That code does not match. Start the registration again.",
      },
    };
  }

  const profile = cookieTicket && cookieTicket.profile;
  if (!profile || !profile.email) {
    return { code: 400, body: { error: "No pending verification. Start the registration again." } };
  }

  if (res) clearCookie(res, OTP_COOKIE);

  let user = await userByEmail(store, emailLower);
  const sessCookie = readSessTicket(req);
  if (!user && sessCookie && sessCookie.profile && normEmail(sessCookie.profile.email) === emailLower) {
    user = {
      id: sessCookie.userId || crypto.randomBytes(8).toString("hex"),
      ...sessCookie.profile,
      emailLower,
      name: profile.name,
      age: profile.age,
      sex: profile.sex,
      institute: profile.institute,
      email: profile.email,
    };
  }

  // Issue a unique congress-style WAC number here — never wait for Ask Desk.
  if (user) {
    user = {
      ...user,
      name: profile.name, age: profile.age, sex: profile.sex, institute: profile.institute,
      email: profile.email, emailLower,
      regNo: user.regNo || "",
    };
    if (!user.id) user.id = crypto.randomBytes(8).toString("hex");
  } else {
    user = {
      id: crypto.randomBytes(8).toString("hex"),
      name: profile.name, age: profile.age, sex: profile.sex, institute: profile.institute,
      email: profile.email, emailLower,
      regNo: "",
      createdAt: Date.now(),
    };
  }

  try {
    await persistDelegate(store, user);
    user = await ensureIssuedRegNo(store, user);
    user = await assertUserPersisted(store, user);
  } catch (err) {
    console.error("[aym-register] user persist failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Email verified, but we could not save your registration. Please try again." } };
  }

  if (!user || !user.id) {
    return { code: 500, body: { error: "We verified your email but could not save your registration. Try again." } };
  }

  const token = await issueSession(store, user.id);
  if (res) setSessCookie(res, makeSessTicket({ token, userId: user.id, profile: publicProfile(user) }));
  return { code: 200, body: { ok: true, token, profile: publicProfile(user) } };
}

/** Own profile via session token or signed session cookie. Issues a WAC number if missing. */
export async function regMe(msg, store, req, res) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return { code: 403, body: { error: "not signed in" } };
  let user = sess.user;
  try {
    user = await hydrateUserWac(store, user);
  } catch (err) {
    console.error("[aym-register] issue WAC on regMe failed:", err && err.message ? err.message : err);
    if (err && err.code === 500) return { code: 500, body: { error: err.message } };
  }
  refreshSess(res, sess, user);
  return { code: 200, body: { ok: true, profile: publicProfile(user) } };
}

/** Public cannot self-set a WAC number. Missing numbers are issued; staff may override. */
export async function regSaveWac(msg, store, req, res, { staff = false } = {}) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return { code: 403, body: { error: "not signed in" } };
  try {
    let user = sess.user;
    if (staff && msg && msg.regNo) {
      user = await applyWacToUser(store, user, msg.regNo);
    } else {
      user = await ensureIssuedRegNo(store, user);
    }
    refreshSess(res, sess, user);
    return { code: 200, body: { ok: true, profile: publicProfile(user) } };
  } catch (err) {
    if (err && (err.code === 400 || err.code === 409)) {
      return { code: err.code, body: { error: err.message } };
    }
    console.error("[aym-register] save WAC failed:", err && err.message ? err.message : err);
    return { code: 500, body: { error: "Could not issue your WAC registration number. Try again." } };
  }
}

/** Signed-in delegate with an issued number, used when filing an Ask Desk question. */
export async function ensureSessionIssuedRegNo(msg, store, req) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return null;
  const user = await ensureIssuedRegNo(store, sess.user);
  return { ...sess, user };
}

/** Recover a session with the regNo + email pair. */
export async function regRecover(msg, store, req, res) {
  const emailLower = normEmail(msg.email);
  const regNo = String(msg.regNo || "").trim();
  const user = await userByEmail(store, emailLower);
  if (!user || String(user.regNo) !== regNo) {
    const cookie = readSessTicket(req);
    if (cookie && cookie.profile && normEmail(cookie.profile.email) === emailLower && String(cookie.profile.regNo) === regNo) {
      const token = cookie.token || crypto.randomBytes(24).toString("hex");
      return { code: 200, body: { ok: true, token, profile: cookie.profile } };
    }
    return { code: 403, body: { error: "That WAC registration number and email do not match." } };
  }
  const token = await issueSession(store, user.id);
  if (res) setSessCookie(res, makeSessTicket({ token, userId: user.id, profile: publicProfile(user) }));
  return { code: 200, body: { ok: true, token, profile: publicProfile(user) } };
}

export function isDemoDelegate(u) {
  const email = String(u && u.email || "").trim().toLowerCase();
  const name = String(u && u.name || "").trim();
  if (/@example\.(com|in|org)$/i.test(email)) return true;
  if (/^(demo\d*|finish\.agent|teststudent)@/i.test(email)) return true;
  if (/^demo student/i.test(name)) return true;
  if (/^(finish agent|test student)$/i.test(name)) return true;
  return false;
}

function isGenuineDelegate(u) {
  if (!u || !(u.id || u.email)) return false;
  if (!u.email || !u.name) return false;
  return !isDemoDelegate(u);
}

/** Staff-only: every genuine registered delegate, newest first. */
export async function regUsers(store) {
  const keys = await store.list(K_USER);
  const users = [];
  for (let i = 0; i < keys.length; i += 8) {
    const chunk = await Promise.all(keys.slice(i, i + 8).map(k => store.get(k)));
    chunk.forEach(u => { if (isGenuineDelegate(u)) users.push(publicProfile(u)); });
  }
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { code: 200, body: { ok: true, users, backend: store.name } };
}
