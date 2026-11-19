/**
 * End-to-end API pipeline on an isolated file store (never Firestore / Blob):
 * register (email OTP) → WAC number issued → Ask Desk → staff merge → Excel round-trip →
 * Track shows the mentor's answer for every member; individual answers; manual merge;
 * detach; version conflicts.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";

const storeFile = path.join(os.tmpdir(), `aym-pipeline-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
process.env.AYM_STORE = "file";
process.env.AYM_STORE_FILE = storeFile;
process.env.AYM_MAIL = "console";

const otpLog = new Map();
const realLog = console.log;
console.log = (...args) => {
  const line = args.join(" ");
  const m = line.match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-(store|mail|notify|register)\]/.test(line)) return;
  realLog(...args);
};

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { buildClusters, detachMember, auditClusters, suggestMerges, keepGroupsApart } = await import("../shared/merge.js");
const { mentorBriefRows, parseAnswerGrid, applyClusterAnswers } = await import("../shared/mentorWorkbook.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

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

function client(extraHeaders = {}) {
  const jar = new Map();
  return async function call(op, payload = {}) {
    const r = await fetch(`${base}/api/aym-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

const THEME = "Academics, Teaching & Higher Education";
const SUB = "Choosing a PG branch";
const QUESTIONS = [
  "How should I prepare for AIAPGET?",
  "AIAPGET preparation tips for final year BAMS",
  "aiapget ki taiyari kaise kare",
  "When should I start AIAPGET preparation — internship or final prof?",
  "Is Kayachikitsa a good PG branch if I like clinical work?",
];

const students = [];
let staff;

test("register: OTP email → verify → WAC number issued as 11WAC/2026/NNNN", async () => {
  for (let i = 0; i < QUESTIONS.length; i++) {
    const call = client();
    const email = `qa.pipeline${i}@example.com`;
    const start = await call("regStart", { name: `QA Pipeline ${i}`, age: 22, sex: "Female", institute: "QA Institute", email });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.ok(!JSON.stringify(start.body).match(/\b\d{6}\b/), "OTP is never returned to the browser");
    const otp = otpLog.get(email);
    assert.match(otp || "", /^\d{6}$/);
    const wrong = await call("regVerify", { email, otp: otp === "000000" ? "111111" : "000000" });
    assert.equal(wrong.status, 403);
    const ok = await call("regVerify", { email, otp });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.match(ok.body.profile.regNo, /^11WAC\/2026\/\d{4}$/);
    students.push({ call, email, regNo: ok.body.profile.regNo, token: ok.body.token });
  }
  const nums = students.map(s => s.regNo);
  assert.equal(new Set(nums).size, nums.length, "every WAC number is unique");
});

test("register: validation and self-typed WAC numbers are rejected", async () => {
  const call = client();
  const bad = await call("regStart", { name: "Q", age: 9, sex: "", institute: "", email: "nope" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /full name|age|email/);
  const me = await students[0].call("regMe", {});
  assert.equal(me.status, 200);
  const keep = me.body.profile.regNo;
  const tamper = await students[0].call("regSaveWac", { regNo: "11WAC/2026/9999" });
  assert.equal(tamper.body.profile.regNo, keep, "public cannot overwrite an issued WAC number");
});

test("ask desk: registered students submit; unregistered visitors are refused", async () => {
  const anon = client();
  const refused = await anon("set", {
    key: "aym:q:QAANON0001",
    val: { id: "QAANON0001", ticket: "AYM-Q-QAANON", question: "x", theme: THEME, subtheme: SUB },
  });
  assert.equal(refused.status, 400);
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const id = `QAPIPE${String(i).padStart(4, "0")}`;
    const rec = {
      id, ticket: `AYM-Q-QA${i}${Date.now().toString(36).toUpperCase().slice(-4)}`, createdAt: Date.now() + i,
      name: `QA Pipeline ${i}`, email: s.email, institution: "QA Institute", stage: "Intern", state: "Odisha",
      theme: THEME, subtheme: SUB, question: QUESTIONS[i], context: "", consentPublish: "Yes",
    };
    const r = await s.call("set", { key: `aym:q:${id}`, val: rec, token: s.token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const retry = await s.call("set", { key: `aym:q:${id}`, val: rec, token: s.token });
    assert.equal(retry.status, 200, "same ticket retry is idempotent");
    s.question = rec;
  }
});

test("staff: the legacy PIN login is gone; the service token opens staff ops", async () => {
  const anon = client();
  assert.equal((await anon("login", { pin: "nope1234" })).status, 410);
  assert.equal((await anon("staffSnapshot")).status, 403);
  staff = client(serviceHeaders());
  assert.equal((await staff("whoami")).body.staff, true);
});

let snapshot;
let clusters;
let version;

test("merge: staff snapshot → auto-merge → save; AIAPGET asks share one group", async () => {
  const snap = await staff("staffSnapshot");
  assert.equal(snap.status, 200);
  snapshot = snap.body;
  // Test addresses are filtered out of the staff desk by design; merge our own records.
  const subs = students.map(s => s.question);
  clusters = buildClusters(subs, 0.42, true, snapshot.clusters || []);
  const audit = auditClusters(clusters, subs);
  assert.deepEqual(audit.unclustered, []);
  const prep = clusters.find(c => c.memberIds.includes(subs[0].id));
  [1, 2].forEach(i => assert.ok(prep.memberIds.includes(subs[i].id), QUESTIONS[i]));
  assert.ok(!prep.memberIds.includes(subs[3].id), "'when should I start' is a timing ask — a different answer, never auto-merged");
  assert.ok(!prep.memberIds.includes(subs[4].id), "branch-choice ask stays separate");
  const saved = await staff("clustersSave", { clusters, version: snapshot.clustersVersion });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  version = saved.body.clustersVersion;
  assert.equal(version, snapshot.clustersVersion + 1);
});

test("version locking: a stale save gets 409 and does not overwrite", async () => {
  const stale = await staff("clustersSave", { clusters: [], version: version - 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.clustersVersion, version);
  const now = await staff("get", { key: "aym:clusters" });
  assert.equal(now.body.value.length, clusters.length);
});

test("track before answer: ticket lookup shows 'grouped' without answer text", async () => {
  const s = students[0];
  const r = await client()("lookup", { query: s.question.ticket.toLowerCase() });
  assert.equal(r.body.hits.length, 1);
  assert.equal(r.body.hits[0].cluster.answer, "");
  assert.ok(r.body.hits[0].cluster.memberIds.length >= 3);
});

test("mentor pack: Excel export → mentor fills MERGED_ANSWER → import → every member sees it", async () => {
  const subs = students.map(s => s.question);
  const prep = clusters.find(c => c.memberIds.includes(subs[0].id));
  const rows = mentorBriefRows(clusters, subs);
  rows.slice(1).forEach(r => assert.equal(r.length, rows[0].length, "every row aligns with the header"));
  const col = name => rows[0].indexOf(name);
  const ANSWER = "Plan AIAPGET over 12 months: syllabus map, weekly mocks, and revise Samhitas in internship.";
  rows.slice(1).forEach(r => {
    if (r[col("Cluster_ID")] === prep.id) {
      r[col("MERGED_ANSWER")] = ANSWER;
      r[col("ACTION_1")] = "Download the AIAPGET information bulletin";
      r[col("MENTOR_NAME_DESIGNATION")] = "QA Mentor, Professor";
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "MENTOR_BRIEF");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  const back = XLSX.read(buf, { type: "buffer" });
  const grid = XLSX.utils.sheet_to_json(back.Sheets.MENTOR_BRIEF, { header: 1, defval: "" });
  const parsed = parseAnswerGrid(grid);
  const applied = applyClusterAnswers(clusters, parsed.filter(r => r.kind === "cluster"));
  assert.equal(applied.filled, 1);
  assert.deepEqual(applied.unknown, []);
  const g = applied.clusters.find(c => c.id === prep.id);
  assert.equal(g.actions[0], "Download the AIAPGET information bulletin");
  assert.equal(g.mentorName, "QA Mentor, Professor");
  const saved = await staff("clustersSave", { clusters: applied.clusters, version });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  version = saved.body.clustersVersion;
  clusters = saved.body.clusters;
  for (const id of prep.memberIds) {
    const s = students.find(x => x.question.id === id);
    const r = await client()("lookup", { query: s.question.ticket });
    assert.equal(r.body.hits[0].cluster.answer, ANSWER, `${s.question.ticket} sees the merged answer`);
    assert.equal(r.body.hits[0].cluster.mentorName, "QA Mentor, Professor");
  }
  const other = students[4].question;
  const r = await client()("lookup", { query: other.ticket });
  assert.equal(r.body.hits[0].cluster.answer, "", "non-member does not see it");
});

test("track by email: only the signed-in owner (or staff) can look up by email", async () => {
  const s = students[1];
  const stranger = await client()("lookup", { query: s.email });
  assert.deepEqual(stranger.body.hits, []);
  const owner = await s.call("lookup", { query: s.email });
  assert.equal(owner.body.hits.length, 1);
  assert.ok(owner.body.hits[0].cluster.answer);
  const viaStaff = await staff("lookup", { query: s.email });
  assert.equal(viaStaff.body.hits.length, 1);
});

test("individual answer: Insights → Provide answer → Track shows the personal reply", async () => {
  const q = students[4].question;
  const empty = await staff("answerIndividual", { id: q.id, answer: "" });
  assert.equal(empty.status, 400);
  const r = await staff("answerIndividual", {
    id: q.id, answer: "Kayachikitsa suits clinical interest; shadow an OPD first.", mentorName: "QA Mentor",
    actions: ["Shadow a Kayachikitsa OPD for a week"], resources: ["NCISM PG regulations"],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const t = await client()("lookup", { query: q.ticket });
  assert.equal(t.body.hits[0].individualAnswer, "Kayachikitsa suits clinical interest; shadow an OPD first.");
  assert.equal(t.body.hits[0].individualMentor, "QA Mentor");
  const anon = await client()("answerIndividual", { id: q.id, answer: "hijack" });
  assert.equal(anon.status, 403);
});

test("manual merge: answer kept, members unioned, conflicting answers refused (422)", async () => {
  const subs = students.map(s => s.question);
  const answered = clusters.find(c => c.answer);
  const single = clusters.find(c => c.memberIds.includes(subs[4].id));
  const r = await staff("clustersMerge", { ids: [single.id, answered.id], version });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  version = r.body.clustersVersion;
  clusters = r.body.clusters;
  const merged = clusters.find(c => c.id === r.body.mergedId);
  assert.equal(merged.answer, answered.answer, "existing answer survives regardless of pick order");
  assert.ok(merged.memberIds.includes(subs[4].id));
  assert.deepEqual(auditClusters(clusters, subs).duplicated, []);
  const t = await client()("lookup", { query: subs[4].ticket });
  assert.equal(t.body.hits[0].cluster.answer, answered.answer);

  const byId = Object.fromEntries(subs.map(s => [s.id, s]));
  let next = detachMember(clusters, merged.id, subs[4].id, byId);
  const solo = next.find(c => c.memberIds.includes(subs[4].id));
  next = next.map(c => (c.id === solo.id ? { ...c, answer: "Different answer", status: "Answered" } : c));
  const s2 = await staff("clustersSave", { clusters: next, version });
  assert.equal(s2.status, 200);
  version = s2.body.clustersVersion;
  clusters = s2.body.clusters;
  const conflict = await staff("clustersMerge", { ids: [merged.id, solo.id], version });
  assert.equal(conflict.status, 422);
  assert.equal(conflict.body.code, "ANSWER_CONFLICT");
  const staleMerge = await staff("clustersMerge", { ids: [merged.id, solo.id], version: version - 1 });
  assert.ok([409, 422].includes(staleMerge.status));
});

test("detach: split-out student loses the group answer on Track; others keep it", async () => {
  const subs = students.map(s => s.question);
  const byId = Object.fromEntries(subs.map(s => [s.id, s]));
  const g = clusters.find(c => c.memberIds.includes(subs[0].id));
  const next = detachMember(clusters, g.id, subs[3].id, byId);
  const saved = await staff("clustersSave", { clusters: next, version });
  assert.equal(saved.status, 200);
  version = saved.body.clustersVersion;
  const out = await client()("lookup", { query: subs[3].ticket });
  assert.equal(out.body.hits[0].cluster.answer, "");
  const kept = await client()("lookup", { query: subs[0].ticket });
  assert.ok(kept.body.hits[0].cluster.answer);
});

test("server integrity: a save with a duplicated member is repaired, not stored twice", async () => {
  const subs = students.map(s => s.question);
  const dup = [...clusters, { id: "AYM-C-DUPE", theme: THEME, subtheme: SUB, memberIds: [subs[0].id], status: "New" }];
  const saved = await staff("clustersSave", { clusters: dup, version });
  assert.equal(saved.status, 200);
  version = saved.body.clustersVersion;
  assert.ok(!saved.body.clusters.some(c => c.id === "AYM-C-DUPE"));
  assert.deepEqual(auditClusters(saved.body.clusters, subs).duplicated, []);
});

test("suggested merges: Keep apart is stored with the groups and survives reload + re-merge; Accept respects the cap", async () => {
  const extra = [
    ["QASUGG1", "Which books should I read for AIAPGET?", "Choosing a PG branch"],
    ["QASUGG2", "Which books should I read for AIAPGET?", "PhD pathway"],
    ["QASUGG3", "How do I write a good thesis synopsis?", "Choosing a PG branch"],
    ["QASUGG4", "How do I write a good thesis synopsis?", "PhD pathway"],
  ].map(([id, question, subtheme], i) => ({ id, ticket: `AYM-Q-${id}`, createdAt: 1_800_000_000_000 + i, theme: THEME, subtheme, question, context: "" }));
  const subs = [...students.map(s => s.question), ...extra];
  const current = (await staff("get", { key: "aym:clusters" })).body.value;
  let next = buildClusters(subs, 0.48, true, current);
  let r = await staff("clustersSave", { clusters: next, version });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  version = r.body.clustersVersion;
  const has = (list, x, y) => suggestMerges(r.body.clusters, subs).some(s => {
    const own = id => list.find(c => c.memberIds.includes(id)).id;
    return [s.a, s.b].includes(own(x)) && [s.a, s.b].includes(own(y));
  });
  assert.ok(has(r.body.clusters, "QASUGG1", "QASUGG2"), "same ask in two sub-areas is suggested");
  const s12 = suggestMerges(r.body.clusters, subs).find(s => [s.a, s.b].includes(r.body.clusters.find(c => c.memberIds.includes("QASUGG1")).id));
  r = await staff("clustersSave", { clusters: keepGroupsApart(r.body.clusters, s12.a, s12.b), version });
  assert.equal(r.status, 200);
  version = r.body.clustersVersion;

  const reloaded = (await staff("get", { key: "aym:clusters" })).body.value;
  assert.ok(reloaded.some(c => (c.apartFrom || []).includes("QASUGG2")), "decision persisted with the clusters data");
  next = buildClusters(subs, 0.48, true, reloaded);
  r = await staff("clustersSave", { clusters: next, version });
  version = r.body.clustersVersion;
  assert.ok(!has(r.body.clusters, "QASUGG1", "QASUGG2"), "re-merge does not suggest a kept-apart pair again");

  const s34 = suggestMerges(r.body.clusters, subs).find(s => [s.a, s.b].includes(r.body.clusters.find(c => c.memberIds.includes("QASUGG3")).id));
  assert.ok(s34, "thesis synopsis pair offered");
  const big = { id: "AYM-C-QABIG", theme: THEME, subtheme: SUB, memberIds: ["QAX1", "QAX2", "QAX3", "QAX4", "QAX5", "QAX6", "QAX7"], status: "New", representative: "x" };
  r = await staff("clustersSave", { clusters: [...r.body.clusters, big], version });
  version = r.body.clustersVersion;
  const over = await staff("clustersMerge", { ids: [big.id, s34.a], version, suggestion: true });
  assert.equal(over.status, 422);
  assert.equal(over.body.code, "OVER_CAP");
  const ok = await staff("clustersMerge", { ids: [s34.a, s34.b], version, suggestion: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  version = ok.body.clustersVersion;
  const merged = ok.body.clusters.find(c => c.id === ok.body.mergedId);
  assert.deepEqual([...merged.memberIds].sort(), ["QASUGG3", "QASUGG4"]);
  const stale = await staff("clustersMerge", { ids: [s34.a, s34.b], version: version - 1, suggestion: true });
  assert.ok([400, 409].includes(stale.status));
  const cleaned = ok.body.clusters.filter(c => c.id !== big.id);
  const back = await staff("clustersSave", { clusters: cleaned, version });
  version = back.body.clustersVersion;
});

test("public: cluster list hides unpublished groups and private fields", async () => {
  const pub = await client()("get", { key: "aym:clusters" });
  assert.ok(pub.body.value.every(c => c.status === "Published" && c.answer));
  const qGet = await client()("get", { key: `aym:q:${students[0].question.id}` });
  assert.equal(qGet.status, 403, "question records are staff-only");
  assert.equal((await client()("staffSnapshot")).status, 403);
});
