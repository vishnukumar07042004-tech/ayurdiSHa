/**
 * Staff access with admin approval (docs/security/STAFF-ACCESS-SPEC.md): passcode lockout, passcode +
 * email code → pending / approved, approve / deny / revoke, co-admin vs admin-only ops, service
 * token, audit log, session expiry, KV guard, retention cleanup, production-smoke probes.
 * Real HTTP handler, isolated file store, console mail, a random test passcode (never the real one).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { TEST_SERVICE_TOKEN, serviceHeaders } from "./helpers/staffAuth.mjs";

const storeFile = path.join(os.tmpdir(), `aym-staff-access-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
const PASSCODE = `test-passphrase-${crypto.randomBytes(6).toString("hex")}`;
const ADMIN = "owner@staff-qa.test";
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock",
  ADMIN_PIN: PASSCODE, OTP_COOKIE_SECRET: `test-cookie-secret-${crypto.randomBytes(8).toString("hex")}`, STAFF_ADMIN_EMAILS: ADMIN, AYM_STAFF_DELAY_MS: "0", CRON_SECRET: "staff-test-cron-secret",
});
delete process.env.VERCEL;

const otpLog = new Map();
const logged = [];
const realLog = console.log;
const realErr = console.error;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); }
  logged.push(line);
};
console.error = (...args) => { logged.push(args.join(" ")); };

const { aymStoreHandler, aiWorkerHandler } = await import("../server/storePlugin.js");
const staffAuth = await import("../server/staffAuth.js");
const { encodeSigned } = await import("../server/otpTicket.js");

let server;
let base;
let ipSeq = 0;
before(async () => {
  server = http.createServer((req, res) => (req.url.startsWith("/api/ai-worker") ? aiWorkerHandler(req, res) : aymStoreHandler(req, res)));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  console.log = realLog;
  console.error = realErr;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

function client({ ip = `203.0.113.${(ipSeq += 1) % 250}`, headers = {} } = {}) {
  const jar = new Map();
  const call = async (op, payload = {}, url = "/api/aym-store") => {
    const r = await fetch(`${base}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...headers },
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

/** Full sign-in: passcode + email → code → session. Returns { call, verify }. */
async function signIn(email, { call = client() } = {}) {
  const start = await call("staffStart", { passcode: PASSCODE, email });
  assert.equal(start.status, 200, `staffStart ${JSON.stringify(start.body)}`);
  assert.ok(!JSON.stringify(start.body).match(/\b\d{6}\b/), "code never returned to the browser");
  const otp = otpLog.get(email.toLowerCase());
  assert.match(otp || "", /^\d{6}$/, "code mailed");
  otpLog.delete(email.toLowerCase());
  const verify = await call("staffVerify", { email, otp });
  assert.equal(verify.status, 200, `staffVerify ${JSON.stringify(verify.body)}`);
  return { call, verify };
}

let adminCall;
async function admin() {
  if (!adminCall) adminCall = (await signIn(ADMIN)).call;
  return adminCall;
}

const auditOf = async (action) => (await (await admin())("staffAudit", { action, limit: 500 })).body.entries || [];

/* ------------------------------------------------------------------ passcode alone */

test("the legacy PIN login never grants access, even with the right passcode", async () => {
  const c = client();
  const r = await c("login", { pin: PASSCODE });
  assert.equal(r.status, 410);
  assert.equal(r.body.code, "use_staff_access");
  assert.equal((await c("whoami")).body.staff, false);
  assert.equal((await c("staffSnapshot")).status, 403);
});

test("passcode right but no email code yet: still not staff", async () => {
  const c = client();
  assert.equal((await c("staffStart", { passcode: PASSCODE, email: "half-way@staff-qa.test" })).status, 200);
  assert.equal((await c("whoami")).body.staff, false);
  assert.equal((await c("staffSnapshot")).status, 403);
});

/* ------------------------------------------------------------------ lockout */

