#!/usr/bin/env node
/**
 * Fetch the official pages a faculty bank cites (Sources sheet + row source links) into the KB so
 * enriched answers can cite real passages. Thin wrapper over scripts/kb/fetch-gaps.mjs (target
 * `faculty-<streamId>`): allow-list + robots.txt checks, PDF text, manifest, chunking, clean.
 * Needs open network.
 *
 *   node scripts/faculty/fetch-sources.mjs [--stream=clinical-practice] [--dry] [--check]
 *     --check  only list the URLs and whether each is allow-listed / already in chunks.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, loadBank } from "./lib.mjs";
import { urlAllowed, loadAllowList } from "../../server/ai/sources.js";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const streamId = String(args.stream || "clinical-practice");
const bank = loadBank(streamId);
if (!bank) {
  console.error(`No data/faculty/${streamId}.json — run scripts/faculty/import-bank.mjs first.`);
  process.exit(2);
}
const urls = [...new Set([...(bank.sources || []).map(s => s.url), ...bank.entries.flatMap(e => e.sources || [])])];
const allow = loadAllowList({ fresh: true });
const chunkUrls = new Set();
try {
  for (const line of fs.readFileSync(path.join(ROOT, "data/kb/chunks.jsonl"), "utf8").split("\n")) {
    if (!line) continue;
    try { chunkUrls.add(JSON.parse(line).url); } catch { /* skip */ }
  }
} catch { /* no KB yet */ }

console.log(`Faculty sources for ${bank.stream} (${streamId}): ${urls.length} URL(s)`);
let blocked = 0;
for (const u of urls) {
  const ok = urlAllowed(u, allow);
  if (!ok) blocked++;
  console.log(`  ${ok ? "allow" : "BLOCK"}  ${chunkUrls.has(u) ? "in-KB " : "      "} ${u}`);
}
if (blocked) console.log(`! ${blocked} URL(s) are not on config/ai-sources.json — add the domain (authority regulator where it is an official body) or they cannot be cited.`);
if (args.check) process.exit(0);

const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/kb/fetch-gaps.mjs"), `--only=faculty-${streamId}`, ...(args.dry ? ["--dry"] : [])], { stdio: "inherit" });
process.exit(r.status ?? 1);
