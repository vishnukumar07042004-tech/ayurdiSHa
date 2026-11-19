#!/usr/bin/env node
/**
 * Import WAC's delegate export into "Sign in with WAC ID" through the staff `wacDelegatesImport` op.
 *
 *   node scripts/wac/import-delegates.mjs "<export.csv>"                       # dry run (default)
 *   AYM_SERVICE_TOKEN=... node scripts/wac/import-delegates.mjs "<export.csv>" --apply --url=https://ayushmarg.vercel.app
 *
 * Options: --pattern=<regex> (else WAC_ID_PATTERN, else derived from the IDs) · --batch=200 · --start=<n>
 * (resume: skip the first n valid rows) · --stats (counts only, no import; needs --url).
 *
 * The file is real personal data: it is read in place, never copied, and nothing here prints or
 * writes a name, email, phone or ID — only counts, ID shapes (`AAA99999`) and letter prefixes.
 * Address, amount, dates, tracking and UTR columns are never read into the rows sent.
 * Imports are upserts keyed by WAC ID, so re-running (or resuming) is safe.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  detectColumns, validateDelegateRows, normalizeWacId, wacIdKey, normEmail, normalizeAttendance, wacIdMatcher,
} from "../../shared/wacId.js";
import { serviceHeaders, hasServiceToken, checkServiceAuth, NO_TOKEN_HELP } from "../lib/staffAuth.mjs";

export const DEFAULT_BATCH = 200;
const PLACEHOLDER_ID = "ABC12345";

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** RFC 4180-ish: BOM, quoted fields with commas / newlines / doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

const hk = h => String(h || "").trim().toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ");

/** WAC export headers → delegate fields. Anything not listed (address, payment, dates) is never read. */
const EXPORT_HEADERS = {
  wacId: ["delegate id"],
  title: ["title"],
  name: ["name"],
  email: ["email"],
  phone: ["mobile"],
  institution: ["organization name", "organisation name"],
  category: ["delegate type"],
  country: ["country"],
  state: ["state"],
};
export const EXCLUDED_HEADERS = ["address", "city", "amount paid", "date created", "tracking id", "utr no", "utr no."];

/** Header row → `{ field: index }`: the WAC export's own headers first, then the generic auto-detect. */
export function exportMapping(headers) {
  const keys = (headers || []).map(hk);
  const map = {};
  for (const [field, names] of Object.entries(EXPORT_HEADERS)) {
    const i = keys.findIndex(k => names.includes(k));
    if (i >= 0) map[field] = i;
  }
  const auto = detectColumns(headers);
  const taken = new Set(Object.values(map));
  for (const [field, i] of Object.entries(auto)) {
    if (map[field] == null && field !== "attendance" && !taken.has(i) && !EXCLUDED_HEADERS.includes(keys[i])) {
      map[field] = i;
      taken.add(i);
    }
  }
  return map;
}

const squash = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

const HONORIFIC = /^(dr|prof|vaidya|vd|mr|mrs|ms|miss|shri|smt)$/;
const bareWord = w => String(w || "").toLowerCase().replace(/\.+$/, "");

/** "Dr." + "A B" → "Dr. A B"; a name that already starts with an honorific is kept as typed. */
export function fullName(title, name) {
  const t = squash(title);
  const n = squash(name);
  if (!t || !n) return n;
  const first = bareWord(n.split(" ")[0]);
  if (HONORIFIC.test(first) || t.split(" ").some(w => bareWord(w) === first)) return n;
  return `${t} ${n}`;
}

/** Only a clearly online / in-person delegate type sets attendance; anything else stays blank. */
export function attendanceFromType(type) {
  const a = normalizeAttendance(type);
  return a === "online" || a === "in-person" ? a : "";
}

