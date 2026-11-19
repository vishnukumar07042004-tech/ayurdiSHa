#!/usr/bin/env node
/**
 * Crawl the allow-listed trusted sources in config/ai-sources.json and write
 *   data/kb/chunks.jsonl   (KB chunks, contract shape; embeddings preserved when text unchanged)
 *   data/kb/pages.jsonl    (one row per kept page: url, hash, etag, lastModified …)
 *   data/kb/crawl-report.json
 *
 * Respects robots.txt (and Crawl-delay), rate-limits per domain, follows only same-domain links
 * (within allowPaths when set) to --depth, extracts main text from HTML and PDFs (python3 + pypdf,
 * skipped with a log line when unavailable). PubMed uses the NCBI E-utilities API.
 *
 *   node scripts/kb/crawl.mjs [--only=ncismindia.org,who.int] [--depth=2] [--concurrency=6]
 *                             [--scale=1] [--no-pdf] [--delay=1500]
 */
import fs from "node:fs";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  ROOT, KB_DIR, CACHE_DIR, CHUNKS_FILE, PAGES_FILE, sha1, loadSources, sourceForUrl, sourceHostMatches,
  readJsonl, writeJsonl, writeJson, htmlExtract, htmlTitle, htmlPublishedAt, extractLinks, leadingDate,
  chunkText, countTokens, isJunkText, streamsForChunk, cleanText, parseDate, sleep,
} from "./lib.mjs";

const execFileP = promisify(execFile);

// Several .gov.in / .nic.in sites chain to Let's Encrypt's newer "Root YR" hierarchy, which is not in
// Node's bundled store yet. Add Let's Encrypt's public cross-signed roots/intermediates (verification
// stays on) — Node only reads NODE_EXTRA_CA_CERTS at start-up, so re-exec once with it set.
const LE_CERTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "certs/letsencrypt-gen-y.pem");
if (!process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(LE_CERTS)) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: LE_CERTS } });
  process.exit(r.status ?? 1);
}

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const ONLY = args.only ? String(args.only).split(",").map(s => s.trim()) : null;
const DEPTH = Number(args.depth ?? 2);
const CONCURRENCY = Number(args.concurrency ?? 6);
const SCALE = Number(args.scale ?? 1);
const BASE_DELAY = Number(args.delay ?? 1500);
const USE_PDF = !args["no-pdf"];
const UA = "AYURDISHA-KB-Bot/1.0 (career-guidance knowledge base for the World Ayurveda Congress; contact via ayurworld.org)";
const FETCH_TIMEOUT = 30_000;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

const RELEVANT = /ayur|ayush|bams|b\.a\.m\.s|indian system(?:s)? of medicine|traditional medicine|traditional,? complementary|complementary (?:and|&) (?:alternative|integrative)|tcam|herbal|panchakarma|naturopath|unani|siddha|homoeopath/i;
const GOOD_LINK = /ayur|bams|aiapget|\bpg\b|post.?grad|notification|notice|regulation|gazette|eligib|recruit|vacanc|syllabus|bulletin|information|licen|guideline|standard|curricul|internship|faculty|research|scheme|mission|export|gmp|career|faq|minimum|admission|counsel|registration|policy|council|fellowship|tcam|complementary|traditional|herbal|accredit|certif/i;
const BAD_LINK = /gallery|photo|video|tender|\brti\b|login|signin|register-now|\/hi\/|[?&]lang=hi|hindi|contact|sitemap|feedback|calendar|archive|e-?office|webmail|cart|download-app|screen-reader|accessibility|privacy|terms|disclaimer|copyright|hyperlink|help\b|\.(?:jpe?g|png|gif|webp|svg|ico|mp4|mp3|avi|mov|zip|rar|7z|docx?|xlsx?|pptx?|csv|exe|apk)(?:$|\?)/i;

const log = (...a) => console.log("[crawl]", ...a);

// ------------------------------------------------------------------ robots.txt

function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", path: val });
    else if (key === "crawl-delay") cur.delay = Number(val) || null;
  }
  const mine = groups.find(g => g.agents.some(a => a !== "*" && UA.toLowerCase().includes(a)))
    || groups.find(g => g.agents.includes("*"));
  return { rules: mine ? mine.rules.filter(r => r.path) : [], delay: mine?.delay ?? null };
}

