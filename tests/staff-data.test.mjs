/**
 * Paged staff desk (server/staffData.js + src/staff/deskLoader.js) through the real HTTP handler on
 * an isolated file store: every question and delegate arrives exactly once across pages, pages
 * respect the count and byte caps, demo records stay hidden, anonymous callers are refused, the
 * per-instance cache is dropped on a write, the client loader retries a dropped connection,
 * refreshes incrementally, falls back to the one-shot snapshot on an older server, and the public
 * groups are GET-able with CDN cache headers (published only).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-staff-data-${process.pid}.json`);
const N_Q = 1234;
const N_U = 777;
const seed = {};
for (let i = 0; i < N_Q; i++) {
  const id = `Q${String(i).padStart(5, "0")}`;
  seed[`aym:q:${id}`] = {
    id, ticket: `AYM-Q-${id}`, question: `Question ${i} about PG preparation?`, text: `Question ${i} about PG preparation?`,
    name: `Delegate ${i}`, email: `d${i}@delegates-qa.org`, theme: "Academics, Teaching & Higher Education", createdAt: 1_700_000_000_000 + i * 600_000,
  };
}
for (let i = 0; i < 3; i++) {
  seed[`aym:q:DEMO${i}`] = { id: `DEMO${i}`, ticket: `AYM-Q-DEMO${i}`, question: "demo", name: "Demo Student", email: `demo${i}@example.com`, createdAt: 1_600_000_000_000 };
}
for (let i = 0; i < N_U; i++) {
  seed[`aym:user:U${String(i).padStart(5, "0")}`] = {
    id: `U${i}`, name: `Delegate ${i}`, email: `d${i}@delegates-qa.org`, regNo: `11WAC/2026/${1000 + i}`, createdAt: 1_700_000_000_000 + i,
    institute: "Hall College", age: 22, sex: "Female", secretNote: "never sent to the desk",
  };
}
seed["aym:user:DUP"] = { id: "DUP", name: "Delegate 5 again", email: "D5@delegates-qa.org", createdAt: 1 };
seed["aym:user:DEMO"] = { id: "DEMO", name: "Demo Student", email: "demo@example.com", createdAt: 1 };
seed["aym:clusters"] = [
  { id: "G1", status: "Published", answer: "Read the bulletin.", memberIds: ["Q00001"], theme: "Academics, Teaching & Higher Education" },
  { id: "G2", status: "Draft", answer: "", memberIds: ["Q00002"], theme: "Academics, Teaching & Higher Education" },
];
fs.writeFileSync(storeFile, JSON.stringify(seed));
const PASSCODE = "staff-data-test-passphrase-xx";
const ADMIN = "owner@staff-data-qa.test";
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock",
  ADMIN_PIN: PASSCODE, OTP_COOKIE_SECRET: "staff-data-test-cookie-secret-xx", STAFF_ADMIN_EMAILS: ADMIN, AYM_STAFF_DELAY_MS: "0",
});
const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
const realWarn = console.warn;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) otpLog.set(m[1].toLowerCase(), m[2]);
  if (!/\[aym-|OTP for/.test(line)) realLog(...args);
};
console.error = (...a) => { if (!/\[aym-/.test(a.join(" "))) realErr(...a); };
console.warn = (...a) => { if (!/\[aym-/.test(a.join(" "))) realWarn(...a); };

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { PAGE_MAX, PAGE_MAX_BYTES } = await import("../server/staffData.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");
const loader = await import("../src/staff/deskLoader.js");

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
  console.warn = realWarn;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

async function post(op, payload = {}, headers = {}) {
  const r = await fetch(`${base}/api/aym-store`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ op, ...payload }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
const staff = (op, payload) => post(op, payload, serviceHeaders());

async function adminStaff(op, payload) {
  if (!adminStaff._cookie) {
    const start = await post("staffStart", { passcode: PASSCODE, email: ADMIN });
    if (start.status !== 200) throw new Error("staffStart " + JSON.stringify(start.body));
    const otp = otpLog.get(ADMIN.toLowerCase());
    if (!otp) throw new Error("no OTP captured for admin; lines may have been swallowed");
    const startCookies = typeof start.headers.getSetCookie === "function" ? start.headers.getSetCookie() : [];
    const otpCookie = (startCookies.find(c => c.startsWith("aym_staff_otp=")) || "").split(";")[0];
    const verify = await post("staffVerify", { email: ADMIN, otp }, otpCookie ? { cookie: otpCookie } : {});
    if (verify.status !== 200) throw new Error("staffVerify " + JSON.stringify(verify.body));
    const setCookie = typeof verify.headers.getSetCookie === "function" ? verify.headers.getSetCookie() : [];
    const raw = (setCookie.find(c => c.startsWith("aym_staff=")) || "").split(";")[0];
    if (!raw) throw new Error("no staff cookie");
    adminStaff._cookie = raw;
  }
  return post(op, payload, { cookie: adminStaff._cookie });
}

/** Same contract as the app's `api`: admin cookie (service token is scoped). */
function apiLike(hook) {
  return async (op, payload = {}) => {
    if (hook) await hook(op, payload);
    const r = await adminStaff(op, payload);
    if (r.status >= 400) { const e = new Error(r.body.error || `HTTP ${r.status}`); e.status = r.status; e.data = r.body; throw e; }
    return r.body;
  };
}

