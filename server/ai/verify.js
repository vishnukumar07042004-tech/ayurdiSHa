/**
 * Second opinion on a draft. A separate model call (AI_VERIFY_MODEL) splits the draft into atomic
 * factual claims and labels each against the cited chunk texts; deterministic checks then
 * override it:
 *  - every citation must point at a retrieved chunk whose URL is on the allow-list;
 *  - every number in a claim must appear in one of its chunks;
 *  - fees / dates / cut-offs / seats / eligibility need a regulator-grade chunk published or
 *    fetched within 12 months, else the claim is "outdated";
 *  - any unsupported claim makes the draft high-risk.
 */

import { authorityRank, isRegulatorGrade, urlAllowed, loadAllowList } from "./sources.js";
import { normalizeUsage, sumUsage } from "./usage.js";
import { CITE_GROUP, citeIds, stripCitationMarks } from "../../shared/citations.js";

export { CITE_GROUP, citeIds, stripCitationMarks };

const YEAR_MS = 365 * 24 * 3600 * 1000;
export const TIME_SENSITIVE_CLAIM = /(?:₹|\brs\.?\s?\d|\binr\b|\blakh|\bfees?\b|\bseats?\b|\bcut-?offs?\b|\bcutoff\b|\bpercentile\b|\brank\b|\blast date\b|\bdeadline\b|\bnotification\b|\bexam (?:date|on|in)\b|\bage limit\b|\beligib\w*|\battempts?\b|\bstipend\b|\bvacanc\w*|\b20\d\d\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b)/i;

function sentences(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

/** "2025-26" / "2025–2026" / "2025/26" → "2025 2026" so either side of a session matches. */
function expandYearRanges(text) {
  return String(text || "").replace(/\b(19|20)(\d\d)\s*[-–—/]\s*(?:(19|20))?(\d\d)\b/g, (_, c1, y1, c2, y2) => `${c1}${y1} ${c2 || c1}${y2}`);
}

export function numbersIn(text) {
  const out = [];
  const t = expandYearRanges(stripCitationMarks(text)).replace(/^\s*\d{1,2}[.)]\s+/gm, "");
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    if (n.length) out.push(n);
  }
  return [...new Set(out)];
}

/** Body text plus the title and publication date: a year often lives only in "NEET-PG 2025 bulletin". */
function chunkNumberText(ch) {
  if (!ch || typeof ch !== "object") return String(ch || "");
  const published = ch.publishedAt ? String(typeof ch.publishedAt === "number" ? new Date(ch.publishedAt).toISOString() : ch.publishedAt) : "";
  return [ch.text, ch.title, published].filter(Boolean).join("\n");
}

export function chunkHasNumber(chunk, n) {
  const flat = expandYearRanges(chunkNumberText(chunk)).replace(/(\d),(?=\d)/g, "$1");
  return new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}([^\\d]|$)`).test(flat);
}

function chunkDate(c) {
  const raw = c && (c.publishedAt || c.fetchedAt);
  if (!raw) return 0;
  const t = typeof raw === "number" ? raw : Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function isFresh(c, now = Date.now()) {
  const t = chunkDate(c);
  return t > 0 && now - t <= YEAR_MS;
}

/** Draft fields as one text with labelled lines, for the verifier and for fallback claims. */
function draftText(d) {
  return [
    d.answer,
    ...(d.actions || []).map(a => `Next step: ${a}`),
    d.mistake ? `Mistake to avoid: ${d.mistake}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Lines that state something checkable — the deterministic safety net. Answer sentences count if
 * they carry a number, a time-sensitive term or a citation; next steps / the mistake only if they
 * carry a number (advice like "check the eligibility rules" is not a fact).
 */
