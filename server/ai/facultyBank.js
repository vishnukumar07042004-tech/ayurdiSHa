/**
 * DISHA faculty Q&A bank: loads `data/faculty/*.json` (+ staff review overlays and uploaded
 * streams from `facultyStore.js`), seeds rule-based paraphrases in memory and matches a student
 * question to a faculty row. Local CPU only — no API calls.
 *
 * Score per indexed variant (question, question + keywords, bundled and rule paraphrases):
 *   W.bm25 × BM25 (normalised by the query's ideal score) + W.dice × IDF-weighted Dice
 *   + W.sim × merge.questionSimilarity, then the merge intent signature: a hard conflict
 *   (different countries / exams / branches / numbers) drops the variant, a clash of specific
 *   asks (cost vs licence) damps it, each unmatched strong subject damps it.
 * Entry score = best variant (+ stream boost when the persona stream is one of the entry's
 * related streams). `high` = score ≥ T.match and a margin over the next entry; `reuse` = high +
 * authoritative + score ≥ T.reuse. Thresholds tuned on tests/ai-eval/faculty-tuning.json only.
 * See docs/ai/FACULTY-BANK-SPEC.md §5.
 */

import fs from "node:fs";
import path from "node:path";
import { PREVIEW_ROOT } from "../env.js";
import { analyzeQuestion, intentSignature, pairVerdict, questionSimilarity } from "../../shared/merge.js";
import { STATUS_LABEL, bestAnswer, isAuthoritative, mergeEntry } from "../../shared/facultyWorkbook.js";
import { manifestSignature, readFacultySignature, readFacultyState } from "./facultyStore.js";

export const FACULTY_DIR = path.resolve(PREVIEW_ROOT, "data/faculty");

export const FACULTY_MATCH = Object.freeze({
  /** Weights of the three similarity terms (sum 1). */
  W: Object.freeze({ bm25: 0.2, dice: 0.4, sim: 0.4 }),
  /** Confident match (used in drafting). */
  match: 0.48,
  /** Approved / edited row this close → "reuse with light personalisation". */
  reuse: 0.7,
  /** Best entry must beat the next distinct entry by this much. */
  margin: 0.02,
  streamBoost: 0.03,
  /** Both ask for different specific things (cost vs licence). */
  askClash: 0.75,
  /** The student asks a specific thing (salary, cut-off, cost, location) the row does not. */
  askMissing: 0.8,
  softAskMissing: 0.92,
  /** A strong subject only the student names (PG, a country, teaching) / only the row names. */
  querySubjectMissing: 0.65,
  unmatchedSubject: 0.92,
  /** The student asks about another country / abroad and the row does not (rows are India-specific). */
  otherJurisdiction: 0.5,
  /** Product / pharma / business asks belong to other streams unless the row names them too. */
  businessSubjects: new Set(["product", "formulation", "pharma", "business", "brand", "startup"]),
  weakSubjectMissing: 0.85,
  /** Candidates below this are not returned at all. */
  floor: 0.15,
});

/** How often the stream manifests are checked for a new version (a full reload only on change). */
const STATE_CHECK_MS = 60 * 1000;
const EMPTY_STATE = Object.freeze({ entries: {}, overlays: {}, manifests: {}, streams: {} });

/* ---------------------------------------------------------------- */
/* Cross-lingual fold (Hinglish / Hindi → English canonical words)   */
/* ---------------------------------------------------------------- */

