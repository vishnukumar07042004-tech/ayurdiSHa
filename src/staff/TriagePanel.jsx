import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, HeartPulse, Link2, Loader2, MessageCircleQuestion, Send, ShieldAlert } from "lucide-react";
import { TRIAGE_THEMES } from "../../shared/triageRules.js";
import "../styles/triage.css";

const CATEGORY_LABEL = {
  ON_TOPIC: "On-topic",
  WRONG_AREA: "Wrong area",
  UNFOCUSED: "Unfocused",
  OFF_TOPIC: "Off-topic",
  RESTRICTED: "Restricted",
  DUPLICATE: "Duplicate",
};
const SUBTYPE_LABEL = {
  MEDICAL: "medical",
  LEGAL_FINANCIAL: "legal / financial",
  EXAM_INTEGRITY: "exam integrity",
  UNSAFE_ILLEGAL: "unsafe / illegal",
  PERSONAL_DATA: "personal data",
  ABUSIVE: "abusive",
  SELF_HARM: "self-harm",
  PROMOTIONAL: "promotion / spam",
  PROMPT_INJECTION: "prompt injection",
};
const TONE = { ON_TOPIC: "ok", WRONG_AREA: "info", UNFOCUSED: "warn", OFF_TOPIC: "warn", RESTRICTED: "bad", DUPLICATE: "muted" };
const CODE_BY_NAME = new Map(TRIAGE_THEMES.map(t => [t.name, t.code]));
const SOURCE_LABEL = { rules: "rules", llm: "DISHA classifier", both: "rules + DISHA classifier" };
const OPEN = new Set(["pending", "blocked", "to-mentor", "rejected"]);

export const TRIAGE_FILTERS = [
  ["", "All triage"],
  ["urgent", "Urgent"],
  ["needs", "Needs triage"],
  ["ON_TOPIC", "On-topic"],
  ["WRONG_AREA", "Wrong area"],
  ["UNFOCUSED", "Unfocused"],
  ["OFF_TOPIC", "Off-topic"],
  ["RESTRICTED", "Restricted"],
  ["DUPLICATE", "Duplicate"],
];

function matches(item, f) {
  const t = (item.aiDraft && item.aiDraft.triage) || null;
  if (!f) return true;
  if (!t) return false;
  if (f === "urgent") return Boolean(t.urgent);
  if (f === "needs") return Boolean(t.needsHumanTriage);
  return t.category === f;
}

export function filterByTriage(items, f) {
  return f ? (items || []).filter(i => matches(i, f)) : items || [];
}

export function triageLabel(t) {
  if (!t) return "";
  if (t.urgent) return "Urgent · self-harm";
  if (t.category === "RESTRICTED") return `Restricted: ${SUBTYPE_LABEL[t.subtype] || t.subtype || "?"}`;
  if (t.category === "WRONG_AREA" && t.suggestedTheme) return `Wrong area → ${CODE_BY_NAME.get(t.suggestedTheme) || ""} ${t.suggestedSubtheme || t.suggestedTheme}`.replace(/\s+/g, " ");
  return CATEGORY_LABEL[t.category] || t.category;
}

export function TriageBadge({ triage, compact = false }) {
  if (!triage) return null;
  const tone = triage.urgent ? "urgent" : TONE[triage.category] || "muted";
  if (compact && triage.category === "ON_TOPIC" && !triage.needsHumanTriage) return null;
  return (
    <>
      <span className={`air-chip trg-chip trg-chip--${tone}`} title={triage.reason || ""}>
        {triage.urgent && <HeartPulse size={10} aria-hidden="true" />}
        {triageLabel(triage)}
      </span>
      {triage.needsHumanTriage && <span className="air-chip trg-chip trg-chip--outline" title="Rules and the DISHA classifier disagree or are unsure">Needs triage</span>}
    </>
  );
}

export function TriageFilter({ value, onChange, items }) {
  const count = f => filterByTriage(items, f).length;
  return (
    <select className="air-select trg-filter" value={value} onChange={e => onChange(e.target.value)} aria-label="Triage category">
      {TRIAGE_FILTERS.map(([id, label]) => (
        <option key={id || "all"} value={id}>{label}{id && items ? ` (${count(id)})` : ""}</option>
      ))}
    </select>
  );
}

function RefilePicker({ initialTheme, initialSub, busy, onRefile }) {
  const [theme, setTheme] = useState(initialTheme || "");
  const [sub, setSub] = useState(initialSub || "");
  useEffect(() => { setTheme(initialTheme || ""); setSub(initialSub || ""); }, [initialTheme, initialSub]);
  const t = TRIAGE_THEMES.find(x => x.name === theme);
  return (
    <div className="trg-refile">
      <select className="air-select" value={theme} onChange={e => { setTheme(e.target.value); setSub(""); }} aria-label="Re-file to theme">
        <option value="">Theme…</option>
        {TRIAGE_THEMES.map(x => <option key={x.code} value={x.name}>{x.code} — {x.name}</option>)}
      </select>
      <select className="air-select" value={sub} onChange={e => setSub(e.target.value)} disabled={!t} aria-label="Re-file to sub-area">
        <option value="">Sub-area…</option>
        {(t ? t.subs : []).map(s => <option key={s}>{s}</option>)}
      </select>
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy || !theme || !sub} onClick={() => onRefile(theme, sub)}>
        <ArrowRightLeft size={14} aria-hidden="true" /><span className="ui-btn-label">Re-file</span>
      </button>
    </div>
  );
}

