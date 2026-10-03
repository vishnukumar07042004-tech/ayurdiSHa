import { loadServerEnv } from "./env.js";

function brandFrom(from, fallback) {
  const s = String(from || "").trim() || fallback;
  return s.replace(/AYURMARG/gi, "AYURDISHA");
}

/**
 * Email delivery for registration OTPs.
 * Priority: Resend API key > SMTP (nodemailer) > dev console fallback.
 * The OTP is NEVER returned to the client in any mode.
 */
export function mailConfig() {
  const env = loadServerEnv();
  const from = String(env.MAIL_FROM || "").trim();
  if (String(env.RESEND_API_KEY || "").trim()) {
    return { kind: "resend", apiKey: env.RESEND_API_KEY.trim(), from: brandFrom(from, "AYURDISHA <onboarding@resend.dev>") };
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return {
      kind: "smtp",
      host: String(env.SMTP_HOST).trim(),
      port: Number(env.SMTP_PORT || 587),
      user: String(env.SMTP_USER).trim(),
      pass: String(env.SMTP_PASS),
      from: brandFrom(from, String(env.SMTP_USER).trim()),
    };
  }
  return { kind: "console" };
}

function otpHtml(name, otp) {
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

async function sendMail({ to, subject, text, html, logLabel }) {
  const cfg = mailConfig();

  if (cfg.kind === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      throw new Error(`Resend rejected the email (${r.status}): ${detail.slice(0, 200)}`);
    }
    return { delivery: "email" };
  }

  if (cfg.kind === "smtp") {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transport.sendMail({ from: cfg.from, to, subject, text, html });
    return { delivery: "email" };
  }

  console.log(`[aym-mail] DEV FALLBACK — no SMTP/RESEND creds configured. ${logLabel || subject} → ${to}`);
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
    logLabel: `OTP for ${email}: ${otp}`,
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
      ${row.regNo ? `<div style="font-family:monospace;font-size:28px;letter-spacing:.12em;font-weight:700;color:#1B4332;background:#EDE4D4;border-radius:12px;padding:14px 18px;text-align:center">${esc(row.regNo)}</div>
      <p style="margin:8px 0 18px;color:#5C6B62;font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-align:center">Your WAC registration number</p>` : ""}
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
  const regNo = String(row.regNo || "").trim();
  const subject = "AYURDISHA · Selected for Bhubaneswar WAC Meet the Mentors";
  const text = `Namaste${name ? " " + name : ""},\n\nYou have been selected for the AYURDISHA Meet the Mentors in-person programme at the 11th World Ayurveda Congress, Bhubaneswar 2026.${regNo ? `\n\nYour WAC registration number: ${regNo}` : ""}\n\nKeep this email. Visit-date instructions will follow.\n\nWorld Ayurveda Foundation · AYURDISHA\nThis is a selection notice — not a job offer or medical advice.`;
  return sendMail({
    to: email, subject, text, html: selectionHtml({ name, email, regNo }),
    logLabel: `WAC selection notice for ${email}`,
  });
}
