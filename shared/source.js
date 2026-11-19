/**
 * QR / poster attribution — pure helpers shared by the browser and the server.
 * A "source" is an anonymous campaign tag like `qr` or `poster-hall-a`; never personal data.
 */

export const SOURCE_RE = /^[a-z0-9-]{1,32}$/;

/** Lower-case, map spaces/underscores to `-`, drop anything else, clamp to 32 chars. "" when unusable. */
export function sanitizeSource(raw) {
  if (raw == null) return "";
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return SOURCE_RE.test(s) ? s : "";
}

/** `/ask` and `/a` (any case, optional trailing slash) open the Ask Desk directly. */
export function isAskShortPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "").toLowerCase();
  return p === "/ask" || p === "/a";
}

/**
 * Canonical in-app URL for an entry URL. Short Ask paths become `/#ask`; a `src` query param is
 * pulled out (and dropped from the URL) so the bar stays clean and reloads don't double-count.
 * Returns { source, url } where url is null when no rewrite is needed.
 */
export function resolveEntryUrl({ pathname = "/", search = "", hash = "" } = {}) {
  const params = new URLSearchParams(search || "");
  const hadSrc = params.has("src");
  const source = sanitizeSource(params.get("src"));
  params.delete("src");
  const rest = params.toString();
  const query = rest ? `?${rest}` : "";
  if (isAskShortPath(pathname)) {
    return { source, url: `/${query}#ask` };
  }
  if (!hadSrc) return { source: "", url: null };
  return { source, url: `${pathname || "/"}${query}${hash || ""}` };
}

/** Calendar day in India (UTC+5:30) — the Congress runs on IST. */
export function istDayKey(now = Date.now()) {
  return new Date(Number(now) + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Rows of { source, visits, visitsToday, registrations, questions } sorted by reach.
 * `visits` is the stored counter doc ({ totals, days }); delegates/questions carry `source`.
 */
export function summarizeSources({ visits = {}, delegates = [], questions = [], now = Date.now() } = {}) {
  const today = istDayKey(now);
  const rows = new Map();
  const row = src => {
    if (!rows.has(src)) rows.set(src, { source: src, visits: 0, visitsToday: 0, registrations: 0, questions: 0 });
    return rows.get(src);
  };
  for (const [src, n] of Object.entries(visits.totals || {})) {
    const s = sanitizeSource(src);
    if (s) row(s).visits += Number(n) || 0;
  }
  for (const [src, n] of Object.entries((visits.days || {})[today] || {})) {
    const s = sanitizeSource(src);
    if (s) row(s).visitsToday += Number(n) || 0;
  }
  for (const d of delegates || []) {
    const s = sanitizeSource(d && d.source);
    if (s) row(s).registrations += 1;
  }
  for (const q of questions || []) {
    const s = sanitizeSource(q && q.source);
    if (s) row(s).questions += 1;
  }
  return [...rows.values()].sort((a, b) =>
    (b.visits - a.visits) || (b.registrations - a.registrations) || (b.questions - a.questions) || a.source.localeCompare(b.source));
}
