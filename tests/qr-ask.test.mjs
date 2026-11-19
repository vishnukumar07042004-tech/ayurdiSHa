/**
 * QR-friendly Ask Desk link: /ask + /a route mapping, ?src= sanitising, return-to-ask after
 * registering, and anonymous per-source visit counters (isolated file store, never Firestore).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-qr-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
process.env.AYM_STORE = "file";
process.env.AYM_STORE_FILE = storeFile;
process.env.AYM_MAIL = "console";
process.env.AYM_AI_NO_KICK = "1";

const otpLog = new Map();
const realLog = console.log;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-(store|mail|notify|register|ai)\]/.test(line)) return;
  realLog(...args);
};

const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

const { sanitizeSource, isAskShortPath, resolveEntryUrl, istDayKey, summarizeSources } = await import("../shared/source.js");

/* ---------------------------------------------------------------- */
/* Pure helpers                                                       */
/* ---------------------------------------------------------------- */

test("src sanitising keeps [a-z0-9-]{1,32} and drops everything else", () => {
  assert.equal(sanitizeSource("qr"), "qr");
  assert.equal(sanitizeSource("  Poster-Hall-A "), "poster-hall-a");
  assert.equal(sanitizeSource("poster hall_a"), "poster-hall-a");
  assert.equal(sanitizeSource("qr<script>alert(1)</script>"), "qrscriptalert1script");
  assert.equal(sanitizeSource("--qr--"), "qr");
  assert.equal(sanitizeSource("a".repeat(50)), "a".repeat(32));
  assert.equal(sanitizeSource("x".repeat(31) + "-yz"), "x".repeat(31));
  assert.equal(sanitizeSource("someone@example.com"), "someoneexample-com");
  for (const bad of ["", null, undefined, "!!!", "---", "ಕನ್ನಡ"]) assert.equal(sanitizeSource(bad), "");
});

