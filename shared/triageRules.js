/**
 * Question triage — deterministic layer (runs on the server and in the Ask Desk hint).
 * Is the question about an Ayurveda / AYUSH career, does it fit the theme + sub-area the student
 * picked, and does it ask for something the desk must not help with? High-precision lexicons in
 * English, Hinglish and Hindi; theme cue scores over the real Ask Desk taxonomy; the merge engine's
 * intent signature. The server adds `classify.medicalScreen` and an LLM second opinion when these
 * rules are unsure (see docs/ai/QUESTION-TRIAGE-SPEC.md).
 */

import { analyzeQuestion, intentSignature } from "./merge.js";

/** Mirrors the Ask Desk TRACKS (src/App.jsx) and server/ai/personas/index.js THEMES; a test checks drift. */
export const TRIAGE_THEMES = Object.freeze([
  { code: "T01", name: "Clinical Practice & Integrative Care", subs: ["Choosing a clinical specialty", "Hospital employment", "Setting up private practice", "Panchakarma & therapy services", "Integrative referrals", "Records & clinical quality"] },
  { code: "T02", name: "Academics, Teaching & Higher Education", subs: ["Choosing a PG branch", "PhD pathway", "Faculty recruitment & eligibility", "Teaching skills", "Curriculum & assessment", "Academic leadership"] },
  { code: "T03", name: "Research, Evidence & Publication", subs: ["Framing a research question", "Study design", "Ethics & approvals", "Biostatistics", "Grants & funding", "Thesis & publication"] },
  { code: "T04", name: "Entrepreneurship & Start-ups", subs: ["Validating the idea", "Business model", "Product & prototype", "Incubation support", "Funding & finance", "Team & intellectual property"] },
  { code: "T05", name: "Manufacturing, Quality & GMP", subs: ["R&D and formulation", "Production & scale-up", "QA / QC and testing", "GMP and licensing", "Regulatory affairs", "Pharmacovigilance"] },
  { code: "T06", name: "Brand Building & Communication", subs: ["Positioning a practice or product", "Digital presence", "Scientific communication", "Advertising & claims compliance", "Community education"] },
  { code: "T07", name: "Export & Global Trade", subs: ["Getting started in export", "Documentation & shipping terms", "Certification and quality marks", "Market entry & partners", "Pricing & distribution"] },
  { code: "T08", name: "Practice Abroad & Practitioner Mobility", subs: ["Country-wise recognition", "Licensing & registration", "Visa and employment routes", "Bridging qualifications", "Wellness centre roles abroad"] },
  { code: "T09", name: "Medical Value Travel & Wellness", subs: ["How the MVT ecosystem works", "Accreditation and standards", "Designing packages", "Handling international patients", "Careers in wellness resorts"] },
  { code: "T10", name: "Policy, Public Health & Global Agencies", subs: ["Government service routes", "National AYUSH Mission delivery", "Research councils", "Public health projects", "International organisations", "Policy research & advocacy"] },
]);
export const NOT_SURE_THEME = "Not sure — help me classify";

export const CATEGORIES = Object.freeze(["ON_TOPIC", "WRONG_AREA", "UNFOCUSED", "OFF_TOPIC", "RESTRICTED", "DUPLICATE"]);
export const RESTRICTED_SUBTYPES = Object.freeze(["MEDICAL", "LEGAL_FINANCIAL", "EXAM_INTEGRITY", "UNSAFE_ILLEGAL", "PERSONAL_DATA", "ABUSIVE", "SELF_HARM", "PROMOTIONAL", "PROMPT_INJECTION"]);
/** Categories the pipeline answers with a scripted reply instead of a grounded draft. */
export const SCRIPTED_CATEGORIES = Object.freeze(new Set(["UNFOCUSED", "OFF_TOPIC", "RESTRICTED", "DUPLICATE"]));
/** Rules are trusted without an LLM at or above this confidence. */
export const RULES_SURE = 0.85;

/** Well-formed example questions per theme (no facts; used by scripted replies and the hint). */
export const THEME_EXAMPLES = Object.freeze({
  T01: ["What licences and first steps do I need to start a small Ayurveda clinic after internship?", "Is it better to work in a hospital for two years before opening my own practice?"],
  T02: ["How should I choose between Kayachikitsa and Panchakarma for MD, and when should I start AIAPGET preparation?", "What does it take to become an assistant professor in an Ayurveda college after MD?"],
  T03: ["How do I frame a first research question from a case I saw during internship?", "Which kind of journal suits a first case report from a young practitioner?"],
  T04: ["How do I test whether my Ayurvedic product idea has a real market before spending money?", "What kind of incubation support is open to Ayurveda start-ups?"],
  T05: ["What roles can an Ayurveda graduate take in QA / QC at a manufacturing company?", "What should I learn to move into regulatory affairs in the Ayurveda industry?"],
  T06: ["How can I build an online presence for my clinic without breaking advertising rules?", "How do I position a new Ayurveda practice in a crowded city?"],
  T07: ["What are the first steps to start exporting Ayurveda products as a small company?", "Which certifications matter most when exporting Ayurveda products to Europe?"],
  T08: ["Can a BAMS graduate practise legally in the UAE, and what licence is required?", "What bridging qualification helps a BAMS graduate work in wellness abroad?"],
  T09: ["What roles can an Ayurveda graduate take in wellness resorts, and how do I get started?", "How do Ayurveda centres prepare to receive international patients?"],
  T10: ["What is the route to a government AYUSH medical officer post after BAMS?", "How can a young Ayurveda practitioner move into public health work?"],
  any: ["What should my next step be if I am unsure between PG in Kayachikitsa and starting a small clinic?", "What licences and first steps do I need to start a small Ayurveda clinic after internship?"],
});

const THEME_BY_NAME = new Map(TRIAGE_THEMES.map(t => [t.name, t]));
const THEME_BY_CODE = new Map(TRIAGE_THEMES.map(t => [t.code, t]));

/** Ask Desk product-track labels (shared/tracks.js) → triage theme names. */
const THEME_ALIASES = Object.freeze({
  "Tech, AI & Digital Health": "Entrepreneurship & Start-ups",
  "Academia & Higher Education": "Academics, Teaching & Higher Education",
  "Industry, Manufacturing & Quality": "Manufacturing, Quality & GMP",
  "Public Health, Policy & Agencies": "Policy, Public Health & Global Agencies",
  "Medicinal Plants, Sustainability & Traditional Knowledge": "Research, Evidence & Publication",
});

/** Product-track sub-areas → closest triage sub-area (same or aliased theme). */
const SUBTHEME_ALIASES = Object.freeze({
  "Health-tech products & platforms": "Product & prototype",
  "Digital presence for practice or product": "Digital presence",
  "AI tools in education or practice ops": "Product & prototype",
  "Scientific / content communication": "Scientific communication",
  "Telemedicine careers (non-clinical ops)": "Digital presence",
  "Data, documentation & digital quality": "Digital presence",
  "Brand & claims compliance": "Advertising & claims compliance",
  "Practice abroad & mobility": "Country-wise recognition",
  "Medical value travel & wellness careers": "How the MVT ecosystem works",
});

export function themeByName(name) {
  const raw = String(name || "");
  const aliased = THEME_ALIASES[raw] || raw;
  return THEME_BY_NAME.get(aliased) || THEME_BY_NAME.get(raw) || null;
}
export function themeByCode(code) {
  return THEME_BY_CODE.get(String(code || "")) || null;
}
export function resolveSubtheme(theme, subtheme) {
  const t = themeByName(theme);
  if (!t) return "";
  const raw = String(subtheme || "");
  if (t.subs.includes(raw)) return raw;
  const aliased = SUBTHEME_ALIASES[raw] || "";
  if (aliased && t.subs.includes(aliased)) return aliased;
  // Cross-theme alias: e.g. Digital presence under Tech → Brand theme after alias swap.
  if (aliased) {
    for (const th of TRIAGE_THEMES) {
      if (th.subs.includes(aliased)) return aliased;
    }
  }
  return raw;
}

export function isValidPair(theme, subtheme) {
  const t = themeByName(theme);
  if (!t) return false;
  const sub = resolveSubtheme(theme, subtheme);
  return t.subs.includes(sub);
}

/* ---------------------------------------------------------------- */
/* Text helpers                                                      */
/* ---------------------------------------------------------------- */

function norm(s) {
  return String(s || "").replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().toLowerCase()
    .replace(/\bpanch\s?a?\s?k(?:a?r+a?|a)ma?\b/g, "panchakarma")
    .replace(/\bb\.\s?a\.\s?m\.\s?s\.?/g, "bams");
}

const DEVANAGARI = /[\u0900-\u097f]/g;
const HINGLISH = /\b(?:kya|kaise|kaisa|kaisi|kaun|kaunsa|kaunsi|konsa|konsi|hai|hain|hu|hoon|mujhe|mera|meri|mere|karna|karu|karun|karein|chahiye|chahta|chahti|nahi|nahin|mein|batao|bataiye|aur|lekin|kyunki|kab|kitna|kitni|sakta|sakti|sakte|wala|wali|hoga|hogi|abhi|bhi|toh|kar|raha|rahi|gaya|liye|ke|ki|ka)\b/g;

/** "en" | "hinglish" | "hi" — reply language for scripted replies. */
export function detectLanguage(text) {
  const s = String(text || "");
  const letters = (s.match(/[A-Za-z\u0900-\u097f]/g) || []).length;
  const dev = (s.match(DEVANAGARI) || []).length;
  if (letters && dev / letters >= 0.3) return "hi";
  const marks = new Set((s.toLowerCase().match(HINGLISH) || []));
  // "ke / ki / ka" alone are weak; need two distinct markers including a strong one.
  const strong = [...marks].filter(w => !["ke", "ki", "ka", "kar", "bhi"].includes(w));
  return marks.size >= 3 || (marks.size >= 2 && strong.length >= 1) ? "hinglish" : "en";
}

function anyMatch(list, text) {
  for (const re of list) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return "";
}

/* ---------------------------------------------------------------- */
/* Restricted lexicons (precision first)                             */
/* ---------------------------------------------------------------- */

const SELF_HARM = [
  /\b(?:suicid(?:e|al)(?! prevention| helpline| awareness| research| rates?\b)|kill(?:ing)? my ?self|end(?:ing)? (?:my|this) life|take my (?:own )?life|want(?:ed)? to die|wanna die|don'?t want to (?:live|be alive)|(?:no|any|what'?s the) (?:reason|point) (?:to|in|of) (?:live|living|life)\b|better off dead|self[- ]?harm\w*|cut(?:ting)? myself|hurt(?:ing)? myself|not worth living|give up on (?:my )?life|can'?t go on (?:living|anymore)|life is (?:meaningless|pointless|over))\b/,
  /\b(?:khudkushi|aatm?ahatya|atmahatya|mar ?jaa?n[ae]? chaht[ai]|marna chaht[ai]|jeena nahi chaht[ai]|jine ka (?:mann?|man) nahi|zindagi khatam kar|suicide kar(?:na|lunga|lungi|loon))\w*/,
  /(?:आत्महत्या|खुदकुशी|मरना चाहत|जीना नहीं चाहत|ज़िंदगी खत्म कर|जिंदगी खत्म कर)/,
];

