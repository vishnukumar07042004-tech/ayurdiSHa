#!/usr/bin/env node
/**
 * Browser-free UI smoke: bundles the real <App/> (esbuild), renders every public route and the
 * main hash views in happy-dom against the real API handler (isolated file store), and fails on
 * any React error, error-boundary screen or empty page. Also checks the nav order rule
 * (Home → The Hall → Meet Mentors) and the first-visit welcome deck redirect.
 *
 *   npm install --no-save happy-dom   # once; not a project dependency
 *   node scripts/e2e/ui-smoke.mjs
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { useLocalStaffSecrets, signInStaff } from "../lib/localStaff.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let Window;
try { ({ Window } = await import("happy-dom")); }
catch { console.log("SKIP  happy-dom is not installed (npm install --no-save happy-dom)."); process.exit(0); }

const seedArg = process.argv.find(a => a.startsWith("--seed="));
const storeFile = path.join(os.tmpdir(), `aym-ui-smoke-${process.pid}.json`);
fs.writeFileSync(storeFile, seedArg ? fs.readFileSync(path.resolve(seedArg.slice(7)), "utf8") : "{}");
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test" });
delete process.env.VERCEL;
const staffSecrets = useLocalStaffSecrets();

const realLog = console.log;
const realErr = console.error;
const errors = [];
const otpLog = new Map();
console.log = (...a) => {
  const m = a.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
  if (!/\[aym-|\[knowledge/.test(a.join(" "))) realLog(...a);
};
console.error = (...a) => {
  const line = a.map(x => (x && x.stack) || (x && x.message) || String(x)).join(" ");
  if (/\[aym-|\[knowledge|\[ask\]/.test(line)) return;
  if (/ErrorBoundary|Rendered (fewer|more) hooks|is not defined|Cannot read prop|is not a function|Minified React error/i.test(line)) errors.push(line.slice(0, 300));
};
console.warn = () => {};

const { aymStoreHandler } = await import("../../server/storePlugin.js");
const { knowledgeChatHandler } = await import("../../server/knowledgeChat.js");
const server = http.createServer((req, res) => (req.url.startsWith("/api/knowledge-chat") ? knowledgeChatHandler(req, res) : aymStoreHandler(req, res)));
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;

const { build } = await import("esbuild");
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const outFile = path.join(root, ".qa", `ui-smoke-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(root, "src/App.jsx")],
  bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-router", "react-router-dom"],
  jsx: "automatic", define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false, MODE: "production" }) },
  loader: { ".css": "empty", ".png": "empty", ".webp": "empty", ".jpg": "empty", ".svg": "empty" },
});

const win = new Window({ url: "http://localhost/", width: 1440, height: 900 });
for (const k of Object.getOwnPropertyNames(win)) {
  if (k in globalThis || k === "undefined") continue;
  try { globalThis[k] = win[k]; } catch { /* read-only */ }
}
Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, sessionStorage: win.sessionStorage, HTMLElement: win.HTMLElement, Node: win.Node, Event: win.Event, location: win.location, history: win.history });
try { Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true }); } catch { /* keep */ }
win.scrollTo = () => {};
globalThis.scrollTo = () => {};
win.HTMLElement.prototype.scrollIntoView = () => {};
if (!win.matchMedia) win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.matchMedia = win.matchMedia.bind(win);
const jar = new Map();
globalThis.fetch = async (url, init = {}) => {
  const r = await realFetch(String(url).startsWith("http") ? url : base + url, { ...init, headers: { ...(init.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
  for (const c of r.headers.getSetCookie()) { const [pair] = c.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  return r;
};
win.fetch = globalThis.fetch;

const { default: App } = await import(pathToFileURL(outFile).href);
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router-dom");
const { MENTORS, mentorPublicPath } = await import(pathToFileURL(path.join(root, "src/mentors.js")).href);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function report(name, ok, note = "") { results.push(ok); realLog(`  ${ok ? "PASS" : "FAIL"}  ${name}${note ? ` — ${note}` : ""}`); }

async function render(url, { settle = 1200 } = {}) {
  win.happyDOM.setURL(`http://localhost${url}`);
  const u = new URL(`http://localhost${url}`);
  const el = win.document.createElement("div");
  el.id = "root";
  win.document.body.innerHTML = "";
  win.document.body.appendChild(el);
  const before = errors.length;
  const r = createRoot(el, { onUncaughtError: e => errors.push(String(e && e.stack || e).slice(0, 300)), onCaughtError: e => errors.push(`caught: ${String(e && e.message || e).slice(0, 300)}`) });
  r.render(createElement(MemoryRouter, { initialEntries: [u.pathname + u.search + u.hash] }, createElement(App)));
  await sleep(settle);
  const text = el.textContent.replace(/\s+/g, " ");
  const h1 = (el.querySelector("h1") || {}).textContent || "";
  const errs = errors.slice(before);
  const nav = [...el.querySelectorAll('nav[aria-label="Primary"] a, nav[aria-label="Primary"] button')].map(a => a.textContent.trim()).filter(Boolean);
  r.unmount();
  return { text, h1: h1.replace(/\s+/g, " ").trim(), errs, nav };
}

realLog("AYURDISHA UI smoke (happy-dom)\n");

// First visit: the welcome deck.
{
  win.localStorage.clear(); win.sessionStorage.clear();
  const r = await render("/");
  const onWelcome = /welcome/i.test(win.location.pathname) || /Enter AYURDISHA|Welcome/i.test(r.text);
  report("first visit to / shows the welcome deck", !r.errs.length && onWelcome, r.errs[0] || r.h1);
}

const { markWelcomeSeen } = await import(pathToFileURL(path.join(root, "src/welcomeStorage.js")).href).catch(() => ({}));
const routes = [
  ["/", "Home"], ["/welcome?replay=1", "Welcome deck (replay)"], ["/#hall", "The Hall + hall map"], ["/#ask", "Ask Desk (signed out)"],
  ["/#track", "Track my answer"], ["/#podcast", "Podcast"], ["/#pods", "Mentor pods"], ["/#exchange", "Knowledge exchange"],
  ["/mentors", "Mentors list"], [mentorPublicPath(MENTORS[0]), "Mentor profile"], ["/about", "About"], ["/how-it-works", "How it works"], ["/programs", "Career tracks"],
  ["/resources", "Resources / FAQ"], ["/events", "Events"], ["/contact", "Contact"], ["/privacy", "Privacy"], ["/terms", "Terms"],
  ["/disclaimer", "Disclaimer"], ["/#staff", "Staff sign-in"], ["/does-not-exist", "404 page"],
];
for (const [url, name] of routes) {
  if (typeof markWelcomeSeen === "function") markWelcomeSeen();
  else { win.localStorage.setItem("aym-welcome-seen", "1"); win.sessionStorage.setItem("aym-welcome-session", "1"); }
  const r = await render(url);
  const boundary = /We couldn't load this content|hit a problem/.test(r.text);
  const ok = !r.errs.length && !boundary && r.text.length > 200;
  report(`${name} (${url})`, ok, ok ? (r.h1 || `${r.text.length} chars`).slice(0, 70) : (r.errs[0] || (boundary ? "error boundary shown" : `only ${r.text.length} chars`)));
  if (url === "/") {
    const { nav } = r;
    const iH = nav.indexOf("Home");
    const iHall = nav.indexOf("The Hall");
    const iM = nav.findIndex(t => /Meet Mentors/.test(t));
    report("nav order Home → The Hall → Meet Mentors", iH >= 0 && iH < iHall && iHall < iM, nav.slice(0, 8).join(" · "));
  }
  if (url === "/#ask") report("Ask Desk asks visitors to register first", /Register in 30 seconds/.test(r.text));
}

// Staff views, signed in with the passcode + email code (cookie kept by the fetch shim).
const shimCall = async (op, body = {}) => {
  const r = await globalThis.fetch("/api/aym-store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = await signInStaff(shimCall, { passcode: staffSecrets.passcode, email: staffSecrets.admin, otpFor: e => otpLog.get(e) });
report("staff access sign-in (passcode + email code, API)", login.ok, login.error || "approved");
for (const [hash, name] of [["#staff", "Staff portal"], ["#curate", "Curation desk"], ["#insights", "Insights (briefing board + Sources)"], ["#pack", "Mentor pack"], ["#ai", "AI drafts desk"], ["#board", "Theme stage"], ["#track", "Track (staff)"]]) {
  const r = await render(`/${hash}`, { settle: 2500 });
  const boundary = /We couldn't load this content|hit a problem/.test(r.text);
  const ok = !r.errs.length && !boundary && r.text.length > 200 && !/Staff access required/.test(r.text);
  report(`${name} (/${hash}, signed in)`, ok, ok ? `${r.text.length} chars` : (r.errs[0] || (boundary ? "error boundary shown" : r.text.slice(0, 120))));
}

server.close();
try { fs.unlinkSync(storeFile); fs.unlinkSync(outFile); } catch { /* gone */ }
const failed = results.filter(x => !x).length;
realLog(`\n${results.length - failed}/${results.length} UI smoke checks passed.`);
process.exit(failed ? 1 : 0);
