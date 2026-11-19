import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { ASK_PROMPTS } from "../content/askPrompts.js";
import { MENTORS, mentorsWithNames } from "../mentors.js";
import { setPageMeta, SITE_ORIGIN } from "../siteMeta.js";
import { hasSeenWelcome, markWelcomeSeen } from "../welcomeStorage.js";
import { SLIDES } from "../welcome/slides.js";
import {
  classifyPointer,
  HOLD_MS,
  initialState,
  initialWheel,
  isRunning,
  isSwipe,
  keyAction,
  reduce,
  stepWheel,
  TAP_MAX_MOVE,
} from "../welcome/deckMachine.js";
import { trackWelcome } from "../welcome/welcomeAnalytics.js";
import "../styles/welcome.css";

const MENTOR_COUNT = mentorsWithNames(MENTORS).length;
const COUNT = SLIDES.length;
const NO_TAP = 'a, button, input, textarea, select, [role="button"], [data-wl-no-tap]';
const HINT_DELAY_MS = 1200;
const EXIT_MS = 320;

function useMedia(query) {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setOn(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return on;
}

function focusHeroTitle() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const h = document.getElementById("hero-title");
    if (!h) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  }));
}

/** Headline words rising out of a clipping mask, one after another. */
function MaskWords({ text, from = 0 }) {
  return text.split(" ").map((w, i, all) => (
    <React.Fragment key={`${w}-${i}`}>
      <span className="wl2-mask"><span className="wl2-word" style={{ "--w": from + i }}>{w}</span></span>
      {i < all.length - 1 ? " " : null}
    </React.Fragment>
  ));
}

