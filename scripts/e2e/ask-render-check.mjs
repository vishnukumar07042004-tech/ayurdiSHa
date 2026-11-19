#!/usr/bin/env node
/**
 * Browser-free render check of the real Ask Desk form (`AskView` from src/App.jsx): bundles it
 * with esbuild, renders it with React DOM in happy-dom, fills the form like a student, presses
 * Send and talks to the real API handler on an isolated file store (mock AI, console mail).
 *
 *   npm install --no-save happy-dom        # once; not a project dependency
 *   node scripts/e2e/ask-render-check.mjs
 *   node scripts/e2e/ask-render-check.mjs --simulate-hooks-bug   # puts back the 2026-10-30 hook
 *                                                                # placement: must FAIL
 *
 * Checks: success screen + ticket after Send (no React hook error), the question lands on the
 * server with stage / state / source=qr, an AI job is queued, a network failure keeps the typed
 * question and shows a specific message, and the resend after it reuses the same ticket.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const simulateBug = process.argv.includes("--simulate-hooks-bug");

let Window;
try { ({ Window } = await import("happy-dom")); }
catch {
  console.log("SKIP  happy-dom is not installed (npm install --no-save happy-dom).");
  process.exit(0);
}

const storeFile = path.join(os.tmpdir(), `aym-ask-render-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1",
  AI_PROVIDER: "mock", AI_MOCK_MODE: "ok", NODE_ENV: "test",
});
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
const { useLocalStaffSecrets, signInStaff } = await import("../lib/localStaff.mjs");
const staffSecrets = useLocalStaffSecrets();

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
const reactErrors = [];
console.log = (...a) => {
  const m = a.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (/\[aym-|\[ask\]/.test(a.join(" "))) return;
  realLog(...a);
};
console.error = (...a) => {
  const line = a.map(x => (x && x.message) || String(x)).join(" ");
  if (/Rendered (fewer|more) hooks|change in the order of Hooks/i.test(line)) reactErrors.push(line.slice(0, 200));
  if (/\[aym-|\[ask\]|change in the order of Hooks/.test(line)) return;
  realErr(...a);
};
console.warn = () => {};

const { aymStoreHandler } = await import("../../server/storePlugin.js");

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
  res.statusCode = 404; res.end();
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;

function jarClient() {
  const jar = new Map();
  const fetchWithJar = async (url, init = {}) => {
    const r = await realFetch(url.startsWith("http") ? url : base + url, {
      ...init, headers: { ...(init.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    return r;
  };
  const call = async (op, payload = {}) => {
    const r = await fetchWithJar("/api/aym-store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...payload }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { call, fetchWithJar };
}

const results = [];
async function step(name, fn) {
  try { const note = await fn(); results.push(true); realLog(`  PASS  ${name}${note ? ` — ${note}` : ""}`); }
  catch (e) { results.push(false); realLog(`  FAIL  ${name} — ${String(e && e.message || e).slice(0, 400)}`); }
}
const check = (c, m) => { if (!c) throw new Error(m); };
const db = () => JSON.parse(fs.readFileSync(storeFile, "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- bundle AskView */

