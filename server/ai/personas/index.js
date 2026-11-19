/**
 * Career streams and expert personas for AI-drafted answers (server-only).
 *
 * THEMES mirrors the Ask Desk `TRACKS` in src/App.jsx (questions store `theme` = track name and
 * `subtheme` = one of its subs). scripts/qbank/build.mjs fails if the two drift apart.
 *
 * A stream is one expert persona: `server/ai/personas/<stream.id>.md`. Every (theme, subtheme)
 * pair maps to exactly one default stream; the question text can route to a more specific one
 * (AIAPGET under any theme → pg-entrance, a Gulf licence question → abroad-gulf, ...).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export const THEMES = Object.freeze([
  { code: "T01", slug: "clinical-practice", name: "Clinical Practice & Integrative Care", subs: ["Choosing a clinical specialty", "Hospital employment", "Setting up private practice", "Panchakarma & therapy services", "Integrative referrals", "Records & clinical quality"] },
  { code: "T02", slug: "academics", name: "Academics, Teaching & Higher Education", subs: ["Choosing a PG branch", "PhD pathway", "Faculty recruitment & eligibility", "Teaching skills", "Curriculum & assessment", "Academic leadership"] },
  { code: "T03", slug: "research", name: "Research, Evidence & Publication", subs: ["Framing a research question", "Study design", "Ethics & approvals", "Biostatistics", "Grants & funding", "Thesis & publication"] },
  { code: "T04", slug: "entrepreneurship", name: "Entrepreneurship & Start-ups", subs: ["Validating the idea", "Business model", "Product & prototype", "Incubation support", "Funding & finance", "Team & intellectual property"] },
  { code: "T05", slug: "manufacturing", name: "Manufacturing, Quality & GMP", subs: ["R&D and formulation", "Production & scale-up", "QA / QC and testing", "GMP and licensing", "Regulatory affairs", "Pharmacovigilance"] },
  { code: "T06", slug: "brand", name: "Brand Building & Communication", subs: ["Positioning a practice or product", "Digital presence", "Scientific communication", "Advertising & claims compliance", "Community education"] },
  { code: "T07", slug: "export", name: "Export & Global Trade", subs: ["Getting started in export", "Documentation & shipping terms", "Certification and quality marks", "Market entry & partners", "Pricing & distribution"] },
  { code: "T08", slug: "abroad", name: "Practice Abroad & Practitioner Mobility", subs: ["Country-wise recognition", "Licensing & registration", "Visa and employment routes", "Bridging qualifications", "Wellness centre roles abroad"] },
  { code: "T09", slug: "mvt-wellness", name: "Medical Value Travel & Wellness", subs: ["How the MVT ecosystem works", "Accreditation and standards", "Designing packages", "Handling international patients", "Careers in wellness resorts"] },
  { code: "T10", slug: "policy", name: "Policy, Public Health & Global Agencies", subs: ["Government service routes", "National AYUSH Mission delivery", "Research councils", "Public health projects", "International organisations", "Policy research & advocacy"] },
]);

const T = Object.fromEntries(THEMES.map(t => [t.code, t.name]));

/**
 * `subthemes` are the (theme, subtheme) pairs this stream owns by default, written "T0x/<sub>".
 * `subjects` are shared/merge.js subject ids that route a question here from any theme.
 */
