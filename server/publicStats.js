import { K_Q, K_CLUSTERS } from "./store.js";
import { K_USER, isDemoDelegate, delegateCardsFromDb } from "./register.js";
import { isProbeEmail } from "../shared/probe.js";

/**
 * Public aggregate counts. Three cache layers so a hall full of open tabs never turns into a
 * stampede of aggregation queries: the CDN (GET, ~30 s), this instance (30 s), and one shared
 * store record (`aym:meta:public-stats`, 60 s) that cold instances read instead of recomputing.
 * Only one instance at a time recomputes (a short lease); the others serve the last value.
 */
const TTL_MS = 30 * 1000;
const SHARED_TTL_MS = 60 * 1000;
const LEASE_MS = 20 * 1000;
export const K_PUBLIC_STATS = "aym:meta:public-stats";
const EMPTY = { registeredStudents: null, questionsAsked: null, questionsAnswered: null };

let cache = null;
let pending = null;

/** Demo seed records and production probe / load-test data never count. */
export const isNotCounted = rec => isDemoDelegate(rec) || isProbeEmail(rec && rec.email);

function answeredFromSnapshot(db, questions) {
  const byTicket = new Map();
  const answered = new Set();
  questions.forEach(q => {
    if (q.ticket) byTicket.set(String(q.ticket).trim(), q.id);
    if (String(q.individualAnswer || q.answer || q.mentorAnswer || q.mergedAnswer || "").trim()) answered.add(q.id);
  });
  const ids = new Set(questions.map(q => q.id));
  (Array.isArray(db[K_CLUSTERS]) ? db[K_CLUSTERS] : []).forEach(c => {
    if (!c || !String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim()) return;
    (c.memberIds || []).forEach(m => {
      const raw = String(m || "").trim();
      const id = byTicket.get(raw) || raw;
      if (ids.has(id)) answered.add(id);
    });
  });
  return answered.size;
}

async function countFromSnapshot(store) {
  const db = (await store.snapshot()) || {};
  const questions = Object.keys(db)
    .filter(k => k.startsWith(K_Q))
    .map(k => db[k])
    .filter(q => q && q.id && !isNotCounted(q));
  return {
    registeredStudents: delegateCardsFromDb(db).filter(u => !isProbeEmail(u.email)).length,
    questionsAsked: questions.length,
    questionsAnswered: answeredFromSnapshot(db, questions),
  };
}

async function compute(store) {
  if (typeof store.publicCounts === "function") {
    return store.publicCounts({ userPrefix: K_USER, isDemo: isNotCounted });
  }
  return countFromSnapshot(store);
}

const validValue = v => v && typeof v === "object" && typeof v.registeredStudents === "number";

async function computeShared(store) {
  const now = Date.now();
  let shared = null;
  try { shared = await store.get(K_PUBLIC_STATS); } catch { shared = null; }
  if (shared && validValue(shared.value)) {
    if (now - (shared.at || 0) < SHARED_TTL_MS) return { value: shared.value, at: shared.at };
    // Someone else is already recomputing: serve the last value meanwhile.
    if ((shared.leaseUntil || 0) > now) return { value: shared.value, at: shared.at };
  }
  try { await store.set(K_PUBLIC_STATS, { ...(shared || {}), leaseUntil: now + LEASE_MS }); } catch { /* best effort */ }
  const value = await compute(store);
  const at = Date.now();
  try { await store.set(K_PUBLIC_STATS, { value, at, leaseUntil: 0 }); }
  catch (err) { console.error("[aym-store] publicStats cache write failed:", err && err.message ? err.message : err); }
  return { value, at };
}

/** Aggregate-only numbers for the public site. Never throws; never returns PII. */
export async function publicStats(store) {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return { ...cache.value, updatedAt: cache.dataAt, cached: true };
  if (!pending) {
    pending = computeShared(store)
      .then(({ value, at }) => {
        cache = { value, at: Date.now(), dataAt: at };
        return cache;
      })
      .catch(err => {
        console.error("[aym-store] publicStats failed:", err && err.message ? err.message : err);
        return null;
      })
      .finally(() => { pending = null; });
  }
  const fresh = await pending;
  if (fresh) return { ...fresh.value, updatedAt: fresh.dataAt, cached: false };
  if (cache) return { ...cache.value, updatedAt: cache.dataAt, cached: true, stale: true };
  return { ...EMPTY, updatedAt: null, cached: false };
}

/** Tests: forget the in-process cache. */
export function resetPublicStatsCache() {
  cache = null;
  pending = null;
}
