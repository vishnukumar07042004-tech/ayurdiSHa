import React, { useCallback, useId, useRef, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Lock, Unlock, Search, Ticket, Send, ChevronDown, Info, BookOpen, HelpCircle, Phone, Compass } from "lucide-react";
import useFocusTrap from "./useFocusTrap.js";
import GlobalSearch from "./components/GlobalSearch.jsx";

export function NavDrawer({
  open,
  onClose,
  labelledBy,
  children,
  title = "Menu",
}) {
  const panelRef = useRef(null);
  useFocusTrap(open, panelRef, onClose);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="aym-drawer-root">
      <button
        type="button"
        className="aym-drawer-backdrop"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="aym-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div className="aym-drawer-head">
          <h2 id={labelledBy} className="aym-drawer-title">{title}</h2>
          <button type="button" className="aym-drawer-close" onClick={onClose} aria-label="Close menu">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="aym-drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function LandingHeader(props) {
  return <AppHeader {...props} />;
}

export function SimpleHeader(props) {
  return <AppHeader {...props} />;
}

export default function AppHeader({ staff, onStaffClick, tab, onGoTab, brandToIntro }) {
  const [open, setOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'about' | 'mentors' | 'resources' | null
  const dropdownTimeout = useRef(null);
  
  const menuId = useId();
  const location = useLocation();
  const close = useCallback(() => setOpen(false), []);

  const handleMouseEnter = (menu) => {
    if (dropdownTimeout.current) clearTimeout(dropdownTimeout.current);
    setActiveDropdown(menu);
  };

  const handleMouseLeave = () => {
    dropdownTimeout.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  };

  const handleDropdownClick = (menu, e) => {
    e.preventDefault();
    setActiveDropdown(prev => prev === menu ? null : menu);
  };

  const closeDropdowns = () => {
    setActiveDropdown(null);
  };

  function isActive(path, exact = false) {
    if (exact) {
      return location.pathname === path && !location.hash;
    }
    return location.pathname.startsWith(path);
  }

  function isHomeTabActive(id) {
    return location.pathname === "/" && (location.hash === `#${id}` || (id === "intro" && (!location.hash || location.hash === "#intro") && tab === "intro"));
  }

  function go(id) {
    onGoTab?.(id);
    close();
    closeDropdowns();
  }

  return (
    <>
      <header className="aym-top sticky-header">
        <div className="aym-top-inner">
          <div className="aym-brand-row">
            <Link
              to="/"
              className="aym-brand-btn"
              aria-label="AYURDISHA home"
              onClick={() => {
                brandToIntro?.();
                closeDropdowns();
              }}
            >
              <span className="aym-eyebrow aym-brand-kicker">World Ayurveda Foundation · WAC 2026</span>
              <span className="aym-display aym-wordmark">AYURDISHA</span>
              <span className="aym-mcg">
                <span>Meet</span><span>Connect</span><span>Grow</span>
              </span>
            </Link>

            {/* Desktop Dropdown Navigation */}
            <nav className="aym-main-nav" aria-label="Primary">
              <Link
                to="/"
                className={`aym-nav-link ${isHomeTabActive("intro") ? "aym-nav-link-active" : ""}`}
                onClick={() => {
                  brandToIntro?.();
                  closeDropdowns();
                }}
              >
                Home
              </Link>

              {/* ABOUT dropdown */}
              <div 
                className="aym-dropdown-container"
                onMouseEnter={() => handleMouseEnter("about")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  className={`aym-nav-link aym-dropdown-trigger ${isActive("/about") ? "aym-nav-link-active" : ""} ${activeDropdown === "about" ? "dropdown-open" : ""}`}
                  aria-haspopup="true"
                  aria-expanded={activeDropdown === "about"}
                  onClick={(e) => handleDropdownClick("about", e)}
                >
                  <span>About</span>
                  <ChevronDown size={14} className="aym-chevron" aria-hidden="true" />
                </button>
                {activeDropdown === "about" && (
                  <div className="aym-dropdown-menu">
                    <Link to="/about" className="aym-dropdown-item" onClick={closeDropdowns}>
                      <Info size={16} aria-hidden="true" />
                      <div>
                        <strong>About Ayurdisha</strong>
                        <span>The digital mentoring initiative</span>
                      </div>
                    </Link>
                    <a href="https://worldayurvedacongress.com" target="_blank" rel="noopener noreferrer" className="aym-dropdown-item" onClick={closeDropdowns}>
                      <Compass size={16} aria-hidden="true" />
                      <div>
                        <strong>About WAC 2026</strong>
                        <span>11th World Ayurveda Congress</span>
                      </div>
                    </a>
                  </div>
                )}
              </div>

              <Link
                to="/mentors"
                className={`aym-nav-link ${isActive("/mentors") ? "aym-nav-link-active" : ""}`}
                onClick={closeDropdowns}
              >
                Mentors
              </Link>

              <Link
                to="/programs"
                className={`aym-nav-link ${isActive("/programs") ? "aym-nav-link-active" : ""}`}
                onClick={closeDropdowns}
              >
                Programs
              </Link>

              {/* RESOURCES dropdown */}
              <div 
                className="aym-dropdown-container"
                onMouseEnter={() => handleMouseEnter("resources")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  className={`aym-nav-link aym-dropdown-trigger ${isActive("/resources") || isActive("/contact") ? "aym-nav-link-active" : ""} ${activeDropdown === "resources" ? "dropdown-open" : ""}`}
                  aria-haspopup="true"
                  aria-expanded={activeDropdown === "resources"}
                  onClick={(e) => handleDropdownClick("resources", e)}
                >
                  <span>Resources</span>
                  <ChevronDown size={14} className="aym-chevron" aria-hidden="true" />
                </button>
                {activeDropdown === "resources" && (
                  <div className="aym-dropdown-menu">
                    <Link to="/resources" className="aym-dropdown-item" onClick={closeDropdowns}>
                      <BookOpen size={16} aria-hidden="true" />
                      <div>
                        <strong>Important Information</strong>
                        <span>Guides, files, and career references</span>
                      </div>
                    </Link>
                    <Link to="/resources#faq-title" className="aym-dropdown-item" onClick={closeDropdowns}>
                      <HelpCircle size={16} aria-hidden="true" />
                      <div>
                        <strong>FAQs</strong>
                        <span>Frequently asked questions</span>
                      </div>
                    </Link>
                    <Link to="/contact" className="aym-dropdown-item" onClick={closeDropdowns}>
                      <Phone size={16} aria-hidden="true" />
                      <div>
                        <strong>Support</strong>
                        <span>Get in touch with our help desk</span>
                      </div>
                    </Link>
                  </div>
                )}
              </div>

              <Link
                to="/events"
                className={`aym-nav-link ${isActive("/events") ? "aym-nav-link-active" : ""}`}
                onClick={closeDropdowns}
              >
                Events
              </Link>
            </nav>

            {/* Unified & Premium Primary Actions */}
            <div className="aym-top-actions unified-action-group">
              <button
                type="button"
                className="aym-btn aym-btn-ghost aym-search-trigger"
                onClick={() => { setShowSearch(true); closeDropdowns(); }}
                aria-label="Search mentors"
              >
                <Search size={18} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="aym-btn aym-btn-secondary aym-track-btn-premium"
                onClick={() => go("track")}
                aria-label="Track my answer"
              >
                <Ticket size={15} aria-hidden="true" />
                <span className="aym-track-btn-label">Track Answer</span>
              </button>

              <button 
                type="button" 
                className="aym-btn aym-btn-primary aym-desktop-only aym-ask-btn-premium" 
                onClick={() => go("ask")}
              >
                <Send size={15} aria-hidden="true" /> 
                <span>Ask Question</span>
              </button>

              {onStaffClick && (
                <button
                  type="button"
                  className="aym-btn aym-staff-chip-premium"
                  onClick={() => { onStaffClick(); closeDropdowns(); }}
                  aria-label={staff ? "Staff session active" : "Staff login"}
                  title={staff ? "Staff session active" : "Staff login"}
                >
                  {staff ? <Unlock size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                  <span className="aym-desktop-only">Staff</span>
                </button>
              )}

              <button
                type="button"
                className="aym-menu-btn"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen(o => !o)}
                aria-label={open ? "Close menu" : "Open menu"}
              >
                {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {/* Responsive Mobile Drawer Navigation */}
        <NavDrawer open={open} onClose={close} labelledBy={menuId} title="Navigation Menu">
          <nav className="aym-drawer-nav" aria-label="Mobile">
            
            {/* Primary Actions (At the very top of drawer for prominent mobile access) */}
            <div className="aym-drawer-actions">
              <button type="button" className="aym-btn aym-btn-primary aym-drawer-primary-btn" onClick={() => go("ask")}>
                <Send size={16} aria-hidden="true" /> Ask a Question
              </button>
              <button type="button" className="aym-btn aym-btn-secondary aym-drawer-secondary-btn" onClick={() => go("track")}>
                <Ticket size={16} aria-hidden="true" /> Track My Answer
              </button>
            </div>

            <div className="aym-drawer-divider" />

            <Link to="/" className={`aym-drawer-link ${location.pathname === "/" && !location.hash ? "aym-drawer-link-on" : ""}`} onClick={close}>
              Home
            </Link>

            {/* Mobile About Group */}
            <div className="aym-drawer-group">
              <span className="aym-drawer-group-label">ABOUT</span>
              <Link to="/about" className={`aym-drawer-sublink ${isActive("/about") ? "aym-drawer-sublink-on" : ""}`} onClick={close}>
                About Ayurdisha
              </Link>
              <a href="https://worldayurvedacongress.com" target="_blank" rel="noopener noreferrer" className="aym-drawer-sublink" onClick={close}>
                About WAC 2026
              </a>
            </div>

            <Link
              to="/mentors"
              className={`aym-drawer-link ${isActive("/mentors") ? "aym-drawer-link-on" : ""}`}
              onClick={close}
            >
              Mentors
            </Link>

            {/* Mobile Programs & Events Group */}
            <div className="aym-drawer-group">
              <span className="aym-drawer-group-label">PATHWAYS & SESSIONS</span>
              <Link to="/programs" className={`aym-drawer-sublink ${isActive("/programs") ? "aym-drawer-sublink-on" : ""}`} onClick={close}>
                10 Career Tracks
              </Link>
              <Link to="/events" className={`aym-drawer-sublink ${isActive("/events") ? "aym-drawer-sublink-on" : ""}`} onClick={close}>
                Congress Events
              </Link>
            </div>

            {/* Mobile Resources Group */}
            <div className="aym-drawer-group">
              <span className="aym-drawer-group-label">RESOURCES</span>
              <Link to="/resources" className={`aym-drawer-sublink ${isActive("/resources") ? "aym-drawer-sublink-on" : ""}`} onClick={close}>
                Important Information
              </Link>
              <Link to="/resources#faq-title" className="aym-drawer-sublink" onClick={close}>
                FAQs
              </Link>
              <Link to="/contact" className={`aym-drawer-sublink ${isActive("/contact") ? "aym-drawer-sublink-on" : ""}`} onClick={close}>
                Support Desk
              </Link>
            </div>

            <div className="aym-drawer-divider" />
            
            <button type="button" className="aym-drawer-link" onClick={() => go("hall")}>
              Enter the Hall
            </button>
            <button type="button" className="aym-drawer-link" onClick={() => go("board")}>
              Open Theme Stage
            </button>
            <button type="button" className="aym-drawer-link" onClick={() => go("register")}>
              Attendee Registration
            </button>
          </nav>
        </NavDrawer>
      </header>
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </>
  );
}
