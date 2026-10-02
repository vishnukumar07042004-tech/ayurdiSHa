import React, { useEffect, useState, useMemo, useRef } from "react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import ProgramCard from "../components/ProgramCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { getAllPrograms } from "../data/programs.js";
import { MessageCircleQuestion, Search, Users, X } from "lucide-react";
import { LocalNav } from "../components/ui/PageChrome.jsx";
import { StoreHeader, ShelfHead, Shelf, ShelfItem, QuickNav, FeatureCard, HelpRow } from "../components/ui/Store.jsx";
import FieldIcon from "../components/ui/FieldIcons.jsx";

const ASK = { pathname: "/", hash: "#ask" };

const CATEGORIES = [
  "All",
  "Clinical & Integrative",
  "Academics & PG",
  "Research",
  "Entrepreneurship & Manufacturing",
  "Export & Global",
];

const CATEGORY_ICONS = {
  All: "all",
  "Clinical & Integrative": "clinical",
  "Academics & PG": "academics",
  Research: "research",
  "Entrepreneurship & Manufacturing": "enterprise",
  "Export & Global": "global",
};

function getProgramCategory(code) {
  switch (code) {
    case "T01":
    case "T09":
      return "Clinical & Integrative";
    case "T02":
      return "Academics & PG";
    case "T03":
    case "T10":
      return "Research";
    case "T04":
    case "T05":
    case "T06":
      return "Entrepreneurship & Manufacturing";
    case "T07":
    case "T08":
      return "Export & Global";
    default:
      return "Other";
  }
}

export default function ProgramsPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const programs = useMemo(() => getAllPrograms(), []);
  const heroRef = useRef(null);

  useEffect(() => {
    setPageMeta({
      title: "Ayurveda Career & Academic Programs (10 Core Tracks) · AYURDISHA",
      description: "Explore 10 national AYURDISHA career tracks after BAMS — Clinical Practice, PG Entrance, Research, Entrepreneurship, Manufacturing, Export, and Public Health.",
      path: "/programs",
    });
  }, []);

  const counts = useMemo(() => {
    const map = new Map();
    programs.forEach((p) => {
      const c = getProgramCategory(p.code);
      map.set(c, (map.get(c) || 0) + 1);
    });
    return map;
  }, [programs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return programs.filter((p) => {
      if (selectedCategory !== "All" && getProgramCategory(p.code) !== selectedCategory) {
        return false;
      }
      if (q) {
        const matchesQuery =
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }
      return true;
    });
  }, [programs, query, selectedCategory]);

  const hasFilters = selectedCategory !== "All" || query.trim() !== "";
  const reset = () => {
    setSelectedCategory("All");
    setQuery("");
  };

  return (
    <main className="ui-page ui-programs" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ name: "Career Programs & Tracks" }]} />
      </div>

      <StoreHeader
        ref={heroRef}
        eyebrow="10 national AYURDISHA themes"
        title="Career tracks."
        soft="Ten roadmaps for life after BAMS."
        helpers={[
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Unsure which track fits?",
            label: "Ask the desk",
            to: ASK,
          },
          {
            icon: <Users size={22} strokeWidth={1.7} />,
            text: "Guides for every track",
            label: "Meet the mentors",
            to: "/mentors",
          },
        ]}
      />
      <LocalNav
        title="Programs"
        watchRef={heroRef}
        links={[{ label: "All tracks", href: "#program-tracks" }]}
        cta={{ label: "Ask the desk", to: ASK }}
      />

      <section id="program-tracks" className="st-explorer ui-anchor" aria-label="Career tracks">
        <div className="ui-container st-toolbar-wrap">
          <QuickNav
            label="Filter career tracks by category"
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={CATEGORIES.map((c) => ({
              value: c,
              label: c === "All" ? "All tracks" : c,
              icon: <FieldIcon name={CATEGORY_ICONS[c]} size={34} />,
              count: c === "All" ? programs.length : counts.get(c) || 0,
              countLabel: "tracks",
            }))}
          />
          <div className="st-toolbar">
            <form className="ui-search st-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <Search size={18} className="ui-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="ui-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tracks — Clinical, PG, Research, Export…"
                aria-label="Search career tracks"
                autoComplete="off"
              />
              {query && (
                <button type="button" className="ui-search-action" onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={17} aria-hidden="true" />
                </button>
              )}
            </form>
          </div>
        </div>

        {!hasFilters ? (
          <section className="st-shelf-section" aria-labelledby="tracks-shelf-title">
            <div className="ui-container">
              <ShelfHead
                id="tracks-shelf-title"
                title="All tracks."
                soft="From the clinic to the lab, the classroom and beyond."
              />
            </div>
            <Shelf label="Career tracks">
              <ShelfItem size="feature">
                <FeatureCard
                  image="/assets/sections/programs-workshop.webp"
                  alt="A mentor leading a structured workshop for students seated at long tables with notebooks"
                  width={1400}
                  height={1050}
                  eyebrow="How the tracks work"
                  title="One roadmap. One focused question."
                  text="Read a track, then take your question to a mentor who has walked that path."
                  meta={`${programs.length} national tracks`}
                />
              </ShelfItem>
              {programs.map((p) => (
                <ShelfItem key={p.id}>
                  <ProgramCard program={p} />
                </ShelfItem>
              ))}
            </Shelf>
          </section>
        ) : (
          <div className="ui-container st-results">
            <div className="ui-results" aria-live="polite">
              <span>
                Showing <strong>{filtered.length}</strong> of <strong>{programs.length}</strong> national tracks
              </span>
              <button type="button" className="ui-link ui-link--sm" onClick={reset}>
                Clear filters
              </button>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="No tracks matched your search"
                message={`No career tracks matched “${query || selectedCategory}”. Try a broader term or another theme.`}
                actionLabel="Reset filters"
                onAction={reset}
              />
            ) : (
              <div className="st-grid">
                {filtered.map((p) => (
                  <div key={p.id} className="st-grid-item">
                    <ProgramCard program={p} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ui-container st-help-section">
          <ShelfHead title="Choosing a track?" soft="Two quick ways in." />
          <HelpRow
            items={[
              {
                icon: <MessageCircleQuestion size={26} strokeWidth={1.6} />,
                title: "Ask one clear question",
                text: "The desk routes it to a mentor who works in that track.",
                label: "Go to the Ask Desk",
                to: ASK,
              },
              {
                icon: <Users size={26} strokeWidth={1.6} />,
                title: "Find a mentor by field",
                text: "Clinical, academic, research and pharmacology mentors on the WAC roster.",
                label: "Browse mentors",
                to: "/mentors",
              },
            ]}
          />
        </div>
      </section>
    </main>
  );
}
