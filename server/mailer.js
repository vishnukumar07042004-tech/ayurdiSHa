import { loadServerEnv } from "./env.js";
import { isUndeliverableTestAddress } from "../shared/probe.js";
import { displayPassId } from "../shared/passId.js";

function brandFrom(from, fallback) {
  const s = String(from || "").trim() || fallback;
  return s.replace(/AYURMARG/gi, "AYURDISHA");
}

/**
 * Email delivery for registration OTPs, answer notices, and staff codes.
 *
 * Production path (recommended): a dedicated transactional provider as primary
 * (RESEND_API_KEY — Resend / Postmark / SendGrid via MAIL_PROVIDER when wired) and Gmail SMTP
 * (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) as fallback, so a free Gmail daily quota never interrupts
 * OTP. Dual-provider send runs only when BOTH transports are already in env — keys are never
 * requested in chat. `MAIL_PROVIDER=resend|smtp|auto` picks the primary when both exist.
 *
 * When every transport fails, callers use `sendOrQueue` (mailQueue.js): Ask / register / staff
 * flows still succeed, the job is persisted, and a worker retries with backoff. OTP digits are
 * never returned to the client, never stored in staff-visible payloads, and never printed on
 * Vercel logs. Local `AYM_MAIL=console` still prints the code so QA tests can read it.
 *
 * Up to 3 attempts (6 s timeout each, 0.5 s / 1.5 s backoff, honours Retry-After ≤ 3 s) on
 * 429 / 5xx / network errors. Reserved test domains (*.test, example.*) are never sent to.
 * Provider limits: docs/qa/LOAD-READINESS.md.
 */
function resendCfg(env, from) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return { kind: "resend", apiKey: key, from: brandFrom(from, "AYURDISHA <onboarding@resend.dev>") };
}

function smtpCfg(env, from) {
  if (!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)) return null;
  return {
    kind: "smtp",
    host: String(env.SMTP_HOST).trim(),
    port: Number(env.SMTP_PORT || 587),
    user: String(env.SMTP_USER).trim(),
    pass: String(env.SMTP_PASS),
    from: brandFrom(from, String(env.SMTP_USER).trim()),
  };
}

export function mailConfig() {
  const env = loadServerEnv();
  // Local QA: AYM_MAIL=console prints mail to the server log instead of sending it.
  if (!process.env.VERCEL && String(process.env.AYM_MAIL || "").trim().toLowerCase() === "console") {
    return { kind: "console" };
  }
  const from = String(env.MAIL_FROM || "").trim();
  const resend = resendCfg(env, from);
  const smtp = smtpCfg(env, from);
  const prefer = String(env.MAIL_PROVIDER || "auto").trim().toLowerCase();
  let primary = null;
  let fallback = null;
  if (prefer === "smtp" && smtp) {
    primary = smtp;
    fallback = resend;
  } else if (prefer === "resend" && resend) {
    primary = resend;
    fallback = smtp;
  } else if (resend) {
    primary = resend;
    fallback = smtp;
  } else if (smtp) {
    primary = smtp;
  }
  if (!primary) return { kind: "console" };
  return fallback ? { ...primary, fallback } : primary;
}

/** Names only — never hosts with passwords, API keys, or mailbox addresses. */
export function mailProviderSummary(cfg = mailConfig()) {
  return {
    primary: String(cfg && cfg.kind || "console"),
    fallback: String(cfg && cfg.fallback && cfg.fallback.kind || ""),
  };
}

