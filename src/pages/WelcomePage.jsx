import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Leaf,
  MapPin,
  Send,
  Ticket,
  Users,
} from "lucide-react";
import { setPageMeta, SITE_ORIGIN } from "../siteMeta.js";
import {
  markWelcomeSeen,
} from "../welcomeStorage.js";

const AUDIENCE = [
  "BAMS students & interns",
  "Postgraduates",
  "Early-career practitioners",
];

const FEATURES = [
  {
    id: "hall",
    title: "Enter the Hall",
    how: "Podcasts, theme stage, Congress results, and the map into Mentors, Ask, and Track.",
    Icon: Leaf,
    image: "/assets/welcome/welcome-feature-hall.png",
  },
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
    how: "Register with a real email, then submit one focused Ayurveda career question.",
    Icon: Send,
    image: "/assets/welcome/welcome-feature-ask.png",
  },
  {
    id: "track",
    title: "Track My Answer",
    how: "Look up your ticket with your WAC number and follow it until a mentor replies.",
    Icon: Ticket,
    image: "/assets/welcome/welcome-feature-track.png",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Visit the Hall",
    body: "Browse mentors, career tracks, podcasts, and the theme stage before you ask.",
  },
  {
    n: "02",
    title: "Register & ask",
    body: "Verify your email, then file one clear career question at the Ask Desk.",
  },
  {
    n: "03",
    title: "Keep your ticket",
    body: "Save your unique WAC tracking number — you will need it to check your submission.",
  },
  {
    n: "04",
    title: "Track the reply",
    body: "When a mentor responds in writing, your ticket status updates so you can read it.",
  },
];

/** Shared programme pillar: live 1:1 at Bhubaneswar (Meet the Mentors). */
const LIVE_1ON1 = {
  badge: "Also at Bhubaneswar",
  title: "Live 1-on-1 mentor talks for selected students",
  body:
    "At the 11th World Ayurveda Congress, selected students may be invited to a live one-to-one mentor conversation — facilitated by the AYURDISHA Meet the Mentors team. Selection-based, not automatic for every delegate.",
  pathTitle: "Alongside the digital path",
  pathBody:
    "Selected students may also be invited to a live one-to-one mentor talk at Meet the Mentors in Bhubaneswar — career direction only, not medical advice.",
};

const TRUST_POINTS = [
  {
    title: "Official digital hall",
    body: "AYURDISHA is the Meet the Mentors digital space of the 11th World Ayurveda Congress in Bhubaneswar — the same career floor before and during Congress.",
  },
  {
    title: "Live 1-on-1 mentor talks",
    body: "On the Congress floor, selected students may be invited to a live one-to-one career conversation with a mentor, facilitated by the AYURDISHA team.",
    highlight: true,
  },
  {
    title: "Written guidance for everyone",
    body: "Register once, ask once at the Ask Desk, track your written reply online, and learn from the open theme stage.",
  },
];

function finishWelcome(navigate) {
  markWelcomeSeen();
  navigate("/", { replace: true });
  window.scrollTo(0, 0);
}

const SLIDE_COUNT = 5;