export const STREAMS = Object.freeze([
  { id: "pg-entrance", label: "PG entrance (AIAPGET) & choosing an MD/MS branch",
    themes: [T.T02], subthemes: ["T02/Choosing a PG branch"], subjects: ["aiapget", "neetpg", "pg"] },
  { id: "govt-jobs", label: "Government jobs — AYUSH MO, PSC, UPSC, NAM",
    themes: [T.T10], subthemes: ["T10/Government service routes", "T10/National AYUSH Mission delivery"], subjects: ["psc", "upsc", "medicalofficer", "nam", "government"] },
  { id: "clinical-practice", label: "Clinical practice, hospital jobs & clinic set-up / licensing",
    themes: [T.T01], subthemes: ["T01/Choosing a clinical specialty", "T01/Hospital employment", "T01/Setting up private practice", "T01/Integrative referrals", "T01/Records & clinical quality"], subjects: ["clinic", "hospital", "allopathy", "prescribe", "records", "patient"] },
  { id: "panchakarma-wellness", label: "Panchakarma, wellness centres & medical value travel",
    themes: [T.T01, T.T09], subthemes: ["T01/Panchakarma & therapy services", ...THEMES[8].subs.map(s => `T09/${s}`)], subjects: ["panchakarma", "mvt", "resort", "therapist", "nabh"] },
  { id: "research-phd", label: "Research, PhD, publication & research councils",
    themes: [T.T02, T.T03, T.T10], subthemes: ["T02/PhD pathway", ...THEMES[2].subs.map(s => `T03/${s}`), "T10/Research councils"], subjects: ["phd", "research", "thesis", "publish", "ethics", "ctri", "trial", "statistic", "samplesize", "grant", "ccras"] },
  { id: "teaching-academia", label: "Teaching & academic careers",
    themes: [T.T02], subthemes: ["T02/Faculty recruitment & eligibility", "T02/Teaching skills", "T02/Curriculum & assessment", "T02/Academic leadership"], subjects: ["faculty", "leadership"] },
  { id: "industry-pharma", label: "Ayurveda industry — pharma R&D, manufacturing, QA/QC, GMP, regulatory",
    themes: [T.T05], subthemes: THEMES[4].subs.map(s => `T05/${s}`), subjects: ["gmp", "manufacturing", "qc", "pharmacovigilance", "regulatory"] },
  { id: "entrepreneurship", label: "Start-ups, products & funding",
    themes: [T.T04], subthemes: THEMES[3].subs.map(s => `T04/${s}`), subjects: ["incubation", "funding", "patent", "trademark"] },
  { id: "export-trade", label: "Export & global trade of Ayurveda products",
    themes: [T.T07], subthemes: THEMES[6].subs.map(s => `T07/${s}`), subjects: ["export"] },
  { id: "digital-branding", label: "Digital presence, branding & ethical communication",
    themes: [T.T06], subthemes: THEMES[5].subs.map(s => `T06/${s}`), subjects: ["socialmedia", "advertise"] },
  { id: "practice-abroad", label: "Practising abroad — recognition, licensing, visas (general / other countries)",
    themes: [T.T08], subthemes: THEMES[7].subs.map(s => `T08/${s}`), subjects: ["abroad", "visa", "bridging"] },
  { id: "abroad-gulf", label: "Practising in the Gulf (UAE — DHA / DOH / MOHAP, other GCC)",
    themes: [T.T08], subthemes: [], subjects: ["country:gulf"] },
  { id: "abroad-usa", label: "Ayurveda careers in the USA",
    themes: [T.T08], subthemes: [], subjects: ["country:usa"] },
  { id: "abroad-uk-eu", label: "Ayurveda careers in the UK & Europe",
    themes: [T.T08], subthemes: [], subjects: ["country:uk", "country:europe", "country:germany", "country:switzerland"] },
  { id: "public-health-policy", label: "Public health, policy & international organisations",
    themes: [T.T10], subthemes: ["T10/Public health projects", "T10/International organisations", "T10/Policy research & advocacy"], subjects: ["whoorg", "mph"] },
  { id: "internship-early-career", label: "Internship & early-career choices after BAMS",
    themes: THEMES.map(t => t.name), subthemes: [], subjects: ["internship"] },
]);

export const DEFAULT_STREAM = "internship-early-career";

const BY_ID = new Map(STREAMS.map(s => [s.id, s]));
const PAIR_TO_STREAM = new Map();
for (const s of STREAMS) for (const p of s.subthemes) PAIR_TO_STREAM.set(p, s.id);