function robotsAllows(robots, url) {
  if (!robots) return true;
  const u = new URL(url);
  const p = u.pathname + u.search;
  let best = null;
  for (const r of robots.rules) {
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(p) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// ------------------------------------------------------------------ fetching

function isTlsError(err) {
  const code = err?.cause?.code || err?.code || "";
  return /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code) || /certificate/i.test(err?.cause?.message || "");
}

async function fetchViaCurl(url, headers) {
  const file = path.join(CACHE_DIR, `curl-${sha1(url)}.bin`);
  const hdrArgs = Object.entries(headers).flatMap(([k, v]) => ["-H", `${k}: ${v}`]);
  const { stdout } = await execFileP("curl", ["-sSL", "--compressed", "--max-time", "40", "--max-filesize", String(MAX_PDF_BYTES), "-A", UA, ...hdrArgs,
    "-o", file, "-w", "%{http_code}\t%{content_type}\t%{url_effective}", url], { maxBuffer: 1 << 20 });
  const [code, ctype, finalUrl] = stdout.split("\t");
  const buf = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  try { fs.unlinkSync(file); } catch { /* ignore */ }
  return { status: Number(code), contentType: ctype || "", url: finalUrl || url, buf, headers: {} };
}

/** GET with timeout; at most 2 attempts; TLS failures switch to curl (system trust store). */
async function get(url, extraHeaders = {}) {
  const headers = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5", "Accept-Language": "en-IN,en;q=0.9", ...extraHeaders };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
      const len = Number(res.headers.get("content-length") || 0);
      const ctype = res.headers.get("content-type") || "";
      if (len > MAX_PDF_BYTES) { clearTimeout(timer); return { status: 413, contentType: ctype, url: res.url, buf: Buffer.alloc(0), headers: {} }; }
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      return {
        status: res.status, contentType: ctype, url: res.url || url, buf,
        headers: { etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") },
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (isTlsError(err)) {
        try { return await fetchViaCurl(url, extraHeaders); } catch (cerr) { lastErr = new Error(`tls+curl: ${String(cerr.message || cerr).split("\n")[0]}`); break; }
      }
      if (attempt === 0) await sleep(2000);
    }
  }
  const msg = lastErr?.name === "AbortError" ? "timeout" : (lastErr?.cause?.code || lastErr?.message || String(lastErr));
  throw new Error(msg);
}

// ------------------------------------------------------------------ PDF

let pdfAvailable = null;
async function checkPdf() {
  if (pdfAvailable != null) return pdfAvailable;
  try { await execFileP("python3", ["-c", "import pypdf"]); pdfAvailable = true; } catch { pdfAvailable = false; }
  if (!pdfAvailable) log("python3 + pypdf not available — PDFs will be skipped");
  return pdfAvailable;
}

const PDF_PY = `
import sys, json
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
out = []
for i, p in enumerate(r.pages[:60]):
    try:
        out.append(p.extract_text() or "")
    except Exception:
        out.append("")
meta = r.metadata or {}
print(json.dumps({"pages": len(r.pages), "text": "\\n\\n".join(out), "title": str(meta.get("/Title") or ""), "created": str(meta.get("/ModDate") or meta.get("/CreationDate") or "")}))
`;

async function pdfToText(buf) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `pdf-${sha1(buf.subarray(0, 4096))}-${buf.length}.pdf`);
  fs.writeFileSync(file, buf);
  try {
    const { stdout } = await execFileP("python3", ["-c", PDF_PY, file], { maxBuffer: 64 << 20, timeout: 90_000 });
    return JSON.parse(stdout);
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

function tidyPdfText(t) {
  // Re-join hard-wrapped lines into paragraphs; keep blank lines and list starts as breaks.
  const lines = String(t).replace(/\r/g, "").split("\n");
  const paras = [];
  let buf = "";
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, " ").trim();
    if (!l) { if (buf) { paras.push(buf); buf = ""; } continue; }
    if (/^\d{1,3}$/.test(l)) continue; // page numbers
    const startsItem = /^(?:\(?[0-9ivxa-h]{1,4}[.)]|[•\-–*])\s/.test(l);
    if (buf && (startsItem || /[.:;?]$/.test(buf) && /^[A-Z0-9(]/.test(l) && buf.length > 280)) { paras.push(buf); buf = l; } else buf = buf ? `${buf} ${l}` : l;
  }
  if (buf) paras.push(buf);
  return cleanText(paras.join("\n\n"));
}

