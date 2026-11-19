import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import Button, { MoreLink } from "../../components/ui/Button.jsx";
import { prefersReducedMotion, useHeroScroll } from "../../components/editorial/motion.js";
import { BRAND, WAC } from "../../content/site.js";
import { ASK_DESK, ASK_HREF, ASK_KICKER, AUDIENCE } from "../../content/glossary.js";
import "../../styles/home-hero.css";

const SLIDE_MS = 7000;

/** Full-bleed cinematic slides — project imagery only; feel adapted from congress heroes. */
const SLIDES = [
  {
    id: "hall",
    alt: "A senior Ayurveda mentor talks with three young students at a lamp-lit oak table in a carved sandstone hall, a Kalinga temple spire glowing through the arches at golden hour",
    src: "/assets/home/hero-hall",
    mobile: "/assets/home/hero-hall-m",
    hasJpg: true,
    pos: "62% 50%",
    pan: { x: "-1.2%", y: "-0.6%" },
  },
  {
    id: "place",
    alt: "Warm daylight on carved Odisha temple stonework in Bhubaneswar, the host city of the 11th World Ayurveda Congress",
    src: "/assets/sections/bhubaneswar-temple",
    hasJpg: true,
    pos: "50% 42%",
    pan: { x: "1.4%", y: "0.5%" },
  },
  {
    id: "congress",
    alt: "Delegates and mentors gathering in a warm congress hall during the World Ayurveda Congress",
    src: "/assets/sections/hall-wac",
    hasJpg: false,
    pos: "48% 45%",
    pan: { x: "-0.8%", y: "1%" },
  },
];

const COUNT = SLIDES.length;

export default function HomeHero({ onAsk }) {
  const ref = useRef(null);
  const liveId = useId();
  useHeroScroll(ref);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [loaded, setLoaded] = useState(() => new Set([0, 1]));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const on = mq.matches || prefersReducedMotion();
      setReduced(on);
      if (on) {
        setPlaying(false);
        setIndex(0);
      }
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const go = useCallback((next) => {
    const i = ((next % COUNT) + COUNT) % COUNT;
    setIndex(i);
    setLoaded((prev) => {
      const upcoming = (i + 1) % COUNT;
      if (prev.has(i) && prev.has(upcoming)) return prev;
      const n = new Set(prev);
      n.add(i);
      n.add(upcoming);
      return n;
    });
  }, []);

  const autoplay = playing && !held && !reduced;

  useEffect(() => {
    if (!autoplay) return undefined;
    const t = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, index, go]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        go(index - 1);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [index, go]);

  const progressKey = `${index}-${autoplay ? "run" : "pause"}`;

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
                  "--hx-ms": `${SLIDE_MS + 1800}ms`,
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
                  onClick={() => {
                    setPlaying(false);
                    go(i);
                  }}
                >
                  {i === index && autoplay && (
                    <span key={progressKey} className="hx-dot-progress" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="hx-pause"
              aria-label={playing ? "Pause slideshow" : "Play slideshow"}
              aria-pressed={!playing}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Pause" : "Play"}
            </button>
          </div>
        )}

        <p id={liveId} className="hx-live" aria-live="polite">
          Slide {index + 1} of {COUNT}
        </p>
      </div>
    </section>
  );
}
