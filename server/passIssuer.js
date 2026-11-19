/**
 * Burst-safe WAC pass numbers (11WAC/2026/NNNN) and the small atomic helpers registration needs.
 *
 * One Firestore document sustains roughly one write a second, so a burst of registrations all
 * incrementing `meta/wac-seq` queued, retried and timed out. Instead each server instance reserves
 * a BLOCK of numbers with one short transaction on one of several SHARD documents and hands the
 * numbers out from memory. Shard k owns block indexes k, k+S, k+2S, … so blocks never overlap;
 * numbers stay roughly sequential, and a recycled instance leaves at most one block of gaps.
 * The regno index is still claimed with create-if-absent, so one number can never reach two people.
 *
 * PASS_BLOCK_SIZE / PASS_SHARDS are part of the numbering scheme: changing them would make old and
 * new blocks overlap. Use a new counter name instead.
 */
import { WAC_SEQ_DOC } from "./wacRegNo.js";

export const PASS_BLOCK_SIZE = 10;
export const PASS_SHARDS = 8;
/** Room left above the legacy single counter for instances still running the old code mid-deploy. */
export const LEGACY_MARGIN = 50;
/** Load-test numbers come from their own counter, far above any real pass number. */
export const LOADTEST_COUNTER = "wac-seq-loadtest";
export const LOADTEST_BASE = 900000;

const CONTENTION_CODES = new Set([4, 8, 10, 14, "aborted", "unavailable", "deadline-exceeded", "resource-exhausted"]);

/** Firestore / gRPC errors worth retrying: contention (ABORTED), overload, transient unavailability. */
export function isContention(err) {
  if (!err) return false;
  if (CONTENTION_CODES.has(err.code)) return true;
  return /\b(ABORTED|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED)\b|too much contention/i.test(String(err.message || ""));
}

/** Exponential backoff with "equal jitter": half fixed, half random, capped. */
export function jitterDelay(attempt, baseMs = 60, capMs = 1500, rand = Math.random) {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + rand() * (exp / 2));
}

const realSleep = ms => new Promise(r => setTimeout(r, ms));

export async function withContentionRetry(fn, { attempts = 5, baseMs = 60, capMs = 1500, sleep = realSleep } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (!isContention(err) || i === attempts - 1) throw err;
      await sleep(jitterDelay(i, baseMs, capMs));
    }
  }
  throw lastErr;
}

/** Block `index` covers numbers [first, last] above `base`. */
export function blockRange(base, index, size = PASS_BLOCK_SIZE) {
  const first = base + index * size + 1;
  return { first, last: first + size - 1 };
}

/** The n-th block taken from shard k. Disjoint across shards by construction. */
export function shardBlockIndex(shard, n, shards = PASS_SHARDS) {
  return shard + n * shards;
}

/**
 * Pure planning step of one shard reservation (run inside a transaction by the Firestore adapter
 * and by the contention simulator in tests). `shardDoc` / `legacyDoc` are the current document
 * data or null; `legacyDoc` is only needed when the shard has no base yet.
 * Returns the range plus the writes to make: `{ range, shardWrite, legacyWrite | null, needsLegacy }`.
 */
export function planShardReservation({ name, shard, shards = PASS_SHARDS, size = PASS_BLOCK_SIZE, shardDoc, legacyDoc, initialBase = initialBaseFor, now = Date.now() }) {
  const cur = shardDoc || {};
  let base = Number(cur.base);
  let legacyWrite = null;
  if (!Number.isFinite(base)) {
    if (legacyDoc === undefined) return { needsLegacy: true };
    const ld = legacyDoc || {};
    base = Number(ld.blockBase);
    if (!Number.isFinite(base)) {
      base = initialBase(name, Number(ld.last) || 0);
      legacyWrite = { blockBase: base, blockSize: size, blockShards: shards, updatedAt: now };
    }
  }
  const n = Number(cur.blocks) || 0;
  const index = shardBlockIndex(shard, n, shards);
  return {
    needsLegacy: false,
    range: { ...blockRange(base, index, size), shard, index },
    shardWrite: { base, blocks: n + 1, shard, shards, size, updatedAt: now },
    legacyWrite,
  };
}

/**
 * Shard order for one reservation: two random shards, the less-used first ("power of two
 * choices" keeps shards level, so numbers stay close to sequential), then a third as fallback.
 * `blocksOf(k)` is the shard's block count from a plain (non-transactional) read, or null.
 */
export function shardOrder(shards, blocksOf, rand = Math.random) {
  const a = Math.floor(rand() * shards);
  let b = Math.floor(rand() * (shards - 1));
  if (b >= a) b += 1;
  const na = blocksOf(a);
  const nb = blocksOf(b);
  const order = nb != null && na != null && nb < na ? [b, a] : [a, b];
  if (shards > 2) {
    let c = Math.floor(rand() * shards);
    while (c === a || c === b) c = (c + 1) % shards;
    order.push(c);
  }
  return order;
}

export function initialBaseFor(name, legacyLast = 0) {
  if (name === LOADTEST_COUNTER) return LOADTEST_BASE;
  const last = Number(legacyLast);
  return (Number.isFinite(last) && last > 0 ? last : 0) + (name === WAC_SEQ_DOC && last > 0 ? LEGACY_MARGIN : 0);
}

