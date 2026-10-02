import { K_Q, K_CLUSTERS } from "./store.js";
import { K_USER, isDemoDelegate, delegateCardsFromDb } from "./register.js";

const TTL_MS = 60 * 1000;
const EMPTY = { registeredStudents: null, questionsAsked: null, questionsAnswered: null };

let cache = null;
let pending = null;

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
    .filter(q => q && q.id && !isDemoDelegate(q));
  return {
    registeredStudents: delegateCardsFromDb(db).length,
    questionsAsked: questions.length,
    questionsAnswered: answeredFromSnapshot(db, questions),
  };
}

async function compute(store) {
  if (typeof store.publicCounts === "function") {
    return store.publicCounts({ userPrefix: K_USER, isDemo: isDemoDelegate });
  }
  return countFromSnapshot(store);
}

/** Aggregate-only numbers for the public site. Never throws; never returns PII. */
export async function publicStats(store) {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return { ...cache.value, updatedAt: cache.at, cached: true };
  if (!pending) {
    pending = compute(store)
      .then(value => {
        cache = { value, at: Date.now() };
        return cache;
      })
      .catch(err => {
        console.error("[aym-store] publicStats failed:", err && err.message ? err.message : err);
        return null;
      })
      .finally(() => { pending = null; });
  }
  const fresh = await pending;
  if (fresh) return { ...fresh.value, updatedAt: fresh.at, cached: false };
  if (cache) return { ...cache.value, updatedAt: cache.at, cached: true, stale: true };
  return { ...EMPTY, updatedAt: null, cached: false };
}
