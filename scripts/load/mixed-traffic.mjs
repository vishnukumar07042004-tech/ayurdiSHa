#!/usr/bin/env node
/**
 * Mixed-traffic load test: virtual users ramp up to --users and loop over a weighted mix of
 *   page loads (HTML + the hashed JS/CSS it references), public stats / groups / podcasts (GET),
 *   Track lookups (ticket), registrations (public OTP start + staff-only `testProbeRegister` —
 *   probe addresses aym-probe+mix-<run>-<n>@ayurdisha-qa.test only, never mailed),
 *   Ask submits ("[TEST][LOAD] …" → never queued for DISHA), and a few staff VUs paging the desk
 *   (staffCounts + staffClusters + staffQuestionsPage / staffDelegatesPage to the end).
 * Reports p50 / p95 / p99, error rates and throughput per action and per stage, then ALWAYS
 * cleans up (testProbePurge; state saved in $TMPDIR for --cleanup-only) and checks no DISHA job
 * was created for a load question. The service token (AYM_SERVICE_TOKEN) is never printed.
 *
 *   node scripts/load/mixed-traffic.mjs --local --users=500           # API + dist/ snapshot in a child process, seeded file store
 *   AYM_SERVICE_TOKEN='…' node scripts/load/mixed-traffic.mjs --base=https://ayushmarg.vercel.app --users=200
 *   node scripts/load/mixed-traffic.mjs --base=… --cleanup-only
 * Other flags: --stages=0.25,0.5,1 (fractions of --users) --stage-s=20 --think-ms=1000
 *   --seed=2000 (local: seeded questions + delegates) --timeout-ms=30000
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { serviceHeaders, hasServiceToken, NO_TOKEN_HELP, redactToken } from "../lib/staffAuth.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const LOCAL = Boolean(args.local);
const CLEANUP_ONLY = Boolean(args["cleanup-only"]);
const USERS = Math.max(1, Number(args.users || 200));
const STAGES = String(args.stages || "0.25,0.5,1").split(",").map(Number).filter(f => f > 0 && f <= 1);
const STAGE_S = Math.max(3, Number(args["stage-s"] || 20));
const THINK_MS = Math.max(0, Number(args["think-ms"] ?? 1000));
const SEED = Math.max(0, Number(args.seed ?? 2000));
const TIMEOUT_MS = Number(args["timeout-ms"] || 30000);
const MAX_REGISTRATIONS = Math.max(0, Number(args["max-registrations"] || 400));
let BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
const STATE_DIR = os.tmpdir();
const STATE_PREFIX = "aym-mix-";
const LOAD_MARK = "[TEST][LOAD]";
const RUN = Date.now().toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let localServer = null;
let localStore = "";

/* ---------------- local server (API + dist/ static) ---------------- */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

function seedStore(n) {
  const db = {};
  const themes = ["Academics, Teaching & Higher Education", "Clinical Practice & Hospital Careers", "Research & Publications", "Entrepreneurship & Start-ups"];
  for (let i = 0; i < n; i++) {
    const id = `S${String(i).padStart(6, "0")}`;
    db[`aym:q:${id}`] = {
      id, ticket: `AYM-Q-${id}`, question: `Seeded question ${i}: how should I plan my PG preparation during internship?`,
      name: `Seed Delegate ${i}`, email: `seed${i}@delegates-qa.org`, theme: themes[i % themes.length], subtheme: "Choosing a PG branch",
      createdAt: Date.now() - (n - i) * 60000, consentPublish: "Yes",
    };
    db[`aym:user:SU${i}`] = { id: `SU${i}`, name: `Seed Delegate ${i}`, email: `seed${i}@delegates-qa.org`, regNo: `11WAC/2026/${100000 + i}`, institute: "Seed College", createdAt: Date.now() - i };
    db[`aym:email:seed${i}@delegates-qa.org`] = { userId: `SU${i}` };
  }
  db["aym:clusters"] = Array.from({ length: Math.min(60, Math.ceil(n / 30)) }, (_, g) => ({
    id: `SG${g}`, status: g % 2 ? "Published" : "New", theme: themes[g % themes.length], subtheme: "Choosing a PG branch",
    representative: `Seeded group ${g}`, answer: g % 2 ? "Start with the official bulletin and plan backwards from the exam date." : "",
    memberIds: Array.from({ length: 30 }, (_, k) => `S${String(g * 30 + k).padStart(6, "0")}`).filter(id => db[`aym:q:${id}`]),
  }));
  return db;
}

