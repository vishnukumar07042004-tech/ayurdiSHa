/**
 * Pure parts of faculty-row enrichment (no network): passage selection from the KB, the prompt
 * (DISHA answer standard, docs/ai/FACULTY-BANK-SPEC.md §7), parsing + checking the model's JSON,
 * and applying the result onto a bank entry. `enrich.mjs` adds the provider calls, spend cap and
 * file I/O.
 */

import { passageWindow } from "../../server/ai/draft.js";
import { parseJsonLoose } from "../../server/ai/provider.js";
import { TIME_SENSITIVE_ASK } from "../../server/ai/retrieve.js";
import { urlAllowed } from "../../server/ai/sources.js";

export const PARAPHRASE_PERSONAS = ["student", "intern", "practitioner", "career-switcher", "abroad-aspirant"];
export const FLAG_SET = ["needs-state-specific-check", "limited-sources", "clinical-safety-sensitive", "time-sensitive", "unsupported-claims-removed"];

const CITE = /\[\s*c:([^\]\s]+)\s*\]/g;
const NUMBER = /(?:₹|rs\.?|inr|\$)\s*\d[\d,.]*|\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent|lakh|lakhs|crore|years?|months?|weeks?|days?|hours?|seats?)\b|\b(?:19|20)\d{2}\b/gi;
const CLINICAL = /\b(?:dose|dosage|mg|ml|tablets?|twice daily|thrice|prescribe\w*|prescription|treat(?:ment)? protocol|patient-specific)\b/i;

