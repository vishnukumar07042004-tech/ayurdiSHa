#!/usr/bin/env node
/**
 * Registration + Ask Desk burst test (run by a person, AFTER deploying the burst-safe build).
 *
 *   1. staff auth with the service token (AYM_SERVICE_TOKEN — read from the environment, never printed)
 *   2. registrations in rising waves (25 → 50 → 100 → 200 concurrent, capped by
 *      --max-concurrency), each = the public OTP start (`regStart`, real limits; probe addresses
 *      are never mailed) + the staff-only `testProbeRegister` (the exact post-OTP code path:
 *      user upsert, pass number from a block, regno claim, session). Probe delegates only:
 *      aym-probe+load-<run>-<n>@ayurdisha-qa.test; numbers come from the separate load-test range
 *      11WAC/2026/9xxxxx, never the real sequence.
 *   3. idempotency spot-check (re-register 10 delegates → same number)
 *   4. N Ask Desk submits ("[TEST][LOAD] …", never queued for DISHA → the daily cap is untouched)
 *      + 5 resends of the same ticket (must come back as duplicates)
 *   5. server-side audit: probe delegates, pass numbers, duplicates (must be 0), DISHA jobs (0)
 *   6. cleanup ALWAYS (even after a failure or Ctrl-C): purge questions, delegates, sessions,
 *      regno / email indexes, OTP rate records; verify nothing is left
 * Prints a summary table to paste into a document. Exit 1 on duplicates, < 99 % success or
 * leftovers.
 *
 *   AYM_SERVICE_TOKEN='…' node scripts/load/register-burst.mjs --total=400 --max-concurrency=200
 *   node scripts/load/register-burst.mjs --dry-run            # plan + leftovers check, writes nothing
 *   node scripts/load/register-burst.mjs --cleanup-only       # purge probe data from earlier runs
 *   node scripts/load/register-burst.mjs --local --total=200  # same run on an isolated local file store
 * Other flags: --base=https://… --submits=N --levels=25,50,100,200 --timeout-ms=35000
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { serviceHeaders, hasServiceToken, NO_TOKEN_HELP, redactToken } from "../lib/staffAuth.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const LOCAL = Boolean(args.local);
const DRY = Boolean(args["dry-run"]);
const CLEANUP_ONLY = Boolean(args["cleanup-only"]);
const TOTAL = Math.max(1, Number(args.total || 400));
const MAX_CONC = Math.max(1, Number(args["max-concurrency"] || 200));
const SUBMITS = Math.max(0, Number(args.submits ?? Math.min(TOTAL, 200)));
const LEVELS = String(args.levels || "25,50,100,200").split(",").map(Number).filter(n => n > 0 && n <= MAX_CONC);
if (!LEVELS.length || LEVELS[LEVELS.length - 1] < MAX_CONC) LEVELS.push(MAX_CONC);
const TIMEOUT_MS = Number(args["timeout-ms"] || 35000);
let BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
const STATE_DIR = os.tmpdir();
const STATE_PREFIX = "aym-load-";
let localServer = null;
let localStore = "";

if (LOCAL) {
  localStore = path.join(os.tmpdir(), `aym-load-local-${process.pid}.json`);
  fs.writeFileSync(localStore, "{}");
  const localToken = `local-load-${crypto.randomBytes(24).toString("hex")}`;
  Object.assign(process.env, {
    AYM_STORE: "file", AYM_STORE_FILE: localStore, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test",
    STAFF_SERVICE_TOKEN: localToken, AYM_SERVICE_TOKEN: localToken,
  });
  delete process.env.VERCEL;
  const quiet = fn => (...a) => { if (!/\[aym-|DEV FALLBACK/.test(a.join(" "))) fn(...a); };
  console.error = quiet(console.error);
  const realLog = console.log;
  console.log = quiet(realLog);
  const { aymStoreHandler } = await import("../../server/storePlugin.js");
  localServer = http.createServer(aymStoreHandler);
  await new Promise(r => localServer.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${localServer.address().port}`;
}
if (!hasServiceToken()) { console.log(NO_TOKEN_HELP); process.exit(2); }

const RUN = Date.now().toString(36);
const redact = s => redactToken(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOAD_MARK = "[TEST][LOAD]";

function client(extraHeaders = {}) {
  const jar = new Map();
  return async function call(op, payload = {}) {
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE}/api/aym-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
        body: JSON.stringify({ op, ...payload }),
        signal: ctrl.signal,
      });
      for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
        const [pair, ...attrs] = c.split(";");
        const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
      }
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
      return { status: r.status, body, ms: performance.now() - t0 };
    } catch (e) {
      return { status: 0, body: { error: e.name === "AbortError" ? "timeout" : `network: ${e.message}` }, ms: performance.now() - t0 };
    } finally {
      clearTimeout(timer);
    }
  };
}

const staff = client(serviceHeaders());

/* ---------------- stats ---------------- */

