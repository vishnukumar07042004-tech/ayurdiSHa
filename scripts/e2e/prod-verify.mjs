#!/usr/bin/env node
/**
 * Read-only production verification (headless Chrome over CDP, no npm deps):
 *   - server refuses a delete on a dummy non-existent question key; AI flag + provider test
 *   - welcome deck: first visit shows it, a tap advances, the last slide shows only "Enter AYURDISHA",
 *     Enter lands on Home, a returning visit skips it
 *   - Ask Desk triage hint (unlocked with a local-only fake session; nothing is submitted)
 *   - staff views (a probe co-admin approved with the service token, revoked + purged afterwards) →
 *     #curate and #ai render without console errors and without demo controls
 *
 *   node scripts/e2e/prod-verify.mjs [--base=https://ayushmarg.vercel.app] [--no-provider-test]
 * Writes docs/design/audit/prod-verify.json (+ public-page screenshots). The service token
 * (AYM_SERVICE_TOKEN / STAFF_SERVICE_TOKEN) is never printed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceHeaders, hasServiceToken, NO_TOKEN_HELP } from "../lib/staffAuth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/design/audit/prod-verify");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9341;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT_DIR, { recursive: true });
// Inside the workspace: sandboxed runs cannot write to the OS temp dir.
fs.mkdirSync(path.join(ROOT, ".qa"), { recursive: true });
const PROFILE_DIR = fs.mkdtempSync(path.join(ROOT, ".qa", "chrome-pv-"));

if (!hasServiceToken()) { console.error(NO_TOKEN_HELP); process.exit(2); }
const AUTH = serviceHeaders();
const PROBE_STAFF = `aym-probe+verify-${Date.now().toString(36)}@ayurdisha-qa.test`;
const results = [];
const check = (name, ok, detail = {}) => {
  results.push({ name, ok: Boolean(ok), ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail.note ? ` — ${detail.note}` : ""}`);
};

/* ---------------- HTTP checks ---------------- */
async function call(op, body = {}) {
  const r = await fetch(`${BASE}/api/aym-store`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH },
    body: JSON.stringify({ op, ...body }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

const login = await call("whoami");
check("staff auth (service token)", login.status === 200 && login.data.staff === true && login.data.role === "admin", { status: login.status });
const del = await call("del", { key: "aym:q:__prod_verify_nonexistent__" });
check("server refuses delete of a question key in production", del.status === 403 && /disabled in production/i.test(del.data.error || ""), { status: del.status, note: del.data.error });
const cfg = await call("aiConfigGet");
const c = cfg.data.config || {};
check("AI config readable", cfg.status === 200, { enabled: c.enabled, shadowMode: c.shadowMode, cap: c.dailySpendCapUSD, provider: cfg.data.provider && { id: cfg.data.provider.id, configured: cfg.data.provider.configured, draftModel: cfg.data.provider.draftModel }, kb: cfg.data.kb, note: `enabled=${c.enabled} shadowMode=${c.shadowMode}` });
if (!args["no-provider-test"]) {
  const t = await call("aiProviderTest");
  const tt = t.data.test || {};
  check("provider Test connection", t.status === 200 && tt.ok === true, { chat: tt.chat, embed: tt.embed && { ok: tt.embed.ok, dimensions: tt.embed.dimensions } });
}

/* ---------------- Browser checks ---------------- */
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--no-first-run", "--no-default-browser-check",
  "--hide-scrollbars", `--user-data-dir=${PROFILE_DIR}`, "about:blank",
], { stdio: "ignore" });

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const pg = list.find(t => t.type === "page");
      if (pg) return pg.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await targetWs());
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const consoleErrors = [];
let phase = "boot";
ws.addEventListener("message", ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push({ phase, kind: "exception", text: String(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 300) });
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push({ phase, kind: "console.error", text: msg.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300) });
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push({ phase, kind: "log", text: `${msg.params.entry.text} ${msg.params.entry.url || ""}`.slice(0, 300) });
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expression, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await evaluate(expression)) return true; } catch { /* navigating */ }
    await sleep(200);
  }
  return false;
};
const go = async url => { await send("Page.navigate", { url }); await sleep(600); await waitFor("document.readyState === 'complete'"); };
const shot = async file => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(data, "base64"));
};
const errorsIn = p => consoleErrors.filter(e => e.phase === p);

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

