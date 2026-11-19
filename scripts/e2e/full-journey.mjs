#!/usr/bin/env node
/**
 * Full AYURDISHA journey against the real API handlers, on an isolated file store (never Firestore,
 * Blob or a real AI provider): register → WAC number → Ask Desk → AI drafts (mock provider) →
 * official review (approve / edit / reject / mentor / regenerate) → merge + group draft → Track,
 * plus the non-AI flows (merges, suggested merges, briefing board, Mentor pack Excel, podcasts,
 * knowledge search, staff access (passcode + email code, admin approval, service token), worker
 * auth, spend cap, provider outage). Uses a random test passcode and service token, never the real ones.
 *
 *   npm run e2e                      # temp store, deleted afterwards
 *   npm run e2e -- --keep .qa/e2e-store.json   # keep the store (seed for UI screenshots)
 *
 * Exit code 1 if any step fails.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";
import { stripCitationMarks } from "../../shared/citations.js";

const keepAt = (() => {
  const i = process.argv.indexOf("--keep");
  return i > 0 ? path.resolve(process.argv[i + 1] || ".qa/e2e-store.json") : "";
})();
const storeFile = keepAt || path.join(os.tmpdir(), `aym-e2e-${process.pid}.json`);
fs.mkdirSync(path.dirname(storeFile), { recursive: true });
fs.writeFileSync(storeFile, "{}");

const PASSCODE = `e2e-passphrase-${crypto.randomBytes(6).toString("hex")}`;
const SERVICE_TOKEN = `e2e-svc-${crypto.randomBytes(24).toString("hex")}`;
const ADMIN = "owner@ayurdisha-qa.test";
const CO_ADMIN = "co.admin@ayurdisha-qa.test";

// Isolation: file store, console mail, mock AI, test-only staff secrets. Set before any server module loads.
Object.assign(process.env, {
  ADMIN_PIN: PASSCODE,
  STAFF_SERVICE_TOKEN: SERVICE_TOKEN,
  STAFF_ADMIN_EMAILS: ADMIN,
  OTP_COOKIE_SECRET: `e2e-cookie-${crypto.randomBytes(12).toString("hex")}`,
  AYM_STAFF_DELAY_MS: "0",
  AYM_STORE: "file",
  AYM_STORE_FILE: storeFile,
  AYM_MAIL: "console",
  AYM_AI_NO_KICK: "1",
  AI_PROVIDER: "mock",
  AI_MOCK_MODE: "ok",
  CRON_SECRET: "e2e-cron-secret",
  GEMINI_API_KEY: "e2e-no-real-key",
  NODE_ENV: "test",
});
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-|\[knowledge-chat\]/.test(line)) return;
  realLog(...args);
};
console.error = (...args) => {
  if (/\[aym-|\[knowledge-chat\]/.test(args.join(" "))) return;
  realErr(...args);
};
console.warn = () => {};

const { aymStoreHandler, aiWorkerHandler } = await import("../../server/storePlugin.js");
const { knowledgeChatHandler } = await import("../../server/knowledgeChat.js");
const { mockCalls } = await import("../../server/ai/mockProvider.js");
const { buildClusters, suggestMerges, keepGroupsApart, detachMember, explainGroup } = await import("../../shared/merge.js");
const { mentorBriefRows, parseAnswerGrid, applyClusterAnswers } = await import("../../shared/mentorWorkbook.js");

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
  if (req.url.startsWith("/api/ai-worker")) return aiWorkerHandler(req, res);
  if (req.url.startsWith("/api/knowledge-chat")) return knowledgeChatHandler(req, res);
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

function client() {
  const jar = new Map();
  return async function call(op, payload = {}, url = "/api/aym-store", init = {}) {
    const r = await fetch(`${base}${url}`, {
      method: init.method || "POST",
      headers: { "Content-Type": "application/json", cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "), ...(init.headers || {}) },
      body: init.method === "GET" ? undefined : JSON.stringify({ op, ...payload }),
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

/* ---------------------------------------------------------------- runner */

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note || "", ms: Date.now() - t0 });
    realLog(`  PASS  ${name}${note ? ` — ${note}` : ""}`);
  } catch (err) {
    results.push({ name, ok: false, note: String(err && err.message || err).slice(0, 300), ms: Date.now() - t0 });
    realLog(`  FAIL  ${name} — ${String(err && err.message || err).slice(0, 300)}`);
  }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const T02 = "Academics, Teaching & Higher Education";
const PG = "Choosing a PG branch";
const QUESTIONS = {
  Q0: [T02, PG, "Is Kayachikitsa a good PG branch if I enjoy clinical work?"],
  QS1: [T02, PG, "Which books should I read for AIAPGET?"],
  QS2: [T02, "PhD pathway", "Which books should I read for AIAPGET?"],
  QS3: [T02, PG, "How do I write a good thesis synopsis?"],
  QS4: [T02, "PhD pathway", "How do I write a good thesis synopsis?"],
  QPG1: [T02, PG, "Who conducts AIAPGET 2026 and what is the application fee?"],
  QPG2: [T02, PG, "What is the eligibility for AIAPGET 2026 — must I finish my internship first?"],
  QPG3: [T02, PG, "How is the AIAPGET 2026 exam conducted and which body runs it?"],
  QPG4: [T02, PG, "Is AIAPGET conducted by NTA, and what should I check in the information bulletin?"],
  QPG5: [T02, PG, "How should I plan AIAPGET 2026 preparation during my internship year?"],
  QGOV: ["Policy, Public Health & Global Agencies", "Government service routes", "How do I become a Medical Officer (Ayurveda) through UPSC or a State PSC?"],
  QCLIN: ["Clinical Practice & Integrative Care", "Setting up private practice", "What registrations do I need to open my own Ayurveda clinic?"],
  QMED: [T02, PG, "My mother has diabetes and high BP — which Ayurvedic medicine and dose should she take?"],
  QPII: [T02, PG, "My name is Kavya Menon (kavya.menon@gmail.com, +91 98765 43210, 11WAC/2026/0042). Can I apply for AIAPGET 2026 before my internship ends?"],
  QM1: [T02, PG, "Best books for AIAPGET preparation?"],
  QM2: [T02, PG, "Which books should I read for AIAPGET preparation?"],
  QCAP: [T02, PG, "What is the AIAPGET 2026 application fee for General category?"],
  QFAIL: [T02, PG, "Which agency conducts AIAPGET 2026?"],
  QOUT: ["Policy, Public Health & Global Agencies", "Government service routes", "Which State Public Service Commission posts are open to BAMS graduates?"],
  QTHIN: [T02, PG, "How do I choose between AIAPGET and NEET-PG style routes for a no-source-topic career plan?"],
};
const recs = {};
const students = {};
let staff;
let version = 1;

async function register(key, name, email) {
  const call = client();
  const start = await call("regStart", { name, age: 23, sex: "Female", institute: "QA Ayurveda College", email });
  eq(start.status, 200, `regStart ${email}`);
  check(!JSON.stringify(start.body).match(/\b\d{6}\b/), "OTP must never be returned to the browser");
  const otp = otpLog.get(email);
  check(/^\d{6}$/.test(otp || ""), "OTP captured from the dev mail log");
  const ok = await call("regVerify", { email, otp });
  eq(ok.status, 200, "regVerify");
  check(/^11WAC\/2026\/\d{4}$/.test(ok.body.profile.regNo || ""), `WAC number format (${ok.body.profile.regNo})`);
  students[key] = { call, email, token: ok.body.token, regNo: ok.body.profile.regNo };
  return ok.body.profile.regNo;
}