const ABUSIVE = [
  /\b(?:f+u+c+k+\w*|motherf\w*|bastards?|bitch\w*|assholes?|dickheads?|scumbags?|retards?)\b/,
  /\b(?:you|u|mentors?|the desk|this desk|this site|admins?|organi[sz]ers?)\s+(?:are|r|is)\s+(?:all\s+)?(?:useless|idiots?|stupid|fools?|morons?|frauds?|worthless|cheaters?|scammers?)\b/,
  /\byou (?:all )?(?:bloody |stupid |damn )?(?:idiots|fools|morons|losers|scammers)\b|\byou (?:bloody |stupid |damn )(?:idiot|fool|moron|loser|fraud)\b/,
  /\bi(?:'ll| will) (?:kill|beat|hurt|rape|slap) (?:you|u|him|her|them|the mentor)\b|\brape\b/,
  /\b(?:chutiy\w*|madarchod|madar ?chod|behen ?chod|bhen ?chod|bhenchod|bhosd\w*|gaandu|gandu|haramkhor|harami|randi|lodu|lavde|lund)\b/,
  /(?:चूतिया|मादरचोद|बहनचोद|भोसड़|हरामी|गांडू|रंडी)/,
];

const SOLICIT = /\b(?:get|buy|purchase|send|share|provide|arrange|need|want|sell|selling|anyone (?:has|have)|where (?:can|do|to)|how (?:to|can i|do i) (?:get|find|buy|arrange)|kaha|kahan|kahaan|milega|milegi|mil (?:sakta|sakti|jayega|jaega)|de do|dedo|bhej\w*|chahiye|dila do|dilwa)\b/;

const EXAM_INTEGRITY = [
  { re: /\b(?:leak(?:ed)?\b[^.?!]{0,30}\b(?:question )?papers?|papers?\b[^.?!]{0,20}\bleak(?:ed|s)?|paper leak|question papers? (?:leak\w*|in advance|before (?:the )?exam)|leaked questions|exam paper (?:before|in advance)|paper out (?:before|hai))\b/, solicit: true },
  { re: /\b(?:how (?:to|can i|do i) cheat|cheat(?:ing)? (?:in|during|on|at) (?:the |my )?(?:exam|aiapget|test|viva|university|finals?|practicals?)|copy (?:in|during) (?:the )?exam|(?:bluetooth|earpiece|hidden phone|smart ?watch) (?:in|during|inside) (?:the )?exam|chits? (?:in|into) (?:the )?exam|nakal (?:karna|kaise|kar|karne)|chit (?:le jana|kaise))\b/ },
  { re: /\b(?:proxy (?:candidate|attendance|for (?:the |my )?exam|exam)|dummy candidate|(?:someone|somebody|person) (?:else )?(?:to )?(?:write|appear (?:for|in)|sit (?:for|in)|give) (?:my|the) (?:\w+ )?(?:exam|paper|aiapget)|(?:write|appear for|give) (?:my|the) (?:\w+ )?exam (?:for me|on my behalf|in my place)|impersonat\w*)\b/ },
  { re: /\b(?:fake|forged?|forging|bogus|backdated|farzi|nakli)\b(?:(?!registration|licen)[^.?!]){0,25}\b(?:certificates?|marksheets?|mark ?sheets?|internship (?:certificate|completion)|experience (?:certificates?|letters?)|attendance|completion certificate|transcripts?)\b/ },
  { re: /\b(?:internship|completion|experience) certificate\b[^.?!]{0,30}\b(?:without (?:actually |really |even )?(?:doing|attending|completing|going)|bina (?:kiye|gaye|attend))\b/ },
  { re: /\b(?:how (?:to|can i|do i)|whom to|who (?:to|can i)) (?:bribe|pay (?:a )?bribe)\b|\bbribe\b[^.?!]{0,30}\b(?:for|to get) (?:a |the )?(?:seat|marks|pass|result|rank|posting|job)\b|\b(?:increase|change|manipulate|tamper)\b[^.?!]{0,15}\b(?:my )?(?:marks|grades|result)\b[^.?!]{0,30}\b(?:bribe|money|paise|setting|contact|influence)\b|\bsetting (?:ho|karwa|karva)\w* (?:ke|kar)? ?(?:pass|marks|seat)|\bjugaa?d (?:se|lagake) (?:pass|seat|marks)/ },
  { re: /(?:पेपर लीक|लीक पेपर|लीक प्रश्न|नकल कैसे|नकल करने|फर्जी (?:प्रमाण|सर्टिफिकेट|मार्कशीट)|डमी कैंडिडेट)/, hindi: true },
];

/** `guard`: skipped when the student asks whether something is allowed and shows no intent to evade. */
const UNSAFE = [
  { re: /\b(?:buy|purchase|get|arrange|order)\b[^.?!]{0,20}\b(?:a |an )?(?:fake |ready(?:made)? )?(?:bams |md |ms |medical |ayurved\w* )?(?:degree|diploma)\b[^.?!]{0,30}\b(?:without|money|paying|cash|online|fast|quickly|lakh)\b/ },
  { re: /\b(?:fake|forged|farzi|nakli|bogus)\s+(?:bams |md |ms |medical |ayurved\w* )?(?:degree|diploma|registration(?: certificate)?|licen[cs]e|ncism (?:id|registration)|gmp(?: certificate)?|ayush licen[cs]e|labels?|doctor)\b/ },
  { re: /\b(?:degree|diploma)s? (?:for sale|without (?:attending|studying|exams?|classes))\b/ },
  { re: /\b(?:without getting caught|without anyone (?:knowing|noticing)|so (?:that )?(?:nobody|no one|no-one) (?:notices|knows|finds out)|avoid (?:the )?(?:raids?|inspections?|drug inspectors?|police|authorities)|escape (?:the )?(?:raids?|inspections?)|bribe (?:the )?(?:drug )?inspectors?|hide (?:it )?from (?:the )?(?:authorities|inspectors?|ncism|police))\b/ },
  { re: /\b(?:add|mix|mixing|adding|put|putting)\b[^.?!]{0,20}\b(?:steroids?|dexa\w*|betamethasone|prednisolone|allopathic (?:drugs?|medicines?|tablets?)|painkillers?|sildenafil|viagra|heavy metals?)\b[^.?!]{0,30}\b(?:in|into|with|to)\b[^.?!]{0,20}\b(?:churna|choorna|ayurvedic|ayurveda|medicines?|formulations?|products?|capsules?|powders?|kadha|oils?|taila)\b/ },
  { re: /\b(?:sell|selling|market|supply|distribute)\b[^.?!]{0,40}\b(?:without (?:a |an |any )?(?:licen[cs]e|approval|ayush licen[cs]e|testing|labell?ing|drug licen[cs]e)|unapproved|banned|unlicen[cs]ed|unlabell?ed|untested)\b/, guard: true },
  { re: /\bbina (?:registration|licen[cs]e|degree)\b[^.?!]{0,40}\b(?:pakde|pakda|pakad|raid|chupke|chhupke|kaise bache|bach)\w*/ },
  { re: /(?:फर्जी डिग्री|नकली डिग्री|बिना रजिस्ट्रेशन[^.?!]{0,20}(?:पकड़|छापा))/ },
];
const LEGALITY_ASK = /\b(?:is it (?:legal|allowed|permitted|ok|okay|possible)|legally|allowed to|permitted to|do i need|what (?:licen[cs]es?|approvals?|rules)|rules? for|kya .{0,20}legal)\b/;
const EVASION = /\b(?:caught|nobody|no one|secretly|quietly|hide|avoid|bribe|raid|trick|loophole|bypass)\b/;

const OFFICIAL = /\b(?:help ?desk|office|ncism|nta|ministry|council|university|registrar|college office|admission cell|grievance cell|secretariat|organi[sz]ers?|wac (?:team|desk|office)|ayush department|directorate|board)\b/;
const PERSONAL_DATA = [
  /\b(?:give|share|send|tell|provide|need|want|get|have)\b[^.?!]{0,25}\b(?:personal |private |mobile |phone |contact |whatsapp |cell |home )?(?:numbers?|no\.?|contact(?: details| info)?|email(?: ids?| address(?:es)?)?|address(?:es)?|whatsapp)\b[^.?!]{0,12}\b(?:of|for)\b[^.?!]{0,12}\b(?:dr\.?|doctor|mentors?|professor|prof\.?|sir|ma'?am|madam|mr\.?|mrs\.?|ms\.?|my (?:classmate|friend|senior|junior|teacher|batchmate|ex)|this (?:mentor|doctor|speaker)|\[name\]|speakers?|[a-z]+ (?:sir|madam|ma'?am))/,
  /\b(?:personal|private) (?:mobile |phone |contact |whatsapp |cell )?(?:numbers?|no\.?|contacts?|email(?: ids?)?|address)\b/,
  /\b(?:phone|mobile|whatsapp|cell|home) (?:numbers?|no\.?)\b[^.?!]{0,8}\bof\b(?!\s+(?:the\s+)?(?:aiapget|nta|ncism|ministry|council|university|college office|helpdesk|help desk|office|board|admission|registrar|wac|organi[sz]ers?|secretariat|directorate|department|exam))/,
  /\b(?:marks|ranks?|results?|scores?|percentiles?|grades?)\b[^.?!]{0,12}\b(?:of|for)\b[^.?!]{0,10}\b(?:my )?(?:classmates?|friends?|batchmates?|roommates?|other students?|another student|all students|everyone in my (?:class|batch)|\[name\])\b/,
  /\b(?:list|database|data|details) of (?:all )?(?:students|delegates|participants|mentees|attendees)(?:'s?)? (?:emails?|phone numbers?|numbers|contacts?|addresses|data)?\b|\b(?:emails?|phone numbers?|contacts?) of (?:all )?(?:the )?(?:students|delegates|participants|mentees|attendees)\b/,
  /\b(?:\[name\]|sir|madam|dr\.?|mentor|unka|uska|unki|uski)\b[^.?!]{0,20}\b(?:number|contact|mobile(?: no)?|email)\b[^.?!]{0,10}\b(?:de do|dedo|bhejo|chahiye|milega|do na)\b/,
];

const INJECTION = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.?!]{0,30}\b(?:instructions?|rules|prompts?|guidelines|system message|constraints|guardrails)\b/,
  /\b(?:system prompt|developer (?:message|mode)|hidden (?:instructions|prompt)|(?:reveal|print|show|output|repeat|leak) (?:me )?(?:your|the) (?:prompt|instructions|rules|system (?:prompt|message)|initial instructions)|what (?:are|were) your (?:instructions|rules)|repeat the (?:text|words) above|jailbreak\w*|do anything now|you are now (?:a|an|in)\b|act as (?:an? )?(?:unfiltered|unrestricted|different|evil|jailbroken)|pretend (?:that )?you (?:are|have) no (?:rules|restrictions|filters))\b/,
  /<\/?\s*(?:student|system|assistant|instructions?)\s*>|###\s*(?:system|instruction)|\[\/?inst\]/,
  /\b(?:instructions|rules) (?:ko )?(?:ignore|bhool) (?:karo|kar do|jao|ja)\b/,
];