test("5 wrong passcodes lock the IP for 15 min (even the right passcode is refused), with a clear message", async () => {
  const ip = "198.18.0.10";
  const c = client({ ip });
  for (let i = 1; i <= 4; i++) {
    const r = await c("staffStart", { passcode: "wrong-passcode", email: `lock-ip-${i}@staff-qa.test` });
    assert.equal(r.status, 403, `attempt ${i}`);
    assert.equal(r.body.code, "bad_passcode");
    assert.equal(r.body.attemptsLeft, 5 - i);
  }
  const fifth = await c("staffStart", { passcode: "wrong-passcode", email: "lock-ip-5@staff-qa.test" });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.body.code, "locked");
  assert.match(fifth.body.error, /Too many attempts — try again in 15 minutes/);
  const right = await c("staffStart", { passcode: PASSCODE, email: "lock-ip-ok@staff-qa.test" });
  assert.equal(right.status, 429, "locked before the passcode is compared");
  assert.ok(right.body.retryIn > 0 && right.body.retryIn <= 900);
  assert.ok(!otpLog.has("lock-ip-ok@staff-qa.test"), "no code sent while locked");
});

test("5 wrong passcodes for one email lock that email from any network", async () => {
  const email = "lock-email@staff-qa.test";
  for (let i = 1; i <= 5; i++) {
    const r = await client()("staffStart", { passcode: `nope-${i}`, email });
    assert.equal(r.status, i < 5 ? 403 : 429, `attempt ${i}`);
  }
  const fromElsewhere = await client()("staffStart", { passcode: PASSCODE, email });
  assert.equal(fromElsewhere.status, 429);
  assert.equal(fromElsewhere.body.code, "locked");
  const otherEmail = await client()("staffStart", { passcode: PASSCODE, email: "not-locked@staff-qa.test" });
  assert.equal(otherEmail.status, 200, "other emails / networks unaffected");
});

test("every passcode attempt is audited without the passcode", async () => {
  const fails = await auditOf("passcode.fail");
  assert.ok(fails.length >= 9);
  assert.ok((await auditOf("passcode.locked")).length >= 1);
  assert.ok((await auditOf("passcode.ok")).length >= 1);
  const raw = fs.readFileSync(storeFile, "utf8");
  assert.ok(!raw.includes(PASSCODE), "passcode never stored");
  assert.ok(!raw.includes("wrong-passcode"), "wrong guesses never stored");
  assert.ok(!raw.includes("198.18.0.10"), "IP stored only as a hash");
  assert.ok(!logged.some(l => l.includes(PASSCODE)), "passcode never logged");
  assert.ok(fails.every(e => e.ipHash && e.ipHash.length === 16));
});

test("progressive delay grows with failures and is capped at 2 s", () => {
  delete process.env.AYM_STAFF_DELAY_MS;
  try {
    assert.equal(staffAuth.failureDelayMs(1), 400);
    assert.equal(staffAuth.failureDelayMs(3), 1200);
    assert.equal(staffAuth.failureDelayMs(9), 2000);
  } finally {
    process.env.AYM_STAFF_DELAY_MS = "0";
  }
});

test("wrong email codes: 5 tries per code, then start again", async () => {
  const c = client();
  const email = "code-guess@staff-qa.test";
  assert.equal((await c("staffStart", { passcode: PASSCODE, email })).status, 200);
  const real = otpLog.get(email);
  const wrong = real === "000000" ? "111111" : "000000";
  for (let i = 1; i <= 4; i++) assert.equal((await c("staffVerify", { email, otp: wrong })).status, 400);
  assert.equal((await c("staffVerify", { email, otp: wrong })).status, 429);
  assert.equal((await c("staffVerify", { email, otp: real })).status, 400, "the code is gone");
});

/* ------------------------------------------------------------------ roles */