export function otpHtml(name, otp) {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Georgia,serif;background:#F5EBE0;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#FFFEFB;border:1px solid #D9CBB8;border-radius:18px;overflow:hidden">
    <div style="background:#1B4332;color:#F5EBE0;padding:22px 26px">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C4A484">AYURDISHA · Meet the Mentors</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px">Email verification</div>
    </div>
    <div style="padding:26px">
      <p style="margin:0 0 14px;color:#1A2E24;font-size:15px">Namaste${name ? " " + esc(name) : ""},</p>
      <p style="margin:0 0 18px;color:#5C6B62;font-size:14px;line-height:1.6">
        Use this one-time code to verify your email and complete your registration for the Meet the Mentors hall.
      </p>
      <div style="font-family:monospace;font-size:32px;letter-spacing:.35em;font-weight:700;color:#1B4332;background:#EDE4D4;border-radius:12px;padding:14px 18px;text-align:center">${esc(otp)}</div>
      <p style="margin:18px 0 0;color:#5C6B62;font-size:12.5px;line-height:1.6">
        The code expires in 10 minutes. If you did not request this, you can ignore this email.
      </p>
    </div>
  </div>
</div>`;
}

/** Retries for provider rate limits / hiccups; total stays well under the 30 s function limit. */
const MAIL_ATTEMPTS = 3;
const MAIL_ATTEMPT_TIMEOUT_MS = 6000;
const MAIL_BACKOFF_MS = [500, 1500];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 429 / 5xx / network / timeout are worth another try; 4xx (bad address, bad key) are not. */
export function mailErrorRetryable(err) {
  if (!err) return false;
  if (err.retryable === true) return true;
  if (err.retryable === false) return false;
  // SMTP: 4xx replies are transient, 5xx (e.g. 550 no such mailbox) are final — except Gmail daily quota.
  if (err.responseCode) {
    const code = Number(err.responseCode);
    if ([421, 450, 451, 452].includes(code)) return true;
    if (code === 550 && /quota|rate.?limit|daily.*send/i.test(String(err.message || err.response || ""))) return true;
  }
  const status = Number(err.status || 0);
  if (status === 429 || status >= 500) return true;
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ESOCKET|ECONNECTION|AbortError|aborted|network|fetch failed/i.test(`${err.code || ""} ${err.name || ""} ${err.message || ""}`);
}

/** Staff-visible class: quota vs auth vs network vs rejected. Never includes credentials. */
export function mailErrorClass(err) {
  if (!err) return "";
  if (err.errorClass) return String(err.errorClass);
  const status = Number(err.status || err.responseCode || 0);
  const blob = `${err.code || ""} ${err.name || ""} ${err.message || ""} ${err.response || ""}`;
  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED|daily user sending|sending quota/i.test(blob)) return "quota";
  if (status === 401 || status === 403 || status === 535 || /invalid.?login|auth|not authenticated|bad credentials|EAUTH/i.test(blob)) return "auth";
  if (status === 408 || status >= 500 || /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ESOCKET|AbortError|aborted|network|fetch failed|timed? ?out/i.test(blob)) return "network";
  return "rejected";
}

/** One line for staff health / job records — strips keys, passwords, and 6-digit codes. */
export function sanitizeMailError(err) {
  return String(err && (err.message || err) || "")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[mail]")
    .replace(/\b(re_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+)\b/g, "[key]")
    .replace(/\b\d{6}\b/g, "[code]")
    .replace(/pass(word)?["']?\s*[:=]\s*\S+/gi, "pass=[redacted]")
    .replace(/^\w+ \d{3}: /, "")
    .slice(0, 220);
}

let smtpTransport = null;
let smtpKey = "";

async function smtpFor(cfg) {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (smtpTransport && smtpKey === key) return smtpTransport;
  const { default: nodemailer } = await import("nodemailer");
  smtpTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: MAIL_ATTEMPT_TIMEOUT_MS,
    greetingTimeout: MAIL_ATTEMPT_TIMEOUT_MS,
    socketTimeout: MAIL_ATTEMPT_TIMEOUT_MS,
  });
  smtpKey = key;
  return smtpTransport;
}

async function sendOnce(cfg, { to, subject, text, html }, fetchImpl) {
  if (cfg.kind === "resend") {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MAIL_ATTEMPT_TIMEOUT_MS);
    try {
      const r = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        const err = new Error(`Resend rejected the email (${r.status}): ${detail.slice(0, 200)}`);
        err.status = r.status;
        const after = Number(r.headers && r.headers.get && r.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) err.retryAfterMs = Math.min(3000, after * 1000);
        throw err;
      }
      return { delivery: "email" };
    } finally {
      clearTimeout(timer);
    }
  }
  const transport = await smtpFor(cfg);
  await transport.sendMail({ from: cfg.from, to, subject, text, html });
  return { delivery: "email" };
}

async function sendWithRetries(cfg, msg, deps) {
  const wait = deps.sleep || sleep;
  let lastErr;
  for (let i = 0; i < MAIL_ATTEMPTS; i++) {
    try {
      return await sendOnce(cfg, msg, deps.fetch || fetch);
    } catch (err) {
      lastErr = err;
      if (!mailErrorRetryable(err) || i === MAIL_ATTEMPTS - 1) break;
      const base = err.retryAfterMs || MAIL_BACKOFF_MS[i] || 1500;
      await wait(base + Math.round(Math.random() * 250));
    }
  }
  throw lastErr;
}

function canFallback(err) {
  const klass = mailErrorClass(err);
  return klass === "quota" || klass === "network" || klass === "auth" || mailErrorRetryable(err);
}

/** Exported for tests: `deps` swaps fetch / config / sleep. Never logs OTP digits on Vercel. */
export async function sendMail({ to, subject, text, html, logLabel, otp }, deps = {}) {
  const cfg = deps.config || mailConfig();
  const msg = { to, subject, text, html };

  if (cfg.kind === "resend" || cfg.kind === "smtp") {
    if (isUndeliverableTestAddress(to)) return { delivery: "suppressed" };
    let lastErr;
    try {
      const r = await sendWithRetries(cfg, msg, deps);
      return { ...r, via: cfg.kind };
    } catch (err) {
      lastErr = err;
    }
    const fb = !deps.config && cfg.fallback && (cfg.fallback.kind === "resend" || cfg.fallback.kind === "smtp") ? cfg.fallback : null;
    if (fb && canFallback(lastErr)) {
      try {
        const r = await sendWithRetries(fb, msg, deps);
        return { ...r, via: fb.kind, fallbackUsed: true };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  if (process.env.VERCEL) {
    const err = new Error("Email delivery is not configured on this server.");
    err.retryable = true;
    err.errorClass = "network";
    throw err;
  }
  // Local QA only: AYM_MAIL=console is the delivery channel for tests. Digits are never logged on Vercel.
  const printOtp = otp && String(process.env.AYM_MAIL || "").trim().toLowerCase() === "console";
  if (printOtp) {
    console.log(`[aym-mail] DEV FALLBACK — no SMTP/RESEND creds configured. OTP for ${to}: ${otp}`);
  } else {
    console.log(`[aym-mail] DEV FALLBACK — no SMTP/RESEND creds configured. ${logLabel || subject} → ${to}`);
  }
  return { delivery: "console" };
}

/**
 * Sends the OTP. Returns { delivery: "email" | "console" }.
 * Throws only for hard transport errors when a real transport is configured.
 */
export async function sendOtpEmail(email, otp, name) {
  const subject = "Your AYURDISHA verification code";
  const text = `Namaste${name ? " " + name : ""},\n\nYour AYURDISHA verification code is: ${otp}\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`;
  return sendMail({
    to: email, subject, text, html: otpHtml(name, otp),
    logLabel: "Verification code",
    otp,
  });
}

function selectionHtml(row) {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Georgia,serif;background:#F5EBE0;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#FFFEFB;border:1px solid #D9CBB8;border-radius:18px;overflow:hidden">
    <div style="background:#1B4332;color:#F5EBE0;padding:22px 26px">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C4A484">AYURDISHA · Meet the Mentors</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px">Bhubaneswar selection</div>
    </div>
    <div style="padding:26px">
      <p style="margin:0 0 14px;color:#1A2E24;font-size:15px">Namaste${row.name ? " " + esc(row.name) : ""},</p>
      <p style="margin:0 0 18px;color:#5C6B62;font-size:14px;line-height:1.6">
        You have been selected for the AYURDISHA Meet the Mentors in-person programme at the
        11th World Ayurveda Congress, Bhubaneswar 2026.
      </p>
      ${row.passId && row.passId.id ? `<div style="font-family:monospace;font-size:28px;letter-spacing:.12em;font-weight:700;color:#1B4332;background:#EDE4D4;border-radius:12px;padding:14px 18px;text-align:center">${esc(row.passId.id)}</div>
      <p style="margin:8px 0 18px;color:#5C6B62;font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-align:center">Your ${esc(row.passId.label)}</p>` : ""}
      <p style="margin:0;color:#5C6B62;font-size:13.5px;line-height:1.6">
        Keep this email. Visit-date instructions will follow. This is a selection notice for the
        AYURDISHA hall — not a job offer, a Congress pass by itself, or medical advice.
      </p>
    </div>
  </div>
</div>`;
}

