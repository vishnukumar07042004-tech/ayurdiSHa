/**
 * Staff access UI (docs/security/STAFF-ACCESS-SPEC.md): the 3-step entry dialog (passcode → email →
 * code → approved / pending / denied / revoked), the "Signed in as …" bar with the weak-passcode
 * banner, and the admin-only Access requests (with each person's signed-in devices) + Audit log
 * panels. The passcode lives only in this dialog's memory; it is sent once with the email
 * (`staffStart`) and never stored. A signed-in browser is a trusted device: the dialog remembers the
 * email and, while the device session is valid, goes straight to the staff area.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, Check, Clock, Copy, KeyRound, Laptop, Link2, Loader2, LogOut, Mail, RefreshCw, ShieldCheck, ShieldX, UserCheck, X } from "lucide-react";
import { aiApi } from "./aiApi.js";
import "../styles/staff-access.css";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STEP_NO = { passcode: 1, email: 2, code: 3 };

export const roleLabel = role => (
  role === "admin" ? "Admin" : role === "co-admin" ? "Co-admin" : role === "review" ? "Review" : ""
);

const DEVICE_KEY = "aym_staff_device";

/** `{ email, trusted }` for this browser (the email only — never a secret), or null. */
export function rememberedStaff() {
  try {
    const v = JSON.parse(window.localStorage.getItem(DEVICE_KEY) || "null");
    return v && EMAIL_RE.test(String(v.email || "")) ? { email: v.email, trusted: v.trusted === true } : null;
  } catch { return null; }
}

/** After a sign-in (`trusted: true`) or a sign-out (`false`, the email stays for the next time). */
export function rememberStaff(email, trusted) {
  try {
    if (EMAIL_RE.test(String(email || ""))) window.localStorage.setItem(DEVICE_KEY, JSON.stringify({ email, trusted: Boolean(trusted) }));
  } catch { /* private mode */ }
}

export function forgetStaffDevice() {
  const cur = rememberedStaff();
  if (cur) rememberStaff(cur.email, false);
}

function when(ms) {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return String(ms); }
}

const RESULT = {
  approved: { icon: ShieldCheck, tone: "gold", title: "You're in", lead: "Opening the staff area…" },
  pending: {
    icon: Clock, tone: "gold", title: "Waiting for admin approval",
    lead: "Your request was sent to the admin. You will see no staff data until it is approved. Check again after the admin approves it.",
  },
  denied: { icon: ShieldX, tone: "red", title: "Access was not approved", lead: "The admin did not approve this request. Contact the admin if you think this is a mistake." },
  revoked: { icon: ShieldX, tone: "red", title: "Your staff access was revoked", lead: "Contact the admin if you need access again." },
  "signed-out": { icon: KeyRound, tone: "gold", title: "Please sign in again", lead: "Your access changed since you signed in. Sign in again to continue." },
};

const RESULT_STATUSES = ["pending", "denied", "revoked", "signed-out"];

/**
 * @param {{ onClose: () => void, onSignedIn: (me: object) => void, onSignOut?: () => void,
 *   initialStatus?: string, initialEmail?: string, initialStep?: string, apiFn?: Function,
 *   remembered?: { email: string, trusted: boolean } | null }} props
 */