function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
function summarize(samples) {
  const ok = samples.filter(s => s.ok);
  const lat = ok.map(s => s.ms).sort((a, b) => a - b);
  const errors = {};
  for (const s of samples.filter(x => !x.ok)) {
    const key = `${s.status}${s.code ? ` ${s.code}` : ""}`;
    errors[key] = (errors[key] || 0) + 1;
  }
  return {
    n: samples.length,
    ok: ok.length,
    rate: samples.length ? (100 * ok.length) / samples.length : 100,
    p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.length ? lat[lat.length - 1] : NaN,
    errors,
  };
}
const fmt = n => (Number.isFinite(n) ? `${Math.round(n)}` : "–");
const errStr = e => Object.entries(e).map(([k, v]) => `${k}×${v}`).join(", ") || "none";

async function pool(items, conc, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

/* ---------------- state (for --cleanup-only after a crash) ---------------- */

const statePath = path.join(STATE_DIR, `${STATE_PREFIX}${RUN}.json`);
const state = { run: RUN, base: BASE, emails: [], tokens: [], ids: [] };
let stateDirty = false;
function saveState(force = false) {
  if (LOCAL || DRY || CLEANUP_ONLY) return;
  if (!force && !stateDirty) return;
  try { fs.writeFileSync(statePath, JSON.stringify(state)); stateDirty = false; } catch { /* best effort */ }
}
const stateTimer = setInterval(() => saveState(), 2000);
stateTimer.unref();

function earlierStates() {
  try {
    return fs.readdirSync(STATE_DIR)
      .filter(f => f.startsWith(STATE_PREFIX) && f.endsWith(".json") && !f.startsWith("aym-load-local-"))
      .map(f => { try { return { file: path.join(STATE_DIR, f), ...JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), "utf8")) }; } catch { return null; } })
      .filter(s => s && s.base === BASE);
  } catch { return []; }
}

/* ---------------- cleanup ---------------- */

