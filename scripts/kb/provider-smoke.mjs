#!/usr/bin/env node
/**
 * Smoke test for server/ai/provider.js — the same check as staff Settings → Test connection.
 *   node scripts/kb/provider-smoke.mjs
 *   AI_PROVIDER=vertex GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/kb/provider-smoke.mjs
 * Skips (exit 0) when nothing is configured. Never prints keys or tokens.
 */
import { providerInfo, testConnection, getUsage } from "../../server/ai/provider.js";

const info = providerInfo();
console.log("[smoke] provider:", JSON.stringify(info));

if (!info.configured && !info.embedConfigured) {
  console.log("[smoke] SKIP — no GEMINI_API_KEY / AI_PROVIDER=vertex credentials / ANTHROPIC_API_KEY / OPENAI_API_KEY found.");
  process.exit(0);
}

const r = await testConnection();
console.log("[smoke] chat:", JSON.stringify(r.chat));
console.log("[smoke] embed:", JSON.stringify(r.embed));
console.log(`[smoke] ${r.ok ? "OK" : `FAILED — ${r.error}`}`);
console.log("[smoke] usage:", JSON.stringify(getUsage()));
process.exit(r.ok ? 0 : 1);
