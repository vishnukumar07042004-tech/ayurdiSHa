/**
 * Burst-safe registration (store level): pass-number blocks over sharded counters, idempotent
 * per-email registration, no duplicate numbers under simulated Firestore contention, OTP limits
 * that don't block a venue NAT, mail retry/backoff, bounded side work, and load-test questions
 * never reaching DISHA. HTTP-level burst tests live in register-burst-http.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";

const realErr = console.error;
console.error = (...a) => { if (!/\[aym-/.test(a.join(" "))) realErr(...a); };

const { createSimFirestore, createMemoryStore } = await import("./helpers/simStore.mjs");
const P = await import("../server/passIssuer.js");
const R = await import("../server/register.js");
const L = await import("../server/otpLimits.js");
const { sendMail, mailErrorRetryable } = await import("../server/mailer.js");
const { mergeVisitDocs } = await import("../server/store.js");
const { publicStats, resetPublicStatsCache, K_PUBLIC_STATS } = await import("../server/publicStats.js");
const { enqueueQuestion } = await import("../server/ai/queue.js");
const { isLoadProbeQuestion, isProbeQuestion, LOAD_MARK } = await import("../shared/probe.js");

const WAC_RE = /^11WAC\/2026\/\d{4,6}$/;
const numOf = wac => Number(String(wac).split("/").pop());
const profileFor = email => ({ name: "Burst Delegate", age: 24, sex: "Female", institute: "Burst College", email });

async function register(store, email, opts = {}) {
  return R.completeRegistration(store, { profile: profileFor(email), emailLower: email.toLowerCase(), ...opts });
}

/** Every invariant the burst must keep, checked against the raw documents. */
function auditDelegates(values, { expectUsers }) {
  const users = [...values].filter(([k]) => k.startsWith(R.K_USER)).map(([, v]) => v);
  const regIdx = [...values].filter(([k]) => k.startsWith(R.K_REGNO));
  const emailIdx = [...values].filter(([k]) => k.startsWith(R.K_EMAIL));
  assert.equal(users.length, expectUsers, "one user per email");
  const nums = users.map(u => u.regNo);
  assert.ok(nums.every(n => WAC_RE.test(n)), "everyone has an issued pass number");
  assert.equal(new Set(nums).size, nums.length, "no duplicate pass numbers");
  assert.equal(regIdx.length, users.length, "one regno index per user (unused claims were released)");
  const byId = new Map(users.map(u => [u.id, u]));
  for (const [k, v] of regIdx) assert.equal(R.regnoIndexKey(byId.get(v.userId).regNo), k, "regno index points at its owner");
  assert.equal(emailIdx.length, users.length);
  for (const [k, v] of emailIdx) assert.equal(R.K_EMAIL + byId.get(v.userId).emailLower, k, "email index points at its owner");
  return nums.map(numOf).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Numbering scheme                                                    */
/* ------------------------------------------------------------------ */

test("shard blocks never overlap and together fill a contiguous range", () => {
  const seen = new Set();
  const per = 40;
  for (let shard = 0; shard < P.PASS_SHARDS; shard++) {
    for (let n = 0; n < per; n++) {
      const { first, last } = P.blockRange(100, P.shardBlockIndex(shard, n), P.PASS_BLOCK_SIZE);
      assert.equal(last - first + 1, P.PASS_BLOCK_SIZE);
      for (let x = first; x <= last; x++) { assert.ok(!seen.has(x), `number ${x} issued twice`); seen.add(x); }
    }
  }
  assert.equal(seen.size, P.PASS_SHARDS * per * P.PASS_BLOCK_SIZE);
  assert.equal(Math.min(...seen), 101);
  assert.equal(Math.max(...seen), 100 + seen.size);
});

test("first reservation starts above the legacy counter; load-test numbers live far above real ones", () => {
  const fresh = P.planShardReservation({ name: "wac-seq", shard: 0, shardDoc: null, legacyDoc: null });
  assert.equal(fresh.range.first, 1);
  const legacy = P.planShardReservation({ name: "wac-seq", shard: 0, shardDoc: null, legacyDoc: { last: 137 } });
  assert.equal(legacy.range.first, 137 + P.LEGACY_MARGIN + 1, "room for old instances mid-deploy");
  assert.deepEqual(legacy.legacyWrite.blockBase, 187);
  const agreed = P.planShardReservation({ name: "wac-seq", shard: 3, shardDoc: null, legacyDoc: { last: 400, blockBase: 187 } });
  assert.equal(agreed.legacyWrite, null, "every shard agrees on the base fixed first");
  assert.equal(agreed.range.first, 187 + 3 * P.PASS_BLOCK_SIZE + 1);
  assert.equal(P.planShardReservation({ name: "wac-seq", shard: 0, shardDoc: null }).needsLegacy, true);
  const load = P.planShardReservation({ name: P.LOADTEST_COUNTER, shard: 0, shardDoc: null, legacyDoc: null });
  assert.equal(load.range.first, P.LOADTEST_BASE + 1);
});

test("contention errors are retried with jitter; other errors are not", async () => {
  for (let i = 0; i < 6; i++) {
    const d = P.jitterDelay(i, 60, 1500);
    const cap = Math.min(1500, 60 * 2 ** i);
    assert.ok(d >= cap / 2 && d <= cap, `attempt ${i}: ${d}`);
  }
  let calls = 0;
  const out = await P.withContentionRetry(async () => {
    calls++;
    if (calls < 3) { const e = new Error("10 ABORTED: Too much contention"); e.code = 10; throw e; }
    return "ok";
  }, { sleep: async () => {} });
  assert.equal(out, "ok");
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(P.withContentionRetry(async () => { calls++; throw new Error("permission denied"); }, { sleep: async () => {} }));
  assert.equal(calls, 1);
  assert.ok(P.isContention({ code: 14 }) && P.isContention({ message: "4 DEADLINE_EXCEEDED" }) && !P.isContention({ code: 6 }));
});

test("500 concurrent numbers from one instance: unique, contiguous, one reservation per block", async () => {
  const { store } = createMemoryStore();
  const nums = await Promise.all(Array.from({ length: 500 }, () => P.nextPassNumber(store)));
  assert.equal(new Set(nums).size, 500);
  assert.deepEqual([...nums].sort((a, b) => a - b), Array.from({ length: 500 }, (_, i) => i + 1));
  assert.equal(P.passPoolStats(store).reservations, 500 / P.PASS_BLOCK_SIZE);
});

/* ------------------------------------------------------------------ */
/* Registration bursts                                                 */
/* ------------------------------------------------------------------ */

test("500 parallel registrations on the in-memory adapter: all succeed, numbers 0001–0500, no duplicates", async () => {
  const { store, sim } = createMemoryStore();
  const emails = Array.from({ length: 500 }, (_, i) => `burst${i}@delegates.example`);
  const t0 = Date.now();
  const res = await Promise.all(emails.map(e => register(store, e)));
  const ms = Date.now() - t0;
  assert.deepEqual(res.map(r => r.code).filter(c => c !== 200), [], "no failures");
  const nums = auditDelegates(sim.values(), { expectUsers: 500 });
  assert.deepEqual(nums, Array.from({ length: 500 }, (_, i) => i + 1), "sequential with no gaps on one instance");
  assert.ok(ms < 20000, `took ${ms} ms`);
});

test("Firestore contention simulation: 20 instances, 500 delegates + 100 double-submits, 10% random aborts", async () => {
  const sim = createSimFirestore({ latencyMs: [0, 5], abortRate: 0.1, seed: { "meta/wac-seq": { last: 137 } } });
  const instances = Array.from({ length: 20 }, (_, i) => sim.instance(i));
  const emails = Array.from({ length: 500 }, (_, i) => `delegate${i}@hall.example`);
  // 100 delegates press Verify twice (or retry after a gateway timeout) and land on another instance.
  const jobs = [
    ...emails.map((e, i) => ({ e, inst: instances[i % 20] })),
    ...emails.slice(0, 100).map((e, i) => ({ e, inst: instances[(i + 7) % 20] })),
  ].sort(() => Math.random() - 0.5);
  const res = await Promise.all(jobs.map(j => register(j.inst, j.e).then(r => ({ ...r, email: j.e }))));

  assert.deepEqual(res.filter(r => r.code !== 200).map(r => r.body), [], "no failed registrations");
  const byEmail = new Map();
  for (const r of res) {
    const n = r.body.profile.regNo;
    if (byEmail.has(r.email)) assert.equal(byEmail.get(r.email), n, `${r.email} got two different numbers`);
    byEmail.set(r.email, n);
  }
  const nums = auditDelegates(sim.values(), { expectUsers: 500 });
  assert.ok(nums[0] > 137 + P.LEGACY_MARGIN, "never reuses numbers issued by the old counter");

  // The point of blocks + shards: no document absorbs one write per registration.
  const counterWrites = [...sim.counters.writesByDoc].filter(([k]) => k.startsWith("meta/wac-seq"));
  const hottest = Math.max(...counterWrites.map(([, n]) => n));
  assert.ok(hottest <= 40, `hottest counter doc took ${hottest} writes for 600 registrations`);
  assert.ok(sim.counters.reservations <= 500 / P.PASS_BLOCK_SIZE + 20 * 2 + 10, `reservations ${sim.counters.reservations}`);
  assert.ok(sim.counters.aborts + sim.counters.contention > 0, "contention was actually exercised");
  const shardDocs = [...sim.values()].filter(([k]) => /^meta\/wac-seq~s\d+$/.test(k)).map(([, v]) => v);
  const reservedNumbers = shardDocs.reduce((s, d) => s + d.blocks * d.size, 0);
  assert.ok(reservedNumbers >= 500, "every issued number came from a reserved block");
  const base = 137 + P.LEGACY_MARGIN;
  // Shards advance roughly together, so the highest number stays near the count issued; the
  // temporary gaps below it fill as later blocks are taken from the lagging shards.
  const slack = 4 * P.PASS_SHARDS * P.PASS_BLOCK_SIZE;
  assert.ok(Math.max(...nums) - base <= reservedNumbers + slack, `roughly sequential: highest ${Math.max(...nums)}, reserved ${reservedNumbers}`);
  const blocks = shardDocs.map(d => d.blocks);
  assert.ok(Math.max(...blocks) - Math.min(...blocks) <= 8, `shards stay level (${blocks.join(",")})`);
});

test("the same delegate verifying 5 times at once on 5 instances gets exactly one number", async () => {
  const sim = createSimFirestore({ latencyMs: [0, 8], abortRate: 0.2 });
  const res = await Promise.all([0, 1, 2, 3, 4].map(i => register(sim.instance(i), "twice@hall.example")));
  assert.ok(res.every(r => r.code === 200));
  assert.equal(new Set(res.map(r => r.body.profile.regNo)).size, 1);
  assert.equal(new Set(res.map(r => r.body.token)).size, 5, "each attempt still gets its own session");
  auditDelegates(sim.values(), { expectUsers: 1 });
});

test("an issued number is never replaced, and a number taken by staff / legacy data is skipped", async () => {
  const { store, sim } = createMemoryStore();
  await store.set(R.regnoIndexKey("11WAC/2026/0001"), { userId: "staffassigned" });
  const a = await register(store, "first@hall.example");
  assert.equal(a.body.profile.regNo, "11WAC/2026/0002");
  const again = await register(store, "first@hall.example");
  assert.equal(again.body.profile.regNo, "11WAC/2026/0002", "re-verifying keeps the number");
  const viaMe = await R.ensureIssuedRegNo(store, { id: a.body.profile && (await store.get(R.K_EMAIL + "first@hall.example")).userId, email: "first@hall.example" });
  assert.equal(viaMe.regNo, "11WAC/2026/0002");
  assert.equal((await store.get(R.regnoIndexKey("11WAC/2026/0001"))).userId, "staffassigned");
  assert.ok(sim.values().size > 0);
});

test("load-test registrations draw from their own counter and never touch the real sequence", async () => {
  const { store, sim } = createMemoryStore();
  const res = await Promise.all(Array.from({ length: 30 }, (_, i) => register(store, `aym-probe+load${i}@ayurdisha-qa.test`, { counter: P.LOADTEST_COUNTER, sessionExtra: { probe: true } })));
  const nums = res.map(r => numOf(r.body.profile.regNo)).sort((a, b) => a - b);
  assert.equal(nums[0], P.LOADTEST_BASE + 1);
  assert.equal(new Set(nums).size, 30);
  assert.equal(sim.values().get("aym:meta:wac-seq"), undefined, "real counter untouched");
  const real = await register(store, "real@hall.example");
  assert.equal(real.body.profile.regNo, "11WAC/2026/0001");
  const users = [...sim.values()].filter(([k]) => k.startsWith(R.K_USER)).map(([, v]) => v);
  assert.equal(users.filter(u => u.probe).length, 30);
  const sess = [...sim.values()].filter(([k]) => k.startsWith("aym:sess:")).map(([, v]) => v);
  assert.equal(sess.filter(s => s.probe).length, 30);
});

test("a registration that runs past the deadline answers 503 busy (retryable), not 500", async () => {
  const err = await P.withDeadline(() => new Promise(r => setTimeout(r, 200)), 20).catch(e => e);
  assert.equal(err.code, 503);
  assert.ok(err.deadline);
  const { store } = createMemoryStore();
  const stuck = { ...store, name: "stuck", update: () => new Promise(r => setTimeout(() => r(null), 300)) };
  const r = await R.completeRegistration(stuck, { profile: profileFor("slow@hall.org"), emailLower: "slow@hall.org", deadlineMs: 40 });
  assert.equal(r.code, 503);
  assert.equal(r.body.code, "busy");
  assert.match(r.body.error, /press Verify again/);
  const broken = { ...store, name: "broken", update: async () => { throw new Error("store exploded"); } };
  const b = await R.completeRegistration(broken, { profile: profileFor("x@hall.org"), emailLower: "x@hall.org" });
  assert.equal(b.code, 503, "store failures are retryable for the client, never a bare 500");
});

/* ------------------------------------------------------------------ */
/* Side work never fails the request                                   */
/* ------------------------------------------------------------------ */

test("bestEffort: errors are logged not thrown, slow work is cut off", async () => {
  assert.deepEqual(await P.bestEffort(async () => 7), { ok: true, value: 7 });
  assert.deepEqual(await P.bestEffort(async () => { throw new Error("boom"); }), { ok: false });
  const t0 = Date.now();
  const slow = await P.bestEffort(() => new Promise(r => setTimeout(r, 500)), { ms: 30 });
  assert.equal(slow.timedOut, true);
  assert.ok(Date.now() - t0 < 300);
});

test("visit counters spread over shards add up to the same totals", () => {
  const merged = mergeVisitDocs([
    { totals: { qr: 3 }, days: { "2026-12-10": { qr: 3 } }, updatedAt: 5 },
    { totals: { qr: 2, flyer: 1 }, days: { "2026-12-10": { qr: 1, flyer: 1 }, "2026-12-11": { qr: 1 } }, updatedAt: 9 },
  ]);
  assert.deepEqual(merged.totals, { qr: 5, flyer: 1 });
  assert.deepEqual(merged.days, { "2026-12-10": { qr: 4, flyer: 1 }, "2026-12-11": { qr: 1 } });
  assert.equal(merged.updatedAt, 9);
  assert.equal(mergeVisitDocs([]), null);
});

test("public stats: probe / load-test delegates never count, and cold instances reuse the shared cache", async () => {
  const { store } = createMemoryStore();
  await register(store, "counted@hall.example");
  await register(store, "aym-probe+x1@ayurdisha-qa.test", { counter: P.LOADTEST_COUNTER });
  resetPublicStatsCache();
  const first = await publicStats(store);
  assert.equal(first.registeredStudents, 1);
  assert.ok((await store.get(K_PUBLIC_STATS)).value, "shared cache written");
  await register(store, "later@hall.example");
  resetPublicStatsCache(); // a cold instance
  const cold = await publicStats(store);
  assert.equal(cold.registeredStudents, 1, "served from the shared record, no recompute");
});

/* ------------------------------------------------------------------ */
/* OTP limits                                                          */
/* ------------------------------------------------------------------ */

test("per-network limit is generous enough for a venue NAT; per-email window is strict", () => {
  assert.ok(L.OTP_IP_MAX >= 200);
  const lim = L.makeWindowLimiter({ windowMs: 1000, max: 3 });
  assert.ok(lim.hit("a", 0).ok && lim.hit("a", 1).ok && lim.hit("a", 2).ok);
  const blocked = lim.hit("a", 3);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryIn, 1);
  assert.ok(lim.hit("b", 3).ok, "other networks unaffected");
  assert.ok(lim.hit("a", 1001).ok, "window slides");

  const now = 10_000_000;
  const sends = Array.from({ length: L.OTP_EMAIL_MAX }, (_, i) => now - i * 1000);
  const v = L.otpEmailVerdict({ sends }, now);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "window");
  assert.ok(v.retryIn > 0);
  assert.equal(L.otpEmailVerdict({ sends: sends.map(t => t - L.OTP_EMAIL_WINDOW_MS) }, now).ok, true, "old sends expire");
  assert.equal(L.otpEmailVerdict(null, now).ok, true);
});