/**
 * Triage summary + actions for one draft. `onAction(op, payload, successMessage)` runs a desk op.
 */
export function TriagePanel({ item, busy, onAction }) {
  const a = item.aiDraft || {};
  const t = a.triage;
  const [picker, setPicker] = useState(false);
  useEffect(() => { setPicker(false); }, [item.id]);
  if (!t) return null;
  const open = OPEN.has(a.status || "pending") && !item.answeredElsewhere;
  const isQuestion = item.targetType === "question";
  const scriptedBlocked = a.status === "blocked" && a.scripted && a.scripted.answer;
  const canSuggest = t.category === "WRONG_AREA" && t.suggestedTheme && t.suggestedSubtheme
    && !(t.suggestedTheme === item.theme && t.suggestedSubtheme === item.subtheme);
  const refile = (theme, subtheme) => onAction("aiRefile", { theme, subtheme }, `Re-filed to ${CODE_BY_NAME.get(theme) || ""} ${subtheme} — redrafting under the right mentor persona.`);
  const confidence = typeof t.confidence === "number" ? `${Math.round(t.confidence * 100)}%` : "";
  return (
    <section className={`trg-panel${t.urgent ? " trg-panel--urgent" : ""}`} aria-label="Question triage">
      <div className="trg-head">
        <TriageBadge triage={t} />
        <span className="trg-meta">{[SOURCE_LABEL[t.source] || t.source, confidence && `${confidence} confidence`].filter(Boolean).join(" · ")}</span>
      </div>
      {t.reason && <p className="trg-reason">{t.reason}</p>}

      {t.urgent && (
        <div className="trg-urgent" role="alert">
          <HeartPulse size={16} aria-hidden="true" />
          <span>
            <b>Possible self-harm — handle first.</b> The reply includes Tele-MANAS 14416 / 1-800-891-4416 and emergency 112. Send or adapt it now; the student's contact details are on Insights → Briefing board if someone should reach out personally.
          </span>
        </div>
      )}
      {t.duplicateOf && <p className="trg-line"><Link2 size={13} aria-hidden="true" />Same student already asked this on <b>{t.duplicateOf.ticket || t.duplicateOf.id}</b>. The reply links to it.</p>}
      {t.rephraseOf && <p className="trg-line"><Link2 size={13} aria-hidden="true" />Rephrase of <b>{t.rephraseOf.ticket || t.rephraseOf.id}</b>.</p>}
      {canSuggest && <p className="trg-line"><ArrowRightLeft size={13} aria-hidden="true" />Filed under {CODE_BY_NAME.get(item.theme) || item.theme} · {item.subtheme}; reads as <b>{CODE_BY_NAME.get(t.suggestedTheme)} · {t.suggestedSubtheme}</b>. The draft was written for the suggested area.</p>}
      {a.scripted && !scriptedBlocked && <p className="trg-line"><ShieldAlert size={13} aria-hidden="true" />Scripted reply ({a.scripted.lang === "hinglish" ? "Hinglish" : a.scripted.lang === "hi" ? "Hindi" : "English"}{a.scripted.personalised ? ", personalised" : ""}) — no sources or facts to check; read it for tone and fit.</p>}
      {t.needsHumanTriage && <p className="trg-line trg-line--warn"><AlertTriangle size={13} aria-hidden="true" />The rules and the DISHA classifier disagree or are unsure — check the category before sending.</p>}

      {scriptedBlocked && (
        <details className="trg-scripted" open>
          <summary>Scripted reply, ready to send</summary>
          <p>{a.scripted.answer}</p>
        </details>
      )}

      {open && (
        <div className="trg-actions">
          {scriptedBlocked && (
            <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy}
              onClick={() => onAction("aiEditApprove", { answer: a.scripted.answer, actions: a.scripted.actions, mistake: a.scripted.mistake, resources: a.scripted.resources }, "Scripted reply sent — the student can read it on Track now.")}>
              {busy ? <Loader2 size={14} className="ui-btn-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              <span className="ui-btn-label">Send scripted reply</span>
            </button>
          )}
          {canSuggest && (
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => refile(t.suggestedTheme, t.suggestedSubtheme)}>
              <ArrowRightLeft size={14} aria-hidden="true" /><span className="ui-btn-label">Re-file to {CODE_BY_NAME.get(t.suggestedTheme)} · {t.suggestedSubtheme}</span>
            </button>
          )}
          {isQuestion && t.category !== "RESTRICTED" && t.category !== "DUPLICATE" && (
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy}
              onClick={() => onAction("aiAskRephrase", {}, "Asked the student to rephrase — the clarifying reply is on Track now.")}>
              <MessageCircleQuestion size={14} aria-hidden="true" /><span className="ui-btn-label">Ask student to rephrase</span>
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" aria-expanded={picker} onClick={() => setPicker(v => !v)} disabled={busy}>
            <span className="ui-btn-label">{picker ? "Close" : "Re-file to…"}</span>
          </button>
        </div>
      )}
      {open && picker && <RefilePicker initialTheme={t.suggestedTheme || item.theme} initialSub={t.suggestedSubtheme || item.subtheme} busy={busy} onRefile={refile} />}
    </section>
  );
}
