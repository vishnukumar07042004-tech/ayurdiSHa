#!/usr/bin/env node
/**
 * Weekly refresh: crawl → diff → embed → upload.
 *   node scripts/kb/refresh.mjs [--only=domain,...] [--scale=1] [--skip-upload]
 *
 * 1. snapshots data/kb/chunks.jsonl, re-crawls (conditional GETs with ETag / Last-Modified), then
 *    clean.mjs drops junk chunks and re-tags streams
 * 2. diffs old vs new by chunk id + contentHash → data/kb/changed.json; stamps `changedAt`
 *    on changed chunks (the reviewer UI can re-check golden answers that cite them)
 * 3. embeds only new / changed chunks (embed.mjs is resume-safe)
 * 4. uploads to Firestore kb_chunks (idempotent; skipped when no credentials)
 *
 * Set AYM_KB_DIR=/tmp/kb to run where the repo is read-only (e.g. a serverless cron).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CHUNKS_FILE, CACHE_DIR, KB_DIR, readJsonl, writeJsonl, writeJson } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const passthrough = argv.filter(a => /^--(only|scale|depth|concurrency|no-pdf|delay)/.test(a));

function run(script, extra = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(HERE, script), ...extra], { stdio: "inherit", env: process.env });
    p.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const before = readJsonl(CHUNKS_FILE);
  fs.writeFileSync(path.join(CACHE_DIR, "chunks.prev.jsonl"), before.map(c => JSON.stringify(c)).join("\n"));
  const oldById = new Map(before.map(c => [c.id, c]));

  console.log("[refresh] 1/4 crawl + clean");
  await run("crawl.mjs", passthrough);
  await run("clean.mjs");

  console.log("[refresh] 2/4 diff");
  const after = readJsonl(CHUNKS_FILE);
  const now = new Date().toISOString();
  const added = [], changed = [];
  for (const c of after) {
    const o = oldById.get(c.id);
    if (!o) added.push({ id: c.id, url: c.url, title: c.title });
    else if (o.contentHash !== c.contentHash) { changed.push({ id: c.id, url: c.url, title: c.title }); c.changedAt = now; }
  }
  const newIds = new Set(after.map(c => c.id));
  const removed = before.filter(c => !newIds.has(c.id)).map(c => ({ id: c.id, url: c.url, title: c.title }));
  writeJsonl(CHUNKS_FILE, after);
  writeJson(path.join(KB_DIR, "changed.json"), { finishedAt: now, stage: "crawl-diff", counts: { total: after.length, added: added.length, changed: changed.length, removed: removed.length }, added, changed, removed });
  console.log(`[refresh] added=${added.length} changed=${changed.length} removed=${removed.length}`);

  console.log("[refresh] 3/4 embed");
  await run("embed.mjs");

  if (has("--skip-upload")) { console.log("[refresh] 4/4 upload skipped"); return; }
  console.log("[refresh] 4/4 upload");
  await run("upload.mjs");
}

main().catch(err => { console.error("[refresh] failed:", err.message); process.exit(1); });