test("anonymous callers get 403 on every paged staff op", async () => {
  for (const op of ["staffCounts", "staffClusters", "staffQuestionsPage", "staffDelegatesPage"]) {
    const r = await post(op, {});
    assert.equal(r.status, 403, op);
    assert.equal(r.body.items, undefined, `${op} leaks nothing`);
  }
});

test("counts + question pages: every question exactly once, demo hidden, limits enforced", async () => {
  const counts = await staff("staffCounts");
  assert.equal(counts.status, 200);
  assert.equal(counts.body.questions, N_Q + 3);
  assert.equal(counts.body.clustersVersion >= 1, true);
  assert.equal(counts.body.backend, "file");

  const seen = new Set();
  const hidden = new Set();
  let cursor = "";
  let pages = 0;
  for (;;) {
    const r = await staff("staffQuestionsPage", { cursor, limit: PAGE_MAX });
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length <= PAGE_MAX);
    for (const q of r.body.items) {
      assert.equal(seen.has(q.id), false, `duplicate ${q.id}`);
      assert.equal(q.text, undefined, "index-only field projected away");
      seen.add(q.id);
    }
    r.body.hidden.forEach(id => hidden.add(id));
    pages += 1;
    if (r.body.done) { assert.equal(r.body.nextCursor, ""); break; }
    cursor = r.body.nextCursor;
  }
  assert.equal(seen.size, N_Q);
  assert.deepEqual([...hidden].sort(), ["DEMO0", "DEMO1", "DEMO2"]);
  assert.equal(pages, Math.ceil((N_Q + 3) / PAGE_MAX));

  const big = await staff("staffQuestionsPage", { limit: 100000 });
  assert.equal(big.body.scanned, PAGE_MAX, "limit is clamped");
});

test("delegate pages: projected cards, one per email, demo hidden", async () => {
  const users = await loader.loadDelegatesPaged(apiLike(), { pageSize: PAGE_MAX });
  assert.equal(users.length, N_U, "DUP (same email, other case) and DEMO dropped");
  assert.ok(users.every(u => u.secretNote === undefined && u.id === undefined), "only card fields leave the server");
  assert.ok(users[0].createdAt >= users[users.length - 1].createdAt, "newest first");
});

test("a page never exceeds the byte cap; the cursor resumes after the cut", async () => {
  const db = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  const huge = "x".repeat(40_000);
  for (let i = 0; i < 60; i++) db[`aym:q:ZBIG${String(i).padStart(3, "0")}`] = { id: `ZBIG${String(i).padStart(3, "0")}`, ticket: `AYM-Q-ZBIG${i}`, question: huge, name: "Big", email: "big@delegates-qa.org", createdAt: 1_800_000_000_000 + i };
  fs.writeFileSync(storeFile, JSON.stringify(db));
  await staff("ping");
  const ids = new Set();
  let cursor = "ZBIG";
  let pages = 0;
  for (;;) {
    const r = await post("staffQuestionsPage", { cursor, limit: 500 }, serviceHeaders());
    const raw = JSON.stringify(r.body).length;
    assert.ok(raw <= PAGE_MAX_BYTES + 50_000, `page ${raw} bytes`);
    r.body.items.forEach(q => ids.add(q.id));
    pages += 1;
    if (r.body.done) break;
    cursor = r.body.nextCursor;
  }
  assert.equal(ids.size, 60);
  assert.ok(pages >= 2, "split by bytes");
  for (let i = 0; i < 60; i++) delete db[`aym:q:ZBIG${String(i).padStart(3, "0")}`];
  fs.writeFileSync(storeFile, JSON.stringify(db));
});

