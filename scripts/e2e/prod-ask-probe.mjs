#!/usr/bin/env node
/**
 * Production Ask Desk probe (run AFTER deploying the Ask submit fix):
 *   1. staff auth with the service token (AYM_SERVICE_TOKEN — never printed)
 *   2. TEST delegate via the staff-only `testProbeSession` (aym-probe+<run>@ayurdisha-qa.test; no
 *      OTP mail, no WAC counter number used) — its session then submits as a normal student
 *   3. three "[TEST]" questions (different stages / themes / states, source=qr) + one resend
 *   4. each one on the staff desk (staffSnapshot), on Track by ticket, and by email for the owner
 *   5. AI: a job queued (or already drafted / failed) when AI is on — never a failed submit
 *   6. read-only checks: public pages + CSP, ping, public stats, podcasts, published groups,
 *      WAC results, anonymous staff ops refused, Sources stats, AI config
 *   7. cleanup ALWAYS (even after a failure): dry run, purge, re-sweep late AI drafts, verify gone
 * Prints the HTTP status + error body for anything that fails. Exit 1 on any failure.
 *
 *   AYM_SERVICE_TOKEN='…' node scripts/e2e/prod-ask-probe.mjs [--base=https://ayushmarg.vercel.app]
 *   node scripts/e2e/prod-ask-probe.mjs --local      # same steps on an isolated local file store
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { serviceHeaders, hasServiceToken, NO_TOKEN_HELP, redactToken } from "../lib/staffAuth.mjs";
import { loadStaffDesk, loadDelegatesPaged } from "../../src/staff/deskLoader.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const LOCAL = Boolean(args.local);
let BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
let localServer = null;
let localStore = "";

if (LOCAL) {
  localStore = path.join(os.tmpdir(), `aym-probe-${process.pid}.json`);
  fs.writeFileSync(localStore, "{}");
  const localToken = `local-probe-${crypto.randomBytes(24).toString("hex")}`;
  Object.assign(process.env, {
    AYM_STORE: "file", AYM_STORE_FILE: localStore, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test",
    STAFF_SERVICE_TOKEN: localToken, AYM_SERVICE_TOKEN: localToken,
  });
  delete process.env.VERCEL;
  const quiet = fn => (...a) => { if (!/\[aym-/.test(a.join(" "))) fn(...a); };
  console.error = quiet(console.error);
  const { aymStoreHandler, aiWorkerHandler } = await import("../../server/storePlugin.js");
  localServer = http.createServer((req, res) => (req.url.startsWith("/api/ai-worker") ? aiWorkerHandler(req, res) : aymStoreHandler(req, res)));
  await new Promise(r => localServer.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${localServer.address().port}`;
}
if (!hasServiceToken()) { console.log(NO_TOKEN_HELP); process.exit(2); }

const RUN = `${Date.now().toString(36)}`;
const EMAIL = `aym-probe+${RUN}@ayurdisha-qa.test`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const redact = s => redactToken(s);

/** Reads and server-idempotent writes (question resend = duplicate) are retried on a dropped connection / 502–504. */
const RETRY_OPS = new Set([
  "ping", "whoami", "aiConfigGet", "aiQueue", "aiBackfill", "staffSnapshot", "staffCounts", "staffClusters", "staffQuestionsPage",
  "staffDelegatesPage", "lookup", "publicStats", "podcastsList", "get", "wacResultsGet", "visitSourcesGet", "set", "testProbePurge",
]);
const RETRY_STATUS = new Set([0, 502, 503, 504]);
let retries = 0;

