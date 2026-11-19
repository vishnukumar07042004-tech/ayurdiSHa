/**
 * Server-side Gemini journal search for BAMS career questions.
 * Goes through server/ai/provider.js, so it runs on GEMINI_API_KEY or on Vertex AI
 * (AI_PROVIDER=vertex). Credentials stay server-only. Returns dynamic journal links per query.
 * AI_KNOWLEDGE_MODEL overrides the model. The query is PII-redacted before it leaves, and live
 * searches stop (curated sources only) once the AI daily spend cap is reached; their cost counts
 * toward the same cap as drafting.
 */

import { POD_KNOWLEDGE } from "../src/podKnowledge.js";
import { createHash } from "node:crypto";
import { getProvider } from "./ai/runtime.js";
import { redactText } from "./ai/redact.js";
import { normalizeUsage } from "./ai/usage.js";
import { istDay, normalizeConfig } from "./ai/config.js";

let aiStorePromise = null;
/** Lazily the same AI store the worker uses (Firestore in production, file store in local QA). */
async function capStore() {
  if (!aiStorePromise) {
    aiStorePromise = (async () => {
      const { createAymStore } = await import("./store.js");
      const { aiStoreFor } = await import("./ai/aiStore.js");
      return aiStoreFor(await createAymStore());
    })().catch(() => null);
  }
  return aiStorePromise;
}

function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([promise, new Promise(r => { t = setTimeout(() => r(fallback), ms); })]).finally(() => clearTimeout(t));
}

async function spendCapReached() {
  try {
    const s = await withTimeout(capStore(), 3000, null);
    if (!s) return false;
    const [cfg, used] = await withTimeout(Promise.all([s.getConfig(), s.getUsage(istDay())]), 3000, [null, null]);
    if (!cfg || !used) return false;
    return (used.costUSD || 0) >= normalizeConfig(cfg).dailySpendCapUSD;
  } catch {
    return false;
  }
}

async function recordSpend(usage, model) {
  try {
    const s = await withTimeout(capStore(), 3000, null);
    const u = normalizeUsage(usage, model);
    if (s && u.costUSD) await withTimeout(s.addUsage(istDay(), u), 3000, null);
  } catch { /* spend tracking never breaks a search */ }
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const CACHE_TTL_MS = 60_000;
/** Primary model for this API key; older models return 404 on v1beta. */
const GEMINI_MODELS = ["gemini-3.6-flash"];

const buckets = new Map();
const queryCache = new Map();

/** Extra credible global sources for fallback filtering. */
const GLOBAL_POOL = [
  {
    title: "PubMed — Ayurveda & traditional medicine research index",
    source: "PubMed / NCBI",
    sourceLogo: "PM",
    url: "https://pubmed.ncbi.nlm.nih.gov/?term=ayurveda",
    snippet: "Peer-reviewed biomedical literature search for Ayurveda clinical and pharmacology studies.",
    publishedHint: "Research index",
    image: "/assets/hall-exchange.png",
  },
  {
    title: "NIH NCCIH — Complementary & Integrative Health",
    source: "NIH",
    sourceLogo: "NIH",
    url: "https://www.nccih.nih.gov/health/ayurvedic-medicine-in-depth",
    snippet: "US National Institutes overview of Ayurveda evidence and safety for integrative careers.",
    publishedHint: "Evidence summary",
    image: "/assets/hall-pods.png",
  },
  {
    title: "Cochrane Library — systematic reviews on traditional medicine",
    source: "Cochrane",
    sourceLogo: "Co",
    url: "https://www.cochranelibrary.com/search?p_p_id=search&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_search_WAR_cochraneportlet_searchText=ayurveda",
    snippet: "Gold-standard systematic reviews — useful for research and evidence-based practice paths.",
    publishedHint: "Systematic reviews",
    image: "/assets/hall-photo.png",
  },
  {
    title: "WHO — Traditional, Complementary & Integrative Medicine",
    source: "WHO",
    sourceLogo: "WHO",
    url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine",
    snippet: "Global policy framing for Ayurveda in public health and integrative hospital settings.",
    publishedHint: "Global health",
    image: "/assets/hall-pods.png",
  },
  {
    title: "Springer — Ayurveda journal articles",
    source: "Springer",
    sourceLogo: "Sp",
    url: "https://link.springer.com/search?query=ayurveda",
    snippet: "Academic publisher index for Ayurveda pharmacology, education, and clinical studies.",
    publishedHint: "Academic",
    image: "/assets/hall-exchange.png",
  },
  {
    title: "ScienceDirect — Ayurveda research papers",
    source: "ScienceDirect",
    sourceLogo: "SD",
    url: "https://www.sciencedirect.com/search?qs=ayurveda",
    snippet: "Elsevier journal database for formulation, clinical trial, and education research.",
    publishedHint: "Academic",
    image: "/assets/hall-photo.png",
  },
];

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + RATE_WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count += 1;
  if (b.count > RATE_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((b.reset - now) / 1000) };
  }
  return { ok: true };
}