/** `--serve=<distDir>` (internal): the local API + static server, in its own process so the load generator never shares its event loop. */
if (args.serve) {
  const quiet = fn => (...a) => { if (!/\[aym-|DEV FALLBACK/.test(a.join(" "))) fn(...a); };
  console.error = quiet(console.error);
  console.warn = quiet(console.warn);
  const { aymStoreHandler } = await import("../../server/storePlugin.js");
  const dist = String(args.serve);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(dist, p);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; res.end(); return; }
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      res.end(buf);
    });
  });
  await new Promise(r => server.listen({ port: 0, host: "127.0.0.1", backlog: 4096 }, r));
  process.stdout.write(`PORT=${server.address().port}\n`);
  await new Promise(() => {});
}

let localChild = null;
let localDist = "";
if (LOCAL) {
  localStore = path.join(os.tmpdir(), `aym-mix-local-${process.pid}.json`);
  fs.writeFileSync(localStore, JSON.stringify(seedStore(SEED)));
  // A private copy of dist/, so another build during the run cannot 404 the page assets.
  localDist = path.join(os.tmpdir(), `aym-mix-dist-${process.pid}`);
  fs.cpSync(path.join(root, "dist"), localDist, { recursive: true });
  const token = `local-mix-${crypto.randomBytes(24).toString("hex")}`;
  Object.assign(process.env, { STAFF_SERVICE_TOKEN: token, AYM_SERVICE_TOKEN: token });
  const env = {
    ...process.env, AYM_STORE: "file", AYM_STORE_FILE: localStore, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test",
  };
  delete env.VERCEL;
  const { spawn } = await import("node:child_process");
  localChild = spawn(process.execPath, [fileURLToPath(import.meta.url), `--serve=${localDist}`], { env, stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    localChild.stdout.on("data", d => { buf += d; const m = buf.match(/PORT=(\d+)/); if (m) resolve(Number(m[1])); });
    localChild.on("exit", code => reject(new Error(`local server exited (${code})`)));
  });
  localServer = { close: () => localChild.kill() };
  process.on("exit", () => { try { localChild.kill(); } catch { /* gone */ } });
  BASE = `http://127.0.0.1:${port}`;
}
if (!hasServiceToken()) { console.log(NO_TOKEN_HELP); process.exit(2); }

/* ---------------- http ---------------- */

async function request(url, { method = "GET", headers = {}, body, jar } = {}) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const cookie = jar && jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {};
    const r = await fetch(`${BASE}${url}`, { method, headers: { ...headers, ...cookie }, body, signal: ctrl.signal });
    if (jar) {
      for (const c of r.headers.getSetCookie ? r.headers.getSetCookie() : []) {
        const [pair, ...attrs] = c.split(";");
        const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
      }
    }
    const text = await r.text();
    return { status: r.status, text, ms: performance.now() - t0, cache: r.headers.get("x-vercel-cache") || "" };
  } catch (e) {
    const cause = (e && e.cause && (e.cause.code || e.cause.name)) || "";
    return { status: 0, text: "", ms: performance.now() - t0, error: e.name === "AbortError" ? "timeout" : `network${cause ? ` ${cause}` : ""}` };
  } finally {
    clearTimeout(timer);
  }
}

function client(extraHeaders = {}) {
  const jar = new Map();
  return async (op, payload = {}) => {
    const r = await request("/api/aym-store", {
      method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify({ op, ...payload }), jar,
    });
    let body = {};
    try { body = JSON.parse(r.text); } catch { body = {}; }
    return { ...r, body };
  };
}
const staff = client(serviceHeaders());
const getJson = async url => { const r = await request(url); let body = {}; try { body = JSON.parse(r.text); } catch { /* html / empty */ } return { ...r, body }; };

/* ---------------- stats ---------------- */

const samples = [];
let stageNo = 0;
function record(action, r, ok = r.status >= 200 && r.status < 300) {
  samples.push({ action, stage: stageNo, ok, status: r.status, code: (r.body && r.body.code) || r.error || "", ms: r.ms, cache: r.cache || "" });
}
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
function summarize(list) {
  const lat = list.filter(s => s.ok).map(s => s.ms).sort((a, b) => a - b);
  const errors = {};
  for (const s of list.filter(x => !x.ok)) { const k = `${s.status}${s.code ? ` ${s.code}` : ""}`; errors[k] = (errors[k] || 0) + 1; }
  const hits = list.filter(s => /HIT|STALE/.test(s.cache)).length;
  return { n: list.length, ok: lat.length, err: list.length ? (100 * (list.length - lat.length)) / list.length : 0, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.length ? lat[lat.length - 1] : NaN, errors, hits };
}
const fmt = n => (Number.isFinite(n) ? `${Math.round(n)}` : "–");
const errStr = e => Object.entries(e).map(([k, v]) => `${k}×${v}`).join(", ") || "none";