function client(extraHeaders = {}) {
  const jar = new Map();
  return async function call(op, payload = {}) {
    const tries = RETRY_OPS.has(op) ? 3 : 1;
    let out;
    for (let i = 0; i < tries; i++) {
      out = await callOnce(op, payload);
      if (!RETRY_STATUS.has(out.status) || i === tries - 1) break;
      retries += 1;
      console.log(`  retry ${op} after HTTP ${out.status} ${out.status ? "" : out.body.error}`);
      await sleep(1500 * 2 ** i);
    }
    return out;
  };
  async function callOnce(op, payload) {
    const t0 = Date.now();
    let r;
    try {
      r = await fetch(`${BASE}/api/aym-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
        body: JSON.stringify({ op, ...payload }),
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      return { status: 0, body: { error: `network: ${e.message}` }, ms: Date.now() - t0 };
    }
    for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
    return { status: r.status, body, ms: Date.now() - t0 };
  }
}

/** The staff desk exactly as the browser loads it (paged; one-shot snapshot on an older deploy). */
async function loadDesk() {
  const call = async (op, payload) => {
    const r = await staff(op, payload);
    if (r.status >= 400 || r.status === 0) {
      const e = new Error(`${op}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      e.status = r.status;
      if (r.status === 400 && /unknown op/i.test(String(r.body.error || ""))) e.message = "unknown op";
      throw e;
    }
    return r.body;
  };
  const t0 = Date.now();
  const desk = await loadStaffDesk(call, { retry: { attempts: 1 } });
  const users = desk.users || await loadDelegatesPaged(call, { retry: { attempts: 1 } });
  return { questions: desk.questions, users, paged: desk.paged, ms: Date.now() - t0 };
}

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${redact(detail)}` : ""}`);
}
async function step(name, fn) {
  try { report(name, true, (await fn()) || ""); }
  catch (e) { report(name, false, e.message); }
}
function expect(res, status, what) {
  if (res.status !== status) throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
  return res.body;
}
const check = (c, m) => { if (!c) throw new Error(m); };

const staff = client(serviceHeaders());
const student = client();
const anon = client();
let token = "";
const tokens = [];
let profile = null;
const asked = [];

console.log(`AYURDISHA Ask Desk probe → ${BASE} (run ${RUN})\n`);

const QUESTIONS = [
  { stage: "Changing careers", state: "Outside India", theme: "Research, Evidence & Publication", subtheme: "Framing a research question",
    question: "[TEST] Probe: how do I move from clinical practice into Ayurveda research methodology work?" },
  { stage: "Researcher", state: "Odisha", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
    question: "[TEST] Probe: which official bulletin should I read first before applying for AIAPGET?" },
  { stage: "Ayurveda student (other course)", state: "Kerala", theme: "Entrepreneurship & Start-ups", subtheme: "Validating the idea",
    question: "[TEST] Probe: how should I test demand for a small Ayurveda wellness product idea?" },
];

