/**
 * Trusted-device staff sessions (docs/security/STAFF-ACCESS-SPEC.md §4): one full sign-in per device,
 * then a rolling session — kept alive by use for months, ended by 90 days idle, sign-out, a device
 * sign-out or a revoke — with the role re-checked on every request (≤ 30 s cache).
 * Real HTTP handler, isolated file store, console mail, a fake session clock (`staffClock`).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { serviceHeaders } from "./helpers/staffAuth.mjs";

const storeFile = path.join(os.tmpdir(), `aym-staff-sessions-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
const PASSCODE = `test-passphrase-${crypto.randomBytes(6).toString("hex")}`;
const ADMIN = "owner@staff-qa.test";
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock",
  ADMIN_PIN: PASSCODE, OTP_COOKIE_SECRET: `test-cookie-secret-${crypto.randomBytes(8).toString("hex")}`, STAFF_ADMIN_EMAILS: ADMIN, AYM_STAFF_DELAY_MS: "0",
});
delete process.env.VERCEL;

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
console.log = (...args) => {
  const m = args.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) otpLog.set(m[1].toLowerCase(), m[2]);
};
console.error = () => {};

const { aymStoreHandler } = await import("../server/storePlugin.js");
const staffAuth = await import("../server/staffAuth.js");
const { encodeSigned } = await import("../server/otpTicket.js");

const DAY = 24 * 60 * 60 * 1000;
let clock = Date.now();
staffAuth.staffClock.now = () => clock;
const realClock = () => { clock = Date.now(); };

let server;
let base;
let ipSeq = 0;
before(async () => {
  server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  console.log = realLog;
  console.error = realErr;
  staffAuth.staffClock.now = () => Date.now();
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  phone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
};

function client({ ua = UA.mac, headers = {} } = {}) {
  const ip = `198.51.100.${(ipSeq += 1) % 250}`;
  const jar = new Map();
  const call = async (op, payload = {}) => {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, "user-agent": ua, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...headers },
      body: JSON.stringify({ op, ...payload }),
    });
    const cookies = r.headers.getSetCookie();
    for (const c of cookies) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    return { status: r.status, body: await r.json().catch(() => ({})), cookies };
  };
  call.jar = jar;
  return call;
}

const service = client({ headers: serviceHeaders() });
const withCookie = value => client({ headers: { cookie: `aym_staff=${value}` } });

async function signIn(email, opts = {}) {
  const call = client(opts);
  const start = await call("staffStart", { passcode: PASSCODE, email });
  assert.equal(start.status, 200, `staffStart ${JSON.stringify(start.body)}`);
  const otp = otpLog.get(email);
  otpLog.delete(email);
  const verify = await call("staffVerify", { email, otp });
  assert.equal(verify.status, 200, `staffVerify ${JSON.stringify(verify.body)}`);
  return { call, verify };
}

async function approvedCoAdmin(email, opts) {
  const s = await signIn(email, opts);
  if (s.verify.body.status === "pending") assert.equal((await service("staffDecide", { email, decision: "approve" })).status, 200);
  return s.call;
}

const auditOf = async action => (await service("staffAudit", { action, limit: 500 })).body.entries || [];
const readDb = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
const writeDb = db => fs.writeFileSync(storeFile, JSON.stringify(db));

/* ------------------------------------------------------------------ persistence */

test("admin: one sign-in, then in for 200+ days of regular use with no passcode or email code", async () => {
  realClock();
  const { call, verify } = await signIn(ADMIN);
  assert.equal(verify.body.status, "approved");
  const first = call.jar.get("aym_staff");
  const sentBefore = otpLog.size;
  const seen = new Set([first]);
  for (let day = 3; day <= 210; day += 3) {
    clock += 3 * DAY;
    const me = (await call("whoami")).body;
    assert.equal(me.staff, true, `day ${day}`);
    assert.equal(me.role, "admin");
    assert.equal(me.trustedDevice, true);
    assert.ok(me.expiresAt >= clock + 89 * DAY, "idle window restarts with use");
    seen.add(call.jar.get("aym_staff"));
  }
  assert.equal((await call("staffSnapshot")).status, 200);
  assert.ok(seen.size >= 60, "the cookie value rotated as days passed");
  assert.equal(otpLog.size, sentBefore, "no new email code was ever needed");
});

