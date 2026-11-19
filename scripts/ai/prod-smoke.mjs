#!/usr/bin/env node
/**
 * Production smoke for the AI desk. Read-only except `--test` (one provider round-trip, ~$0.001).
 *   node scripts/ai/prod-smoke.mjs [--base=https://ayushmarg.vercel.app] [--test] [--op=aiStats]
 * The service token is read from AYM_SERVICE_TOKEN or STAFF_SERVICE_TOKEN in .env.local and never printed.
 */
import { serviceHeaders, hasServiceToken, checkServiceAuth, NO_TOKEN_HELP, redactToken } from "../lib/staffAuth.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
const AUTH = serviceHeaders();

async function call(op, body = {}) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/aym-store`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ op, ...body }),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, data };
}

if (!hasServiceToken()) { console.error(NO_TOKEN_HELP); process.exit(1); }
const auth = await checkServiceAuth(async (op, b) => { const r = await call(op, b); return { status: r.status, body: r.data }; });
console.log(`auth: ${auth.ok ? "ok (service token)" : `failed (HTTP ${auth.status}): ${auth.error}`}`);
if (!auth.ok) process.exit(1);

const cfg = await call("aiConfigGet");
const c = cfg.data.config || cfg.data;
const streams = c.streams && typeof c.streams === "object" ? Object.entries(c.streams).filter(([, v]) => v && (v.enabled ?? v) === true).map(([k]) => k) : [];
console.log(`aiConfigGet: ${cfg.status} enabled=${c.enabled} shadow=${c.shadow} cap=${JSON.stringify(c.dailyCapUsd ?? c.capUsd ?? c.spendCapUsd ?? c.cap)} streamsOn=${streams.length}`);
if (args.verbose) console.log(redactToken(JSON.stringify(cfg.data, null, 1).slice(0, 3000)));

if (args.op) {
  const r = await call(String(args.op));
  console.log(`${args.op}: ${r.status} ${redactToken(JSON.stringify(r.data).slice(0, 1500))}`);
}
if (args.test) {
  const r = await call("aiProviderTest");
  console.log(`aiProviderTest: ${r.status} (${r.ms} ms round-trip) ${redactToken(JSON.stringify(r.data).slice(0, 1200))}`);
}
