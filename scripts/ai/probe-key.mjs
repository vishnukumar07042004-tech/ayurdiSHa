#!/usr/bin/env node
/**
 * Which kind of Google key is this? Tries the Gemini API (AI Studio) and Vertex AI express mode
 * with tiny calls and prints statuses + accessible models. The key is read from env and never printed.
 *   node scripts/ai/probe-key.mjs [ENV_NAME]   (default: VERTEX_API_KEY, then GEMINI_API_KEY)
 */
import { loadServerEnv } from "../../server/env.js";

const env = loadServerEnv();
const name = process.argv[2] || ["VERTEX_API_KEY", "GEMINI_API_KEY"].find(n => env[n]);
const key = String((name && env[name]) || "").trim();
if (!key) { console.log("no key found"); process.exit(1); }
const mask = s => String(s).split(key).join(`${key.slice(0, 3)}****`);
console.log(`key from ${name}: ${key.slice(0, 3)}**** (${key.length} chars)`);

async function call(label, url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    const err = json && json.error ? `${json.error.status || ""} ${String(json.error.message || "").slice(0, 220)}` : "";
    console.log(`${label}: HTTP ${res.status} ${Date.now() - started}ms ${mask(err)}`);
    return { ok: res.ok, json };
  } catch (e) {
    console.log(`${label}: network ${mask(e.message)}`);
    return { ok: false };
  }
}

const tiny = { contents: [{ role: "user", parts: [{ text: "Say OK" }] }], generationConfig: { maxOutputTokens: 16 } };
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });

const list = await call("gemini-api models.list", "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
if (list.ok) {
  const ids = (list.json.models || []).map(m => m.name.replace(/^models\//, "")).filter(n => /gemini|embedding/.test(n));
  console.log(`  ${ids.length} models: ${ids.join(", ")}`);
}
const models = (process.env.PROBE_MODELS || "gemini-4-argon,gemini-3.8-flash,gemini-3.6-flash,gemini-3.6-flash-lite,gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite").split(",");
for (const m of models.slice(0, 2)) {
  await call(`gemini-api generate ${m}`, `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, post(tiny));
}
for (const m of models) {
  await call(`vertex-express generate ${m}`, `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`, post(tiny));
}
for (const m of ["gemini-embedding-001", "text-embedding-005"]) {
  await call(`vertex-express predict ${m}`, `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:predict`,
    post({ instances: [{ content: "AIAPGET eligibility", task_type: "RETRIEVAL_QUERY" }], parameters: { outputDimensionality: 768 } }));
}
await call("gemini-api embed gemini-embedding-001", "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
  post({ content: { parts: [{ text: "AIAPGET eligibility" }] }, outputDimensionality: 768 }));