async function purgeAll({ emails, tokens, ids }) {
  const chunks = [];
  for (let i = 0; i < Math.max(tokens.length, 1); i += 150) chunks.push(tokens.slice(i, i + 150));
  const totals = { questions: 0, delegates: 0, sessions: 0, aiDrafts: 0, aiJobs: 0 };
  for (let i = 0; i < chunks.length; i++) {
    const r = await staff("testProbePurge", { ids: i === 0 ? ids : [], emails: i === 0 ? emails : [], tokens: chunks[i] });
    if (r.status !== 200) throw new Error(`purge HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    totals.questions += (r.body.questions || []).length;
    totals.delegates += (r.body.delegates || []).length;
    totals.sessions += r.body.sessions || 0;
    totals.aiDrafts += (r.body.aiDrafts || []).length;
    totals.aiJobs += (r.body.aiJobs || []).length;
  }
  const dry = await staff("testProbePurge", { dryRun: true, ids });
  const left = dry.status === 200 ? (dry.body.questions || []).length + (dry.body.delegates || []).length + (dry.body.aiDrafts || []).length + (dry.body.aiJobs || []).length : -1;
  return { ...totals, left };
}

/* ---------------- run ---------------- */

const rows = [];
let exitCode = 0;
let cleanupResult = null;
let audit = null;
let idem = null;
let submitSummary = null;
let resendDupOk = null;

console.log(`AYURDISHA registration burst → ${BASE} (run ${RUN})${LOCAL ? " [local file store]" : ""}`);

const login = await staff("whoami");
if (login.status !== 200 || login.body.staff !== true || login.body.role !== "admin") {
  console.log(redact(`Staff auth failed (service token not accepted): HTTP ${login.status} ${JSON.stringify(login.body).slice(0, 200)}`));
  process.exit(2);
}
const ping = await staff("ping");
console.log(`backend ${ping.body.backend || "?"}${ping.body.projectId ? ` (${ping.body.projectId})` : ""}`);

if (CLEANUP_ONLY) {
  const states = earlierStates();
  const merged = { emails: [], tokens: [], ids: [] };
  for (const s of states) for (const k of Object.keys(merged)) merged[k].push(...(s[k] || []));
  console.log(`cleanup-only: ${states.length} saved run(s), ${merged.emails.length} emails, ${merged.tokens.length} sessions, ${merged.ids.length} questions on file`);
  const before = await staff("testProbePurge", { dryRun: true, ids: merged.ids });
  console.log(`server sees: ${(before.body.delegates || []).length} probe delegates, ${(before.body.questions || []).length} [TEST] questions`);
  cleanupResult = await purgeAll(merged);
  console.log(`removed: ${cleanupResult.delegates} delegates, ${cleanupResult.questions} questions, ${cleanupResult.sessions} sessions · left: ${cleanupResult.left}`);
  if (cleanupResult.left === 0) for (const s of states) { try { fs.unlinkSync(s.file); } catch { /* gone */ } }
  await staff("logout");
  if (localServer) localServer.close();
  process.exit(cleanupResult.left === 0 ? 0 : 1);
}

// Split TOTAL over the waves in proportion to their concurrency.
const sumLevels = LEVELS.reduce((s, n) => s + n, 0);
const plan = LEVELS.map(c => ({ conc: c, n: Math.max(1, Math.round((TOTAL * c) / sumLevels)) }));
plan[plan.length - 1].n += TOTAL - plan.reduce((s, p) => s + p.n, 0);

if (DRY) {
  const ai = await staff("aiConfigGet");
  const leftovers = await staff("testProbePurge", { dryRun: true });
  console.log(`\nPLAN (dry run — nothing written)`);
  for (const p of plan) console.log(`  wave: ${p.n} registrations at ${p.conc} concurrent`);
  console.log(`  then ${Math.min(SUBMITS, TOTAL)} Ask submits at ${MAX_CONC} concurrent ("${LOAD_MARK}", never queued for DISHA)`);
  console.log(`  DISHA: enabled=${ai.body.config && ai.body.config.enabled} cap=$${ai.body.config && ai.body.config.dailySpendCapUSD} (load questions are skipped by the queue)`);
  console.log(`  probe leftovers on the server now: ${(leftovers.body.delegates || []).length} delegates, ${(leftovers.body.questions || []).length} questions`);
  await staff("logout");
  if (localServer) localServer.close();
  process.exit(0);
}

const delegates = [];
let stopping = false;
process.on("SIGINT", () => { if (stopping) process.exit(130); stopping = true; console.log("\nInterrupted — cleaning up…"); });

try {
  let idx = 0;
  for (const [w, p] of plan.entries()) {
    if (stopping) break;
    const reg = [];
    const start = [];
    const total = [];
    const items = Array.from({ length: p.n }, () => idx++);
    const t0 = performance.now();
    await pool(items, p.conc, async i => {
      if (stopping) return;
      const email = `aym-probe+load-${RUN}-${i}@ayurdisha-qa.test`;
      state.emails.push(email);
      stateDirty = true;
      const student = client();
      const a = await student("regStart", { name: "[TEST] AYURDISHA load probe", age: 30, sex: "Other", institute: "[TEST] Probe College", email });
      start.push({ ok: a.status === 200, status: a.status, code: a.body && a.body.code, ms: a.ms });
      const b = await staff("testProbeRegister", { email, source: "load" });
      const ok = b.status === 200 && b.body.profile && b.body.profile.regNo && b.body.token;
      reg.push({ ok, status: b.status, code: b.body && b.body.code, ms: b.ms });
      total.push({ ok: ok && a.status === 200, status: ok ? a.status : b.status, code: ok ? a.body && a.body.code : b.body && b.body.code, ms: a.ms + b.ms });
      if (ok) {
        delegates.push({ email, regNo: b.body.profile.regNo, token: b.body.token });
        state.tokens.push(b.body.token);
      }
    });
    const wallS = (performance.now() - t0) / 1000;
    rows.push({ label: `wave ${w + 1} · otp start`, conc: p.conc, ...summarize(start) });
    rows.push({ label: `wave ${w + 1} · register`, conc: p.conc, ...summarize(reg) });
    rows.push({ label: `wave ${w + 1} · total`, conc: p.conc, ...summarize(total), tput: p.n / wallS });
    const t = rows[rows.length - 1];
    console.log(`wave ${w + 1}: ${p.n} @ ${p.conc} → ${t.ok}/${t.n} ok · p50 ${fmt(t.p50)} ms · p95 ${fmt(t.p95)} ms · ${(p.n / wallS).toFixed(1)}/s · errors ${errStr(t.errors)}`);
  }
  saveState(true);

  // Idempotency: re-registering returns the same number.
  const sample = delegates.slice(0, 10);
  const again = await Promise.all(sample.map(d => staff("testProbeRegister", { email: d.email })));
  again.forEach(r => { if (r.body && r.body.token) state.tokens.push(r.body.token); });
  idem = { checked: sample.length, same: again.filter((r, i) => r.status === 200 && r.body.profile.regNo === sample[i].regNo).length };
  console.log(`idempotency: ${idem.same}/${idem.checked} re-registrations kept their number`);

  // Ask Desk submits.
  const askers = delegates.slice(0, Math.min(SUBMITS, delegates.length));
  const subs = [];
  const asked = [];
  const t0 = performance.now();
  await pool(askers, MAX_CONC, async (d, i) => {
    if (stopping) return;
    const id = `LD${RUN}${i}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
    const rec = {
      name: "[TEST] AYURDISHA load probe", email: d.email, mobile: "", state: "Odisha", institution: "[TEST] Probe College",
      stage: "Intern", registered: "Yes", regNo: d.regNo, inPerson: "Not yet confirmed", days: [],
      theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
      question: `${LOAD_MARK} Load test ${RUN}: how should I plan PG entrance preparation alongside internship duties?`,
      context: "", outcome: "", consentFollow: "No", id, ticket: `AYM-Q-${id}`.slice(0, 24), createdAt: Date.now(),
      consentPublish: "Yes", anonId: "U-LOAD000000", delegateNo: d.regNo, source: "load",
    };
    state.ids.push(id);
    stateDirty = true;
    const r = await client()("set", { key: `aym:q:${id}`, val: rec, token: d.token });
    subs.push({ ok: r.status === 200, status: r.status, code: r.body && r.body.code, ms: r.ms });
    if (r.status === 200) asked.push({ rec, token: d.token });
  });
  const askWall = (performance.now() - t0) / 1000;
  submitSummary = { ...summarize(subs), tput: askers.length / askWall };
  rows.push({ label: "Ask submit", conc: MAX_CONC, ...submitSummary });
  console.log(`ask: ${submitSummary.ok}/${submitSummary.n} ok · p50 ${fmt(submitSummary.p50)} ms · p95 ${fmt(submitSummary.p95)} ms · errors ${errStr(submitSummary.errors)}`);
  saveState(true);

  const resends = await Promise.all(asked.slice(0, 5).map(a => client()("set", { key: `aym:q:${a.rec.id}`, val: a.rec, token: a.token })));
  resendDupOk = { checked: resends.length, dup: resends.filter(r => r.status === 200 && r.body.duplicate === true).length };
  console.log(`ask resend: ${resendDupOk.dup}/${resendDupOk.checked} answered as duplicates`);

  // Server-side audit.
  const dry = await staff("testProbePurge", { dryRun: true, ids: state.ids });
  const mine = (dry.body.delegates || []).filter(e => e.includes(`load-${RUN}-`));
  const clientNums = delegates.map(d => d.regNo);
  const clientDup = clientNums.length - new Set(clientNums).size;
  const aiQ = await staff("aiQueue", { status: "all", shadow: true });
  const aiBlob = JSON.stringify(aiQ.body || {});
  const aiForLoad = state.ids.filter(id => aiBlob.includes(id)).length;
  audit = {
    delegatesOnServer: mine.length,
    registered: delegates.length,
    duplicateRegNos: (dry.body.duplicateRegNos || []).length + clientDup,
    questionsOnServer: (dry.body.questions || []).filter(id => state.ids.includes(id)).length,
    dishaJobs: aiForLoad + (dry.body.aiJobs || []).length + (dry.body.aiDrafts || []).length,
  };
  console.log(`audit: ${audit.delegatesOnServer} delegates on server for ${audit.registered} registered · duplicate pass numbers ${audit.duplicateRegNos} · DISHA jobs/drafts for load questions ${audit.dishaJobs}`);
} catch (err) {
  console.log(redact(`RUN FAILED: ${err && err.stack ? err.stack : err}`));
  exitCode = 1;
} finally {
  saveState(true);
  try {
    if (!LOCAL) await sleep(3000);
    cleanupResult = await purgeAll(state);
    console.log(`cleanup: removed ${cleanupResult.delegates} delegates, ${cleanupResult.questions} questions, ${cleanupResult.sessions} sessions · left ${cleanupResult.left}`);
    if (cleanupResult.left === 0) { try { fs.unlinkSync(statePath); } catch { /* gone */ } }
    else console.log(`Leftovers remain — re-run with --cleanup-only (state saved at ${statePath}).`);
  } catch (err) {
    console.log(redact(`CLEANUP FAILED: ${err.message} — re-run with --cleanup-only (state saved at ${statePath}).`));
    exitCode = 1;
  }
  await staff("logout");
  if (localServer) { localServer.close(); try { fs.unlinkSync(localStore); } catch { /* gone */ } }
}

