import { sanitizeSource, istDayKey } from "../shared/source.js";

/** Anonymous QR / poster visit counters: per source, per IST day. No IP, cookie, or user id is stored. */
export const K_VISIT_SOURCES = "aym:visit-sources";

const RATE_WINDOW_MS = 10 * 60 * 1000;
// Generous: a whole venue scans the poster QR from one Wi-Fi address; each device counts once anyway.
export const VISIT_RATE_MAX = 300;
const RATE_MAX = VISIT_RATE_MAX;
const MAX_SOURCES = 200;
const buckets = new Map();

function clientIp(req) {
  const fwd = req && req.headers && req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || "unknown";
}

/** In-memory per-instance limiter; the IP is only a map key and is never persisted. */
export function visitRateOk(req, now = Date.now()) {
  const ip = clientIp(req);
  let b = buckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + RATE_WINDOW_MS };
    buckets.set(ip, b);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
  }
  b.count += 1;
  return b.count <= RATE_MAX;
}

export async function recordVisitSource(store, rawSrc, now = Date.now()) {
  const src = sanitizeSource(rawSrc);
  if (!src) return { ok: false, src: "" };
  const day = istDayKey(now);
  if (typeof store.incrementVisitSource === "function") {
    await store.incrementVisitSource(src, day);
    return { ok: true, src, day };
  }
  const writer = prev => {
    const rec = prev && typeof prev === "object" ? prev : {};
    const totals = { ...(rec.totals || {}) };
    if (!(src in totals) && Object.keys(totals).length >= MAX_SOURCES) return rec;
    totals[src] = (Number(totals[src]) || 0) + 1;
    const days = { ...(rec.days || {}) };
    days[day] = { ...(days[day] || {}), [src]: (Number(days[day]?.[src]) || 0) + 1 };
    return { totals, days, updatedAt: now };
  };
  if (typeof store.transact === "function" && store.name === "file") {
    await store.transact(db => { db[K_VISIT_SOURCES] = writer(db[K_VISIT_SOURCES]); return db; });
  } else {
    await store.set(K_VISIT_SOURCES, writer(await store.get(K_VISIT_SOURCES)));
  }
  return { ok: true, src, day };
}

export async function readVisitSources(store) {
  const rec = typeof store.getVisitSources === "function"
    ? await store.getVisitSources()
    : await store.get(K_VISIT_SOURCES);
  return {
    totals: (rec && rec.totals) || {},
    days: (rec && rec.days) || {},
    updatedAt: (rec && rec.updatedAt) || 0,
  };
}
