export const WELCOME_STORAGE_KEY = "aym-welcome-seen";
/** Set for the browser session after welcome is shown — softens feature guides the same visit. */
export const WELCOME_SESSION_KEY = "aym-welcome-session";

export function hasSeenWelcome() {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function markWelcomeSession() {
  try {
    sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function welcomeShownThisSession() {
  try {
    return sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