try {
  await step("ping + staff auth (service token)", async () => {
    const ping = expect(await anon("ping"), 200, "ping");
    const me = expect(await staff("whoami"), 200, "whoami");
    check(me.staff === true && me.role === "admin", "service token accepted as admin");
    return `backend ${ping.backend}${ping.projectId ? ` (${ping.projectId})` : ""}`;
  });

  let aiCfg = null;
  await step("AI config readable", async () => {
    if (LOCAL) {
      // Mirror production (AI on for every stream, shadow off) on the throwaway store only.
      const streams = Object.fromEntries((await staff("aiConfigGet")).body.streams.map(s => [s.id, true]));
      expect(await staff("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams } }), 200, "local aiConfigSet");
    }
    const b = expect(await staff("aiConfigGet"), 200, "aiConfigGet");
    aiCfg = b.config || {};
    const on = Object.entries(aiCfg.streams || {}).filter(([, v]) => v).length;
    return `enabled=${aiCfg.enabled} shadow=${aiCfg.shadowMode} streamsOn=${on} cap=$${aiCfg.dailySpendCapUSD}`;
  });

  await step("TEST delegate session (staff helper, probe email only)", async () => {
    const b = expect(await staff("testProbeSession", { email: EMAIL, source: "qr" }), 200, "testProbeSession");
    tokens.push(b.token);
    profile = b.profile;
    check(b.token && profile && profile.regNo, "token + pass number");
    const refused = await staff("testProbeSession", { email: "someone@gmail.com" });
    check(refused.status === 400, `non-probe email refused (${refused.status})`);
    // Sign in like a returning student (email + pass number) so the browser-style cookie is set too.
    const rec = expect(await student("regRecover", { email: EMAIL, regNo: profile.regNo }), 200, "regRecover");
    token = rec.token;
    tokens.push(token);
    return `pass number ${profile.regNo}`;
  });

  for (const [i, q] of QUESTIONS.entries()) {
    await step(`submit [TEST] question ${i + 1} (${q.stage} · ${q.state} · source=qr)`, async () => {
      const id = `PRB${RUN}${i}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
      const rec = {
        name: profile.name, email: profile.email, mobile: "", state: q.state, institution: profile.institute, stage: q.stage,
        registered: "Yes", regNo: profile.regNo, inPerson: "Not yet confirmed", days: [], theme: q.theme, subtheme: q.subtheme,
        question: q.question, context: "", outcome: "", consentFollow: "No", id, ticket: `AYM-Q-${id}`.slice(0, 24),
        createdAt: Date.now(), consentPublish: "Yes", anonId: "U-PROBE00000", delegateNo: profile.regNo, source: "qr",
      };
      const r = await student("set", { key: `aym:q:${id}`, val: rec, token });
      expect(r, 200, "submit");
      asked.push(rec);
      return `${rec.ticket} in ${r.ms} ms`;
    });
  }

  await step("resend of the same question is an idempotent success", async () => {
    check(asked[0], "first question saved");
    const r = await student("set", { key: `aym:q:${asked[0].id}`, val: asked[0], token });
    const b = expect(r, 200, "resend");
    check(b.duplicate === true, `duplicate flag (${JSON.stringify(b)})`);
  });

  await step("questions on the staff desk with stage / state / source", async () => {
    const b = await loadDesk();
    for (const rec of asked) {
      const q = (b.questions || []).find(x => x.id === rec.id);
      check(q, `${rec.ticket} on the desk`);
      check(q.stage === rec.stage && q.state === rec.state && q.source === "qr", `${rec.ticket} fields ${JSON.stringify({ stage: q.stage, state: q.state, source: q.source })}`);
    }
    check((b.users || []).some(u => u.email === EMAIL), "probe delegate on the delegates list");
    return `${asked.length} found among ${(b.questions || []).length} (${b.paged ? "paged" : "one-shot snapshot"}, ${b.ms} ms)`;
  });

  await step("one-shot staffSnapshot still answers (scripts / older clients)", async () => {
    const r = await staff("staffSnapshot");
    check(r.status === 200 || (r.status === 413 && r.body.code === "too_large"), `staffSnapshot HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return r.status === 200 ? `${(r.body.questions || []).length} questions in ${r.ms} ms` : "too large — paged loading required";
  });

  await step("Track by ticket (any case) and by email for the owner", async () => {
    for (const rec of asked) {
      const hits = expect(await anon("lookup", { query: ` ${rec.ticket.toLowerCase()} ` }), 200, "lookup").hits || [];
      check(hits.length === 1 && hits[0].ticket === rec.ticket, `${rec.ticket} found (${hits.length})`);
    }
    const mine = expect(await student("lookup", { query: EMAIL, token }), 200, "lookup email").hits || [];
    check(mine.length >= asked.length, `owner email lookup ${mine.length}`);
    const stranger = expect(await anon("lookup", { query: EMAIL }), 200, "anon email lookup").hits || [];
    check(stranger.length === 0, "email lookup hidden from strangers");
  });

  await step("AI: each submit queued a job (or was drafted) without breaking the submit", async () => {
    if (!aiCfg || !aiCfg.enabled) return "AI is off — nothing to queue (submit still OK)";
    await sleep(LOCAL ? 100 : 4000);
    const b = expect(await staff("aiQueue", { status: "all", shadow: true }), 200, "aiQueue");
    const blob = JSON.stringify([b.working || [], b.failed || [], (b.items || []).map(it => ({ id: it.id, targetId: it.targetId }))]);
    const seen = asked.filter(r => blob.includes(r.id));
    const off = asked.length - seen.length;
    check(seen.length >= 1, `no AI job/draft for any probe question (stream off for all?) ${blob.slice(0, 200)}`);
    return `${seen.length}/${asked.length} with a job or draft${off ? ` (${off} in a stream that is off)` : ""}`;
  });

  /* ---------------- read-only QA ---------------- */

  if (!LOCAL) {
    await step("public pages 200 + CSP allows same-origin API", async () => {
      const bad = [];
      let csp = "";
      for (const p of ["/", "/welcome", "/mentors", "/about", "/privacy", "/terms", "/disclaimer", "/ask", "/#track", "/sitemap.xml", "/robots.txt"]) {
        const r = await fetch(`${BASE}${p}`, { redirect: "follow" });
        if (r.status !== 200) bad.push(`${p} ${r.status}`);
        if (p === "/") csp = r.headers.get("content-security-policy") || "";
      }
      check(!bad.length, bad.join(", "));
      check(/connect-src 'self'/.test(csp), `CSP connect-src (${csp.slice(0, 80)})`);
    });
  }

  await step("public ops: publicStats, podcasts, published groups, WAC results", async () => {
    const s = expect(await anon("publicStats"), 200, "publicStats");
    const g = await fetch(`${BASE}/api/aym-store?op=publicClusters`).catch(() => null);
    if (g && g.status === 200) {
      const gv = (await g.json()).value || [];
      check(gv.every(c => c.status === "Published" && c.answer), "GET publicClusters is published-only");
    }
    expect(await anon("podcastsList"), 200, "podcastsList");
    const cl = expect(await anon("get", { key: "aym:clusters" }), 200, "clusters").value || [];
    check(cl.every(c => c.status === "Published" && c.answer), "only published groups are public");
    expect(await anon("wacResultsGet"), 200, "wacResultsGet");
    return `asked ${s.questionsAsked ?? "?"} · answered ${s.questionsAnswered ?? "?"} · registered ${s.registeredStudents ?? "?"}`;
  });

  await step("anonymous callers refused on staff / AI / probe ops", async () => {
    const ops = ["staffSnapshot", "staffCounts", "staffQuestionsPage", "staffDelegatesPage", "staffClusters", "aiQueue", "aiConfigGet", "aiApprove", "aiBackfill", "visitSourcesGet", "answerIndividual", "clustersSave", "testProbeSession", "testProbeRegister", "testProbePurge"];
    const leaks = [];
    for (const op of ops) { const r = await anon(op, {}); if (r.status !== 403) leaks.push(`${op} ${r.status}`); }
    check(!leaks.length, leaks.join(", "));
    const del = await staff("del", { key: "aym:q:__probe_nonexistent__" });
    if (!LOCAL) check(del.status === 403, `question delete disabled in production (${del.status})`);
    return `${ops.length} refused`;
  });

  await step("Insights → Sources stats readable", async () => {
    const b = expect(await staff("visitSourcesGet"), 200, "visitSourcesGet");
    return `qr visits ${(b.totals || {}).qr || 0}`;
  });

  await step("AI backfill dry run (read-only)", async () => {
    if (!aiCfg || !aiCfg.enabled) return "AI off — skipped";
    const r = await staff("aiBackfill", { dryRun: true });
    const b = expect(r, 200, "aiBackfill dryRun");
    return `eligible ${b.eligible} · would queue ${b.willEnqueue}`;
  });
} finally {
  /* ---------------- cleanup ---------------- */
  const ids = asked.map(r => r.id);
  await step("cleanup: dry run lists only this run's TEST data", async () => {
    const b = expect(await staff("testProbePurge", { dryRun: true, ids }), 200, "purge dry run");
    const extra = (b.questions || []).filter(id => !ids.includes(id));
    return `questions ${b.questions.length}${extra.length ? ` (+${extra.length} from earlier probe runs)` : ""} · drafts ${b.aiDrafts.length} · jobs ${b.aiJobs.length} · delegates ${b.delegates.length} · groups ${b.groupsTouched.length}`;
  });
  await step("cleanup: purge TEST questions, AI drafts/jobs, sessions, delegate", async () => {
    if (!LOCAL) await sleep(8000); // let a kicked worker finish drafting before sweeping
    expect(await staff("testProbePurge", { ids, tokens }), 200, "purge");
    if (!LOCAL) await sleep(15000);
    const again = expect(await staff("testProbePurge", { ids }), 200, "late sweep");
    return `late sweep removed ${again.aiDrafts.length} drafts, ${again.aiJobs.length} jobs`;
  });
  await step("cleanup verified: nothing left on Track, desk or delegates", async () => {
    for (const rec of asked) {
      const hits = (await anon("lookup", { query: rec.ticket })).body.hits || [];
      check(!hits.length, `${rec.ticket} still on Track`);
    }
    const snap = await loadDesk();
    check(!(snap.questions || []).some(q => ids.includes(q.id)), "question still on the desk");
    check(!(snap.users || []).some(u => u.email === EMAIL), "probe delegate still listed");
    const dry = expect(await staff("testProbePurge", { dryRun: true, ids }), 200, "final dry run");
    check(!dry.questions.length && !dry.aiDrafts.length && !dry.aiJobs.length && !dry.delegates.length, `leftovers ${JSON.stringify(dry)}`);
  });
  await staff("logout");
  if (localServer) { localServer.close(); try { fs.unlinkSync(localStore); } catch { /* gone */ } }
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} probe steps passed${failed.length ? ` — ${failed.length} FAILED` : ""}${retries ? ` (${retries} retried request${retries === 1 ? "" : "s"})` : ""}.`);
process.exit(failed.length ? 1 : 0);
