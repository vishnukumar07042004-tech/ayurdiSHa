import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, MessageCircleQuestion, Search, SearchX, Users, X } from "lucide-react";
import { MENTORS, mentorsWithNames, getMentorById } from "./mentors.js";
import { MENTOR_DOMAINS, getMentorDomain } from "./mentorDomains.js";
import MentorCard, { MentorSpotlightCard } from "./MentorCard.jsx";
import useFlip from "./components/editorial/useFlip.js";
import Button, { MoreLink } from "./components/ui/Button.jsx";
import { LocalNav } from "./components/ui/PageChrome.jsx";
import { StoreHeader, ShelfHead, Shelf, ShelfItem, QuickNav, FeatureCard, HelpRow } from "./components/ui/Store.jsx";
import FieldIcon, { fieldKey } from "./components/ui/FieldIcons.jsx";
import { FEATURED_MENTOR_ID } from "./content/site.js";
import { observeScrollReveal } from "./scrollReveal.js";

const ASK = { pathname: "/", hash: "#ask" };

/** Shelf copy and imagery per field (roster-neutral: no credentials implied). */
export const FIELD_SHELVES = {
  "Clinical Practice": {
    soft: "Bedside wisdom from senior vaidyas.",
    image: "/assets/sections/field-clinical.webp",
    alt: "A senior vaidya reading a patient's pulse in a hospital OPD while a young intern observes and takes notes",
    title: "Learn where care happens.",
    text: "OPD routines, Panchakarma, surgery and specialty practice.",
  },
  "Academics & Samhita": {
    soft: "Classical texts, taught by those who teach them.",
    image: "/assets/sections/field-academics.webp",
    alt: "A mentor showing a palm-leaf manuscript to students in a heritage classroom",
    title: "Read the classics with a guide.",
    text: "Samhita study, PG choices and teaching careers.",
  },
  "Research & Evidence": {
    soft: "Trials, publications and the questions worth asking.",
    image: "/assets/sections/field-research.webp",
    alt: "A mentor-scientist and a young researcher examining a herbal extract at a laboratory bench",
    title: "Build the evidence.",
    text: "Research design, fellowships, policy and publication.",
  },
  "Pharmacology & GMP": {
    soft: "From raw herb to quality medicine.",
    image: "/assets/sections/field-pharma.webp",
    alt: "A senior pharmacist guiding an intern through a quality check in a GMP-grade Ayurvedic pharmacy",
    title: "Make medicine you can trust.",
    text: "Dravyaguna, Rasa Shastra, formulation and quality.",
  },
};

