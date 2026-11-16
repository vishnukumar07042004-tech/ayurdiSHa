/**
 * Ask Desk submit through the real HTTP handler on an isolated file store (2026-11-03 incident):
 * every stage / state the form offers is accepted, QR source is kept, students can only write
 * their own Ask fields, and AI enqueue failures (throw, slow, late rejection) never fail a submit.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-ask-submit-${process.pid}.json`);
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

const unhandled = [];
process.on("unhandledRejection", err => unhandled.push(err));

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { setEnqueueForTests } = await import("../server/ai/ops.js");
const { ASK_STAGES, ASK_STATES, OUTSIDE_INDIA, normalizeAskRecord } = await import("../shared/askOptions.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

let server;
let base;
before(async () => {
  server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  setEnqueueForTests(null);
  server.close();
  console.log = realLog;
  console.error = realErr;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

function client(extraHeaders = {}) {
  const jar = new Map();
  return async (op, payload = {}) => {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extraHeaders },
      body: JSON.stringify({ op, ...payload }),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}

const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
let student;
let staff;
let n = 0;

/** The record AskView builds (App.jsx submit), with optional overrides. */
function askRec(over = {}) {
  n += 1;
  const id = `ASKT${String(n).padStart(4, "0")}`;
  return {
    name: "Meera Iyer", email: student.email, mobile: "", state: "Kerala", institution: "QA Ayurveda College",
    stage: "Intern", registered: "Yes", regNo: student.regNo, inPerson: "Not yet confirmed", days: [],
    theme: "Research, Evidence & Publication", subtheme: "Framing a research question",
    question: "How do I move from clinical practice into Ayurveda research methodology?", context: "", outcome: "",
    consentFollow: "No",
    consentAnonPublish: "No",
    consentNamedDisplay: "No",
    consentRecording: "No",
    consentPublish: "No",
    safetyFlags: [],
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(),
    anonId: "U-ABCDEF1234", delegateNo: student.regNo, ...over,
  };
}
const submit = (rec, who = student) => who.call("set", { key: `aym:q:${rec.id}`, val: rec, token: who.token });

