/**
 * Welcome deck navigation — pure, framework-free (unit-tested in tests/welcome-deck.test.mjs).
 *
 * state:   { index, count, playing, held, hidden, focusHold, reducedMotion,
 *            hintVisible, hintDismissed, completed, nudge, nav }
 * actions: NEXT{source}, PREV{source}, GOTO{index,source}, TICK_END, HOLD_START, HOLD_END,
 *          TOGGLE_PLAY, VISIBILITY{hidden}, FOCUS_HOLD{on}, REDUCED_MOTION{on}, SHOW_HINT, DISMISS_HINT
 *
 * `nav` records the last index change ({ from, to, source }) so the UI can announce and track it;
 * `nudge` is a counter bumped when the user tries to go past the last slide (UI pulses the CTA).
 */

export const HOLD_MS = 300;
export const TAP_MAX_MOVE = 10;
export const SWIPE_MIN = 48;
export const SWIPE_RATIO = 1.5;
export const PREV_ZONE = 0.3;
export const WHEEL_THRESHOLD = 50;
export const WHEEL_LOCK_MS = 900;
export const WHEEL_IDLE_MS = 250;

export function initialState({ count, reducedMotion = false, showHint = true } = {}) {
  return {
    index: 0,
    count,
    playing: true,
    held: false,
    hidden: false,
    focusHold: false,
    reducedMotion: !!reducedMotion,
    hintVisible: false,
    hintDismissed: !showHint,
    completed: count <= 1,
    nudge: 0,
    nav: null,
  };
}

export function isLast(s) {
  return s.index >= s.count - 1;
}

export function isRunning(s) {
  return s.playing && !s.held && !s.hidden && !s.focusHold && !s.reducedMotion && !isLast(s);
}

function go(s, to, source) {
  const target = Math.max(0, Math.min(s.count - 1, to));
  const user = source !== "auto";
  if (target === s.index) {
    return user && !s.hintDismissed ? { ...s, hintVisible: false, hintDismissed: true } : s;
  }
  const last = target === s.count - 1;
  return {
    ...s,
    index: target,
    held: false,
    hintVisible: false,
    hintDismissed: true,
    completed: s.completed || last,
    playing: last ? false : s.playing,
    nav: { from: s.index, to: target, source: source || "auto" },
  };
}

export function reduce(s, a) {
  switch (a.type) {
    case "NEXT":
      if (isLast(s)) {
        return { ...s, nudge: s.nudge + 1, hintVisible: false, hintDismissed: true };
      }
      return go(s, s.index + 1, a.source);
    case "PREV":
      if (s.index === 0) return s;
      return go(s, s.index - 1, a.source);
    case "GOTO":
      return go(s, a.index, a.source);
    case "TICK_END":
      return isRunning(s) ? go(s, s.index + 1, "auto") : s;
    case "HOLD_START":
      return s.held ? s : { ...s, held: true };
    case "HOLD_END":
      return s.held ? { ...s, held: false } : s;
    case "TOGGLE_PLAY":
      return isLast(s) ? s : { ...s, playing: !s.playing };
    case "VISIBILITY":
      return { ...s, hidden: !!a.hidden };
    case "FOCUS_HOLD":
      return { ...s, focusHold: !!a.on };
    case "REDUCED_MOTION":
      return { ...s, reducedMotion: !!a.on };
    case "SHOW_HINT":
      return s.index === 0 && !s.hintDismissed && !s.hintVisible ? { ...s, hintVisible: true } : s;
    case "DISMISS_HINT":
      return s.hintVisible || !s.hintDismissed ? { ...s, hintVisible: false, hintDismissed: true } : s;
    default:
      return s;
  }
}

/**
 * Story-style pointer classification (one code path for touch, pen and mouse).
 * x is relative to the stage's left edge. Returns "next" | "prev" | "hold" | "nudge" | "none".
 */
export function classifyPointer({ dx = 0, dy = 0, dt = 0, x = 0, width = 1, isFirst = false, isLast: last = false }) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let dir = null;
  if (ax >= SWIPE_MIN && ax > SWIPE_RATIO * ay) {
    dir = dx < 0 ? "next" : "prev";
  } else if (Math.hypot(dx, dy) < TAP_MAX_MOVE) {
    if (dt >= HOLD_MS) return "hold";
    dir = x < PREV_ZONE * width && !isFirst ? "prev" : "next";
  }
  if (!dir) return "none";
  if (dir === "next" && last) return "nudge";
  if (dir === "prev" && isFirst) return "none";
  return dir;
}

export function isSwipe({ dx = 0, dy = 0 }) {
  return Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > SWIPE_RATIO * Math.abs(dy);
}

/**
 * Keyboard map. `onControl` = focus is on a button/link (Space/Enter must activate it natively);
 * `inField` = focus is in a text field. Returns "next" | "prev" | "first" | "last" | "skip" | "pause" | null.
 */
export function keyAction({ key, altKey, ctrlKey, metaKey, onControl = false, inField = false, isLast: last = false }) {
  if (altKey || ctrlKey || metaKey || inField) return null;
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case " ":
    case "Spacebar":
    case "Enter":
      return onControl ? null : "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return last ? null : "skip";
    case "k":
    case "K":
    case "p":
    case "P":
      return "pause";
    default:
      return null;
  }
}

/** Wheel/trackpad gate: accumulate, fire once past the threshold, then ignore inertia for WHEEL_LOCK_MS. */
export function initialWheel() {
  return { acc: 0, last: 0, lockUntil: 0 };
}

export function stepWheel(g, { deltaX = 0, deltaY = 0, deltaMode = 0, now, pageHeight = 800 }) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  if (now < g.lockUntil) return { gate: { ...g, last: now }, action: null };
  const acc = (now - g.last > WHEEL_IDLE_MS ? 0 : g.acc) + (deltaX + deltaY) * unit;
  if (Math.abs(acc) >= WHEEL_THRESHOLD) {
    return { gate: { acc: 0, last: now, lockUntil: now + WHEEL_LOCK_MS }, action: acc > 0 ? "next" : "prev" };
  }
  return { gate: { ...g, acc, last: now }, action: null };
}
