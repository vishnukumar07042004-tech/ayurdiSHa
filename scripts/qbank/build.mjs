#!/usr/bin/env node
/**
 * PHASE 1 question bank.
 *   node scripts/qbank/build.mjs [--seed=2026] [--llm] [--llm-top=150]
 *
 * subject × ask × stage × region × language from scripts/qbank/catalog.mjs (aligned with the
 * shared/merge.js taxonomy), plus natural student phrasings from scripts/merge-bench/intents.mjs.
 * Every question is checked with merge.js intentSignature(); questions are clustered with
 * buildClusters() and intents whose questions the engine groups together are folded into one
 * (same subject + region only — the engine never decides across countries/states for us).
 * --llm adds model paraphrases (cached in data/qbank/paraphrases.json, so reruns stay deterministic).
 *
 * Writes data/qbank/qbank.json, data/qbank/intents.json, data/qbank/report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { analyzeQuestion, intentSignature, buildClusters, normalizeText, tidyQuestion } from "../../shared/merge.js";
import { THEMES, personaFor } from "../../server/ai/personas/index.js";
import { INTENTS as BENCH_INTENTS, SLOTS as BENCH_SLOTS, T as BENCH_T } from "../merge-bench/intents.mjs";
import { CATALOG, ASK_TEMPLATES, STAGES, REGIONS } from "./catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "data/qbank");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const SEED = Number(args.seed || 2026);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const hash = s => createHash("sha1").update(s).digest("hex");

// ------------------------------------------------------------------ themes must match the app

function checkThemesAgainstApp() {
  const app = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  const block = app.match(/const TRACKS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("Could not find TRACKS in src/App.jsx");
  const rows = [...block[1].matchAll(/code:\s*"(T\d+)",\s*name:\s*"([^"]+)",\s*subs:\s*\[([^\]]*)\]/g)]
    .map(m => ({ code: m[1], name: m[2], subs: [...m[3].matchAll(/"([^"]+)"/g)].map(x => x[1]) }));
  const drift = [];
  for (const r of rows) {
    const t = THEMES.find(x => x.code === r.code);
    if (!t || t.name !== r.name || JSON.stringify(t.subs) !== JSON.stringify(r.subs)) drift.push(r.code);
  }
  if (rows.length !== THEMES.length) drift.push(`count ${rows.length} vs ${THEMES.length}`);
  if (drift.length) throw new Error(`server/ai/personas/index.js THEMES drifted from src/App.jsx TRACKS: ${drift.join(", ")}`);
}

const THEME = Object.fromEntries(THEMES.map(t => [t.code, t]));

// ------------------------------------------------------------------ generation

const ASK_SLUG = { "how-to": "how-to", "which one": "which-one", "is it possible": "possible", scope: "scope" };
const askSlug = a => ASK_SLUG[a] || a;
const LANGS = [["en", "en"], ["hinglish", "hg"], ["hi", "hi"]];
const ASK_W = { "how-to": 1, eligibility: 0.95, legal: 0.95, compare: 0.95, "which one": 0.9, cost: 0.85, scope: 0.85, syllabus: 0.85, "is it possible": 0.85, timeline: 0.8, resources: 0.8, income: 0.8, cutoff: 0.75, necessity: 0.7, location: 0.6 };
const REGION_W = { gulf: 1, usa: 0.9, uk: 0.9, eu: 0.8, canada: 0.75, australia: 0.7, kerala: 0.9, maharashtra: 0.85, "uttar-pradesh": 0.85, rajasthan: 0.8, "madhya-pradesh": 0.8, gujarat: 0.75, karnataka: 0.75, odisha: 0.8 };

function fillTpl(tpl, e, region, lang) {
  const R = region ? REGIONS[region][lang === "hg" ? "hg" : lang === "hi" ? "hi" : "en"] : "";
  const sub = s => String(s || "").replace(/\{R\}/g, R);
  const S = sub(lang === "hg" ? (e.hg || e.n) : lang === "hi" ? (e.hi || e.hg || e.n) : e.n);
  const A = sub(e.a || (e.n ? `get started with ${e.n}` : ""));
  const HA = sub(e.ha || (e.hg ? `${e.hg} start` : A));
  return tpl.replace(/\{S\}/g, S).replace(/\{A\}/g, A).replace(/\{HA\}/g, HA).replace(/\{R\}/g, R);
}

function capFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function generate() {
  const intents = new Map();
  const questions = [];
  for (const e of CATALOG) {
    const t = THEME[e.theme];
    if (!t || !t.subs.includes(e.sub)) throw new Error(`catalog ${e.key}: bad theme/sub ${e.theme}/${e.sub}`);
    const regions = e.regions && e.regions.length ? e.regions : [null];
    for (const ask of e.asks) {
      for (const region of regions) {
        const intentId = `${e.key}.${askSlug(ask)}${region ? `.${region}` : ""}`;
        intents.set(intentId, { e, ask, region, intentId });
        for (const [lang, lk] of LANGS) {
          const tpls = e.custom ? (e.custom[lk] || []) : (ASK_TEMPLATES[ask]?.[lk] || []);
          tpls.forEach((tpl, ti) => {
            const base = capFirst(fillTpl(tpl, e, region, lk).replace(/\s+/g, " ").trim());
            // One plain variant plus one variant per relevant stage with a stage lead-in.
            questions.push({ intentId, lang, stage: e.stages[ti % e.stages.length], text: base, origin: "template" });
            for (const stage of e.stages) {
              const lead = lk === "hi" ? STAGES[stage].hi : STAGES[stage].en;
              questions.push({ intentId, lang, stage, text: `${lead} ${base}`, origin: "template" });
            }
          });
        }
      }
    }
  }
  return { intents, questions };
}

// ------------------------------------------------------------------ merge-bench phrasings

function benchPhrasings(intents) {
  const out = [];
  let unmatched = 0;
  const byThemeSub = new Map();
  for (const it of intents.values()) {
    const k = `${it.e.theme}|${it.e.sub}`;
    if (!byThemeSub.has(k)) byThemeSub.set(k, []);
    byThemeSub.get(k).push(it);
  }
  const fillBench = tpl => tpl.replace(/\{([A-Z]+)\}/g, (_, k) => pick(BENCH_SLOTS[k] || [k]));
  for (const bi of BENCH_INTENTS) {
    const cands = byThemeSub.get(`${bi.theme}|${bi.sub}`) || [];
    for (const tpl of bi.t) {
      for (let rep = 0; rep < 2; rep++) {
        const text = fillBench(tpl).replace(/\s+/g, " ").trim();
        const sig = intentSignature(analyzeQuestion(text, ""));
        const has = id => sig.strong.has(id) || sig.weak.has(id);
        const primary = sig.asks.size ? [...sig.asks][0] : (sig.generic[0] || null);
        const match = cands.filter(it => {
          const req = [...it.e.sig, ...(it.region && REGIONS[it.region].sig ? [REGIONS[it.region].sig] : [])];
          if (!req.length || !req.every(has)) return false;
          if (it.region && REGIONS[it.region].state && !new RegExp(REGIONS[it.region].en, "i").test(text)) return false;
          if (!it.region && [...sig.strong].some(s => s.startsWith("country:"))) return false;
          return it.ask === primary || (sig.asks.size && sig.asks.has(it.ask));
        });
        if (match.length !== 1) { unmatched++; continue; }
        const it = match[0];
        const lang = /\b(?:kya|kaise|karein|karun|hai|hain|mein|ke|ki|ka|kitna|kitni|chahiye|sakte|karna)\b/i.test(text) ? "hinglish" : "en";
        out.push({ intentId: it.intentId, lang, stage: pick(it.e.stages), text: capFirst(text), origin: "merge-bench" });
      }
    }
  }
  return { out, unmatched };
}

// ------------------------------------------------------------------ LLM paraphrases (optional, cached)

async function llmParaphrases(intents, canonicalOf, top) {
  const cacheFile = path.join(OUT, "paraphrases.json");
  const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
  const out = [];
  let usage = null;
  if (args.llm) {
    const { isConfigured, chat, getUsage } = await import("../../server/ai/provider.js");
    if (!isConfigured()) console.log("[qbank] --llm given but no AI key configured; using cached paraphrases only");
    else {
      const ids = top.filter(id => !cache[id]);
      for (const id of ids) {
        const it = intents.get(id);
        try {
          const r = await chat({
            role: "draft",
            system: "You write realistic questions that Indian BAMS students ask at a career-guidance desk. Keep the exact meaning; do not add new subjects, countries, exams or numbers.",
            messages: [{ role: "user", content: `Question: "${canonicalOf(id)}"\nWrite 2 English, 2 Hinglish (Roman Hindi mixed with English) and 1 Hindi (Devanagari, keep technical terms in English) paraphrases a student might type. Return {"en":[],"hinglish":[],"hi":[]}` }],
            json: true, maxTokens: 1024, temperature: 0.7,
          });
          if (r.json) cache[id] = r.json;
        } catch (err) {
          console.log(`[qbank] paraphrase ${id} failed: ${err.message.slice(0, 120)}`);
          if (/quota|429|not configured/i.test(err.message)) break;
        }
        void it;
      }
      usage = getUsage();
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
    }
  }
  for (const [id, p] of Object.entries(cache)) {
    if (!intents.has(id)) continue;
    const it = intents.get(id);
    for (const lang of ["en", "hinglish", "hi"]) {
      for (const text of Array.isArray(p[lang]) ? p[lang] : []) {
        if (typeof text === "string" && text.length > 8) out.push({ intentId: id, lang, stage: pick(it.e.stages), text: text.trim(), origin: "llm" });
      }
    }
  }
  return { out, usage };
}

// ------------------------------------------------------------------ validation

function validate(q, it) {
  const sig = intentSignature(analyzeQuestion(q.text, ""));
  const has = id => sig.strong.has(id) || sig.weak.has(id);
  for (const id of it.e.sig) if (!has(id)) return `missing subject ${id}`;
  if (it.region && REGIONS[it.region].sig && !sig.strong.has(REGIONS[it.region].sig)) return `missing region ${it.region}`;
  if (!it.region && [...sig.strong].some(s => s.startsWith("country:"))) return "unexpected country";
  const generic = ["how-to", "which one", "scope", "is it possible"].includes(it.ask);
  if (it.e.custom) return null; // hand-written intent text; subject check is enough
  if (generic) {
    const extra = [...sig.asks].filter(a => a !== "necessity" && a !== "eligibility");
    if (extra.length) return `generic ask carries ${extra.join(",")}`;
    if (q.lang !== "hi" && !sig.generic.includes(it.ask) && it.ask !== "which one") return `ask ${it.ask} not detected`;
  } else if (!sig.asks.has(it.ask)) return `ask ${it.ask} not detected`;
  return null;
}

// ------------------------------------------------------------------ main

async function main() {
  checkThemesAgainstApp();
  fs.mkdirSync(OUT, { recursive: true });
  const { intents, questions: tplQs } = generate();
  const bench = benchPhrasings(intents);
  const canonicalOf = id => {
    const q = tplQs.find(x => x.intentId === id && x.lang === "en" && !Object.values(STAGES).some(s => x.text.startsWith(s.en)));
    return q ? tidyQuestion(q.text) : id;
  };
  const prelimTop = [...intents.values()].sort((a, b) => score(b) - score(a)).slice(0, Number(args["llm-top"] || 150)).map(x => x.intentId);
  const llm = await llmParaphrases(intents, canonicalOf, prelimTop);

  // Validate + de-duplicate on merge.js normalised text.
  const dropped = {};
  const seen = new Set();
  const kept = [];
  for (const q of [...tplQs, ...bench.out, ...llm.out]) {
    const it = intents.get(q.intentId);
    const why = validate(q, it);
    if (why) { dropped[why] = (dropped[why] || 0) + 1; continue; }
    const key = normalizeText(q.text);
    if (seen.has(key)) { dropped.duplicate = (dropped.duplicate || 0) + 1; continue; }
    seen.add(key);
    kept.push(q);
  }

  // Cluster with the production merge engine (per theme + subtheme, like the staff workspace).
  const subs = kept.map((q, i) => {
    const it = intents.get(q.intentId);
    return { id: `q${i}`, question: q.text, theme: THEME[it.e.theme].name, subtheme: it.e.sub, _i: i };
  });
  const clusters = buildClusters(subs);
  const clusterOf = new Map();
  clusters.forEach((c, ci) => c.memberIds.forEach(id => clusterOf.set(id, ci)));

  // Co-clustering between intents of the same subject + region → fold into one intent.
  const sizeOf = new Map();
  kept.forEach(q => sizeOf.set(q.intentId, (sizeOf.get(q.intentId) || 0) + 1));
  const co = new Map();
  let pure = 0, multi = 0;
  for (const c of clusters) {
    if (c.memberIds.length < 2) continue;
    multi++;
    const counts = new Map();
    c.memberIds.forEach(id => { const q = kept[Number(id.slice(1))]; counts.set(q.intentId, (counts.get(q.intentId) || 0) + 1); });
    if (counts.size === 1) pure++;
    const ids = [...counts.keys()];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = [ids[i], ids[j]].sort().join("|");
      co.set(k, (co.get(k) || 0) + Math.min(counts.get(ids[i]), counts.get(ids[j])));
    }
  }
  const parent = new Map([...intents.keys()].map(k => [k, k]));
  const find = x => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const folds = [];
  for (const [k, n] of co) {
    const [a, b] = k.split("|");
    const A = intents.get(a), B = intents.get(b);
    if (A.e.key !== B.e.key || A.region !== B.region) continue;
    const min = Math.min(sizeOf.get(a) || 0, sizeOf.get(b) || 0);
    if (!min || n < 0.5 * min) continue;
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    const [keep, drop] = score(intents.get(ra)) >= score(intents.get(rb)) ? [ra, rb] : [rb, ra];
    parent.set(drop, keep);
    folds.push({ into: keep, merged: drop, coClustered: n });
  }

  // Assemble outputs.
  const qbank = kept.map(q => {
    const it = intents.get(q.intentId);
    const canonId = find(q.intentId);
    const subject = it.e.sig[0] || (it.region && REGIONS[it.region].sig) || "general";
    return {
      id: `Q${hash(`${q.intentId}|${q.lang}|${q.stage}|${q.text}`).slice(0, 10)}`,
      intentId: canonId,
      theme: THEME[it.e.theme].name,
      subtheme: it.e.sub,
      subject,
      ask: it.ask,
      stage: q.stage,
      region: it.region || "india",
      lang: q.lang,
      text: q.text,
      origin: q.origin,
    };
  }).sort((a, b) => a.intentId.localeCompare(b.intentId) || a.lang.localeCompare(b.lang) || a.id.localeCompare(b.id));

  const countBy = new Map();
  qbank.forEach(q => countBy.set(q.intentId, (countBy.get(q.intentId) || 0) + 1));
  const intentsOut = [...intents.values()]
    .filter(it => find(it.intentId) === it.intentId && countBy.get(it.intentId))
    .map(it => {
      const theme = THEME[it.e.theme].name;
      const canonical = canonicalOf(it.intentId);
      return {
        intentId: it.intentId,
        theme,
        subtheme: it.e.sub,
        subject: it.e.sig[0] || (it.region && REGIONS[it.region].sig) || "general",
        ask: it.ask,
        canonical,
        count: countBy.get(it.intentId),
        priority: Math.round(score(it) * 100) / 100,
        region: it.region || "india",
        stream: personaFor(theme, it.e.sub, canonical),
        topic: it.e.key,
        merged: folds.filter(f => f.into === it.intentId).map(f => f.merged),
      };
    })
    .sort((a, b) => b.priority - a.priority || a.intentId.localeCompare(b.intentId));
  intentsOut.forEach((x, i) => { x.rank = i + 1; });

  fs.writeFileSync(path.join(OUT, "qbank.json"), JSON.stringify(qbank, null, 1) + "\n");
  fs.writeFileSync(path.join(OUT, "intents.json"), JSON.stringify(intentsOut, null, 1) + "\n");

  const tally = (rows, f) => rows.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const report = {
    seed: SEED,
    questions: qbank.length,
    intents: intentsOut.length,
    generated: tplQs.length + bench.out.length + llm.out.length,
    fromMergeBench: qbank.filter(q => q.origin === "merge-bench").length,
    mergeBenchUnmatched: bench.unmatched,
    fromLlm: qbank.filter(q => q.origin === "llm").length,
    llmUsage: llm.usage,
    dropped,
    clustering: { clusters: clusters.length, multiMember: multi, singleIntentClusters: pure, purity: multi ? Math.round((pure / multi) * 1000) / 1000 : null, intentsFolded: folds.length },
    byLang: tally(qbank, q => q.lang),
    byStage: tally(qbank, q => q.stage),
    byRegion: tally(qbank, q => q.region),
    byTheme: tally(qbank, q => q.theme),
    intentsByStream: tally(intentsOut, i => i.stream),
    folds: folds.slice(0, 80),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`[qbank] ${qbank.length} questions, ${intentsOut.length} intents (folded ${folds.length}); dropped ${JSON.stringify(dropped)}`);
  console.log(`[qbank] merge-bench phrasings kept ${report.fromMergeBench} (unmatched ${bench.unmatched}); llm ${report.fromLlm}; cluster purity ${report.clustering.purity}`);
  console.log(`[qbank] by stream ${JSON.stringify(report.intentsByStream)}`);
}

function score(it) {
  return it.e.prio * (ASK_W[it.ask] || 0.7) * (it.region ? (REGION_W[it.region] || 0.7) : 1);
}

void BENCH_T;
main().catch(err => { console.error("[qbank] fatal:", err); process.exit(1); });
