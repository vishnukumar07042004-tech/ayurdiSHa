/**
 * Product tracks T1–T9 (Meet the Mentors service ladder).
 * Legacy Ask Desk themes (T01–T10 names) map additively onto these codes so existing
 * stored questions keep their theme string; new submits also store `track` + `trackCode`.
 */

export const TRACKS = [
  {
    code: "T1",
    name: "Clinical",
    label: "Clinical Practice & Integrative Care",
    subs: [
      "Choosing a clinical specialty",
      "Hospital employment",
      "Setting up private practice",
      "Panchakarma & therapy services",
      "Integrative referrals",
      "Records & clinical quality",
      "Practice abroad & mobility",
      "Medical value travel & wellness careers",
    ],
  },
  {
    code: "T2",
    name: "Academia",
    label: "Academia & Higher Education",
    subs: [
      "Choosing a PG branch",
      "PhD pathway",
      "Faculty recruitment & eligibility",
      "Teaching skills",
      "Curriculum & assessment",
      "Academic leadership",
    ],
  },
  {
    code: "T3",
    name: "Research",
    label: "Research, Evidence & Publication",
    subs: [
      "Framing a research question",
      "Study design",
      "Ethics & approvals",
      "Biostatistics",
      "Grants & funding",
      "Thesis & publication",
    ],
  },
  {
    code: "T4",
    name: "Entrepreneurship",
    label: "Entrepreneurship & Start-ups",
    subs: [
      "Validating the idea",
      "Business model",
      "Product & prototype",
      "Incubation support",
      "Funding & finance",
      "Team & intellectual property",
      "Brand & claims compliance",
    ],
  },
  {
    code: "T5",
    name: "Industry / Quality",
    label: "Industry, Manufacturing & Quality",
    subs: [
      "R&D and formulation",
      "Production & scale-up",
      "QA / QC and testing",
      "GMP and licensing",
      "Regulatory affairs",
      "Pharmacovigilance",
    ],
  },
  {
    code: "T6",
    name: "Export / Trade",
    label: "Export & Global Trade",
    subs: [
      "Getting started in export",
      "Documentation & shipping terms",
      "Certification and quality marks",
      "Market entry & partners",
      "Pricing & distribution",
    ],
  },
  {
    code: "T7",
    name: "Public Health / Policy",
    label: "Public Health, Policy & Agencies",
    subs: [
      "Government service routes",
      "National AYUSH Mission delivery",
      "Research councils",
      "Public health projects",
      "International organisations",
      "Policy research & advocacy",
    ],
  },
  {
    code: "T8",
    name: "Tech / AI / Digital",
    label: "Tech, AI & Digital Health",
    subs: [
      "Digital presence for practice or product",
      "Health-tech products & platforms",
      "AI tools in education or practice ops",
      "Scientific / content communication",
      "Telemedicine careers (non-clinical ops)",
      "Data, documentation & digital quality",
    ],
  },
  {
    code: "T9",
    name: "Medicinal Plants / Sustainability / TK",
    label: "Medicinal Plants, Sustainability & Traditional Knowledge",
    subs: [
      "Cultivation & supply chains",
      "Sustainability & conservation",
      "Traditional knowledge documentation",
      "Community livelihoods",
      "Quality of raw materials",
      "Careers in botanical / TK research",
    ],
  },
];

export const NOT_SURE_THEME = "Not sure — help me classify";

/** Legacy theme display names still present on stored questions / older UI. */
export const LEGACY_THEME_TO_TRACK = {
  "Clinical Practice & Integrative Care": "T1",
  "Academics, Teaching & Higher Education": "T2",
  "Research, Evidence & Publication": "T3",
  "Entrepreneurship & Start-ups": "T4",
  "Manufacturing, Quality & GMP": "T5",
  "Brand Building & Communication": "T8",
  "Export & Global Trade": "T6",
  "Practice Abroad & Practitioner Mobility": "T1",
  "Medical Value Travel & Wellness": "T1",
  "Policy, Public Health & Global Agencies": "T7",
  [NOT_SURE_THEME]: "",
};

export function trackByCode(code) {
  return TRACKS.find((t) => t.code === code) || null;
}

export function trackByLabel(label) {
  const s = String(label || "").trim();
  return TRACKS.find((t) => t.label === s || t.name === s) || null;
}

/** Resolve a form selection (label or legacy theme) to { trackCode, trackLabel, theme }. */
export function resolveTrackSelection(themeOrLabel) {
  const raw = String(themeOrLabel || "").trim();
  if (!raw || raw === NOT_SURE_THEME) {
    return { trackCode: "", trackLabel: "", theme: NOT_SURE_THEME };
  }
  const byLabel = trackByLabel(raw);
  if (byLabel) {
    return { trackCode: byLabel.code, trackLabel: byLabel.label, theme: byLabel.label };
  }
  const legacyCode = LEGACY_THEME_TO_TRACK[raw];
  if (legacyCode) {
    const t = trackByCode(legacyCode);
    return { trackCode: legacyCode, trackLabel: t ? t.label : raw, theme: raw };
  }
  const byCode = trackByCode(raw);
  if (byCode) {
    return { trackCode: byCode.code, trackLabel: byCode.label, theme: byCode.label };
  }
  return { trackCode: "", trackLabel: "", theme: raw };
}
