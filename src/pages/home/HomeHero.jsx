import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import Button, { MoreLink } from "../../components/ui/Button.jsx";
import { prefersReducedMotion, useHeroScroll } from "../../components/editorial/motion.js";
import { BRAND, WAC } from "../../content/site.js";
import { ASK_DESK, ASK_HREF, ASK_KICKER, AUDIENCE } from "../../content/glossary.js";
import "../../styles/home-hero.css";

/** Dwell between advances — snappy so crossfade + Ken Burns are felt (3.5–4.5s band). */
const SLIDE_MS = 4000;
const FADE_MS = 750;

/** Full-bleed cinematic slides — strongest project imagery only. */
const SLIDES = [
  {
    id: "mentors",
    alt: "A senior Ayurveda mentor talks with three young students at a lamp-lit oak table in a carved sandstone hall, a Kalinga temple spire glowing through the arches at golden hour",
    src: "/assets/home/hero-hall",
    mobile: "/assets/home/hero-hall-m",
    hasJpg: true,
    pos: "62% 50%",
    pan: { x: "-2.8%", y: "-1.4%" },
  },
  {
    id: "hall",
    alt: "A long Meet the Mentors hall lined with carved pillars and marigold garlands, mentors and students at lamp-lit tables facing a temple spire in golden haze",
    src: "/assets/slides/slide-hall",
    hasJpg: true,
    pos: "50% 45%",
    pan: { x: "0%", y: "-2.6%" },
  },
  {
    id: "place",
    alt: "Warm daylight on carved Odisha temple stonework reflected in a still tank in Bhubaneswar, the host city of the 11th World Ayurveda Congress",
    src: "/assets/sections/bhubaneswar-temple",
    hasJpg: true,
    pos: "42% 40%",
    pan: { x: "3.0%", y: "0.8%" },
  },
  {
    id: "threshold",
    alt: "A young Ayurveda student at a marigold-draped temple doorway, holding a letter as a Kalinga spire glows in the sunset beyond",
    src: "/assets/slides/slide-track",
    hasJpg: true,
    pos: "58% 42%",
    pan: { x: "-2.4%", y: "1.2%" },
  },
];

const COUNT = SLIDES.length;

