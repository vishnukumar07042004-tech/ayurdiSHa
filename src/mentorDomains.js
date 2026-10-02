/** Specialty "Field" grouping for the mentor explorer (keyword-based on roster text). */

export const MENTOR_DOMAINS = [
  "All",
  "Clinical Practice",
  "Academics & Samhita",
  "Research & Evidence",
  "Pharmacology & GMP",
];

export function getMentorDomain(m) {
  const exp = String(m.expertise || "").toLowerCase();
  const des = String(m.designation || "").toLowerCase();
  const aff = String(m.affiliation || "").toLowerCase();
  const bio = String(m.bio || "").toLowerCase();
  const combined = `${exp} ${des} ${aff} ${bio}`;

  if (
    combined.includes("rasa shastra") ||
    combined.includes("bhaishajya") ||
    combined.includes("dravyaguna") ||
    combined.includes("pharmacology") ||
    combined.includes("gmp") ||
    combined.includes("plant science")
  ) {
    return "Pharmacology & GMP";
  }
  if (
    combined.includes("research") ||
    combined.includes("ccras") ||
    combined.includes("evidence") ||
    combined.includes("clinical trials") ||
    combined.includes("policy") ||
    combined.includes("who")
  ) {
    return "Research & Evidence";
  }
  if (
    combined.includes("samhita") ||
    combined.includes("siddhant") ||
    combined.includes("teaching") ||
    combined.includes("professor") ||
    combined.includes("education") ||
    combined.includes("vice chancellor") ||
    combined.includes("academic")
  ) {
    return "Academics & Samhita";
  }
  if (
    combined.includes("kayachikitsa") ||
    combined.includes("shalya") ||
    combined.includes("panchakarma") ||
    combined.includes("clinical") ||
    combined.includes("consultant") ||
    combined.includes("shalakya") ||
    combined.includes("kaumarbhritya") ||
    combined.includes("nadi") ||
    combined.includes("chikitsa") ||
    combined.includes("practice")
  ) {
    return "Clinical Practice";
  }

  return "Clinical Practice";
}

/** Short field label for a card: first expertise clause, else the grouped field. */
export function mentorFieldLabel(m) {
  const exp = String(m.expertise || "")
    .split(";")[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*(MD|MS|BAMS|Ph\.?\s?D\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return exp || getMentorDomain(m);
}