test("per-email slots are claimed atomically across instances and released when mail fails; store trouble fails open", async () => {
  const sim = createSimFirestore({ latencyMs: [0, 3], abortRate: 0.1 });
  const email = "rate@hall.example";
  const res = await Promise.all(Array.from({ length: 12 }, (_, i) => L.reserveOtpSend(sim.instance(i), email, 1_000_000 + i)));
  assert.equal(res.filter(r => r.ok).length, L.OTP_EMAIL_MAX, "exactly the window's worth, even when racing");
  const rec = sim.values().get(L.otpRateKey(email));
  await L.releaseOtpSend(sim.instance(0), email, rec.sends[0]);
  assert.equal(sim.values().get(L.otpRateKey(email)).sends.length, L.OTP_EMAIL_MAX - 1);
  assert.ok(!L.otpRateKey(email).includes("rate@"), "no raw email in the key");
  const broken = { name: "broken", async update() { throw new Error("store down"); } };
  assert.deepEqual(await L.reserveOtpSend(broken, email), { ok: true, degraded: true });
});

/* ------------------------------------------------------------------ */
/* Mail retry / backoff                                                */
/* ------------------------------------------------------------------ */

const resendCfg = { kind: "resend", apiKey: "test-key", from: "AYURDISHA <x@y.z>" };
const reply = (status, headers = {}) => ({ ok: status < 300, status, text: async () => "detail", headers: { get: k => headers[k.toLowerCase()] ?? null } });

