/**
 * Shared helpers for the knowledge-base scripts (crawl / embed / upload / refresh / golden).
 * Node-only; no dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { STREAMS } from "../../server/ai/personas/index.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** AYM_KB_DIR lets a serverless cron write to /tmp instead of the read-only bundle. */
export const KB_DIR = process.env.AYM_KB_DIR ? path.resolve(process.env.AYM_KB_DIR) : path.join(ROOT, "data/kb");
export const CACHE_DIR = path.join(KB_DIR, "cache");
export const CHUNKS_FILE = path.join(KB_DIR, "chunks.jsonl");
/** Vectors live outside chunks.jsonl (which ships in the serverless bundle): `{ id, contentHash, model, embedding }`. */
export const VECTORS_FILE = path.join(CACHE_DIR, "embeddings.jsonl");
export const PAGES_FILE = path.join(KB_DIR, "pages.jsonl");
export const SOURCES_FILE = path.join(ROOT, "config/ai-sources.json");

export const sha1 = s => createHash("sha1").update(String(s)).digest("hex");

export function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8"));
}

export function hostMatches(host, domain) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  const d = String(domain).toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/** Host belongs to a source (its domain or one of its `aliases`). */
export function sourceHostMatches(src, host) {
  return [src.domain, ...(src.aliases || [])].some(d => hostMatches(host, d));
}

/** Source config entry for a URL, or null when it is not on the allow-list. */
export function sourceForUrl(url, sources) {
  let host;
  try { host = new URL(url).hostname; } catch { return null; }
  let best = null;
  for (const s of sources) if (sourceHostMatches(s, host) && (!best || s.domain.length > best.domain.length)) best = s;
  return best;
}

// ------------------------------------------------------------------ JSONL

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip corrupt line */ }
  }
  return out;
}

export function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  fs.renameSync(tmp, file);
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

