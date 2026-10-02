import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  X,
  User,
  BookOpen,
  Calendar,
  FileText,
  Compass,
  HelpCircle,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { MENTORS, mentorsWithNames, mentorPublicPath } from "../mentors.js";
import { getAllPrograms } from "../data/programs.js";
import { getAllEvents } from "../data/events.js";
import { getAllResources } from "../data/resources.js";
import { SITE_FAQS } from "../data/faqs.js";

const PAGES = [
  {
    id: "page-about",
    title: "About AYURDISHA",
    sub: "Mission, Congress context, and how to reopen welcome",
    path: "/about",
    keywords: "about mission congress wac",
  },
  {
    id: "page-contact",
    title: "Contact",
    sub: "Help desk and support",
    path: "/contact",
    keywords: "contact help support email",
  },
  {
    id: "page-faq",
    title: "FAQs",
    sub: "Common questions about Ask Desk and tracks",
    path: "/resources#faq-title",
    keywords: "faq faqs questions help",
  },
  {
    id: "page-welcome",
    title: "Welcome overview",
    sub: "Orientation slides for AYURDISHA",
    path: "/welcome",
    keywords: "welcome intro orientation overview",
  },
  {
    id: "page-track",
    title: "Track my answer",
    sub: "Look up your Ask Desk ticket and mentor reply",
    path: "/#track",
    keywords: "track answer ticket status reply lookup ask desk",
  },
  {
    id: "page-mentors",
    title: "Mentors",
    sub: "Browse Meet the Mentors directory",
    path: "/mentors",
    keywords: "mentors directory profiles",
  },
  {
    id: "page-programs",
    title: "Career tracks",
    sub: "Ten national Ayurveda pathways",
    path: "/programs",
    keywords: "programs tracks careers pathways",
  },
  {
    id: "page-events",
    title: "Events",
    sub: "Congress sessions and hall schedule",
    path: "/events",
    keywords: "events schedule congress sessions",
  },
  {
    id: "page-resources",
    title: "Resources",
    sub: "Guides, podcasts, and FAQs",
    path: "/resources",
    keywords: "resources guides podcasts",
  },
];

const QUICK_LINKS = ["page-mentors", "page-track", "page-programs", "page-events", "page-resources", "page-faq"];

function matchesQuery(haystacks, q) {
  return haystacks.some((f) => String(f || "").toLowerCase().includes(q));
}

