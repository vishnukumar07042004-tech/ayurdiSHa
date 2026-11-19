/**
 * WAC registration IDs and the WAC delegate list — pure helpers shared by the staff upload panel
 * (preview / validation) and the server (import / sign-in). WAC's ID format is not confirmed yet,
 * so the default pattern is permissive; `WAC_ID_PATTERN` on the server can tighten it.
 */

/** Applied to the normalised ID (upper case, no spaces). 4–40 chars, same alphabet as pass numbers. */
export const DEFAULT_WAC_ID_PATTERN = "^[A-Z0-9][A-Z0-9/_-]{2,38}[A-Z0-9]$";

const DEFAULT_RE = new RegExp(DEFAULT_WAC_ID_PATTERN);

export function wacIdMatcher(pattern) {
  if (!pattern) return DEFAULT_RE;
  try { return new RegExp(String(pattern)); }
  catch { return DEFAULT_RE; }
}

/** Trim, upper-case, unify unicode dashes, drop every space. "" for nothing usable. */
export function normalizeWacId(raw) {
  return String(raw == null ? "" : raw)
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 60);
}

/** Normalised ID when it matches the pattern, else "". */
export function validWacId(raw, pattern) {
  const id = normalizeWacId(raw);
  return id && wacIdMatcher(pattern).test(id) ? id : "";
}

/** Storage key: the normalised ID without `- _ /`, so "WAC-26/001" and "WAC26001" are one delegate. */
export function wacIdKey(raw) {
  return normalizeWacId(raw).replace(/[-_/]+/g, "");
}

export const normEmail = e => String(e || "").trim().toLowerCase();
export const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ""));

