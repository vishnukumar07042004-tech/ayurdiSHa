/**
 * "Sign in with WAC ID": ID normalisation, CSV/XLSX import (auto-detect + validation), lookup
 * match / generic mismatch, code to the WAC-record email, link vs create, one WAC ID → one account,
 * rate limits, locked profile fields, Ask + Track for WAC accounts, the WAC API adapter (mocked
 * fetch) and the Firestore repository's ≤ 500-write batches. Real HTTP handler, isolated file store.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";

const storeFile = path.join(os.tmpdir(), `aym-wac-signin-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock" });
delete process.env.WAC_VERIFY_MODE;
delete process.env.WAC_SIGNIN;
delete process.env.WAC_ID_PATTERN;

const otpLog = new Map();
const logged = [];
const realLog = console.log;
const realErr = console.error;
const realWarn = console.warn;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  logged.push(line);
  if (/\[aym-/.test(line)) return;
  realLog(...args);
};
console.error = (...args) => { logged.push(args.join(" ")); if (!/\[aym-/.test(args.join(" "))) realErr(...args); };
console.warn = (...args) => { logged.push(args.join(" ")); };

const { aymStoreHandler } = await import("../server/storePlugin.js");
const {
  normalizeWacId, wacIdKey, validWacId, maskEmail, maskPhone, detectColumns, rowsFromGrid,
  validateDelegateRows, sanitizeImportCell, cleanDelegateRow, WAC_NO_MATCH, WAC_ALREADY_LINKED, WAC_CLEAR_PHRASE,
} = await import("../shared/wacId.js");
const { apiAdapter, firestoreRepo, setWacAdapterForTests, listAdapter } = await import("../server/wacDelegates.js");
const { wacIpLimiter, resetWacConfigCache } = await import("../server/wacSignIn.js");
const { ASK_STAGES } = await import("../shared/askOptions.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

const SAMPLE = fs.readFileSync(new URL("../docs/wac-signin/sample-delegates.csv", import.meta.url), "utf8");

let server;
let base;
let ipSeq = 0;
before(async () => {
  server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  setWacAdapterForTests(null);
  server.close();
  console.log = realLog;
  console.error = realErr;
  console.warn = realWarn;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

/** Each client gets its own network address so per-IP limits don't leak between tests. */
function client(ip = `198.51.100.${(ipSeq += 1) % 250}`, extraHeaders = {}) {
  const jar = new Map();
  return async (op, payload = {}) => {
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
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}

const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
const userByEmail = email => {
  const d = db();
  const idx = d[`aym:email:${email.toLowerCase()}`];
  return idx ? d[`aym:user:${idx.userId}`] : null;
};

function sampleRows(csv = SAMPLE) {
  const wb = XLSX.read(csv, { type: "string" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  return rowsFromGrid(grid, detectColumns(grid[0]));
}

let staff;
async function staffClient() {
  if (staff) return staff;
  staff = client("192.0.2.10", serviceHeaders());
  return staff;
}

/** WAC sign-in end to end; returns { call, verify }. */
async function wacSignIn(wacId, email, { typed = email, call = client(), source } = {}) {
  const start = await call("wacStart", { wacId, email: typed });
  assert.equal(start.status, 200, `wacStart ${JSON.stringify(start.body)}`);
  assert.ok(!JSON.stringify(start.body).match(/\b\d{6}\b/), "code never returned to the browser");
  const otp = otpLog.get(email.toLowerCase());
  assert.match(otp || "", /^\d{6}$/, "code sent to the WAC-record email");
  otpLog.delete(email.toLowerCase());
  const verify = await call("wacVerify", { wacId, otp, ...(source ? { source } : {}) });
  return { call, start, verify };
}

/* ---------------------------------------------------------------- pure helpers */

test("WAC ID normalisation: trim, upper case, spaces, unicode dashes; key ignores - _ /", () => {
  assert.equal(normalizeWacId("  wac 2026 – 0042 "), "WAC2026-0042");
  assert.equal(normalizeWacId(null), "");
  assert.equal(wacIdKey("wac-26/00_42"), "WAC260042");
  assert.equal(wacIdKey("WAC260042"), wacIdKey("wac 26-0042"));
  assert.equal(validWacId(" test-wac-0001 "), "TEST-WAC-0001");
  assert.equal(validWacId("ab"), "", "too short");
  assert.equal(validWacId("BAD!ID#"), "", "symbols refused");
  assert.equal(validWacId("WAC-0001", "^WAC-\\d{4}$"), "WAC-0001", "configurable pattern");
  assert.equal(validWacId("XYZ-0001", "^WAC-\\d{4}$"), "");
  assert.equal(validWacId("WAC-0001", "(["), "WAC-0001", "broken pattern falls back to the default");
});

test("masking: emails and phones never shown in full", () => {
  assert.equal(maskEmail("Ananya.Rao@gmail.com"), "an•••@g•••.com");
  assert.equal(maskEmail("a@x.in"), "a•••@x•••.in");
  assert.equal(maskPhone("+91 98765 43210"), "•••• 3210");
  assert.equal(maskPhone(""), "");
});

test("import cells: formula injection neutralised; phones kept", () => {
  assert.equal(sanitizeImportCell("=1+1"), "'=1+1");
  assert.equal(sanitizeImportCell("+cmd|'/C calc'"), "'+cmd|'/C calc'");
  assert.equal(sanitizeImportCell("+91 98765 43210", { phone: true }), "+91 98765 43210");
  const row = cleanDelegateRow({
    wacId: "WAC-26/001", name: "=HYPERLINK(\"x\")", email: "ok@sample.test",
    phone: "+919876543210", institution: "@SUM(A1)",
  });
  assert.equal(row.phone, "+919876543210");
  assert.equal(row.name.startsWith("'"), true);
  assert.equal(row.institution.startsWith("'"), true);
});

test("CSV import: headers auto-detected, attendance / category normalised", () => {
  const wb = XLSX.read(SAMPLE, { type: "string" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const map = detectColumns(grid[0]);
  assert.deepEqual(Object.keys(map).sort(), ["attendance", "category", "country", "email", "institution", "name", "phone", "state", "wacId"]);
  const { valid, problems } = validateDelegateRows(rowsFromGrid(grid, map));
  assert.equal(valid.length, 5);
  assert.equal(problems.length, 0);
  assert.deepEqual(valid.map(r => r.attendance), ["in-person", "online", "in-person", "online", "in-person"]);
  assert.deepEqual(valid.map(r => r.category), ["student", "delegate", "faculty", "international", "student"]);
  assert.equal(valid[0].emailLower, "fake.delegate.one@ayurdisha-sample.test");
});

test("XLSX import + other header spellings (Reg No, E-mail, Phone, College, Mode)", () => {
  const aoa = [
    ["Sl", "Reg No", "Participant Name", "E-mail", "Phone", "College", "Type", "Country", "State/UT", "Mode"],
    [1, "x-1001", "Row One", "ROW.ONE@Sample.test", "9000000001", "C1", "Delegate", "India", "Goa", "Offline"],
    [2, "", "No Id", "noid@sample.test", "", "", "", "", "", ""],
    [3, "X-1003", "No Email", "", "", "", "", "", "", ""],
    [4, "X-1004", "Bad Email", "not-an-email", "", "", "", "", "", ""],
    [5, "X 1001", "Duplicate", "dup@sample.test", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", ""],
    [7, "!!", "Bad Id", "badid@sample.test", "", "", "", "", "", ""],
    [8, "X-1009", "", "noname@sample.test", "", "", "", "", "", ""],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Delegates");
  const back = XLSX.read(XLSX.write(wb, { bookType: "xlsx", type: "buffer" }), { type: "buffer" });
  const grid = XLSX.utils.sheet_to_json(back.Sheets.Delegates, { header: 1, defval: "" });
  const map = detectColumns(grid[0]);
  assert.equal(map.wacId, 1);
  assert.equal(map.email, 3);
  assert.equal(map.attendance, 9);
  const { valid, problems, duplicates } = validateDelegateRows(rowsFromGrid(grid, map));
  assert.equal(valid.length, 1);
  assert.equal(valid[0].wacId, "X-1001");
  assert.equal(duplicates, 1, "X 1001 is the same delegate as x-1001");
  assert.deepEqual(problems.map(p => p.issue), [
    "missing registration ID", "missing email", "email is not valid", "duplicate registration ID (first row kept)", "registration ID format not recognised", "missing name",
  ]);
  assert.ok(problems.every(p => !/@|Row|Bad Email/.test(p.issue)), "problem text carries no PII");
  assert.deepEqual(problems.map(p => p.line), [3, 4, 5, 6, 8, 9], "sheet line numbers");
});

/* ---------------------------------------------------------------- config + import */

test("before any import: WAC option hidden ('coming soon'), sign-in refuses with the generic error", async () => {
  resetWacConfigCache();
  const c = await client()("wacConfig");
  assert.equal(c.status, 200);
  assert.equal(c.body.enabled, false);
  assert.equal(c.body.comingSoon, true);
  const r = await client()("wacStart", { wacId: "TEST-WAC-0001", email: "fake.delegate.one@ayurdisha-sample.test" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, WAC_NO_MATCH);
});

test("staff import: admin-only; 5-row sample upserts; stats + config update; no PII in logs", async () => {
  const anon = client();
  for (const op of ["wacDelegatesImport", "wacDelegatesStats", "wacDelegatesClear"]) {
    assert.equal((await anon(op, { rows: [{ wacId: "X", email: "x@y.z" }], confirm: WAC_CLEAR_PHRASE })).status, 403, op);
  }
  const s = await staffClient();
  logged.length = 0;
  const r = await s("wacDelegatesImport", { rows: sampleRows(), batchId: "test-batch-1", filename: "sample-delegates.csv" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.imported, 5);
  assert.equal(r.body.created, 5);
  assert.equal(r.body.total, 5);
  assert.equal(r.body.lastImport.filename, "sample-delegates.csv");
  const again = await s("wacDelegatesImport", { rows: sampleRows(), batchId: "test-batch-2" });
  assert.equal(again.body.created, 0, "re-import is an upsert");
  assert.equal(again.body.updated, 5);
  assert.equal(again.body.total, 5);
  const text = logged.join("\n");
  assert.ok(!/fake\.delegate|Fake Delegate|90000|TEST-WAC/.test(text), "import logs carry counts only");
  const stats = await s("wacDelegatesStats");
  assert.equal(stats.body.total, 5);
  assert.equal(stats.body.linked, 0);
  assert.equal(stats.body.lastImport.batchId, "test-batch-2");
  assert.equal(stats.body.mode, "list");
  assert.equal(stats.body.apiConfigured, false);
  const found = await s("wacDelegatesStats", { query: "fake.delegate.two@ayurdisha-sample.test" });
  assert.equal(found.body.matches.length, 1, "email index lookup");
  assert.equal(found.body.matches[0].maskedEmail, "fa•••@a•••.test");
  assert.equal((await s("wacDelegatesStats", { query: "test wac 0003" })).body.matches[0].wacId, "TEST-WAC-0003");
  const cfg = await client()("wacConfig");
  assert.equal(cfg.body.enabled, true);
  assert.equal(cfg.body.comingSoon, false);
});

/* ---------------------------------------------------------------- sign-in */

test("mismatch: wrong email and unknown ID get the same generic error", async () => {
  const call = client();
  const wrongEmail = await call("wacStart", { wacId: "TEST-WAC-0001", email: "someone.else@ayurdisha-sample.test" });
  const unknownId = await call("wacStart", { wacId: "TEST-WAC-9999", email: "fake.delegate.one@ayurdisha-sample.test" });
  const badFormat = await call("wacStart", { wacId: "??", email: "fake.delegate.one@ayurdisha-sample.test" });
  for (const r of [wrongEmail, unknownId, badFormat]) {
    assert.equal(r.status, 400);
    assert.equal(r.body.error, WAC_NO_MATCH);
    assert.equal(r.body.code, "no_match");
    assert.deepEqual(Object.keys(r.body).sort(), ["code", "error"], "nothing hints which field was wrong");
  }
  assert.equal(otpLog.size, 0, "no code sent on a mismatch");
  assert.equal((await call("wacStart", { wacId: "", email: "" })).status, 400);
});

test("new delegate: code to the record email (typed in any case), account created, WAC ID is the pass", async () => {
  const { start, verify } = await wacSignIn(" test-wac-0001 ", "fake.delegate.one@ayurdisha-sample.test", { typed: "  Fake.Delegate.One@AYURDISHA-sample.test ", source: "qr-hall" });
  assert.equal(start.body.maskedEmail, "fa•••@a•••.test");
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  const p = verify.body.profile;
  assert.equal(p.regNo, "TEST-WAC-0001", "pass number = WAC ID");
  assert.equal(p.passLabel, "TEST-WAC-0001");
  assert.equal(p.wacVerified, true);
  assert.equal(p.wacConfirmed, false);
  assert.equal(p.name, "Fake Delegate One");
  assert.equal(p.institute, "Sample Ayurveda College (FAKE)");
  assert.equal(verify.body.needsConfirm, true);
  assert.equal(verify.body.linked, false);
  assert.equal(verify.body.record.phone, "•••• 0001", "phone masked on the confirm screen");
  assert.equal(verify.body.record.attendance, "in-person");
  assert.match(verify.body.token, /^[0-9a-f]{48}$/);
  const u = userByEmail("fake.delegate.one@ayurdisha-sample.test");
  assert.equal(u.wacId, "TEST-WAC-0001");
  assert.equal(u.authSource, "wac");
  assert.equal(u.source, "qr-hall", "QR attribution kept");
  assert.deepEqual(u.wac, { category: "student", country: "India", state: "Odisha", attendance: "in-person", institution: "Sample Ayurveda College (FAKE)" });
  const d = db();
  assert.equal(d["aym:regno:TESTWAC0001"].userId, u.id, "regno index claimed");
  assert.equal(d["aym:waclink:TESTWAC0001"].userId, u.id, "single-link record");
  assert.equal(d["aym:wacdel:TESTWAC0001"].linked, true, "delegate marked linked");
});

test("confirm: AYURDISHA-only fields saved, WAC fields locked; consent + stage required; wacMe", async () => {
  const { call, verify } = await wacSignIn("TEST-WAC-0004", "fake.delegate.four@ayurdisha-sample.test");
  assert.equal(verify.status, 200);
  const token = verify.body.token;
  assert.equal((await client()("wacConfirm", { stage: ASK_STAGES[0], consent: true })).status, 403, "needs a session");
  assert.equal((await call("wacConfirm", { token, stage: ASK_STAGES[0] })).status, 400, "consent required");
  assert.equal((await call("wacConfirm", { token, stage: "Astronaut", consent: true })).status, 400, "stage from the list");
  const me = await call("wacMe", { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.needsConfirm, true);
  assert.equal(me.body.record.country, "United Kingdom");
  assert.equal(me.body.record.phone, "•••• 0004");
  const ok = await call("wacConfirm", {
    token, stage: "Practitioner", consent: true, interests: ["Practice Abroad & Practitioner Mobility", "Export & Global Trade"],
    name: "Hacked Name", email: "hacker@evil.test", institute: "Changed", wacId: "OTHER",
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.profile.wacConfirmed, true);
  assert.equal(ok.body.profile.stage, "Practitioner");
  const u = userByEmail("fake.delegate.four@ayurdisha-sample.test");
  assert.equal(u.name, "Fake Delegate Four", "name locked");
  assert.equal(u.email, "fake.delegate.four@ayurdisha-sample.test", "email locked");
  assert.equal(u.institute, "Example Wellness Academy (FAKE)", "institution locked");
  assert.equal(u.wacId, "TEST-WAC-0004");
  assert.deepEqual(u.interests, ["Practice Abroad & Practitioner Mobility", "Export & Global Trade"]);
  assert.ok(u.wacConsentAt > 0);
  const back = await wacSignIn("TEST-WAC-0004", "fake.delegate.four@ayurdisha-sample.test");
  assert.equal(back.verify.status, 200, "returning WAC user signs in again");
  assert.equal(back.verify.body.needsConfirm, false, "confirmation not asked twice");
  assert.equal(back.verify.body.profile.regNo, "TEST-WAC-0004");
  assert.equal(userByEmail("fake.delegate.four@ayurdisha-sample.test").stage, "Practitioner", "AYURDISHA fields kept on re-sign-in");
});

test("existing email account is linked (no duplicate): issued number kept, WAC ID shown as passLabel", async () => {
  const email = "fake.delegate.two@ayurdisha-sample.test";
  const reg = client();
  assert.equal((await reg("regStart", { name: "Two Typed Name", age: 31, sex: "Female", institute: "Typed Inst", email })).status, 200);
  const ok = await reg("regVerify", { email, otp: otpLog.get(email) });
  otpLog.delete(email);
  assert.equal(ok.status, 200);
  const issued = ok.body.profile.regNo;
  assert.match(issued, /^11WAC\/2026\/\d{4}$/);
  const before = userByEmail(email);
  const { verify } = await wacSignIn("TEST-WAC-0002", email);
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal(verify.body.linked, true);
  assert.equal(verify.body.profile.regNo, issued, "issued pass number kept (tickets stay valid)");
  assert.equal(verify.body.profile.passLabel, "TEST-WAC-0002");
  const after = userByEmail(email);
  assert.equal(after.id, before.id, "same account");
  assert.equal(after.age, 31, "AYURDISHA-only fields kept");
  assert.equal(after.sex, "Female");
  assert.equal(after.name, "Fake Delegate Two", "name prefilled from the WAC record");
  assert.equal(Object.keys(db()).filter(k => k.startsWith("aym:user:") && db()[k].emailLower === email).length, 1, "one user");
});

test("one WAC ID → one account: a second account is refused and staff alerted", async () => {
  const s = await staffClient();
  await wacSignIn("TEST-WAC-0003", "fake.delegate.three@ayurdisha-sample.test");
  // WAC later changes the email on TEST-WAC-0003; the new address must not take over the linked account.
  const rows = sampleRows().map(r => (String(r.wacId) === "TEST-WAC-0003" ? { ...r, email: "new.owner@ayurdisha-sample.test" } : r));
  // A second WAC ID registered with delegate one's email (already linked to TEST-WAC-0001).
  rows.push({ wacId: "TEST-WAC-0006", name: "Fake Dup", email: "fake.delegate.one@ayurdisha-sample.test" });
  const imp = await s("wacDelegatesImport", { rows, batchId: "test-batch-3" });
  assert.equal(imp.status, 200);
  assert.equal(imp.body.total, 6);
  const d = db();
  assert.equal(d["aym:wacdel:TESTWAC0003"].linked, true, "re-import keeps the link flag");
  assert.equal(d["aym:wacdel:TESTWAC0003"].email, "new.owner@ayurdisha-sample.test");

  const takeover = await client()("wacStart", { wacId: "TEST-WAC-0003", email: "new.owner@ayurdisha-sample.test" });
  assert.equal(takeover.status, 409);
  assert.equal(takeover.body.error, WAC_ALREADY_LINKED);
  const second = await client()("wacStart", { wacId: "TEST-WAC-0006", email: "fake.delegate.one@ayurdisha-sample.test" });
  assert.equal(second.status, 409, "account already linked to another WAC ID");
  assert.equal(otpLog.size, 0, "no code for a blocked link");

  const stats = await s("wacDelegatesStats");
  assert.ok(stats.body.alerts.length >= 2);
  assert.ok(stats.body.alerts.every(a => a.maskedEmail.includes("•••") && !a.maskedEmail.includes("new.owner")), "alerts store masked emails");
  assert.deepEqual(new Set(stats.body.alerts.map(a => a.kind)), new Set(["wac-id-linked-elsewhere", "account-has-other-wac-id"]));
  assert.equal(stats.body.linked, 4);
});

test("rate limits: per WAC ID (6 / 15 min), per network, 60 s resend cooldown, 5 wrong codes", async () => {
  for (let i = 0; i < 6; i++) {
    const r = await client()("wacStart", { wacId: "TEST-WAC-0005", email: `guess${i}@ayurdisha-sample.test` });
    assert.equal(r.status, 400, `attempt ${i + 1}`);
  }
  const blocked = await client()("wacStart", { wacId: "TEST-WAC-0005", email: "fake.delegate.five@ayurdisha-sample.test" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, "wac_rate");
  const d = db();
  assert.ok(!Object.keys(d).some(k => k.startsWith("aym:wacrate:") && k.includes("TESTWAC")), "rate docs keyed by a hash, not the ID");

  const ip = "203.0.113.77";
  for (let i = 0; i < 600; i++) wacIpLimiter.hit(ip);
  const net = await client(ip)("wacStart", { wacId: "TEST-WAC-0001", email: "fake.delegate.one@ayurdisha-sample.test" });
  assert.equal(net.status, 429);
  assert.equal(net.body.code, "network_busy");

  const call = client();
  const start = await call("wacStart", { wacId: "TEST-WAC-0001", email: "fake.delegate.one@ayurdisha-sample.test" });
  assert.equal(start.status, 200);
  const again = await call("wacStart", { wacId: "TEST-WAC-0001", email: "fake.delegate.one@ayurdisha-sample.test" });
  assert.equal(again.status, 429, "resend cooldown");
  assert.match(again.body.error, /wait \d+s/);
  const c2 = client();
  assert.equal((await c2("wacStart", { wacId: "TEST-WAC-0002", email: "fake.delegate.two@ayurdisha-sample.test" })).status, 200);
  const right = otpLog.get("fake.delegate.two@ayurdisha-sample.test");
  const wrong = right === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await c2("wacVerify", { wacId: "TEST-WAC-0002", otp: wrong })).status, 403);
  assert.equal((await c2("wacVerify", { wacId: "TEST-WAC-0002", otp: right })).status, 429, "locked after 5 wrong codes");
  otpLog.clear();
});

test("a normal registration code (or another WAC ID's code) cannot finish a WAC sign-in", async () => {
  const call = client();
  const email = "plain.person@ayurdisha-sample.test";
  assert.equal((await call("regStart", { name: "Plain Person", age: 22, sex: "Male", institute: "Plain College", email })).status, 200);
  const otp = otpLog.get(email);
  const r = await call("wacVerify", { wacId: "TEST-WAC-0005", otp });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /No pending sign-in/);
  otpLog.clear();
});

test("Ask Desk + Track work for a WAC account (ticket, own-email lookup, WAC ID on the question)", async () => {
  const { call, verify } = await wacSignIn("TEST-WAC-0001", "fake.delegate.one@ayurdisha-sample.test");
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  const token = verify.body.token;
  const rec = {
    id: "WACASK0001", ticket: "AYM-Q-WACASK01", createdAt: Date.now(), name: "Fake Delegate One",
    email: "fake.delegate.one@ayurdisha-sample.test", institution: "Sample Ayurveda College (FAKE)", stage: "Intern",
    state: "Odisha", registered: "Yes", inPerson: "Yes", days: [], regNo: verify.body.profile.regNo,
    theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
    question: "How should I prepare for AIAPGET while finishing internship?", consentPublish: "Yes",
  };
  const sent = await call("set", { key: `aym:q:${rec.id}`, val: rec, token });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.profile.passLabel, "TEST-WAC-0001", "WAC fields survive the Ask upsert");
  assert.equal(db()["aym:q:WACASK0001"].regNo, "TEST-WAC-0001", "question carries the WAC ID");
  const byTicket = await client()("lookup", { query: rec.ticket.toLowerCase() });
  assert.equal(byTicket.body.hits.length, 1);
  const byEmail = await call("lookup", { query: rec.email });
  assert.equal(byEmail.body.hits.length, 1, "Track by own email");
  const me = await call("regMe", { token });
  assert.equal(me.body.profile.wacId, "TEST-WAC-0001");
  const s = await staffClient();
  const page = await s("staffDelegatesPage", { limit: 50 });
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.ok((page.body.items || []).some(u => u.regNo === "TEST-WAC-0001" && u.wacId === "TEST-WAC-0001"), "staff delegate list");
});

test("clear unlinked: typed confirmation required; linked delegates stay", async () => {
  const s = await staffClient();
  assert.equal((await s("wacDelegatesClear", { confirm: "yes" })).status, 400);
  const r = await s("wacDelegatesClear", { confirm: WAC_CLEAR_PHRASE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.removed, 2, "TEST-WAC-0005 and TEST-WAC-0006 were never used");
  assert.equal(r.body.total, 4);
  const d = db();
  assert.ok(d["aym:wacdel:TESTWAC0001"] && !d["aym:wacdel:TESTWAC0005"]);
  assert.ok(!(d["aym:wacdel-email:fake.delegate.five@ayurdisha-sample.test"]), "email index entry removed");
  assert.deepEqual(d["aym:wacdel-email:fake.delegate.one@ayurdisha-sample.test"].keys, ["TESTWAC0001"], "kept index entry pruned");
});

/* ---------------------------------------------------------------- API adapter */

test("API adapter (mocked fetch): contract, Bearer key, not-found / unavailable handling", async () => {
  const calls = [];
  const fake = respond => async (url, init) => { calls.push({ url, init }); return respond(JSON.parse(init.body)); };
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  const a = apiAdapter({
    url: "https://wac.example/verify", key: "k-test",
    fetchImpl: fake(b => ok(b.wacId === "API-0001" && b.email === "api.one@ayurdisha-sample.test"
      ? { valid: true, name: "Api One", email: "Api.One@ayurdisha-sample.test", phone: "+91 90000 00011", institution: "Api College", category: "Student", country: "India", state: "Goa", attendance: "Online" }
      : { valid: false })),
  });
  assert.equal(await a.available(), true);
  const hit = await a.lookup(" api-0001 ", "API.ONE@ayurdisha-sample.test");
  assert.equal(hit.ok, true);
  assert.equal(hit.record.wacId, "API-0001");
  assert.equal(hit.record.emailLower, "api.one@ayurdisha-sample.test");
  assert.equal(hit.record.attendance, "online");
  assert.equal(calls[0].init.headers.Authorization, "Bearer k-test");
  assert.deepEqual(JSON.parse(calls[0].init.body), { wacId: "API-0001", email: "api.one@ayurdisha-sample.test" });
  assert.deepEqual(await a.lookup("API-0002", "x@y.test"), { ok: false, reason: "not_found" });
  const f404 = apiAdapter({ url: "u", key: "k", fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.equal((await f404.lookup("A-001", "x@y.test")).reason, "not_found");
  const f500 = apiAdapter({ url: "u", key: "k", fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  assert.equal((await f500.lookup("A-001", "x@y.test")).reason, "unavailable");
  const fThrow = apiAdapter({ url: "u", key: "k", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal((await fThrow.lookup("A-001", "x@y.test")).reason, "unavailable");
  const off = apiAdapter({});
  assert.equal(await off.available(), false, "disabled unless URL + key are set");
  assert.equal((await off.lookup("A-001", "x@y.test")).reason, "unavailable");

  setWacAdapterForTests(() => a);
  try {
    const { verify } = await wacSignIn("API-0001", "api.one@ayurdisha-sample.test");
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.equal(verify.body.profile.regNo, "API-0001");
    assert.equal(verify.body.record.state, "Goa");
    const miss = await client()("wacStart", { wacId: "API-0002", email: "api.two@ayurdisha-sample.test" });
    assert.equal(miss.body.error, WAC_NO_MATCH);
    setWacAdapterForTests(() => fThrow);
    const down = await client()("wacStart", { wacId: "API-0003", email: "api.three@ayurdisha-sample.test" });
    assert.equal(down.status, 503);
    assert.equal(down.body.code, "wac_unavailable");
  } finally {
    setWacAdapterForTests(null);
  }
});

/* ---------------------------------------------------------------- Firestore repository */

function fakeFirestore() {
  const docs = new Map();
  const commits = [];
  const ref = id => ({
    id,
    async get() { return { exists: docs.has(id), data: () => docs.get(id) }; },
    async set(v, opt) { docs.set(id, opt && opt.merge ? { ...(docs.get(id) || {}), ...v } : v); },
  });
  const query = (filters, limit = Infinity) => ({
    where(f, op, v) { return query([...filters, [f, v]], limit); },
    limit(n) { return query(filters, n); },
    async get() {
      const list = [...docs.entries()].filter(([, d]) => filters.every(([f, v]) => d[f] === v)).slice(0, limit)
        .map(([id, d]) => ({ id, ref: ref(id), data: () => d }));
      return { empty: !list.length, docs: list };
    },
    count() { return { get: async () => ({ data: () => ({ count: [...docs.values()].filter(d => filters.every(([f, v]) => d[f] === v)).length }) }) }; },
  });
  return {
    docs, commits,
    collection(name) { assert.equal(name, "wac_delegates"); return { doc: ref, ...query([]) }; },
    async getAll(...refs) { return refs.map(r => ({ exists: docs.has(r.id) })); },
    batch() {
      const ops = [];
      return {
        set(r, v, opt) { ops.push(() => r.set(v, opt)); },
        delete(r) { ops.push(() => docs.delete(r.id)); },
        async commit() { assert.ok(ops.length <= 500, `batch of ${ops.length}`); commits.push(ops.length); for (const op of ops) await op(); },
      };
    },
  };
}

test("Firestore repository: batches ≤ 500, upsert keeps links, email index, clear unlinked only", async () => {
  const fdb = fakeFirestore();
  const repo = firestoreRepo(fdb);
  const rows = Array.from({ length: 1203 }, (_, i) => ({
    wacId: `FS-${String(i).padStart(5, "0")}`, name: `N${i}`, email: `n${i}@ayurdisha-sample.test`, emailLower: `n${i}@ayurdisha-sample.test`,
  }));
  const first = await repo.upsertMany(rows, { importedAt: 1, batchId: "b1" });
  assert.deepEqual(first, { created: 1203, updated: 0 });
  assert.deepEqual(fdb.commits, [500, 500, 203]);
  await repo.markLinked(wacIdKey("FS-00007"), "user-7");
  const second = await repo.upsertMany(rows.slice(0, 10).map(r => ({ ...r, name: "Renamed" })), { importedAt: 2, batchId: "b2" });
  assert.deepEqual(second, { created: 0, updated: 10 });
  const linked = await repo.get(wacIdKey("FS-00007"));
  assert.equal(linked.linked, true, "re-import keeps the link");
  assert.equal(linked.linkedUserId, "user-7");
  assert.equal(linked.name, "Renamed");
  assert.equal((await repo.findByEmail("N7@ayurdisha-sample.test")).length, 1);
  assert.deepEqual(await repo.stats(), { total: 1203, linked: 1 });
  const { removed } = await repo.clearUnlinked();
  assert.equal(removed, 1202);
  assert.deepEqual(await repo.stats(), { total: 1, linked: 1 });

  const store = { name: "memory", wacRepo: repo, async get() { return { total: 1 }; } };
  const a = listAdapter(store);
  assert.equal(await a.available(), true);
  assert.equal((await a.lookup("fs 00007", "n7@ayurdisha-sample.test")).ok, true);
  assert.equal((await a.lookup("FS-00007", "n8@ayurdisha-sample.test")).reason, "email_mismatch");
});
