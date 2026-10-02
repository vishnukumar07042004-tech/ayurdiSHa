import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Leaf,
  MapPin,
  Send,
  Ticket,
  Users,
} from "lucide-react";
import Button from "../components/ui/Button.jsx";
import { Rings, Sprig } from "../components/editorial/Ornaments.jsx";
import CountUp from "../components/editorial/CountUp.jsx";
import { WAC } from "../content/site.js";
import { MENTORS, mentorsWithNames } from "../mentors.js";
import useLiveStats from "../useLiveStats.js";
import { setPageMeta, SITE_ORIGIN } from "../siteMeta.js";
import {
  markWelcomeSeen,
} from "../welcomeStorage.js";
import "../styles/welcome.css";

const AUDIENCE = [
  "BAMS students & interns",
  "Postgraduates",
  "Young practitioners",
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
    image: "/assets/welcome/welcome-feature-mentors.webp",
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

const MENTOR_COUNT = mentorsWithNames(MENTORS).length;

const HERO_FACTS = [
  { label: "Dates", value: "10–13 Dec 2026" },
  { label: "Venue", value: `${WAC.city}, Odisha` },
  { label: "Mentors", count: MENTOR_COUNT, value: " on the roster" },
  { label: "Format", value: "Live 1:1" },
];

/** Headline words that rise out of a clipping mask, one after another. */
function MaskWords({ text, from = 0 }) {
  return text.split(" ").map((w, i, all) => (
    <React.Fragment key={`${w}-${i}`}>
      <span className="wl-mask"><span className="wl-mw" style={{ "--w": from + i }}>{w}</span></span>
      {i < all.length - 1 ? " " : null}
    </React.Fragment>
  ));
}

/** Pointer parallax for the opening image: writes --px / --py (-1…1) on the deck. */
function useStageParallax() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fine = window.matchMedia("(pointer: fine) and (min-width: 835px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return undefined;
    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (e) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}

const FINALE_CARDS = [
  {
    id: "hall",
    eyebrow: "The Hall",
    title: "Walk the digital floor",
    body: "Podcasts, the theme stage and Congress results.",
    Icon: Leaf,
  },
  {
    id: "mentors",
    eyebrow: "Mentors",
    title: `${MENTOR_COUNT} senior mentors`,
    body: "Clinical, research, academic and global career paths.",
    Icon: Users,
  },
  {
    id: "ask",
    eyebrow: "Ask Desk",
    title: "One focused question",
    body: "Verify your email, then ask what matters most.",
    Icon: Send,
  },
  {
    id: "track",
    eyebrow: "Track my answer",
    title: "Emailed when answered",
    body: "Follow your ticket until a mentor replies.",
    Icon: Ticket,
  },
];

function LiveNumber({ value, loading }) {
  if (value == null) {
    return <span aria-label={loading ? "Loading" : "Not available right now"}>—</span>;
  }
  return <CountUp value={value} duration={1500} />;
}

function FinaleSlide({ slideClass, onEnter, onAsk, onTrack, onCard }) {
  const live = useLiveStats();
  const d = live.data || {};
  const loading = live.status === "loading";
  const offline = live.status === "error";
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <article className={`${slideClass} wl-finale`} aria-labelledby="welcome-finale-title">
      <div className="wl-split wl-hero wl-finale-hero">
        <div className="wl-copy">
          <p className="wl-kicker wl-kicker--rule">
            <span className="wl-rule" aria-hidden="true" />
            <span className="wl-kicker-text wl-anim" style={{ "--i": 0 }}>
              <span>Your hall is open</span>
              <span className="wl-kicker-sep" aria-hidden="true">·</span>
              <span>WAC 2026</span>
            </span>
          </p>
          <h2 id="welcome-finale-title" className="wl-display wl-display--hero wl-display--finale">
            <span className="wl-display-lead"><MaskWords text="You're ready." /></span>{" "}
            <span className="wl-display-soft">
              <MaskWords text="Step into the" from={2} />{" "}
              <span className="wl-mask wl-mask--accent">
                <em className="wl-mw" style={{ "--w": 5 }}>hall.</em>
              </span>
            </span>
          </h2>
          <div className="wl-lede wl-anim" style={{ "--i": 3 }}>
            <p className="wl-lede-main">
              {MENTOR_COUNT} senior mentors. One focused question. A written answer you can
              track — <strong>emailed to you</strong> the moment a mentor replies.
            </p>
            <p className="wl-lede-sub">
              Selected students also meet a mentor live, one-to-one, in {WAC.city} · 10–13 Dec 2026.
            </p>
          </div>
          <div className="wl-actions wl-actions--hero wl-finale-actions" data-welcome-stop>
            <Button
              size="lg"
              className="wl-enter wl-anim"
              style={{ "--i": 4 }}
              iconAfter={<ArrowRight size={18} aria-hidden="true" className="ed-btn-arrow" />}
              onClick={stop(onEnter)}
            >
              Enter AYURDISHA
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="wl-anim"
              style={{ "--i": 5 }}
              onClick={stop(onAsk)}
            >
              Ask a question
            </Button>
            <button
              type="button"
              className="wl-textlink wl-anim"
              style={{ "--i": 6 }}
              onClick={stop(onTrack)}
            >
              Track my answer
              <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          <dl className="wl-facts wl-finale-live" aria-label="Live from the hall">
            <div className="wl-anim" style={{ "--i": 7 }}>
              <dt>
                <span className={`wl-live-badge${offline ? " is-off" : ""}`}>
                  <span className="wl-dot" aria-hidden="true" />
                  {offline ? "Offline" : "Live"}
                </span>
              </dt>
              <dd className="wl-sr">{offline ? "Live counts unavailable" : "Live counts"}</dd>
            </div>
            <div className="wl-anim" style={{ "--i": 8 }}>
              <dt>Registered students</dt>
              <dd><LiveNumber value={d.registeredStudents} loading={loading} /></dd>
            </div>
            <div className="wl-anim" style={{ "--i": 9 }}>
              <dt>Questions asked</dt>
              <dd><LiveNumber value={d.questionsAsked} loading={loading} /></dd>
            </div>
            <div className="wl-anim" style={{ "--i": 10 }}>
              <dt>Mentors</dt>
              <dd><CountUp value={MENTOR_COUNT} duration={1500} /></dd>
            </div>
          </dl>
        </div>

        <div className="wl-visual wl-visual--hero wl-visual--finale">
          <span className="wl-stage-glow" aria-hidden="true" />
          <div className="wl-depth wl-depth--back" aria-hidden="true">
            <Rings className="wl-rings" />
            <span className="wl-keyline" />
          </div>
          <div className="wl-depth wl-depth--media">
            <figure className="wl-media ed-media wl-curtain">
              <img
                src="/assets/welcome/welcome-enter-hall.webp"
                alt="The AYURDISHA Meet the Mentors hall: a mentor stage, curved conversation pods and the Ask Desk"
                width={1280}
                height={720}
              />
            </figure>
          </div>
          <div className="wl-depth wl-depth--inset">
            <figure className="wl-inset ed-media">
              <img
                src="/assets/welcome/welcome-finale-lounge.webp"
                alt="A senior mentor talks with two Ayurveda students at a table in the mentoring lounge"
                width={960}
                height={720}
              />
            </figure>
          </div>
          <Sprig className="wl-sprig" />
          <div className="wl-depth wl-depth--front">
            <p className="wl-tag wl-tag--live">
              <span className={`wl-dot${offline ? " is-off" : ""}`} aria-hidden="true" />
              <span className="wl-tag-label">Live now</span>
              {d.questionsAsked != null
                ? `${d.questionsAsked.toLocaleString("en-IN")} ${d.questionsAsked === 1 ? "question" : "questions"} asked`
                : "— questions asked"}
            </p>
            <p className="wl-tag wl-tag--track">
              <span className="wl-tag-label">Track</span>
              Emailed when answered
            </p>
          </div>
        </div>
      </div>

      <ul className="wl-bento" aria-label="What awaits inside">
        {FINALE_CARDS.map(({ id, eyebrow, title, body, Icon }, i) => (
          <li key={id} className="wl-bcard-wrap wl-anim" style={{ "--i": 11 + i }}>
            <button type="button" className="wl-bcard" onClick={stop(() => onCard(id))}>
              <span className="wl-bcard-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.7} />
              </span>
              <span className="wl-bcard-text">
                <span className="wl-bcard-eyebrow">{eyebrow}</span>
                <span className="wl-bcard-title">{title}</span>
                <span className="wl-bcard-body">{body}</span>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" className="wl-bcard-chev" />
            </button>
          </li>
        ))}
      </ul>
      <p className="wl-hint wl-anim" style={{ "--i": 15 }}>
        <BookOpen size={13} aria-hidden="true" />
        Want this tour again? Reopen it anytime from About or the More menu.
      </p>
    </article>
  );
}

