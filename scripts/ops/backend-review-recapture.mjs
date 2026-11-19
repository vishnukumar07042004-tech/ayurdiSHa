/**
 * Recapture weak / PII-leaking screens for the backend review PDF.
 * Never logs tokens or raw emails.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const puppeteer = (await import(path.join(ROOT, ".qa/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"))).default;
const OUT = path.join(ROOT, "docs/ops/backend-review/screens");
const LIVE = "https://ayushmarg.vercel.app";
const LOCAL = process.env.AYM_LOCAL || "http://127.0.0.1:5173";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function loadToken() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = [...raw.matchAll(/^STAFF_SERVICE_TOKEN=(.*)$/gm)].pop();
  if (!m) throw new Error("STAFF_SERVICE_TOKEN missing");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(page, ms = 2800) {
  try { await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }); } catch { /* ignore */ }
  await sleep(ms);
}

async function scrubPii(page) {
  await page.evaluate(() => {
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phoneRe = /(?:\+?\d[\d\s().-]{7,}\d)/g;
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        const t = node.nodeValue || "";
        if (emailRe.test(t) || phoneRe.test(t)) {
          emailRe.lastIndex = 0; phoneRe.lastIndex = 0;
          node.nodeValue = t.replace(emailRe, "[email masked]").replace(phoneRe, "[phone masked]");
        }
        return;
      }
      if (node.nodeType === 1) {
        if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName)) return;
        if (node.shadowRoot) [...node.shadowRoot.childNodes].forEach(walk);
        [...node.childNodes].forEach(walk);
      }
    };
    walk(document.body);

    /* Hide contacts if toggled on */
    document.querySelectorAll("button").forEach((b) => {
      if (/^Hide contacts$/i.test((b.textContent || "").trim())) b.click();
    });

    /* Blur registered-delegates sidebar and any remaining contact cells */
    const style = document.getElementById("aym-scrub") || document.createElement("style");
    style.id = "aym-scrub";
    style.textContent = `
      .aym-staff-aside, .aym-delegate-panel, .aym-staff-connect { filter: blur(10px) !important; }
      .staff-access-list, .staff-access-row, .staff-panel li, .staff-audit-table td:nth-child(2) {
        filter: blur(8px) !important;
      }
      .aym-brief table td:nth-child(n+2):nth-child(-n+4) { filter: blur(7px) !important; }
    `;
    document.documentElement.appendChild(style);
  });
  await sleep(250);
}

async function injectAuth(page, token) {
  await page.evaluateOnNewDocument((tok) => {
    const orig = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      let url = "";
      try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch { url = ""; }
      if (String(url).includes("/api/aym-store")) {
        const headers = new Headers(init.headers || (input && input.headers) || undefined);
        headers.set("Authorization", `Bearer ${tok}`);
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
        init = { ...init, headers, credentials: init.credentials || "include" };
      }
      return orig(input, init);
    };
    try {
      localStorage.setItem("aym-welcome-v3", JSON.stringify({ seenAt: new Date().toISOString(), completed: true }));
    } catch { /* ignore */ }
  }, token);
}

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, type: "png" });
  console.log("ok", name, Math.round(fs.statSync(dest).size / 1024) + "KB");
}

async function scrollTo(page, pattern) {
  await page.evaluate((p) => {
    const rx = new RegExp(p, "i");
    const hit = [...document.querySelectorAll("h1,h2,h3,h4,section,[aria-labelledby],.aym-eyebrow,.staff-panel-head")].find(
      (n) => rx.test((n.textContent || "") + " " + (n.getAttribute("aria-label") || "")),
    );
    if (hit) hit.scrollIntoView({ block: "start", behavior: "instant" });
  }, pattern);
  await sleep(350);
  await page.evaluate(() => window.scrollBy(0, -90));
  await sleep(200);
}

const token = loadToken();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

/* ---- 01 staff sign-in (signed out, welcome skipped) ---- */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("aym-welcome-v3", JSON.stringify({ seenAt: new Date().toISOString(), completed: true }));
    } catch { /* ignore */ }
  });
  await page.goto(`${LIVE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button,a")].find((n) => /^Staff access$/i.test((n.textContent || "").trim()));
    if (b) b.click();
  });
  await sleep(900);
  const open = await page.evaluate(() => /Staff passcode|Staff access/i.test(document.body.innerText));
  console.log("signin dialog open:", open);
  await shot(page, "01-staff-signin.png");
  await page.close();
}

/* ---- how-it-works + huddles from LOCAL (ShieldCheck fix) ---- */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  try {
    await page.goto(`${LOCAL}/how-it-works`, { waitUntil: "networkidle2", timeout: 30000 });
    await waitReady(page, 2000);
    const ok = await page.evaluate(() => !/couldn't load this content/i.test(document.body.innerText));
    console.log("local how-it-works ok:", ok);
    if (ok) {
      await shot(page, "17a-how-it-works.png");
      await scrollTo(page, "Meet|huddle|one-to-one|1:1|Live");
      await shot(page, "10-huddles-scheduling.png");
    } else {
      throw new Error("local how-it-works still broken");
    }
  } catch (e) {
    console.log("local how-it-works fallback to about/events:", e.message);
    await page.goto(`${LIVE}/about`, { waitUntil: "networkidle2", timeout: 60000 });
    await waitReady(page, 2000);
    await shot(page, "17a-how-it-works.png");
    await scrollTo(page, "one-to-one|1:1|Live");
    await shot(page, "10-huddles-scheduling.png");
  }
  await page.close();
}

/* ---- staff pages with auth + scrub ---- */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await injectAuth(page, token);

  await page.goto(`${LIVE}/#staff`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 3500);
  await scrubPii(page);
  await shot(page, "02-staff-home.png");

  await scrollTo(page, "One-time review link");
  await scrubPii(page);
  /* strip any invite URL DOM */
  await page.evaluate(() => {
    document.querySelectorAll(".staff-review-invite-url, .staff-review-invite-once").forEach((el) => el.remove());
  });
  await shot(page, "11-review-invite-create.png");

  await scrollTo(page, "Access requests");
  await scrubPii(page);
  await shot(page, "13b-admin-access-audit.png");

  await page.goto(`${LIVE}/#insights`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 4000);
  await scrubPii(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await shot(page, "03-insights.png");

  await scrollTo(page, "Briefing board");
  await scrubPii(page);
  await shot(page, "12-briefing-board.png");

  await scrollTo(page, "WAC delegates");
  await scrubPii(page);
  await shot(page, "09-wac-delegates.png");

  await scrollTo(page, "Faculty");
  await scrubPii(page);
  await shot(page, "06-faculty-bank.png");

  await page.goto(`${LIVE}/#pack`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 3000);
  await scrubPii(page);
  await shot(page, "05-mentor-pack.png");

  await page.goto(`${LIVE}/#curate`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 3500);
  await scrubPii(page);
  await shot(page, "13a-curation.png");

  await page.goto(`${LIVE}/#ai`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page, 4000);
  await shot(page, "07-disha-desk.png");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((n) => /Settings/i.test(n.textContent || ""));
    if (b) b.click();
  });
  await sleep(1000);
  await scrollTo(page, "DISHA settings|Drafting|Streams");
  await shot(page, "08-disha-settings.png");

  await page.close();
}

await browser.close();
console.log("recapture done");