try {
  /* Welcome deck — first visit */
  phase = "welcome";
  await go(`${BASE}/`);
  const deck = await waitFor("!!document.querySelector('.wl2 .wl2-slide.is-active')", 15000);
  const firstUrl = await evaluate("location.pathname + location.hash");
  check("first visit shows the welcome deck", deck, { url: firstUrl });
  if (deck) {
    await sleep(1200);
    await shot("welcome-1.png");
    const slide = () => evaluate("document.querySelector('.wl2-slide.is-active')?.getAttribute('aria-label') || ''");
    const before = await slide();
    const count = Number((before.match(/of (\d+)/) || [])[1] || 0);
    // A tap on the right half of the stage.
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: 1000, y: 420, button: "left", clickCount: 1, pointerType: "mouse" });
      await sleep(60);
    }
    await sleep(900);
    const after = await slide();
    check("a tap advances the deck", before !== after && /^2 of/.test(after), { before, after });
    for (let i = 0; i < count + 2; i++) {
      if (await evaluate("document.querySelector('.wl2')?.classList.contains('is-last')")) break;
      await evaluate("document.querySelector('[data-slide-next]')?.click()");
      await sleep(900);
    }
    await sleep(1500);
    const lastInfo = await evaluate(`(() => {
      const vis = el => el && !el.hidden && el.offsetParent !== null && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden';
      const btns = [...document.querySelectorAll('.wl2 button')].filter(vis)
        .filter(b => !b.classList.contains('wl2-seg') && b.getAttribute('aria-label') !== 'Previous slide')
        .map(b => (b.getAttribute('aria-label') || b.textContent).trim());
      return { slide: document.querySelector('.wl2-slide.is-active')?.getAttribute('aria-label'), buttons: btns };
    })()`);
    await shot("welcome-last.png");
    check("last slide shows only “Enter AYURDISHA”", lastInfo.buttons.length === 1 && /Enter AYURDISHA/.test(lastInfo.buttons[0]), lastInfo);
    await evaluate("document.querySelector('.wl2-enter')?.click()");
    const home = await waitFor("!document.querySelector('.wl2') && location.pathname === '/'", 8000);
    await sleep(1200);
    check("Enter lands on Home", home, { url: await evaluate("location.pathname + location.hash") });
    await shot("home-after-enter.png");
    await go(`${BASE}/`);
    await sleep(2500);
    const again = await evaluate("!!document.querySelector('.wl2')");
    check("returning visit skips the deck", !again, { url: await evaluate("location.pathname + location.hash") });
  }
  check("no console errors on welcome / home", errorsIn("welcome").length === 0, { errors: errorsIn("welcome") });

  /* Ask Desk triage hint — local-only fake session so the form unlocks; nothing is sent */
  phase = "ask";
  await evaluate(`localStorage.setItem('aym-delegate-session', JSON.stringify({ token: 'prod-verify-local-only', profile: { name: 'Verify Bot', email: 'verify@example.invalid', regNo: '11WAC/2026/0000' } }))`);
  await go(`${BASE}/#ask`);
  const ta = await waitFor("!!document.querySelector('textarea[maxlength=\"500\"]:not([disabled])')", 12000);
  if (ta) {
    await evaluate(`(() => {
      const el = document.querySelector('textarea[maxlength="500"]');
      el.scrollIntoView({ block: 'center' });
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'What dose of ashwagandha should I give my mother for her diabetes?');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const hint = await waitFor("!!document.querySelector('.trg-hint')", 4000);
    const text = hint ? await evaluate("document.querySelector('.trg-hint').innerText.slice(0, 160)") : "";
    await shot("ask-hint.png");
    check("Ask Desk triage hint appears for a treatment question", hint, { note: text.slice(0, 80) });
  } else {
    check("Ask Desk triage hint appears for a treatment question", false, { note: "question box stayed locked" });
  }
  await evaluate("localStorage.removeItem('aym-delegate-session')");
  check("no console errors on Ask", errorsIn("ask").filter(e => !/regMe|403/.test(e.text)).length === 0, { errors: errorsIn("ask") });

  /* Staff views */
  phase = "staff";
  const probe = await call("testProbeStaffRequest", { email: PROBE_STAFF, session: true });
  const approved = probe.status === 200 && (await call("staffDecide", { email: PROBE_STAFF, decision: "approve" })).status === 200;
  const pair = String(probe.data.cookie || "");
  if (pair) await evaluate(`document.cookie = ${JSON.stringify(`${pair}; path=/; SameSite=Lax${BASE.startsWith("https") ? "; Secure" : ""}`)}`);
  const st = await evaluate(`fetch('/api/aym-store', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'whoami' }) }).then(r => r.json()).then(b => b.staff === true)`);
  check("staff session in the browser (probe co-admin approved with the service token)", approved && st === true, { status: probe.status });
  for (const [hash, label] of [["#curate", "Curation Desk"], ["#ai", "AI drafts"], ["#insights", "Insights"], ["#pack", "Mentor Pack"]]) {
    phase = `staff${hash}`;
    await go(`${BASE}/${hash}`);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(label)})`, 15000);
    await sleep(3500);
    const info = await evaluate(`(() => {
      const t = document.body.innerText;
      return {
        rendered: t.includes(${JSON.stringify(label)}),
        boundary: /hit a problem|We couldn't load this content/.test(t),
        demo: /Demo controls|Clear all data|Add 22 sample questions/.test(t),
        signInWall: /Staff access required/.test(t),
        triageFilter: !!document.querySelector('[class*="trg-filter"], [aria-label*="triage" i]'),
        triagePanels: document.querySelectorAll('.trg-panel').length,
      };
    })()`);
    check(`${hash} renders as staff without errors or demo controls`, info.rendered && !info.boundary && !info.demo && !info.signInWall && errorsIn(phase).length === 0, { ...info, errors: errorsIn(phase) });
  }
  await evaluate("fetch('/api/aym-store', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'logout' }) })");
} finally {
  ws.close();
  chrome.kill("SIGKILL");
  await call("staffDecide", { email: PROBE_STAFF, decision: "revoke" }).catch(() => {});
  const purge = await call("testProbeStaffPurge", {}).catch(() => ({ status: 0, data: {} }));
  check("probe co-admin revoked and purged", purge.status === 200 && (purge.data.removed || []).includes(PROBE_STAFF), { status: purge.status });
}

const summary = { base: BASE, at: new Date().toISOString(), passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results, consoleErrors };
fs.writeFileSync(path.join(ROOT, "docs/design/audit/prod-verify.json"), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed → docs/design/audit/prod-verify.json`);
process.exit(summary.failed ? 1 : 0);