async function ask(id, who = "A") {
  const [theme, subtheme, question] = QUESTIONS[id];
  const s = students[who];
  const rec = {
    id: `E2E${id}`, ticket: `AYM-Q-E2E${id}`.slice(0, 16), createdAt: Date.now(), name: who === "A" ? "Ananya Rao" : "Rohit Das",
    email: s.email, institution: "QA Ayurveda College", stage: "Intern", state: "Odisha", theme, subtheme, question, context: "", consentPublish: "Yes",
  };
  const r = await s.call("set", { key: `aym:q:${rec.id}`, val: rec, token: s.token });
  eq(r.status, 200, `submit ${id}: ${JSON.stringify(r.body)}`);
  recs[id] = rec;
  return rec;
}

const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
const aiKeys = prefix => Object.keys(db()).filter(k => k.startsWith(prefix || "aym:ai:"));
const job = id => db()[`aym:ai:job:q_E2E${id}`];
const draftOf = id => db()[`aym:ai:draft:q:E2E${id}`];
const track = async (id, who) => (await (who ? students[who].call : client())("lookup", { query: recs[id].ticket.toLowerCase() })).body.hits[0];
const runNow = async (extra = {}) => {
  const r = await staff("aiRunNow", { wait: true, ...extra });
  eq(r.status, 200, `aiRunNow ${JSON.stringify(r.body)}`);
  return r.body.report;
};
const queue = async (extra = {}) => (await staff("aiQueue", extra)).body;
const item = async (id, extra = {}) => (await queue({ status: "all", shadow: true, ...extra })).items.find(i => i.id === id);

realLog(`AYURDISHA full journey — isolated store ${storeFile}\n`);

/* ---------------------------------------------------------------- 1. access */

async function staffSignIn(email) {
  const call = client();
  const start = await call("staffStart", { passcode: PASSCODE, email });
  eq(start.status, 200, `staffStart ${JSON.stringify(start.body)}`);
  check(!JSON.stringify(start.body).match(/\b\d{6}\b/), "staff code never returned to the browser");
  const otp = otpLog.get(email);
  check(/^\d{6}$/.test(otp || ""), "staff code captured from the dev mail log");
  otpLog.delete(email);
  const v = await call("staffVerify", { email, otp });
  eq(v.status, 200, `staffVerify ${JSON.stringify(v.body)}`);
  return { call, verify: v.body };
}

await step("Staff access: AI ops and desk refuse anonymous callers (403)", async () => {
  const anon = client();
  const ops = ["aiQueue", "aiConfigGet", "aiConfigSet", "aiApprove", "aiRunNow", "aiProviderTest", "aiBackfill", "aiRefile", "aiAskRephrase", "staffSnapshot", "answerIndividual", "clustersSave", "clustersMerge", "visitSourcesGet", "regUsers", "testProbeSession", "testProbePurge", "wacResultsSave", "wacDelegatesImport", "wacDelegatesStats", "wacDelegatesClear",
    "staffCounts", "staffClusters", "staffQuestionsPage", "staffDelegatesPage",
    "facultyStreams", "facultyList", "facultyPreview", "facultyImport", "facultyReview", "facultyExport", "facultyMatchTest"];
  for (const op of ops) eq((await anon(op, {})).status, 403, op);
  return `${ops.length} ops refused`;
});

await step("Staff access: legacy PIN login gone (410); wrong passcode 403; admin passcode + email code → approved", async () => {
  const anon = client();
  eq((await anon("login", { pin: PASSCODE })).status, 410, "passcode alone");
  eq((await anon("whoami")).body.staff, false, "still not staff");
  const wrong = await anon("staffStart", { passcode: "wrong-passcode-0000", email: ADMIN });
  eq(wrong.status, 403, "wrong passcode");
  eq(wrong.body.code, "bad_passcode", "code");
  const { call, verify } = await staffSignIn(ADMIN);
  eq(verify.status, "approved", "admin auto-approved");
  eq(verify.role, "admin", "admin role");
  staff = call;
  const me = (await staff("whoami")).body;
  eq(me.staff, true, "whoami");
  eq(me.email, ADMIN, "signed in as the admin");
});

await step("Staff access: co-admin request → pending (no data) → admin approves → staff ops yes, admin-only ops no → revoke", async () => {
  const { call: co, verify } = await staffSignIn(CO_ADMIN);
  eq(verify.status, "pending", "pending");
  eq((await co("staffSnapshot")).status, 403, "pending sees no staff data");
  check((await staff("whoami")).body.pendingCount >= 1, "admin badge count");
  check((await staff("staffRequests")).body.pending.some(m => m.email === CO_ADMIN), "listed for the admin");
  eq((await staff("staffDecide", { email: CO_ADMIN, decision: "approve" })).status, 200, "approve");
  eq((await co("staffSnapshot")).status, 200, "co-admin desk");
  eq((await co("aiQueue", {})).status, 200, "co-admin DISHA review");
  for (const op of ["aiConfigSet", "wacDelegatesImport", "facultyImport", "staffRequests", "staffAudit"]) {
    eq((await co(op, {})).status, 403, `co-admin ${op}`);
  }
  eq((await staff("staffDecide", { email: CO_ADMIN, decision: "revoke" })).status, 200, "revoke");
  eq((await co("staffSnapshot")).status, 403, "revoked at once");
  const audit = (await staff("staffAudit", { action: "access" })).body.entries.map(e => e.action);
  check(audit.includes("access.approve") && audit.includes("access.revoke") && audit.includes("access.request"), `audited (${audit.join(",")})`);
});

await step("Service token: Bearer token acts as admin for scripts; a wrong token does not", async () => {
  const svc = client();
  const me = await svc("whoami", {}, "/api/aym-store", { headers: { Authorization: `Bearer ${SERVICE_TOKEN}` } });
  eq(me.body.staff, true, "service token");
  eq(me.body.role, "admin", "admin role");
  const bad = await svc("staffSnapshot", {}, "/api/aym-store", { headers: { Authorization: `Bearer ${SERVICE_TOKEN}x` } });
  eq(bad.status, 403, "wrong token");
});

await step("Worker auth: 401 without CRON_SECRET, 200 with the Bearer secret", async () => {
  const anon = await client()("", {}, "/api/ai-worker", { method: "GET" });
  eq(anon.status, 401, "no secret");
  const cron = await client()("", {}, "/api/ai-worker", { method: "GET", headers: { Authorization: "Bearer e2e-cron-secret" } });
  eq(cron.status, 200, "cron secret");
  eq(cron.body.stopped, "disabled", "AI is off by default");
});

/* ---------------------------------------------------------------- 2. student */

await step("Register: email OTP → verify → WAC number issued (11WAC/2026/NNNN)", async () => {
  const a = await register("A", "Ananya Rao", "ananya.rao@ayurdisha-qa.test");
  const b = await register("B", "Rohit Das", "rohit.das@ayurdisha-qa.test");
  check(a !== b, "unique WAC numbers");
  return `${a}, ${b}`;
});

