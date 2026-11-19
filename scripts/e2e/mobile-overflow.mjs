#!/usr/bin/env node
/**
 * 375×812 overflow smoke: serves dist/, drives headless Chrome, fails if a public route's
 * documentElement.scrollWidth > 375. Needs Google Chrome (or CHROME_PATH). No staff login.
 *
 *   npm run build && node scripts/e2e/mobile-overflow.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const ROUTES = ["/", "/welcome", "/mentors", "/track", "/about", "/how-it-works", "/programs", "/events", "/resources", "/contact", "/privacy", "/terms", "/disclaimer"];
const WIDTH = 375;

const chrome = process.env.CHROME_PATH
  || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
    .find(p => fs.existsSync(p));
if (!chrome) { console.log("SKIP  Chrome not found (set CHROME_PATH)."); process.exit(0); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.log("FAIL  dist/ missing — run npm run build first."); process.exit(1); }

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

const httpPort = await freePort();
const dbgPort = await freePort();
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, p);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end(); return; }
    res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
    res.end(buf);
  });
});
await new Promise(r => server.listen(httpPort, "127.0.0.1", r));
const base = `http://127.0.0.1:${httpPort}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aym-ovf-"));
const chromeProc = spawn(chrome, [
  `--remote-debugging-port=${dbgPort}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

async function waitJson(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`never ready: ${url}`);
}

function openCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("open", () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = nextId++;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { try { ws.close(); } catch { /* gone */ } },
    }));
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.res(msg.result);
      }
    });
    ws.addEventListener("error", reject);
  });
}

let failed = 0;
try {
  await waitJson(`http://127.0.0.1:${dbgPort}/json/version`);
  const page = await fetch(`http://127.0.0.1:${dbgPort}/json/new?${encodeURIComponent(`${base}/`)}`, { method: "PUT" }).then(r => r.json());
  const cdp = await openCdp(page.webSocketDebuggerUrl);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 812, deviceScaleFactor: 2, mobile: true });
  for (const route of ROUTES) {
    await cdp.send("Page.navigate", { url: `${base}${route}` });
    await new Promise(r => setTimeout(r, 1200));
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: "({ sw: document.documentElement.scrollWidth, body: document.body ? document.body.scrollWidth : 0 })",
      returnByValue: true,
    });
    const v = result.value || {};
    const overflow = Math.max(v.sw || 0, v.body || 0) - WIDTH;
    if (overflow > 1) {
      console.log(`FAIL  ${route}  scrollWidth=${v.sw} (overflow ${overflow}px)`);
      failed += 1;
    } else {
      console.log(`PASS  ${route}  scrollWidth=${v.sw}`);
    }
  }
  cdp.close();
} catch (err) {
  console.log(`FAIL  ${err.message}`);
  failed += 1;
} finally {
  chromeProc.kill("SIGKILL");
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* gone */ }
}
console.log(failed ? `\n${failed} route(s) overflow at ${WIDTH}px.` : `\n${ROUTES.length}/${ROUTES.length} routes fit ${WIDTH}px.`);
process.exit(failed ? 1 : 0);
