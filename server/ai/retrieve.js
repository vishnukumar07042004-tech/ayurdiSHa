/**
 * Retrieval for drafting: top-k knowledge-base chunks (`kb_chunks` in Firestore, else
 * `data/kb/chunks.jsonl`) plus the approved answer bank (approved golden answers and staff-
 * approved AI drafts). Firestore vector search is used when the index exists; otherwise
 * in-memory cosine over stored embeddings, otherwise BM25 over chunk text. Chunks are cached in
 * module scope. Regulator sources are preferred for fees, dates, cut-offs and eligibility.
 */

import fs from "node:fs";
import path from "node:path";
import { PREVIEW_ROOT } from "../env.js";
import { stemWord } from "../../shared/merge.js";
import { authorityRank, isRegulatorGrade, loadAllowList, urlAllowed } from "./sources.js";
import { facultyContext } from "./facultyBank.js";

export const KB_FILE = path.resolve(PREVIEW_ROOT, "data/kb/chunks.jsonl");
export const GOLDEN_DIR = path.resolve(PREVIEW_ROOT, "data/golden");

const KB_TTL_MS = 10 * 60 * 1000;
const BANK_TTL_MS = 2 * 60 * 1000;

const STOP = new Set("a an the and or but if of to in on at by for with from into about as is am are was were be been being do does did have has had i me my we our you your he she it its they them their this that these those there here what which where when why how who can could should would will shall may might must not no so too very just also than then such only other each both more most much many some any all own per via out up down over under again once after before please sir madam ji want need know tell get best good hi hello hey dear respected thanks thank regards".split(" "));

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, " ")
    .split(" ")
    .filter(w => w && w.length > 1 && !STOP.has(w))
    .map(w => { try { return stemWord(w); } catch { return w; } });
}

/** Questions that hinge on facts only a regulator can give. */
export const TIME_SENSITIVE_ASK = /\b(?:fees?|cost|seat|seats|cut-?offs?|cutoff|rank|percentile|eligib\w*|last date|deadline|dates?|schedule|notification|exam date|counsell?ing|vacanc\w*|age limit|attempts?|stipend|salary|pay scale)\b/i;

/* ---------------------------------------------------------------- */
/* BM25                                                              */
/* ---------------------------------------------------------------- */

export function buildBm25(docs, textOf) {
  const toks = docs.map(d => tokenize(textOf(d)));
  const df = new Map();
  toks.forEach(t => new Set(t).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length || 1;
  const avg = toks.reduce((n, t) => n + t.length, 0) / N || 1;
  const tf = toks.map(t => {
    const m = new Map();
    t.forEach(w => m.set(w, (m.get(w) || 0) + 1));
    return m;
  });
  return {
    size: docs.length,
    search(query, k1 = 1.2, b = 0.75) {
      const q = [...new Set(tokenize(query))];
      const idf = new Map(q.map(w => [w, Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5))]));
      const idfTotal = q.reduce((n, w) => n + idf.get(w), 0) || 1;
      return docs.map((d, i) => {
        let s = 0;
        let covered = 0;
        for (const w of q) {
          const f = tf[i].get(w);
          if (!f) continue;
          covered += idf.get(w);
          s += idf.get(w) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (toks[i].length / avg)));
        }
        // Share of the query's information (idf mass) this document contains — an absolute 0..1 relevance.
        return { doc: d, score: s, coverage: covered / idfTotal };
      });
    },
  };
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function jaccard(a, b) {
  const x = new Set(tokenize(a));
  const y = new Set(tokenize(b));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  x.forEach(w => { if (y.has(w)) inter++; });
  return inter / (x.size + y.size - inter);
}

/* ---------------------------------------------------------------- */
/* Loading                                                           */
/* ---------------------------------------------------------------- */

let kbCache = null;
let goldenCache = null;
let bankCache = null;
const VECTOR_INDEX_RETRY_MS = 6 * 3600 * 1000;
let vectorIndexMissingUntil = 0;