/** "ananya@gmail.com" → "an•••@g•••.com". */
export function maskEmail(email) {
  const e = normEmail(email);
  const at = e.indexOf("@");
  if (at < 1) return e ? "•••" : "";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}•••@${host.slice(0, 1)}•••${tld}`;
}

/** "+91 98765 43210" → "•••• 3210". */
export function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  return `•••• ${d.slice(-4)}`;
}

export function normalizeAttendance(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (/(online|virtual|remote|digital|e-?delegate)/.test(s)) return "online";
  if (/(in[\s-]?person|physical|offline|on[\s-]?site|venue)/.test(s)) return "in-person";
  return s.slice(0, 40);
}

export function normalizeCategory(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const l = s.toLowerCase();
  if (/international|foreign|overseas|\bnri\b/.test(l)) return "international";
  if (/student|\bug\b|\bpg\b|scholar|\bintern\b/.test(l)) return "student";
  if (/faculty|teacher|professor/.test(l)) return "faculty";
  if (/delegate|practitioner|professional|doctor/.test(l)) return "delegate";
  return l.slice(0, 40);
}

/** The fields a WAC row can carry, with header spellings seen in registration exports. */
export const WAC_FIELDS = [
  { field: "wacId", label: "Registration ID", required: true,
    aliases: ["registration id", "registration no", "registration number", "reg id", "reg no", "reg number", "regno", "wac id", "wac no", "wac registration id", "wac registration number", "delegate id", "delegate no", "id"] },
  { field: "name", label: "Name", required: true,
    aliases: ["name", "full name", "delegate name", "participant name", "first name"] },
  { field: "email", label: "Email", required: true,
    aliases: ["email", "e-mail", "email id", "email address", "mail", "mail id"] },
  { field: "phone", label: "Mobile",
    aliases: ["mobile", "mobile no", "mobile number", "phone", "phone no", "phone number", "contact", "contact no", "whatsapp"] },
  { field: "institution", label: "Institution",
    aliases: ["institution", "institute", "college", "organisation", "organization", "affiliation", "university"] },
  { field: "category", label: "Category",
    aliases: ["category", "delegate category", "registration category", "type", "delegate type", "participant type"] },
  { field: "country", label: "Country", aliases: ["country", "nationality"] },
  { field: "state", label: "State", aliases: ["state", "state / ut", "state/ut", "province", "region"] },
  { field: "attendance", label: "Attendance",
    aliases: ["attendance", "mode", "attendance mode", "participation", "participation mode", "in person", "in-person / online"] },
];

const headerKey = h => String(h || "").trim().toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ");

/** Header row → `{ field: columnIndex }`. Exact alias matches first, then "contains" matches. */
export function detectColumns(headers) {
  const keys = (headers || []).map(headerKey);
  const map = {};
  const used = new Set();
  for (const pass of ["exact", "contains"]) {
    for (const f of WAC_FIELDS) {
      if (map[f.field] != null) continue;
      const i = keys.findIndex((k, j) => !used.has(j) && k && (pass === "exact"
        ? f.aliases.includes(k)
        : f.aliases.some(a => a.length > 3 && k.includes(a))));
      if (i >= 0) { map[f.field] = i; used.add(i); }
    }
  }
  return map;
}

/**
 * Neutralise spreadsheet formula injection (=, +, -, @, tab/CR) without dropping fields.
 * Phones stay intact (leading + is preserved for digit strings).
 */
export function sanitizeImportCell(raw, { phone = false } = {}) {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (phone) {
    const digits = s.replace(/[^\d+]/g, "");
    if (/^\+?\d{7,15}$/.test(digits.replace(/\s/g, ""))) return s.slice(0, 32);
  }
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

/** One raw row → a clean delegate (unvalidated). Phones are kept. */
export function cleanDelegateRow(r) {
  const email = sanitizeImportCell(clip(r && r.email, 160));
  return {
    wacId: normalizeWacId(r && r.wacId),
    name: sanitizeImportCell(clip(r && r.name, 120)),
    email,
    emailLower: normEmail(email),
    phone: sanitizeImportCell(clip(r && r.phone, 32), { phone: true }),
    institution: sanitizeImportCell(clip(r && r.institution, 200)),
    category: normalizeCategory(r && r.category),
    country: sanitizeImportCell(clip(r && r.country, 80)),
    state: sanitizeImportCell(clip(r && r.state, 80)),
    attendance: normalizeAttendance(r && r.attendance),
  };
}

/** Sheet grid (first row = headers) + mapping → raw row objects. Blank rows are skipped. */
export function rowsFromGrid(grid, mapping) {
  const rows = [];
  const body = Array.isArray(grid) ? grid.slice(1) : [];
  body.forEach((cells, i) => {
    if (!Array.isArray(cells) || !cells.some(c => String(c == null ? "" : c).trim())) return;
    const r = { line: i + 2 };
    for (const [field, idx] of Object.entries(mapping || {})) {
      if (idx != null && idx >= 0) r[field] = cells[idx];
    }
    rows.push(r);
  });
  return rows;
}

/**
 * Validate a list of rows. Returns `{ valid, problems, duplicates }`: `valid` are clean delegates
 * (first of each duplicate ID kept), `problems` `[{ line, issue }]` (no PII in the text).
 */
export function validateDelegateRows(rows, { pattern } = {}) {
  const re = wacIdMatcher(pattern);
  const valid = [];
  const problems = [];
  const seen = new Set();
  let duplicates = 0;
  (rows || []).forEach((raw, i) => {
    const line = (raw && raw.line) || i + 1;
    const r = cleanDelegateRow(raw);
    if (!r.wacId) { problems.push({ line, issue: "missing registration ID" }); return; }
    if (!re.test(r.wacId)) { problems.push({ line, issue: "registration ID format not recognised" }); return; }
    if (r.name.length < 2) { problems.push({ line, issue: "missing name" }); return; }
    if (!r.email) { problems.push({ line, issue: "missing email" }); return; }
    if (!validEmail(r.emailLower)) { problems.push({ line, issue: "email is not valid" }); return; }
    const key = wacIdKey(r.wacId);
    if (seen.has(key)) { duplicates += 1; problems.push({ line, issue: "duplicate registration ID (first row kept)" }); return; }
    seen.add(key);
    valid.push(r);
  });
  return { valid, problems, duplicates };
}

export const WAC_NO_MATCH = "We couldn't match those details. Check your WAC ID and the email you used on the WAC site.";
export const WAC_ALREADY_LINKED = "This WAC ID is already linked to another AYURDISHA account. Please visit the help desk.";
export const WAC_CLEAR_PHRASE = "CLEAR UNLINKED";
export const WAC_CONSENT_TEXT = "I agree that AYURDISHA may use these WAC registration details, my career stage and interests to run my Ask Desk questions, match me with mentors and contact me about my answers at WAC 2026.";

/**
 * Explicit share of the official WAC delegate list into the AYURDISHA profile.
 * Age and sex are not on that list (WAC export has Delegate ID, name, email, organisation,
 * category, country, state, mobile) — they stay as the person entered them here.
 */
export const WAC_SHARE_CONSENT_TEXT =
  "AYURDISHA is the Meet the Mentors hall of the 11th World Ayurveda Congress. Allow AYURDISHA to use the official WAC delegate record for this email: Delegate ID, name, email, organisation, category, country, state and mobile. Age and sex are not on the WAC list. You can stop sharing on this page at any time. Name or address corrections belong on the WAC registration site.";

export const WAC_SHARE_FIELDS = [
  ["wacId", "WAC Delegate ID"],
  ["name", "Name"],
  ["email", "Email"],
  ["institution", "Organisation"],
  ["category", "Category"],
  ["country", "Country"],
  ["state", "State"],
  ["phone", "Mobile"],
];

