#!/usr/bin/env node
/**
 * Staff access smoke (docs/security/STAFF-ACCESS-SPEC.md) — run AFTER deploying. Uses the service
 * token and a probe address `aym-probe+staff-<run>@ayurdisha-qa.test` (never mailed):
 *   1. service token is admin; passcode alone (legacy `login`) → 410; anonymous / wrong token → 403
 *   2. probe access request (pending) → its session sees no staff data
 *   3. it shows in Access requests → approve → staff ops work, admin-only ops refused
 *   4. revoke → refused at once; approve / revoke are in the audit log
 *   5. cleanup ALWAYS (even after a failure): revoke + purge probe requests, verify gone
 * Prints statuses and counts only — never the token, cookies or the passcode. Exit 1 on any failure.
 *
 *   AYM_SERVICE_TOKEN='…' node scripts/ops/staff-smoke.mjs [--base=https://ayushmarg.vercel.app]
 *   node scripts/ops/staff-smoke.mjs --local      # same steps on an isolated local file store
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const LOCAL = Boolean(args.local);
let BASE = String(args.base || args.url || "https://ayushmarg.vercel.app").replace(/\/$/, "");
let localServer = null;
let localStore = "";

if (LOCAL) {
  localStore = path.join(os.tmpdir(), `aym-staff-smoke-${process.pid}.json`);
  fs.writeFileSync(localStore, "{}");
  Object.assign(process.env, { AYM_STORE: "file", AYM_STORE_FILE: localStore, AYM_MAIL: "console", AYM_AI_NO_KICK: "1", AI_PROVIDER: "mock", NODE_ENV: "test" });
  delete process.env.VERCEL;
  const { useLocalStaffSecrets } = await import("../lib/localStaff.mjs");
  useLocalStaffSecrets();
  const quiet = fn => (...a) => { if (!/\[aym-|OTP for|Staff access request/.test(a.join(" "))) fn(...a); };
  console.error = quiet(console.error);
  console.log = quiet(console.log);
  const { aymStoreHandler } = await import("../../server/storePlugin.js");
  localServer = http.createServer(aymStoreHandler);
  await new Promise(r => localServer.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${localServer.address().port}`;
}

const { serviceHeaders, hasServiceToken, NO_TOKEN_HELP, redactToken } = await import("../lib/staffAuth.mjs");
if (!hasServiceToken()) { console.log(NO_TOKEN_HELP); process.exit(2); }

const RUN = Date.now().toString(36);
const PROBE = `aym-probe+staff-${RUN}@ayurdisha-qa.test`;

function client(headers = {}) {
  return async function call(op, body = {}) {
    try {
      const r = await fetch(`${BASE}/api/aym-store`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ op, ...body }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    } catch (e) {
      return { status: 0, body: { error: `network: ${e.message}` } };
    }
  };
}
const service = client(serviceHeaders());
const anon = client();
let probe = null;

const results = [];
async function step(name, fn) {
  try {
    const note = await fn();
    results.push(true);
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL  ${name} — ${redactToken(String(e && e.message || e)).replace(/aym_staff=[^;\s"]+/g, "aym_staff=<cookie>").slice(0, 300)}`);
  }
}
const check = (c, m) => { if (!c) throw new Error(m); };
const expect = (r, status, what) => { check(r.status === status, `${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); return r.body; };

console.log(`AYURDISHA staff access smoke → ${BASE} (run ${RUN})${LOCAL ? " [local file store]" : ""}\n`);

try {
  await step("service token is admin; legacy passcode login 410; anonymous and wrong token refused", async () => {
    const me = expect(await service("whoami"), 200, "whoami");
    check(me.staff === true && me.role === "admin" && me.service === true, `service token not accepted as admin (${JSON.stringify({ staff: me.staff, role: me.role })})`);
    expect(await anon("login", { pin: "smoke-not-a-passcode" }), 410, "legacy login");
    expect(await anon("staffSnapshot"), 403, "anonymous staffSnapshot");
    const wrong = client({ Authorization: `Bearer smoke-wrong-token-${"0".repeat(40)}` });
    expect(await wrong("staffSnapshot"), 403, "wrong token");
    return `weak passcode banner: ${me.weakPasscode ? "SHOWN (set a 12+ char ADMIN_PIN)" : "not shown"}`;
  });

  await step("probe access request → pending; its session sees no staff data", async () => {
    const made = expect(await service("testProbeStaffRequest", { email: PROBE, session: true }), 200, "testProbeStaffRequest");
    check(made.status === "pending", `status ${made.status}`);
    check(/^aym_staff=/.test(String(made.cookie || "")), "no probe session returned");
    probe = client({ cookie: made.cookie });
    const me = expect(await probe("whoami"), 200, "probe whoami");
    check(me.staff === false && me.status === "pending", `probe whoami ${JSON.stringify({ staff: me.staff, status: me.status })}`);
    const snap = await probe("staffSnapshot");
    check(snap.status === 403 && snap.body.code === "pending" && !snap.body.questions, `pending staffSnapshot HTTP ${snap.status} ${snap.body.code}`);
    for (const op of ["staffCounts", "staffQuestionsPage", "staffDelegatesPage", "staffClusters"]) {
      const r = await probe(op, {});
      check(r.status === 403 && !r.body.items && !r.body.clusters, `pending ${op}: HTTP ${r.status}`);
    }
  });

  await step("Access requests lists it; approve → staff ops work, admin-only ops refused", async () => {
    const reqs = expect(await service("staffRequests"), 200, "staffRequests");
    check((reqs.pending || []).some(m => m.email === PROBE), "probe not in pending");
    expect(await service("staffDecide", { email: PROBE, decision: "approve" }), 200, "approve");
    const me = expect(await probe("whoami"), 200, "probe whoami");
    check(me.staff === true && me.role === "co-admin", `after approve ${JSON.stringify({ staff: me.staff, role: me.role })}`);
    expect(await probe("visitSourcesGet"), 200, "co-admin visitSourcesGet");
    expect(await probe("aiStats"), 200, "co-admin aiStats");
    for (const op of ["staffAudit", "staffRequests", "aiConfigSet"]) {
      const r = await probe(op, {});
      check(r.status === 403 && r.body.code === "admin_only", `co-admin ${op}: HTTP ${r.status} ${r.body.code}`);
    }
    const counts = await probe("staffCounts");
    if (counts.status === 400 && /unknown op/i.test(String(counts.body.error || ""))) return "paged desk ops not on this deploy yet";
    expect(counts, 200, "co-admin staffCounts");
    const page = expect(await probe("staffQuestionsPage", { limit: 5 }), 200, "co-admin staffQuestionsPage");
    check(Array.isArray(page.items) && page.items.length <= 5, "page limit respected");
    expect(await probe("staffDelegatesPage", { limit: 5 }), 200, "co-admin staffDelegatesPage");
    return `desk counts: ${counts.body.questions} questions · ${counts.body.delegates} delegate records · page ${page.ms ?? "?"} ms`;
  });

  await step("revoke → refused at once; decisions in the audit log", async () => {
    expect(await service("staffDecide", { email: PROBE, decision: "revoke" }), 200, "revoke");
    const r = await probe("visitSourcesGet");
    check(r.status === 403 && r.body.code === "revoked", `after revoke HTTP ${r.status} ${r.body.code}`);
    const audit = expect(await service("staffAudit", { action: "access", limit: 100 }), 200, "staffAudit");
    const mine = (audit.entries || []).filter(e => e.target === PROBE).map(e => e.action);
    check(mine.includes("access.approve") && mine.includes("access.revoke"), `audit ${mine.join(",")}`);
    return `${mine.length} audit entries for the probe`;
  });
} finally {
  await step("cleanup: probe access requests purged", async () => {
    await service("staffDecide", { email: PROBE, decision: "revoke" });
    const purge = expect(await service("testProbeStaffPurge", {}), 200, "testProbeStaffPurge");
    const reqs = expect(await service("staffRequests"), 200, "staffRequests");
    const left = ["pending", "approved", "denied", "revoked"].flatMap(k => reqs[k] || []).filter(m => m.email === PROBE);
    check(left.length === 0, "probe still listed");
    return `removed ${(purge.removed || []).length} probe request(s)`;
  });
  if (localServer) localServer.close();
  if (localStore) { try { fs.unlinkSync(localStore); } catch { /* gone */ } }
}

const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} staff smoke steps passed.`);
process.exit(failed ? 1 : 0);