export function resetRetrievalCache() {
  kbCache = null;
  goldenCache = null;
  bankCache = null;
  vectorIndexMissingUntil = 0;
}

export function normalizeChunk(c) {
  if (!c || typeof c !== "object" || !c.id || !c.text) return null;
  return {
    id: String(c.id),
    url: String(c.url || ""),
    title: String(c.title || ""),
    text: String(c.text || ""),
    tokens: Number(c.tokens) || 0,
    publishedAt: c.publishedAt || null,
    fetchedAt: c.fetchedAt || null,
    authority: String(c.authority || ""),
    streams: Array.isArray(c.streams) ? c.streams.map(String) : [],
    contentHash: c.contentHash || "",
    embedding: Array.isArray(c.embedding) ? c.embedding : undefined,
    embeddingModel: c.embeddingModel || "",
  };
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function indexChunks(list, source) {
  const chunks = list.map(normalizeChunk).filter(Boolean);
  const byId = new Map(chunks.map(c => [c.id, c]));
  return {
    at: Date.now(),
    source,
    chunks,
    byId,
    bm25: buildBm25(chunks, c => `${c.title} ${c.title} ${c.text}`),
  };
}

/**
 * KB chunks: the bundled `data/kb/chunks.jsonl` first (no Firestore reads), else the whole
 * `kb_chunks` collection. Firestore vector search is still used for the semantic half when the
 * index exists (see `retrieve`).
 */
export async function loadKb(aiStore, { fresh = false, chunks } = {}) {
  if (chunks) return indexChunks(chunks, "inline");
  if (kbCache && !fresh && Date.now() - kbCache.at < KB_TTL_MS) return kbCache;
  let list = readJsonl(KB_FILE);
  let source = "file";
  if (!list.length && aiStore && typeof aiStore.listKbChunks === "function") {
    try {
      const remote = await aiStore.listKbChunks();
      if (Array.isArray(remote) && remote.length) { list = remote; source = "firestore"; }
    } catch { /* fall through with an empty KB */ }
  }
  kbCache = indexChunks(list, source);
  return kbCache;
}

/** Passage count without loading the KB (settings panel). */
export async function kbSummary(aiStore) {
  if (kbCache) return { chunks: kbCache.chunks.length, source: kbCache.source };
  const local = readJsonl(KB_FILE).length;
  if (local) return { chunks: local, source: "file" };
  if (aiStore && typeof aiStore.countKb === "function") {
    try { return { chunks: await aiStore.countKb(), source: "firestore" }; } catch { /* ignore */ }
  }
  return { chunks: 0, source: "none" };
}

export function setKbForTests(chunks) {
  kbCache = chunks ? indexChunks(chunks, "test") : null;
}

/** Golden answers from `data/golden/*.json`. Only `status: "approved"` ones are trusted. */
export function loadGolden({ fresh = false, dir = GOLDEN_DIR } = {}) {
  if (goldenCache && !fresh) return goldenCache;
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const g = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (g && g.answer) out.push({ ...g, intentId: g.intentId || f.replace(/\.json$/, "") });
      } catch { /* skip bad file */ }
    }
  } catch { /* no golden set yet */ }
  goldenCache = out;
  return out;
}

export function setGoldenForTests(list) {
  goldenCache = Array.isArray(list) ? list : null;
}

function goldenAsBank(g) {
  return {
    id: `golden:${g.intentId}`,
    source: "golden",
    approved: String(g.status || "").toLowerCase() === "approved",
    targetType: "golden",
    targetId: g.intentId,
    theme: g.theme || "",
    subtheme: g.subtheme || "",
    stream: g.stream || "",
    intentKey: g.intentKey || "",
    question: g.question || g.ask || "",
    subject: g.subject || "",
    answer: g.answer || "",
    actions: Array.isArray(g.actions) ? g.actions : [],
    mistake: g.mistake || "",
    resources: Array.isArray(g.resources) ? g.resources : [],
    citations: Array.isArray(g.citations) ? g.citations : [],
    approvedAt: g.approvedAt || g.updatedAt || null,
  };
}

