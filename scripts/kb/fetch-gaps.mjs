#!/usr/bin/env node
/**
 * Fill the knowledge-base gaps behind "insufficient source" drafts: AIAPGET (NTA), NEET-PG vs
 * AIAPGET (NBEMS), UPSC CMS / AYUSH medical officer recruitment, state PSC AYUSH medical officer
 * notices, NCISM practitioner registration / regulations, the Clinical Establishments Act and
 * Gulf licensing (DHA, DOH Abu Dhabi, MOHAP). Needs open network — run it outside the sandbox:
 *
 *   node scripts/kb/fetch-gaps.mjs                 # fetch → data/kb/manual/ + manifest → chunk → clean → coverage
 *   node scripts/kb/fetch-gaps.mjs --only=aiapget,neetpg
 *   node scripts/kb/fetch-gaps.mjs --dry           # fetch and report; do not touch chunks.jsonl
 *   node scripts/kb/fetch-gaps.mjs --no-clean      # skip scripts/kb/clean.mjs
 *
 * Every saved document is listed in data/kb/manual/manifest.json ({ file, url, title, publishedAt,
 * fetchedAt, authority, gap }) — the format crawl.mjs already ingests, so a later full crawl keeps
 * them. Only allow-listed hosts (config/ai-sources.json) are fetched; robots.txt is honoured.
 * PDFs are read with python3 + pypdf (the crawler's extractor), or the `unpdf` package if it is
 * installed; otherwise the PDF is saved and reported. Chunks carry no embeddings and the run is
 * capped (per document and in total) so the bundled chunks.jsonl stays small.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ROOT, KB_DIR, CACHE_DIR, CHUNKS_FILE, sha1, loadSources, sourceForUrl, readJsonl, writeJsonl, writeJson,
  htmlExtract, htmlTitle, htmlPublishedAt, extractLinks, chunkText, countTokens, isJunkText, streamsForChunk, cleanText, parseDate, sleep,
} from "./lib.mjs";

const execFileP = promisify(execFile);
export const MANUAL_DIR = path.join(KB_DIR, "manual");
export const MANIFEST_FILE = path.join(MANUAL_DIR, "manifest.json");
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 15 * 1024 * 1024;
const PDF_MAX_PAGES = 40;
export const MAX_CHUNKS_PER_DOC = 40;
export const MAX_NEW_CHUNKS = 600;
const MIN_TEXT = 300;
const WARN_BYTES = 12 * 1024 * 1024;
const ABORT_BYTES = 15 * 1024 * 1024;

/**
 * One target per faculty Q&A bank (`data/faculty/<streamId>.json`, see
 * docs/ai/FACULTY-BANK-SPEC.md): the exact URLs on its Sources sheet and in its rows.
 */
export function facultyTargets(dir = path.join(ROOT, "data/faculty")) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) {
    let bank;
    try { bank = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (!bank || !bank.streamId || !Array.isArray(bank.entries)) continue;
    const pages = [...new Set([...(bank.sources || []).map(s => s.url), ...bank.entries.flatMap(e => e.sources || [])].filter(Boolean))];
    out.push({ id: `faculty-${bank.streamId}`, stream: bank.streamId, label: `Faculty Q&A sources — ${bank.stream || bank.streamId}`, pages });
  }
  return out;
}

/**
 * What to fetch. `pages` are saved as they are; `discover` pages are scanned for links (URL or
 * anchor text matching `match`) on allow-listed hosts — PDFs first — up to `max` documents.
 */
