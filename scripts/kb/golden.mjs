#!/usr/bin/env node
/**
 * Golden answers for the top intents: data/golden/<intentId>.json (status always "draft").
 *   node scripts/kb/golden.mjs [--top=500] [--force] [--only=intentId,...] [--min-coverage=0.6]
 *
 * With an AI key: retrieves KB chunks (BM25 + cosine when embedded), drafts with the stream
 * persona, then checks the draft — every citation must quote its chunk verbatim, resources must
 * be allow-listed URLs, and numbers in the answer must appear in a retrieved source; failures
 * become flags. Weak retrieval → flags ["insufficient-source"] and a minimal answer.
 * Without a key: writes the question/metadata, retrieved candidate sources, an empty answer and
 * flags ["needs-draft"].
 * Never overwrites a file that has been reviewed (reviewedBy set or status other than "draft"),
 * and skips already-drafted files unless --force.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadSources, sourceForUrl, writeJson } from "./lib.mjs";
import { loadChunks, createRetriever } from "./retrieve.mjs";
import { personaFor, loadPersona } from "../../server/ai/personas/index.js";
import { isConfigured, isEmbedConfigured, chat, embed, providerInfo, getUsage } from "../../server/ai/provider.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const TOP = Number(args.top || 500);
const MIN_COVERAGE = Number(args["min-coverage"] || 0.6);
const ONLY = args.only ? new Set(String(args.only).split(",")) : null;
const OUT = path.join(ROOT, "data/golden");

const intents = JSON.parse(fs.readFileSync(path.join(ROOT, "data/qbank/intents.json"), "utf8"));
const qbank = JSON.parse(fs.readFileSync(path.join(ROOT, "data/qbank/qbank.json"), "utf8"));
const sources = loadSources();

const norm = s => String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^a-z0-9\u0900-\u097f%₹$.]+/g, " ").trim();

function quoteInChunk(quote, chunk) {
  const q = norm(quote);
  return q.length >= 12 && norm(chunk.text).includes(q);
}

function numbersIn(text) {
  return [...String(text).matchAll(/(?:₹|rs\.?|inr|\$)?\s?\d[\d,.]*\s?(?:%|lakh|lakhs|crore|years?|months?|days?)?/gi)]
    .map(m => m[0].trim()).filter(n => /\d{2,}|\d+\s?(?:%|lakh|crore)/i.test(n));
}

function retrievalQuery(intent) {
  const variants = qbank.filter(q => q.intentId === intent.intentId && q.lang === "en").slice(0, 3).map(q => q.text);
  return [intent.canonical, ...variants, intent.subtheme].join(" ");
}

function emptyAnswer() {
  return { answer: "", actions: ["", "", ""], mistake: "", resources: [{ title: "", url: "" }, { title: "", url: "" }], citations: [] };
}

function candidateResources(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.chunk.url)) continue;
    seen.add(h.chunk.url);
    out.push({ title: h.chunk.title, url: h.chunk.url });
    if (out.length === 2) break;
  }
  while (out.length < 2) out.push({ title: "", url: "" });
  return out;
}

function sourcesBlock(hits) {
  return hits.map((h, i) => {
    const c = h.chunk;
    return `[S${i + 1}] chunkId=${c.id}\nurl: ${c.url}\ntitle: ${c.title}\nauthority: ${c.authority}${c.publishedAt ? `\npublished: ${c.publishedAt}` : ""}\n---\n${c.text}`;
  }).join("\n\n=====\n\n");
}

function checkDraft(d, hits) {
  const flags = new Set(Array.isArray(d.flags) ? d.flags.filter(f => typeof f === "string") : []);
  const byId = new Map(hits.map(h => [h.chunk.id, h.chunk]));
  const citations = [];
  for (const c of Array.isArray(d.citations) ? d.citations : []) {
    const chunk = byId.get(String(c?.chunkId || ""));
    if (chunk && quoteInChunk(c.quote, chunk)) citations.push({ chunkId: chunk.id, url: chunk.url, quote: String(c.quote).trim() });
    else flags.add("unverified-citation");
  }
  if (!citations.length && !flags.has("medical-advice")) flags.add("no-valid-citation");
  let resources = (Array.isArray(d.resources) ? d.resources : [])
    .filter(r => r && /^https?:\/\//.test(String(r.url || "")) && sourceForUrl(r.url, sources))
    .map(r => ({ title: String(r.title || "").trim() || r.url, url: String(r.url).trim() }));
  if (resources.length < (Array.isArray(d.resources) ? d.resources.length : 0)) flags.add("resource-off-allowlist");
  const fill = candidateResources(hits).filter(r => r.url && !resources.some(x => x.url === r.url));
  resources = [...resources, ...fill].slice(0, 2);
  while (resources.length < 2) resources.push({ title: "", url: "" });
  const support = hits.map(h => norm(h.chunk.text)).join(" ");
  const unsupported = numbersIn(d.answer || "").filter(n => !support.includes(norm(n)));
  if (unsupported.length) flags.add("unsupported-number");
  const actions = (Array.isArray(d.actions) ? d.actions : []).map(a => String(a || "").trim()).filter(Boolean).slice(0, 3);
  while (actions.length < 3) actions.push("");
  return {
    answer: String(d.answer || "").trim(),
    actions,
    mistake: String(d.mistake || "").trim(),
    resources,
    citations,
    flags: [...flags],
    unsupportedNumbers: unsupported,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chunks = loadChunks();
  const retriever = createRetriever(chunks);
  const ai = isConfigured();
  const canEmbed = ai && isEmbedConfigured() && chunks.some(c => c.embedding);
  const info = providerInfo();
  console.log(`[golden] chunks=${chunks.length} ai=${ai ? `${info.provider}/${info.draftModel}` : "none"} embeddings=${canEmbed}`);

  const list = intents.filter(i => !ONLY || ONLY.has(i.intentId)).slice(0, ONLY ? undefined : TOP);
  const stats = { total: list.length, drafted: 0, insufficient: 0, needsDraft: 0, skippedReviewed: 0, skippedExisting: 0, failed: 0, flagged: 0, byStream: {} };
  let stopAi = !ai;

  for (const intent of list) {
    const file = path.join(OUT, `${intent.intentId}.json`);
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    if (prev && (prev.reviewedBy || (prev.status && prev.status !== "draft"))) { stats.skippedReviewed++; continue; }
    if (prev && prev.answer && !args.force) { stats.skippedExisting++; continue; }

    const stream = intent.stream || personaFor(intent.theme, intent.subtheme, intent.canonical);
    let qEmb;
    if (canEmbed && !stopAi) {
      try { qEmb = (await embed([intent.canonical], { taskType: "query" }))[0]; } catch { qEmb = undefined; }
    }
    const hits = retriever.search(retrievalQuery(intent), { k: 8, stream, queryEmbedding: qEmb });
    for (const h of hits) h.coverage = retriever.coverage(intent.canonical, h.chunk);
    const strong = hits.filter(h => h.coverage >= MIN_COVERAGE || (h.cos != null && h.cos >= 0.75));
    const sufficient = strong.length >= 2;
    const base = {
      intentId: intent.intentId,
      theme: intent.theme,
      subtheme: intent.subtheme,
      subject: intent.subject,
      ask: intent.ask,
      question: intent.canonical,
      stream,
      region: intent.region,
    };
    const retrieved = hits.map(h => ({ chunkId: h.chunk.id, url: h.chunk.url, title: h.chunk.title, score: Math.round(h.score * 1000) / 1000, bm25: Math.round(h.bm25 * 100) / 100, coverage: Math.round(h.coverage * 100) / 100 }));

    let draft = { ...emptyAnswer(), flags: [] };
    let model = null;
    let usage = null;
    if (!stopAi) {
      const persona = loadPersona(stream);
      const variants = qbank.filter(q => q.intentId === intent.intentId).slice(0, 4).map(q => `- ${q.text}`).join("\n");
      const user = `Theme: ${intent.theme} / ${intent.subtheme}\nStudent question: "${intent.canonical}"\nOther students asked it as:\n${variants}\n\n${sufficient ? "" : "NOTE: retrieval found little relevant material. If the sources do not answer the question, say so briefly and add \"insufficient-source\" to flags.\n\n"}SOURCES (use ONLY these; cite chunkId and copy quotes verbatim):\n\n${sourcesBlock(hits.slice(0, sufficient ? 8 : 4))}`;
      try {
        const r = await chat({ system: persona.prompt, messages: [{ role: "user", content: user }], json: true, role: "draft", maxTokens: 6000, timeoutMs: 180_000 });
        model = r.model;
        usage = r.usage;
        if (r.json) draft = checkDraft(r.json, hits);
        else draft = { ...emptyAnswer(), flags: ["unparseable-draft"] };
      } catch (err) {
        console.log(`[golden] ${intent.intentId}: draft failed — ${err.message.slice(0, 160)}`);
        stats.failed++;
        draft = { ...emptyAnswer(), flags: ["needs-draft"] };
        if (/quota|429|401|402|403|not configured|credits|Enable the Vertex|roles\/aiplatform/i.test(err.message)) stopAi = true;
      }
      if (!sufficient && !draft.flags.includes("insufficient-source")) draft.flags.push("insufficient-source");
    } else {
      draft = { ...emptyAnswer(), resources: sufficient ? candidateResources(hits) : emptyAnswer().resources, flags: ["needs-draft", ...(sufficient ? [] : ["insufficient-source"])] };
    }

    const out = {
      ...base,
      answer: draft.answer,
      actions: draft.actions,
      mistake: draft.mistake,
      resources: draft.resources,
      citations: draft.citations,
      status: "draft",
      createdBy: "ai",
      model,
      createdAt: new Date().toISOString(),
      reviewedBy: null,
      flags: draft.flags,
      retrieved,
      ...(draft.unsupportedNumbers?.length ? { unsupportedNumbers: draft.unsupportedNumbers } : {}),
      ...(usage ? { usage } : {}),
    };
    writeJson(file, out);
    if (out.answer) stats.drafted++;
    if (out.flags.includes("needs-draft")) stats.needsDraft++;
    if (out.flags.includes("insufficient-source")) stats.insufficient++;
    if (out.flags.length) stats.flagged++;
    stats.byStream[stream] = stats.byStream[stream] || { intents: 0, sufficient: 0 };
    stats.byStream[stream].intents++;
    if (sufficient) stats.byStream[stream].sufficient++;
  }
  const report = { finishedAt: new Date().toISOString(), provider: info, minCoverage: MIN_COVERAGE, ...stats, usage: getUsage() };
  writeJson(path.join(ROOT, "data/kb/golden-report.json"), report);
  console.log(`[golden] ${JSON.stringify({ ...stats, byStream: undefined })}`);
  console.log(`[golden] cost ~$${report.usage.costUsd}`);
}

main().catch(err => { console.error("[golden] fatal:", err); process.exit(1); });