// ------------------------------------------------------------------ per-domain crawl

function linkScore(link) {
  const hay = `${link.url} ${link.text}`;
  let s = 0;
  if (GOOD_LINK.test(hay)) s += 3;
  if (/ayur|bams|aiapget/i.test(hay)) s += 3;
  if (/\.pdf(?:$|\?)/i.test(link.url)) s += 1;
  return s;
}

function allowedPath(src, url) {
  if (!src.allowPaths || !src.allowPaths.length) return true;
  const p = new URL(url).pathname;
  return src.allowPaths.some(a => p.toLowerCase().startsWith(a.toLowerCase()));
}

/**
 * Single-page apps (e.g. ayush.gov.in) render no server HTML; their official document links live
 * in the site's own JS bundle. Collect same-site PDF paths from the bundles the home page loads.
 */
async function bundleLinks(src, rep) {
  const home = src.seeds[0];
  const out = [];
  try {
    const r = await get(home);
    const html = r.buf.toString("utf8");
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)].map(m => new URL(m[1], home).toString())
      .filter(u => sourceHostMatches(src, new URL(u).hostname));
    for (const s of scripts) {
      const js = (await get(s)).buf.toString("utf8");
      for (const m of js.matchAll(/["'`](\.?\/?assets\/[^"'`\s]{3,220}\.pdf)["'`]/gi)) {
        const url = new URL(m[1].replace(/^\.\//, ""), home).toString();
        const name = decodeURIComponent(url.split("/").pop()).replace(/[_-]+/g, " ");
        if (BAD_LINK.test(url) || /hindi|_h\.pdf|tender|corrigendum/i.test(url)) continue;
        out.push({ url, text: name });
      }
    }
  } catch (err) {
    rep.errors.push(`bundle: ${err.message}`);
  }
  const uniq = [...new Map(out.map(l => [l.url, l])).values()];
  log(`${src.domain}: ${uniq.length} document links found in site bundle`);
  return uniq;
}

async function crawlDomain(src, prev) {
  const rep = { domain: src.domain, name: src.name, authority: src.authority, fetched: 0, kept: 0, pdfs: 0, notModified: 0, skippedRobots: 0, skippedIrrelevant: 0, errors: [], status: "ok", chunks: 0 };
  const pages = [];
  const maxPages = Math.max(1, Math.round((src.maxPages || 40) * SCALE));
  const maxFetch = maxPages * 3;
  const linkMust = src.linkMustMatch ? new RegExp(src.linkMustMatch, "i") : null;

  const robotsByOrigin = new Map();
  const robotsFor = async url => {
    const origin = new URL(url).origin;
    if (robotsByOrigin.has(origin)) return robotsByOrigin.get(origin);
    let robots = null;
    try {
      const r = await get(`${origin}/robots.txt`);
      if (r.status === 200 && /text|octet/i.test(r.contentType || "text") && !/<html/i.test(r.buf.subarray(0, 300).toString())) robots = parseRobots(r.buf.toString("utf8"));
    } catch (err) {
      rep.errors.push(`robots ${origin}: ${err.message}`);
    }
    robotsByOrigin.set(origin, robots);
    return robots;
  };
  const firstRobots = await robotsFor(src.seeds[0]);
  const delay = Math.min(10_000, Math.max(BASE_DELAY, (firstRobots?.delay || 0) * 1000));

  const seen = new Set();
  const queue = src.seeds.map(u => ({ url: u, depth: 0, score: 100 }));
  if (src.spaBundle) {
    for (const l of await bundleLinks(src, rep)) queue.push({ url: l.url, depth: 1, score: linkScore(l) });
  }
  let seedFailures = 0;
  let fetchCount = 0;

  while (queue.length && pages.length < maxPages && fetchCount < maxFetch) {
    queue.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const item = queue.shift();
    const key = item.url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    if (!robotsAllows(await robotsFor(item.url), item.url)) { rep.skippedRobots++; continue; }
    const isPdf = /\.pdf(?:$|\?)/i.test(item.url);
    if (isPdf && (!USE_PDF || !(await checkPdf()) || rep.pdfs >= (src.maxPdfs || 30))) continue;

    const old = prev.pages.get(item.url);
    const cond = {};
    if (old?.etag) cond["If-None-Match"] = old.etag;
    if (old?.lastModified) cond["If-Modified-Since"] = old.lastModified;

    let res;
    fetchCount++;
    try {
      res = await get(item.url, cond);
    } catch (err) {
      rep.errors.push(`${item.url}: ${err.message}`);
      if (item.depth === 0) seedFailures++;
      if (item.depth === 0 && seedFailures >= src.seeds.length && !pages.length) { rep.status = "blocked"; break; }
      await sleep(delay);
      continue;
    }
    rep.fetched++;
    await sleep(delay);

    if (res.status === 304 && old) {
      rep.notModified++;
      pages.push({ ...old, notModified: true });
      continue;
    }
    if (res.status === 403 || res.status === 401 || res.status === 429) {
      rep.errors.push(`${item.url}: HTTP ${res.status}`);
      if (item.depth === 0) seedFailures++;
      if (item.depth === 0 && seedFailures >= src.seeds.length && !pages.length) { rep.status = "blocked"; break; }
      continue;
    }
    if (res.status >= 400 || !res.buf.length) {
      rep.errors.push(`${item.url}: HTTP ${res.status}`);
      if (item.depth === 0) seedFailures++;
      continue;
    }
    // Redirects must stay on the allow-list.
    let finalUrl = res.url || item.url;
    try { if (!sourceHostMatches(src, new URL(finalUrl).hostname)) { rep.errors.push(`${item.url}: redirected off-domain`); continue; } } catch { continue; }

    const ctype = String(res.contentType || "").toLowerCase();
    const looksPdf = ctype.includes("pdf") || res.buf.subarray(0, 5).toString() === "%PDF-";
    let title = "";
    let text = "";
    let publishedAt = null;
    let kind = "html";

    if (looksPdf) {
      if (!USE_PDF || !(await checkPdf())) continue;
      kind = "pdf";
      rep.pdfs++;
      try {
        const p = await pdfToText(res.buf);
        text = tidyPdfText(p.text);
        title = (p.title && p.title.length > 4 && !/^untitled|microsoft word/i.test(p.title) ? p.title : "") || decodeURIComponent(finalUrl.split("/").pop() || "").replace(/\.pdf.*$/i, "").replace(/[_-]+/g, " ");
        publishedAt = parseDate(p.created);
      } catch (err) {
        rep.errors.push(`${item.url}: pdf ${String(err.message).split("\n")[0].slice(0, 120)}`);
        continue;
      }
      if (text.length < 300) { rep.errors.push(`${item.url}: pdf has no text layer (scanned?)`); continue; }
    } else if (ctype.includes("html") || ctype === "" || ctype.includes("xml")) {
      if (res.buf.length > MAX_HTML_BYTES) { rep.errors.push(`${item.url}: html too large`); continue; }
      const html = res.buf.toString("utf8");
      title = htmlTitle(html);
      const ex = htmlExtract(html);
      text = ex.text;
      publishedAt = htmlPublishedAt(html) || leadingDate(text);
      // Follow links before deciding whether this page itself is worth keeping.
      if (item.depth < DEPTH) {
        for (const l of extractLinks(html, finalUrl)) {
          let u;
          try { u = new URL(l.url); } catch { continue; }
          if (!sourceHostMatches(src, u.hostname)) continue;
          if (!sourceForUrl(l.url, [src])) continue;
          if (BAD_LINK.test(l.url) || BAD_LINK.test(l.text)) continue;
          if (!allowedPath(src, l.url)) continue;
          if (linkMust && !linkMust.test(`${l.url} ${l.text}`)) continue;
          const k = l.url.replace(/\/$/, "");
          if (seen.has(k)) continue;
          queue.push({ url: l.url, depth: item.depth + 1, score: linkScore(l) - item.depth * 2 });
        }
      }
      if (text.length < 400 || ex.density > 0.5) { rep.skippedIrrelevant++; continue; }
    } else {
      continue;
    }

    if (src.relevance !== "any" && !RELEVANT.test(`${title}\n${text}`)) { rep.skippedIrrelevant++; continue; }
    const hash = sha1(text);
    pages.push({
      url: finalUrl, title: title || src.name, text, kind, publishedAt, hash,
      etag: res.headers?.etag || null, lastModified: res.headers?.lastModified || null,
      domain: src.domain, authority: src.authority, streams: src.streams,
    });
    rep.kept++;
  }
  if (rep.status !== "blocked" && !pages.length) rep.status = rep.fetched ? "empty" : "failed";
  return { rep, pages };
}

// ------------------------------------------------------------------ PubMed (E-utilities)

async function crawlPubmed(src) {
  const rep = { domain: src.domain, name: src.name, authority: src.authority, fetched: 0, kept: 0, pdfs: 0, notModified: 0, skippedRobots: 0, skippedIrrelevant: 0, errors: [], status: "ok", chunks: 0 };
  const pages = [];
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const ids = new Set();
  for (const q of src.queries || []) {
    try {
      const r = await get(`${base}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${src.perQuery || 25}&term=${encodeURIComponent(q)}`);
      rep.fetched++;
      const j = JSON.parse(r.buf.toString("utf8"));
      for (const id of j?.esearchresult?.idlist || []) ids.add(id);
    } catch (err) {
      rep.errors.push(`esearch "${q}": ${err.message}`);
    }
    await sleep(450);
  }
  const all = [...ids];
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    let xml = "";
    try {
      const r = await get(`${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&id=${batch.join(",")}`);
      rep.fetched++;
      xml = r.buf.toString("utf8");
    } catch (err) {
      rep.errors.push(`efetch: ${err.message}`);
      continue;
    }
    await sleep(450);
    for (const art of xml.split(/<\/PubmedArticle>/).slice(0, -1)) {
      const pmid = (art.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1];
      const strip = s => cleanText(String(s || "").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'"));
      const title = strip((art.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/) || [])[1]);
      const abs = [...art.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
        .map(m => { const label = (m[1].match(/Label="([^"]+)"/) || [])[1]; return (label ? `${label}: ` : "") + strip(m[2]); }).join("\n\n");
      if (!pmid || !abs || abs.length < 300) continue;
      if (!RELEVANT.test(`${title}\n${abs}`)) { rep.skippedIrrelevant++; continue; }
      const journal = strip((art.match(/<Title>([\s\S]*?)<\/Title>/) || [])[1]);
      const y = (art.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) || [])[1];
      const mo = (art.match(/<PubDate>[\s\S]*?<Month>([A-Za-z0-9]+)<\/Month>/) || [])[1];
      const publishedAt = y ? (parseDate(`1 ${mo || "Jan"} ${y}`) || `${y}-01-01`) : null;
      const text = `${title}\n\n${journal ? `${journal}${y ? ` (${y})` : ""}\n\n` : ""}${abs}`;
      pages.push({ url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, title, text, kind: "abstract", publishedAt, hash: sha1(text), etag: null, lastModified: null, domain: src.domain, authority: src.authority, streams: src.streams });
      rep.kept++;
    }
  }
  if (!pages.length) rep.status = rep.errors.length ? "failed" : "empty";
  return { rep, pages };
}

// ------------------------------------------------------------------ manual documents

/**
 * Official documents saved by hand for sources that block crawlers (e.g. NCISM's JS cookie gate).
 * data/kb/manual/manifest.json: [{ "file": "x.pdf", "url": "https://ncismindia.org/...", "title"?, "publishedAt"? }]
 * The url must be on the allow-list; authority/streams come from that source.
 */
async function ingestManual(sources) {
  const dir = path.join(KB_DIR, "manual");
  const manifestFile = path.join(dir, "manifest.json");
  const rep = { domain: "manual", name: "Manually saved official documents", authority: "-", fetched: 0, kept: 0, pdfs: 0, errors: [], status: "ok", chunks: 0 };
  if (!fs.existsSync(manifestFile)) { rep.status = "none"; return { rep, pages: [] }; }
  const pages = [];
  let list = [];
  try { list = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch (err) { rep.errors.push(`manifest: ${err.message}`); }
  for (const item of list) {
    const src = sourceForUrl(item.url, sources);
    if (!src) { rep.errors.push(`${item.url}: not on allow-list`); continue; }
    const file = path.join(dir, item.file || "");
    if (!item.file || !fs.existsSync(file)) { rep.errors.push(`${item.file}: missing`); continue; }
    rep.fetched++;
    const buf = fs.readFileSync(file);
    let text = "";
    let title = item.title || "";
    let publishedAt = item.publishedAt || null;
    let kind = "html";
    try {
      if (buf.subarray(0, 5).toString() === "%PDF-") {
        if (!(await checkPdf())) { rep.errors.push(`${item.file}: pdf parser unavailable`); continue; }
        const p = await pdfToText(buf);
        text = tidyPdfText(p.text);
        title ||= p.title || item.file;
        publishedAt ||= parseDate(p.created);
        kind = "pdf";
        rep.pdfs++;
      } else if (/\.html?$/i.test(item.file)) {
        const html = buf.toString("utf8");
        text = htmlExtract(html).text;
        title ||= htmlTitle(html);
        publishedAt ||= htmlPublishedAt(html);
      } else {
        text = cleanText(buf.toString("utf8"));
        kind = "text";
      }
    } catch (err) {
      rep.errors.push(`${item.file}: ${err.message}`);
      continue;
    }
    if (text.length < 200) { rep.errors.push(`${item.file}: no text`); continue; }
    pages.push({ url: item.url, title: title || src.name, text, kind, publishedAt, hash: sha1(text), etag: null, lastModified: null, domain: src.domain, authority: src.authority, streams: src.streams, manual: true });
    rep.kept++;
  }
  return { rep, pages };
}

// ------------------------------------------------------------------ chunking pages

function pageChunks(page, fetchedAt) {
  const pieces = page.kind === "abstract" ? [page.text] : chunkText(page.text, { target: 500, overlap: 60 });
  const out = [];
  pieces.forEach((text, idx) => {
    if (page.kind !== "abstract" && isJunkText(text)) return;
    out.push({
      id: sha1(`${page.url}#${idx}`),
      url: page.url,
      title: page.title,
      text,
      tokens: countTokens(text),
      publishedAt: page.publishedAt || null,
      fetchedAt,
      authority: page.authority,
      streams: streamsForChunk(text, page.title, page.streams),
      contentHash: sha1(text),
    });
  });
  return out;
}

