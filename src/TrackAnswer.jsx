import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, Copy, CopyCheck, ArrowRight, ChevronRight, CheckCircle2, Award, FileText,
  Inbox, Users, MessageCircle, HelpCircle, Loader2,
} from "lucide-react";
import { Sprig } from "./components/editorial/Ornaments.jsx";
import { DISHA_TRACK_NOTE } from "./content/glossary.js";
import {
  getMentorByParam, mentorSlug, mentorNameParts, mentorInitials, mentorPortraitUrl,
  mentorPublicPath, mentorAffiliationSnippet, MENTORS,
} from "./mentors.js";

export function ticketFromUrl() {
  if (typeof location === "undefined") return "";
  try { return String(new URLSearchParams(location.search).get("ticket") || "").trim().slice(0, 40); }
  catch { return ""; }
}

export function trackStatusOf(s) {
  const c = s && s.cluster;
  const merged = Boolean(c && String(c.answer || "").trim());
  const individual = Boolean(String(s && s.individualAnswer || "").trim());
  const published = merged && String(c.status || "").toLowerCase() === "published";
  if (published) return { label: "On the stage", tone: "green" };
  if (merged || individual) return { label: "Answered", tone: "green" };
  if (s && s.reviewStage === "review") return { label: "Being reviewed by the desk", tone: "gold" };
  if (c) return { label: "With mentor", tone: "gold" };
  return { label: "Received", tone: "grey" };
}

function presentMentorName(name) {
  const by = String(name || "").trim();
  if (!by || by.length < 2) return "";
  if (/^[.\-_,/\s]+$/.test(by)) return "";
  return by;
}

const nameKey = name => mentorNameParts(name).map(p => p.replace(/[().,]/g, "").toLowerCase()).filter(Boolean);

/** Stored answers carry a free-text mentor name; credentials come from the public roster when it matches. */
function resolveMentor(rawName) {
  const name = presentMentorName(rawName);
  if (!name) return null;
  let m = getMentorByParam(mentorSlug({ name }));
  if (!m) {
    const want = nameKey(name);
    if (want.length) {
      m = MENTORS.find(x => {
        const have = nameKey(x.name);
        return have.length && have[have.length - 1] === want[want.length - 1] && have[0] === want[0];
      }) || null;
    }
  }
  if (!m) return { name };
  return {
    name: m.name || name,
    designation: String(m.designation || "").trim(),
    affiliation: mentorAffiliationSnippet(m.affiliation, 96),
    expertise: String(m.expertise || "").trim(),
    photo: mentorPortraitUrl(m),
    path: mentorPublicPath(m),
  };
}

const LIST_RE = /^\s*(?:[-•*]|\d{1,2}[.)])\s+/;