test("route mapping: /ask and /a open the Ask Desk; /#ask keeps working", () => {
  for (const p of ["/ask", "/ask/", "/ASK", "/a", "/a/"]) assert.ok(isAskShortPath(p), p);
  for (const p of ["/", "/asks", "/about", "/mentors", "/a/b"]) assert.ok(!isAskShortPath(p), p);

  assert.deepEqual(resolveEntryUrl({ pathname: "/ask" }), { source: "", url: "/#ask" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/a", search: "" }), { source: "", url: "/#ask" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/ask", search: "?src=qr" }), { source: "qr", url: "/#ask" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/ask", search: "?src=Poster-Hall-A&lang=hi" }),
    { source: "poster-hall-a", url: "/?lang=hi#ask" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/", hash: "#ask" }), { source: "", url: null });
  assert.deepEqual(resolveEntryUrl({ pathname: "/", search: "?src=qr", hash: "#ask" }), { source: "qr", url: "/#ask" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/mentors", search: "?src=flyer" }), { source: "flyer", url: "/mentors" });
  assert.deepEqual(resolveEntryUrl({ pathname: "/ask", search: "?src=%3C%3E" }), { source: "", url: "/#ask" });
});

test("visit days are IST calendar days", () => {
  assert.equal(istDayKey(Date.UTC(2026, 9, 28, 18, 29)), "2026-10-28");
  assert.equal(istDayKey(Date.UTC(2026, 9, 28, 18, 31)), "2026-10-29");
});

/* ---------------------------------------------------------------- */
/* Browser session: source + return-to-ask                            */
/* ---------------------------------------------------------------- */

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

test("entry URL: /ask?src=qr is normalised to /#ask, stored, and counted once per session", async () => {
  globalThis.sessionStorage = new MemoryStorage();
  const replaced = [];
  globalThis.history = { state: null, replaceState: (_s, _t, url) => replaced.push(url) };
  const pings = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { pings.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; };
  try {
    const link = await import("../src/askLink.js");
    link.applyEntryUrl({ pathname: "/ask", search: "?src=QR", hash: "" });
    assert.deepEqual(replaced, ["/#ask"]);
    assert.equal(link.currentSource(), "qr");
    assert.deepEqual(pings, [{ op: "visitSource", src: "qr" }]);

    link.applyEntryUrl({ pathname: "/ask", search: "?src=qr", hash: "" });
    assert.equal(pings.length, 1, "reload in the same tab does not count twice");

    link.applyEntryUrl({ pathname: "/", search: "", hash: "#ask" });
    assert.equal(replaced.length, 2, "plain /#ask needs no rewrite");
    assert.equal(link.currentSource(), "qr", "source survives in-app navigation");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("return-to-ask: banner intent survives the register step, is consumed once, and expires", async () => {
  globalThis.sessionStorage = new MemoryStorage();
  const link = await import("../src/askLink.js");
  assert.equal(link.peekReturnToAsk(), null);

  const t0 = 1_800_000_000_000;
  link.markReturnToAsk({ theme: "Clinical Practice", subtheme: "", question: "How do I start a clinic after BAMS?", name: "x" }, t0);
  assert.deepEqual(link.peekReturnToAsk(t0 + 1000),
    { draft: { theme: "Clinical Practice", question: "How do I start a clinic after BAMS?" } });
  assert.deepEqual(link.takeReturnToAsk(t0 + 2000).draft.question, "How do I start a clinic after BAMS?");
  assert.equal(link.takeReturnToAsk(t0 + 3000), null, "consumed after the first registration");

  link.markReturnToAsk({}, t0);
  assert.deepEqual(link.peekReturnToAsk(t0 + 60_000), { draft: {} });
  assert.equal(link.peekReturnToAsk(t0 + 31 * 60_000), null, "stale intent is ignored");
});

/* ---------------------------------------------------------------- */
/* Server ops                                                         */
/* ---------------------------------------------------------------- */

const { aymStoreHandler } = await import("../server/storePlugin.js");
let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
    res.statusCode = 404; res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  console.log = realLog;
  try { fs.unlinkSync(storeFile); } catch { /* already gone */ }
});

function client(ip = "10.0.0.1", extraHeaders = {}) {
  const jar = new Map();
  return async function call(op, payload = {}) {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
        cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
        ...extraHeaders,
      },
      body: JSON.stringify({ op, ...payload }),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  };
}

test("visitSource: anonymous per-source counters; staff-only read; no personal data stored", async () => {
  const visitor = client("10.0.0.2");
  assert.equal((await visitor("visitSource", { src: "qr" })).status, 200);
  assert.equal((await visitor("visitSource", { src: "QR" })).status, 200);
  assert.equal((await visitor("visitSource", { src: "poster hall a" })).status, 200);
  assert.equal((await visitor("visitSource", { src: "!!!" })).status, 400);

  assert.equal((await visitor("visitSourcesGet")).status, 403);
  const staff = client("10.0.0.3", serviceHeaders());
  const got = await staff("visitSourcesGet");
  assert.equal(got.status, 200);
  assert.deepEqual(got.body.totals, { qr: 2, "poster-hall-a": 1 });
  assert.deepEqual(got.body.days[istDayKey()], { qr: 2, "poster-hall-a": 1 });

  const raw = fs.readFileSync(storeFile, "utf8");
  assert.ok(!raw.includes("10.0.0.2"), "the visitor IP is never persisted");
});

test("visitSource is rate-limited per network (generously: a venue shares one Wi-Fi address)", async () => {
  const { VISIT_RATE_MAX } = await import("../server/visitSources.js");
  assert.ok(VISIT_RATE_MAX >= 200, "a hall behind one NAT must not be cut off");
  const flood = client("10.9.9.9");
  const codes = [];
  for (let i = 0; i < VISIT_RATE_MAX + 3; i++) codes.push((await flood("visitSource", { src: "qr" })).status);
  assert.equal(codes.filter(c => c === 200).length, VISIT_RATE_MAX);
  assert.ok(codes.slice(VISIT_RATE_MAX).every(c => c === 429));
  assert.equal((await client("10.9.9.10")("visitSource", { src: "qr" })).status, 200, "other networks unaffected");
});

test("registration and Ask Desk questions carry the sanitised source", async () => {
  const call = client("10.0.1.1");
  const email = "qa.qr.source@qa-ayurdisha.test";
  const start = await call("regStart", { name: "QA QR", age: 22, sex: "Female", institute: "QA Institute", email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const ok = await call("regVerify", { email, otp: otpLog.get(email), source: "QR" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.profile.regNo, /^11WAC\/2026\/\d{4}$/);

  const id = "QAQRSRC0001";
  const rec = {
    id, ticket: "AYM-Q-QRSRC1", createdAt: Date.now(),
    name: "QA QR", email, institution: "QA Institute", stage: "Intern", state: "Odisha",
    theme: "Clinical Practice", subtheme: "Starting a clinic",
    question: "How should I plan my first year of clinical practice after BAMS?", consentPublish: "Yes",
    source: "Poster Hall A!!",
  };
  const saved = await call("set", { key: `aym:q:${id}`, val: rec, token: ok.body.token });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  // A returning delegate re-verifying from another QR is not re-attributed.
  await call("regResend", { email });
  const again = client("10.0.1.2");
  await again("regStart", { name: "QA QR", age: 22, sex: "Female", institute: "QA Institute", email });
  assert.equal((await again("regVerify", { email, otp: otpLog.get(email), source: "flyer" })).status, 200);

  const staff = client("10.0.1.3", serviceHeaders());
  const snap = await staff("staffSnapshot");
  assert.equal(snap.status, 200, JSON.stringify(snap.body));
  const user = snap.body.users.find(u => u.email === email);
  assert.equal(user.source, "qr");
  const q = snap.body.questions.find(x => x.id === id);
  assert.equal(q.source, "poster-hall-a");

  const visits = (await staff("visitSourcesGet")).body;
  const rows = summarizeSources({ visits, delegates: snap.body.users, questions: snap.body.questions });
  const qr = rows.find(r => r.source === "qr");
  assert.ok(qr.visits >= 2);
  assert.equal(qr.registrations, 1);
  assert.equal(rows.find(r => r.source === "poster-hall-a").questions, 1);
  assert.ok(!rows.some(r => r.source === "flyer"));
});