/** Approved answer bank: staff-approved AI drafts + approved golden answers (+ golden drafts flagged). */
export async function loadBank(aiStore, { fresh = false } = {}) {
  if (bankCache && !fresh && Date.now() - bankCache.at < BANK_TTL_MS) return bankCache;
  let stored = [];
  if (aiStore && typeof aiStore.listBank === "function") {
    try { stored = (await aiStore.listBank()) || []; } catch { stored = []; }
  }
  const entries = [
    ...stored.map(e => ({ ...e, source: e.source || "approved-draft", approved: true })),
    ...loadGolden().map(goldenAsBank),
  ];
  bankCache = { at: Date.now(), entries, bm25: buildBm25(entries, e => `${e.subject || ""} ${e.question || ""} ${e.question || ""} ${e.answer || ""}`) };
  return bankCache;
}

export function invalidateBank() {
  bankCache = null;
}

/* ---------------------------------------------------------------- */
/* Search                                                            */
/* ---------------------------------------------------------------- */

function inStream(c, stream) {
  if (!stream) return true;
  if (!c.streams.length) return true;
  return c.streams.includes(stream) || c.streams.includes("all") || c.streams.includes("*");
}

/**
 * @param {object} q  `{ question, context, theme, subtheme, stream, intentKey, clusterId }`
 * @returns {Promise<{ chunks: object[], bank: object[], reuse: object|null, method: string }>}
 */