/* ---------------- state + cleanup ---------------- */

const statePath = path.join(STATE_DIR, `${STATE_PREFIX}${RUN}.json`);
const state = { run: RUN, base: BASE, emails: [], tokens: [], ids: [] };
const saveState = () => { if (!LOCAL) { try { fs.writeFileSync(statePath, JSON.stringify(state)); } catch { /* best effort */ } } };
const stateTimer = setInterval(saveState, 2000);
stateTimer.unref();

async function purgeAll({ emails, tokens, ids }) {
  const totals = { questions: 0, delegates: 0, sessions: 0 };
  const chunks = [];
  for (let i = 0; i < Math.max(tokens.length, 1); i += 150) chunks.push(tokens.slice(i, i + 150));
  for (let i = 0; i < chunks.length; i++) {
    const r = await staff("testProbePurge", { dryRun: false, ids: i === 0 ? ids : [], emails: i === 0 ? emails : [], tokens: chunks[i] });
    if (r.status !== 200) throw new Error(`purge HTTP ${r.status} ${String(r.body.error || "").slice(0, 120)}`);
    totals.questions += (r.body.questions || []).length;
    totals.delegates += (r.body.delegates || []).length;
    totals.sessions += r.body.sessions || 0;
  }
  const dry = await staff("testProbePurge", { dryRun: true, ids });
  const left = dry.status === 200 ? (dry.body.questions || []).filter(id => ids.includes(id)).length + (dry.body.delegates || []).filter(e => emails.includes(e)).length : -1;
  return { ...totals, left };
}

/* ---------------- preflight ---------------- */

console.log(`AYURDISHA mixed traffic → ${LOCAL ? "local API + dist/ snapshot in a child process (seeded file store)" : BASE} · run ${RUN}`);
const who = await staff("whoami");
if (who.status !== 200 || who.body.staff !== true) {
  console.log(redactToken(`Staff auth failed: HTTP ${who.status} ${String(who.body.error || "").slice(0, 160)}`));
  process.exit(2);
}

if (CLEANUP_ONLY) {
  const merged = { emails: [], tokens: [], ids: [] };
  const files = fs.readdirSync(STATE_DIR).filter(f => f.startsWith(STATE_PREFIX) && f.endsWith(".json") && !f.startsWith("aym-mix-local-"));
  for (const f of files) {
    try { const s = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), "utf8")); if (s.base === BASE) for (const k of Object.keys(merged)) merged[k].push(...(s[k] || [])); } catch { /* skip */ }
  }
  const out = await purgeAll(merged);
  console.log(`cleanup-only: removed ${out.delegates} delegates, ${out.questions} questions, ${out.sessions} sessions · left ${out.left}`);
  if (out.left === 0) for (const f of files) { try { fs.unlinkSync(path.join(STATE_DIR, f)); } catch { /* gone */ } }
  process.exit(out.left === 0 ? 0 : 1);
}

