import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Check, PenLine, X, Send, RefreshCw, Settings2, Loader2, AlertTriangle, ShieldCheck,
  ExternalLink, CheckCircle2, CircleAlert, CircleDashed, Clock, Users, Keyboard, Play, Ban, FileText, Award, Lightbulb,
} from "lucide-react";
import { aiApi, invalidateAiDraftIndex, AI_FOCUS_KEY } from "./aiApi.js";
import { TriageBadge, TriageFilter, TriagePanel, filterByTriage } from "./TriagePanel.jsx";
import { citeGroups, stripCitationMarks } from "../../shared/citations.js";
import { draftLetter } from "../../shared/draftLetter.js";
import { DISHA_DRAFTS, DISHA_ROLE, DISHA_TRACK_NOTE } from "../content/glossary.js";
import "../styles/ai-review.css";

const STATUS_TABS = [
  ["open", "Waiting"],
  ["blocked", "Blocked"],
  ["approved", "Approved"],
  ["edited", "Edited"],
  ["rejected", "Rejected"],
  ["to-mentor", "To mentor"],
  ["all", "All"],
];
const REJECT_TAGS = ["Wrong facts", "Outdated", "Off-topic", "Too generic", "Tone", "Medical", "Missing sources"];
const PILOT_STREAMS = new Set(["pg-entrance", "govt-jobs"]);
const LIMITED_TITLE = "Limited sources — mentor to complete";
const LIMITED_HINT = "Add specific facts from official sources before sending.";
const isMentorAssist = a => Boolean(a && a.mode === "mentor-assist");
const MODE_FILTERS = [
  ["", "All DISHA drafts"],
  ["mentor-assist", "Limited sources"],
  ["grounded", "Fully sourced"],
];

function filterByMode(items, f) {
  if (!f) return items || [];
  return (items || []).filter(i => (f === "mentor-assist") === isMentorAssist(i.aiDraft));
}