const ANSWER_PREHEADER = "A mentor has replied. Tap to view it on Track my answer.";

function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Notice only — the question and answer never appear in the email; the reader opens
 * Track my answer with the ticket prefilled. Table layout + inline styles for Gmail/Outlook.
 */
export function answerNoticeHtml({ name, ticket, link }) {
  const esc = escAttr;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const mono = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your AYURDISHA answer is ready</title>
</head>
<body style="margin:0;padding:0;background:#F6F1E7;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F6F1E7;font-size:1px;line-height:1px;">${esc(ANSWER_PREHEADER)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F1E7" style="background:#F6F1E7;">
  <tr>
    <td align="center" style="padding:32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:0 0 18px;font-family:${serif};font-size:22px;font-weight:700;letter-spacing:0.18em;color:#173F35;">AYURDISHA</td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E6DCC8;border-top:3px solid #C49A52;border-radius:16px;padding:36px 32px 32px;">
            <p style="margin:0 0 10px;font-family:${font};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#A97F3A;">Track my answer</p>
            <h1 style="margin:0 0 18px;font-family:${font};font-size:26px;line-height:1.25;font-weight:700;color:#1D2420;">Your answer is ready.</h1>
            <p style="margin:0 0 8px;font-family:${font};font-size:16px;line-height:1.6;color:#3E4843;">Namaste${name ? ` ${esc(name)}` : ""},</p>
            <p style="margin:0 0 26px;font-family:${font};font-size:16px;line-height:1.6;color:#3E4843;">A mentor has answered your question — your answer is now published on AYURDISHA. Open it with your ticket ID below.</p>
            ${ticket ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
              <tr><td style="padding:0 0 6px;font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#5B6560;">Your ticket ID</td></tr>
              <tr><td bgcolor="#F1F5F2" style="background:#F1F5F2;border:1px solid #CFDDD3;border-radius:10px;padding:12px 18px;font-family:${mono};font-size:20px;font-weight:700;letter-spacing:0.08em;color:#173F35;">${esc(ticket)}</td></tr>
            </table>` : ""}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
              <tr>
                <td align="center" bgcolor="#173F35" style="border-radius:999px;background:#173F35;">
                  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(link)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="#173F35"><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">View my answer</center></v:roundrect><![endif]-->
                  <!--[if !mso]><!--><a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${font};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;background:#173F35;border:1px solid #173F35;">View my answer</a><!--<![endif]-->
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:1px solid #EEE7DA;">
              <tr><td style="padding:18px 0 0;font-family:${font};font-size:14px;line-height:1.6;color:#3E4843;">
                <strong style="color:#173F35;">1.</strong>&nbsp; Tap <strong>View my answer</strong> — your ticket opens on Track my answer.<br>
                <strong style="color:#173F35;">2.</strong>&nbsp; Or open Track my answer and enter your ticket ID.
              </td></tr>
            </table>
            <p style="margin:0;font-family:${font};font-size:12.5px;line-height:1.6;color:#6F7873;">Button not working? Copy this link into your browser:<br><a href="${esc(link)}" target="_blank" style="color:#386B4D;text-decoration:underline;word-break:break-all;">${esc(link)}</a></p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 12px 0;font-family:${font};font-size:12px;line-height:1.6;color:#6F7873;">
            AYURDISHA · Meet the Mentors · 11th World Ayurveda Congress, Bhubaneswar<br>
            You're receiving this because you asked a question on AYURDISHA.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function answerNoticeText({ name, ticket, link }) {
  return [
    `Namaste${name ? " " + name : ""},`,
    "",
    "A mentor has answered your question — your answer is now published on AYURDISHA.",
    "",
    ...(ticket ? [`Your ticket ID: ${ticket}`, ""] : []),
    `View my answer: ${link}`,
    "",
    "1. Tap the link — your ticket opens on Track my answer.",
    "2. Or open Track my answer and enter your ticket ID.",
    "",
    "AYURDISHA · Meet the Mentors · 11th World Ayurveda Congress, Bhubaneswar",
    "You're receiving this because you asked a question on AYURDISHA.",
  ].join("\n");
}

export function answerNoticeSubject(ticket) {
  return `Your AYURDISHA answer is ready${ticket ? ` — ticket ${ticket}` : ""}`;
}

export function askReceivedSubject(ticket) {
  return `We received your AYURDISHA question${ticket ? ` — ticket ${ticket}` : ""}`;
}

export function askReceivedText({ name, ticket, link }) {
  return [
    `Namaste${name ? " " + name : ""},`,
    "",
    "We have received your question on AYURDISHA. A mentor will reply on Track my answer.",
    "",
    ...(ticket ? [`Your ticket ID: ${ticket}`, ""] : []),
    `Track my answer: ${link}`,
    "",
    "AYURDISHA · Meet the Mentors · 11th World Ayurveda Congress, Bhubaneswar",
  ].join("\n");
}

export function askReceivedHtml({ name, ticket, link }) {
  const esc = escAttr;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const mono = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Question received</title></head>
<body style="margin:0;padding:0;background:#F6F1E7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F1E7">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
      <tr><td align="center" style="padding:0 0 18px;font-family:${serif};font-size:22px;font-weight:700;letter-spacing:0.18em;color:#173F35;">AYURDISHA</td></tr>
      <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E6DCC8;border-top:3px solid #C49A52;border-radius:16px;padding:36px 32px 32px;">
        <p style="margin:0 0 10px;font-family:${font};font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#A97F3A;">Ask Desk</p>
        <h1 style="margin:0 0 18px;font-family:${font};font-size:24px;line-height:1.25;font-weight:700;color:#1D2420;">We received your question.</h1>
        <p style="margin:0 0 18px;font-family:${font};font-size:16px;line-height:1.6;color:#3E4843;">Namaste${name ? ` ${esc(name)}` : ""}, your question is with the mentor desk. When a mentor replies, you can open it on Track my answer with your ticket ID.</p>
        ${ticket ? `<p style="margin:0 0 8px;font-family:${font};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#5B6560;">Your ticket ID</p>
        <p style="margin:0 0 22px;font-family:${mono};font-size:20px;font-weight:700;letter-spacing:0.08em;color:#173F35;">${esc(ticket)}</p>` : ""}
        <p style="margin:0;font-family:${font};font-size:14px;"><a href="${esc(link)}" style="color:#173F35;font-weight:700;">Track my answer</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendAskReceivedEmail({ to, name, ticket, link }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const t = String(ticket || "").trim();
  return sendMail({
    to,
    subject: askReceivedSubject(t),
    text: askReceivedText({ name: first, ticket: t, link }),
    html: askReceivedHtml({ name: first, ticket: t, link }),
    logLabel: `Ask receipt for ${t || "question"}`,
  });
}

/** One notice when a mentor answers a student's Ask Desk question. Never carries the answer itself. */
export async function sendAnswerNotification({ to, name, ticket, link }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const t = String(ticket || "").trim();
  return sendMail({
    to,
    subject: answerNoticeSubject(t),
    text: answerNoticeText({ name: first, ticket: t, link }),
    html: answerNoticeHtml({ name: first, ticket: t, link }),
    logLabel: `Answer notice for ${t || "question"} link=${link}`,
  });
}

/** Staff-only: notify one selected student. Same transport as OTP. */
export async function sendSelectionEmail(row) {
  const name = String(row.name || "").trim();
  const email = String(row.email || "").trim();
  const passId = displayPassId(row);
  const subject = "AYURDISHA · You're selected for Meet the Mentors in Bhubaneswar";
  const text = `Namaste${name ? " " + name : ""},\n\nYou have been selected for the AYURDISHA Meet the Mentors in-person programme at the 11th World Ayurveda Congress, Bhubaneswar 2026.${passId.id ? `\n\nYour ${passId.text}` : ""}\n\nKeep this email. Visit-date instructions will follow.\n\nWorld Ayurveda Foundation · AYURDISHA\nThis is a selection notice — not a job offer or medical advice.`;
  return sendMail({
    to: email, subject, text, html: selectionHtml({ name, email, passId }),
    logLabel: `WAC selection notice for ${email}`,
  });
}

export function staffMailHtml(title, bodyHtml) {
  return `<div style="font-family:Georgia,serif;background:#F5EBE0;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#FFFEFB;border:1px solid #D9CBB8;border-radius:18px;overflow:hidden">
    <div style="background:#1B4332;color:#F5EBE0;padding:22px 26px">
      <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C4A484">AYURDISHA · Staff access</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px">${title}</div>
    </div>
    <div style="padding:26px;color:#1A2E24;font-size:14px;line-height:1.6">${bodyHtml}</div>
  </div>
</div>`;
}

/**
 * Staff sign-in code. On Vercel without a configured transport this refuses instead of printing
 * the code to the function log.
 */
export async function sendStaffCodeEmail(email, otp) {
  const cfg = mailConfig();
  if (cfg.kind === "console" && process.env.VERCEL) {
    const err = new Error("Email delivery is not configured for staff codes.");
    err.retryable = false;
    throw err;
  }
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const subject = "Your AYURDISHA staff sign-in code";
  const text = `Your AYURDISHA staff sign-in code is: ${otp}\n\nIt expires in 10 minutes. If you did not try to sign in to the AYURDISHA staff area, ignore this email and tell the admin.`;
  const html = staffMailHtml("Staff sign-in code", `
      <p style="margin:0 0 18px">Use this one-time code to finish signing in to the AYURDISHA staff area.</p>
      <div style="font-family:monospace;font-size:32px;letter-spacing:.35em;font-weight:700;color:#1B4332;background:#EDE4D4;border-radius:12px;padding:14px 18px;text-align:center">${esc(otp)}</div>
      <p style="margin:18px 0 0;color:#5C6B62;font-size:12.5px">The code expires in 10 minutes. If you did not try to sign in, ignore this email and tell the admin.</p>`);
  return sendMail({ to: email, subject, text, html, logLabel: "Staff sign-in code", otp }, { config: cfg });
}

/** Tells an admin that someone verified their email and is waiting for staff access. */
export async function sendStaffRequestEmail(adminEmail, requesterEmail, link) {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const subject = `New AYURDISHA staff access request — ${requesterEmail}`;
  const text = `${requesterEmail} entered the staff passcode, verified their email and is asking for staff access.\n\nApprove or deny it in the staff area: ${link}\n\nIf you do not recognise this person, deny the request and consider changing the staff passcode.`;
  const html = staffMailHtml("New access request", `
      <p style="margin:0 0 14px"><b>${esc(requesterEmail)}</b> entered the staff passcode, verified their email and is asking for staff access.</p>
      <p style="margin:0 0 18px"><a href="${esc(link)}" style="color:#1B4332;font-weight:700">Open Access requests</a> to approve or deny.</p>
      <p style="margin:0;color:#5C6B62;font-size:12.5px">If you do not recognise this person, deny the request and consider changing the staff passcode.</p>`);
  return sendMail({ to: adminEmail, subject, text, html, logLabel: `Staff access request ${requesterEmail} → ${adminEmail}` });
}
