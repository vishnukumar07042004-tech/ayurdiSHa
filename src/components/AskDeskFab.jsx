import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircleQuestion, X } from "lucide-react";
import { ASK_DESK, ASK_HREF } from "../content/glossary.js";
import { ASK_FAB_DISMISS_KEY, askFabAllowedOn, askFabVisible } from "../askFabRules.js";
import "../styles/ask-fab.css";

function readDismissed() {
  try { return sessionStorage.getItem(ASK_FAB_DISMISS_KEY) === "1"; } catch { return false; }
}

/** Compact "Ask Desk" pill that appears once the page's own Ask CTAs have scrolled away. */
export default function AskDeskFab() {
  const location = useLocation();
  const allowed = askFabAllowedOn(location);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!allowed || dismissed || typeof window === "undefined") {
      setVisible(false);
      return undefined;
    }
    const inView = new Map();
    let raf = 0;
    const update = () => {
      raf = 0;
      let ctaInView = false;
      let footerInView = false;
      for (const [el, on] of inView) {
        if (!on) continue;
        if (el.matches("[data-ask-cta]")) ctaInView = true;
        else footerInView = true;
      }
      setVisible(askFabVisible({
        allowed,
        dismissed,
        scrollY: window.scrollY,
        ctaInView,
        footerInView,
        menuOpen: document.body.style.overflow === "hidden",
      }));
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(update); };

    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        for (const e of entries) inView.set(e.target, e.isIntersecting);
        schedule();
      })
      : null;
    const watch = () => {
      if (!io) return;
      for (const el of document.querySelectorAll("[data-ask-cta], footer.ui-footer")) {
        if (!inView.has(el)) { inView.set(el, false); io.observe(el); }
      }
    };
    watch();
    // Home sections and lazy routes mount after this effect; pick up late CTAs once.
    const late = window.setTimeout(() => { watch(); schedule(); }, 600);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) window.cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [allowed, dismissed, location.pathname, location.hash]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (visible) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [visible]);

  if (!allowed || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(ASK_FAB_DISMISS_KEY, "1"); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div ref={rootRef} className={`ask-fab${visible ? " is-visible" : ""}`} aria-hidden={visible ? undefined : "true"}>
      <Link to={ASK_HREF} className="ask-fab-link">
        <span className="ask-fab-icon" aria-hidden="true">
          <MessageCircleQuestion size={17} strokeWidth={2.1} />
        </span>
        <span className="ask-fab-label">{ASK_DESK}</span>
      </Link>
      <button type="button" className="ask-fab-close" onClick={dismiss} aria-label="Hide Ask Desk button">
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
