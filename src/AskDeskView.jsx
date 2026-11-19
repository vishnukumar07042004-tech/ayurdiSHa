/**
 * Ask Desk — question-first stepper UI. Same fields, validation, consents, and submit
 * contract as before; layout and step order only.
 */
import React, { useState, useEffect, useMemo, useRef, useId, useCallback } from "react";
import {
  Send, Check, Loader2, Sparkles, ArrowRight, UserPlus, Lock, BadgeCheck,
  ChevronDown, Copy, CopyCheck, AlertCircle,
} from "lucide-react";
import { ASK_PROMPTS, pickAskExample } from "./content/askPrompts.js";
import { ASK_DESK_STRINGS as S } from "./content/askDeskStrings.js";
import { WAC } from "./content/site.js";
import { displayPassId, WAC_DELEGATE_ID_LABEL, PASS_NUMBER_LABEL } from "../shared/passId.js";
import { displayAskerName, displayAskerEmail, presentAskerRecord } from "../shared/account.js";
import { WacAskLink, WacLinkPrompt } from "./components/WacSignIn.jsx";
import { ASK_STAGES, ASK_STATES, ASK_REGISTERED, ASK_IN_PERSON } from "../shared/askOptions.js";
import { askSubmitError, isRetryable } from "./askSubmitError.js";
import { currentSource } from "./askLink.js";
import {
  TRACKS as PRODUCT_TRACKS,
  NOT_SURE_THEME,
  resolveTrackSelection,
} from "../shared/tracks.js";
import {
  CONGRESS_CORE_DAYS,
  KEY_DATES,
  PROMISE_SHORT,
  formatKeyDate,
  isIntakeOpen,
  intakeStatusLine,
} from "../shared/productConfig.js";
import { detectAskSafetyFlags, ASK_SAFETY_WARNING } from "../shared/askSafety.js";
import AskTriageHint from "./AskTriageHint.jsx";
import {
  loadAskQuestionDraft,
  saveAskQuestionDraft,
  clearAskQuestionDraft,
  askQuestionDraftDirty,
} from "./askDraft.js";
import "./styles/ask-form.css";

const TRACKS = PRODUCT_TRACKS.map((t) => ({ code: t.code, name: t.label, short: t.name, subs: t.subs }));
const NOT_SURE = NOT_SURE_THEME;
const STAGES = ASK_STAGES;
const STATES = ASK_STATES;
const CORE_DAYS = CONGRESS_CORE_DAYS;

const BLANK = {
  name: "", email: "", mobile: "", state: "", institution: "", stage: "",
  registered: "", regNo: "", inPerson: "", days: [],
  theme: "", subtheme: "", question: "", context: "", outcome: "",
  consentAnonPublish: false,
  consentNamedDisplay: false,
  consentRecording: false,
  consentFollow: false,
};

const STEP_IDS = ["question", "who", "consent", "review"];

function passAutofillNote(profile) {
  const pid = displayPassId(profile);
  if (!pid.id) return "";
  return pid.kind === "wac" ? S.who.filledNotice : `${S.who.filledNotice} · ${PASS_NUMBER_LABEL} ${pid.id}`;
}

