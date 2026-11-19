#!/usr/bin/env node
/**
 * Runtime UI check of "Sign in with WAC ID" (the real App bundled with esbuild, React DOM in
 * happy-dom, the real API handler on an isolated file store, console mail):
 *   Register shows "coming soon" with no list → staff imports the sample → Register shows the
 *   choice → WAC ID + email → code → Confirm your details (locked fields, stage, consent) → pass
 *   shows the WAC ID; Ask Desk signed-out card offers the WAC link; Insights shows the staff panel.
 *
 *   npm install --no-save happy-dom        # once; not a project dependency
 *   node scripts/e2e/wac-render-check.mjs
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let Window;
try { ({ Window } = await import("happy-dom")); }
catch {
  console.log("SKIP  happy-dom is not installed (npm install --no-save happy-dom).");
  process.exit(0);
}

const storeFile = path.join(os.tmpdir(), `aym-wac-render-${process.pid}.json`);
fs.writeFileSync(storeFile, "{}");
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test" });
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.WAC_VERIFY_MODE;
const { useLocalStaffSecrets, signInStaff } = await import("../lib/localStaff.mjs");
const staffSecrets = useLocalStaffSecrets();
const staffLogin = call => signInStaff(call, { passcode: staffSecrets.passcode, email: staffSecrets.admin, otpFor: e => otpLog.get(e) });

const otpLog = new Map();
const realLog = console.log;
const renderErrors = [];
console.log = (...a) => {
  const m = a.join(" ").match(/OTP for (\S+): (\d{6})/);
  if (m) otpLog.set(m[1].toLowerCase(), m[2]);
};
console.error = (...a) => {
  const line = a.map(x => (x && x.stack) || (x && x.message) || String(x)).join(" ");
  if (/ErrorBoundary|Rendered (fewer|more) hooks|order of Hooks|is not a function|Cannot read properties|is not defined/i.test(line)) renderErrors.push(line.slice(0, 300));
};
console.warn = () => {};
console.info = () => {};

const { aymStoreHandler } = await import("../../server/storePlugin.js");
const { resetWacConfigCache } = await import("../../server/wacSignIn.js");
const { detectColumns, rowsFromGrid } = await import("../../shared/wacId.js");

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
    const r = await realFetch(target, { ...init, headers: { ...(init.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
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

const { build } = await import("esbuild");
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const entry = path.join(root, ".qa", `wac-entry-${process.pid}.jsx`);
const outFile = path.join(root, ".qa", `wac-render-${process.pid}.mjs`);
fs.writeFileSync(entry, `export { default as App } from "../src/App.jsx";\nexport { applyEntryUrl } from "../src/askLink.js";\n`);
await build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react-router", "react-router-dom", "xlsx"],
  jsx: "automatic", define: { "import.meta.env": JSON.stringify({ PROD: true, DEV: false, MODE: "production", BASE_URL: "/" }) },
  loader: { ".css": "empty", ".png": "file", ".webp": "file", ".jpg": "file", ".jpeg": "file", ".svg": "file", ".xlsx": "file" },
  assetNames: "wac-assets/[name]",
});

const win = new Window({ url: "http://localhost/", width: 390, height: 844 });
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
const browser = jarClient();
globalThis.fetch = (url, init) => browser.fetchWithJar(String(url), init);
win.fetch = globalThis.fetch;
try { win.localStorage.setItem("aym-welcome-seen", "1"); } catch { /* */ }

let mod = await import(pathToFileURL(outFile).href);
const { createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrowserRouter } = await import("react-router-dom");

async function until(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  return null;
}

let mounted = null;
async function mount(url) {
  if (mounted) mounted.root.unmount();
  win.happyDOM.setURL(`http://localhost${url}`);
  mod.applyEntryUrl(win.location);
  win.document.body.innerHTML = "";
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  renderErrors.length = 0;
  const root = createRoot(container, { onUncaughtError: e => renderErrors.push(String(e && e.message)), onCaughtError: e => renderErrors.push(String(e && e.message)) });
  root.render(createElement(BrowserRouter, null, createElement(mod.App)));
  mounted = { root, container };
  return container;
}
const text = () => (mounted.container.textContent || "").replace(/\s+/g, " ");
async function waitText(re, ms = 6000) {
  const ok = await until(() => renderErrors.length || re.test(text()), ms);
  check(!renderErrors.length, `render error: ${renderErrors[0]}`);
  check(ok, `expected ${re} (page shows: ${text().slice(0, 260)})`);
}
const byText = (sel, re) => [...mounted.container.querySelectorAll(sel)].find(el => re.test(el.textContent || ""));
const byLabel = re => {
  const label = [...mounted.container.querySelectorAll("label")].find(l => re.test(l.textContent || ""));
  return label && (label.htmlFor ? mounted.container.querySelector(`#${CSS.escape(label.htmlFor)}`) : label.querySelector("input,select"));
};
function setValue(el, v) {
  const proto = el.tagName === "SELECT" ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new win.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}
