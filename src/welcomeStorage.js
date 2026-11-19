/**
 * The welcome deck is shown once per device (versioned localStorage key). Registered delegates
 * (aym-delegate-session) never see it. Storage failures count as "seen" so nobody is ever trapped.
 * A separate sessionStorage flag keeps FirstVisitGuide softening scoped to the current session.
 */
export const WELCOME_KEY = "aym-welcome-v3";
export const WELCOME_SESSION_KEY = "aym-welcome-session";
const WELCOME_LEGACY_KEY = "aym-welcome-seen";
const DELEGATE_SESSION_KEY = "aym-delegate-session";

/** True if this device has seen (or should skip) the welcome deck. */
export function hasSeenWelcome() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return true;
    if (ls.getItem(WELCOME_KEY)) return true;
    if (ls.getItem(WELCOME_LEGACY_KEY)) {
      ls.setItem(WELCOME_KEY, JSON.stringify({ seenAt: new Date().toISOString(), completed: false }));
      return true;
    }
    if (ls.getItem(DELEGATE_SESSION_KEY)) return true;
    return globalThis.sessionStorage?.getItem(WELCOME_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

/** Record that the deck was dismissed (Skip / Enter) on this device and in this session. */
export function markWelcomeSeen({ completed = false } = {}) {
  try {
    globalThis.localStorage?.setItem(
      WELCOME_KEY,
      JSON.stringify({ seenAt: new Date().toISOString(), completed: !!completed }),
    );
  } catch {
    /* private mode */
  }
  markWelcomeSession();
}

export function markWelcomeSession() {
  try {
    globalThis.sessionStorage?.setItem(WELCOME_SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Session-scoped flag used to soften feature coaches right after the deck. */
export function welcomeShownThisSession() {
  try {
    return globalThis.sessionStorage?.getItem(WELCOME_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

/** Only a bare "/" (or "/#intro") for a non-staff visitor who hasn't seen the deck redirects to it. */
export function shouldShowWelcome({ pathname = "/", hash = "", staff = false } = {}) {
  if (staff || pathname !== "/") return false;
  if (hash && hash !== "#" && hash !== "#intro") return false;
  return !hasSeenWelcome();
}