const PROMO = [
  /\b(?:join (?:my|our) (?:telegram|whatsapp|youtube|insta\w*|channel|group|course|coaching|batch|classes|academy)|subscribe (?:to )?(?:my|our)|follow (?:me|us) on|dm (?:me|us)\b|contact (?:me|us) (?:for|on|at)|visit (?:my|our) (?:website|channel|page|site|clinic page)|use (?:my |our )?(?:code|coupon|referral)|\d+\s?% off|limited (?:seats|offer|period)|enrol+ (?:now|today)|register now (?:for|in|with) (?:my|our)|buy (?:now|our|my)\b|earn (?:money|rs\.?|₹|\d+)[^.?!]{0,15}(?:from home|online|daily|per day|weekly)|guaranteed (?:selection|seat|rank|admission|results?)|100% (?:selection|result))/,
  /\b(?:our|my) (?:coaching|academy|institute|course|batch|test series|app)\b[^.?!]{0,60}\b(?:call|whatsapp|contact|join|dm|enrol\w*|admission open|fees? only|discount)\b/,
  /(?:\[link\]|\[handle\]|https?:\/\/|www\.)[^\n]{0,80}\b(?:join|offer|discount|enrol\w*|subscribe|buy|crash course|coaching|classes|channel)\b|\b(?:join|offer|discount|enrol\w*|subscribe|buy|crash course|coaching|classes|channel)\b[^\n]{0,60}(?:\[phone\]|\[link\]|\[handle\]|https?:\/\/|www\.)/,
  /\b(?:join karo|join kare|join karein|hamare (?:channel|group|coaching)|mera (?:channel|group)|subscribe karo|link pe click)\b/,
];

const LEGAL_FIN = [
  /\b(?:sue|suing|lawsuit|file (?:a |an )?(?:case|fir|petition|writ|police complaint|court case)|court case|legal notice|(?:hire|need|consult|get) (?:a )?(?:lawyer|advocate)|consumer (?:court|forum)|divorce|alimony|property dispute|anticipatory bail|bail plea|defamation case)\b/,
  /\b(?:which (?:stocks?|shares?|mutual funds?|sips?|crypto\w*(?: coins?)?|coins?) (?:to|should|can|is|will)|(?:invest|investing|put my (?:money|savings)) (?:in|into) (?:stocks?|shares|the share market|mutual funds?|crypto\w*|bitcoin|f&o|options)|stock (?:tips|market tips)|intraday trading|f&o trading|(?:buy|buying|trade|trading) (?:shares|stocks?|crypto\w*|bitcoin)|personal loan to (?:buy|invest)|income tax return|file (?:my )?(?:itr|income tax|tax return)|itr filing|tax saving (?:tips|options|investments?)|cibil|credit score|loan default|emi (?:bounce|default))\b/,
  /\b(?:case (?:karna|file kar|kar du|kar sakta)|court (?:jana|me case)|vakil|wakil|share market (?:me|mein) (?:invest|paisa)|kaunsa (?:share|stock|mutual fund))\b/,
  /(?:मुकदमा|कोर्ट केस|वकील|शेयर बाजार में निवेश)/,
];

/* ---------------------------------------------------------------- */
/* Medical risk (EN + Hinglish + Hindi), independent of any model    */
/* ---------------------------------------------------------------- */

/** Named conditions (safe to match anywhere). */
const EN_DISEASE = "diabet\\w*|sugar|thyroid|hypothyroid\\w*|hyperthyroid\\w*|pcod|pcos|psoriasis|eczema|dermatitis|vitiligo|leucoderma|acne|pimples?|skin (?:diseases?|problems?|issues?|allerg\\w*|infections?|conditions?)|arthritis|rheumatoid|gout|uric acid|migraines?|headaches?|head ?ache|fever|cough|common cold|cold and cough|asthma|bronchitis|cancer|tumou?rs?|hypertension|high bp|low bp|bp|blood pressure|acidity|gerd|gastritis|bloating|ulcers?|constipation|piles|ha?emorrhoids|fissures?|fistula|kidney stones?|gall ?stones?|obesity|overweight|weight loss|weight gain|hair ?fall|hair loss|alopecia|dandruff|insomnia|sleeplessness|anxiety|depression|panic attacks?|covid|jaundice|hepatitis|fatty liver|cholesterol|allerg(?:y|ies)|sinusitis|sinus|infertility|(?:irregular|painful|missed|heavy|delayed) periods|period (?:pain|problems?)|menstrua\\w*|miscarriage|back ?pain|(?:joint|knee|neck|shoulder|stomach|chest|body|leg|lower back|ear|tooth|eye) pains?|sciatica|spondyl\\w*|paralysis|epilepsy|seizures?|autism|adhd|ana?emia|ibs|colitis|urticaria|itching|rash(?:es)?|uti|white discharge|leucorrho?ea|erectile dysfunction|impotence|premature ejaculation|(?:low )?sperm count|hiv|tuberculosis|dengue|malaria|typhoid|vomiting|diarrho?ea|loose motions?|nausea|dizziness|vertigo|breathless\\w*|heart (?:attack|disease|problems?)|cirrhosis|kidney (?:failure|disease|problems?)|prostate|varicose veins|ovarian cysts?|cysts?|fibroids?|osteoporosis|parkinson\\w*|alzheimer\\w*|dementia|glaucoma|cataract|conjunctivitis|dry eyes?|eye (?:problems?|infections?)";
/** Vague health words: only count with a health verb about the student / a relative. */
const EN_VAGUE = "pain|fatigue|symptoms?|diseases?|disorders?|illness|infections?|swelling|bleeding|wounds?|gas|cold|stones?|lumps?(?! sum)";
const H_DISEASE = "sugar|bp|thyroid|pcod|pcos|piles|bawasir|gas|acidity|kabz|kabj|qabz|bukhar|bukhaar|khansi|khaansi|zukam|jukam|zukhaam|sardi|dard|sir ?dard|pet ?dard|kamar ?dard|ghutno?n? (?:ka|me|mein) dard|motapa|baal (?:jhad|gir)\\w*|hair ?fall|pimples?|muhase|daad|khujli|safed daag|migraine|dama|asthma|joron? (?:ka|me|mein) dard|periods|mahavari|infertility|neend (?:nahi|na) (?:aati|aana)|anidra|kamzori|khoon ki kami|pathri|ulti|dast|piliya|jaundice|allergy|chakkar|diabetes|cholesterol|anxiety|depression|bimari|beemari|infection|gathiya|arthritis|loose motion|insomnia|skin|twacha|chamdi";
const HI_DISEASE = "मधुमेह|शुगर|डायबिटीज|बीपी|रक्तचाप|थायरॉइड|थायराइड|बुखार|खांसी|खाँसी|जुकाम|ज़ुकाम|सर्दी|दर्द|सिरदर्द|पीसीओडी|पीसीओएस|बवासीर|कब्ज|मोटापा|गठिया|माइग्रेन|अस्थमा|दमा|एलर्जी|एसिडिटी|अनिद्रा|नींद नहीं|कमजोरी|पथरी|उल्टी|दस्त|पीलिया|खुजली|मुंहासे|बाल झड़|बीमारी|संक्रमण|चक्कर";
const DRUG_EN = "medicines?|medication|meds|tablets?|pills?|capsules?|syrup|ointment|churna|choorna|kwath|kwatha|kashaya\\w*|kadha|arishta|asava|ghrita|vati|gutika|bhasma|herbs?|ashwagandha|triphala|giloy|guduchi|tulsi|shilajit|chyawanprash|brahmi|haritaki|guggul\\w*|amla|aloe ?vera|metformin|insulin|steroids?|antibiotics?|paracetamol|painkillers?|supplements?|this oil|the oil|oil daily";
const DRUG_H = "dawa|dawai|dawaa|dawaai|dava|davai|goli|goliyan|tablet|tablets|capsule|syrup|churna|choorna|kadha|kaadha|kwath|bhasma|vati|ashwagandha|triphala|giloy|shilajit|chyawanprash|brahmi|haritaki|guggul|tulsi|amla|medicine|aushadhi|aushadh";
const HI_DRUG = "दवा|दवाई|गोली|चूर्ण|काढ़ा|काढा|अश्वगंधा|त्रिफला|गिलोय|शिलाजीत|च्यवनप्राश|औषधि|भस्म|वटी|सिरप";
const FAMILY_EN = "mother|mom|mum|mummy|maa|father|dad|papa|wife|husband|son|daughter|child|kid|baby|brother|sister|friend|grand(?:mother|father|ma|pa)|aunt|uncle|relative|cousin|niece|nephew|family(?: member)?|in-laws?|patient";
const FAMILY_H = "mujhe|mujhko|main|mai|meri|mere|mera|maa|mummy|mumma|mammi|papa|pitaji|mataji|bhai|bhaiya|behen|bahan|didi|beta|beti|bete|bachche|bacche|baccha|bachcha|bachchi|patni|pati|dadi|dada|nani|nana|chacha|chachi|mausi";
const FAMILY_HI = "मुझे|मुझको|मेरी|मेरे|मेरा|माँ|मां|माता|मम्मी|पापा|पिताजी|पिता|भाई|बहन|बेटे|बेटा|बेटी|बच्चे|बच्चा|बच्ची|पत्नी|पति|दादी|दादा|नानी|नाना";
const NOT_A_PATIENT = "clinic|centre|center|practice|project|thesis|research|study|studies|business|start-?up|unit|ward|department|camp|product|brand|course|fellowship|patients|management protocols?|speciality|specialty|niche|programme|program|cases|reversal|care|market|industry";
const HEALTH_VERB = "have|has|had|having|suffer(?:s|ed|ing)?(?: from)?|diagnosed(?: with)?|got|get|gets|getting|feel(?:s|ing)?|experienc(?:e|es|ed|ing)|struggl(?:e|es|ing) with|affected by|complain(?:s|ing)? of|going through|developed";
const FILLER = "(?:(?:a|an|the|severe|chronic|mild|bad|frequent|constant|high|low|some|very|really|been|had|from|with|lot of|lots of|terrible|serious|recurrent|persistent|daily|regular|my|his|her|stage \\d|type \\d|type-\\d)\\s+){0,3}";
const SUBJECT_EN = `\\b(?:i|i'm|i am|i've|ive|im|me|myself|he|she|he's|she's|my (?:${FAMILY_EN})s?|our (?:${FAMILY_EN})s?)\\b`;

/** The student, a relative or their own patient has a health problem (strongest signal; career framing does not undo it). */
const SELF_HEALTH = [
  new RegExp(`${SUBJECT_EN}(?:\\s+\\w+){0,3}?\\s+(?:${HEALTH_VERB})\\s+${FILLER}(?:${EN_DISEASE}|${EN_VAGUE})\\b(?! (?:(?:and|&|or|\/) [\\w-]+ )?(?:${NOT_A_PATIENT})\\b)`),
  new RegExp(`\\b(?:my|our)(?: (?:${FAMILY_EN})(?:'s|s'))? (?:own )?(?:${EN_DISEASE})\\b(?! (?:(?:and|&|or|\/) [\\w-]+ )?(?:${NOT_A_PATIENT})\\b)`),
  new RegExp(`\\bmy (?:${FAMILY_EN}) (?:is|was|has been|became|fell|got) (?:very |seriously |critically |quite )?(?:ill|sick|unwell|hospitali[sz]ed|bedridden|not well)\\b`),
  new RegExp(`\\b(?:${FAMILY_H})\\b(?: \\w+){0,4}? (?:ko |ki |ke |ka )?(?:${H_DISEASE})\\b(?: (?:ki|ka|ke) (?:problem|samasya|bimari|beemari|takleef|shikayat|patient|mareez|marij))?\\s+(?:hai|hain|he|h|hu|hoon|tha|thi|ho (?:gaya|gayi|gya|gyi|raha|rahi|rha|rhi|jata|jati|jaata|jaati)|hota|hoti|rehta|rehti|rahta|rahti|se (?:pareshan|peedit|grast))\\b`),
  new RegExp(`(?:${FAMILY_HI})[^.?!।]{0,30}(?:${HI_DISEASE})[^.?!।]{0,15}(?:है|हैं|था|थी|हो गया|हो गई|हो रहा|हो रही|होता|होती|रहता|रहती|से परेशान|से पीड़ित)`),
];
/** "I have anxiety about the AIAPGET exam" is exam stress, not a health complaint. */
const EXAM_STRESS = /\b(?:anxiety|stress|tension|nervous\w*|pressure|fear|worried|depress\w*|panic)\b[^.?!]{0,25}\b(?:about|regarding|before|for|during|of|over|because of|after|due to)\b[^.?!]{0,20}\b(?:exams?|aiapget|neet|interview|results?|career|future|pg|internship|studies|viva|preparation|job|ranks?|failing|failure)\b/;

