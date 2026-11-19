/**
 * The AI pipeline through the real HTTP handlers on an isolated file store (never Firestore):
 * AI off = Ask Desk + Track unchanged; staff-only ops; Track shows "being reviewed" but no AI
 * text before approval; after approval the answer arrives through the existing individual*
 * fields with the AI-assisted note flag.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-ai-http-${process.pid}.json`);
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

const { aymStoreHandler, aiWorkerHandler } = await import("../../server/storePlugin.js");
const { setRuntimeForTests } = await import("../../server/ai/runtime.js");
const { setKbForTests, setGoldenForTests } = await import("../../server/ai/retrieve.js");
const { setAllowListForTests } = await import("../../server/ai/sources.js");
const { CHUNKS, ALLOW, mockProvider } = await import("./helpers.mjs");
const { serviceHeaders } = await import("../helpers/staffAuth.mjs");

let server;
let base;

before(async () => {
  setAllowListForTests(ALLOW);
  setKbForTests(CHUNKS);
  setGoldenForTests([]);
  setRuntimeForTests({ provider: mockProvider() });
  server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
    if (req.url.startsWith("/api/ai-worker")) return aiWorkerHandler(req, res);
    res.statusCode = 404; res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  console.log = realLog;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

function client(extraHeaders = {}) {
  const jar = new Map();
  const call = async (op, payload = {}, url = "/api/aym-store") => {
    const r = await fetch(`${base}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "), ...extraHeaders },
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
  return call;
}

const THEME = "Academics, Teaching & Higher Education";
let student;
let staff;

async function register() {
  const call = client();
  const email = "ai.http.student@ayurdisha-qa.test";
  const start = await call("regStart", { name: "Kavya Menon", age: 23, sex: "Female", institute: "QA College", email });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const ok = await call("regVerify", { email, otp: otpLog.get(email) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return { call, email, token: ok.body.token };
}

async function ask(id, question) {
  const rec = {
    id, ticket: `AYM-Q-${id}`, createdAt: Date.now(), name: "Kavya Menon", email: student.email, institution: "QA College",
    stage: "Intern", state: "Kerala", theme: THEME, subtheme: "Choosing a PG branch", question, context: "", consentPublish: "Yes",
  };
  const r = await student.call("set", { key: `aym:q:${id}`, val: rec, token: student.token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return rec;
}

const aiKeys = () => Object.keys(JSON.parse(fs.readFileSync(storeFile, "utf8"))).filter(k => k.startsWith("aym:ai:"));

test("AI off by default: Ask Desk submit and Track behave exactly as before", async () => {
  student = await register();
  const rec = await ask("AIHTTP0001", "Who conducts AIAPGET 2026 and what is the application fee?");
  assert.deepEqual(aiKeys(), [], "no AI records are written while AI is off");
  const look = await client()("lookup", { query: rec.ticket.toLowerCase() });
  assert.equal(look.status, 200);
  assert.equal(look.body.hits.length, 1);
  assert.equal(look.body.hits[0].reviewStage, undefined);
  assert.equal(look.body.hits[0].individualAnswer, "");
});

test("AI ops are staff-only", async () => {
  const anon = client();
  for (const op of ["aiQueue", "aiConfigGet", "aiConfigSet", "aiApprove", "aiStats", "aiRunNow"]) {
    assert.equal((await anon(op, {})).status, 403, op);
  }
  staff = client(serviceHeaders());
  const cfg = await staff("aiConfigGet");
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.config.enabled, false);
  assert.equal(cfg.body.config.shadowMode, true);
});

test("enabled: submit queues a job; worker drafts; Track says 'being reviewed' with no AI text", async () => {
  const set = await staff("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams: { "pg-entrance": true } } });
  assert.equal(set.status, 200);
  const rec = await ask("AIHTTP0002", "What is the AIAPGET 2026 application fee and who conducts the exam?");
  assert.ok(aiKeys().some(k => k === "aym:ai:job:q_AIHTTP0002"), aiKeys().join(","));

  const run = await staff("aiRunNow", { wait: true });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.ok(run.body.report.done >= 1, JSON.stringify(run.body.report));

  const look = await client()("lookup", { query: rec.ticket.toLowerCase() });
  const hit = look.body.hits[0];
  assert.equal(hit.reviewStage, "review");
  assert.equal(hit.individualAnswer, "");
  const queue = await staff("aiQueue", {});
  const item = queue.body.items.find(i => i.targetId === "AIHTTP0002");
  assert.ok(item, JSON.stringify(queue.body));
  const draftWords = item.aiDraft.answer.split(/\s+/).slice(4, 12).join(" ");
  assert.ok(!JSON.stringify(look.body).includes(draftWords), "no AI draft text leaks to the public lookup");
  assert.ok(!JSON.stringify(look.body).includes("aiDraft"));

  const ok = await staff("aiApprove", { id: item.id, mentorName: "" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const after = await client()("lookup", { query: rec.ticket.toLowerCase() });
  const h = after.body.hits[0];
  assert.ok(h.individualAnswer.length > 20);
  assert.equal(h.individualAiAssisted, true);
  assert.equal(h.reviewStage, undefined);
  assert.ok(h.individualResources.some(r => r.includes("https://")));
});

test("worker endpoint: anonymous calls are throttled, never publish", async () => {
  const r = await fetch(`${base}/api/ai-worker`, { method: "POST", body: "{}" });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.ok(body.skipped === "throttled" || body.ok === true);
});

test("dry run: staff can try a question; nothing is stored and anonymous callers are refused", async () => {
  const anon = await client()("x", { dryRun: { question: "What is the AIAPGET application fee?" } }, "/api/ai-worker");
  assert.equal(anon.status, 403);
  const before = aiKeys().filter(k => /^aym:ai:(job|draft):/.test(k)).sort();
  const r = await staff("x", { dryRun: { question: "Who conducts AIAPGET and what is the application fee? I am Kavya Menon, kavya@example.com", theme: THEME, subtheme: "Choosing a PG branch" } }, "/api/ai-worker");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.stream, "pg-entrance");
  assert.ok(!/kavya/i.test(r.body.redactedQuestion), r.body.redactedQuestion);
  assert.ok(["pending", "blocked"].includes(r.body.draft.status));
  assert.deepEqual(aiKeys().filter(k => /^aym:ai:(job|draft):/.test(k)).sort(), before, "dry run writes no job or draft");
  const med = await staff("x", { dryRun: { question: "Which Ayurvedic medicine should my mother take for diabetes?" } }, "/api/ai-worker");
  assert.equal(med.body.draft.status, "blocked");
  assert.equal(med.body.draft.blockedReason, "medical");
});
