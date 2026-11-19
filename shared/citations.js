/**
 * Citation markers in AI drafts: `[c:id]`, and the combined forms models also emit —
 * `[c:a, c:b]`, `[c:a; c:b]`, `[c:a,b]`.
 */

export const CITE_GROUP = /\[\s*c:[^\]]*\]/g;

/** Ids inside one marker group, e.g. "[c:a, c:b]" → ["a", "b"]. */
export function idsInGroup(group) {
  return String(group || "")
    .replace(/^\[\s*|\s*\]$/g, "")
    .split(/[,;]|\s+(?=c:)/)
    .map(s => s.trim().replace(/^c:\s*/, "").trim())
    .filter(Boolean);
}

/** Every cited id in `text`, in order, with repeats. */
export function citeIds(text) {
  const out = [];
  for (const m of String(text || "").matchAll(CITE_GROUP)) out.push(...idsInGroup(m[0]));
  return out;
}

/** Marker groups with their position, for rendering inline source buttons. */
export function citeGroups(text) {
  return [...String(text || "").matchAll(CITE_GROUP)].map(m => ({ index: m.index, length: m[0].length, ids: idsInGroup(m[0]) }));
}

export function stripCitationMarks(text) {
  return String(text || "")
    .replace(/[ \t]*\[\s*c:[^\]]*\]/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
