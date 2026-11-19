#!/usr/bin/env node
/**
 * PHASE 7 evaluation harness.
 *
 *   node tests/ai-eval/run-eval.mjs            offline metrics (always) + live run if a provider key exists
 *   EVAL_N=40 EVAL_JUDGE=1 node tests/ai-eval/run-eval.mjs    live sample size / LLM judge
 *   EVAL_LIVE=0 …                             force offline only
 *   --gate                                    exit 1 if a gate fails
 *
 * Writes tests/ai-eval/reports/eval-<date>.{json,md}. Live runs use an in-memory store, the local
 * KB (data/kb/chunks.jsonl) and the trusted-source list; nothing is written to Firestore.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { offlineEval, liveEval, GATES } from "./metrics.mjs";
import { getProvider, getPersonas, providerReady } from "../../server/ai/runtime.js";
import { loadKb } from "../../server/ai/retrieve.js";
import { aiStoreFor, createMemoryKv } from "../../server/ai/aiStore.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SET = JSON.parse(fs.readFileSync(path.join(DIR, "eval-set.json"), "utf8"));
const gateMode = process.argv.includes("--gate");

const personas = await getPersonas();
const offline = offlineEval(SET, personas);

let live = null;
const provider = await getProvider();
const wantLive = process.env.EVAL_LIVE !== "0";
if (wantLive && providerReady(provider)) {
  const n = Number(process.env.EVAL_N || 30);
  const pool = SET.items.filter(i => i.expect && i.expect.route === "draft");
  // Tricky + pilot-stream items first, then the rest, capped at EVAL_N.
  const pick = [
    ...pool.filter(i => i.source === "tricky"),
    ...pool.filter(i => i.source !== "tricky" && /aiapget|neetpg|psc|upsc|govt|medicalofficer|pg/i.test((i.tags || []).join(" "))),
    ...pool.filter(i => i.source !== "tricky"),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, n);
  const aiStore = await aiStoreFor(createMemoryKv());
  const kb = await loadKb(null, { fresh: true });
  console.log(`live eval: ${pick.length} questions, KB ${kb.chunks.length} passages (${kb.source})`);
  live = await liveEval(pick, {
    provider, personas, aiStore, kb, judge: process.env.EVAL_JUDGE === "1",
    onProgress: (i, total, row) => process.stdout.write(`  ${i}/${total} ${row.id} ${row.status}${row.blockedReason ? `:${row.blockedReason}` : ""} ${row.ms}ms\n`),
  });
} else {
  console.log(wantLive ? "live eval skipped: no AI provider (GEMINI_API_KEY, AI_PROVIDER=vertex + GOOGLE_APPLICATION_CREDENTIALS, ANTHROPIC_API_KEY or OPENAI_API_KEY)" : "live eval disabled (EVAL_LIVE=0)");
}

const gates = [
  { name: "Medical questions routed to a mentor", want: "100%", got: `${Math.round(offline.medicalToMentor.rate * 1000) / 10}%`, pass: offline.medicalToMentor.rate >= GATES.medicalToMentor },
  { name: "PII leakage (redaction)", want: "0", got: String(offline.piiLeaks), pass: offline.piiLeaks === GATES.piiLeaks },
];
if (live) {
  gates.push({ name: "PII in provider calls", want: "0", got: String(live.piiLeaks), pass: live.piiLeaks === 0 });
  gates.push({ name: "Unsupported facts reaching review unflagged", want: "0", got: String(live.unsupportedMissedByVerifier), pass: live.unsupportedMissedByVerifier === GATES.unsupportedFacts });
  if (live.approvableLightEditsPct != null) {
    gates.push({ name: "Approvable with light edits (LLM judge)", want: `≥ ${GATES.approvableLightEdits * 100}%`, got: `${live.approvableLightEditsPct}%`, pass: live.approvableLightEditsPct >= GATES.approvableLightEdits * 100 });
  }
}

const day = new Date().toISOString().slice(0, 10);
const reportDir = path.join(DIR, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const report = { day, set: SET.counts, offline, live, gates };
fs.writeFileSync(path.join(reportDir, `eval-${day}.json`), `${JSON.stringify(report, null, 1)}\n`);

const md = [
  `# AI answer pipeline — evaluation ${day}`,
  "",
  `Set: ${SET.counts.total} questions (${SET.counts.tricky} tricky, ${SET.counts.qbank} qbank, ${SET.counts.golden} golden, ${SET.counts.fixture} fixture; ${SET.counts.medical} medical, ${SET.counts.pii} with PII).`,
  "",
  "## Gates",
  "",
  "| Gate | Target | Result | |",
  "|---|---|---|---|",
  ...gates.map(g => `| ${g.name} | ${g.want} | ${g.got} | ${g.pass ? "PASS" : "FAIL"} |`),
  "",
  "## Offline",
  "",
  `- Medical → mentor: ${offline.medicalToMentor.routed}/${offline.medicalToMentor.total}`,
  `- Career questions wrongly held back: ${offline.falseBlocks.blocked}/${offline.falseBlocks.total} (${offline.falseBlocks.ratePct}%)`,
  `- Stream routing: ${offline.streamAccuracy.correct}/${offline.streamAccuracy.total} (${offline.streamAccuracy.ratePct}%)`,
  `- Time-sensitive asks flagged: ${offline.timeSensitiveRecall.flagged}/${offline.timeSensitiveRecall.total}`,
  `- PII leaks after redaction: ${offline.piiLeaks} (of ${offline.piiItems} items with PII)`,
  ...(offline.failures.wrongStream.length ? ["", "Wrong stream: " + offline.failures.wrongStream.map(w => `${w.id} (${w.got} ≠ ${w.want})`).join(", ")] : []),
  ...(offline.failures.falseBlocked.length ? ["", "Held back: " + offline.failures.falseBlocked.slice(0, 20).map(w => `${w.id} [${w.reasons.join("+")}]`).join(", ")] : []),
  "",
  "## Live (draft + verify)",
  "",
  ...(live ? [
    `- Drafted ${live.drafted}/${live.items}; insufficient source ${live.insufficientSource}; other blocks ${live.blocked - live.insufficientSource}; errors ${live.errors}`,
    `- Factual support: ${live.factualSupportPct}% of claims · citation validity ${live.citationValidityPct}%`,
    `- Unsupported claims: ${live.unsupportedClaims} in ${live.draftsWithUnsupported} drafts (all flagged high risk: ${live.unsupportedMissedByVerifier === 0 ? "yes" : "no"})`,
    `- Risk mix: low ${live.riskMix.low} · medium ${live.riskMix.medium} · high ${live.riskMix.high}`,
    `- Approvable with light edits (judge): ${live.approvableLightEditsPct ?? "not run"}%`,
    `- Latency p50 ${live.latencyMs.p50} ms · p95 ${live.latencyMs.p95} ms · cost $${live.costUSD}`,
  ] : ["Skipped — no provider key in this environment."]),
  "",
  "Human sample: officials review 20 random approved-as-is drafts each week; record disagreements in the reject reasons.",
  "",
].join("\n");
fs.writeFileSync(path.join(reportDir, `eval-${day}.md`), md);
console.log(md);

if (gateMode && gates.some(g => !g.pass)) process.exit(1);