function factualSentences(d, guidanceMode = false) {
  // Mentor-assist drafts tell the student where to check ("read the eligibility section"): only numbers and citations make a sentence a fact.
  const factual = s => /\d/.test(stripCitationMarks(s)) || /\[c:/.test(s) || (!guidanceMode && TIME_SENSITIVE_CLAIM.test(s));
  const answer = sentences(d.answer).filter(factual).map(text => ({ text, kind: "answer" }));
  const extras = [...(d.actions || []), d.mistake || ""].filter(x => /\d/.test(stripCitationMarks(x))).map(text => ({ text, kind: "extra" }));
  return [...answer, ...extras];
}

export const GUIDANCE_NOTE = "guidance (no source needed)";

const GUIDANCE_ADDENDUM = `
This draft was written with few or no sources. Label pure advice, next steps and "check with <official body>" suggestions as "guidance" (they need no source). Any statement of fact about an exam, body, rule, scheme, fee, date or number is a claim: "supported" only if a cited source states it, otherwise "unsupported".
Allowed statuses: "supported" | "unsupported" | "outdated" | "guidance".`;

const VERIFY_SYSTEM = `You are a strict fact checker for career guidance written for Ayurveda students, scholars and young practitioners.
You receive a DRAFT and the SOURCES it cites. Split the draft into atomic factual claims: facts, numbers, dates, fees, eligibility rules, names of exams, bodies, schemes or courses. Skip pure advice and encouragement ("plan early", "talk to seniors").
For each claim decide:
- "supported": a cited source states it explicitly (paraphrase is fine, numbers must match).
- "unsupported": no cited source states it, or a source contradicts it.
- "outdated": a source states it but for an earlier year / an older notice, or the claim depends on a figure that changes every year and the source is older than 12 months.
Also set "medicalAdvice": true if the QUESTION asks about anyone's health, symptoms, a medicine, a dose, a diet or how to treat a disease (even framed as a career question), or if the DRAFT gives diagnosis, medicine, dose, diet or treatment advice for a person; otherwise false.
Return JSON only: {"claims":[{"claim":"...","status":"supported|unsupported|outdated","chunkIds":["<source id>"],"note":"short reason"}],"medicalAdvice":false}`;

function claimsSchema(name, statuses) {
  return Object.freeze({
    name,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["claims", "medicalAdvice"],
      properties: {
        medicalAdvice: { type: "boolean" },
        claims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["claim", "status", "chunkIds", "note"],
            properties: {
              claim: { type: "string" },
              status: { type: "string", enum: statuses },
              chunkIds: { type: "array", items: { type: "string" } },
              note: { type: "string" },
            },
          },
        },
      },
    },
  });
}

/** OpenAI Structured Outputs for the verifier reply (other providers ignore it). */
export const VERIFY_JSON_SCHEMA = claimsSchema("disha_claims", ["supported", "unsupported", "outdated"]);
const VERIFY_GUIDANCE_JSON_SCHEMA = claimsSchema("disha_claims_guidance", ["supported", "unsupported", "outdated", "guidance"]);

/**
 * @param {object} args
 * @param {object} args.draft   `{answer, actions, mistake, citations:[{chunkId, quote}]}`
 * @param {Map<string, object>} args.chunksById  retrieved chunks (the only citable ones)
 * @param {object} [args.provider]
 * @param {string} [args.model]
 * @param {number} [args.now]
 * @param {number[]} [args.retrievalScores]
 */