test("admin: passcode + email code → approved admin; badge count + passphrase check", async () => {
  const { verify, call } = await signIn(ADMIN);
  adminCall = call;
  assert.equal(verify.body.status, "approved");
  assert.equal(verify.body.role, "admin");
  const me = (await call("whoami")).body;
  assert.equal(me.staff, true);
  assert.equal(me.role, "admin");
  assert.equal(me.email, ADMIN);
  assert.equal(me.displayName, "owner", "staff identity uses the email local-part when no ADMIN_DISPLAY map entry");
  assert.equal(me.weakPasscode, false, "a long passphrase is not flagged");
  assert.ok(me.expiresAt > Date.now());
  const cookie = verify.cookies.find(c => c.startsWith("aym_staff="));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=15552000/, "trusted device: 180-day rolling cookie");
  assert.equal((await call("staffSnapshot")).status, 200);
});

test("short ADMIN_PIN (< 12 chars) fail-closes staff access", async () => {
  process.env.ADMIN_PIN = "short-pin";
  try {
    const start = await client()("staffStart", { passcode: "short-pin", email: ADMIN });
    assert.equal(start.status, 503);
    assert.match(String(start.body.error || ""), /not configured|Staff access/i);
  } finally {
    process.env.ADMIN_PIN = PASSCODE;
  }
});

test("co-admin: request → pending (no staff data) → admin badge → approve → staff ops; admin-only ops refused", async () => {
  const email = "co-admin@staff-qa.test";
  const { call: co, verify } = await signIn(email);
  assert.equal(verify.body.status, "pending");
  assert.equal(verify.body.staff, false);
  const me = (await co("whoami")).body;
  assert.equal(me.staff, false);
  assert.equal(me.status, "pending");
  const snap = await co("staffSnapshot");
  assert.equal(snap.status, 403);
  assert.equal(snap.body.code, "pending");
  assert.ok(!snap.body.questions);
  assert.ok((await auditOf("access.request")).some(e => e.target === email));
  assert.ok(logged.some(l => l.includes(`Staff access request ${email} → ${ADMIN}`)), "admin emailed");

  const a = await admin();
  const reqs = (await a("staffRequests")).body;
  assert.ok(reqs.pending.some(m => m.email === email));
  assert.ok((await a("whoami")).body.pendingCount >= 1);

  assert.equal((await a("staffDecide", { email, decision: "approve" })).status, 200);
  assert.equal((await co("whoami")).body.staff, true, "takes effect on the next request");
  assert.equal((await co("whoami")).body.role, "co-admin");
  for (const op of ["staffSnapshot", "aiQueue", "aiStats", "regUsers", "visitSourcesGet", "wacDelegatesStats", "facultyStreams"]) {
    assert.equal((await co(op, {})).status, 200, `co-admin may ${op}`);
  }
  for (const op of ["aiConfigSet", "aiBackfill", "wacDelegatesImport", "wacDelegatesClear", "wacAutoLinkAll", "facultyImport", "testProbePurge", "del", "staffRequests", "staffDecide", "staffAudit", "staffRetentionSet", "staffCleanup"]) {
    const r = await co(op, { key: "aym:clusters", rows: [{ wacId: "X" }] });
    assert.equal(r.status, 403, `co-admin may not ${op}`);
    assert.equal(r.body.code, "admin_only", op);
  }
});

test("revoke takes effect immediately; re-approval needs a fresh sign-in", async () => {
  const email = "revoke-me@staff-qa.test";
  const { call: co } = await signIn(email);
  const a = await admin();
  await a("staffDecide", { email, decision: "approve" });
  assert.equal((await co("staffSnapshot")).status, 200);
  const r = await a("staffDecide", { email, decision: "revoke" });
  assert.equal(r.status, 200);
  assert.equal(r.body.member.status, "revoked");
  assert.equal((await co("staffSnapshot")).status, 403, "revoked at once");
  assert.equal((await co("whoami")).body.status, "revoked");
  await a("staffDecide", { email, decision: "approve" });
  assert.equal((await co("staffSnapshot")).status, 403, "the revoked session stays dead");
  assert.equal((await co("whoami")).body.status, "signed-out");
  const fresh = await signIn(email);
  assert.equal(fresh.verify.body.status, "approved");
  assert.equal((await fresh.call("staffSnapshot")).status, 200);
});

