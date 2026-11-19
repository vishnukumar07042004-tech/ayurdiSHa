/**
 * CDN caching contract: hashed build output is immutable, unhashed images get a day, public
 * PII-free GET ops get a short shared-cache window, and every other API answer (staff, personal,
 * errors, cookies) is `private, no-store`.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const storeFile = path.join(os.tmpdir(), `aym-qa-caching-${process.pid}.json`);
fs.writeFileSync(storeFile, JSON.stringify({
  "aym:q:Q1": { id: "Q1", ticket: "AYM-Q-Q1", question: "How do I prepare for AIAPGET?", name: "Asha", email: "asha@delegates-qa.org", createdAt: 1_700_000_000_000 },
  "aym:podcasts": { talks: [{ id: "t1", title: "Hall talk", mentorName: "Dr. A", videoUrl: "https://youtu.be/dQw4w9WgXcQ" }], updatedAt: 1 },
}));
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock" });
const quiet = fn => (...a) => { if (!/\[aym-/.test(a.join(" "))) fn(...a); };
const real = { log: console.log, error: console.error, warn: console.warn };
console.log = quiet(real.log);
console.error = quiet(real.error);
console.warn = quiet(real.warn);

const { aymStoreHandler } = await import("../server/storePlugin.js");
const { serviceHeaders } = await import("./helpers/staffAuth.mjs");

let server;
let base;
before(async () => {
  server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  Object.assign(console, real);
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

async function post(op, payload = {}, headers = {}) {
  const r = await fetch(`${base}/api/aym-store`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ op, ...payload }),
  });
  await r.arrayBuffer();
  return { status: r.status, cc: r.headers.get("cache-control") || "" };
}

test("public GET ops: shared cache with s-maxage + stale-while-revalidate", async () => {
  for (const op of ["publicStats", "publicClusters", "podcastsList"]) {
    const r = await fetch(`${base}/api/aym-store?op=${op}`);
    const cc = r.headers.get("cache-control") || "";
    const body = await r.json();
    assert.equal(r.status, 200, op);
    assert.match(cc, /^public, /, op);
    assert.match(cc, /s-maxage=\d+/, op);
    assert.match(cc, /stale-while-revalidate=\d+/, op);
    if (op === "podcastsList") assert.equal(body.talks[0].title, "Hall talk");
  }
});

test("staff, personal and error answers are never cacheable", async () => {
  const cases = [
    await post("ping"),
    await post("whoami"),
    await post("lookup", { query: "AYM-Q-Q1" }),
    await post("staffCounts"),
    await post("staffCounts", {}, serviceHeaders()),
    await post("staffQuestionsPage", { limit: 10 }, serviceHeaders()),
    await post("staffSnapshot", {}, serviceHeaders()),
    await post("nope-op"),
  ];
  for (const r of cases) assert.equal(r.cc, "private, no-store", `status ${r.status}`);
  const refused = await fetch(`${base}/api/aym-store?op=staffSnapshot`);
  assert.equal(refused.status, 405);
  assert.equal(refused.headers.get("cache-control"), "private, no-store");
});

test("Firestore TTL backstop: short-lived KV kinds get expireAt ≥ their longest allowed retention", async () => {
  const { kvTtlMs } = await import("../server/store.js");
  const day = 86400e3;
  assert.ok(kvTtlMs("aym:otp:abc") >= 7 * day, "rate windows are 15 min; a week is a safe backstop");
  assert.ok(kvTtlMs("aym:wacrate:abc") >= 7 * day);
  assert.ok(kvTtlMs("aym:sess:" + "a".repeat(48)) >= 365 * day, "sessions outlive the max sessionDays (365)");
  assert.ok(kvTtlMs("aym:wacalert:x") >= 365 * day);
  assert.ok(kvTtlMs("aym:mail:otp:x") >= 30 * day, "queued mail jobs last a month");
  for (const k of ["aym:user:U1", "aym:email:a@b.c", "aym:regno:1", "aym:waclink:x", "aym:podcasts", "aym:staff:member:a@b.c"]) {
    assert.equal(kvTtlMs(k), 0, `${k} must never expire`);
  }
});

test("vercel.json: hashed build dir immutable, images a day, missing assets never fall back to HTML", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const ccFor = src => {
    const rule = cfg.headers.find(h => h.source === src);
    return rule && rule.headers.find(h => h.key === "Cache-Control").value;
  };
  assert.equal(ccFor("/assets/app/(.*)"), "public, max-age=31536000, immutable");
  assert.match(ccFor("/assets/(.*)"), /max-age=86400/);
  const order = cfg.headers.map(h => h.source);
  assert.ok(order.indexOf("/assets/app/(.*)") > order.indexOf("/assets/(.*)"), "immutable rule must win (listed later)");
  const spa = cfg.rewrites.find(r => r.destination === "/index.html" && r.source.includes("?!"));
  assert.match(spa.source, /assets\//);
  const vite = fs.readFileSync(path.join(root, "vite.config.js"), "utf8");
  assert.match(vite, /assetsDir:\s*"assets\/app"/);
  assert.equal(fs.existsSync(path.join(root, "public/assets/app")), false, "public/assets/app would be served as immutable");
});
