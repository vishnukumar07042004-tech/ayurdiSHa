#!/usr/bin/env node
/**
 * Embed KB chunks with server/ai/provider.js embed().
 *   node scripts/kb/embed.mjs [--batch=64] [--limit=N] [--force]
 *
 * Vectors go to data/kb/cache/embeddings.jsonl (gitignored), never into data/kb/chunks.jsonl,
 * because chunks.jsonl is bundled into the serverless functions. upload.mjs merges the two.
 * Resume-safe: each finished batch is appended to the vectors file, so a crash or quota stop
 * loses at most one batch; rerunning skips chunks whose (id, contentHash, model) already has a vector.
 * Exits 0 with a message when no embedding key is configured.
 */
import fs from "node:fs";
import path from "node:path";
import { CHUNKS_FILE, CACHE_DIR, VECTORS_FILE, readJsonl, writeJsonl, writeJson, KB_DIR } from "./lib.mjs";
import { isEmbedConfigured, embed, getEmbedModel, providerInfo, getUsage } from "../../server/ai/provider.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const BATCH = Number(args.batch || 64);
const LIMIT = args.limit ? Number(args.limit) : Infinity;

const round = v => v.map(x => Math.round(x * 1e6) / 1e6);

async function main() {
  const chunks = readJsonl(CHUNKS_FILE);
  if (!chunks.length) { console.log("[embed] no chunks — run scripts/kb/crawl.mjs first"); return; }
  // Older runs wrote vectors into chunks.jsonl; move them out so the bundle stays small.
  const inline = chunks.filter(c => Array.isArray(c.embedding));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (inline.length) {
    fs.appendFileSync(VECTORS_FILE, inline.map(c => JSON.stringify({ id: c.id, contentHash: c.contentHash, model: c.embeddingModel, embedding: c.embedding })).join("\n") + "\n");
    for (const c of chunks) { delete c.embedding; delete c.embeddingModel; }
    writeJsonl(CHUNKS_FILE, chunks);
  }
  if (!isEmbedConfigured()) {
    console.log(`[embed] SKIP — no embedding provider (GEMINI_API_KEY, AI_PROVIDER=vertex + GOOGLE_APPLICATION_CREDENTIALS, or OPENAI_API_KEY). Retrieval falls back to BM25.`);
    return;
  }
  const model = getEmbedModel();

  const have = new Map();
  for (const r of readJsonl(VECTORS_FILE)) if (r.model === model && Array.isArray(r.embedding)) have.set(`${r.id}|${r.contentHash}`, r);

  const todo = chunks.filter(c => args.force || !have.has(`${c.id}|${c.contentHash}`)).slice(0, LIMIT);
  console.log(`[embed] provider=${providerInfo().embedProvider} model=${model} todo=${todo.length}/${chunks.length}`);
  let n = 0;
  let stopped = null;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const vecs = await embed(batch.map(c => `${c.title}\n\n${c.text}`), { taskType: "document" });
      const rows = batch.map((c, k) => ({ id: c.id, contentHash: c.contentHash, model, embedding: round(vecs[k]) }));
      rows.forEach(r => have.set(`${r.id}|${r.contentHash}`, r));
      fs.appendFileSync(VECTORS_FILE, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
      n += batch.length;
      if ((i / BATCH) % 10 === 0) console.log(`[embed] ${n}/${todo.length}`);
    } catch (err) {
      stopped = err.message;
      console.log(`[embed] stopped after ${n}: ${err.message.slice(0, 200)}`);
      break;
    }
  }
  // Compact: one row per current chunk.
  const live = chunks.map(c => have.get(`${c.id}|${c.contentHash}`)).filter(Boolean);
  writeJsonl(VECTORS_FILE, live);
  const usage = getUsage();
  writeJson(path.join(KB_DIR, "embed-report.json"), { finishedAt: new Date().toISOString(), model, embeddedThisRun: n, embeddedTotal: live.length, chunks: chunks.length, stopped, usage });
  console.log(`[embed] done: ${n} this run, ${live.length}/${chunks.length} embedded, cost ~$${usage.costUsd}`);
}

main().catch(err => { console.error("[embed] fatal:", err); process.exit(1); });
