import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, Leaf, Send, Ticket, Users, X } from "lucide-react";
import useFocusTrap from "../useFocusTrap.js";

export const WELCOME_STORAGE_KEY = "aym-welcome-seen";
/** Set for the browser session after welcome is shown — softens feature guides the same visit. */
export const WELCOME_SESSION_KEY = "aym-welcome-session";

const FEATURES = [
  {
    id: "mentors",
    title: "Meet the Mentors",
    blurb: "Browse senior practitioners guiding Ayurveda careers.",
    Icon: Users,
    thumb: "/assets/ayurdisha-hero.png",
  },
  {
    id: "ask",
    title: "Ask a Question",
    blurb: "One focused career question at the digital Ask Desk.",
    Icon: Send,
    thumb: "/assets/ayurdisha-clinical.png",
  },
  {
    id: "track",
    title: "Track My Answer",
    blurb: "Follow your ticket until a mentor replies in writing.",
    Icon: Ticket,
    thumb: "/assets/ayurdisha-research.png",
  },
  {
    id: "hall",
    title: "Enter the Hall",
    blurb: "Podcasts, theme stage, and the WAC 2026 floor.",
    Icon: Leaf,
    thumb: "/assets/hall-photo.png",
  },
];

export function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function markWelcomeSession() {
  try {
    sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function welcomeShownThisSession() {
  try {
    return sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Full-viewport first-visit welcome — overview before HomePage.
 * @param {{ onDismiss: () => void, exiting?: boolean }} props
 */
export default function WelcomeOverlay({ onDismiss, exiting = false }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const primaryRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  const finish = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    markWelcomeSeen();
    markWelcomeSession();
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => onDismiss?.(), reduce ? 0 : 420);
  }, [leaving, onDismiss]);

  useFocusTrap(true, panelRef, finish);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => primaryRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, []);

  const isLeaving = leaving || exiting;

  return (
    <div
      className={`aym-welcome-root${isLeaving ? " is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="aym-welcome-stage" aria-hidden="true">
        <img
          src="/assets/ayurdisha-hero.png"
          alt=""
          className="aym-welcome-hero-img"
          width={1536}
          height={1024}
          fetchPriority="high"
        />
        <div className="aym-welcome-veil" />
        <div className="aym-welcome-vignette" />
      </div>

      <div ref={panelRef} className="aym-welcome-shell" tabIndex={-1}>
        <button
          type="button"
          className="aym-welcome-close"
          onClick={finish}
          aria-label="Skip welcome"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <p className="aym-welcome-eyebrow">
          <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
          WAC 2026 · Bhubaneswar
        </p>

        <p className="aym-welcome-brand">AYURDISHA</p>

        <h1 id={titleId} className="aym-welcome-title">
          Meet the Mentors
          <span className="aym-welcome-title-line">shaping Ayurveda careers</span>
        </h1>

        <p id={descId} className="aym-welcome-lead">
          The official digital Meet the Mentors hall of the 11th World Ayurveda
          Congress — curated guidance for BAMS students, postgraduates, and
          practitioners.
        </p>

        <ul className="aym-welcome-features" aria-label="What you can do here">
          {FEATURES.map((f, i) => {
            const Icon = f.Icon;
            return (
              <li
                key={f.id}
                className="aym-welcome-feature"
                style={{ "--aym-welcome-stagger": i }}
              >
                <div className="aym-welcome-feature-media" aria-hidden="true">
                  <img src={f.thumb} alt="" width={80} height={56} loading="lazy" />
                  <span className="aym-welcome-feature-icon">
                    <Icon size={16} strokeWidth={1.7} />
                  </span>
                </div>
                <div className="aym-welcome-feature-copy">
                  <strong>{f.title}</strong>
                  <span>{f.blurb}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="aym-welcome-actions">
          <button
            ref={primaryRef}
            type="button"
            className="aym-welcome-cta"
            onClick={finish}
          >
            Enter the hall
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="aym-welcome-skip" onClick={finish}>
            Continue to home
          </button>
        </div>

        <p className="aym-welcome-hint">
          <BookOpen size={14} aria-hidden="true" />
          Tip: reopen this overview anytime from Help in the menu.
        </p>
      </div>
    </div>
  );
}
