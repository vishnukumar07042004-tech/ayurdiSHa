/**
 * AYURDISHA question merge — pure, deterministic, shared by the browser (Curation desk)
 * and the server (manual merge / integrity checks). No I/O, no randomness unless the
 * caller relies on the default id factory.
 *
 * Score between two questions (same theme — and same sub-area when staff keep them apart):
 *   0.55 × weighted Jaccard + 0.35 × plain Jaccard + 0.10 × word-bigram Jaccard
 * over normalised question + context tokens. Rare terms (≤ 2 questions in the group) weigh
 * 1.5×; words that only appear in the optional context weigh 0.5×. Identical normalised
 * questions always score 1. The score is damped when the two ask for different things
 * (FACETS: licence vs cost, books vs cut-off, USA vs UK). Greetings, self-introductions and
 * sign-offs are ignored. Each group's mentor question is its most central, best-worded member.
 * Vocabulary (phrases, synonyms) = the Oct 2026 engine plus the candidate engine's domain terms, minus
 * the few that misfired; see docs/merge/ENGINE-COMPARISON.md.
 */

export const MERGE_DEFAULTS = Object.freeze({
  threshold: 0.48,
  maxPack: 7,
  /** Every pair inside an automatic group scores at least threshold × pairFloor (complete linkage). */
  pairFloor: 0.75,
  /** Lowest score a staff "Suggested merge" may have. */
  suggestFloor: 0.3,
});

/** Statuses after which a group's membership is frozen on re-merge. */
export const LOCKED_STATUSES = Object.freeze(["Sent to mentor", "Answered", "Published"]);
export const CLUSTER_STATUSES = Object.freeze(["New", "Composed", "Sent to mentor", "Answered", "Published"]);

const FUNCTION_WORDS = "a an the and or but if of to in on at by for with from into onto about as is am are was were be been being do does did doing done have has had having i me my mine we us our you your yours he she it its they them their this that these those there here what which where when why how who whom whose can could should would will shall may might must not no nor so too very just also than then such only same other another each both few more most much many some any all own per via out off up down over under again once dont im ive id".split(/\s+/);

const DOMAIN_WORDS = "ayurveda ayurvedic ayush bams student students career mentor mentors please kindly sir madam mam maam ji hello hi namaste thanks thank regards dear respected want need know tell get got best better good after before scope future option options tips tip guide guidance advice advise help suggest suggestion suggestions way ways field become becoming like also really actually possible proper right etc small big little final year years doctor doctors graduate graduates complete completing completed completion morning detail answer reply".split(/\s+/);

/** Romanised Hindi function words that carry no topic. */
const HINGLISH_WORDS = "kya kaise kaisa kaisi kab kahan kaha kyu kyun kyon kaun konsa konsi kaunsa kaunsi kaunse kitna kitni kitne kis hai hain ho hoga hogi honge tha thi the karna karne karu karun karein kare karo kar raha rahi rahe ke ki ka ko se me mein main mai mujhe mera meri mere hum ham humko aap ap apna apni aur ya bhi toh liye lie baad pehle chahiye chahie sakta sakti sakte wala wali wale ek koi kuch sab batao bataye bataiye btao plz pls hota hoti hote jata jati jaye jaana jana milega milegi milta milti lena leni lene par aayega aayegi accha acha".split(/\s+/);

const DEVANAGARI_WORDS = "क्या कैसे कैसा कब कहाँ कहां क्यों कौन है हैं हो होगा था थी के की का को से में मैं मुझे मेरा मेरी हम आप और या भी तो लिए बाद पहले चाहिए सकता सकती सकते वाला वाली एक कोई कुछ करना करने करें कर बताइए बताएं आयुर्वेद छात्र".split(/\s+/);

export const STOPWORDS = new Set([...FUNCTION_WORDS, ...DOMAIN_WORDS, ...HINGLISH_WORDS, ...DEVANAGARI_WORDS]);

/** Words that survive the stopword pass when a question has nothing else (e.g. "What after BAMS?"). */
const FALLBACK_STOP = new Set([...FUNCTION_WORDS, ...HINGLISH_WORDS, ...DEVANAGARI_WORDS,
  ..."please kindly sir madam mam maam ji hello hi namaste thanks thank regards dear respected best better good tips tip guide guidance advice advise help suggest want need know tell get got really actually proper right etc final year years complete completing completed completion".split(" ")]);

/** In the fallback pass, Hindi forms of "after BAMS" line up with the English ones. */
const FALLBACK_FOLD = new Map(Object.entries({ baad: "after", "बाद": "after", "बीएएमएस": "bams", "करियर": "career" }));

/**
 * Greetings, self-introductions and sign-offs say nothing about the topic but add shared words
 * ("final year student") that pull unrelated questions together.
 */
