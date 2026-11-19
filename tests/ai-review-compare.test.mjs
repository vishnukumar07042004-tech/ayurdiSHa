/**
 * DISHA compare mode on the review desk (Hybrid primary vs Gemini only): both drafts render (model,
 * latency, cost, risk, claim checks, sources, answer / actions / mistake / resources), the primary
 * is the default tab and marked, the per-side buttons send `provider`, Regenerate offers both /
 * Hybrid / Gemini only, a Gemini-fallback Hybrid draft says so, Settings shows the model per step,
 * the evaluation note, spend and stats — a record from before the hybrid switch still renders, and
 * a record without `aiDrafts` keeps the single-draft desk. Real `AiReviewDesk.jsx` bundled with
 * esbuild; `/api/aym-store` is mocked (no network, no store).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".qa");
const entry = path.join(dir, `compare-entry-${process.pid}.jsx`);
const outFile = path.join(dir, `compare-desk-${process.pid}.mjs`);
let mod;

before(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(entry, `export { default as AiReviewDesk, CompareView, hasCompare, topSide, isOverflowItem } from "../src/staff/AiReviewDesk.jsx";\n`);
  await build({
    entryPoints: [entry], bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react-dom/server", "react/jsx-runtime"],
    jsx: "automatic", loader: { ".css": "empty" },
  });
  mod = await import(pathToFileURL(outFile).href);
});

after(() => {
  for (const f of [entry, outFile]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
});

const H = "hybrid";
const side = (provider, over = {}) => {
  const h = provider === H;
  return {
    provider,
    label: h ? "Hybrid (GPT draft + Gemini check)" : provider === "openai" ? "GPT" : "Gemini only",
    status: "pending",
    answer: h ? "Hybrid answer: read the AIAPGET bulletin first [c:s2]." : "Gemini answer: start from the NCISM notice [c:s1].",
    actions: [h ? "Hybrid step one" : "Gemini step one"],
    mistake: h ? "Hybrid mistake to avoid" : "Gemini mistake to avoid",
    resources: [{ title: h ? "Hybrid resource" : "Gemini resource", url: "https://ncism.gov.in/" }],
    citations: [{ chunkId: h ? "s2" : "s1", title: h ? "AIAPGET 2026 bulletin" : "NCISM notice", url: "https://ncism.gov.in/x", valid: true }],
    claimChecks: [{ claim: h ? "Hybrid claim checked" : "Gemini claim checked", status: "supported", chunkIds: [h ? "s2" : "s1"] }],
    confidence: h ? 0.81 : 0.74,
    risk: h ? "low" : "medium",
    mode: "grounded",
    verifyFlags: [],
    model: h ? "gpt-5.4" : "gemini-4-argon",
    verifyModel: "gemini-3.8-flash",
    latencyMs: h ? 4200 : 3100,
    usage: { costUSD: h ? 0.0123 : 0.0045, inputTokens: 1, outputTokens: 1, calls: 2, models: [] },
    createdAt: 1,
    ...over,
  };
};

const compareItem = (over = {}) => ({
  id: "q:CMP1", targetType: "question", targetId: "CMP1", ticket: "AYM-Q-CMP1", theme: "PG entrance", subtheme: "AIAPGET",
  stream: "pg-entrance", question: "How should I prepare for AIAPGET?", members: [], memberCount: 1, createdAt: Date.now(), meta: {}, history: [],
  aiDraft: { ...side(H), persona: "pg", drafter: H },
  aiDrafts: { hybrid: side(H), gemini: side("gemini") },
  ...over,
});

async function staticHtml(item, props = {}) {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const noop = () => {};
  return renderToStaticMarkup(createElement(mod.CompareView, { item, busy: false, canApprove: true, canEdit: true, onApprove: noop, onEdit: noop, onRegenerate: noop, ...props }));
}

test("CompareView renders a labelled Hybrid (primary) and Gemini-only section with every field", async () => {
  const html = await staticHtml(compareItem());
  assert.match(html, /aria-label="Hybrid draft"/);
  assert.match(html, /aria-label="Gemini only draft"/);
  for (const s of ["Hybrid (GPT draft + Gemini check)", "primary", "gemini-4-argon", "gpt-5.4 · checked by gemini-3.8-flash", "4.2 s", "3.1 s", "$0.0123", "$0.0045", "Low risk · 81% confidence", "Medium risk · 74% confidence",
    "Hybrid claim checked", "Gemini claim checked", "AIAPGET 2026 bulletin", "NCISM notice", "Hybrid answer: read the AIAPGET bulletin first", "Hybrid step one", "Hybrid mistake to avoid", "Hybrid resource",
    "Approve this (Hybrid)", "Approve this (Gemini only)", "Edit then send (Hybrid)", "Edit then send (Gemini only)"]) {
    assert.ok(html.includes(s), `missing ${s}`);
  }
  assert.match(html, /aria-selected="true"[^>]*>Hybrid</, "the primary is the default tab");
  assert.ok(!html.includes("[c:s2]"), "citation marks become numbered buttons");
  assert.ok(!html.includes("Gemini wrote it (fallback)"));
  const fb = await staticHtml(compareItem({ aiDrafts: { hybrid: side(H, { draftFallback: { from: "openai", to: "gemini", reason: "GPT draft failed (timeout)" } }), gemini: side("gemini") } }));
  assert.ok(fb.includes("GPT did not draft this one — Gemini wrote it (fallback)."));
});

test("CompareView: Hybrid error variant, missing side, read-only, and a record from before the hybrid switch", async () => {
  const failed = await staticHtml(compareItem({ aiDrafts: { gemini: side("gemini"), hybrid: { provider: H, status: "error", error: "OpenAI rate limit", answer: "", claimChecks: [], citations: [], latencyMs: 900, usage: {} } } }));
  assert.match(failed, /Hybrid draft failed — Regenerate/);
  assert.match(failed, /OpenAI rate limit/);
  assert.match(failed, /Regenerate Hybrid/);
  assert.ok(!failed.includes("Approve this (Hybrid)"));
  assert.ok(failed.includes("Approve this (Gemini only)"));
  const missing = await staticHtml(compareItem({ aiDrafts: { hybrid: side(H) } }));
  assert.match(missing, /No Gemini only draft for this question yet/);
  const ro = await staticHtml(compareItem(), { canApprove: false, canEdit: false });
  assert.ok(!ro.includes("Approve this"));
  assert.equal(mod.hasCompare(compareItem()), true);
  assert.equal(mod.hasCompare({ aiDraft: side(H) }), false);

  // Gemini primary + GPT compare side, stored before the switch: GPT letter appears on the Hybrid card (not "no draft yet").
  const gptLetter = "GPT answer: start from the NTA bulletin [c:s3].";
  const legacy = compareItem({
    aiDraft: { ...side("gemini"), persona: "pg" },
    aiDrafts: { gemini: side("gemini"), openai: side("openai", { answer: gptLetter, model: "gpt-5.5", verifyModel: "gpt-5.4-mini", usage: { costUSD: 0.02 } }) },
  });
  assert.equal(mod.topSide(legacy), "gemini");
  assert.equal(mod.hasCompare(legacy), true);
  const old = await staticHtml(legacy);
  assert.ok(old.includes("Approve this (Hybrid)"), "legacy GPT draft fills the Hybrid card");
  assert.ok(old.includes("GPT answer: start from the NTA bulletin"), "GPT letter is visible");
  assert.ok(old.includes("gpt-5.5"), "GPT model name is visible");
  assert.ok(!old.includes("No Hybrid draft for this question yet"));
  assert.ok(!old.includes("Draft with Hybrid"));
  assert.ok(old.includes("Approve this (Gemini only)"));
  const pending = await staticHtml(compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: { gemini: side("gemini") },
    regenerating: true,
    job: { status: "queued", only: H },
  }));
  assert.match(pending, /Hybrid draft continues in the next run/);
  assert.ok(!pending.includes("Draft with Hybrid"));
  // No `aiDrafts.hybrid`, but `aiDraft` came from Hybrid: it stands in for its own side.
  const top = await staticHtml(compareItem({ aiDrafts: { gemini: side("gemini") } }));
  assert.ok(top.includes("Approve this (Hybrid)"));

  // Gemini letter only — Hybrid was never stored. The card shows an error, not "no draft yet".
  const onlyGem = compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: { gemini: side("gemini") },
  });
  const gap = await staticHtml(onlyGem);
  assert.match(gap, /Hybrid draft (was not saved|failed)/);
  assert.match(gap, /OPENAI_API_KEY/);
  assert.ok(!gap.includes("No Hybrid draft for this question yet"));
  assert.ok(gap.includes("Approve this (Gemini only)"));
  assert.ok(!gap.includes("Approve this (Hybrid)"));
  assert.ok(gap.includes("Regenerate Hybrid"));

  // GPT letter left on aiDraft (model gpt-*) with no aiDrafts.hybrid: it fills the Hybrid card.
  const gptOnPrimary = "GPT answer stored on the primary draft [c:s3].";
  const stamped = compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "", provider: "openai", model: "gpt-5.4", answer: gptOnPrimary },
    aiDrafts: { gemini: side("gemini") },
  });
  assert.equal(mod.topSide(stamped), "hybrid");
  const shown = await staticHtml(stamped);
  assert.ok(shown.includes("GPT answer stored on the primary draft"));
  assert.ok(!shown.includes("Hybrid draft was not saved"));
  assert.ok(!shown.includes("No Hybrid draft for this question yet"));

  // Empty Hybrid shell must not paint a blank letter over a stored GPT (`openai`) draft.
  const shelled = compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: {
      hybrid: { provider: H, status: "pending", answer: "", actions: [], mistake: "", citations: [], claimChecks: [] },
      openai: side("openai", { answer: "GPT answer kept on the openai side [c:s3].", model: "gpt-5.4" }),
      gemini: side("gemini"),
    },
  });
  const shellHtml = await staticHtml(shelled);
  assert.ok(shellHtml.includes("GPT answer kept on the openai side"), "empty Hybrid shell still shows the GPT letter");
  assert.ok(!shellHtml.includes("Hybrid draft was not saved"));
  assert.ok(shellHtml.includes("Approve this (Hybrid)"));

  // Empty Hybrid shell and no GPT letter: a visible error, not a blank card. Gemini stays approvable.
  const blank = await staticHtml(compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: {
      hybrid: { provider: H, status: "pending", answer: "", actions: [], mistake: "", citations: [], claimChecks: [] },
      gemini: side("gemini"),
    },
  }));
  assert.match(blank, /Hybrid draft (was not saved|failed)/);
  assert.match(blank, /OPENAI_API_KEY/);
  assert.ok(blank.includes("Approve this (Gemini only)"));
  assert.ok(!blank.includes("Approve this (Hybrid)"));

  // GPT letter stored on `letter` (not `answer`) still fills the Hybrid card.
  const altField = "GPT letter lived on the letter field, not answer.";
  const alt = await staticHtml(compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: {
      hybrid: { provider: H, status: "pending", answer: "", letter: altField, actions: [], mistake: "", citations: [], claimChecks: [] },
      gemini: side("gemini"),
    },
  }));
  assert.ok(alt.includes(altField), "GPT text on letter field is visible");
  assert.ok(!alt.includes("Hybrid draft was not saved"));
  assert.ok(alt.includes("Approve this (Hybrid)"));

  // Error status must not hide a GPT letter that was already stored.
  const both = await staticHtml(compareItem({
    aiDraft: { ...side("gemini"), persona: "pg", drafter: "gemini" },
    aiDrafts: {
      hybrid: { provider: H, status: "error", error: "OpenAI rate limit", answer: "Partial GPT letter after the quota hit.", actions: [], mistake: "", citations: [], claimChecks: [] },
      gemini: side("gemini"),
    },
  }));
  assert.ok(both.includes("Partial GPT letter after the quota hit."));
  assert.match(both, /Hybrid draft failed/);
  assert.ok(both.includes("OpenAI rate limit"));
});

test("overflow items are not blank Hybrid/Gemini compare cards", async () => {
  const item = {
    id: "q:OV", overflow: true, quotaDeferred: true,
    aiDraft: { status: "awaiting_ai", answer: "", citations: [], claimChecks: [], blockedNote: "Waiting for AI / quota — retry after recharge." },
    aiDrafts: {},
  };
  assert.equal(mod.isOverflowItem(item), true);
  assert.equal(mod.hasCompare(item), false);
  const html = await staticHtml(item);
  assert.match(html, /queued because of an AI limit/);
  assert.ok(!html.includes("Approve this (Hybrid)"));
});

/* ---------------------------------------------------------------- full desk in happy-dom */

