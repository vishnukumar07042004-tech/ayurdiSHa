/**
 * WAC Delegate ID auto-link by verified email + the one display rule (`displayPassId`).
 * Auto-link on email verify and on regMe, no match, several IDs for one email (pending → the
 * signed-in "Link your Delegate ID" flow), a record already linked elsewhere (staff alert), the
 * Delegate ID on submitted questions, Track unaffected, and the staff backfill (dry run / apply,
 * paged, idempotent). Real HTTP handler on an isolated file store; every record is fake.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-wac-autolink-${process.pid}.json`);
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
const { displayPassId, WAC_DELEGATE_ID_LABEL, PASS_NUMBER_LABEL } = await import("../shared/passId.js");
const { mentorBriefRows } = await import("../shared/mentorWorkbook.js");
const { importDelegates } = await import("../server/wacDelegates.js");
const { wacAutoLinkAll, planAutoLink, resetAutoLinkCache } = await import("../server/wacAutoLink.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

const DOMAIN = "ayurdisha-autolink.test";
const mail = local => `${local}@${DOMAIN}`;

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
  console.warn = realWarn;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

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
const alerts = () => Object.entries(db()).filter(([k]) => k.startsWith("aym:wacalert:")).map(([, v]) => v);

let staff;
async function staffClient() {
  if (staff) return staff;
  staff = client("192.0.2.20", serviceHeaders());
  assert.equal((await staff("whoami")).body.staff, true);
  return staff;
}

const row = (wacId, local, extra = {}) => ({
  wacId, name: `Fake ${wacId}`, email: mail(local), phone: "+91 90000 00000", institution: `Fake College ${wacId}`,
  category: "Student", country: "India", state: "Odisha", ...extra,
});
let rows = [
  row("ZZQ10001", "auto.one"),
  row("ZZQ10002", "twin"),
  row("ZZQ10003", "twin"),
  row("ZZQ10004", "taken"),
];
async function importRows(batchId) {
  const s = await staffClient();
  const r = await s("wacDelegatesImport", { rows, batchId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

/** Email registration end to end; returns { call, body }. */
async function register(email, { name = "Typed Name", institute = "Typed Institute", call = client() } = {}) {
  const start = await call("regStart", { name, age: 24, sex: "Female", institute, email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const otp = otpLog.get(email.toLowerCase());
  otpLog.delete(email.toLowerCase());
  const v = await call("regVerify", { email, otp });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { call, body: v.body };
}

async function ask(call, token, id, profile, over = {}) {
  const rec = {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: profile.name, email: profile.email,
    institution: profile.institute, stage: "Intern", state: "Odisha", registered: "Yes", inPerson: "Yes", days: [],
    regNo: profile.regNo, theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
    question: "How should I prepare for AIAPGET while finishing internship?", consentPublish: "Yes", ...over,
  };
  const r = await call("set", { key: `aym:q:${id}`, val: rec, token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}

/* ---------------------------------------------------------------- display rule */

test("displayPassId: WAC Delegate ID when linked, else the AYURDISHA pass number", () => {
  assert.deepEqual(displayPassId({ wacId: "ZZQ10001", regNo: "11WAC/2026/0001" }), {
    id: "ZZQ10001", label: WAC_DELEGATE_ID_LABEL, kind: "wac", text: "WAC Delegate ID: ZZQ10001",
  });
  const pass = displayPassId({ regNo: "11WAC/2026/0001" });
  assert.equal(pass.kind, "pass");
  assert.equal(pass.label, "AYURDISHA pass number");
  assert.equal(pass.text, "AYURDISHA pass number: 11WAC/2026/0001");
  assert.equal(displayPassId({ delegateNo: "11WAC/2026/0002" }).id, "11WAC/2026/0002", "legacy question field");
  assert.equal(displayPassId({ regNo: "zzqa10001" }).kind, "wac", "a WAC sign-in pass (regNo = Delegate ID)");
  assert.equal(displayPassId(null).id, "");
  assert.equal(displayPassId({}).kind, "");
  assert.equal(PASS_NUMBER_LABEL, "AYURDISHA pass number");
});

test("UI, exports and email all go through displayPassId (no 'WAC registration number' label)", () => {
  const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const app = read("src/App.jsx");
  assert.match(app, /label=\{linkedToWac \? WAC_DELEGATE_ID_LABEL : PASS_NUMBER_LABEL\}/, "Ask Desk field label");
  assert.match(app, /"Filled from your WAC delegate record"/, "Ask Desk note when linked");
  assert.match(app, /<WacLinkPrompt /, "unlinked: 'Link your Delegate ID'");
  assert.match(app, /function DelegatePass[\s\S]{0,120}displayPassId\(profile\)/, "pass card");
  assert.match(app, /function RegSuccess[\s\S]{0,120}displayPassId\(profile\)/, "registration success");
  assert.match(app, /function exportDelegatesPdf[\s\S]{0,300}displayPassId\(u\)/, "PDF delegates export");
  assert.match(read("src/components/WacSignIn.jsx"), /Registered for WAC\? Link your Delegate ID/);
  assert.match(read("server/mailer.js"), /displayPassId\(row\)/, "selection email");
  for (const f of ["src/App.jsx", "src/components/WacSignIn.jsx", "server/mailer.js"]) {
    assert.ok(!/WAC registration number/.test(read(f)), `${f} no longer says "WAC registration number"`);
  }
  const brief = mentorBriefRows(
    [{ id: "C1", theme: "T", subtheme: "S", memberIds: ["a", "b"], representative: "q" }],
    [{ id: "a", ticket: "T-A", regNo: "11WAC/2026/0007", wacId: "ZZQ10001" }, { id: "b", ticket: "T-B", regNo: "11WAC/2026/0008" }],
  );
  const col = brief[0].indexOf("Pass_ID");
  assert.ok(col > 0, "mentor pack column");
  assert.equal(brief[1][col], "ZZQ10001");
  assert.equal(brief[2][col], "11WAC/2026/0008");
});

test("planAutoLink: exact lower-case email, one record links, several → pending, linked elsewhere → conflict", () => {
  const u = { id: "u1", email: "A.B@x.test" };
  const r = (wacId, email, extra = {}) => ({ wacId, emailLower: email, ...extra });
  assert.equal(planAutoLink(u, []).action, "none");
  assert.equal(planAutoLink(u, [r("ZZQ1", "other@x.test")]).action, "none", "no fuzzy match");
  assert.equal(planAutoLink(u, [r("ZZQ1", "a.b@x.test")]).action, "link");
  assert.equal(planAutoLink(u, [r("ZZQ1", "a.b@x.test", { linked: true, linkedUserId: "u1" })]).action, "link", "own link is idempotent");
  assert.equal(planAutoLink(u, [r("ZZQ1", "a.b@x.test"), r("ZZQ2", "a.b@x.test")]).action, "pending");
  assert.equal(planAutoLink(u, [r("ZZQ1", "a.b@x.test", { linked: true, linkedUserId: "u2" })]).action, "conflict");
  assert.equal(planAutoLink({ ...u, wacId: "ZZQ9" }, [r("ZZQ1", "a.b@x.test")]).action, "already");
});

/* ---------------------------------------------------------------- request paths */

test("no list yet: registration is unchanged (pass number, no link)", async () => {
  const { body } = await register(mail("early"));
  assert.match(body.profile.regNo, /^11WAC\/2026\/\d{4}$/);
  assert.equal(body.profile.wacId, undefined);
  assert.equal(displayPassId(body.profile).label, PASS_NUMBER_LABEL);
});

test("auto-link on verify: verified email matches one record → WAC Delegate ID; pass number kept", async () => {
  await importRows("al-1");
  logged.length = 0;
  const { body } = await register("Auto.One@AYURDISHA-autolink.test", { name: "My Own Name" });
  const p = body.profile;
  assert.equal(p.wacId, "ZZQ10001");
  assert.equal(p.wacVerified, true);
  assert.match(p.regNo, /^11WAC\/2026\/\d{4}$/, "internal regNo unchanged (tickets keep working)");
  assert.equal(displayPassId(p).text, "WAC Delegate ID: ZZQ10001");
  const u = userByEmail(mail("auto.one"));
  assert.equal(u.name, "My Own Name", "a typed name is never overwritten");
  assert.equal(u.institute, "Typed Institute", "a typed institute is never overwritten");
  assert.equal(u.wacVerifiedBy, "email-otp");
  assert.ok(u.wacLinkedAt > 0);
  assert.deepEqual(u.wac, { category: "student", country: "India", state: "Odisha", attendance: "", institution: "Fake College ZZQ10001" });
  const d = db();
  assert.equal(d["aym:waclink:ZZQ10001"].userId, u.id, "single-link record");
  assert.equal(d["aym:wacdel:ZZQ10001"].linked, true);
  assert.equal(d["aym:wacdel:ZZQ10001"].linkedUserId, u.id);
  assert.ok(!/ZZQ10001|auto\.one|My Own Name/i.test(logged.join("\n")), "logs carry no IDs, emails or names");

  const again = await register(mail("auto.one"));
  assert.equal(again.body.profile.wacId, "ZZQ10001", "verify again: idempotent");
  assert.equal(again.body.profile.regNo, p.regNo);
});

test("no match: nothing changes; label is AYURDISHA pass number", async () => {
  const before = alerts().length;
  const { call, body } = await register(mail("nomatch"));
  assert.equal(body.profile.wacId, undefined);
  assert.equal(body.profile.wacLinkPending, undefined);
  assert.equal(displayPassId(body.profile).kind, "pass");
  const me = await call("regMe", { token: body.token });
  assert.equal(me.body.profile.wacId, undefined);
  assert.equal(alerts().length, before, "no staff alert");
  assert.equal(userByEmail(mail("nomatch")).wacId, undefined);
});

test("ambiguous email (two Delegate IDs) → pending + staff alert; the delegate links the right one", async () => {
  const { call, body } = await register(mail("twin"));
  assert.equal(body.profile.wacId, undefined, "never auto-picks");
  assert.equal(body.profile.wacLinkPending, true);
  assert.ok(alerts().some(a => a.kind === "email-matches-several-wac-ids" && !a.wacId && a.maskedEmail.includes("•••")));
  const n = alerts().length;
  await call("regMe", { token: body.token });
  assert.equal(alerts().length, n, "one alert per account, not one per page load");

  assert.equal((await client()("wacStart", { wacId: "ZZQ10003", email: mail("twin"), link: true })).status, 403, "link mode needs a session");
  const start = await call("wacStart", { wacId: "ZZQ10003", email: mail("twin"), link: true, token: body.token });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const otp = otpLog.get(mail("twin"));
  otpLog.delete(mail("twin"));
  const v = await call("wacVerify", { wacId: "ZZQ10003", otp, token: body.token });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(v.body.profile.wacId, "ZZQ10003");
  assert.equal(v.body.profile.wacLinkPending, undefined, "pending cleared");
  assert.equal(v.body.needsConfirm, false);
  assert.equal(v.body.profile.regNo, body.profile.regNo, "same account, same pass number");
  const u = userByEmail(mail("twin"));
  assert.equal(u.wacVerifiedBy, "wac-code");
  assert.equal(db()["aym:wacdel:ZZQ10002"].linked, false, "the other ID stays free");
});

test("record already linked to another account → no link, staff alert", async () => {
  // A WAC sign-in links ZZQ10004 to the account for taken@; WAC later moves the record to moved@.
  const call = client();
  assert.equal((await call("wacStart", { wacId: "ZZQ10004", email: mail("taken") })).status, 200);
  const otp = otpLog.get(mail("taken"));
  otpLog.delete(mail("taken"));
  const v = await call("wacVerify", { wacId: "ZZQ10004", otp });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  rows = rows.map(r => (r.wacId === "ZZQ10004" ? { ...r, email: mail("moved") } : r));
  await importRows("al-2");

  const before = alerts().length;
  const { body } = await register(mail("moved"));
  assert.equal(body.profile.wacId, undefined, "never takes over a linked Delegate ID");
  const fresh = alerts().slice(before);
  assert.ok(fresh.some(a => a.kind === "wac-id-linked-elsewhere" && a.wacId === "ZZQ10004"), "staff alerted");
  assert.equal(db()["aym:waclink:ZZQ10004"].userId, userByEmail(mail("taken")).id, "link unchanged");
});

test("regMe links an existing session once the list has the email; earlier questions get the ID", async () => {
  const { call, body } = await register(mail("late"));
  assert.equal(body.profile.wacId, undefined);
  await ask(call, body.token, "ALLATE01", body.profile);
  assert.equal(db()["aym:q:ALLATE01"].wacId, undefined);

  rows = [...rows, row("ZZQ10005", "late")];
  await importRows("al-3");
  const me = await call("regMe", { token: body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.profile.wacId, "ZZQ10005");
  assert.equal(me.body.profile.regNo, body.profile.regNo);
  assert.equal(db()["aym:q:ALLATE01"].wacId, "ZZQ10005", "existing question stamped");
  assert.equal(db()["aym:q:ALLATE01"].regNo, body.profile.regNo, "ticket fields untouched");
});

test("submit: linked account stores wacId on the question; a typed wacId is ignored; Track unaffected", async () => {
  const { call, body } = await register(mail("auto.one"));
  const sent = await ask(call, body.token, "ALASK001", body.profile);
  assert.equal(sent.body.profile.wacId, "ZZQ10001", "profile keeps the link through the Ask upsert");
  const q = db()["aym:q:ALASK001"];
  assert.equal(q.wacId, "ZZQ10001");
  assert.equal(q.regNo, body.profile.regNo);
  assert.equal(q.delegateNo, body.profile.regNo);
  assert.equal(displayPassId(q).text, "WAC Delegate ID: ZZQ10001", "staff see the Delegate ID");

  const plain = await register(mail("nomatch"));
  await ask(plain.call, plain.body.token, "ALASK002", plain.body.profile, { wacId: "ZZQ10002" });
  assert.equal(db()["aym:q:ALASK002"].wacId, undefined, "students cannot claim a Delegate ID");

  const byTicket = await client()("lookup", { query: "aym-q-alask001" });
  assert.equal(byTicket.body.hits.length, 1, "Track by ticket");
  const byEmail = await call("lookup", { query: mail("auto.one") });
  assert.ok(byEmail.body.hits.some(h => h.ticket === "AYM-Q-ALASK001"), "Track by own email");

  const s = await staffClient();
  const users = (await s("regUsers")).body.users;
  assert.ok(users.some(u => u.wacId === "ZZQ10001"), "staff delegate list carries the Delegate ID");
  const snap = await s("staffSnapshot");
  assert.ok(snap.body.users.some(u => u.wacId === "ZZQ10001"), "Insights delegate cards too");
});

test("wacAutoLinkAll over HTTP: staff only, counts only", async () => {
  assert.equal((await client()("wacAutoLinkAll", { dryRun: true })).status, 403);
  const s = await staffClient();
  const r = await s("wacAutoLinkAll", { dryRun: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dryRun, true);
  assert.equal(typeof r.body.counts.scanned, "number");
  assert.ok(!/@|ZZQ|Fake/.test(JSON.stringify(r.body)), "no PII or IDs in the response");
});

test("autolink-existing script: pages through wacAutoLinkAll on a local server; dry run, then apply", async () => {
  const { runAutoLink, summaryLines } = await import("../scripts/wac/autolink-existing.mjs");
  const { makeClient } = await import("../scripts/wac/import-delegates.mjs");
  // An account that predates its delegate record and never refreshed its session.
  const d = db();
  d["aym:user:legacy01"] = { id: "legacy01", name: "Legacy One", email: mail("legacy"), emailLower: mail("legacy"), regNo: "11WAC/2026/0999", createdAt: 1 };
  d["aym:email:" + mail("legacy")] = { userId: "legacy01" };
  fs.writeFileSync(storeFile, JSON.stringify(d));
  rows = [...rows, row("ZZQ10006", "legacy")];
  await importRows("al-4");

  const call = makeClient(base);
  assert.equal((await call("whoami")).data.staff, true, "service token sent by the script client");
  const dry = await runAutoLink(call, { dryRun: true, limit: 2 });
  assert.equal(dry.ok, true);
  assert.ok(dry.pages > 1, "followed `next` across pages");
  assert.equal(dry.totals.linkable, 1);
  assert.equal(userByEmail(mail("legacy")).wacId, undefined, "dry run wrote nothing");
  const lines = summaryLines(dry.totals, { dryRun: true }).join("\n");
  assert.ok(!/@|ZZQ|Legacy/.test(lines), "counts only");

  const applied = await runAutoLink(call, { dryRun: false, limit: 2 });
  assert.equal(applied.totals.linked, 1);
  assert.equal(userByEmail(mail("legacy")).wacId, "ZZQ10006");
  const again = await runAutoLink(call, { dryRun: false, limit: 2 });
  assert.equal(again.totals.linked, 0, "re-run is a no-op");
  await call("logout");
});

/* ---------------------------------------------------------------- backfill */

function memStore() {
  const m = new Map();
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  return {
    name: "memory",
    async get(k) { return clone(m.has(k) ? m.get(k) : null); },
    async set(k, v) { m.set(k, clone(v)); },
    async del(k) { m.delete(k); },
    async list(p = "") { return [...m.keys()].filter(k => k.startsWith(p)); },
    async lookup(needle) {
      return [...m].filter(([k]) => k.startsWith("aym:q:")).map(([, v]) => clone(v))
        .filter(q => String(q.email || "").toLowerCase() === needle || String(q.ticket || "").toLowerCase() === needle);
    },
    dump: () => JSON.stringify([...m].sort()),
  };
}

test("backfill: dry run writes nothing; apply links / marks pending / stamps questions; repeat is a no-op", async () => {
  const st = memStore();
  const user = (id, local, extra = {}) => st.set(`aym:user:${id}`, { id, name: `Old ${id}`, email: mail(local), emailLower: mail(local), regNo: `11WAC/2026/0${id}`, createdAt: 1, ...extra });
  await user("101", "old.a");
  await user("102", "old.b");
  await user("103", "old.twin");
  await user("104", "old.none");
  await user("105", "old.linked", { wacId: "ZZQ20005" });
  await user("106", "old.taken");
  await user("107", "probe", { probe: true });
  await st.set("aym:q:BF1", { id: "BF1", ticket: "AYM-Q-BF1", email: mail("old.a"), question: "q", regNo: "11WAC/2026/0101" });
  await st.set("aym:q:BF2", { id: "BF2", ticket: "AYM-Q-BF2", email: mail("old.linked"), question: "q", regNo: "11WAC/2026/0105" });
  await importDelegates(st, {
    batchId: "bf", rows: [
      row("ZZQ20001", "old.a"), row("ZZQ20002", "old.b"), row("ZZQ20003", "old.twin"), row("ZZQ20004", "old.twin"),
      row("ZZQ20005", "old.linked"), row("ZZQ20006", "old.taken"),
    ],
  });
  await st.set("aym:waclink:ZZQ20006", { userId: "999", at: 1 });
  resetAutoLinkCache();

  const before = st.dump();
  const dry = await wacAutoLinkAll(st, { dryRun: true });
  assert.equal(st.dump(), before, "dry run writes nothing");
  assert.deepEqual(dry.counts, {
    scanned: 6, linkable: 2, linked: 0, ambiguous: 1, conflicts: 1, alreadyLinked: 1, noMatch: 1, skipped: 1, questionsUpdated: 2,
  });
  assert.equal(dry.next, null);

  // Apply in pages of 2 (the script follows `next`).
  const sum = {};
  let cursor = 0;
  for (let guard = 0; guard < 10 && cursor != null; guard++) {
    const page = await wacAutoLinkAll(st, { dryRun: false, cursor, limit: 2 });
    for (const [k, v] of Object.entries(page.counts)) sum[k] = (sum[k] || 0) + v;
    cursor = page.next;
  }
  assert.equal(sum.linked, 2);
  assert.equal(sum.ambiguous, 1);
  assert.equal(sum.conflicts, 1);
  assert.equal(sum.questionsUpdated, 2);
  assert.equal((await st.get("aym:user:101")).wacId, "ZZQ20001");
  assert.equal((await st.get("aym:user:101")).name, "Old 101", "names kept");
  assert.equal((await st.get("aym:user:102")).wacId, "ZZQ20002");
  assert.equal((await st.get("aym:user:103")).wacLinkPending, true);
  assert.equal((await st.get("aym:user:103")).wacId, undefined);
  assert.equal((await st.get("aym:user:106")).wacId, undefined, "conflict left alone");
  assert.equal((await st.get("aym:waclink:ZZQ20006")).userId, "999");
  assert.equal((await st.get("aym:q:BF1")).wacId, "ZZQ20001");
  assert.equal((await st.get("aym:q:BF2")).wacId, "ZZQ20005", "already-linked accounts' questions too");
  assert.equal((await st.get("aym:user:107")).wacId, undefined, "probe accounts skipped");
  const alertsAfter = (await st.list("aym:wacalert:")).length;
  assert.ok(alertsAfter >= 2, "pending + conflict alerted");

  const snapshot = st.dump();
  const again = await wacAutoLinkAll(st, { dryRun: false });
  assert.equal(again.counts.linked, 0, "idempotent");
  assert.equal(again.counts.questionsUpdated, 0);
  assert.equal(again.counts.alreadyLinked, 3);
  assert.equal((await st.list("aym:wacalert:")).length, alertsAfter, "no duplicate alerts on a repeat");
  assert.equal(JSON.stringify(JSON.parse(snapshot).filter(([k]) => k.startsWith("aym:waclink:"))),
    JSON.stringify(JSON.parse(st.dump()).filter(([k]) => k.startsWith("aym:waclink:"))), "links unchanged on repeat");
});
