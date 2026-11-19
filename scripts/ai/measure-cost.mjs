#!/usr/bin/env node
/**
 * Cost model for the AI answer pipeline without paying for generations.
 *   node scripts/ai/measure-cost.mjs [--n=30] [--count-tokens]
 *
 * Runs the real redact → classify → retrieve → draft → verify path over eval questions with a
 * stand-in model (synthetic, source-quoting JSON), records every prompt exactly as it would be sent,
 * and measures input tokens — with the provider's free countTokens endpoint when --count-tokens and a
 * Gemini key work, else ~4 chars/token. Output/thinking tokens are assumptions (printed). Writes
 * data/kb/cost-model.json. No generateContent call is made.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { draftAnswer } from "../../server/ai/draft.js";
import { getPersonas } from "../../server/ai/runtime.js";
import { loadKb } from "../../server/ai/retrieve.js";
import { aiStoreFor, createMemoryKv } from "../../server/ai/aiStore.js";
import { estimateCostUsd, providerInfo } from "../../server/ai/provider.js";
import { loadServerEnv } from "../../server/env.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const N = Number(args.n || 30);
const EVENT_DAY = "2026-12-10";

/** Output-side assumptions (tokens). Visible sizes follow the prompt rules (120–220 word answer + JSON). */
const ASSUME = { draftVisible: 650, draftThinking: 600, verifyVisible: 450, verifyThinking: 300, escalateRate: 0.25, queryEmbedTokens: 40 };

const set = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/ai-eval/eval-set.json"), "utf8"));
const draftable = set.items.filter(i => i.expect && i.expect.route === "draft");
const medical = set.items.filter(i => i.expect && i.expect.route === "mentor");
const pick = [
  ...draftable.filter(i => i.source === "tricky").slice(0, Math.ceil(N * 0.4)),
  ...medical.slice(0, Math.ceil(N * 0.2)),
  ...draftable.filter(i => i.source !== "tricky"),
].filter((v, i, a) => a.indexOf(v) === i).slice(0, N);

const sentences = t => String(t).split(/(?<=[.!?])\s+/).filter(s => s.length > 30);
const prompts = [];

const standIn = {
  isConfigured: () => true,
  async embed() { throw new Error("embeddings not used in the cost model"); },
  async chat(a) {
    const user = a.messages.map(m => m.content).join("\n");
    prompts.push({ role: a.role, system: a.system || "", user });
    if (a.role === "draft") {
      const p = JSON.parse(a.messages[0].content);
      const src = p.SOURCES || [];
      const picks = src.slice(0, 3).map(s => ({ s, line: sentences(s.text)[0] || s.text.slice(0, 160) }));
      const answer = picks.map(x => `${x.line} [c:${x.s.id}]`).join(" ") + " Check the official notice before you apply, and plan your preparation month by month so you are not rushing at the end.";
      return { text: "", json: { answer, actions: ["Read the latest official notice", "Make a study plan", "Talk to a senior who cleared it"], mistake: "Relying on coaching-blog numbers instead of the official notice.", resources: picks.slice(0, 2).map(x => ({ title: x.s.title, url: x.s.url })), citations: picks.map(x => ({ chunkId: x.s.id, quote: x.line.split(" ").slice(0, 20).join(" ") })) }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, model: "stand-in" };
    }
    const p = JSON.parse(a.messages[0].content);
    const claims = sentences(String(p.draft || "")).slice(0, 4).map(c => ({ claim: c, status: "supported", chunkIds: (p.sources || []).slice(0, 1).map(s => s.id) }));
    return { text: "", json: { claims }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, model: "stand-in" };
  },
};

const personas = await getPersonas();
const aiStore = await aiStoreFor(createMemoryKv());
const kb = await loadKb(null, { fresh: true });
const rows = [];
for (const it of pick) {
  const before = prompts.length;
  const rec = { id: it.id, ticket: it.id, question: it.question, context: it.context || "", theme: it.theme, subtheme: it.subtheme, stage: "Intern" };
  const res = await draftAnswer({ target: { type: "question", id: it.id, rec }, aiStore, provider: standIn, personas, cfg: {}, kb });
  rows.push({ id: it.id, route: it.expect.route, status: res.aiDraft.status, blockedReason: res.aiDraft.blockedReason || "", calls: prompts.slice(before).map(p => p.role) });
}

const env = loadServerEnv();
const key = String(env.GEMINI_API_KEY || "").trim();
let counted = 0;
async function countTokens(p) {
  if (!args["count-tokens"] || !key) return null;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:countTokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ generateContentRequest: { model: "models/gemini-4-argon", systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: "user", parts: [{ text: p.user }] }] } }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    counted++;
    return j.totalTokens || null;
  } catch { return null; }
}
for (const p of prompts) {
  p.chars = p.system.length + p.user.length;
  p.tokens = (await countTokens(p)) ?? Math.ceil(p.chars / 4);
}

const avg = role => {
  const xs = prompts.filter(p => p.role === role).map(p => p.tokens);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
};
const drafted = rows.filter(r => r.calls.includes("draft")).length;
const tokens = { draftIn: avg("draft"), verifyIn: avg("verify"), classifyIn: avg("classify") };

function perAnswer(draftModel, verifyModel, escalateModel) {
  const at = EVENT_DAY;
  const draft = estimateCostUsd(draftModel, tokens.draftIn, ASSUME.draftVisible + ASSUME.draftThinking, { at });
  const verify = estimateCostUsd(verifyModel, tokens.verifyIn, ASSUME.verifyVisible + ASSUME.verifyThinking, { at });
  const esc = escalateModel ? ASSUME.escalateRate * estimateCostUsd(escalateModel, tokens.verifyIn, ASSUME.verifyVisible + ASSUME.verifyThinking, { at }) : 0;
  const emb = estimateCostUsd("gemini-embedding-001", ASSUME.queryEmbedTokens, 0, { at });
  const total = draft + verify + esc + emb;
  return { draft: +draft.toFixed(5), verify: +verify.toFixed(5), escalate: +esc.toFixed(5), embed: +emb.toFixed(6), total: +total.toFixed(5) };
}
const routing = {
  recommended: { models: "gemini-4-argon draft · gemini-3.8-flash verify · 25% re-checked by gemini-4-argon", ...perAnswer("gemini-4-argon", "gemini-3.8-flash", "gemini-4-argon") },
  allPro: { models: "gemini-4-argon draft + verify", ...perAnswer("gemini-4-argon", "gemini-4-argon", null) },
  allFlash: { models: "gemini-3.8-flash draft + verify", ...perAnswer("gemini-3.8-flash", "gemini-3.8-flash", null) },
};

const out = {
  measuredAt: new Date().toISOString(),
  priceDay: EVENT_DAY,
  provider: providerInfo(),
  questions: rows.length,
  drafted,
  blocked: rows.filter(r => r.status === "blocked").map(r => `${r.id}:${r.blockedReason}`),
  medicalRouted: `${rows.filter(r => r.route === "mentor" && r.blockedReason === "medical").length}/${rows.filter(r => r.route === "mentor").length}`,
  tokenSource: counted ? `countTokens (${counted}/${prompts.length} prompts)` : "chars/4 estimate",
  inputTokensAvg: tokens,
  assumptions: ASSUME,
  perAnswerUsd: routing,
};
fs.writeFileSync(path.join(ROOT, "data/kb/cost-model.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, (k, v) => (k === "provider" ? undefined : v), 1));