const DOSAGE = [
  /\b(?:dos(?:e|es|age) of|(?:correct|right|daily|max(?:imum)?|safe|recommended|usual|proper|exact) dos(?:e|age)|how many (?:tablets?|capsules?|pills?|spoons?|drops|times a day)|\d+\s?(?:mg|mcg|ml|gm|grams?|tablets?|capsules?|spoons?|teaspoons?)\b(?! (?:pack|packs|packaging|bottles?|jars?|units?|batch|sachets?)\b)|(?:twice|thrice|once|two times|three times) (?:a day|daily)|empty stomach|before or after (?:food|meals?))\b/,
  /\b(?:kitni|kitna|kitne) (?:matra|dose|goli|goliyan|tablet|tablets|capsule|chammach|chamach|spoon|baar|bar)\b|\b(?:matra kitni|ki matra|matra (?:me|mein) (?:le|lena|khana))\b|\b(?:khurak|khuraak)\b|\bdin (?:me|mein|main) (?:kitni|kitne|do|teen|ek|2|3) (?:baar|bar)\b|\bkhali pet\b|\bkhane (?:ke )?(?:pehle|baad) (?:ya|or)\b/,
  /(?:कितनी (?:मात्रा|खुराक|बार|गोली)|खुराक|खाली पेट|दिन में (?:कितनी|दो|तीन|एक) बार|खाने से पहले या बाद)/,
];

const INTAKE = [
  new RegExp(`\\b(?:can|could|should|shall|may|must) (?:i|we|he|she|they|you|my (?:${FAMILY_EN})|a (?:\\w+ )?(?:woman|man|child|person|patient|lady|mother))\\b(?: \\w+){0,2}? (?:take(?! (?:up|admission|a (?:job|drop|break|course|loan)|the (?:exam|test|aiapget)))|eat|drink|consume|apply(?! for)|give|stop|continue|mix|combine)\\b(?: \\w+){0,4}? (?:${DRUG_EN})\\b`),
  new RegExp(`\\b(?:${DRUG_H})\\b(?: \\w+){0,4}? (?:lena|leni|lene|le sakte|le sakti|le sakta|lu|loon|lun|lein|le lu|le lo|lijiye|khana|khani|khane|kha sakte|kha sakta|kha sakti|khau|khaun|khayen|khaye|khaen|piye|pina|pee sakte|pi sakte|lagana|lagau|lagaye|lagayen|start karu|band karu|band kar du|chalu rakhu|shuru karu)\\b`),
  new RegExp(`\\b\\w+ ko\\b(?: \\w+){0,4}? (?:${DRUG_H})\\b(?: \\w+){0,3}? (?:de sakte|de sakti|de sakta|dena|du|doon|dun|dein|dijiye)\\b`),
  new RegExp(`\\b(?:kaunsi|konsi|kaun si|kon si|kaun sa|kon sa|koi) (?:${DRUG_H})\\b(?: \\w+){0,3}? (?:lu|loon|lun|le|lein|lena|leni|khau|khaun|khaye|khayen|du|dun|doon|dena|dein|batao|bataiye|bata do|bataye|suggest karo)\\b`),
  new RegExp(`(?:${HI_DRUG})[^.?!।]{0,25}(?:लें|लूं|लूँ|ले सकते|ले सकती|खाएं|खाऊं|खाऊँ|खा सकते|खा सकती|पिएं|पीएं|लेनी|लेना|खानी|खाना चाहिए|दें)`),
];
/** Diet / "what should I eat" asks count only next to a named condition. */
const DIET_ASK = /\b(?:what (?:should|can|must) (?:i|he|she|we|my \w+) (?:eat|drink|avoid)|(?:suggest|recommend|give) (?:me |her |him )?(?:a )?diet|diet (?:plan|chart) for|kya (?:khaye|khayen|khau|khaun|khana chahiye|piye|parhez|parhej)|kya nahi khana)\b|(?:क्या खाएं|क्या खाऊं|क्या परहेज|क्या न खाएं)/;
const NAMED_CONDITION = new RegExp(`\\b(?:${EN_DISEASE}|${H_DISEASE})\\b|(?:${HI_DISEASE})`);

/** Asks how to treat a disease. Career framing ("scope", "clinic", "job") makes it a career question. */
const TREAT_ASK = [
  new RegExp(`\\b(?:best|better|good|effective|right|ideal|suitable|which|what)\\b[^.?!]{0,40}\\b(?:for|in|at) (?:treating|curing|managing|healing|reversing|controlling)\\s+(?:[\\w'-]+\\s+){0,3}?(?:${EN_DISEASE}|diseases?|disorders?)\\b`),
  new RegExp(`\\b(?:to|can|could|will|would) (?:treat|cure|heal) (?:her|him|them|me|myself|my (?:${FAMILY_EN})|his (?:${FAMILY_EN})|her (?:${FAMILY_EN}))\\b`),
  new RegExp(`\\b(?:treatment|cure|remed(?:y|ies)|medicines?|medication|therapy|diet|herbs?|nuskh[ae]|ilaa?j|upchar|dawai?) (?:for|of|to cure|to treat|against) (?:my |his |her |their |the |a )?(?:[a-z'-]+\\s+){0,2}?(?:${EN_DISEASE})\\b`),
  new RegExp(`\\bhow (?:to|do i|can i|should i|can we|do we|does one) (?:treat|cure|heal|reduce|control|manage|get rid of|stop|fix|reverse|overcome)\\b[^.?!]{0,40}\\b(?:${EN_DISEASE})\\b`),
  new RegExp(`\\b(?:${EN_DISEASE})\\b[^.?!]{0,25}\\b(?:remedy|remedies|cure|ilaj|ilaaj|upchar|nuskha)\\b`),
  new RegExp(`\\b(?:${H_DISEASE})\\b[^.?!]{0,30}\\b(?:ka|ki|ke) (?:ilaj|ilaaj|upchar|dawa|dawai|davai|nuskha|nuskhe|gharelu upay|treatment|remedy|medicine|ayurvedic dawa)\\b|\\b(?:${H_DISEASE})\\b\\s+(?:ke liye|ke lie|me|mein)\\s+(?:kya|kaunsi|konsi|kaun si|koi)\\s+(?:dawa|dawai|medicine|cheez|upay|ilaj)\\b|\\b(?:${H_DISEASE})\\b\\s+(?:kaise|kese|jaldi)\\s+(?:thik|theek|kam|door|khatam|control|sahi)\\b`),
  /\b(?:ilaj|ilaaj|upchar|dawa|dawai|nuskha|nuskhe|gharelu upay)\b\s+(?:batao|bataiye|bata do|bataye|suggest karo|chahiye)\b/,
  new RegExp(`(?:${HI_DISEASE})[^.?!।]{0,40}(?:दवा|दवाई|इलाज|उपचार|औषधि|खुराक|कौन सी|क्या खाएं|क्या लें|कैसे ठीक)|(?:दवा|दवाई|इलाज|उपचार|औषधि|खुराक)[^.?!।]{0,40}(?:${HI_DISEASE})`),
  new RegExp(`(?:${HI_DRUG})[^.?!।]{0,25}(?:कौन सी|कौनसी|बताएं|बताइए|बताओ)|(?:कौन सी|कौनसी|कोई) (?:${HI_DRUG})|(?:इलाज|उपचार) (?:बताएं|बताइए|बताओ)`),
];

const PREGNANCY = /\b(?:pregnan\w*|garbh\w*|breast ?feeding|lactating)\b[^.?!]{0,50}\b(?:take|eat|drink|safe|medicines?|tablets?|herbs?|churna|dawa|dawai|lena|leni|khana|le sakti|kha sakti|consume|give)\b|\b(?:take|eat|drink|medicines?|tablets?|herbs?|churna|dawa|dawai)\b[^.?!]{0,40}\b(?:pregnan\w*|garbh\w*|breast ?feeding|lactating)\b|(?:गर्भ|प्रेग्नेंसी|गर्भावस्था)[^.?!।]{0,30}(?:दवा|लें|खा|सुरक्षित|ले सकती|ले सकते)/;
const CHILD_ILL = /\b(?:child|children|baby|babies|infant|toddler|kid|kids|\d+[- ]?(?:year|yr|month)s?[- ]?old|baccha|bachcha|bacche|bachche|bachchi)\b[^.?!]{0,40}\b(?:fever|cough|sick|ill|unwell|vomit\w*|diarrho?ea|loose motions?|rash\w*|bukhar|khansi|zukam|sardi|bimar|beemar|ulti|dast|teething|colic|worms|stomach ?ache)\b|(?:बच्चे|बच्चा|बच्ची|शिशु)[^.?!।]{0,30}(?:बुखार|खांसी|बीमार|उल्टी|दस्त|जुकाम)/;
const OWN_CHILD = /\b(?:my|our|mera|meri|mere|hamara|hamari|hamare)\s+(?:\d+[- ]?(?:year|yr|month)s?[- ]?old|(?:\w+\s+)?(?:child|children|baby|son|daughter|kid|kids|infant|toddler|baccha|bachcha|bacche|bachche|bachchi|beta|beti))\b|(?:मेरा|मेरी|मेरे|हमारा|हमारी|हमारे)\s*(?:बच्चे|बच्चा|बच्ची|बेटा|बेटी)/;
const PRESCRIPTION = /\b(?:prescribe (?:me|for me|something for|my|him|her)|(?:write|give|suggest|send) (?:me )?(?:a )?prescription|prescription for (?:me|my|him|her)|(?:dawa|dawai|parchi|parcha) likh (?:do|dijiye|dena))\b|(?:पर्चा|पर्ची|दवा) लिख (?:दो|दीजिए|दें)/;

/** Strong career context: the condition is the market, specialty or study subject, not anyone's health. */
const CAREER_CONTEXT = /\b(?:careers?|scope|jobs?|salary|salaries|naukri|business|start-?ups?|export\w*|manufactur\w*|research\w*|thesis|dissertation|study design|clinical trials?|trial design|publish\w*|journals?|case reports?|fellowships?|courses?(?! of (?:treatment|medicine|medication|therapy|antibiotics))|certificate course|opportunit\w*|income|earn\w*|psc|upsc|vacanc\w*|interview|resume|niche|speciality clinics?|specialty clinics?|(?:open|opening|start|starting|set ?up|setting up|run|running|kholna|kholne)\b[^.?!]{0,25}\b(?:clinic|centre|center|practice|hospital|unit|company|brand)|(?:clinic|centre|center|practice|hospital|unit) (?:kholna|kholne|kaise khole|setup|set-up|registration|licen[cs]e)|marketing|advertis\w*|branding|insurance|empanel\w*|public health|grants?|funding|investors?|gmp|licen[cs]\w*|regulat\w*)\b|(?:करियर|नौकरी|व्यवसाय|शोध|क्लिनिक खोल|स्कोप)/;
const EXAM_MASK = /\b(?:anxiety|depression|panic attacks?|insomnia)\b/g;

