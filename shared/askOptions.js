/**
 * Ask Desk form options + the server-side shape of a student's question. One module for the
 * browser (dropdowns) and the server (normalising a submit), so a new option in the UI can
 * never be rejected or dropped by the API.
 */

export const ASK_STAGES = [
  "BAMS student (1st–2nd prof)",
  "BAMS student (3rd–final prof)",
  "Intern",
  "MD / MS postgraduate",
  "PhD scholar",
  "Graduate (up to 5 years)",
  "Practitioner",
  "Faculty",
  "Ayurveda student (other course)",
  "Researcher",
  "Changing careers",
  "Other",
];

export const OUTSIDE_INDIA = "Outside India";

export const ASK_STATES = [
  "Andaman & Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra & Nagar Haveli and Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", OUTSIDE_INDIA,
];

export const ASK_YES_NO = ["Yes", "No"];
export const ASK_REGISTERED = ["Yes", "Registration in process", "No"];
export const ASK_IN_PERSON = ["Yes", "Not yet confirmed", "No"];

/** Character caps per field (the form's own limits are lower; these only stop abuse). */
const TEXT_FIELDS = {
  id: 40, ticket: 40, name: 120, email: 160, mobile: 32, state: 80, institution: 200, stage: 80,
  registered: 40, regNo: 40, delegateNo: 40, inPerson: 40, theme: 160, subtheme: 160,
  track: 160, trackCode: 8,
  question: 2000, context: 1000, outcome: 1000,
  /* Four separate consents (Yes/No). Legacy consentPublish kept for older rows. */
  consentFollow: 8, consentPublish: 8, consentAnonPublish: 8, consentNamedDisplay: 8, consentRecording: 8,
  anonId: 40,
};

const CONSENT_KEYS = ["consentFollow", "consentPublish", "consentAnonPublish", "consentNamedDisplay", "consentRecording"];

/** Normalise a consent value to Yes / No / "". Unticked checkboxes must stay off (""). */
export function normalizeConsent(v) {
  if (v === true || v === "Yes" || v === "yes" || v === "on" || v === 1 || v === "1") return "Yes";
  if (v === false || v === "No" || v === "no" || v === 0 || v === "0") return "No";
  return "";
}

/**
 * A student's submit → only the fields the Ask Desk sends, as trimmed strings (no undefined,
 * objects or staff-only fields such as `individualAnswer`). Unknown option values are kept as
 * typed: the desk would rather store an odd stage than lose a question.
 */
export function normalizeAskRecord(val) {
  const src = val && typeof val === "object" ? val : {};
  const rec = {};
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    const v = src[k];
    if (CONSENT_KEYS.includes(k)) {
      const c = normalizeConsent(v);
      if (c) rec[k] = c;
      continue;
    }
    if (v == null || typeof v === "object" || typeof v === "function") continue;
    const s = String(v).trim().slice(0, max);
    if (s) rec[k] = s;
  }
  const days = Array.isArray(src.days) ? src.days : [];
  rec.days = days.filter(d => typeof d === "string" && d.trim()).map(d => d.trim().slice(0, 40)).slice(0, 5);
  const created = Number(src.createdAt);
  rec.createdAt = Number.isFinite(created) && created > 0 ? created : Date.now();
  if (typeof src.source === "string") rec.source = src.source;
  /* Curator safety flags (string ids) — additive; never invent beyond what the client/server detect. */
  const flags = Array.isArray(src.safetyFlags) ? src.safetyFlags : [];
  rec.safetyFlags = flags
    .filter((f) => typeof f === "string" && f.trim())
    .map((f) => f.trim().slice(0, 64))
    .slice(0, 12);
  return rec;
}

/** Fields whose value is not one the form offers (logged by the server, never rejected). */
export function offListAskFields(rec) {
  const lists = { stage: ASK_STAGES, state: ASK_STATES, registered: ASK_REGISTERED, inPerson: ASK_IN_PERSON };
  return Object.entries(lists).filter(([k, list]) => rec && rec[k] && !list.includes(rec[k])).map(([k]) => k);
}

/** First thing missing from a submit, as a sentence for the student; "" when it can be saved. */
export function askRecordProblem(rec) {
  if (!rec || !rec.id || !rec.ticket) return "Your question is missing its ticket. Reload the page and send it again.";
  if (!rec.question) return "Write your question before sending.";
  return "";
}
