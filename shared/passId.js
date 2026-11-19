/**
 * Which number a delegate is shown by — one rule for the pass card, Ask Desk, Track, staff lists,
 * exports and emails. The WAC Delegate ID (from WAC's delegate list) wins when the account is
 * linked; otherwise the app's own number, labelled "AYURDISHA pass number" so it is never mistaken
 * for a WAC ID. The stored `regNo` key never changes, so tickets and Track keep working.
 */

export const WAC_DELEGATE_ID_LABEL = "WAC Delegate ID";
export const PASS_NUMBER_LABEL = "AYURDISHA pass number";

/** Delegate IDs on WAC's list: three or four letters + five digits (BHA12345, BBHA12345). */
export const WAC_DELEGATE_ID_RE = /^[A-Z]{3,4}\d{5}$/;

const clean = v => String(v == null ? "" : v).trim();

/**
 * `p` is a profile, user, staff card or question. Returns `{ id, label, kind, text }`:
 * kind "wac" (WAC Delegate ID), "pass" (AYURDISHA pass number) or "" (nothing issued yet).
 */
export function displayPassId(p) {
  const src = p && typeof p === "object" ? p : {};
  const wacId = clean(src.wacId);
  if (wacId) return passId(wacId, "wac");
  const regNo = clean(src.regNo) || clean(src.delegateNo);
  // A WAC sign-in account's regNo is its Delegate ID (older questions carry only regNo).
  if (WAC_DELEGATE_ID_RE.test(regNo.toUpperCase())) return passId(regNo.toUpperCase(), "wac");
  if (regNo) return passId(regNo, "pass");
  return { id: "", label: PASS_NUMBER_LABEL, kind: "", text: "" };
}

function passId(id, kind) {
  const label = kind === "wac" ? WAC_DELEGATE_ID_LABEL : PASS_NUMBER_LABEL;
  return { id, label, kind, text: `${label}: ${id}` };
}
