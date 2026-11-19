#!/usr/bin/env node
/**
 * Quality pass over data/kb/chunks.jsonl (no network):
 *   node scripts/kb/clean.mjs [--dry]
 *
 * Re-applies lib.mjs junkReason() (nav / disclaimers / corrupted Hindi PDF text / reference lists /
 * clinical dosing) and re-tags streams with streamsForChunk(), so rule changes reach chunks that
 * were crawled earlier without a re-crawl. PubMed abstracts are exempt from the junk rules (as in
 * crawl.mjs). Removed chunks go to data/kb/cache/removed-chunks.jsonl for audit; per-stream coverage
 * (chunks, intents, questions) and blocked sources go to data/kb/quality-report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, KB_DIR, CACHE_DIR, CHUNKS_FILE, readJsonl, writeJsonl, writeJson, loadSources, sourceForUrl, junkReason, streamsForChunk } from "./lib.mjs";
import { STREAMS } from "../../server/ai/personas/index.js";

const DRY = process.argv.includes("--dry");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

/** Crawled titles like "/", "FAQ" or "7212" → a readable title from the file name, else the source name. */
function fixTitle(title, url, src) {
  const t = String(title || "").trim();
  if ((t.match(/[A-Za-z\u0900-\u097f]/g) || []).length >= 4) return t;
  let seg = "";
  try { seg = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || ""); } catch { /* keep "" */ }
  seg = seg.replace(/\.(pdf|html?|aspx?|php)$/i, "").replace(/[_\-+]+/g, " ").trim();
  if ((seg.match(/[A-Za-z]/g) || []).length >= 4) return seg;
  return /^[A-Za-z]{2,}$/.test(t) ? `${src.name} — ${t}` : src.name;
}

function main() {
  const chunks = readJsonl(CHUNKS_FILE);
  if (!chunks.length) { console.log("[clean] no chunks — run scripts/kb/crawl.mjs first"); return; }
  const sources = loadSources();
  const kept = [];
  const removed = [];
  const reasons = {};
  const removedByDomain = {};
  let retagged = 0;
  let retitled = 0;

  for (const c of chunks) {
    const src = sourceForUrl(c.url, sources);
    if (!src) { removed.push({ ...c, removedFor: "off-allowlist" }); reasons["off-allowlist"] = (reasons["off-allowlist"] || 0) + 1; continue; }
    const why = src.domain === "pubmed.ncbi.nlm.nih.gov" ? null : junkReason(c.text);
    if (why) {
      const { embedding, ...rest } = c;
      removed.push({ ...rest, removedFor: why });
      reasons[why] = (reasons[why] || 0) + 1;
      removedByDomain[src.domain] = (removedByDomain[src.domain] || 0) + 1;
      continue;
    }
    const title = fixTitle(c.title, c.url, src);
    if (title !== c.title) { c.title = title; retitled++; }
    const streams = streamsForChunk(c.text, c.title, src.streams);
    if (JSON.stringify(streams) !== JSON.stringify(c.streams)) { c.streams = streams; retagged++; }
    kept.push(c);
  }

  const intents = readJson(path.join(ROOT, "data/qbank/intents.json"), []);
  const qbank = readJson(path.join(ROOT, "data/qbank/qbank.json"), []);
  const crawl = readJson(path.join(KB_DIR, "crawl-report.json"), { domains: [] });
  const intentStream = new Map(intents.map(i => [i.intentId, i.stream]));
  const coverage = {};
  for (const s of STREAMS) coverage[s.id] = { label: s.label, chunks: 0, chunksStreamSpecific: 0, intents: 0, questions: 0 };
  let wildcard = 0;
  for (const c of kept) {
    if (c.streams.includes("*")) { wildcard++; continue; }
    for (const id of c.streams) if (coverage[id]) { coverage[id].chunks++; if (c.streams.length <= 3) coverage[id].chunksStreamSpecific++; }
  }
  for (const i of intents) if (coverage[i.stream]) coverage[i.stream].intents++;
  for (const q of qbank) { const id = intentStream.get(q.intentId); if (coverage[id]) coverage[id].questions++; }
  for (const v of Object.values(coverage)) {
    v.chunksPerIntent = v.intents ? Math.round((v.chunks / v.intents) * 10) / 10 : null;
    v.thin = v.chunksStreamSpecific < 40;
  }

  const blocked = (crawl.domains || [])
    .filter(d => ["blocked", "failed", "empty"].includes(d.status))
    .map(d => ({ domain: d.domain, name: d.name, status: d.status, why: (d.errors || [])[0] || (d.skippedRobots ? "robots.txt disallows" : d.fetched <= 1 ? "only the home page loaded (no crawlable links; likely JS-rendered)" : d.skippedIrrelevant ? "pages fetched but none career-relevant" : "no content") }));

  const report = {
    finishedAt: new Date().toISOString(),
    dry: DRY,
    chunks: { before: chunks.length, kept: kept.length, removed: removed.length, retagged, retitled, wildcard },
    removedByReason: reasons,
    removedByDomain,
    coverage,
    blockedSources: blocked,
  };
  if (!DRY) {
    writeJsonl(CHUNKS_FILE, kept);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const auditFile = path.join(CACHE_DIR, "removed-chunks.jsonl");
    writeJsonl(auditFile, [...readJsonl(auditFile), ...removed]);
  }
  writeJson(path.join(KB_DIR, "quality-report.json"), report);
  console.log(`[clean] kept ${kept.length}/${chunks.length}, removed ${removed.length} ${JSON.stringify(reasons)}, retagged ${retagged}, retitled ${retitled}${DRY ? " (dry)" : ""}`);
  for (const [id, v] of Object.entries(coverage)) console.log(`[clean]   ${id.padEnd(24)} chunks=${String(v.chunks).padStart(4)} specific=${String(v.chunksStreamSpecific).padStart(4)} intents=${String(v.intents).padStart(3)}${v.thin ? "  THIN" : ""}`);
}

main();
