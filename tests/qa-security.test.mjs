/**
 * QA audit 2026-11-09 — generic KV ops: an approved co-admin cannot use `set` to change config,
 * identities, links or sessions (each has its own admin op), and nobody — not even the admin /
 * service token — can read, list or write delegate sessions, OTP records or limiter state.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-qa-sec-${process.pid}.json`);
fs.writeFileSync(storeFile, JSON.stringify({
  "aym:sess:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef": { userId: "U1", createdAt: 1 },
  "aym:otp:abc": { n: 1 },
  "aym:user:U1": { id: "U1", name: "Real Delegate", email: "real@delegates-qa.org", regNo: "11WAC/2026/1001" },
}));
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", OTP_COOKIE_SECRET: "qa-sec-test-secret-0123456789abcdef" });
const quiet = fn => (...a) => { if (!/\[aym-|OTP for|staff code/i.test(a.join(" "))) fn(...a); };
const realLog = console.log;
const realErr = console.error;
console.log = quiet(realLog);
console.error = quiet(realErr);

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

let server;
let base;
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

const call = headers => async (op, payload = {}) => {
  const r = await fetch(`${base}/api/aym-store`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ op, ...payload }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const admin = call(serviceHeaders());
const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));

async function coAdmin() {
  const email = "aym-probe+qa-sec@ayurdisha-qa.test";
  const made = await admin("testProbeStaffRequest", { email, session: true });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await admin("staffDecide", { email, decision: "approve" })).status, 200);
  const co = call({ cookie: made.body.cookie });
  const me = await co("whoami");
  assert.equal(me.body.role, "co-admin");
  return co;
}

test("co-admin: generic set limited to questions + groups; config / identity / session writes refused", async () => {
  const co = await coAdmin();
  for (const key of ["aym:ai:config", "aym:user:U1", "aym:regno:111WAC20261001", "aym:waclink:BHA12345", "aym:wac-results", "aym:faculty:doc:x"]) {
    const r = await co("set", { key, val: { dailySpendCapUSD: 999, enabled: true } });
    assert.equal(r.status, 403, key);
    assert.equal(r.body.code, "admin_only", key);
  }
  assert.equal(db()["aym:ai:config"], undefined, "AI config untouched");
  assert.equal(db()["aym:user:U1"].name, "Real Delegate", "delegate untouched");
  const q = { id: "QSEC1", ticket: "AYM-Q-QSEC1", question: "Staff-entered question on research careers?", name: "Walk-in", email: "walkin@delegates-qa.org", regNo: "11WAC/2026/1002", createdAt: Date.now() };
  assert.equal((await co("set", { key: "aym:q:QSEC1", val: q })).status, 200, "co-admin may still enter a question");
});

test("sessions, OTP and limiter records: never readable, listable or writable — even for the admin", async () => {
  const keys = (await admin("list", { prefix: "" })).body.keys || [];
  assert.ok(keys.includes("aym:user:U1"), "ordinary keys listed");
  assert.ok(!keys.some(k => k.startsWith("aym:sess:") || k.startsWith("aym:otp:") || k.startsWith("aym:staff:")), "no session / OTP / staff keys listed");
  assert.equal((await admin("list", { prefix: "aym:sess:" })).body.keys.length, 0);
  assert.equal((await admin("get", { key: "aym:sess:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" })).status, 403);
  assert.equal((await admin("get", { key: "aym:otp:abc" })).status, 403);
  assert.equal((await admin("set", { key: "aym:sess:forged", val: { userId: "U1" } })).status, 403, "no forged delegate session");
  assert.equal(db()["aym:sess:forged"], undefined);
  assert.equal((await admin("set", { key: "aym:wacrate:x", val: { n: 0 } })).status, 403, "limiter state not resettable");
});