export default function MentorsDirectory() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") || "");
  const [selectedDomain, setSelectedDomain] = useState(() =>
    MENTOR_DOMAINS.includes(params.get("field")) ? params.get("field") : "All"
  );
  const named = useMemo(() => mentorsWithNames(MENTORS), []);
  const gridRef = useRef(null);
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  const toolbarRef = useRef(null);

  const domainCounts = useMemo(() => {
    const counts = new Map();
    named.forEach((m) => {
      const d = getMentorDomain(m);
      counts.set(d, (counts.get(d) || 0) + 1);
    });
    return counts;
  }, [named]);

  const domains = MENTOR_DOMAINS.filter((d) => d === "All" || domainCounts.get(d));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return named.filter((m) => {
      if (selectedDomain !== "All" && getMentorDomain(m) !== selectedDomain) {
        return false;
      }

      if (q) {
        const hay = [m.name, m.designation, m.affiliation, m.expertise, m.bio, m.credentials]
          .map((s) => String(s || "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [named, query, selectedDomain]);

  const hasFilters = selectedDomain !== "All" || query.trim() !== "";
  const featured = getMentorById(FEATURED_MENTOR_ID);

  const featuredList = useMemo(
    () => named.filter((m) => m.id !== FEATURED_MENTOR_ID && String(m.designation || "").trim()),
    [named]
  );
  const byField = useMemo(() => {
    const map = new Map();
    named.forEach((m) => {
      const d = getMentorDomain(m);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(m);
    });
    return map;
  }, [named]);

  useFlip(gridRef, filtered.map((m) => m.id).join("|"));

  useEffect(() => observeScrollReveal(rootRef.current, { once: true }), [hasFilters]);

  function clearFilters() {
    setSelectedDomain("All");
    setQuery("");
  }

  function showField(field) {
    setSelectedDomain(field);
    const el = toolbarRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  const localLinks = hasFilters
    ? [{ label: "Results", href: "#mentor-directory" }]
    : [
        { label: "Featured", href: "#featured-mentors" },
        { label: "By field", href: "#mentor-fields" },
        { label: "Help", href: "#mentor-help" },
      ];

  return (
    <div className="ui-explorer st-page" ref={rootRef}>
      <StoreHeader
        ref={heroRef}
        titleId="mentors-hero-title"
        eyebrow="AYURDISHA · WAC Bhubaneswar 2026"
        title="Meet the Mentors."
        soft="Find the right guide for your path."
        helpers={[
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Need help choosing?",
            label: "Ask the desk",
            to: ASK,
          },
          {
            icon: <CalendarDays size={22} strokeWidth={1.7} />,
            text: "10–13 Dec · Bhubaneswar",
            label: "Live 1:1 at WAC 2026",
            to: "/events",
          },
        ]}
      />
      <LocalNav
        title="Mentors"
        watchRef={heroRef}
        links={localLinks}
        cta={{ label: "Ask the desk", to: ASK }}
      />

      <section className="st-explorer" id="mentor-directory" aria-labelledby="mentor-directory-title">
        <div className="ui-container st-toolbar-wrap" ref={toolbarRef}>
          <h2 id="mentor-directory-title" className="aym-visually-hidden">
            Mentor roster
          </h2>

          <QuickNav
            label="Filter mentors by field"
            value={selectedDomain}
            onChange={setSelectedDomain}
            options={domains.map((dom) => ({
              value: dom,
              label: dom === "All" ? "All mentors" : dom,
              icon: <FieldIcon name={fieldKey(dom)} size={34} />,
              count: dom === "All" ? named.length : domainCounts.get(dom),
              countLabel: "mentors",
            }))}
          />

          <div className="st-toolbar">
            <form className="ui-search st-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <label className="aym-visually-hidden" htmlFor="mentor-search">
                Search mentors by name, expertise, or institution
              </label>
              <Search size={18} className="ui-search-icon" aria-hidden="true" />
              <input
                id="mentor-search"
                className="ui-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mentors, expertise or institution"
                autoComplete="off"
              />
              {query && (
                <button type="button" className="ui-search-action" onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={17} aria-hidden="true" />
                </button>
              )}
            </form>
            <p className="st-toolbar-note">
              <Users size={16} strokeWidth={1.8} aria-hidden="true" />
              Tentative WAC 2026 roster · {named.length} mentors
            </p>
          </div>
        </div>

        {!hasFilters ? (
          <>
            <section id="featured-mentors" className="st-shelf-section ui-anchor" aria-labelledby="featured-mentors-title">
              <div className="ui-container">
                <ShelfHead
                  id="featured-mentors-title"
                  title="Featured mentors."
                  soft="Institute heads, researchers and senior clinicians."
                />
              </div>
              <Shelf label="Featured mentors">
                {featured && (
                  <ShelfItem size="wide">
                    <MentorSpotlightCard mentor={featured} />
                  </ShelfItem>
                )}
                {featuredList.map((m) => (
                  <ShelfItem key={m.id}>
                    <MentorCard mentor={m} />
                  </ShelfItem>
                ))}
              </Shelf>
            </section>

            <div id="mentor-fields" className="ui-anchor">
              {domains
                .filter((d) => d !== "All")
                .map((field) => {
                  const cfg = FIELD_SHELVES[field];
                  const list = byField.get(field) || [];
                  const id = `shelf-${fieldKey(field)}`;
                  return (
                    <section key={field} className="st-shelf-section" aria-labelledby={id}>
                      <div className="ui-container">
                        <ShelfHead
                          id={id}
                          title={`${field}.`}
                          soft={cfg?.soft}
                          action={
                            <MoreLink onClick={() => showField(field)} aria-label={`See all ${list.length} ${field} mentors`}>
                              See all {list.length}
                            </MoreLink>
                          }
                        />
                      </div>
                      <Shelf label={`${field} mentors`}>
                        {cfg && (
                          <ShelfItem size="feature">
                            <FeatureCard
                              image={cfg.image}
                              alt={cfg.alt}
                              width={1000}
                              height={1333}
                              eyebrow={field}
                              title={cfg.title}
                              text={cfg.text}
                              meta={`${list.length} mentor${list.length === 1 ? "" : "s"} on the roster`}
                            />
                          </ShelfItem>
                        )}
                        {list.map((m) => (
                          <ShelfItem key={m.id}>
                            <MentorCard mentor={m} />
                          </ShelfItem>
                        ))}
                      </Shelf>
                    </section>
                  );
                })}
            </div>
          </>
        ) : (
          <div className="ui-container st-results">
            <div className="ui-results" aria-live="polite">
              <span>
                Showing <strong>{filtered.length}</strong> of <strong>{named.length}</strong> mentors
                {selectedDomain !== "All" && <> in <strong>{selectedDomain}</strong></>}
                {query.trim() && <> for “<strong>{query.trim()}</strong>”</>}
              </span>
              <button type="button" className="ui-link ui-link--sm" onClick={clearFilters}>
                Clear filters
              </button>
            </div>

            <div className="st-grid" ref={gridRef}>
              {filtered.map((m) => (
                <div key={m.id} className="st-grid-item" data-flip-key={m.id}>
                  <MentorCard mentor={m} />
                </div>
              ))}
              {!filtered.length && (
                <div className="ui-empty" role="status">
                  <span className="ui-icon-badge"><SearchX size={24} strokeWidth={1.8} aria-hidden="true" /></span>
                  <p className="ui-title">
                    No mentors match{query.trim() ? ` “${query.trim()}”` : " these filters"}.
                  </p>
                  <p className="ui-body">Try a broader term, another field, or ask the desk to route your question.</p>
                  <div className="ui-btn-row">
                    <Button onClick={clearFilters}>Clear filters</Button>
                    <Button to={ASK} variant="secondary">Ask the desk</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <section id="mentor-help" className="ui-container st-help-section ui-anchor" aria-labelledby="mentor-help-title">
          <ShelfHead id="mentor-help-title" title="Help is here." soft="Whenever you’re unsure whom to ask." />
          <HelpRow
            items={[
              {
                icon: <MessageCircleQuestion size={26} strokeWidth={1.6} />,
                title: "Not sure whom to ask?",
                text: "Write one focused career question — the desk routes it to the right mentor.",
                label: "Send your question to the desk",
                to: ASK,
              },
              {
                icon: <CalendarDays size={26} strokeWidth={1.6} />,
                title: "Live 1:1 at the Congress",
                text: "Selected students meet mentors in person in the hall, 10–13 December in Bhubaneswar.",
                label: "How live 1:1 sessions work",
                to: { pathname: "/resources", hash: "#faq-title" },
              },
            ]}
          />
        </section>
      </section>
    </div>
  );
}