const click = el => { check(el, "element to click"); el.click(); };

realLog("WAC sign-in render check (390 px)\n");

await step("No list yet: Register shows 'coming soon', email form unchanged", async () => {
  await mount("/#register");
  await waitText(/Sign in with your WAC ID — coming soon/);
  check(/Introduce yourself once/.test(text()), "email registration form still there");
  check(!/I'm registered for WAC 2026/.test(text()), "no WAC choice without data");
});

await step("Staff imports the 5-row sample", async () => {
  const staff = jarClient();
  const login = await staffLogin(staff.call);
  check(login.ok, `staff sign-in: ${login.error}`);
  const wb = XLSX.read(fs.readFileSync(path.join(root, "docs/wac-signin/sample-delegates.csv"), "utf8"), { type: "string" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const r = await staff.call("wacDelegatesImport", { rows: rowsFromGrid(grid, detectColumns(grid[0])), batchId: "render-1" });
  check(r.status === 200 && r.body.imported === 5, `import ${JSON.stringify(r.body)}`);
  resetWacConfigCache();
});

// The browser module caches wacConfig per page load; a fresh bundle import is a fresh page load.
mod = await import(`${pathToFileURL(outFile).href}?reload=1`);

let pass = "";
await step("Register: clear choice → WAC ID + email → code to masked email", async () => {
  await mount("/#register");
  await waitText(/I'm registered for WAC 2026/);
  check(/New here/.test(text()) && /Register with email/.test(text()), "both choices shown");
  click(byText("button", /I'm registered for WAC 2026/));
  await waitText(/Sign in with your WAC ID/);
  setValue(byLabel(/WAC Delegate ID/), "test-wac-0001");
  setValue(byLabel(/Email used on the WAC site/), "Fake.Delegate.One@ayurdisha-sample.test");
  click(byText("button", /Send my sign-in code/));
  await waitText(/Check fa•••@a•••\.test/);
  check(!text().includes("fake.delegate.one@"), "full email never shown");
});

await step("Code → Confirm your details: WAC fields locked, phone masked, stage + consent", async () => {
  const otp = otpLog.get("fake.delegate.one@ayurdisha-sample.test");
  check(/^\d{6}$/.test(otp || ""), "code mailed to the WAC record email");
  setValue(mounted.container.querySelector("input[aria-label='6-digit code from your email']"), otp);
  click(byText("button", /Verify and sign in/));
  await waitText(/Confirm your details/);
  for (const s of ["From your WAC registration", "TEST-WAC-0001", "Fake Delegate One", "Sample Ayurveda College (FAKE)", "In person", "•••• 0001", "Corrections are made on the WAC site"]) {
    check(text().includes(s), `confirm screen shows "${s}"`);
  }
  check(!mounted.container.querySelector(".wac-locked input"), "locked fields are not inputs");
  click(byText("button", /Confirm and enter the hall/));
  await waitText(/Choose your career stage/);
  setValue(byLabel(/Your career stage/), "Intern");
  click(byText("label", /Clinical Practice & Integrative Care/).querySelector("input"));
  click(byText("button", /Confirm and enter the hall/));
  await waitText(/Tick the consent box/);
  click(mounted.container.querySelector(".wac-consent input"));
  click(byText("button", /Confirm and enter the hall/));
  await waitText(/Welcome to the hall/);
  pass = text().match(/TEST-WAC-0001/) ? "TEST-WAC-0001" : "";
  check(pass, `pass shows the WAC ID (page: ${text().slice(0, 200)})`);
  return `pass ${pass}`;
});

await step("Returning WAC user on another device: same flow, no confirm screen", async () => {
  win.localStorage.removeItem("aym-delegate-session");
  await mount("/#register");
  await waitText(/I'm registered for WAC 2026/);
  click(byText("button", /I'm registered for WAC 2026/));
  await waitText(/WAC Delegate ID/);
  setValue(byLabel(/WAC Delegate ID/), "TEST-WAC-0001");
  setValue(byLabel(/Email used on the WAC site/), "fake.delegate.one@ayurdisha-sample.test");
  otpLog.clear();
  await sleep(10);
  click(byText("button", /Send my sign-in code/));
  // The 60 s resend cooldown is per browser cookie; this jar still holds the first code, so it may refuse.
  await waitText(/Check fa•••|Please wait \d+s/);
  if (/Please wait/.test(text())) return "cooldown honoured (same browser)";
  setValue(mounted.container.querySelector("input[aria-label='6-digit code from your email']"), otpLog.get("fake.delegate.one@ayurdisha-sample.test"));
  click(byText("button", /Verify and sign in/));
  await waitText(/Welcome to the hall/);
  check(!/Confirm your details/.test(text()), "confirm skipped");
});

await step("Wrong email: generic error, never says which field", async () => {
  win.localStorage.removeItem("aym-delegate-session");
  await mount("/#register");
  await waitText(/I'm registered for WAC 2026/);
  click(byText("button", /I'm registered for WAC 2026/));
  await waitText(/WAC Delegate ID/);
  setValue(byLabel(/WAC Delegate ID/), "TEST-WAC-0002");
  setValue(byLabel(/Email used on the WAC site/), "someone.else@ayurdisha-sample.test");
  click(byText("button", /Send my sign-in code/));
  await waitText(/We couldn't match those details\. Check your WAC ID and the email you used on the WAC site\./);
});

await step("Ask Desk signed out: WAC link opens Register straight on the WAC form", async () => {
  win.localStorage.removeItem("aym-delegate-session");
  await mount("/#ask");
  await waitText(/Sign in with your WAC ID/);
  click(byText("button", /Registered for WAC 2026\? Sign in with your WAC ID/));
  await waitText(/WAC Delegate ID/);
  check(mounted.container.querySelector(".wac-choice-card.is-on") && /registered for WAC/i.test(mounted.container.querySelector(".wac-choice-card.is-on").textContent), "WAC card preselected");
});

await step("Staff Insights: WAC delegates panel with counts", async () => {
  const login = await staffLogin(browser.call);
  check(login.ok, `staff sign-in (same jar): ${login.error}`);
  await mount("/#insights");
  await waitText(/WAC delegates on file/, 8000);
  const kpiText = () => [...mounted.container.querySelectorAll(".wac-staff-kpi b")].map(b => b.textContent);
  await until(() => kpiText()[0] && kpiText()[0] !== "…", 8000);
  const kpis = kpiText();
  check(kpis[0] === "5" && kpis[1] === "1", `kpis ${JSON.stringify(kpis)}`);
  check(/Choose CSV \/ XLSX/.test(text()), "upload button");
  return `total ${kpis[0]}, linked ${kpis[1]}, status ${kpis[3]}`;
});

/** Email registration through the API, session stored like the Register page does. */
async function emailAccount(email) {
  await browser.call("logout");
  check((await browser.call("regStart", { name: "Fake Render Person", age: 25, sex: "Female", institute: "Fake Render College", email })).status === 200, "regStart");
  const v = await browser.call("regVerify", { email, otp: otpLog.get(email.toLowerCase()) });
  check(v.status === 200, `regVerify ${JSON.stringify(v.body)}`);
  win.localStorage.setItem("aym-delegate-session", JSON.stringify({ token: v.body.token, profile: v.body.profile }));
  return v.body.profile;
}
const fieldValue = re => { const el = byLabel(re); return el ? el.value : null; };

await step("Ask Desk: an email account on the WAC list is auto-linked — field shows the WAC Delegate ID", async () => {
  const p = await emailAccount("fake.delegate.five@ayurdisha-sample.test");
  check(p.wacId === "TEST-WAC-0005", `auto-linked by verified email (${p.wacId})`);
  await mount("/#ask");
  await waitText(/Filled from your WAC delegate record/);
  check(fieldValue(/^WAC Delegate ID/) === "TEST-WAC-0005", `field value ${fieldValue(/^WAC Delegate ID/)}`);
  check(!/AYURDISHA pass number/.test(text()) && !/WAC registration number/.test(text()), "no pass-number label");
  check(!/Link your Delegate ID/.test(text()), "no link prompt once linked");
  return "WAC Delegate ID: TEST-WAC-0005";
});

await step("Ask Desk: an account not on the list shows the AYURDISHA pass number + 'Link your Delegate ID'", async () => {
  const p = await emailAccount("not.on.list@ayurdisha-sample.test");
  check(!p.wacId && /^11WAC\/2026\/\d{4}$/.test(p.regNo), "pass number, no link");
  await mount("/#ask");
  await waitText(/Registered for WAC\? Link your Delegate ID/);
  check(fieldValue(/^AYURDISHA pass number/) === p.regNo, `field value ${fieldValue(/^AYURDISHA pass number/)}`);
  check(new RegExp(`Filled from your AYURDISHA pass number ${p.regNo.replace(/\//g, "\\/")}`).test(text()), "pass-number note");
  click(byText("button", /Link your Delegate ID/));
  await waitText(/Link your WAC Delegate ID/);
  check(byLabel(/Email used on the WAC site/).value === "not.on.list@ayurdisha-sample.test", "email prefilled");
  return `AYURDISHA pass number: ${p.regNo}`;
});

if (mounted) mounted.root.unmount();
server.close();
try { fs.unlinkSync(storeFile); fs.unlinkSync(outFile); fs.unlinkSync(entry); fs.rmSync(path.join(root, ".qa", "wac-assets"), { recursive: true, force: true }); } catch { /* gone */ }
const failed = results.filter(x => !x).length;
realLog(`\n${results.length - failed}/${results.length} WAC render checks passed.`);
process.exit(failed ? 1 : 0);
