/** Visibility rules for the floating Ask Desk button (spec: docs/design/copy/ASK-CTA-AND-COPY-SPEC.md §2.2). */

export const ASK_FAB_SCROLL_MIN = 480;
export const ASK_FAB_DISMISS_KEY = "aym-ask-fab-hidden";

const HIDDEN_HASHES = new Set(["ask", "register", "track", "staff", "curate", "insights", "pack", "ai"]);
const HIDDEN_PATHS = new Set(["/ask", "/a", "/welcome", "/track-answer"]);

/** False on routes where the button would duplicate or distract: the Ask flow itself, Track, staff. */
export function askFabAllowedOn({ pathname = "/", hash = "" } = {}) {
  const p = (String(pathname).replace(/\/+$/, "") || "/").toLowerCase();
  if (HIDDEN_PATHS.has(p) || p.startsWith("/staff")) return false;
  const h = String(hash).replace(/^#/, "").split(/[?&/]/)[0].toLowerCase();
  if (p === "/" && HIDDEN_HASHES.has(h)) return false;
  return true;
}

/**
 * Show only once the visitor has scrolled past every in-page Ask CTA, never while the footer is on
 * screen, and never after they dismissed it this session.
 */
export function askFabVisible({
  allowed = true,
  dismissed = false,
  scrollY = 0,
  ctaInView = false,
  footerInView = false,
  menuOpen = false,
} = {}) {
  if (!allowed || dismissed || menuOpen) return false;
  if (ctaInView || footerInView) return false;
  return scrollY > ASK_FAB_SCROLL_MIN;
}
