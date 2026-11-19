#!/usr/bin/env node
/**
 * Live triage eval (docs/ai/QUESTION-TRIAGE-SPEC.md §8). Runs the LLM classifier on ~60 labelled
 * items (all held-out items + a spread of hard and restricted cases) with the real provider from
 * .env.local / env, and compares rules-only, LLM-only and the production combination (LLM only when
 * the rules are unsure). Stops if spend passes $0.50. Writes tests/ai-eval/reports/triage-<ts>.json.
 *
 *   node tests/ai-eval/triage-eval.mjs [--limit 60]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rulesTriage, RULES_SURE } from "../../shared/triageRules.js";
import { medicalScreen } from "../../server/ai/classify.js";
import { redactText } from "../../server/ai/redact.js";
import { llmTriage, combineTriage } from "../../server/ai/triage.js";
import { loadTriageSet, triageMetrics } from "./triage-metrics.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SPEND_STOP_USD = 0.5;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) || 60 : 60;

function pick(set) {
  const hold = set.filter(i => i.holdout);
  const rest = set.filter(i => !i.holdout);
  const extra = [];
  const byKey = new Map();
  for (const i of rest) {
    const k = i.hard ? "hard" : `${i.cat}/${i.subtype || ""}/${i.lang || "en"}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(i);
  }
  // Round-robin across groups so every category / language is represented.
  for (let round = 0; extra.length < LIMIT - hold.length && round < 20; round++) {
    for (const list of byKey.values()) if (list[round] && extra.length < LIMIT - hold.length) extra.push(list[round]);
  }
  return [...hold, ...extra].slice(0, LIMIT);
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  const provider = await import("../../server/ai/provider.js");
  if (!provider.isConfigured()) {
    console.log("No AI provider configured (GEMINI_API_KEY / AI_PROVIDER=vertex). Nothing to do.");
    return;
  }
  const items = pick(loadTriageSet());
  const rows = { rules: [], llm: [], prod: [] };
  const ms = [];
  let cost = 0;
  let calls = 0;
  let failures = 0;
  let prodCalls = 0;
  const errors = [];
  for (const item of items) {
    if (cost >= SPEND_STOP_USD) { console.log(`Spend stop at $${cost.toFixed(4)}`); break; }
    const q = { question: redactText(item.q).text, context: item.ctx || "", theme: item.themeName, subtheme: item.sub };
    const rules = rulesTriage(q, { medical: medicalScreen(q.question, q.context) });
    const t0 = Date.now();
    const r = await llmTriage(provider, q);
    ms.push(Date.now() - t0);
    calls++;
    cost += (r.usage && r.usage.costUSD) || 0;
    if (!r.ok) { failures++; errors.push(`${item.id}: ${r.error}`); }
    const llm = r.ok ? r.result : null;
    const unsure = rules.confidence < RULES_SURE && rules.category !== "RESTRICTED";
    if (unsure) prodCalls++;
    const prod = combineTriage(rules, unsure ? llm : null);
    rows.rules.push({ item, got: { ...rules, urgent: rules.urgent } });
    rows.llm.push({ item, got: llm ? { ...llm, urgent: llm.category === "RESTRICTED" && llm.subtype === "SELF_HARM" } : { category: "ERROR", subtype: "", reason: r.error } });
    rows.prod.push({ item, got: { ...prod, urgent: prod.category === "RESTRICTED" && prod.subtype === "SELF_HARM" } });
    process.stdout.write(`${item.id.padEnd(6)} want ${(item.cat + (item.subtype ? "/" + item.subtype : "")).padEnd(28)} rules ${rules.category.padEnd(10)} llm ${(llm ? llm.category + (llm.subtype ? "/" + llm.subtype : "") : "ERR").padEnd(28)} ${String(Date.now() - t0).padStart(5)} ms\n`);
    if (failures >= 2 && failures === calls) { console.log("Provider failing on every call — stopping."); break; }
  }
  const summary = name => {
    const m = triageMetrics(rows[name]);
    return { accuracyPct: m.accuracyPct, subtypeAccuracyPct: m.subtypeAccuracyPct, falseRestrictionPct: m.falseRestriction.ratePct, falseRestrictionIds: m.falseRestriction.ids, falseScriptedPct: m.falseScripted.ratePct, selfHarmRecallPct: m.selfHarmRecallPct, wrongAreaSuggestionPct: m.wrongAreaSuggestionPct, misses: m.misses.slice(0, 15) };
  };
  const report = {
    at: new Date().toISOString(),
    items: rows.rules.length,
    holdoutItems: rows.rules.filter(r => r.item.holdout).length,
    model: process.env.AI_TRIAGE_MODEL || "classify role default",
    llmCalls: calls,
    llmFailures: failures,
    errors: errors.slice(0, 5),
    costUSD: Math.round(cost * 1e6) / 1e6,
    costPer100QuestionsInProductionUSD: calls ? Math.round((cost / calls) * prodCalls / rows.rules.length * 100 * 1e4) / 1e4 : 0,
    productionLlmCallRatePct: rows.rules.length ? Math.round((prodCalls / rows.rules.length) * 1000) / 10 : 0,
    latencyMs: { p50: pct(ms, 50), p95: pct(ms, 95) },
    rulesOnly: summary("rules"),
    llmOnly: summary("llm"),
    production: summary("prod"),
  };
  fs.mkdirSync(path.join(DIR, "reports"), { recursive: true });
  const out = path.join(DIR, "reports", `triage-${report.at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rulesOnly: { ...report.rulesOnly, misses: undefined }, llmOnly: { ...report.llmOnly, misses: report.llmOnly.misses.slice(0, 8) }, production: { ...report.production, misses: undefined } }, null, 2));
  console.log(`Report: ${path.relative(process.cwd(), out)}`);
}

main().catch(err => {
  console.error(String(err && err.message || err).slice(0, 300));
  process.exit(1);
});
