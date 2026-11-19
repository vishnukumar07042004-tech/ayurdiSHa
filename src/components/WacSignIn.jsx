import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Loader2, Lock, Mail, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { ASK_STAGES } from "../../shared/askOptions.js";
import { normalizeWacId, WAC_CONSENT_TEXT } from "../../shared/wacId.js";
import { currentSource } from "../askLink.js";
import "../styles/wac-signin.css";

const INTENT_KEY = "aym-wac-intent";
const API_TIMEOUT_MS = 30000;

async function call(op, payload = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const r = await fetch("/api/aym-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ op, ...payload }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || (r.status >= 500 ? "The server is busy right now. Please try again in a moment." : `Request failed (${r.status}).`));
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out. Check your connection and try again.");
    if (e.status == null && !e.data) e.network = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Verify is safe to repeat (the code stays valid until the account is saved). */
async function callRetry(op, payload, attempts = 3) {
  for (let i = 0; ; i++) {
    try { return await call(op, payload); }
    catch (e) {
      if (!(e.network || [502, 503, 504].includes(e.status)) || (e.data && e.data.code === "wac_unavailable") || i >= attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 1200 * 2 ** i));
    }
  }
}

let configPromise = null;
function loadConfig() {
  if (!configPromise) {
    configPromise = call("wacConfig").catch(() => ({ enabled: false, comingSoon: false }));
  }
  return configPromise;
}

/** `{ enabled, comingSoon }` from the server, fetched once per page; null while loading. */
export function useWacConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let live = true;
    loadConfig().then(c => { if (live) setCfg(c || { enabled: false }); });
    return () => { live = false; };
  }, []);
  return cfg;
}

/** Ask Desk → Register: open the WAC sign-in directly. */
export function markWacIntent() {
  try { sessionStorage.setItem(INTENT_KEY, "1"); } catch { /* private mode */ }
}

function takeWacIntent() {
  try {
    const v = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
    return v === "1";
  } catch { return false; }
}

/**
 * Signed-in account without a Delegate ID: "Registered for WAC? Link your Delegate ID" opens the
 * link flow inline. `pending` = the verified email matches several Delegate IDs.
 */
