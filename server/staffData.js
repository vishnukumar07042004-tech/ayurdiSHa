/**
 * Paged staff desk data (replaces "load everything in one request").
 *
 *   staffCounts         → { questions, delegates, clusters, clustersVersion, serverTime }  (count() aggregations)
 *   staffClusters       → { clusters, clustersVersion }                                     (one document)
 *   staffQuestionsPage  → { items, hidden, nextCursor, done, scanned }  {cursor, limit, sinceCreated}
 *   staffDelegatesPage  → { items, nextCursor, done, scanned }          {cursor, limit}
 *
 * Pages are in document-id order with an opaque cursor (last id), capped by count and by bytes so a
 * response never nears the 4.5 MB serverless limit. Results are cached per instance for a few
 * seconds and the cache is dropped on any write through this instance (invalidateStaffData).
 * Stores without the Firestore paging methods (file / Blob / test stores) fall back to list + get.
 */
import { K_Q } from "./store.js";
import { K_USER, isDemoDelegate } from "./register.js";
import { effectivePageMax, noteRead } from "./quota.js";

export const STAFF_DATA_OPS = new Set(["staffCounts", "staffClusters", "staffQuestionsPage", "staffDelegatesPage"]);
export const PAGE_DEFAULT = 50;
/** Hard cap — Spark-safe; lite mode can clamp lower via effectivePageMax(). */
export const PAGE_MAX = 50;
export const PAGE_MAX_BYTES = 1_500_000;
/** Incremental refresh returns at most this many; more means "reload fully". */
export const SINCE_MAX = 500;
const CACHE_MS = 4000;
const CACHE_MAX_ENTRIES = 200;
/** Fields a delegate card needs (projection: the rest of the user doc never leaves Firestore). */
export const DELEGATE_CARD_FIELDS = ["name", "age", "sex", "institute", "institution", "email", "regNo", "createdAt", "wacId", "wacLinkPending", "source"];
/** Stored for indexing only; the desk never reads it (`text` duplicates `question`). */
const QUESTION_OMIT = ["text", "emailLower", "ticketLower"];

let epoch = 0;
const cache = new Map();

export function invalidateStaffData() {
  epoch += 1;
  cache.clear();
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.epoch === epoch && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };
  const at = Date.now();
  const startEpoch = epoch;
  const value = await fn();
  if (startEpoch === epoch) {
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at, epoch, value });
  }
  return value;
}

const clampLimit = (n, def = PAGE_DEFAULT) => {
  const max = effectivePageMax(PAGE_MAX);
  return Math.max(1, Math.min(max, Math.floor(Number(n) || def)));
};
const cleanCursor = c => String(c || "").slice(0, 300);

function projectQuestion(q) {
  const out = { ...q };
  for (const f of QUESTION_OMIT) delete out[f];
  return out;
}

export function delegateCard(u) {
  if (!u || !u.email || !u.name || isDemoDelegate(u)) return null;
  return {
    name: u.name, age: u.age, sex: u.sex,
    institute: u.institute || u.institution || "",
    email: u.email, regNo: u.regNo, createdAt: u.createdAt,
    ...(u.wacId ? { wacId: u.wacId } : u.wacLinkPending ? { wacLinkPending: true } : {}),
    ...(u.source ? { source: u.source } : {}),
  };
}

/** Take items until the byte budget is spent; `cut` = how many were taken. */
function takeWithinBytes(items, maxBytes) {
  let bytes = 2;
  let cut = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length + 1;
    if (cut > 0 && bytes + n > maxBytes) break;
    bytes += n;
    cut += 1;
  }
  return { cut, bytes };
}

/* ------------------------------------------------------------------ fallbacks */

async function fallbackQuestionsSorted(store) {
  let qs;
  if (typeof store.listQuestions === "function") qs = await store.listQuestions();
  else {
    const keys = await store.list(K_Q);
    qs = [];
    for (let i = 0; i < keys.length; i += 25) qs.push(...(await Promise.all(keys.slice(i, i + 25).map(k => store.get(k)))));
  }
  return qs.filter(s => s && s.id).sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
}

async function rawQuestionPage(store, { after, limit, sinceCreated }) {
  if (typeof store.pageQuestions === "function") return store.pageQuestions({ after, limit, sinceCreated });
  const all = await fallbackQuestionsSorted(store);
  if (sinceCreated > 0) {
    const items = all.filter(s => (s.createdAt || 0) >= sinceCreated).slice(0, limit);
    return { items, scanned: items.length, done: items.length < limit };
  }
  const start = after ? all.findIndex(s => String(s.id) > String(after)) : 0;
  const items = start < 0 ? [] : all.slice(start, start + limit);
  return { items, scanned: items.length, done: start < 0 || start + limit >= all.length };
}