const LEAD_GREETING = /^\s*(?:(?:respected|dear|hello|hii*|hey|namaste|namaskar(?:am)?|pranaa?ms?|greetings|good\s+(?:morning|afternoon|evening|day)|sir(?:\s*\/\s*(?:madam|ma'?am))?|ma'?am|madam|mam|mentors?|ji)\b(?:\s+(?:doctors?|team|everyone|all|mentors?|sir|ma'?am|madam|ji|guys|ayurdisha(?:\s+(?:team|mentors?))?))*[\s,.!:;/-]*)+/i;
const LEAD_INTRO = /^\s*(?:i\s*(?:am|'m)|myself|this\s+is)\s+(?:an?\s+)?[a-z0-9.,'\- ]{0,40}?\b(?:student|intern|internee|graduate|aspirant|batch)s?\b(?:\s+(?:from|at|of|in)\s+[^.?!,]{1,40})?\s*[.,!;:]+\s*/i;
/** "My name is Aditya and I am in 2nd prof." / "This is Sneha from Pune." / "Myself Dr. Kiran." */
const LEAD_NAME = /^\s*(?:my\s+name\s+is\s+[^.?!]{1,60}[.!]|(?:this\s+is|myself|i\s*(?:am|'m))\s+(?:dr\.?\s+)?[a-z]+(?:\s+[a-z]+)?(?:\s+from\s+[^.?!,]{1,40})?\s*[.!])\s*/i;
const TRAIL_SIGNOFF = /[\s,.;:(-]*(?:(?:please|pls|plz|kindly)\s+(?:guide|help|suggest|advise|advice|reply|answer|tell)(?:\s+(?:me|us))?(?:\s+(?:in\s+detail|out|asap))?(?:\s+(?:sir|ma'?am|ji))?|thank\s*(?:you|u)(?:\s+(?:sir|ma'?am|so\s+much))?|thanks(?:\s+(?:a\s+lot|in\s+advance))?|regards|tq|waiting\s+(?:eagerly|for\s+(?:your\s+)?reply)|\(?(?:urgent|please\s+answer)\)?)[\s.!?)\u{1F300}-\u{1FAFF}\u2600-\u27BF]*$/iu;

export function stripBoilerplate(text) {
  let s = String(text || "");
  for (let k = 0; k < 3; k++) {
    const next = s.replace(LEAD_GREETING, "").replace(LEAD_INTRO, "").replace(LEAD_NAME, "").replace(TRAIL_SIGNOFF, "");
    if (next === s) break;
    if (!/[a-z\u0900-\u097f]{3}/i.test(next)) break;
    s = next;
  }
  return s.trim();
}

/** Multi-word and punctuated forms → one canonical token. Applied before punctuation is stripped. */
const PHRASES = [
  // Before the M.S. rule, or "B.A.M.S." reads as an MS (= PG) degree.
  [/\bb\.\s?a\.\s?m\.\s?s\b\.?/g, " bams "],
  [/\bm\.\s?d\.?(?=[\s,?!]|$)/g, " md "],
  [/\bm\.\s?s\.?(?=[\s,?!]|$)/g, " ms "],
  [/\bph\.?\s?d\.?(?=[\s,?!]|$)/g, " phd "],
  [/\br\s?&\s?d\b/g, " rnd "],
  [/\bqa\s?\/\s?qc\b/g, " qa qc "],
  [/\bpost[\s-]*grad(?:uat\w*|\b)/g, " pg "],
  // NEET-PG is the modern-medicine PG exam, a different ask from AIAPGET.
  [/\bneet[\s-]*pg\b/g, " neetpg "],
  [/\b(?:all\s+india\s+)?ai[\s-]*apget\b|\bapget\b|\ball\s+india\s+ayush\s+(?:pg|post\s*graduate)\s+(?:entrance\s+)?test\b/g, " aiapget pg exam "],
  [/\bpanch[\s-]*a?[\s-]*karm\w*/g, " panchakarma "],
  [/\bmedical\s+value\s+travel\b|\bmedical\s+tourism\b|\bwellness\s+tourism\b/g, " mvt "],
  [/\bmedical\s+officers?\b/g, " medicalofficer "],
  [/\bstart[\s-]*ups?\b/g, " startup "],
  [/\bgood\s+manufacturing\s+practi[cs]es?\b/g, " gmp "],
  [/\bpublic\s+service\s+commission\b/g, " psc "],
  [/\bout\s*side\s+(?:of\s+)?india\b|\bover\s*seas\b/g, " abroad "],
  [/\bunited\s+states\b|\bu\.s\.a\.?|\bu\.s\.(?=\s|$)/g, " usa "],
  [/\bunited\s+kingdom\b|\bu\.k\.?(?=[\s,?!]|$)/g, " uk "],
  [/\bnational\s+ayush\s+mission\b/g, " nam "],
  [/\bset(?:ting)?[\s-]*up\b/g, " start "],
  [/\bstudy\s+materials?\b/g, " book "],
  // Multi-word asks students phrase many ways.
  [/\bcut[\s-]?offs?\b/g, " cutoff "],
  [/\bassistant\s+professors?\b/g, " faculty "],
  [/\bteaching\s+jobs?\b/g, " faculty job "],
  [/\bmodern\s+medicines?\b|\benglish\s+medicines?\b|\bcross[\s-]*pathy\b/g, " allopathy "],
  [/\bcivil\s+services?\b/g, " upsc "],
  [/\bother\s+countr(?:y|ies)\b|\bforeign\s+countr(?:y|ies)\b/g, " abroad "],
  [/\bthe\s+us\b/g, " usa "],
  [/\bsocial\s+media\b|\bdigital\s+marketing\b|\bonline\s+presence\b/g, " socialmedia "],
  [/\bcase\s+(?:reports?|stud(?:y|ies)|series)\b/g, " casereport "],
  [/\bmaster\s+of\s+public\s+health\b/g, " mph "],
  [/\bethics?\s+committee\b/g, " ethics "],
  [/\brandomi[sz]ed\s+controlled\s+trials?\b/g, " trial "],
  [/\bsample\s+size\b/g, " samplesize "],
  [/\bquality\s+(?:control|assurance)\b/g, " qc "],
  [/\bdrug\s+safety\b/g, " pharmacovigilance "],
  [/\bduty\s+(?:doctors?|medical\s+officers?)\b|\bresident\s+medical\s+officers?\b|\bmedicalofficer\b/g, " medicalofficer "],
  [/\bnew\s+zealand\b/g, " newzealand "],
  [/\bclinical\s+trials?\s+registry(?:\s+of\s+india)?\b/g, " ctri "],
];

/** Case-sensitive forms read before lower-casing ("WHO" the agency, not the pronoun). */
const CASED_PHRASES = [
  [/\bW\.?H\.?O\b(?![a-z])/g, " whoorg "],
  [/\bworld\s+health\s+organi[sz]ation\b/gi, " whoorg "],
];

/** Single-word variants → canonical token (checked before stemming). */
const SYNONYMS = new Map(Object.entries({
  md: "pg", ms: "pg", mdms: "pg", pg: "pg", postgraduation: "pg", postgraduate: "pg", masters: "pg",
  phd: "phd", doctorate: "phd",
  carrier: "career", carrer: "career", carreer: "career", careers: "career",
  licence: "licence", license: "licence", licences: "licence", licenses: "licence", licensing: "licence", licenced: "licence", licensed: "licence",
  practise: "practice", practising: "practice", practicing: "practice", practices: "practice", practice: "practice",
  clinic: "clinic", clinics: "clinic", dispensary: "clinic",
  job: "job", jobs: "job", naukri: "job", vacancy: "job", vacancies: "job", employment: "job",
  salary: "income", salaries: "income", income: "income", earning: "income", earnings: "income", earn: "income", stipend: "income",
  fee: "fee", fees: "fee",
  exam: "exam", exams: "exam", entrance: "exam", examination: "exam",
  prepare: "prepare", preparation: "prepare", preparing: "prepare", prep: "prepare", preperation: "prepare", prepration: "prepare", prepared: "prepare",
  thesis: "thesis", dissertation: "thesis",
  publish: "publish", publishing: "publish", publication: "publish", publications: "publish", paper: "publish", papers: "publish",
  govt: "government", gov: "government", sarkari: "government", government: "government",
  abroad: "abroad", foreign: "abroad", overseas: "abroad", internationally: "abroad",
  usa: "usa", america: "usa", uk: "uk", england: "uk", britain: "uk",
  faculty: "faculty", teacher: "faculty", lecturer: "faculty", professor: "faculty", teachers: "faculty", lecturers: "faculty",
  hospital: "hospital", hospitals: "hospital",
  research: "research", researcher: "research", researchers: "research", researching: "research",
  herb: "herb", herbs: "herb", herbal: "herb",
  medicine: "medicine", medicines: "medicine",
  startup: "startup", startups: "startup",
  internship: "internship", internships: "internship", intern: "internship",
  registration: "registration", register: "registration", registered: "registration", registering: "registration",
  open: "start", opening: "start", setup: "start", establish: "start", launch: "start", begin: "start", starting: "start", started: "start",
  centre: "centre", center: "centre", centres: "centre", centers: "centre",
  specialty: "specialty", speciality: "specialty", specialties: "specialty", specialities: "specialty",
  specialization: "specialty", specialisation: "specialty", specializ: "specialty", specialis: "specialty",
  necessary: "necessary", compulsory: "necessary", mandatory: "necessary", essential: "necessary", zaroori: "necessary", jaruri: "necessary", zaruri: "necessary",
  textbook: "book", textbooks: "book", books: "book",
  pay: "income", money: "cost", recogni: "recognition", recognis: "recognition", validity: "recognition",
  allopathy: "allopathy", allopathic: "allopathy", allopath: "allopathy", allopaths: "allopathy",
  prescribe: "prescribe", prescribing: "prescribe", prescription: "prescribe", prescriptions: "prescribe", prescribed: "prescribe",
  hire: "job", hires: "job", hiring: "job", recruit: "job", recruitment: "job", recruited: "job",
  professors: "faculty",
  upsc: "upsc", ias: "upsc", ips: "upsc",
  amo: "medicalofficer", mo: "medicalofficer",
  coaching: "coaching", coachings: "coaching", tuition: "coaching", classes: "coaching",
  resort: "resort", resorts: "resort", retreat: "resort", retreats: "resort",
  patient: "patient", patients: "patient", footfall: "patient",
  fellowship: "fellowship", fellowships: "fellowship", scholarship: "fellowship", scholarships: "fellowship",
  recognise: "recognition", recognised: "recognition", recognize: "recognition", recognized: "recognition", recognition: "recognition", accepted: "recognition", valid: "recognition",
  surgery: "surgery", surgeries: "surgery", surgical: "surgery", surgeon: "surgery",
  cost: "cost", costs: "cost", budget: "cost", investment: "cost", invest: "cost", capital: "cost", expense: "cost", expenses: "cost", kharcha: "cost",
  legal: "legal", legally: "legal", law: "legal", laws: "legal", illegal: "legal",
  eligible: "eligibility", eligibility: "eligibility", qualification: "eligibility", qualifications: "eligibility",
  drug: "medicine", drugs: "medicine", dawai: "medicine", dawa: "medicine",
  pharma: "pharma", pharmaceutical: "pharma",
  rct: "trial", rcts: "trial", trial: "trial", trials: "trial",
  statistics: "statistic", biostatistics: "statistic", statistical: "statistic", stats: "statistic",
  instagram: "socialmedia", reels: "socialmedia", facebook: "socialmedia", youtube: "socialmedia",
  advertise: "advertise", advertising: "advertise", advertisement: "advertise", advertisements: "advertise", ads: "advertise",
  incubator: "incubation", incubators: "incubation", incubation: "incubation",
  // A research grant, a startup investor, a patent and a trademark each need a different answer.
  funding: "funding", fund: "funding", funds: "funding", investor: "funding", investors: "funding",
  grant: "grant", grants: "grant",
  patent: "patent", patents: "patent", patented: "patent", patentable: "patent",
  trademark: "trademark", trademarks: "trademark",
  certificate: "certificate", certificates: "certificate", certification: "certificate", certifications: "certificate", certified: "certificate",
  course: "course", courses: "course", training: "course", trainings: "course",
  ethics: "ethics", ethical: "ethics", iec: "ethics",
  dubai: "gulf", uae: "gulf", gulf: "gulf", dha: "gulf", doh: "gulf", oman: "gulf", qatar: "gulf", saudi: "gulf",
  european: "europe", europe: "europe", eu: "europe", german: "germany", swiss: "switzerland",
  canadian: "canada", australian: "australia",
  visa: "visa", visas: "visa", permit: "visa",
  // Romanised Hindi and Devanagari forms of the same ideas.
  videsh: "abroad", taiyari: "prepare", tayari: "prepare", shodh: "research",
  kholna: "start", kholne: "start", kholu: "start", kholun: "start", shuru: "start",
  "पीजी": "pg", "एमडी": "pg", "नौकरी": "job", "सरकारी": "government", "विदेश": "abroad",
  "क्लिनिक": "clinic", "रिसर्च": "research", "शोध": "research", "पंचकर्म": "panchakarma", "तैयारी": "prepare",
  "परीक्षा": "exam", "अस्पताल": "hospital", "लाइसेंस": "licence",
}));

/** Short tokens that are meaningful in this domain (everything else needs ≥ 3 letters). */
const SHORT_KEEP = new Set(["pg", "uk", "qa", "qc", "ip", "mo", "eu"]);

export function normalizeText(text) {
  let raw = String(text || "");
  // An all-caps question shouts every word; only read "WHO" as the agency in mixed case.
  if (/[a-z]/.test(raw)) CASED_PHRASES.forEach(([re, rep]) => { raw = raw.replace(re, rep); });
  let s = raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase();
  PHRASES.forEach(([re, rep]) => { s = s.replace(re, rep); });
  return s.replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Conservative suffix stripping so preparing / prepared / preparation / prepare line up. */
export function stemWord(w) {
  if (/[\u0900-\u097f]/.test(w) || w.length <= 4) return w;
  let s = w;
  if (s.endsWith("ies") && s.length > 5) s = s.slice(0, -3) + "y";
  else if (s.endsWith("ations") && s.length > 8) s = s.slice(0, -6);
  else if (s.endsWith("ation") && s.length > 7) s = s.slice(0, -5);
  else if (s.endsWith("tions") && s.length > 7) s = s.slice(0, -5);
  else if (s.endsWith("tion") && s.length > 6) s = s.slice(0, -4);
  else if (s.endsWith("ments") && s.length > 7) s = s.slice(0, -5);
  else if (s.endsWith("ment") && s.length > 6) s = s.slice(0, -4);
  else if (s.endsWith("ings") && s.length > 6) s = s.slice(0, -4);
  else if (s.endsWith("ing") && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith("ed") && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith("s") && s.length > 4 && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("e") && s.length > 4) s = s.slice(0, -1);
  return s;
}

function canonicalWord(raw) {
  if (SYNONYMS.has(raw)) return SYNONYMS.get(raw);
  const stem = stemWord(raw);
  return SYNONYMS.get(stem) || stem;
}

function keepToken(t) {
  if (!t || STOPWORDS.has(t)) return false;
  if (/^\d+$/.test(t)) return t.length >= 3;
  return t.length >= 3 || SHORT_KEEP.has(t);
}

function wordsToTokens(words, stop, fold) {
  const out = [];
  words.forEach(w => {
    const raw = (fold && fold.get(w)) || w;
    if (!raw) return;
    if (stop.has(raw)) return;
    const t = canonicalWord(raw);
    if (stop === STOPWORDS ? keepToken(t) : (t.length >= 2 && !stop.has(t))) out.push({ t, raw: w });
  });
  return out;
}

function splitWords(text) {
  return normalizeText(stripBoilerplate(text)).split(" ").filter(Boolean);
}

/**
 * Tokenise one submission. Returns ordered tokens (for bigrams), the token set, the subset
 * that came from the question itself, and a display word for each token. `fold` maps
 * misspelt raw words onto the spelling used elsewhere in the group.
 */
export function analyzeQuestion(question, context, fold) {
  const qWords = splitWords(question);
  const cWords = splitWords(context);
  let qTok = wordsToTokens(qWords, STOPWORDS, fold);
  const cTok = wordsToTokens(cWords, STOPWORDS, fold);
  let fallback = false;
  if (!qTok.length) {
    qTok = wordsToTokens(qWords.map(w => FALLBACK_FOLD.get(w) || w), FALLBACK_STOP, fold);
    fallback = qTok.length > 0;
  }
  const all = [...qTok, ...cTok];
  const surface = new Map();
  all.forEach(({ t, raw }) => { if (!surface.has(t)) surface.set(t, raw); });
  const facets = new Set();
  qTok.forEach(({ t }) => { if (FACETS.has(t)) facets.add(FACETS.get(t)); });
  return {
    seq: all.map(x => x.t),
    qSeq: qTok.map(x => x.t),
    set: new Set(all.map(x => x.t)),
    q: new Set(qTok.map(x => x.t)),
    facets,
    surface,
    norm: qWords.join(" "),
    askText: fold ? qWords.map(w => fold.get(w) || w).join(" ") : qWords.join(" "),
    fallback,
  };
}

/** Back-compat helper: token set for question + context. */
export function tokens(text, context) {
  return analyzeQuestion(text, context).set;
}

function editDistanceAtMostOne(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Typo folding inside one theme group: raw words of ≥ 7 letters with the same first letter and
 * one edit apart ("traning" / "training", "duraton" / "duration") collapse onto the more
 * frequent spelling (ties → alphabetical). Deterministic.
 */
export function typoFoldMap(subs) {
  const df = new Map();
  (subs || []).forEach(s => {
    new Set([...splitWords(s.question), ...splitWords(s.context)]).forEach(w => df.set(w, (df.get(w) || 0) + 1));
  });
  const long = [...df.keys()].filter(t => t.length >= 7 && /^[a-z]+$/.test(t) && !STOPWORDS.has(t))
    .sort((x, y) => (df.get(y) - df.get(x)) || x.localeCompare(y));
  const fold = new Map();
  for (let i = 0; i < long.length; i++) {
    const canon = long[i];
    if (fold.has(canon)) continue;
    for (let j = i + 1; j < long.length; j++) {
      const t = long[j];
      if (fold.has(t) || t[0] !== canon[0]) continue;
      if (editDistanceAtMostOne(canon, t)) fold.set(t, canon);
    }
  }
  df.forEach((n, w) => {
    if (n > 2 || fold.has(w) || w.length < 5 || !/^[a-z]+$/.test(w) || STOPWORDS.has(w) || VOCAB.has(w) || TYPO_PROTECT.has(w)) return;
    const hit = (VOCAB_BY_LETTER.get(w[0]) || []).find(v => Math.abs(v.length - w.length) <= 1 && editDistanceAtMostOne(v, w));
    if (hit) fold.set(w, hit);
  });
  return fold;
}

/**
 * Known spellings a short typo ("patetn", "aiaget", "sohuld") can snap onto even when the
 * correct form is not in the group. Real words one edit from a known term are protected.
 */
const VOCAB_EXTRA = "aiapget panchakarma patent formulation admission strategy outside recognised recognized curriculum syllabus kayachikitsa allopathy allopathic hospital private practice entrance preparation internship medicine registration government options doctors business export product products company pharmacovigilance regulatory therapist therapists centre center research thesis journal journals publish country countries salary college colleges branch career future should student students";
const TYPO_PROTECT = new Set("patient patients parent parents trail expert experts lecture lectures carer coarse source stage stages state states series sales scale".split(" "));
const VOCAB = new Set([...SYNONYMS.keys(), ...SYNONYMS.values(), ...STOPWORDS, ...VOCAB_EXTRA.split(" ")]
  .filter(w => w.length >= 6 && /^[a-z]+$/.test(w)));
const VOCAB_BY_LETTER = new Map();
[...VOCAB].sort().forEach(v => {
  if (!VOCAB_BY_LETTER.has(v[0])) VOCAB_BY_LETTER.set(v[0], []);
  VOCAB_BY_LETTER.get(v[0]).push(v);
});

function setJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  a.forEach(x => { if (b.has(x)) hit++; });
  return hit / (a.size + b.size - hit);
}

function wordBigrams(seq) {
  const out = new Set();
  for (let i = 0; i < seq.length - 1; i++) {
    if (seq[i] !== seq[i + 1]) out.add(`${seq[i]} ${seq[i + 1]}`);
  }
  return out;
}

/**
 * "What exactly is being asked" markers. Two questions on the same topic that ask for different
 * things (licence vs cost, books vs cut-off, USA vs UK) need different mentor answers.
 */
const FACETS = new Map(Object.entries({
  book: "resources", coaching: "resources",
  cost: "cost", fee: "cost",
  income: "income",
  licence: "legal", registration: "legal", legal: "legal",
  cutoff: "cutoff", cut: "cutoff", rank: "cutoff", score: "cutoff",
  patient: "patients",
  eligibility: "eligibility", eligibl: "eligibility", qualific: "eligibility", qualification: "eligibility",
  therapist: "staff", staff: "staff",
  location: "location", city: "location", village: "location", rural: "location", urban: "location",
  usa: "country:usa", uk: "country:uk", europe: "country:europe", germany: "country:germany", switzerland: "country:switzerland",
  gulf: "country:gulf", dubai: "country:gulf", uae: "country:gulf", canada: "country:canada", australia: "country:australia",
}));
/** Both name a specific ask and they differ → strong damp; only one names one → mild damp. */
const FACET_CLASH = 0.6;
const FACET_ONE_SIDED = 0.85;

function facetFactor(a, b) {
  const fa = a.facets;
  const fb = b.facets;
  if (!fa || !fb || (!fa.size && !fb.size)) return 1;
  if (!fa.size || !fb.size) return FACET_ONE_SIDED;
  for (const f of fa) if (fb.has(f)) return 1;
  return FACET_CLASH;
}

/**
 * Similarity of two analysed questions in [0, 1]. `df` = how many questions in the group use
 * each token (rare-term weighting). Without `df` every term weighs 1.
 */
export function questionSimilarity(a, b, df) {
  if (a.norm && a.norm === b.norm) return 1;
  const jac = setJaccard(a.set, b.set);
  if (!jac) return 0;
  const bgJac = setJaccard(a._bg || wordBigrams(a.seq), b._bg || wordBigrams(b.seq));
  let hit = 0;
  let union = 0;
  const seen = new Set();
  const visit = t => {
    if (seen.has(t)) return;
    seen.add(t);
    const rare = df ? (df.get(t) || 1) <= 2 : false;
    const inQuestion = a.q.has(t) || b.q.has(t);
    const w = (rare ? 1.5 : 1) * (inQuestion ? 1 : 0.5);
    union += w;
    if (a.set.has(t) && b.set.has(t)) hit += w;
  };
  a.set.forEach(visit);
  b.set.forEach(visit);
  const wJac = union ? hit / union : 0;
  return (0.55 * wJac + 0.35 * jac + 0.10 * bgJac) * facetFactor(a, b);
}

/**
 * Score two raw submissions in isolation (tests and the staff "why" hint). Question text only:
 * the optional context never decides whether two students asked the same thing.
 */
export function scorePair(s1, s2) {
  const fold = typoFoldMap([s1, s2]);
  return questionSimilarity(analyzeQuestion(s1.question, "", fold), analyzeQuestion(s2.question, "", fold));
}

/* ------------------------------------------------------------------ */
/* Intent signature = SUBJECT anchors + ASK type                       */
/* ------------------------------------------------------------------ */

/**
 * What a mentor answer is about. Two questions that differ in a strong subject (PG vs PhD, clinic
 * vs hospital, UK vs Germany, Shalya vs Kayachikitsa, incubator vs funding) need different
 * answers. Weak subjects are details one answer can still cover (journal, course, college).
 */
const STRONG_SUBJECTS = {
  pg: "pg", aiapget: "aiapget", neetpg: "neetpg", phd: "phd", diploma: "diploma", internship: "internship",
  "branch:kayachikitsa": "kayachikitsa kaya kayachikitsha", "branch:shalya": "shalya sahlya", "branch:shalakya": "shalakya",
  "branch:prasuti": "prasuti prasooti striroga obg gynaecology gynecology obstetrics",
  "branch:kaumarbhritya": "kaumarbhritya kaumarabhritya balroga pediatrics paediatrics", "branch:dravyaguna": "dravyaguna",
  "branch:rasashastra": "rasashastra", "branch:swasthavritta": "swasthavritta swasthvritta", "branch:agadtantra": "agadtantra agad toxicology",
  "branch:roganidana": "rognidan roganidana rognidana", "branch:samhita": "samhita siddhanta",
  "branch:sharira": "rachana kriya sharir sharira anatomy physiology", "branch:manasroga": "manasroga psychiatry",
  "specialty:skin": "skin dermatology derma cosmetology", "specialty:infertility": "infertility ivf",
  "specialty:ortho": "ortho orthopaedic orthopedic arthritis",
  panchakarma: "panchakarma", clinic: "clinic", hospital: "hospital", government: "government", psc: "psc", upsc: "upsc",
  medicalofficer: "medicalofficer rmo rmos cmo amo", nam: "nam", ccras: "ccras", whoorg: "whoorg", mph: "mph",
  faculty: "faculty", leadership: "principal dean hod", research: "research", thesis: "thesis", publish: "publish",
  ethics: "ethics", ctri: "ctri", trial: "trial", statistic: "statistic spss", samplesize: "samplesize", grant: "grant",
  funding: "funding", incubation: "incubation", patent: "patent", trademark: "trademark", socialmedia: "socialmedia",
  advertise: "advertise", export: "export exporting exporter", gmp: "gmp", manufacturing: "manufacturing manufacture manufacturer factory",
  qc: "qc qa", pharmacovigilance: "pharmacovigilance", regulatory: "regulatory", allopathy: "allopathy", prescribe: "prescribe",
  insurance: "insurance tpa", mvt: "mvt", resort: "resort", nabh: "nabh accreditation", visa: "visa", bridging: "bridging bridge",
  therapist: "therapist masseur", staff: "staff receptionist compounder", patient: "patient", records: "emr records record software",
  camp: "camp", yoga: "yoga", abroad: "abroad",
  "country:usa": "usa", "country:uk": "uk", "country:gulf": "gulf", "country:europe": "europe", "country:germany": "germany",
  "country:switzerland": "switzerland", "country:canada": "canada", "country:australia": "australia", "country:newzealand": "newzealand",
  "country:russia": "russia", "country:japan": "japan", "country:malaysia": "malaysia", "country:singapore": "singapore",
  "country:mauritius": "mauritius", "country:israel": "israel", "country:nepal": "nepal", "country:srilanka": "srilanka",
  "country:maldives": "maldives",
};
const WEAK_SUBJECTS = {
  journal: "journal", casereport: "casereport", course: "course", certificate: "certificate", college: "college",
  centre: "centre", practice: "practice", exam: "exam", branch: "branch", product: "product", formulation: "formulation",
  medicine: "medicine", herb: "herb", business: "business", brand: "brand", startup: "startup", pharma: "pharma",
  university: "university", online: "online",
};
const EXAMS = new Set(["aiapget", "neetpg", "psc", "upsc"]);
const MODIFIER_SUBJECTS = new Set(["research", "government"]);
const SUBJECT_LABEL = new Map(Object.entries({
  pg: "PG / MD", aiapget: "AIAPGET", neetpg: "NEET-PG", phd: "PhD", psc: "PSC", upsc: "UPSC", nam: "NAM", ccras: "CCRAS",
  whoorg: "WHO", mph: "MPH", medicalofficer: "medical officer", faculty: "teaching", leadership: "college leadership",
  samplesize: "sample size", ctri: "CTRI", gmp: "GMP", qc: "QA / QC", socialmedia: "social media", mvt: "medical value travel",
  nabh: "NABH", emr: "records", casereport: "case report", records: "records",
}));

function subjectMap(table) {
  const m = new Map();
  Object.entries(table).forEach(([id, words]) => words.split(" ").forEach(w => m.set(canonicalWord(w), id)));
  return m;
}
const STRONG_BY_TOKEN = subjectMap(STRONG_SUBJECTS);
const WEAK_BY_TOKEN = subjectMap(WEAK_SUBJECTS);

function subjectLabel(id) {
  if (SUBJECT_LABEL.has(id)) return SUBJECT_LABEL.get(id);
  const bare = id.includes(":") ? id.split(":")[1] : id;
  if (id.startsWith("country:")) return DISPLAY.get(bare) || bare.charAt(0).toUpperCase() + bare.slice(1);
  if (id.startsWith("branch:")) return bare.charAt(0).toUpperCase() + bare.slice(1);
  return bare;
}

/**
 * What exactly is being asked. Specific asks change the answer (the cost of a clinic is not its
 * licence); two questions that both name a specific ask must share one. Generic asks (how-to,
 * which one, scope, is it possible) are compatible with each other.
 */
const SPECIFIC_ASKS = [
  ["cost", /\b(?:cost|costs|fee|fees|budget|investment|invest|kharcha|kharch|expense|expenses|paisa|lakh|lakhs|money|afford|affordable|price|pricing|cheap|expensive)\b/],
  ["income", /\b(?:salary|salaries|income|incomes|earn|earns|earning|earnings|kamai|kamate|stipend|stipends|pay|pays|paid|payscale|profit|profitable|profits|lucrative|ctc|per month|monthly)\b/],
  ["resources", /\b(?:book|books|textbook|textbooks|reference|references|material|materials|test series|mcq|mcqs|notes|coaching|resource|resources)\b/],
  ["syllabus", /\b(?:syllabus|syllabi|exam pattern|paper pattern|marking scheme|negative marking)\b/],
  ["cutoff", /\b(?:cutoff|rank|ranks|ranking|marks|score|scores|percentile|merit)\b/],
  ["eligibility", /\b(?:eligib\w*|qualification\w*|criteria|age limit|open to|who can|how many attempts|attempts? (?:allowed|limit)|number of attempts|attempt limit)\b/],
  ["necessity", /\b(?:compulsory|mandatory|necessary|necessity|zaroori|jaruri|zaruri|essential|must)\b|\bis (?:it |an? |the )?\w+(?: \w+)? (?:required|needed)\b|\bdo (?:i|we) (?:need|have to)\b/],
  ["legal", /\b(?:licen[cs]e\w*|registration|register\w*|legal\w*|illegal|law|laws|allowed|allow|permission\w*|permit\w*|rules?|regulation\w*|claims?|prescribe\w*|prescription\w*|recogni[sz]\w*|valid|validity|authori[sz]ed)\b/],
  ["timeline", /\b(?:when|kab|how long|duration|right time|timeline|how many (?:months|years|weeks)|\d+ (?:months|years)|from which year)\b/],
  ["location", /\b(?:city|cities|village|villages|gaon|rural|urban|hometown|location|metro|tier \d|town|locality|residential)\b/],
  ["switch", /\b(?:change|changing|switch|switching|transfer|migrate|shift|badal\w*)\b/],
  ["compare", /\b(?:better|vs|versus|compare\w*|comparison|difference|differences|prefer|instead|rather|between)\b|\b\w+ (?:or|ya) \w+/],
];
const GENERIC_ASKS = [
  ["how-to", /\b(?:how|kaise|kaisa|steps?|process|procedure|strategy|plan|planning|tips?|ways?|approach|method|begin)\b/],
  ["which one", /\b(?:which|kaunsa|kaunsi|konsa|konsi|kaun|best|choose|choosing|select|pick|top)\b/],
  ["scope", /\b(?:scope|future|demand|opportunit\w*|worth|prospects?|growth|career)\b/],
  ["is it possible", /\b(?:can|could|possible|sakte|sakta|sakti)\b/],
];
const ASK_LABEL = new Map(Object.entries({
  cost: "cost / fees", income: "salary / income", resources: "books / resources", syllabus: "syllabus / pattern", cutoff: "cut-off / rank",
  eligibility: "eligibility", necessity: "is it required", legal: "licence / legal", timeline: "timing",
  location: "location", compare: "comparison", switch: "changing course",
}));

/** Asks one student may add without changing the answer much ("is it required", "legally"). */
const SOFT_ASKS = new Set(["necessity", "legal", "eligibility"]);

const WITHOUT = /\b(?:without|bina|directly|direct|straight)\b/;
const NUMBER_UNIT = /\b(\d+(?:\.\d+)?)\s*(months?|years?|yrs?|lakhs?|lacs?|hours?|hrs?|attempts?|k)\b/g;

/** Intent signature of an analysed question (memoised on the analysis object). */
export function intentSignature(a) {
  if (a._sig) return a._sig;
  const strong = new Set();
  const weak = new Set();
  a.q.forEach(t => {
    const s = STRONG_BY_TOKEN.get(t);
    if (s) strong.add(s);
    else if (WEAK_BY_TOKEN.has(t)) weak.add(WEAK_BY_TOKEN.get(t));
  });
  // "PG entrance" is the AIAPGET; AIAPGET, a country or a PG branch implies the wider subject.
  if (strong.has("pg") && a.q.has("exam") && !strong.has("neetpg")) strong.add("aiapget");
  // The (A)MO recruitment exam is the state PSC exam.
  if (strong.has("medicalofficer") && a.q.has("exam") && !strong.has("upsc")) strong.add("psc");
  [...strong].forEach(s => {
    if (s.startsWith("country:")) strong.add("abroad");
    if (s.startsWith("branch:") || s === "aiapget") strong.add("pg");
  });
  const text = a.askText || a.norm || "";
  const asks = new Set(SPECIFIC_ASKS.filter(([, re]) => re.test(text)).map(([k]) => k));
  const generic = GENERIC_ASKS.filter(([, re]) => re.test(text)).map(([k]) => k);
  const nums = new Map();
  for (const m of text.matchAll(NUMBER_UNIT)) {
    let unit = m[2].replace(/s$/, "").replace(/^yr$/, "year").replace(/^hr$/, "hour").replace(/^lac$/, "lakh");
    let value = Number(m[1]);
    // "6 months" and "1 year" are both durations; compare them in months.
    if (unit === "year") { unit = "month"; value *= 12; }
    if (!nums.has(unit)) nums.set(unit, new Set());
    nums.get(unit).add(String(value));
  }
  a._sig = { strong, weak, asks, generic, without: WITHOUT.test(text), nums };
  return a._sig;
}

function disjointWithin(xs, ys, pick) {
  const a = [...xs].filter(pick);
  const b = [...ys].filter(pick);
  return a.length > 0 && b.length > 0 && !a.some(v => b.includes(v));
}

/** A specific that makes one answer wrong for the other student. Never merged, never suggested. */
function hardConflict(x, y) {
  if (disjointWithin(x.strong, y.strong, s => s.startsWith("country:"))) return "different countries";
  if (disjointWithin(x.strong, y.strong, s => EXAMS.has(s))) return "different exams";
  if (disjointWithin(x.strong, y.strong, s => s.startsWith("branch:"))) return "different PG branches";
  if (disjointWithin(x.strong, y.strong, s => s.startsWith("specialty:"))) return "different specialties";
  if (x.without !== y.without && x.strong.has("pg") && y.strong.has("pg")) return "with vs without PG";
  for (const [unit, vals] of x.nums) {
    const other = y.nums.get(unit);
    if (other && ![...vals].some(v => other.has(v))) return "different numbers";
  }
  return null;
}

function askRelation(x, y) {
  if (!x.asks.size && !y.asks.size) return "same";
  for (const k of x.asks) if (y.asks.has(k)) return "same";
  return x.asks.size && y.asks.size ? "clash" : "one-sided";
}

/**
 * Hard merge requirements for one pair (theme / sub-area gates are applied by the caller).
 * - `close`: may sit in the same automatic group (every pair of a group must be close).
 * - `tier`: "auto" (close and score ≥ threshold), "suggest" (staff decide), or "none".
 */
export function pairVerdict(a, b, score, threshold = MERGE_DEFAULTS.threshold, suggestFloor = MERGE_DEFAULTS.suggestFloor) {
  const x = intentSignature(a);
  const y = intentSignature(b);
  if (a.norm && a.norm === b.norm) {
    return { tier: "auto", close: true, reviewable: true, conflict: null, ask: "same", shared: [...x.strong, ...x.weak], unmatched: [], sharedTokens: a.q.size };
  }
  const conflict = hardConflict(x, y);
  let sharedTokens = 0;
  a.q.forEach(t => { if (b.q.has(t)) sharedTokens++; });
  if (conflict) return { tier: "none", close: false, reviewable: false, conflict, ask: askRelation(x, y), shared: [], unmatched: [], sharedTokens };
  const shared = [...x.strong].filter(s => y.strong.has(s)).concat([...x.weak].filter(s => y.weak.has(s)));
  const sharedStrong = [...x.strong].filter(s => y.strong.has(s) && s !== "pg");
  // "Own clinic" ≈ "private practice"; "research" / "government" as a modifier of a subject both
  // already share ("publish a research paper", "rank for a government college") is not a new subject.
  const forgiven = (s, other) => (s === "clinic" && other.weak.has("practice"))
    || (MODIFIER_SUBJECTS.has(s) && sharedStrong.some(v => v !== s));
  const unmatched = [...x.strong].filter(s => !y.strong.has(s) && !forgiven(s, y))
    .concat([...y.strong].filter(s => !x.strong.has(s) && !forgiven(s, x)));
  const ask = askRelation(x, y);
  const bare = !x.strong.size && !y.strong.size && !x.weak.size && !y.weak.size;
  // Automatic groups need a shared subject; two subject-less questions sharing words (often a
  // back-story) can only be offered to staff. Questions with nothing but "after BAMS" left
  // (`fallback`) are the general career ask, which is their subject.
  const anchored = shared.length > 0 || (bare && a.fallback && b.fallback && sharedTokens >= 2);
  const enoughWords = sharedTokens >= 2 || (sharedTokens >= 1 && a.q.size <= 2 && b.q.size <= 2);
  const close = anchored && enoughWords && ask === "same" && unmatched.length === 0;
  let tier = "none";
  const reviewable = (anchored || (bare && sharedTokens >= 2)) && sharedTokens >= 1 && unmatched.length <= 1
    && (ask === "same" || (ask === "one-sided" && [...x.asks, ...y.asks].every(k => SOFT_ASKS.has(k))));
  if (close && score >= threshold) tier = "auto";
  else if (reviewable && score >= suggestFloor) tier = "suggest";
  return { tier, close, reviewable, conflict: null, ask, shared, unmatched, sharedTokens };
}

function primaryAsk(sig) {
  for (const [k] of SPECIFIC_ASKS) if (sig.asks.has(k)) return ASK_LABEL.get(k);
  return sig.generic[0] || "general";
}

/** Shared subject labels and the common ask across analysed members (for "why merged"). */
function commonIntent(analyses) {
  const sigs = analyses.map(intentSignature);
  const inAll = set => [...set].filter(s => sigs.every(g => g.strong.has(s) || g.weak.has(s)));
  const all = inAll(new Set([...sigs[0].strong, ...sigs[0].weak]));
  const strongOnly = all.filter(s => sigs[0].strong.has(s));
  const subjects = (strongOnly.length ? strongOnly : all)
    .filter(s => !(s === "abroad" && strongOnly.some(v => v.startsWith("country:"))))
    .filter(s => !(s === "pg" && (strongOnly.includes("aiapget") || strongOnly.some(v => v.startsWith("branch:")))))
    .sort();
  let ask = "";
  for (const [k] of SPECIFIC_ASKS) if (sigs.every(g => g.asks.has(k))) { ask = ASK_LABEL.get(k); break; }
  if (!ask && sigs.every(g => !g.asks.size)) {
    const gen = GENERIC_ASKS.map(([k]) => k).find(k => sigs.every(g => g.generic.includes(k)));
    ask = gen || "general";
  }
  return { subjects: subjects.map(subjectLabel), ask: ask || primaryAsk(sigs[0]) };
}

export function clusterAnswerText(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim();
}

/** Answered / sent-out groups keep their members on re-merge so no student loses an answer. */
export function isLockedCluster(c) {
  if (!c) return false;
  return Boolean(clusterAnswerText(c)) || LOCKED_STATUSES.includes(c.status);
}

export function defaultClusterId() {
  return "AYM-C-" + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
}

function uniqueIdFactory(idFactory, taken) {
  return () => {
    for (let i = 0; i < 50; i++) {
      const id = idFactory();
      if (!taken.has(id)) { taken.add(id); return id; }
    }
    const id = `AYM-C-${taken.size + 1}-${Date.now().toString(36).toUpperCase()}`;
    taken.add(id);
    return id;
  };
}

const HINGLISH_SET = new Set(HINGLISH_WORDS);

/** Higher = reads better as the one question a mentor answers out loud. */
export function wordingQuality(question, fold) {
  const raw = String(question || "").trim();
  const clean = stripBoilerplate(raw);
  const words = normalizeText(raw).split(" ").filter(Boolean);
  let q = 0;
  if (/[\u0900-\u097f]/.test(raw)) q -= 3;
  q -= Math.min(3, words.filter(w => HINGLISH_SET.has(w)).length);
  const letters = raw.replace(/[^a-z]/gi, "");
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) q -= 2;
  if (/^[a-z]/.test(clean)) q -= 0.5;
  if (clean !== raw) q -= 1;
  if (fold && words.some(w => fold.has(w))) q -= 1;
  if (clean.length < 20 || clean.length > 160) q -= 1;
  if (/\?$/.test(clean)) q += 0.3;
  return q;
}

/** Addressees and year-of-study introductions left after `stripBoilerplate` (display only). */
const TIDY_LEAD = [
  /^\s*(?:vaidya\s*ji|vaidyaji|vaidya|guru\s*ji|guruji|panel|committee|experts?|seniors?|team|everyone|all)\s*[,.!:;-]+\s*/i,
  /^\s*(?:myself|i\s*am|i'm|this\s+is)\s+(?:dr\.?\s+)?[a-z]+(?:\s+[a-z]+)?(?:\s+from\s+[^.?!,]{1,40})?\s*,?\s*(?:an?\s+)?(?:final|first|second|third|fourth|1st|2nd|3rd|4th)\s+(?:year|prof)\b[^.?!]{0,30}[.!]\s*/i,
];

/** Drop greetings / sign-offs, tidy the first letter and the closing "??" — never rewrites words. */
export function tidyQuestion(question) {
  let s = stripBoilerplate(question).replace(/\s+/g, " ").trim();
  for (let k = 0; k < 2; k++) {
    const next = TIDY_LEAD.reduce((acc, re) => acc.replace(re, ""), s);
    if (next === s || !/[a-z\u0900-\u097f]{3}/i.test(next)) break;
    s = stripBoilerplate(next);
  }
  if (!s) return String(question || "").trim();
  s = s.replace(/([?!.])\1+$/, "$1");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The group's mentor question: among the most central members (mean similarity to the rest
 * within 0.1 of the best), the best-worded one; ties → more central, shorter, lower id.
 */
function pickRepresentative(members, ctx = {}) {
  if (members.length < 2) return members[0];
  const fold = ctx.fold || typoFoldMap(members);
  const an = members.map(m => m._a || analyzeQuestion(m.question, "", fold));
  const sim = (i, j) => {
    const x = members[i];
    const y = members[j];
    if (ctx.cache && x._i != null && y._i != null) {
      const key = x._i < y._i ? `${x._i}:${y._i}` : `${y._i}:${x._i}`;
      let v = ctx.cache.get(key);
      if (v == null) { v = questionSimilarity(an[i], an[j], ctx.df); ctx.cache.set(key, v); }
      return v;
    }
    return questionSimilarity(an[i], an[j], ctx.df);
  };
  const scored = members.map((m, i) => {
    let s = 0;
    members.forEach((_, j) => { if (j !== i) s += sim(i, j); });
    return { m, cent: s / (members.length - 1), quality: wordingQuality(m.question, fold), len: String(m.question || "").length };
  });
  const top = Math.max(...scored.map(x => x.cent));
  return scored
    .filter(x => x.cent >= top - 0.1)
    .sort((a, b) => (b.quality - a.quality) || (b.cent - a.cent) || (a.len - b.len) || String(a.m.id).localeCompare(String(b.m.id)))[0].m;
}

function modeOf(values) {
  const m = new Map();
  values.forEach(v => { if (v) m.set(v, (m.get(v) || 0) + 1); });
  let best = "";
  let n = 0;
  [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).forEach(([v, k]) => { if (k > n) { n = k; best = v; } });
  return best;
}

const VARIANT_CAP = 6;

function describeMembers(members, ctx) {
  const rep = pickRepresentative(members, ctx);
  return {
    representative: tidyQuestion(rep.question),
    representativeId: String(rep.id),
    variants: members.filter(m => m.id !== rep.id).slice(0, VARIANT_CAP).map(m => String(m.question || "")),
    kind: members.length >= 2 ? "merged" : "unique",
  };
}

const CANONICAL = new Set(SYNONYMS.values());
const DISPLAY = new Map(Object.entries({
  pg: "PG", aiapget: "AIAPGET", phd: "PhD", mvt: "MVT", gmp: "GMP", uk: "UK", usa: "USA", psc: "PSC",
  nam: "NAM", medicalofficer: "medical officer", rnd: "R&D", qa: "QA", qc: "QC", ip: "IP", mo: "MO",
  neetpg: "NEET-PG", upsc: "UPSC", mph: "MPH", cutoff: "cut-off", casereport: "case report",
  socialmedia: "social media", gulf: "Gulf", europe: "Europe",
}));

function displayTerm(t, raw) {
  if (DISPLAY.has(t)) return DISPLAY.get(t);
  if (CANONICAL.has(t)) return t;
  return raw || t;
}

function sharedTermsFor(members) {
  if (members.length < 2) return [];
  const count = new Map();
  const surface = new Map();
  members.forEach(m => {
    const a = m._a || analyzeQuestion(m.question, "");
    a.q.forEach(t => {
      count.set(t, (count.get(t) || 0) + 1);
      if (!surface.has(t)) surface.set(t, displayTerm(t, a.surface.get(t)));
    });
  });
  return [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((x, y) => (y[1] - x[1]) || x[0].localeCompare(y[0]))
    .slice(0, 5)
    .map(([t]) => surface.get(t));
}

const round2 = x => Math.round(x * 100) / 100;

/**
 * "Why merged" for any set of students: shared subjects, the common ask, weakest / average pair
 * score, and whether every pair meets the automatic-group requirements. Works for manual merges
 * too (members analysed on the fly), so the desk can flag a weak group whoever made it.
 */
export function explainGroup(members, opts = {}) {
  const list = (members || []).filter(Boolean);
  if (list.length < 2) return null;
  const threshold = opts.threshold ?? MERGE_DEFAULTS.threshold;
  const floor = threshold * (opts.pairFloor ?? MERGE_DEFAULTS.pairFloor);
  const fold = opts.fold || typoFoldMap(list);
  const an = list.map(m => (opts.fold && m._a) || analyzeQuestion(m.question, "", fold));
  const df = opts.df || null;
  let min = 1;
  let sum = 0;
  let n = 0;
  let allClose = true;
  let conflict = null;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const key = list[i]._i != null && list[j]._i != null && opts.cache
        ? (list[i]._i < list[j]._i ? `${list[i]._i}:${list[j]._i}` : `${list[j]._i}:${list[i]._i}`) : null;
      let s = key ? opts.cache.get(key) : null;
      if (s == null) s = questionSimilarity(an[i], an[j], df);
      const v = pairVerdict(an[i], an[j], s, threshold);
      if (!v.close) allClose = false;
      if (v.conflict && !conflict) conflict = v.conflict;
      if (s < min) min = s;
      sum += s;
      n++;
    }
  }
  const { subjects, ask } = commonIntent(an);
  const confidence = !allClose || min < floor ? "review" : (min >= threshold ? "high" : "medium");
  return {
    subjects: subjects.slice(0, 4), ask, min: round2(min), avg: round2(sum / n),
    confidence, belowFloor: min < floor, allClose, conflict,
  };
}

function emptyAnswerFields() {
  return { answer: "", actions: ["", "", ""], mistake: "", resources: ["", ""], mentorName: "" };
}

/**
 * Analyse one theme (or theme + sub-area) bucket: typo folding, question-only analysis, rare-term
 * weights, and every pair that shares at least one word (pairs sharing none score 0).
 */
function analyseBucket(items, threshold, suggestFloor) {
  const fold = typoFoldMap(items);
  items.forEach((it, i) => {
    it._a = analyzeQuestion(it.question, "", fold);
    it._a._bg = wordBigrams(it._a.seq);
    it._c = analyzeQuestion(it.context, "", fold).set;
    it._i = i;
  });
  const df = new Map();
  items.forEach(s => s._a.set.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
  const byToken = new Map();
  items.forEach((s, i) => s._a.set.forEach(t => {
    if (!byToken.has(t)) byToken.set(t, []);
    byToken.get(t).push(i);
  }));
  const byNorm = new Map();
  items.forEach((s, i) => {
    if (!s._a.norm) return;
    if (!byNorm.has(s._a.norm)) byNorm.set(s._a.norm, []);
    byNorm.get(s._a.norm).push(i);
  });
  const cache = new Map();
  const info = new Map();
  items.forEach((s, i) => {
    const near = new Set();
    s._a.set.forEach(t => byToken.get(t).forEach(j => { if (j > i) near.add(j); }));
    if (s._a.norm) byNorm.get(s._a.norm).forEach(j => { if (j > i) near.add(j); });
    near.forEach(j => {
      const score = questionSimilarity(s._a, items[j]._a, df);
      const key = `${i}:${j}`;
      cache.set(key, score);
      info.set(key, { score, ...pairVerdict(s._a, items[j]._a, score, threshold, suggestFloor) });
    });
  });
  return { fold, df, cache, info };
}

const pairKey = (i, j) => (i < j ? `${i}:${j}` : `${j}:${i}`);

/**
 * Question pairs staff kept apart ("Keep apart" on a suggestion) → Map question id → partner ids.
 * Read from `apartFrom` (question ids of the rejected partner group) and the older `keepApart`
 * (partner group ids, resolved against the same list). Question-level, so a decision survives
 * re-merges that renumber groups.
 */
export function keptApartPairs(clusters) {
  const list = (Array.isArray(clusters) ? clusters : []).filter(c => c && Array.isArray(c.memberIds));
  const byGroup = new Map(list.map(c => [String(c.id), c.memberIds.map(String)]));
  const map = new Map();
  const add = (x, y) => {
    if (x === y) return;
    if (!map.has(x)) map.set(x, new Set());
    if (!map.has(y)) map.set(y, new Set());
    map.get(x).add(y);
    map.get(y).add(x);
  };
  list.forEach(c => {
    const own = c.memberIds.map(String);
    const partners = new Set((Array.isArray(c.apartFrom) ? c.apartFrom : []).map(String));
    (Array.isArray(c.keepApart) ? c.keepApart : []).forEach(g => (byGroup.get(String(g)) || []).forEach(x => partners.add(x)));
    own.forEach(m => partners.forEach(x => add(m, x)));
  });
  return map;
}

function apartFromFor(memberIds, apartMap) {
  const own = new Set(memberIds.map(String));
  const out = new Set();
  own.forEach(m => (apartMap.get(m) || []).forEach(x => { if (!own.has(x)) out.add(x); }));
  return [...out].sort();
}

/** Staff rejected a suggestion: remember the question pairs on both groups. Returns a new list. */
export function keepGroupsApart(clusters, aId, bId) {
  const list = Array.isArray(clusters) ? clusters : [];
  const A = list.find(c => c && String(c.id) === String(aId));
  const B = list.find(c => c && String(c.id) === String(bId));
  if (!A || !B || A === B) return list;
  const add = (c, other) => ({
    ...c,
    apartFrom: [...new Set([...(c.apartFrom || []).map(String), ...other.memberIds.map(String)])].sort(),
  });
  return list.map(c => (c === A ? add(A, B) : c === B ? add(B, A) : c));
}

/**
 * Complete-linkage grouping over automatic-tier pairs. Strongest pairs first; two groups join only
 * when the result fits in `maxPack` and EVERY cross pair is close (same subjects, compatible ask,
 * no conflicting specifics, enough shared words) and scores ≥ the pair floor. No chaining, no
 * packing pass. Ties break on question ids, so input order never changes the result.
 */
function completeLinkage(items, info, maxPack, floor, apartMap = new Map()) {
  const isApart = (x, y) => Boolean(apartMap.get(items[x].id)?.has(items[y].id));
  const edges = [];
  info.forEach((v, key) => { if (v.tier === "auto") edges.push(key); });
  const ctxBonus = key => {
    const [i, j] = key.split(":").map(Number);
    const a = items[i]._c;
    const b = items[j]._c;
    return a.size && b.size ? 0.02 * setJaccard(a, b) : 0;
  };
  const weight = new Map(edges.map(k => [k, info.get(k).score + ctxBonus(k)]));
  const idKey = k => k.split(":").map(Number).map(i => items[i].id).sort().join("\u0000");
  edges.sort((x, y) => (weight.get(y) - weight.get(x)) || idKey(x).localeCompare(idKey(y)));
  const owner = items.map((_, i) => i);
  const groups = new Map(items.map((_, i) => [i, [i]]));
  edges.forEach(key => {
    const [i, j] = key.split(":").map(Number);
    const gi = owner[i];
    const gj = owner[j];
    if (gi === gj) return;
    const A = groups.get(gi);
    const B = groups.get(gj);
    if (A.length + B.length > maxPack) return;
    for (const x of A) for (const y of B) {
      const v = info.get(pairKey(x, y));
      if (!v || !v.close || v.score < floor || isApart(x, y)) return;
    }
    const [keep, drop] = A.length >= B.length ? [gi, gj] : [gj, gi];
    groups.get(keep).push(...groups.get(drop));
    groups.get(drop).forEach(x => { owner[x] = keep; });
    groups.delete(drop);
  });
  return [...groups.values()]
    .map(g => g.map(i => items[i]).sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
}

/**
 * Automatic merge (precision-first). See docs/merge/PRECISION-FIRST-SPEC.md.
 * - Hard gate: theme (and sub-area when `useSub`).
 * - A pair may share a group only when it meets every hard requirement (`pairVerdict` close):
 *   at least one shared subject anchor and no subject on one side only, compatible ask, no
 *   conflicting country / exam / PG branch / numbers / "without PG", ≥ 2 shared content words
 *   (1 for two very short questions). The optional context never creates a merge.
 * - Groups grow by complete linkage: joined through a pair scoring ≥ threshold, and every pair
 *   inside scores ≥ threshold × pairFloor. No bucket ever exceeds `maxPack` (overflow → new group).
 * - Near misses are not merged here; `suggestMerges` lists them for staff to accept or reject.
 * - Locked groups (answered / sent to mentor / published) keep their members untouched.
 * - Unlocked groups keep their id + composite when most of their members stay together.
 */
export function buildClusters(subs, threshold = MERGE_DEFAULTS.threshold, useSub = true, prev = [], opts = {}) {
  const maxPack = Math.max(1, opts.maxPack || MERGE_DEFAULTS.maxPack);
  const floor = threshold * (opts.pairFloor ?? MERGE_DEFAULTS.pairFloor);
  const suggestFloor = opts.suggestFloor ?? MERGE_DEFAULTS.suggestFloor;
  const prevList = (Array.isArray(prev) ? prev : []).filter(c => c && Array.isArray(c.memberIds));
  const taken = new Set(prevList.map(c => String(c.id)));
  const newId = uniqueIdFactory(opts.idFactory || defaultClusterId, taken);
  const apartMap = keptApartPairs(prevList);

  const seenSub = new Set();
  const pool = [];
  (Array.isArray(subs) ? subs : []).forEach(s => {
    if (!s || s.id == null) return;
    const id = String(s.id);
    if (seenSub.has(id)) return;
    seenSub.add(id);
    pool.push(s);
  });
  const subById = new Map(pool.map(s => [String(s.id), s]));

  const out = [];
  const claimed = new Set();
  prevList.filter(isLockedCluster).forEach(c => {
    const ids = [];
    c.memberIds.forEach(raw => {
      const id = String(raw);
      if (!subById.has(id) || claimed.has(id)) return;
      claimed.add(id);
      ids.push(id);
    });
    if (!ids.length) return;
    const members = ids.map(id => subById.get(id));
    const unchanged = ids.length === c.memberIds.length && String(c.representative || "").trim();
    out.push({
      ...c,
      theme: c.theme || members[0].theme || "",
      subtheme: c.subtheme ?? (members[0].subtheme || ""),
      memberIds: ids,
      ...(unchanged ? { kind: ids.length >= 2 ? "merged" : "unique" } : describeMembers(members)),
      locked: true,
    });
  });

  const groups = new Map();
  pool.forEach(s => {
    if (claimed.has(String(s.id))) return;
    const theme = String(s.theme || "");
    const key = useSub ? `${theme}\u0000${String(s.subtheme || "")}` : theme;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...s, id: String(s.id) });
  });

  const unlockedPrev = prevList.filter(c => !isLockedCluster(c));
  const fresh = [];

  [...groups.keys()].sort().forEach(key => {
    const items = groups.get(key).sort((a, b) => a.id.localeCompare(b.id));
    const { fold, df, cache, info } = analyseBucket(items, threshold, suggestFloor);
    const packed = completeLinkage(items, info, maxPack, floor, apartMap);
    const [theme, subtheme] = key.split("\u0000");
    packed.forEach(members => {
      const why = explainGroup(members, { threshold, pairFloor: opts.pairFloor, fold, df, cache });
      fresh.push({
        theme,
        subtheme: useSub ? (subtheme || "") : modeOf(members.map(m => m.subtheme)),
        members,
        cohesion: why ? why.min : null,
        why: why ? { subjects: why.subjects, ask: why.ask, min: why.min, avg: why.avg } : null,
        confidence: why ? why.confidence : null,
        wording: describeMembers(members, { df, cache, fold }),
      });
    });
  });

  const pairs = [];
  fresh.forEach((f, fi) => {
    const ids = new Set(f.members.map(m => m.id));
    unlockedPrev.forEach((p, pi) => {
      const overlap = p.memberIds.filter(x => ids.has(String(x))).length;
      if (overlap) pairs.push({ fi, pi, overlap });
    });
  });
  pairs.sort((a, b) => (b.overlap - a.overlap) || (a.fi - b.fi) || (a.pi - b.pi));
  const carriedFor = new Map();
  const usedPrev = new Set();
  pairs.forEach(({ fi, pi, overlap }) => {
    if (carriedFor.has(fi) || usedPrev.has(pi)) return;
    carriedFor.set(fi, { prev: unlockedPrev[pi], overlap });
    usedPrev.add(pi);
  });

  fresh.forEach((f, fi) => {
    const carry = carriedFor.get(fi);
    const p = carry && carry.prev;
    const majority = Boolean(p && carry.overlap * 2 >= f.members.length);
    const keepWording = majority && Boolean(String(p.composite || "").trim());
    const apartFrom = apartFromFor(f.members.map(m => m.id), apartMap);
    out.push({
      id: p ? String(p.id) : newId(),
      theme: f.theme,
      subtheme: f.subtheme,
      memberIds: f.members.map(m => m.id),
      ...f.wording,
      composite: keepWording ? p.composite : "",
      mentor: p ? (p.mentor || "") : "",
      ...emptyAnswerFields(),
      ...(majority ? {
        actions: Array.isArray(p.actions) ? p.actions : ["", "", ""],
        mistake: p.mistake || "",
        resources: Array.isArray(p.resources) ? p.resources : ["", ""],
        mentorName: p.mentorName || "",
      } : {}),
      status: keepWording ? "Composed" : "New",
      cohesion: f.cohesion,
      confidence: f.confidence,
      why: f.why,
      sharedTerms: sharedTermsFor(f.members),
      ...(apartFrom.length ? { apartFrom } : {}),
    });
  });

  out.sort((a, b) => (b.memberIds.length - a.memberIds.length)
    || String(a.theme).localeCompare(String(b.theme))
    || String(a.id).localeCompare(String(b.id)));
  return out.map(c => { const { locked, ...rest } = c; return rest; });
}

/**
 * Suggested merges: pairs of unlocked groups in the same theme that look like the same ask but did
 * not meet every automatic requirement (a sub-area apart, one asks a little more, fewer shared
 * words). Staff accept or reject each one; nothing here changes the groups. Never suggested: a
 * different theme, a hard conflict (country / exam / PG branch / numbers / without PG), clashing
 * asks, no shared subject, more than `maxPack` students, a locked group, or any question pair staff
 * already kept apart (`apartFrom`, or the older group-id `keepApart`, on either group).
 */
export function suggestMerges(clusters, subs, opts = {}) {
  const threshold = opts.threshold ?? MERGE_DEFAULTS.threshold;
  const suggestFloor = opts.suggestFloor ?? MERGE_DEFAULTS.suggestFloor;
  const maxPack = Math.max(1, opts.maxPack || MERGE_DEFAULTS.maxPack);
  const perGroup = opts.perGroup ?? 2;
  const byId = new Map((subs || []).filter(s => s && s.id != null).map(s => [String(s.id), s]));
  const open = (clusters || [])
    .filter(c => c && Array.isArray(c.memberIds) && c.memberIds.length && !isLockedCluster(c)
      && c.memberIds.length < maxPack && c.memberIds.every(id => byId.has(String(id))))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const byTheme = new Map();
  open.forEach(c => {
    const t = String(c.theme || "");
    if (!byTheme.has(t)) byTheme.set(t, []);
    byTheme.get(t).push(c);
  });
  const apartMap = keptApartPairs(clusters);
  const apart = (a, b) => a.memberIds.some(x => {
    const partners = apartMap.get(String(x));
    return partners && b.memberIds.some(y => partners.has(String(y)));
  });
  const found = [];
  [...byTheme.keys()].sort().forEach(theme => {
    const groups = byTheme.get(theme);
    const items = [];
    const ownerOf = [];
    groups.forEach((c, gi) => c.memberIds.forEach(id => {
      items.push({ ...byId.get(String(id)), id: String(id) });
      ownerOf.push(gi);
    }));
    const { info } = analyseBucket(items, threshold, suggestFloor);
    const memberIdx = groups.map(() => []);
    ownerOf.forEach((g, i) => memberIdx[g].push(i));
    const candidates = new Set();
    info.forEach((v, key) => {
      if (v.tier === "none") return;
      const [i, j] = key.split(":").map(Number);
      if (ownerOf[i] !== ownerOf[j]) candidates.add(ownerOf[i] < ownerOf[j] ? `${ownerOf[i]}:${ownerOf[j]}` : `${ownerOf[j]}:${ownerOf[i]}`);
    });
    candidates.forEach(gk => {
      const [ga, gb] = gk.split(":").map(Number);
      const A = groups[ga];
      const B = groups[gb];
      if (A.memberIds.length + B.memberIds.length > maxPack || apart(A, B)) return;
      let sum = 0;
      let best = null;
      let n = 0;
      for (const x of memberIdx[ga]) for (const y of memberIdx[gb]) {
        const v = info.get(pairKey(x, y));
        if (!v || !v.reviewable) return;
        sum += v.score;
        n++;
        if (!best || v.score > best.score) best = v;
      }
      const mean = sum / n;
      if (best.score < suggestFloor || mean < suggestFloor * 0.8) return;
      const allItems = [...memberIdx[ga], ...memberIdx[gb]].map(i => items[i]._a);
      const { subjects, ask } = commonIntent(allItems);
      let reason = "worded differently";
      if (String(A.subtheme || "") !== String(B.subtheme || "")) reason = "filed under different sub-areas";
      else if (best.unmatched.length) reason = `one also mentions ${subjectLabel(best.unmatched[0])}`;
      else if (best.ask === "one-sided") reason = "one asks something more specific";
      else if (mean >= threshold) reason = "would make a weak group automatically";
      found.push({
        key: `${A.id}|${B.id}`, a: String(A.id), b: String(B.id), theme,
        score: round2(mean), best: round2(best.score), size: A.memberIds.length + B.memberIds.length,
        subjects: subjects.slice(0, 3), ask, reason,
      });
    });
  });
  found.sort((x, y) => (y.score - x.score) || (y.best - x.best) || x.key.localeCompare(y.key));
  const used = new Map();
  return found.filter(s => {
    if ((used.get(s.a) || 0) >= perGroup || (used.get(s.b) || 0) >= perGroup) return false;
    used.set(s.a, (used.get(s.a) || 0) + 1);
    used.set(s.b, (used.get(s.b) || 0) + 1);
    return true;
  });
}

function statusRank(s) {
  const i = CLUSTER_STATUSES.indexOf(s);
  return i < 0 ? 0 : i;
}

export class MergeConflictError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Staff manual merge of two or more groups. Keeps the (single) answered group's answer;
 * refuses when two groups carry different answers. `byId` (optional) maps question id → record
 * to recompute wording; without it variants are pooled from the chosen groups.
 */
export function mergeClusterGroup(clusters, ids, byId, opts = {}) {
  const list = Array.isArray(clusters) ? clusters : [];
  const want = [...new Set((ids || []).map(String))];
  const chosen = want.map(id => list.find(c => c && String(c.id) === id)).filter(Boolean);
  if (chosen.length < 2) {
    throw new MergeConflictError("Those groups are no longer on the desk. Reload and try again.", "MISSING");
  }
  // Accepting a suggestion is held to the automatic rules: one mentor table, nothing locked.
  if (opts.suggestion) {
    const total = chosen.reduce((n, c) => n + (c.memberIds || []).length, 0);
    if (total > MERGE_DEFAULTS.maxPack) {
      throw new MergeConflictError(`Together these groups have ${total} students — more than one mentor table (${MERGE_DEFAULTS.maxPack}).`, "OVER_CAP");
    }
    if (chosen.some(isLockedCluster)) {
      throw new MergeConflictError("One of these groups is already answered or sent to a mentor. Reload the desk.", "LOCKED");
    }
  }
  const answered = chosen.filter(c => clusterAnswerText(c));
  const distinct = new Set(answered.map(c => clusterAnswerText(c)));
  if (distinct.size > 1) {
    throw new MergeConflictError(
      "Two of these groups already have different mentor answers. Clear one answer first, or keep them separate.",
      "ANSWER_CONFLICT",
    );
  }
  const largest = [...chosen].sort((a, b) => (b.memberIds || []).length - (a.memberIds || []).length)[0];
  const base = answered[0] || largest;
  const ordered = [base, ...chosen.filter(c => c !== base)];
  const memberIds = [];
  const seen = new Set();
  ordered.forEach(c => (c.memberIds || []).forEach(raw => {
    const id = String(raw);
    if (seen.has(id)) return;
    seen.add(id);
    memberIds.push(id);
  }));
  const lookup = byId instanceof Map ? id => byId.get(id) : id => (byId ? byId[id] : null);
  const members = memberIds.map(lookup).filter(Boolean);
  let wording;
  if (members.length === memberIds.length && members.length) {
    wording = describeMembers(members);
  } else {
    const rep = ordered.find(c => String(c.representative || "").trim()) || ordered[0];
    const pool = [];
    ordered.forEach(c => [c.representative, ...(c.variants || [])].forEach(v => {
      const s = String(v || "");
      if (s && s !== rep.representative && !pool.includes(s)) pool.push(s);
    }));
    wording = {
      representative: String(rep.representative || ""),
      ...(rep.representativeId ? { representativeId: String(rep.representativeId) } : {}),
      variants: pool.slice(0, VARIANT_CAP),
      kind: memberIds.length >= 2 ? "merged" : "unique",
    };
  }
  const firstOf = key => ordered.map(c => c[key]).find(v => v && String(v).trim()) || "";
  const status = clusterAnswerText(base)
    ? base.status
    : CLUSTER_STATUSES[Math.max(...chosen.map(c => statusRank(c.status)))] || "New";
  const merged = {
    ...base,
    memberIds,
    ...wording,
    composite: firstOf("composite"),
    mentor: firstOf("mentor"),
    status,
    mixedThemes: new Set(chosen.map(c => c.theme)).size > 1 || undefined,
    cohesion: null, confidence: null, why: null,
    sharedTerms: members.length ? sharedTermsFor(members) : (base.sharedTerms || []),
    apartFrom: [...new Set(chosen.flatMap(c => (c.apartFrom || []).map(String)))].filter(x => !seen.has(x)).sort(),
  };
  delete merged.keepApart;
  if (!merged.apartFrom.length) delete merged.apartFrom;
  if (!merged.mixedThemes) delete merged.mixedThemes;
  const chosenIds = new Set(chosen.map(c => String(c.id)));
  const rest = list
    .filter(c => c && !chosenIds.has(String(c.id)))
    .map(c => {
      const left = (c.memberIds || []).filter(x => !seen.has(String(x)));
      return left.length === (c.memberIds || []).length ? c : { ...c, memberIds: left, kind: left.length >= 2 ? "merged" : "unique" };
    })
    .filter(c => (c.memberIds || []).length);
  const next = [merged, ...rest].sort((a, b) => (b.memberIds.length - a.memberIds.length));
  return { clusters: next, merged };
}

/** Split one student out of a group into their own new group. */
export function detachMember(clusters, clusterIdVal, subId, byId, idFactory = defaultClusterId) {
  const list = Array.isArray(clusters) ? clusters : [];
  const sid = String(subId);
  const src = list.find(c => String(c.id) === String(clusterIdVal));
  if (!src || (src.memberIds || []).length < 2 || !src.memberIds.map(String).includes(sid)) return list;
  const lookup = byId instanceof Map ? id => byId.get(id) : id => (byId ? byId[id] : null);
  const moved = lookup(sid);
  if (!moved) return list;
  const left = src.memberIds.map(String).filter(i => i !== sid);
  const leftMembers = left.map(lookup).filter(Boolean);
  const wording = leftMembers.length === left.length
    ? describeMembers(leftMembers)
    : { representative: src.representative, variants: (src.variants || []).filter(v => v !== moved.question), kind: left.length >= 2 ? "merged" : "unique" };
  const taken = new Set(list.map(c => String(c.id)));
  const id = uniqueIdFactory(idFactory, taken)();
  const next = list.map(c => (c === src
    ? { ...c, memberIds: left, ...wording, sharedTerms: leftMembers.length === left.length ? sharedTermsFor(leftMembers) : (c.sharedTerms || []), cohesion: null, confidence: null, why: null }
    : c));
  next.push({
    id,
    theme: moved.theme || src.theme,
    subtheme: moved.subtheme || src.subtheme || "",
    kind: "unique",
    memberIds: [sid],
    representative: String(moved.question || ""),
    variants: [],
    composite: "",
    mentor: "",
    ...emptyAnswerFields(),
    status: "New",
    cohesion: null, confidence: null, why: null,
    sharedTerms: [],
    ...(Array.isArray(src.apartFrom) && src.apartFrom.length ? { apartFrom: [...src.apartFrom] } : {}),
  });
  return next;
}

/**
 * Integrity pass before a save: every question in at most one group (first wins), no empty
 * groups, no duplicate group ids, `kind` matches size. Returns a new list + what was fixed.
 */
export function sanitizeClusters(clusters) {
  const seenMember = new Set();
  const seenId = new Set();
  const fixes = { duplicateMembers: 0, emptyDropped: 0, duplicateIds: 0 };
  const out = [];
  (Array.isArray(clusters) ? clusters : []).forEach(c => {
    if (!c || typeof c !== "object") return;
    const id = String(c.id || "");
    if (!id || seenId.has(id)) { fixes.duplicateIds++; return; }
    const ids = [];
    (Array.isArray(c.memberIds) ? c.memberIds : []).forEach(raw => {
      const m = String(raw || "").trim();
      if (!m) return;
      if (seenMember.has(m)) { fixes.duplicateMembers++; return; }
      seenMember.add(m);
      ids.push(m);
    });
    if (!ids.length) { fixes.emptyDropped++; return; }
    seenId.add(id);
    const kind = ids.length >= 2 ? "merged" : "unique";
    let next = ids.length === (c.memberIds || []).length && c.kind === kind ? c : { ...c, memberIds: ids, kind };
    // The AI-assisted note belongs to an answer; once the answer is cleared it must not stick to the next one.
    if (next.aiAssisted && !clusterAnswerText(next)) {
      next = { ...next };
      delete next.aiAssisted;
    }
    out.push(next);
  });
  return { clusters: out, fixes };
}

/** Which submissions are missing from every group, and which group ids point at nothing. */
export function auditClusters(clusters, subs) {
  const subIds = new Set((subs || []).map(s => String(s.id)));
  const count = new Map();
  (clusters || []).forEach(c => (c.memberIds || []).forEach(raw => {
    const id = String(raw);
    count.set(id, (count.get(id) || 0) + 1);
  }));
  return {
    unclustered: [...subIds].filter(id => !count.has(id)),
    duplicated: [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    orphaned: [...count.keys()].filter(id => !subIds.has(id)),
  };
}