/** The text names a health condition, a medicine or a dose (the triage model then gets a say). */
export function mentionsHealth(question, context = "") {
  const all = norm(`${question || ""}\n${context || ""}`);
  return NAMED_CONDITION.test(all) || new RegExp(`\\b(?:${DRUG_EN}|${DRUG_H})\\b|(?:${HI_DRUG})`).test(all);
}

/**
 * Deterministic medical-advice detector (EN + Hinglish + Hindi), run before any model.
 * `strong`: self / family / own-patient health, dosage, medicine intake, prescriptions, own child's
 * illness — career framing never clears these. `weak`: treatment asks, diet asks next to a named
 * condition, pregnancy + medicine, child illness — cleared only by a strong career context.
 * @returns {{ medical: boolean, strong: boolean, weak: boolean, careerContext: boolean, reasons: string[], match: string }}
 */
export function medicalRisk(question, context = "") {
  let all = norm(`${question || ""}\n${context || ""}`);
  if (EXAM_STRESS.test(all)) all = all.replace(EXAM_MASK, "worry");
  const reasons = [];
  let match = "";
  const hit = (id, list) => {
    for (const re of list) {
      const m = all.match(re);
      if (m) { if (!reasons.includes(id)) reasons.push(id); if (!match) match = m[0]; return true; }
    }
    return false;
  };
  const self = hit("self-health", SELF_HEALTH);
  const dose = hit("dosage", DOSAGE);
  const intake = hit("medicine-intake", INTAKE);
  const rx = hit("prescription", [PRESCRIPTION]);
  const child = hit("child-illness", [CHILD_ILL]);
  const treat = hit("treat-disease", TREAT_ASK);
  const diet = DIET_ASK.test(all) && NAMED_CONDITION.test(all) && hit("diet", [DIET_ASK]);
  const preg = hit("pregnancy", [PREGNANCY]);
  const careerContext = CAREER_CONTEXT.test(norm(question));
  const strong = self || dose || intake || rx || (child && OWN_CHILD.test(all));
  const weak = !strong && (treat || diet || preg || child);
  return { medical: strong || (weak && !careerContext), strong, weak, careerContext, reasons, match: match.slice(0, 80) };
}

/* Medical supplement for Hinglish / Hindi (English is classify.medicalScreen). */
const H_DISEASE_ASK = "sugar|bp|thyroid|pcod|pcos|piles|bawasir|gas|acidity|kabz|kabj|qabz|bukhar|bukhaar|khansi|zukam|jukam|sardi|dard|motapa|baal (?:jhad|gir)\\w*|hair ?fall|pimples?|daad|khujli|safed daag|migraine|dama|joron? ka dard|kamar dard|periods|mahavari|infertility";
const H_ASK = "dawa|dawai|dawaa|dava|davai|ilaj|ilaaj|upchar|nuskh[ae]|gharelu (?:upay|ilaj)|kya (?:khaye|khayen|khau|khaun|lu|loon|le|lein|kare|karu|karun)|kaunsi (?:dawa|dawai|medicine|tablet)|kitni (?:matra|dose)|kaise (?:thik|theek|kam|door) (?:kare|karu|ho|hoga)";
const MEDICAL_HINGLISH = new RegExp(`\\b(?:${H_DISEASE_ASK})\\b[^.?!]{0,50}\\b(?:${H_ASK})\\b|\\b(?:${H_ASK})\\b[^.?!]{0,50}\\b(?:${H_DISEASE_ASK})\\b`);
const MEDICAL_HINDI = /(?:मधुमेह|शुगर|डायबिटीज|बीपी|रक्तचाप|थायरॉइड|थायराइड|बुखार|खांसी|दर्द|पीसीओडी|बवासीर|कब्ज|मोटापा|गठिया|माइग्रेन|अस्थमा|एलर्जी)[^.?!।]{0,40}(?:दवा|दवाई|इलाज|उपचार|औषधि|खुराक|कौन सी|क्या खाएं|क्या लें|कैसे ठीक)|(?:दवा|दवाई|इलाज|उपचार|औषधि|खुराक)[^.?!।]{0,40}(?:मधुमेह|शुगर|डायबिटीज|बीपी|थायरॉइड|बुखार|दर्द|पीसीओडी|बवासीर|कब्ज|मोटापा|गठिया)/;
/** Browser-side stand-in for classify.medicalScreen (the server always passes the real screen). */
const LIGHT_MEDICAL = /\b(?:my|mother|father|mom|mum|dad|patient|wife|husband|son|daughter|child|i have|i am suffering)\b[^.?!]{0,60}\b(?:diabet\w*|sugar|bp|blood pressure|thyroid|pcod|pcos|psoriasis|eczema|piles|migraine|asthma|arthritis|fever|cancer|acidity|obesity|infertility|pain)\b[^.?!]{0,60}\b(?:medicines?|medication|dose|dosage|tablets?|treatment|cure|remed(?:y|ies)|take|eat|drink)\b|\b(?:dose|dosage) of\b|\bhow (?:much|many) [^.?!]{0,30}(?:should|can) [^.?!]{0,20}(?:take|drink|eat|give)\b|\bhow to (?:cure|treat) [^.?!]{0,30}\b(?:diabet\w*|psoriasis|piles|migraine|asthma|arthritis|pcos|pcod|thyroid)\b/;
const PROFESSIONAL_FRAME = /\b(?:in (?:my|our|an?) (?:\w+ ){0,3}(?:practi[cs]e|clinic|hospital)|manufactur\w*|study design|crossover|trial|research|career|business|company|start-?up|export\w*|licen[cs]e|legally|legal)\b/;
/** Self-treatment with a procedure ("is it safe to do Virechana at home for weight loss?"). */
const MEDICAL_PROCEDURE = /\b(?:is it safe|should i|can i|could i|how (?:to|do i|can i))\b[^.?!]{0,30}\b(?:do|try|undergo|take|get)\b[^.?!]{0,20}\b(?:virechana|vamana|basti|nasya|raktamokshana|leech therapy|jalaukavacharana|detox|fasting|panchakarma)\b[^.?!]{0,40}\b(?:at home|for (?:my|weight|a |his|her|their)\b|myself|on my own|without (?:a )?(?:doctor|physician|vaidya))/;
const CAREER_FRAME_H = /\b(?:career|scope|clinic|practice|job|naukri|salary|pg|md|course|business|research|kholna|kholne)\b|(?:करियर|क्लिनिक|नौकरी|कोर्स|पीजी)/;

/* ---------------------------------------------------------------- */
/* Off-topic, chit-chat, vague                                       */
/* ---------------------------------------------------------------- */