test("mail: 429 / 5xx are retried with backoff, 4xx is not, reserved test domains are never sent", async () => {
  const msg = { to: "someone@hall.org", subject: "s", text: "t", html: "h" };
  let calls = 0;
  const waits = [];
  const flaky = async () => { calls++; return calls < 3 ? reply(calls === 1 ? 429 : 503, { "retry-after": "1" }) : reply(200); };
  const sent = await sendMail(msg, { config: resendCfg, fetch: flaky, sleep: async ms => { waits.push(ms); } });
  assert.equal(sent.delivery, "email");
  assert.equal(sent.via, "resend");
  assert.equal(calls, 3);
  assert.equal(waits.length, 2);
  assert.ok(waits[0] >= 1000 && waits[0] <= 3250, `honours Retry-After (${waits[0]})`);

  calls = 0;
  await assert.rejects(sendMail(msg, { config: resendCfg, fetch: async () => { calls++; return reply(422); }, sleep: async () => {} }), /422/);
  assert.equal(calls, 1, "a rejected address is not retried");

  calls = 0;
  await assert.rejects(sendMail(msg, { config: resendCfg, fetch: async () => { calls++; return reply(500); }, sleep: async () => {} }), /500/);
  assert.equal(calls, 3, "gives up after three attempts");

  calls = 0;
  const probe = await sendMail({ ...msg, to: "aym-probe+x@ayurdisha-qa.test" }, { config: resendCfg, fetch: async () => { calls++; return reply(200); } });
  assert.deepEqual(probe, { delivery: "suppressed" });
  assert.equal(calls, 0);
  assert.ok(mailErrorRetryable({ code: "ETIMEDOUT" }) && mailErrorRetryable({ responseCode: 421 }) && !mailErrorRetryable({ responseCode: 550 }));
});