const XLING = [
  // Hinglish phrases first (multi-word), then single words.
  [/\b(?:bams|graduation|degree|internship)\s+ke\s+baad\b/gi, m => `after ${m.split(/\s+/)[0]}`],
  [/\bke\s+baad\b/gi, " after "],
  [/\b(?:shuru|start)\s+kar\w*\b/gi, " start "],
  [/\bkhol\w*\b/gi, " start "],
  [/\bseedh[ae]\b|\bsidh[ae]\b|\bturant\b|\bdirect(?:ly)?\b/gi, " immediately "],
  [/\b(?:angrezi|english|allopathy|allopathic)\s+(?:dawai|dawa|dawaiyan|medicines?)\b/gi, " allopathy medicine "],
  [/\b(?:dawai|dawa)\s+likh\w*\b|\blikh\s+(?:sakt\w*|skte)\b/gi, " prescribe "],
  [/\bdawai\w*\b|\bdawa\b/gi, " medicine "],
  [/\bmar(?:ee|i)[jz]\w*\b|\brogi\b/gi, " patient "],
  [/\bila+j\b/gi, " treatment "],
  [/\bkamai\b/gi, " income "],
  [/\bpaise?\b|\bpaisa\b/gi, " money "],
  [/\bfees?\s+kitn\w+\s+rakh\w*\b/gi, " set consultation fee "],
  [/\bbadh\w*\b|\bbadha\w*\b/gi, " attract "],
  [/\bnahi\s+chal\s+raha\b|\bloss\s+me\w*\b|\bghate\s+me\w*\b/gi, " financially struggling "],
  [/\bgalat\s+jaa?nkari\b/gi, " misinformation "],
  [/\bsaath\s+(?:me|mein)\b/gi, " together "],
  [/\bchhot[aie]\b/gi, " small "],
  [/\bkaam\b/gi, " work "],
  [/\bgaon\b/gi, " rural "],
  [/\bshahar\b/gi, " urban "],
  [/\bsikh\w*\b|\bseekh\w*\b/gi, " learn "],
  [/\bshikayat\b/gi, " complaint "],
  [/\bvigyapan\b/gi, " advertise "],
  [/\bbima\b/gi, " insurance "],
  [/\bkanoo?ni\b/gi, " legal "],
  [/\b(?:apna|apni|apne|hu|hoon|hun|de|dena|dete|deni|naye?|nayi)\b/gi, m => (/^nay/i.test(m) ? " new " : " ")],
  [/\b(?:should\s*n[o']t|not|never)\s+(?:do|use|offer|give|be\s+used|suitable|appropriate|advisable|recommended)\b|\bunsuitable\b/gi, " inappropriate "],
  [/\bsafe(?:ly)?\b/gi, " safety "],
  [/\babu\s+dhabi\b|\bsharjah\b/gi, " uae "],
  // Domain phrasing.
  [/\btele[\s-]?(?:consult\w*|medicine)\b|\bvideo\s+(?:call\s+)?consult\w*\b|\bvirtual\s+consult\w*\b|\bonline\s+consult\w*\b|\bconsult\w*\s+online\b/gi, " online consultation "],
  [/\bfreshers?\b|\bnew\s+(?:bams\s+)?graduates?\b|\bjust\s+graduated\b|\bpass[\s-]?outs?\b/gi, " fresher "],
  [/\bbls\b|\bcpr\b/gi, " basic life support "],
  [/\bdetox\b/gi, " detoxification "],
  [/\bmalpractice\s+insurance\b/gi, " indemnity insurance "],
  [/\bcme\b/gi, " continuing medical education "],
  // Devanagari.
  [/पंजीकरण|रजिस्ट्रेशन/g, " registration "],
  [/ऑनलाइन/g, " online "],
  [/परामर्श|कंसल्टेशन/g, " consultation "],
  [/मरीज़?\S*|रोगी/g, " patient "],
  [/(?:दवा|दवाई)\s+लिख\S*/g, " prescribe "],
  [/दवा\S*/g, " medicine "],
  [/खोल\S*/g, " start "],
  [/शुरू/g, " start "],
  [/निजी/g, " private "],
  [/प्रैक्टिस/g, " practice "],
  [/बीएएमएस/g, " bams "],
  [/के\s+बाद/g, " after "],
  [/तुरंत|सीधे/g, " immediately "],
  [/क्लिनिकल/g, " clinical "],
  [/करियर/g, " career "],
  [/विकल्प/g, " options "],
  [/कौशल/g, " skills "],
  [/विज्ञापन/g, " advertise "],
  [/फीस|शुल्क/g, " fee "],
  [/बीमा/g, " insurance "],
  [/आपातकाल\S*|इमरजेंसी/g, " emergency "],
  [/सहमति/g, " consent "],
  [/गोपनीयता/g, " privacy "],
  [/शिकायत/g, " complaint "],
  [/चिकित्सा\s+अधिकारी/g, " medical officer "],
  [/एलोपैथ\S*|अंग्रेजी\s+दवा/g, " allopathy "],
  [/एमडी|एम\.डी\./g, " md "],
  [/ज़रूरी|जरूरी|आवश्यक/g, " necessary "],
  [/खर्च\S*|लागत|बजट/g, " cost "],
  [/छोटा|छोटे/g, " small "],
  [/नए|नया|नई/g, " new "],
  [/बढ़ा\S*|बढा\S*/g, " attract "],
  [/डॉक्टर/g, " doctor "],
  [/प्रतिष्ठा/g, " reputation "],
  [/ग्रामीण/g, " rural "],
  [/शहरी/g, " urban "],
  [/कानूनी/g, " legal "],
  [/प्रशिक्षण/g, " training "],
  [/निदान/g, " diagnostic "],
  [/आत्मविश्वास/g, " confidence "],
];

export function foldFacultyText(text) {
  let s = String(text || "");
  for (const [re, rep] of XLING) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

export function analyseFaculty(text) {
  return analyzeQuestion(foldFacultyText(text), "");
}

/* ---------------------------------------------------------------- */
/* Rule-based paraphrase seeds (offline)                             */
/* ---------------------------------------------------------------- */

const CONTENT_STOP = new Set("a an the and or of to in on at by for with is are am be can could should would will i my me we you your it its this that what which how when where who why do does did there their them they from as into about vs any every some other another".split(" "));

function stripQ(q) {
  return String(q || "").replace(/[?!.]+\s*$/, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function lowerNorm(q) {
  return stripQ(q).toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s/-]/g, " ").replace(/\s+/g, " ").trim();
}

function keywordForm(entry) {
  const words = lowerNorm(entry.question).split(" ").filter(w => w.length > 2 && !CONTENT_STOP.has(w));
  const sub = String(entry.subcategory || "").toLowerCase();
  const kws = (entry.keywords || []).filter(k => k && k !== sub && !sub.startsWith(k) && !words.includes(k));
  return [...new Set([...words, ...kws])].join(" ");
}

/** English question-word swaps ("How can I X" → "how to X", "Can I X" → "is it possible to X"). */
const SWAPS = [
  [/^can i (.+)$/, ["is it possible to $1", "am i allowed to $1", "can a bams graduate $1"]],
  [/^can (?:a |an )?(?:bams|ayurveda) (?:graduates?|doctors?) (.+)$/, ["can i $1", "is a bams doctor allowed to $1"]],
  [/^how (?:can|do|should) i (.+)$/, ["how to $1", "tips to $1", "best way to $1"]],
  [/^how (?:can|should|do) (?:a |an )?(.+)$/, ["how to make $1", "ways $1"]],
  [/^what should (?:i|a new clinic) do (.+)$/, ["what to do $1", "steps $1"]],
  [/^what should i (.+)$/, ["what to $1", "what do i need to $1"]],
  [/^what is (.+)$/, ["explain $1", "meaning of $1"]],
  [/^what are (.+)$/, ["list of $1", "tell me $1"]],
  [/^should i (.+)$/, ["is it worth it to $1", "do i need to $1"]],
  [/^do i need (.+)$/, ["is $1 necessary", "is $1 compulsory"]],
  [/^when should i (.+)$/, ["right time to $1", "when to $1"]],
  [/^when is (.+)$/, ["in which cases is $1"]],
  [/^is it better to (.+)$/, ["$1 - which is better", "what is better: $1"]],
  [/^which (.+)$/, ["what $1"]],
  [/^where should (?:an? |the )?(.+)$/, ["where to $1"]],
  [/^are (.+) available$/, ["is it possible to get $1", "how to get $1"]],
];

/** Hinglish ask templates keyed on the English question's opening. */
const HINGLISH_ASK = [
  [/^(?:how (?:can|do|should) i|how to)\s+/, "kaise kare"],
  [/^can i\s+/, "kar sakte hai kya"],
  [/^can (?:a |an )?\w+ (?:graduates?|doctors?|centre|clinic)?\s*/, "kar sakte hai kya"],
  [/^what should i do\s+/, "kya kare"],
  [/^what should i\s+/, "kya karna chahiye"],
  [/^should i\s+/, "karna chahiye kya"],
  [/^do i need\s+/, "zaroori hai kya"],
  [/^when should i\s+/, "kab kare"],
  [/^when is\s+/, "kab"],
  [/^(?:which|what) (?:are|is)?\s*/, "kya hai"],
  [/^is it better to\s+/, "kya better hai"],
  [/^where should (?:an? )?\w*\s*/, "kahan kare"],
  [/^are\s+/, "milte hai kya"],
];

const HINGLISH_PHRASE = [
  [/\bafter (?:completing )?bams\b/g, "bams ke baad"],
  [/\bafter internship\b/g, "internship ke baad"],
  [/\b(?:open(?:ing)?|start(?:ing)?|set(?:ting)? up) (?:an? |my own |own )?(?:\w+ )?clinic\b/g, "clinic kholna"],
  [/\bstart\b/g, "shuru"],
  [/\bpatients?\b/g, "patients"],
  [/\bmoney\b/g, "paisa"],
  [/\bjobs?\b/g, "naukri"],
  [/\bgovernment\b/g, "sarkari"],
  [/\bmodern medicines?\b/g, "allopathy dawai"],
];

/** Intent rewrites students commonly use, fired by the faculty question's own wording. */
const INTENT_REWRITES = [
  [/career options? .*after bams|options .*after bams/i, ["BAMS ke baad kya kare", "bams ke baad clinical career options kya hai", "what to do after bams in clinical field"]],
  [/start private clinical practice/i, ["bams ke baad private practice shuru kar sakte hai kya", "can i open my own practice right after bams"]],
  [/before opening an ayurveda clinic/i, ["clinic kholna hai kya kare", "apna clinic kholna hai, kaise shuru kare"]],
  [/join a hospital or open a clinic/i, ["hospital join kare ya clinic khole", "job or own clinic after bams"]],
  [/budget for a small consultation clinic/i, ["clinic kholne me kitna paisa lagega", "cost of opening a small ayurveda clinic"]],
  [/registrations or licences/i, ["clinic ke liye license kaise milega", "licence needed to open ayurveda clinic"]],
  [/consultation fees/i, ["consultation fees kitni rakhe", "how much to charge per consultation"]],
  [/government ayurveda medical officer/i, ["sarkari naukri ayurveda medical officer", "govt AMO job for bams"]],
  [/prescribe modern medicines/i, ["kya bams doctor allopathy dawai likh sakta hai", "can bams doctors give allopathic medicines"]],
  [/consultations online/i, ["online consultation de sakte hai kya", "can i do teleconsultation as ayurveda doctor"]],
  [/need an md\/ms to practise/i, ["practice ke liye md zaroori hai kya", "is pg necessary for ayurveda practice"]],
  [/career focused on panchakarma/i, ["panchakarma me career kaise banaye", "how to become panchakarma specialist"]],
  [/attract patients ethically/i, ["clinic me patients kaise laye", "how to get more patients in new clinic"]],
];

function hinglishFor(entry) {
  const q = lowerNorm(entry.question);
  const out = [];
  let ask = "ke baare me batao";
  let core = q;
  for (const [re, a] of HINGLISH_ASK) {
    if (re.test(q)) { ask = a; core = q.replace(re, ""); break; }
  }
  core = core.replace(/\b(?:i|my|me|a|an|the|for|to|of|in)\b/g, " ");
  for (const [re, rep] of HINGLISH_PHRASE) core = core.replace(re, rep);
  core = core.replace(/\s+/g, " ").trim();
  if (core) out.push(`${core} ${ask}`);
  return out;
}

/** Offline paraphrase seeds for one entry: `[{ text, lang, persona, source: "rule" }]`. */
export function ruleParaphrases(entry) {
  const q = lowerNorm(entry.question);
  const out = [];
  const add = (text, lang = "en") => {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t && t !== q && !out.some(p => p.text === t)) out.push({ text: t, lang, persona: "student", source: "rule" });
  };
  add(q);
  add(keywordForm(entry));
  for (const [re, forms] of SWAPS) {
    if (!re.test(q)) continue;
    forms.forEach(f => add(q.replace(re, f)));
    break;
  }
  hinglishFor(entry).forEach(t => add(t, "hinglish"));
  for (const [re, forms] of INTENT_REWRITES) {
    if (re.test(entry.question)) forms.forEach(f => add(f, /\b(?:kya|ke|kare|hai|kaise|kitna|zaroori|sakte|sakta)\b/.test(f) ? "hinglish" : "en"));
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Loading (bundle + staff state)                                    */
/* ---------------------------------------------------------------- */

let bundleCache = null;
let stateCache = { checkedAt: 0, ident: null, sig: null, pinned: false, state: EMPTY_STATE };
let registeredStore = null;
let indexCache = null;

export function loadFacultyBundles({ dir = FACULTY_DIR, fresh = false } = {}) {
  if (bundleCache && !fresh && bundleCache.dir === dir) return bundleCache.banks;
  const banks = [];
  try {
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".json")) continue;
      try {
        const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (b && b.streamId && Array.isArray(b.entries)) banks.push(b);
      } catch { /* skip a bad bundle */ }
    }
  } catch { /* no faculty bundles */ }
  bundleCache = { dir, banks };
  indexCache = null;
  return banks;
}

/** Apply one staff review overlay onto an entry. */
export function applyOverlay(entry, ov) {
  if (!ov) return entry;
  const out = { ...entry };
  if (ov.status) out.status = ov.status;
  if (ov.reviewer != null) out.reviewer = ov.reviewer;
  if (ov.notes != null) out.reviewerNotes = ov.notes;
  if (ov.answer) {
    out.approvedAnswer = ov.answer;
    out.answerEditedByFaculty = true;
  }
  out.statusText = STATUS_LABEL[out.status] || out.statusText;
  if (isAuthoritative(out.status)) out.approvedAnswer = out.approvedAnswer || out.enrichedAnswer || out.draftAnswer;
  else delete out.approvedAnswer;
  out.reviewedAt = ov.at || out.reviewedAt;
  out.reviewedBy = ov.by || out.reviewedBy;
  return out;
}

const stamp = t => Date.parse(t || "") || 0;

/**
 * Stored entry over its bundled baseline: the newer `updatedAt` wins (stored fields over the
 * bundle, enrichment kept). A newer bundle row that is still a draft keeps the stored review
 * status (a draft never demotes an uploaded approval / rejection).
 */
export function overlayStored(base, stored) {
  if (!base) return stored;
  if (!stored) return base;
  if (stamp(stored.updatedAt) >= stamp(base.updatedAt)) return mergeEntry(base, stored);
  if (base.status !== "draft" || !stored.status || stored.status === "draft") return base;
  const out = { ...base, status: stored.status, statusText: stored.statusText, reviewer: stored.reviewer || base.reviewer, reviewerNotes: base.reviewerNotes || stored.reviewerNotes || "" };
  if (isAuthoritative(out.status)) out.approvedAnswer = stored.approvedAnswer || base.enrichedAnswer || base.draftAnswer;
  return out;
}

/**
 * Effective banks: bundle ⊕ stored per-entry records (newer `updatedAt` wins; stream metadata
 * from the manifest) ⊕ staff review overlays. `state.streams` (legacy whole-stream uploads,
 * pre-migration) still merges with review columns winning.
 */
export function effectiveBanks(bundles, state = EMPTY_STATE) {
  const byStream = new Map(bundles.map(b => [b.streamId, { ...b, origin: "bundle" }]));
  for (const up of Object.values(state.streams || {})) {
    const prev = byStream.get(up.streamId);
    if (!prev) { byStream.set(up.streamId, { ...up, origin: "uploaded" }); continue; }
    const prevById = new Map(prev.entries.map(e => [e.id, e]));
    const entries = up.entries.map(e => mergeEntry(prevById.get(e.id), e));
    const seen = new Set(entries.map(e => e.id));
    prev.entries.forEach(e => { if (!seen.has(e.id)) entries.push(e); });
    byStream.set(up.streamId, { ...prev, ...up, entries, origin: "bundle+uploaded" });
  }
  const stored = new Map();
  for (const rec of Object.values(state.entries || {})) {
    if (!rec || !rec.data || !rec.id) continue;
    const sid = rec.streamId || rec.data.streamId;
    if (!stored.has(sid)) stored.set(sid, []);
    stored.get(sid).push({ ...rec.data, id: rec.id, streamId: rec.data.streamId || sid });
  }
  const manifests = state.manifests || {};
  for (const [sid, list] of stored) {
    const m = manifests[sid] || {};
    const meta = {
      ...(m.stream ? { stream: m.stream } : {}),
      ...(m.lastUploadAt ? { importedAt: m.lastUploadAt } : {}),
      ...(m.source ? { filename: m.source } : {}),
      ...((m.sources || []).length ? { sources: m.sources } : {}),
      ...((m.instructions || []).length ? { instructions: m.instructions } : {}),
    };
    const prev = byStream.get(sid);
    if (!prev) {
      const entries = [...list].sort((a, b) => a.id.localeCompare(b.id));
      byStream.set(sid, { version: 1, stream: list[0].stream || "", streamId: sid, sources: [], instructions: [], ...meta, entries, origin: "uploaded" });
      continue;
    }
    const byId = new Map(list.map(e => [e.id, e]));
    const entries = prev.entries.map(e => overlayStored(e, byId.get(e.id)));
    const known = new Set(prev.entries.map(e => e.id));
    list.filter(e => !known.has(e.id)).sort((a, b) => a.id.localeCompare(b.id)).forEach(e => entries.push(e));
    byStream.set(sid, { ...prev, ...meta, entries, origin: prev.origin === "bundle" ? "bundle+uploaded" : prev.origin });
  }
  const ov = state.overlays || {};
  return [...byStream.values()].map(b => ({ ...b, manifest: manifests[b.streamId] || null, entries: b.entries.map(e => applyOverlay(e, ov[e.id])) }));
}

/** The app store faculty review state lives in (set by facultyOps; used on KV backends). */
export function registerFacultyStore(store) {
  registeredStore = store || null;
}

/** Pin a state (tests): no store reads until `setFacultyStateForTests(null)`. */
export function setFacultyStateForTests(state) {
  stateCache = { checkedAt: 0, ident: null, sig: null, pinned: Boolean(state), state: state || EMPTY_STATE };
  indexCache = null;
}

export function invalidateFaculty({ bundles = false } = {}) {
  stateCache = { ...stateCache, checkedAt: 0, sig: null };
  if (bundles) bundleCache = null;
  indexCache = null;
}

const identOf = h => (h && (h.name === "firestore" || h.backend === "firestore") ? "firestore" : h || null);

/**
 * Refresh staff state; `handle` = app store or AI store adapter. The stream manifests are
 * checked at most every 60 s (`check: true` checks now) and the entries reloaded only when a
 * manifest version changed; `fresh: true` always reloads. Never throws.
 */
export async function refreshFacultyState(handle, { fresh = false, check = false } = {}) {
  if (stateCache.pinned) return stateCache.state;
  const h = (handle && handle.backend === "firestore") ? handle : (registeredStore || handle);
  const ident = identOf(h);
  const now = Date.now();
  const same = stateCache.ident === ident && stateCache.sig != null;
  if (same && !fresh && !check && now - stateCache.checkedAt < STATE_CHECK_MS) return stateCache.state;
  try {
    if (same && !fresh) {
      const sig = await readFacultySignature(h);
      if ((sig ?? "") === stateCache.sig) {
        stateCache = { ...stateCache, checkedAt: now };
        return stateCache.state;
      }
    }
    const state = await readFacultyState(h);
    stateCache = { checkedAt: now, ident, sig: manifestSignature(state.manifests), pinned: false, state };
  } catch {
    stateCache = stateCache.ident === ident ? { ...stateCache, checkedAt: now } : { checkedAt: now, ident, sig: null, pinned: false, state: EMPTY_STATE };
  }
  indexCache = null;
  return stateCache.state;
}

/** The staff state last loaded by `refreshFacultyState`. */
export function facultyState() {
  return stateCache.state;
}

/** `reviews: false` = without the staff review overlays (the import merge needs the base rows). */
export function facultyBanks({ reviews = true } = {}) {
  const state = stateCache.state;
  return effectiveBanks(loadFacultyBundles(), reviews ? state : { ...state, overlays: {} });
}

/* ---------------------------------------------------------------- */
/* Index + match                                                     */
/* ---------------------------------------------------------------- */

function bm25Idf(N, df) {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

/** Build the in-memory index over `entries` (rejected rows are never indexed). */
export function buildFacultyIndex(entries) {
  const live = (entries || []).filter(e => e && e.id && e.question && e.status !== "rejected");
  const variants = [];
  live.forEach((e, ei) => {
    const sub = String(e.subcategory || "").toLowerCase();
    const kws = (e.keywords || []).filter(k => k && k !== sub && !sub.startsWith(k));
    const texts = [
      { text: e.question, kind: "question" },
      { text: `${e.question} ${kws.join(" ")}`, kind: "keywords" },
      ...(e.paraphrases || []).map(p => ({ text: typeof p === "string" ? p : p.text, kind: "paraphrase" })),
      ...ruleParaphrases(e).map(p => ({ text: p.text, kind: "rule" })),
    ];
    const seen = new Set();
    for (const t of texts) {
      if (!t.text) continue;
      const a = analyseFaculty(t.text);
      const sig = a.seq.join(" ");
      if (!a.set.size || seen.has(sig)) continue;
      seen.add(sig);
      variants.push({ ei, text: t.text, kind: t.kind, a, len: a.seq.length });
    }
  });
  const df = new Map();
  live.forEach((_, ei) => {
    const toks = new Set();
    variants.filter(v => v.ei === ei).forEach(v => v.a.set.forEach(t => toks.add(t)));
    toks.forEach(t => df.set(t, (df.get(t) || 0) + 1));
  });
  const N = live.length || 1;
  const idf = new Map([...df].map(([t, n]) => [t, bm25Idf(N, n)]));
  const avgLen = variants.reduce((n, v) => n + v.len, 0) / (variants.length || 1) || 1;
  const posting = new Map();
  variants.forEach((v, vi) => {
    v.tf = new Map();
    v.a.seq.forEach(t => v.tf.set(t, (v.tf.get(t) || 0) + 1));
    v.mass = [...v.a.set].reduce((n, t) => n + (idf.get(t) || 0), 0);
    v.a.set.forEach(t => { if (!posting.has(t)) posting.set(t, []); posting.get(t).push(vi); });
  });
  return { entries: live, variants, df, idf, N, avgLen, posting };
}

function currentIndex() {
  if (indexCache) return indexCache;
  const entries = facultyBanks().flatMap(b => b.entries);
  indexCache = buildFacultyIndex(entries);
  return indexCache;
}

const SOFT_ASKS = new Set(["necessity", "legal", "eligibility", "compare", "timeline"]);

/** Intent-signature damping beyond pairVerdict: what the student asks that the faculty row does not cover. */
function intentFactor(qa, va, verdict, T) {
  const x = intentSignature(qa);
  const y = intentSignature(va);
  let f = 1;
  if (verdict.ask === "clash") f *= T.askClash;
  else {
    for (const k of x.asks) if (!y.asks.has(k)) f *= SOFT_ASKS.has(k) ? T.softAskMissing : T.askMissing;
  }
  const abroadOnly = (x.strong.has("abroad") || [...x.strong].some(s => s.startsWith("country:"))) && !y.strong.has("abroad");
  if (abroadOnly) f *= T.otherJurisdiction;
  for (const s of verdict.unmatched) {
    if (abroadOnly && (s === "abroad" || s.startsWith("country:"))) continue;
    f *= x.strong.has(s) ? T.querySubjectMissing : T.unmatchedSubject;
  }
  for (const s of x.weak) if (!y.weak.has(s) && !y.strong.has(s) && T.businessSubjects.has(s)) f *= T.weakSubjectMissing;
  return f;
}

function scoreVariant(idx, qa, qTerms, ideal, qMass, v, W, T) {
  const k1 = 1.2;
  const b = 0.75;
  let bm = 0;
  let inter = 0;
  for (const t of qTerms) {
    const f = v.tf.get(t);
    if (!f) continue;
    const w = idx.idf.get(t) || 0;
    inter += w;
    bm += w * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (v.len / idx.avgLen)));
  }
  if (!inter) return { score: 0 };
  const bmNorm = Math.min(1, ideal ? bm / ideal : 0);
  const dice = (2 * inter) / ((qMass + v.mass) || 1);
  const sim = questionSimilarity(qa, v.a, idx.df);
  let score = W.bm25 * bmNorm + W.dice * dice + W.sim * sim;
  const verdict = pairVerdict(qa, v.a, score);
  if (verdict.conflict) return { score: 0, conflict: verdict.conflict };
  score *= intentFactor(qa, v.a, verdict, T);
  return { score, bm25: bmNorm, dice, sim, ask: verdict.ask, unmatched: verdict.unmatched };
}

/**
 * @param {string} question
 * @param {{ streamId?: string, limit?: number, index?: object, thresholds?: object }} [opts]
 * @returns {{ id: string, score: number, status: string, decision: "reuse"|"high"|"weak", margin: number, variant: string, entry: object }[]}
 */
export function match(question, { streamId = "", limit = 3, index, thresholds = {} } = {}) {
  const T = { ...FACULTY_MATCH, ...thresholds, W: { ...FACULTY_MATCH.W, ...(thresholds.W || {}) } };
  const idx = index || currentIndex();
  if (!idx.variants.length || !String(question || "").trim()) return [];
  const qa = analyseFaculty(question);
  const qTerms = [...qa.set];
  if (!qTerms.length) return [];
  const qLen = qa.seq.length || 1;
  const ideal = qTerms.reduce((n, t) => n + (idx.idf.get(t) || 0) * 2.2 / (1 + 1.2 * (0.25 + 0.75 * (qLen / idx.avgLen))), 0);
  const qMass = qTerms.reduce((n, t) => n + (idx.idf.get(t) || 0), 0);
  const cand = new Set();
  qTerms.forEach(t => (idx.posting.get(t) || []).forEach(vi => cand.add(vi)));
  const best = new Map();
  for (const vi of cand) {
    const v = idx.variants[vi];
    const r = scoreVariant(idx, qa, qTerms, ideal, qMass, v, T.W, T);
    if (!r.score) continue;
    const prev = best.get(v.ei);
    if (!prev || r.score > prev.score) best.set(v.ei, { ...r, variant: v.text, kind: v.kind });
  }
  const scored = [...best.entries()].map(([ei, r]) => {
    const entry = idx.entries[ei];
    const boost = streamId && (entry.relatedStreams || [entry.streamId]).includes(streamId) ? T.streamBoost : 0;
    return { entry, score: Math.min(1, r.score + boost), r };
  }).filter(x => x.score >= T.floor).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x, i) => {
    const next = scored[i + 1];
    const margin = next ? x.score - next.score : x.score;
    const high = i === 0 && x.score >= T.match && margin >= T.margin;
    const decision = high && isAuthoritative(x.entry.status) && x.score >= T.reuse ? "reuse" : high ? "high" : "weak";
    return {
      id: x.entry.id,
      score: Math.round(x.score * 1000) / 1000,
      status: x.entry.status,
      decision,
      margin: Math.round(margin * 1000) / 1000,
      variant: x.r.variant,
      entry: x.entry,
    };
  });
}

