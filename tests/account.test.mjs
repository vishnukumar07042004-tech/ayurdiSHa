/**
 * Delegate / staff account page: identity helpers, email/phone masking, accountGet 403,
 * WAC share allow/revoke, and age/sex never taken from the WAC list.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storeFile = path.join(os.tmpdir(), `aym-account-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock" });
delete process.env.WAC_VERIFY_MODE;
delete process.env.WAC_SIGNIN;
delete process.env.WAC_ID_PATTERN;

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
const realWarn = console.warn;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-/.test(line)) return;
  realLog(...args);
};
console.error = (...args) => { if (!/\[aym-/.test(args.join(" "))) realErr(...args); };
console.warn = (...args) => { if (!/\[aym-/.test(args.join(" "))) realWarn(...args); };

const { aymStoreHandler } = await import("../server/storePlugin.js");
const {
  accountKind, accountRoleLabel, accountDisplayName, accountInitials, firstName,
  maskPersonal, shareFieldDisplay, ADMIN_DISPLAY, staffIdentityName, accountOwnEmail, isStaffKind,
  isDroppedHallPass, shouldDropHallPass, hallPassProfile, displayAskerName, displayAskerEmail,
  presentAskerRecord, sessionAfterStaffSignIn,
} = await import("../shared/account.js");
const { mentorBriefRows } = await import("../shared/mentorWorkbook.js");
const { maskEmail, maskPhone, WAC_SHARE_FIELDS, WAC_SHARE_CONSENT_TEXT } = await import("../shared/wacId.js");
const { K_WACDEL } = await import("../server/wacDelegates.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

const root = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(root, "../src/App.jsx"), "utf8");
const headerSrc = fs.readFileSync(path.join(root, "../src/AppHeader.jsx"), "utf8");
const pageSrc = fs.readFileSync(path.join(root, "../src/pages/AccountPage.jsx"), "utf8");

const DOMAIN = "ayurdisha-account.test";
const mail = local => `${local}@${DOMAIN}`;
const FULL_PHONE = "+91 98765 43210";
const FULL_EMAIL = mail("ananya.rao");

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

let staff;
async function staffClient() {
  if (staff) return staff;
  staff = client("192.0.2.40", serviceHeaders());
  assert.equal((await staff("whoami")).body.staff, true);
  return staff;
}

async function register(email, { name = "Ananya Rao", age = 27, sex = "Female", institute = "Typed Institute", call = client() } = {}) {
  const start = await call("regStart", { name, age, sex, institute, email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const otp = otpLog.get(email.toLowerCase());
  otpLog.delete(email.toLowerCase());
  const v = await call("regVerify", { email, otp });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { call, body: v.body, token: v.body.token, profile: v.body.profile };
}

function wacRow(wacId, email, extra = {}) {
  return {
    wacId, name: "WAC List Name", email, phone: FULL_PHONE,
    institution: "WAC College of Ayurveda", category: "student", country: "India", state: "Odisha",
    age: 99, sex: "Male", address: "12 Dummy Lane", utr: "UTR-FAKE-9",
    ...extra,
  };
}

async function importRow(row, batchId) {
  const s = await staffClient();
  const r = await s("wacDelegatesImport", { rows: [row], batchId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.imported, 1, JSON.stringify(r.body));
  const d = db();
  const key = K_WACDEL + String(row.wacId).replace(/[-_/]+/g, "");
  assert.ok(d[key] && d[key].wacId, `missing ${key}`);
  d[key] = { ...d[key], age: 99, sex: "Male", phone: FULL_PHONE };
  fs.writeFileSync(storeFile, JSON.stringify(d, null, 2));
  return r.body;
}

/* ---------------------------------------------------------------- identity + mask */

test("accountKind / role labels: guest, delegate, co-admin, admin (staff wins)", () => {
  assert.equal(accountKind({}), "visitor");
  assert.equal(accountRoleLabel("visitor"), "Guest");
  assert.equal(accountKind({ profile: { email: FULL_EMAIL, name: "Ananya Rao" } }), "delegate");
  assert.equal(accountRoleLabel("delegate"), "Delegate");
  assert.equal(accountKind({ staffMe: { staff: true, role: "co-admin" }, profile: { email: FULL_EMAIL } }), "co-admin");
  assert.equal(accountRoleLabel("co-admin"), "Co-admin");
  assert.equal(accountKind({ staffMe: { staff: true, role: "admin" } }), "admin");
  assert.equal(accountRoleLabel("admin"), "Admin");
  assert.equal(accountKind({ staffMe: { staff: false, role: "admin", status: "pending" } }), "visitor");
});

