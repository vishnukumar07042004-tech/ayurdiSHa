/**
 * One-time staff review invites: create → redeem once → second redeem fails; expired fails;
 * reviewOnly cannot approve / publish / write.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { TEST_SERVICE_TOKEN, serviceHeaders } from "./helpers/staffAuth.mjs";

const storeFile = path.join(os.tmpdir(), `aym-staff-review-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
const PASSCODE = `test-passphrase-${crypto.randomBytes(6).toString("hex")}`;
const ADMIN = "owner@staff-qa.test";
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock",
  ADMIN_PIN: PASSCODE, OTP_COOKIE_SECRET: `test-cookie-secret-${crypto.randomBytes(8).toString("hex")}`,
  STAFF_ADMIN_EMAILS: ADMIN, AYM_STAFF_DELAY_MS: "0", CRON_SECRET: "staff-review-test-cron",
  STAFF_SERVICE_TOKEN: TEST_SERVICE_TOKEN, AYM_SERVICE_TOKEN: TEST_SERVICE_TOKEN,
  PUBLIC_SITE_URL: "https://ayushmarg.vercel.app",
});
delete process.env.VERCEL;

const otpLog = new Map();
const logged = [];
const realLog = console.log;
const realErr = console.error;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) otpLog.set(m[1].toLowerCase(), m[2]);
  logged.push(line);
};
console.error = (...args) => { logged.push(args.join(" ")); };

const { aymStoreHandler } = await import("../server/storePlugin.js");
const staffAuth = await import("../server/staffAuth.js");

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
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

function client({ ip = `198.51.100.${(ipSeq += 1) % 250}`, headers = {} } = {}) {
  const jar = new Map();
  const call = async (op, payload = {}) => {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
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

async function signIn(email, { call = client() } = {}) {
  const start = await call("staffStart", { passcode: PASSCODE, email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const otp = otpLog.get(email.toLowerCase());
  assert.match(otp || "", /^\d{6}$/);
  otpLog.delete(email.toLowerCase());
  const verify = await call("staffVerify", { email, otp });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  return call;
}

function tokenFromUrl(url) {
  const u = new URL(url);
  const hash = u.hash.replace(/^#/, "");
  const q = hash.indexOf("?");
  assert.ok(q >= 0, "hash must include ?review=");
  return new URLSearchParams(hash.slice(q + 1)).get("review");
}

test("admin creates one-time review link; raw token never stored in audit or KV values", async () => {
  const admin = await signIn(ADMIN);
  const created = await admin("staffReviewInviteCreate", { ttlMinutes: 30 });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.ok, true);
  assert.match(created.body.url, /^https:\/\/ayushmarg\.vercel\.app\/#staff\?review=/);
  const token = tokenFromUrl(created.body.url);
  assert.ok(token && token.length >= 20);
  assert.ok(!JSON.stringify(created.body).includes(PASSCODE), "passcode never in create response");
  assert.ok(created.body.prefix && created.body.prefix.length === 8);

  const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  const reviewKeys = Object.keys(store).filter(k => k.startsWith("aym:staff:review:"));
  assert.equal(reviewKeys.length, 1);
  const rec = store[reviewKeys[0]];
  assert.ok(!JSON.stringify(rec).includes(token), "raw token never stored");
  assert.equal(rec.redeemedAt, 0);

  const audit = await service("staffAudit", { action: "review.invite", limit: 20 });
  assert.equal(audit.status, 200);
  const entry = (audit.body.entries || []).find(e => e.action === "review.invite");
  assert.ok(entry);
  assert.ok(!JSON.stringify(entry).includes(token), "raw token never in audit");
  assert.equal(entry.detail.prefix, created.body.prefix);
});

test("create → redeem once → second redeem fails; logout kills session", async () => {
  const admin = await signIn(ADMIN);
  const created = await admin("staffReviewInviteCreate", { ttlMinutes: 45 });
  assert.equal(created.status, 200);
  const token = tokenFromUrl(created.body.url);

  const reviewer = client();
  const first = await reviewer("staffReviewRedeem", { token });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.reviewOnly, true);
  assert.equal(first.body.role, "review");
  assert.ok(reviewer.jar.get(staffAuth.STAFF_COOKIE));

  const me = await reviewer("whoami");
  assert.equal(me.status, 200);
  assert.equal(me.body.staff, true);
  assert.equal(me.body.reviewOnly, true);
  assert.equal(me.body.role, "review");

  const desk = await reviewer("staffCounts");
  assert.equal(desk.status, 200, "review may read desk counts");

  const second = await client()("staffReviewRedeem", { token });
  assert.equal(second.status, 410);
  assert.equal(second.body.code, "review_gone");
  assert.match(second.body.error, /already used or expired/i);

  await reviewer("staffLogout");
  const after = await reviewer("whoami");
  assert.equal(after.body.staff, false);
  const again = await client()("staffReviewRedeem", { token });
  assert.equal(again.status, 410);
});

test("expired invite cannot be redeemed", async () => {
  const t0 = Date.now();
  const prevNow = staffAuth.staffClock.now;
  staffAuth.staffClock.now = () => t0;
  try {
    const admin = await signIn(ADMIN);
    const created = await admin("staffReviewInviteCreate", { ttlMinutes: 30 });
    const token = tokenFromUrl(created.body.url);
    staffAuth.staffClock.now = () => t0 + staffAuth.REVIEW_MAX_TTL_MS + 60_000;
    const redeem = await client()("staffReviewRedeem", { token });
    assert.equal(redeem.status, 410);
    assert.equal(redeem.body.code, "review_gone");
  } finally {
    staffAuth.staffClock.now = prevNow;
  }
});

test("reviewOnly cannot approve, publish, or write questions", async () => {
  const admin = await signIn(ADMIN);
  const created = await admin("staffReviewInviteCreate", { ttlMinutes: 45 });
  const token = tokenFromUrl(created.body.url);
  const reviewer = client();
  assert.equal((await reviewer("staffReviewRedeem", { token })).status, 200);

  const approve = await reviewer("aiApprove", { id: "q:does-not-matter" });
  assert.equal(approve.status, 403);
  assert.equal(approve.body.code, "review_only");

  const publish = await reviewer("wacResultsPublish", { published: true });
  assert.equal(publish.status, 403);
  assert.equal(publish.body.code, "review_only");

  const write = await reviewer("set", { key: "aym:q:review-block", val: { id: "review-block", question: "nope" } });
  assert.equal(write.status, 403);
  assert.equal(write.body.code, "review_only");

  const importDelegates = await reviewer("wacDelegatesImport", { rows: [] });
  assert.equal(importDelegates.status, 403);
  assert.ok(importDelegates.body.code === "review_only" || importDelegates.body.code === "admin_only");
});

test("anonymous cannot create review invites; co-admin cannot either", async () => {
  const anon = await client()("staffReviewInviteCreate", { ttlMinutes: 30 });
  assert.equal(anon.status, 403);

  const co = client();
  const start = await co("staffStart", { passcode: PASSCODE, email: "co@staff-qa.test" });
  assert.equal(start.status, 200);
  const otp = otpLog.get("co@staff-qa.test");
  await co("staffVerify", { email: "co@staff-qa.test", otp });
  // pending co-admin is not staff; approve then try
  await service("staffDecide", { email: "co@staff-qa.test", decision: "approve" });
  const me = await co("whoami");
  assert.equal(me.body.staff, true);
  assert.equal(me.body.role, "co-admin");
  const denied = await co("staffReviewInviteCreate", { ttlMinutes: 30 });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "admin_only");
});