/* ---------------------------------------------------------------- */
/* Drafting context                                                  */
/* ---------------------------------------------------------------- */

export function statusInstruction(status, mode) {
  if (mode === "reuse") return "faculty-validated, near-identical question: keep this answer's substance and personalise the wording to the student's stage and language";
  if (isAuthoritative(status)) return "faculty-validated: the authoritative position — keep it, adapt it to the student";
  return "faculty draft, unvalidated: use only for framing and coverage, never as authority; facts still need cited official passages";
}

/** Faculty answer block for the drafting prompt. */
export function formatFacultyContext(entry, { status = entry.status, mode = "high" } = {}) {
  const lines = [
    `FACULTY_ANSWER ${entry.id} (${statusInstruction(status, mode)})`,
    entry.audience ? `Written for: ${entry.audience}` : "",
    `Faculty question: ${entry.question}`,
    `Answer: ${bestAnswer(entry)}`,
    (entry.actions || []).length ? `Next steps: ${entry.actions.map((a, i) => `${i + 1}. ${a}`).join(" ")}` : "",
    entry.mistake ? `Mistake to avoid: ${entry.mistake}` : "",
    entry.verifyLocally ? `Verify locally: ${entry.verifyLocally}` : "",
    (entry.sources || []).length ? `Official sources named by faculty: ${entry.sources.join(" ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Best confident faculty match for a question, formatted for the drafting prompt, or null.
 * `bankEntry` is shaped like a retrieve() bank row so the drafter puts it first in the prompt.
 * Never auto-sends anything: the result only changes the prompt and adds provenance.
 * @param {string} question
 * @param {string} [streamId]
 * @param {{ aiStore?: object, store?: object }} [opts]
 */
export async function facultyContext(question, streamId = "", { aiStore, store } = {}) {
  if (process.env.AI_FACULTY_BANK === "off") return null;
  await refreshFacultyState(store || aiStore);
  const [top] = match(question, { streamId, limit: 2 });
  if (!top || top.decision === "weak") return null;
  const mode = top.decision;
  const text = formatFacultyContext(top.entry, { mode });
  const provenance = {
    facultyBankId: top.id,
    status: top.status,
    statusLabel: STATUS_LABEL[top.status] || top.status,
    authoritative: isAuthoritative(top.status),
    score: top.score,
    mode,
  };
  return {
    ...provenance,
    text,
    provenance,
    bankEntry: {
      id: top.id,
      source: `faculty-${top.status}`,
      // Never an "approved answer": the drafter reads it as FACULTY_ANSWER, so reuse / suggestions ignore it.
      approved: false,
      targetType: "faculty",
      targetId: top.id,
      question: top.entry.question,
      answer: text,
      actions: top.entry.actions || [],
      mistake: top.entry.mistake || "",
      score: top.score,
      overlap: top.score,
      faculty: provenance,
    },
  };
}

/** `{ facultyBankId, status }` from a saved draft record (meta.retrieval.bank), or null. */
export function facultyProvenance(draftRec) {
  const bank = draftRec && draftRec.meta && draftRec.meta.retrieval && draftRec.meta.retrieval.bank;
  const hit = Array.isArray(bank) && bank.find(b => b && /^faculty-/.test(String(b.source || "")));
  return hit ? { facultyBankId: hit.id, status: String(hit.source).slice("faculty-".length), score: hit.overlap } : null;
}