test("accountDisplayName never returns a full email; initials from the name", () => {
  assert.equal(accountDisplayName({ profile: { name: "Ananya Rao" }, kind: "delegate" }), "Ananya Rao");
  assert.equal(firstName("Ananya Rao"), "Ananya");
  const fromEmail = accountDisplayName({ staffMe: { email: "owner@staff-qa.test" }, kind: "admin" });
  assert.equal(fromEmail, "owner");
  assert.ok(!fromEmail.includes("@"));
  assert.equal(accountInitials("Ananya Rao", FULL_EMAIL), "AR");
  assert.equal(accountDisplayName({ kind: "visitor" }), "Profile");
});

const OWNER_EMAIL = "vishnukumar07042004@gmail.com";
const HARSH_PROFILE = { name: "Harsh", email: "harsh@wac.test", wacId: "ZZQ1" };

test("admin + leftover delegate profile Harsh → chip/hero is Vishnu Kumar, not Harsh", async () => {
  const staffMe = { staff: true, role: "admin", email: OWNER_EMAIL };
  const kind = accountKind({ staffMe, profile: HARSH_PROFILE });
  assert.equal(kind, "admin");
  assert.equal(isStaffKind(kind), true);
  assert.equal(accountRoleLabel(kind), "Admin");
  assert.equal(ADMIN_DISPLAY[OWNER_EMAIL], "Vishnu Kumar");
  assert.equal(staffIdentityName(staffMe), "Vishnu Kumar");
  assert.equal(staffIdentityName({ ...staffMe, displayName: "Harsh" }), "Vishnu Kumar", "stored Harsh displayName cannot override the admin map");
  assert.equal(accountDisplayName({ profile: HARSH_PROFILE, staffMe, kind }), "Vishnu Kumar");
  assert.equal(firstName(accountDisplayName({ profile: HARSH_PROFILE, staffMe, kind })), "Vishnu");
  assert.equal(accountInitials("Vishnu Kumar", OWNER_EMAIL), "VK");
  assert.equal(accountOwnEmail({ staffMe, kind }), OWNER_EMAIL);
  assert.ok(!accountDisplayName({ profile: HARSH_PROFILE, staffMe, kind }).includes("Harsh"));
  assert.equal(isDroppedHallPass(HARSH_PROFILE), true);
  assert.equal(isDroppedHallPass({ name: "Harsha", email: "harsha@wac.test" }), false);
  assert.equal(shouldDropHallPass(staffMe, HARSH_PROFILE), true);
  assert.equal(shouldDropHallPass(null, HARSH_PROFILE), true);
  assert.equal(hallPassProfile(staffMe, HARSH_PROFILE), null);
  assert.equal(hallPassProfile(null, HARSH_PROFILE), null);
  assert.equal(accountKind({ profile: HARSH_PROFILE }), "visitor");
  assert.equal(accountDisplayName({ profile: HARSH_PROFILE }), "Profile");
  assert.equal(displayAskerName({ name: "Harsh", email: OWNER_EMAIL }), "Vishnu Kumar");
  assert.equal(displayAskerName({ name: "Harsh", email: "harsh@wac.test" }), "Vishnu Kumar");
  assert.equal(displayAskerName({ name: "Harsh", email: "other@wac.test" }), "Vishnu Kumar");
  assert.equal(displayAskerEmail({ name: "Harsh", email: "harsh@wac.test" }), OWNER_EMAIL);
  assert.equal(displayAskerEmail({ name: "Harsh", email: "other@wac.test" }), OWNER_EMAIL);
  assert.equal(isDroppedHallPass({ name: "Harsh Gupta", email: "other@wac.test", wacId: "ZZQ9" }), false);
  assert.equal(displayAskerName({ name: "Harsh Gupta", email: "other@wac.test" }), "Harsh Gupta");
  assert.equal(displayAskerEmail({ name: "Harsh Gupta", email: "other@wac.test" }), "other@wac.test");
  assert.equal(displayAskerName({ name: "Harsha", email: "harsha@wac.test" }), "Harsha");
  const rewritten = presentAskerRecord(HARSH_PROFILE);
  assert.equal(rewritten.name, "Vishnu Kumar");
  assert.equal(rewritten.email, OWNER_EMAIL);
  assert.equal(presentAskerRecord({ name: "Harsh Gupta", email: "other@wac.test", wacId: "ZZQ9" }).name, "Harsh Gupta");
  assert.equal(shouldDropHallPass({ staff: true, role: "co-admin", email: "co@staff-qa.test" }, HARSH_PROFILE), true);
  const { isDemoDelegate } = await import("../server/register.js");
  assert.equal(isDemoDelegate(HARSH_PROFILE), true, "operator Harsh is demo even with a leftover wacId");
  assert.equal(isDemoDelegate({ name: "Harsh Gupta", email: "other@wac.test", wacId: "ZZQ9" }), false);
  assert.equal(isDemoDelegate({ name: "Harsha", email: "harsha@wac.test" }), false);
});