function SlideDetail({ kind }) {
  if (kind === "badge") {
    return (
      <div className="wl2-detail wl2-badge wl2-anim" style={{ "--i": 4 }} aria-label="AYURDISHA pass number format: 11WAC/2026/ followed by four digits">
        <span className="wl2-detail-label">Your AYURDISHA pass number</span>
        <span className="wl2-badge-num" aria-hidden="true">11WAC/2026/<span>NNNN</span></span>
        <span className="wl2-detail-note">Issued on email verification · WAC delegates see their Delegate ID</span>
      </div>
    );
  }
  if (kind === "question") {
    return (
      <figure className="wl2-detail wl2-qcard wl2-anim" style={{ "--i": 4 }}>
        <figcaption className="wl2-detail-label">A question students ask</figcaption>
        <blockquote>{ASK_PROMPTS[1].text}</blockquote>
        <span className="wl2-detail-note">{ASK_PROMPTS[1].theme}</span>
      </figure>
    );
  }
  if (kind === "merge") {
    return (
      <div className="wl2-detail wl2-merge wl2-anim" style={{ "--i": 4 }} role="img" aria-label="Up to seven similar questions grouped into one answer">
        <span className="wl2-merge-dots" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => <span key={i} style={{ "--d": i }} />)}
        </span>
        <span className="wl2-merge-arrow" aria-hidden="true"><ArrowRight size={18} strokeWidth={2} /></span>
        <span className="wl2-merge-one" aria-hidden="true" />
        <span className="wl2-detail-note">Up to 7 questions · 1 answer</span>
      </div>
    );
  }
  if (kind === "mentors") {
    return (
      <p className="wl2-detail wl2-stat wl2-anim" style={{ "--i": 4 }}>
        <span className="wl2-stat-num">{MENTOR_COUNT}</span>
        <span className="wl2-stat-text">WAC mentors</span>
      </p>
    );
  }
  return null;
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const replay = new URLSearchParams(location.search).get("replay") === "1";
  const [bounce] = useState(() => !replay && hasSeenWelcome());
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const coarse = useMedia("(pointer: coarse)");
  const fine = useMedia("(pointer: fine)");

  const [state, dispatch] = useReducer(reduce, undefined, () =>
    initialState({ count: COUNT, reducedMotion, showHint: !replay }),
  );
  const [leaving, setLeaving] = useState(-1);
  const [maxSeen, setMaxSeen] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [exiting, setExiting] = useState(false);

  const rootRef = useRef(null);
  const ctaRef = useRef(null);
  const nextBtnRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const startedAt = useRef(0);
  const pointer = useRef(null);
  const wheel = useRef(initialWheel());
  const leaveTimer = useRef(0);
  const exitingRef = useRef(false);
  const focusCta = useRef(false);
  const lastFocus = useRef(null);

  const { index, nudge } = state;
  const last = index === COUNT - 1;
  const running = isRunning(state);

  useEffect(() => {
    if (bounce) navigate("/", { replace: true });
  }, [bounce, navigate]);

  useEffect(() => {
    dispatch({ type: "REDUCED_MOTION", on: reducedMotion });
  }, [reducedMotion]);

  useEffect(() => {
    setPageMeta({
      title: "Welcome · AYURDISHA · Meet the Mentors · WAC 2026",
      description:
        "Orient yourself in AYURDISHA — the digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026.",
      path: "/welcome",
      image: `${SITE_ORIGIN}/assets/slides/slide-hall.jpg`,
    });
  }, []);

  useEffect(() => {
    if (bounce) return undefined;
    startedAt.current = performance.now();
    trackWelcome("welcome_view", { replay });
    const html = document.documentElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    html.classList.add("wl2-lock");
    const onVis = () => dispatch({ type: "VISIBILITY", hidden: document.hidden });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.body.style.overflow = prevOverflow;
      html.classList.remove("wl2-lock");
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(leaveTimer.current);
    };
  }, [bounce, replay]);

  const elapsed = () => Math.round(performance.now() - startedAt.current);

  const finish = useCallback((completed) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    markWelcomeSeen({ completed });
    if (completed) trackWelcome("welcome_enter", { ms: elapsed(), replay });
    else trackWelcome("welcome_skip", { index: stateRef.current.index, ms: elapsed() });
    const go = () => {
      navigate("/", { replace: true });
      window.scrollTo(0, 0);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      go();
      focusHeroTitle();
      return;
    }
    if (typeof document.startViewTransition === "function") {
      try {
        const t = document.startViewTransition(() => flushSync(go));
        t.finished.finally(focusHeroTitle);
        return;
      } catch {
        /* fall through to the fade */
      }
    }
    setExiting(true);
    window.setTimeout(() => { go(); focusHeroTitle(); }, EXIT_MS);
  }, [navigate, replay]);

  const act = useCallback((kind, method) => {
    if (exitingRef.current) return;
    const s = stateRef.current;
    switch (kind) {
      case "next":
      case "nudge":
        if ((method === "key" || method === "button") && s.index === COUNT - 2) focusCta.current = true;
        dispatch({ type: "NEXT", source: method });
        break;
      case "prev":
        dispatch({ type: "PREV", source: method });
        break;
      case "first":
        dispatch({ type: "GOTO", index: 0, source: method });
        break;
      case "last":
        if (method === "key") focusCta.current = true;
        dispatch({ type: "GOTO", index: COUNT - 1, source: method });
        break;
      case "pause":
        if (s.index === COUNT - 1 || s.reducedMotion) break;
        if (s.playing) trackWelcome("welcome_pause", { method });
        dispatch({ type: "TOGGLE_PLAY" });
        break;
      case "skip":
        finish(false);
        break;
      default:
    }
  }, [finish]);

  // Side effects of an index change: crossfade bookkeeping, announcement, analytics.
  useEffect(() => {
    const nav = state.nav;
    if (!nav) return;
    setLeaving(nav.from);
    setMaxSeen((m) => Math.max(m, nav.to));
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(-1), 1000);
    const s = SLIDES[nav.to];
    if (nav.source !== "auto") setAnnounce(`Slide ${nav.to + 1} of ${COUNT}. ${s.lead} ${s.accent}`);
    trackWelcome("welcome_slide", { index: nav.to, method: nav.source });
    if (nav.to === COUNT - 1) trackWelcome("welcome_complete", { ms: elapsed() });
  }, [state.nav]);

  // Keep focus somewhere sensible when the focused control is hidden or its slide goes inert.
  useLayoutEffect(() => {
    const lf = lastFocus.current;
    const lost = lf && (!lf.isConnected || lf.closest("[hidden], [inert]"));
    if (last && (focusCta.current || lost)) ctaRef.current?.focus({ preventScroll: true });
    else if (lost) nextBtnRef.current?.focus({ preventScroll: true });
    focusCta.current = false;
  }, [index, last]);

  useEffect(() => {
    if (state.hintDismissed || index !== 0) return undefined;
    const t = window.setTimeout(() => dispatch({ type: "SHOW_HINT" }), HINT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [state.hintDismissed, index]);

  useEffect(() => {
    const nextSlide = SLIDES[index + 1];
    if (!nextSlide) return;
    const img = new Image();
    img.src = `${nextSlide.img}.webp`;
    img.decode?.().catch(() => {});
  }, [index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || (e.repeat && e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const kind = keyAction({
        key: e.key,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        onControl: !!t?.closest("button, a, [role='button']"),
        inField: !!t?.closest("input, textarea, select, [contenteditable='true']"),
        isLast: stateRef.current.index === COUNT - 1,
      });
      if (!kind) return;
      e.preventDefault();
      act(kind, "key");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !fine) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey) return;
      const { gate, action } = stepWheel(wheel.current, {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        now: performance.now(),
        pageHeight: window.innerHeight,
      });
      wheel.current = gate;
      if (action) act(action, "wheel");
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => el.removeEventListener("wheel", onWheel);
  }, [act, fine]);

  const releasePointer = () => {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return null;
    window.clearTimeout(p.timer);
    return p;
  };

  const onPointerDown = (e) => {
    if (!e.isPrimary || e.button !== 0 || exitingRef.current) return;
    if (e.target instanceof Element && e.target.closest(NO_TAP)) return;
    releasePointer();
    const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), held: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (pointer.current !== p) return;
      p.held = true;
      dispatch({ type: "HOLD_START" });
      if (isRunning(stateRef.current)) trackWelcome("welcome_pause", { method: "hold" });
    }, HOLD_MS);
    pointer.current = p;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  };

  const onPointerMove = (e) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId || p.held) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) >= TAP_MAX_MOVE) window.clearTimeout(p.timer);
  };

  const onPointerUp = (e) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    releasePointer();
    if (p.held) {
      dispatch({ type: "HOLD_END" });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const kind = classifyPointer({
      dx,
      dy,
      dt: performance.now() - p.t0,
      x: e.clientX - rect.left,
      width: rect.width,
      isFirst: stateRef.current.index === 0,
      isLast: stateRef.current.index === COUNT - 1,
    });
    if (kind === "next" || kind === "prev" || kind === "nudge") act(kind, isSwipe({ dx, dy }) ? "swipe" : "tap");
  };

  const onPointerCancel = (e) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    releasePointer();
    if (p.held) dispatch({ type: "HOLD_END" });
  };

  const onContextMenu = (e) => {
    if (coarse && !(e.target instanceof Element && e.target.closest("a"))) e.preventDefault();
  };

  const onFocus = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    lastFocus.current = t;
    if (t.closest(".wl2-content") && t.matches(":focus-visible")) dispatch({ type: "FOCUS_HOLD", on: true });
  };
  const onBlur = (e) => {
    const to = e.relatedTarget;
    if (!(to instanceof HTMLElement) || !to.closest(".wl2-content")) dispatch({ type: "FOCUS_HOLD", on: false });
  };

  if (bounce) return null;

  const hintText = coarse ? "Tap to continue" : null;
  const classes = [
    "wl2",
    running && "is-running",
    state.held && "is-held",
    last && "is-last",
    exiting && "is-exiting",
  ].filter(Boolean).join(" ");

  return (
    <section
      ref={rootRef}
      className={classes}
      aria-roledescription="carousel"
      aria-label="Welcome to AYURDISHA. Use the arrow keys or the next button to continue."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <p className="wl2-brand wl2-chrome">
        <span className="wl2-brand-word">AYURDISHA</span>
        <span className="wl2-brand-kicker">Meet the Mentors · WAC 2026</span>
      </p>

      <div className="wl2-top-actions wl2-chrome">
        <button
          type="button"
          className="wl2-round wl2-pause"
          aria-label={state.playing ? "Pause slideshow" : "Play slideshow"}
          aria-pressed={!state.playing}
          hidden={last || state.reducedMotion}
          onClick={() => act("pause", "button")}
        >
          {state.playing
            ? <Pause size={16} strokeWidth={2.2} aria-hidden="true" />
            : <Play size={16} strokeWidth={2.2} aria-hidden="true" />}
        </button>
        <button type="button" className="wl2-skip" hidden={last} onClick={() => act("skip", "button")}>
          Skip
        </button>
      </div>

      <div className="wl2-stage">
        <span className="wl2-zone wl2-zone--prev" aria-hidden="true" />
        <span className="wl2-zone wl2-zone--next" aria-hidden="true" />
        {SLIDES.map((s, i) => {
          const active = i === index;
          const loaded = i <= maxSeen + 1;
          const Title = i === 0 ? "h1" : "h2";
          const leadWords = s.lead.split(" ").length;
          const ms = s.ms ?? 8000;
          return (
            <div
              key={s.id}
              className={`wl2-slide wl2-slide--${s.id}${active ? " is-active" : ""}${i === leaving ? " is-leaving" : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${COUNT}`}
              aria-hidden={!active}
              inert={!active}
              style={{
                "--kb-x": s.pan.x,
                "--kb-y": s.pan.y,
                "--kb-ms": `${ms + 2400}ms`,
                "--pos-d": s.pos.d,
                "--pos-m": s.pos.m,
              }}
            >
              <div className="wl2-media" aria-hidden="true">
                {loaded && (
                  <picture>
                    {s.hasPortrait && (
                      <source media="(max-aspect-ratio: 4/5)" srcSet={`${s.img}-m.webp`} type="image/webp" />
                    )}
                    <source srcSet={`${s.img}.webp`} type="image/webp" />
                    <img
                      src={`${s.img}.jpg`}
                      alt=""
                      width={1920}
                      height={1080}
                      draggable={false}
                      decoding="async"
                      fetchPriority={i === 0 ? "high" : undefined}
                    />
                  </picture>
                )}
              </div>
              <span className="wl2-scrim" aria-hidden="true" />

              <div className="wl2-content">
                <p className="wl2-kicker wl2-anim" style={{ "--i": 0 }}>{s.kicker}</p>
                <Title className="wl2-title">
                  <MaskWords text={s.lead} />{" "}
                  <span className="wl2-mask wl2-mask--accent">
                    <em className="wl2-word" style={{ "--w": leadWords }}>{s.accent}</em>
                  </span>
                </Title>
                <p className="wl2-support wl2-anim" style={{ "--i": 3 }}>{s.support}</p>

                {s.detail && <SlideDetail kind={s.detail} />}

                {i === 0 && (
                  <p className={`wl2-hint${state.hintVisible ? " is-visible" : ""}`} aria-hidden="true">
                    {hintText ? (
                      <>
                        <span>{hintText}</span>
                        <ChevronRight className="wl2-hint-chev" size={16} strokeWidth={2.4} />
                      </>
                    ) : (
                      <span>Click or press <kbd className="wl2-hint-key">→</kbd> to continue</span>
                    )}
                  </p>
                )}

                {s.finale && (
                  <>
                    <div className="wl2-actions wl2-anim" style={{ "--i": 5 }}>
                      <button
                        ref={ctaRef}
                        type="button"
                        className={`wl2-btn wl2-btn--primary wl2-enter${nudge ? ` is-nudge-${nudge % 2 ? "a" : "b"}` : ""}`}
                        onClick={() => finish(true)}
                      >
                        Enter AYURDISHA
                        <ArrowRight size={18} strokeWidth={2.1} aria-hidden="true" />
                      </button>
                    </div>
                    <p className="wl2-fine wl2-anim" style={{ "--i": 6 }}>
                      Career and education guidance only — not medical advice.
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ol className="wl2-progress wl2-chrome" aria-label="Slides">
        {SLIDES.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`wl2-seg${i === index ? " is-active" : ""}${i < index || last ? " is-done" : ""}`}
              aria-label={`Go to slide ${i + 1} of ${COUNT}: ${s.chapter}`}
              aria-current={i === index ? "step" : undefined}
              onClick={() => dispatch({ type: "GOTO", index: i, source: "bar" })}
            >
              <span className="wl2-seg-label" aria-hidden="true">{s.chapter}</span>
              <span className="wl2-seg-track" aria-hidden="true">
                <span
                  className="wl2-seg-fill"
                  style={i === index && SLIDES[i].ms ? { "--slide-ms": `${SLIDES[i].ms}ms` } : undefined}
                  onAnimationEnd={i === index ? (e) => {
                    if (e.animationName === "wl2-fill") dispatch({ type: "TICK_END" });
                  } : undefined}
                />
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wl2-nav wl2-chrome">
        <button
          type="button"
          className="wl2-round"
          aria-label="Previous slide"
          aria-disabled={index === 0 || undefined}
          onClick={() => act("prev", "button")}
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          ref={nextBtnRef}
          type="button"
          className="wl2-round wl2-round--next"
          aria-label="Next slide"
          data-slide-next
          hidden={last}
          onClick={() => act("next", "button")}
        >
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <p className="wl2-sr" aria-live="polite" aria-atomic="true">{announce}</p>
    </section>
  );
}
