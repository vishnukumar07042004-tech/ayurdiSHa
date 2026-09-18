import React, { useCallback, useEffect, useId, useRef } from "react";
import { Ticket, Send, Leaf, BookOpen, X } from "lucide-react";
import useFocusTrap from "../useFocusTrap.js";

/** @typedef {"track" | "ask" | "hall" | "board"} FirstVisitId */

export const FIRST_VISIT_GUIDES = {
  track: {
    storageKey: "aym-hint-track",
    eyebrow: "Ask Desk follow-up",
    title: "Track my answer",
    Icon: Ticket,
    lead:
      "After you submit a career question at the Ask Desk, this screen is where you follow that ticket until a mentor writes back.",
    howTitle: "How to look it up",
    how: [
      "Enter your Ask Desk ticket (looks like AYM-Q-XXXXXXX), or",
      "Use the same email you used when you asked.",
    ],
    statusesTitle: "What the statuses mean",
    statuses: [
      { label: "Received", detail: "Your question is with the AYURDISHA desk." },
      { label: "With mentor", detail: "It is sitting with a mentor for a written reply." },
      { label: "Answered", detail: "Guidance is ready on this page as a mentor letter." },
    ],
    primaryLabel: "Got it — Track my answer",
  },
  ask: {
    storageKey: "aym-hint-ask",
    eyebrow: "Ask Desk",
    title: "Ask a question",
    Icon: Send,
    lead:
      "One focused Ayurveda career question for Meet the Mentors — PG choices, practice, research, or pathways after BAMS.",
    howTitle: "How it works",
    how: [
      "Register once with a verified email so the hall can issue your WAC number.",
      "Choose a career track, write one clear question, and submit.",
      "Keep the ticket you receive — you will use it under Track my answer.",
    ],
    primaryLabel: "Got it — Ask a question",
  },
  hall: {
    storageKey: "aym-hint-hall",
    eyebrow: "Meet the Mentors",
    title: "Enter the hall",
    Icon: Leaf,
    lead:
      "The digital Meet the Mentors floor at WAC 2026 — podcast conversations, selection results, and the open theme stage live here.",
    howTitle: "On this floor",
    how: [
      "Open the podcast corner for recorded mentor talks.",
      "Check Congress selection results when the desk publishes them.",
      "Use Ask Desk and Track my answer from the header anytime.",
    ],
    primaryLabel: "Got it — Enter the hall",
  },
  board: {
    storageKey: "aym-hint-board",
    eyebrow: "Open theme stage",
    title: "Published mentor answers",
    Icon: BookOpen,
    lead:
      "When the hall is ready to share guidance, mentor answers appear here for every BAMS mentee — whether or not they reached Bhubaneswar.",
    howTitle: "Useful to know",
    how: [
      "These are curated, published letters from the Meet the Mentors desk.",
      "Your personal ticket status still lives under Track my answer.",
    ],
    primaryLabel: "Got it — Open Theme Stage",
  },
};

/**
 * @param {FirstVisitId} id
 */
export function hasSeenFirstVisit(id) {
  const guide = FIRST_VISIT_GUIDES[id];
  if (!guide) return true;
  try {
    return localStorage.getItem(guide.storageKey) === "1";
  } catch {
    return true;
  }
}

/**
 * @param {FirstVisitId} id
 */
export function markFirstVisitSeen(id) {
  const guide = FIRST_VISIT_GUIDES[id];
  if (!guide) return;
  try {
    localStorage.setItem(guide.storageKey, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Accessible first-visit coach modal / bottom sheet.
 * @param {{ guideId: FirstVisitId, onContinue: () => void }} props
 */
export default function FirstVisitGuide({ guideId, onContinue }) {
  const guide = FIRST_VISIT_GUIDES[guideId];
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const finish = useCallback(() => onContinue?.(), [onContinue]);

  useFocusTrap(Boolean(guide), panelRef, finish);

  useEffect(() => {
    if (!guide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [guide]);

  if (!guide) return null;

  const Icon = guide.Icon;

  return (
    <div className="aym-fvg-root" role="presentation">
      <button
        type="button"
        className="aym-fvg-backdrop"
        aria-label="Dismiss introduction"
        onClick={finish}
      />
      <div
        ref={panelRef}
        className="aym-fvg-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="aym-fvg-handle" aria-hidden="true" />
        <div className="aym-fvg-head">
          <div className="aym-fvg-icon" aria-hidden="true">
            <Icon size={22} strokeWidth={1.75} />
          </div>
          <button
            type="button"
            className="aym-fvg-close"
            onClick={finish}
            aria-label="Close introduction"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="aym-eyebrow aym-fvg-eyebrow">{guide.eyebrow}</p>
        <h2 id={titleId} className="aym-display aym-fvg-title">
          {guide.title}
        </h2>
        <p id={descId} className="aym-fvg-lead">
          {guide.lead}
        </p>

        {guide.how?.length > 0 && (
          <div className="aym-fvg-block">
            <h3 className="aym-fvg-block-title">{guide.howTitle}</h3>
            <ul className="aym-fvg-list">
              {guide.how.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {guide.statuses?.length > 0 && (
          <div className="aym-fvg-block">
            <h3 className="aym-fvg-block-title">{guide.statusesTitle}</h3>
            <ul className="aym-fvg-status-list">
              {guide.statuses.map((s) => (
                <li key={s.label}>
                  <span className="aym-fvg-status-label">{s.label}</span>
                  <span className="aym-fvg-status-detail">{s.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="aym-fvg-actions">
          <button type="button" className="aym-btn aym-btn-primary aym-fvg-primary" onClick={finish}>
            {guide.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
