/**
 * Capture AYURDISHA staff/backend + key student screens for the review PDF.
 * Uses STAFF_SERVICE_TOKEN from .env.local via Authorization header injection only.
 * Never logs tokens, pins, emails, or phones.
 *
 * Usage: node scripts/ops/backend-review-capture.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const puppeteer = (await import(path.join(ROOT, ".qa/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"))).default;
const OUT = path.join(ROOT, "docs/ops/backend-review/screens");
const BASE = process.env.AYM_REVIEW_BASE || "https://ayushmarg.vercel.app";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function loadServiceToken() {
  const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = [...raw.matchAll(/^STAFF_SERVICE_TOKEN=(.*)$/gm)].pop();
  if (!m) throw new Error("STAFF_SERVICE_TOKEN missing from .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(page, ms = 2500) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 12000 });
  } catch {
    /* ignore */
  }
  await sleep(ms);
}

async function shot(page, name, { fullPage = false } = {}) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage, type: "png" });
  const st = fs.statSync(dest);
  console.log(`ok ${name} (${Math.round(st.size / 1024)} KB)`);
  return dest;
}

async function gotoHash(page, hash) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page);
}

async function gotoPath(page, p) {
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitReady(page);
}

async function dismissGuides(page) {
  await page.evaluate(() => {
    for (const sel of [
      "button[aria-label='Close']",
      ".aym-guide button",
      "[data-guide] button",
      ".aym-first-visit button",
    ]) {
      document.querySelectorAll(sel).forEach((b) => {
        const t = (b.textContent || "").toLowerCase();
        if (/close|dismiss|skip|got it|continue/.test(t) || b.getAttribute("aria-label") === "Close") {
          try { b.click(); } catch { /* ignore */ }
        }
      });
    }
  });
  await sleep(300);
}

async function maskPii(page) {
  await page.evaluate(() => {
    const style = document.getElementById("aym-review-mask") || document.createElement("style");
    style.id = "aym-review-mask";
    style.textContent = `
      .aym-brief-toolbar button:nth-of-type(1) { outline: 2px dashed #888; }
      .staff-identity strong,
      .staff-access-row td:first-child,
      .staff-audit-table td:nth-child(2),
      .aym-table td:nth-child(4),
      .aym-table td:nth-child(5),
      .aym-table td:nth-child(6),
      .aym-table td:nth-child(7),
      .wac-delegates-table td.email,
      .wac-delegates-table td.phone,
      [data-field="email"], [data-field="phone"],
      .aym-delegate-panel td:nth-child(4),
      .aym-delegate-panel td:nth-child(7),
      .aym-wac-tablewrap td:nth-child(2),
      .aym-wac-tablewrap td:nth-child(3) {
        filter: blur(7px) !important;
        user-select: none !important;
      }
      input[type="email"], input[name="email"], input[name="phone"],
      input[autocomplete="email"], input[autocomplete="tel"] {
        filter: blur(6px) !important;
      }
    `;
    document.documentElement.appendChild(style);
    /* Force contacts hidden if a Show contacts control is active */
    document.querySelectorAll("button").forEach((b) => {
      const t = (b.textContent || "").trim();
      if (/^Hide contacts$/i.test(t)) b.click();
    });
  });
  await sleep(200);
}

async function clickText(page, re, { exact = false } = {}) {
  return page.evaluate((pattern, exactMatch) => {
    const rx = new RegExp(pattern, exactMatch ? undefined : "i");
    const nodes = [...document.querySelectorAll("button, a, [role='button']")];
    const hit = nodes.find((n) => {
      const t = (n.textContent || "").replace(/\s+/g, " ").trim();
      return exactMatch ? t === pattern : rx.test(t);
    });
    if (hit) { hit.click(); return true; }
    return false;
  }, re.source || re, exact);
}

async function scrollToText(page, re) {
  await page.evaluate((pattern) => {
    const rx = new RegExp(pattern, "i");
    const all = [...document.querySelectorAll("h1,h2,h3,h4,section,[aria-label],.aym-eyebrow")];
    const hit = all.find((n) => rx.test((n.textContent || "") + " " + (n.getAttribute("aria-label") || "")));
    if (hit) hit.scrollIntoView({ block: "start", behavior: "instant" });
  }, re.source || re);
  await sleep(400);
  await page.evaluate(() => window.scrollBy(0, -80));
  await sleep(200);
}

async function setDesktop(page) {
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
}

async function setMobile(page) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
}

fs.mkdirSync(OUT, { recursive: true });
const token = loadServiceToken();
console.log("capture start", BASE);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1440,960"],
  defaultViewport: null,
});

const page = await browser.newPage();
page.setDefaultTimeout(45000);

/* ---------- Phase A: signed-out public + staff dialog ---------- */
await setDesktop(page);
await gotoPath(page, "/");
await dismissGuides(page);

/* Staff sign-in dialog (empty passcode) */
const opened = await clickText(page, /Staff access/);
if (!opened) {
  /* try footer */
  await page.evaluate(() => {
    const a = [...document.querySelectorAll("a,button")].find((n) => /Staff access/i.test(n.textContent || ""));
    if (a) a.click();
  });
}
await sleep(800);
await shot(page, "01-staff-signin.png");
/* close dialog if open */
await page.keyboard.press("Escape");
await sleep(300);

/* Student / public desktop */
await gotoPath(page, "/mentors");
await dismissGuides(page);
await shot(page, "16a-mentors.png", { fullPage: false });

const mentorHref = await page.evaluate(() => {
  const a = document.querySelector('a[href^="/mentors/"]');
  return a ? a.getAttribute("href") : "/mentors";
});
await gotoPath(page, mentorHref || "/mentors");
await shot(page, "16b-mentor-profile.png");