/** Paragraphs, line breaks and simple lists rendered as React text — never as HTML. */
function RichAnswer({ text }) {
  const blocks = String(text || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const out = [];
  blocks.forEach((b, i) => {
    const runs = [];
    for (const line of b.split("\n").map(l => l.trim()).filter(Boolean)) {
      const isItem = LIST_RE.test(line);
      const last = runs[runs.length - 1];
      if (last && last.list === isItem) last.lines.push(line);
      else runs.push({ list: isItem, lines: [line] });
    }
    runs.forEach((r, k) => {
      const key = `${i}-${k}`;
      if (r.list) {
        const items = r.lines.map((l, j) => <li key={j}>{l.replace(LIST_RE, "")}</li>);
        out.push(/^\s*\d/.test(r.lines[0]) ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      } else {
        out.push(<p key={key}>{r.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{l}</React.Fragment>)}</p>);
      }
    });
  });
  return <div className="trk-prose">{out}</div>;
}

function fmtDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

function MentorCredit({ mentorName }) {
  const m = resolveMentor(mentorName);
  if (!m) {
    return (
      <div className="trk-credit">
        <span className="trk-credit-mono trk-credit-mono--desk" aria-hidden="true">A</span>
        <div className="trk-credit-text">
          <span className="trk-credit-label">Answered by</span>
          <span className="trk-credit-name">The AYURDISHA mentor desk</span>
          <span className="trk-credit-role">Meet the Mentors · WAC 2026 Bhubaneswar</span>
        </div>
      </div>
    );
  }
  return (
    <div className="trk-credit">
      {m.photo
        ? <img className="trk-credit-mono" src={m.photo} alt="" width="56" height="56" loading="lazy" />
        : <span className="trk-credit-mono" aria-hidden="true">{mentorInitials(m.name)}</span>}
      <div className="trk-credit-text">
        <span className="trk-credit-label">Answered by</span>
        <span className="trk-credit-name">{m.name}</span>
        {m.designation && <span className="trk-credit-role">{m.designation}</span>}
        {(m.affiliation || m.expertise) && (
          <span className="trk-credit-field">{[m.expertise, m.affiliation].filter(Boolean).join(" · ")}</span>
        )}
      </div>
      {m.path && (
        <Link to={m.path} className="trk-credit-link">Profile<ChevronRight size={14} aria-hidden="true" /></Link>
      )}
    </div>
  );
}

const RESOURCE_URL = /^(.*?)\s*[—–-]\s*(https?:\/\/\S+)$/i;

/** http(s) only — rejects javascript:/data: and anything with whitespace or quotes. */
function safeHttpUrl(raw) {
  const u = String(raw || "").trim();
  if (!/^https?:\/\/[^\s"'<>\\]+$/i.test(u)) return "";
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch { return ""; }
}

/** "Title — https://…" lines (official sources attached by the desk) render as links. */
function ResourceLine({ text }) {
  const m = String(text).match(RESOURCE_URL);
  if (m) {
    const href = safeHttpUrl(m[2]);
    if (href) return <a href={href} target="_blank" rel="noopener noreferrer">{m[1] || href}</a>;
  }
  const alone = safeHttpUrl(text);
  if (alone) return <a href={alone} target="_blank" rel="noopener noreferrer">{alone}</a>;
  return text;
}

function AnswerExtras({ actions, mistake, resources }) {
  const acts = (actions || []).map(a => String(a || "").trim()).filter(Boolean);
  const res = (resources || []).map(r => String(r || "").trim()).filter(Boolean);
  const note = String(mistake || "").trim();
  if (!acts.length && !note && !res.length) return null;
  return (
    <div className="trk-extras">
      {acts.length > 0 && (
        <section className="trk-extra">
          <h4><CheckCircle2 size={15} aria-hidden="true" />Next steps</h4>
          <ol>{acts.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </section>
      )}
      {note && (
        <section className="trk-extra trk-extra--warn">
          <h4><Award size={15} aria-hidden="true" />A mistake to avoid</h4>
          <p>{note}</p>
        </section>
      )}
      {res.length > 0 && (
        <section className="trk-extra">
          <h4><FileText size={15} aria-hidden="true" />References</h4>
          <ul>{res.map((r, i) => <li key={i}><ResourceLine text={r} /></li>)}</ul>
        </section>
      )}
    </div>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

function AnswerCard({ kind, label, question, body, date, mentorName, extras, aiAssisted, onAsk }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    if (await copyText(body)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }
  return (
    <article className={`trk-answer trk-answer--${kind}`} aria-label={label}>
      <Sprig className="trk-answer-sprig" />
      <header className="trk-answer-head">
        <span className="trk-badge"><CheckCircle2 size={14} aria-hidden="true" />Answered{date ? <span className="trk-badge-date"> · {date}</span> : null}</span>
        <span className="trk-answer-kind">{label}</span>
      </header>

      {question && (
        <blockquote className="trk-question">
          <span className="trk-question-label">You asked</span>
          <p>{question}</p>
        </blockquote>
      )}

      <div className="trk-answer-body">
        <span className="trk-answer-eyebrow">The mentor’s answer</span>
        <RichAnswer text={body} />
        <AnswerExtras {...extras} />
        {aiAssisted && <p className="trk-ai-note">{DISHA_TRACK_NOTE}</p>}
      </div>

      <MentorCredit mentorName={mentorName} />

      <footer className="trk-actions">
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={onCopy} aria-live="polite">
          {copied ? <CopyCheck size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span className="ui-btn-label">{copied ? "Copied" : "Copy answer"}</span>
        </button>
        <button type="button" className="ui-btn ui-btn--tertiary ui-btn--md" onClick={onAsk}>
          <MessageCircle size={16} aria-hidden="true" />
          <span className="ui-btn-label">Ask another question</span>
        </button>
        <Link to="/mentors" className="trk-more">Meet the Mentors<ChevronRight size={15} aria-hidden="true" /></Link>
      </footer>
    </article>
  );
}

const STEPS = [
  { id: "received", label: "Received", Icon: Inbox },
  { id: "mentors", label: "With mentors", Icon: Users },
  { id: "answered", label: "Answered", Icon: MessageCircle },
];

function StatusTimeline({ stage, reviewing = false }) {
  const steps = reviewing ? STEPS.map(s => (s.id === "mentors" ? { ...s, label: "Being reviewed" } : s)) : STEPS;
  return (
    <ol className="trk-timeline" aria-label="Question status">
      {steps.map(({ id, label, Icon }, i) => {
        const state = i < stage ? "done" : i === stage ? "current" : "todo";
        return (
          <li key={id} className={`trk-step trk-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="trk-step-dot"><Icon size={15} aria-hidden="true" /></span>
            <span className="trk-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PendingCard({ s }) {
  const c = s.cluster;
  const reviewing = s.reviewStage === "review";
  const stage = c || reviewing ? 1 : 0;
  const shared = c && Array.isArray(c.memberIds) ? c.memberIds.length : 0;
  return (
    <article className="trk-pending" aria-label="Not answered yet">
      <div className="trk-pending-head">
        <span className="trk-ticket">{s.ticket}</span>
        <span className="trk-badge trk-badge--wait">Not answered yet</span>
      </div>
      <StatusTimeline stage={stage} reviewing={reviewing} />
      <p className="trk-pending-copy">
        {reviewing && `Your question is being reviewed by the desk${c && c.kind !== "unique" && shared >= 2 ? `, together with ${shared - 1} similar question${shared === 2 ? "" : "s"}` : ""}. An official checks every answer before it is sent — check back with this ticket, and we’ll email you if your address is on file.`}
        {!reviewing && !c && "Your question has reached the AYURDISHA desk. It will move to a mentor shortly."}
        {!reviewing && c && (c.kind === "unique" || shared < 2) && "Your question is with a mentor now. Check back with this ticket — we’ll also email you if your address is on file."}
        {!reviewing && c && c.kind !== "unique" && shared >= 2 && `Your question is with a mentor, grouped with ${shared - 1} similar question${shared === 2 ? "" : "s"}. Check back with this ticket — we’ll also email you if your address is on file.`}
      </p>
      {s.question && (
        <blockquote className="trk-question">
          <span className="trk-question-label">You asked</span>
          <p>{s.question}</p>
        </blockquote>
      )}
    </article>
  );
}

function ResultFor({ s, onAsk }) {
  const c = s.cluster;
  const merged = String(c && c.answer || "").trim();
  const personal = String(s.individualAnswer || "").trim();
  if (!merged && !personal) return <PendingCard s={s} />;
  const shared = c && Array.isArray(c.memberIds) ? c.memberIds.length : 0;
  return (
    <div className="trk-result">
      <div className="trk-result-ticket"><span className="trk-ticket">{s.ticket}</span></div>
      {personal && (
        <AnswerCard
          kind="personal"
          label="Written for you"
          question={s.question}
          body={personal}
          date={fmtDate(s.individualAt)}
          mentorName={s.individualMentor}
          extras={{ actions: s.individualActions, mistake: s.individualMistake, resources: s.individualResources }}
          aiAssisted={Boolean(s.individualAiAssisted)}
          onAsk={onAsk}
        />
      )}
      {merged && (
        <AnswerCard
          kind="hall"
          label={shared > 1 ? `Shared guidance · ${shared} students asked this` : "Hall answer"}
          question={personal ? (c.composite || c.representative || "") : s.question}
          body={merged}
          mentorName={c.mentorName}
          extras={{ actions: c.actions, mistake: c.mistake, resources: c.resources }}
          aiAssisted={Boolean(c.aiAssisted)}
          onAsk={onAsk}
        />
      )}
    </div>
  );
}

function TrackSkeleton() {
  return (
    <div className="trk-skeleton" role="status" aria-live="polite">
      <span className="aym-visually-hidden">Looking up your ticket</span>
      <div className="trk-sk trk-sk--chip" />
      <div className="trk-sk trk-sk--block" />
      <div className="trk-sk trk-sk--line" />
      <div className="trk-sk trk-sk--line" />
      <div className="trk-sk trk-sk--line trk-sk--short" />
      <div className="trk-sk trk-sk--credit" />
    </div>
  );
}

function NotFoundCard({ query, onAsk }) {
  return (
    <div className="trk-empty" role="alert">
      <span className="trk-empty-icon" aria-hidden="true"><HelpCircle size={22} /></span>
      <h2>No question found</h2>
      <p>We couldn’t find a question for <b className="trk-ticket trk-ticket--inline">{query}</b>.</p>
      <ul>
        <li>Tickets look like <b>AYM-Q-</b> followed by 8 letters and numbers.</li>
        <li>Check for O vs 0 and I vs 1 — or open the link in your answer email.</li>
        <li>Asked on another device? Your ticket was shown when you sent the question.</li>
      </ul>
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={onAsk}>
        <span className="ui-btn-label">Ask a new question</span><ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function TrackPage({ loading, lookup, onAsk }) {
  const [q, setQ] = useState(ticketFromUrl);
  const [hit, setHit] = useState(null);
  const [searched, setSearched] = useState("");
  const [finding, setFinding] = useState(false);
  const [lookupErr, setLookupErr] = useState("");
  const autoFoundRef = useRef(false);
  const inputRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => {
    if (ticketFromUrl()) return;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (autoFoundRef.current || loading || !ticketFromUrl()) return;
    autoFoundRef.current = true;
    find(true);
  }, [loading]);

  async function find(fromLink = false) {
    const needle = q.trim();
    if (!needle) { setSearched(""); setHit(null); inputRef.current?.focus(); return; }
    setFinding(true);
    setHit(null);
    setLookupErr("");
    let mine = [];
    try {
      mine = await lookup(needle);
    } catch {
      setLookupErr("We couldn't reach the answer desk just now — check your connection and press View answer again.");
      setSearched("");
      setFinding(false);
      return;
    }
    setHit(mine.length ? mine : null);
    setSearched(needle);
    setFinding(false);
    if (fromLink || (typeof window !== "undefined" && window.innerWidth < 760)) {
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const busy = loading || finding;

  return (
    <div className="trk">
      <header className="trk-hero">
        <p className="trk-eyebrow">Track my answer</p>
        <h1 className="trk-title">
          Your answer.
          <span className="trk-title-soft">Straight from a <em>mentor</em>.</span>
        </h1>
        <p className="trk-lead">Enter the ticket ID from your Ask Desk confirmation or answer email to read your mentor’s reply.</p>

        <form className="trk-search" onSubmit={e => { e.preventDefault(); find(); }} role="search">
          <label htmlFor="track-q" className="aym-visually-hidden">Ticket ID</label>
          <input
            id="track-q"
            ref={inputRef}
            className="trk-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="AYM-Q-M4KX2P9Q"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="track-q-hint"
          />
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--lg trk-submit" disabled={busy} aria-busy={busy || undefined}>
            {finding ? <Loader2 size={17} className="ui-btn-spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
            <span className="ui-btn-label">View answer</span>
          </button>
        </form>
        <p id="track-q-hint" className="trk-hint">Format: <span className="trk-mono">AYM-Q-XXXXXXXX</span> · Signed-in delegates can also use their email.</p>
      </header>

      <div className="trk-results" ref={resultRef} aria-live="polite">
        {busy && <TrackSkeleton />}
        {!busy && lookupErr && <p className="trk-empty" role="alert">{lookupErr}</p>}
        {!busy && searched && !hit && <NotFoundCard query={searched} onAsk={onAsk} />}
        {!busy && hit && hit.map(s => <ResultFor key={s.id} s={s} onAsk={onAsk} />)}
      </div>
    </div>
  );
}