const home = await request("/");
const assets = [...new Set((home.text.match(/\/assets\/[^"'\s>]+\.(?:js|css)/g) || []))];
const getOps = [];
for (const op of ["publicStats", "publicClusters", "podcastsList"]) {
  const r = await getJson(`/api/aym-store?op=${op}`);
  if (r.status === 200) getOps.push(op);
}
const seededTickets = LOCAL ? Array.from({ length: Math.min(SEED, 500) }, (_, i) => `AYM-Q-S${String(i * Math.max(1, Math.floor(SEED / 500))).padStart(6, "0")}`) : [];
console.log(`page assets: ${assets.length} (${assets.map(a => a.split("/").pop()).join(", ").slice(0, 160)}) · public GET ops: ${getOps.join(", ") || "none (older build)"}`);

/* ---------------- virtual users ---------------- */

const PAGES = ["/", "/mentors", "/track", "/about", "/programs", "/events", "/resources", "/welcome"];
const askTickets = [];
let regCount = 0;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

async function pageLoad() {
  const r = await request(pick(PAGES));
  record("page html", r, r.status === 200 && /<div id="root"/.test(r.text));
  const subs = await Promise.all(assets.map(a => request(a)));
  for (const s of subs) record("page assets (each)", s);
}

async function registerAndAsk(vu) {
  if (regCount >= MAX_REGISTRATIONS) return publicGet();
  const n = regCount++;
  const email = `aym-probe+mix-${RUN}-${n}@ayurdisha-qa.test`;
  state.emails.push(email);
  const student = client();
  const a = await student("regStart", { name: "[TEST] AYURDISHA mixed-load probe", age: 30, sex: "Other", institute: "[TEST] Probe College", email });
  record("register · OTP start", a);
  const b = await staff("testProbeRegister", { email, source: "load" });
  const ok = b.status === 200 && b.body.token && b.body.profile && b.body.profile.regNo;
  record("register · complete", b, Boolean(ok));
  if (!ok) return;
  state.tokens.push(b.body.token);
  vu.delegate = { email, regNo: b.body.profile.regNo, token: b.body.token };
  await sleep(THINK_MS);
  const id = `MX${RUN}${n}`.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  state.ids.push(id);
  const rec = {
    name: "[TEST] AYURDISHA mixed-load probe", email, mobile: "", state: "Odisha", institution: "[TEST] Probe College",
    stage: "Intern", registered: "Yes", regNo: vu.delegate.regNo, inPerson: "Not yet confirmed", days: [],
    theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch",
    question: `${LOAD_MARK} Mixed load ${RUN}: how should I plan PG entrance preparation alongside internship duties?`,
    context: "", outcome: "", consentFollow: "No", id, ticket: `AYM-Q-${id}`.slice(0, 24), createdAt: Date.now(),
    consentPublish: "Yes", anonId: "U-LOAD000000", delegateNo: vu.delegate.regNo, source: "load",
  };
  const s = await student("set", { key: `aym:q:${id}`, val: rec, token: vu.delegate.token });
  record("Ask submit", s);
  if (s.status === 200) askTickets.push(rec.ticket);
}

async function publicGet() {
  if (!getOps.length) return;
  const op = pick(getOps.flatMap(o => (o === "publicStats" ? [o, o, o] : [o])));
  record(`GET ${op}`, await getJson(`/api/aym-store?op=${op}`));
}

async function trackLookup() {
  const pool = askTickets.length ? askTickets.concat(seededTickets) : seededTickets;
  const query = pool.length && Math.random() < 0.8 ? pick(pool) : `AYM-Q-NOPE${Math.floor(Math.random() * 1e6)}`;
  record("Track lookup", await client()("lookup", { query }));
}

async function staffDesk() {
  const t0 = performance.now();
  const steps = [await staff("staffCounts"), await staff("staffClusters")];
  let cursor = "";
  for (let i = 0; i < 40; i++) {
    const r = await staff("staffQuestionsPage", { cursor, limit: 500 });
    steps.push(r);
    if (r.status !== 200 || r.body.done || !r.body.nextCursor) break;
    cursor = r.body.nextCursor;
  }
  cursor = "";
  for (let i = 0; i < 40; i++) {
    const r = await staff("staffDelegatesPage", { cursor, limit: 500 });
    steps.push(r);
    if (r.status !== 200 || r.body.done || !r.body.nextCursor) break;
    cursor = r.body.nextCursor;
  }
  for (const s of steps) record("staff page (each)", s);
  const bad = steps.find(s => s.status !== 200);
  record("staff full desk load", { status: bad ? bad.status : 200, body: bad ? bad.body : {}, ms: performance.now() - t0 });
}

const MIX = [[pageLoad, 35], [publicGet, 25], [trackLookup, 20], [registerAndAsk, 10]];
const MIX_TOTAL = MIX.reduce((s, [, w]) => s + w, 0);
function nextAction() {
  let x = Math.random() * MIX_TOTAL;
  for (const [fn, w] of MIX) { if ((x -= w) < 0) return fn; }
  return pageLoad;
}

let stopAt = 0;
let stopping = false;
process.on("SIGINT", () => { if (stopping) process.exit(130); stopping = true; console.log("\nInterrupted — cleaning up…"); });

async function vuLoop(vu) {
  await sleep(Math.random() * THINK_MS);
  while (!stopping && performance.now() < stopAt) {
    try { await (vu.staff ? staffDesk() : nextAction()(vu)); } catch (e) { samples.push({ action: "client error", stage: stageNo, ok: false, status: 0, code: String(e.message).slice(0, 40), ms: 0 }); }
    await sleep(vu.staff ? THINK_MS * 5 : THINK_MS * (0.5 + Math.random()));
  }
}

const stageRows = [];
let exitCode = 0;
let cleanup = null;
let dishaJobs = null;
try {
  const vus = [];
  for (const [i, frac] of STAGES.entries()) {
    if (stopping) break;
    stageNo = i + 1;
    const target = Math.max(1, Math.round(USERS * frac));
    const t0 = performance.now();
    stopAt = t0 + STAGE_S * 1000;
    const staffTarget = Math.max(1, Math.round(target / 100));
    while (vus.length < target) vus.push({ id: vus.length, staff: vus.filter(v => v.staff).length < staffTarget && vus.length % 100 === 0 });
    const before = samples.length;
    await Promise.all(vus.map(vuLoop));
    const wall = (performance.now() - t0) / 1000;
    const mine = samples.slice(before);
    const s = summarize(mine);
    stageRows.push({ stage: stageNo, users: target, staffVus: vus.filter(v => v.staff).length, wall, rps: mine.length / wall, ...s });
    console.log(`stage ${stageNo}: ${target} VUs · ${mine.length} req in ${wall.toFixed(1)}s (${(mine.length / wall).toFixed(1)}/s) · p50 ${fmt(s.p50)} p95 ${fmt(s.p95)} p99 ${fmt(s.p99)} ms · errors ${s.err.toFixed(2)}% (${errStr(s.errors)})`);
  }
  const aiQ = await staff("aiQueue", { status: "all", shadow: true });
  const blob = JSON.stringify(aiQ.body || {});
  dishaJobs = aiQ.status === 200 ? state.ids.filter(id => blob.includes(id)).length : null;
} catch (err) {
  console.log(redactToken(`RUN FAILED: ${err && err.stack ? err.stack : err}`));
  exitCode = 1;
} finally {
  saveState();
  try {
    if (!LOCAL) await sleep(3000);
    cleanup = await purgeAll(state);
    if (cleanup.left === 0) { try { fs.unlinkSync(statePath); } catch { /* gone */ } }
  } catch (err) {
    console.log(redactToken(`CLEANUP FAILED: ${err.message} — re-run with --cleanup-only (state at ${statePath}).`));
    exitCode = 1;
  }
  if (localServer) {
    localServer.close();
    try { fs.unlinkSync(localStore); } catch { /* gone */ }
    try { fs.rmSync(localDist, { recursive: true, force: true }); } catch { /* gone */ }
  }
}

/* ---------------- report ---------------- */

const byAction = {};
for (const s of samples) (byAction[s.action] ||= []).push(s);
console.log(`\n### Mixed traffic — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${LOCAL ? `local (file store, ${SEED} seeded questions + delegates)` : BASE} · run ${RUN} · ${USERS} VUs peak · think ${THINK_MS} ms\n`);
console.log("| Stage | VUs (staff) | Requests | Req/s | Error % | p50 ms | p95 ms | p99 ms | max ms |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of stageRows) console.log(`| ${r.stage} | ${r.users} (${r.staffVus}) | ${r.n} | ${r.rps.toFixed(1)} | ${r.err.toFixed(2)} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.max)} |`);
console.log("\n| Action | Requests | Error % | p50 ms | p95 ms | p99 ms | max ms | CDN hits | Errors |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---|");
for (const [a, list] of Object.entries(byAction).sort()) {
  const s = summarize(list);
  console.log(`| ${a} | ${s.n} | ${s.err.toFixed(2)} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.p99)} | ${fmt(s.max)} | ${LOCAL ? "–" : s.hits} | ${errStr(s.errors)} |`);
}
const all = summarize(samples);
console.log(`\n| Check | Result |\n|---|---|`);
console.log(`| Overall error rate | ${all.err.toFixed(2)}% of ${all.n} (must be < 1 %) |`);
console.log(`| Registrations / Ask submits | ${state.tokens.length} / ${state.ids.length} probe records |`);
console.log(`| DISHA jobs for load questions | ${dishaJobs ?? "n/a"} (must be 0) |`);
console.log(`| Cleanup | ${cleanup ? `removed ${cleanup.delegates} delegates, ${cleanup.questions} questions, ${cleanup.sessions} sessions · left ${cleanup.left}` : "n/a"} (must be 0 left) |`);
if (all.err >= 1 || (dishaJobs && dishaJobs > 0) || !cleanup || cleanup.left !== 0) exitCode = 1;
console.log(`\n${exitCode ? "FAIL" : "PASS"}`);
process.exit(exitCode);