test("client loader: full desk, retries a dropped connection, progress reported", async () => {
  let failures = 0;
  const flaky = apiLike(async op => {
    if (op === "staffQuestionsPage" && failures < 2) { failures += 1; const e = new TypeError("fetch failed"); e.network = true; throw e; }
  });
  const progress = [];
  const desk = await loader.loadStaffDesk(flaky, { pageSize: PAGE_MAX, onProgress: (n, t) => progress.push([n, t]), retry: { baseMs: 1 } });
  assert.equal(failures, 2);
  assert.equal(desk.paged, true);
  assert.equal(desk.questions.length, N_Q);
  assert.equal(desk.seenIds.size, N_Q + 3);
  assert.ok(desk.questions[0].createdAt <= desk.questions[1].createdAt, "oldest first like the old snapshot");
  assert.equal(desk.clusters.length, 2);
  assert.ok(progress.length >= 5 && progress[progress.length - 1][0] === N_Q + 3);
});

test("a non-retryable error is surfaced at once (no silent empty desk)", async () => {
  const denied = async () => { const e = new Error("Your access is pending."); e.status = 403; throw e; };
  await assert.rejects(loader.loadStaffDesk(denied, { retry: { baseMs: 1 } }), /pending/);
  let calls = 0;
  const down = async () => { calls += 1; const e = new Error("busy"); e.status = 503; throw e; };
  await assert.rejects(loader.loadStaffDesk(down, { retry: { baseMs: 1, attempts: 3 } }), /busy/);
  assert.equal(calls, 3);
});

test("incremental refresh picks up a new question; a deletion forces a full reload; cache dropped on write", async () => {
  const call = apiLike();
  const desk = await loader.loadStaffDesk(call, { pageSize: PAGE_MAX });
  const before = (await staff("staffCounts")).body.questions;
  const rec = {
    id: "QNEW1", ticket: "AYM-Q-QNEW1", question: "Staff-entered question about research careers?", name: "Walk-in Delegate",
    email: "walkin@delegates-qa.org", regNo: "11WAC/2026/1001", theme: "Research, Evidence & Publication", createdAt: Date.now(),
  };
  const saved = await adminStaff("set", { key: "aym:q:QNEW1", val: rec });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await staff("staffCounts")).body.questions, before + 1, "counts not served stale from the cache after a write");
  const next = await loader.refreshDeskIncremental(call, desk);
  assert.ok(next, "incremental refresh accepted");
  assert.equal(next.questions.length, desk.questions.length + 1);
  assert.ok(next.questions.some(q => q.id === "QNEW1"));

  const db = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  delete db["aym:q:Q00003"];
  fs.writeFileSync(storeFile, JSON.stringify(db));
  await adminStaff("set", { key: "aym:test:noop", val: 1 }); // any write through this instance drops its short cache
  assert.equal(await loader.refreshDeskIncremental(call, next), null, "count mismatch → full reload");
});

test("older server without paged ops: loader falls back to staffSnapshot", async () => {
  const oldServer = async (op, payload) => {
    if (op !== "staffSnapshot") { const e = new Error("unknown op"); e.status = 400; throw e; }
    return apiLike()(op, payload);
  };
  const desk = await loader.loadStaffDesk(oldServer);
  assert.equal(desk.paged, false);
  assert.ok(desk.questions.length > 1000);
  assert.ok(Array.isArray(desk.users) && desk.users.length > 700);
  const users = await loader.loadDelegatesPaged(oldServer);
  assert.ok(users.length > 700);
});

test("legacy staffSnapshot still answers (prefix reads) and stays below the size guard", async () => {
  const r = await adminStaff("staffSnapshot");
  assert.equal(r.status, 200);
  assert.ok(r.body.questions.length > 1000 && r.body.users.length > 700);
});

test("public groups by GET: published only, CDN cache headers; other GET ops refused", async () => {
  const r = await fetch(`${base}/api/aym-store?op=publicClusters`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control") || "", /s-maxage=\d+/);
  const body = await r.json();
  assert.deepEqual(body.value.map(c => c.id), ["G1"]);
  const bad = await fetch(`${base}/api/aym-store?op=staffSnapshot`);
  assert.equal(bad.status, 405);
});

test("Track lookup sees a newly published group right after clustersSave (lookup cache dropped)", async () => {
  const hit1 = (await post("lookup", { query: "AYM-Q-Q00002" })).body.hits[0];
  assert.equal(hit1.cluster.answer, "");
  const { clusters, clustersVersion } = (await adminStaff("staffClusters")).body;
  const next = clusters.map(c => (c.id === "G2" ? { ...c, status: "Published", answer: "Start with the official bulletin." } : c));
  const saved = await adminStaff("clustersSave", { clusters: next, version: clustersVersion });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const hit2 = (await post("lookup", { query: "AYM-Q-Q00002" })).body.hits[0];
  assert.equal(hit2.cluster.answer, "Start with the official bulletin.");
});