export function WacLinkPrompt({ token, email, pending = false, onLinked }) {
  const cfg = useWacConfig();
  const [open, setOpen] = useState(false);
  if (!token || !cfg || !cfg.enabled) return null;
  if (open) {
    return (
      <div className="wac-link-inline">
        <WacSignInFlow mode="link" token={token} defaultEmail={email || ""} onCancel={() => setOpen(false)}
          onSignedIn={(t, profile) => { setOpen(false); onLinked(t, profile); }} />
      </div>
    );
  }
  return (
    <div className="wac-link-prompt">
      {pending && <p className="wac-link-pending">Your email matches more than one WAC Delegate ID — choose yours to link it.</p>}
      <button type="button" className="wac-ask-link" onClick={() => setOpen(true)}>
        {pending ? "Choose your Delegate ID" : "Registered for WAC? Link your Delegate ID"} <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Small link for the Ask Desk signed-out card; renders nothing unless WAC sign-in is live. */
export function WacAskLink({ onClick }) {
  const cfg = useWacConfig();
  if (!cfg || !cfg.enabled) return null;
  return (
    <button type="button" className="wac-ask-link" onClick={() => { markWacIntent(); onClick(); }}>
      Registered for WAC 2026? Sign in with your WAC ID <ArrowRight size={14} aria-hidden="true" />
    </button>
  );
}

function WacField({ label, hint, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="aym-field wac-field">
      <label htmlFor={id} className="aym-field-label">{label}</label>
      {React.cloneElement(children, { id, "aria-describedby": hintId })}
      {hint && <div id={hintId} className="aym-field-hint">{hint}</div>}
    </div>
  );
}

function Alert({ tone = "bad", children }) {
  return <div className={`wac-alert wac-alert--${tone}`} role={tone === "bad" ? "alert" : "status"}>{children}</div>;
}

const LOCKED_ROWS = [
  ["wacId", "WAC Delegate ID"],
  ["name", "Name"],
  ["email", "Email"],
  ["institution", "Institution"],
  ["category", "Category"],
  ["country", "Country"],
  ["state", "State"],
  ["attendance", "Attendance"],
  ["phone", "Mobile"],
];

const ATTENDANCE = { "in-person": "In person", online: "Online" };

/**
 * WAC ID + email → code → confirm details. Calls onSignedIn(token, profile) at the end.
 * `mode="link"`: a signed-in account (session `token`) adds its Delegate ID — no confirm step.
 */
export function WacSignInFlow({ onSignedIn, themes = [], onUseEmail, mode = "signin", token = "", defaultEmail = "", onCancel }) {
  const linking = mode === "link";
  const [step, setStep] = useState("id");          // id | code | confirm
  const [wacId, setWacId] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [masked, setMasked] = useState("");
  const [delivery, setDelivery] = useState("email");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [session, setSession] = useState(null);    // { token, profile, record }
  const [stage, setStage] = useState("");
  const [interests, setInterests] = useState([]);
  const [consent, setConsent] = useState(false);
  const headRef = useRef(null);
  const inFlight = useRef(false);
  const otpName = useRef("code_" + Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => { if (headRef.current) headRef.current.focus(); }, [step]);

  async function run(fn) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr("");
    try { await fn(); }
    catch (e) {
      setErr(e.message || "Something went wrong. Try again.");
      if (e.data && e.data.retryIn) setCooldown(e.data.retryIn);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    const id = normalizeWacId(wacId);
    if (!id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr("Enter your WAC Delegate ID and the email you used on the WAC site.");
      return;
    }
    const r = await call("wacStart", { wacId: id, email: email.trim(), ...(linking ? { link: true, token } : {}) });
    setMasked(r.maskedEmail || "");
    setDelivery(r.delivery || "email");
    setCooldown(r.resendIn || 60);
    setOtp("");
    setStep("code");
  });

  const finish = (token, profile) => { onSignedIn(token, profile); };

  const verify = () => run(async () => {
    const code = otp.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) { setErr("Type the 6-digit code from the email."); return; }
    const src = currentSource();
    const r = await callRetry("wacVerify", {
      wacId: normalizeWacId(wacId), otp: code, ...(src ? { source: src } : {}), ...(linking ? { token } : {}),
    });
    if (!r || !r.token || !r.profile) { setErr("We could not finish signing you in. Try again."); return; }
    if (!r.needsConfirm) { finish(r.token, r.profile); return; }
    setSession({ token: r.token, profile: r.profile, record: r.record || {} });
    setStage(r.profile.stage || "");
    setStep("confirm");
  });

  const confirm = () => run(async () => {
    if (!stage) { setErr("Choose your career stage."); return; }
    if (!consent) { setErr("Tick the consent box to continue."); return; }
    const r = await callRetry("wacConfirm", { token: session.token, stage, interests, consent: true });
    finish(session.token, r.profile || session.profile);
  });

  const toggleInterest = name => setInterests(list => (
    list.includes(name) ? list.filter(x => x !== name) : list.length >= 5 ? list : [...list, name]
  ));

  if (step === "confirm" && session) {
    const rec = session.record || {};
    return (
      <form className="aym-card ui-form-card wac-card" onSubmit={e => { e.preventDefault(); confirm(); }} noValidate>
        <div className="aym-eyebrow">WAC 2026 · Step 3 of 3</div>
        <h3 className="ui-form-card-title" tabIndex={-1} ref={headRef}>Confirm your details</h3>
        <section className="wac-locked" aria-labelledby="wac-locked-h">
          <div className="wac-locked-head">
            <Lock size={15} aria-hidden="true" />
            <h4 id="wac-locked-h">From your WAC registration</h4>
          </div>
          <dl className="wac-locked-grid">
            {LOCKED_ROWS.filter(([k]) => rec[k]).map(([k, label]) => (
              <div key={k} className="wac-locked-row">
                <dt>{label}</dt>
                <dd>{k === "attendance" ? (ATTENDANCE[rec[k]] || rec[k]) : k === "category" ? rec[k].replace(/^\w/, c => c.toUpperCase()) : rec[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="wac-locked-note">Corrections are made on the WAC site — these fields can't be edited here.</p>
        </section>

        <WacField label="Your career stage" hint="Mentors use this to pitch their answer at the right level.">
          <select className="aym-input" value={stage} onChange={e => setStage(e.target.value)} required>
            <option value="">Select</option>
            {ASK_STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </WacField>

        {themes.length > 0 && (
          <fieldset className="wac-interests">
            <legend className="aym-field-label">Themes you are interested in <span className="wac-optional">(optional, up to 5)</span></legend>
            <div className="wac-interest-grid">
              {themes.map(t => (
                <label key={t} className={`wac-interest${interests.includes(t) ? " is-on" : ""}`}>
                  <input type="checkbox" checked={interests.includes(t)} onChange={() => toggleInterest(t)}
                    disabled={!interests.includes(t) && interests.length >= 5} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="wac-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
          <span>{WAC_CONSENT_TEXT}</span>
        </label>

        {err && <Alert>{err}</Alert>}
        <button type="submit" className="aym-btn aym-btn-primary aym-btn-lg aym-btn-block" disabled={busy}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <BadgeCheck size={16} />}
          {busy ? "Saving" : "Confirm and enter the hall"}
        </button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form className="aym-card ui-form-card ui-form-card--center wac-card" onSubmit={e => { e.preventDefault(); verify(); }} noValidate>
        <span className="ui-icon-badge ui-icon-badge--gold ui-form-done-icon"><Mail size={24} aria-hidden="true" /></span>
        <h3 className="ui-form-done-title" tabIndex={-1} ref={headRef}>Check {masked || "your WAC email"}</h3>
        <p className="ui-form-done-lead">
          We sent a 6-digit code to the email on your WAC registration. It expires in 10 minutes.
        </p>
        {delivery === "console" && (
          <Alert tone="warn">Email sending is not configured on this server yet, so the code was printed on the server console (dev mode). Ask the help desk staff for it.</Alert>
        )}
        {delivery === "queued" && (
          <Alert tone="warn">Your details are saved. The verification email will arrive when mail capacity returns — keep this page open and type the code when it lands.</Alert>
        )}
        {err && <Alert>{err}</Alert>}
        <input
          className="aym-input aym-otp-input"
          type="text"
          name={otpName.current}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="numeric"
          pattern="[0-9 ]*"
          maxLength={24}
          value={otp}
          autoFocus
          data-lpignore="true"
          data-1p-ignore="true"
          onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); if (err) setErr(""); }}
          placeholder="······"
          aria-label="6-digit code from your email"
        />
        <button type="submit" className="aym-btn aym-btn-primary aym-btn-lg aym-btn-block ui-otp-submit" disabled={busy}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={16} />}
          {busy ? "Checking" : linking ? "Verify and link" : "Verify and sign in"}
        </button>
        <div className="ui-btn-row ui-btn-row--center ui-otp-actions">
          <button type="button" className="aym-btn aym-btn-ghost" disabled={busy || cooldown > 0} onClick={start}>
            <RefreshCw size={14} />{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the code"}
          </button>
          <button type="button" className="aym-btn aym-btn-ghost" disabled={busy} onClick={() => { setStep("id"); setErr(""); }}>
            Change WAC ID or email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="aym-card ui-form-card wac-card" onSubmit={e => { e.preventDefault(); start(); }} noValidate>
      <div className="aym-eyebrow">WAC 2026 delegates</div>
      <h3 className="ui-form-card-title" tabIndex={-1} ref={headRef}>{linking ? "Link your WAC Delegate ID" : "Sign in with your WAC ID"}</h3>
      <p className="ui-form-card-lead">
        {linking
          ? "Use the Delegate ID and email from your World Ayurveda Congress registration. We send a one-time code to the email on that WAC record, then your Delegate ID appears on your pass and questions."
          : "Use the Delegate ID and email from your World Ayurveda Congress registration. We send a one-time code to the email on your WAC record — no password, no new form."}
      </p>
      <WacField label="WAC Delegate ID" hint="As printed on your WAC confirmation email or delegate badge.">
        <input className="aym-input wac-id-input" value={wacId} onChange={e => setWacId(e.target.value)}
          placeholder="e.g. ABC12345" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60} required />
      </WacField>
      <WacField label="Email used on the WAC site">
        <input className="aym-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
      </WacField>
      {err && <Alert>{err}</Alert>}
      <button type="submit" className="aym-btn aym-btn-primary aym-btn-lg aym-btn-block" disabled={busy || cooldown > 0}>
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Mail size={16} />}
        {busy ? "Checking your registration" : cooldown > 0 ? `Try again in ${cooldown}s` : linking ? "Send my code" : "Send my sign-in code"}
      </button>
      {onCancel && (
        <p className="ui-form-footnote">
          <button type="button" className="wac-text-btn" onClick={onCancel}>Not now</button>
        </p>
      )}
      {onUseEmail && (
        <p className="ui-form-footnote">
          Not registered on the WAC site? <button type="button" className="wac-text-btn" onClick={onUseEmail}>Register with email instead</button>
        </p>
      )}
    </form>
  );
}

/**
 * Register page: "I'm registered for WAC 2026" vs "New here". `children` is the existing
 * email registration form. Hidden (or "coming soon") when no WAC data source is configured.
 */
export default function WacRegisterGate({ children, onSignedIn, themes }) {
  const cfg = useWacConfig();
  const [mode, setMode] = useState(() => (takeWacIntent() ? "wac" : "email"));

  if (!cfg || !cfg.enabled) {
    return (
      <>
        {cfg && cfg.comingSoon && (
          <p className="wac-coming-soon">Registered for WAC 2026? Sign in with your WAC ID — coming soon.</p>
        )}
        {children}
      </>
    );
  }

  return (
    <>
      <div className="wac-choice" role="group" aria-label="How would you like to continue?">
        <button type="button" className={`wac-choice-card${mode === "wac" ? " is-on" : ""}`} aria-pressed={mode === "wac"} onClick={() => setMode("wac")}>
          <BadgeCheck size={22} aria-hidden="true" className="wac-choice-icon" />
          <span className="wac-choice-title">I'm registered for WAC 2026</span>
          <span className="wac-choice-sub">Sign in with WAC ID</span>
        </button>
        <button type="button" className={`wac-choice-card${mode === "email" ? " is-on" : ""}`} aria-pressed={mode === "email"} onClick={() => setMode("email")}>
          <UserPlus size={22} aria-hidden="true" className="wac-choice-icon" />
          <span className="wac-choice-title">New here</span>
          <span className="wac-choice-sub">Register with email</span>
        </button>
      </div>
      {mode === "wac"
        ? <WacSignInFlow onSignedIn={onSignedIn} themes={themes} onUseEmail={() => setMode("email")} />
        : children}
    </>
  );
}