export async function verifyDraft({ draft, chunksById, provider, model = "", role = "verify", now = Date.now(), retrievalScores = [], timeoutMs = 15000, guidanceMode = false, deadlineAt = 0, question = "" }) {
  const allow = loadAllowList();
  const flags = [];
  let usage = normalizeUsage(null);
  let medicalAdvice = false;

  // 1. Citation validity.
  const cited = [];
  const citations = Array.isArray(draft.citations) ? draft.citations : [];
  const markIds = citeIds(draftText(draft));
  const citedIds = [...new Set([...citations.map(c => String(c.chunkId || "")), ...markIds])].filter(Boolean);
  let invalidCitations = 0;
  for (const id of citedIds) {
    const c = chunksById.get(id);
    if (!c) { invalidCitations++; flags.push(`citation ${id} is not a retrieved source`); continue; }
    if (!urlAllowed(c.url, allow)) { invalidCitations++; flags.push(`citation ${id} is not on the trusted-source list`); continue; }
    cited.push(c);
  }
  const citedSet = new Set(cited.map(c => c.id));

  // 2. Model claim split + labels.
  let claims = [];
  let verifierUsed = false;
  const statuses = guidanceMode ? ["supported", "unsupported", "outdated", "guidance"] : ["supported", "unsupported", "outdated"];
  if (provider && typeof provider.chat === "function" && (cited.length || guidanceMode)) {
    try {
      // The verifier sees the same passage window the drafter saw (number checks below use the full chunk).
      const sources = cited.map(c => ({ id: c.id, title: c.title, url: c.url, authority: c.authority, date: c.publishedAt || c.fetchedAt || null, text: (c.window || c.text).slice(0, 2400) }));
      const r = await provider.chat({
        system: guidanceMode ? `${VERIFY_SYSTEM}\n${GUIDANCE_ADDENDUM}` : VERIFY_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ today: new Date(now).toISOString().slice(0, 10), ...(question ? { question: `<student>${String(question).slice(0, 1500)}</student>` } : {}), draft: draftText(draft), sources }) }],
        model: model || undefined,
        role,
        json: true,
        jsonSchema: guidanceMode ? VERIFY_GUIDANCE_JSON_SCHEMA : VERIFY_JSON_SCHEMA,
        maxTokens: 1400,
        timeoutMs,
        retries: 1,
        ...(deadlineAt ? { deadlineAt } : {}),
      });
      usage = sumUsage(usage, normalizeUsage(r && r.usage, r && r.model));
      const parsed = r && (r.json || safeJson(r.text));
      if (parsed && (parsed.medicalAdvice === true || String(parsed.medicalAdvice).toLowerCase() === "true")) medicalAdvice = true;
      if (parsed && Array.isArray(parsed.claims)) {
        claims = parsed.claims
          .filter(c => c && String(c.claim || "").trim())
          .slice(0, 30)
          .map(c => ({
            claim: String(c.claim).trim().slice(0, 400),
            status: statuses.includes(c.status) ? c.status : "unsupported",
            chunkIds: (Array.isArray(c.chunkIds) ? c.chunkIds : []).map(String),
            note: String(c.note || "").slice(0, 240),
          }));
        verifierUsed = true;
      }
    } catch (err) {
      flags.push(`verifier unavailable: ${String(err && err.message || err).slice(0, 120)}`);
    }
  }

  // 3. Safety net: every factual sentence must be covered by some claim.
  const covered = s => claims.some(c => overlapRatio(c.claim, s) >= 0.5);
  const factual = factualSentences(draft, guidanceMode);
  for (const { text: s, kind } of factual) {
    if (covered(s)) continue;
    let ids = citeIds(s);
    // Without a verifier (e.g. a reused approved answer) the whole citation list backs each
    // sentence; numbers in next steps are checked against every cited source.
    if (!ids.length && (!verifierUsed || kind === "extra")) ids = [...citedSet];
    claims.push({ claim: stripCitationMarks(s).slice(0, 400), status: ids.length ? "supported" : "unsupported", chunkIds: ids, note: verifierUsed ? "added by deterministic check" : "checked without a verifier model" });
  }
  if (guidanceMode) {
    const factualText = new Set(factual.map(f => f.text));
    for (const s of sentences(draft.answer)) {
      if (factualText.has(s) || covered(s)) continue;
      claims.push({ claim: stripCitationMarks(s).slice(0, 400), status: "guidance", chunkIds: [], note: GUIDANCE_NOTE });
    }
  }

  // 4. Deterministic overrides.
  for (const c of claims) {
    if (c.status === "guidance") {
      c.chunkIds = [];
      // A "guidance" label never launders a number.
      if (/\d/.test(c.claim)) { c.status = "unsupported"; c.note = joinNote(c.note, "states a number without a cited source"); }
      else { c.note = c.note || GUIDANCE_NOTE; continue; }
    }
    c.chunkIds = c.chunkIds.filter(id => citedSet.has(id));
    const chunks = c.chunkIds.map(id => chunksById.get(id)).filter(Boolean);
    if (!chunks.length) {
      if (c.status !== "unsupported") c.note = joinNote(c.note, "no valid cited source");
      c.status = "unsupported";
      continue;
    }
    const missing = numbersIn(c.claim).filter(n => !chunks.some(ch => chunkHasNumber(ch, n)));
    if (missing.length) {
      c.status = "unsupported";
      c.note = joinNote(c.note, `number ${missing.slice(0, 3).join(", ")} not found in the cited source`);
      continue;
    }
    if (TIME_SENSITIVE_CLAIM.test(c.claim) && c.status !== "unsupported") {
      const ok = chunks.some(ch => isRegulatorGrade(ch.authority) && isFresh(ch, now));
      if (!ok) {
        c.status = "outdated";
        c.note = joinNote(c.note, chunks.some(ch => isRegulatorGrade(ch.authority))
          ? "regulator source is older than 12 months"
          : "fees, dates, cut-offs and eligibility need a regulator source");
      }
    }
  }

  return { ...scoreClaims({ claims, cited, invalidCitations, retrievalScores }), flags, usage, verifierUsed, medicalAdvice };
}