function ModeFilter({ value, onChange, items }) {
  return (
    <select className="air-select" value={value} onChange={e => onChange(e.target.value)} aria-label="Draft type">
      {MODE_FILTERS.map(([id, label]) => (
        <option key={id || "all"} value={id}>{label}{id && items ? ` (${filterByMode(items, id).length})` : ""}</option>
      ))}
    </select>
  );
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function fmtDate(v) {
  if (!v) return "";
  const t = typeof v === "number" ? v : Date.parse(v);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ago(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function stripMarks(s) {
  return stripCitationMarks(s);
}

/* ---------------------------------------------------------------- */
/* Letter (mirrors the Track "Mentor's answer" card)                 */
/* ---------------------------------------------------------------- */

function AnswerWithCites({ text, citeIndex, onCite }) {
  const paras = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  return (
    <div className="air-prose">
      {paras.map((p, i) => {
        const parts = [];
        let last = 0;
        for (const g of citeGroups(p)) {
          if (g.index > last) parts.push(p.slice(last, g.index));
          g.ids.forEach((id, k) => {
            const n = citeIndex.get(id);
            parts.push(
              <sup key={`${i}-${g.index}-${k}`}>
                <button type="button" className={`air-cite${n ? "" : " air-cite--bad"}`} onClick={() => onCite(id)}
                  aria-label={n ? `Source ${n}` : "Citation not found"}>
                  {n || "?"}
                </button>
              </sup>,
            );
          });
          last = g.index + g.length;
        }
        if (last < p.length) parts.push(p.slice(last));
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

function Letter({ item, citeIndex, onCite }) {
  const a = item.aiDraft || {};
  const published = a.published;
  const body = published ? (draftLetter(published) || published.answer) : (draftLetter(a) || a.answer);
  const actions = published ? published.actions : a.actions;
  const mistake = published ? published.mistake : a.mistake;
  const resources = published ? published.resources : a.resources;
  return (
    <article className="air-letter" aria-label="Draft answer">
      <span className="air-letter-eyebrow">{published ? "What the student sees" : isMentorAssist(a) ? "The mentor’s answer · starting draft to complete" : "The mentor’s answer · draft"}</span>
      <AnswerWithCites text={body} citeIndex={citeIndex} onCite={onCite} />
      {(actions || []).filter(Boolean).length > 0 && (
        <section className="air-extra">
          <h4><CheckCircle2 size={15} aria-hidden="true" />Next steps</h4>
          <ol>{actions.filter(Boolean).map((x, i) => <li key={i}>{stripMarks(x)}</li>)}</ol>
        </section>
      )}
      {mistake && (
        <section className="air-extra air-extra--warn">
          <h4><Award size={15} aria-hidden="true" />A mistake to avoid</h4>
          <p>{stripMarks(mistake)}</p>
        </section>
      )}
      {(resources || []).length > 0 && (
        <section className="air-extra">
          <h4><FileText size={15} aria-hidden="true" />References</h4>
          <ul>
            {resources.map((r, i) => (
              <li key={i}>
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener">{r.title || r.url}</a> : r.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="air-letter-note">
        {published && a.aiAssisted === false
          ? "Written by an official — shown to the student as a mentor answer, without the DISHA note."
          : `Shown to the student with the note “${DISHA_TRACK_NOTE.replace(/\.$/, "")}”.`}
      </p>
    </article>
  );
}

function SourceCards({ citations, activeId, cardRefs, emptyText = "No sources cited." }) {
  if (!citations.length) return <p className="air-muted">{emptyText}</p>;
  return (
    <div className="air-sources">
      {citations.map((c, i) => (
        <a
          key={c.chunkId}
          ref={el => { if (el) cardRefs.current.set(c.chunkId, el); }}
          className={`air-source${activeId === c.chunkId ? " is-active" : ""}${c.valid === false ? " is-invalid" : ""}`}
          href={c.url || undefined}
          target="_blank"
          rel="noreferrer noopener"
          onClick={e => { if (!c.url) e.preventDefault(); }}
        >
          <span className="air-source-num">{i + 1}</span>
          <span className="air-source-body">
            <span className="air-source-title">{c.title || c.chunkId}</span>
            <span className="air-source-meta">
              <span>{hostOf(c.url) || "unknown source"}</span>
              {c.authority && <span className={`air-auth air-auth--${String(c.authority).toLowerCase()}`}>{c.authority}</span>}
              {c.publishedAt && <span>{fmtDate(c.publishedAt)}</span>}
              {c.valid === false && <span className="air-auth air-auth--bad">not a trusted source</span>}
            </span>
            {c.quote && <q className="air-source-quote">{c.quote}</q>}
          </span>
          {c.url && <ExternalLink size={14} className="air-source-ext" aria-hidden="true" />}
        </a>
      ))}
    </div>
  );
}

const CLAIM_ICON = { supported: CheckCircle2, unsupported: CircleAlert, outdated: Clock, guidance: Lightbulb };

function ClaimChecks({ checks, citeIndex, onCite }) {
  if (!checks.length) return <p className="air-muted">No factual claims to check.</p>;
  return (
    <ul className="air-claims">
      {checks.map((c, i) => {
        const Icon = CLAIM_ICON[c.status] || CircleDashed;
        return (
          <li key={i} className={`air-claim air-claim--${c.status}`}>
            <Icon size={15} aria-hidden="true" />
            <div>
              <span className="air-claim-text">{c.claim}</span>
              <span className="air-claim-meta">
                <b>{c.status}</b>
                {(c.chunkIds || []).map(id => (
                  <button key={id} type="button" className="air-cite air-cite--inline" onClick={() => onCite(id)}>{citeIndex.get(id) || "?"}</button>
                ))}
                {c.note && <span> · {c.note}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Editor / reject                                                   */
/* ---------------------------------------------------------------- */

function draftToForm(item, mentorName) {
  const raw = item.aiDraft || {};
  // A blocked (medical) draft carries its scripted reply separately; start the editor from it.
  const letter = draftLetter(raw);
  const a = !letter && raw.scripted && raw.scripted.answer ? { ...raw, ...raw.scripted } : { ...raw, answer: letter || raw.answer };
  const acts = (a.actions || []).map(stripMarks);
  const res = a.resources || [];
  return {
    answer: stripMarks(a.answer),
    a1: acts[0] || "", a2: acts[1] || "", a3: acts[2] || "",
    mistake: stripMarks(a.mistake),
    r1t: (res[0] && res[0].title) || "", r1u: (res[0] && res[0].url) || "",
    r2t: (res[1] && res[1].title) || "", r2u: (res[1] && res[1].url) || "",
    mentorName: mentorName || "",
  };
}

function EditPanel({ form, setForm, busy, onSave, onCancel }) {
  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  return (
    <form className="air-edit" onSubmit={e => { e.preventDefault(); onSave(); }}>
      <label className="air-field">
        <span>Answer</span>
        <textarea ref={first} rows={9} value={form.answer} onChange={e => f("answer", e.target.value)} />
        <small>{form.answer.trim().split(/\s+/).filter(Boolean).length} words · aim for 120–220</small>
      </label>
      <div className="air-field-row">
        {["a1", "a2", "a3"].map((k, i) => (
          <label key={k} className="air-field">
            <span>Next step {i + 1}</span>
            <input value={form[k]} onChange={e => f(k, e.target.value)} />
          </label>
        ))}
      </div>
      <label className="air-field">
        <span>A mistake to avoid</span>
        <input value={form.mistake} onChange={e => f("mistake", e.target.value)} />
      </label>
      <div className="air-field-row air-field-row--2">
        {[["r1t", "r1u"], ["r2t", "r2u"]].map(([t, u], i) => (
          <div key={t} className="air-field-pair">
            <label className="air-field"><span>Resource {i + 1} title</span><input value={form[t]} onChange={e => f(t, e.target.value)} /></label>
            <label className="air-field"><span>URL</span><input type="url" value={form[u]} placeholder="https://" onChange={e => f(u, e.target.value)} /></label>
          </div>
        ))}
      </div>
      <label className="air-field">
        <span>Answered by (optional)</span>
        <input value={form.mentorName} placeholder="Leave blank for “The AYURDISHA mentor desk”" onChange={e => f("mentorName", e.target.value)} />
      </label>
      <div className="air-actions">
        <button type="submit" className="ui-btn ui-btn--primary ui-btn--md" disabled={busy || !form.answer.trim()}>
          {busy ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          <span className="ui-btn-label">Save and send to student</span>
        </button>
        <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function RejectPanel({ busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [tag, setTag] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <form className="air-reject" onSubmit={e => { e.preventDefault(); onConfirm(reason || tag, tag); }}>
      <span className="air-reject-title">Why reject this draft? It teaches the next one.</span>
      <div className="air-tags" role="group" aria-label="Quick reasons">
        {REJECT_TAGS.map(t => (
          <button key={t} type="button" className={`air-tag${tag === t ? " is-on" : ""}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>
        ))}
      </div>
      <textarea ref={ref} rows={3} value={reason} placeholder="e.g. The fee quoted is from 2023; the 2026 bulletin is out." onChange={e => setReason(e.target.value)} />
      <div className="air-actions">
        <button type="submit" className="ui-btn ui-btn--secondary ui-btn--md air-btn-danger" disabled={busy || !(reason.trim() || tag)}>
          {busy ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
          <span className="ui-btn-label">Reject draft</span>
        </button>
        <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Settings                                                          */
/* ---------------------------------------------------------------- */

function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`air-switch${disabled ? " is-disabled" : ""}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="air-switch-track" aria-hidden="true"><span className="air-switch-dot" /></span>
      <span className="air-switch-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function ProviderDetails({ provider }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  if (!provider || !provider.id) return null;
  const vx = provider.vertex;
  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await aiApi("aiProviderTest");
      setResult(r.test || { ok: false, error: "No result." });
    } catch (e) {
      setResult({ ok: false, error: e.message || "Test failed." });
    }
    setTesting(false);
  }
  const part = (label, p) => (p ? (p.ok
    ? `${label} OK · ${p.model}${p.dimensions ? ` · ${p.dimensions} dims` : ""} · ${p.latencyMs} ms`
    : `${label} failed · ${p.error}`) : null);
  return (
    <div className="air-provider">
      <dl className="air-provider-dl">
        <dt>Provider</dt><dd>{provider.label}</dd>
        {vx && <><dt>Project</dt><dd>{vx.project || "—"}</dd></>}
        {vx && <><dt>Location</dt><dd>{vx.location || "global"}{vx.auth ? ` · ${vx.auth === "api-key" ? "API key" : "service account"}` : ""}</dd></>}
        <dt>Draft</dt><dd>{provider.draftModel || "—"}</dd>
        <dt>Verify</dt><dd>{provider.verifyModel || "—"}{provider.escalateModel ? ` → ${provider.escalateModel} when unsure` : ""}</dd>
        <dt>Embeddings</dt><dd>{provider.embedModel || "—"}{provider.embedDimensions ? ` · ${provider.embedDimensions}` : ""}</dd>
      </dl>
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={testing || !provider.configured} onClick={runTest}>
        {testing ? <Loader2 size={14} className="ui-btn-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
        <span className="ui-btn-label">{testing ? "Testing…" : "Test DISHA connection"}</span>
      </button>
      {result && (
        <div className={`air-provider-result ${result.ok ? "is-ok" : "is-bad"}`} role="status">
          {result.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
          <span>
            {result.ok ? "Connected." : (result.error || "Test failed.")}
            {[part("Chat", result.chat), part("Embed", result.embed)].filter(Boolean).map(t => <small key={t}>{t}</small>)}
          </span>
        </div>
      )}
    </div>
  );
}

const BACKFILL_REASONS = {
  answered: "already answered",
  "with-mentor": "with a mentor",
  drafted: "already drafted",
  queued: "already queued",
  medical: "medical → mentor",
  "stream-off": "stream off",
  "in-group": "covered by their group",
  "over-limit": "over this run's limit",
  demo: "demo records",
  empty: "empty",
};

function backfillSkips(skipped) {
  return Object.entries(skipped || {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${BACKFILL_REASONS[k] || k}`)
    .join(" · ");
}

/** "Draft existing questions": dry-run preview, then queue drafts for questions asked before AI was on. */
function BackfillCard({ enabled, busy, onQueued }) {
  const [allStreams, setAllStreams] = useState(false);
  const [preview, setPreview] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");
  async function run(dryRun) {
    setWorking(true);
    setErr("");
    try {
      const r = await aiApi("aiBackfill", { dryRun, allStreams, limit: 50 });
      if (dryRun) setPreview(r);
      else { setPreview(null); onQueued(r); }
    } catch (e) {
      setErr(e.message || "Could not check existing questions.");
    }
    setWorking(false);
  }
  const n = preview ? preview.willEnqueue : 0;
  return (
    <div className="air-backfill">
      <b>Questions asked before DISHA was on</b>
      <small className="air-muted">New questions are drafted automatically. Older ones need one click; each draft still waits here for approval.</small>
      <Switch checked={allStreams} disabled={busy || working} onChange={v => { setAllStreams(v); setPreview(null); }}
        label="Include streams that are off" />
      {!preview ? (
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy || working} onClick={() => run(true)}>
          {working ? <Loader2 size={14} className="ui-btn-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
          <span className="ui-btn-label">{working ? "Checking…" : "Draft existing questions"}</span>
        </button>
      ) : (
        <div className="air-backfill-preview" role="status">
          <span>
            {preview.eligible
              ? <><b>{preview.eligible} question{preview.eligible === 1 ? "" : "s"} waiting</b>{preview.eligibleStudents > preview.eligible ? ` (${preview.eligibleStudents} students — merged groups get one draft)` : ""} — draft {n === preview.eligible ? (n === 1 ? "it" : "them") : `the oldest ${n}`} now?</>
              : <b>No questions are waiting for a draft.</b>}
          </span>
          {backfillSkips(preview.skipped) && <small className="air-muted">Skipped: {backfillSkips(preview.skipped)}</small>}
          {n > 0 && <small className="air-muted">About ${preview.spend.estimatedUSD.toFixed(2)} · today ${preview.spend.todayUSD.toFixed(2)} of ${preview.spend.capUSD} cap</small>}
          {!enabled && n > 0 && <small className="air-backfill-warn">Turn DISHA on above first.</small>}
          {enabled && preview.spend.capReached && n > 0 && <small className="air-backfill-warn">Today's spend cap is reached — raise it first.</small>}
          <span className="air-sys-actions">
            {n > 0 && (
              <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy || working || !enabled || preview.spend.capReached} onClick={() => run(false)}>
                {working ? <Loader2 size={14} className="ui-btn-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                <span className="ui-btn-label">Draft {n} now</span>
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" disabled={working} onClick={() => setPreview(null)}>
              <span className="ui-btn-label">{n > 0 ? "Cancel" : "Close"}</span>
            </button>
          </span>
        </div>
      )}
      {err && <small className="air-backfill-warn" role="alert">{err}</small>}
    </div>
  );
}

function SettingsPanel({ info, busy, onPatch, onRunSweep, onRetryFailed, failedCount, onBackfilled }) {
  const cfg = info.config || {};
  const [cap, setCap] = useState(String(cfg.dailySpendCapUSD ?? 5));
  useEffect(() => { setCap(String(cfg.dailySpendCapUSD ?? 5)); }, [cfg.dailySpendCapUSD]);
  const spent = (info.today && info.today.costUSD) || 0;
  const pct = cfg.dailySpendCapUSD > 0 ? Math.min(100, (spent / cfg.dailySpendCapUSD) * 100) : 100;
  return (
    <section className="air-settings" aria-label="DISHA settings">
      <div className="air-settings-col">
        <h3>Drafting</h3>
        <Switch checked={Boolean(cfg.enabled)} disabled={busy} onChange={v => onPatch({ enabled: v })}
          label="DISHA on/off"
          hint={cfg.enabled ? "On — DISHA drafts new questions in enabled streams for review." : "Off — students see no change and nothing is sent to a provider."} />
        <Switch checked={cfg.shadowMode !== false} disabled={busy} onChange={v => onPatch({ shadowMode: v })}
          label="Shadow mode"
          hint="Drafts are created but stay out of the review queue (use “Show shadow drafts”). Track never says “being reviewed” for them." />
        <Switch checked={Boolean(cfg.medicalLlmCheck)} disabled={busy} onChange={v => onPatch({ medicalLlmCheck: v })}
          label="Second opinion on borderline medical questions"
          hint="Off = every borderline question goes to a mentor (safest)." />
        <div className="air-cap">
          <label className="air-field">
            <span>Daily spend cap (USD)</span>
            <span className="air-cap-row">
              <input type="number" min="0" step="0.5" value={cap} onChange={e => setCap(e.target.value)} />
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy || Number(cap) === cfg.dailySpendCapUSD}
                onClick={() => onPatch({ dailySpendCapUSD: Number(cap) })}>Save</button>
            </span>
          </label>
          <div className="air-meter" aria-label={`Spent $${spent.toFixed(2)} of $${cfg.dailySpendCapUSD}`}>
            <i style={{ width: `${pct}%` }} className={pct >= 100 ? "is-full" : pct > 75 ? "is-high" : ""} />
          </div>
          <small>Today ({info.today && info.today.day} IST): ${spent.toFixed(3)} · {(info.today && info.today.calls) || 0} model calls. 0 pauses drafting.</small>
        </div>
      </div>
      <div className="air-settings-col">
        <h3>Streams</h3>
        <p className="air-muted">Start with the pilot streams; widen once approval rates hold.</p>
        <div className="air-streams">
          {(info.streams || []).map(s => (
            <Switch key={s.id} checked={Boolean(cfg.streams && cfg.streams[s.id])} disabled={busy}
              onChange={v => onPatch({ streams: { [s.id]: v } })}
              label={<>{s.label}{PILOT_STREAMS.has(s.id) && <em className="air-pilot">pilot</em>}</>} />
          ))}
        </div>
      </div>
      <div className="air-settings-col">
        <h3>System</h3>
        <ul className="air-sys">
          <li className={info.provider && info.provider.configured ? "ok" : "bad"}>
            {(info.provider && info.provider.label) || "Provider"} {info.provider && info.provider.configured ? "configured" : "not configured on the server"}
          </li>
          {info.gpt && info.gpt.configured === false && (
            <li className="bad">GPT not configured on this deploy — set OPENAI_API_KEY on Vercel production, then redeploy</li>
          )}
          <li className={info.kb && info.kb.chunks ? "ok" : "bad"}>Knowledge base: {(info.kb && info.kb.chunks) || 0} passages ({(info.kb && info.kb.source) || "none"})</li>
          <li className={info.allowList && info.allowList.loaded ? "ok" : "bad"}>Trusted sources: {(info.allowList && info.allowList.domains) || 0} domains</li>
          <li className="ok">Personas: {info.personaSource || "—"}</li>
        </ul>
        <ProviderDetails provider={info.provider} />
        <div className="air-sys-actions">
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy || !cfg.enabled} onClick={onRunSweep}>
            <Play size={14} aria-hidden="true" /><span className="ui-btn-label">Draft recent questions</span>
          </button>
          {failedCount > 0 && (
            <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" disabled={busy} onClick={onRetryFailed}>
              <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Retry {failedCount} failed</span>
            </button>
          )}
        </div>
        <BackfillCard enabled={Boolean(cfg.enabled)} busy={busy} onQueued={onBackfilled} />
        {cfg.updatedAt ? <small className="air-muted">Last changed {ago(cfg.updatedAt)}</small> : null}
      </div>
      <CompareSettings info={info} busy={busy} onPatch={onPatch} />
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Desk                                                              */
/* ---------------------------------------------------------------- */

function jobLabel(j) {
  return j.type === "cluster" ? `Group ${j.targetId}` : `Question ${j.targetId}`;
}

/** Jobs that failed for good, or are waiting out a retry after a provider error. */
function JobProblems({ failed, retrying, deferred, busy, onRetry, onRetryDeferred, onRunNow }) {
  const first = failed[0] || deferred[0] || retrying[0];
  const deferredN = (deferred || []).length;
  return (
    <div className="air-alert air-alert--soft" role="status">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>
        <b>
          {failed.length ? `${failed.length} draft${failed.length === 1 ? "" : "s"} failed` : ""}
          {failed.length && (retrying.length || deferredN) ? " · " : ""}
          {deferredN ? `${deferredN} queued because of an AI limit` : ""}
          {deferredN && retrying.length ? " · " : ""}
          {retrying.length ? `${retrying.length} waiting to retry` : ""}
        </b>
        {first && first.error ? <small className="air-alert-detail">Last error ({jobLabel(first)}): {first.error.replace(/^\w+ \d{3}: /, "").slice(0, 220)}</small> : null}
        <small className="air-alert-detail">Questions stay on Insights and this desk. After recharge, retry Hybrid (GPT draft + Gemini check). Nothing is published until an official approves it.</small>
      </span>
      {deferredN > 0 && (
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={onRetryDeferred}>
          <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Retry AI after recharge</span>
        </button>
      )}
      {failed.length > 0 && (
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Retry failed</span>
        </button>
      )}
      {!failed.length && !deferredN && retrying.length > 0 && (
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={onRunNow}>
          <Play size={14} aria-hidden="true" /><span className="ui-btn-label">Retry now</span>
        </button>
      )}
    </div>
  );
}

function RiskBadge({ risk, confidence }) {
  const r = risk || "high";
  return (
    <span className={`air-risk air-risk--${r}`}>
      <span className="air-risk-dot" aria-hidden="true" />
      {r.charAt(0).toUpperCase() + r.slice(1)} risk{typeof confidence === "number" ? ` · ${Math.round(confidence * 100)}% confidence` : ""}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Compare mode (evaluation): Hybrid (primary) vs Gemini only        */
/* ---------------------------------------------------------------- */

export const COMPARE_SIDES = ["hybrid", "gemini"];
/** `openai` labels GPT drafts compared before the hybrid switch. */
const SIDE_LABEL = { hybrid: "Hybrid (GPT draft + Gemini check)", gemini: "Gemini only", openai: "GPT" };
const SIDE_SHORT = { hybrid: "Hybrid", gemini: "Gemini only", openai: "GPT" };
const sideArg = p => (typeof p === "string" && COMPARE_SIDES.includes(p) ? p : "");

export function hasCompare(item) {
  if (isOverflowItem(item)) return false;
  return Boolean(item && item.aiDrafts && [...COMPARE_SIDES, "openai"].some(id => item.aiDrafts[id]));
}

export function isOverflowItem(item) {
  if (!item) return false;
  const s = item.aiDraft && item.aiDraft.status;
  if (s === "awaiting_ai" || s === "quotaDeferred" || s === "aiPending") return true;
  // A reviewable letter is never "waiting for AI", even if an old overflow flag stuck on the record.
  if (s === "pending" || s === "blocked" || s === "to-mentor" || s === "approved" || s === "edited") return false;
  return Boolean(item.overflow || item.quotaDeferred || item.pendingDraft);
}

const OVERFLOW_COPY = "Waiting for AI / quota — retry after recharge.";

/** A letter that came from GPT even when `drafter` was not stamped (compare records from before the hybrid switch). */
function looksLikeGpt(a) {
  if (!a || typeof a !== "object" || a.drafter === "gemini") return false;
  if (a.drafter === "hybrid" || a.provider === "openai" || a.provider === "hybrid") return true;
  if (a.draftFallback && a.draftFallback.from === "openai") return true;
  return /^gpt[-.]/i.test(String(a.model || ""));
}

/** Which side wrote `aiDraft`: stamped `drafter`, else a GPT model, else Gemini (drafts from before the hybrid switch). */
export function topSide(item) {
  const d = item && item.aiDraft && item.aiDraft.drafter;
  if (d === "hybrid" || d === "gemini") return d;
  return looksLikeGpt(item && item.aiDraft) ? "hybrid" : "gemini";
}

/** A card can show a letter, a block, or an error. An empty pending object is a blank card — treat it as missing. */
function sideVisible(v) {
  if (!v || typeof v !== "object") return false;
  if (v.status === "error" || v.status === "blocked") return true;
  if (draftLetter(v)) return true;
  if (Array.isArray(v.actions) && v.actions.some(x => String(x || "").trim())) return true;
  if (String(v.mistake || "").trim()) return true;
  return false;
}

/** Mirror `normalizeDrafts` on the server: a GPT letter on `aiDrafts.openai` fills the Hybrid card. */
function normalizeClientDrafts(aiDrafts) {
  if (!aiDrafts || typeof aiDrafts !== "object") return {};
  const out = { ...aiDrafts };
  const gptLetter = draftLetter(out.openai);
  const hybridLetter = draftLetter(out.hybrid);
  if (!hybridLetter && (gptLetter || (!sideVisible(out.hybrid) && sideVisible(out.openai)))) {
    const src = out.openai;
    out.hybrid = { ...src, answer: gptLetter || src.answer || "", provider: "hybrid", label: SIDE_LABEL.hybrid, legacyGpt: true };
  } else if (out.hybrid && gptLetter && !hybridLetter) {
    out.hybrid = { ...out.hybrid, answer: gptLetter };
  } else if (out.hybrid && hybridLetter && !String(out.hybrid.answer || "").trim()) {
    out.hybrid = { ...out.hybrid, answer: hybridLetter };
  }
  return out;
}

function hybridWaiting(item) {
  if (!item) return false;
  // Do not treat a stuck overflow flag on a real pending letter as "still waiting".
  if (isOverflowItem(item)) return true;
  return Boolean(
    item.regenerating
    || (item.job && (item.job.only === "hybrid" || item.job.only === "openai") && (item.job.status === "queued" || item.job.status === "running")),
  );
}

function syntheticHybridError(item) {
  const jobErr = item && item.job && item.job.error;
  return {
    provider: "hybrid",
    label: SIDE_LABEL.hybrid,
    status: "error",
    error: jobErr ? String(jobErr).slice(0, 220) : "GPT did not return a letter for this question. The GPT side hit a quota limit, timed out, or OPENAI_API_KEY is not set on Vercel production. Regenerate Hybrid. Nothing is published until you approve.",
    answer: "", actions: [], mistake: "", resources: [], citations: [], claimChecks: [],
    confidence: 0, risk: "high", verifyFlags: [],
  };
}

/** One side's draft; `aiDraft` stands in for its own side when that side was not stored separately. A GPT letter stored as `openai` (before Hybrid), or on `aiDraft`, fills the Hybrid card. An empty Hybrid shell does not hide that letter. */
function sideDraft(item, id) {
  const drafts = normalizeClientDrafts((item && item.aiDrafts) || {});
  let v = drafts[id] || null;
  if (id === "hybrid") {
    const gpt = drafts.openai;
    const gptLetter = draftLetter(gpt);
    const hybridLetter = draftLetter(v);
    if (!hybridLetter && (gptLetter || (!sideVisible(v) && sideVisible(gpt)))) {
      v = { ...gpt, answer: gptLetter || (gpt && gpt.answer) || "", provider: "hybrid", label: SIDE_LABEL.hybrid, legacyGpt: true };
    } else if (v && hybridLetter && !String(v.answer || "").trim()) {
      v = { ...v, answer: hybridLetter, provider: "hybrid", label: SIDE_LABEL.hybrid };
    } else if (v && v.provider === "openai") {
      v = { ...v, answer: gptLetter || v.answer || "", provider: "hybrid", label: SIDE_LABEL.hybrid, legacyGpt: true };
    }
  }
  if (v && (v.status === "error" || v.status === "blocked" || draftLetter(v)
    || (Array.isArray(v.actions) && v.actions.some(x => String(x || "").trim()))
    || String(v.mistake || "").trim())) return v;
  const a = item && item.aiDraft;
  if (id === "hybrid" && looksLikeGpt(a) && draftLetter(a)) {
    return { ...a, answer: draftLetter(a), provider: "hybrid", label: SIDE_LABEL.hybrid };
  }
  if (id === topSide(item) && sideVisible(a)) return { ...a, answer: draftLetter(a) || a.answer, provider: id, legacy: true };
  if (id === "hybrid" && !hybridWaiting(item) && (sideVisible(drafts.gemini) || sideVisible(drafts.openai) || draftLetter(a))) {
    if (draftLetter(a) && looksLikeGpt(a)) return { ...a, answer: draftLetter(a), provider: "hybrid", label: SIDE_LABEL.hybrid };
    return syntheticHybridError(item);
  }
  return null;
}

/** The record as the editor expects it, starting from one side's draft. */
function sideAsItem(item, id) {
  const v = sideDraft(item, id);
  if (!v || id === topSide(item)) return item;
  return { ...item, aiDraft: { ...v, persona: item.aiDraft && item.aiDraft.persona } };
}

function fmtMs(ms) {
  if (!(ms > 0)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function fmtUsd(x, digits = 4) {
  return Number.isFinite(x) && x > 0 ? `$${x.toFixed(digits)}` : "—";
}

const pct = x => (x == null ? "—" : `${Math.round(x * 100)}%`);

function CompareSide({ id, v, active, primary, canApprove, canEdit, busy, onApprove, onEdit, onRegenerate, item }) {
  const label = SIDE_SHORT[id] || id;
  const [activeCite, setActiveCite] = useState("");
  const refs = useRef(new Map());
  const citations = (v && v.citations) || [];
  const citeIndex = useMemo(() => new Map(citations.map((c, i) => [c.chunkId, i + 1])), [citations]);
  const onCite = useCallback(cid => {
    setActiveCite(cid);
    const el = refs.current.get(cid);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const failed = v && v.status === "error";
  const blocked = v && v.status === "blocked";
  const body = draftLetter(v);
  const extras = Boolean(v && ((Array.isArray(v.actions) && v.actions.some(x => String(x || "").trim())) || String(v.mistake || "").trim()));
  const drafted = Boolean(body || extras);
  const counts = ((v && v.claimChecks) || []).reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {});
  const flags = ((v && v.verifyFlags) || []).filter(f => !(isMentorAssist(v) && f.startsWith(LIMITED_TITLE)));
  return (
    <section id={`air-side-${id}`} className={`air-compare-side${active ? " is-on" : ""}${failed ? " is-failed" : ""}`} role="tabpanel" aria-label={`${label} draft`} data-provider={id}>
      <header className="air-compare-head">
        <h3>{SIDE_LABEL[id] || id}{primary && <em className="air-pilot">primary</em>}</h3>
        {drafted && <RiskBadge risk={v.risk} confidence={v.confidence} />}
      </header>
      {v && v.draftFallback && <p className="air-hint air-hint--warn"><AlertTriangle size={13} aria-hidden="true" /> GPT did not draft this one — Gemini wrote it (fallback).</p>}
      {v && v.legacyGpt && <p className="air-hint">GPT answer kept on the openai side — shown here on the Hybrid card.</p>}
      <dl className="air-compare-meta">
        <dt>Model</dt><dd>{(v && v.model) || "—"}{v && v.verifyModel ? ` · checked by ${v.verifyModel}` : ""}{v && v.escalated ? " (escalated)" : ""}</dd>
        <dt>Latency</dt><dd>{v && !v.legacy ? fmtMs(v.latencyMs) : "—"}</dd>
        <dt>Cost</dt><dd>{v && !v.legacy ? fmtUsd(v.usage && v.usage.costUSD) : "—"}</dd>
      </dl>

      {!v && (
        <div className="air-compare-missing">
          {isOverflowItem(item) ? (
            <p>{label} is queued because of an AI limit — Hybrid (GPT draft + Gemini check) will run after recharge. Nothing is published until an official approves it.</p>
          ) : item && (item.regenerating || (item.job && (item.job.only === id || (id === "hybrid" && item.job.only === "openai")) && (item.job.status === "queued" || item.job.status === "running"))) ? (
            <p>{label} draft continues in the next run — it will appear here when GPT finishes. Use Regenerate if it stalls.</p>
          ) : id === "hybrid" ? (
            <div className="air-alert air-compare-failed" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <b>Hybrid draft was not saved</b>
                <small className="air-alert-detail">{item && item.job && item.job.error ? String(item.job.error).slice(0, 220) : "GPT did not return a letter for this question. The GPT side hit a quota limit, timed out, or OPENAI_API_KEY is not set on Vercel production. Regenerate Hybrid. Nothing is published until you approve."}</small>
              </span>
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => onRegenerate(id)}>
                <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Regenerate Hybrid</span>
              </button>
            </div>
          ) : (
            <>
              <p>No {label} draft for this question yet.</p>
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => onRegenerate(id)}>
                <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Draft with {label}</span>
              </button>
            </>
          )}
        </div>
      )}
      {v && !failed && !blocked && !drafted && (
        <div className="air-alert air-compare-failed" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <b>{id === "hybrid" ? "Hybrid draft was not saved" : `${label} draft was not saved`}</b>
            <small className="air-alert-detail">{id === "hybrid" ? (item && item.job && item.job.error ? String(item.job.error).slice(0, 220) : "GPT did not return a letter for this question. The GPT side hit a quota limit, timed out, or OPENAI_API_KEY is not set on Vercel production. Regenerate Hybrid. Nothing is published until you approve.") : `No ${label} letter was stored.`}</small>
          </span>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => onRegenerate(id)}>
            <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Regenerate {label}</span>
          </button>
        </div>
      )}
      {failed && (
        <div className="air-alert air-compare-failed" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <b>{label} draft failed — Regenerate</b>
            {v.error && <small className="air-alert-detail">{v.error}</small>}
          </span>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => onRegenerate(id)}>
            <RefreshCw size={14} aria-hidden="true" /><span className="ui-btn-label">Regenerate {label}</span>
          </button>
        </div>
      )}
      {blocked && (
        <div className="air-blocked">
          <Ban size={18} aria-hidden="true" />
          <div>
            <b>{v.blockedReason === "insufficient_source" ? "Not drafted — the trusted sources don’t cover this yet." : "Not drafted."}</b>
            {v.blockedNote && <p>{String(v.blockedNote).replace(/[.\s]*$/, ".")}</p>}
          </div>
        </div>
      )}
      {drafted && (
        <>
          {isMentorAssist(v) && <p className="air-hint air-hint--warn"><AlertTriangle size={13} aria-hidden="true" /> {LIMITED_TITLE}</p>}
          {flags.length > 0 && <ul className="air-flags">{flags.map((f, i) => <li key={i}><AlertTriangle size={12} aria-hidden="true" />{f}</li>)}</ul>}
          <Letter item={{ aiDraft: v }} citeIndex={citeIndex} onCite={onCite} />
          <div className="air-compare-panel">
            <h4>Claim checks <span className="air-claim-sum">
              {counts.supported ? <em className="ok">{counts.supported} supported</em> : null}
              {counts.outdated ? <em className="warn">{counts.outdated} outdated</em> : null}
              {counts.unsupported ? <em className="bad">{counts.unsupported} unsupported</em> : null}
              {counts.guidance ? <em className="muted">{counts.guidance} guidance</em> : null}
            </span></h4>
            <ClaimChecks checks={v.claimChecks || []} citeIndex={citeIndex} onCite={onCite} />
          </div>
          <div className="air-compare-panel">
            <h4>Sources <span className="air-muted">({citations.length})</span></h4>
            <SourceCards citations={citations} activeId={activeCite} cardRefs={refs} />
          </div>
        </>
      )}

      {(canApprove || canEdit) && v && !failed && (
        <div className="air-actions air-compare-actions">
          {canApprove && drafted && (
            <button type="button" className="ui-btn ui-btn--primary ui-btn--md" disabled={busy} onClick={() => onApprove(id)}>
              {busy ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              <span className="ui-btn-label">Approve this ({label})</span>
            </button>
          )}
          {canEdit && (
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" disabled={busy} onClick={() => onEdit(id)} aria-label={`Edit then send (${label})`}>
              <PenLine size={16} aria-hidden="true" /><span className="ui-btn-label">Edit then send</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Side by side at ≥ 1100 px, tabs below (CSS). */
export function CompareView({ item, busy, canApprove, canEdit, onApprove, onEdit, onRegenerate }) {
  const top = topSide(item);
  const [tab, setTab] = useState(top);
  return (
    <div className="air-compare">
      <div className="air-seg air-compare-tabs" role="tablist" aria-label="Compare drafts">
        {COMPARE_SIDES.map(id => {
          const v = sideDraft(item, id);
          return (
            <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`air-side-${id}`}
              className={`air-seg-btn${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>
              {SIDE_SHORT[id]}{v && v.status === "error" ? " · failed" : !v && isOverflowItem(item) ? " · queued" : !v && item && (item.regenerating || (item.job && (item.job.only === id || (id === "hybrid" && item.job.only === "openai")) && (item.job.status === "queued" || item.job.status === "running"))) ? " · continues" : !v ? (id === "hybrid" ? " · not saved" : " · none") : ""}
            </button>
          );
        })}
      </div>
      <div className="air-compare-grid">
        {COMPARE_SIDES.map(id => (
          <CompareSide key={id} id={id} v={sideDraft(item, id)} active={tab === id} primary={id === top} busy={busy}
            canApprove={canApprove} canEdit={canEdit} onApprove={onApprove} onEdit={onEdit} onRegenerate={onRegenerate} item={item} />
        ))}
      </div>
    </div>
  );
}

function RegenerateMenu({ busy, onRegenerate }) {
  const [open, setOpen] = useState(false);
  const pick = p => { setOpen(false); onRegenerate(p); };
  return (
    <span className="air-regen">
      <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(v => !v)}>
        <RefreshCw size={16} aria-hidden="true" /><span className="ui-btn-label">Regenerate</span><kbd>G</kbd>
      </button>
      {open && (
        <span className="air-regen-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => pick("")}>Both</button>
          <button type="button" role="menuitem" onClick={() => pick("hybrid")}>Hybrid draft</button>
          <button type="button" role="menuitem" onClick={() => pick("gemini")}>Gemini-only draft</button>
        </span>
      )}
    </span>
  );
}

function CompareStatsTable({ stats }) {
  if (!stats) return null;
  if (!stats.compared) return <small className="air-muted">No question has both drafts yet.</small>;
  return (
    <>
      <small className="air-muted">{stats.compared} compared · {stats.reviewed} sent · {stats.rejected} rejected · {stats.toMentor} to mentor</small>
      <div className="air-compare-stats-wrap">
        <table className="air-compare-stats">
          <thead>
            <tr><th scope="col">Model</th><th scope="col">Drafts</th><th scope="col">Failed</th><th scope="col">Chosen</th><th scope="col">Edited</th><th scope="col">Avg edit</th><th scope="col">Latency</th><th scope="col">Cost / draft</th><th scope="col">Claims supported</th><th scope="col">Confidence</th></tr>
          </thead>
          <tbody>
            {(stats.providers || []).map(p => (
              <tr key={p.provider}>
                <th scope="row">{p.label}</th>
                <td>{p.drafts}</td>
                <td>{p.errors}</td>
                <td>{p.chosen}{p.chosenRate != null ? ` (${pct(p.chosenRate)})` : ""}</td>
                <td>{p.edited}</td>
                <td>{pct(p.avgEditRatio)}</td>
                <td>{fmtMs(p.avgLatencyMs)}</td>
                <td>{fmtUsd(p.avgCostUSD)}</td>
                <td>{pct(p.supportRate)}</td>
                <td>{pct(p.avgConfidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const STEP_LABEL = { classify: "Classify", draft: "Draft", verify: "Check claims", escalate: "Re-check" };

function CompareSettings({ info, busy, onPatch }) {
  const cfg = info.config || {};
  const sides = info.compareProviders || [];
  const by = (info.today && info.today.byProvider) || {};
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    aiApi("aiCompareStats")
      .then(r => { if (!off) { setStats(r.compare || null); setErr(""); } })
      .catch(e => { if (!off) setErr(e.message || "Could not load comparison stats."); });
    return () => { off = true; };
  }, [cfg.compareMode]);
  const pipeline = info.pipeline || null;
  const familySpend = [["openai", "GPT"], ["gemini", "Gemini"]];
  return (
    <div className="air-settings-col air-compare-settings">
      <h3>Models</h3>
      {pipeline && (
        <>
          <p className="air-muted">Primary: <b>{pipeline.label}</b></p>
          <dl className="air-provider-dl" aria-label="Model per pipeline step">
            {(pipeline.steps || []).map(s => (
              <React.Fragment key={s.step}>
                <dt>{STEP_LABEL[s.step] || s.step}</dt>
                <dd>{s.label}{s.model ? ` · ${s.model}` : ""}{s.fallback ? ` (if GPT fails or is late: ${s.fallback.label}${s.fallback.model ? ` · ${s.fallback.model}` : ""})` : ""}</dd>
              </React.Fragment>
            ))}
          </dl>
        </>
      )}
      <Switch checked={Boolean(cfg.compareMode)} disabled={busy} onChange={v => onPatch({ compareMode: v })}
        label="Compare mode (Hybrid vs Gemini only)"
        hint={cfg.compareMode ? "On — each question is also drafted by Gemini only from the same sources; you choose which one to send." : "Off — the primary drafts alone."} />
      <small className="air-muted">Compare mode for evaluation; turn off after review.</small>
      {info.gpt && info.gpt.configured === false && (
        <p className="air-hint air-hint--warn" role="status"><AlertTriangle size={13} aria-hidden="true" /> {info.gpt.hint || "GPT not configured on this deploy. Set OPENAI_API_KEY on the Vercel production environment, then redeploy."}</p>
      )}
      {sides.length > 0 && (
        <dl className="air-provider-dl" aria-label="Compare models">
          {sides.map(s => (
            <React.Fragment key={s.side}>
              <dt>{s.label}</dt>
              <dd>{s.draftModel || "—"}{s.verifyModel ? ` · checked by ${s.verifyModel}` : ""}{s.configured ? "" : " · not configured on the server"}{s.side === "hybrid" && s.gptConfigured === false ? " · GPT not configured on this deploy" : ""}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      <small className="air-muted">Spend today: {familySpend.map(([id, label]) => `${label} $${((by[id] && by[id].costUSD) || 0).toFixed(3)}`).join(" · ")}</small>
      <b className="air-compare-stats-title">Comparison stats</b>
      {err ? <small className="air-backfill-warn" role="alert">{err}</small> : <CompareStatsTable stats={stats} />}
    </div>
  );
}

function ListItem({ item, active, onSelect, streamLabel }) {
  const a = item.aiDraft || {};
  return (
    <li role="option" aria-selected={active}>
      <button type="button" className={`air-item${active ? " is-active" : ""}`} onClick={onSelect}>
        <span className={`air-item-dot air-item-dot--${a.status === "blocked" ? "blocked" : a.risk || "high"}`} aria-hidden="true" />
        <span className="air-item-body">
          <span className="air-item-top">
            <span className="air-item-id">{item.targetType === "cluster" ? `Group · ${item.memberCount} students` : item.ticket || item.targetId}</span>
            <span className="air-item-age">{ago(item.createdAt)}</span>
          </span>
          <span className="air-item-q">{item.question}</span>
          <span className="air-item-chips">
            <TriageBadge triage={a.triage} compact />
            <span className="air-chip">{streamLabel(item.stream)}</span>
            {item.shadow && a.status === "pending" && <span className="air-chip air-chip--shadow">shadow</span>}
            {isMentorAssist(a) && a.status === "pending" && <span className="air-chip air-chip--limited" title={LIMITED_HINT}>Limited sources</span>}
            {a.status === "blocked" && <span className="air-chip air-chip--blocked">{a.blockedReason === "medical" ? "medical → mentor" : "no sources"}</span>}
            {a.status !== "pending" && a.status !== "blocked" && !isOverflowItem(item) && <span className="air-chip">{a.status}</span>}
            {isOverflowItem(item) && <span className="air-chip air-chip--limited">waiting for AI / quota</span>}
            {hasCompare(item) && a.status === "pending" && <span className="air-chip air-chip--compare">Hybrid + Gemini</span>}
            {item.inGroup && <span className="air-chip"><Users size={10} aria-hidden="true" /> in group {item.inGroup.size}</span>}
            {item.regenerating && <span className="air-chip"><Loader2 size={10} className="ui-btn-spin" aria-hidden="true" /> redrafting</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function AiReviewDesk() {
  const [status, setStatus] = useState("open");
  const [stream, setStream] = useState("");
  const [triageFilter, setTriageFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [showShadow, setShowShadow] = useState(false);
  const [data, setData] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(() => {
    try { return sessionStorage.getItem(AI_FOCUS_KEY) || ""; } catch { return ""; }
  });
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState(null);
  const [editSide, setEditSide] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backfilled, setBackfilled] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mentorName, setMentorName] = useState(() => {
    try { return localStorage.getItem("aym-ai-signed-as") || ""; } catch { return ""; }
  });
  const [activeCite, setActiveCite] = useState("");
  const cardRefs = useRef(new Map());
  const listRef = useRef(null);
  const detailRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [q, c] = await Promise.all([
        aiApi("aiQueue", { status, stream, shadow: showShadow }),
        aiApi("aiConfigGet"),
      ]);
      setData(q);
      setInfo(c);
    } catch (e) {
      setError(e.message || `Could not load ${DISHA_DRAFTS}.`);
    }
    if (!quiet) setLoading(false);
  }, [status, stream, showShadow]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { sessionStorage.removeItem(AI_FOCUS_KEY); } catch { /* ignore */ } }, []);

  // Poll only while something can actually finish soon — not for jobs paused until a later retry.
  const working = data ? (data.working || []).filter(j => j.status === "running" || (j.nextAt || 0) <= Date.now() + 5000).length : 0;
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(() => load(true), 6000);
    return () => clearInterval(t);
  }, [working, load]);

  const items = useMemo(() => (data ? filterByMode(filterByTriage(data.items, triageFilter), modeFilter) : []), [data, triageFilter, modeFilter]);
  const selected = useMemo(() => items.find(i => i.id === selectedId) || items[0] || null, [items, selectedId]);
  useEffect(() => { setMode("view"); setEditSide(""); setActionErr(""); setActiveCite(""); }, [selected && selected.id]);

  const streamLabels = useMemo(() => new Map(((info && info.streams) || []).map(s => [s.id, s.label])), [info]);
  const streamLabel = useCallback(id => {
    const l = streamLabels.get(id) || id || "—";
    return l.length > 34 ? `${l.split(/[—(&,]/)[0].trim()}` : l;
  }, [streamLabels]);

  const citations = (selected && selected.aiDraft.citations) || [];
  const citeIndex = useMemo(() => new Map(citations.map((c, i) => [c.chunkId, i + 1])), [citations]);
  const onCite = useCallback(id => {
    setActiveCite(id);
    const el = cardRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  function replaceItem(next) {
    setData(d => (d ? { ...d, items: d.items.map(i => (i.id === next.id ? { ...i, ...next } : i)) } : d));
  }

  function moveNext() {
    const idx = items.findIndex(i => i.id === (selected && selected.id));
    const next = items[idx + 1] || items[idx - 1];
    if (next) setSelectedId(next.id);
  }

  async function act(op, payload, success) {
    if (!selected || busy) return;
    setBusy(true);
    setActionErr("");
    try {
      const r = await aiApi(op, { id: selected.id, ...payload });
      invalidateAiDraftIndex();
      if (r.item) replaceItem(r.item);
      setFlash(success);
      setTimeout(() => setFlash(""), 3200);
      setMode("view");
      if (status === "open" && op !== "aiRegenerate") moveNext();
      await load(true);
    } catch (e) {
      setActionErr(e.message || "That did not work. Try again.");
    }
    setBusy(false);
  }

  const approve = p => {
    const side = sideArg(p);
    act("aiApprove", { mentorName, reviewer: mentorName || "staff", ...(side ? { provider: side } : {}) },
      side ? `Approved the ${SIDE_LABEL[side]} draft — the student can read it on Track now.` : "Approved — the student can read it on Track now.");
  };
  const startEdit = p => {
    const side = sideArg(p);
    setForm(draftToForm(side ? sideAsItem(selected, side) : selected, mentorName));
    setEditSide(side);
    setMode("edit");
  };
  const saveEdit = () => {
    const resources = [[form.r1t, form.r1u], [form.r2t, form.r2u]].filter(([t, u]) => t.trim() || u.trim()).map(([title, url]) => ({ title, url }));
    act("aiEditApprove", {
      answer: form.answer, actions: [form.a1, form.a2, form.a3], mistake: form.mistake, resources,
      mentorName: form.mentorName, reviewer: form.mentorName || mentorName || "staff",
      ...(editSide ? { provider: editSide } : {}),
    }, "Edited and sent — your changes are saved for learning.");
  };
  const isGroup = selected && selected.targetType === "cluster";
  const reject = (reason, tag) => act("aiReject", { reason, tag, reviewer: mentorName || "staff" }, isGroup
    ? "Rejected. The group stays on the Curation desk for a mentor answer."
    : "Rejected. The question stays on Insights → Briefing board for a human answer.");
  const toMentor = () => act("aiSendToMentor", { reviewer: mentorName || "staff" }, isGroup
    ? "Sent to a mentor — the group is marked “Sent to mentor” on the Curation desk and goes out in the Mentor pack."
    : "Sent to a mentor — answer it from Insights → Briefing board (Provide answer).");
  const regenerate = p => {
    const side = sideArg(p);
    act("aiRegenerate", side ? { provider: side } : {}, side ? `Redrafting the ${SIDE_LABEL[side]} draft — it will refresh here in a moment.` : "Redrafting — it will refresh here in a moment.");
  };

  async function patchConfig(patch) {
    setBusy(true);
    try {
      const r = await aiApi("aiConfigSet", { patch });
      setInfo(r);
      invalidateAiDraftIndex();
      if (r.promoted) {
        setFlash(`${r.promoted} shadow draft${r.promoted === 1 ? " is" : "s are"} now in the review queue.`);
        setTimeout(() => setFlash(""), 4000);
        load(true);
      }
    } catch (e) {
      setError(e.message || "Could not save settings.");
    }
    setBusy(false);
  }

  function onBackfilled(r) {
    setBackfilled(r && r.enqueued ? r : null);
    setFlash(r && r.enqueued ? `${r.enqueued} existing question${r.enqueued === 1 ? "" : "s"} queued for drafting.` : "Nothing new to queue.");
    setTimeout(() => setFlash(""), 4000);
    load(true);
  }

  async function runNow(sweep = false) {
    setBusy(true);
    setBackfilled(null);
    try {
      await aiApi("aiRunNow", { sweep });
      setFlash(sweep ? "Drafting recent questions — results appear here as they finish." : "Processing the queue…");
      setTimeout(() => setFlash(""), 3200);
      setTimeout(() => load(true), 4000);
    } catch (e) {
      setError(e.message || "Could not start the worker.");
    }
    setBusy(false);
  }

  async function retryFailed() {
    setBusy(true);
    try { await aiApi("aiRetryFailed"); await load(true); } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function retryOverflow(id) {
    setBusy(true);
    setActionErr("");
    try {
      await aiApi("aiRetryDeferred", id ? { id } : {});
      setFlash("Retrying AI after recharge — drafts appear here when they finish. Nothing is published until you approve.");
      setTimeout(() => setFlash(""), 4000);
      setTimeout(() => load(true), 4000);
    } catch (e) {
      setActionErr(e.message || "Could not retry AI.");
    }
    setBusy(false);
  }

  async function retryDeferred() {
    setBusy(true);
    try {
      const r = await aiApi("aiRetryDeferred");
      setFlash(`Retrying ${r.requeued || 0} deferred Hybrid draft${r.requeued === 1 ? "" : "s"} after recharge. Nothing is published until you approve.`);
      setTimeout(() => setFlash(""), 4000);
      await load(true);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  useEffect(() => {
    try { localStorage.setItem("aym-ai-signed-as", mentorName); } catch { /* ignore */ }
  }, [mentorName]);

  // Keyboard: j/k or arrows to move, a approve, e edit, r reject, m mentor, g regenerate, ? help.
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { if (mode !== "view") setMode("view"); setHelpOpen(false); return; }
      if (isTyping(document.activeElement) || mode !== "view") return;
      const idx = items.findIndex(i => i.id === (selected && selected.id));
      const k = e.key;
      if (k === "j" || k === "ArrowDown") { e.preventDefault(); const n = items[Math.min(items.length - 1, idx + 1)]; if (n) setSelectedId(n.id); return; }
      if (k === "k" || k === "ArrowUp") { e.preventDefault(); const n = items[Math.max(0, idx - 1)]; if (n) setSelectedId(n.id); return; }
      if (k === "?") { setHelpOpen(v => !v); return; }
      if (!selected || busy) return;
      const s = selected.aiDraft.status;
      const open = s === "pending" || s === "blocked" || s === "to-mentor" || s === "rejected";
      if (!open) return;
      const blockedApprove = (selected.groupNow && (selected.groupNow.changed || selected.groupNow.missing)) || selected.answeredElsewhere;
      if (selected.answeredElsewhere) return;
      // Compare mode: approving or editing needs an explicit choice of draft.
      const compare = hasCompare(selected);
      if (k === "a" && s === "pending" && !blockedApprove && !compare) { e.preventDefault(); approve(); }
      else if (k === "e" && !compare) { e.preventDefault(); startEdit(); }
      else if (k === "r" && s !== "rejected") { e.preventDefault(); setMode("reject"); }
      else if (k === "m" && s !== "to-mentor") { e.preventDefault(); toMentor(); }
      else if (k === "g") { e.preventDefault(); regenerate(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!selected || !listRef.current) return;
    const el = listRef.current.querySelector(".air-item.is-active");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected && selected.id]);

  const cfg = (info && info.config) || {};
  const counts = (data && data.counts) || {};
  const today = (info && info.today) || {};

  return (
    <div className="air">
      <header className="air-head">
        <div>
          <span className="air-eyebrow"><Sparkles size={14} aria-hidden="true" />{DISHA_ROLE} · official review</span>
          <h1 className="air-title">Review before it reaches a student.</h1>
          <p className="air-lead">Each draft is written from trusted sources, checked claim by claim, and waits here. Nothing appears on Track until an official approves it.</p>
        </div>
        <div className="air-head-actions">
          <button type="button" className={`ui-btn ui-btn--sm ${cfg.enabled && counts.jobsQueued ? "ui-btn--primary" : "ui-btn--secondary"}`} onClick={() => runNow(false)} disabled={busy || !cfg.enabled}>
            <Play size={14} aria-hidden="true" /><span className="ui-btn-label">{cfg.enabled && counts.jobsQueued ? `Process queue now (${counts.jobsQueued})` : "Process queue"}</span>
          </button>
          <button type="button" className={`ui-btn ui-btn--sm ${settingsOpen ? "ui-btn--primary" : "ui-btn--tertiary"}`} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(v => !v)}>
            <Settings2 size={14} aria-hidden="true" /><span className="ui-btn-label">Settings</span>
          </button>
          <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" aria-expanded={helpOpen} onClick={() => setHelpOpen(v => !v)} title="Keyboard shortcuts (?)">
            <Keyboard size={14} aria-hidden="true" /><span className="aym-visually-hidden">Keyboard shortcuts</span>
          </button>
        </div>
      </header>

      <div className="air-stats" role="status">
        <span><b>{counts.pending ?? "–"}</b> waiting</span>
        <span><b>{counts.shadow ?? "–"}</b> shadow</span>
        {counts.mentorAssist ? <span title={LIMITED_TITLE}><b>{counts.mentorAssist}</b> limited sources</span> : null}
        <span><b>{counts.blocked ?? "–"}</b> blocked</span>
        {counts.superseded ? <span title="A mentor answered these on the briefing board, Curation desk or Excel before review"><b>{counts.superseded}</b> answered elsewhere</span> : null}
        {(counts.awaitingAi || counts.quotaDeferred || counts.aiPending) ? <span title="Questions saved; Hybrid draft waits for AI capacity"><b>{counts.awaitingAi || (counts.quotaDeferred || 0) + (counts.aiPending || 0)}</b> waiting for AI / quota</span> : null}
        <span><b>{counts.jobsQueued ?? "–"}</b> drafting{counts.jobsQueued ? <Loader2 size={12} className="ui-btn-spin" aria-hidden="true" /> : null}</span>
        <span>Today <b>${(today.costUSD || 0).toFixed(2)}</b> of ${cfg.dailySpendCapUSD ?? "–"}</span>
        <span className={`air-state air-state--${cfg.enabled ? "on" : "off"}`}>{cfg.enabled ? (cfg.shadowMode !== false ? "On · shadow mode" : "On · live review") : "Off"}</span>
      </div>

      {helpOpen && (
        <div className="air-help" role="note">
          <b>Keyboard</b> <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>a</kbd> approve and send · <kbd>e</kbd> edit then send · <kbd>r</kbd> reject · <kbd>m</kbd> send to mentor · <kbd>g</kbd> regenerate · <kbd>Esc</kbd> cancel
        </div>
      )}

      {cfg.alert && cfg.alert.message && (
        <div className="air-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <b>{cfg.alert.type === "spend-cap" ? "Spend cap reached." : cfg.alert.type === "provider" ? "DISHA can't reach its AI provider." : "Attention."}</b>{" "}
            {cfg.alert.message}
            {cfg.alert.type === "provider" && " Use Settings → Test DISHA connection to check the fix."}
          </span>
          <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" onClick={() => patchConfig({ clearAlert: true })}>Dismiss</button>
        </div>
      )}
      {data && ((data.failed || []).length > 0 || (data.deferred || []).length > 0 || (data.working || []).some(j => j.error)) && (
        <JobProblems failed={data.failed || []} deferred={data.deferred || []} retrying={(data.working || []).filter(j => j.error && !(data.deferred || []).some(d => d.id === j.id))} busy={busy} onRetry={retryFailed} onRetryDeferred={retryDeferred} onRunNow={() => runNow(false)} />
      )}
      {info && !cfg.enabled && (
        <div className="air-notice air-banner" role="status">
          <ShieldCheck size={16} aria-hidden="true" />
          <span><b>DISHA is off — turn it on in Settings.</b> Students see no change and no question leaves the server. Start with the pilot streams, then use “Draft existing questions” for questions asked earlier.</span>
          {!settingsOpen && (
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={14} aria-hidden="true" /><span className="ui-btn-label">Open Settings</span>
            </button>
          )}
        </div>
      )}
      {info && cfg.enabled && cfg.shadowMode !== false && (
        <div className="air-notice air-banner air-banner--shadow" role="status">
          <CircleDashed size={16} aria-hidden="true" />
          <span><b>Shadow mode: drafts are hidden — turn off to review.</b> {counts.shadow ? `${counts.shadow} draft${counts.shadow === 1 ? " is" : "s are"} written but kept out of the queue; ` : ""}students never see a draft until an official approves it.</span>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" disabled={busy} onClick={() => patchConfig({ shadowMode: false })}>
            <span className="ui-btn-label">Turn off shadow mode</span>
          </button>
        </div>
      )}
      {info && cfg.enabled && Object.values(cfg.streams || {}).every(v => !v) && (
        <div className="air-notice air-banner" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span><b>No stream is switched on.</b> Only clear triage cases (off-topic, safety) are queued. Turn on a stream in Settings.</span>
        </div>
      )}
      {backfilled && cfg.enabled && counts.jobsQueued > 0 && (
        <div className="air-notice air-banner air-banner--next" role="status">
          <Clock size={16} aria-hidden="true" />
          <span><b>{backfilled.enqueued} existing question{backfilled.enqueued === 1 ? "" : "s"} queued.</b> The worker drafts a few per run (about a minute each) — press Process queue now to start, then again until the queue is empty.</span>
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={() => runNow(false)}>
            <Play size={14} aria-hidden="true" /><span className="ui-btn-label">Process queue now</span>
          </button>
        </div>
      )}
      {info && cfg.enabled && info.provider && !info.provider.configured && (
        <div className="air-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>DISHA has no AI provider key on the server, so questions wait in the queue. Add one in Vercel (see the pipeline doc) and redeploy.</span>
        </div>
      )}
      {info && cfg.enabled && info.gpt && info.gpt.configured === false && (
        <div className="air-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>GPT not configured on this deploy — Hybrid drafts cannot use GPT until OPENAI_API_KEY is set on Vercel production and the app is redeployed.</span>
        </div>
      )}

      {settingsOpen && info && (
        <SettingsPanel info={info} busy={busy} onPatch={patchConfig} onRunSweep={() => runNow(true)}
          onRetryFailed={retryFailed} failedCount={counts.jobsFailed || 0} onBackfilled={onBackfilled} />
      )}

      <div className="air-toolbar">
        <div className="air-seg" role="tablist" aria-label="Draft status">
          {STATUS_TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={status === id} className={`air-seg-btn${status === id ? " is-on" : ""}`} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
        </div>
        <select className="air-select" value={stream} onChange={e => setStream(e.target.value)} aria-label="Stream">
          <option value="">All streams</option>
          {((info && info.streams) || []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <TriageFilter value={triageFilter} onChange={setTriageFilter} items={data ? data.items : []} />
        <ModeFilter value={modeFilter} onChange={setModeFilter} items={data ? data.items : []} />
        <Switch checked={showShadow} onChange={setShowShadow} label="Show shadow drafts" />
        <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" onClick={() => load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "ui-btn-spin" : ""} aria-hidden="true" /><span className="ui-btn-label">Refresh</span>
        </button>
      </div>

      {flash && <div className="air-flash" role="status">{flash}</div>}
      {error && (
        <div className="air-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" /><span>{error}</span>
          <button type="button" className="ui-btn ui-btn--tertiary ui-btn--sm" onClick={() => load()}>Retry</button>
        </div>
      )}

      {loading && !data ? (
        <div className="air-grid" aria-busy="true">
          <div className="air-list air-skel">{[0, 1, 2, 3].map(i => <div key={i} className="air-skel-row" />)}</div>
          <div className="air-detail air-skel"><div className="air-skel-block" /><div className="air-skel-row" /><div className="air-skel-row" /></div>
        </div>
      ) : !items.length ? (
        <div className="air-empty">
          <Sparkles size={22} aria-hidden="true" />
          <h2>{status === "open" ? "Nothing waiting for review" : "No drafts here"}</h2>
          <p>
            {status === "open" && counts.shadow && !showShadow
              ? `${counts.shadow} shadow draft${counts.shadow === 1 ? " is" : "s are"} hidden. Turn on “Show shadow drafts” to inspect them.`
              : cfg.enabled ? "New Ask Desk questions in enabled streams will be drafted and appear here. For questions asked earlier, use Settings → Draft existing questions." : "Turn DISHA on in Settings to start."}
          </p>
        </div>
      ) : (
        <div className="air-grid">
          <ol className="air-list" role="listbox" aria-label="Drafts" ref={listRef}>
            {items.map(it => (
              <ListItem key={it.id} item={it} active={selected && selected.id === it.id} streamLabel={streamLabel}
                onSelect={() => { setSelectedId(it.id); detailRef.current?.focus({ preventScroll: true }); }} />
            ))}
            {data.total > items.length && <li className="air-muted air-more">Showing {items.length} of {data.total}</li>}
          </ol>

          {selected && (
            <section className="air-detail" tabIndex={-1} ref={detailRef} aria-label="Selected draft">
              <Detail
                item={selected}
                mode={mode}
                form={form}
                setForm={setForm}
                busy={busy}
                actionErr={actionErr}
                citeIndex={citeIndex}
                onCite={onCite}
                activeCite={activeCite}
                cardRefs={cardRefs}
                streamLabel={streamLabel}
                mentorName={mentorName}
                setMentorName={setMentorName}
                onApprove={approve}
                onEdit={startEdit}
                onSaveEdit={saveEdit}
                onReject={() => setMode("reject")}
                onConfirmReject={reject}
                onToMentor={toMentor}
                onRegenerate={regenerate}
                onRetryOverflow={() => retryOverflow(selected.id)}
                editSide={editSide}
                onTriageAction={(op, payload, msg) => act(op, { ...payload, mentorName, reviewer: mentorName || "staff" }, msg)}
                onCancel={() => setMode("view")}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  item, mode, form, setForm, busy, actionErr, citeIndex, onCite, activeCite, cardRefs, streamLabel,
  mentorName, setMentorName, onApprove, onEdit, onSaveEdit, onReject, onConfirmReject, onToMentor, onRegenerate, onRetryOverflow, onTriageAction, onCancel,
  editSide = "",
}) {
  const a = item.aiDraft || {};
  const s = a.status || "pending";
  const overflow = isOverflowItem(item);
  const reviewed = s === "approved" || s === "edited";
  const compare = hasCompare(item) && !reviewed && !overflow;
  const counts = (a.claimChecks || []).reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {});
  const groupChanged = item.groupNow && item.groupNow.changed;
  const groupGone = item.groupNow && item.groupNow.missing;
  const elsewhere = s === "pending" && item.answeredElsewhere;
  const cannotApprove = groupChanged || groupGone || Boolean(elsewhere);
  const limited = isMentorAssist(a);
  const assist = a.mentorAssist || {};
  const flags = (a.verifyFlags || []).filter(f => !(limited && f.startsWith(LIMITED_TITLE)));
  return (
    <>
      <div className="air-detail-head">
        <div className="air-detail-chips">
          <span className="air-chip">{streamLabel(item.stream)}</span>
          <span className="air-chip air-chip--soft">{item.theme}{item.subtheme ? ` · ${item.subtheme}` : ""}</span>
          {item.targetType === "cluster" && <span className="air-chip air-chip--group"><Users size={11} aria-hidden="true" />Merged group · {item.memberCount} students</span>}
          {item.shadow && <span className="air-chip air-chip--shadow">shadow</span>}
          {limited && <span className="air-chip air-chip--limited">Limited sources</span>}
          {a.reusedFrom && <span className="air-chip">reused approved answer</span>}
          {compare && <span className="air-chip air-chip--compare">Compare · Hybrid vs Gemini only</span>}
        </div>
        {s !== "blocked" && !compare && !overflow && <RiskBadge risk={a.risk} confidence={a.confidence} />}
      </div>

      <blockquote className="air-question">
        <span>{item.targetType === "cluster" ? "The group asked" : "The student asked"} {item.ticket ? <em>{item.ticket}</em> : null}</span>
        <p>{item.question}</p>
        {item.context && <small>Context: {item.context}</small>}
        {item.targetType === "cluster" && (item.members || []).length > 1 && (
          <details>
            <summary>All {item.memberCount} questions in this group</summary>
            <ul>{item.members.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </details>
        )}
      </blockquote>

      {mode === "view" && <TriagePanel item={item} busy={busy} onAction={onTriageAction} />}

      {item.inGroup && !item.inGroup.answered && (
        <p className="air-hint"><Users size={13} aria-hidden="true" /> This student is also in a merged group of {item.inGroup.size}{item.inGroup.hasDraft ? " that has its own draft" : ""}. Approving here sends a personal answer.</p>
      )}
      {groupChanged && !reviewed && <p className="air-hint air-hint--warn"><AlertTriangle size={13} aria-hidden="true" /> Group members changed since this draft. Regenerate before approving.</p>}
      {groupGone && !reviewed && <p className="air-hint air-hint--warn"><AlertTriangle size={13} aria-hidden="true" /> This merged group no longer exists (it was split or re-merged on the Curation desk). Its questions get their own drafts.</p>}
      {elsewhere && <p className="air-hint air-hint--warn"><CheckCircle2 size={13} aria-hidden="true" /> Already answered {elsewhere === "curation" ? "on the Curation desk / Mentor pack" : "on the briefing board"} — the student sees that answer. Nothing to do here.</p>}
      {limited && !reviewed && !compare && (
        <div className="air-limited" role="note">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <b>{LIMITED_TITLE}</b>
            <p>{LIMITED_HINT} The trusted sources don’t cover this yet, so this is general guidance only — numbers, dates and fees that no source states were removed.</p>
            {assist.reason && <small>Why: {String(assist.reason).replace(/[.\s]*$/, ".")}</small>}
            {(assist.stripped || []).length > 0 && (
              <details>
                <summary>{assist.stripped.length} removed sentence{assist.stripped.length === 1 ? "" : "s"} (verify before re-adding)</summary>
                <ul>{assist.stripped.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
              </details>
            )}
          </div>
        </div>
      )}
      {flags.length > 0 && !reviewed && !compare && (
        <ul className="air-flags">{flags.map((f, i) => <li key={i}><AlertTriangle size={12} aria-hidden="true" />{f}</li>)}</ul>
      )}

      {overflow && mode === "view" && (
        <div className="air-blocked" role="status">
          <Clock size={18} aria-hidden="true" />
          <div>
            <b>{OVERFLOW_COPY}</b>
            <p>The question and asker are saved. Hybrid (GPT draft + Gemini check) did not run because the AI provider hit a quota, billing or timeout limit. Retry after recharge — nothing is published until you approve it. You can also write the answer yourself.</p>
            {a.overflowError || a.blockedNote ? <small>{a.overflowError || a.blockedNote}</small> : null}
          </div>
        </div>
      )}

      {s === "blocked" && mode === "view" && !compare && !overflow && (
        <div className="air-blocked">
          <Ban size={18} aria-hidden="true" />
          <div>
            <b>{a.blockedReason === "medical" ? "Not drafted — this reads as a medical question." : a.blockedReason === "insufficient_source" ? "Not drafted — the trusted sources don’t cover this yet." : "Not drafted."}</b>
            <p>{String(a.blockedNote || "A mentor should answer this one").replace(/[.\s]*$/, ".")} You can write the answer yourself or send it to a mentor.</p>
          </div>
        </div>
      )}

      {mode === "edit" && form ? (
        <>
          {compare && <p className="air-hint">Editing the {SIDE_LABEL[editSide || topSide(item)]} draft.</p>}
          <EditPanel form={form} setForm={setForm} busy={busy} onSave={onSaveEdit} onCancel={onCancel} />
        </>
      ) : compare ? (
        mode === "view" || mode === "reject" ? (
          <CompareView item={item} busy={busy}
            canApprove={mode === "view" && !elsewhere && !cannotApprove && (s === "pending" || s === "blocked")}
            canEdit={mode === "view" && !elsewhere}
            onApprove={onApprove} onEdit={onEdit} onRegenerate={onRegenerate} />
        ) : null
      ) : overflow || s === "blocked" ? null : (
        <Letter item={item} citeIndex={citeIndex} onCite={onCite} />
      )}

      {mode === "reject" && <RejectPanel busy={busy} onConfirm={onConfirmReject} onCancel={onCancel} />}

      {actionErr && <div className="air-alert" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{actionErr}</span></div>}

      {mode === "view" && !reviewed && !elsewhere && (
        <div className="air-actionbar">
          {(s === "pending" || (compare && s === "blocked")) && (
            <label className="air-signed">
              <span>Answered by</span>
              <input value={mentorName} placeholder="The AYURDISHA mentor desk" onChange={e => setMentorName(e.target.value)} />
            </label>
          )}
          <div className="air-actions">
            {overflow && (
              <button type="button" className="ui-btn ui-btn--primary ui-btn--md" onClick={() => onRetryOverflow && onRetryOverflow()} disabled={busy}>
                {busy ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                <span className="ui-btn-label">Retry AI</span>
              </button>
            )}
            {s === "pending" && !compare && !overflow && (
              <button type="button" className="ui-btn ui-btn--primary ui-btn--md" onClick={() => onApprove()} disabled={busy || cannotApprove}>
                {busy ? <Loader2 size={16} className="ui-btn-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                <span className="ui-btn-label">Approve and send</span><kbd>A</kbd>
              </button>
            )}
            {!compare && (
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={() => onEdit()} disabled={busy}>
                <PenLine size={16} aria-hidden="true" /><span className="ui-btn-label">{s === "blocked" || overflow ? "Write answer" : "Edit then send"}</span><kbd>E</kbd>
              </button>
            )}
            {s !== "rejected" && (s !== "blocked" || compare) && (
              <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={onReject} disabled={busy}>
                <X size={16} aria-hidden="true" /><span className="ui-btn-label">Reject</span><kbd>R</kbd>
              </button>
            )}
            {s !== "to-mentor" && (
              <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={onToMentor} disabled={busy}>
                <Send size={16} aria-hidden="true" /><span className="ui-btn-label">Send to mentor</span><kbd>M</kbd>
              </button>
            )}
            {overflow ? null : compare ? <RegenerateMenu busy={busy} onRegenerate={onRegenerate} /> : (
              <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={() => onRegenerate()} disabled={busy}>
                <RefreshCw size={16} aria-hidden="true" /><span className="ui-btn-label">Regenerate</span><kbd>G</kbd>
              </button>
            )}
          </div>
        </div>
      )}

      {reviewed && (
        <p className="air-reviewed"><CheckCircle2 size={15} aria-hidden="true" />{s === "edited" ? "Edited and sent" : "Approved and sent"} by {a.reviewer || "staff"} {a.reviewedAt ? `· ${ago(a.reviewedAt)}` : ""}{a.editDiff ? ` · ${Math.round((a.editDiff.ratio || 0) * 100)}% of the wording changed` : ""}{a.approvedProvider && hasCompare(item) ? ` · chose the ${SIDE_LABEL[a.approvedProvider] || a.approvedProvider} draft` : ""}</p>
      )}
      {s === "rejected" && a.rejectReason && <p className="air-reviewed air-reviewed--bad"><X size={15} aria-hidden="true" />Rejected: {a.rejectReason}</p>}

      {s !== "blocked" && !compare && !overflow && (
        <div className="air-panels">
          <section>
            <h3>Sources <span className="air-muted">({(a.citations || []).length})</span></h3>
            <SourceCards citations={a.citations || []} activeId={activeCite} cardRefs={cardRefs}
              emptyText={limited ? "No trusted source in the knowledge base covers this yet. Check the official homepages under References and add the facts yourself." : undefined} />
          </section>
          <section>
            <h3>Claim checks <span className="air-claim-sum">
              {counts.supported ? <em className="ok">{counts.supported} supported</em> : null}
              {counts.outdated ? <em className="warn">{counts.outdated} outdated</em> : null}
              {counts.unsupported ? <em className="bad">{counts.unsupported} unsupported</em> : null}
              {counts.guidance ? <em className="muted">{counts.guidance} guidance</em> : null}
            </span></h3>
            <ClaimChecks checks={a.claimChecks || []} citeIndex={citeIndex} onCite={onCite} />
          </section>
        </div>
      )}

      {item.meta && item.meta.suggestion && mode === "view" && !reviewed && (
        <details className="air-suggest">
          <summary>Suggested starting point (unverified golden draft)</summary>
          <p>{item.meta.suggestion.answer}</p>
        </details>
      )}

      <p className="air-foot">
        {a.model ? `Drafted by ${a.model}` : "Not drafted by a model"}{a.verifyModel ? ` · checked by ${a.verifyModel}` : ""} · persona {a.persona || "—"}
        {a.usage && a.usage.costUSD ? ` · $${a.usage.costUSD.toFixed(4)}` : ""}
        {item.history && item.history.length ? ` · ${item.history.length} earlier version${item.history.length === 1 ? "" : "s"}` : ""}
      </p>
    </>
  );
}