export const TARGETS = [
  {
    id: "aiapget", stream: "pg-entrance", label: "AIAPGET (NTA)",
    pages: ["https://exams.nta.ac.in/AIAPGET/"],
    discover: { from: ["https://exams.nta.ac.in/AIAPGET/"], match: /bulletin|information|eligib|syllabus|public[-_ ]?notice|faq/i, max: 4 },
  },
  {
    id: "neetpg", stream: "pg-entrance", label: "NEET-PG vs AIAPGET (NBEMS)",
    pages: ["https://natboard.edu.in/viewnbeexam?exam=neetpg"],
    discover: { from: ["https://natboard.edu.in/viewnbeexam?exam=neetpg", "https://natboard.edu.in/"], match: /neet[-_ ]?pg|information[-_ ]?bulletin|eligib/i, max: 3 },
  },
  {
    id: "upsc-ayush", stream: "govt-jobs", label: "UPSC CMS / AYUSH medical officer",
    pages: [],
    discover: { from: ["https://upsc.gov.in/examinations/active-exams", "https://upsc.gov.in/recruitment/recruitment-advertisement"], match: /combined[-_ ]?medical|\bcms\b|ayur|ayush|unani|homoeo|medical[-_ ]officer/i, max: 5 },
  },
  {
    id: "state-psc", stream: "govt-jobs", label: "State PSC AYUSH medical officer (KL, RJ, MP, UP, MH)",
    pages: [],
    discover: {
      from: ["https://www.keralapsc.gov.in/", "https://rpsc.rajasthan.gov.in/", "https://mppsc.mp.gov.in/", "https://uppsc.up.nic.in/", "https://mpsc.gov.in/"],
      match: /ayur|ayush|unani|homoeo|\bism\b|indian[-_ ]system/i, max: 8,
    },
  },
  {
    id: "ncism", stream: "clinical-practice", label: "NCISM practitioner registration / regulations",
    pages: ["https://ncismindia.org/"],
    discover: { from: ["https://ncismindia.org/"], match: /regulation|registration|central[-_ ]register|practitioner|gazette|ethic|minimum[-_ ]standard/i, max: 6 },
  },
  {
    id: "clinical-establishments", stream: "clinical-practice", label: "Clinical Establishments Act",
    pages: ["https://clinicalestablishments.gov.in/"],
    discover: { from: ["https://clinicalestablishments.gov.in/"], match: /\bact\b|rules|minimum[-_ ]standard|ayush|ayurved|registration/i, max: 5 },
  },
  {
    id: "gulf", stream: "abroad-gulf", label: "Gulf licensing (DHA, DOH, MOHAP)",
    pages: ["https://www.dha.gov.ae/en", "https://www.doh.gov.ae/en", "https://mohap.gov.ae/en/services/issue-of-a-professional-license"],
    discover: {
      from: ["https://www.dha.gov.ae/en", "https://www.doh.gov.ae/en", "https://mohap.gov.ae/en/services/issue-of-a-professional-license"],
      match: /pqr|professional[-_ ]qualification|licens|complementary|traditional|tcam|alternative/i, max: 6,
    },
  },
  ...facultyTargets(),
];

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

