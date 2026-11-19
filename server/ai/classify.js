/**
 * What a question is about (intent signature from the merge engine) and whether it is safe to
 * draft at all. AYURDISHA answers CAREER questions; anything that asks for medical advice —
 * a patient's symptoms, a dose, whether to take a drug, how to treat a disease — is routed to a
 * human mentor and never drafted. The rules are deliberately conservative: "maybe" is treated as
 * medical unless staff enabled the optional LLM second opinion and it clears the question.
 */

import { analyzeQuestion, intentSignature } from "../../shared/merge.js";
import { medicalRisk } from "../../shared/triageRules.js";

const DISEASE = [
  "diabet\\w*", "sugar levels?", "thyroid", "hypothyroid\\w*", "hyperthyroid\\w*", "pcod", "pcos", "psoriasis", "eczema", "dermatitis",
  "vitiligo", "leucoderma", "acne", "pimples?", "skin diseases?", "skin problems?", "arthritis", "rheumatoid", "gout", "uric acid",
  "migraine", "headaches?", "fever", "cough", "cold and cough", "asthma", "bronchitis", "cancer", "tumou?rs?", "hypertension",
  "high bp", "bp", "blood pressure", "acidity", "gerd", "gastritis", "ulcers?", "constipation", "piles", "ha?emorrhoids", "fissures?",
  "fistula", "kidney stones?", "stones? in (?:the )?kidney", "obesity", "weight loss", "hair ?fall", "hair loss", "alopecia",
  "dandruff", "insomnia", "sleeplessness", "anxiety", "depression", "covid", "jaundice", "hepatitis", "fatty liver", "cholesterol",
  "allerg\\w*", "sinusitis", "sinus", "infertility", "(?:irregular|painful|missed|heavy) periods", "menstrua\\w*", "pregnan\\w*", "miscarriage",
  "back ?pain", "joint pains?", "knee pains?", "neck pain", "sciatica", "spondyl\\w*", "paralysis", "stroke", "epilepsy", "seizures?",
  "autism", "adhd", "ana?emia", "ibs", "colitis", "urticaria", "itching", "rash(?:es)?", "infections?", "uti", "white discharge",
  "leucorrho?ea", "erectile", "impotence", "premature ejaculation", "sperm count", "low sperm", "hiv", "tuberculosis", "dengue",
  "malaria", "typhoid", "vomiting", "diarrho?ea", "loose motions?", "nausea", "dizziness", "vertigo", "swelling", "lump in",
  "wounds?", "bleeding", "chest pain", "breathless\\w*", "heart attack", "cardiac", "cirrhosis", "kidney failure",
  "dialysis", "prostate", "varicose", "cyst", "fibroids?", "osteoporosis", "parkinson\\w*", "alzheimer\\w*", "dementia",
  "symptoms?", "disease", "disorder", "illness", "sick",
].join("|");
const DISEASE_RE = new RegExp(`\\b(?:${DISEASE})\\b`, "i");

const DRUGS = "medicines?|medication|tablets?|capsules?|syrup|churna|choorna|kwath|kwatha|kashaya\\w*|arishta|asava|ghrita|taila|vati|gutika|bhasma|rasayana|herbs?|ashwagandha|triphala|giloy|guduchi|tulsi|shilajit|chyawanprash|brahmi|haritaki|guggul\\w*|metformin|insulin|steroids?|antibiotics?|paracetamol|painkillers?|allopathic (?:medicines?|drugs?)|english medicines?|homeopathic|supplements?|drops|ointment";