/* ------------------------------------------------------------------ */
/* DISHA daily cap is safe from load tests                             */
/* ------------------------------------------------------------------ */

test("load-test questions are never queued for DISHA (enqueue, regenerate or sweep)", async () => {
  const { store } = createMemoryStore();
  const rec = { id: "LOADQ1", ticket: "AYM-Q-LOADQ1", email: "aym-probe+l1@ayurdisha-qa.test", question: `${LOAD_MARK} burst question about PG entrance preparation` };
  assert.ok(isLoadProbeQuestion(rec) && isProbeQuestion(rec));
  assert.ok(!isLoadProbeQuestion({ ...rec, email: "real@hall.example" }), "real delegates are never treated as load tests");
  assert.ok(!isLoadProbeQuestion({ ...rec, question: "[TEST] Probe: normal probe" }), "the regular prod probe still exercises DISHA");
  const cfg = { enabled: true, streams: {}, dailySpendCapUSD: 10 };
  assert.deepEqual(await enqueueQuestion(store, rec, { cfg }), { queued: false, reason: "load-probe" });
  assert.deepEqual(await enqueueQuestion(store, rec, { cfg, force: true, anyStream: true }), { queued: false, reason: "load-probe" });
  assert.equal((await store.list("aym:ai:job:")).length, 0);
});