const CHITCHAT = /^(?:(?:hi+|hello+|hey+|namaste|namaskar|good (?:morning|afternoon|evening|night)|sir|ma'?am|madam|mam|dear|all|everyone|team|test(?:ing)?|ok(?:ay)?|thanks?|thank you|asdf\w*|qwerty\w*|hmm+|yo|sup|\?+|\.+|-+)[\s,!.?]*)+$/;
/* Pure homework dumps / school assignments — not career guidance. Learning to build apps or digital skills is ON_TOPIC. */
const HOMEWORK_DUMP = /\b(?:leetcode|hackerrank|codewars|solve (?:this|the) [a-z ]{0,20}(?:equation|problem|sum)|math(?:s|ematics)? (?:problem|homework|question)|quadratic|integration of|derivative of|physics (?:numerical|problem)|(?:do|complete|finish|write) (?:my |the )?homework|essay on|write (?:an? |me an? )?(?:essay|poem|story|joke)|write (?:me )?(?:a |the )?(?:python|java|c\+\+|javascript) (?:code|program|script|function) (?:to|for|that)|code (?:for|in) (?:python|java|c)\b (?:to|for)|poems?|jokes?|riddles?)\b/;

/** Genuine professional-skill asks (learn to code / build an app) — answered with step-by-step guidance, not declined. */
const SKILL_LEARNING = /\b(?:(?:build|develop|make|create|launch|ship)(?:ing)? (?:my |an? |own |a )?(?:app|application|software|web ?app|mobile app|website|prototype|product)|(?:learn(?:ing)?|want to learn|how (?:do|can|to) (?:i )?learn) (?:to )?(?:code|coding|programming|software development|web development)|don'?t know (?:anything )?about coding|(?:coding|programming|software developer) (?:skills?|career|path|as a (?:skill|career)))\b/;

const OFF_TOPIC = [
  /\b(?:cricket|ipl|t20|virat|dhoni|rohit sharma|football|fifa|messi|ronaldo|kabaddi|match (?:score|today)|movies?|web ?series|netflix|bollywood|kijiji|actors?|actress|songs?|lyrics|biryani|pizza|recipes? (?:for|of) (?:cake|biryani|pasta|chicken|paneer)|politic\w*|elections?|bjp|congress party|aap party|modi ji|rahul gandhi|prime minister of|chief minister of|capital of|weather|horoscope|astrology|zodiac|kundli|lottery|betting|satta|dream11|bitcoin price|crypto price|pubg|bgmi|free ?fire|minecraft|video games?|girlfriend|boyfriend|crush|break ?up|love (?:life|marriage|problem|advice|letter)|dating|relationship (?:advice|problem)|my (?:gf|bf)\b|marriage (?:advice|problem)|in[- ]laws|who (?:made|created|built) you|are you (?:a )?(?:robot|bot|human|real person)|what is your name|how are you|translate (?:this|to)|best (?:mobile|phone|laptop|bike|car|tv)\b|which (?:mobile|phone|laptop|bike|car) (?:to|should)|iphone)\b/,
  /\b(?:match (?:kaun|kon) jeetega|gaana|picture (?:dekhni|kaunsi)|film (?:kaunsi|recommend)|khana (?:kaise|banana)|recipe batao|pyaa?r|shaadi (?:kab|kaise|karni)|rishta|chutkula|mausam|bf se|gf se)\b/,
  /(?:क्रिकेट|फिल्म|गाना|प्यार|शादी|मौसम|राजनीति|चुनाव|कुंडली|चुटकुला)/,
  HOMEWORK_DUMP,
];

const VAGUE = [
  /\b(?:guide me|guidance(?: please| pls| plz)?$|help me(?: out)?$|please help|pls help|plz help|tell me (?:everything|all|something)|tell me about (?:career|careers|future|bams|ayurveda|my career)|everything about|suggest (?:me )?(?:something|anything|a career|some career)|what (?:should|can|do) i do(?: now| next)?\??$|i(?: am|'m| m) (?:so |very |really )?confused|any (?:tips|advice|suggestions?|guidance)\??$|career (?:guidance|advice|counsell?ing)(?: please| pls)?\??$|need (?:career )?(?:guidance|advice|help)(?: please| pls)?\??$|what is (?:the )?scope\??$|^scope\??$|^future\??$|^options\??$|what next\??$|how to (?:be|become) successful|how to succeed in life)/,
  /\b(?:kuch (?:batao|bataiye|bataye|bata do)|guide (?:karo|kariye|kijiye|kar do|kare)|kya (?:karu|karun|karna chahiye|kare|karein)\??$|madad (?:karo|kijiye|chahiye)|samajh nahi aa raha|confuse(?:d)? (?:hu|hoon)|career ke baa?re (?:me|mein) batao|aage kya karu)\b/,
  /(?:मार्गदर्शन|क्या करूं|क्या करूँ|क्या करना चाहिए|कुछ बताइए|कुछ बताओ|मदद कीजिए|मदद चाहिए|समझ नहीं आ रहा)/,
];

/** The desk's signature question is answerable as asked (the early-career persona owns it). */
const GENERAL_CAREER = /\bwhat (?:should i|to|can i|shall i) do after (?:my )?bams\b|\bafter bams (?:what|kya)\b|\b(?:career |best )?(?:options?|opitons?|paths?) (?:after|for) (?:completing |doing )?(?:my )?bams\b|\bwhich career (?:path|option)\b|\bbams ke baad kya\b|\bfuture (?:of|for) bams\b|\bbams (?:ka|का) future\b|(?:बीएएमएस|bams) के बाद क्या/;

const CAREER_WORDS = /\b(?:bams|ayurved\w*|ayush|ncism|ccim|vaidya\w*|herbal|physicians?|doctors?|patients?|insurance|empanel\w*|aiapget|panchakarma|rasayana|careers?|jobs?|salary|salaries|stipend|intern\w*|crri|pg|md|ms|mph|phd|clinic\w*|practi[cs]\w*|hospital\w*|college|university|research|teaching|faculty|government|govt|abroad|start-?ups?|business|pharma\w*|industry|export\w*|wellness|mentors?|exams?|entrance|counsell?ing|registration|licen[cs]\w*|course|degree|diploma|fellowship|scope|naukri|kaam|resume|cv|interview|skills?|upsc|psc|nam|ccras|gmp|coding|programming|software|developer|development|application|apps?|digital skills?|learn(?:ing)? to code|web (?:app|development)|mobile app)\b|(?:आयुर्वेद|बीएएमएस|करियर|नौकरी|कोर्स|पीजी|क्लिनिक)/g;

/* ---------------------------------------------------------------- */
/* Theme cues                                                        */
/* ---------------------------------------------------------------- */

/** [theme code, sub-area or null (theme-level), weight, regex] */
const CUES = [
  ["T01", "Choosing a clinical specialty", 3, /\b(?:clinical speciali[sz]\w*|which speciali[sz]\w*|speciali[sz]e in|specialty (?:clinic|practice)|for clinical (?:work|practice|career)|sports medicine|team (?:physician|doctor)|(?:skin|derma\w*|cosmetology|infertility|ortho\w*|pain|diabetes(?: reversal)?|weight loss|sports(?: ayurveda)?|pcos|geriatric|paediatric|pediatric) (?:clinic|practice|specialist|centre|center)s?|reversal clinics?|niche clinic)\b/],
  ["T01", "Hospital employment", 3, /\b(?:hospital jobs?|jobs? (?:in|at) (?:a |an )?(?:private |corporate |multi-?speciality |ayurveda |ayurvedic )?hospitals?|work (?:in|at) (?:a |an )?(?:private |corporate )?hospital|join (?:a )?hospital|resident medical officer|duty doctor|nursing home|corporate hospital|private hospital|hospital (?:salary|employment|first)|hospital or (?:own |private )?practice)\b/],
  ["T01", "Setting up private practice", 3, /\b(?:(?:own|private|start|starting|open|opening|set ?up|setting up|new|small|first) (?:a |an |my |own |small |ayurveda |ayurvedic )*(?:clinic|practice|dispensary)|clinic (?:registration|licen[cs]e|setup|set-up|location|rent|investment|cost)|first patients|clinical establishments? act|run (?:a |an |my )?(?:\w+ ){0,2}practice|practi[cs]e in (?:my )?(?:home ?town|village|city|town)|private practice|clinic kholna|clinic kholne)\b/],
  ["T01", "Panchakarma & therapy services", 2, /\b(?:panchakarma (?:centre|center|therapy|therapies|therapist|unit|services|set ?up|setup|course|certificate|clinic)|therapy services|abhyanga|shirodhara|kerala (?:therapy|treatments?)|therapists?)\b/],
  ["T01", "Panchakarma & therapy services", 3, /\b(?:open|start|set ?up|setting up|run|running) (?:a |an |my |own |small )*panchakarma (?:centre|center|unit|clinic)\b/],
  ["T01", "Integrative referrals", 3, /\b(?:integrative|cross[- ]?referr?als?|refer (?:patients|cases) to|work (?:with|alongside) (?:allopathic|mbbs|modern medicine) doctors|allopathy (?:practice|prescri\w*)|prescribe (?:allopathic|allopathy|modern)|mixopathy|modern medicine (?:practice|prescri\w*)|integrated (?:practice|medicine|care))\b/],
  ["T01", "Records & clinical quality", 3, /\b(?:case records?|medical records?|patient records?|emr|ehr|clinical documentation|clinical audit|consent forms?|prescription (?:pad|format|writing)|abha|telemedicine|online consultations?|tele-?consultations?|clinical quality|quality of care)\b/],
  ["T01", null, 1, /\b(?:clinic|clinics|practi[cs]e|practi[cs]ing|patients?|opd|prescri\w*|consultation)\b/],

  ["T02", "Choosing a PG branch", 3, /\b(?:pg branch\w*|which (?:pg|md|ms)\b|(?:pg|md|ms|post ?grad\w*) (?:branch|subject|speciali[sz]\w*|seat|seats|admission|entrance|preparation|in (?:kaya|shalya|shalakya|prasuti|kaumar|dravya|rasa|swastha|agad|roga|samhita|rachana|kriya|manas|panchakarma))|md (?:kayachikitsa|panchakarma)|aiapget|pg entrance|neet[- ]?pg|aaccc|counsell?ing (?:for|of) (?:pg|aiapget|md)|branch (?:to choose|selection|choice)|choose (?:a |my )?branch|kayachikitsa|shalya|shalakya|prasuti|kaumarbhritya|dravyaguna|rasashastra|swasthavritta|agad ?tantra|roga ?nidan\w*|samhita|rachana sharir|kriya sharir|manas ?roga)\b/],
  ["T02", "PhD pathway", 3, /\b(?:ph\.?\s?d|doctorate|doctoral)\b/],
  ["T02", "Faculty recruitment & eligibility", 3, /\b(?:faculty|lecturer|assistant professor|associate professor|professor post|teaching (?:jobs?|posts?|positions?)|teacher in (?:a |an )?(?:bams |ayurveda |ayurvedic )?college|join (?:a |an )?(?:ayurveda |ayurvedic )?college as|teacher code|ncism (?:faculty|teacher) (?:code|id))\b/],
  ["T02", "Teaching skills", 3, /\b(?:teaching (?:skills|methods|methodology)|how to teach|lecture (?:delivery|skills)|classroom|pedagog\w*|engage (?:my )?students)\b/],
  ["T02", "Curriculum & assessment", 3, /\b(?:curriculum|assessment|competency[- ]based|bams syllabus|syllabus (?:of|for) bams|elective)\b/],
  ["T02", "Academic leadership", 3, /\b(?:principal|dean|hod|head of (?:the )?department|academic leadership|vice[- ]chancellor|college administration)\b/],
  ["T02", null, 1, /\b(?:teach\w*|academic\w*|higher (?:studies|education)|post ?graduation|pg)\b/],

  ["T03", "Framing a research question", 3, /\b(?:research (?:question|topic|idea)s?|(?:thesis|dissertation) topics?|topic for (?:my )?(?:thesis|research|dissertation)|start (?:doing )?research|begin (?:a )?research|research career|career in research|research after bams)\b/],
  ["T03", "Study design", 3, /\b(?:study design|design(?:ing)? (?:a |my )?(?:\w+ )?study|pilot study|rcts?|randomi[sz]ed|clinical trial design|observational study|case series|research methodology|protocol (?:writing|design))\b/],
  ["T03", "Ethics & approvals", 3, /\b(?:ethics committee|iec|ethical (?:approval|clearance)|ctri|informed consent|irb)\b/],
  ["T03", "Ethics & approvals", 2, /\bconsent forms?\b/],
  ["T03", "Biostatistics", 3, /\b(?:biostat\w*|statistic\w*|spss|sample size|p[- ]?values?|data analysis)\b/],
  ["T03", "Grants & funding", 3, /\b(?:research (?:grants?|funding|fellowships?)|grants?|fellowships?|icmr|ccras (?:projects?|fellowships?)|dbt|dst|serb|jrf|srf|funding for (?:my )?research)\b/],
  ["T03", "Thesis & publication", 3, /\b(?:publish\w*|publication\w*|journals?|research papers?|pubmed|scopus|case reports?|manuscripts?|thesis|dissertation|ugc care|indexed)\b/],
  ["T03", null, 1, /\b(?:research\w*|evidence)\b/],

  ["T04", "Validating the idea", 3, /\b(?:start-?up idea|business idea|product idea|viab\w*|feasib\w*|validat\w* (?:my |the |an )?idea|market (?:research|need|demand) for (?:my )?(?:idea|product)|idea has (?:a )?(?:real )?market|real market)\b/],
  ["T04", "Business model", 3, /\b(?:business model|revenue model|pricing model|d2c|subscription model|b2b|b2c|monetis\w*|monetiz\w*)\b/],
  ["T04", "Product & prototype", 3, /\b(?:prototype|product development|product launch|launch (?:a |my |our )?(?:own )?(?:product|brand)|own (?:product|brand|formulation)s? (?:to sell|line)|start (?:a |my )?(?:product|company))\b/],
  ["T04", "Incubation support", 3, /\b(?:incubat\w*|accelerators?|startup india|atal innovation|ayush start-?ups?|nidhi|msme)\b/],
  ["T04", "Funding & finance", 3, /\b(?:seed fund\w*|investors?|angel invest\w*|venture capital|vc fund\w*|funding for (?:my )?(?:start-?up|business|company)|raise (?:money|funds|funding)|mudra loan|business loan)\b/],
  ["T04", "Team & intellectual property", 3, /\b(?:patent\w*|trademark\w*|intellectual property|ip rights|co-?founders?|copyright)\b/],
  ["T04", null, 2, /\b(?:start-?ups?|entrepreneur\w*|own business|business|company|founder)\b/],

  ["T05", "R&D and formulation", 3, /\b(?:formulation development|r ?& ?d|r and d|new formulations?|develop (?:a )?(?:new )?(?:formulation|medicine|product)|research and development)\b/],
  ["T05", "Production & scale-up", 3, /\b(?:production|scale[- ]?up|manufactur\w*|factory|pharmacy unit|batch production|contract manufactur\w*|third[- ]party manufactur\w*|loan licen[cs]e)\b/],
  ["T05", "QA / QC and testing", 3, /\b(?:qa|qc|quality (?:control|assurance|check\w*|test\w*)|bhasma quality|testing labs?|lab testing|heavy metal testing|stability stud\w*|analytical (?:lab|chemist))\b/],
  ["T05", "GMP and licensing", 3, /\b(?:gmp|schedule t|drug (?:manufacturing )?licen[cs]e|manufacturing licen[cs]e|ayush licen[cs]e|who[- ]gmp)\b/],
  ["T05", "Regulatory affairs", 3, /\b(?:regulatory(?: affairs)?|drugs and cosmetics act|d&c act|cdsco|labell?ing (?:rules|requirements))\b/],
  ["T05", "Pharmacovigilance", 3, /\b(?:pharmacovigilance|adverse (?:drug )?(?:events?|reactions?)|adr reporting|pv (?:jobs?|career|officer))\b/],
  ["T05", null, 2, /\b(?:pharma\w*|ayurveda industry|ayurvedic company|drug company|medical (?:rep|representative)|mr job|industry jobs?)\b/],

  ["T06", "Positioning a practice or product", 3, /\b(?:positioning|branding|brand (?:my|a|our)|brand name|personal brand|usp|stand out)\b/],
  ["T06", "Digital presence", 3, /\b(?:social media|instagram|youtube|facebook|website for (?:my )?(?:clinic|practice)|google (?:my business|business profile|ads)|seo|online presence|digital (?:marketing|presence)|linkedin|reels|blogging)\b/],
  ["T04", "Product & prototype", 3, /\b(?:(?:build|develop|make|create|launch|ship)(?:ing)? (?:my |an? |own |a )?(?:app|application|software|web ?app|mobile app|website|product|prototype)|(?:learn(?:ing)?|want to learn|how (?:do|can|to) (?:i )?learn) (?:to )?(?:code|coding|programming|software development)|(?:coding|programming|software|developer) (?:skills?|career|path|as a (?:skill|career))|don'?t know (?:anything )?about coding)\b/],
  ["T06", "Digital presence", 2, /\b(?:build|develop|make|create) (?:my |an? |own )?(?:website|web app|online (?:tool|platform))\b/],
  ["T06", "Scientific communication", 3, /\b(?:scientific communication|science communication|present (?:a |my )?paper|conference (?:presentation|talk)|poster presentation|public speaking)\b/],
  ["T06", "Advertising & claims compliance", 3, /\b(?:advertis\w*|misleading (?:ads|claims)|claims? (?:on|in) (?:labels?|ads)|magic remedies|dmr act|rule 170)\b/],
  ["T06", "Community education", 3, /\b(?:community (?:health )?(?:education|awareness|outreach)|health education|health camps?|awareness (?:camps?|programmes?|programs?|talks?)|school health|public awareness)\b/],
  ["T06", null, 1, /\b(?:brand\w*|marketing|promot\w*|communication)\b/],

  ["T07", "Getting started in export", 3, /\b(?:export\w*|iec code|import[- ]export)\b/],
  ["T07", "Documentation & shipping terms", 3, /\b(?:shipping|incoterms|fob|cif|customs clearance|certificate of origin|free sale certificate)\b/],
  ["T07", "Certification and quality marks", 2, /\b(?:ayush (?:premium )?mark|organic certification|usda organic|halal|kosher|ce mark|iso certification)\b/],
  ["T07", "Certification and quality marks", 2, /\bcertifications?\b/],
  ["T07", "Market entry & partners", 3, /\b(?:distributors?|importers?|overseas (?:markets?|partners?|buyers?)|foreign (?:markets?|buyers?)|market entry)\b/],
  ["T07", "Pricing & distribution", 3, /\b(?:export pricing|distribution channels?|amazon global|e-?commerce export)\b/],
  ["T07", null, 1, /\b(?:global trade|international trade)\b/],

  ["T08", "Country-wise recognition", 3, /\b(?:bams (?:valid|recogni[sz]ed|accepted)|recogni[sz]\w* (?:abroad|in other countries|outside india)|which countr\w* (?:recogni[sz]e|accept|allow))\b/],
  ["T08", "Licensing & registration", 3, /\b(?:dha|doh|mohap|licen[cs]e (?:abroad|in (?:uae|dubai|usa|uk|canada|australia|europe|germany))|practi[cs]e (?:legally )?(?:abroad|in (?:uae|dubai|usa|uk|canada|australia|europe|germany|the gulf))|nama|cnhc)\b/],
  ["T08", "Visa and employment routes", 3, /\b(?:visa|work permit|h-?1b|skilled worker|jobs? abroad|jobs? in (?:uae|dubai|gulf|usa|uk|canada|australia|europe|germany)|settle abroad|migrat\w*|permanent residen\w*)\b/],
  ["T08", "Bridging qualifications", 3, /\b(?:bridg(?:e|ing) (?:course|qualification|programme)\w*|masters? abroad|study abroad|equivalen\w*)\b/],
  ["T08", "Wellness centre roles abroad", 3, /\b(?:(?:spa|wellness)\b[^.?!]{0,25}\b(?:abroad|overseas|dubai|abu dhabi|uae|gulf|europe|maldives|usa|uk)|international (?:wellness|spa)|ayurveda therapist (?:abroad|in))\b/],
  ["T08", "Visa and employment routes", 3, /\b(?:jobs?|work|working|employment)\b[^.?!]{0,30}\b(?:in|at) (?:the )?(?:uae|dubai|abu dhabi|gulf|usa|uk|canada|australia|europe|germany|abroad|saudi|qatar|oman)\b/],
  ["T08", null, 2, /\b(?:abroad|foreign country|overseas|outside india)\b/],
  ["T08", null, 1, /\b(?:usa|america|uk|england|canada|australia|germany|europe|gulf|uae|dubai|abu dhabi|sharjah|bahrain|kuwait|saudi|qatar|oman|nepal|mauritius|russia|japan|malaysia|maldives|singapore|switzerland|israel|new zealand|netherlands|italy|france|ireland)\b/],

  ["T09", "How the MVT ecosystem works", 3, /\b(?:medical value travel|mvt|medical tourism|wellness tourism|heal in india)\b/],
  ["T09", "Accreditation and standards", 2, /\b(?:nabh|accreditation|jci)\b/],
  ["T09", "Designing packages", 3, /\b(?:wellness packages?|retreat packages?|retreats?|wellness program(?:me)?s?|detox packages?|rejuvenation packages?|design(?:ing)? (?:a )?packages?)\b/],
  ["T09", "Handling international patients", 3, /\b(?:international (?:patients|guests|clients)|foreign (?:patients|tourists|guests|clients)|medical visa|ayush visa)\b/],
  ["T09", "Careers in wellness resorts", 3, /\b(?:resorts?|wellness (?:centres?|centers?|retreats?|industry|sector|careers?|jobs?)|spas?|hotels?|cruise)\b/],
  ["T09", null, 1, /\bwellness\b/],

  ["T10", "Government service routes", 3, /\b(?:government (?:jobs?|posts?|service|doctor|hospital)|govt\.? (?:jobs?|posts?|service)|sarkari|psc|upsc|ayush (?:medical )?officer|amo|medical officer|state (?:psc|government)|central government|esic|railways?|armed forces|cghs)\b/],
  ["T10", "National AYUSH Mission delivery", 3, /\b(?:nam|national ayush mission|ayush (?:health and )?wellness cent(?:re|er)s?|hwcs?|ayushman arogya mandir|nhm)\b/],
  ["T10", "Research councils", 3, /\b(?:ccras|research councils?|ccrh|ccrum|ccryn)\b/],
  ["T10", "Public health projects", 3, /\b(?:public health|community health|epidemiolog\w*|mph|national health programmes?|ngos?|health projects?)\b/],
  ["T10", "International organisations", 3, /\b(?:world health organi[sz]ation|united nations|unicef|international organi[sz]ations?|global (?:health )?agenc\w*|world bank)\b/],
  ["T10", "Policy research & advocacy", 3, /\b(?:policy (?:research|analyst|making|makers?)|advocacy|health policy|think tanks?|niti aayog|young professional|ministry of ayush)\b/],
  ["T10", null, 1, /\b(?:government|govt|policy|ministry)\b/],
];

/** merge.js intent subjects → [theme, sub, weight]. */
const SUBJECT_CUES = {
  aiapget: ["T02", "Choosing a PG branch", 3], neetpg: ["T02", "Choosing a PG branch", 3], pg: ["T02", "Choosing a PG branch", 2],
  phd: ["T02", "PhD pathway", 2],
  psc: ["T10", "Government service routes", 3], upsc: ["T10", "Government service routes", 3], medicalofficer: ["T10", "Government service routes", 3], government: ["T10", "Government service routes", 2],
  nam: ["T10", "National AYUSH Mission delivery", 2], ccras: ["T10", "Research councils", 2], whoorg: ["T10", "International organisations", 3], mph: ["T10", "Public health projects", 2],
  clinic: ["T01", "Setting up private practice", 1], hospital: ["T01", "Hospital employment", 1], allopathy: ["T01", "Integrative referrals", 1], prescribe: ["T01", "Integrative referrals", 1], records: ["T01", "Records & clinical quality", 1],
  mvt: ["T09", "How the MVT ecosystem works", 2], resort: ["T09", "Careers in wellness resorts", 1],
  faculty: ["T02", "Faculty recruitment & eligibility", 2], leadership: ["T02", "Academic leadership", 2],
  gmp: ["T05", "GMP and licensing", 2], manufacturing: ["T05", "Production & scale-up", 2], qc: ["T05", "QA / QC and testing", 2], pharmacovigilance: ["T05", "Pharmacovigilance", 2], regulatory: ["T05", "Regulatory affairs", 1],
  incubation: ["T04", "Incubation support", 2], funding: ["T04", "Funding & finance", 1], patent: ["T04", "Team & intellectual property", 2], trademark: ["T04", "Team & intellectual property", 2],
  export: ["T07", "Getting started in export", 2], socialmedia: ["T06", "Digital presence", 2], advertise: ["T06", "Advertising & claims compliance", 2],
  visa: ["T08", "Visa and employment routes", 2], bridging: ["T08", "Bridging qualifications", 2], abroad: ["T08", null, 1],
  thesis: ["T03", "Thesis & publication", 1], publish: ["T03", "Thesis & publication", 1], ethics: ["T03", "Ethics & approvals", 1], ctri: ["T03", "Ethics & approvals", 2],
  trial: ["T03", "Study design", 1], statistic: ["T03", "Biostatistics", 1], samplesize: ["T03", "Biostatistics", 2], grant: ["T03", "Grants & funding", 1],
};

/**
 * Weighted theme / sub-area scores for a question (context counts half).
 * @returns {{ themes: Record<string, number>, subs: Record<string, number>, sig: object }}
 */
export function themeScores(question, context = "") {
  const q = norm(question);
  const c = norm(context);
  const themes = {};
  const subs = {};
  const add = (code, sub, w) => {
    if (sub) subs[`${code}/${sub}`] = (subs[`${code}/${sub}`] || 0) + w;
    themes[code] = (themes[code] || 0) + w;
  };
  for (const [code, sub, w, re] of CUES) {
    if (re.test(q)) add(code, sub, w);
    else if (c && re.test(c)) add(code, sub, w / 2);
  }
  if (/\bWHO\b/.test(String(question || ""))) add("T10", "International organisations", 3);
  let sig = null;
  try {
    sig = intentSignature(analyzeQuestion(String(question || ""), ""));
    const keys = new Set([...sig.strong].map(s => (s.startsWith("country:") ? "abroad" : s.startsWith("branch:") ? "pg" : s)));
    for (const key of keys) {
      const cue = SUBJECT_CUES[key];
      if (cue) add(cue[0], cue[1], cue[2]);
    }
  } catch { sig = null; }
  for (const k of Object.keys(themes)) themes[k] = Math.min(8, Math.round(themes[k] * 10) / 10);
  return { themes, subs, sig };
}

function bestOf(obj, filter = () => true) {
  let best = null;
  let bestScore = 0;
  let second = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!filter(k)) continue;
    if (v > bestScore) { second = bestScore; bestScore = v; best = k; }
    else if (v > second) second = v;
  }
  return { key: best, score: bestScore, second };
}

function bestSubFor(code, subs) {
  const t = themeByCode(code);
  if (!t) return "";
  const b = bestOf(subs, k => k.startsWith(`${code}/`));
  return b.key ? b.key.slice(4) : t.subs[0];
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */

function result(category, subtype, confidence, reason, extra = {}) {
  return {
    category,
    subtype: subtype || "",
    confidence: Math.round(confidence * 100) / 100,
    reason,
    suggestedTheme: "",
    suggestedSubtheme: "",
    urgent: category === "RESTRICTED" && subtype === "SELF_HARM",
    ...extra,
  };
}

/**
 * Rules-only triage.
 * @param {{question:string, context?:string, theme?:string, subtheme?:string}} input  (redacted on the server)
 * @param {{ medical?: {verdict:string, reasons:string[]} }} [opts]  classify.medicalScreen() result
 */
export function rulesTriage(input, opts = {}) {
  const question = String((input && input.question) || "");
  const context = String((input && input.context) || "");
  const theme = String((input && input.theme) || "");
  const subtheme = String((input && input.subtheme) || "");
  const q = norm(question);
  const all = norm(`${question}\n${context}`);
  const lang = detectLanguage(`${question} ${context}`);
  const scores = themeScores(question, context);
  const top = bestOf(scores.themes);
  const careerWords = new Set(all.match(CAREER_WORDS) || []).size;
  const career = Math.min(3, careerWords) + top.score;
  const signals = { career, careerWords, topTheme: top.key || "", topScore: top.score, second: top.second };
  const out = (r) => ({ ...r, lang, signals });

  // 1. Restricted, in precedence order.
  let hit = anyMatch(SELF_HARM, all);
  if (hit) return out(result("RESTRICTED", "SELF_HARM", 0.95, `Self-harm / distress language ("${hit}") — urgent`));
  hit = anyMatch(ABUSIVE, all);
  if (hit) return out(result("RESTRICTED", "ABUSIVE", 0.95, `Abusive or threatening language ("${hit}")`));
  for (const e of EXAM_INTEGRITY) {
    const m = all.match(e.re);
    if (!m) continue;
    if (e.solicit && !SOLICIT.test(all)) continue;
    return out(result("RESTRICTED", "EXAM_INTEGRITY", 0.95, `Asks for help with exam malpractice or false documents ("${m[0]}")`));
  }
  for (const u of UNSAFE) {
    const m = all.match(u.re);
    if (!m) continue;
    if (u.guard && LEGALITY_ASK.test(all) && !EVASION.test(all)) continue;
    return out(result("RESTRICTED", "UNSAFE_ILLEGAL", 0.95, `Asks how to do something unsafe or illegal ("${m[0]}")`));
  }
  for (const re of PERSONAL_DATA) {
    const m = all.match(re);
    if (m && !OFFICIAL.test(m[0])) return out(result("RESTRICTED", "PERSONAL_DATA", 0.92, `Asks for another person's personal data ("${m[0]}")`));
  }
  hit = anyMatch(INJECTION, all);
  if (hit) return out(result("RESTRICTED", "PROMPT_INJECTION", 0.95, `Tries to change the assistant's instructions ("${hit}")`));
  hit = anyMatch(PROMO, all);
  if (hit) return out(result("RESTRICTED", "PROMOTIONAL", 0.92, `Promotion or spam ("${hit}")`));

  const med = opts.medical;
  const medReasons = (med && med.reasons) || [];
  // "Can I use modern medicines in my practice?" / "manufacturing Ayurvedic medicines" — a professional, not a patient, question.
  const professional = medReasons.length > 0 && medReasons.every(r => r === "drug-use" || r === "treat-disease") && PROFESSIONAL_FRAME.test(q);
  if (med && med.verdict === "yes" && !medReasons.every(r => r === "emergency") && !professional) {
    return out(result("RESTRICTED", "MEDICAL", 0.95, `Asks for medical advice (${medReasons.join(", ") || "clinical"})`));
  }
  const risk = medicalRisk(question, context);
  if (risk.medical) return out(result("RESTRICTED", "MEDICAL", risk.strong ? 0.95 : 0.9, `Asks for medical advice (${risk.reasons.join(", ")}: "${risk.match}")`));
  if ((MEDICAL_HINGLISH.test(all) || MEDICAL_HINDI.test(all)) && !(CAREER_FRAME_H.test(q) && !/\b(?:mujhe|meri|mere|maa|mummy|papa|patient)\b|(?:मुझे|मेरी|मेरे|माँ|पापा)/.test(all))) {
    return out(result("RESTRICTED", "MEDICAL", 0.9, "Asks for treatment or medicine advice (Hinglish / Hindi)"));
  }
  if (MEDICAL_PROCEDURE.test(all)) return out(result("RESTRICTED", "MEDICAL", 0.9, "Asks whether to undergo a treatment procedure"));
  if (opts.medical === undefined && LIGHT_MEDICAL.test(all) && !PROFESSIONAL_FRAME.test(q) && !/\b(?:career|scope|clinic|practice|job)\b/.test(q)) {
    return out(result("RESTRICTED", "MEDICAL", 0.8, "Looks like a request for treatment or medicine advice"));
  }
  hit = anyMatch(LEGAL_FIN, all);
  if (hit) return out(result("RESTRICTED", "LEGAL_FINANCIAL", 0.9, `Asks for specific legal or financial advice ("${hit}")`));

  // 2. Off-topic — but genuine skill / coding / app-building asks stay ON_TOPIC.
  if (CHITCHAT.test(q)) return out(result("OFF_TOPIC", "chit-chat", 0.95, "Greeting or test message with no question"));
  if (HOMEWORK_DUMP.test(all)) {
    const hw = anyMatch([HOMEWORK_DUMP], all) || "homework";
    return out(result("OFF_TOPIC", "", 0.9, `Not about an Ayurveda / AYUSH career ("${hw}")`));
  }
  if (SKILL_LEARNING.test(all)) {
    return out(result("ON_TOPIC", "skill-learning", 0.9, "Professional skill / learning question (apps, coding, digital tools)"));
  }
  const off = anyMatch(OFF_TOPIC, all);
  if (off && (career <= 1 || (careerWords === 0 && top.score <= 2))) return out(result("OFF_TOPIC", "", career === 0 ? 0.9 : 0.75, `Not about an Ayurveda / AYUSH career ("${off}")`));

  // 3. Unfocused.
  const sig = scores.sig;
  const strong = sig ? sig.strong.size : 0;
  const meaningful = (() => { try { return analyzeQuestion(question, "").q.size; } catch { return 0; } })();
  const asks = sig ? sig.asks.size + sig.generic.length : 0;
  const general = GENERAL_CAREER.test(q);
  if (!general) {
    const vague = anyMatch(VAGUE, q);
    if (vague && strong === 0 && top.score <= 2) return out(result("UNFOCUSED", "", 0.88, `Too broad to answer well ("${vague}")`));
    if (meaningful <= 2 && asks === 0 && top.score < 3 && (careerWords === 0 || meaningful <= 1)) return out(result("UNFOCUSED", "", 0.86, "Too short to know what is being asked"));
    if (meaningful <= 3 && strong === 0 && top.score < 2 && careerWords === 0) return out(result("UNFOCUSED", "", 0.8, "Very short with no clear subject"));
  }

  // 4. No career signal at all: probably off-topic, but let the LLM decide.
  if (career === 0 && !general) {
    return out(result("OFF_TOPIC", "", off ? 0.85 : 0.55, off ? `Not about an Ayurveda / AYUSH career ("${off}")` : "No Ayurveda / career signal found"));
  }

  // 5. Wrong area.
  const picked = themeByName(theme);
  if (theme === NOT_SURE_THEME || (!picked && theme)) {
    if (top.key && top.score >= 2) {
      return out(result("WRONG_AREA", "not-sure", top.score >= 3 ? 0.85 : 0.7, `Student was not sure; reads as ${themeByCode(top.key).name}`, {
        suggestedTheme: themeByCode(top.key).name, suggestedSubtheme: bestSubFor(top.key, scores.subs),
      }));
    }
    return out(result("ON_TOPIC", "", 0.6, "Career question; theme not chosen"));
  }
  if (picked) {
    const pickedScore = scores.themes[picked.code] || 0;
    const topSub = top.key ? bestOf(scores.subs, k => k.startsWith(`${top.key}/`)).score : 0;
    if (top.key && top.key !== picked.code && top.score >= 3 && topSub >= 2 && pickedScore <= 1 && top.score >= pickedScore + 3) {
      const margin = top.score - Math.max(pickedScore, top.second);
      const t = themeByCode(top.key);
      return out(result("WRONG_AREA", "theme", margin >= 3 ? 0.9 : 0.75, `Filed under ${picked.name}, but reads as ${t.name}`, {
        suggestedTheme: t.name, suggestedSubtheme: bestSubFor(top.key, scores.subs),
      }));
    }
    if (subtheme && picked.subs.includes(subtheme)) {
      const bestSub = bestOf(scores.subs, k => k.startsWith(`${picked.code}/`));
      const pickedSub = scores.subs[`${picked.code}/${subtheme}`] || 0;
      if (bestSub.key && bestSub.key !== `${picked.code}/${subtheme}` && bestSub.score >= 3 && pickedSub === 0) {
        return out(result("WRONG_AREA", "sub-area", 0.6, `Fits the theme, but the sub-area "${bestSub.key.slice(4)}" is closer than "${subtheme}"`, {
          suggestedTheme: picked.name, suggestedSubtheme: bestSub.key.slice(4),
        }));
      }
    }
  }

  const anchored = strong > 0 || top.score >= 2 || general;
  return out(result("ON_TOPIC", "", anchored ? 0.9 : 0.65, anchored ? "Career question that fits the chosen area" : "Career words present but no clear subject"));
}

/** Short student-facing hint for the Ask Desk (rules only; never blocks). */
export function askDeskHint(input, opts = {}) {
  const q = String((input && input.question) || "").trim();
  if (q.length < 12) return null;
  const r = rulesTriage(input, opts);
  const examples = THEME_EXAMPLES[(themeByName(input.theme) || {}).code || "any"] || THEME_EXAMPLES.any;
  if (r.category === "RESTRICTED") {
    if (r.subtype === "SELF_HARM") return { kind: "care", category: r.category, subtype: r.subtype };
    if (r.subtype === "MEDICAL") return { kind: "medical", category: r.category, subtype: r.subtype };
    if (["EXAM_INTEGRITY", "UNSAFE_ILLEGAL", "PERSONAL_DATA", "LEGAL_FINANCIAL"].includes(r.subtype)) return { kind: "scope", category: r.category, subtype: r.subtype };
    return null;
  }
  if (r.category === "OFF_TOPIC" && r.confidence >= 0.75) return { kind: "off-topic", category: r.category, example: examples[0] };
  if (r.category === "UNFOCUSED") return { kind: "unfocused", category: r.category, example: examples[0] };
  if (r.category === "WRONG_AREA" && r.suggestedTheme && r.confidence >= 0.75) {
    return { kind: "wrong-area", category: r.category, theme: r.suggestedTheme, subtheme: r.suggestedSubtheme, code: (themeByName(r.suggestedTheme) || {}).code || "" };
  }
  return null;
}
