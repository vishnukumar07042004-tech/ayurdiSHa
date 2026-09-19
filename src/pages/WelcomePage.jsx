import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Leaf,
  Send,
  Ticket,
  Users,
} from "lucide-react";
import { setPageMeta, SITE_ORIGIN } from "../siteMeta.js";
import {
  markWelcomeSeen,
  markWelcomeSession,
} from "../welcomeStorage.js";

const AUDIENCE = [
  "BAMS students & interns",
  "Postgraduates",
  "Early-career practitioners",
];

const FEATURES = [
  {
    id: "mentors",
    title: "Explore Mentors",
    how: "Browse Meet the Mentors profiles, then open one to see who may guide your path.",
    Icon: Users,
    image: "/assets/welcome/welcome-feature-mentors.png",
  },
  {
    id: "ask",
    title: "Ask a Question",
    how: "Register with a real email, then submit one focused Ayurveda career question at the Ask Desk.",
    Icon: Send,
    image: "/assets/welcome/welcome-feature-ask.png",
  },
  {
    id: "track",
    title: "Track My Answer",
    how: "Look up your Ask Desk ticket with your WAC number and follow it until a mentor replies in writing.",
    Icon: Ticket,
    image: "/assets/welcome/welcome-feature-track.png",
  },
  {
    id: "hall",
    title: "Enter the Hall",
    how: "Open the digital floor for podcasts, the theme stage, and Congress selection results.",
    Icon: Leaf,
    image: "/assets/welcome/welcome-feature-hall.png",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Register & ask",
    body: "Create your delegate profile with a verified email, then file one clear career question at the Ask Desk — PG, clinic, research, public health, start-up, or practice abroad.",
  },
  {
    n: "02",
    title: "Keep your ticket",
    body: "The hall issues your unique WAC tracking number instantly. Save it — you will need it to check your Ask Desk submission.",
  },
  {
    n: "03",
    title: "Track the reply",
    body: "Return to Track My Answer anytime. When a mentor responds in writing, your ticket status updates so you can read the guidance.",
  },
  {
    n: "04",
    title: "Visit the Hall",
    body: "Between asks, explore Mentors, career tracks, podcasts, and the theme stage — the same Meet the Mentors floor, on phone or laptop.",
  },
];

const TRUST_POINTS = [
  {
    title: "Official digital hall",
    body: "AYURDISHA is the Meet the Mentors digital space of the 11th World Ayurveda Congress in Bhubaneswar.",
  },
  {
    title: "Career guidance",
    body: "Mentors offer professional direction for education and practice pathways — not clinical diagnosis or treatment advice.",
  },
  {
    title: "One clear path",
    body: "Register once, ask once, track the written reply, and learn from the open theme stage when answers are published.",
  },
];

function finishWelcome(navigate) {
  markWelcomeSeen();
  markWelcomeSession();
  navigate("/", { replace: true });
  window.scrollTo(0, 0);
}

const SLIDE_COUNT = 5;