test("deny: the requester sees denied and gets no staff data; state rules enforced", async () => {
  const email = "deny-me@staff-qa.test";
  const { call: co } = await signIn(email);
  const a = await admin();
  assert.equal((await a("staffDecide", { email, decision: "revoke" })).status, 409, "cannot revoke a pending request");
  assert.equal((await a("staffDecide", { email, decision: "deny" })).status, 200);
  assert.equal((await co("whoami")).body.status, "denied");
  assert.equal((await co("staffSnapshot")).status, 403);
  const again = await signIn(email);
  assert.equal(again.verify.body.status, "denied", "no self re-request");
  assert.equal((await a("staffDecide", { email: ADMIN, decision: "revoke" })).status, 400, "the admin is fixed by env");
  assert.equal((await a("staffDecide", { email: "nobody@staff-qa.test", decision: "approve" })).status, 404);
});

/* ------------------------------------------------------------------ service token */

test("service token: scoped script ops only; wrong / short tokens never bypass", async () => {
  const me = (await service("whoami")).body;
  assert.equal(me.staff, true);
  assert.equal(me.role, "admin");
  assert.equal(me.service, true);
  assert.equal((await service("aiConfigGet")).status, 200, "scripts may read AI config");
  assert.equal((await service("staffCounts")).status, 200, "scripts may read counts");
  assert.equal((await service("staffSnapshot")).status, 403, "desk dump is out of service scope");
  assert.equal((await service("staffRequests")).status, 403, "access admin is out of service scope");
  assert.equal((await service("staffSnapshot")).body.code, "service_scope");
  for (const auth of [`Bearer ${TEST_SERVICE_TOKEN}x`, "Bearer staff-test-cron-secret", `Bearer ${PASSCODE}`, TEST_SERVICE_TOKEN]) {
    const c = client({ headers: { authorization: auth } });
    assert.equal((await c("aiConfigGet")).status, 403, `refused: ${auth.slice(0, 12)}…`);
    assert.equal((await c("whoami")).body.staff, false);
  }
  process.env.STAFF_SERVICE_TOKEN = "too-short-token";
  try {
    const c = client({ headers: { authorization: "Bearer too-short-token" } });
    assert.equal((await c("aiConfigGet")).status, 403, "tokens under 32 chars are ignored");
  } finally {
    process.env.STAFF_SERVICE_TOKEN = TEST_SERVICE_TOKEN;
  }
  const worker = await service("", { dryRun: false }, "/api/ai-worker");
  assert.equal(worker.status, 200, "service token may run the worker");
  const anonWorker = await client()("", {}, "/api/ai-worker");
  assert.equal(anonWorker.status, 401);
});

test("service-token uses are audited; interactive admin actions stay on the admin email", async () => {
  await service("aiConfigGet", {});
  const uses = await auditOf("service");
  assert.ok(uses.some(e => e.action === "service.use" && e.who === "service" && e.target === "aiConfigGet"));
  const denied = await service("staffSnapshot", {});
  assert.equal(denied.status, 403);
  assert.ok((await auditOf("service")).some(e => e.action === "service.denied" && e.target === "staffSnapshot"));
  const decisions = await auditOf("access");
  assert.ok(decisions.some(e => e.action === "access.approve" && e.who === ADMIN));
  assert.ok(decisions.some(e => e.action === "access.revoke"));
  assert.ok(decisions.some(e => e.action === "access.deny"));
  const byActor = (await (await admin())("staffAudit", { actor: ADMIN })).body.entries;
  assert.ok(byActor.length && byActor.every(e => e.who === ADMIN));
});

test("staff actions (curation save) land in the audit log", async () => {
  const a = await admin();
  const r = await a("clustersSave", { clusters: [] });
  assert.equal(r.status, 200);
  assert.ok((await auditOf("clusters.save")).some(e => e.who === ADMIN && e.ok));
  assert.equal((await a("aiConfigSet", { config: { enabled: false } })).status, 200);
  assert.ok((await auditOf("settings.ai")).length >= 1);
});