test("rotation keeps access, re-issues the 180-day cookie, and retires old copies a week later", async () => {
  realClock();
  const { call } = await signIn("rotate@staff-qa.test");
  await service("staffDecide", { email: "rotate@staff-qa.test", decision: "approve" });
  const a = call.jar.get("aym_staff");
  clock += 2 * DAY;
  const r = await call("whoami");
  assert.equal(r.body.staff, true);
  const rotated = r.cookies.find(c => c.startsWith("aym_staff="));
  assert.ok(rotated && /Max-Age=15552000/.test(rotated) && /HttpOnly/.test(rotated) && /SameSite=Lax/.test(rotated));
  assert.notEqual(call.jar.get("aym_staff"), a, "new cookie value");
  assert.equal((await withCookie(a)("whoami")).body.staff, true, "an older copy still works within the grace week");
  clock += 10 * DAY;
  assert.equal((await call("whoami")).body.staff, true, "the device in use rotates again");
  const stale = (await withCookie(a)("whoami")).body;
  assert.equal(stale.staff, false, "a copy from before the last rotation week is refused");
  assert.equal(stale.status, "expired");
  assert.equal((await call("staffSnapshot")).status, 200);
});

test("idle: 89 days away is fine, 90+ days without use asks for the full sign-in again", async () => {
  realClock();
  const call = await approvedCoAdmin("idle@staff-qa.test");
  clock += 89 * DAY;
  assert.equal((await call("whoami")).body.staff, true);
  clock += 91 * DAY;
  const r = await call("whoami");
  assert.equal(r.body.staff, false);
  assert.equal(r.body.status, "expired");
  assert.ok(r.cookies.some(c => /^aym_staff=;/.test(c)), "cookie cleared");
  assert.equal((await call("staffSnapshot")).status, 403);
});

test("the server record decides: a signed cookie with no live device record is refused", async () => {
  realClock();
  const forged = withCookie(encodeSigned({ v: 3, kind: "staff", email: ADMIN, sid: "no-such-device", iat: clock, epoch: 0 }));
  const r = await forged("whoami");
  assert.equal(r.body.staff, false);
  assert.equal(r.body.status, "expired");
  // Idle on the server even though the cookie itself was rotated recently.
  const call = await approvedCoAdmin("server-idle@staff-qa.test");
  const db = readDb();
  const key = Object.keys(db).find(k => k.startsWith("aym:staff:sess:") && db[k].email === "server-idle@staff-qa.test");
  db[key].lastSeenAt = clock - 91 * DAY;
  writeDb(db);
  clock += 31 * 1000;
  assert.equal((await call("whoami")).body.staff, false, "lastSeenAt older than 90 days ends it");
});

test("new device or browser: no cookie means the full passcode + email flow", async () => {
  realClock();
  await approvedCoAdmin("two-devices@staff-qa.test");
  const other = client({ ua: UA.phone });
  assert.equal((await other("whoami")).body.staff, false);
  assert.equal((await other("staffSnapshot")).status, 403);
  const second = await signIn("two-devices@staff-qa.test", { ua: UA.phone });
  assert.equal(second.verify.body.status, "approved", "approval persists: the new device needs no new approval");
  assert.equal((await second.call("staffSnapshot")).status, 200);
});

/* ------------------------------------------------------------------ revoke / sign-out */

test("revoke ends access at once on every device; re-approval still needs a fresh sign-in", async () => {
  realClock();
  const email = "revoke-all@staff-qa.test";
  const mac = await approvedCoAdmin(email);
  const phone = (await signIn(email, { ua: UA.phone })).call;
  assert.equal((await mac("staffSnapshot")).status, 200);
  assert.equal((await phone("staffSnapshot")).status, 200);
  assert.equal((await service("staffDecide", { email, decision: "revoke" })).status, 200);
  for (const c of [mac, phone]) {
    assert.equal((await c("staffSnapshot")).status, 403);
    assert.equal((await c("whoami")).body.status, "revoked");
  }
  await service("staffDecide", { email, decision: "approve" });
  assert.equal((await mac("staffSnapshot")).status, 403, "old devices stay signed out");
});

