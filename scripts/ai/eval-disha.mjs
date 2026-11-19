#!/usr/bin/env node
/**
 * DISHA V2 gold-set eval stub.
 * Fails when the coding / app-from-zero case is marked OFF_TOPIC or scripted-declined.
 *
 *   npm run eval:disha
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rulesTriage } from "../../shared/triageRules.js";
import { isScriptedTriageCategory } from "../../server/ai/scopePolicy.js";
import { classifyQuestion, fallbackStreamFor, medicalScreen } from "../../server/ai/classify.js";
import { scrubFalseLinkClaims } from "../../server/ai/mentorAssist.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const goldPath = path.join(root, "docs/ai/gold-set.jsonl");

function loadGold() {
  return fs.readFileSync(goldPath, "utf8").split("\n").map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
}

const failures = [];
const rows = loadGold();

for (const row of rows) {
  const medical = medicalScreen(row.question, row.context || "");
  const triage = rulesTriage(
    { question: row.question, context: row.context || "", theme: row.theme, subtheme: row.subtheme },
    { medical, scopePolicyVersion: "v2" },
  );
  const cls = classifyQuestion(
    { question: row.question, context: row.context || "", theme: row.theme, subtheme: row.subtheme },
    {},
  );
  const exp = row.expect || {};
  const fail = (msg) => failures.push(`${row.id}: ${msg}`);

  if (exp.notOffTopic && triage.category === "OFF_TOPIC" && triage.subtype !== "soft") {
    fail(`false OFF_TOPIC (${triage.reason})`);
  }
  if (exp.notScriptedDecline && isScriptedTriageCategory(triage.category, triage.subtype)) {
    fail(`scripted decline for in-scope ask (${triage.category}/${triage.subtype})`);
  }
  if (exp.inScope && !["ON_TOPIC", "WRONG_AREA"].includes(triage.category) && triage.subtype !== "soft") {
    // soft OFF_TOPIC is still allowed as a desk label but must not gate
    if (triage.category === "OFF_TOPIC" && triage.subtype === "soft") {
      /* ok as label */
    } else if (triage.category !== "ON_TOPIC" && triage.category !== "WRONG_AREA") {
      fail(`expected in-scope, got ${triage.category}/${triage.subtype}`);
    }
  }
  if (exp.category === "ON_TOPIC" && triage.category !== "ON_TOPIC" && triage.category !== "WRONG_AREA") {
    fail(`expected ON_TOPIC-ish, got ${triage.category}`);
  }
  if (exp.restricted) {
    if (triage.category !== "RESTRICTED") fail(`expected RESTRICTED, got ${triage.category}`);
    if (exp.subtype && triage.subtype !== exp.subtype) fail(`expected subtype ${exp.subtype}, got ${triage.subtype}`);
  }
  if (exp.streamNotInternship) {
    const stream = cls.stream || fallbackStreamFor(row.theme, row.subtheme, null);
    if (stream === "internship-early-career") fail(`false Internship stream for Tech/coding case`);
  }
  if (exp.answersDespiteMismatch && isScriptedTriageCategory(triage.category, triage.subtype)) {
    fail(`track mismatch must still answer (got scripted ${triage.category})`);
  }
  if (exp.scriptedOk && !isScriptedTriageCategory(triage.category, triage.subtype)) {
    fail(`expected scripted chit-chat, got ${triage.category}/${triage.subtype}`);
  }
}

// Guard: never claim "links below" without resources.
const scrubbed = scrubFalseLinkClaims("A mentor can refine this path; the links below are solid free starting points.", []);
if (/links below/i.test(scrubbed)) failures.push("scrubFalseLinkClaims left a false links-below claim");

if (failures.length) {
  console.error("eval:disha FAILED\n" + failures.map(f => ` - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`eval:disha OK — ${rows.length} gold cases (coding false-off-topic gate green)`);