const { build } = await import("esbuild");
// Inside the project so the bundle's bare `react` imports resolve to the same copy we render with.
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const outFile = path.join(root, ".qa", `askview-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(root, "src/App.jsx")],
  bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-router", "react-router-dom"],
  // Production flags: the live site must never fall back to browser-only storage.
  jsx: "automatic", define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false, MODE: "production" }) },
  loader: { ".css": "empty", ".png": "empty", ".webp": "empty", ".jpg": "empty", ".svg": "empty" },
  plugins: [{
    name: "expose-askview",
    setup(b) {
      b.onLoad({ filter: /src[\\/]App\.jsx$/ }, args => {
        let code = fs.readFileSync(args.path, "utf8");
        if (simulateBug) {
          code = code.replace("  const [askExample] = useState(() => pickAskExample());\n", "")
            .replace("  const locked = !profile;\n", "  const locked = !profile;\n  const [askExample] = useState(() => pickAskExample());\n");
        }
        return { contents: `${code}\nexport { AskView as __AskView };\n`, loader: "jsx" };
      });
    },
  }],
});

/* ---------------------------------------------------------------- DOM */

const win = new Window({ url: "http://localhost/#ask" });
for (const k of Object.getOwnPropertyNames(win)) {
  if (k in globalThis || k === "undefined") continue;
  try { globalThis[k] = win[k]; } catch { /* read-only */ }
}
Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, sessionStorage: win.sessionStorage, HTMLElement: win.HTMLElement, Node: win.Node, Event: win.Event });
try { Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true }); } catch { /* keep node's */ }
win.scrollTo = () => {};
globalThis.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const student = jarClient();
let failNext = 0;
globalThis.fetch = async (url, init) => {
  if (failNext > 0) { failNext -= 1; throw new TypeError("Failed to fetch"); }
  return student.fetchWithJar(String(url), init);
};
win.fetch = globalThis.fetch;

const { __AskView: AskView } = await import(pathToFileURL(outFile).href);
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");

/* ---------------------------------------------------------------- helpers */

function setValue(el, value) {
  const proto = el.tagName === "SELECT" ? win.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new win.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}
function fieldByLabel(container, text) {
  const label = [...container.querySelectorAll(".aym-field")].find(l => l.querySelector("label").textContent.includes(text));
  check(label, `field "${text}" on the form`);
  const el = label.querySelector("select, textarea, input");
  check(el, `control for "${text}"`);
  return el;
}
async function until(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
  return null;
}

/* ---------------------------------------------------------------- run */

realLog(`Ask Desk render check${simulateBug ? " (simulating the hook bug — expect FAIL)" : ""}\n`);

const email = "render.check@ayurdisha-qa.test";
let profile;
await step("Register through the API (OTP from the dev mail log)", async () => {
  eq((await student.call("regStart", { name: "Render Check", age: 24, sex: "Female", institute: "QA Ayurveda College", email })).status, 200, "regStart");
  const ok = await student.call("regVerify", { email, otp: otpLog.get(email), source: "qr" });
  eq(ok.status, 200, "regVerify");
  profile = ok.body.profile;
  win.localStorage.setItem("aym-delegate-session", JSON.stringify({ token: ok.body.token, profile }));
  win.sessionStorage.setItem("aym-src", "qr");
  return profile.regNo;
});
function eq(a, b, m) { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

await step("AI drafting on (all streams, shadow off) so the submit enqueues a job", async () => {
  const staff = jarClient();
  const login = await signInStaff(staff.call, { passcode: staffSecrets.passcode, email: staffSecrets.admin, otpFor: e => otpLog.get(e) });
  check(login.ok, `staff sign-in: ${login.error}`);
  const streams = Object.fromEntries((await staff.call("aiConfigGet")).body.streams.map(s => [s.id, true]));
  eq((await staff.call("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams } })).status, 200, "aiConfigSet");
});

const container = win.document.createElement("div");
win.document.body.appendChild(container);
let saved = null;
const root_ = createRoot(container, {
  onUncaughtError: e => reactErrors.push(String(e && e.message || e).slice(0, 200)),
  onRecoverableError: () => {},
});
root_.render(createElement(AskView, { profile, preset: null, onGoRegister: () => {}, onSaved: (rec, p) => { saved = { rec, p }; } }));

function clickNext() {
  const btn = [...container.querySelectorAll(".ask-sticky-nav button, button")].find(b => /^Next$/.test(b.textContent.trim()));
  check(btn, "Next button");
  btn.click();
}
function clickTrack(labelPart) {
  const card = [...container.querySelectorAll(".aym-ask-track-card")].find(b => b.textContent.includes(labelPart));
  check(card, `track card containing "${labelPart}"`);
  card.click();
}
function findField(text) {
  const label = [...container.querySelectorAll(".aym-field")].find(l => (l.querySelector("label")?.textContent || "").includes(text));
  if (!label) return null;
  return label.querySelector("select, textarea, input");
}
async function fillForm(question) {
  await until(() => container.querySelector("textarea.ask-q-textarea, textarea"));
  // Step 1 — Question
  clickTrack("Research, Evidence & Publication");
  await sleep(40);
  const sub = await until(() => findField("Sub-area"));
  check(sub, "Sub-area after track");
  setValue(sub, "Framing a research question");
  const qEl = await until(() => findField("One focused question") || findField("focused question"));
  check(qEl, "question field");
  setValue(qEl, question);
  // Wait for React state to catch up before advancing (stepper validates from state).
  check(await until(() => qEl.value === question && qEl.value.length >= 25), "question committed");
  await sleep(80);
  for (let attempt = 0; attempt < 5; attempt++) {
    clickNext();
    const stateEl = await until(() => findField("State or union territory"), 1500);
    if (stateEl) break;
    await sleep(100);
  }
  const stateEl = findField("State or union territory");
  check(stateEl, `Who step state field (page: ${container.textContent.slice(0, 220)})`);
  // Step 2 — Who
  setValue(stateEl, "Outside India");
  setValue(findField("Programme or stage"), "Changing careers");
  setValue(findField("Have you registered for WAC 2026?"), "Yes");
  setValue(findField("Will you attend in person"), "Not yet confirmed");
  await sleep(80);
  for (let attempt = 0; attempt < 5; attempt++) {
    clickNext();
    if (await until(() => [...container.querySelectorAll(".ui-check")].length >= 4, 1200)) break;
    await sleep(80);
  }
  check([...container.querySelectorAll(".ui-check")].length >= 4, "Consent step");
  // Step 3 — Consent (leave unticked)
  for (let attempt = 0; attempt < 5; attempt++) {
    clickNext();
    if (await until(() => sendButton(), 1200)) break;
    await sleep(80);
  }
  check(sendButton(), "Review step with submit");
}
const sendButton = () => [...container.querySelectorAll("button")].find(b => /Hand this to the Ask Desk|^Submit$|Sending/.test(b.textContent.trim()));
const questionText = "How do I move from clinical practice into research methodology work in Ayurveda?";

await step("Network failure: specific message, typed question kept, nothing saved", async () => {
  await fillForm(questionText);
  failNext = 1 + 1; // first try + the automatic resend
  sendButton().click();
  const notice = await until(() => [...container.querySelectorAll("[class*=notice], .aym-notice, [role=alert], [role=status]")].map(n => n.textContent).find(t => /couldn't reach the Ask Desk/i.test(t)));
  check(notice, `specific network message shown (got: ${container.textContent.slice(0, 300)})`);
  // Stay on review or recover — typed question must still be in draft/session; reopen via Back to Question if needed
  let qEl = container.querySelector("textarea.ask-q-textarea");
  if (!qEl) {
    // Navigate back to question step
    for (let i = 0; i < 3; i++) {
      const back = [...container.querySelectorAll("button")].find(b => /^Back$/.test(b.textContent.trim()));
      if (back && !back.disabled) back.click();
      await sleep(40);
    }
    qEl = await until(() => container.querySelector("textarea.ask-q-textarea"));
  }
  check(qEl && qEl.value === questionText, `question still in the textarea (got: ${qEl && qEl.value})`);
  check(!Object.keys(db()).some(k => k.startsWith("aym:q:")), "nothing saved");
});

let firstTicket = "";
await step("Send → success screen with ticket (no React hook error), saved with stage / state / source", async () => {
  // Ensure we are on review with filled form
  if (![...container.querySelectorAll("button")].some(b => /Hand this to the Ask Desk|^Submit$/.test(b.textContent.trim()))) {
    await fillForm(questionText);
  }
  sendButton().click();
  const done = await until(() => /The Ask Desk has your question\./.test(container.textContent) || reactErrors.length);
  const stored = Object.keys(db()).filter(k => k.startsWith("aym:q:")).length;
  check(!reactErrors.length, `React error: ${reactErrors[0]} (questions on the server: ${stored})`);
  check(done, `success screen (page shows: ${container.textContent.slice(0, 200)})`);
  firstTicket = container.querySelector(".ui-ticket").textContent.trim();
  const qs = Object.entries(db()).filter(([k]) => k.startsWith("aym:q:")).map(([, v]) => v);
  eq(qs.length, 1, "exactly one question stored (resend reused the ticket)");
  const q = qs[0];
  eq(q.ticket, firstTicket, "stored ticket = ticket on screen");
  eq(q.stage, "Changing careers", "stage");
  eq(q.state, "Outside India", "state");
  eq(q.source, "qr", "QR source");
  eq(q.regNo, profile.regNo, "regNo sent");
  check(saved && saved.rec.ticket === firstTicket, "onSaved called");
  return firstTicket;
});
await step("AI job queued by the submit", async () => {
  const id = Object.values(db()).find(v => v && v.ticket === firstTicket).id;
  const job = db()[`aym:ai:job:q_${id}`];
  check(job && job.status === "queued", `job queued (${JSON.stringify(job)})`);
});

await step("Ask another question → form again (no hook error), new ticket on next send", async () => {
  const again = [...container.querySelectorAll("button")].find(b => /Ask another question/.test(b.textContent));
  check(again, "Ask another question button");
  again.click();
  const back = await until(() => container.querySelector("textarea.ask-q-textarea") || reactErrors.length);
  check(!reactErrors.length, `React error: ${reactErrors[0]}`);
  check(back, "form shown again");
  await fillForm("Which research skills should I build first if I want to join a CCRAS institute?");
  sendButton().click();
  check(await until(() => /The Ask Desk has your question\./.test(container.textContent)), "second success screen");
  const t2 = container.querySelector(".ui-ticket").textContent.trim();
  check(t2 && t2 !== firstTicket, "new ticket");
});

root_.unmount();
server.close();
try { fs.unlinkSync(storeFile); fs.unlinkSync(outFile); } catch { /* gone */ }
const failed = results.filter(x => !x).length;
realLog(`\n${results.length - failed}/${results.length} render checks passed.`);
process.exit(failed ? 1 : 0);