let Window = null;
try { ({ Window } = await import("happy-dom")); } catch { Window = null; }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); }
  return null;
}

/** One DOM for the whole file (its own test process): the desk's flash timers outlive each render. */
let dom = null;
function setupDom() {
  if (dom) { dom.document.body.innerHTML = ""; return { win: dom, restore() {} }; }
  const win = new Window({ url: "http://localhost/staff/ai", width: 1440, height: 900 });
  for (const k of ["window", "document", "localStorage", "sessionStorage", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    if (k in win) Object.defineProperty(globalThis, k, { value: typeof win[k] === "function" && /^[a-z]/.test(k) ? win[k].bind(win) : win[k], configurable: true, writable: true });
  }
  win.HTMLElement.prototype.scrollIntoView = function () {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  dom = win;
  return { win, restore() {} };
}

function mockApi(items, calls) {
  const config = { enabled: true, shadowMode: false, primary: H, compareMode: true, providers: [H, "gemini"], dailySpendCapUSD: 10, streams: { "pg-entrance": true } };
  const info = () => ({
    ok: true, config: { ...config }, streams: [{ id: "pg-entrance", label: "PG entrance" }], personaSource: "test",
    provider: { configured: true, id: "gemini", label: "Gemini API", draftModel: "gemini-4-argon", verifyModel: "gemini-3.8-flash" },
    pipeline: { primary: H, label: "Hybrid (GPT draft + Gemini check)", steps: [
      { step: "classify", provider: "rules", label: "Rules first, then Gemini API", model: "gemini-3.5-flash-lite" },
      { step: "draft", provider: "openai", label: "GPT (OpenAI)", model: "gpt-5.4", fallback: { provider: "gemini", label: "Gemini API", model: "gemini-4-argon" } },
      { step: "verify", provider: "gemini", label: "Gemini API", model: "gemini-3.8-flash" },
      { step: "escalate", provider: "gemini", label: "Gemini API", model: "gemini-4-argon" },
    ] },
    compareProviders: [
      { side: H, label: "Hybrid (GPT draft + Gemini check)", configured: true, draftModel: "gpt-5.4", verifyModel: "gemini-3.8-flash" },
      { side: "gemini", label: "Gemini only", configured: true, draftModel: "gemini-4-argon", verifyModel: "gemini-3.8-flash" },
    ],
    kb: { chunks: 10, source: "test" }, allowList: { loaded: true, domains: 3 },
    today: { day: "2026-11-09", costUSD: 0.5, calls: 4, byProvider: { gemini: { costUSD: 0.2 }, openai: { costUSD: 0.3 } } },
  });
  return async (url, init = {}) => {
    const msg = JSON.parse(init.body || "{}");
    calls.push(msg);
    let body = { ok: true };
    if (msg.op === "aiQueue") body = { ok: true, items, total: items.length, counts: { pending: items.length }, working: [], failed: [] };
    else if (msg.op === "aiConfigGet") body = info();
    else if (msg.op === "aiConfigSet") { Object.assign(config, msg.patch || {}); body = { ...info(), promoted: 0 }; }
    else if (msg.op === "aiCompareStats") {
      body = { ok: true, compareMode: config.compareMode, compare: { compared: 3, reviewed: 2, rejected: 1, toMentor: 0, providers: [
        { provider: H, label: "Hybrid (GPT draft + Gemini check)", drafts: 3, errors: 0, blocked: 0, chosen: 2, approvedAsIs: 1, edited: 1, chosenRate: 1, avgEditRatio: 0.05, avgLatencyMs: 4500, avgCostUSD: 0.03, supportRate: 0.86, avgConfidence: 0.8, risk: {} },
        { provider: "gemini", label: "Gemini only", drafts: 3, errors: 1, blocked: 0, chosen: 0, approvedAsIs: 0, edited: 0, chosenRate: 0, avgEditRatio: null, avgLatencyMs: 3000, avgCostUSD: 0.046, supportRate: 0.45, avgConfidence: 0.7, risk: {} },
      ] } };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

async function renderDesk(items) {
  const { win, restore } = setupDom();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockApi(items, calls);
  const { createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const r = createRoot(container);
  r.render(createElement(mod.AiReviewDesk));
  const btn = label => [...container.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") || b.textContent).trim() === label || b.textContent.trim() === label);
  return {
    container, calls, btn,
    async cleanup() { r.unmount(); await sleep(10); globalThis.fetch = realFetch; restore(); },
  };
}

const lastOp = (calls, op) => [...calls].reverse().find(c => c.op === op);

test("desk wiring: per-side Approve / Edit send provider, Regenerate menu, Settings models + compare panel", { skip: !Window && "happy-dom not installed (npm install --no-save happy-dom)" }, async () => {
  const d = await renderDesk([compareItem()]);
  try {
    assert.ok(await until(() => d.btn("Approve this (Hybrid)")), "Hybrid approve button rendered");
    assert.ok(d.container.textContent.includes("Gemini answer: start from the NCISM notice"));
    assert.ok(d.container.textContent.includes("Compare · Hybrid vs Gemini only"));
    assert.ok(!d.btn("Approve and send"), "single-draft approve hidden in compare mode");

    d.btn("Approve this (Hybrid)").click();
    assert.ok(await until(() => lastOp(d.calls, "aiApprove")));
    assert.deepEqual({ op: lastOp(d.calls, "aiApprove").op, id: lastOp(d.calls, "aiApprove").id, provider: lastOp(d.calls, "aiApprove").provider }, { op: "aiApprove", id: "q:CMP1", provider: H });

    assert.ok(await until(() => d.btn("Approve this (Gemini only)") && !d.btn("Approve this (Gemini only)").disabled));
    d.btn("Approve this (Gemini only)").click();
    assert.ok(await until(() => d.calls.filter(c => c.op === "aiApprove").length === 2));
    assert.equal(lastOp(d.calls, "aiApprove").provider, "gemini");

    assert.ok(await until(() => d.btn("Edit then send (Gemini only)") && !d.btn("Edit then send (Gemini only)").disabled));
    d.btn("Edit then send (Gemini only)").click();
    const ta = await until(() => d.container.querySelector(".air-edit textarea"));
    assert.ok(ta, "editor opened");
    assert.match(ta.value, /^Gemini answer: start from the NCISM notice/);
    assert.ok(d.container.textContent.includes("Editing the Gemini only draft."));
    d.btn("Save and send to student").click();
    assert.ok(await until(() => lastOp(d.calls, "aiEditApprove")));
    assert.equal(lastOp(d.calls, "aiEditApprove").provider, "gemini");
    assert.match(lastOp(d.calls, "aiEditApprove").answer, /^Gemini answer/);

    assert.ok(await until(() => d.btn("RegenerateG") && !d.btn("RegenerateG").disabled));
    for (const [label, provider] of [["Hybrid draft", H], ["Gemini-only draft", "gemini"], ["Both", undefined]]) {
      const n = d.calls.filter(c => c.op === "aiRegenerate").length;
      assert.ok(await until(() => d.btn("RegenerateG") && !d.btn("RegenerateG").disabled));
      d.btn("RegenerateG").click();
      const item = await until(() => d.btn(label));
      assert.ok(item, `menu item ${label}`);
      item.click();
      assert.ok(await until(() => d.calls.filter(c => c.op === "aiRegenerate").length === n + 1));
      assert.equal(lastOp(d.calls, "aiRegenerate").provider, provider);
    }
    assert.ok(d.btn("RejectR") && d.btn("Send to mentorM"), "shared Reject / Send to mentor");

    d.btn("Settings").click();
    assert.ok(await until(() => d.container.textContent.includes("Comparison stats") && d.container.querySelector(".air-compare-stats")), "stats table");
    const text = d.container.textContent;
    for (const s of ["Primary: Hybrid (GPT draft + Gemini check)", "ClassifyRules first, then Gemini API · gemini-3.5-flash-lite",
      "DraftGPT (OpenAI) · gpt-5.4 (if GPT fails or is late: Gemini API · gemini-4-argon)", "Check claimsGemini API · gemini-3.8-flash",
      "Compare mode (Hybrid vs Gemini only)", "Compare mode for evaluation; turn off after review.", "gpt-5.4 · checked by gemini-3.8-flash",
      "Spend today: GPT $0.300 · Gemini $0.200", "3 compared", "86%"]) assert.ok(text.includes(s), `settings missing ${s}`);
    const toggle = [...d.container.querySelectorAll(".air-compare-settings input[type=checkbox]")][0];
    toggle.click();
    assert.ok(await until(() => lastOp(d.calls, "aiConfigSet")));
    assert.deepEqual(lastOp(d.calls, "aiConfigSet").patch, { compareMode: false });
  } finally {
    await d.cleanup();
  }
});

test("desk without compare data keeps the single-draft view", { skip: !Window && "happy-dom not installed" }, async () => {
  const plain = compareItem();
  delete plain.aiDrafts;
  const d = await renderDesk([plain]);
  try {
    assert.ok(await until(() => d.btn("Approve and sendA")), "single approve button");
    assert.ok(!d.container.querySelector(".air-compare"));
    assert.ok(!d.btn("Approve this (Hybrid)"));
    d.btn("Approve and sendA").click();
    assert.ok(await until(() => lastOp(d.calls, "aiApprove")));
    assert.equal("provider" in lastOp(d.calls, "aiApprove"), false);
    assert.ok(await until(() => d.btn("RegenerateG") && !d.btn("RegenerateG").disabled));
    d.btn("RegenerateG").click();
    assert.ok(await until(() => lastOp(d.calls, "aiRegenerate")));
    assert.equal("provider" in lastOp(d.calls, "aiRegenerate"), false);
    assert.ok(!d.container.querySelector(".air-regen-menu"));
  } finally {
    await d.cleanup();
  }
});
