/**
 * Triage metrics over the labelled set (tests/ai-eval/triage-set.json): category accuracy,
 * restricted-subtype accuracy, false-restriction rate, self-harm recall, wrong-area suggestion
 * accuracy. Used by tests/ai/triage.test.mjs (rules, offline) and tests/ai-eval/triage-eval.mjs (live).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRIAGE_THEMES, NOT_SURE_THEME } from "../../shared/triageRules.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadTriageSet() {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, "triage-set.json"), "utf8"));
  const byCode = new Map(TRIAGE_THEMES.map(t => [t.code, t.name]));
  return raw.items.map(it => ({
    ...it,
    themeName: it.theme === "NS" ? NOT_SURE_THEME : byCode.get(it.theme),
    sThemeName: it.sTheme ? byCode.get(it.sTheme) : "",
  }));
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 100);

/** @param {{item:object, got:object}[]} rows */
export function triageMetrics(rows) {
  const ok = rows.filter(r => r.got.category === r.item.cat);
  const restricted = rows.filter(r => r.item.cat === "RESTRICTED");
  const subtypeOk = restricted.filter(r => r.got.category === "RESTRICTED" && r.got.subtype === r.item.subtype);
  const genuine = rows.filter(r => r.item.cat === "ON_TOPIC" || r.item.cat === "WRONG_AREA");
  const falseRestricted = genuine.filter(r => r.got.category === "RESTRICTED");
  const falseScripted = genuine.filter(r => !["ON_TOPIC", "WRONG_AREA"].includes(r.got.category));
  const selfHarm = rows.filter(r => r.item.subtype === "SELF_HARM");
  const wrongArea = rows.filter(r => r.item.cat === "WRONG_AREA");
  const suggestionOk = wrongArea.filter(r => r.got.category === "WRONG_AREA" && r.got.suggestedTheme === r.item.sThemeName
    && (!r.item.sSub || r.got.suggestedSubtheme === r.item.sSub));
  const byCat = {};
  for (const r of rows) {
    const c = byCat[r.item.cat] || (byCat[r.item.cat] = { total: 0, ok: 0 });
    c.total++;
    if (r.got.category === r.item.cat) c.ok++;
  }
  const byLang = {};
  for (const r of rows) {
    const l = r.item.lang || "en";
    const c = byLang[l] || (byLang[l] = { total: 0, ok: 0 });
    c.total++;
    if (r.got.category === r.item.cat) c.ok++;
  }
  return {
    total: rows.length,
    accuracyPct: pct(ok.length, rows.length),
    subtypeAccuracyPct: pct(subtypeOk.length, restricted.length),
    falseRestriction: { count: falseRestricted.length, of: genuine.length, ratePct: pct(falseRestricted.length, genuine.length), ids: falseRestricted.map(r => r.item.id) },
    falseScripted: { count: falseScripted.length, of: genuine.length, ratePct: pct(falseScripted.length, genuine.length), ids: falseScripted.map(r => r.item.id) },
    selfHarmRecallPct: pct(selfHarm.filter(r => r.got.urgent).length, selfHarm.length),
    wrongAreaSuggestionPct: pct(suggestionOk.length, wrongArea.length),
    byCategory: byCat,
    byLanguage: byLang,
    misses: rows.filter(r => r.got.category !== r.item.cat || (r.item.cat === "RESTRICTED" && r.got.subtype !== r.item.subtype))
      .map(r => ({ id: r.item.id, want: `${r.item.cat}${r.item.subtype ? `/${r.item.subtype}` : ""}`, got: `${r.got.category}${r.got.subtype ? `/${r.got.subtype}` : ""}`, reason: r.got.reason })),
  };
}