/* ------------------------------------------------------------------ */
/* Store-agnostic atomic helpers (Firestore, file, Blob, in-memory).   */
/* ------------------------------------------------------------------ */

/**
 * Atomic read-modify-write of one key. `fn(current)` returns the next value, or `undefined` to
 * leave it unchanged; it may run more than once (transaction retries), so keep it pure.
 * Resolves to the stored value afterwards.
 */
export async function updateKey(store, key, fn) {
  if (typeof store.update === "function") return store.update(key, fn);
  if (typeof store.transact === "function") {
    let result = null;
    await store.transact(db => {
      const cur = key in db ? db[key] : null;
      const next = fn(cur == null ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) { result = cur; return db; }
      db[key] = next;
      result = next;
      return db;
    });
    return result;
  }
  const cur = await store.get(key);
  const next = fn(cur);
  if (next === undefined) return cur;
  await store.set(key, next);
  return next;
}

/** Write `val` only if `key` is empty. Resolves true when this call created it. */
export async function createKeyIfAbsent(store, key, val) {
  if (typeof store.create === "function") return store.create(key, val);
  let created = false;
  await updateKey(store, key, cur => {
    if (cur != null) { created = false; return undefined; }
    created = true;
    return val;
  });
  return created;
}

/** One reservation: `{ first, last }`. Firestore shards; file/Blob/memory stores bump one key. */
export async function reservePassBlock(store, name = WAC_SEQ_DOC, size = PASS_BLOCK_SIZE) {
  if (typeof store.reserveBlock === "function") {
    return store.reserveBlock(name, size, { shards: PASS_SHARDS, initialBase: initialBaseFor });
  }
  const key = name === WAC_SEQ_DOC ? "aym:meta:wac-seq" : `aym:meta:${name}`;
  let range = null;
  await updateKey(store, key, cur => {
    const prev = cur && typeof cur === "object" ? cur : {};
    let last = Number(prev.last);
    if (!Number.isFinite(last) || last <= 0) last = name === LOADTEST_COUNTER ? LOADTEST_BASE : 0;
    range = { first: last + 1, last: last + size };
    return { ...prev, last: last + size, updatedAt: Date.now() };
  });
  return range;
}

/* ------------------------------------------------------------------ */
/* Per-instance pool: FIFO waiters share one in-flight reservation.    */
/* ------------------------------------------------------------------ */

const pools = new WeakMap();

function poolFor(store, name) {
  let byName = pools.get(store);
  if (!byName) { byName = new Map(); pools.set(store, byName); }
  let pool = byName.get(name);
  if (!pool) { pool = { next: 0, last: -1, queue: [], filling: false, reservations: 0 }; byName.set(name, pool); }
  return pool;
}

function drain(store, name, pool, size) {
  while (pool.queue.length && pool.next <= pool.last) pool.queue.shift().resolve(pool.next++);
  if (!pool.queue.length || pool.filling) return;
  pool.filling = true;
  reservePassBlock(store, name, size)
    .then(r => {
      pool.reservations += 1;
      pool.next = r.first;
      pool.last = r.last;
    }, err => {
      for (const w of pool.queue.splice(0)) w.reject(err);
    })
    .finally(() => {
      pool.filling = false;
      drain(store, name, pool, size);
    });
}

/** Next pass number for this instance. Concurrent callers never get the same number. */
export function nextPassNumber(store, name = WAC_SEQ_DOC, { size = PASS_BLOCK_SIZE } = {}) {
  const pool = poolFor(store, name);
  return new Promise((resolve, reject) => {
    pool.queue.push({ resolve, reject });
    drain(store, name, pool, size);
  });
}

/** Tests: how many block reservations this store instance has made. */
export function passPoolStats(store, name = WAC_SEQ_DOC) {
  const pool = pools.get(store) && pools.get(store).get(name);
  return pool ? { reservations: pool.reservations, left: Math.max(0, pool.last - pool.next + 1) } : { reservations: 0, left: 0 };
}

/* ------------------------------------------------------------------ */
/* Bounded, never-throwing side work (counters, stats, notifications). */
/* ------------------------------------------------------------------ */

/** Awaits `work` for at most `ms`; logs failures; never throws. Resolves `{ ok, value?, timedOut? }`. */
export async function bestEffort(work, { ms = 1500, label = "side-work" } = {}) {
  let timer;
  const p = Promise.resolve().then(typeof work === "function" ? work : () => work);
  const guarded = p.then(value => ({ ok: true, value }), err => {
    console.error(`[aym-store] ${label} failed:`, err && err.message ? err.message : err);
    return { ok: false };
  });
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, timedOut: true }), ms); });
  const out = await Promise.race([guarded, timeout]);
  clearTimeout(timer);
  return out;
}

/** Rejects with `{ code: 503 }` when `work` runs past `ms` (keeps handlers under the function timeout). */
export async function withDeadline(work, ms, message = "The hall is very busy right now. Please try again in a moment.") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.code = 503;
      err.deadline = true;
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([Promise.resolve().then(typeof work === "function" ? work : () => work), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
