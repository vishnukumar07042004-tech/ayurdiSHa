import { resolveEntryUrl, sanitizeSource } from "../shared/source.js";

const SOURCE_KEY = "aym-src";
const COUNTED_KEY = "aym-src-counted";
const RETURN_KEY = "aym-return-ask";
const RETURN_TTL_MS = 30 * 60 * 1000;

function session() {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; }
}

function read(key) {
  try { return session()?.getItem(key) ?? null; } catch { return null; }
}

function write(key, value) {
  try {
    const s = session();
    if (!s) return;
    if (value == null) s.removeItem(key);
    else s.setItem(key, value);
  } catch { /* private mode */ }
}

/** Source tag for this tab's visit (e.g. `qr`), or "". */
export function currentSource() {
  return sanitizeSource(read(SOURCE_KEY));
}

export function rememberSource(src) {
  const clean = sanitizeSource(src);
  if (clean) write(SOURCE_KEY, clean);
  return clean;
}

/** True once per tab session per source, so reloads and back-navigation don't inflate counts. */
export function claimVisitCount(src) {
  const clean = sanitizeSource(src);
  if (!clean) return false;
  let seen = [];
  try { seen = JSON.parse(read(COUNTED_KEY) || "[]"); } catch { seen = []; }
  if (!Array.isArray(seen)) seen = [];
  if (seen.includes(clean)) return false;
  write(COUNTED_KEY, JSON.stringify([...seen, clean].slice(-20)));
  return true;
}

/** Ask Desk → Register: remember to come back, with any question draft the visitor had. */
export function markReturnToAsk(draft, now = Date.now()) {
  const keep = {};
  for (const k of ["theme", "subtheme", "question"]) {
    const v = draft && typeof draft[k] === "string" ? draft[k] : "";
    if (v.trim()) keep[k] = v.slice(0, 4000);
  }
  write(RETURN_KEY, JSON.stringify({ at: now, draft: keep }));
}

export function peekReturnToAsk(now = Date.now()) {
  let rec = null;
  try { rec = JSON.parse(read(RETURN_KEY) || "null"); } catch { rec = null; }
  if (!rec || typeof rec !== "object" || !(now - Number(rec.at || 0) < RETURN_TTL_MS)) return null;
  return { draft: rec.draft && typeof rec.draft === "object" ? rec.draft : {} };
}

/** Consume the return intent. Returns { draft } or null. */
export function takeReturnToAsk(now = Date.now()) {
  const rec = peekReturnToAsk(now);
  write(RETURN_KEY, null);
  return rec;
}

export function clearReturnToAsk() {
  write(RETURN_KEY, null);
}

function pingVisit(src) {
  try {
    fetch("/api/aym-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "visitSource", src }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* offline */ }
}

/**
 * Run before the router mounts: `/ask` and `/a` become `/#ask`, `?src=` is stored for this tab
 * (and counted once), then stripped from the address bar.
 */
export function applyEntryUrl(loc = typeof window !== "undefined" ? window.location : null) {
  if (!loc) return { source: "" };
  const { source, url } = resolveEntryUrl(loc);
  if (source) {
    rememberSource(source);
    if (claimVisitCount(source)) pingVisit(source);
  }
  if (url && typeof history !== "undefined") {
    try { history.replaceState(history.state, "", url); } catch { /* ignore */ }
  }
  return { source, url };
}

export async function fetchVisitSources() {
  const r = await fetch("/api/aym-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ op: "visitSourcesGet" }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
  return data;
}