/** Candidate document links on a page: allow-listed hosts only, matching URL or anchor text, PDFs first, no duplicates. */
export function discoverLinks(html, baseUrl, { match, sources, max = 5, exclude = new Set() } = {}) {
  const seen = new Set();
  const out = [];
  for (const l of extractLinks(html, baseUrl)) {
    const url = l.url.replace(/#.*$/, "");
    if (seen.has(url) || exclude.has(url) || url === baseUrl) continue;
    seen.add(url);
    if (!sourceForUrl(url, sources)) continue;
    if (/\.(?:jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4)(?:$|\?)/i.test(url)) continue;
    if (/hindi|_h\.pdf|[?&]lang=hi|\/hi\//i.test(url)) continue;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* keep raw */ }
    if (match && !match.test(decoded) && !match.test(l.text)) continue;
    out.push({ url, text: l.text, pdf: /\.pdf(?:$|\?)/i.test(url) });
  }
  out.sort((a, b) => Number(b.pdf) - Number(a.pdf));
  return out.slice(0, max);
}

/** "https://exams.nta.ac.in/AIAPGET/images/Bulletin 2026.pdf" → "exams-nta-ac-in-aiapget-images-bulletin-2026-<hash>.pdf" */
export function fileNameFor(url, ext) {
  let base = url;
  try { const u = new URL(url); base = `${u.hostname}${u.pathname}${u.search}`; } catch { /* keep */ }
  let slug = base.replace(/^www\./, "");
  try { slug = decodeURIComponent(slug); } catch { /* keep */ }
  slug = slug.toLowerCase().replace(/\.(pdf|html?|aspx?|php)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${slug || "doc"}-${sha1(url).slice(0, 8)}.${ext}`;
}

/** Re-join hard-wrapped PDF lines into paragraphs; drop bare page numbers. */
export function tidyPdfText(t) {
  const lines = String(t).replace(/\r/g, "").split("\n");
  const paras = [];
  let buf = "";
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, " ").trim();
    if (!l) { if (buf) { paras.push(buf); buf = ""; } continue; }
    if (/^\d{1,3}$/.test(l)) continue;
    const startsItem = /^(?:\(?[0-9ivxa-h]{1,4}[.)]|[•\-–*])\s/.test(l);
    if (buf && (startsItem || (/[.:;?]$/.test(buf) && /^[A-Z0-9(]/.test(l) && buf.length > 280))) { paras.push(buf); buf = l; } else buf = buf ? `${buf} ${l}` : l;
  }
  if (buf) paras.push(buf);
  return cleanText(paras.join("\n\n"));
}

export function looksPdf(buf, contentType = "") {
  return String(contentType).toLowerCase().includes("pdf") || (buf && buf.subarray(0, 5).toString() === "%PDF-");
}

/** HTML document → { kind, title, text, publishedAt }. */
export function parseHtmlDoc(html, url) {
  const { text } = htmlExtract(html);
  let title = htmlTitle(html);
  if (!title) { try { title = new URL(url).pathname.split("/").filter(Boolean).pop() || url; } catch { title = url; } }
  return { kind: "html", title, text, publishedAt: htmlPublishedAt(html) };
}

/** Chunks in the KB contract shape (no embeddings), capped per document. */
export function docChunks(doc, { fetchedAt, sources, max = MAX_CHUNKS_PER_DOC }) {
  const src = sourceForUrl(doc.url, sources);
  if (!src) return [];
  const out = [];
  chunkText(doc.text, { target: 500, overlap: 60 }).forEach((text, idx) => {
    if (out.length >= max || isJunkText(text)) return;
    out.push({
      id: sha1(`${doc.url}#${idx}`),
      url: doc.url,
      title: doc.title || src.name,
      text,
      tokens: countTokens(text),
      publishedAt: doc.publishedAt || null,
      fetchedAt,
      authority: src.authority,
      streams: streamsForChunk(text, doc.title || "", src.streams),
      contentHash: sha1(text),
    });
  });
  return out;
}

/** Replace every chunk of the refreshed URLs; skip new chunks whose text is already in the KB. */
export function mergeChunks(prev, fresh) {
  const urls = new Set(fresh.map(c => c.url));
  const kept = prev.filter(c => !urls.has(c.url));
  const hashes = new Set(kept.map(c => c.contentHash).filter(Boolean));
  const ids = new Set(kept.map(c => c.id));
  const added = [];
  for (const c of fresh) {
    if (hashes.has(c.contentHash) || ids.has(c.id)) continue;
    hashes.add(c.contentHash);
    ids.add(c.id);
    added.push(c);
  }
  return { chunks: [...kept, ...added], added: added.length, replaced: prev.length - kept.length };
}

/** Manifest entries keyed by URL: a refetch replaces the old entry. */
export function mergeManifest(prev, entries) {
  const byUrl = new Map((Array.isArray(prev) ? prev : []).map(e => [e.url, e]));
  for (const e of entries) byUrl.set(e.url, e);
  return [...byUrl.values()].sort((a, b) => String(a.gap || "").localeCompare(String(b.gap || "")) || String(a.url).localeCompare(String(b.url)));
}

/** Chunk counts per stream id ("*" counts once under "all-streams"). */
export function coverageByStream(chunks) {
  const out = {};
  for (const c of chunks) for (const s of (c.streams && c.streams.length ? c.streams : ["*"])) {
    const k = s === "*" ? "all-streams" : s;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastAgent = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const m = raw.replace(/#.*/, "").trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!lastAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(m[2].trim().toLowerCase());
      lastAgent = true;
      continue;
    }
    lastAgent = false;
    if (cur && (key === "allow" || key === "disallow") && m[2].trim()) cur.rules.push({ allow: key === "allow", path: m[2].trim() });
  }
  const g = groups.find(x => x.agents.includes("*"));
  return g ? g.rules : [];
}