/* ---------------- summary ---------------- */

const regTotals = rows.filter(r => r.label.endsWith("· total"));
const allReg = regTotals.reduce((a, r) => ({ n: a.n + r.n, ok: a.ok + r.ok }), { n: 0, ok: 0 });
const regRate = allReg.n ? (100 * allReg.ok) / allReg.n : 0;

console.log(`\n### Registration burst — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${LOCAL ? "local file store" : BASE} · run ${RUN}\n`);
console.log("| Step | Concurrency | Requests | Success | p50 ms | p95 ms | p99 ms | max ms | Throughput/s | Errors (status×count) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
for (const r of rows) {
  console.log(`| ${r.label} | ${r.conc} | ${r.n} | ${r.rate.toFixed(1)}% | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.max)} | ${r.tput ? r.tput.toFixed(1) : ""} | ${errStr(r.errors)} |`);
}
console.log("");
console.log(`| Check | Result |`);
console.log(`|---|---|`);
console.log(`| Registrations succeeded | ${allReg.ok}/${allReg.n} (${regRate.toFixed(1)}%) |`);
console.log(`| Duplicate pass numbers | ${audit ? audit.duplicateRegNos : "n/a"} (must be 0) |`);
console.log(`| One delegate per email on server | ${audit ? `${audit.delegatesOnServer}/${audit.registered}` : "n/a"} |`);
console.log(`| Re-register keeps number | ${idem ? `${idem.same}/${idem.checked}` : "n/a"} |`);
console.log(`| Ask resend = duplicate | ${resendDupOk ? `${resendDupOk.dup}/${resendDupOk.checked}` : "n/a"} |`);
console.log(`| DISHA jobs for load questions | ${audit ? audit.dishaJobs : "n/a"} (must be 0) |`);
console.log(`| Cleanup leftovers | ${cleanupResult ? cleanupResult.left : "n/a"} (must be 0) |`);

if (!audit || audit.duplicateRegNos > 0 || audit.dishaJobs > 0) exitCode = 1;
if (regRate < 99 || (submitSummary && submitSummary.rate < 99)) exitCode = 1;
if (!cleanupResult || cleanupResult.left !== 0) exitCode = 1;
if (idem && idem.same !== idem.checked) exitCode = 1;
console.log(`\n${exitCode ? "FAIL" : "PASS"} — ${exitCode ? "see the rows above" : "no duplicates, ≥ 99 % success, cleaned up"}.`);
process.exit(exitCode);
