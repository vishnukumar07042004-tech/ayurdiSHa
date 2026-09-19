import React, { useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const FEATURES = [
  {
    id: "mentors",
    title: "Explore Mentors",
    how: "Browse the tentative Meet the Mentors roster and open a profile to learn who may guide your path.",
    Icon: Users,
    image: "/assets/welcome/welcome-feature-mentors.png",
    to: "/mentors",
  },
  {
    id: "ask",
    title: "Ask a Question",
    how: "Register once, then submit one focused Ayurveda career question at the Ask Desk.",
    Icon: Send,
    image: "/assets/welcome/welcome-feature-ask.png",
    to: { pathname: "/", hash: "#ask" },
  },
  {
    id: "track",
    title: "Track My Answer",
    how: "Look up your Ask Desk ticket and follow it until a mentor replies in writing.",
    Icon: Ticket,
    image: "/assets/welcome/welcome-feature-track.png",
    to: { pathname: "/", hash: "#track" },
  },
  {
    id: "hall",
    title: "Enter the Hall",
    how: "Open the digital floor for podcasts, the theme stage, and Congress selection results.",
    Icon: Leaf,
    image: "/assets/welcome/welcome-feature-hall.png",
    to: { pathname: "/", hash: "#hall" },
  },
];

const STEPS = [
  {
    n: "01",
    title: "Orient yourself",
    body: "Start here to learn what AYURDISHA offers — Mentors, Ask, Track, and the Hall.",
  },
  {
    n: "02",
    title: "Enter the home hall",
    body: "Continue to home for the full Meet the Mentors experience and career pathways.",
  },
  {
    n: "03",
    title: "Ask when you are ready",
    body: "Register with a verified email, receive your WAC number, and submit one clear career question.",
  },
];

function finishWelcome(navigate) {
  markWelcomeSeen();
  markWelcomeSession();
  navigate("/", { replace: true });
  window.scrollTo(0, 0);
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const rootRef = useRef(null);

  const enterHome = useCallback(() => {
    finishWelcome(navigate);
  }, [navigate]);

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
    const root = rootRef.current;
    if (!root) return undefined;

    const nodes = root.querySelectorAll("[data-reveal]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="aym-welcome-page">
      <a className="aym-skip" href="#welcome-main">
        Skip to welcome content
      </a>

      {/* 1. Full-bleed hero */}
      <header className="aym-welcome-hero" aria-labelledby="welcome-hero-title">
        <div className="aym-welcome-hero-stage" aria-hidden="true">
          <img
            src="/assets/welcome/welcome-hero.png"
            alt=""
            className="aym-welcome-hero-img"
            width={1536}
            height={864}
            fetchPriority="high"
          />
          <div className="aym-welcome-hero-veil" />
          <div className="aym-welcome-hero-vignette" />
        </div>

        <div className="aym-welcome-hero-bar">
          <p className="aym-welcome-hero-brand">AYURDISHA</p>
          <button type="button" className="aym-welcome-skip-top" onClick={enterHome}>
            Skip
          </button>
        </div>

        <div className="aym-welcome-hero-shell">
          <p className="aym-welcome-eyebrow">
            <span className="aym-welcome-eyebrow-mark" aria-hidden="true" />
            WAC 2026 · Bhubaneswar · 11–13 December
          </p>
          <h1 id="welcome-hero-title" className="aym-welcome-hero-title">
            Meet the Mentors
            <span className="aym-welcome-hero-title-line">
              shaping Ayurveda careers
            </span>
          </h1>
          <p className="aym-welcome-hero-lead">
            Welcome to the official digital Meet the Mentors hall of the 11th World
            Ayurveda Congress — a calm place to learn the hall, then continue home.
          </p>
          <div className="aym-welcome-hero-actions">
            <button type="button" className="aym-welcome-cta" onClick={enterHome}>
              Enter AYURDISHA
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="aym-welcome-cta-ghost" onClick={enterHome}>
              Continue to home
            </button>
          </div>
          <p className="aym-welcome-scroll-hint" aria-hidden="true">
            Scroll to orient
          </p>
        </div>
      </header>

      <main id="welcome-main">
        {/* 2. What is AYURDISHA */}
        <section
          className="aym-welcome-section aym-welcome-about"
          aria-labelledby="welcome-about-title"
          data-reveal
        >
          <div className="aym-welcome-about-copy">
            <p className="aym-welcome-section-eyebrow">What is AYURDISHA</p>
            <h2 id="welcome-about-title" className="aym-welcome-section-title">
              A digital hall for career guidance — not a clinic
            </h2>
            <p className="aym-welcome-section-lead">
              AYURDISHA brings BAMS students, postgraduates, and early-career
              practitioners into a curated Meet the Mentors space at WAC 2026. Explore
              mentors, ask one focused career question, track the reply, and enter the
              hall for podcasts and published guidance — without Prakriti quizzes or
              medical diagnosis.
            </p>
          </div>
          <figure className="aym-welcome-about-media" data-reveal>
            <img
              src="/assets/welcome/welcome-what.png"
              alt="Mentors and scholars gathered around manuscripts and medicinal herbs in a scholarly hall"
              width={1200}
              height={900}
              loading="lazy"
            />
          </figure>
        </section>

        {/* 3. What you can do */}
        <section
          className="aym-welcome-section aym-welcome-features-sec"
          aria-labelledby="welcome-features-title"
        >
          <div className="aym-welcome-section-head" data-reveal>
            <p className="aym-welcome-section-eyebrow">What you can do</p>
            <h2 id="welcome-features-title" className="aym-welcome-section-title">
              Four ways through the hall
            </h2>
            <p className="aym-welcome-section-lead">
              Everything centres on Mentors, Ask, Track, and the Hall — clear tools,
              nothing extra.
            </p>
          </div>

          <ul className="aym-welcome-feature-grid" data-reveal-stagger>
            {FEATURES.map((f, i) => {
              const Icon = f.Icon;
              return (
                <li
                  key={f.id}
                  className="aym-welcome-feature-card"
                  data-reveal
                  style={{ "--aym-welcome-stagger": i }}
                >
                  <div className="aym-welcome-feature-visual" aria-hidden="true">
                    <img src={f.image} alt="" width={640} height={640} loading="lazy" />
                    <span className="aym-welcome-feature-badge">
                      <Icon size={18} strokeWidth={1.7} />
                    </span>
                  </div>
                  <div className="aym-welcome-feature-body">
                    <h3>{f.title}</h3>
                    <p>{f.how}</p>
                    <Link
                      to={f.to}
                      className="aym-welcome-feature-link"
                      onClick={() => {
                        markWelcomeSeen();
                        markWelcomeSession();
                      }}
                    >
                      Open {f.title}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 4. How it works */}
        <section
          className="aym-welcome-section aym-welcome-steps-sec"
          aria-labelledby="welcome-steps-title"
        >
          <div className="aym-welcome-section-head" data-reveal>
            <p className="aym-welcome-section-eyebrow">How it works</p>
            <h2 id="welcome-steps-title" className="aym-welcome-section-title">
              Three simple steps
            </h2>
          </div>
          <ol className="aym-welcome-steps" data-reveal-stagger>
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="aym-welcome-step"
                data-reveal
                style={{ "--aym-welcome-stagger": i }}
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
        </section>

        {/* 5. Congress context */}
        <section
          className="aym-welcome-section aym-welcome-congress"
          aria-labelledby="welcome-congress-title"
          data-reveal
        >
          <figure className="aym-welcome-congress-media" aria-hidden="true">
            <img
              src="/assets/welcome/welcome-congress.png"
              alt=""
              width={1200}
              height={900}
              loading="lazy"
              className="aym-welcome-congress-img"
            />
            <div className="aym-welcome-congress-veil" />
          </figure>
          <div className="aym-welcome-congress-copy">
            <p className="aym-welcome-section-eyebrow">Congress context</p>
            <h2 id="welcome-congress-title" className="aym-welcome-section-title">
              11th World Ayurveda Congress
            </h2>
            <p className="aym-welcome-section-lead">
              AYURDISHA is the digital Meet the Mentors hall for WAC 2026 in
              Bhubaneswar, 11–13 December 2026 — bridging the Congress floor with
              guided career conversations for Ayurveda education.
            </p>
          </div>
        </section>

        {/* 6. Final CTA */}
        <section
          className="aym-welcome-finale"
          aria-labelledby="welcome-finale-title"
          data-reveal
        >
          <p className="aym-welcome-section-eyebrow">Ready when you are</p>
          <h2 id="welcome-finale-title" className="aym-welcome-finale-title">
            Enter the hall
          </h2>
          <p className="aym-welcome-finale-lead">
            Continue to the AYURDISHA home page — you can reopen this orientation anytime
            from About or Help in the menu.
          </p>
          <div className="aym-welcome-hero-actions">
            <button type="button" className="aym-welcome-cta" onClick={enterHome}>
              Enter AYURDISHA
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="aym-welcome-cta-ghost aym-welcome-cta-ghost-dark" onClick={enterHome}>
              Continue to home
            </button>
          </div>
          <p className="aym-welcome-hint">
            <BookOpen size={14} aria-hidden="true" />
            Tip: reopen this overview from About or How AYURDISHA works.
          </p>
        </section>
      </main>
    </div>
  );
}