// ------------------------------------------------------------------ HTML → text

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", rarr: "→", raquo: "»", laquo: "«" };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripBlocks(html, tags) {
  let out = html;
  for (const t of tags) out = out.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}>`, "gi"), " ");
  return out;
}

/** Remove elements whose class/id mark them as chrome (menus, footers, breadcrumbs, cookie bars). */
function stripChrome(html) {
  const chrome = /(?:^|[\s_-])(?:nav|navbar|menu|footer|header|breadcrumb|sidebar|cookie|skip|social|share|banner|marquee|ticker|top-bar|topbar|mega|dropdown|accessibility|screen-reader|offcanvas|modal)(?:$|[\s_-])/i;
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    out = out.replace(/<(div|ul|section|aside|span)\b([^>]*\b(?:class|id)\s*=\s*["'][^"']*["'][^>]*)>/gi, (m, tag, attrs) => {
      const val = (attrs.match(/\b(?:class|id)\s*=\s*["']([^"']*)["']/gi) || []).join(" ");
      return chrome.test(val) ? `<${tag} data-chrome="1"${attrs}>` : m;
    });
    // Remove innermost marked elements (no nested same tag inside).
    out = out.replace(/<(div|ul|section|aside|span) data-chrome="1"[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/gi, " ");
  }
  return out;
}

export function htmlTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const pick = (og && og[1]) || (h1 && h1[1].replace(/<[^>]+>/g, " ")) || (t && t[1]) || "";
  return decodeEntities(pick).replace(/\s+/g, " ").trim().slice(0, 200);
}

export function htmlPublishedAt(html) {
  const metas = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|article:modified_time|datePublished|dateModified|date|DC\.date|last-modified)["'][^>]+content=["']([^"']+)["']/i,
    /"date(?:Published|Modified)"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of metas) {
    const m = html.match(re);
    if (m) { const d = parseDate(m[1]); if (d) return d; }
  }
  const text = html.replace(/<[^>]+>/g, " ");
  const lu = text.match(/(?:last\s+(?:updated|modified|reviewed)|updated\s+on|page\s+last\s+updated)\s*(?:on|:)?\s*[:\-]?\s*([0-9]{1,2}[\/\-. ][0-9a-z]{1,9}[\/\-. ,]+[0-9]{2,4}|[a-z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4})/i);
  if (lu) { const d = parseDate(lu[1]); if (d) return d; }
  return null;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function parseDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^D:(\d{4})(\d{2})(\d{2})/); // PDF date
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})$/);
  if (m) return iso(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})[\/\-. ]([a-z]{3,9})[\/\-. ,]+(\d{4})$/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function iso(y, mo, d) {
  if (y < 1990 || y > 2100 || mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10);
}

/** Main readable text of an HTML page (paragraph breaks kept as blank lines). */
export function htmlToText(html) {
  return htmlExtract(html).text;
}

/** Main text plus the share of its words that are link text (menus / index pages score high). */
export function htmlExtract(html) {
  let h = String(html);
  h = h.replace(/<!--[\s\S]*?-->/g, " ");
  h = stripBlocks(h, ["script", "style", "noscript", "svg", "template", "iframe", "head", "form", "select", "button"]);
  const main = h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
    || h.match(/<div[^>]+(?:id|class)=["'][^"']*\b(?:main-content|maincontent|content-area|page-content|region-content|inner-content)\b[^"']*["'][^>]*>([\s\S]*)/i);
  if (main && main[1].replace(/<[^>]+>/g, "").trim().length > 300) h = main[1];
  h = stripBlocks(h, ["nav", "header", "footer", "aside"]);
  h = stripChrome(h);
  const anchorWords = (h.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [])
    .map(a => decodeEntities(a.replace(/<[^>]+>/g, " "))).join(" ").split(/\s+/).filter(Boolean).length;
  h = h.replace(/<(?:br|hr)\b[^>]*>/gi, "\n");
  h = h.replace(/<li\b[^>]*>/gi, "\n• ");
  h = h.replace(/<\/(?:td|th)>/gi, " | ");
  h = h.replace(/<\/?(?:p|div|section|article|h[1-6]|ul|ol|li|tr|table|tbody|thead|blockquote|dl|dt|dd|figure|figcaption|pre)\b[^>]*>/gi, "\n\n");
  h = h.replace(/<[^>]+>/g, " ");
  h = decodeEntities(h);
  const text = cleanText(h);
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  return { text, density: Math.min(1, anchorWords / words) };
}

const CHROME_LINE = /^(?:skip to (?:main )?content|skip to navigation|main menu|menu|search|home|share|print|back to top|top|close|toggle navigation|read more|more|next|previous|english|हिन्दी|हिंदी|a\+|a-|a|screen reader access|font size|sitemap|login)$/i;

export function cleanText(t) {
  const lines = String(t).replace(/\r/g, "").replace(/[\t\u00a0\u200b]+/g, " ").split("\n").map(l => l.replace(/\s+/g, " ").trim());
  const out = [];
  let blank = false;
  for (const l of lines) {
    if (!l || /^[•|\s]+$/.test(l) || CHROME_LINE.test(l.replace(/^[•\s]+/, ""))) { if (!blank && out.length) out.push(""); blank = true; continue; }
    out.push(l.replace(/(?:\s*\|\s*)+$/, ""));
    blank = false;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Absolute http(s) links with their anchor text. */
export function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = decodeEntities(m[1]).trim();
    if (/^(?:javascript|mailto|tel|data):/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      out.push({ url: u.toString(), text: decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 160) });
    } catch { /* bad href */ }
  }
  return out;
}

/** Share of words on the page that sit inside links — high values mean a menu / index page. */
export function linkDensity(html, text) {
  const anchorWords = (String(html).match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) || [])
    .map(a => a.replace(/<[^>]+>/g, " ")).join(" ").split(/\s+/).filter(Boolean).length;
  const words = String(text).split(/\s+/).filter(Boolean).length || 1;
  return Math.min(1, anchorWords / words);
}

// ------------------------------------------------------------------ chunking

/** Rough token count (~0.75 words per token for English prose). */
export function countTokens(text) {
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.33);
}

function splitSentences(p) {
  return String(p).match(/[^.!?।]+(?:[.!?।]+|$)/g)?.map(s => s.trim()).filter(Boolean) || [p];
}

/**
 * Split text into ~target-token chunks on paragraph / sentence boundaries with `overlap` tokens
 * carried over from the previous chunk.
 */
export function chunkText(text, { target = 500, overlap = 60, min = 60 } = {}) {
  const units = [];
  for (const para of String(text).split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (countTokens(p) <= target) units.push(p);
    else {
      let buf = "";
      for (const s of splitSentences(p)) {
        if (buf && countTokens(`${buf} ${s}`) > target) { units.push(buf); buf = s; } else buf = buf ? `${buf} ${s}` : s;
      }
      if (buf) units.push(buf);
    }
  }
  const chunks = [];
  let cur = [];
  let curTok = 0;
  const flush = () => {
    if (!cur.length) return;
    chunks.push(cur.join("\n\n"));
    // Carry the tail of this chunk forward as overlap.
    const tailWords = cur.join(" ").split(/\s+/);
    const keep = Math.max(0, Math.floor(overlap / 1.33));
    const tail = keep ? tailWords.slice(-keep).join(" ") : "";
    cur = tail ? [tail] : [];
    curTok = countTokens(tail);
  };
  for (const u of units) {
    const t = countTokens(u);
    if (curTok + t > target && curTok > overlap) flush();
    // A single sentence longer than the target is hard-split by words.
    if (t > target * 1.5) {
      const words = u.split(/\s+/);
      const step = Math.floor(target / 1.33);
      for (let i = 0; i < words.length; i += step) {
        cur.push(words.slice(i, i + step).join(" "));
        curTok += countTokens(cur[cur.length - 1]);
        flush();
      }
      continue;
    }
    cur.push(u);
    curTok += t;
  }
  if (cur.length && countTokens(cur.join(" ")) > overlap) flush();
  return chunks.filter(c => countTokens(c) >= min);
}

/** Paragraph is mostly boilerplate (cookie text, copyright, visitor counters, menus). */
export function isJunkText(text) {
  return junkReason(text) !== null;
}

const DISCLAIMER = /(disclaims? any liability|without prior notice|do(?:es)? not imply (?:recommendation|endorsement)|not (?:control|responsible) (?:or take responsibility )?for the content|reference purposes only|users are advised not to act or rely|makes no warrant)/gi;
const DOSING = /(\b\d+(?:\.\d+)?\s?(?:mg|gm|g|ml|tsf|tsp|drops)\b|\bdos(?:e|age)\b|\banupana\b|\b(?:twice|thrice) daily\b|\b(?:bd|tds|od)\b|\b(?:before|after) (?:food|meals?)\b|\bwith (?:warm|luke ?warm) water\b)/gi;
const TREATING = /\b(management|treatment|patients?|symptoms?|indicat(?:ion|ed)|contraindicat)/gi;
const METHODOLOGY = /\b(clinical evaluation|study design|protocol|investigator|toxicity stud|ethics committee|randomi[sz]ed|sample size)/gi;

/** Share of Devanagari words that are broken PDF extraction (Latin glyphs inside, misplaced ि matra). */
function devanagariGarble(text) {
  const words = String(text).split(/\s+/).filter(w => /[\u0900-\u097f]/.test(w));
  if (words.length < 20) return { words: words.length, ratio: 0 };
  const bad = words.filter(w => /[\u0900-\u097f][A-Za-z^~\\`|{}\u0180-\u03ff£¢]|[A-Za-z^~\\`|{}\u0180-\u03ff£¢][\u0900-\u097f]|(?:^|[^\u0915-\u0939\u0958-\u095f\u093c])\u093f/.test(w)).length;
  return { words: words.length, ratio: bad / words.length };
}

/**
 * Why a chunk is not worth keeping (null = keep): navigation / boilerplate, corrupted text,
 * reference lists, or clinical dosing/treatment content (this desk gives career guidance only).
 */
export function junkReason(text) {
  const raw = String(text);
  const t = raw.toLowerCase();
  if (t.length < 200) return "too-short";
  const letters = (t.match(/[a-z\u0900-\u097f]/g) || []).length;
  if (letters / t.length < 0.55) return "low-letter-ratio";
  const junk = /(cookie|copyright|all rights reserved|visitor (?:count|counter)|last updated|screen reader|skip to (?:main )?content|font size|a\+ a a-|website (?:policies|designed)|hyperlinking policy|help\s*\|\s*feedback)/g;
  const hits = (t.match(junk) || []).length;
  if (hits >= 3 && t.length < 1500) return "site-chrome";
  if ((raw.match(DISCLAIMER) || []).length >= 2) return "disclaimer";
  // Legacy Hindi fonts (Kruti Dev etc.) extract from PDFs as ASCII garble like "nh?kkZd`fr".
  const words = t.split(/\s+/);
  const garbled = words.filter(w => /[a-z][`~^\\\]\[{}|][a-z]|[a-z]{2,}[A-Z][a-z]*[`~^]|kk[A-Z]|[a-z]\?[a-z]/.test(w)).length;
  if (words.length && garbled / words.length > 0.08) return "garbled-legacy-font";
  // Unicode Hindi from the same PDFs is often mis-ordered or mixed with Latin/IPA glyphs; it cannot be quoted.
  const deva = devanagariGarble(raw);
  const devaShare = (raw.match(/[\u0900-\u097f]/g) || []).length / (letters || 1);
  if (devaShare > 0.3 && deva.ratio > 0.03) return "garbled-devanagari";
  // Bibliographies / reference lists carry no career facts.
  const refs = (t.match(/\bet al\b|\bdoi:|\d{4};\s*\d+\s*\(\d+\)|\d{4};\d+:\d+/g) || []).length;
  if (refs >= 4) return "reference-list";
  const dosing = (raw.match(DOSING) || []).length;
  const treating = (raw.match(TREATING) || []).length;
  if (dosing >= 4 && treating >= 2 && (raw.match(METHODOLOGY) || []).length < 3) return "clinical-dosing";
  return null;
}

