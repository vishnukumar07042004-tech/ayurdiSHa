import React, { useCallback, useEffect, useId, useRef } from "react";
import { Ticket, Send, Leaf, BookOpen, X } from "lucide-react";
import useFocusTrap from "../useFocusTrap.js";

/** @typedef {"track" | "ask" | "hall" | "board"} FirstVisitId */

export const FIRST_VISIT_GUIDES = {
  track: {
    storageKey: "aym-hint-track",
    eyebrow: "Ask Desk · Follow-up",
    title: "Track My Answer",
    Icon: Ticket,
    lead:
      "After you submit a career question, use this screen to look up your ticket and follow it until a mentor replies in writing.",
    howTitle: "How to look it up",
    how: [
      "Enter your Ask Desk ticket ID (format AYM-Q-XXXXXXX), or",
      "Search with the same verified email you used when you asked.",
      "Open the result to see status updates and the mentor letter when it is ready.",
    ],
    statusesTitle: "What each status means",
    statuses: [
      { label: "Received", detail: "Logged with the AYURDISHA desk." },
      { label: "With mentor", detail: "Sitting with a mentor for a written reply." },
      { label: "Answered", detail: "Guidance is ready here as a mentor letter." },
    ],
    primaryLabel: "Continue to Track My Answer",
    skipLabel: "Skip introduction",
  },
  ask: {
    storageKey: "aym-hint-ask",
    eyebrow: "Ask Desk",
    title: "Ask a Question",
    Icon: Send,
    lead:
      "One focused Ayurveda career question for Meet the Mentors — PG choices, practice, research, or pathways after BAMS.",
    howTitle: "How it works",
    how: [
      "Register once with a verified email so the hall can issue your WAC number.",
      "Choose a career track, write one clear question, and submit.",
      "Keep the ticket you receive — you will use it under Track My Answer.",
    ],
    primaryLabel: "Continue to Ask Desk",
    skipLabel: "Skip introduction",
  },
  hall: {
    storageKey: "aym-hint-hall",
    eyebrow: "Meet the Mentors",
    title: "Enter the Hall",
    Icon: Leaf,
    lead:
      "The digital Meet the Mentors floor at WAC 2026 — podcast conversations, selection results, and the open theme stage live here.",
    howTitle: "On this floor",
    how: [
      "Open the podcast corner for recorded mentor talks.",
      "Check Congress selection results when the desk publishes them.",
      "Use Ask Desk and Track My Answer from the header anytime.",
    ],
    primaryLabel: "Continue into the Hall",
    skipLabel: "Skip introduction",
  },
  board: {
    storageKey: "aym-hint-board",
    eyebrow: "Open Theme Stage",
    title: "Published Mentor Answers",
    Icon: BookOpen,
    lead:
      "When the hall is ready to share guidance, curated mentor answers appear here for every BAMS mentee — whether or not they reached Bhubaneswar.",
    howTitle: "Useful to know",
    how: [
      "These are curated, published letters from the Meet the Mentors desk.",
      "Your personal ticket status still lives under Track My Answer.",
    ],
    primaryLabel: "Continue to Theme Stage",
    skipLabel: "Skip introduction",
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
 * @param {string | null | undefined} href
 * @returns {FirstVisitId | null}
 */
export function firstVisitIdFromHref(href) {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    const url = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://ayushmarg.vercel.app");
    const hash = (url.hash || "").replace(/^#/, "").split(/[?&]/)[0];
    if (FIRST_VISIT_GUIDES[hash]) return /** @type {FirstVisitId} */ (hash);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/ask") return "ask";
    if (path === "/track-answer") return "track";
    if (path === "/staff/theme-stage" || path === "/staff/board") return "board";
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Heroic first-visit coach — shown only when the user taps a feature entry point.
 * @param {{ guideId: FirstVisitId, onContinue: () => void }} props
 */
export default function FirstVisitGuide({ guideId, onContinue }) {
  const guide = FIRST_VISIT_GUIDES[guideId];
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const primaryRef = useRef(null);
  const finish = useCallback(() => onContinue?.(), [onContinue]);

  useFocusTrap(Boolean(guide), panelRef, finish);

  useEffect(() => {
    if (!guide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => primaryRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
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
        <div className="aym-fvg-ornament" aria-hidden="true" />
        <div className="aym-fvg-handle" aria-hidden="true" />

        <div className="aym-fvg-head">
          <div className="aym-fvg-icon" aria-hidden="true">
            <Icon size={24} strokeWidth={1.6} />
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

        <p className="aym-fvg-eyebrow">{guide.eyebrow}</p>
        <h2 id={titleId} className="aym-fvg-title">
          {guide.title}
        </h2>
        <p id={descId} className="aym-fvg-lead">
          {guide.lead}
        </p>

        {guide.how?.length > 0 && (
          <div className="aym-fvg-block">
            <h3 className="aym-fvg-block-title">{guide.howTitle}</h3>
            <ol className="aym-fvg-steps">
              {guide.how.map((line, i) => (
                <li key={line}>
                  <span className="aym-fvg-step-n" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="aym-fvg-step-text">{line}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {guide.statuses?.length > 0 && (
          <div className="aym-fvg-block aym-fvg-block-status">
            <h3 className="aym-fvg-block-title">{guide.statusesTitle}</h3>
            <ul className="aym-fvg-status-chips">
              {guide.statuses.map((s) => (
                <li key={s.label} className="aym-fvg-status-chip">
                  <span className="aym-fvg-status-label">{s.label}</span>
                  <span className="aym-fvg-status-detail">{s.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="aym-fvg-actions">
          <button
            ref={primaryRef}
            type="button"
            className="aym-btn aym-btn-primary aym-fvg-primary"
            onClick={finish}
          >
            {guide.primaryLabel}
          </button>
          <button
            type="button"
            className="aym-fvg-skip"
            onClick={finish}
          >
            {guide.skipLabel || "Skip introduction"}
          </button>
        </div>
      </div>
    </div>
  );
}