await step("Ask Desk: unregistered visitor refused; registered submits; retry is idempotent", async () => {
  const anon = await client()("set", { key: "aym:q:E2EANON", val: { id: "E2EANON", ticket: "AYM-Q-ANON", question: "x", theme: T02, subtheme: PG } });
  eq(anon.status, 400, "anonymous submit");
  const rec = await ask("Q0");
  const again = await students.A.call("set", { key: `aym:q:${rec.id}`, val: rec, token: students.A.token });
  eq(again.status, 200, "retry");
  for (const id of ["QS1", "QS2", "QS3", "QS4"]) await ask(id, "B");
  eq(aiKeys().length, 0, "AI off: no AI records written");
  const t = await track("Q0");
  eq(t.reviewStage, undefined, "no review stage while AI off");
  eq(t.individualAnswer, "", "no answer yet");
});

/* ---------------------------------------------------------------- 3. AI on, shadow */

await step("AI settings: defaults OFF / shadow ON / $5 cap; enable pg-entrance + govt-jobs in shadow", async () => {
  const cfg = (await staff("aiConfigGet")).body;
  eq(cfg.config.enabled, false, "enabled default");
  eq(cfg.config.shadowMode, true, "shadow default");
  eq(cfg.config.dailySpendCapUSD, 5, "cap default");
  eq(cfg.provider.id, "mock", "mock provider active");
  const set = await staff("aiConfigSet", { patch: { enabled: true, shadowMode: true, streams: { "pg-entrance": true, "govt-jobs": true } } });
  eq(set.status, 200, "config set");
  const test = await staff("aiProviderTest");
  eq(test.body.test.ok, true, "Test connection (mock)");
});

await step("Ask Desk with AI on: enabled streams queue a job; disabled stream does not", async () => {
  for (const id of ["QPG1", "QPG2", "QPG3", "QPG4", "QPG5", "QGOV", "QMED", "QPII"]) await ask(id);
  await ask("QCLIN", "B");
  for (const id of ["QPG1", "QGOV", "QMED", "QPII"]) check(job(id) && job(id).status === "queued", `job queued for ${id}`);
  check(!job("QCLIN"), "clinical-practice stream is off → no job");
  return `${aiKeys("aym:ai:job:").length} jobs queued`;
});

await step("Worker (shadow ON): drafts are written but hidden from the queue and from Track", async () => {
  const report = await runNow();
  check(report.done >= 8, `drafted ${report.done}`);
  const q = await queue();
  eq(q.items.length, 0, "default queue hides shadow drafts");
  check(q.counts.shadow >= 7, `shadow count ${q.counts.shadow}`);
  const t = await track("QPG1");
  eq(t.reviewStage, undefined, "Track never says 'being reviewed' for shadow drafts");
  const shadowView = await queue({ shadow: true });
  check(shadowView.items.length >= 7, "Show shadow drafts lists them");
  return `${report.done} drafts, ${q.counts.shadow} shadow`;
});

await step("Medical question routed to mentor: never sent to the provider", async () => {
  const d = draftOf("QMED");
  eq(d.aiDraft.status, "blocked", "medical draft status");
  eq(d.aiDraft.blockedReason, "medical", "blocked reason");
  check(!mockCalls().some(c => /diabetes/i.test(c.content)), "medical text never reached the provider");
});

/** Student-derived text in each provider call (public KB passages legitimately contain names). */
function studentText(calls) {
  return calls.map(c => {
    let p;
    try { p = JSON.parse(c.content); } catch { return c.content; }
    return [p.question, p.context, ...(p.similarQuestionsInGroup || []), p.draft].filter(Boolean).join("\n");
  }).join("\n");
}

