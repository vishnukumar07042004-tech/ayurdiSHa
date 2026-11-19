/**
 * scripts/wac/import-delegates.mjs — CSV parsing, export mapping, validation stats and batching.
 * Dummy data only (reserved `.test` / `example` domains, made-up IDs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseCsv, exportMapping, delegateRowsFromGrid, fullName, attendanceFromType, derivePattern, idShape,
  analyseRows, summaryLines, importBatches, statsLines,
} from "../scripts/wac/import-delegates.mjs";

const HEADER = "Delegate ID,Title,Name,Email,Mobile,Address,Country,State,City,Delegate Type,Amount Paid,Date Created,Tracking ID,UTR No.,Organization Name";
const FIXTURE = "\uFEFF" + [
  HEADER,
  'zzq00001,Dr.,Asha  Testcase,Asha.Test@Example.test,9000000001,"12, Dummy Lane, Flat 3",India,Kerala,Kochi,General Delegates,,2026-01-01,TRK-FAKE-1,UTR-FAKE-1,',
  'ZZQ00002,Vaidya,Vaidya Ravi Sample,ravi@example.test,9000000002,"Line one\nLine two",India,Goa,Panaji,BAMS Students,,2026-01-02,TRK-FAKE-2,UTR-FAKE-2,"Dummy College, Test City"',
  'ZZQ00003,Ms.,Mira Fixture,not-an-email,9000000003,Somewhere,India,,City,Principals\' Conclave,,2026-01-03,TRK-FAKE-3,UTR-FAKE-3,',
  'ZZQ00002,Mr.,Dup Person,dup@example.test,9000000004,"say ""hi""",India,Delhi,Delhi,Online Delegate,,2026-01-04,TRK-FAKE-4,UTR-FAKE-4,',
  'ZZQZ00005,Prof.,Shared One,shared@example.test,09000000005,Addr,India,Bihar,Patna,PG(Ayurveda) student with stipend,,2026-01-05,TRK-FAKE-5,UTR-FAKE-5,',
  'ZZQ00006,Dr.,Shared Two,SHARED@example.test,9000000006,Addr,India,Bihar,Patna,Practitioners\' Conclave,,2026-01-06,TRK-FAKE-6,UTR-FAKE-6,',
  'ZZ-1,Dr.,Bad Id,badid@example.test,9000000007,Addr,India,Assam,Guwahati,General Delegate,,2026-01-07,TRK-FAKE-7,UTR-FAKE-7,',
  ",,,,,,,,,,,,,,",
].join("\r\n") + "\r\n";

const grid = () => parseCsv(FIXTURE);
const rows = () => delegateRowsFromGrid(grid());

test("parseCsv: BOM, CRLF, quoted commas / newlines / doubled quotes, blank rows dropped", () => {
  const g = grid();
  assert.equal(g.length, 8);
  assert.equal(g[0][0], "Delegate ID");
  assert.ok(g.every(r => r.length === 15));
  assert.equal(g[1][5], "12, Dummy Lane, Flat 3");
  assert.equal(g[2][5], "Line one\nLine two");
  assert.equal(g[2][14], "Dummy College, Test City");
  assert.equal(g[4][5], 'say "hi"');
});

test("exportMapping reads only the needed columns", () => {
  const headers = grid()[0];
  const m = exportMapping(headers);
  assert.deepEqual(Object.keys(m).sort(), ["category", "country", "email", "institution", "name", "phone", "state", "title", "wacId"]);
  const read = new Set(Object.values(m).map(i => headers[i]));
  for (const h of ["Address", "City", "Amount Paid", "Date Created", "Tracking ID", "UTR No."]) assert.ok(!read.has(h), h);
});

test("rows: normalised ID, title + name, lower-case email, no address / payment fields", () => {
  const r = rows();
  assert.equal(r[0].wacId, "ZZQ00001");
  assert.equal(r[0].name, "Dr. Asha Testcase");
  assert.equal(r[0].email, "asha.test@example.test");
  assert.equal(r[0].phone, "9000000001");
  assert.equal(r[1].name, "Vaidya Ravi Sample", "title not repeated");
  assert.equal(r[1].institution, "Dummy College, Test City");
  assert.equal(r[2].category, "Principals Conclave");
  assert.equal(r[2].state, "");
  const keys = new Set(r.flatMap(Object.keys));
  assert.deepEqual([...keys].sort(), ["attendance", "category", "country", "email", "institution", "line", "name", "phone", "state", "wacId"]);
  const flat = JSON.stringify(r);
  for (const v of ["Dummy Lane", "Kochi", "TRK-FAKE", "UTR-FAKE", "2026-01-0"]) assert.ok(!flat.includes(v), v);
});

test("fullName and attendanceFromType", () => {
  assert.equal(fullName("Dr. Prof.", "A B"), "Dr. Prof. A B");
  assert.equal(fullName("Dr.", "Dr A B"), "Dr A B");
  assert.equal(fullName("Prof.", "Dr. A B"), "Dr. A B");
  assert.equal(fullName("", "A B"), "A B");
  assert.equal(attendanceFromType("General Delegates"), "");
  assert.equal(attendanceFromType("Online Delegate"), "online");
  assert.equal(attendanceFromType("In-person delegate"), "in-person");
});

test("derivePattern covers all letters+digits IDs; literal prefix when shared", () => {
  assert.equal(derivePattern(["ABC12345", "ABC00001"]), "^ABC\\d{5}$");
  assert.equal(derivePattern(["ABC12345", "XYZ12345", "WXYZ12345"]), "^[A-Z]{3,4}\\d{5}$");
  assert.equal(derivePattern(["WAC-26/001", "WAC-26/002"]), "^WAC\\-\\d{2}\\/\\d{3}$");
  assert.ok(new RegExp(derivePattern(["WAC-26/001", "WAC-26/002"])).test("WAC-26/123"));
  assert.equal(idShape("ABC12345"), "AAA99999");
});

test("analyseRows: valid / invalid by reason / duplicates / shared emails / distributions", () => {
  const a = analyseRows(rows());
  assert.equal(a.total, 7);
  assert.equal(a.derivedPattern, "^ZZQ\\d{5}$", "dominant shape when an ID is not letters+digits");
  assert.equal(a.matchDerived, 5);
  const strict = analyseRows(rows(), { pattern: "^[A-Z]{3,4}\\d{5}$" });
  assert.equal(strict.valid, 4);
  assert.deepEqual(strict.byReason, {
    "email is not valid": 1,
    "duplicate registration ID (first row kept)": 1,
    "registration ID format not recognised": 1,
  });
  assert.equal(strict.duplicateIds, 1);
  assert.equal(strict.sharedEmails, 1);
  assert.equal(strict.sharedEmailIds, 2);
  assert.deepEqual(strict.prefixes, { ZZQ: 5, ZZQZ: 1, ZZ: 1 });
  assert.equal(strict.fill.state, 6);
  assert.equal(strict.fill.phone10, 6);
  assert.equal(strict.countries.India, 7);
  assert.equal(strict.attendance.online, undefined, "duplicate row with the online type is skipped");
  assert.equal(strict.placeholderIsReal, false);
});

test("summary output carries no row values", () => {
  const g = grid();
  const a = analyseRows(rows(), { pattern: "^[A-Z]{3,4}\\d{5}$" });
  const text = summaryLines(a, { mapping: exportMapping(g[0]), headers: g[0] }).join("\n");
  for (const v of ["ZZQ0000", "Asha", "Ravi", "Testcase", "example.test", "@", "90000000", "Kerala", "Dummy", "Kochi"]) {
    assert.ok(!text.includes(v), `summary leaks "${v}"`);
  }
  assert.match(text, /ZZQ: 5/);
  assert.match(text, /AAA99999: 5/);
});

test("importBatches: batches, retry on 503 with retryIn, re-login on 403, resume point on failure", async () => {
  const valid = analyseRows(rows(), { pattern: "^[A-Z]{3,4}\\d{5}$" }).validRows;
  const calls = [];
  let n = 0;
  let relogins = 0;
  const call = async (op, body) => {
    calls.push({ op, size: body.rows.length, batchId: body.batchId });
    n++;
    if (n === 2) return { status: 503, data: { error: "busy", retryIn: 1 } };
    if (n === 3) return { status: 403, data: { error: "staff only" } };
    return { status: 200, data: { imported: body.rows.length, created: body.rows.length, updated: 0, problemCount: 0 } };
  };
  const waits = [];
  const out = await importBatches(call, valid, {
    batch: 2, batchId: "cli-test", relogin: async () => { relogins++; }, wait: async ms => { waits.push(ms); },
  });
  assert.equal(out.ok, true);
  assert.equal(out.imported, valid.length);
  assert.equal(relogins, 1);
  assert.equal(waits[0], 1000);
  assert.ok(calls.every(c => c.op === "wacDelegatesImport" && c.batchId === "cli-test" && c.size <= 2));

  const fail = await importBatches(async () => ({ status: 400, data: { error: "unknown op" } }), valid, { batch: 2, start: 2, wait: async () => {} });
  assert.equal(fail.ok, false);
  assert.equal(fail.resumeAt, 2);
  assert.equal(fail.unknownOp, true);
});

test("statsLines prints counts, never alert IDs or emails", () => {
  const text = statsLines({
    total: 3, linked: 1, unlinked: 2, enabled: true, mode: "list", backend: "kv", pattern: "^[A-Z]{3,4}\\d{5}$",
    lastImport: { rows: 3, imported: 3, created: 3, updated: 0, skipped: 0 },
    alerts: [{ wacId: "ZZQ00009", maskedEmail: "zz•••@e•••.test" }],
  }).join("\n");
  assert.match(text, /LIVE/);
  assert.match(text, /Blocked-account alerts\s+1/);
  assert.ok(!text.includes("ZZQ00009") && !text.includes("•••"));
});

test("CLI --apply against the real handler: staff login, batched import, counts only, option goes live", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aym-wac-import-"));
  const storeFile = path.join(tmp, "store.json");
  const csvFile = path.join(tmp, "fake-export.csv");
  fs.writeFileSync(storeFile, "{}");
  fs.writeFileSync(csvFile, FIXTURE);
  Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: storeFile, AYM_MAIL: "console", AYM_AI_NO_KICK: "1" });
  delete process.env.WAC_VERIFY_MODE;
  delete process.env.WAC_SIGNIN;
  delete process.env.WAC_ID_PATTERN;
  const { serviceEnv, TEST_SERVICE_TOKEN } = await import("./helpers/staffAuth.mjs");
  const quiet = console.log;
  console.log = (...a) => { if (!/\[aym-/.test(a.join(" "))) quiet(...a); };
  const { aymStoreHandler } = await import("../server/storePlugin.js");
  const server = http.createServer((req, res) => aymStoreHandler(req, res));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const script = fileURLToPath(new URL("../scripts/wac/import-delegates.mjs", import.meta.url));
  const run = (...args) => new Promise(resolve => {
    execFile(process.execPath, [script, csvFile, ...args], { env: serviceEnv() },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
  });
  try {
    const r = await run("--apply", `--url=${url}`, "--batch=2", "--pattern=^[A-Z]{3,4}\\d{5}$");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Sent 4 · imported 4 · new 4/);
    assert.match(r.out, /Delegates on file\s+4 \(linked 0, unlinked 4\)/);
    assert.match(r.out, /Sign-in option\s+LIVE/);
    assert.match(r.out, /enabled=true comingSoon=false/);
    for (const v of ["ZZQ0000", "Asha", "example.test", "90000000", "Kerala", TEST_SERVICE_TOKEN]) assert.ok(!r.out.includes(v), `output leaks "${v.slice(0, 12)}"`);
    const saved = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    const recs = Object.entries(saved).filter(([k]) => k.startsWith("aym:wacdel:")).map(([, v]) => v);
    assert.equal(recs.length, 4);
    const asha = recs.find(x => x.wacId === "ZZQ00001");
    assert.equal(asha.name, "Dr. Asha Testcase");
    assert.equal(asha.category, "delegate");
    assert.ok(!JSON.stringify(saved).includes("Dummy Lane") && !JSON.stringify(saved).includes("UTR-FAKE"));

    const again = await run("--apply", `--url=${url}`, "--pattern=^[A-Z]{3,4}\\d{5}$");
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /imported 4 · new 0 · updated 4/, "re-running is an upsert");

    const badToken = await new Promise(resolve => execFile(process.execPath, [script, csvFile, "--apply", `--url=${url}`],
      { env: serviceEnv({ AYM_SERVICE_TOKEN: `wrong-${"x".repeat(40)}` }) }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr })));
    assert.notEqual(badToken.code, 0);
    assert.match(badToken.out, /staff auth failed/);
    assert.ok(!badToken.out.includes("wrong-xxxx"), "the token is never printed");
  } finally {
    server.close();
    console.log = quiet;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