const RULES = [
  { id: "dosage", re: /\b(?:dos(?:e|es|age|ing)|how (?:much|often|many times)\b(?![^.?!]{0,40}\b(?:time|hours?|days?|months?|money|invest\w*|fees?|salary|marks|study\w*|prepar\w*|attempts?|exams?)\b)[^.?!]{0,40}\b(?:take|give|consume|eat|drink|apply)\b|how many (?:tablets?|capsules?|spoons?|times a day)|\d+\s?(?:mg|mcg|ml|gm|grams?|tablets?|capsules?|spoons?)\b|twice (?:a day|daily)|thrice daily|once daily|matra|empty stomach|before or after (?:food|meals?))/i, hard: true },
  { id: "drug-use", re: new RegExp(`\\b(?:can|could|should|shall|may|is it (?:safe|ok|okay|good) (?:to|for)|safe to)\\b[^.?!]{0,40}\\b(?:take|use|give|consume|eat|drink|apply|start|stop|continue|mix|combine)\\b[^.?!]{0,50}\\b(?:${DRUGS})\\b`, "i"), hard: true },
  { id: "drug-use", re: new RegExp(`\\b(?:side[- ]effects?|interactions?|contraindicat\\w*|overdose)\\b[^.?!]{0,40}\\b(?:of|with|for)\\b[^.?!]{0,40}\\b(?:${DRUGS})\\b`, "i"), hard: true },
  { id: "drug-use", re: new RegExp(`\\b(?:${DRUGS})\\b[^.?!]{0,30}\\b(?:along with|together with|with my|during pregnancy|while breastfeeding)\\b`, "i"), hard: true },
  { id: "drug-use", re: new RegExp(`\\b(?:${DRUGS})\\b[^.?!]{0,50}\\b(?:take|give|consume|eat|drink|apply|use)\\b[^.?!]{0,30}\\b(?:for|in|during)\\b[^.?!]{0,30}\\b(?:${DISEASE})\\b`, "i"), hard: true },
  { id: "drug-use", re: new RegExp(`\\b(?:which|what|suggest|recommend|best|any|good)\\b[^.?!]{0,30}\\b(?:${DRUGS})\\b[^.?!]{0,40}\\b(?:should|can|could|shall|to|do|must)\\b[^.?!]{0,25}\\b(?:take|give|consume|eat|drink)\\b`, "i"), hard: true },
  { id: "treat-disease", re: new RegExp(`\\b(?:should|can|could|shall|must|to)\\b[^.?!]{0,30}\\b(?:take|give|eat|drink|consume)\\b[^.?!]{0,20}\\bfor\\s+(?:my |his |her |their |the )?(?:[a-z'-]+\\s+){0,2}?(?:${DISEASE})\\b`, "i"), hard: false },
  { id: "emergency", re: /\b(?:suicid\w*|kill (?:myself|himself|herself)|self[- ]harm|overdosed?|poison(?:ed|ing)?|unconscious|emergency|ambulance)\b/i, hard: true },
  { id: "personal-health", re: new RegExp(`\\b(?:i|i'm|i am|me|my (?:mother|mom|mum|maa|father|dad|papa|wife|husband|son|daughter|child|kid|baby|brother|sister|friend|grand(?:mother|father|ma|pa)|aunt|uncle|relative|cousin|family|patient|patients?)|he|she)\\b[^.?!]{0,40}\\b(?:have|has|having|suffer\\w*|diagnosed|got|feel\\w*|experienc\\w*|complain\\w*|struggling with|affected by)\\b[^.?!]{0,60}\\b(?:${DISEASE})\\b`, "i"), hard: false },
  { id: "personal-health", re: new RegExp(`\\bmy (?:${DISEASE})\\b`, "i"), hard: false },
  { id: "treat-disease", re: new RegExp(`\\b(?:treat(?:ment|ing)?|cure[sd]?|curing|remed(?:y|ies)|medicines?|medication|drugs?|herbs?|formulations?|ilaj|upchar|dawa|dawai|aushadh\\w*|manag(?:e|ement|ing)|protocols?|therapy|therapies|diet)\\b\\s+(?:for|of|to cure|to treat|in|against)\\s+(?:[a-z'-]+\\s+){0,3}?(?:${DISEASE})\\b`, "i"), hard: false },
  { id: "treat-disease", re: new RegExp(`\\b(?:${DISEASE})\\b[^.?!]{0,30}\\b(?:treatment|cure|remedy|remedies|medicine|ilaj|upchar|dawa|dawai)\\b`, "i"), hard: false },
  { id: "treat-disease", re: new RegExp(`\\b(?:treat|treats|treating|cure|cures|curing)\\s+(?:[a-z'-]+\\s+){0,2}?(?:${DISEASE})\\b`, "i"), hard: false },
  { id: "treat-disease", re: new RegExp(`\\bhow (?:to|do i|can i|should i) (?:treat|cure|manage|heal|reduce|control|get rid of)\\b[^.?!]{0,40}\\b(?:${DISEASE})\\b`, "i"), hard: false },
];