function norm(x) {
  return String(x || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Ask Desk product-track labels → persona theme names (keep in sync with shared/triageRules.js aliases). */
const THEME_ALIASES = Object.freeze({
  "Tech, AI & Digital Health": "Entrepreneurship & Start-ups",
  "Academia & Higher Education": "Academics, Teaching & Higher Education",
  "Industry, Manufacturing & Quality": "Manufacturing, Quality & GMP",
  "Public Health, Policy & Agencies": "Policy, Public Health & Global Agencies",
  "Medicinal Plants, Sustainability & Traditional Knowledge": "Research, Evidence & Publication",
});

const SUBTHEME_ALIASES = Object.freeze({
  "Health-tech products & platforms": "Product & prototype",
  "Digital presence for practice or product": "Digital presence",
  "AI tools in education or practice ops": "Product & prototype",
  "Scientific / content communication": "Scientific communication",
  "Telemedicine careers (non-clinical ops)": "Digital presence",
  "Data, documentation & digital quality": "Digital presence",
  "Brand & claims compliance": "Advertising & claims compliance",
});

/** Theme record from a code ("T01"), slug ("clinical-practice") or display name. */
export function resolveTheme(theme) {
  const raw = String(theme || "");
  const aliased = THEME_ALIASES[raw] || raw;
  const n = norm(aliased);
  if (!n) return null;
  return THEMES.find(t => norm(t.code) === n || norm(t.slug) === n || norm(t.name) === n) || null;
}

function resolveSub(themeRec, subtheme) {
  if (!themeRec) return null;
  const raw = String(subtheme || "");
  const aliased = SUBTHEME_ALIASES[raw] || raw;
  const n = norm(aliased);
  return themeRec.subs.find(s => norm(s) === n) || null;
}

// Question cues for specific routing; order matters (most specific first).
const CUES = [
  ["abroad-gulf", /\b(?:uae|dubai|abu dhabi|sharjah|gulf|gcc|dha|doh|mohap|qatar|oman|bahrain|kuwait|saudi)\b/i],
  ["abroad-usa", /\b(?:usa|u\.s\.a?|united states|america|american|nama|california|new york)\b/i],
  ["abroad-uk-eu", /\b(?:uk|u\.k\.|united kingdom|england|britain|london|europe|european|eu|germany|switzerland|swiss|netherlands|italy|france|ireland)\b/i],
  ["entrepreneurship", /\b(?:(?:build|develop|make|create) (?:my |an? |own )?(?:app|application|software|web ?app|mobile app)|learn(?:ing)? to code|health[- ]?tech)\b/i],
  ["digital-branding", /\b(?:clinic website|google (?:my )?business|instagram for (?:my )?clinic|digital marketing for)\b/i],
  ["pg-entrance", /\b(?:aiapget|neet[\s-]?pg|pg entrance|md\s*\/?\s*ms|ms ayu|md ayu|pg branch|pg seat|aaccc|counsell?ing)\b/i],
  ["govt-jobs", /\b(?:psc|upsc|ayush medical officer|medical officer|amo|rmo|government job|govt job|sarkari|nam\b|national ayush mission)\b/i],
  ["internship-early-career", /\b(?:internship|intern|internee|crri|first year|1st year)\b/i],
];

const GENERAL_CAREER = /\bwhat (?:should i|to|can i|shall i) do after bams\b|\bafter bams (?:what|kya)\b|\bcareer options? after bams\b|\bwhich career (?:path|option)\b/i;

/**
 * Persona (stream) id for a question.
 * @param {string} theme     theme name / code / slug as stored on the question
 * @param {string} subtheme  subtheme as stored on the question
 * @param {string} [question] optional question text for specific routing
 */
export function personaFor(theme, subtheme, question = "") {
  const t = resolveTheme(theme);
  const sub = resolveSub(t, subtheme);
  const base = t && sub ? PAIR_TO_STREAM.get(`${t.code}/${sub}`) : null;
  const text = String(question || "");
  if (text && GENERAL_CAREER.test(text) && !/\b(?:aiapget|psc|upsc|abroad|dha|uk|usa)\b/i.test(text)) return DEFAULT_STREAM;
  if (text) {
    for (const [id, re] of CUES) {
      if (!re.test(text)) continue;
      // Abroad sub-personas only override within / toward the abroad stream, not e.g. an export question about the UAE.
      if (id.startsWith("abroad-") && base && !["practice-abroad", "clinical-practice", "panchakarma-wellness", "internship-early-career"].includes(base) && !/\b(?:practi[cs]e|licen[cs]e|job|work|settle|visa|register)\b/i.test(text)) continue;
      if (id === "internship-early-career" && base && base !== DEFAULT_STREAM && !/\binterns?(?:hip)?\b|\binternee\b|\bcrri\b/i.test(text)) continue;
      return id;
    }
  }
  if (base) return base;
  if (t) {
    const first = STREAMS.find(s => s.themes.length === 1 && s.themes[0] === t.name);
    if (first) return first.id;
  }
  return DEFAULT_STREAM;
}

export function streamById(id) {
  return BY_ID.get(id) || null;
}

/** Stream ids relevant to a theme (for filtering KB chunks by theme). */
export function streamsForTheme(theme) {
  const t = resolveTheme(theme);
  if (!t) return [];
  return STREAMS.filter(s => s.themes.includes(t.name)).map(s => s.id);
}

/** Minimal YAML front-matter parser for persona files (scalars and [a, b] / "- item" lists). */
export function parsePersona(md) {
  const m = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, prompt: String(md).trim() };
  const meta = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { meta[listKey].push(unquote(item[1])); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, v] = kv;
    listKey = null;
    if (v === "") { meta[k] = []; listKey = k; continue; }
    if (v.startsWith("[") && v.endsWith("]")) {
      meta[k] = v.slice(1, -1).split(",").map(s => unquote(s.trim())).filter(Boolean);
      continue;
    }
    meta[k] = unquote(v);
  }
  return { meta, prompt: m[2].trim() };
}

function unquote(s) {
  const t = String(s).trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t;
}

const cache = new Map();

/** Load `<id>.md` → { id, meta, prompt }. Falls back to the default persona. */
export function loadPersona(id) {
  const key = BY_ID.has(id) ? id : DEFAULT_STREAM;
  if (cache.has(key)) return cache.get(key);
  const md = fs.readFileSync(path.join(DIR, `${key}.md`), "utf8");
  const { meta, prompt } = parsePersona(md);
  const out = { id: key, meta, prompt };
  cache.set(key, out);
  return out;
}