export default function WelcomePage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const touchStartX = useRef(null);
  const skipClickRef = useRef(false);

  const enterHome = useCallback(() => {
    finishWelcome(navigate);
  }, [navigate]);

  const goTo = useCallback((next, direction) => {
    setDir(direction);
    setIndex(next);
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= SLIDE_COUNT - 1) return i;
      setDir(1);
      return i + 1;
    });
  }, []);

  const goPrev = useCallback(() => {
    setIndex((i) => {
      if (i <= 0) return i;
      setDir(-1);
      return i - 1;
    });
  }, []);

  useEffect(() => {
    setPageMeta({
      title: "Welcome · AYURDISHA · Meet the Mentors · WAC 2026",
      description:
        "Orient yourself in AYURDISHA — the digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026.",
      path: "/welcome",
      image: `${SITE_ORIGIN}/assets/welcome/welcome-hero.png`,
    });
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (index < SLIDE_COUNT - 1) goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, index]);

  const onDeckPointer = (e) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    const t = e.target;
    if (t.closest("button, a, [data-welcome-stop]")) return;
    if (index < SLIDE_COUNT - 1) goNext();
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX;
    if (end == null) return;
    const dx = end - start;
    if (Math.abs(dx) < 56) return;
    skipClickRef.current = true;
    if (dx < 0) goNext();
    else goPrev();
  };

  const isLast = index === SLIDE_COUNT - 1;
  const lightChrome = index === 1 || index === 2 || index === 3;
  const slideClass = `aym-welcome-slide aym-welcome-slide-${index + 1} aym-welcome-slide-enter-${dir > 0 ? "next" : "prev"}`;

  return (
    <div
      className={`aym-welcome-page aym-welcome-deck${lightChrome ? " aym-welcome-deck-light" : ""}`}
      role="region"
      aria-roledescription="carousel"
      aria-label="AYURDISHA welcome orientation"
    >
      <a className="aym-skip" href="#welcome-slide">
        Skip to welcome content
      </a>

      <div className="aym-welcome-chrome">
        <p className="aym-welcome-chrome-brand">AYURDISHA</p>
        <button type="button" className="aym-welcome-skip-top" onClick={enterHome}>
          Skip
        </button>
      </div>

      <div
        id="welcome-slide"
        className="aym-welcome-stage"
        onClick={onDeckPointer}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        tabIndex={0}
      >
        {/* Slide 1 — Purpose */}
        {index === 0 && (
          <article
            key="s1"
            className={`${slideClass} aym-welcome-slide-hero`}
            aria-labelledby="welcome-hero-title"
          >
            <div className="aym-welcome-slide-bg" aria-hidden="true">
              <img
                src="/assets/welcome/welcome-hero.png"
                alt=""
                className="aym-welcome-slide-bg-img"
                width={1536}
                height={864}
                fetchPriority="high"
              />
              <div className="aym-welcome-hero-veil" />
              <div className="aym-welcome-hero-vignette" />
            </div>
            <div className="aym-welcome-slide-body aym-welcome-slide-body-hero">
              <p className="aym-welcome-eyebrow">
                <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
                WAC 2026 · Bhubaneswar · 11–13 December
              </p>
              <h1 id="welcome-hero-title" className="aym-welcome-hero-title">
                AYURDISHA
                <span className="aym-welcome-hero-title-line">
                  Meet the Mentors for Ayurveda careers
                </span>
              </h1>
              <p className="aym-welcome-hero-lead">
                The official digital Meet the Mentors hall of the 11th World Ayurveda
                Congress — a calm place for BAMS students, postgraduates, and early-career
                practitioners to find career direction before they enter the floor.
              </p>
              <ul className="aym-welcome-audience" aria-label="Who AYURDISHA is for">
                {AUDIENCE.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          </article>
        )}

        {/* Slide 2 — What you can do */}
        {index === 1 && (
          <article
            key="s2"
            className={`${slideClass} aym-welcome-slide-features`}
            aria-labelledby="welcome-features-title"
          >
            <div className="aym-welcome-slide-inner">
              <header className="aym-welcome-slide-head">
                <p className="aym-welcome-section-eyebrow">What you can do</p>
                <h2 id="welcome-features-title" className="aym-welcome-section-title">
                  Four clear doors into the hall
                </h2>
                <p className="aym-welcome-section-lead">
                  Mentors, Ask, Track, and the Hall — the same tools you will use on the home
                  floor. Nothing here is a menu button; tap anywhere to keep reading.
                </p>
              </header>
              <ul className="aym-welcome-feature-grid aym-welcome-feature-grid-deck">
                {FEATURES.map((f) => {
                  const Icon = f.Icon;
                  return (
                    <li key={f.id} className="aym-welcome-feature-card">
                      <div className="aym-welcome-feature-visual" aria-hidden="true">
                        <img src={f.image} alt="" width={640} height={640} />
                        <span className="aym-welcome-feature-badge">
                          <Icon size={18} strokeWidth={1.7} />
                        </span>
                      </div>
                      <div className="aym-welcome-feature-body">
                        <h3>{f.title}</h3>
                        <p>{f.how}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        )}

        {/* Slide 3 — How to use */}
        {index === 2 && (
          <article
            key="s3"
            className={`${slideClass} aym-welcome-slide-path`}
            aria-labelledby="welcome-steps-title"
          >
            <div className="aym-welcome-slide-inner aym-welcome-slide-path-inner">
              <header className="aym-welcome-slide-head">
                <p className="aym-welcome-section-eyebrow">How to use AYURDISHA</p>
                <h2 id="welcome-steps-title" className="aym-welcome-section-title">
                  Your first-visit path
                </h2>
                <p className="aym-welcome-section-lead">
                  A short journey from registration to a written mentor reply — and the Hall
                  while you wait.
                </p>
              </header>
              <ol className="aym-welcome-steps aym-welcome-steps-deck aym-welcome-steps-four">
                {STEPS.map((s) => (
                  <li key={s.n} className="aym-welcome-step">
                    <span className="aym-welcome-step-n" aria-hidden="true">
                      {s.n}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        )}

        {/* Slide 4 — Congress + trust */}
        {index === 3 && (
          <article
            key="s4"
            className={`${slideClass} aym-welcome-slide-trust`}
            aria-labelledby="welcome-trust-title"
          >
            <div className="aym-welcome-slide-split aym-welcome-slide-split-trust">
              <div className="aym-welcome-slide-copy">
                <p className="aym-welcome-section-eyebrow">Congress &amp; trust</p>
                <h2 id="welcome-trust-title" className="aym-welcome-section-title">
                  Built for WAC Bhubaneswar — guidance, not diagnosis
                </h2>
                <p className="aym-welcome-section-lead">
                  AYURDISHA is the official digital Meet the Mentors hall of the 11th World
                  Ayurveda Congress. Use it for career clarity: education pathways, practice
                  choices, and professional direction from mentors.
                </p>
                <ul className="aym-welcome-trust-list">
                  {TRUST_POINTS.map((p) => (
                    <li key={p.title}>
                      <h3>{p.title}</h3>
                      <p>{p.body}</p>
                    </li>
                  ))}
                </ul>
                <p className="aym-welcome-disclaimer">
                  Career guidance only — not medical advice, Prakriti assessment, or clinical diagnosis.
                </p>
              </div>
              <figure className="aym-welcome-slide-media aym-welcome-slide-media-tall">
                <img
                  src="/assets/welcome/welcome-congress.png"
                  alt="Warm lantern-lit World Ayurveda Congress hall with botanical panels and delegates"
                  width={1536}
                  height={864}
                />
              </figure>
            </div>
          </article>
        )}

        {/* Slide 5 — Ready / Enter CTA */}
        {index === 4 && (
          <article
            key="s5"
            className={`${slideClass} aym-welcome-slide-finale`}
            aria-labelledby="welcome-finale-title"
          >
            <div className="aym-welcome-slide-bg aym-welcome-slide-bg-finale" aria-hidden="true">
              <img
                src="/assets/welcome/welcome-what.png"
                alt=""
                className="aym-welcome-slide-bg-img"
                width={1200}
                height={900}
              />
              <div className="aym-welcome-hero-veil" />
              <div className="aym-welcome-hero-vignette" />
            </div>
            <div className="aym-welcome-slide-body aym-welcome-slide-body-finale">
              <p className="aym-welcome-eyebrow">
                <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
                Ready when you are
              </p>
              <h2 id="welcome-finale-title" className="aym-welcome-hero-title">
                Enter the hall
              </h2>
              <p className="aym-welcome-hero-lead">
                Continue to AYURDISHA home — explore mentors, open the Ask Desk when ready,
                and track your ticket. You can reopen this orientation anytime from About or Help.
              </p>
              <div className="aym-welcome-hero-actions" data-welcome-stop>
                <button
                  type="button"
                  className="aym-welcome-cta"
                  onClick={(e) => {
                    e.stopPropagation();
                    enterHome();
                  }}
                >
                  Enter AYURDISHA
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
              <p className="aym-welcome-hint aym-welcome-hint-on-dark">
                <BookOpen size={14} aria-hidden="true" />
                Tip: reopen this overview from About or How AYURDISHA works.
              </p>
            </div>
          </article>
        )}
      </div>

      <div className="aym-welcome-footer" data-welcome-stop>
        <div
          className="aym-welcome-progress"
          role="tablist"
          aria-label="Welcome orientation progress"
        >
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={
                i === 0
                  ? "Purpose"
                  : i === 1
                    ? "What you can do"
                    : i === 2
                      ? "How to use"
                      : i === 3
                        ? "Congress and trust"
                        : "Enter AYURDISHA"
              }
              className={`aym-welcome-dot${i === index ? " is-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (i === index) return;
                goTo(i, i > index ? 1 : -1);
              }}
            />
          ))}
        </div>
        {!isLast && (
          <p className="aym-welcome-tap-hint" aria-hidden="true">
            Tap anywhere to continue
          </p>
        )}
      </div>
    </div>
  );
}