function Field({ label, hint, required, children, counter, error, htmlFor }) {
  const autoId = useId();
  const fid = htmlFor || (React.isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  const described = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const isControl = React.isValidElement(children) && typeof children.type === "string"
    && /^(input|select|textarea)$/.test(children.type);
  const control = isControl
    ? React.cloneElement(children, {
        id: children.props.id || fid,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-describedby": described || children.props["aria-describedby"],
      })
    : children;
  return (
    <div className="aym-field">
      <label htmlFor={fid} className="aym-field-labelrow">
        <span className="aym-field-label">
          {label}{required && <span className="aym-field-req"> *</span>}
        </span>
        {counter && <span className="aym-mono aym-field-counter" aria-live={Number(String(counter).split("/")[0]) > 0 ? "polite" : "off"}>{counter}</span>}
      </label>
      {control}
      {hint && <div id={hintId} className="aym-field-hint">{hint}</div>}
      {error && <div id={errId} className="aym-field-error" role="alert">{error}</div>}
    </div>
  );
}

function Notice({ tone = "info", children }) {
  const role = tone === "bad" || tone === "warn" ? "alert" : "status";
  return (
    <div className={`aym-notice aym-notice--${tone}`} role={role}>
      <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

function Chip({ children }) {
  return <span className="aym-chip">{children}</span>;
}

function SidePanel({ className = "" }) {
  return (
    <aside className={`ask-side ${className}`} aria-label={S.side.title}>
      <h2 className="ask-side__title">{S.side.title}</h2>
      <ol className="ask-side__honesty">
        {S.side.honesty.map((h) => (
          <li key={h.step}>
            <strong>{h.step}</strong>
            <span>{h.body}</span>
          </li>
        ))}
      </ol>
      <h3 className="ask-side__title">{S.side.tipsTitle}</h3>
      <ul className="ask-side__tips">
        {S.side.tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="ask-side__privacy">
        <strong>{S.side.privacyTitle}. </strong>
        {S.side.privacyBody}{" "}
        <a href="/privacy">{S.side.privacyLink}</a>
        {S.side.privacyTail}
      </p>
    </aside>
  );
}

/**
 * @param {object} props
 * @param {object} props.runtime — api, store, hasApi, API_REQUIRED, loadLocalSession, ticketId, rid, anonIdFromEmail, K_Q
 */
export function AskView({ onSaved, preset, profile, onGoRegister, onProfile, runtime }) {
  const {
    api, store, hasApi, API_REQUIRED, loadLocalSession, ticketId, rid, anonIdFromEmail, K_Q,
  } = runtime;

  const intakeOpen = isIntakeOpen();
  const blankFromProfile = (p) => {
    const draft = loadAskQuestionDraft() || {};
    const next = {
      ...BLANK,
      ...draft,
      ...(preset || {}),
      ...(p ? {
        name: displayAskerName(p) || "",
        email: displayAskerEmail(p) || "",
        institution: p.institute || "",
        regNo: p.regNo || "",
      } : {}),
    };
    if (String(next.regNo || "").trim()) next.registered = "Yes";
    next.consentAnonPublish = !!(preset?.consentAnonPublish);
    next.consentNamedDisplay = !!(preset?.consentNamedDisplay);
    next.consentRecording = !!(preset?.consentRecording);
    next.consentFollow = !!(preset?.consentFollow);
    return next;
  };

  const [f, setF] = useState(() => blankFromProfile(profile));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [errs, setErrs] = useState([]);
  const [submitErr, setSubmitErr] = useState("");
  const [step, setStep] = useState(0);
  const [editIdentity, setEditIdentity] = useState(false);
  const [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const pending = useRef(null);
  const stepHeadingRef = useRef(null);
  const [autofillNote, setAutofillNote] = useState(() => passAutofillNote(profile));
  const [askExample] = useState(() => pickAskExample());
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const safety = useMemo(
    () => detectAskSafetyFlags(f.question, f.context, f.outcome),
    [f.question, f.context, f.outcome],
  );

  const qRef = useRef(null);
  useEffect(() => {
    const el = qRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 168)}px`;
  }, [f.question, step]);

  useEffect(() => {
    if (done) return undefined;
    const t = window.setTimeout(() => saveAskQuestionDraft(f), 400);
    return () => window.clearTimeout(t);
  }, [f, done]);

  useEffect(() => {
    if (done) return undefined;
    const onLeave = (e) => {
      if (!askQuestionDraftDirty(f)) return;
      e.preventDefault();
      e.returnValue = S.leaveWarn;
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [f, done]);

  useEffect(() => {
    stepHeadingRef.current?.focus?.();
  }, [step]);

  function autofill() {
    if (!profile) return;
    setF((p) => {
      const regNo = profile.regNo || p.regNo;
      return {
        ...p,
        name: displayAskerName(profile),
        email: displayAskerEmail(profile),
        institution: profile.institute,
        regNo,
        ...(String(regNo || "").trim() ? { registered: "Yes" } : {}),
      };
    });
    setAutofillNote(passAutofillNote(profile) || S.who.filledNotice);
  }

  useEffect(() => {
    if (!preset) return;
    setF((p) => {
      const next = { ...p, ...preset };
      if (String(next.regNo || "").trim()) next.registered = "Yes";
      return next;
    });
  }, [preset]);

  useEffect(() => {
    if (!profile) {
      setF((p) => ({
        ...p,
        name: "",
        email: "",
        institution: "",
        regNo: "",
        registered: p.registered === "Yes" ? "" : p.registered,
      }));
      setAutofillNote("");
      return;
    }
    setF((p) => {
      const regNo = p.regNo || profile.regNo || "";
      return presentAskerRecord({
        ...p,
        name: p.name || profile.name || "",
        email: p.email || profile.email || "",
        institution: p.institution || profile.institute || "",
        regNo,
        ...(String(regNo).trim() ? { registered: "Yes" } : {}),
      });
    });
    const note = passAutofillNote(profile);
    if (note) setAutofillNote(note);
  }, [profile]);

  const track = TRACKS.find((t) => t.name === f.theme);
  const subs = track
    ? track.subs
    : f.theme === NOT_SURE
      ? ["Choosing between pathways", "Building a skill", "Solving a project or research barrier", "Finding an official resource", "Testing an idea", "Something else"]
      : [];

  function applyPrompt(p) {
    const next = { theme: p.theme, subtheme: p.sub, question: p.text };
    setF((prev) => ({ ...prev, ...next }));
    saveAskQuestionDraft({ ...f, ...next });
    if (!profile) {
      onGoRegister?.({ theme: p.theme, subtheme: p.sub, question: p.text });
    }
  }

  function validate() {
    const e = [];
    if (!intakeOpen) e.push("intake is closed — browse the answer bank instead");
    if (!f.name.trim()) e.push("your name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.push("a valid email address");
    if (!f.state) e.push("your state or union territory");
    if (!f.institution.trim()) e.push("your institution");
    if (!f.stage) e.push("your programme or stage");
    if (!f.registered) e.push("whether you have registered for WAC 2026");
    const wac = String((profile && profile.regNo) || f.regNo || "").trim();
    if (!wac) e.push("your AYURDISHA pass number (open Register if it is missing)");
    if (!f.inPerson) e.push("whether you will attend in person");
    if (!f.theme) e.push("a career track");
    if (!f.subtheme) e.push("a sub-area");
    if (f.question.trim().length < 25) e.push("a question of at least 25 characters");
    return e;
  }

  function validateStep(i) {
    const e = [];
    if (i === 0) {
      if (!f.theme) e.push("a career track");
      if (!f.subtheme) e.push("a sub-area");
      if (f.question.trim().length < 25) e.push("a question of at least 25 characters");
    }
    if (i === 1) {
      if (!f.name.trim()) e.push("your name");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.push("a valid email address");
      if (!f.state) e.push("your state or union territory");
      if (!f.institution.trim()) e.push("your institution");
      if (!f.stage) e.push("your programme or stage");
      if (!f.registered) e.push("whether you have registered for WAC 2026");
      const wac = String((profile && profile.regNo) || f.regNo || "").trim();
      if (!wac) e.push("your AYURDISHA pass number (open Register if it is missing)");
      if (!f.inPerson) e.push("whether you will attend in person");
    }
    return e;
  }

  async function submit() {
    if (!profile || submitting.current || !intakeOpen) return;
    const e = validate();
    setErrs(e);
    setSubmitErr("");
    if (e.length) {
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    submitting.current = true;
    setBusy(true);
    const trackInfo = resolveTrackSelection(f.theme);
    const sig = JSON.stringify({
      ...f,
      consentAnonPublish: !!f.consentAnonPublish,
      consentNamedDisplay: !!f.consentNamedDisplay,
      consentRecording: !!f.consentRecording,
      consentFollow: !!f.consentFollow,
    });
    const again = pending.current && pending.current.sig === sig ? pending.current : null;
    const flagged = detectAskSafetyFlags(f.question, f.context, f.outcome);
    const rec = presentAskerRecord({
      ...f,
      id: again ? again.id : rid(10),
      ticket: again ? again.ticket : ticketId(),
      createdAt: again ? again.createdAt : Date.now(),
      question: f.question.trim(), context: f.context.trim(), outcome: f.outcome.trim(),
      name: displayAskerName(f),
      email: displayAskerEmail(f),
      regNo: String((profile && profile.regNo) || f.regNo || "").trim(),
      theme: trackInfo.theme || f.theme,
      track: trackInfo.trackLabel || f.theme,
      trackCode: trackInfo.trackCode || "",
      consentAnonPublish: f.consentAnonPublish ? "Yes" : "No",
      consentNamedDisplay: f.consentNamedDisplay ? "Yes" : "No",
      consentRecording: f.consentRecording ? "Yes" : "No",
      consentFollow: f.consentFollow ? "Yes" : "No",
      consentPublish: f.consentAnonPublish ? "Yes" : "No",
      safetyFlags: flagged.flags,
      anonId: await anonIdFromEmail(displayAskerEmail(f) || f.email),
      delegateNo: String((profile && profile.regNo) || f.regNo || "").trim(),
      ...(currentSource() ? { source: currentSource() } : {}),
    });
    pending.current = { sig, id: rec.id, ticket: rec.ticket, createdAt: rec.createdAt };
    try {
      if (API_REQUIRED || await hasApi()) {
        const s = loadLocalSession();
        const payload = { key: K_Q + rec.id, val: rec, token: s && s.token };
        let saved;
        try {
          saved = await api("set", payload);
        } catch (err) {
          if (!isRetryable(err)) throw err;
          await new Promise((r) => setTimeout(r, 1500));
          saved = await api("set", payload);
        }
        pending.current = null;
        clearAskQuestionDraft();
        onSaved && onSaved(rec, saved && saved.profile);
      } else {
        const ok = await store.set(K_Q + rec.id, rec);
        if (!ok) throw new Error("We could not save your question. Your question is still here — check your connection and press Send again.");
        pending.current = null;
        clearAskQuestionDraft();
        onSaved && onSaved(rec);
      }
      setDone(rec);
    } catch (err) {
      console.error("[ask] submit failed:", err && err.status, err && err.message);
      setSubmitErr(askSubmitError(err));
      submitting.current = false;
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    submitting.current = false;
    setBusy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const goNext = useCallback(() => {
    const e = validateStep(step);
    setErrs(e);
    if (e.length) return;
    setStep((s) => Math.min(s + 1, STEP_IDS.length - 1));
  }, [step, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const copyTicket = async () => {
    if (!done?.ticket) return;
    try {
      await navigator.clipboard.writeText(done.ticket);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  if (!intakeOpen) {
    return (
      <div className="aym-card ui-form-done">
        <span className="ui-icon-badge ui-icon-badge--gold ui-form-done-icon">
          <Check size={26} aria-hidden="true" />
        </span>
        <h2 className="ui-form-done-title">{S.closed.title}</h2>
        <p className="ui-form-done-lead">
          {KEY_DATES.intakeClosesAt
            ? <>New Ask Desk questions closed on {formatKeyDate(KEY_DATES.intakeClosesAt)}. </>
            : null}
          Browse published answers on the open theme stage and Track any ticket you already hold.
          {KEY_DATES.answerBankPublishAt
            ? <> The answer bank continues to fill through {formatKeyDate(KEY_DATES.answerBankPublishAt)}.</>
            : null}
        </p>
        <p className="ui-form-footnote">{PROMISE_SHORT}</p>
        <div className="ui-form-grid" style={{ marginTop: 16 }}>
          <a className="aym-btn aym-btn-primary" href="/answers">{S.closed.browse}</a>
          <a className="aym-btn aym-btn-outline" href="/#track">{S.closed.track}</a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="aym-card ui-form-done">
        <span className="ui-icon-badge ui-icon-badge--gold ui-form-done-icon">
          <Check size={26} aria-hidden="true" />
        </span>
        <h2 className="ui-form-done-title">{S.done.title}</h2>
        <p className="ui-form-done-lead">
          {S.done.lead}
          {(done.email || (profile && profile.email)) ? S.done.emailNote : ""}
        </p>
        <div className="aym-mono ui-ticket" aria-label="Reference ticket">{done.ticket}</div>
        <div className="ask-done-actions">
          <button type="button" className="aym-btn aym-btn-outline" onClick={copyTicket}>
            {copied ? <CopyCheck size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? S.done.copied : S.done.copy}
          </button>
          <a className="aym-btn aym-btn-primary" href={`/#track?t=${encodeURIComponent(done.ticket)}`}>
            {S.done.track}
          </a>
        </div>
        <div className="ui-form-recap">
          <div className="aym-eyebrow">You asked</div>
          <div className="ui-form-recap-q">{done.question}</div>
          <div className="ui-form-recap-tag"><Chip>{done.track || done.theme}</Chip></div>
        </div>
        <p className="ui-form-footnote">
          {PROMISE_SHORT} {S.done.noSlot}
        </p>
        <button
          type="button"
          className="aym-btn aym-btn-outline"
          onClick={() => { setF(blankFromProfile(profile)); setDone(null); setStep(0); setCopied(false); }}
        >
          {S.done.askAnother}
        </button>
      </div>
    );
  }

  const locked = !profile;
  const passId = displayPassId(profile || { regNo: f.regNo });
  const linkedToWac = passId.kind === "wac";
  const session = !locked ? loadLocalSession() : null;
  const prefilled = !locked && !!(f.name && f.email && (passId.id || f.regNo));
  const showCompactId = prefilled && !editIdentity;
  const allErrs = validate();
  const canSubmit = !locked && intakeOpen && !busy && allErrs.length === 0;

  const consentBits = [
    f.consentAnonPublish && "Anonymous publish",
    f.consentNamedDisplay && "Named display",
    f.consentRecording && "Recording",
    f.consentFollow && "Follow-up",
  ].filter(Boolean);

  return (
    <div className="ui-form ui-form--ask">
      {locked && (
        <aside className="aym-ask-register-banner" role="status" aria-live="polite">
          <div className="aym-ask-register-banner-glow" aria-hidden="true" />
          <div className="aym-ask-register-banner-icon" aria-hidden="true">
            <UserPlus size={22} strokeWidth={2.2} />
          </div>
          <div className="aym-ask-register-banner-copy">
            <div className="aym-ask-register-banner-eyebrow">{S.register.eyebrow}</div>
            <p className="aym-ask-register-banner-title">{S.register.title}</p>
            <p className="aym-ask-register-banner-meta">{S.register.meta}</p>
            <WacAskLink onClick={() => onGoRegister({ theme: f.theme, subtheme: f.subtheme, question: f.question })} />
          </div>
          <button
            type="button"
            className="aym-ask-register-banner-cta"
            onClick={() => onGoRegister({ theme: f.theme, subtheme: f.subtheme, question: f.question })}
          >
            {S.register.cta}
            <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </aside>
      )}

      <div className="aym-desk-cap">
        <div className="aym-eyebrow">{S.eyebrow}</div>
        <h1 className="aym-display aym-desk-cap-title">{S.title}</h1>
        <p className="aym-desk-cap-lead">
          {S.lead}{" "}{PROMISE_SHORT}
        </p>
        <p className="ui-form-footnote" style={{ marginTop: 8 }}>
          {intakeStatusLine()} Congress {WAC.dates} at {WAC.venue}, {WAC.city}.
        </p>
      </div>

      <ol className="ui-steps" aria-label="Ask Desk sections">
        {S.steps.map((s, i) => (
          <li
            key={s.id}
            className={`ui-step${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}`}
          >
            <span className="ui-step-num">{i + 1}</span>
            <span className="ui-step-label">{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="ask-live-errors" aria-live="polite" aria-atomic="true">
        {errs.length > 0 && (
          <Notice tone="bad">Add {errs.join(", ")} before continuing.</Notice>
        )}
        {submitErr && <Notice tone="bad">{submitErr}</Notice>}
      </div>

      <div className="aym-eyebrow" style={{ marginBottom: 8 }}>{S.promptsEyebrow}</div>
      <div className="aym-prompt-row">
        {ASK_PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`aym-prompt${f.question === p.text ? " aym-prompt-on" : ""}`}
            onClick={() => applyPrompt(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ask-shell">
        <div className="ask-shell__main">
          {/* —— Question —— */}
          {step === 0 && (
            <div className="aym-card ui-form-card">
              <div
                className="aym-eyebrow"
                tabIndex={-1}
                ref={stepHeadingRef}
              >
                1 · {S.question.eyebrow}
              </div>
              <h3 className="ui-form-card-title">{S.question.title}</h3>

              <Field label={S.question.trackLabel} required hint={S.question.trackHint}>
                <div className="aym-ask-track-grid" role="listbox" aria-label="Career tracks T1 to T9">
                  {TRACKS.map((t) => {
                    const on = f.theme === t.name;
                    return (
                      <button
                        key={t.code}
                        type="button"
                        role="option"
                        aria-selected={on}
                        disabled={locked}
                        className={`aym-ask-track-card${on ? " is-on" : ""}`}
                        onClick={() => { set("theme", t.name); set("subtheme", ""); }}
                      >
                        <span className="aym-ask-track-code">{t.code}</span>
                        <span className="aym-ask-track-name">{t.short}</span>
                        <span className="aym-ask-track-label">{t.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="option"
                    aria-selected={f.theme === NOT_SURE}
                    disabled={locked}
                    className={`aym-ask-track-card aym-ask-track-card--wide${f.theme === NOT_SURE ? " is-on" : ""}`}
                    onClick={() => { set("theme", NOT_SURE); set("subtheme", ""); }}
                  >
                    <span className="aym-ask-track-code">?</span>
                    <span className="aym-ask-track-name">{S.question.notSureName}</span>
                    <span className="aym-ask-track-label">{S.question.notSureLabel}</span>
                  </button>
                </div>
              </Field>
              <p className="ask-match-hint">{S.question.imperfectMatch}</p>

              {subs.length > 0 && (
                <Field label="Sub-area" required>
                  <select className="aym-input" value={f.subtheme} onChange={(e) => set("subtheme", e.target.value)} disabled={locked}>
                    <option value="">{S.select}</option>
                    {subs.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              )}

              <Field
                label={S.question.questionLabel}
                required
                counter={`${f.question.length} / 500`}
                hint={S.question.questionHint}
              >
                <textarea
                  ref={qRef}
                  className="aym-input ask-q-textarea"
                  rows={8}
                  maxLength={500}
                  value={f.question}
                  onChange={(e) => set("question", e.target.value)}
                  placeholder={`For example: ${askExample}`}
                  disabled={locked}
                />
              </Field>

              <div className="ask-checklist">
                <div className="ask-checklist__title">{S.question.checklistTitle}</div>
                <ul>
                  {S.question.checklist.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>

              <Notice tone="warn">{ASK_SAFETY_WARNING}</Notice>
              {safety.flags.length > 0 && (
                <Notice tone="bad">
                  Possible sensitive detail flagged for the curator (your question can still be sent): {safety.flags.join(", ")}.
                </Notice>
              )}
              <AskTriageHint
                theme={f.theme}
                subtheme={f.subtheme}
                question={f.question}
                context={f.context}
                onMove={(theme, subtheme) => setF((p) => ({ ...p, theme, subtheme }))}
              />
              <Field label={S.question.contextLabel} counter={`${f.context.length} / 300`} hint={S.question.contextHint}>
                <textarea className="aym-input" rows={2} maxLength={300} value={f.context} onChange={(e) => set("context", e.target.value)} disabled={locked} />
              </Field>
              <Field label={S.question.outcomeLabel} counter={`${f.outcome.length} / 200`}>
                <textarea className="aym-input" rows={2} maxLength={200} value={f.outcome} onChange={(e) => set("outcome", e.target.value)} disabled={locked} />
              </Field>
            </div>
          )}

          {/* —— Who —— */}
          {step === 1 && (
            <div className="aym-card ui-form-card">
              <div className="ui-form-card-head">
                <div>
                  <div className="aym-eyebrow" tabIndex={-1} ref={stepHeadingRef}>2 · {S.who.eyebrow}</div>
                  <h3 className="ui-form-card-title">{S.who.title}</h3>
                </div>
                <button type="button" className="aym-btn aym-btn-gold aym-btn-sm ui-autofill" onClick={autofill} disabled={locked}>
                  <Sparkles size={14} aria-hidden="true" /> {S.autofill}
                </button>
              </div>

              {autofillNote && <div className="ask-filled-notice" role="status">{autofillNote}</div>}

              {showCompactId ? (
                <div className="ask-id-summary">
                  <div>
                    <div className="ask-id-summary__line">
                      {[f.name, passId.id || f.regNo, f.institution].filter(Boolean).join(" · ")}
                    </div>
                    <span className="ask-id-summary__meta">{f.email}</span>
                  </div>
                  <button type="button" className="aym-btn aym-btn-outline aym-btn-sm" onClick={() => setEditIdentity(true)}>
                    {S.who.edit}
                  </button>
                </div>
              ) : (
                <>
                  {prefilled && (
                    <div style={{ marginBottom: 12, textAlign: "right" }}>
                      <button type="button" className="aym-btn aym-btn-outline aym-btn-sm" onClick={() => setEditIdentity(false)}>
                        {S.who.doneEdit}
                      </button>
                    </div>
                  )}
                  <Field
                    label={linkedToWac ? WAC_DELEGATE_ID_LABEL : PASS_NUMBER_LABEL}
                    required
                    hint={linkedToWac ? S.who.lockedHintWac : S.who.lockedHintPass}
                  >
                    <div className="ask-pass-row">
                      <input
                        className="aym-input aym-mono ask-pass-input aym-input-issued"
                        value={passId.id || f.regNo}
                        readOnly
                        disabled={locked}
                        autoComplete="off"
                        aria-readonly="true"
                        placeholder={locked ? "Issued after you register" : "Issued on your profile"}
                      />
                      {!locked && (passId.id || f.regNo) && (
                        <span className="ask-verified">
                          <Lock size={14} aria-hidden="true" />
                          <BadgeCheck size={14} aria-hidden="true" />
                          {S.who.verified}
                        </span>
                      )}
                    </div>
                  </Field>
                  {!locked && !linkedToWac && onProfile && (
                    <WacLinkPrompt
                      token={session && session.token}
                      email={profile.email}
                      pending={Boolean(profile.wacLinkPending)}
                      onLinked={(token, prof) => { onProfile(token, prof); setAutofillNote(passAutofillNote(prof)); }}
                    />
                  )}
                  <Field label={S.who.name} required>
                    <input className="aym-input" value={f.name} onChange={(e) => set("name", e.target.value)} disabled={locked} />
                  </Field>
                  <Field label={S.who.email} hint={S.who.emailHint} required>
                    <input className="aym-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={locked} />
                  </Field>
                  <div className="ui-form-grid">
                    <Field label={S.who.state} required>
                      <select className="aym-input" value={f.state} onChange={(e) => set("state", e.target.value)} disabled={locked}>
                        <option value="">{S.select}</option>
                        {STATES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label={S.who.stage} required>
                      <select className="aym-input" value={f.stage} onChange={(e) => set("stage", e.target.value)} disabled={locked}>
                        <option value="">{S.select}</option>
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label={S.who.institution} required>
                    <input className="aym-input" value={f.institution} onChange={(e) => set("institution", e.target.value)} disabled={locked} />
                  </Field>
                </>
              )}

              {/* When compact, still need state/stage if empty */}
              {showCompactId && (
                <div className="ui-form-grid">
                  <Field label={S.who.state} required>
                    <select className="aym-input" value={f.state} onChange={(e) => set("state", e.target.value)} disabled={locked}>
                      <option value="">{S.select}</option>
                      {STATES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label={S.who.stage} required>
                    <select className="aym-input" value={f.stage} onChange={(e) => set("stage", e.target.value)} disabled={locked}>
                      <option value="">{S.select}</option>
                      {STAGES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              <div className="aym-eyebrow" style={{ marginTop: 8 }}>{S.who.hallEyebrow}</div>
              <h3 className="ui-form-card-title" style={{ fontSize: 20 }}>{S.who.hallTitle}</h3>
              <p className="ui-form-card-lead">{S.who.hallLead}</p>
              <Field label={S.who.registered} required>
                <select className="aym-input" value={f.registered} onChange={(e) => set("registered", e.target.value)} disabled={locked}>
                  <option value="">{S.select}</option>
                  {ASK_REGISTERED.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={S.who.inPerson} required>
                <select className="aym-input" value={f.inPerson} onChange={(e) => set("inPerson", e.target.value)} disabled={locked}>
                  <option value="">{S.select}</option>
                  {ASK_IN_PERSON.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              {f.inPerson === "Yes" && (
                <>
                  <Field label={S.who.days}>
                    <div className="ui-toggle-row">
                      {CORE_DAYS.map((d) => {
                        const on = f.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => set("days", on ? f.days.filter((x) => x !== d) : [...f.days, d])}
                            disabled={locked}
                            aria-pressed={on}
                            className={`ui-toggle${on ? " is-on" : ""}`}
                          >
                            {on && <Check size={14} aria-hidden="true" />}{d}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label={S.who.mobile} hint={S.who.mobileHint}>
                    <input className="aym-input" value={f.mobile} onChange={(e) => set("mobile", e.target.value)} disabled={locked} />
                  </Field>
                </>
              )}
            </div>
          )}

          {/* —— Consent —— */}
          {step === 2 && (
            <div className="aym-card ui-form-card">
              <div className="aym-eyebrow" tabIndex={-1} ref={stepHeadingRef}>3 · {S.consent.eyebrow}</div>
              <h3 className="ui-form-card-title">{S.consent.title}</h3>
              <p className="ui-form-card-lead">{S.consent.lead}</p>
              <Notice tone="info">{S.consent.aiNotice}</Notice>
              <label className="ui-check">
                <input type="checkbox" checked={!!f.consentAnonPublish} disabled={locked} onChange={(e) => set("consentAnonPublish", e.target.checked)} />
                <span>{S.consent.anon}</span>
              </label>
              <label className="ui-check">
                <input type="checkbox" checked={!!f.consentNamedDisplay} disabled={locked} onChange={(e) => set("consentNamedDisplay", e.target.checked)} />
                <span>{S.consent.named}</span>
              </label>
              <label className="ui-check">
                <input type="checkbox" checked={!!f.consentRecording} disabled={locked} onChange={(e) => set("consentRecording", e.target.checked)} />
                <span>{S.consent.recording}</span>
              </label>
              <label className="ui-check">
                <input type="checkbox" checked={!!f.consentFollow} disabled={locked} onChange={(e) => set("consentFollow", e.target.checked)} />
                <span>{S.consent.follow}</span>
              </label>
            </div>
          )}

          {/* —— Review —— */}
          {step === 3 && (
            <div className="aym-card ui-form-card">
              <div className="aym-eyebrow" tabIndex={-1} ref={stepHeadingRef}>4 · {S.review.eyebrow}</div>
              <h3 className="ui-form-card-title">{S.review.title}</h3>
              <p className="ui-form-card-lead">{S.review.lead}</p>

              <dl className="ask-review-dl">
                <div>
                  <dt>{S.review.question}</dt>
                  <dd>{f.question || "—"}</dd>
                </div>
                <div>
                  <dt>{S.review.track}</dt>
                  <dd>{[f.theme, f.subtheme].filter(Boolean).join(" · ") || "—"}</dd>
                </div>
                <div>
                  <dt>{S.review.you}</dt>
                  <dd>{[f.name, passId.id || f.regNo, f.institution, f.stage, f.state].filter(Boolean).join(" · ") || "—"}</dd>
                </div>
                <div>
                  <dt>{S.review.hall}</dt>
                  <dd>
                    {[f.registered && `Registered: ${f.registered}`, f.inPerson && `In person: ${f.inPerson}`].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt>{S.review.consents}</dt>
                  <dd>{consentBits.length ? consentBits.join(", ") : S.review.noneConsent}</dd>
                </div>
              </dl>

              {!canSubmit && (
                <div className="ask-missing" role="status">
                  <strong>{S.review.missingTitle}</strong>
                  {allErrs.length > 0 ? (
                    <ul>{allErrs.map((e) => <li key={e}>{e}</li>)}</ul>
                  ) : locked ? (
                    <p style={{ margin: "8px 0 0" }}>{S.register.title}</p>
                  ) : null}
                </div>
              )}

              <details className="ask-side-collapse ask-side--mobile">
                <summary>
                  {S.side.title}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <SidePanel />
              </details>

              <button
                type="button"
                className="aym-btn aym-btn-primary aym-btn-lg aym-btn-block"
                disabled={!canSubmit}
                onClick={submit}
                aria-disabled={!canSubmit}
              >
                {busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {busy ? S.review.sending : S.review.submit}
              </button>
              <p className="ui-form-footnote">{S.review.footnote}</p>
            </div>
          )}

          <div className="ask-sticky-nav" role="navigation" aria-label="Ask Desk step controls">
            <button type="button" className="aym-btn aym-btn-outline" onClick={goBack} disabled={step === 0}>
              {S.nav.back}
            </button>
            {step < 3 ? (
              <button type="button" className="aym-btn aym-btn-primary" onClick={goNext} disabled={locked && step === 0 && !f.question}>
                {S.nav.next}
              </button>
            ) : (
              <button type="button" className="aym-btn aym-btn-primary" disabled={!canSubmit} onClick={submit}>
                {busy ? S.review.sending : S.nav.submit}
              </button>
            )}
          </div>
        </div>

        <div className="ask-shell__side ask-shell__side--desktop">
          <SidePanel />
        </div>
      </div>
    </div>
  );
}

export default AskView;