function words(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function norm(s) {
  return String(s || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

export function stripCites(s) {
  return String(s || "").replace(/[ \t]*\[\s*c:[^\]]*\]/g, "").replace(/[ \t]+([.,;:])/g, "$1").trim();
}

/**
 * Up to `k` allow-listed passages: chunks from the row's own source URLs first, then the best KB
 * hits for question + keywords (at most two per URL).
 * @param {object} entry
 * @param {{ chunks: object[], bm25: { search: Function } }} kb  `loadKb()` result
 */
export function selectPassages(entry, kb, { allow, k = 6, chars = 1400 } = {}) {
  const query = [entry.question, ...(entry.keywords || []).slice(1)].join(" ");
  const ok = c => c && c.url && (!allow || urlAllowed(c.url, allow));
  const ranked = kb.bm25.search(query).filter(r => r.score > 0 && ok(r.doc)).sort((a, b) => b.score - a.score);
  const rowUrls = new Set(entry.sources || []);
  const own = ranked.filter(r => rowUrls.has(r.doc.url)).slice(0, 2);
  const perUrl = new Map();
  const out = [];
  for (const r of [...own, ...ranked]) {
    if (out.some(c => c.id === r.doc.id)) continue;
    const n = perUrl.get(r.doc.url) || 0;
    if (n >= 2) continue;
    perUrl.set(r.doc.url, n + 1);
    out.push({ id: r.doc.id, url: r.doc.url, title: r.doc.title, text: passageWindow(r.doc.text, query, chars), fullText: r.doc.text });
    if (out.length >= k) break;
  }
  return out;
}

export const ENRICH_RULES = `TASK: Write DISHA's enriched answer for one faculty Q&A row, plus paraphrases of the question.

DISHA ANSWER STANDARD (150–250 words, warm, clear, practical):
1. Direct answer in 1–2 sentences.
2. Short explanation with context and options.
3. Exactly 3 actionable next steps ("actions": imperative, doable this month).
4. One common mistake to avoid ("mistake").
5. 2–3 official sources: cite ONLY passages from SOURCES with inline markers like [c:<id>] after the sentence they support, and list them in "citations" with a short VERBATIM quote from that passage.
6. "verifyLocally": one line when rules vary by state (else "").

RULES:
- Keep the faculty draft's position; you expand and ground it, you do not contradict it. If a source contradicts the draft, say so in "notes".
- No invented numbers, dates, fees, eligibility, durations or salaries. A number may appear only if a cited passage states it; otherwise say where to check.
- Career guidance only: no diagnosis, prescriptions, doses or patient-specific treatment. Emergencies → "qualified emergency medical services".
- Audience-aware wording from "audience". No coaching institutes, agents or paid consultants.
- "flags": any of ${FLAG_SET.join(", ")}.
- "paraphrases": 8–10 different ways students would ask THIS question with the same meaning: mix English, Hinglish (Roman Hindi) and Hindi (Devanagari); short/casual and full forms; personas ${PARAPHRASE_PERSONAS.join(", ")}. Never change the ask (no different country, exam, cost vs licence).

Return JSON only:
{"answer": "...[c:id]...", "actions": ["", "", ""], "mistake": "", "verifyLocally": "", "citations": [{"chunkId": "", "quote": ""}], "flags": [], "notes": "", "paraphrases": [{"text": "", "lang": "en|hinglish|hi", "persona": "student"}]}`;

/**
 * GPT follows the persona's Ask Desk contract over TASK: its "## Rules" allow {"insufficient": true,
 * "reason": …} when SOURCES are thin and its "## Output" shape has no paraphrases, so GPT replied with
 * ~110 tokens and no "answer". The GPT prompt keeps only the persona's identity + expertise and says
 * TASK's object is the only output.
 */
export const ENRICH_OVERRIDE = `These instructions are the only output contract. Never return {"insufficient": ...}, a refusal or a partial object: when SOURCES are thin, still write the full answer from the faculty draft, cite only what SOURCES support, add "limited-sources" to "flags" and say where to check in "verifyLocally" or "notes". Every key of the JSON above is required, including 8–10 "paraphrases".`;

export const ENRICH_REPAIR = `That reply is not the required object. Do not return {"insufficient": ...}. Return the full JSON object from TASK now: "answer" (150–250 words grounded in the faculty draft, citing SOURCES where they support it), "actions" (exactly 3), "mistake", "verifyLocally", "citations", "flags" (add "limited-sources" if SOURCES are thin), "notes" and 8–10 "paraphrases".`;

/** Persona identity + expertise: everything before its first "## " section. */
export function personaBrief(persona) {
  const s = String(persona || "");
  const i = s.search(/^##\s/m);
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

/**
 * `{ system, messages }` for `provider.chat({ ..., json: true })`. `provider: "openai"` builds the
 * GPT variant (persona brief + ENRICH_OVERRIDE); any other value keeps the full persona.
 */
export function buildEnrichPrompt(entry, { persona = "", passages = [], sources = [], provider = "" } = {}) {
  const payload = {
    FACULTY_ROW: {
      id: entry.id,
      stream: entry.stream,
      subcategory: entry.subcategory,
      audience: entry.audience,
      question: entry.question,
      facultyDraftAnswer: entry.draftAnswer,
      keywords: (entry.keywords || []).slice(0, 10),
      sourcesNamedByFaculty: entry.sources || [],
      validationPriority: entry.priority,
    },
    SOURCES: passages.map(p => ({ id: p.id, url: p.url, title: p.title, text: p.text })),
    OFFICIAL_SOURCES_SHEET: sources.slice(0, 12).map(s => ({ name: s.name, url: s.url })),
  };
  const gpt = provider === "openai";
  const system = [(gpt ? personaBrief(persona) : String(persona || "").trim()), ENRICH_RULES, gpt ? ENRICH_OVERRIDE : ""].filter(Boolean).join("\n\n");
  return { system, messages: [{ role: "user", content: JSON.stringify(payload) }] };
}

/** Messages for one corrective turn after an unusable reply (the reply itself + ENRICH_REPAIR). */
export function enrichRepairMessages(prompt, reply) {
  const text = typeof reply === "string" ? reply : JSON.stringify(reply ?? {});
  return [...prompt.messages, { role: "assistant", content: text.slice(0, 4000) || "{}" }, { role: "user", content: ENRICH_REPAIR }];
}

function langOf(text, given) {
  const g = String(given || "").toLowerCase();
  if (["en", "hinglish", "hi"].includes(g)) return g;
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  return /\b(?:kya|kaise|hai|kare|karu|ke baad|chahiye|sakte|kitna)\b/i.test(text) ? "hinglish" : "en";
}

/**
 * Model JSON → checked enrichment. Citations must point at an offered passage with an
 * allow-listed URL and a verbatim quote; sentences with numbers no cited passage states are
 * removed (flag `unsupported-claims-removed`).
 * @returns {{ ok: boolean, error?: string, enrichedAnswer: string, answerMarked: string, actions: string[], mistake: string, verifyLocally: string, citations: object[], confidence: number, flags: string[], paraphrases: object[], notes: string, words: number, checks: object }}
 */
export function parseEnrichOutput(raw, { entry, passages = [], allow } = {}) {
  let j = raw;
  if (typeof raw === "string") {
    try { j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { j = parseJsonLoose(raw); }
  }
  if (j && typeof j === "object" && !Array.isArray(j) && !String(j.answer || "").trim()) {
    const inner = Object.values(j).find(v => v && typeof v === "object" && !Array.isArray(v) && String(v.answer || "").trim());
    if (inner) j = inner;
  }
  if (!j || typeof j !== "object" || !String(j.answer || "").trim()) {
    if (j && typeof j === "object" && j.insufficient) {
      return { ok: false, declined: true, error: `no answer in model output — declined as insufficient sources: ${String(j.reason || "no reason").replace(/\s+/g, " ").slice(0, 120)}` };
    }
    const keys = j && typeof j === "object" ? Object.keys(j).slice(0, 8) : [];
    return { ok: false, error: typeof raw === "string" && !raw.trim() ? "no answer in model output (empty reply)" : `no answer in model output${keys.length ? ` (keys: ${keys.join(", ")})` : ""}` };
  }
  const byId = new Map(passages.map(p => [p.id, p]));
  const flags = new Set((Array.isArray(j.flags) ? j.flags : []).map(f => String(f).trim()).filter(f => FLAG_SET.includes(f)));

  const citations = [];
  for (const c of Array.isArray(j.citations) ? j.citations : []) {
    const p = byId.get(String(c && c.chunkId || ""));
    if (!p || (allow && !urlAllowed(p.url, allow))) continue;
    const quote = String(c.quote || "").trim();
    if (!quote || !norm(p.fullText || p.text).includes(norm(quote))) continue;
    if (citations.some(x => x.chunkId === p.id)) continue;
    citations.push({ url: p.url, title: p.title || "", chunkId: p.id, quote: quote.slice(0, 400) });
  }
  const valid = new Set(citations.map(c => c.chunkId));
  const citedText = [entry && entry.question, entry && entry.draftAnswer, ...citations.map(c => byId.get(c.chunkId).fullText || byId.get(c.chunkId).text)].map(norm).join(" \n ");

  let removed = 0;
  const sentences = String(j.answer).replace(/\r/g, "").split(/(?<=[.!?](?:\s*\[\s*c:[^\]]*\])*)\s+(?=[A-Z0-9\u0900-\u097f"'(])|\n+/);
  const kept = sentences.map(s => s.replace(CITE, (m, id) => (valid.has(id) ? m : ""))).filter(s => {
    const nums = String(s).match(NUMBER) || [];
    const unsupported = nums.some(n => !citedText.includes(norm(n)));
    if (unsupported) removed++;
    return !unsupported && s.trim();
  });
  if (removed) flags.add("unsupported-claims-removed");
  const answerMarked = kept.join(" ").replace(/\s+/g, " ").trim();
  const enrichedAnswer = stripCites(answerMarked);

  const actions = (Array.isArray(j.actions) ? j.actions : []).map(a => String(a || "").trim()).filter(Boolean).slice(0, 3);
  const mistake = String(j.mistake || "").trim();
  const verifyLocally = String(j.verifyLocally || "").trim();
  if (verifyLocally) flags.add("needs-state-specific-check");
  if (citations.length < 2) flags.add("limited-sources");
  if (CLINICAL.test(`${entry && entry.question} ${enrichedAnswer}`)) flags.add("clinical-safety-sensitive");
  if (TIME_SENSITIVE_ASK.test(String(entry && entry.question || ""))) flags.add("time-sensitive");

  const seen = new Set([norm(entry && entry.question)]);
  const paraphrases = [];
  for (const p of Array.isArray(j.paraphrases) ? j.paraphrases : []) {
    const text = String(typeof p === "string" ? p : p && p.text || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 240 || seen.has(norm(text))) continue;
    seen.add(norm(text));
    const persona = PARAPHRASE_PERSONAS.includes(p && p.persona) ? p.persona : "student";
    paraphrases.push({ text, lang: langOf(text, p && p.lang), persona, source: "enrich" });
    if (paraphrases.length >= 10) break;
  }

  const n = words(enrichedAnswer);
  const checks = {
    words: n,
    wordsOk: n >= 150 && n <= 250,
    actionsOk: actions.length === 3,
    mistakeOk: Boolean(mistake),
    sourcesOk: citations.length >= 2 && citations.length <= 3,
    paraphrasesOk: paraphrases.length >= 8,
  };
  const structure = Object.entries(checks).filter(([k]) => k.endsWith("Ok")).filter(([, v]) => v).length / 5;
  const support = Math.min(1, citations.length / 2);
  const confidence = Math.round(Math.max(0, Math.min(1, 0.55 * support + 0.3 * structure + (removed ? 0 : 0.15))) * 100) / 100;
  return {
    ok: Boolean(enrichedAnswer),
    enrichedAnswer, answerMarked, actions, mistake, verifyLocally, citations, confidence,
    flags: FLAG_SET.filter(f => flags.has(f)), paraphrases, notes: String(j.notes || "").trim().slice(0, 600), words: n, checks,
  };
}

/** Write a parsed enrichment onto the entry (primary fields, or `variants[<provider>]` for --both). */
export function applyEnrichment(entry, out, { provider, model, at = new Date().toISOString(), variant = false } = {}) {
  const fields = {
    enrichedAnswer: out.enrichedAnswer,
    answerMarked: out.answerMarked,
    actions: out.actions,
    mistake: out.mistake,
    verifyLocally: out.verifyLocally,
    citations: out.citations,
    confidence: out.confidence,
    flags: out.flags,
    enrichNotes: out.notes,
    enrichedBy: { provider, model, at },
  };
  if (variant) return { ...entry, variants: { ...(entry.variants || {}), [provider]: { ...fields, paraphrases: out.paraphrases || [] } } };
  const have = new Set((entry.paraphrases || []).map(p => norm(p.text || p)));
  const paraphrases = [...(entry.paraphrases || []), ...out.paraphrases.filter(p => !have.has(norm(p.text)))];
  const next = { ...entry, ...fields, paraphrases, updatedAt: at };
  if (next.status === "approved" || next.status === "edited") next.approvedAnswer = next.approvedAnswer || next.enrichedAnswer;
  return next;
}

/** True when the entry already has this provider's enrichment (resume). */
export function alreadyEnriched(entry, provider, { variant = false } = {}) {
  if (variant) return Boolean(entry.variants && entry.variants[provider] && entry.variants[provider].enrichedAnswer);
  return Boolean(entry.enrichedAnswer && entry.enrichedBy && entry.enrichedBy.provider === provider);
}

export { enrichedWorkbookName } from "../../server/ai/facultyExport.js";
