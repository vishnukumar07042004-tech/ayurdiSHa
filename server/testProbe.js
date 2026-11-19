/**
 * Staff-only helpers for the production probes (scripts/e2e/prod-ask-probe.mjs,
 * scripts/load/register-burst.mjs). A probe delegate can only have an
 * `aym-probe+…@ayurdisha-qa.test` email (a reserved domain: no mail is ever sent to it).
 *   - testProbeSession: a ready-made delegate with a legacy six-digit test number (no counter).
 *   - testProbeRegister: the real post-OTP registration path (completeRegistration), drawing pass
 *     numbers from the separate load-test counter (11WAC/2026/9xxxxx), never the real sequence.
 * The purge only ever deletes "[TEST]" questions from probe emails, their AI jobs / drafts, group
 * memberships, probe sessions, OTP rate records and the probe delegates — never anything else,
 * even when given other ids.
 */
import crypto from "node:crypto";
import { K_Q } from "./store.js";
import { K_USER, K_EMAIL, regnoIndexKey, publicProfile, completeRegistration } from "./register.js";
import { aiStoreFor } from "./ai/aiStore.js";
import { draftIdFor, jobIdFor } from "./ai/queue.js";
import { LOADTEST_COUNTER } from "./passIssuer.js";
import { otpRateKey } from "./otpLimits.js";
import { PROBE_EMAIL_RE, TEST_MARK, LOAD_MARK, isProbeEmail, isProbeQuestion, isLoadProbeQuestion } from "../shared/probe.js";

export { PROBE_EMAIL_RE, TEST_MARK, LOAD_MARK, isProbeEmail, isProbeQuestion, isLoadProbeQuestion };
const K_SESS = "aym:sess:";
const PURGE_CONCURRENCY = 16;
const PROBE_EMAIL_PREFIX = "aym-probe+";

/** Six-digit legacy-format number not already on the regno index (keeps the WAC sequence intact). */
async function freeTestRegNo(store) {
  for (let i = 0; i < 20; i++) {
    const n = String(900000 + crypto.randomInt(0, 100000));
    if (!(await store.get(regnoIndexKey(n)))) return n;
  }
  throw new Error("no free test number");
}

const badEmail = { code: 400, body: { error: "Probe emails must look like aym-probe+<tag>@ayurdisha-qa.test." } };

export async function probeSessionStart(msg, store) {
  const email = String(msg && msg.email || "").trim().toLowerCase();
  if (!isProbeEmail(email)) return badEmail;
  const existing = await store.get(K_EMAIL + email);
  let user = existing && existing.userId ? await store.get(K_USER + existing.userId) : null;
  if (!user) {
    user = {
      id: `probe${crypto.randomBytes(6).toString("hex")}`,
      name: `${TEST_MARK} AYURDISHA probe`,
      email, emailLower: email,
      institute: `${TEST_MARK} Probe College`,
      age: 30, sex: "Other",
      regNo: await freeTestRegNo(store),
      createdAt: Date.now(),
      probe: true,
    };
    if (msg.source) user.source = String(msg.source).slice(0, 32);
    await store.set(K_USER + user.id, user);
    await store.set(K_EMAIL + email, { userId: user.id });
    await store.set(regnoIndexKey(user.regNo), { userId: user.id });
  }
  const token = crypto.randomBytes(24).toString("hex");
  await store.set(K_SESS + token, { userId: user.id, createdAt: Date.now(), probe: true });
  return { code: 200, body: { ok: true, token, profile: publicProfile(user) } };
}

