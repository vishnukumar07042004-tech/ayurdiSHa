/**
 * FROZEN COPY of shared/merge.js as live on 24 Oct 2026 before the engine comparison (engine A in
 * scripts/bench/compare-engines.mjs). Do not edit — it is the baseline the comparison is reproducible against.
 *
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
 */

export const MERGE_DEFAULTS = Object.freeze({
  threshold: 0.48,
  maxPack: 7,
  packTarget: 6,
  packFloor: 0.28,
  packMean: 0.75,
});

/** Statuses after which a group's membership is frozen on re-merge. */
export const LOCKED_STATUSES = Object.freeze(["Sent to mentor", "Answered", "Published"]);
export const CLUSTER_STATUSES = Object.freeze(["New", "Composed", "Sent to mentor", "Answered", "Published"]);

const FUNCTION_WORDS = "a an the and or but if of to in on at by for with from into onto about as is am are was were be been being do does did doing done have has had having i me my mine we us our you your yours he she it its they them their this that these those there here what which where when why how who whom whose can could should would will shall may might must not no nor so too very just also than then such only same other another each both few more most much many some any all own per via out off up down over under again once dont im ive id".split(/\s+/);

const DOMAIN_WORDS = "ayurveda ayurvedic ayush bams student students career mentor mentors please kindly sir madam mam maam ji hello hi namaste thanks thank regards dear respected want need know tell get got best better good after before scope future option options tips tip guide guidance advice advise help suggest suggestion suggestions way ways field become becoming like also really actually possible proper right etc small big little final year years doctor doctors graduate graduates complete completing completed completion".split(/\s+/);

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
const LEAD_GREETING = /^\s*(?:(?:respected|dear|hello|hi|hey|namaste|namaskar|good\s+(?:morning|afternoon|evening)|sir|ma'?am|madam|mam|mentors?|ji)\b[\s,.!:;-]*)+/i;
const LEAD_INTRO = /^\s*(?:i\s*(?:am|'m)|myself|this\s+is)\s+(?:an?\s+)?[a-z0-9.\- ]{0,40}?\b(?:student|intern|internee|graduate|aspirant)s?\b(?:\s+(?:from|at|of|in)\s+[^.?!,]{1,40})?\s*[.,!;:]+\s*/i;
const TRAIL_SIGNOFF = /[\s,.;:-]*(?:(?:please|pls|plz|kindly)\s+(?:guide|help|suggest|advise|advice|reply|answer|tell)(?:\s+me)?|thank\s*(?:you|u)|thanks|regards)[\s.!?]*$/i;

export function stripBoilerplate(text) {
  let s = String(text || "");
  for (let k = 0; k < 3; k++) {
    const next = s.replace(LEAD_GREETING, "").replace(LEAD_INTRO, "").replace(TRAIL_SIGNOFF, "");
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
  [/\bneet[\s-]*pg\b/g, " pg exam "],
  [/\b(?:all\s+india\s+)?ai[\s-]*apget\b|\bapget\b/g, " aiapget pg exam "],
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
  // Romanised Hindi and Devanagari forms of the same ideas.
  videsh: "abroad", taiyari: "prepare", tayari: "prepare", shodh: "research",
  kholna: "start", kholne: "start", kholu: "start", kholun: "start", shuru: "start",
  "पीजी": "pg", "एमडी": "pg", "नौकरी": "job", "सरकारी": "government", "विदेश": "abroad",
  "क्लिनिक": "clinic", "रिसर्च": "research", "शोध": "research", "पंचकर्म": "panchakarma", "तैयारी": "prepare",
  "परीक्षा": "exam", "अस्पताल": "hospital", "लाइसेंस": "licence",
}));

/** Short tokens that are meaningful in this domain (everything else needs ≥ 3 letters). */
const SHORT_KEEP = new Set(["pg", "uk", "qa", "qc", "ip", "mo"]);

export function normalizeText(text) {
  let s = String(text || "")
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
  usa: "country:usa", uk: "country:uk", europe: "country:europe", germany: "country:europe",
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

/** Score two raw submissions in isolation (used by tests and the staff "why" hint). */
export function scorePair(s1, s2) {
  const fold = typoFoldMap([s1, s2]);
  return questionSimilarity(analyzeQuestion(s1.question, s1.context, fold), analyzeQuestion(s2.question, s2.context, fold));
}

function linkage(bucket, cand, df, cache) {
  let best = 0;
  let sum = 0;
  let n = 0;
  bucket.forEach(x => cand.forEach(y => {
    const key = x._i < y._i ? `${x._i}:${y._i}` : `${y._i}:${x._i}`;
    let v = cache.get(key);
    if (v == null) { v = questionSimilarity(x._a, y._a, df); cache.set(key, v); }
    if (v > best) best = v;
    sum += v;
    n++;
  }));
  return { best, mean: n ? sum / n : 0 };
}

/** A candidate joins when it is close to one member and not far from the rest (anti-chaining). */
function joins(link, threshold, meanFactor = 0.6) {
  return link.best >= threshold && link.mean >= threshold * meanFactor;
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

/** Drop greetings / sign-offs, tidy the first letter and the closing "??" — never rewrites words. */
export function tidyQuestion(question) {
  let s = stripBoilerplate(question).replace(/\s+/g, " ").trim();
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
  const an = members.map(m => m._a || analyzeQuestion(m.question, m.context, fold));
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
    const a = m._a || analyzeQuestion(m.question, m.context);
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

function cohesionFor(members, df, cache) {
  if (members.length < 2) return null;
  let min = 1;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const v = linkage([members[i]], [members[j]], df, cache).best;
      if (v < min) min = v;
    }
  }
  return Math.round(min * 100) / 100;
}

function emptyAnswerFields() {
  return { answer: "", actions: ["", "", ""], mistake: "", resources: ["", ""], mentorName: "" };
}

/**
 * Automatic merge.
 * - Hard gate: theme (and sub-area when `useSub`).
 * - Pass 1: each question joins the closest open bucket when similarity ≥ threshold.
 * - Pass 2: buckets smaller than `packTarget` combine when similarity ≥ max(packFloor, 0.78×threshold).
 * - No bucket ever exceeds `maxPack`.
 * - Locked groups (answered / sent to mentor / published) keep their members untouched.
 * - Unlocked groups keep their id + composite when most of their members stay together.
 */
export function buildClusters(subs, threshold = MERGE_DEFAULTS.threshold, useSub = true, prev = [], opts = {}) {
  const maxPack = Math.max(1, opts.maxPack || MERGE_DEFAULTS.maxPack);
  const packTarget = Math.min(maxPack, opts.packTarget || MERGE_DEFAULTS.packTarget);
  const packThresh = Math.max(opts.packFloor ?? MERGE_DEFAULTS.packFloor, threshold * 0.78);
  const packMean = opts.packMean ?? MERGE_DEFAULTS.packMean;
  const prevList = (Array.isArray(prev) ? prev : []).filter(c => c && Array.isArray(c.memberIds));
  const taken = new Set(prevList.map(c => String(c.id)));
  const newId = uniqueIdFactory(opts.idFactory || defaultClusterId, taken);

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
    const items = groups.get(key);
    const fold = typoFoldMap(items);
    items.forEach((it, i) => {
      it._a = analyzeQuestion(it.question, it.context, fold);
      it._a._bg = wordBigrams(it._a.seq);
      it._i = i;
    });
    const df = new Map();
    items.forEach(s => s._a.set.forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const cache = new Map();

    const order = [...items].sort((a, b) =>
      (b._a.set.size - a._a.set.size) || ((a.createdAt || 0) - (b.createdAt || 0)) || a.id.localeCompare(b.id));

    const buckets = [];
    order.forEach(s => {
      let best = null;
      let bestScore = 0;
      buckets.forEach(b => {
        if (b.length >= maxPack) return;
        const link = linkage(b, [s], df, cache);
        if (joins(link, threshold) && link.best > bestScore) { bestScore = link.best; best = b; }
      });
      if (best) best.push(s);
      else buckets.push([s]);
    });

    let packed = buckets;
    let changed = true;
    while (changed) {
      changed = false;
      packed.sort((a, b) => (a.length - b.length) || a[0].id.localeCompare(b[0].id));
      const gone = new Set();
      for (let i = 0; i < packed.length; i++) {
        if (gone.has(i) || packed[i].length >= packTarget) continue;
        let bestJ = -1;
        let bestScore = 0;
        for (let j = 0; j < packed.length; j++) {
          if (j === i || gone.has(j) || packed[i].length + packed[j].length > maxPack) continue;
          const link = linkage(packed[i], packed[j], df, cache);
          if (joins(link, packThresh, packMean) && link.best > bestScore) { bestScore = link.best; bestJ = j; }
        }
        if (bestJ >= 0) {
          packed[bestJ] = packed[bestJ].concat(packed[i]);
          gone.add(i);
          changed = true;
        }
      }
      packed = packed.filter((_, i) => !gone.has(i));
    }

    const [theme, subtheme] = key.split("\u0000");
    packed.forEach(members => {
      fresh.push({
        theme,
        subtheme: useSub ? (subtheme || "") : modeOf(members.map(m => m.subtheme)),
        members,
        cohesion: cohesionFor(members, df, cache),
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
      sharedTerms: sharedTermsFor(f.members),
    });
  });

  out.sort((a, b) => (b.memberIds.length - a.memberIds.length)
    || String(a.theme).localeCompare(String(b.theme))
    || String(a.id).localeCompare(String(b.id)));
  return out.map(c => { const { locked, ...rest } = c; return rest; });
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
export function mergeClusterGroup(clusters, ids, byId) {
  const list = Array.isArray(clusters) ? clusters : [];
  const want = [...new Set((ids || []).map(String))];
  const chosen = want.map(id => list.find(c => c && String(c.id) === id)).filter(Boolean);
  if (chosen.length < 2) {
    throw new MergeConflictError("Those groups are no longer on the desk. Reload and try again.", "MISSING");
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
    cohesion: null,
    sharedTerms: members.length ? sharedTermsFor(members) : (base.sharedTerms || []),
  };
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
    ? { ...c, memberIds: left, ...wording, sharedTerms: leftMembers.length === left.length ? sharedTermsFor(leftMembers) : (c.sharedTerms || []), cohesion: null }
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
    cohesion: null,
    sharedTerms: [],
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
    out.push(ids.length === (c.memberIds || []).length && c.kind === kind ? c : { ...c, memberIds: ids, kind });
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