test("setup: registered student + staff with AI on for every stream (shadow off)", async () => {
  const call = client();
  const email = "ask.submit@ayurdisha-qa.test";
  assert.equal((await call("regStart", { name: "Meera Iyer", age: 25, sex: "Female", institute: "QA Ayurveda College", email })).status, 200);
  const ok = await call("regVerify", { email, otp: otpLog.get(email), source: "qr" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  student = { call, email, token: ok.body.token, regNo: ok.body.profile.regNo };
  staff = client(serviceHeaders());
  const streams = Object.fromEntries((await staff("aiConfigGet")).body.streams.map(s => [s.id, true]));
  assert.equal((await staff("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams } })).status, 200);
});

test("every stage the form offers is accepted and stored as chosen (incl. the new inclusive ones)", async () => {
  for (const stage of ASK_STAGES) {
    const rec = askRec({ stage });
    const r = await submit(rec);
    assert.equal(r.status, 200, `${stage}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ticket, rec.ticket);
    assert.equal(db()[`aym:q:${rec.id}`].stage, stage);
  }
});

test("India and Outside India states; unknown values are kept, not rejected", async () => {
  for (const state of ["Odisha", OUTSIDE_INDIA, ASK_STATES[0]]) {
    const rec = askRec({ state });
    assert.equal((await submit(rec)).status, 200, state);
    assert.equal(db()[`aym:q:${rec.id}`].state, state);
  }
  const odd = askRec({ stage: "Ayurveda pharmacist (new option)", state: "Dubai, UAE" });
  assert.equal((await submit(odd)).status, 200);
  assert.equal(db()[`aym:q:${odd.id}`].stage, "Ayurveda pharmacist (new option)");
});

test("QR source is stored when sent and absent when not; junk source dropped", async () => {
  const withSrc = askRec({ source: "qr" });
  const without = askRec();
  const junk = askRec({ source: "<script>" });
  for (const r of [withSrc, without, junk]) assert.equal((await submit(r)).status, 200);
  assert.equal(db()[`aym:q:${withSrc.id}`].source, "qr");
  assert.equal("source" in db()[`aym:q:${without.id}`], false);
  assert.equal(db()[`aym:q:${junk.id}`].source, "script");
});

test("each submit with AI on queues one AI job", async () => {
  const rec = askRec({ question: "Who conducts AIAPGET and where is the information bulletin published?", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch" });
  assert.equal((await submit(rec)).status, 200);
  const job = db()[`aym:ai:job:q_${rec.id}`];
  assert.ok(job && job.status === "queued", JSON.stringify(job));
});

test("AI enqueue throwing never fails the submit", async () => {
  setEnqueueForTests(() => { throw new Error("enqueue exploded"); });
  try {
    const rec = askRec();
    const r = await submit(rec);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(db()[`aym:q:${rec.id}`], "question saved");
  } finally { setEnqueueForTests(null); }
});

test("slow AI enqueue that rejects after the 1.5 s budget: submit answers, no unhandled rejection", async () => {
  setEnqueueForTests(() => new Promise((_, reject) => setTimeout(() => reject(new Error("late enqueue failure")), 1700)));
  try {
    const rec = askRec();
    const t0 = Date.now();
    const r = await submit(rec);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Date.now() - t0 < 3000, "answered within the enqueue budget");
    await new Promise(res => setTimeout(res, 600));
    assert.deepEqual(unhandled.map(e => String(e && e.message)), [], "no unhandled rejection");
  } finally { setEnqueueForTests(null); }
});

test("retry of the same id + ticket is an idempotent success; a different ticket on that id is refused", async () => {
  const rec = askRec();
  assert.equal((await submit(rec)).status, 200);
  const again = await submit(rec);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal((await submit({ ...rec, ticket: "AYM-Q-OTHER" })).status, 403);
});

test("students can only write Ask fields at the id their key names", async () => {
  const rec = askRec({ individualAnswer: "self-answered", individualAt: 1, aiAssisted: true, nested: { a: 1 }, theme: undefined });
  assert.equal((await submit(rec)).status, 200);
  const saved = db()[`aym:q:${rec.id}`];
  for (const k of ["individualAnswer", "individualAt", "aiAssisted", "nested"]) assert.equal(k in saved, false, k);
  const victim = askRec();
  assert.equal((await submit(victim)).status, 200);
  const hijack = askRec({ id: victim.id });
  const r = await student.call("set", { key: "aym:q:HIJACK001", val: hijack, token: student.token });
  assert.equal(r.status, 200);
  assert.equal(db()[`aym:q:${victim.id}`].ticket, victim.ticket, "other question untouched");
  assert.equal(db()["aym:q:HIJACK001"].id, "HIJACK001");
});

test("missing question / bad key → specific 400 messages; unregistered visitor told to register", async () => {
  const empty = await submit(askRec({ question: "   " }));
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /Write your question/);
  const badKey = await student.call("set", { key: "aym:q:../../x", val: askRec(), token: student.token });
  assert.equal(badKey.status, 400);
  assert.match(badKey.body.error, /ticket/);
  const anon = await client()("set", { key: "aym:q:ANON0001", val: askRec({ id: "ANON0001" }) });
  assert.equal(anon.status, 400);
  assert.match(anon.body.error, /Register first/);
});

test("staff question list and Track see a student's submit", async () => {
  const rec = askRec({ stage: "Researcher", source: "qr" });
  assert.equal((await submit(rec)).status, 200);
  const snap = await staff("staffSnapshot");
  assert.equal(snap.status, 200);
  const q = snap.body.questions.find(x => x.id === rec.id);
  assert.ok(q, "on the staff desk");
  assert.equal(q.stage, "Researcher");
  const hit = (await client()("lookup", { query: rec.ticket.toLowerCase() })).body.hits[0];
  assert.equal(hit && hit.ticket, rec.ticket);
});

test("probe helpers: staff only, probe emails only; purge never touches real questions or delegates", async () => {
  assert.equal((await client()("testProbeSession", { email: "aym-probe+x@ayurdisha-qa.test" })).status, 403);
  assert.equal((await client()("testProbePurge", {})).status, 403);
  assert.equal((await staff("testProbeSession", { email: student.email })).status, 400);
  const real = askRec({ question: "[TEST] looks like a probe but is a real student" });
  assert.equal((await submit(real)).status, 200);
  const s = await staff("testProbeSession", { email: "aym-probe+unit@ayurdisha-qa.test" });
  assert.equal(s.status, 200);
  const probe = client();
  const rec = await probe("regRecover", { email: "aym-probe+unit@ayurdisha-qa.test", regNo: s.body.profile.regNo });
  assert.equal(rec.status, 200);
  const pq = { ...askRec(), name: s.body.profile.name, email: s.body.profile.email, regNo: s.body.profile.regNo, question: "[TEST] probe question for the purge" };
  assert.equal((await probe("set", { key: `aym:q:${pq.id}`, val: pq, token: rec.body.token })).status, 200);
  const purge = await staff("testProbePurge", { ids: [real.id, pq.id], tokens: [rec.body.token] });
  assert.equal(purge.status, 200);
  assert.deepEqual(purge.body.questions, [pq.id]);
  assert.ok(db()[`aym:q:${real.id}`], "real question kept even when its id is passed");
  assert.equal(db()[`aym:q:${pq.id}`], undefined);
  assert.ok(Object.values(db()).some(v => v && v.email === student.email && v.regNo), "real delegate kept");
  assert.equal(Object.values(db()).some(v => v && v.email === "aym-probe+unit@ayurdisha-qa.test"), false, "probe delegate gone");
  assert.equal(db()[`aym:sess:${rec.body.token}`], undefined, "probe session gone");
});

test("offListAskFields: form values pass, odd ones are named (for the server log)", async () => {
  const { offListAskFields } = await import("../shared/askOptions.js");
  assert.deepEqual(offListAskFields({ stage: "Researcher", state: OUTSIDE_INDIA, registered: "Yes", inPerson: "No" }), []);
  assert.deepEqual(offListAskFields({ stage: "Pharmacist", state: "Dubai" }), ["stage", "state"]);
  assert.deepEqual(offListAskFields({}), []);
});

test("normalizeAskRecord: strings only, capped, days array, numeric createdAt", () => {
  const r = normalizeAskRecord({ id: " X1 ", question: "q".repeat(5000), days: ["11 December 2026", 3, null], createdAt: "nope", age: undefined, x: () => 1 });
  assert.equal(r.id, "X1");
  assert.equal(r.question.length, 2000);
  assert.deepEqual(r.days, ["11 December 2026"]);
  assert.equal(typeof r.createdAt, "number");
  assert.equal("age" in r || "x" in r, false);
});