/* ------------------------------------------------------------------ sessions */

function forged(t) {
  return client({ headers: { cookie: `aym_staff=${encodeSigned({ v: 2, kind: "staff", sid: "x", epoch: 0, ...t })}` } });
}

test("legacy (pre-trusted-device) tickets: 12 h idle / 7 days absolute, tampered rejected, valid ones upgraded", async () => {
  const now = Date.now();
  const ok = await forged({ email: ADMIN, iat: now - 1000, seen: now - 1000 })("whoami");
  assert.equal(ok.body.staff, true, "a fresh signed ticket works");
  const idle = await forged({ email: ADMIN, iat: now - 13 * 3600e3, seen: now - 12 * 3600e3 - 5000 })("whoami");
  assert.equal(idle.body.staff, false);
  assert.equal(idle.body.status, "expired");
  assert.ok(idle.cookies.some(c => /^aym_staff=;/.test(c)), "expired cookie cleared");
  const old = await forged({ email: ADMIN, iat: now - 7 * 86400e3 - 5000, seen: now - 1000 })("whoami");
  assert.equal(old.body.staff, false);
  const tampered = client({ headers: { cookie: `aym_staff=${Buffer.from(JSON.stringify({ v: 2, kind: "staff", email: ADMIN, iat: now, seen: now, sig: "0".repeat(64) })).toString("base64url")}` } });
  assert.equal((await tampered("whoami")).body.staff, false);
  const rolled = await forged({ email: ADMIN, iat: now - 3600e3, seen: now - 10 * 60e3 })("whoami");
  assert.ok(rolled.cookies.some(c => c.startsWith("aym_staff=") && /HttpOnly/.test(c) && /Max-Age=15552000/.test(c)), "upgraded to a device session");
  assert.ok(staffAuth.ROLE_CACHE_MS <= 30000, "role cache ≤ 30 s");
});

test("sign out clears the session and is audited", async () => {
  const email = "sign-out@staff-qa.test";
  const { call } = await signIn(email);
  await (await admin())("staffDecide", { email, decision: "approve" });
  assert.equal((await call("whoami")).body.staff, true);
  await call("logout");
  assert.equal((await call("whoami")).body.staff, false);
  assert.ok((await auditOf("session.signout")).some(e => e.target === email));
});

/* ------------------------------------------------------------------ KV guard */

test("generic KV ops can neither read nor write staff records", async () => {
  const a = await admin();
  assert.equal((await a("get", { key: `aym:staff:member:${ADMIN}` })).status, 403);
  assert.equal((await a("set", { key: "aym:staff:member:evil@staff-qa.test", val: { email: "evil@staff-qa.test", status: "approved" } })).status, 403);
  assert.equal((await a("del", { key: `aym:staff:member:${ADMIN}` })).status, 403);
  const keys = (await a("list", { prefix: "aym:" })).body.keys;
  assert.ok(keys.length && !keys.some(k => k.startsWith("aym:staff:")));
  const anon = client();
  assert.equal((await anon("set", { key: "aym:staff:settings", val: { auditDays: 1 } })).status, 403);
});

/* ------------------------------------------------------------------ retention */

