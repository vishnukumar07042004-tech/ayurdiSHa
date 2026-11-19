/**
 * Welcome deck: navigation reducer, story pointer classifier, key map, wheel gate and
 * show-once storage rules. Pure modules only (no JSX).
 */
import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPointer,
  initialState,
  initialWheel,
  isRunning,
  keyAction,
  reduce,
  stepWheel,
} from "../src/welcome/deckMachine.js";
import {
  hasSeenWelcome,
  markWelcomeSeen,
  shouldShowWelcome,
  welcomeShownThisSession,
  WELCOME_KEY,
  WELCOME_SESSION_KEY,
} from "../src/welcomeStorage.js";

const run = (s, ...actions) => actions.reduce(reduce, s);
const fresh = (over = {}) => ({ ...initialState({ count: 6 }), ...over });

describe("deck reducer", () => {
  test("next/prev stay in bounds; prev on slide 0 is a no-op", () => {
    const s = fresh();
    assert.equal(reduce(s, { type: "PREV", source: "tap" }), s);
    const s2 = run(s, { type: "NEXT", source: "tap" }, { type: "NEXT", source: "key" });
    assert.equal(s2.index, 2);
    assert.deepEqual(s2.nav, { from: 1, to: 2, source: "key" });
    assert.equal(run(s2, { type: "PREV", source: "swipe" }).index, 1);
    assert.equal(run(s, { type: "GOTO", index: 99, source: "bar" }).index, 5);
    assert.equal(run(s, { type: "GOTO", index: -3, source: "bar" }).index, 0);
  });

  test("NEXT on the last slide nudges instead of moving", () => {
    const end = run(fresh(), { type: "GOTO", index: 5, source: "key" });
    const n1 = reduce(end, { type: "NEXT", source: "tap" });
    assert.equal(n1.index, 5);
    assert.ok(n1.nudge);
    const n2 = reduce(n1, { type: "NEXT", source: "key" });
    assert.notEqual(n2.nudge, n1.nudge, "each nudge is distinguishable so the UI can re-pulse");
  });

  test("reaching the last slide completes the deck and stops playback", () => {
    let s = fresh();
    assert.equal(s.completed, false);
    for (let i = 0; i < 5; i++) s = reduce(s, { type: "TICK_END" });
    assert.equal(s.index, 5);
    assert.equal(s.completed, true);
    assert.equal(s.playing, false);
    assert.equal(isRunning(s), false);
    assert.equal(reduce(s, { type: "TICK_END" }), s);
    assert.equal(reduce(s, { type: "TOGGLE_PLAY" }), s, "pause is inert on the finale");
  });

  test("TICK_END advances only while running", () => {
    const s = fresh();
    assert.equal(reduce(s, { type: "TICK_END" }).index, 1);
    for (const blocked of [
      run(s, { type: "TOGGLE_PLAY" }),
      run(s, { type: "HOLD_START" }),
      run(s, { type: "VISIBILITY", hidden: true }),
      run(s, { type: "FOCUS_HOLD", on: true }),
      run(s, { type: "REDUCED_MOTION", on: true }),
      fresh({ reducedMotion: true }),
    ]) {
      assert.equal(isRunning(blocked), false);
      assert.equal(reduce(blocked, { type: "TICK_END" }).index, 0);
    }
    const resumed = run(s, { type: "HOLD_START" }, { type: "HOLD_END" });
    assert.equal(isRunning(resumed), true);
  });

  test("hint shows once on slide 1 and any user navigation dismisses it", () => {
    const s = run(fresh(), { type: "SHOW_HINT" });
    assert.equal(s.hintVisible, true);
    const moved = reduce(s, { type: "NEXT", source: "tap" });
    assert.equal(moved.hintVisible, false);
    assert.equal(moved.hintDismissed, true);
    const back = run(moved, { type: "PREV", source: "tap" }, { type: "SHOW_HINT" });
    assert.equal(back.hintVisible, false, "never re-shown after dismissal");
    assert.equal(run(s, { type: "DISMISS_HINT" }).hintVisible, false);
    const replay = initialState({ count: 6, showHint: false });
    assert.equal(reduce(replay, { type: "SHOW_HINT" }).hintVisible, false, "not shown on replay");
    const later = run(fresh(), { type: "NEXT", source: "auto" }, { type: "SHOW_HINT" });
    assert.equal(later.hintVisible, false, "only on slide 1");
  });
});

describe("classifyPointer", () => {
  const W = 1000;
  const tap = (x, extra = {}) => classifyPointer({ dx: 0, dy: 0, dt: 120, x, width: W, ...extra });

  test("tap zones split at 30 %", () => {
    assert.equal(tap(290, { isFirst: false }), "prev");
    assert.equal(tap(310, { isFirst: false }), "next");
    assert.equal(tap(900), "next");
  });

  test("left-zone tap on slide 1 goes forward (never a dead tap)", () => {
    assert.equal(tap(50, { isFirst: true }), "next");
  });

  test("right tap on the last slide nudges; left tap still goes back", () => {
    assert.equal(tap(800, { isLast: true }), "nudge");
    assert.equal(tap(100, { isLast: true }), "prev");
  });

  test("swipe thresholds and diagonal rejection", () => {
    const sw = (dx, dy = 0) => classifyPointer({ dx, dy, dt: 200, x: 500, width: W });
    assert.equal(sw(-47), "none");
    assert.equal(sw(-48), "next");
    assert.equal(sw(48), "prev");
    assert.equal(sw(-60, 45), "none", "too diagonal (needs |dx| > 1.5·|dy|)");
    assert.equal(sw(-60, 30), "next");
    assert.equal(sw(0, -120), "none", "vertical drags do nothing");
    assert.equal(classifyPointer({ dx: 48, dy: 0, dt: 200, x: 500, width: W, isFirst: true }), "none");
    assert.equal(classifyPointer({ dx: -80, dy: 0, dt: 200, x: 500, width: W, isLast: true }), "nudge");
  });

  test("press ≥ 300 ms without moving is a hold, never navigation", () => {
    assert.equal(tap(800, { dt: 299 }), "next");
    assert.equal(tap(800, { dt: 300 }), "hold");
    assert.equal(tap(100, { dt: 900 }), "hold");
  });

  test("small jitter is still a tap; mid-size drags are ignored", () => {
    assert.equal(classifyPointer({ dx: 6, dy: 5, dt: 100, x: 800, width: W }), "next");
    assert.equal(classifyPointer({ dx: 20, dy: 0, dt: 100, x: 800, width: W }), "none");
  });
});