export function robotsAllows(rules, url) {
  let p;
  try { const u = new URL(url); p = u.pathname + u.search; } catch { return false; }
  let best = null;
  for (const r of rules || []) {
    const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/* ---------------------------------------------------------------- network + PDF */

function isTlsError(err) {
  const code = err?.cause?.code || err?.code || "";
  return /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code) || /certificate/i.test(err?.cause?.message || "");
}

async function viaCurl(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `gap-${sha1(url)}.bin`);
  const { stdout } = await execFileP("curl", ["-sSL", "--compressed", "--max-time", "45", "--max-filesize", String(MAX_BYTES), "-A", UA,
    "-H", "Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8", "-H", "Accept-Language: en-IN,en;q=0.9",
    "-o", file, "-w", "%{http_code}\t%{content_type}\t%{url_effective}", url], { maxBuffer: 1 << 20 });
  const [code, ctype, finalUrl] = stdout.split("\t");
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  try { fs.unlinkSync(file); } catch { /* gone */ }
  return { status: Number(code), contentType: ctype || "", url: finalUrl || url, buf };
}

/** GET with a browser-like User-Agent, 3 attempts with backoff on network errors / 429 / 5xx; TLS problems fall back to curl. */
async function fetchDoc(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * 3 ** (attempt - 1));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8", "Accept-Language": "en-IN,en;q=0.9" },
      });
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_BYTES) return { status: 413, contentType: res.headers.get("content-type") || "", url: res.url, buf: Buffer.alloc(0) };
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) { last = `HTTP ${res.status}`; continue; }
      return { status: res.status, contentType: res.headers.get("content-type") || "", url: res.url || url, buf };
    } catch (err) {
      clearTimeout(timer);
      if (isTlsError(err)) {
        try { return await viaCurl(url); } catch (e) { last = `tls+curl: ${String(e.message || e).split("\n")[0]}`; break; }
      }
      last = err.name === "AbortError" ? "timeout" : (err?.cause?.code || err.message || String(err));
    }
  }
  throw new Error(last || "fetch failed");
}

const PDF_PY = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
out = []
for p in r.pages[:int(sys.argv[2])]:
    try:
        out.append(p.extract_text() or "")
    except Exception:
        out.append("")
