#!/usr/bin/env node
/**
 * Runtime render smoke of the whole SPA (the real `App` from src/App.jsx, bundled with esbuild,
 * rendered by React DOM in happy-dom) against the real API handler on an isolated file store
 * (mock AI, console mail). Catches what the API journey cannot: a page that throws while
 * rendering (e.g. the 2026-11-03 Ask Desk hooks crash) or falls into an error boundary.
 *
 *   npm install --no-save happy-dom        # once; not a project dependency
 *   node scripts/e2e/qa-render-smoke.mjs
 *
 * Routes: home, welcome deck, hall (+ map), podcast, register, Ask (signed out / signed in),
 * Track (ticket in the URL, answered), mentors, programs (career tracks), events, resources,
 * contact, about, legal, 404, the "Staff access required" screen and every staff desk after the
 * passcode + email-code sign-in (random test-only secrets, never the real ones).
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let Window;
try { ({ Window } = await import("happy-dom")); }
catch {
  console.log("SKIP  happy-dom is not installed (npm install --no-save happy-dom).");
  process.exit(0);
}

const storeFile = path.join(os.tmpdir(), `aym-render-smoke-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, {
  AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1",
  AI_PROVIDER: "mock", AI_MOCK_MODE: "ok", NODE_ENV: "test",
});
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
const { useLocalStaffSecrets, signInStaff } = await import("../lib/localStaff.mjs");
const staffSecrets = useLocalStaffSecrets();
const staffLogin = call => signInStaff(call, { passcode: staffSecrets.passcode, email: staffSecrets.admin, otpFor: e => otpLog.get(e) });

const otpLog = new Map();
const realLog = console.log;
const realErr = console.error;
const renderErrors = [];
console.log = (...a) => {
  const m = a.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) { otpLog.set(m[1].toLowerCase(), m[2]); return; }
};
console.error = (...a) => {
  const line = a.map(x => (x && x.stack) || (x && x.message) || String(x)).join(" ");
  if (/ErrorBoundary|Rendered (fewer|more) hooks|change in the order of Hooks|is not a function|Cannot read properties|is not defined/i.test(line)) {
    renderErrors.push(line.replace(/\s+/g, " ").slice(0, 300));
  }
};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

const { aymStoreHandler } = await import("../../server/storePlugin.js");

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/aym-store")) return aymStoreHandler(req, res);
  res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end("{}");
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;

function jarClient() {
  const jar = new Map();
  const fetchWithJar = async (url, init = {}) => {
    const u = String(url);
    const target = /^https?:/.test(u) ? u.replace(/^https?:\/\/[^/]+/, base) : base + (u.startsWith("/") ? u : `/${u}`);
    const r = await realFetch(target, {
      ...init, headers: { ...(init.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(x => /max-age=0/i.test(x))) jar.delete(k); else jar.set(k, v);
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- seed data through the API */

const browser = jarClient();
const staffApi = jarClient();
let profile;
let token;
const answered = { id: "SMOKEQ0001", ticket: "AYM-Q-SMOKE001" };

realLog("AYURDISHA render smoke\n");

await step("Seed: register a student, ask a QR question, staff answers it", async () => {
  const email = "render.smoke@ayurdisha-qa.test";
  check((await browser.call("regStart", { name: "Smoke Student", age: 24, sex: "Female", institute: "QA Ayurveda College", email })).status === 200, "regStart");
  const ok = await browser.call("regVerify", { email, otp: otpLog.get(email), source: "qr" });
  check(ok.status === 200, `regVerify ${JSON.stringify(ok.body)}`);
  ({ profile, token } = ok.body);
  const rec = {
    ...answered, createdAt: Date.now(), name: profile.name, email, institution: "QA Ayurveda College",
    stage: "Researcher", state: "Outside India", registered: "Yes", inPerson: "No", regNo: profile.regNo,
    theme: "Research, Evidence & Publication", subtheme: "Framing a research question", source: "qr",
    question: "How do I frame a good research question for an Ayurveda clinical study?", consentPublish: "Yes",
  };
  const s = await browser.call("set", { key: `aym:q:${rec.id}`, val: rec, token });
  check(s.status === 200, `submit ${JSON.stringify(s.body)}`);
  const login = await staffLogin(staffApi.call);
  check(login.ok, `staff sign-in: ${login.error}`);
  const a = await staffApi.call("answerIndividual", { id: rec.id, answer: "Start from a clinical observation, narrow it with PICO, and check what CCRAS has already published.", mentorName: "Dr. Smoke Mentor" });
  check(a.status === 200, `answerIndividual ${JSON.stringify(a.body)}`);
  return profile.regNo;
});