/** Words that show the student is asking about a career, not a patient. */
const CAREER_FRAME = /\b(?:career|careers|specialt(?:y|ies)|speciali[sz]\w*|scope|pg|md|ms|mph|phd|course|courses|fellowship|certificat\w*|job|jobs|salary|income|practi[cs]e|clinic|hospital|become|becoming|research|thesis|exam|aiapget|neet|branch|department|start(?:ing)? (?:a|my|an)|open(?:ing)? (?:a|my|an)|business|start-?up|licen[cs]e|registration|abroad|government|faculty|teach\w*|job|internship)\b/i;

/**
 * English rules plus the shared EN / Hinglish / Hindi detector (`medicalRisk`). Self / family /
 * patient health, doses, medicine intake and prescriptions are "yes" whatever the framing; a
 * treatment ask inside a strong career context ("scope", "open a clinic", "thesis") is "no";
 * other career framing is "maybe".
 * @returns {{ verdict: "yes"|"maybe"|"no", reasons: string[], careerContext?: boolean }}
 */
export function medicalScreen(question, context = "") {
  const text = `${question || ""}\n${context || ""}`.replace(/\s+/g, " ");
  const reasons = [];
  let hard = false;
  let soft = false;
  for (const r of RULES) {
    if (!r.re.test(text)) continue;
    if (!reasons.includes(r.id)) reasons.push(r.id);
    if (r.hard) hard = true;
    else soft = true;
  }
  const risk = medicalRisk(question, context);
  for (const id of risk.reasons) if (!reasons.includes(id)) reasons.push(id);
  if (hard || risk.medical) return { verdict: "yes", reasons };
  if (soft || risk.weak) {
    if (risk.careerContext) return { verdict: "no", reasons, careerContext: true };
    const careerish = CAREER_FRAME.test(String(question || ""));
    return { verdict: careerish ? "maybe" : "yes", reasons };
  }
  return { verdict: "no", reasons };
}

/* ---------------------------------------------------------------- */
/* Streams                                                           */
/* ---------------------------------------------------------------- */

/**
 * Used when the persona registry (`./personas/index.js`) is not available. Ids match the
 * registry's so `ai.streams` flags mean the same thing either way.
 */
export const FALLBACK_STREAMS = [
  { id: "pg-entrance", label: "PG entrance (AIAPGET) & choosing an MD/MS branch", themes: ["Academics, Teaching & Higher Education"] },
  { id: "govt-jobs", label: "Government jobs — AYUSH MO, PSC, UPSC, NAM", themes: ["Policy, Public Health & Global Agencies"] },
  { id: "clinical-practice", label: "Clinical practice & clinic set-up", themes: ["Clinical Practice & Integrative Care"] },
  { id: "panchakarma-wellness", label: "Panchakarma, wellness & MVT", themes: ["Medical Value Travel & Wellness"] },
  { id: "research-phd", label: "Research, PhD & publication", themes: ["Research, Evidence & Publication"] },
  { id: "teaching-academia", label: "Teaching & academic careers", themes: ["Academics, Teaching & Higher Education"] },
  { id: "industry-pharma", label: "Industry — manufacturing, QA/QC, GMP", themes: ["Manufacturing, Quality & GMP"] },
  { id: "entrepreneurship", label: "Start-ups, products & funding", themes: ["Entrepreneurship & Start-ups"] },
  { id: "export-trade", label: "Export & global trade", themes: ["Export & Global Trade"] },
  { id: "digital-branding", label: "Digital presence & branding", themes: ["Brand Building & Communication"] },
  { id: "practice-abroad", label: "Practising abroad", themes: ["Practice Abroad & Practitioner Mobility"] },
  { id: "public-health-policy", label: "Public health & policy", themes: ["Policy, Public Health & Global Agencies"] },
  { id: "internship-early-career", label: "Internship & early-career choices", themes: [] },
];

const GOVT_SUBJECTS = ["psc", "upsc", "medicalofficer", "government", "nam"];

/** Intent-level routing to the pilot streams (PG entrance, government jobs) when they exist. */
export function refineStream(sig, theme, subtheme, available) {
  const has = id => available.some(s => s.id === id);
  const strong = sig ? sig.strong : new Set();
  if ((strong.has("aiapget") || strong.has("neetpg") || (strong.has("pg") && (sig.asks.has("cutoff") || sig.asks.has("syllabus") || sig.asks.has("resources"))))
    && has("pg-entrance")) return "pg-entrance";
  if ((GOVT_SUBJECTS.some(s => strong.has(s)) || /government service/i.test(subtheme || "")) && has("govt-jobs")) return "govt-jobs";
  return null;
}

