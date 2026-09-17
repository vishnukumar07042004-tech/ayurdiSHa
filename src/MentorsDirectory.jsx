import React, { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Users, ShieldCheck } from "lucide-react";
import { MENTORS, mentorsWithNames } from "./mentors.js";
import MentorCard from "./MentorCard.jsx";

export default function MentorsDirectory() {
  const [query, setQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("All");
  const named = useMemo(() => mentorsWithNames(MENTORS), []);

  const domains = [
    "All",
    "Clinical Practice",
    "Academics & Samhita",
    "Research & Evidence",
    "Pharmacology & GMP",
  ];

  function getMentorDomain(m) {
    const exp = String(m.expertise || "").toLowerCase();
    const des = String(m.designation || "").toLowerCase();
    const aff = String(m.affiliation || "").toLowerCase();
    const bio = String(m.bio || "").toLowerCase();
    const combined = `${exp} ${des} ${aff} ${bio}`;

    if (
      combined.includes("rasa shastra") ||
      combined.includes("bhaishajya") ||
      combined.includes("dravyaguna") ||
      combined.includes("pharmacology") ||
      combined.includes("gmp") ||
      combined.includes("plant science")
    ) {
      return "Pharmacology & GMP";
    }
    if (
      combined.includes("research") ||
      combined.includes("ccras") ||
      combined.includes("evidence") ||
      combined.includes("clinical trials") ||
      combined.includes("policy") ||
      combined.includes("who")
    ) {
      return "Research & Evidence";
    }
    if (
      combined.includes("samhita") ||
      combined.includes("siddhant") ||
      combined.includes("teaching") ||
      combined.includes("professor") ||
      combined.includes("education") ||
      combined.includes("vice chancellor") ||
      combined.includes("academic")
    ) {
      return "Academics & Samhita";
    }
    if (
      combined.includes("kayachikitsa") ||
      combined.includes("shalya") ||
      combined.includes("panchakarma") ||
      combined.includes("clinical") ||
      combined.includes("consultant") ||
      combined.includes("shalakya") ||
      combined.includes("kaumarbhritya") ||
      combined.includes("nadi") ||
      combined.includes("chikitsa") ||
      combined.includes("practice")
    ) {
      return "Clinical Practice";
    }

    return "Clinical Practice";
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return named.filter((m) => {
      if (selectedDomain !== "All") {
        if (getMentorDomain(m) !== selectedDomain) return false;
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

  return (
    <div className="aym-mentors">
      <header className="aym-page-header aym-mentors-page-header" aria-labelledby="mentors-hero-title">
        <p className="aym-eyebrow">AYURDISHA · WAC BHUBANESWAR 2026</p>
        <h1 id="mentors-hero-title" className="aym-display">
          Meet the Mentors
        </h1>
        <p className="aym-lead aym-max-w-3xl">
          Distinguished clinicians, researchers, and academic leaders guiding BAMS students,
          interns, and practitioners at the 11th World Ayurveda Congress.
        </p>
        <div className="aym-mentors-page-meta" aria-label="Roster summary">
          <span className="aym-mentors-page-stat">
            <Users size={15} aria-hidden="true" />
            <strong>{named.length}</strong>
            <span>mentors</span>
          </span>
          <span className="aym-mentors-page-stat-sep" aria-hidden="true">
            ·
          </span>
          <span className="aym-mentors-page-stat aym-mentors-page-stat-soft">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Tentative WAC roster</span>
          </span>
        </div>
      </header>

      <section
        className="aym-mentors-directory-premium"
        id="mentor-directory"
        aria-labelledby="mentor-directory-title"
      >
        <h2 id="mentor-directory-title" className="aym-visually-hidden">
          Mentor roster
        </h2>

        <div className="aym-mentors-toolbar-premium aym-mb-6">
          <form
            className="aym-search-box-premium aym-mb-4"
            role="search"
            onSubmit={(e) => e.preventDefault()}
          >
            <label className="aym-visually-hidden" htmlFor="mentor-search">
              Search mentors by name, designation, or affiliation
            </label>
            <Search size={18} className="aym-search-icon" aria-hidden="true" />
            <input
              id="mentor-search"
              className="aym-input-premium"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, specialty, or institution…"
              autoComplete="off"
            />
          </form>

          <div
            className="aym-filter-chips-container"
            role="tablist"
            aria-label="Filter mentors by specialty"
          >
            <div className="aym-filter-chips-label">
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Field</span>
            </div>
            <div className="aym-filter-chips">
              {domains.map((dom) => (
                <button
                  key={dom}
                  type="button"
                  role="tab"
                  aria-selected={selectedDomain === dom}
                  className={`aym-filter-chip ${selectedDomain === dom ? "active" : ""}`}
                  onClick={() => setSelectedDomain(dom)}
                >
                  {dom}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="aym-results-meta aym-mb-6" aria-live="polite">
          <span className="aym-results-count">
            Showing <strong>{filtered.length}</strong> of <strong>{named.length}</strong> mentors
          </span>
          {hasFilters && (
            <button
              type="button"
              className="aym-btn-clear-filter"
              onClick={() => {
                setSelectedDomain("All");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="aym-mentors-grid-premium">
          {filtered.map((m, i) => (
            <MentorCard key={m.id} mentor={m} index={i} />
          ))}
          {!filtered.length && (
            <div className="aym-mentors-empty-container" role="status">
              <p className="aym-mentors-empty">
                No mentors match{query.trim() ? ` “${query.trim()}”` : " these filters"}.
              </p>
              <button
                type="button"
                className="aym-btn aym-btn-primary aym-mt-4"
                onClick={() => {
                  setSelectedDomain("All");
                  setQuery("");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