test("staff sign-in as this admin clears a leftover Harsh delegate session", () => {
  const staffMe = { staff: true, role: "admin", email: OWNER_EMAIL };
  const harsh = { token: "t", profile: HARSH_PROFILE };
  assert.equal(sessionAfterStaffSignIn(staffMe, harsh), null);
  const kept = { token: "t", profile: { name: "Ananya Rao", email: "ananya@wac.test" } };
  assert.equal(sessionAfterStaffSignIn(staffMe, kept), kept);
  assert.equal(sessionAfterStaffSignIn({ staff: true, role: "co-admin", email: "co@staff-qa.test" }, harsh), null);
  assert.equal(sessionAfterStaffSignIn(null, harsh), null);
  assert.equal(sessionAfterStaffSignIn(staffMe, null), null);
  const brief = mentorBriefRows(
    [{ id: "C1", theme: "T", subtheme: "S", memberIds: ["a", "b"], representative: "q" }],
    [
      { id: "a", ticket: "T-A", name: "Harsh", email: "harsh@wac.test", question: "How do I start a clinic?" },
      { id: "b", ticket: "T-B", name: "Harsh Gupta", email: "other@wac.test", question: "How do I choose a PG branch?" },
    ],
  );
  const nameCol = brief[0].indexOf("Name");
  const emailCol = brief[0].indexOf("Email");
  assert.equal(brief[1][nameCol], "Vishnu Kumar");
  assert.equal(brief[1][emailCol], OWNER_EMAIL);
  assert.equal(brief[2][nameCol], "Harsh Gupta");
  assert.equal(brief[2][emailCol], "other@wac.test");
  assert.match(appSrc, /sessionAfterStaffSignIn/);
  assert.match(appSrc, /clearDroppedHallPass\(me\)/);
  assert.match(appSrc, /async function onStaffSignedIn\(me\) \{[\s\S]*?clearDroppedHallPass\(me\)/);
  assert.match(appSrc, /shownPeople\(desk\.questions\)/);
  assert.match(appSrc, /presentAskerRecord/);
  assert.match(appSrc, /email: displayAskerEmail\(s\)/);
  assert.doesNotMatch(appSrc, /email: s\.email/);
  assert.match(appSrc, /displayAskerEmail\(u\)/);
});

test("co-admin uses stored displayName or email local-part, never a leftover delegate name", () => {
  const leftover = { name: "Harsh", email: "harsh@wac.test" };
  const co = { staff: true, role: "co-admin", email: "co@staff-qa.test" };
  assert.equal(accountKind({ staffMe: co, profile: leftover }), "co-admin");
  assert.equal(accountDisplayName({ profile: leftover, staffMe: co }), "co");
  assert.equal(accountDisplayName({
    profile: leftover,
    staffMe: { ...co, displayName: "Priya Sharma" },
  }), "Priya Sharma");
  assert.equal(accountOwnEmail({ staffMe: co }), "co@staff-qa.test");
  assert.equal(accountOwnEmail({ profile: leftover, staffMe: { staff: false, email: OWNER_EMAIL } }), "");
});

test("maskEmail / maskPhone / shareFieldDisplay hide the full values", () => {
  assert.equal(maskEmail("Ananya.Rao@gmail.com"), "an•••@g•••.com");
  assert.equal(maskPhone(FULL_PHONE), "•••• 3210");
  assert.equal(maskPersonal("email", FULL_EMAIL), maskEmail(FULL_EMAIL));
  assert.equal(maskPersonal("phone", FULL_PHONE), "•••• 3210");
  assert.equal(shareFieldDisplay("email", FULL_EMAIL), maskEmail(FULL_EMAIL));
  assert.equal(shareFieldDisplay("phone", FULL_PHONE), "•••• 3210");
  assert.equal(shareFieldDisplay("phone", "•••• 3210"), "•••• 3210");
  assert.equal(shareFieldDisplay("name", "WAC List Name"), "WAC List Name");
  assert.ok(!shareFieldDisplay("email", FULL_EMAIL).includes("ananya.rao"));
  assert.ok(!JSON.stringify(shareFieldDisplay("phone", FULL_PHONE)).includes("98765"));
});

test("WAC share field list has Delegate ID, name, email, org, category, country, state, mobile — not age or sex", () => {
  const keys = WAC_SHARE_FIELDS.map(([k]) => k);
  assert.deepEqual(keys, ["wacId", "name", "email", "institution", "category", "country", "state", "phone"]);
  assert.ok(!keys.includes("age") && !keys.includes("sex"));
  assert.match(WAC_SHARE_CONSENT_TEXT, /Age and sex are not on the WAC list/);
});

/* ---------------------------------------------------------------- App wiring (source) */

test("accountGet is a cache-safe read; accountWacShare is a desk write", () => {
  const plugin = fs.readFileSync(path.join(root, "../server/storePlugin.js"), "utf8");
  const block = plugin.match(/const NO_DESK_WRITE_OPS = new Set\(\[[\s\S]*?\]\)/)[0];
  assert.match(block, /"accountGet"/);
  assert.doesNotMatch(block, /accountWacShare/);
});

test("staffWhoami calls api(whoami) directly and is not gated on hasApi", () => {
  const who = appSrc.match(/async function staffWhoami\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(who, /api\("whoami"\)/);
  assert.doesNotMatch(who, /hasApi/);
  assert.match(appSrc, /onStaffClick=\{\(\) => \{ if \(staff\) goTab\("staff"\); else openAccess\(\); \}\}/);
});

test("App wires /account, #account, Profile props, session token, View my profile", () => {
  assert.match(appSrc, /<Route path="\/account"/);
  assert.match(appSrc, /hashTab === "account"/);
  assert.match(appSrc, /tab === "account" \? \(\s*<Navigate to="\/account" replace \/>/);
  assert.match(appSrc, /navigate\("\/account", \{ replace: true \}\)/);
  assert.match(appSrc, /profile=\{profile\}/);
  assert.match(appSrc, /staffMe=\{staffMe\}/);
  assert.match(appSrc, /sessionToken=\{delegateProfile \? \(\(loadLocalSession\(\) \|\| \{\}\)\.token \|\| ""\) : ""\}/);
  assert.match(appSrc, /apiFn=\{api\}/);
  assert.match(appSrc, /onViewProfile=\{\(\) => goTab\("account"\)\}/);
  assert.match(appSrc, /onAccountRoute, navigate\]/);
  assert.match(appSrc, /onWelcomeRoute \|\| onAccountRoute\) return/);
  assert.match(headerSrc, /ed-account-chip/);
  assert.match(headerSrc, /to="\/account"/);
  assert.doesNotMatch(headerSrc, /Meet a mentor/);
  assert.match(headerSrc, /label: "Meet Mentors"/);
  assert.match(headerSrc, />\s*Profile\s*</);
  assert.match(pageSrc, /maskPersonal\("email"/);
  assert.match(pageSrc, /accountOwnEmail/);
  assert.match(pageSrc, /Hall pass · Delegate/);
  assert.match(pageSrc, /shouldDropHallPass/);
  assert.match(appSrc, /shouldDropHallPass/);
  assert.match(appSrc, /hallPassProfile/);
  assert.match(appSrc, /displayAskerName/);
  assert.match(appSrc, /name: displayAskerName\(p\) \|\| ""/);
  assert.match(appSrc, /name: displayAskerName\(profile\)/);
  assert.match(appSrc, /presentAskerRecord\(\{/);
  assert.match(appSrc, /sessionAfterStaffSignIn\(null, s\)/);
  assert.match(appSrc, /saveLocalSession\(null\)/);
  assert.doesNotMatch(pageSrc, /value=\{profile\.email\}/);
  assert.doesNotMatch(pageSrc, /value=\{staffMe && staffMe\.email\}/);
  assert.match(pageSrc, /Allow WAC details on this profile/);
  assert.match(pageSrc, /Stop using WAC details/);
});

/* ---------------------------------------------------------------- HTTP */

test("accountGet without a session is 403", async () => {
  const r = await client()("accountGet", {});
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "signed_out");
});

test("accountGet offer masks phone and email; age/sex are flagged as not on the WAC list", async () => {
  const email = mail("offer.mask");
  await importRow(wacRow("ZZQ30001", email), "acct-offer-1");
  const { call, token, profile } = await register(email, { age: 27, sex: "Female" });
  assert.equal(profile.age, 27);
  assert.equal(profile.sex, "Female");
  const got = await call("accountGet", { token });
  assert.equal(got.status, 200, JSON.stringify(got.body));
  assert.equal(got.body.wacShareConsent, false);
  const fields = got.body.wacOffer.fields;
  assert.equal(fields.phone, "•••• 3210");
  assert.equal(fields.email, maskEmail(email));
  assert.ok(!JSON.stringify(fields).includes("98765"));
  assert.ok(!JSON.stringify(fields).includes(email));
  assert.ok(!Object.prototype.hasOwnProperty.call(fields, "age"));
  assert.ok(!Object.prototype.hasOwnProperty.call(fields, "sex"));
  assert.deepEqual(got.body.wacOffer.notOnWacList, ["age", "sex"]);
  const dump = JSON.stringify(got.body.wacOffer);
  assert.ok(!dump.includes("12 Dummy Lane") && !dump.includes("UTR-FAKE"));
});

test("Allow WAC details copies list fields, never age or sex; Stop using WAC details revokes", async () => {
  const email = mail("share.allow");
  await importRow(wacRow("ZZQ30002", email), "acct-share-1");
  const { call, token } = await register(email, { name: "Typed Ananya", age: 27, sex: "Female", institute: "Typed Institute" });

  const before = await call("accountGet", { token });
  assert.equal(before.body.wacShareConsent, false);
  assert.ok(!before.body.profile.wac);

  const allow = await call("accountWacShare", { token, allow: true });
  assert.equal(allow.status, 200, JSON.stringify(allow.body));
  assert.equal(allow.body.wacShareConsent, true);
  const p = allow.body.profile;
  assert.equal(p.age, 27, "age stays as entered at AYURDISHA registration");
  assert.equal(p.sex, "Female", "sex stays as entered at AYURDISHA registration");
  assert.equal(p.name, "Typed Ananya");
  assert.equal(p.wac.institution, "WAC College of Ayurveda");
  assert.equal(p.wac.country, "India");
  assert.equal(p.wac.state, "Odisha");
  assert.ok(!("age" in (p.wac || {})));
  assert.ok(!("sex" in (p.wac || {})));
  assert.ok(!("phone" in (p.wac || {})));
  const stored = userByEmail(email);
  assert.equal(stored.age, 27);
  assert.equal(stored.sex, "Female");
  assert.equal(stored.wacShareConsent, true);
  assert.ok(!("age" in (stored.wac || {})));
  assert.ok(!("sex" in (stored.wac || {})));
  assert.equal(allow.body.wacOffer.fields.phone, "•••• 3210");

  const stop = await call("accountWacShare", { token, allow: false });
  assert.equal(stop.status, 200, JSON.stringify(stop.body));
  assert.equal(stop.body.wacShareConsent, false);
  assert.ok(!stop.body.profile.wac, "extra WAC fields leave the public profile when consent is off");
  assert.equal(userByEmail(email).age, 27);
  assert.equal(userByEmail(email).sex, "Female");
});

test("accountWacShare allow without a matching WAC row is 400; anonymous is 403", async () => {
  const { call, token } = await register(mail("noshare"));
  const miss = await call("accountWacShare", { token, allow: true });
  assert.equal(miss.status, 400);
  const anon = await client()("accountWacShare", { allow: true });
  assert.equal(anon.status, 403);
});