await step("PII redacted before every provider call (draft + verify)", async () => {
  const sent = studentText(mockCalls());
  for (const pii of ["Kavya", "Menon", "kavya.menon@gmail.com", "98765 43210", "11WAC/2026/0042", "Ananya", "ananya.rao@", recs.QPII.ticket]) {
    check(!sent.includes(pii), `"${pii}" leaked to the provider`);
  }
  check(/\[(NAME|EMAIL|PHONE)/.test(sent), "redaction placeholders present");
  return `${mockCalls().length} provider calls checked`;
});

await step("Shadow OFF: shadow drafts move into the review queue, sorted by risk", async () => {
  const set = await staff("aiConfigSet", { patch: { shadowMode: false } });
  check(set.body.promoted >= 7, `promoted ${set.body.promoted}`);
  const q = await queue();
  check(q.items.length >= 7, `queue has ${q.items.length}`);
  const rank = { high: 0, medium: 1, low: 2 };
  // Mentor-assist (limited sources) drafts sort after the normal ones; risk order applies within each tier.
  const key = it => (it.aiDraft.mode === "mentor-assist" ? 10 : 0) + rank[it.aiDraft.risk];
  for (let i = 1; i < q.items.length; i++) check(key(q.items[i - 1]) <= key(q.items[i]), "sorted by risk (high first)");
  const blocked = await queue({ status: "blocked" });
  check(blocked.items.some(i => i.id === "q:E2EQMED"), "medical draft on the Blocked tab");
  const it = q.items.find(i => i.id === "q:E2EQPG1");
  check(it.aiDraft.citations.length > 0 && it.aiDraft.claimChecks.length > 0, "draft has sources and claim checks");
  return `risk order ${q.items.map(i => i.aiDraft.risk[0]).join("")}`;
});

await step("Track while waiting: 'Being reviewed by the desk', no AI text leaks", async () => {
  const t = await track("QPG1");
  eq(t.reviewStage, "review", "review stage");
  eq(t.individualAnswer, "", "no answer text");
  const draftWords = stripMarks(draftOf("QPG1").aiDraft.answer).split(/\s+/).slice(5, 14).join(" ");
  const pub = JSON.stringify(await client()("lookup", { query: recs.QPG1.ticket }));
  check(!pub.includes(draftWords), "draft wording absent from the public lookup");
  check(!pub.includes("aiDraft") && !pub.includes("claimChecks"), "no AI fields in lookup");
  const cl = JSON.stringify((await client()("get", { key: "aym:clusters" })).body);
  check(!cl.includes(draftWords), "no draft in the public cluster list");
});

function stripMarks(s) { return stripCitationMarks(s); }

/* ---------------------------------------------------------------- 4. review buttons */

await step("Approve and send → Track shows the letter + AI note; double approve refused", async () => {
  const r = await staff("aiApprove", { id: "q:E2EQPG1", mentorName: "", reviewer: "QA official" });
  eq(r.status, 200, `approve ${JSON.stringify(r.body)}`);
  const t = await track("QPG1");
  check(t.individualAnswer.length > 40, "answer on Track");
  eq(t.individualAiAssisted, true, "AI-assisted note flag");
  eq(t.reviewStage, undefined, "review stage cleared");
  check(t.individualResources.some(x => /https:\/\//.test(x)), "references keep their links");
  check(!/\[c:/.test(t.individualAnswer), "citation markers stripped");
  eq((await staff("aiApprove", { id: "q:E2EQPG1" })).status, 409, "second approve");
  eq((await staff("aiRegenerate", { id: "q:E2EQPG1" })).status, 409, "regenerate after approval");
  const bank = aiKeys("aym:ai:bank:");
  check(bank.includes("aym:ai:bank:q:E2EQPG1"), "approved answer bank entry written");
});

await step("Edit then send → edited text on Track, edit diff stored", async () => {
  const before = draftOf("QPG2").aiDraft;
  const answer = `${stripMarks(before.answer)} Speak to your college's PG cell before you apply.`;
  const r = await staff("aiEditApprove", { id: "q:E2EQPG2", answer, actions: ["Read the NTA bulletin", "Confirm internship dates", "Apply early"], mistake: before.mistake, resources: before.resources, mentorName: "Dr QA Mentor", reviewer: "Dr QA Mentor" });
  eq(r.status, 200, `edit ${JSON.stringify(r.body)}`);
  const d = draftOf("QPG2");
  eq(d.aiDraft.status, "edited", "status edited");
  check(d.aiDraft.editDiff && d.aiDraft.editDiff.ratio > 0 && d.aiDraft.editDiff.changed.includes("answer"), "editDiff recorded");
  const t = await track("QPG2");
  check(t.individualAnswer.endsWith("PG cell before you apply."), "edited answer on Track");
  eq(t.individualMentor, "Dr QA Mentor", "mentor credit");
  eq(t.individualAiAssisted, true, "AI note");
  return `edit ratio ${d.aiDraft.editDiff.ratio}`;
});

await step("Reject → reason required; question stays unanswered for a human", async () => {
  eq((await staff("aiReject", { id: "q:E2EQPG3" })).status, 400, "reject without reason");
  const r = await staff("aiReject", { id: "q:E2EQPG3", reason: "Too generic", tag: "Too generic" });
  eq(r.status, 200, "reject");
  eq(draftOf("QPG3").aiDraft.status, "rejected", "status");
  const t = await track("QPG3");
  eq(t.individualAnswer, "", "no answer");
  eq(t.reviewStage, undefined, "no longer 'being reviewed'");
});

await step("Send to mentor → leaves the queue; mentor answers on the briefing board; no AI note", async () => {
  eq((await staff("aiSendToMentor", { id: "q:E2EQPG4" })).status, 200, "send to mentor");
  eq(draftOf("QPG4").aiDraft.status, "to-mentor", "status");
  const idx = (await staff("aiIndex")).body.index;
  eq(idx["q:E2EQPG4"].status, "to-mentor", "briefing-board badge 'AI: sent to mentor'");
  check(!(await queue()).items.some(i => i.id === "q:E2EQPG4"), "not in Waiting");
  const r = await staff("answerIndividual", { id: recs.QPG4.id, answer: "Yes — NTA conducts AIAPGET. Read the eligibility and exam-pattern sections first.", mentorName: "Dr QA Mentor" });
  eq(r.status, 200, "mentor answer");
  const t = await track("QPG4");
  check(t.individualAnswer.startsWith("Yes — NTA"), "mentor answer on Track");
  eq(t.individualAiAssisted, false, "no AI note on a mentor-written answer");
});

await step("Regenerate → new draft replaces the pending one (history kept), then approve", async () => {
  const r = await staff("aiRegenerate", { id: "q:E2EQPG5" });
  eq(r.status, 200, `regenerate ${JSON.stringify(r.body)}`);
  check((await item("q:E2EQPG5")).regenerating, "shows 'redrafting'");
  const report = await runNow();
  check(report.done >= 1, "worker redrafted");
  const it = await item("q:E2EQPG5");
  check(!it.regenerating, "redrafting flag cleared");
  check(it.history.length >= 1, "earlier version kept in history");
  eq((await staff("aiApprove", { id: "q:E2EQPG5" })).status, 200, "approve regenerated draft");
});

await step("Answered elsewhere: a briefing-board answer supersedes a waiting draft", async () => {
  eq((await staff("answerIndividual", { id: recs.QGOV.id, answer: "Watch UPSC CMS / Medical Officer (Ayurveda) notices and your State PSC.", mentorName: "Dr QA Mentor" })).status, 200, "answer");
  const q = await queue();
  check(!q.items.some(i => i.id === "q:E2EQGOV"), "left the Waiting tab");
  check(q.counts.superseded >= 1, "counted as answered elsewhere");
  eq((await staff("aiApprove", { id: "q:E2EQGOV" })).status, 409, "cannot double-publish");
});

await step("Blocked medical question: official writes the answer (no AI note)", async () => {
  eq((await staff("aiApprove", { id: "q:E2EQMED" })).status, 400, "blocked draft cannot be approved as-is");
  const r = await staff("aiEditApprove", { id: "q:E2EQMED", answer: "We cannot advise on treatment here. Please take your mother to a registered Ayurveda physician for an in-person consultation.", mentorName: "Dr QA Mentor" });
  eq(r.status, 200, "write answer");
  const t = await track("QMED");
  check(t.individualAnswer.startsWith("We cannot advise"), "answer on Track");
  eq(t.individualAiAssisted, false, "no AI note");
});

await step("Approve the PII question: Track shows the answer; draft stored only redacted text", async () => {
  const d = draftOf("QPII");
  check(!/Kavya|kavya\.menon|98765/.test(JSON.stringify(d)), "draft record holds redacted text only");
  eq((await staff("aiApprove", { id: "q:E2EQPII" })).status, 200, "approve");
  check((await track("QPII")).individualAnswer, "answer on Track");
});

await step("Thin sources → mentor-assist draft (pending, 'Limited sources'), sorted after normal drafts, approve → Track", async () => {
  await ask("QTHIN");
  await runNow();
  const d = draftOf("QTHIN");
  check(d, "drafted");
  eq(d.aiDraft.status, "pending", "never blocked");
  eq(d.aiDraft.mode, "mentor-assist", "mode");
  eq(d.aiDraft.risk, "high", "risk");
  check(d.aiDraft.confidence <= 0.4, `confidence capped (${d.aiDraft.confidence})`);
  check((d.aiDraft.flags || []).includes("limited-sources"), "limited-sources flag");
  check(!/50,000/.test(d.aiDraft.answer), "unsourced figure stripped");
  check(d.aiDraft.claimChecks.some(c => c.status === "guidance"), "guidance claims labelled");
  const q = await queue();
  const ids = q.items.map(i => i.id);
  const firstAssist = q.items.findIndex(i => i.aiDraft.mode === "mentor-assist");
  check(firstAssist >= 0 && q.items.slice(firstAssist).every(i => i.aiDraft.mode === "mentor-assist"), `mentor-assist after normal drafts (${ids.join(",")})`);
  check(q.counts.mentorAssist >= 1, "counted");
  const only = await queue({ mode: "mentor-assist" });
  check(only.items.every(i => i.aiDraft.mode === "mentor-assist") && only.items.some(i => i.id === "q:E2EQTHIN"), "mode filter");
  eq((await track("QTHIN")).reviewStage, "review", "Track: being reviewed");
  const redraft = await staff("aiBackfill", { dryRun: true, redraftInsufficient: true });
  eq(redraft.status, 200, "redraft dry run");
  eq(redraft.body.mode, "redraft-insufficient", "redraft mode");
  eq((await staff("aiApprove", { id: "q:E2EQTHIN", reviewer: "QA official" })).status, 200, "approve");
  const t = await track("QTHIN");
  check(t.individualAnswer.length > 80, "answer on Track");
  eq(t.individualAiAssisted, true, "AI note (AI-originated text)");
});

/* ---------------------------------------------------------------- 5. merge + group draft */

let groupId = "";
await step("Curation: auto-merge two similar questions (with why-merged) and save (versioned)", async () => {
  await ask("QM1");
  await ask("QM2", "B");
  const snap = await staff("staffSnapshot");
  eq(snap.status, 200, "snapshot");
  version = snap.body.clustersVersion;
  const subs = [recs.QM1, recs.QM2];
  const clusters = buildClusters(subs, 0.42, true, snap.body.clusters || []);
  const g = clusters.find(c => c.memberIds.includes(recs.QM1.id));
  check(g && g.memberIds.includes(recs.QM2.id), "QM1 + QM2 auto-merged");
  const why = explainGroup(subs);
  check(why && (why.reasons || why.summary || why.why || JSON.stringify(why).length > 10), "why-merged explanation available");
  const saved = await staff("clustersSave", { clusters, version });
  eq(saved.status, 200, `save ${JSON.stringify(saved.body)}`);
  version = saved.body.clustersVersion;
  groupId = g.id;
  const stale = await staff("clustersSave", { clusters: [], version: version - 1 });
  eq(stale.status, 409, "stale save refused (409)");
  return `group ${groupId}`;
});

await step("Group draft: one draft for the merged group (members skipped), approve → every member's Track", async () => {
  const report = await runNow({ sweep: true });
  const gd = db()[`aym:ai:draft:c:${groupId}`];
  check(gd, `group draft exists (report ${JSON.stringify(report)})`);
  eq(gd.memberCount, 2, "member count");
  check(!draftOf("QM1") && !draftOf("QM2"), "no per-student drafts for group members");
  const t0 = await track("QM1");
  eq(t0.reviewStage, "review", "group members see 'being reviewed'");
  const r = await staff("aiApprove", { id: `c:${groupId}` });
  eq(r.status, 200, `approve group ${JSON.stringify(r.body)}`);
  version = r.body.clustersVersion || version;
  for (const id of ["QM1", "QM2"]) {
    const t = await track(id);
    check(t.cluster && t.cluster.answer.length > 40, `${id} sees the group answer`);
    eq(t.cluster.aiAssisted, true, `${id} AI note`);
    eq(t.cluster.status, "Published", `${id} status`);
  }
});

await step("Group membership changed after drafting → approve refused (409) until regenerated", async () => {
  // Build a fresh 2-member group, draft it, then add a third member.
  await ask("QCAP");
  await ask("QFAIL", "B");
  const snap = await staff("staffSnapshot");
  version = snap.body.clustersVersion;
  const c = { id: "AYM-C-E2EGRP", theme: T02, subtheme: PG, kind: "merged", memberIds: [recs.QCAP.id, recs.QFAIL.id], status: "New", representative: recs.QCAP.question, composite: "AIAPGET 2026: conducting agency and fee" };
  let saved = await staff("clustersSave", { clusters: [...snap.body.clusters, c], version });
  eq(saved.status, 200, "save group");
  version = saved.body.clustersVersion;
  await runNow({ sweep: true });
  check(db()["aym:ai:draft:c:AYM-C-E2EGRP"], "group drafted");
  const grown = saved.body.clusters.map(x => (x.id === c.id ? { ...x, memberIds: [...x.memberIds, recs.Q0.id] } : x)).map(x => (x.id !== c.id ? { ...x, memberIds: x.memberIds.filter(m => m !== recs.Q0.id) } : x));
  saved = await staff("clustersSave", { clusters: grown, version });
  eq(saved.status, 200, "grow group");
  version = saved.body.clustersVersion;
  const it = await item("c:AYM-C-E2EGRP");
  eq(it.groupNow.changed, true, "desk flags 'members changed'");
  const r = await staff("aiApprove", { id: "c:AYM-C-E2EGRP" });
  eq(r.status, 409, "approve refused");
  eq(r.body.code, "membership-changed", "code");
});

/* ---------------------------------------------------------------- 6. spend cap + outage */

await step("Spend cap: worker stops at the cap and raises a banner; raising the cap clears it", async () => {
  const cfg = (await staff("aiConfigGet")).body;
  const spent = cfg.today.costUSD;
  check(spent > 0, "spend tracked");
  await staff("aiConfigSet", { patch: { dailySpendCapUSD: Math.floor(spent * 100) / 100 } });
  await staff("aiRegenerate", { id: "c:AYM-C-E2EGRP" });
  const report = await runNow();
  eq(report.stopped, "spend cap", "stopped");
  const after = (await staff("aiConfigGet")).body.config;
  eq(after.alert && after.alert.type, "spend-cap", "banner");
  const dry = await staff("x", { dryRun: { question: "Who conducts AIAPGET 2026?", theme: T02, subtheme: PG } }, "/api/ai-worker");
  eq(dry.body.ok, false, "dry run refuses at the cap");
  await staff("aiConfigSet", { patch: { dailySpendCapUSD: 5 } });
  eq((await staff("aiConfigGet")).body.config.alert, undefined, "banner cleared");
  return `spent $${spent.toFixed(3)}`;
});

await step("Provider outage (simulated 402): jobs kept, banner shown, nothing lost; recovers on 'Process queue'", async () => {
  try {
    await outage();
  } finally {
    process.env.AI_MOCK_MODE = "ok";
  }
});

async function outage() {
  process.env.AI_MOCK_MODE = "credits";
  await ask("QOUT");
  const report = await runNow();
  eq(report.stopped, "provider unavailable", "run paused");
  const j = job("QOUT");
  eq(j.status, "queued", "job kept queued");
  eq(j.attempts, 0, "no attempt burnt");
  const cfg = (await staff("aiConfigGet")).body.config;
  eq(cfg.alert && cfg.alert.type, "provider", "provider banner");
  check(/credits/i.test(cfg.alert.message), "banner explains credits");
  const q = await queue();
  check(q.working.some(w => /credits/i.test(w.error)), "desk lists the waiting job with its error");
  const dry = await staff("x", { dryRun: { question: "Who conducts AIAPGET 2026?", theme: T02, subtheme: PG } }, "/api/ai-worker");
  eq(dry.body.ok, false, "dry run fails");
  eq(dry.body.code, "credits_depleted", "dry run code");
  check(/prepaid credits are used up/.test(dry.body.error), "friendly dry-run message");
  eq((await staff("aiProviderTest")).body.test.ok, false, "Test connection reports the failure");
  process.env.AI_MOCK_MODE = "ok";
  const back = await runNow();
  check(back.done >= 1, `recovered ${JSON.stringify(back)}`);
  check(draftOf("QOUT"), "the paused question got its draft");
  eq((await staff("aiConfigGet")).body.config.alert, undefined, "banner cleared after recovery");
}

await step("Staff dry-run (mock): drafts one question in memory, stores nothing", async () => {
  const before = aiKeys().filter(k => /^aym:ai:(job|draft):/.test(k)).sort().join();
  const r = await staff("x", { dryRun: { question: "Who conducts AIAPGET and what is the fee? I am Ananya Rao, ananya.rao@ayurdisha-qa.test", theme: T02, subtheme: PG } }, "/api/ai-worker");
  eq(r.body.ok, true, JSON.stringify(r.body).slice(0, 200));
  check(!/Ananya|ananya\.rao/.test(r.body.redactedQuestion), "dry run redacts");
  eq(aiKeys().filter(k => /^aym:ai:(job|draft):/.test(k)).sort().join(), before, "nothing stored");
  const anon = (await client()("x", { dryRun: { question: "x" } }, "/api/ai-worker")).status;
  check(anon === 401 || anon === 403, `anonymous dry run refused (${anon})`);
});

/* ---------------------------------------------------------------- 7. non-AI flows */

let current = [];
await step("Suggested merges: Keep apart persists; Accept merges (versioned)", async () => {
  const snap = await staff("staffSnapshot");
  version = snap.body.clustersVersion;
  const subs = ["QS1", "QS2", "QS3", "QS4"].map(k => recs[k]);
  // Re-cluster only these four; every other group on the desk is kept as it is.
  const ids = new Set(subs.map(s => s.id));
  const touching = snap.body.clusters.filter(c => c.memberIds.some(id => ids.has(id)));
  const others = snap.body.clusters.filter(c => !c.memberIds.some(id => ids.has(id)));
  let next = [...others, ...buildClusters(subs, 0.48, true, touching)];
  let r = await staff("clustersSave", { clusters: next, version });
  eq(r.status, 200, "save");
  version = r.body.clustersVersion;
  const own = (list, id) => list.find(c => c.memberIds.includes(id)).id;
  const sugg = suggestMerges(r.body.clusters, subs);
  const s12 = sugg.find(s => [s.a, s.b].includes(own(r.body.clusters, recs.QS1.id)));
  const s34 = sugg.find(s => [s.a, s.b].includes(own(r.body.clusters, recs.QS3.id)));
  check(s12 && s34, `both pairs suggested (${sugg.length})`);
  r = await staff("clustersSave", { clusters: keepGroupsApart(r.body.clusters, s12.a, s12.b), version });
  version = r.body.clustersVersion;
  const reloaded = (await staff("get", { key: "aym:clusters" })).body.value;
  check(reloaded.some(c => (c.apartFrom || []).length), "Keep apart stored");
  check(!suggestMerges(reloaded, subs).some(s => [s.a, s.b].includes(own(reloaded, recs.QS1.id)) && [s.a, s.b].includes(own(reloaded, recs.QS2.id))), "kept-apart pair not suggested again");
  const ok = await staff("clustersMerge", { ids: [s34.a, s34.b], version, suggestion: true });
  eq(ok.status, 200, `accept ${JSON.stringify(ok.body)}`);
  version = ok.body.clustersVersion;
  current = ok.body.clusters;
  check(current.find(c => c.id === ok.body.mergedId).memberIds.length === 2, "accepted pair merged");
});

await step("Manual merge + detach: detached student loses the group answer", async () => {
  const subs = Object.values(recs);
  const byId = Object.fromEntries(subs.map(s => [s.id, s]));
  const g = current.find(c => c.memberIds.includes(recs.QS3.id));
  const solo = current.find(c => c.memberIds.includes(recs.QS1.id));
  const m = await staff("clustersMerge", { ids: [g.id, solo.id], version });
  eq(m.status, 200, `manual merge ${JSON.stringify(m.body)}`);
  version = m.body.clustersVersion;
  let list = m.body.clusters;
  const merged = list.find(c => c.id === m.body.mergedId);
  check(merged.memberIds.includes(recs.QS1.id), "QS1 joined");
  list = detachMember(list, merged.id, recs.QS1.id, byId);
  const s = await staff("clustersSave", { clusters: list, version });
  eq(s.status, 200, "detach save");
  version = s.body.clustersVersion;
  current = s.body.clusters;
  check(!current.find(c => c.memberIds.includes(recs.QS3.id)).memberIds.includes(recs.QS1.id), "QS1 detached");
});

await step("Mentor pack Excel: export → mentor fills MERGED + INDIVIDUAL answers → import → Track", async () => {
  const subs = Object.values(recs);
  const sel = current.filter(c => c.memberIds.some(id => [recs.QS3.id, recs.QS1.id].includes(id)));
  const rows = mentorBriefRows(sel, subs);
  const col = n => rows[0].indexOf(n);
  const g = sel.find(c => c.memberIds.includes(recs.QS3.id));
  rows.slice(1).forEach(r => {
    if (r[col("Cluster_ID")] === g.id) { r[col("MERGED_ANSWER")] = "Start the synopsis from a sharp research question; follow your university template."; r[col("MENTOR_NAME_DESIGNATION")] = "Dr QA Mentor, Professor"; }
    if (r[col("Ticket_ID")] === recs.QS1.ticket) r[col("INDIVIDUAL_ANSWER")] = "Use the NCISM syllabus and two standard texts per subject.";
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "MENTOR_BRIEF");
  const back = XLSX.read(XLSX.write(wb, { bookType: "xlsx", type: "buffer" }), { type: "buffer" });
  const parsed = parseAnswerGrid(XLSX.utils.sheet_to_json(back.Sheets.MENTOR_BRIEF, { header: 1, defval: "" }));
  const applied = applyClusterAnswers(current, parsed.filter(r => r.kind === "cluster"));
  eq(applied.filled, 1, "group answers filled");
  const s = await staff("clustersSave", { clusters: applied.clusters, version });
  eq(s.status, 200, "import save");
  version = s.body.clustersVersion;
  for (const r of parsed.filter(x => x.kind === "individual")) {
    const hit = subs.find(x => x.ticket === r.ticket);
    eq((await staff("answerIndividual", { id: hit.id, answer: r.answer, mentorName: r.mentorName })).status, 200, "individual import");
  }
  for (const id of ["QS3", "QS4"]) eq((await track(id)).cluster.answer.startsWith("Start the synopsis"), true, `${id} sees the merged answer`);
  const t1 = await track("QS1");
  check(t1.individualAnswer.startsWith("Use the NCISM syllabus"), "QS1 personal answer");
  eq(t1.individualAiAssisted, false, "no AI note on mentor answers");
});

await step("Briefing board: individual answer for a disabled-stream question", async () => {
  const r = await staff("answerIndividual", { id: recs.QCLIN.id, answer: "Register with your State Board of Indian Medicine, then local trade and waste-management licences.", mentorName: "Dr QA Mentor" });
  eq(r.status, 200, "answer");
  const t = await track("QCLIN", "B");
  check(t.individualAnswer.startsWith("Register with"), "Track shows it");
  eq((await client()("answerIndividual", { id: recs.QCLIN.id, answer: "hijack" })).status, 403, "anonymous answer refused");
});

await step("Track by email: owner and staff only", async () => {
  eq((await client()("lookup", { query: students.A.email })).body.hits.length, 0, "stranger");
  const own = await students.A.call("lookup", { query: students.A.email });
  check(own.body.hits.length >= 10, `owner sees ${own.body.hits.length}`);
  check((await staff("lookup", { query: students.B.email })).body.hits.length >= 5, "staff");
  eq((await client()("lookup", { query: "aym-q-doesnotexist" })).body.hits.length, 0, "unknown ticket");
});

await step("WAC-ID sign-in: import 5-row sample → sign in with WAC ID + email code → confirm → ask → Track", async () => {
  const { detectColumns, rowsFromGrid, WAC_NO_MATCH } = await import("../../shared/wacId.js");
  const csv = fs.readFileSync(new URL("../../docs/wac-signin/sample-delegates.csv", import.meta.url), "utf8");
  const wb = XLSX.read(csv, { type: "string" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const rows = rowsFromGrid(grid, detectColumns(grid[0]));
  eq((await client()("wacConfig")).body.enabled, false, "WAC option hidden before any import");
  const imp = await staff("wacDelegatesImport", { rows, batchId: "e2e-wac-1", filename: "sample-delegates.csv" });
  eq(imp.status, 200, `import ${JSON.stringify(imp.body)}`);
  eq(imp.body.imported, 5, "5 delegates imported");
  eq((await client()("wacConfig")).body.enabled, true, "WAC option live after import");
  const d = client();
  const email = "fake.delegate.three@ayurdisha-sample.test";
  eq((await d("wacStart", { wacId: "TEST-WAC-0003", email: "wrong@ayurdisha-sample.test" })).body.error, WAC_NO_MATCH, "generic mismatch");
  const start = await d("wacStart", { wacId: " test-wac-0003 ", email: email.toUpperCase() });
  eq(start.status, 200, `wacStart ${JSON.stringify(start.body)}`);
  check(!JSON.stringify(start.body).includes(email), "only the masked email is returned");
  const v = await d("wacVerify", { wacId: "TEST-WAC-0003", otp: otpLog.get(email), source: "qr" });
  eq(v.status, 200, `wacVerify ${JSON.stringify(v.body)}`);
  eq(v.body.profile.regNo, "TEST-WAC-0003", "WAC ID is the pass number");
  eq(v.body.needsConfirm, true, "first sign-in asks to confirm details");
  const c = await d("wacConfirm", { token: v.body.token, stage: "Faculty", interests: [T02], consent: true });
  eq(c.status, 200, `confirm ${JSON.stringify(c.body)}`);
  const rec = {
    id: "E2EWAC1", ticket: "AYM-Q-E2EWAC01", createdAt: Date.now(), name: v.body.profile.name, email,
    institution: v.body.profile.institute, stage: "Faculty", state: "Karnataka", registered: "Yes", inPerson: "Yes", days: [],
    regNo: v.body.profile.regNo, theme: T02, subtheme: PG, question: "How do I become eligible for a lecturer post after my MD?", consentPublish: "Yes",
  };
  eq((await d("set", { key: `aym:q:${rec.id}`, val: rec, token: v.body.token })).status, 200, "WAC delegate asks");
  eq(db()[`aym:q:${rec.id}`].regNo, "TEST-WAC-0003", "question carries the WAC ID");
  eq((await client()("lookup", { query: rec.ticket.toLowerCase() })).body.hits.length, 1, "Track by ticket");
  eq((await d("lookup", { query: email })).body.hits.length, 1, "Track by own email");
  const stats = await staff("wacDelegatesStats");
  eq(stats.body.linked, 1, "linked count on the staff panel");
  return `${imp.body.imported} imported, signed in as ${v.body.profile.regNo}`;
});

await step("Podcasts: staff add a talk, public list shows it; anonymous save refused", async () => {
  eq((await client()("podcastsSave", { talk: { title: "x", videoUrl: "https://youtu.be/x" } })).status, 403, "anon save");
  const add = await staff("podcastsSave", { talk: { title: "E2E: Life after BAMS", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", mentorName: "Dr QA Mentor" } });
  eq(add.status, 200, "add talk");
  check((await client()("podcastsList")).body.talks.some(t => t.title === "E2E: Life after BAMS"), "public list");
});

await step("Knowledge search: live (mock) results; query PII-redacted before the provider", async () => {
  const before = mockCalls().length;
  const r = await fetch(`${base}/api/knowledge-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "AIAPGET counselling — I am Ananya Rao, ananya.rao@ayurdisha-qa.test", themeCode: "T02" }) });
  const body = await r.json();
  eq(r.status, 200, "status");
  eq(body.ok, true, "ok");
  check(body.journals.length > 0, "journals");
  const sent = mockCalls().slice(before).map(c => c.content).join("\n");
  check(sent.length > 0, "provider called");
  check(!/ananya\.rao@|Ananya Rao/.test(sent), "PII redacted in knowledge search");
});

await step("Public data hygiene: question records and unpublished groups stay staff-only", async () => {
  eq((await client()("get", { key: `aym:q:${recs.Q0.id}` })).status, 403, "question record");
  eq((await client()("get", { key: "aym:ai:config" })).status, 403, "AI config");
  const pub = (await client()("get", { key: "aym:clusters" })).body.value;
  check(pub.every(c => c.status === "Published" && c.answer), "only published groups");
});

await step("Draft existing questions: a question asked before AI was on gets queued once and drafted", async () => {
  eq((await client()("aiBackfill", { dryRun: true })).status, 403, "anonymous backfill refused");
  await staff("aiConfigSet", { patch: { enabled: false } });
  const old = {
    id: "E2EOLD", ticket: "AYM-Q-E2EOLD", createdAt: Date.now() - 40 * 24 * 3600 * 1000, name: "Ira Old", email: "ira.old@ayurdisha-qa.test",
    stage: "Intern", theme: T02, subtheme: PG, question: "What is the eligibility for AIAPGET — can I apply before my internship ends?", context: "",
  };
  eq((await staff("set", { key: `aym:q:${old.id}`, val: old })).status, 200, "pre-AI question saved");
  recs.OLD = old;
  check(!job("OLD"), "AI off: no job for the old question");
  await staff("aiConfigSet", { patch: { enabled: true } });
  const sweep = await runNow({ sweep: true });
  check(!draftOf("OLD"), `the 14-day sweep does not reach it (${JSON.stringify(sweep.sweep)})`);
  const dry = await staff("aiBackfill", { dryRun: true });
  eq(dry.status, 200, `dry run ${JSON.stringify(dry.body)}`);
  check(dry.body.eligible >= 1 && dry.body.sample[0].id === "E2EOLD", `preview lists it first (${JSON.stringify(dry.body.sample)})`);
  check(!job("OLD"), "dry run writes nothing");
  const real = await staff("aiBackfill", { limit: 5 });
  eq(real.status, 200, `backfill ${JSON.stringify(real.body)}`);
  check(real.body.enqueuedIds.includes("q_E2EOLD"), "queued");
  const again = await staff("aiBackfill", { limit: 5 });
  check(!again.body.enqueuedIds.includes("q_E2EOLD"), "re-run does not duplicate");
  const report = await runNow();
  check(draftOf("OLD"), `drafted (${JSON.stringify(report)})`);
  return `${dry.body.eligible} eligible, ${real.body.enqueued} queued`;
});

const extra = [];
await step("Ask Desk (AI on): every form stage, India + Outside India, QR source; AI enqueue failure never fails a submit", async () => {
  const { ASK_STAGES, OUTSIDE_INDIA } = await import("../../shared/askOptions.js");
  const { setEnqueueForTests } = await import("../../server/ai/ops.js");
  const s = students.A;
  const base = { name: "Ananya Rao", email: s.email, institution: "QA Ayurveda College", theme: T02, subtheme: PG, consentPublish: "Yes", registered: "Yes", inPerson: "No", days: [] };
  for (const [i, stage] of ASK_STAGES.entries()) {
    const id = `E2ESTG${String(i).padStart(2, "0")}`;
    const rec = { ...base, id, ticket: `AYM-Q-STG${String(i).padStart(2, "0")}ABC`, createdAt: Date.now(), stage, state: i % 2 ? OUTSIDE_INDIA : "Odisha", source: "qr", question: `How should a ${stage} plan AIAPGET preparation alongside current work?` };
    const r = await s.call("set", { key: `aym:q:${id}`, val: rec, token: s.token });
    eq(r.status, 200, `${stage}: ${JSON.stringify(r.body)}`);
    const saved = db()[`aym:q:${id}`];
    check(saved.stage === stage && saved.state === rec.state && saved.source === "qr", `${stage} stored as sent`);
    extra.push(rec);
  }
  check(extra.some(r => db()[`aym:ai:job:q_${r.id}`]), "AI jobs queued for the new submits");
  setEnqueueForTests(() => { throw new Error("simulated enqueue failure"); });
  try {
    const rec = { ...base, id: "E2EAIFAIL", ticket: "AYM-Q-AIFAIL01", createdAt: Date.now(), stage: "Researcher", state: "Kerala", question: "Which research methodology course should I take first as a new researcher?" };
    const r = await s.call("set", { key: `aym:q:${rec.id}`, val: rec, token: s.token });
    eq(r.status, 200, `submit with failing AI enqueue ${JSON.stringify(r.body)}`);
    check(db()["aym:q:E2EAIFAIL"], "saved");
  } finally { setEnqueueForTests(null); }
  return `${extra.length} stages`;
});

await step("Track: ticket typed with spaces, autocorrected dashes, '#' or no prefix still finds it", async () => {
  const rec = extra[0];
  const code = rec.ticket.slice("AYM-Q-".length);
  for (const typed of [` ${rec.ticket.toLowerCase()} `, `AYM Q ${code}`, `AYM–Q–${code}`, `#${rec.ticket}`, code]) {
    const hits = (await client()("lookup", { query: typed })).body.hits;
    eq(hits.length, 1, `"${typed}"`);
    eq(hits[0].ticket, rec.ticket, "ticket");
  }
});

await step("Insights → Sources: QR visits counted, junk refused, staff sees visits + registrations + questions", async () => {
  eq((await client()("visitSource", { src: "qr" })).status, 200, "visit");
  eq((await client()("visitSource", { src: "<>" })).status, 400, "junk source");
  const v = await staff("visitSourcesGet");
  eq(v.status, 200, "staff read");
  check((v.body.totals || {}).qr >= 1, `qr total ${JSON.stringify(v.body.totals)}`);
  const { summarizeSources } = await import("../../shared/source.js");
  const snap = (await staff("staffSnapshot")).body;
  const row = summarizeSources({ visits: v.body, delegates: snap.users, questions: snap.questions }).find(r => r.source === "qr");
  check(row && row.questions >= extra.length, `qr row ${JSON.stringify(row)}`);
});

await step("Triage panel: re-file a waiting draft to another area (re-queued for a fresh draft); AI stats readable", async () => {
  const q = await queue({ status: "all", shadow: true });
  const it = q.items.find(i => i.id === "q:E2EQOUT");
  check(it && (it.aiDraft.status || "pending") === "pending", `QOUT draft waiting (${it && it.aiDraft.status})`);
  eq((await staff("aiRefile", { id: it.id, theme: "Policy, Public Health & Global Agencies", subtheme: it.subtheme })).status, 400, "same area refused");
  const r = await staff("aiRefile", { id: it.id, theme: T02, subtheme: "PhD pathway", reviewer: "QA official" });
  eq(r.status, 200, `refile ${JSON.stringify(r.body)}`);
  eq(db()["aym:q:E2EQOUT"].theme, T02, "question moved");
  check(r.body.queued || r.body.joinedGroup, "fresh draft queued or joined a group");
  eq((await staff("aiStats")).status, 200, "aiStats");
});

await step("Probe helpers (prod probe): staff session for a probe email, submit, purge leaves real data", async () => {
  const email = "aym-probe+e2e@ayurdisha-qa.test";
  eq((await staff("testProbeSession", { email: students.A.email })).status, 400, "real email refused");
  const s = await staff("testProbeSession", { email });
  eq(s.status, 200, "session");
  const p = client();
  const rec = (await p("regRecover", { email, regNo: s.body.profile.regNo })).body;
  const q = { id: "E2EPROBE1", ticket: "AYM-Q-PROBE001", createdAt: Date.now(), name: s.body.profile.name, email, institution: "x", stage: "Researcher", state: "Kerala", theme: T02, subtheme: PG, question: "[TEST] probe question" };
  eq((await p("set", { key: `aym:q:${q.id}`, val: q, token: rec.token })).status, 200, "probe submit");
  const before = Object.keys(db()).filter(k => k.startsWith("aym:q:")).length;
  const purge = await staff("testProbePurge", { ids: [q.id, recs.Q0.id], tokens: [rec.token, s.body.token] });
  eq(purge.status, 200, "purge");
  eq(JSON.stringify(purge.body.questions), JSON.stringify([q.id]), "only the probe question");
  eq(Object.keys(db()).filter(k => k.startsWith("aym:q:")).length, before - 1, "one question removed");
  check(db()[`aym:q:${recs.Q0.id}`], "real question kept");
});

await step("Staff desk loads in pages (as the browser does): same questions + delegates as the one-shot snapshot; incremental refresh", async () => {
  const { loadStaffDesk, loadDelegatesPaged, refreshDeskIncremental } = await import("../../src/staff/deskLoader.js");
  const call = async (op, payload) => {
    const r = await staff(op, payload);
    if (r.status >= 400) { const e = new Error(r.body.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.body;
  };
  const snap = (await staff("staffSnapshot")).body;
  const desk = await loadStaffDesk(call, { pageSize: 3 });
  eq(desk.paged, true, "paged ops used");
  eq(JSON.stringify(desk.questions.map(q => q.id).sort()), JSON.stringify(snap.questions.map(q => q.id).sort()), "same questions");
  eq(desk.clustersVersion, snap.clustersVersion, "same groups version");
  const users = await loadDelegatesPaged(call, { pageSize: 2 });
  eq(JSON.stringify(users.map(u => u.email).sort()), JSON.stringify(snap.users.map(u => u.email).sort()), "same delegates");
  const s = students.A;
  const rec = {
    id: "E2EQPAGED", ticket: "AYM-Q-E2EQPAGED", createdAt: Date.now(), name: "Ananya Rao", email: s.email, institution: "QA Ayurveda College",
    stage: "Intern", state: "Odisha", theme: T02, subtheme: PG, question: "How do I plan a PG entrance timetable during internship?", context: "", consentPublish: "Yes",
  };
  eq((await s.call("set", { key: `aym:q:${rec.id}`, val: rec, token: s.token })).status, 200, "submit");
  const next = await refreshDeskIncremental(call, desk);
  check(next && next.questions.some(q => q.id === rec.id), "incremental refresh picked up the new question");
  return `${desk.questions.length} questions · ${users.length} delegates in pages of 3 / 2`;
});

/* ---------------------------------------------------------------- summary */

const statusRows = [];
for (const [id, rec] of Object.entries(recs)) {
  const t = await track(id, students.A.email === rec.email ? "A" : "B");
  const personal = Boolean(t.individualAnswer);
  const group = Boolean(t.cluster && t.cluster.answer);
  const stage = personal || group ? "Answered" : t.reviewStage === "review" ? "Being reviewed" : t.cluster ? "With mentor" : "Received";
  const ai = (personal && t.individualAiAssisted) || (group && t.cluster.aiAssisted) ? "AI note" : "";
  statusRows.push(`${id.padEnd(6)} ${stage.padEnd(15)} ${personal ? "personal" : group ? "group" : "-"} ${ai}`);
}
realLog(`\nTrack status per ticket:\n  ${statusRows.join("\n  ")}`);

const failed = results.filter(r => !r.ok);
realLog(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? ` — ${failed.length} failed` : ""}.`);
if (keepAt) realLog(`Store kept at ${storeFile} (AYM_STORE=file AYM_STORE_FILE=${path.relative(process.cwd(), storeFile)} AI_PROVIDER=mock npx vite)`);
server.close();
if (!keepAt) { try { fs.unlinkSync(storeFile); } catch { /* gone */ } }
console.log = realLog;
process.exit(failed.length ? 1 : 0);