/** Visible "28 November 2025" style date near the top of the text. */
export function leadingDate(text) {
  const m = String(text).slice(0, 400).match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);
  return m ? parseDate(`${m[1]} ${m[2]} ${m[3]}`) : null;
}

// ------------------------------------------------------------------ streams

const STREAM_CUES = Object.fromEntries(STREAMS.map(s => [s.id, s]));
const KEYWORDS = {
  "pg-entrance": /\b(aiapget|post ?graduate|pg (?:course|seat|admission|degree)|md\s*\/?\s*ms|m\.d\.|counsell?ing|aaccc|entrance)\b/i,
  "govt-jobs": /\b(recruitment|medical officer|vacanc|public service commission|psc|upsc|national ayush mission|cghs|esic)\b/i,
  "clinical-practice": /\b(clinic|hospital|practi[cs]e|registration|central register|clinical establishment|opd|ipd)\b/i,
  "panchakarma-wellness": /\b(panchakarma|wellness|medical value travel|spa|resort|therap(?:y|ist))\b/i,
  "research-phd": /\b(research|ph\.?d|thesis|publication|journal|clinical trial|ctri|ethics committee|fellowship)\b/i,
  "teaching-academia": /\b(faculty|teacher|teaching|professor|lecturer|curriculum|minimum standard|college)\b/i,
  "industry-pharma": /\b(gmp|good manufacturing|drug licen|schedule t|pharmacopoeia|quality control|pharmacovigilance|manufactur)\b/i,
  "entrepreneurship": /\b(start-?up|incubat|entrepreneur|trademark|patent|seed fund)\b/i,
  "export-trade": /\b(export|import|incoterm|iec\b|customs|foreign trade|shipment)\b/i,
  "digital-branding": /\b(advertis|misleading|objectionable|social media|claims?)\b/i,
  "practice-abroad": /\b(abroad|international cooperation|foreign|overseas|country|countries|mou)\b/i,
  "abroad-gulf": /\b(uae|dubai|abu dhabi|gulf|gcc|dha|mohap)\b/i,
  "abroad-usa": /\b(united states|usa|u\.s\.|america)\b/i,
  "abroad-uk-eu": /\b(united kingdom|uk|mhra|europe|european|switzerland|germany)\b/i,
  "public-health-policy": /\b(public health|world health|policy|national programme|global centre)\b/i,
  "internship-early-career": /\b(internship|intern|bams|undergraduate|graduate|career)\b/i,
};
// Case-sensitive cues ("WHO" the agency, not the pronoun).
const KEYWORDS_CS = { "public-health-policy": /\bWHO\b/ };