/** Live search needs a Google provider (Gemini API key or Vertex AI); other providers lack these models. */
async function googleProviderReady() {
  try {
    const p = await getProvider();
    const info = typeof p.providerInfo === "function" ? p.providerInfo() : null;
    return Boolean(info && info.configured && ["gemini", "vertex", "mock"].includes(info.provider));
  } catch {
    return false;
  }
}

function cacheKey(query, themeCode) {
  return createHash("sha256").update(`${themeCode}|${query.toLowerCase().trim()}`).digest("hex");
}

function getCached(key) {
  const hit = queryCache.get(key);
  if (!hit || Date.now() > hit.expires) {
    queryCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data) {
  queryCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  if (queryCache.size > 200) {
    const oldest = queryCache.keys().next().value;
    queryCache.delete(oldest);
  }
}

function isValidUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeJournal(raw) {
  if (!raw || !raw.url || !isValidUrl(raw.url)) return null;
  const title = String(raw.title || raw.label || "Untitled").trim().slice(0, 200);
  const source = String(raw.source || raw.label || hostFromUrl(raw.url)).trim().slice(0, 80);
  return {
    title,
    source,
    url: String(raw.url).slice(0, 500),
    snippet: String(raw.snippet || raw.reason || "").trim().slice(0, 320),
    publishedHint: String(raw.publishedHint || raw.time || "").trim().slice(0, 80),
    image: raw.image ? String(raw.image).slice(0, 300) : undefined,
    sourceLogo: String(raw.sourceLogo || source.slice(0, 3)).slice(0, 8),
  };
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

/** Map query terms to related Ayurveda career keywords for fallback ranking. */
const TOPIC_SYNONYMS = {
  admission: ["aiapget", "entrance", "pg", "md", "seat", "ncism", "counselling", "neet"],
  pg: ["postgraduate", "md", "ms", "aiapget", "admission", "residency", "fellowship"],
  ncism: ["registration", "education", "council", "md", "bams", "aiapget", "seat"],
  pharmacology: ["drug", "formulation", "herb", "dravyaguna", "rasa", "bhaishajya", "pharma"],
  research: ["clinical", "trial", "ccras", "pubmed", "paper", "phd", "evidence", "study"],
  teaching: ["faculty", "professor", "lecturer", "academic", "ugc", "rav", "college"],
  clinic: ["practice", "hospital", "panchakarma", "opd", "patient", "integrative", "wellness"],
  export: ["apeda", "trade", "market", "herbal", "product", "gmp", "manufacturing"],
  policy: ["ministry", "ayush", "scheme", "mission", "cghs", "government", "regulation"],
  income: ["salary", "pay", "stipend", "budget", "earning", "fee", "cost"],
};

function staticPool(themeCode) {
  const podEntries = themeCode
    ? POD_KNOWLEDGE.filter(p => p.code === themeCode).map(p => ({ code: p.code, cards: p.journalCards || [] }))
    : POD_KNOWLEDGE.map(p => ({ code: p.code, cards: p.journalCards || [] }));

  const seen = new Set();
  const merged = [];
  for (const { code, cards } of podEntries) {
    for (const c of cards) {
      const key = c.url;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = normalizeJournal({
        ...c,
        publishedHint: c.time || c.publishedHint,
      });
      if (card) merged.push({ ...card, podCode: code });
    }
  }
  for (const c of GLOBAL_POOL) {
    const key = c.url;
    if (seen.has(key)) continue;
    seen.add(key);
    const card = normalizeJournal({
      ...c,
      publishedHint: c.time || c.publishedHint,
    });
    if (card) merged.push({ ...card, podCode: null });
  }
  return merged;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function expandTokens(tokens) {
  const expanded = new Set(tokens);
  for (const t of tokens) {
    for (const [key, syns] of Object.entries(TOPIC_SYNONYMS)) {
      if (t === key || t.includes(key) || syns.some(s => t.includes(s) || s.includes(t))) {
        expanded.add(key);
        syns.forEach(s => expanded.add(s));
      }
    }
  }
  return [...expanded];
}

function querySeed(query) {
  return createHash("sha256").update(String(query).toLowerCase().trim()).digest().readUInt32BE(0);
}

function deterministicTie(seed, index) {
  return ((seed ^ (index * 2654435761)) >>> 0) % 10_000;
}

function scoreCard(card, tokens, themeCode) {
  const hay = `${card.title} ${card.source} ${card.snippet} ${card.url}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length > 6 ? 5 : t.length > 4 ? 4 : 3;
  }
  if (themeCode && card.podCode === themeCode) score += 12;
  return score;
}

function fallbackSearch(query, themeCode) {
  const tokens = expandTokens(tokenize(query));
  const seed = querySeed(query);
  const resultCount = 6 + (seed % 3);
  const pool = staticPool(themeCode);

  const scored = pool
    .map((card, idx) => ({ card, score: scoreCard(card, tokens, themeCode), idx }))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return deterministicTie(seed, a.idx) - deterministicTie(seed, b.idx);
    });

  const matched = scored.filter(s => s.score > 0);
  let picked;
  if (matched.length >= 4) {
    picked = matched.slice(0, resultCount);
  } else {
    const unmatched = scored.filter(s => s.score === 0);
    const offset = unmatched.length ? seed % unmatched.length : 0;
    const rotated = [...unmatched.slice(offset), ...unmatched.slice(0, offset)];
    picked = [...matched, ...rotated].slice(0, resultCount);
  }

  const journals = picked.map(s => {
    const { podCode, ...rest } = s.card;
    return rest;
  });

  const sourceRows = buildSourceRows(journals, query);
  return { journals, sourceRows };
}

function buildSourceRows(journals, query) {
  if (!journals.length) return [];
  const byDomain = new Map();
  for (const j of journals) {
    const host = hostFromUrl(j.url);
    const bucket = byDomain.get(host) || { sources: new Set(), urls: [] };
    bucket.sources.add(j.source);
    bucket.urls.push({ label: j.title.slice(0, 60), url: j.url });
    byDomain.set(host, bucket);
  }
  const rows = [...byDomain.entries()].slice(0, 4).map(([host, b]) => ({
    headline: `Sources from ${host} related to "${query.slice(0, 48)}"`,
    sources: [...b.sources],
    urls: b.urls.slice(0, 3),
  }));
  if (rows.length) return rows;
  return [{
    headline: `Curated links for "${query.slice(0, 56)}"`,
    sources: journals.map(j => j.source).slice(0, 3),
    urls: journals.slice(0, 4).map(j => ({ label: j.source, url: j.url })),
  }];
}

function journalResponseSchema() {
  return {
    type: "object",
    properties: {
      journals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            source: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
            publishedHint: { type: "string" },
          },
          required: ["title", "source", "url", "snippet", "publishedHint"],
        },
      },
      sourceRows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            headline: { type: "string" },
            sources: { type: "array", items: { type: "string" } },
            urls: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  url: { type: "string" },
                },
                required: ["label", "url"],
              },
            },
          },
          required: ["headline", "sources", "urls"],
        },
      },
    },
    required: ["journals"],
  };
}

function parseGeminiJson(text) {
  let raw = String(text || "").trim();
  if (!raw) return null;

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  raw = raw.replace(/^```(?:json|JSON)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const fenced = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced) raw = fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const jsonSlice = raw.slice(start, end + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch {
    // Trailing commas or minor formatting issues
    try {
      return JSON.parse(jsonSlice.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

function extractGroundingJournals(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const out = [];
  for (const ch of chunks) {
    const web = ch.web || ch.retrievedContext;
    if (!web?.uri) continue;
    out.push(normalizeJournal({
      title: web.title || hostFromUrl(web.uri),
      source: hostFromUrl(web.uri),
      url: web.uri,
      snippet: "",
      publishedHint: "Web result",
    }));
  }
  return out.filter(Boolean);
}

async function callGemini(themeCode, themeTitle, query) {
  const themeHint = themeTitle || themeCode || "Ayurveda careers";
  const prompt = `BAMS librarian. Query: "${query}" (${themeHint}). Return ONLY compact JSON with exactly 4 journals (real https URLs):
{"journals":[{"title":"...","source":"...","url":"https://...","snippet":"...","publishedHint":"..."}]}`;

  let r;
  try {
    const provider = await getProvider();
    r = await provider.chat({
      messages: [{ role: "user", content: prompt }],
      model: String(process.env.AI_KNOWLEDGE_MODEL || "").trim() || GEMINI_MODELS[0],
      json: true,
      schema: journalResponseSchema(),
      temperature: 0.15,
      maxTokens: 2048,
      thinking: "minimal",
      timeoutMs: 25_000,
      retries: 1,
    });
  } catch (err) {
    if (err && err.status === 429) {
      throw new Error("QUOTA: Gemini daily limit reached — showing curated sources.");
    }
    throw new Error(`Gemini: ${String(err && err.message || err).slice(0, 200)}`);
  }
  await recordSpend(r.usage, r.model);

  const parsed = r.json || parseGeminiJson(r.text);

  let journals = [];
  let sourceRows = [];

  if (parsed) {
    journals = (Array.isArray(parsed.journals) ? parsed.journals : [])
      .map(normalizeJournal)
      .filter(Boolean)
      .slice(0, 10);
    sourceRows = (Array.isArray(parsed.sourceRows) ? parsed.sourceRows : [])
      .map(row => ({
        headline: String(row.headline || "").slice(0, 160),
        sources: (Array.isArray(row.sources) ? row.sources : []).map(s => String(s).slice(0, 60)).slice(0, 5),
        urls: (Array.isArray(row.urls) ? row.urls : [])
          .filter(u => u?.url && isValidUrl(u.url))
          .map(u => ({ label: String(u.label || u.url).slice(0, 80), url: String(u.url).slice(0, 500) }))
          .slice(0, 5),
      }))
      .filter(r => r.headline && r.urls.length);
  }

  if (!sourceRows.length && journals.length) {
    sourceRows = buildSourceRows(journals, query);
  }

  if (journals.length >= 1) {
    return { journals, sourceRows };
  }

  throw new Error("Gemini returned no valid journal links");
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(JSON.stringify(body));
}

export async function handleKnowledgeChat(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "POST only" });
    return;
  }

  const ip = clientIp(req);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    send(res, 429, {
      error: "Too many searches — please wait a minute.",
      retryAfterSec: rl.retryAfterSec,
    });
    return;
  }

  let body = "";
  await new Promise((resolve, reject) => {
    req.on("data", chunk => { body += chunk; });
    req.on("end", resolve);
    req.on("error", reject);
  });

  let msg = {};
  try {
    msg = body ? JSON.parse(body) : {};
  } catch {
    send(res, 400, { error: "invalid json" });
    return;
  }

  const query = redactText(String(msg.query || msg.question || "").trim().slice(0, 800)).text;
  const themeCode = String(msg.themeCode || msg.theme || "").trim().slice(0, 8);
  const themeTitle = String(msg.themeTitle || "").trim().slice(0, 120);

  if (!query || query.length < 4) {
    send(res, 400, { error: "Please type a search query (at least 4 characters)." });
    return;
  }

  const ck = cacheKey(query, themeCode);
  const cached = getCached(ck);
  if (cached) {
    send(res, 200, { ...cached, cached: true });
    return;
  }

  if (!(await googleProviderReady()) || (await spendCapReached())) {
    const fb = fallbackSearch(query, themeCode);
    const payload = {
      ok: true,
      query,
      aiAvailable: false,
      message: "Live search is off right now — showing sources matched to your query.",
      journals: fb.journals,
      sourceRows: fb.sourceRows,
    };
    setCache(ck, payload);
    send(res, 200, payload);
    return;
  }

  try {
    const { journals, sourceRows } = await callGemini(themeCode, themeTitle, query);
    let finalJournals = journals;
    let finalRows = sourceRows;

    if (finalJournals.length < 3) {
      const fb = fallbackSearch(query, themeCode);
      const seen = new Set(finalJournals.map(j => j.url));
      for (const c of fb.journals) {
        if (!seen.has(c.url)) finalJournals.push(c);
      }
      if (!finalRows.length) finalRows = fb.sourceRows;
    }

    const payload = {
      ok: true,
      query,
      aiAvailable: true,
      journals: finalJournals.slice(0, 10),
      sourceRows: finalRows.slice(0, 5),
    };
    setCache(ck, payload);
    send(res, 200, payload);
  } catch (err) {
    const reason = err?.message || String(err);
    console.error("[knowledge-chat] gemini-fallback:", reason.slice(0, 240));
    const fb = fallbackSearch(query, themeCode);
    const quotaMsg = reason.startsWith("QUOTA:")
      ? "Gemini daily limit reached — showing curated journal sources for now. Try again tomorrow or upgrade your API plan."
      : "Showing curated sources for your query.";
    send(res, 200, {
      ok: true,
      query,
      aiAvailable: false,
      message: quotaMsg,
      journals: fb.journals,
      sourceRows: fb.sourceRows,
    });
  }
}

export function knowledgeChatHandler(req, res) {
  handleKnowledgeChat(req, res).catch(err => {
    console.error("[knowledge-chat] fatal:", err.message || err);
    if (!res.writableEnded) {
      send(res, 200, {
        ok: true,
        query: "",
        aiAvailable: false,
        message: "Showing curated sources — try again in a moment.",
        journals: GLOBAL_POOL.slice(0, 6).map(normalizeJournal).filter(Boolean),
        sourceRows: [],
      });
    }
  });
}