test("admin device list: browser + last seen, 'Sign out this device' and 'Sign out all devices', audited", async () => {
  realClock();
  const email = "devices@staff-qa.test";
  const mac = await approvedCoAdmin(email, { ua: UA.mac });
  const phone = (await signIn(email, { ua: UA.phone })).call;
  const win = (await signIn(email, { ua: UA.win })).call;
  clock += 60 * 1000;
  const list = await service("staffSessions", { email });
  assert.equal(list.status, 200);
  const devices = list.body.sessions;
  assert.equal(devices.length, 3);
  assert.deepEqual(devices.map(d => d.browser).sort(), ["Chrome on macOS", "Edge on Windows", "Safari on iOS"]);
  assert.ok(devices.every(d => d.lastSeenAt > 0 && d.createdAt > 0 && d.device && d.email === email));
  const raw = JSON.stringify(list.body);
  for (const c of [mac, phone, win]) {
    const sid = JSON.parse(Buffer.from(c.jar.get("aym_staff"), "base64url").toString()).sid;
    assert.ok(!raw.includes(sid), "session ids never leave the server");
  }
  const phoneDevice = devices.find(d => d.browser === "Safari on iOS").device;
  const one = await service("staffSessionRevoke", { email, device: phoneDevice });
  assert.equal(one.status, 200);
  assert.equal(one.body.count, 1);
  assert.equal((await phone("whoami")).body.staff, false, "that device is signed out at once");
  assert.equal((await phone("staffSnapshot")).status, 403);
  assert.equal((await mac("whoami")).body.staff, true, "other devices unaffected");
  assert.equal((await service("staffSessions", { email })).body.sessions.length, 2);
  assert.ok((await auditOf("session.revoke")).some(e => e.target === email && e.detail && e.detail.device === "Safari on iOS"));

  const all = await service("staffSessionRevokeAll", { email });
  assert.equal(all.body.count, 2);
  assert.equal((await mac("whoami")).body.staff, false);
  assert.equal((await win("whoami")).body.staff, false);
  assert.ok((await auditOf("session.revoke_all")).some(e => e.target === email));
  const again = await signIn(email);
  assert.equal(again.verify.body.status, "approved", "still a co-admin: signing out devices is not a revoke");
});

test("members manage only their own devices; sign out (one or all) works for themselves", async () => {
  realClock();
  const email = "self@staff-qa.test";
  const mac = await approvedCoAdmin(email);
  const phone = (await signIn(email, { ua: UA.phone })).call;
  const mine = (await mac("staffSessions")).body.sessions;
  assert.equal(mine.length, 2);
  assert.equal(mine.filter(d => d.current).length, 1, "this device is marked");
  assert.equal((await mac("staffSessions", { email: ADMIN })).status, 403, "not other people's devices");
  assert.equal((await mac("staffSessionRevokeAll", { email: ADMIN })).status, 403);
  const r = await phone("staffSessionRevokeAll");
  assert.equal(r.body.count, 2);
  assert.equal(r.body.signedOutSelf, true);
  assert.ok(r.cookies.some(c => /^aym_staff=;/.test(c)), "own cookie cleared");
  assert.equal((await mac("whoami")).body.staff, false);
});

test("Sign out ends this device for good: a copied cookie stops working too", async () => {
  realClock();
  const email = "logout@staff-qa.test";
  const call = await approvedCoAdmin(email);
  const copy = withCookie(call.jar.get("aym_staff"));
  assert.equal((await copy("whoami")).body.staff, true);
  await call("logout");
  assert.equal((await call("whoami")).body.staff, false);
  assert.equal((await copy("whoami")).body.staff, false, "the device record is revoked, not just the cookie");
  assert.ok((await auditOf("session.signout")).some(e => e.target === email));
});

/* ------------------------------------------------------------------ live role */

test("role changes made elsewhere reach every device within 30 s; the admin stays admin", async () => {
  realClock();
  const email = "role-live@staff-qa.test";
  const call = await approvedCoAdmin(email);
  const admin = (await signIn(ADMIN, { ua: UA.win })).call;
  assert.equal((await call("whoami")).body.staff, true);
  assert.equal((await admin("whoami")).body.staff, true);
  const db = readDb();
  const key = `aym:staff:member:${email}`;
  db[key] = { ...db[key], status: "revoked", epoch: (db[key].epoch || 0) + 1 };
  db[`aym:staff:member:${ADMIN}`] = { ...db[`aym:staff:member:${ADMIN}`], status: "revoked" };
  writeDb(db);
  clock += 31 * 1000;
  const me = (await call("whoami")).body;
  assert.equal(me.staff, false, "revoked by another server instance");
  assert.equal(me.status, "revoked");
  const am = (await admin("whoami")).body;
  assert.equal(am.staff, true, "the admin role comes from STAFF_ADMIN_EMAILS only");
  assert.equal(am.role, "admin");
});

/* ------------------------------------------------------------------ cleanup */

test("retention cleanup deletes expired device records and keeps live ones", async () => {
  realClock();
  const db = readDb();
  db["aym:staff:sess:old-device"] = { id: "old-device", email: "gone@staff-qa.test", lastSeenAt: 1, expireAtMs: 2 };
  writeDb(db);
  const live = Object.keys(db).filter(k => k.startsWith("aym:staff:sess:") && db[k].expireAtMs > Date.now() + 30 * DAY);
  const r = (await service("staffCleanup", { dryRun: false })).body;
  assert.ok(r.staffSessions >= 1);
  const after = readDb();
  assert.ok(!after["aym:staff:sess:old-device"]);
  assert.ok(live.every(k => after[k]), "live devices kept");
});