async function rawKvPage(store, prefix, { after, limit, fields }) {
  if (typeof store.pageKv === "function") return store.pageKv(prefix, { after, limit, fields });
  const keys = (await store.list(prefix)).sort();
  const start = after ? keys.findIndex(k => k > after) : 0;
  const slice = start < 0 ? [] : keys.slice(start, start + limit);
  const vals = [];
  for (let i = 0; i < slice.length; i += 25) vals.push(...(await Promise.all(slice.slice(i, i + 25).map(k => store.get(k)))));
  return { items: slice.map((key, i) => ({ key, value: vals[i] })), done: start < 0 || start + limit >= keys.length };
}

/* ------------------------------------------------------------------ ops */

export async function staffCounts(store, { clustersMeta } = {}) {
  return cached("counts", async () => {
    const [questions, delegates, meta] = await Promise.all([
      typeof store.countQuestions === "function" ? store.countQuestions() : store.list(K_Q).then(k => k.length),
      typeof store.countKv === "function" ? store.countKv(K_USER) : store.list(K_USER).then(k => k.length),
      clustersMeta(store),
    ]);
    return {
      ok: true, questions, delegates,
      clusters: Array.isArray(meta.value) ? meta.value.length : 0,
      clustersVersion: meta.version || 1,
      serverTime: Date.now(),
    };
  });
}

export async function staffClusters(store, { clustersMeta } = {}) {
  return cached("clusters", async () => {
    const meta = await clustersMeta(store);
    return { ok: true, clusters: Array.isArray(meta.value) ? meta.value : [], clustersVersion: meta.version || 1 };
  });
}

export async function staffQuestionsPage(store, msg = {}) {
  const sinceCreated = Math.max(0, Number(msg.sinceCreated) || 0);
  const limit = sinceCreated ? SINCE_MAX : clampLimit(msg.limit);
  const after = sinceCreated ? "" : cleanCursor(msg.cursor);
  return cached(`q|${after}|${limit}|${sinceCreated}`, async () => {
    const page = await rawQuestionPage(store, { after, limit, sinceCreated });
    const shown = [];
    const hidden = [];
    let lastId = after;
    const rows = page.items.map(projectQuestion);
    const { cut } = takeWithinBytes(rows, PAGE_MAX_BYTES);
    rows.slice(0, cut).forEach(q => {
      lastId = String(q.id);
      if (isDemoDelegate(q)) hidden.push(String(q.id));
      else shown.push(q);
    });
    const done = cut === rows.length ? page.done : false;
    return {
      ok: true,
      items: shown,
      hidden,
      scanned: cut,
      nextCursor: done || sinceCreated ? "" : lastId,
      done: sinceCreated ? true : done,
      truncated: Boolean(sinceCreated && page.items.length >= limit),
      serverTime: Date.now(),
    };
  });
}

export async function staffDelegatesPage(store, msg = {}) {
  const limit = clampLimit(msg.limit);
  const after = cleanCursor(msg.cursor);
  return cached(`d|${after}|${limit}`, async () => {
    const page = await rawKvPage(store, K_USER, { after, limit, fields: DELEGATE_CARD_FIELDS });
    const items = [];
    let lastKey = after;
    page.items.forEach(({ key, value }) => {
      lastKey = key;
      const card = delegateCard(value);
      if (card) items.push(card);
    });
    return { ok: true, items, scanned: page.items.length, nextCursor: page.done ? "" : lastKey, done: page.done };
  });
}

/** Dispatch; logs timing + size (never content). */
export async function handleStaffDataOp(op, msg, store, deps) {
  const t0 = Date.now();
  let body;
  if (op === "staffCounts") body = await staffCounts(store, deps);
  else if (op === "staffClusters") body = await staffClusters(store, deps);
  else if (op === "staffQuestionsPage") body = await staffQuestionsPage(store, msg);
  else body = await staffDelegatesPage(store, msg);
  const ms = Date.now() - t0;
  const items = Array.isArray(body.items) ? body.items.length : Array.isArray(body.clusters) ? body.clusters.length : "";
  if (!body.cached) {
    if (op === "staffQuestionsPage" || op === "staffDelegatesPage") noteRead(Math.max(1, Number(body.scanned) || items || 1));
    else noteRead(1);
  }
  console.log(`[aym-staff-data] ${op} ${ms}ms items=${items}${body.cached ? " cached" : ""}`);
  return { code: 200, body: { ...body, ms } };
}
