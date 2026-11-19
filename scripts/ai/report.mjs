#!/usr/bin/env node
/**
 * Monthly learning-loop report for the AI drafts desk: approval rate, edit size, top reject
 * reasons, weak streams / personas, blocked reasons and spend. Reads the live store the app is
 * configured for (Firestore in production; AYM_STORE=file for local QA) — read-only.
 *
 *   node scripts/ai/report.mjs [--month 2026-11] [--out docs/ai/reports]
 */
import fs from "node:fs";
import path from "node:path";
import { createAymStore } from "../../server/store.js";
import { aiStoreFor } from "../../server/ai/aiStore.js";
import { computeStats } from "../../server/ai/stats.js";
import { istDay } from "../../server/ai/config.js";

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : "";
};
const month = arg("--month") || istDay().slice(0, 7);
const outDir = arg("--out") || "";
const [y, m] = month.split("-").map(Number);
const since = Date.UTC(y, m - 1, 1) - 5.5 * 3600 * 1000;
const until = Date.UTC(y, m, 1) - 5.5 * 3600 * 1000;

const store = await createAymStore();
const ai = await aiStoreFor(store);
const [drafts, jobs, usage, cfg] = await Promise.all([ai.listDrafts(), ai.listJobs(), ai.listUsage(), ai.getConfig()]);
const s = computeStats({ drafts, jobs, usage, cfg, today: `${month}-01`, since, until });

const pct = v => (v == null ? "—" : `${Math.round(v * 1000) / 10}%`);
const rows = list => list.map(r => `| ${r.id} | ${r.drafted} | ${r.reviewed} | ${pct(r.approvalRate)} | ${pct(r.lightEditRate)} | ${r.avgEditRatio == null ? "—" : pct(r.avgEditRatio)} | ${r.rejected} | ${r.blocked} |`).join("\n");
const weak = s.byStream.filter(r => r.reviewed >= 5 && r.approvalRate != null && r.approvalRate < 0.7);

const md = `# AI drafts — monthly report ${month}

Backend: ${store.name}. AI ${cfg.enabled ? "on" : "off"}${cfg.enabled ? ` (${cfg.shadowMode ? "shadow mode" : "live review"})` : ""}; streams on: ${Object.entries(cfg.streams || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}.

## Summary

- Drafts: ${s.totals.drafted} · reviewed ${s.reviewed} · still waiting ${s.totals.pending} (shadow ${s.totals.shadowPending})
- Approval rate: ${pct(s.approvalRate)} · approvable with light edits (≤ 20% changed): ${pct(s.approvableWithLightEdits)}
- Average edit size when edited: ${s.avgEditRatio == null ? "—" : pct(s.avgEditRatio)}
- Routed to mentors before drafting: ${s.totals.blocked} (${Object.entries(s.blockedReasons).map(([k, v]) => `${k} ${v}`).join(", ") || "none"})
- Unsupported claims flagged: ${s.totals.unsupportedClaims} of ${s.totals.claims}
- Spend this month: $${s.spend.monthUSD}

## Top reject reasons

${s.topRejectReasons.length ? s.topRejectReasons.map(r => `- ${r.reason}: ${r.n}`).join("\n") : "- none"}

## By stream (weakest first)

| Stream | Drafted | Reviewed | Approved | Light edits | Avg edit | Rejected | Blocked |
|---|---|---|---|---|---|---|---|
${rows(s.byStream)}

## By persona

| Persona | Drafted | Reviewed | Approved | Light edits | Avg edit | Rejected | Blocked |
|---|---|---|---|---|---|---|---|
${rows(s.byPersona)}

## Actions

${weak.length ? weak.map(w => `- **${w.id}**: approval ${pct(w.approvalRate)} — review its persona prompt and the trusted sources for this stream; consider pausing it.`).join("\n") : "- No stream below 70% approval with ≥ 5 reviews."}
`;

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `ai-report-${month}.md`);
  fs.writeFileSync(file, md);
  console.log(`wrote ${file}`);
} else {
  console.log(md);
}
process.exit(0);