test("retention: admin setting + cleanup (dry run counts, apply deletes, fresh records kept)", async () => {
  const a = await admin();
  const set = await a("staffRetentionSet", { retention: { auditDays: 5, sessionDays: 2, probeDays: 0 } });
  assert.equal(set.status, 200);
  assert.equal(set.body.retention.auditDays, 30, "clamped to the minimum");
  assert.equal(set.body.retention.sessionDays, 31);
  assert.equal((await a("staffRetentionGet")).body.retention.auditDays, 30);

  const day = 86400e3;
  const db = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  db["aym:otp:oldoldold"] = { sends: [Date.now() - 5 * day], updatedAt: Date.now() - 5 * day };
  db["aym:otp:freshfresh"] = { sends: [Date.now()], updatedAt: Date.now() };
  db["aym:sess:" + "a".repeat(48)] = { userId: "u1", createdAt: Date.now() - 60 * day };
  db["aym:sess:" + "b".repeat(48)] = { userId: "u2", createdAt: Date.now() - day };
  db["aym:staff:audit:00000000000001-old"] = { id: "00000000000001-old", at: 1, action: "test.old", who: "x" };
  db["aym:staff:att:ip-stale"] = { fails: [1], lockedUntil: 0, expireAtMs: 2 };
  db["aym:wacalert:old-alert"] = { at: Date.now() - 40 * day, kind: "linked-elsewhere", maskedEmail: "a***@x.test" };
  db["aym:wacalert:new-alert"] = { at: Date.now() - day, kind: "linked-elsewhere", maskedEmail: "b***@x.test" };
  fs.writeFileSync(storeFile, JSON.stringify(db));

  const dry = (await a("staffCleanup", { dryRun: true })).body;
  assert.equal(dry.dryRun, true);
  assert.ok(dry.otpRate >= 1 && dry.sessions >= 1 && dry.staffAudit >= 1 && dry.staffAttempts >= 1);
  assert.ok(JSON.parse(fs.readFileSync(storeFile, "utf8"))["aym:otp:oldoldold"], "dry run deletes nothing");

  const done = (await a("staffCleanup", { dryRun: false })).body;
  assert.equal(done.dryRun, false);
  const after = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  assert.ok(!after["aym:otp:oldoldold"]);
  assert.ok(after["aym:otp:freshfresh"]);
  assert.ok(!after["aym:sess:" + "a".repeat(48)]);
  assert.ok(after["aym:sess:" + "b".repeat(48)]);
  assert.ok(!after["aym:staff:audit:00000000000001-old"]);
  assert.ok(!after["aym:staff:att:ip-stale"]);
  assert.ok(!after["aym:wacalert:old-alert"], "staff alerts older than the audit window are purged");
  assert.ok(after["aym:wacalert:new-alert"]);
  assert.ok(Object.keys(after).some(k => k.startsWith(`aym:staff:member:${ADMIN}`)), "members are never purged");
  assert.ok((await auditOf("retention.cleanup")).length >= 1);
});

test("daily cron runs the retention cleanup before the worker", async () => {
  const r = await fetch(`${base}/api/ai-worker`, { headers: { authorization: "Bearer staff-test-cron-secret" } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.retention && typeof body.retention.otpRate === "number", JSON.stringify(body).slice(0, 200));
});

/* ------------------------------------------------------------------ production-smoke probes */

test("probe staff request (admin session): pending → approved → revoked from the requester's side", async () => {
  const email = "aym-probe+staff-smoke@ayurdisha-qa.test";
  const a = await admin();
  assert.equal((await a("testProbeStaffRequest", { email: "real-person@staff-qa.test" })).status, 400, "probe emails only");
  const co = client();
  assert.equal((await co("testProbeStaffRequest", { email })).status, 403, "not without admin");
  assert.equal((await service("testProbeStaffRequest", { email })).status, 403, "service token cannot run probes");
  const made = await a("testProbeStaffRequest", { email, session: true });
  assert.equal(made.status, 200);
  assert.equal(made.body.status, "pending");
  const probe = client({ headers: { cookie: made.body.cookie } });
  assert.equal((await probe("visitSourcesGet")).status, 403);
  assert.ok((await a("staffRequests")).body.pending.some(m => m.email === email));
  await a("staffDecide", { email, decision: "approve" });
  assert.equal((await probe("visitSourcesGet")).status, 200);
  assert.equal((await probe("staffAudit")).status, 403, "co-admin, not admin");
  await a("staffDecide", { email, decision: "revoke" });
  assert.equal((await probe("visitSourcesGet")).status, 403);
  const purge = await a("testProbeStaffPurge", {});
  assert.ok(purge.body.removed.includes(email));
  assert.ok(!(await a("staffRequests")).body.revoked.some(m => m.email === email));
});
