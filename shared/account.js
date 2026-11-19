/**
 * Account identity for the header chip and /account page.
 * Kinds: admin · co-admin · delegate · visitor.
 *
 * When staff is signed in, the chip / hero always use staff identity — never a leftover
 * `aym-delegate-session` profile.name (a test WAC hall pass on the same browser).
 * A leftover Harsh hall pass is dropped entirely (no Hall pass block, no Ask Desk fill).
 * Ask Desk, briefing, and DISHA re-attribute that same demo persona to Vishnu Kumar.
 */
import { maskEmail, maskPhone } from "./wacId.js";

/** Known staff display names (lowercase email → name). Works before staff_members.displayName is stored. */
export const ADMIN_DISPLAY = Object.freeze({
  "vishnukumar07042004@gmail.com": "Vishnu Kumar",
});

const OWNER_EMAIL = "vishnukumar07042004@gmail.com";

function emailLocal(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

/** Test hall-pass mailbox: harsh@…, harsh.gupta@…, harsh_…, harshgupta…. Not Harsha. */
function isHarshLocal(email) {
  const local = emailLocal(email);
  return local === "harsh" || local.startsWith("harsh.") || local.startsWith("harsh_") || local.startsWith("harshgupta");
}

/**
 * Operator test persona (not a real WAC delegate name).
 * Single-word name "Harsh", or harsh@… style mailboxes. Not "Harsha" or "Harsh Gupta".
 */
export function isOperatorHarshPersona(record) {
  if (!record) return false;
  if (isHarshLocal(record.email)) return true;
  const parts = String(record.name || "").trim().toLowerCase().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return parts.length === 1 && parts[0] === "harsh";
}

/** Leftover test / old hall-pass identity (not a live WAC-list match check). */
export function isDroppedHallPass(profile) {
  return isOperatorHarshPersona(profile);
}

/** Leftover Harsh hall pass — drop it so it never shows as Hall pass or Ask Desk identity. */
export function shouldDropHallPass(_staffMe, profile) {
  return isDroppedHallPass(profile);
}

/** Delegate profile to render; null when a leftover Harsh hall pass must not appear. */
export function hallPassProfile(staffMe, profile) {
  return shouldDropHallPass(staffMe, profile) ? null : (profile || null);
}

/**
 * A leftover Harsh `aym-delegate-session` is cleared (staff sign-in or first paint).
 * Any other delegate session is returned unchanged. Null session stays null.
 */
export function sessionAfterStaffSignIn(staffMe, session) {
  if (!session || typeof session !== "object") return null;
  if (shouldDropHallPass(staffMe, session.profile)) return null;
  return session;
}

/**
 * Ask Desk / briefing / DISHA name.
 * This admin's email, and the leftover harsh@ hall-pass mailbox, show as Vishnu Kumar.
 * A different person named Harsh Gupta keeps their name.
 */
export function displayAskerName(record) {
  const email = String((record && record.email) || "").trim().toLowerCase();
  if (email === OWNER_EMAIL || isOperatorHarshPersona(record)) return ADMIN_DISPLAY[OWNER_EMAIL];
  return String((record && record.name) || "").trim();
}

/** Same rule for the mailbox. A harsh@ test address is shown as this admin's email. */
export function displayAskerEmail(record) {
  const raw = String((record && record.email) || "").trim();
  if (isOperatorHarshPersona(record)) return OWNER_EMAIL;
  return raw;
}

/** Copy a question or delegate row so staff surfaces never keep the demo Harsh name or mailbox. */
export function presentAskerRecord(record) {
  if (!record || typeof record !== "object") return record;
  const name = displayAskerName(record);
  const email = displayAskerEmail(record);
  if (name === String(record.name || "").trim() && email === String(record.email || "").trim()) return record;
  return { ...record, name, email };
}

export function accountKind({ staffMe, profile } = {}) {
  if (staffMe && staffMe.staff && staffMe.role === "admin") return "admin";
  if (staffMe && staffMe.staff && staffMe.role === "co-admin") return "co-admin";
  if (isDroppedHallPass(profile)) return "visitor";
  if (profile && (profile.email || profile.regNo || profile.wacId)) return "delegate";
  return "visitor";
}

export function isStaffKind(kind) {
  return kind === "admin" || kind === "co-admin";
}

/** Staff chip/hero name: ADMIN_DISPLAY for known admins, then stored displayName, then email local-part. Never a leftover Harsh name. */
export function staffIdentityName(staffMe) {
  if (!staffMe) return "";
  const email = String(staffMe.email || "").trim().toLowerCase();
  if (ADMIN_DISPLAY[email]) return ADMIN_DISPLAY[email];
  const stored = String(staffMe.displayName || "").trim();
  if (stored && !stored.includes("@") && !isDroppedHallPass({ name: stored })) return stored;
  return email.includes("@") ? email.split("@")[0] : "";
}

/** The signed-in staff member's own email (full). Empty for visitors and delegates. */
export function accountOwnEmail({ staffMe, kind } = {}) {
  const k = kind || accountKind({ staffMe });
  if (!isStaffKind(k) || !staffMe || !staffMe.staff) return "";
  return String(staffMe.email || "").trim();
}

/** Email / phone for the public Profile surfaces — never the full value. */
export function maskPersonal(kind, value) {
  if (kind === "email") return maskEmail(value);
  if (kind === "phone") return maskPhone(value);
  return String(value == null ? "" : value);
}

/** WAC share-preview cell: email and mobile stay masked even if the server sent a full value. */
export function shareFieldDisplay(key, value) {
  if (key === "email") return maskEmail(value) || "—";
  if (key === "phone") return maskPhone(value) || "—";
  const s = String(value == null ? "" : value).trim();
  return s || "—";
}

export function accountRoleLabel(kind) {
  if (kind === "admin") return "Admin";
  if (kind === "co-admin") return "Co-admin";
  if (kind === "delegate") return "Delegate";
  return "Guest";
}

export function accountDisplayName({ profile, staffMe, kind } = {}) {
  const k = kind || accountKind({ staffMe, profile });
  if (isStaffKind(k)) return staffIdentityName(staffMe) || accountRoleLabel(k);
  if (isDroppedHallPass(profile)) return k === "visitor" ? "Profile" : accountRoleLabel(k);
  const fromProfile = String((profile && profile.name) || "").trim();
  if (fromProfile && !fromProfile.includes("@")) return fromProfile;
  const email = String((profile && profile.email) || "").trim();
  const local = email.includes("@") ? email.split("@")[0] : "";
  if (local) return local;
  return k === "visitor" ? "Profile" : accountRoleLabel(k);
}

export function accountInitials(name, email) {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = (parts[0] || "").slice(0, 1);
    const b = (parts.length > 1 ? parts[parts.length - 1] : parts[0].slice(1)).slice(0, 1);
    return (a + b).toUpperCase() || "?";
  }
  const e = String(email || "").trim();
  return (e.slice(0, 2) || "?").toUpperCase();
}

export function firstName(name) {
  const n = String(name || "").trim();
  return n.split(/\s+/)[0] || "";
}