const SLIDE_LABELS = ["Purpose", "What you can do", "How to use", "Congress and trust", "Enter AYURDISHA"];

const SLIDE_IMAGES = [
  ["/assets/welcome/welcome-hero.png"],
  FEATURES.map((f) => f.image),
  [],
  ["/assets/welcome/welcome-congress.webp"],
  ["/assets/welcome/welcome-enter-hall.webp", "/assets/welcome/welcome-finale-lounge.webp"],
];

function finishWelcome(navigate) {
  markWelcomeSeen();
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
  const deckRef = useStageParallax();

  const enterHome = useCallback(() => {
    finishWelcome(navigate);
  }, [navigate]);

  const askFromWelcome = useCallback(() => {
    markWelcomeSeen();
    navigate({ pathname: "/", hash: "#ask" }, { replace: true });
  }, [navigate]);

  const trackFromWelcome = useCallback(() => {
    markWelcomeSeen();
    navigate({ pathname: "/", hash: "#track" }, { replace: true });
    window.scrollTo(0, 0);
  }, [navigate]);

  const openFromFinale = useCallback((id) => {
    if (id === "ask") return askFromWelcome();
    if (id === "track") return trackFromWelcome();
    markWelcomeSeen();
    if (id === "mentors") navigate("/mentors", { replace: true });
    else navigate({ pathname: "/", hash: `#${id}` }, { replace: true });
    window.scrollTo(0, 0);
    return undefined;
  }, [askFromWelcome, trackFromWelcome, navigate]);

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
    (SLIDE_IMAGES[index + 1] || []).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [index]);

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
  const slideClass = `wl-slide wl-slide--${index + 1} is-enter-${dir > 0 ? "next" : "prev"}`;
  const nextButton = (label = "Continue") => (
    <Button
      size="lg"
      className="wl-anim"
      style={{ "--i": 5 }}
      iconAfter={<ChevronRight size={18} aria-hidden="true" className="ed-btn-arrow" />}
      onClick={(e) => {
        e.stopPropagation();
        goNext();
      }}
    >
      {label}
    </Button>
  );

  return (
    <div
      ref={deckRef}
      className="wl-deck"
      data-slide={index + 1}
      role="region"
      aria-roledescription="carousel"
      aria-label="AYURDISHA welcome orientation"
    >
      <div className="wl-bg" aria-hidden="true">
        <span className="wl-glow wl-glow--sage" />
        <span className="wl-glow wl-glow--gold" />
      </div>

      <a className="aym-skip" href="#welcome-slide">
        Skip to welcome content
      </a>

      <header className="wl-bar">
        <div className="wl-bar-inner">
          <p className="wl-brand">
            <span className="wl-brand-word">AYURDISHA</span>
            <span className="wl-brand-kicker">Meet the Mentors · WAC 2026</span>
          </p>
          <button type="button" className="wl-skip" onClick={enterHome}>
            Skip
          </button>
        </div>
      </header>

      <div
        id="welcome-slide"
        className="wl-stage"
        onClick={onDeckPointer}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        tabIndex={0}
      >
        {/* Slide 1 — Purpose */}
        {index === 0 && (
          <article key="s1" className={`${slideClass} wl-split wl-hero`} aria-labelledby="welcome-hero-title">
            <div className="wl-copy">
              <p className="wl-kicker wl-kicker--rule">
                <span className="wl-rule" aria-hidden="true" />
                <span className="wl-kicker-text wl-anim" style={{ "--i": 0 }}>
                  <span>11th World Ayurveda Congress</span>
                  <span className="wl-kicker-sep" aria-hidden="true">·</span>
                  <span>Bhubaneswar 2026</span>
                </span>
              </p>
              <h1 id="welcome-hero-title" className="wl-display wl-display--hero">
                <span className="wl-display-lead"><MaskWords text="Wisdom, passed on." /></span>{" "}
                <span className="wl-display-soft">
                  <MaskWords text="One mentor, one student, one clear" from={3} />{" "}
                  <span className="wl-mask wl-mask--accent">
                    <em className="wl-mw" style={{ "--w": 9 }}>path.</em>
                  </span>
                </span>
              </h1>
              <div className="wl-lede wl-anim" style={{ "--i": 4 }}>
                <p className="wl-lede-main">
                  Welcome to <strong>AYURDISHA</strong> — the Meet the Mentors hall of WAC 2026.
                </p>
                <p className="wl-lede-sub">
                  Senior mentors guide your next step — online, and live 1:1 for selected
                  students in Bhubaneswar.
                </p>
              </div>
              <ul className="wl-pills wl-anim" style={{ "--i": 5 }} aria-label="Who AYURDISHA is for">
                {AUDIENCE.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              <div className="wl-actions wl-actions--hero" data-welcome-stop>
                {nextButton("Take the tour")}
                <button
                  type="button"
                  className="wl-textlink wl-anim"
                  style={{ "--i": 6 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    enterHome();
                  }}
                >
                  Skip to AYURDISHA
                  <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
              <dl className="wl-facts">
                {HERO_FACTS.map((f, i) => (
                  <div key={f.label} className="wl-anim" style={{ "--i": 8 + i }}>
                    <dt>{f.label}</dt>
                    <dd>
                      {f.count != null && <CountUp value={f.count} duration={1600} />}
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="wl-visual wl-visual--hero">
              <span className="wl-stage-glow" aria-hidden="true" />
              <div className="wl-depth wl-depth--back" aria-hidden="true">
                <Rings className="wl-rings" />
                <span className="wl-keyline" />
              </div>
              <div className="wl-depth wl-depth--media">
                <figure className="wl-media ed-media wl-curtain">
                  <img
                    src="/assets/welcome/welcome-hero.png"
                    alt="A senior vaidya guides a young Ayurveda student across a carved table on a sunlit veranda"
                    width={1280}
                    height={720}
                    fetchPriority="high"
                  />
                </figure>
              </div>
              <Sprig className="wl-sprig" />
              <div className="wl-depth wl-depth--front">
                <p className="wl-tag wl-tag--mentee">
                  <span className="wl-tag-label">Mentee</span>
                  BAMS student
                </p>
                <p className="wl-tag wl-tag--mentor">
                  <span className="wl-tag-label">Mentor</span>
                  Senior vaidya
                </p>
                <p className="wl-float-chip">
                  <span className="wl-dot" aria-hidden="true" />
                  Live 1:1 · selected students at WAC 2026
                </p>
              </div>
            </div>
          </article>
        )}

        {/* Slide 2 — What you can do */}
        {index === 1 && (
          <article key="s2" className={`${slideClass} wl-stack`} aria-labelledby="welcome-features-title">
            <header className="wl-head wl-head--split">
              <div>
                <p className="wl-eyebrow wl-anim" style={{ "--i": 0 }}>What you can do</p>
                <h2 id="welcome-features-title" className="wl-title wl-anim" style={{ "--i": 1 }}>
                  Four doors on the <em>digital floor.</em>
                </h2>
              </div>
              <p className="wl-lead wl-anim" style={{ "--i": 2 }}>
                Hall, Mentors, Ask, and Track — plus live 1-on-1 mentor talks at
                Bhubaneswar for selected students.
              </p>
            </header>
            <ul className="wl-cards">
              {FEATURES.map((f, i) => {
                const Icon = f.Icon;
                return (
                  <li key={f.id} className="wl-card wl-anim" style={{ "--i": i + 2 }}>
                    <div className="wl-card-media ed-media" aria-hidden="true">
                      <img src={f.image} alt="" width={640} height={640} />
                    </div>
                    <div className="wl-card-body">
                      <span className="wl-card-icon" aria-hidden="true">
                        <Icon size={17} strokeWidth={1.8} />
                      </span>
                      <h3>{f.title}</h3>
                      <p>{f.how}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="wl-foot-row">
              <aside className="wl-note wl-anim" style={{ "--i": 6 }} aria-label={LIVE_1ON1.title}>
                <MapPin size={16} strokeWidth={1.8} aria-hidden="true" />
                <p>
                  <strong>{LIVE_1ON1.badge}</strong>
                  {LIVE_1ON1.title} — selection-based, arranged by our Meet the Mentors team.
                </p>
              </aside>
              <div className="wl-actions" data-welcome-stop>{nextButton()}</div>
            </div>
          </article>
        )}

        {/* Slide 3 — How to use */}
        {index === 2 && (
          <article key="s3" className={`${slideClass} wl-stack`} aria-labelledby="welcome-steps-title">
            <header className="wl-head wl-head--split">
              <div>
                <p className="wl-eyebrow wl-anim" style={{ "--i": 0 }}>How to use AYURDISHA</p>
                <h2 id="welcome-steps-title" className="wl-title wl-anim" style={{ "--i": 1 }}>
                  Your first-visit <em>path.</em>
                </h2>
              </div>
              <p className="wl-lead wl-anim" style={{ "--i": 2 }}>
                Hall, register, ticket, track — then follow your written reply online.
              </p>
            </header>
            <ol className="wl-steps">
              {STEPS.map((s, i) => (
                <li key={s.n} className="wl-step wl-anim" style={{ "--i": i + 2 }}>
                  <span className="wl-step-n" aria-hidden="true">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="wl-foot-row">
              <aside className="wl-note wl-anim" style={{ "--i": 6 }} aria-label={LIVE_1ON1.pathTitle}>
                <Users size={16} strokeWidth={1.8} aria-hidden="true" />
                <p>
                  <strong>{LIVE_1ON1.badge}</strong>
                  {LIVE_1ON1.pathBody}
                </p>
              </aside>
              <div className="wl-actions" data-welcome-stop>{nextButton()}</div>
            </div>
          </article>
        )}

        {/* Slide 4 — Congress + trust */}
        {index === 3 && (
          <article key="s4" className={`${slideClass} wl-split wl-split--trust`} aria-labelledby="welcome-trust-title">
            <div className="wl-copy">
              <p className="wl-eyebrow wl-anim" style={{ "--i": 0 }}>Congress &amp; trust</p>
              <h2 id="welcome-trust-title" className="wl-title wl-anim" style={{ "--i": 1 }}>
                Built for WAC <em>Bhubaneswar.</em>
              </h2>
              <p className="wl-lead wl-anim" style={{ "--i": 2 }}>
                Career clarity online — and for selected students, live one-to-one mentor
                talks on the Congress floor, facilitated by the AYURDISHA Meet the Mentors team.
              </p>
              <ul className="wl-trust">
                {TRUST_POINTS.map((p, i) => (
                  <li
                    key={p.title}
                    className={`wl-anim${p.highlight ? " is-highlight" : ""}`}
                    style={{ "--i": i + 3 }}
                  >
                    <h3>{p.title}</h3>
                    <p>{p.body}</p>
                  </li>
                ))}
              </ul>
              <p className="wl-fine wl-anim" style={{ "--i": 6 }}>
                Career and education guidance for Congress delegates — not medical advice or treatment.
              </p>
              <div className="wl-actions" data-welcome-stop>{nextButton()}</div>
            </div>
            <div className="wl-visual wl-visual--tall wl-anim-media">
              <span className="wl-keyline" aria-hidden="true" />
              <figure className="wl-media ed-media">
                <img
                  src="/assets/welcome/welcome-congress.webp"
                  alt="Mentor and student in a one-to-one Meet the Mentors career conversation"
                  width={864}
                  height={1152}
                />
              </figure>
            </div>
          </article>
        )}

        {/* Slide 5 — Finale */}
        {index === 4 && (
          <FinaleSlide
            key="s5"
            slideClass={slideClass}
            onEnter={enterHome}
            onAsk={askFromWelcome}
            onTrack={trackFromWelcome}
            onCard={openFromFinale}
          />
        )}
      </div>

      <footer className="wl-footer" data-welcome-stop>
        <div className="wl-progress" role="tablist" aria-label="Welcome orientation progress">
          {SLIDE_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={label}
              className={`wl-seg${i === index ? " is-active" : ""}${i < index ? " is-done" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (i === index) return;
                goTo(i, i > index ? 1 : -1);
              }}
            >
              <span className="wl-seg-bar" />
            </button>
          ))}
        </div>
        {!isLast && (
          <p className="wl-tap-hint" aria-hidden="true">
            Tap anywhere to continue
          </p>
        )}
      </footer>
    </div>
  );
}