export function StaffAccessDialog({ onClose, onSignedIn, onSignOut, initialStatus = "", initialEmail = "", initialStep = "passcode", apiFn = aiApi, remembered: rememberedProp }) {
  const titleId = useId();
  const [remembered] = useState(() => (rememberedProp !== undefined ? rememberedProp : rememberedStaff()));
  const [step, setStep] = useState(() => (initialStatus ? "result" : remembered && remembered.trusted && initialStep === "passcode" ? "checking" : initialStep));
  const [status, setStatus] = useState(initialStatus);
  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState(initialEmail || (remembered && remembered.email) || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState("");

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (step !== "checking") return undefined;
    let cancelled = false;
    apiFn("whoami").then(me => {
      if (cancelled) return;
      if (me && me.staff) {
        rememberStaff(me.email || email, true);
        setStatus("approved");
        setStep("result");
        onSignedIn(me);
      } else if (me && RESULT_STATUSES.includes(me.status)) {
        setStatus(me.status);
        setStep("result");
      } else {
        forgetStaffDevice();
        setStep("passcode");
      }
    }).catch(() => { if (!cancelled) setStep("passcode"); });
    return () => { cancelled = true; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = useCallback(e => {
    const d = (e && e.data) || {};
    if (d.code === "bad_passcode") { setStep("passcode"); setPasscode(""); }
    if (d.code === "no_code" || d.code === "expired" || d.code === "too_many_codes") { setStep("email"); setOtp(""); }
    setError((e && e.message) || "Something went wrong. Try again.");
  }, []);

  const submitPasscode = () => {
    if (passcode.trim().length < 4) { setError("Enter the staff passcode."); return; }
    setError("");
    setStep("email");
  };

  const sendCode = async () => {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) { setError("Enter a valid email address."); return; }
    setBusy(true); setError("");
    try {
      const r = await apiFn("staffStart", { passcode: passcode.trim(), email: em });
      setDelivery(r && r.delivery ? r.delivery : "email");
      setEmail(em);
      setStep("code");
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) { setError("Enter the 6-digit code from your email."); return; }
    setBusy(true); setError("");
    try {
      const r = await apiFn("staffVerify", { email, otp: code });
      setPasscode("");
      rememberStaff(email, true);
      setStatus(r.status);
      setStep("result");
      if (r.status === "approved") {
        const me = await apiFn("whoami").catch(() => ({ staff: true, email, role: r.role, status: "approved" }));
        onSignedIn(me);
      }
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  const checkAgain = async () => {
    setBusy(true); setError("");
    try {
      const me = await apiFn("whoami");
      if (me.staff) { setStatus("approved"); onSignedIn(me); return; }
      setStatus(me.status && me.status !== "none" && me.status !== "expired" ? me.status : "");
      if (!me.status || me.status === "none" || me.status === "expired") setStep("passcode");
    } catch (e) { setError(e.message || "Could not check right now."); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    try { await apiFn("logout"); } catch { /* ignore */ }
    forgetStaffDevice();
    if (onSignOut) onSignOut();
    onClose();
  };

  const n = STEP_NO[step];
  const res = step === "result" ? (RESULT[status] || RESULT.pending) : null;
  const errId = `${titleId}-err`;
  const onEnter = fn => e => { if (e.key === "Enter" && !busy) fn(); };

  return (
    <div className="aym-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="aym-card ui-dialog staff-access-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="staff-access-close" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        {res ? (
          <>
            <span className={`ui-icon-badge ui-icon-badge--${res.tone === "red" ? "red" : "gold"}`}><res.icon size={22} aria-hidden="true" /></span>
            <div className="aym-eyebrow">Staff access</div>
            <h2 id={titleId} className="ui-dialog-title">{res.title}</h2>
            <p className="ui-dialog-lead">{res.lead}</p>
            {email && <p className="staff-access-email">Signed in as <strong>{email}</strong></p>}
            {error && <div id={errId} role="alert" className="aym-field-error">{error}</div>}
            {status !== "approved" && (
              <div className="ui-dialog-actions">
                {status === "pending" && (
                  <button type="button" className="aym-btn aym-btn-primary aym-btn-block" onClick={checkAgain} disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
                    <span>Check again</span>
                  </button>
                )}
                {status === "signed-out" && (
                  <button type="button" className="aym-btn aym-btn-primary aym-btn-block" onClick={() => { setStatus(""); setStep("passcode"); }}>Sign in again</button>
                )}
                <button type="button" className="aym-btn aym-btn-ghost aym-btn-block" onClick={signOut}>
                  <LogOut size={15} aria-hidden="true" /><span>Sign out</span>
                </button>
              </div>
            )}
          </>
        ) : step === "checking" ? (
          <>
            <span className="ui-icon-badge ui-icon-badge--gold"><ShieldCheck size={22} aria-hidden="true" /></span>
            <div className="aym-eyebrow">Staff access</div>
            <h2 id={titleId} className="ui-dialog-title">Opening the staff area…</h2>
            <p className="ui-dialog-lead" role="status">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Checking this device's sign-in{email ? <> for <strong>{email}</strong></> : null}.
            </p>
          </>
        ) : (
          <>
            <span className="ui-icon-badge ui-icon-badge--gold">{step === "passcode" ? <KeyRound size={22} aria-hidden="true" /> : <Mail size={22} aria-hidden="true" />}</span>
            <div className="aym-eyebrow">Staff access · Step {n} of 3</div>
            <h2 id={titleId} className="ui-dialog-title">
              {step === "passcode" ? "Enter the staff passcode" : step === "email" ? "Your email" : "Enter the code we emailed you"}
            </h2>
            <ol className="staff-access-steps" aria-hidden="true">
              {[1, 2, 3].map(i => <li key={i} className={i < n ? "is-done" : i === n ? "is-current" : ""} />)}
            </ol>
            {step === "passcode" && (
              <>
                <p className="ui-dialog-lead">For AYURDISHA staff only. The passcode alone does not open the staff area — you will also confirm your email, and new staff need the admin's approval.</p>
                <label className="aym-visually-hidden" htmlFor={`${titleId}-pass`}>Staff passcode</label>
                <input id={`${titleId}-pass`} className="aym-input" type="password" value={passcode} autoFocus autoComplete="current-password"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
                  onChange={e => { setPasscode(e.target.value); setError(""); }} onKeyDown={onEnter(submitPasscode)} placeholder="Staff passcode" />
              </>
            )}
            {step === "email" && (
              <>
                <p className="ui-dialog-lead">We will email a 6-digit code to this address. Use the email the admin knows you by.</p>
                <label className="aym-visually-hidden" htmlFor={`${titleId}-email`}>Email</label>
                <input id={`${titleId}-email`} className="aym-input" type="email" inputMode="email" value={email} autoFocus autoComplete="email"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
                  onChange={e => { setEmail(e.target.value); setError(""); }} onKeyDown={onEnter(sendCode)} placeholder="you@example.com" />
              </>
            )}
            {step === "code" && (
              <>
                <p className="ui-dialog-lead">
                  {delivery === "queued"
                    ? "Your request is recorded. The verification email will arrive when mail capacity returns — type the code here when it lands."
                    : delivery === "console"
                      ? "Local preview: the code is printed in the server log."
                      : <>We sent a code to <strong>{email}</strong>. It is valid for 10 minutes; check spam if you do not see it.</>}
                </p>
                <label className="aym-visually-hidden" htmlFor={`${titleId}-otp`}>6-digit code</label>
                <input id={`${titleId}-otp`} className="aym-input staff-access-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} autoFocus
                  aria-invalid={error ? true : undefined} aria-describedby={error ? errId : undefined}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} onKeyDown={onEnter(verify)} placeholder="000000" />
              </>
            )}
            {error && <div id={errId} role="alert" className="aym-field-error">{error}</div>}
            <div className="ui-dialog-actions">
              <button type="button" className="aym-btn aym-btn-primary aym-btn-lg aym-btn-block" disabled={busy}
                onClick={step === "passcode" ? submitPasscode : step === "email" ? sendCode : verify}>
                {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                <span>{step === "passcode" ? "Continue" : step === "email" ? "Send code" : "Verify"}</span>
              </button>
              {step === "passcode" ? (
                <button type="button" className="aym-btn aym-btn-ghost aym-btn-block" onClick={onClose}>Cancel</button>
              ) : (
                <button type="button" className="aym-btn aym-btn-ghost aym-btn-block" disabled={busy}
                  onClick={() => { setError(""); setStep(step === "code" ? "email" : "passcode"); }}>Back</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** "Signed in as <email> (Admin) · Sign out · Sign out all my devices" + the weak-passcode banner. */
export function StaffIdentityBar({ me, onSignOut, apiFn = aiApi }) {
  const [busy, setBusy] = useState(false);
  if (!me || !me.staff) return null;
  const review = Boolean(me.reviewOnly || me.role === "review");
  const who = me.service ? "service token" : review ? "one-time review" : me.email;
  const signOut = () => { if (!review) forgetStaffDevice(); onSignOut(); };
  const signOutAll = async () => {
    if (typeof window !== "undefined" && !window.confirm("Sign out of the staff area on all your devices? Each one will need the passcode and an email code again.")) return;
    setBusy(true);
    try { await apiFn("staffSessionRevokeAll"); } catch { /* signed out below either way */ }
    finally { setBusy(false); }
    signOut();
  };
  const expiresLabel = me.expiresAt
    ? (() => { try { return new Date(me.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } })()
    : "";
  return (
    <div className="staff-identity" role="region" aria-label="Staff session">
      <div className="staff-identity-row">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>Signed in as <strong>{who}</strong> ({roleLabel(me.role) || "Staff"})</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="staff-identity-signout" onClick={signOut}>Sign out</button>
        {me.trustedDevice && !review && (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" className="staff-identity-signout" onClick={signOutAll} disabled={busy}>Sign out all my devices</button>
          </>
        )}
      </div>
      {review && (
        <div className="staff-identity-warn staff-identity-review" role="status">
          <Clock size={15} aria-hidden="true" />
          <span>Review session — read-only{expiresLabel ? ` · expires ${expiresLabel}` : ""}. Sign out when finished; the link cannot be reused.</span>
        </div>
      )}
      {me.role === "admin" && me.weakPasscode && (
        <div className="staff-identity-warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>The staff passcode is short. Set a longer passphrase (12+ characters) in <code>ADMIN_PIN</code> on Vercel and redeploy.</span>
        </div>
      )}
    </div>
  );
}

/** Admin only: create a one-time review URL (shown once; never emails the staff passcode). */
export function ReviewInvitePanel({ apiFn = aiApi }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [ttlMinutes, setTtlMinutes] = useState(45);

  const create = async () => {
    setBusy(true); setError(""); setCopied(false);
    try {
      const r = await apiFn("staffReviewInviteCreate", { ttlMinutes });
      setLink(r);
    } catch (e) {
      setLink(null);
      setError((e && e.message) || "Could not create a review link.");
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!link || !link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError("Copy failed — select the link and copy it manually.");
    }
  };

  const expiresLabel = link && link.expiresAt
    ? (() => { try { return new Date(link.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } })()
    : "";

  return (
    <section className="aym-card staff-panel" aria-labelledby="staff-review-invite-title">
      <div className="staff-panel-head">
        <h2 id="staff-review-invite-title"><Link2 size={18} aria-hidden="true" /> One-time review link</h2>
      </div>
      <p className="staff-panel-lead">Create a short-lived, single-use staff review URL for a coding agent or reviewer. No passcode in the link. After first use, logout, or expiry it dies.</p>
      <div className="staff-review-invite-row">
        <label className="staff-review-ttl">
          <span>Expires in</span>
          <select value={ttlMinutes} onChange={e => setTtlMinutes(Number(e.target.value))} disabled={busy}>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" onClick={create} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
          <span>Create one-time review link</span>
        </button>
      </div>
      {error && <div className="aym-field-error" role="alert">{error}</div>}
      {link && link.url && (
        <div className="staff-review-invite-once" role="status">
          <p><strong>Copy this link now</strong> — it is shown once and is not emailed.</p>
          <code className="staff-review-invite-url">{link.url}</code>
          <div className="staff-review-invite-actions">
            <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={copy}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copied ? "Copied" : "Copy link"}</span>
            </button>
            {expiresLabel && <span className="staff-review-invite-meta">Expires {expiresLabel}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

const GROUPS = [
  ["pending", "Waiting for approval"],
  ["approved", "Co-admins"],
  ["denied", "Denied"],
  ["revoked", "Revoked"],
];

/** A person's signed-in browsers with "Sign out this device" / "Sign out all devices". */
function MemberDevices({ email, devices, busy, onRevoke }) {
  if (!devices.length) return <p className="staff-devices-empty">Not signed in on any device.</p>;
  return (
    <div className="staff-devices">
      <ul className="staff-device-list" aria-label={`Devices signed in as ${email}`}>
        {devices.map(d => (
          <li key={d.device} className="staff-device">
            <Laptop size={13} aria-hidden="true" />
            <span className="staff-device-name">{d.browser}{d.current ? " (this device)" : ""}</span>
            <span className="staff-device-seen">last seen {when(d.lastSeenAt)}</span>
            <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={Boolean(busy)} onClick={() => onRevoke(email, d)}>
              {busy === `${email}:device:${d.device}` && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Sign out this device
            </button>
          </li>
        ))}
      </ul>
      {devices.length > 1 && (
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={Boolean(busy)} onClick={() => onRevoke(email, null)}>
          {busy === `${email}:devices` && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Sign out all devices
        </button>
      )}
    </div>
  );
}

/** Admin only: approve / deny / revoke co-admins and sign their devices out. */
export function AccessRequestsPanel({ apiFn = aiApi, initial = null, initialSessions = null, onChange }) {
  const [data, setData] = useState(initial);
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [reqs, devs] = await Promise.all([apiFn("staffRequests"), apiFn("staffSessions").catch(() => null)]);
      setData(reqs);
      setSessions(devs && Array.isArray(devs.sessions) ? devs.sessions : []);
    } catch (e) { setError(e.message || "Could not load access requests."); }
  }, [apiFn]);

  const devicesOf = email => (sessions || []).filter(d => d.email === email);

  const revokeDevice = async (email, d) => {
    const all = !d;
    const ask = all ? `Sign ${email} out on all devices? They stay a co-admin and can sign in again with the passcode and an email code.`
      : `Sign ${email} out on ${d.browser}?`;
    if (typeof window !== "undefined" && !window.confirm(ask)) return;
    setBusy(all ? `${email}:devices` : `${email}:device:${d.device}`); setError("");
    try {
      await apiFn(all ? "staffSessionRevokeAll" : "staffSessionRevoke", all ? { email } : { email, device: d.device });
      await load();
      if (onChange) onChange();
    } catch (e) { setError(e.message || "Could not sign that device out."); }
    finally { setBusy(""); }
  };

  useEffect(() => { if (!initial) load(); }, [initial, load]);

  const decide = async (email, decision) => {
    if (decision === "revoke" && typeof window !== "undefined" && !window.confirm(`Revoke staff access for ${email}? They are signed out at once.`)) return;
    setBusy(`${email}:${decision}`); setError("");
    try {
      await apiFn("staffDecide", { email, decision });
      await load();
      if (onChange) onChange();
    } catch (e) { setError(e.message || "Could not save that decision."); }
    finally { setBusy(""); }
  };

  const btn = (email, decision, label, cls) => (
    <button type="button" className={`aym-btn aym-btn-sm ${cls}`} disabled={Boolean(busy)} onClick={() => decide(email, decision)}>
      {busy === `${email}:${decision}` && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}{label}
    </button>
  );

  return (
    <section className="aym-card staff-panel" id="access" aria-labelledby="staff-access-requests">
      <div className="staff-panel-head">
        <h2 id="staff-access-requests"><UserCheck size={18} aria-hidden="true" /> Access requests</h2>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={load}><RefreshCw size={13} aria-hidden="true" />Refresh</button>
      </div>
      <p className="staff-panel-lead">People who entered the staff passcode and confirmed their email. Only approved co-admins can see staff data; the admin ({(data && data.admins || []).join(", ") || "set in STAFF_ADMIN_EMAILS"}) is fixed.</p>
      {error && <div role="alert" className="aym-field-error">{error}</div>}
      {!data ? <p className="staff-panel-empty">Loading…</p> : GROUPS.map(([key, label]) => {
        const rows = data[key] || [];
        if (key !== "pending" && !rows.length) return null;
        return (
          <div key={key} className={`staff-group staff-group--${key}`}>
            <h3>{label} <span className="staff-count">{rows.length}</span></h3>
            {!rows.length ? <p className="staff-panel-empty">No pending requests.</p> : (
              <ul className="staff-member-list">
                {rows.map(m => (
                  <li key={m.email} className="staff-member">
                    <div className="staff-member-who">
                      <strong>{m.email}</strong>
                      <span>{key === "pending" ? `Requested ${when(m.requestedAt)}` : `${label.replace(/s$/, "")} ${when(m.decidedAt)}${m.decidedBy ? ` by ${m.decidedBy}` : ""}`}</span>
                    </div>
                    <div className="staff-member-actions">
                      {key === "pending" && <>{btn(m.email, "approve", <><Check size={13} aria-hidden="true" />Approve</>, "aym-btn-primary")}{btn(m.email, "deny", "Deny", "aym-btn-ghost")}</>}
                      {key === "approved" && btn(m.email, "revoke", "Revoke", "aym-btn-ghost")}
                      {(key === "denied" || key === "revoked") && btn(m.email, "approve", "Approve", "aym-btn-ghost")}
                    </div>
                    {key === "approved" && <MemberDevices email={m.email} devices={devicesOf(m.email)} busy={busy} onRevoke={revokeDevice} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

const ACTION_FILTERS = [
  ["", "All actions"], ["access", "Access decisions"], ["review", "Review invites"], ["passcode", "Passcode attempts"], ["email", "Email codes"],
  ["session", "Sign-outs"], ["answer", "Answers"], ["clusters", "Curation"], ["settings", "Settings"], ["wac", "WAC"],
  ["faculty", "Faculty bank"], ["export", "Exports"], ["retention", "Retention"], ["probe", "Probes"],
];

/** Admin only: the staff audit log, newest first. */
export function AuditLogPanel({ apiFn = aiApi, initial = null }) {
  const [rows, setRows] = useState(initial ? initial.entries || [] : null);
  const [next, setNext] = useState(initial ? initial.next || 0 : 0);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (filter, before = 0) => {
    setBusy(true); setError("");
    try {
      const r = await apiFn("staffAudit", { action: filter, limit: 100, before });
      setRows(prev => (before && prev ? [...prev, ...(r.entries || [])] : r.entries || []));
      setNext(r.next || 0);
    } catch (e) { setError(e.message || "Could not load the audit log."); }
    finally { setBusy(false); }
  }, [apiFn]);

  useEffect(() => { if (!initial) load(""); }, [initial, load]);

  return (
    <section className="aym-card staff-panel" aria-labelledby="staff-audit-log">
      <div className="staff-panel-head">
        <h2 id="staff-audit-log"><ShieldCheck size={18} aria-hidden="true" /> Audit log</h2>
        <label className="staff-audit-filter">
          <span className="aym-visually-hidden">Filter by action</span>
          <select className="aym-input" value={action} onChange={e => { setAction(e.target.value); load(e.target.value); }}>
            {ACTION_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="staff-panel-lead">Who did what in the staff area. Passcodes and codes are never recorded; network addresses only as a hash.</p>
      {error && <div role="alert" className="aym-field-error">{error}</div>}
      {!rows ? <p className="staff-panel-empty">Loading…</p> : !rows.length ? <p className="staff-panel-empty">No entries yet.</p> : (
        <div className="staff-audit-scroll">
          <table className="staff-audit-table">
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Result</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id || `${r.at}-${r.action}`}>
                  <td>{when(r.at)}</td>
                  <td>{r.who}{r.role ? <span className="staff-audit-role"> · {roleLabel(r.role)}</span> : null}</td>
                  <td><code>{r.action}</code></td>
                  <td className="staff-audit-target">{r.target || "—"}</td>
                  <td>{r.ok ? "OK" : <span className="staff-audit-fail">Refused</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {next > 0 && (
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={busy} onClick={() => load(action, next)}>
          {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Load older entries
        </button>
      )}
    </section>
  );
}

const RETENTION_FIELDS = [
  ["auditDays", "Audit log", 30, 3650],
  ["sessionDays", "Delegate session records", 31, 365],
  ["otpRateDays", "Email-code rate records", 1, 90],
  ["wacRateDays", "WAC-ID rate records", 1, 90],
  ["probeDays", "Test-probe data", 1, 90],
];

const CLEANUP_LABELS = [
  ["staffAudit", "audit entries"], ["staffAttempts", "passcode-attempt records"], ["otpRate", "email-code rate records"],
  ["wacRate", "WAC-ID rate records"], ["sessions", "delegate sessions"], ["probeStaff", "probe access requests"], ["probeQuestions", "probe questions"],
];

/** Admin only: how long records are kept, and the cleanup the daily cron runs. */
export function RetentionPanel({ apiFn = aiApi, initial = null }) {
  const [values, setValues] = useState(initial);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initial) return;
    apiFn("staffRetentionGet").then(r => setValues(r.retention)).catch(e => setError(e.message || "Could not load retention settings."));
  }, [initial, apiFn]);

  const save = async () => {
    setBusy("save"); setError(""); setSaved(false);
    try { const r = await apiFn("staffRetentionSet", { retention: values }); setValues(r.retention); setSaved(true); }
    catch (e) { setError(e.message || "Could not save."); }
    finally { setBusy(""); }
  };

  const cleanup = async dryRun => {
    if (!dryRun && typeof window !== "undefined" && !window.confirm("Delete the expired records now? This cannot be undone.")) return;
    setBusy(dryRun ? "dry" : "apply"); setError("");
    try { setReport(await apiFn("staffCleanup", { dryRun })); }
    catch (e) { setError(e.message || "Cleanup failed."); }
    finally { setBusy(""); }
  };

  return (
    <section className="aym-card staff-panel" aria-labelledby="staff-retention">
      <div className="staff-panel-head">
        <h2 id="staff-retention"><Clock size={18} aria-hidden="true" /> Data retention</h2>
      </div>
      <p className="staff-panel-lead">Records older than these limits are deleted by the daily cleanup. Staff members and questions are never deleted here.</p>
      {error && <div role="alert" className="aym-field-error">{error}</div>}
      {!values ? <p className="staff-panel-empty">Loading…</p> : (
        <div className="staff-retention-grid">
          {RETENTION_FIELDS.map(([key, label, lo, hi]) => (
            <label key={key} className="staff-retention-field">
              <span>{label}</span>
              <span className="staff-retention-input">
                <input className="aym-input" type="number" min={lo} max={hi} value={values[key] ?? ""}
                  onChange={e => { setSaved(false); setValues(v => ({ ...v, [key]: e.target.value })); }} />
                <span>days</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="staff-retention-actions">
        <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" disabled={!values || Boolean(busy)} onClick={save}>
          {busy === "save" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Save limits
        </button>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={Boolean(busy)} onClick={() => cleanup(true)}>
          {busy === "dry" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Preview cleanup
        </button>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={Boolean(busy)} onClick={() => cleanup(false)}>
          {busy === "apply" && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}Run cleanup now
        </button>
        {saved && <span className="staff-retention-saved" role="status"><Check size={13} aria-hidden="true" /> Saved</span>}
      </div>
      {report && (
        <div className="staff-retention-report" role="status">
          <strong>{report.dryRun ? "Would delete" : "Deleted"}:</strong>{" "}
          {CLEANUP_LABELS.map(([k, label]) => `${typeof report[k] === "number" ? report[k] : 0} ${label}`).join(" · ")}
        </div>
      )}
    </section>
  );
}

/** The admin panels, shown in the staff portal for the admin only. */
export function StaffAdminPanels({ me, apiFn = aiApi, onChange }) {
  if (!me || !me.staff || me.role !== "admin") return null;
  return (
    <div className="staff-admin-panels">
      <ReviewInvitePanel apiFn={apiFn} />
      <AccessRequestsPanel apiFn={apiFn} onChange={onChange} />
      <AuditLogPanel apiFn={apiFn} />
      <RetentionPanel apiFn={apiFn} />
    </div>
  );
}