export default function GlobalSearch({
  placeholder = "Search mentors, tracks, events…",
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && onClose) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const catalog = useMemo(() => {
    const mentors = mentorsWithNames(MENTORS).map((m) => ({
      id: `mentor-${m.id || m.name}`,
      group: "Mentors",
      title: m.name,
      sub: [m.designation, m.expertise].filter(Boolean).join(" · "),
      path: mentorPublicPath(m),
      Icon: User,
      hay: [m.name, m.designation, m.affiliation, m.expertise, m.bio],
    }));

    const programs = getAllPrograms().map((p) => ({
      id: `program-${p.code}`,
      group: "Programs",
      title: p.title || p.name,
      sub: p.code ? `${p.code}${p.tagline ? ` · ${p.tagline}` : ""}` : p.tagline || "Career track",
      path: p.path || `/programs/${p.slug}`,
      Icon: BookOpen,
      hay: [p.title, p.name, p.code, p.tagline, ...(p.subs || [])],
    }));

    const events = getAllEvents().map((e) => ({
      id: `event-${e.id}`,
      group: "Events",
      title: e.title,
      sub: [e.date, e.category].filter(Boolean).join(" · "),
      path: e.path || `/events/${e.slug}`,
      Icon: Calendar,
      hay: [e.title, e.description, e.category, e.location, e.date],
    }));

    const resources = getAllResources().map((r) => ({
      id: `resource-${r.id}`,
      group: "Resources",
      title: r.title,
      sub: [r.category, r.author].filter(Boolean).join(" · "),
      path: r.path || `/resources/${r.slug}`,
      Icon: FileText,
      hay: [r.title, r.description, r.category, r.author, r.trackCode],
    }));

    const pages = PAGES.map((p) => ({
      id: p.id,
      group: "Pages",
      title: p.title,
      sub: p.sub,
      path: p.path,
      Icon: Compass,
      hay: [p.title, p.sub, p.keywords],
    }));

    const faqs = SITE_FAQS.map((f, i) => ({
      id: `faq-${i}`,
      group: "Pages",
      title: f.q,
      sub: "FAQ",
      path: "/resources#faq-title",
      Icon: HelpCircle,
      hay: [f.q, f.a, "faq"],
    }));

    return { mentors, programs, events, resources, pages: [...pages, ...faqs] };
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const limit = { Mentors: 5, Programs: 4, Events: 3, Resources: 4, Pages: 5 };
    const order = ["Pages", "Mentors", "Programs", "Events", "Resources"];
    const buckets = {
      Mentors: catalog.mentors,
      Programs: catalog.programs,
      Events: catalog.events,
      Resources: catalog.resources,
      Pages: catalog.pages,
    };

    return order
      .map((name) => {
        const items = buckets[name]
          .filter((item) => matchesQuery(item.hay, q))
          .slice(0, limit[name]);
        return items.length ? { name, items } : null;
      })
      .filter(Boolean);
  }, [query, catalog]);

  const flatResults = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const goTo = useCallback(
    (path) => {
      if (!path) return;
      onClose?.();
      navigate(path);
      window.scrollTo(0, 0);
    },
    [navigate, onClose]
  );

  const onInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!flatResults.length) return;
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!flatResults.length) return;
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatResults[activeIndex];
      if (hit) goTo(hit.path);
    }
  };

  const qLen = query.trim().length;
  let flatIdx = -1;

  return (
    <div className="aym-search-modal-backdrop" onClick={onClose}>
      <div
        className="aym-search-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search site"
      >
        <div className="aym-search-bar-row">
          <Search size={20} className="aym-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            className="aym-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-label="Search site"
            aria-autocomplete="list"
            aria-controls="aym-search-results"
          />
          {query ? (
            <button
              type="button"
              className="aym-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
          {onClose && (
            <button type="button" className="aym-search-cancel" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>

        <div className="aym-search-results-area" id="aym-search-results">
          {qLen > 0 && qLen < 2 && (
            <p className="aym-search-empty">Type at least two characters…</p>
          )}
          {qLen >= 2 && groups.length === 0 && (
            <p className="aym-search-empty">
              No matches. Try a mentor name, track code, event, or page.
            </p>
          )}
          {qLen < 2 && (
            <>
              <div className="aym-search-group">
                <p className="aym-search-group-title">Quick links</p>
                <ul className="aym-search-quick">
                  {QUICK_LINKS.map((id) => {
                    const page = PAGES.find((p) => p.id === id);
                    return (
                      <li key={id}>
                        <Link to={page.path} onClick={onClose} className="aym-search-quick-link">
                          <ArrowRight size={15} aria-hidden="true" />
                          <span>{page.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="aym-search-hint">
                Search mentors, career tracks, events, resources, and key pages.{" "}
                <kbd className="aym-search-kbd">/</kbd> or{" "}
                <kbd className="aym-search-kbd">⌘K</kbd> to open anytime.
              </p>
            </>
          )}
          {groups.map((group) => (
            <div key={group.name} className="aym-search-group">
              <p className="aym-search-group-title">{group.name}</p>
              <div className="aym-search-items" role="listbox" aria-label={group.name}>
                {group.items.map((item) => {
                  flatIdx += 1;
                  const idx = flatIdx;
                  const Icon = item.Icon;
                  const active = idx === activeIndex;
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      className={`aym-search-item${active ? " is-active" : ""}`}
                      role="option"
                      aria-selected={active}
                      onClick={onClose}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <span className="aym-search-item-main">
                        <Icon size={15} aria-hidden="true" className="aym-search-item-icon" />
                        <span>
                          <span className="aym-search-item-title">{item.title}</span>
                          {item.sub ? (
                            <span className="aym-search-item-sub">{item.sub}</span>
                          ) : null}
                        </span>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" className="aym-search-item-chev" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
