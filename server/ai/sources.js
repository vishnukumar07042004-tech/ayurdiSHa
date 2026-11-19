/**
 * Trusted-source allow-list (`config/ai-sources.json`, curated by the knowledge-base build) and
 * authority helpers. The file format is read defensively: an array of domains, an array of
 * `{domain|host|url, authority, label}` objects, or an object holding such an array under
 * `sources` / `allowList` / `domains`, or a `{ "<domain>": { authority } }` map.
 */

import fs from "node:fs";
import path from "node:path";
import { PREVIEW_ROOT } from "../env.js";

export const SOURCES_FILE = path.resolve(PREVIEW_ROOT, "config/ai-sources.json");

const AUTHORITY_RANK = {
  regulator: 1,
  statutory: 1,
  government: 0.9,
  official: 0.9,
  international: 0.8,
  council: 0.85,
  research: 0.75,
  congress: 0.6,
  university: 0.75,
  academic: 0.75,
  journal: 0.75,
  "peer-reviewed": 0.75,
  professional: 0.6,
  institution: 0.6,
  news: 0.4,
  other: 0.3,
};

/** Sources that may carry fees, dates, cut-offs and seat numbers. */
const REGULATOR_GRADE = new Set(["regulator", "statutory", "government", "official", "council"]);

export function authorityRank(a) {
  const k = String(a || "").toLowerCase().trim();
  if (k in AUTHORITY_RANK) return AUTHORITY_RANK[k];
  for (const [name, v] of Object.entries(AUTHORITY_RANK)) if (k.includes(name)) return v;
  return 0.3;
}

export function isRegulatorGrade(a) {
  const k = String(a || "").toLowerCase().trim();
  if (REGULATOR_GRADE.has(k)) return true;
  return [...REGULATOR_GRADE].some(n => k.includes(n));
}

export function hostOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function entryFrom(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const d = raw.includes("/") ? hostOf(raw.startsWith("http") ? raw : `https://${raw}`) : raw.toLowerCase().replace(/^www\./, "");
    return d ? { domain: d, authority: "" } : null;
  }
  if (typeof raw !== "object") return null;
  const src = raw.domain || raw.host || raw.hostname || raw.url || raw.site || "";
  const d = String(src).includes("/") || String(src).startsWith("http") ? hostOf(String(src).startsWith("http") ? src : `https://${src}`) : String(src).toLowerCase().replace(/^www\./, "");
  if (!d) return null;
  return { domain: d, authority: String(raw.authority || raw.tier || raw.type || ""), label: String(raw.label || raw.name || raw.title || "") };
}

export function parseAllowList(json) {
  let list = [];
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === "object") {
    const arr = json.sources || json.allowList || json.allowlist || json.domains || json.trusted || json.items;
    if (Array.isArray(arr)) list = arr;
    else list = Object.entries(json).filter(([k]) => k.includes(".")).map(([domain, v]) => ({ domain, ...(v && typeof v === "object" ? v : {}) }));
  }
  return list.map(entryFrom).filter(Boolean);
}

let cached = null;

/** `{ entries, loaded }`; `loaded` is false when the file is missing (citations then only need to exist in the KB). */
export function loadAllowList({ file = SOURCES_FILE, fresh = false } = {}) {
  if (cached && !fresh && cached.file === file) return cached;
  let entries = [];
  let loaded = false;
  try {
    entries = parseAllowList(JSON.parse(fs.readFileSync(file, "utf8")));
    loaded = entries.length > 0;
  } catch { /* not built yet */ }
  cached = { file, entries, loaded };
  return cached;
}

export function setAllowListForTests(entries) {
  cached = { file: SOURCES_FILE, entries: parseAllowList(entries), loaded: true };
}

export function resetAllowList() {
  cached = null;
}

/** Allow-list entry for a URL (longest matching domain), or null. */
export function allowedSource(url, allow = loadAllowList()) {
  const h = hostOf(url);
  if (!h) return null;
  let best = null;
  for (const e of allow.entries) {
    if (h === e.domain || h.endsWith(`.${e.domain}`)) {
      if (!best || e.domain.length > best.domain.length) best = e;
    }
  }
  return best;
}

/** True when the URL is allowed (or when no allow-list has been built yet). */
export function urlAllowed(url, allow = loadAllowList()) {
  if (!allow.loaded) return Boolean(hostOf(url));
  return Boolean(allowedSource(url, allow));
}

let rawCache = null;
function rawSources(file = SOURCES_FILE) {
  if (rawCache && rawCache.file === file) return rawCache.list;
  let list = [];
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    list = Array.isArray(json) ? json : [];
  } catch { list = []; }
  rawCache = { file, list };
  return list;
}

/** "National Commission for Indian System of Medicine (NCISM)" → "NCISM"; "National Testing Agency — AIAPGET" → "National Testing Agency". */
export function shortSourceName(name) {
  const n = String(name || "").trim();
  const paren = n.match(/\(([^)]{2,40})\)/);
  if (paren && !/\s/.test(paren[1].trim())) return paren[1].trim();
  return n.split(/\s+[—–-]\s+|,\s+/)[0].trim();
}

/**
 * Homepages of regulator-grade bodies on the allow-list for a stream (stream-specific first, then
 * the all-stream ones). The only links a mentor-assist draft may offer as resources.
 */
export function officialHomepages(stream = "", { allow = loadAllowList(), file = SOURCES_FILE, max = 8 } = {}) {
  const out = [];
  const seen = new Set();
  const entries = rawSources(file).filter(e => e && e.domain && !e.api && isRegulatorGrade(e.authority));
  const covers = e => (Array.isArray(e.streams) ? e.streams : []).includes(stream);
  const wildcard = e => (Array.isArray(e.streams) ? e.streams : []).includes("*");
  const ordered = [...entries.filter(e => stream && covers(e)), ...entries.filter(e => wildcard(e) && !(stream && covers(e)))];
  for (const e of ordered) {
    let url = `https://${e.domain}/`;
    try { if (Array.isArray(e.seeds) && e.seeds[0]) url = `${new URL(e.seeds[0]).origin}/`; } catch { /* keep the bare domain */ }
    const host = hostOf(url);
    if (!host || seen.has(host) || !urlAllowed(url, allow)) continue;
    seen.add(host);
    out.push({ name: String(e.name || e.domain), short: shortSourceName(e.name || e.domain), url, domain: e.domain, authority: String(e.authority || "") });
    if (out.length >= max) break;
  }
  return out;
}