// The server retriever filters chunks by stream, so regional abroad personas also need the general
// abroad material (recognition, MoUs, visas) and vice versa.
const ABROAD_FAMILY = ["practice-abroad", "abroad-gulf", "abroad-usa", "abroad-uk-eu"];

/** Stream ids for a chunk: the source's streams, narrowed by keywords when the source covers "*". */
export function streamsForChunk(text, title, sourceStreams) {
  const list = Array.isArray(sourceStreams) && sourceStreams.length ? sourceStreams : ["*"];
  let hits;
  if (!list.includes("*")) hits = list.filter(id => STREAM_CUES[id]);
  else {
    const hay = `${title}\n${text}`;
    hits = Object.entries(KEYWORDS).filter(([id, re]) => re.test(hay) || KEYWORDS_CS[id]?.test(hay)).map(([id]) => id);
  }
  if (hits.includes("practice-abroad")) hits = [...new Set([...hits, ...ABROAD_FAMILY])];
  else if (hits.some(id => ABROAD_FAMILY.includes(id))) hits.push("practice-abroad");
  return hits.length ? hits : ["*"];
}

// ------------------------------------------------------------------ retrieval (BM25 + cosine)

const STOP = new Set("a an the and or of to in on at by for with from is are was were be been this that these those it its as can will shall may should must not no do does did has have had which who what when where how why than then there their they them you your we our us he she his her i me my into over under also any all such per via upto up out about more most other".split(" "));

export function tokenizeForSearch(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").split(" ")
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(w => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, "") : w));
}

export class Bm25Index {
  constructor(docs, { k1 = 1.4, b = 0.72, field = d => `${d.title}\n${d.text}` } = {}) {
    this.docs = docs;
    this.k1 = k1;
    this.b = b;
    this.tf = [];
    this.len = [];
    this.df = new Map();
    for (const d of docs) {
      const toks = tokenizeForSearch(field(d));
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      this.tf.push(tf);
      this.len.push(toks.length);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    this.avg = this.len.reduce((a, b2) => a + b2, 0) / (this.len.length || 1);
  }

  search(query, { k = 8, filter } = {}) {
    const q = [...new Set(tokenizeForSearch(query))];
    const N = this.docs.length;
    const scores = [];
    for (let i = 0; i < N; i++) {
      if (filter && !filter(this.docs[i])) continue;
      const tf = this.tf[i];
      let s = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * (this.len[i] / this.avg)));
      }
      if (s > 0) scores.push([i, s]);
    }
    scores.sort((a, b2) => b2[1] - a[1]);
    return scores.slice(0, k).map(([i, s]) => ({ doc: this.docs[i], score: s }));
  }
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
