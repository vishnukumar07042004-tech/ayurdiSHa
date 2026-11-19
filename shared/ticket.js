/**
 * Track lookup input → the stored form (lower-case ticket or email). Tickets are
 * `AYM-Q-` + 8–10 letters/digits; students paste them with spaces, phone-autocorrected dashes,
 * a leading "#" or without the prefix.
 */
const DASHES = /[\u2010-\u2015\u2212\u2043\uFE58\uFE63\uFF0D_\s./:]+/g;

export function normalizeLookupQuery(raw) {
  const s = String(raw == null ? "" : raw).normalize("NFKC").trim();
  if (!s) return "";
  if (s.includes("@")) return s.replace(/\s+/g, "").toLowerCase();
  const compact = s.toUpperCase().replace(/^#+/, "").replace(DASHES, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  const m = compact.match(/^(?:TICKET-?)?AYM-?Q-?([A-Z0-9]{4,16})$/) || compact.match(/^([A-Z0-9]{8})$/);
  return (m ? `AYM-Q-${m[1]}` : compact).toLowerCase();
}
