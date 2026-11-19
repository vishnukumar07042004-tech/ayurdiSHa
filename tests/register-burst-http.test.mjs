/**
 * Burst registration through the real HTTP handler on an isolated file store (never Firestore):
 * 150 delegates behind ONE venue address register at once (OTP start + verify), double-verify
 * gives one number, the staff load-test helpers are service-token- and probe-email-gated, load-test
 * questions never queue DISHA jobs, the purge leaves nothing behind, and public stats are GET-able
 * with CDN cache headers.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-burst-http-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock" });

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
console.log = (...args) => {
  const m = args.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-/.test(args.join(" "))) return;
  realLog(...args);
};
console.error = (...args) => { if (!/\[aym-/.test(args.join(" "))) realErr(...args); };

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { LOAD_MARK } = await import("../shared/probe.js");
const { otpRateKey } = await import("../server/otpLimits.js");
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

const VENUE_IP = "203.0.113.50";
function client(ip = VENUE_IP, extraHeaders = {}) {
  const jar = new Map();
  const call = async (op, payload = {}) => {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extraHeaders },
      body: JSON.stringify({ op, ...payload }),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
  };
  call.jar = jar;
  return call;
}
const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
const profile = email => ({ name: "Venue Delegate", age: 23, sex: "Male", institute: "Hall College", email });

test("150 delegates on one venue Wi-Fi address register at once: all succeed, unique sequential numbers", async () => {
  const emails = Array.from({ length: 150 }, (_, i) => `venue${i}@delegates-qa.org`);
  const t0 = Date.now();
  const out = await Promise.all(emails.map(async email => {
    const call = client();
    const start = await call("regStart", profile(email));
    if (start.status !== 200) return { email, step: "start", ...start };
    const ok = await call("regVerify", { email, otp: otpLog.get(email) });
    return { email, step: "verify", ...ok, otpCookieKept: call.jar.has("aym_otp") };
  }));
  const ms = Date.now() - t0;
  const bad = out.filter(r => r.status !== 200);
  assert.deepEqual(bad.map(r => `${r.email} ${r.step} ${r.status} ${JSON.stringify(r.body)}`), [], "no failures behind one NAT");
  const nums = out.map(r => r.body.profile.regNo);
  assert.equal(new Set(nums).size, 150, "no duplicate pass numbers");
  assert.deepEqual(nums.map(n => Number(n.split("/").pop())).sort((a, b) => a - b), Array.from({ length: 150 }, (_, i) => i + 1));
  assert.ok(out.every(r => !r.otpCookieKept), "the code cookie is cleared once the registration is saved");
  const d = db();
  assert.equal(Object.keys(d).filter(k => k.startsWith("aym:user:")).length, 150);
  assert.equal(Object.keys(d).filter(k => k.startsWith("aym:regno:")).length, 150);
  assert.ok(ms < 30000, `took ${ms} ms`);
});

test("pressing Verify twice at once (or a gateway retry) returns the same number", async () => {
  const email = "double.click@delegates-qa.org";
  const call = client();
  assert.equal((await call("regStart", profile(email))).status, 200);
  const otp = otpLog.get(email);
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => call("regVerify", { email, otp })));
  const ok = [a, b, c].filter(r => r.status === 200);
  assert.ok(ok.length >= 1);
  assert.equal(new Set(ok.map(r => r.body.profile.regNo)).size, 1);
  const users = Object.values(db()).filter(u => u && u.email === email && u.name);
  assert.equal(users.length, 1, "one delegate per email");
});

test("per-email limit: at most 5 codes per 15 minutes, with a clear message", async () => {
  const email = "spam.me@delegates-qa.org";
  const codes = [];
  let last;
  for (let i = 0; i < 7; i++) {
    last = await client()("regStart", profile(email)); // a fresh browser each time (no cookie cooldown)
    codes.push(last.status);
  }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(last.body.code, "email_rate");
  assert.match(last.body.error, /Check your inbox/);
  assert.ok(last.body.retryIn > 0);
});

test("staff load-test helpers: service-token-gated, probe emails only, own number range, idempotent", async () => {
  const anon = client("198.51.100.7");
  assert.equal((await anon("testProbeRegister", { email: "aym-probe+x@ayurdisha-qa.test" })).status, 403);
  const staff = client("198.51.100.8", serviceHeaders());
  assert.equal((await staff("testProbeRegister", { email: "someone@gmail.com" })).status, 400);

  const emails = Array.from({ length: 40 }, (_, i) => `aym-probe+burst-${i}@ayurdisha-qa.test`);
  // The real OTP-start path for probe addresses: limits apply, but no mail is ever sent.
  const starts = await Promise.all(emails.map(e => client("198.51.100.9")("regStart", profile(e))));
  assert.ok(starts.every(s => s.status === 200));
  const regs = await Promise.all(emails.map(email => staff("testProbeRegister", { email })));
  assert.ok(regs.every(r => r.status === 200), JSON.stringify(regs.find(r => r.status !== 200)));
  const nums = regs.map(r => r.body.profile.regNo);
  assert.equal(new Set(nums).size, 40);
  assert.ok(nums.every(n => /^11WAC\/2026\/9\d{5}$/.test(n)), "load-test range, never the real sequence");
  const again = await Promise.all(emails.slice(0, 5).map(email => staff("testProbeRegister", { email })));
  assert.deepEqual(again.map(r => r.body.profile.regNo), nums.slice(0, 5), "re-registering keeps the number");

  // Load-test questions: accepted through the normal student path, never queued for DISHA.
  const streams = Object.fromEntries((await staff("aiConfigGet")).body.streams.map(s => [s.id, true]));
  assert.equal((await staff("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams } })).status, 200);
  const ids = [];
  const subs = await Promise.all(regs.slice(0, 10).map((r, i) => {
    const id = `LOADT${String(i).padStart(4, "0")}`;
    ids.push(id);
    const rec = {
      name: r.body.profile.name, email: r.body.profile.email, mobile: "", state: "Odisha", institution: r.body.profile.institute,
      stage: "Intern", registered: "Yes", regNo: r.body.profile.regNo, inPerson: "Not yet confirmed", days: [],
      theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
      question: `${LOAD_MARK} How should I plan AIAPGET preparation during internship? (${i})`, context: "", outcome: "",
      consentFollow: "No", id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), consentPublish: "Yes", anonId: "U-LOAD000000", delegateNo: r.body.profile.regNo,
    };
    return client("198.51.100.10")("set", { key: `aym:q:${id}`, val: rec, token: r.body.token });
  }));
  assert.ok(subs.every(s => s.status === 200), JSON.stringify(subs.find(s => s.status !== 200)));
  assert.equal(Object.keys(db()).filter(k => k.startsWith("aym:ai:job:")).length, 0, "no DISHA jobs for load-test questions");

  // Public stats never count probe delegates.
  const g = await fetch(`${base}/api/aym-store?op=publicStats`);
  assert.equal(g.status, 200);
  assert.match(g.headers.get("cache-control") || "", /s-maxage=\d+/);
  const stats = await g.json();
  assert.equal(stats.ok, true);
  assert.ok(stats.registeredStudents >= 150 && stats.registeredStudents < 150 + 40, "probes excluded");
  assert.equal((await fetch(`${base}/api/aym-store?op=staffSnapshot`)).status, 405, "only public stats are GET-able");

  // Purge: dry run lists them with no duplicates, then everything goes.
  const tokens = [...regs, ...again].map(r => r.body.token);
  const dry = await staff("testProbePurge", { dryRun: true, ids, emails });
  assert.equal(dry.status, 200);
  assert.equal(dry.body.delegates.length, 40);
  assert.deepEqual(dry.body.duplicateRegNos, []);
  assert.equal(dry.body.questions.length, 10);
  const purge = await staff("testProbePurge", { ids, tokens, emails });
  assert.equal(purge.status, 200);
  assert.equal(purge.body.sessions, tokens.length);
  const left = db();
  const leftovers = Object.keys(left).filter(k => /aym-probe/.test(k) || (left[k] && /aym-probe/.test(String(left[k].email || ""))));
  assert.deepEqual(leftovers, []);
  assert.ok(emails.every(e => !(otpRateKey(e) in left)), "OTP rate records removed");
  assert.ok(!Object.keys(left).some(k => k.startsWith("aym:sess:") && left[k].probe), "probe sessions removed");
  assert.ok(!Object.keys(left).some(k => /^aym:regno:11WAC20269\d{5}$/.test(k)), "load-test regno index removed");
  const after2 = await staff("testProbePurge", { dryRun: true, ids, emails });
  assert.equal(after2.body.delegates.length + after2.body.questions.length, 0);
});