/* ---------------------------------------------------------------- */
/* Post-draft safety scan (deterministic, any drafter)               */
/* ---------------------------------------------------------------- */

const SCAN_DRUG = "churna|choorna|vati|gutika|kashayam|kashaya|kwath|kwatha|kadha|kaadha|decoction|arishta|asava|ghrita|medicated ghee|taila|medicated oil|bhasma|ashwagandha|triphala|giloy|guduchi|tulsi|shilajit|chyawanprash|brahmi|haritaki|guggul\\w*|amla|aloe vera|turmeric|haldi|tablets?|capsules?|pills?|medicines?|syrups?|herbal (?:juice|powder|tea)";
const ADVICE_SCAN = [
  { id: "dose", re: /\b\d+(?:\.\d+)?\s?(?:-\s?\d+(?:\.\d+)?\s?)?(?:mg|mcg|ml|grams?|gm|tablets?|capsules?|pills?|spoons?|teaspoons?|tablespoons?|tsp|tbsp|drops)\b(?! (?:pack|packs|packaging|bottles?|jars?|units?|batch|batches|sachets?|sku|labels?|per (?:bottle|pack|strip|jar|box)))/i },
  { id: "frequency", re: /\b(?:(?:twice|thrice|once|two times|three times) (?:a day|daily)|on an empty stomach|empty stomach|at bed ?time|with (?:warm|lukewarm|hot) (?:water|milk)|before (?:meals|food|breakfast)|after (?:meals|food|dinner)|khali pet|din (?:mein|me) (?:do|teen|ek) baar)\b|(?:दिन में (?:दो|तीन|एक) बार|खाली पेट|गुनगुने पानी)/i },
  { id: "intake", re: new RegExp(`(?:^|[.!?:]\\s+|\\b(?:you|please|then|also|regularly|daily|should|can|may|must)\\s+)(?:take(?! (?:up|admission|samples?|a (?:job|drop|break|course|loan)|the (?:exam|test|aiapget)))|consume|drink|chew|swallow|apply(?! for| to| through| online)|massage|gargle)\\s+(?:\\w+\\s+){0,4}?(?:${SCAN_DRUG})\\b`, "im") },
  { id: "you-should", re: new RegExp(`\\b(?:you|your (?:mother|father|child|baby|son|daughter|patient|wife|husband)|she|he|they)\\s+(?:should|can|could|may|must|need to)\\s+(?:also\\s+)?(?:take|consume|drink|eat|avoid eating|apply(?! for)|stop|continue)\\b[^.]{0,40}\\b(?:${SCAN_DRUG}|diet|foods?)\\b`, "i") },
  { id: "cure-claim", re: /\b(?:best|effective|good|right) (?:medicine|remedy|treatment|herb|formulation) for (?:your|her|his|their|this|the) (?:condition|problem|disease|symptoms?|pain|mother|father|child|baby)\b|\bwill (?:cure|heal) (?:it|this|your|her|his)\b/i },
  { id: "hinglish", re: new RegExp(`\\b(?:dawa|dawai|goli|${SCAN_DRUG})\\b[^.]{0,30}\\b(?:lijiye|lein|le sakte hain|khaiye|khayein|pijiye|piyein|lagaiye|lagayein)\\b`, "i") },
  { id: "hindi", re: /(?:दवा|दवाई|गोली|चूर्ण|काढ़ा|अश्वगंधा|त्रिफला|गिलोय|औषधि)[^.।]{0,30}(?:लीजिए|लें|खाएं|पिएं|लगाएं)/ },
];