export function fallbackStreamFor(theme, subtheme, sig) {
  const refined = refineStream(sig, theme, subtheme, FALLBACK_STREAMS);
  if (refined) return refined;
  if (theme === "Academics, Teaching & Higher Education") {
    if (/phd/i.test(subtheme || "")) return "research-phd";
    if (/PG branch/i.test(subtheme || "")) return "pg-entrance";
    return "teaching-academia";
  }
  if (theme === "Policy, Public Health & Global Agencies") return /research council/i.test(subtheme || "") ? "research-phd" : "public-health-policy";
  if (theme === "Clinical Practice & Integrative Care" && /panchakarma/i.test(subtheme || "")) return "panchakarma-wellness";
  const hit = FALLBACK_STREAMS.find(s => s.themes.includes(theme));
  return hit ? hit.id : "internship-early-career";
}

/* ---------------------------------------------------------------- */
/* Intent                                                            */
/* ---------------------------------------------------------------- */

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/** Subject anchors + kind of ask, from the merge engine's precision-first signature. */
export function intentOf(question, context = "", theme = "") {
  const a = analyzeQuestion(question || "", context || "");
  const sig = intentSignature(a);
  let strong = [...sig.strong];
  // "pg" is implied by any branch / AIAPGET; keep the specific anchor only.
  if (strong.some(s => s.startsWith("branch:") || s === "aiapget")) strong = strong.filter(s => s !== "pg");
  if (strong.some(s => s.startsWith("country:"))) strong = strong.filter(s => s !== "abroad");
  strong.sort();
  const asks = [...sig.asks].sort();
  const ask = asks.length ? asks.join("+") : (sig.generic[0] || "general");
  const subjects = strong.length ? strong : [...sig.weak].sort();
  const key = [slug(theme) || "any", subjects.join("+") || "general", ask].join("|");
  return {
    key,
    subjects,
    ask,
    sig,
    summary: { strong: [...sig.strong], weak: [...sig.weak], asks, generic: sig.generic, without: sig.without },
  };
}

/**
 * "I am a BAMS intern." describes who is asking, not what they ask about; left in, it routes a
 * licensing or salary question to the internship persona.
 */
const SELF_INTRO = /\b(?:i am|i'm|im|i m|as)\s+(?:a|an)?\s*(?:final[- ]year\s+|\d(?:st|nd|rd|th)[- ]year\s+)?(?:bams\s+)?(?:intern|internee|student|graduate|practitioner|doctor)\b(?:\s+(?:from|at|in)\s+[^.?!,]{1,60})?[.?!,]?/gi;

export function withoutSelfIntro(text) {
  return String(text || "").replace(SELF_INTRO, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * @param {object} q  redacted question `{question, context, theme, subtheme}`
 * @param {{ personaFor?: Function, streams?: object[] }} personas
 */
export function classifyQuestion(q, personas = {}) {
  const intent = intentOf(q.question, q.context, q.theme);
  const medical = medicalScreen(q.question, q.context);
  const streams = Array.isArray(personas.streams) && personas.streams.length ? personas.streams : FALLBACK_STREAMS;
  let persona = null;
  const text = [q.question, q.context].filter(Boolean).join(" ");
  const aboutInternship = /\binterns?hip\b|\binternee\b|\bcrri\b/i.test(withoutSelfIntro(text));
  if (typeof personas.personaFor === "function") {
    try {
      persona = personas.personaFor(q.theme, q.subtheme, text) || null;
      const id = persona && (persona.stream || persona.id || persona);
      if (id === "internship-early-career") {
        const asked = withoutSelfIntro(text);
        if (asked && asked !== text) persona = personas.personaFor(q.theme, q.subtheme, asked) || persona;
      }
    } catch { persona = null; }
  }
  // The merge-engine signature catches PG-entrance / government-job asks the registry's cues miss.
  const refined = refineStream(intent.sig, q.theme, q.subtheme, streams);
  let stream = (persona && (persona.stream || persona.id)) || "";
  const overridable = !stream || stream === "teaching-academia" || stream === "public-health-policy" || (stream === "internship-early-career" && !aboutInternship);
  if (refined && overridable) stream = refined;
  if (!stream) stream = fallbackStreamFor(q.theme, q.subtheme, intent.sig);
  return {
    intentKey: intent.key,
    intent: intent.summary,
    subjects: intent.subjects,
    ask: intent.ask,
    stream,
    persona,
    medical,
  };
}