meta = r.metadata or {}
print(json.dumps({"pages": len(r.pages), "text": "\\n\\n".join(out), "title": str(meta.get("/Title") or ""), "created": str(meta.get("/ModDate") or meta.get("/CreationDate") or "")}))
`;

let extractor = null;
/** "pypdf" | "unpdf" | "" — the first PDF text extractor available. */
export async function pdfExtractor() {
  if (extractor !== null) return extractor;
  try { await execFileP("python3", ["-c", "import pypdf"]); extractor = "pypdf"; return extractor; } catch { /* next */ }
  try { await import("unpdf"); extractor = "unpdf"; } catch { extractor = ""; }
  return extractor;
}

/** PDF file → { text, title, publishedAt, pages } (first PDF_MAX_PAGES pages). */
export async function pdfText(file) {
  const kind = await pdfExtractor();
  if (kind === "pypdf") {
    const { stdout } = await execFileP("python3", ["-c", PDF_PY, file, String(PDF_MAX_PAGES)], { maxBuffer: 64 << 20, timeout: 120_000 });
    const p = JSON.parse(stdout);
    return { text: tidyPdfText(p.text), title: p.title, publishedAt: parseDate(p.created), pages: p.pages };
  }
  if (kind === "unpdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    return { text: tidyPdfText((Array.isArray(text) ? text : [text]).slice(0, PDF_MAX_PAGES).join("\n\n")), title: "", publishedAt: null, pages: totalPages };
  }
  throw new Error("no PDF text extractor (pip install pypdf, or npm i -D unpdf)");
}

/* ---------------------------------------------------------------- main */

const log = (...a) => console.log("[fetch-gaps]", ...a);

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
  const only = args.only ? new Set(String(args.only).split(",").map(s => s.trim())) : null;
  const dry = Boolean(args.dry);
  const sources = loadSources();
  const targets = TARGETS.filter(t => !only || only.has(t.id));
  fs.mkdirSync(MANUAL_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();
  const robotsCache = new Map();
  const done = new Set();
  const entries = [];
  const docs = [];
  const report = [];
  log(`targets: ${targets.map(t => t.id).join(", ")} · PDF extractor: ${(await pdfExtractor()) || "none (PDFs saved, not read)"}`);

  async function allowed(url) {
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      let rules = [];
      try { const r = await fetchDoc(`${origin}/robots.txt`); if (r.status === 200) rules = parseRobots(r.buf.toString("utf8")); } catch { /* none */ }
      robotsCache.set(origin, rules);
    }
    return robotsAllows(robotsCache.get(origin), url);
  }

  async function save(url, target, rep) {
    if (done.has(url)) return null;
    done.add(url);
    const src = sourceForUrl(url, sources);
    if (!src) { rep.failed.push(`${url}: not on the allow-list`); return null; }
    if (!(await allowed(url))) { rep.failed.push(`${url}: robots.txt disallows — save it by hand`); return null; }
    let res;
    try { res = await fetchDoc(url); } catch (err) { rep.failed.push(`${url}: ${err.message}`); return null; }
    if (res.status !== 200 || !res.buf.length) { rep.failed.push(`${url}: HTTP ${res.status}`); return null; }
    const finalUrl = sourceForUrl(res.url, sources) ? res.url : url;
    let doc;
    let file;
    if (looksPdf(res.buf, res.contentType)) {
      file = fileNameFor(finalUrl, "pdf");
      fs.writeFileSync(path.join(MANUAL_DIR, file), res.buf);
      try {
        const p = await pdfText(path.join(MANUAL_DIR, file));
        const title = (p.title && p.title.length > 4 && !/^untitled|microsoft word/i.test(p.title) ? p.title : "") || decodeURIComponent(finalUrl.split("/").pop() || "").replace(/\.pdf.*$/i, "").replace(/[_-]+/g, " ");
        doc = { kind: "pdf", title, text: p.text, publishedAt: p.publishedAt };
      } catch (err) {
        rep.failed.push(`${finalUrl}: saved ${file}, text not extracted (${String(err.message).split("\n")[0].slice(0, 120)})`);
        return null;
      }
    } else {
      const html = res.buf.toString("utf8");
      file = fileNameFor(finalUrl, "html");
      fs.writeFileSync(path.join(MANUAL_DIR, file), html);
      doc = parseHtmlDoc(html, finalUrl);
      doc.html = html;
    }
    if (doc.text.length < MIN_TEXT) { rep.failed.push(`${finalUrl}: only ${doc.text.length} characters of text (JS-rendered or scanned?) — save the document by hand`); return doc; }
    const entry = { file, url: finalUrl, title: doc.title || src.name, publishedAt: doc.publishedAt || null, fetchedAt, authority: src.authority, gap: target.id, kind: doc.kind, bytes: res.buf.length };
    entries.push(entry);
    docs.push({ url: finalUrl, title: entry.title, text: doc.text, publishedAt: entry.publishedAt, gap: target.id });
    rep.saved.push(`${doc.kind.toUpperCase()} ${finalUrl} (${Math.round(res.buf.length / 1024)} KB) → ${file}`);
    return doc;
  }

  for (const t of targets) {
    const rep = { id: t.id, label: t.label, saved: [], failed: [] };
    const pages = new Map();
    for (const url of t.pages) {
      const d = await save(url, t, rep);
      if (d && d.html) pages.set(url, d.html);
      await sleep(800);
    }
    const found = [];
    for (const from of t.discover ? t.discover.from : []) {
      let html = pages.get(from);
      if (!html) {
        try {
          if (!(await allowed(from))) { rep.failed.push(`${from}: robots.txt disallows`); continue; }
          const r = await fetchDoc(from);
          if (r.status === 200 && !looksPdf(r.buf, r.contentType)) html = r.buf.toString("utf8");
          else rep.failed.push(`${from}: HTTP ${r.status} (link discovery)`);
        } catch (err) { rep.failed.push(`${from}: ${err.message} (link discovery)`); }
      }
      if (!html) continue;
      for (const l of discoverLinks(html, from, { match: t.discover.match, sources, max: t.discover.max, exclude: done })) {
        if (!found.some(f => f.url === l.url)) found.push(l);
      }
    }
    for (const l of found.sort((a, b) => Number(b.pdf) - Number(a.pdf)).slice(0, t.discover ? t.discover.max : 0)) {
      await save(l.url, t, rep);
      await sleep(800);
    }
    report.push(rep);
    log(`${t.id}: saved ${rep.saved.length}, problems ${rep.failed.length}`);
  }

  const manifest = mergeManifest(fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")) : [], entries);
  writeJson(MANIFEST_FILE, manifest);
  log(`manifest: ${path.relative(ROOT, MANIFEST_FILE)} (${manifest.length} documents, ${entries.length} this run)`);

  let fresh = [];
  for (const d of docs) fresh.push(...docChunks(d, { fetchedAt, sources }));
  if (fresh.length > MAX_NEW_CHUNKS) { log(`capping new chunks at ${MAX_NEW_CHUNKS} (had ${fresh.length})`); fresh = fresh.slice(0, MAX_NEW_CHUNKS); }

  const sizeBefore = fs.existsSync(CHUNKS_FILE) ? fs.statSync(CHUNKS_FILE).size : 0;
  if (dry) {
    log(`--dry: ${fresh.length} chunks would be added; chunks.jsonl untouched`);
  } else if (fresh.length) {
    const prev = readJsonl(CHUNKS_FILE);
    if (prev.some(c => Array.isArray(c.embedding))) log("! chunks.jsonl already carries embeddings — restore data/kb/cache/chunks.pre-embed.jsonl before deploying");
    const merged = mergeChunks(prev, fresh);
    const estimate = sizeBefore + fresh.reduce((n, c) => n + JSON.stringify(c).length + 1, 0);
    if (estimate > ABORT_BYTES && !args.force) {
      log(`✗ chunks.jsonl would grow to ~${(estimate / 1048576).toFixed(1)} MB (limit ${ABORT_BYTES / 1048576} MB) — not written. Re-run with --only=… or --force.`);
      process.exitCode = 1;
    } else {
      writeJsonl(CHUNKS_FILE, merged.chunks);
      log(`chunks.jsonl: +${merged.added} new, ${merged.replaced} replaced → ${merged.chunks.length} chunks`);
      if (!args["no-clean"]) {
        const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/kb/clean.mjs")], { stdio: "inherit" });
        if (r.status !== 0) { log("✗ clean.mjs failed"); process.exitCode = 1; }
      }
    }
  } else log("no new text to add to chunks.jsonl");

  const after = readJsonl(CHUNKS_FILE);
  const sizeAfter = fs.existsSync(CHUNKS_FILE) ? fs.statSync(CHUNKS_FILE).size : 0;
  const gapUrls = new Set(manifest.map(m => m.url));
  const gapChunks = after.filter(c => gapUrls.has(c.url));
  console.log("\n== KB gap fetch report");
  for (const r of report) {
    console.log(`\n${r.label} [${r.id}] — saved ${r.saved.length}`);
    for (const s of r.saved) console.log(`  ✓ ${s}`);
    for (const f of r.failed) console.log(`  ! ${f}`);
  }
  console.log(`\nchunks.jsonl ${(sizeBefore / 1048576).toFixed(2)} MB → ${(sizeAfter / 1048576).toFixed(2)} MB (${after.length} chunks; ${gapChunks.length} from gap documents)${sizeAfter > WARN_BYTES ? "  ! larger than 12 MB — check for embeddings" : ""}`);
  const all = coverageByStream(after);
  const gap = coverageByStream(gapChunks);
  console.log("\nCoverage per stream (all chunks · from gap documents):");
  for (const k of Object.keys({ ...all, ...gap }).sort()) console.log(`  ${k.padEnd(26)} ${String(all[k] || 0).padStart(5)} · ${String(gap[k] || 0).padStart(4)}`);
  console.log("\nNext: npm test && npm run build, check `ls -la data/kb/chunks.jsonl` (≈ 8–10 MB), deploy, then redraft:\n  AYM_SERVICE_TOKEN=... node scripts/ai/enable-pilot.mjs --redraft-insufficient --runs=12");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  // Several .gov.in sites chain to Let's Encrypt's newer roots, missing from Node's bundled store: re-exec once with them added (verification stays on).
  const LE_CERTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs/letsencrypt-gen-y.pem");
  if (!process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(LE_CERTS)) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: LE_CERTS } });
    process.exit(r.status ?? 1);
  }
  main().catch(err => { console.error("[fetch-gaps] fatal:", err); process.exit(1); });
}