/** Atmosphere tokens per slide — drives deck wash via data-atmosphere. */
const SLIDE_ATMOSPHERE = ["forest", "cream", "botanical", "warm", "forest-deep"];

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
  const atmosphere = SLIDE_ATMOSPHERE[index] || "forest";
  const slideClass = `aym-welcome-slide aym-welcome-slide-${index + 1} aym-welcome-slide-enter-${dir > 0 ? "next" : "prev"}`;

  return (
    <div
      className={`aym-welcome-page aym-welcome-deck${lightChrome ? " aym-welcome-deck-light" : ""}`}
      data-atmosphere={atmosphere}
      data-slide={index + 1}
      role="region"
      aria-roledescription="carousel"
      aria-label="AYURDISHA welcome orientation"
    >
      <div className="aym-welcome-atmosphere" aria-hidden="true" />

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
              <p className="aym-welcome-eyebrow aym-welcome-anim" style={{ "--aym-i": 0 }}>
                <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
                WAC 2026 · Bhubaneswar · 11–13 December
              </p>
              <h1 id="welcome-hero-title" className="aym-welcome-hero-title aym-welcome-anim" style={{ "--aym-i": 1 }}>
                AYURDISHA
                <span className="aym-welcome-hero-title-line">
                  Meet the Mentors for Ayurveda careers
                </span>
              </h1>
              <p className="aym-welcome-hero-lead aym-welcome-anim" style={{ "--aym-i": 2 }}>
                The official digital Meet the Mentors hall of the 11th World Ayurveda
                Congress — calm career direction for BAMS students, postgraduates, and
                early-career practitioners.
              </p>
              <ul className="aym-welcome-audience aym-welcome-anim" style={{ "--aym-i": 3 }} aria-label="Who AYURDISHA is for">
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
              <header className="aym-welcome-slide-head aym-welcome-anim" style={{ "--aym-i": 0 }}>
                <p className="aym-welcome-section-eyebrow">What you can do</p>
                <h2 id="welcome-features-title" className="aym-welcome-section-title">
                  Four doors on the digital floor
                </h2>
                <p className="aym-welcome-section-lead">
                  Hall, Mentors, Ask, and Track — plus live 1-on-1 mentor talks at
                  Bhubaneswar for selected students.
                </p>
              </header>
              <ul className="aym-welcome-feature-grid aym-welcome-feature-grid-deck">
                {FEATURES.map((f, i) => {
                  const Icon = f.Icon;
                  return (
                    <li
                      key={f.id}
                      className="aym-welcome-feature-card aym-welcome-anim"
                      style={{ "--aym-i": i + 1 }}
                    >
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
              <aside
                className="aym-welcome-live-strip aym-welcome-anim"
                style={{ "--aym-i": 5 }}
                aria-label={LIVE_1ON1.title}
              >
                <MapPin size={16} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <strong>{LIVE_1ON1.badge}</strong>
                  <span>{LIVE_1ON1.title} — selection-based, arranged by our Meet the Mentors team.</span>
                </div>
              </aside>
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
              <header className="aym-welcome-slide-head aym-welcome-anim" style={{ "--aym-i": 0 }}>
                <p className="aym-welcome-section-eyebrow">How to use AYURDISHA</p>
                <h2 id="welcome-steps-title" className="aym-welcome-section-title">
                  Your first-visit path
                </h2>
                <p className="aym-welcome-section-lead">
                  Hall → register → ticket → track — then follow your written reply online.
                </p>
              </header>
              <ol className="aym-welcome-steps aym-welcome-steps-deck aym-welcome-steps-four">
                {STEPS.map((s, i) => (
                  <li
                    key={s.n}
                    className="aym-welcome-step aym-welcome-anim"
                    style={{ "--aym-i": i + 1 }}
                  >
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
              <aside
                className="aym-welcome-live-strip aym-welcome-anim"
                style={{ "--aym-i": 5 }}
                aria-label={LIVE_1ON1.pathTitle}
              >
                <Users size={16} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <strong>{LIVE_1ON1.badge}</strong>
                  <span>{LIVE_1ON1.pathBody}</span>
                </div>
              </aside>
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
                <p className="aym-welcome-section-eyebrow aym-welcome-anim" style={{ "--aym-i": 0 }}>
                  Congress &amp; trust
                </p>
                <h2
                  id="welcome-trust-title"
                  className="aym-welcome-section-title aym-welcome-anim"
                  style={{ "--aym-i": 1 }}
                >
                  Built for WAC Bhubaneswar
                </h2>
                <p className="aym-welcome-section-lead aym-welcome-anim" style={{ "--aym-i": 2 }}>
                  Career clarity online — and for selected students, live one-to-one mentor
                  talks on the Congress floor, facilitated by the AYURDISHA Meet the Mentors team.
                </p>
                <ul className="aym-welcome-trust-list">
                  {TRUST_POINTS.map((p, i) => (
                    <li
                      key={p.title}
                      className={`aym-welcome-anim${p.highlight ? " aym-welcome-trust-highlight" : ""}`}
                      style={{ "--aym-i": i + 3 }}
                    >
                      <h3>{p.title}</h3>
                      <p>{p.body}</p>
                    </li>
                  ))}
                </ul>
                <p className="aym-welcome-disclaimer aym-welcome-anim" style={{ "--aym-i": 6 }}>
                  Career and education guidance for Congress delegates — not medical advice or treatment.
                </p>
              </div>
              <figure className="aym-welcome-slide-media aym-welcome-slide-media-tall aym-welcome-anim" style={{ "--aym-i": 2 }}>
                <img
                  src="/assets/welcome/welcome-congress.png"
                  alt="Mentor and student in a one-to-one Meet the Mentors career conversation"
                  width={864}
                  height={1152}
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
                src="/assets/welcome/welcome-enter-hall.png"
                alt=""
                className="aym-welcome-slide-bg-img"
                width={1280}
                height={720}
              />
              <div className="aym-welcome-hero-veil aym-welcome-finale-veil" />
              <div className="aym-welcome-hero-vignette" />
            </div>
            <div className="aym-welcome-slide-body aym-welcome-slide-body-finale">
              <p className="aym-welcome-eyebrow aym-welcome-anim" style={{ "--aym-i": 0 }}>
                <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
                Ready when you are
              </p>
              <h2 id="welcome-finale-title" className="aym-welcome-hero-title aym-welcome-anim" style={{ "--aym-i": 1 }}>
                Enter the hall
                <span className="aym-welcome-hero-title-line">
                  Your place on the Meet the Mentors floor
                </span>
              </h2>
              <p className="aym-welcome-hero-lead aym-welcome-anim" style={{ "--aym-i": 2 }}>
                Continue into AYURDISHA home — browse mentors, ask once when ready, and track
                your written reply. Reopen this orientation anytime from About or Help.
              </p>
              <ul className="aym-welcome-finale-map aym-welcome-anim" style={{ "--aym-i": 3 }} aria-label="What you will find inside">
                <li>
                  <span>Home floor</span>
                  Podcasts, theme stage, Congress results
                </li>
                <li>
                  <span>Mentors</span>
                  Meet the Mentors profiles
                </li>
                <li>
                  <span>Ask Desk</span>
                  One focused career question
                </li>
                <li>
                  <span>Track</span>
                  Follow your WAC ticket
                </li>
              </ul>
              <div className="aym-welcome-hero-actions aym-welcome-anim" style={{ "--aym-i": 4 }} data-welcome-stop>
                <button
                  type="button"
                  className="aym-welcome-cta"
                  onClick={(e) => {
                    e.stopPropagation();
                    enterHome();
                  }}
                >
                  Enter AYURDISHA
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
              <p className="aym-welcome-hint aym-welcome-hint-on-dark aym-welcome-anim" style={{ "--aym-i": 5 }}>
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