/** CSV grid (first row = headers) → rows in the `wacDelegatesImport` shape. */
export function delegateRowsFromGrid(grid, mapping = exportMapping(grid && grid[0])) {
  const cell = (cells, f) => (mapping[f] != null ? squash(cells[mapping[f]]) : "");
  return (grid || []).slice(1).map((cells, i) => {
    const type = cell(cells, "category").replace(/['’]/g, "");
    return {
      line: i + 2,
      wacId: normalizeWacId(cell(cells, "wacId")),
      name: fullName(cell(cells, "title"), cell(cells, "name")),
      email: normEmail(cell(cells, "email")),
      phone: cell(cells, "phone"),
      institution: cell(cells, "institution"),
      category: type,
      country: cell(cells, "country"),
      state: cell(cells, "state"),
      attendance: attendanceFromType(type),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Analysis (aggregates only)                                          */
/* ------------------------------------------------------------------ */

/** "WAC-26/001" → "AAA-99/999". */
export const idShape = id => String(id || "").replace(/[A-Z]/g, "A").replace(/[0-9]/g, "9");
export const idPrefix = id => (String(id || "").match(/^[A-Z]+/) || [""])[0];

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

const span = (lens, unit) => {
  const lo = Math.min(...lens);
  const hi = Math.max(...lens);
  return lo === hi ? `${unit}{${lo}}` : `${unit}{${lo},${hi}}`;
};

/**
 * Regex for the observed IDs. When every ID is letters then digits it covers all of them
 * (`^[A-Z]{3,4}\d{5}$`, or the prefix literally when all share one); otherwise the dominant shape.
 */
export function derivePattern(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return "";
  const parts = list.map(id => id.match(/^([A-Z]+)(\d+)$/));
  if (parts.every(Boolean)) {
    const prefixes = new Set(parts.map(m => m[1]));
    const letters = prefixes.size === 1 ? escapeRe(parts[0][1]) : span(parts.map(m => m[1].length), "[A-Z]");
    return `^${letters}${span(parts.map(m => m[2].length), "\\d")}$`;
  }
  const shapes = countBy(list, idShape);
  const [shape] = Object.entries(shapes).sort((a, b) => b[1] - a[1])[0];
  const same = list.filter(id => idShape(id) === shape);
  let out = "^";
  for (const m of shape.matchAll(/A+|9+|[^A9]+/g)) {
    const run = m[0];
    const slice = same.map(id => id.slice(m.index, m.index + run.length));
    if (run[0] === "A") out += slice.every(v => v === slice[0]) ? escapeRe(slice[0]) : `[A-Z]{${run.length}}`;
    else if (run[0] === "9") out += `\\d{${run.length}}`;
    else out += escapeRe(run);
  }
  return out + "$";
}

export function countBy(list, fn) {
  const out = {};
  for (const x of list) {
    const k = fn(x);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

const top = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "0%");

/** Everything the dry run prints. Values are counts, shapes, prefixes and category labels only. */
export function analyseRows(rows, { pattern } = {}) {
  const derived = derivePattern(rows.map(r => r.wacId).filter(Boolean));
  const usePattern = pattern || derived;
  const { valid, problems, duplicates } = validateDelegateRows(rows, { pattern: usePattern });
  const byReason = countBy(problems, p => p.issue);

  const idsByEmail = new Map();
  for (const r of valid) {
    const set = idsByEmail.get(r.emailLower) || new Set();
    set.add(wacIdKey(r.wacId));
    idsByEmail.set(r.emailLower, set);
  }
  const shared = [...idsByEmail.values()].filter(s => s.size > 1);

  const ids = rows.map(r => r.wacId).filter(Boolean);
  const re = wacIdMatcher(derived);
  const fill = f => rows.filter(r => String(r[f] || "").trim()).length;
  return {
    total: rows.length,
    valid: valid.length,
    invalid: problems.length,
    byReason,
    duplicateIds: duplicates,
    sharedEmails: shared.length,
    sharedEmailIds: shared.reduce((n, s) => n + s.size, 0),
    shapes: countBy(ids, idShape),
    prefixes: countBy(ids, idPrefix),
    derivedPattern: derived,
    patternUsed: usePattern,
    matchDerived: ids.filter(id => re.test(id)).length,
    placeholderIsReal: ids.some(id => wacIdKey(id) === PLACEHOLDER_ID),
    types: countBy(rows, r => r.category || "(blank)"),
    categories: countBy(valid, r => r.category || "(blank)"),
    attendance: countBy(valid, r => r.attendance || "(blank)"),
    countries: countBy(rows, r => r.country || "(blank)"),
    fill: {
      state: fill("state"), institution: fill("institution"), phone: fill("phone"),
      phone10: rows.filter(r => /^\d{10}$/.test(String(r.phone || "").replace(/[\s-]/g, ""))).length,
    },
    validRows: valid,
  };
}

export function summaryLines(a, { mapping, headers } = {}) {
  const out = [];
  const line = (k, v) => out.push(`  ${k.padEnd(28)} ${v}`);
  const list = obj => top(obj, 50).map(([k, n]) => `${k}: ${n}`).join(", ") || "—";
  if (mapping && headers) {
    const used = Object.entries(mapping).map(([f, i]) => `${f} ← "${headers[i]}"`).join(", ");
    const skipped = headers.filter((_, i) => !Object.values(mapping).includes(i));
    line("Mapped columns", used);
    line("Not read (excluded)", skipped.map(h => `"${h}"`).join(", ") || "—");
  }
  line("Rows", a.total);
  line("Valid (would import)", a.valid);
  line("Invalid", a.invalid ? `${a.invalid} — ${list(a.byReason)}` : "0");
  line("Duplicate IDs (rows)", a.duplicateIds);
  line("Emails shared by >1 ID", a.sharedEmails ? `${a.sharedEmails} emails (${a.sharedEmailIds} IDs)` : "0");
  line("ID shapes", list(a.shapes));
  line("ID prefixes", list(a.prefixes));
  line("Derived WAC_ID_PATTERN", `${a.derivedPattern} (${a.matchDerived}/${a.total} IDs match)`);
  if (a.patternUsed !== a.derivedPattern) line("Pattern used to validate", a.patternUsed);
  line(`"${PLACEHOLDER_ID}" is a real ID`, a.placeholderIsReal ? "YES — change the placeholder" : "no");
  line("Delegate types", list(a.types));
  line("→ category (valid rows)", list(a.categories));
  line("→ attendance (valid rows)", list(a.attendance));
  line("Countries (top 10)", top(a.countries).map(([k, n]) => `${k}: ${n}`).join(", "));
  line("Distinct countries", Object.keys(a.countries).length);
  line("State filled", `${a.fill.state}/${a.total} (${pct(a.fill.state, a.total)})`);
  line("Institution filled", `${a.fill.institution}/${a.total}`);
  line("Mobile filled / 10-digit", `${a.fill.phone} / ${a.fill.phone10}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* Apply                                                               */
/* ------------------------------------------------------------------ */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RETRY = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

/**
 * POSTs `{op, ...body}` with the service token (AYM_SERVICE_TOKEN) and a cookie jar; resolves
 * `{ status, data }` (status 0 = network / timeout).
 */
export function makeClient(base, { fetchImpl = fetch, timeoutMs = 60000, headers = serviceHeaders() } = {}) {
  const jar = new Map();
  return async function call(op, body = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`${base}/api/aym-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
        body: JSON.stringify({ op, ...body }),
        signal: ctrl.signal,
      });
      const cookies = r.headers && typeof r.headers.getSetCookie === "function"
        ? r.headers.getSetCookie()
        : [r.headers && r.headers.get && r.headers.get("set-cookie")].filter(Boolean);
      for (const c of cookies) {
        const [pair, ...attrs] = c.split(";");
        const i = pair.indexOf("=");
        if (i < 0) continue;
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
      }
      const data = await r.json().catch(() => ({}));
      return { status: r.status, data };
    } catch (err) {
      return { status: 0, data: { error: err && err.name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : "network error" } };
    } finally {
      clearTimeout(timer);
    }
  };
}

export const errText = r => String((r && r.data && r.data.error) || "").replace(/\S+@\S+/g, "[email]").slice(0, 160);

/** One call with retries on network / 429 / 5xx (honours `retryIn`), and one re-login on 403. */
export async function callWithRetry(call, op, body, { attempts = 5, relogin, wait = sleep, log = () => {} } = {}) {
  let r;
  let reauthed = false;
  for (let i = 0; i < attempts; i++) {
    r = await call(op, body);
    if (r.status === 200) return r;
    if (r.status === 403 && relogin && !reauthed) { reauthed = true; await relogin(); i--; continue; }
    if (!RETRY.has(r.status) || i === attempts - 1) return r;
    const hint = Number(r.data && r.data.retryIn) * 1000;
    const ms = Math.min(30000, Math.max(hint || 0, 1000 * 2 ** i));
    log(`  ${op}: HTTP ${r.status || "network"} — retry ${i + 1}/${attempts - 1} in ${Math.round(ms / 1000)}s`);
    await wait(ms);
  }
  return r;
}

/**
 * Sends `rows` in batches of `batch` from offset `start`. Resolves totals; on a failed batch
 * resolves `{ ok: false, resumeAt }` so the run can continue with `--start=<resumeAt>`.
 */
export async function importBatches(call, rows, { batch = DEFAULT_BATCH, start = 0, batchId, filename, relogin, wait, log = () => {} } = {}) {
  const totals = { sent: 0, imported: 0, created: 0, updated: 0, skipped: 0 };
  for (let i = start; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const r = await callWithRetry(call, "wacDelegatesImport", { rows: chunk, batchId, filename }, { relogin, wait, log });
    if (r.status !== 200) {
      return { ok: false, resumeAt: i, status: r.status, error: errText(r), unknownOp: r.status === 400 && /unknown op/i.test(errText(r)), ...totals };
    }
    const d = r.data || {};
    totals.sent += chunk.length;
    totals.imported += d.imported || 0;
    totals.created += d.created || 0;
    totals.updated += d.updated || 0;
    totals.skipped += d.problemCount || 0;
    log(`  rows ${i + 1}–${i + chunk.length} of ${rows.length}: ${d.imported || 0} imported (${d.created || 0} new, ${d.updated || 0} updated)${d.problemCount ? `, ${d.problemCount} skipped by the server` : ""}`);
  }
  return { ok: true, ...totals };
}

/** Counts only — the stats response also carries alerts with IDs, which are never printed. */
export function statsLines(d) {
  const li = (d && d.lastImport) || {};
  return [
    `  Delegates on file          ${d.total} (linked ${d.linked}, unlinked ${d.unlinked})`,
    `  Sign-in option             ${d.off ? "switched off (WAC_SIGNIN)" : d.enabled ? "LIVE" : "hidden / coming soon"} · mode ${d.mode} · backend ${d.backend}`,
    `  Server WAC_ID_PATTERN      ${d.pattern}`,
    `  Last import                rows ${li.rows || 0} · imported ${li.imported || 0} · new ${li.created || 0} · updated ${li.updated || 0} · skipped ${li.skipped || 0}`,
    `  Blocked-account alerts     ${Array.isArray(d.alerts) ? d.alerts.length : 0}`,
  ];
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      flags[k] = rest.length ? rest.join("=") : true;
    } else pos.push(a);
  }
  return { flags, file: pos[0] };
}

async function main() {
  const { flags, file } = parseArgs(process.argv.slice(2));
  const base = String(flags.url || flags.base || "").replace(/\/$/, "");
  const apply = Boolean(flags.apply);
  const statsOnly = Boolean(flags.stats);

  if (statsOnly) {
    if (!base) { console.error("--stats needs --url=https://…"); return 1; }
  } else if (!file || !fs.existsSync(file)) {
    console.error("Usage: node scripts/wac/import-delegates.mjs <export.csv> [--apply --url=https://…]");
    return 1;
  }

  let valid = [];
  if (!statsOnly) {
    const grid = parseCsv(fs.readFileSync(file, "utf8"));
    if (grid.length < 2) { console.error("The file has no data rows."); return 1; }
    const headers = grid[0].map(h => squash(h));
    const mapping = exportMapping(headers);
    const missing = ["wacId", "name", "email"].filter(f => mapping[f] == null);
    if (missing.length) { console.error(`Required columns not found: ${missing.join(", ")}.`); return 1; }
    const rows = delegateRowsFromGrid(grid, mapping);
    const pattern = String(flags.pattern || process.env.WAC_ID_PATTERN || "").trim();
    const a = analyseRows(rows, { pattern });
    console.log(`\n== WAC delegate export — ${apply ? "APPLY" : "DRY RUN"} (aggregates only, no row values)`);
    for (const l of summaryLines(a, { mapping, headers })) console.log(l);
    valid = a.validRows;
    if (!apply) {
      console.log(`\nNothing was sent. Re-run with --apply --url=https://… (and AYM_SERVICE_TOKEN) to import ${a.valid} rows.`);
      return 0;
    }
    if (!valid.length) { console.error("No valid rows to import."); return 1; }
  }

  if (!base) { console.error("--apply needs --url=https://…"); return 1; }
  if (!hasServiceToken()) { console.error(NO_TOKEN_HELP); return 1; }

  const call = makeClient(base);
  const login = async () => {
    const r = await checkServiceAuth(async (op, b) => { const x = await callWithRetry(call, op, b); return { status: x.status, body: x.data }; });
    if (!r.ok) throw new Error(`staff auth failed (HTTP ${r.status}): ${r.error}`);
  };
  try {
    await login();
    console.log(`\nAuthenticated as staff (service token) on ${base}.`);
    if (!statsOnly) {
      const batch = Math.max(1, Math.min(2000, Math.floor(Number(flags.batch) || DEFAULT_BATCH)));
      const start = Math.max(0, Math.floor(Number(flags.start) || 0));
      const batchId = `cli${Date.now().toString(36)}`;
      console.log(`Importing ${valid.length - start} rows in batches of ${batch}${start ? ` (resuming at row ${start})` : ""}…`);
      const out = await importBatches(call, valid, {
        batch, start, batchId, filename: path.basename(file), relogin: login, log: m => console.log(m),
      });
      console.log(`Sent ${out.sent} · imported ${out.imported} · new ${out.created} · updated ${out.updated} · skipped by server ${out.skipped}`);
      if (!out.ok) {
        console.error(`✗ Batch at row ${out.resumeAt} failed (HTTP ${out.status || "network"}): ${out.error}`);
        if (out.unknownOp) console.error("  This deploy has no WAC-ID sign-in yet — deploy it first.");
        console.error(`  Resume (safe to repeat): add --start=${out.resumeAt}`);
        return 1;
      }
    }
    const st = await callWithRetry(call, "wacDelegatesStats", {}, { relogin: login });
    if (st.status !== 200) { console.error(`✗ wacDelegatesStats failed (HTTP ${st.status}): ${errText(st)}`); return 1; }
    console.log("\n== Server counts");
    for (const l of statsLines(st.data)) console.log(l);
    const cfg = await call("wacConfig");
    if (cfg.status === 200) console.log(`  Public wacConfig            enabled=${Boolean(cfg.data.enabled)} comingSoon=${Boolean(cfg.data.comingSoon)} (cached ≤ 60 s per server instance)`);
    return 0;
  } catch (err) {
    console.error(`✗ ${String((err && err.message) || err).slice(0, 200)}`);
    return 1;
  } finally {
    await call("logout").catch(() => {});
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().then(code => { process.exitCode = code; }, err => {
    console.error(`✗ ${String((err && err.message) || err).slice(0, 200)}`);
    process.exitCode = 1;
  });
}