/* ---------------------------------------------------------------- bundle the real App */

const { build } = await import("esbuild");
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const entry = path.join(root, ".qa", `smoke-entry-${process.pid}.jsx`);
const outFile = path.join(root, ".qa", `smoke-${process.pid}.mjs`);
fs.writeFileSync(entry, `export { default as App } from "../src/App.jsx";\nexport { applyEntryUrl } from "../src/askLink.js";\n`);
await build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-router", "react-router-dom"],
  jsx: "automatic", define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false, MODE: "production", BASE_URL: "/" }) },
  loader: { ".css": "empty", ".png": "file", ".webp": "file", ".jpg": "file", ".jpeg": "file", ".svg": "file", ".xlsx": "file" },
  assetNames: "smoke-assets/[name]",
});

/* ---------------------------------------------------------------- DOM */

const win = new Window({ url: "http://localhost/", width: 1440, height: 900 });
for (const k of Object.getOwnPropertyNames(win)) {
  if (k in globalThis || k === "undefined") continue;
  try { globalThis[k] = win[k]; } catch { /* read-only */ }
}
Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, sessionStorage: win.sessionStorage, location: win.location, history: win.history });
try { Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true }); } catch { /* keep node's */ }
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
for (const target of [win, globalThis]) {
  target.IntersectionObserver = target.IntersectionObserver || NoopObserver;
  target.ResizeObserver = target.ResizeObserver || NoopObserver;
  target.scrollTo = () => {};
  target.matchMedia = target.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
}
win.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.fetch = (url, init) => browser.fetchWithJar(String(url), init);
win.fetch = globalThis.fetch;

const mod = await import(pathToFileURL(outFile).href);
const { createElement, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrowserRouter } = await import("react-router-dom");

async function until(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  return null;
}

/** Render the app at `url`; returns the container once `ready` matches (or throws). */
async function renderAt(url, ready, { settle = 250, inspect = null } = {}) {
  win.happyDOM.setURL(`http://localhost${url}`);
  mod.applyEntryUrl(win.location);
  win.document.body.innerHTML = "";
  const container = win.document.createElement("div");
  container.id = "root";
  win.document.body.appendChild(container);
  renderErrors.length = 0;
  const r = createRoot(container, {
    onUncaughtError: e => renderErrors.push(String(e && e.message || e).slice(0, 300)),
    onCaughtError: e => renderErrors.push(String(e && e.message || e).slice(0, 300)),
  });
  r.render(createElement(StrictMode, null, createElement(BrowserRouter, null, createElement(mod.App))));
  const text = () => container.textContent || "";
  const ok = await until(() => renderErrors.length || container.querySelector(".aym-error-card") || ready.test(text()));
  await sleep(settle);
  const errorCard = container.querySelector(".aym-error-card");
  const snapshot = text().replace(/\s+/g, " ").slice(0, 220);
  try {
    check(!renderErrors.length, `render error: ${renderErrors[0]}`);
    check(!errorCard, `error boundary shown: ${errorCard && errorCard.textContent.slice(0, 160)}`);
    check(ok && ready.test(text()), `expected ${ready} (page shows: ${snapshot})`);
    return inspect ? inspect(container) : undefined;
  } finally {
    r.unmount();
  }
}

/* ---------------------------------------------------------------- public routes */

const signedIn = () => win.localStorage.setItem("aym-delegate-session", JSON.stringify({ token, profile }));
const signedOut = () => win.localStorage.removeItem("aym-delegate-session");
const seenWelcome = () => { try { win.localStorage.setItem("aym-welcome-seen", "1"); } catch { /* */ } };