// ------------------------------------------------------------------ main

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

async function main() {
  fs.mkdirSync(KB_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const sources = loadSources().filter(s => !ONLY || ONLY.includes(s.domain));
  const prevChunks = readJsonl(CHUNKS_FILE);
  const prevPages = new Map(readJsonl(PAGES_FILE).map(p => [p.url, p]));
  const prevByUrl = new Map();
  for (const c of prevChunks) { if (!prevByUrl.has(c.url)) prevByUrl.set(c.url, []); prevByUrl.get(c.url).push(c); }
  const prevById = new Map(prevChunks.map(c => [c.id, c]));

  const started = Date.now();
  log(`sources=${sources.length} depth=${DEPTH} concurrency=${CONCURRENCY} pdf=${USE_PDF}`);
  const results = await pool(sources, CONCURRENCY, async src => {
    const t0 = Date.now();
    try {
      const r = src.api === "pubmed" ? await crawlPubmed(src) : await crawlDomain(src, { pages: prevPages });
      log(`${src.domain}: ${r.rep.status} fetched=${r.rep.fetched} kept=${r.rep.kept} pdfs=${r.rep.pdfs} errors=${r.rep.errors.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
      return r;
    } catch (err) {
      log(`${src.domain}: FAILED ${err.message}`);
      return { rep: { domain: src.domain, name: src.name, status: "failed", errors: [err.message], fetched: 0, kept: 0, chunks: 0 }, pages: [] };
    }
  });
  const manual = await ingestManual(loadSources());
  if (manual.rep.status !== "none") { results.push(manual); log(`manual: kept=${manual.rep.kept} errors=${manual.rep.errors.length}`); }

  const fetchedAt = new Date().toISOString();
  const crawledDomains = new Set(sources.map(s => s.domain));
  const allSources = loadSources();
  const chunks = [];
  const pagesOut = [];
  const seenHash = new Set();
  const seenId = new Set();

  // Keep chunks of domains not crawled this run (--only), and of domains that failed this run.
  const failed = new Set(results.filter(r => r.rep.status === "blocked" || r.rep.status === "failed").map(r => r.rep.domain));
  for (const c of prevChunks) {
    const src = sourceForUrl(c.url, allSources);
    if (!src) continue;
    if (!crawledDomains.has(src.domain) || failed.has(src.domain)) { chunks.push(c); seenHash.add(c.contentHash); seenId.add(c.id); }
  }
  for (const p of prevPages.values()) {
    const src = sourceForUrl(p.url, allSources);
    if (src && (!crawledDomains.has(src.domain) || failed.has(src.domain))) pagesOut.push(p);
  }

  for (const { rep, pages } of results) {
    let n = 0;
    for (const page of pages) {
      const { text, notModified, ...meta } = page;
      let pcs;
      if (notModified && prevByUrl.has(page.url)) pcs = prevByUrl.get(page.url);
      else pcs = pageChunks(page, fetchedAt);
      for (const c of pcs) {
        if (seenHash.has(c.contentHash) || seenId.has(c.id)) continue; // repeated boilerplate across pages
        const old = prevById.get(c.id);
        if (old && old.contentHash === c.contentHash) {
          // Unchanged text: keep the original fetchedAt and any embedding.
          c.fetchedAt = old.fetchedAt || c.fetchedAt;
          if (old.embedding) { c.embedding = old.embedding; c.embeddingModel = old.embeddingModel; }
          if (old.changedAt) c.changedAt = old.changedAt;
        }
        seenHash.add(c.contentHash);
        seenId.add(c.id);
        chunks.push(c);
        n++;
      }
      pagesOut.push({ ...meta, fetchedAt: notModified ? page.fetchedAt || fetchedAt : fetchedAt, chunkCount: pcs.length });
    }
    rep.chunks = n;
  }

  writeJsonl(CHUNKS_FILE, chunks);
  writeJsonl(PAGES_FILE, pagesOut);
  const reportFile = path.join(KB_DIR, "crawl-report.json");
  const thisRun = results.map(r => ({ ...r.rep, errors: r.rep.errors.slice(0, 15), errorCount: r.rep.errors.length, crawledAt: fetchedAt }));
  // A partial (--only) run updates its domains inside the previous report instead of replacing it.
  let domains = thisRun;
  if (ONLY && fs.existsSync(reportFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(reportFile, "utf8"));
      const fresh = new Map(thisRun.map(d => [d.domain, d]));
      const merged = new Map((prev.domains || []).map(d => [d.domain, fresh.get(d.domain) || d]));
      for (const d of thisRun) if (!merged.has(d.domain)) merged.set(d.domain, d);
      domains = [...merged.values()];
    } catch { /* unreadable previous report → this run only */ }
  }
  const chunksByDomain = {};
  for (const c of chunks) { const s = sourceForUrl(c.url, allSources); if (s) chunksByDomain[s.domain] = (chunksByDomain[s.domain] || 0) + 1; }
  for (const d of domains) d.chunksInKb = chunksByDomain[d.domain] || 0;
  const report = {
    finishedAt: new Date().toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    options: { depth: DEPTH, scale: SCALE, pdf: USE_PDF, only: ONLY },
    totals: {
      sources: domains.length,
      ok: domains.filter(d => d.status === "ok").length,
      blocked: domains.filter(d => ["blocked", "failed", "empty"].includes(d.status)).map(d => d.domain),
      pagesKept: pagesOut.length,
      chunksTotal: chunks.length,
      tokensTotal: chunks.reduce((n, c) => n + (c.tokens || 0), 0),
    },
    domains,
  };
  writeJson(reportFile, report);
  log(`done in ${report.seconds}s — pages kept ${report.totals.pagesKept}, chunks ${chunks.length}, blocked/failed/empty: ${report.totals.blocked.join(", ") || "none"}`);
  log(`wrote ${path.relative(ROOT, CHUNKS_FILE)}, ${path.relative(ROOT, PAGES_FILE)}, data/kb/crawl-report.json`);
}

main().catch(err => { console.error("[crawl] fatal:", err); process.exit(1); });