export async function retrieve(q, { aiStore, provider, k = 8, kb: kbIn, embedModel = "" } = {}) {
  // Redaction placeholders ([NAME], [EMAIL]) carry no topic.
  const query = [q.question, q.context].filter(Boolean).join(" \n ").replace(/\[[A-Z-]+\]/g, " ");
  const timeSensitive = TIME_SENSITIVE_ASK.test(`${q.question || ""} ${q.context || ""}`);
  const kb = kbIn || await loadKb(aiStore);
  const allow = loadAllowList();

  const pool = kb.chunks.filter(c => urlAllowed(c.url, allow));
  let candidates = pool.filter(c => inStream(c, q.stream));
  const streamFiltered = candidates.length >= 3;
  if (!streamFiltered) candidates = pool;
  const allowedIds = new Set(candidates.map(c => c.id));

  const raw = kb.bm25.search(query).filter(r => allowedIds.has(r.doc.id));
  const maxBm = Math.max(0, ...raw.map(r => r.score));
  const lexical = new Map(raw.map(r => [r.doc.id, maxBm > 0 ? Math.sqrt((r.score / maxBm) * r.coverage) : 0]));

  let method = "bm25";
  let embedUsage = null;
  const semantic = new Map();
  const canEmbed = provider && typeof provider.embed === "function" && candidates.some(c => Array.isArray(c.embedding));
  const canIndex = provider && typeof provider.embed === "function" && aiStore && aiStore.backend === "firestore"
    && typeof aiStore.nearestKb === "function" && Date.now() >= vectorIndexMissingUntil;
  if (canEmbed || canIndex) {
    try {
      const vecs = await provider.embed([query], { taskType: "query" });
      if (vecs && vecs.usage && !vecs.usage.cached) embedUsage = vecs.usage;
      const vec = vecs && vecs[0];
      if (Array.isArray(vec)) {
        let near = null;
        if (canIndex) {
          near = await aiStore.nearestKb(vec, k * 3);
          // null = the query failed (usually no vector index): stop paying for query embeddings for a while.
          if (near === null) vectorIndexMissingUntil = Date.now() + VECTOR_INDEX_RETRY_MS;
        }
        if (Array.isArray(near) && near.length) {
          method = "vector-index+bm25";
          near.forEach(n => { if (allowedIds.has(String(n.id))) semantic.set(String(n.id), Math.max(0, n._score || 0)); });
        } else if (canEmbed) {
          method = "cosine+bm25";
          candidates.forEach(c => {
            if (!Array.isArray(c.embedding)) return;
            if (embedModel && c.embeddingModel && c.embeddingModel !== embedModel) return;
            semantic.set(c.id, Math.max(0, cosine(vec, c.embedding)));
          });
        }
      }
    } catch { method = "bm25"; }
  }

  const scored = candidates.map(c => {
    const lex = lexical.get(c.id) || 0;
    const sem = semantic.get(c.id) || 0;
    const rel = semantic.size ? 0.5 * lex + 0.5 * sem : lex;
    let score = 0.75 * rel + 0.25 * authorityRank(c.authority) * (rel > 0 ? 1 : 0);
    if (timeSensitive && isRegulatorGrade(c.authority) && rel > 0) score += 0.2;
    if (!streamFiltered && q.stream && c.streams.length && !inStream(c, q.stream)) score *= 0.8;
    return { ...c, embedding: undefined, score: Math.round(score * 1000) / 1000, relevance: Math.round(rel * 1000) / 1000 };
  }).filter(c => c.relevance > 0.05);
  scored.sort((a, b) => b.score - a.score);

  // At most two chunks from one URL so one long page does not crowd out other sources.
  const perUrl = new Map();
  const chunks = [];
  for (const c of scored) {
    const n = perUrl.get(c.url) || 0;
    if (n >= 2) continue;
    perUrl.set(c.url, n + 1);
    chunks.push(c);
    if (chunks.length >= k) break;
  }

  const bankIdx = await loadBank(aiStore);
  const bankRaw = bankIdx.bm25.search(query);
  const maxBank = Math.max(0, ...bankRaw.map(r => r.score));
  const bank = bankRaw
    .filter(r => r.score > 0)
    .map(r => ({ ...r.doc, score: maxBank ? r.score / maxBank : 0, overlap: jaccard(q.question, r.doc.question) }))
    .filter(e => !q.theme || !e.theme || e.theme === q.theme)
    .sort((a, b) => b.overlap - a.overlap || b.score - a.score)
    .slice(0, 3);

  const faculty = await facultyContext(q.question, q.stream, { aiStore }).catch(() => null);
  return { chunks, bank: faculty ? [faculty.bankEntry, ...bank] : bank, faculty, reuse: findReuse(q, bankIdx.entries), method, timeSensitive, embedUsage };
}

/**
 * An already-approved answer for the same merged group or intent. Golden answers only count when
 * approved; same-intent bank answers also need clear wording overlap.
 */
export function findReuse(q, entries) {
  // A mentor-assist draft approved word for word is general guidance, not a sourced answer: a new question should still get a grounded draft.
  const approved = (entries || []).filter(e => e.approved && e.answer && !(e.mode === "mentor-assist" && e.status === "approved"));
  if (q.clusterId) {
    const same = approved.find(e => e.targetType === "cluster" && e.targetId === q.clusterId);
    if (same) return { entry: same, why: "same merged group" };
  }
  if (q.questionId) {
    const same = approved.find(e => e.targetType === "question" && e.targetId === q.questionId);
    if (same) return { entry: same, why: "same question" };
  }
  let best = null;
  for (const e of approved) {
    if (q.theme && e.theme && e.theme !== q.theme) continue;
    const overlap = jaccard(q.question, e.question);
    const sameIntent = q.intentKey && e.intentKey && e.intentKey === q.intentKey;
    const ok = (sameIntent && overlap >= 0.45) || overlap >= 0.7;
    if (ok && (!best || overlap > best.overlap)) best = { entry: e, overlap, why: sameIntent ? "same intent" : "near-identical question" };
  }
  return best;
}