describe("keyAction", () => {
  const k = (key, extra = {}) => keyAction({ key, ...extra });
  test("map", () => {
    for (const key of ["ArrowRight", "PageDown", " ", "Enter"]) assert.equal(k(key), "next", key);
    for (const key of ["ArrowLeft", "PageUp"]) assert.equal(k(key), "prev", key);
    assert.equal(k("Home"), "first");
    assert.equal(k("End"), "last");
    assert.equal(k("Escape"), "skip");
    assert.equal(k("Escape", { isLast: true }), null);
    for (const key of ["k", "K", "p", "P"]) assert.equal(k(key), "pause", key);
    assert.equal(k("x"), null);
  });
  test("Space/Enter defer to focused buttons; modifiers and fields are ignored", () => {
    assert.equal(k(" ", { onControl: true }), null);
    assert.equal(k("Enter", { onControl: true }), null);
    assert.equal(k("ArrowRight", { onControl: true }), "next");
    assert.equal(k("ArrowRight", { metaKey: true }), null);
    assert.equal(k("ArrowLeft", { altKey: true }), null);
    assert.equal(k("ArrowRight", { inField: true }), null);
  });
});

describe("wheel gate", () => {
  test("fires past the threshold, then ignores inertia for 900 ms", () => {
    let g = initialWheel();
    let r = stepWheel(g, { deltaY: 30, now: 1000 });
    assert.equal(r.action, null);
    r = stepWheel(r.gate, { deltaY: 25, now: 1016 });
    assert.equal(r.action, "next");
    r = stepWheel(r.gate, { deltaY: 200, now: 1500 });
    assert.equal(r.action, null, "locked");
    r = stepWheel(r.gate, { deltaX: -60, now: 2000 });
    assert.equal(r.action, "prev");
    g = initialWheel();
    assert.equal(stepWheel(g, { deltaY: 4, deltaMode: 1, now: 10 }).action, "next", "line mode ×16");
  });
  test("slow drift resets after idle", () => {
    let r = stepWheel(initialWheel(), { deltaY: 40, now: 0 });
    r = stepWheel(r.gate, { deltaY: 40, now: 1000 });
    assert.equal(r.action, null);
  });
});

describe("welcome storage", () => {
  const memory = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
    };
  };
  const throwing = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
    removeItem() { throw new Error("SecurityError"); },
  };
  beforeEach(() => {
    globalThis.localStorage = memory();
    globalThis.sessionStorage = memory();
  });

  test("fresh device on bare / sees the deck; deep links and staff never do", () => {
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "" }), true);
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "#intro" }), true);
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "", search: "?src=qr" }), true);
    for (const hash of ["#ask", "#hall", "#track", "#register", "#board"]) {
      assert.equal(shouldShowWelcome({ pathname: "/", hash }), false, hash);
    }
    for (const pathname of ["/ask", "/a", "/track-answer", "/mentors", "/mentors/x", "/about", "/privacy", "/welcome"]) {
      assert.equal(shouldShowWelcome({ pathname, hash: "", search: "?src=qr" }), false, pathname);
    }
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "", staff: true }), false);
  });

  test("seen once per device via the v3 key (survives a new session)", () => {
    markWelcomeSeen({ completed: true });
    const saved = JSON.parse(localStorage.getItem(WELCOME_KEY));
    assert.equal(saved.completed, true);
    assert.ok(saved.seenAt);
    assert.equal(sessionStorage.getItem(WELCOME_SESSION_KEY), "1");
    globalThis.sessionStorage = memory();
    assert.equal(hasSeenWelcome(), true);
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "" }), false);
    assert.equal(welcomeShownThisSession(), false, "session flag stays session-scoped");
  });

  test("legacy key counts as seen and migrates", () => {
    localStorage.setItem("aym-welcome-seen", "1");
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "" }), false);
    assert.ok(localStorage.getItem(WELCOME_KEY));
    assert.equal(localStorage.getItem("aym-welcome-seen"), "1", "legacy key is no longer deleted");
  });

  test("registered delegates skip the deck", () => {
    localStorage.setItem("aym-delegate-session", JSON.stringify({ email: "x@y.z" }));
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "" }), false);
  });

  test("storage that throws never traps the user", () => {
    globalThis.localStorage = throwing;
    globalThis.sessionStorage = throwing;
    assert.equal(hasSeenWelcome(), true);
    assert.equal(shouldShowWelcome({ pathname: "/", hash: "" }), false);
    assert.doesNotThrow(() => markWelcomeSeen({ completed: false }));
    assert.equal(welcomeShownThisSession(), true);
  });
});
