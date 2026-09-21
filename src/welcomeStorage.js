/**
 * Welcome dismissal is session-scoped: closing the tab/browser clears it,
 * so returning users see /welcome again. Within one session, Skip/Enter
 * suppresses redirect until the session ends.
 */
export const WELCOME_SESSION_KEY = "aym-welcome-session";

/** Legacy permanent key — cleared so old “never show again” does not stick. */
const WELCOME_LEGACY_KEY = "aym-welcome-seen";

function clearLegacyWelcomeFlag() {
  try {
    localStorage.removeItem(WELCOME_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/** True after Skip / Enter AYURDISHA in this browser session. */
export function hasSeenWelcome() {
  try {
    clearLegacyWelcomeFlag();
    return sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

/** Mark welcome dismissed for the rest of this session only. */
export function markWelcomeSeen() {
  try {
    clearLegacyWelcomeFlag();
    sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Alias used by feature-guide softening after welcome. */
export function markWelcomeSession() {
  markWelcomeSeen();
}

export function welcomeShownThisSession() {
  return hasSeenWelcome();
}
