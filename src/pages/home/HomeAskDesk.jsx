import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, MessageCircleQuestion } from "lucide-react";
import Picture from "../../components/editorial/Picture.jsx";
import { ASK_PROMPTS } from "../../content/askPrompts.js";
import { ASK_DESK, TRACK_LABEL } from "../../content/glossary.js";
import "../../styles/ask-desk.css";

const ASK = { pathname: "/", hash: "#ask" };
const TRACK = { pathname: "/", hash: "#track" };

const MINI_STEPS = [
  { n: "1", label: "Register", note: "Email code · pass issued" },
  { n: "2", label: "Ask", note: "One focused question, under a theme" },
  { n: "3", label: "Track", note: "Read the mentor's written answer" },
];

function PromptChip({ prompt, onPick, hidden = false }) {
  return (
    <li className="hd-chip-wrap" aria-hidden={hidden || undefined}>
      <button
        type="button"
        className="hd-chip"
        tabIndex={hidden ? -1 : undefined}
        onClick={(e) => onPick(prompt, e)}
        title={hidden ? undefined : prompt.text}
      >
        <MessageCircleQuestion size={15} strokeWidth={1.9} aria-hidden="true" />
        <span>{prompt.label}</span>
      </button>
    </li>
  );
}

/** Home: the loud Ask Desk moment — headline, real starter questions, CTA to /#ask and /#track. */
export default function HomeAskDesk({ onGo }) {
  const go = (id, e, opts) => onGo?.(id, e, opts);
  const pick = (p, e) => go("ask", e, { preset: { theme: p.theme, subtheme: p.sub, question: p.text } });

  return (
    <section id="ask-desk" className="hd-band" aria-labelledby="ask-desk-title">
      <div className="hd-media" data-reveal>
        <Picture
          src="/assets/slides/slide-ask.jpg"
          alt="A student writing one question card at a lamp-lit oak desk beside a green wall of glowing question cards"
          width={1920}
          height={1080}
          sizes="(max-width: 760px) 100vw, 62vw"
          className="hd-picture"
        />
        <span className="hd-media-scrim" aria-hidden="true" />
      </div>
      <span className="hd-glow" aria-hidden="true" />

      <div className="ui-container hd-inner">
        <div className="hd-copy">
          <p className="hd-eyebrow" data-reveal>
            <span className="hd-eyebrow-rule" aria-hidden="true" />
            The Ask Desk · Meet the Mentors hall
          </p>
          <h2 id="ask-desk-title" className="hd-title" data-reveal>
            <span className="hd-title-line">Have a career question?</span>{" "}
            <em className="hd-title-accent">Bring it to the Ask Desk.</em>
          </h2>
          <p className="hd-lead" data-reveal>
            Register once, ask one focused question under a career track, and every valid ask gets a
            written or recorded answer via clustered composites and the answer bank — not a personal mentor slot promise.
          </p>
          <div className="hd-actions" data-reveal>
            <Link to={ASK} className="hd-btn hd-btn--primary" onClick={(e) => go("ask", e)} data-ask-cta="">
              <span>{ASK_DESK}</span>
              <ArrowRight size={19} strokeWidth={2.1} aria-hidden="true" className="hd-btn-arrow" />
            </Link>
            <Link to={TRACK} className="hd-btn hd-btn--ghost" onClick={(e) => go("track", e)}>
              <span>{TRACK_LABEL}</span>
              <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" className="hd-btn-arrow" />
            </Link>
          </div>
          <ol className="hd-steps" data-reveal aria-label="How the Ask Desk works">
            {MINI_STEPS.map((s) => (
              <li key={s.n}>
                <span className="hd-step-n" aria-hidden="true">{s.n}</span>
                <span className="hd-step-text">
                  <strong>{s.label}</strong>
                  <span>{s.note}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="hd-chips" data-reveal>
        <p className="hd-chips-label" id="ask-desk-starters">Start from a question others already ask</p>
        <div className="hd-lane">
          <ul className="hd-track" aria-labelledby="ask-desk-starters">
            {ASK_PROMPTS.map((p) => <PromptChip key={p.label} prompt={p} onPick={pick} />)}
            {ASK_PROMPTS.map((p) => <PromptChip key={`dup-${p.label}`} prompt={p} onPick={pick} hidden />)}
          </ul>
        </div>
      </div>
    </section>
  );
}