const PUBLIC = [
  ["Welcome deck", "/welcome", /AYURDISHA|Welcome|Next|Skip/i],
  ["Home", "/", /Ask Desk|mentor/i],
  ["The Hall (+ hall map)", "/#hall", /hall/i],
  ["Podcast", "/#podcast", /podcast|talk/i],
  ["Register", "/#register", /Register|WAC/i],
  ["Ask Desk signed out (register banner)", "/#ask", /Register in 30 seconds to ask a mentor\./],
  ["Track: empty", "/#track", /Track|ticket/i],
  ["Mentors directory", "/mentors", /Mentor/i],
  ["Programs (career tracks)", "/programs", /career|program|track/i],
  ["Events", "/events", /event|WAC|congress/i],
  ["Resources", "/resources", /resource|FAQ/i],
  ["About", "/about", /AYURDISHA/i],
  ["How it works", "/how-it-works", /How it works|Register/i],
  ["Contact", "/contact", /contact|email/i],
  ["Privacy", "/privacy", /Privacy/i],
  ["Terms", "/terms", /Terms/i],
  ["Disclaimer", "/disclaimer", /Disclaimer|not medical advice/i],
  ["404 page", "/no-such-page", /not found|404|can.t find/i],
];

for (const [name, url, ready] of PUBLIC) {
  await step(`${name} (${url})`, async () => {
    signedOut();
    if (url !== "/welcome") seenWelcome();
    await renderAt(url, ready);
  });
}

await step("Nav order: Home · The Hall · Meet Mentors (desktop header)", async () => {
  signedOut(); seenWelcome();
  win.happyDOM.setURL("http://localhost/mentors");
  const container = win.document.createElement("div");
  win.document.body.innerHTML = ""; win.document.body.appendChild(container);
  const r = createRoot(container);
  r.render(createElement(BrowserRouter, null, createElement(mod.App)));
  const nav = await until(() => {
    const l = [...container.querySelectorAll("header nav a, header a, nav a")].map(a => a.textContent.trim()).filter(Boolean);
    return l.includes("The Hall") ? l : null;
  });
  r.unmount();
  const labels = nav || [];
  const iHome = labels.indexOf("Home");
  const iHall = labels.indexOf("The Hall");
  const iMentors = labels.indexOf("Meet Mentors");
  check(iHome >= 0 && iHall > iHome && iMentors > iHall, `order ${JSON.stringify(labels.slice(0, 10))}`);
  return labels.slice(0, 7).join(" · ");
});

await step("Ask Desk signed in: form with the new stages + Outside India", async () => {
  signedIn(); seenWelcome();
  const options = await renderAt("/#ask", /Hand this to the Ask Desk/, {
    inspect: c => [...c.querySelectorAll("option")].map(o => o.textContent),
  });
  for (const s of ["Ayurveda student (other course)", "Researcher", "Changing careers", "Outside India"]) check(options.includes(s), `option "${s}" (have ${options.length}: ${options.slice(0, 40).join(" | ")})`);
});

await step("Track: ticket in the URL (lower-case) shows the mentor's answer", async () => {
  signedOut(); seenWelcome();
  await renderAt(`/?ticket=${answered.ticket.toLowerCase()}#track`, /Start from a clinical observation/, { settle: 400 });
});

/* ---------------------------------------------------------------- staff */

await step("Staff access screen (signed out)", async () => {
  signedOut(); seenWelcome();
  await renderAt("/#staff", /Staff access required/);
});

// The browser session becomes staff by signing in through the same cookie jar the app uses.
await step("Staff sign-in (passcode + email code) through the app's cookie jar", async () => {
  const r = await staffLogin(browser.call);
  check(r.ok, `sign-in ${r.error}`);
});

const STAFF = [
  ["Staff workspace", "#staff", /question|desk|staff/i],
  ["Curation", "#curate", /Curation|merge|group/i],
  ["Insights (briefing + sources)", "#insights", /Insights|brief|source/i],
  ["Theme stage / briefing board", "#board", /board|theme|brief/i],
  ["Mentor pack", "#pack", /Mentor pack|Excel|export/i],
  ["AI drafts desk", "#ai", /AI|draft/i],
];
for (const [name, hash, ready] of STAFF) {
  await step(`${name} (/${hash})`, async () => {
    signedOut(); seenWelcome();
    await renderAt(`/${hash}`, ready, { settle: 500 });
  });
}

server.close();
try { fs.unlinkSync(storeFile); fs.unlinkSync(outFile); fs.unlinkSync(entry); fs.rmSync(path.join(root, ".qa", "smoke-assets"), { recursive: true, force: true }); } catch { /* gone */ }
const failed = results.filter(x => !x).length;
realLog(`\n${results.length - failed}/${results.length} render smoke checks passed.`);
process.exit(failed ? 1 : 0);
