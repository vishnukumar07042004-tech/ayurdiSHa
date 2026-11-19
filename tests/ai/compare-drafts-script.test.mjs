/**
 * `scripts/ai/compare-drafts.mjs`: argument parsing (typos never start a live run) and the real
 * flow against the real HTTP handler on an isolated file store with the mock provider — a Gemini-only
 * draft gets its GPT side from `--enable --backfill`, `--status` changes nothing, `--disable` turns
 * compare mode off, and the printed lines carry counts and costs only. No network.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `aym-compare-script-${process.pid}.json`);
const QUESTION = "Who conducts AIAPGET 2026 and what is the application fee?";
const EMAIL = "compare.script@ayurdisha-qa.test";
fs.writeFileSync(storeFile, JSON.stringify({
  "aym:q:CMPS0001": {
    id: "CMPS0001", ticket: "AYM-Q-CMPS0001", createdAt: Date.now() - 60_000, name: "Compare Script Student", email: EMAIL,
    stage: "Intern", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch", question: QUESTION, context: "", consentPublish: "Yes",
  },
}));
Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", AI_MOCK_MODE: "ok" });
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;

const realLog = console.log;
const realWarn = console.warn;
const realErr = console.error;
console.log = (...a) => { if (!/\[aym-|OTP for/.test(a.join(" "))) realLog(...a); };
console.warn = () => {};
console.error = (...a) => { if (!/\[aym-/.test(a.join(" "))) realErr(...a); };

const { aymStoreHandler } = await import("../../server/storePlugin.js");
const { TEST_SERVICE_TOKEN } = await import("../helpers/staffAuth.mjs");
const { parseArgs, makeClient, runCompare, DEFAULT_BASE } = await import("../../scripts/ai/compare-drafts.mjs");

let server;
let base;
before(async () => {
  server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  console.log = realLog;
  console.warn = realWarn;
  console.error = realErr;
  try { fs.unlinkSync(storeFile); } catch { /* gone */ }
});

test("parseArgs: modes, limits, base URL, and errors for typos / conflicting modes", () => {
  const a = parseArgs(["--enable", "--backfill", "--limit=20", "--runs=15"]);
  assert.deepEqual({ enable: a.enable, backfill: a.backfill, limit: a.limit, runs: a.runs, base: a.base, help: a.help, errors: a.errors },
    { enable: true, backfill: true, limit: 20, runs: 15, base: DEFAULT_BASE, help: false, errors: [] });
  assert.equal(parseArgs(["--status"]).status, true);
  assert.equal(parseArgs(["--disable"]).disable, true);
  assert.equal(parseArgs([]).help, true, "no mode → usage, never a live run");
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--backfill", "--limit=999", "--runs=-3"]).limit, 200);
  assert.equal(parseArgs(["--backfill", "--runs=-3"]).runs, 0);
  assert.equal(parseArgs(["--backfill", "--limit=abc"]).limit, 20);
  assert.equal(parseArgs(["--backfill", "--no-run"]).noRun, true);
  assert.equal(parseArgs(["--status", "--base=http://127.0.0.1:5173/"]).base, "http://127.0.0.1:5173");
  assert.equal(parseArgs(["--status", "--url=http://localhost:1"]).base, "http://localhost:1");
  assert.match(parseArgs(["--enabel"]).errors.join(), /Unknown option: --enabel/);
  assert.match(parseArgs(["--enable", "--disable"]).errors.join(), /not both/);
  assert.match(parseArgs(["--status", "--enable"]).errors.join(), /read-only/);
  assert.match(parseArgs(["status"]).errors.join(), /Unknown option/);
});

test("runCompare on a local server: Hybrid (primary) draft → --enable --backfill adds the Gemini-only side; --status read-only; --disable", async () => {
  const call = makeClient(base);
  assert.equal((await call("whoami")).data.staff, true, "service token sent by the script client");
  assert.equal((await call("aiConfigSet", { patch: { enabled: true, shadowMode: false, streams: { "pg-entrance": true } } })).status, 200);

  const lines = [];
  const log = (k, v) => lines.push(`${k} ${v}`);
  const first = await runCompare(call, parseArgs(["--backfill", "--runs=4"]), { log, gapMs: 10 });
  assert.equal(first.ok, true, lines.join("\n"));
  assert.equal(first.config.compareMode, false);
  assert.ok(first.runs.some(r => r.done > 0), `worker drafted it: ${lines.join(" | ")}`);
  assert.equal(first.stats.compared, 0, "single Hybrid draft — nothing compared yet");
  const firstItem = (await call("aiQueue", { status: "all", shadow: true })).data.items.find(i => i.targetId === "CMPS0001");
  assert.equal(firstItem.aiDraft.drafter, "hybrid", "the primary is Hybrid");

  const second = await runCompare(call, parseArgs(["--enable", "--backfill", "--limit=20", "--runs=4"]), { log, gapMs: 10 });
  assert.equal(second.ok, true, lines.join("\n"));
  assert.equal(second.config.compareMode, true);
  assert.equal(second.backfill.preview.missingGemini, 1);
  assert.equal(second.backfill.preview.missingHybrid, 0, "the Hybrid draft already on the desk counts as its side");
  assert.equal(second.backfill.enqueued, 1);
  assert.equal(second.stats.compared, 1, lines.join("\n"));
  for (const id of ["hybrid", "gemini"]) {
    const side = second.stats.providers.find(p => p.provider === id);
    assert.equal(side.drafts, 1, id);
    assert.equal(side.errors, 0, id);
  }
  const q = await call("aiQueue", { status: "all", shadow: true });
  const item = q.data.items.find(i => i.targetId === "CMPS0001");
  assert.ok(item && item.aiDrafts && item.aiDrafts.hybrid && item.aiDrafts.gemini, "record has both sides");
  assert.equal(item.aiDrafts.gemini.status, "pending");
  assert.equal(item.aiDraft.answer, firstItem.aiDraft.answer, "the Hybrid draft on top is unchanged");

  const before = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  const status = await runCompare(call, parseArgs(["--status"]), { log, gapMs: 10 });
  assert.equal(status.ok, true);
  assert.equal(status.backfill.preview.willEnqueue, 0, "complete pair is not re-queued");
  assert.equal(status.backfill.enqueued, undefined, "status never queues");
  const afterStatus = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  assert.deepEqual(Object.keys(afterStatus).filter(k => k.includes("job")).sort(), Object.keys(before).filter(k => k.includes("job")).sort());

  const off = await runCompare(call, parseArgs(["--disable"]), { log, gapMs: 10 });
  assert.equal(off.ok, true);
  assert.equal(off.config.compareMode, false);
  assert.equal((await call("aiConfigGet")).data.config.compareMode, false);

  const out = lines.join("\n");
  for (const secret of [QUESTION, EMAIL, "Compare Script Student", "CMPS0001", "AYM-Q-CMPS0001", TEST_SERVICE_TOKEN]) assert.ok(!out.includes(secret), `output leaks ${secret === TEST_SERVICE_TOKEN ? "the service token" : secret}`);
  assert.match(out, /Compared\s+1 drafts with both sides/);
  assert.match(out, /Hybrid models/);
  assert.match(out, /Pipeline\s+classify Rules first/);
});