export default function HomeHero({ onAsk }) {
  const ref = useRef(null);
  const liveId = useId();
  useHeroScroll(ref);

  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set([0, 1]));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const on = mq.matches || prefersReducedMotion();
      setReduced(on);
      if (on) setIndex(0);
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const go = useCallback((next) => {
    const i = ((next % COUNT) + COUNT) % COUNT;
    setIndex(i);
    setTick((t) => t + 1);
    setLoaded((prev) => {
      const upcoming = (i + 1) % COUNT;
      if (prev.has(i) && prev.has(upcoming)) return prev;
      const n = new Set(prev);
      n.add(i);
      n.add(upcoming);
      return n;
    });
  }, []);

  const autoplay = !held && !reduced;

  useEffect(() => {
    if (!autoplay) return undefined;
    const t = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, index, go]);

  /* Restart Ken Burns on each advance (Safari keeps finished animations otherwise). */
  useEffect(() => {
    if (reduced) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const img = root.querySelector(".hx-slide.is-active .hx-media img");
    if (!img) return undefined;
    img.style.animation = "none";
    // Force reflow so the next animation frame actually restarts.
    void img.offsetWidth;
    img.style.animation = "";
    return undefined;
  }, [index, tick, reduced]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [index, go]);

  const progressKey = `${index}-${tick}-${autoplay ? "run" : "pause"}`;

  return (
    <section
      className={`hx${reduced ? " is-reduced" : ""}${held ? " is-held" : ""}${autoplay ? " is-playing" : ""}`}
      aria-roledescription="carousel"
      aria-labelledby="hero-title"
      aria-describedby={liveId}
      tabIndex={0}
      ref={ref}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
      style={{ "--hx-slide-ms": `${SLIDE_MS}ms`, "--hx-fade": `${FADE_MS}ms` }}
    >
      <div className="hx-stage ui-dark">
        <div className="hx-slides" aria-live="off">
          {SLIDES.map((s, i) => {
            const active = i === index;
            const show = loaded.has(i) || active;
            return (
              <div
                key={s.id}
                className={`hx-slide${active ? " is-active" : ""}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${COUNT}`}
                aria-hidden={!active}
                inert={!active || undefined}
                style={{
                  "--hx-pos": s.pos,
                  "--hx-pan-x": s.pan.x,
                  "--hx-pan-y": s.pan.y,
                }}
              >
                <div className="hx-media" aria-hidden={!active}>
                  {show && (
                    <picture>
                      {s.mobile && (
                        <>
                          <source media="(max-width: 767px)" srcSet={`${s.mobile}.webp`} type="image/webp" />
                          {s.hasJpg && (
                            <source media="(max-width: 767px)" srcSet={`${s.mobile}.jpg`} />
                          )}
                        </>
                      )}
                      <source srcSet={`${s.src}.webp`} type="image/webp" />
                      {s.hasJpg && <source srcSet={`${s.src}.jpg`} />}
                      <img
                        src={s.hasJpg ? `${s.src}.jpg` : `${s.src}.webp`}
                        alt={active ? s.alt : ""}
                        width={1920}
                        height={1080}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={i === 0 ? "high" : "low"}
                        draggable={false}
                      />
                    </picture>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <span className="hx-scrim" aria-hidden="true" />

        <div className="hx-inner">
          <div className="hx-copy">
            <p className="hx-brand hx-rise" style={{ "--i": 0 }}>
              <span className="hx-brand-word">{BRAND.name}</span>
              <span className="hx-brand-tag">{BRAND.tagline}</span>
            </p>

            <p className="hx-eyebrow hx-rise" style={{ "--i": 1 }}>
              <span>{WAC.edition} World Ayurveda Congress</span>
              <span className="hx-eyebrow-sep" aria-hidden="true">·</span>
              <span>10–13 Dec {WAC.year}</span>
              <span className="hx-eyebrow-sep" aria-hidden="true">·</span>
              <span>
                {WAC.venue}, {WAC.city}
              </span>
            </p>

            <h1 id="hero-title" className="hx-title hx-rise" style={{ "--i": 2 }}>
              <span className="hx-line">Meet the minds</span>{" "}
              <span className="hx-line">
                shaping <em className="hx-accent">Ayurveda.</em>
              </span>
            </h1>

            <p className="hx-sub hx-rise" style={{ "--i": 3 }}>
              The Meet the Mentors hall of WAC {WAC.year}. Career guidance from senior Ayurveda mentors for {AUDIENCE}.
            </p>

            <div className="hx-actions hx-rise" style={{ "--i": 4 }}>
              <Link to={ASK_HREF} onClick={onAsk} className="hx-ask" data-ask-cta="">
                <span className="hx-ask-icon" aria-hidden="true">
                  <MessageCircleQuestion size={19} strokeWidth={2} />
                </span>
                <span className="hx-ask-text">
                  <span className="hx-ask-kicker">{ASK_KICKER}</span>{" "}
                  <span className="hx-ask-label">{ASK_DESK}</span>
                </span>
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" className="hx-ask-arrow" />
              </Link>
              <div className="hx-secondary">
                <Button to="/mentors" variant="on-dark-secondary" className="hx-btn-secondary">
                  Explore mentors
                </Button>
                <MoreLink to="/about" onDark className="hx-more">
                  About AYURDISHA
                </MoreLink>
              </div>
            </div>
          </div>
        </div>

        {!reduced && (
          <div className="hx-chrome">
            <div className="hx-dots" role="tablist" aria-label="Hero slides">
              {SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  className={`hx-dot${i === index ? " is-active" : ""}`}
                  aria-label={`Show slide ${i + 1}`}
                  aria-selected={i === index}
                  onClick={() => go(i)}
                >
                  {i === index && autoplay && (
                    <span key={progressKey} className="hx-dot-progress" aria-hidden="true" />
                  )}
                  {i === index && !autoplay && <span className="hx-dot-progress is-frozen" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <p id={liveId} className="hx-live" aria-live="polite">
          Slide {index + 1} of {COUNT}
        </p>
      </div>
    </section>
  );
}