/**
 * Deterministic check that a draft does not give treatment / dosage advice (doses, schedules,
 * "take X churna", "you should drink…"). Runs on every draft whatever the drafter or verifier said.
 * @param {{answer?:string, actions?:string[], mistake?:string}} d
 * @returns {{ hit: boolean, id: string, match: string }}
 */
export function medicalAdviceScan(d) {
  const text = stripCitationMarks([d && d.answer, ...((d && Array.isArray(d.actions)) ? d.actions : []), d && d.mistake].filter(Boolean).map(String).join("\n"));
  for (const { id, re } of ADVICE_SCAN) {
    const m = text.match(re);
    if (m) return { hit: true, id, match: m[0].slice(0, 80) };
  }
  return { hit: false, id: "", match: "" };
}

function joinNote(a, b) {
  return [a, b].filter(Boolean).join("; ").slice(0, 240);
}

function overlapRatio(a, b) {
  const x = new Set(String(a).toLowerCase().match(/[a-z0-9]+/g) || []);
  const y = new Set(String(b).toLowerCase().match(/[a-z0-9]+/g) || []);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  y.forEach(w => { if (x.has(w)) inter++; });
  return inter / Math.min(x.size, y.size);
}

function safeJson(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* try fenced */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export { safeJson };

/** Confidence 0..1 and risk from claim support, source authority and retrieval strength. */
export function scoreClaims({ claims, cited, invalidCitations = 0, retrievalScores = [] }) {
  const facts = claims.filter(c => c.status !== "guidance");
  const n = facts.length;
  const supported = facts.filter(c => c.status === "supported").length;
  const unsupported = facts.filter(c => c.status === "unsupported").length;
  const outdated = facts.filter(c => c.status === "outdated").length;
  const guidance = claims.length - n;
  const support = n ? supported / n : (cited.length ? 0.8 : 0.4);
  const authority = cited.length ? cited.reduce((s, c) => s + authorityRank(c.authority), 0) / cited.length : 0;
  const top = retrievalScores.length ? Math.min(1, retrievalScores.slice(0, 3).reduce((s, x) => s + x, 0) / Math.min(3, retrievalScores.length)) : 0;
  let confidence = 0.6 * support + 0.25 * authority + 0.15 * top;
  if (unsupported || invalidCitations) confidence = Math.min(confidence, 0.35);
  else if (outdated) confidence = Math.min(confidence, 0.6);
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
  let risk = "low";
  if (unsupported || invalidCitations || !cited.length) risk = "high";
  else if (outdated || confidence < 0.7) risk = "medium";
  return {
    claimChecks: claims,
    confidence,
    risk,
    counts: { claims: n, supported, unsupported, outdated, invalidCitations, ...(guidance ? { guidance } : {}) },
  };
}
