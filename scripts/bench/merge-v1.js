/** FROZEN COPY of shared/merge.js before the Oct 2026 benchmark tuning — used only by `npm run bench:merge -- --module scripts/bench/merge-v1.js` for before/after numbers. Do not import from the app.
 *
 * AYURDISHA question merge — pure, deterministic, shared by the browser (Curation desk)
 * and the server (manual merge / integrity checks). No I/O, no randomness unless the
 * caller relies on the default id factory.
 *
 * Score between two questions (same theme — and same sub-area when staff keep them apart):
 *   0.55 × weighted Jaccard + 0.35 × plain Jaccard + 0.10 × word-bigram Jaccard
 * over normalised question + context tokens. Rare terms (≤ 2 questions in the group) weigh
 * 1.5×; words that only appear in the optional context weigh 0.5×. Identical normalised
 * questions always score 1.
 */

export const MERGE_DEFAULTS = Object.freeze({
  threshold: 0.42,
  maxPack: 7,
  packTarget: 6,
  packFloor: 0.28,
});

/** Statuses after which a group's membership is frozen on re-merge. */
export const LOCKED_STATUSES = Object.freeze(["Sent to mentor", "Answered", "Published"]);
export const CLUSTER_STATUSES = Object.freeze(["New", "Composed", "Sent to mentor", "Answered", "Published"]);

const FUNCTION_WORDS = "a an the and or but if of to in on at by for with from into onto about as is am are was were be been being do does did doing done have has had having i me my mine we us our you your yours he she it its they them their this that these those there here what which where when why how who whom whose can could should would will shall may might must not no nor so too very just also than then such only same other another each both few more most much many some any all own per via out off up down over under again once dont im ive id".split(/\s+/);

const DOMAIN_WORDS = "ayurveda ayurvedic ayush bams student students career mentor mentors please kindly sir madam mam maam ji hello hi namaste thanks thank regards dear want need know tell get got best good after before scope future option options tips tip guide guidance advice suggest suggestion suggestions way ways field become becoming like also really actually possible proper right etc small big little".split(/\s+/);

/** Romanised Hindi function words that carry no topic. */
const HINGLISH_WORDS = "kya kaise kaisa kaisi kab kahan kaha kyu kyun kyon kaun konsa konsi hai hain ho hoga hogi honge tha thi the karna karne karu karun karein kare karo kar raha rahi rahe ke ki ka ko se me mein main mai mujhe mera meri mere hum ham humko aap ap apna apni aur ya bhi toh liye lie baad pehle chahiye chahie sakta sakti sakte wala wali wale ek koi kuch sab batao bataye bataiye btao plz pls hota hoti hote jata jati jaye jaana jana milega milegi".split(/\s+/);

const DEVANAGARI_WORDS = "क्या कैसे कैसा कब कहाँ कहां क्यों कौन है हैं हो होगा था थी के की का को से में मैं मुझे मेरा मेरी हम आप और या भी तो लिए बाद पहले चाहिए सकता सकती सकते वाला वाली एक कोई कुछ करना करने करें कर बताइए बताएं आयुर्वेद छात्र".split(/\s+/);

export const STOPWORDS = new Set([...FUNCTION_WORDS, ...DOMAIN_WORDS, ...HINGLISH_WORDS, ...DEVANAGARI_WORDS]);

/** Words that survive the stopword pass when a question has nothing else (e.g. "What after BAMS?"). */
const FALLBACK_STOP = new Set(FUNCTION_WORDS);

/** Multi-word and punctuated forms → one canonical token. Applied before punctuation is stripped. */
const PHRASES = [
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
  // Romanised Hindi and Devanagari forms of the same ideas.
  videsh: "abroad", taiyari: "prepare", tayari: "prepare", shodh: "research",
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
  return normalizeText(text).split(" ").filter(Boolean);
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
    qTok = wordsToTokens(qWords, FALLBACK_STOP, fold);
    fallback = qTok.length > 0;
  }
  const all = [...qTok, ...cTok];
  const surface = new Map();
  all.forEach(({ t, raw }) => { if (!surface.has(t)) surface.set(t, raw); });
  return {
    seq: all.map(x => x.t),
    qSeq: qTok.map(x => x.t),
    set: new Set(all.map(x => x.t)),
    q: new Set(qTok.map(x => x.t)),
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
  return fold;
}

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
  return 0.55 * wJac + 0.35 * jac + 0.10 * bgJac;
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
function joins(link, threshold) {
  return link.best >= threshold && link.mean >= threshold * 0.6;
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

function longestQuestion(members) {
  return members.reduce((a, c) => {
    const la = String(a.question || "").length;
    const lc = String(c.question || "").length;
    if (lc > la) return c;
    if (lc === la && String(c.id) < String(a.id)) return c;
    return a;
  }, members[0]);
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

function describeMembers(members) {
  const rep = longestQuestion(members);
  return {
    representative: String(rep.question || ""),
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
    out.push({
      ...c,
      theme: c.theme || members[0].theme || "",
      subtheme: c.subtheme ?? (members[0].subtheme || ""),
      memberIds: ids,
      ...describeMembers(members),
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
          if (joins(link, packThresh) && link.best > bestScore) { bestScore = link.best; bestJ = j; }
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
      ...describeMembers(f.members),
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
    const rep = ordered.reduce((a, c) => (String(c.representative || "").length > String(a.representative || "").length ? c : a), ordered[0]);
    const pool = [];
    ordered.forEach(c => [c.representative, ...(c.variants || [])].forEach(v => {
      const s = String(v || "");
      if (s && s !== rep.representative && !pool.includes(s)) pool.push(s);
    }));
    wording = { representative: String(rep.representative || ""), variants: pool.slice(0, VARIANT_CAP), kind: memberIds.length >= 2 ? "merged" : "unique" };
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
