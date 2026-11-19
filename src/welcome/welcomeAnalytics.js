/**
 * Anonymous welcome-deck events (no PII). Dispatched on window as "aym:analytics" so any
 * collector can subscribe; there is no server op yet, so nothing leaves the browser.
 * Events: welcome_view, welcome_slide, welcome_pause, welcome_skip, welcome_complete, welcome_enter.
 */
export function trackWelcome(name, props = {}) {
  try {
    window.dispatchEvent(new CustomEvent("aym:analytics", { detail: { name, ...props } }));
  } catch {
    /* non-browser or CustomEvent unavailable */
  }
}
