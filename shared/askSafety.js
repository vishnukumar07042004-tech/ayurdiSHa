/**
 * Ask Desk safety / confidentiality detector.
 * FLAGS for the curator — never blocks a valid career question from being saved.
 */
import { medicalRisk } from "./triageRules.js";

const PII = [
  /\b(?:aadhaar|aadhar|आधार)\b[\s:-]*\d{4}/i,
  /\b(?:passport|pan)\b[\s:-]*[A-Z0-9]{6,}/i,
  /\b(?:mrn|uhid|ip\s*no|op\s*no|patient\s*(?:id|no|number)|hospital\s*(?:id|no))\b[\s:-]*[A-Z0-9/-]{3,}/i,
  /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

const PATIENT_DETAIL = [
  /\b(?:patient(?:'s)? (?:name|file|record|report|scan|mri|ct|lab)|discharge summary|case sheet)\b/i,
  /\b(?:my patient|our patient|the patient)\b[^.?!]{0,40}\b(?:has|had|with|suffering|diagnosed)\b/i,
  /\b(?:lab|blood|pathology) (?:report|result)s?\b/i,
];

const CONFIDENTIAL_BUSINESS = [
  /\b(?:nda|non[- ]disclosure|trade secret|confidential (?:deal|contract|pricing)|unpublished (?:trial|data|manuscript|paper|results?))\b/i,
  /\b(?:internal (?:memo|deck|spreadsheet)|investor (?:deck|term sheet)|salary sheet of)\b/i,
];

const UNPUBLISHED_RESEARCH = [
  /\b(?:unpublished|under review|embargoed|do not (?:share|cite|publish))\b[^.?!]{0,40}\b(?:data|results?|manuscript|thesis|trial)\b/i,
  /\b(?:pre[- ]?print not yet|blinded (?:arm|allocation)|interim analysis)\b/i,
];

function collect(flags, id, list, text) {
  for (const re of list) {
    if (re.test(text)) {
      if (!flags.includes(id)) flags.push(id);
      return;
    }
  }
}

/**
 * @returns {{ flags: string[], medical: boolean, reasons: string[] }}
 */
export function detectAskSafetyFlags(question = "", context = "", outcome = "") {
  const text = `${question || ""}\n${context || ""}\n${outcome || ""}`;
  const flags = [];
  const med = medicalRisk(question, context);
  if (med.medical) flags.push("medical-or-patient-advice");
  collect(flags, "pii-or-identifier", PII, text);
  collect(flags, "patient-detail", PATIENT_DETAIL, text);
  collect(flags, "confidential-business", CONFIDENTIAL_BUSINESS, text);
  collect(flags, "unpublished-research", UNPUBLISHED_RESEARCH, text);
  return {
    flags,
    medical: Boolean(med.medical),
    reasons: [...(med.reasons || []), ...flags.filter((f) => f !== "medical-or-patient-advice")],
  };
}

export const ASK_SAFETY_WARNING =
  "Do not include patient IDs, clinical reports, confidential business details, or unpublished research. Career questions only — the desk will flag (not block) risky details for a curator.";
