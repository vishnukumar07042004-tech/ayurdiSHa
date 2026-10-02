import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Lock, Search, Ticket, Unlock, X } from "lucide-react";
import useFocusTrap from "./useFocusTrap.js";
import GlobalSearch from "./components/GlobalSearch.jsx";
import { useScrolled } from "./components/editorial/motion.js";

/** Home sections reachable from the nav (ids live in HomePage). */
export const HOME_SECTIONS = {
  how: "how-it-works",
  wac: "wac-2026",
};

export function scrollToSection(id, behavior = "smooth") {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : behavior, block: "start" });
  return true;
}

function useActiveHomeSection(enabled) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return undefined;
    }
    let io;
    const timer = window.setTimeout(() => {
      const nodes = Object.values(HOME_SECTIONS)
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      if (!nodes.length) return;
      const visible = new Map();
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
          const hit = Object.values(HOME_SECTIONS).find((id) => visible.get(id));
          setActive(hit || null);
        },
        { rootMargin: "-45% 0px -45% 0px" }
      );
      nodes.forEach((n) => io.observe(n));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      io?.disconnect();
    };
  }, [enabled]);
  return active;
}

export default function AppHeader({ staff, onStaffClick, tab, onGoTab, brandToIntro, onOpenWelcome }) {
  const [menu, setMenu] = useState("closed"); // closed | open | closing
  const [showSearch, setShowSearch] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const flyoutRef = useRef(null);
  const flyoutId = useId();
  const panelRef = useRef(null);
  const menuId = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const scrolled = useScrolled(24);

  const onHome = location.pathname === "/" && (!location.hash || location.hash === "#intro");
  const overHero = onHome && tab === "intro" && !scrolled;
  const activeSection = useActiveHomeSection(onHome && tab === "intro");

  const menuOpen = menu !== "closed";
  const closeMenu = useCallback(() => {
    setMenu((m) => (m === "open" ? "closing" : m));
  }, []);

  useEffect(() => {
    if (menu !== "closing") return undefined;
    const t = window.setTimeout(() => setMenu("closed"), 260);
    return () => window.clearTimeout(t);
  }, [menu]);

  useFocusTrap(menu === "open", panelRef, closeMenu);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onDoc = (e) => {
      if (!moreRef.current?.contains(e.target) && !flyoutRef.current?.contains(e.target)) setMoreOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    function onGlobalSearchHotkey(e) {
      const el = e.target;
      const tag = el?.tagName;
      const typing =
        el?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT";
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowSearch(true);
        setMoreOpen(false);
        return;
      }
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowSearch(true);
        setMoreOpen(false);
      }
    }
    window.addEventListener("keydown", onGlobalSearchHotkey);
    return () => window.removeEventListener("keydown", onGlobalSearchHotkey);
  }, []);

  function isActive(path) {
    return location.pathname.startsWith(path);
  }

  function go(id) {
    onGoTab?.(id);
    closeMenu();
    setMoreOpen(false);
  }

  function goSection(id, e) {
    e?.preventDefault();
    closeMenu();
    setMoreOpen(false);
    if (onHome && tab === "intro" && scrollToSection(id)) return;
    navigate("/", { state: { section: id } });
  }

  function goHome() {
    brandToIntro?.();
    closeMenu();
    setMoreOpen(false);
  }

  function goTrack(e) {
    closeMenu();
    setMoreOpen(false);
    // The app-wide /#track link interceptor may already have routed this click.
    if (e?.defaultPrevented) return;
    e?.preventDefault();
    onGoTab?.("track");
  }

  const homeActive = onHome && tab === "intro" && !activeSection;
  const trackActive = location.pathname === "/" && location.hash === "#track";

  const primaryLinks = [
    { key: "home", label: "Home", to: "/", active: homeActive, onClick: goHome },
    { key: "mentors", label: "Meet Mentors", to: "/mentors", active: isActive("/mentors") },
    { key: "about", label: "About", to: "/about", active: isActive("/about") },
    {
      key: "how",
      label: "How It Works",
      to: "/",
      active: activeSection === HOME_SECTIONS.how,
      onClick: (e) => goSection(HOME_SECTIONS.how, e),
    },
    {
      key: "wac",
      label: "WAC 2026",
      to: "/",
      active: activeSection === HOME_SECTIONS.wac,
      onClick: (e) => goSection(HOME_SECTIONS.wac, e),
    },
    {
      key: "track",
      label: "Track my answer",
      to: "/#track",
      active: trackActive,
      onClick: goTrack,
      Icon: Ticket,
    },
  ];

  const takePart = [
    { label: "Enter the Hall", id: "hall" },
    { label: "Register", id: "register" },
    { label: "Ask a question", id: "ask" },
    { label: "Open Theme Stage", id: "board" },
  ];
  const explore = [
    { label: "Career tracks", to: "/programs" },
    { label: "Congress events", to: "/events" },
    { label: "Resources", to: "/resources" },
    { label: "FAQs", to: "/resources#faq-title" },
    { label: "Support", to: "/contact" },
  ];

  const headerClass = [
    "ed-nav",
    overHero ? "ed-nav--over-hero" : "ed-nav--solid",
    scrolled ? "is-scrolled" : "",
    moreOpen ? "is-flyout-open" : "",
  ].join(" ");

  return (
    <>
      <header className={headerClass}>
        <div className="ed-nav-inner">
          <Link to="/" className="ed-brand" aria-label="AYURDISHA home" onClick={goHome}>
            <span className="ed-brand-word">AYURDISHA</span>
            <span className="ed-brand-kicker">Meet the Mentors · WAC 2026</span>
          </Link>

          <nav className="ed-nav-links" aria-label="Primary">
            {primaryLinks.map((l) => (
              <Link
                key={l.key}
                to={l.to}
                className={`ed-nav-link${l.Icon ? " ed-nav-link--track" : ""}${l.active ? " is-active" : ""}`}
                aria-current={l.active ? "page" : undefined}
                onClick={l.onClick}
              >
                {l.Icon && <l.Icon size={14} strokeWidth={1.9} aria-hidden="true" />}
                {l.label}
              </Link>
            ))}
            <div className="ed-more" ref={moreRef}>
              <button
                type="button"
                className={`ed-nav-link ed-more-trigger${moreOpen ? " is-open" : ""}`}
                aria-expanded={moreOpen}
                aria-controls={flyoutId}
                onClick={() => setMoreOpen((o) => !o)}
              >
                More
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            </div>
          </nav>

          <div className="ed-nav-actions">
            <button
              type="button"
              className="ed-icon-btn"
              onClick={() => { setShowSearch(true); setMoreOpen(false); }}
              aria-label="Search site"
              title="Search site (/ or ⌘K)"
            >
              <Search size={17} aria-hidden="true" />
            </button>
            {onStaffClick && (
              <button
                type="button"
                className="ed-icon-btn ed-staff-btn"
                onClick={() => { onStaffClick(); setMoreOpen(false); }}
                aria-label={staff ? "Staff session active" : "Staff login"}
                title={staff ? "Staff session active" : "Staff login"}
              >
                {staff ? <Unlock size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
              </button>
            )}
            <Link to="/mentors" className="ui-btn ui-btn--primary ui-btn--sm ed-nav-cta">
              Meet a Mentor
            </Link>
            <button
              type="button"
              className={`ed-burger${menuOpen ? " is-open" : ""}`}
              aria-expanded={menu === "open"}
              aria-controls={menuId}
              onClick={() => setMenu((m) => (m === "open" ? "closing" : "open"))}
              aria-label={menu === "open" ? "Close menu" : "Open menu"}
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          </div>
        </div>

        {moreOpen && (
          <div className="ui-flyout" id={flyoutId} ref={flyoutRef}>
            <div className="ui-flyout-inner">
              <div className="ui-flyout-col ui-flyout-col--primary">
                <p className="ui-flyout-label">Take part</p>
                {takePart.map((t) => (
                  <button key={t.id} type="button" onClick={() => go(t.id)}>{t.label}</button>
                ))}
              </div>
              <div className="ui-flyout-col">
                <p className="ui-flyout-label">Explore</p>
                {explore.map((x) => (
                  <Link key={x.label} to={x.to} onClick={() => setMoreOpen(false)}>{x.label}</Link>
                ))}
              </div>
              <div className="ui-flyout-col">
                <p className="ui-flyout-label">Orientation</p>
                {onOpenWelcome && (
                  <button type="button" onClick={() => { setMoreOpen(false); onOpenWelcome(); }}>
                    Welcome overview
                  </button>
                )}
                <Link to="/about" onClick={() => setMoreOpen(false)}>About AYURDISHA</Link>
                <button type="button" onClick={() => { setMoreOpen(false); setShowSearch(true); }}>
                  Search the site
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
      {moreOpen && <div className="ui-flyout-scrim" aria-hidden="true" />}

      {menuOpen && (
        <div
          id={menuId}
          ref={panelRef}
          className={`ed-overlay${menu === "closing" ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          tabIndex={-1}
        >
          <div className="ed-overlay-head">
            <Link to="/" className="ed-brand" onClick={goHome}>
              <span className="ed-brand-word">AYURDISHA</span>
            </Link>
            <button type="button" className="ed-icon-btn ed-overlay-close" onClick={closeMenu} aria-label="Close menu">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <nav className="ed-overlay-nav" aria-label="Mobile">
            <ul className="ed-overlay-primary">
              {primaryLinks.map((l, i) => (
                <li key={l.key} style={{ "--i": i }}>
                  <Link
                    to={l.to}
                    className={[l.Icon ? "ed-overlay-track" : "", l.active ? "is-active" : ""].filter(Boolean).join(" ") || undefined}
                    aria-current={l.active ? "page" : undefined}
                    onClick={(e) => {
                      if (l.onClick) l.onClick(e);
                      else closeMenu();
                    }}
                  >
                    <span>
                      {l.Icon && <l.Icon size={22} strokeWidth={1.7} aria-hidden="true" className="ed-overlay-track-icon" />}
                      {l.label}
                    </span>
                    <ChevronRight size={20} aria-hidden="true" className="ed-overlay-chev" />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="ed-overlay-actions" style={{ "--i": 6 }}>
              <Link to="/mentors" className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block" onClick={closeMenu}>
                Meet a Mentor
              </Link>
              <button type="button" className="ui-btn ui-btn--secondary ui-btn--md ui-btn--block" onClick={() => go("ask")}>
                Ask a question
              </button>
            </div>

            <div className="ed-overlay-groups" style={{ "--i": 7 }}>
              <div>
                <p className="ed-more-label">Take part</p>
                <button type="button" onClick={() => go("hall")}>Enter the Hall</button>
                <button type="button" onClick={() => go("register")}>Register</button>
                <button type="button" onClick={() => go("board")}>Open Theme Stage</button>
                {onOpenWelcome && (
                  <button type="button" onClick={() => { closeMenu(); onOpenWelcome(); }}>
                    Welcome overview
                  </button>
                )}
              </div>
              <div>
                <p className="ed-more-label">Explore</p>
                {explore.map((x) => (
                  <Link key={x.label} to={x.to} onClick={closeMenu}>{x.label}</Link>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </>
  );
}