/** What a correct OTP leads to, for a probe email: same code path, load-test number range. */
export async function probeRegister(msg, store) {
  const email = String(msg && msg.email || "").trim().toLowerCase();
  if (!isProbeEmail(email)) return badEmail;
  const profile = {
    name: `${TEST_MARK} AYURDISHA load probe`,
    age: 30, sex: "Other",
    institute: `${TEST_MARK} Probe College`,
    email,
  };
  return completeRegistration(store, {
    profile, emailLower: email, source: msg.source,
    counter: LOADTEST_COUNTER, sessionExtra: { probe: true },
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function probeUsers(store, fullScan) {
  const keys = fullScan ? await store.list(K_USER) : await store.list(K_EMAIL + PROBE_EMAIL_PREFIX);
  const found = await mapLimit(keys, PURGE_CONCURRENCY, async k => {
    if (fullScan) return store.get(k);
    const idx = await store.get(k);
    return idx && idx.userId ? store.get(K_USER + idx.userId) : null;
  });
  const byId = new Map();
  for (const u of found) if (u && u.id && isProbeEmail(u.email)) byId.set(u.id, u);
  return [...byId.values()];
}

/**
 * `{ dryRun, ids?, tokens?, emails?, fullScan? }` → what was (or would be) removed.
 * `ids` lets the probe sweep AI records written after its question was already deleted;
 * `emails` (probe addresses only) clears OTP rate records for addresses that never registered.
 * The report lists the probe delegates' pass numbers and any duplicates among them.
 */
export async function probePurge(msg, store, { clustersMeta, persistClusters }) {
  const dryRun = msg && msg.dryRun === true;
  const asked = new Set((Array.isArray(msg && msg.ids) ? msg.ids : []).map(String).filter(id => /^[A-Za-z0-9_-]{4,40}$/.test(id)));
  const questions = typeof store.listQuestions === "function"
    ? await store.listQuestions()
    : await Promise.all((await store.list(K_Q)).map(k => store.get(k)));
  const byId = new Map(questions.filter(q => q && q.id).map(q => [q.id, q]));
  const probeIds = [...byId.values()].filter(isProbeQuestion).map(q => q.id);
  // An asked-for id is swept only if its question is gone (deleted earlier) — never a live real question.
  const orphanIds = [...asked].filter(id => !byId.has(id));
  const aiIds = [...new Set([...probeIds, ...orphanIds])];

  const aiStore = await aiStoreFor(store);
  const ai = { drafts: [], jobs: [] };
  await mapLimit(aiIds, PURGE_CONCURRENCY, async id => {
    const [d, j] = await Promise.all([aiStore.getDraft(draftIdFor("question", id)), aiStore.getJob(jobIdFor("question", id))]);
    if (d) ai.drafts.push(id);
    if (j) ai.jobs.push(id);
  });

  const users = await probeUsers(store, msg && msg.fullScan === true);
  const regNos = users.map(u => String(u.regNo || "")).filter(Boolean);
  const seen = new Set();
  const duplicateRegNos = [...new Set(regNos.filter(r => (seen.has(r) ? true : (seen.add(r), false))))];
  const emails = new Set(users.map(u => String(u.email).trim().toLowerCase()));
  for (const e of Array.isArray(msg && msg.emails) ? msg.emails : []) {
    const em = String(e || "").trim().toLowerCase();
    if (isProbeEmail(em)) emails.add(em);
  }

  const meta = await clustersMeta(store);
  const drop = new Set(probeIds);
  const touched = (meta.value || []).filter(c => (c.memberIds || []).some(m => drop.has(String(m))));

  const report = {
    dryRun, questions: probeIds, aiDrafts: ai.drafts, aiJobs: ai.jobs,
    delegates: users.map(u => u.email), regNos, duplicateRegNos, groupsTouched: touched.map(c => c.id),
    otpRecords: emails.size,
  };
  if (dryRun) return report;

  if (touched.length) {
    const next = meta.value
      .map(c => ({ ...c, memberIds: (c.memberIds || []).filter(m => !drop.has(String(m))) }))
      .filter(c => c.memberIds.length);
    await persistClusters(store, next, meta.version);
  }
  await mapLimit(ai.drafts, PURGE_CONCURRENCY, id => aiStore.delDraft(draftIdFor("question", id)));
  await mapLimit(ai.jobs, PURGE_CONCURRENCY, id => aiStore.delJob(jobIdFor("question", id)));
  await mapLimit(probeIds, PURGE_CONCURRENCY, id => store.del(K_Q + id));
  const userIds = new Set(users.map(u => u.id));
  const tokens = (Array.isArray(msg.tokens) ? msg.tokens : []).map(String).filter(t => /^[0-9a-f]{48}$/.test(t));
  let sessions = 0;
  await mapLimit(tokens, PURGE_CONCURRENCY, async t => {
    const s = await store.get(K_SESS + t);
    if (s && (s.probe || userIds.has(s.userId))) { await store.del(K_SESS + t); sessions++; }
  });
  await mapLimit(users, PURGE_CONCURRENCY, async u => {
    const rk = regnoIndexKey(u.regNo);
    if (rk) await store.del(rk);
    await store.del(K_EMAIL + String(u.emailLower || u.email).trim().toLowerCase());
    await store.del(K_USER + u.id);
  });
  await mapLimit([...emails], PURGE_CONCURRENCY, e => store.del(otpRateKey(e)));
  report.sessions = sessions;
  return report;
}