await gotoPath(page, "/how-it-works");
await dismissGuides(page);
await shot(page, "17a-how-it-works.png");
/* huddles / 1:1 — closest public copy */
await scrollToText(page, /huddle|one-to-one|1:1|live mentor|Bhubaneswar/i);
await shot(page, "10-huddles-scheduling.png");

await gotoPath(page, "/answers");
await dismissGuides(page);
await shot(page, "17b-answer-bank.png");

await gotoPath(page, "/account");
await dismissGuides(page);
await maskPii(page);
await shot(page, "18-account.png");

await setMobile(page);
await gotoHash(page, "#ask");
await dismissGuides(page);
await shot(page, "14-ask-desk-mobile.png", { fullPage: true });

await gotoHash(page, "#track");
await dismissGuides(page);
await shot(page, "15-track-mobile.png");

/* ---------- Phase B: staff via service token injection ---------- */
await setDesktop(page);
await page.evaluateOnNewDocument((tok) => {
  const orig = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : (input && input.url) || "";
    } catch { url = ""; }
    if (String(url).includes("/api/aym-store")) {
      const headers = new Headers(init.headers || (input && input.headers) || undefined);
      headers.set("Authorization", `Bearer ${tok}`);
      headers.set("Content-Type", headers.get("Content-Type") || "application/json");
      init = { ...init, headers, credentials: init.credentials || "include" };
    }
    return orig(input, init);
  };
}, token);

/* New page so evaluateOnNewDocument applies */
await page.close();
const staffPage = await browser.newPage();
staffPage.setDefaultTimeout(45000);
await setDesktop(staffPage);

await staffPage.evaluateOnNewDocument((tok) => {
  const orig = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let url = "";
    try {
      url = typeof input === "string" ? input : (input && input.url) || "";
    } catch { url = ""; }
    if (String(url).includes("/api/aym-store")) {
      const headers = new Headers(init.headers || (input && input.headers) || undefined);
      headers.set("Authorization", `Bearer ${tok}`);
      headers.set("Content-Type", headers.get("Content-Type") || "application/json");
      init = { ...init, headers, credentials: init.credentials || "include" };
    }
    return orig(input, init);
  };
}, token);

await gotoHash(staffPage, "#staff");
await dismissGuides(staffPage);
await maskPii(staffPage);
const staffOk = await staffPage.evaluate(async () => {
  try {
    const r = await fetch("/api/aym-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "whoami" }),
      credentials: "include",
    });
    const j = await r.json();
    return { status: r.status, staff: !!j.staff, role: j.role || "", service: !!j.service };
  } catch (e) {
    return { status: 0, staff: false, role: "", err: String(e && e.message) };
  }
});
console.log("whoami", JSON.stringify(staffOk));
await waitReady(staffPage, 3000);
await shot(staffPage, "02-staff-home.png");

/* Review invite create panel — empty state only */
await scrollToText(staffPage, /One-time review link/);
await staffPage.evaluate(() => {
  /* Ensure any previously shown URL is removed from DOM before shot */
  document.querySelectorAll(".staff-review-invite-url, .staff-review-invite-once").forEach((el) => {
    el.remove();
  });
});
await shot(staffPage, "11-review-invite-create.png");

await scrollToText(staffPage, /Access requests|Audit log|Data retention/);
await maskPii(staffPage);
await shot(staffPage, "13b-admin-access-audit.png");

await gotoHash(staffPage, "#insights");
await dismissGuides(staffPage);
await waitReady(staffPage, 3500);
await maskPii(staffPage);
await shot(staffPage, "03-insights.png");

await scrollToText(staffPage, /Briefing board/);
await maskPii(staffPage);
await shot(staffPage, "12-briefing-board.png");

await scrollToText(staffPage, /WAC delegates/);
await maskPii(staffPage);
await shot(staffPage, "09-wac-delegates.png");

await scrollToText(staffPage, /Faculty Q&A|Faculty/);
await shot(staffPage, "06-faculty-bank.png");

await gotoHash(staffPage, "#board");
await dismissGuides(staffPage);
await waitReady(staffPage, 2500);
await shot(staffPage, "04-theme-stage.png");

await gotoHash(staffPage, "#pack");
await dismissGuides(staffPage);
await waitReady(staffPage, 3000);
await maskPii(staffPage);
await shot(staffPage, "05-mentor-pack.png");

await gotoHash(staffPage, "#ai");
await dismissGuides(staffPage);
await waitReady(staffPage, 4000);
await shot(staffPage, "07-disha-desk.png");

const settingsClicked = await clickText(staffPage, /Settings/);
await sleep(800);
if (settingsClicked) {
  await scrollToText(staffPage, /DISHA settings|Spend|stream|Process|Retry|Test DISHA/i);
  await shot(staffPage, "08-disha-settings.png");
} else {
  console.log("warn: settings button not found");
  await shot(staffPage, "08-disha-settings.png");
}

await gotoHash(staffPage, "#curate");
await dismissGuides(staffPage);
await waitReady(staffPage, 3500);
await maskPii(staffPage);
await shot(staffPage, "13a-curation.png");

await gotoHash(staffPage, "#register");
await dismissGuides(staffPage);
await waitReady(staffPage, 2000);
await maskPii(staffPage);
await shot(staffPage, "13c-register-ops.png");

await gotoHash(staffPage, "#podcast");
await dismissGuides(staffPage);
await waitReady(staffPage, 2000);
await shot(staffPage, "13d-podcast-staff.png");

await browser.close();
console.log("capture done →", OUT);
