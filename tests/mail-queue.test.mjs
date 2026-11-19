/**
 * Outbound mail never blocks Ask / register. OTP is sealed in the queue, staff health has
 * error class + counts (no credentials, no digits), drain retries with backoff.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.OTP_COOKIE_SECRET = process.env.OTP_COOKIE_SECRET || "mail-queue-test-secret-0123456789abcdef";
process.env.AYM_MAIL = process.env.AYM_MAIL || "console";

const {
  sendOrQueue, enqueueMail, drainMailQueue, mailHealth, publicMailJob,
  sealOtp, openOtp, K_MAIL, K_MAIL_HEALTH,
} = await import("../server/mailQueue.js");
const { mailErrorClass, sanitizeMailError, sendMail } = await import("../server/mailer.js");

function mem() {
  const db = {};
  return {
    db,
    async get(k) { return k in db ? JSON.parse(JSON.stringify(db[k])) : null; },
    async set(k, v) { db[k] = JSON.parse(JSON.stringify(v)); },
    async del(k) { delete db[k]; },
    async list(prefix = "") { return Object.keys(db).filter(k => k.startsWith(prefix)); },
  };
}

function quotaErr() {
  const e = new Error("Resend rejected the email (429): daily sending quota exceeded");
  e.status = 429;
  return e;
}

test("mailErrorClass: quota vs auth vs network; sanitize strips keys and codes", () => {
  assert.equal(mailErrorClass({ status: 429, message: "daily quota" }), "quota");
  assert.equal(mailErrorClass({ status: 535, message: "Invalid login" }), "auth");
  assert.equal(mailErrorClass({ code: "ETIMEDOUT", message: "timed out" }), "network");
  const s = sanitizeMailError(new Error("OTP 482917 for meera@hall.org re_abc123sk-live"));
  assert.ok(!s.includes("482917"));
  assert.ok(!s.includes("meera@hall.org"));
  assert.ok(!/re_abc|sk-live/.test(s));
});

test("sendOrQueue: app path gets queued (not thrown); OTP sealed, no plaintext in the store", async () => {
  const store = mem();
  const otp = "482917";
  const r = await sendOrQueue(store, {
    send: async () => { throw quotaErr(); },
    template: "otp",
    to: "meera.iyer@gmail.com",
    payload: { name: "Meera", otp },
    otp,
  });
  assert.equal(r.delivery, "queued");
  const keys = await store.list(K_MAIL);
  const jobKey = keys.find(k => k !== K_MAIL_HEALTH);
  assert.ok(jobKey);
  const job = await store.get(jobKey);
  assert.equal(job.status, "queued");
  assert.equal(job.kind, "otp");
  assert.ok(job.otpSealed);
  assert.equal(job.otp, undefined);
  assert.equal(job.text, "");
  assert.equal(job.html, "");
  const blob = JSON.stringify(job);
  assert.ok(!blob.includes(otp), "OTP digits must not sit in the persisted job");
  assert.ok(!blob.includes("meera.iyer@gmail.com") || job.to === "meera.iyer@gmail.com");
  const pub = publicMailJob(job);
  assert.equal(pub.toMasked.includes("@"), true);
  assert.ok(!JSON.stringify(pub).includes(otp));
  assert.equal("otpSealed" in pub, false);
  assert.equal("html" in pub, false);
  assert.equal(openOtp(job.otpSealed), otp);
  const health = await mailHealth(store);
  assert.equal(health.queued, 1);
  assert.equal(health.lastErrorClass, "quota");
  assert.ok(health.provider && health.provider.primary);
  assert.ok(!JSON.stringify(health).includes(otp));
  assert.ok(!JSON.stringify(health).includes("SMTP_PASS"));
});

test("drain retries with backoff then sends; expired OTP is not sent", async () => {
  const store = mem();
  const otp = "482917";
  await sendOrQueue(store, {
    send: async () => { throw quotaErr(); },
    template: "otp",
    to: "meera.iyer@gmail.com",
    payload: { name: "Meera" },
    otp,
    now: 1_000_000,
  });
  const sent = [];
  const first = await drainMailQueue(store, {
    now: 1_000_000,
    send: async () => { throw quotaErr(); },
    wait: async () => {},
  });
  assert.equal(first.queued, 1);
  const job = await store.get((await store.list(K_MAIL)).find(k => k !== K_MAIL_HEALTH));
  assert.ok(job.nextAt > 1_000_000, "exponential backoff");
  assert.equal(job.status, "queued");

  const ok = await drainMailQueue(store, {
    now: job.nextAt,
    send: async msg => {
      sent.push(msg);
      return { delivery: "email" };
    },
  });
  assert.equal(ok.sent, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /482917/);
  assert.equal(sent[0].logLabel, "otp queued");
  assert.equal((await mailHealth(store)).queued, 0);

  await enqueueMail(store, {
    kind: "otp", to: "old@hall.org", otp: "111222", payload: { name: "Old" },
    expiresAt: 10,
  }, { now: 20 });
  const expired = await drainMailQueue(store, { now: 100, send: async () => { throw new Error("should not send"); } });
  assert.equal(expired.expired, 1);
  assert.equal(expired.sent, 0);
});

test("retryMailBacklog requeues failed jobs; staff health has no secrets", async () => {
  const store = mem();
  const enq = await enqueueMail(store, {
    kind: "answer-notice", to: "meera.iyer@gmail.com",
    payload: { name: "Meera", ticket: "AYM-Q-1", link: "https://ayushmarg.vercel.app/track" },
    lastError: quotaErr(),
  });
  const jobKey = K_MAIL + enq.id;
  const job = await store.get(jobKey);
  await store.set(jobKey, { ...job, status: "failed", attempts: 3, nextAt: Date.now() + 86400000 });
  let sent = 0;
  await store.set(jobKey, { ...(await store.get(jobKey)), status: "queued", nextAt: 0 });
  const drain = await drainMailQueue(store, { send: async () => { sent++; return { delivery: "email" }; } });
  assert.equal(drain.sent, 1);
  assert.equal(sent, 1);
  const h = await mailHealth(store);
  assert.equal(h.queued, 0);
  assert.ok(!JSON.stringify(h).includes("SMTP_PASS"));
  assert.ok(!JSON.stringify(h).includes("RESEND_API_KEY"));
});

test("Vercel never prints OTP digits (unconfigured transport throws into the queue)", async () => {
  const prevV = process.env.VERCEL;
  const prevMail = process.env.AYM_MAIL;
  process.env.VERCEL = "1";
  delete process.env.AYM_MAIL;
  const lines = [];
  const real = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); };
  try {
    const otp = "482917";
    const unconfigured = { kind: "console" };
    await assert.rejects(sendMail({
      to: "meera.iyer@gmail.com", subject: "code", text: `code ${otp}`, html: otp, otp, logLabel: "Verification code",
    }, { config: unconfigured }), /not configured/i);
    assert.ok(!lines.some(l => l.includes(otp)), `OTP leaked to logs: ${lines.join(" | ")}`);
    const store = mem();
    const r = await sendOrQueue(store, {
      send: () => sendMail({ to: "meera.iyer@gmail.com", subject: "code", text: "x", otp }, { config: unconfigured }),
      template: "otp", to: "meera.iyer@gmail.com", payload: { name: "Meera" }, otp,
    });
    assert.equal(r.delivery, "queued");
    assert.ok(!lines.some(l => l.includes(otp)));
  } finally {
    console.log = real;
    if (prevV == null) delete process.env.VERCEL; else process.env.VERCEL = prevV;
    if (prevMail == null) delete process.env.AYM_MAIL; else process.env.AYM_MAIL = prevMail;
  }
});

test("ask-receipt queues on provider fail and sends after recovery", async () => {
  const store = mem();
  let n = 0;
  const send = async () => {
    n += 1;
    if (n === 1) throw quotaErr();
    return { delivery: "email" };
  };
  const first = await sendOrQueue(store, {
    send,
    template: "ask-receipt",
    to: "meera.iyer@gmail.com",
    payload: { name: "Meera", ticket: "AYM-Q-OV1", link: "https://ayushmarg.vercel.app/#track" },
    id: "ask-receipt:OV1",
  });
  assert.equal(first.delivery, "queued");
  assert.ok(await store.get(K_MAIL + "ask-receipt:OV1"));
  const report = await drainMailQueue(store, { send, wait: async () => {} });
  assert.equal(report.sent, 1);
  assert.equal(await store.get(K_MAIL + "ask-receipt:OV1"), null);
});

test("seal/open round-trip; empty without a code", () => {
  const blob = sealOtp("482917");
  assert.ok(blob);
  assert.ok(!blob.includes("482917"));
  assert.equal(openOtp(blob), "482917");
  assert.equal(sealOtp(""), "");
  assert.equal(openOtp("not-a-blob"), "");
});
