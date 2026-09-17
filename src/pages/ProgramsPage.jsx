import React, { useEffect, useState, useMemo } from "react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import ProgramCard from "../components/ProgramCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { getAllPrograms } from "../data/programs.js";
import { Search, SlidersHorizontal, BookOpen, Layers } from "lucide-react";

export default function ProgramsPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const programs = useMemo(() => getAllPrograms(), []);

  useEffect(() => {
    setPageMeta({
      title: "Ayurveda Career & Academic Programs (10 Core Tracks) · AYURDISHA",
      description: "Explore 10 national AYURDISHA career tracks after BAMS — Clinical Practice, PG Entrance, Research, Entrepreneurship, Manufacturing, Export, and Public Health.",
      path: "/programs",
    });
  }, []);

  const categories = [
    "All",
    "Clinical & Integrative",
    "Academics & PG",
    "Research",
    "Entrepreneurship & Manufacturing",
    "Export & Global"
  ];

  function getProgramCategory(code) {
    switch(code) {
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    
    return programs.filter(p => {
      // 1. Filter by category
      if (selectedCategory !== "All") {
        const cat = getProgramCategory(p.code);
        if (cat !== selectedCategory) return false;
      }
      
      // 2. Filter by search query
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

  return (
    <div className="aym-page aym-py-8">
      <div className="aym-container">
        <Breadcrumbs items={[{ name: "Career Programs & Tracks" }]} />

        <header className="aym-page-header aym-mb-8">
          <p className="aym-eyebrow">10 NATIONAL AYURDISHA THEMES</p>
          <h1 className="aym-display">Career pathways & programs</h1>
          <p className="aym-lead aym-max-w-3xl">
            Structured national roadmaps covering clinical practice, academic progression, research funding, manufacturing licenses, and global mobility after BAMS.
          </p>
        </header>

        {/* Search and Filters Layout */}
        <div className="aym-programs-toolbar aym-mb-6">
          {/* Search Input Box */}
          <div className="aym-search-box-premium aym-mb-4">
            <Search size={18} className="aym-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="aym-input-premium"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tracks by keyword (e.g. Clinical, PG, Research, Export)..."
              aria-label="Search career tracks"
            />
          </div>

          {/* Premium Tanishq-style Filter Chips */}
          <div className="aym-filter-chips-container" role="tablist" aria-label="Filter career tracks by category">
            <div className="aym-filter-chips-label">
              <SlidersHorizontal size={14} aria-hidden="true" />
              <span>Filter by Theme:</span>
            </div>
            <div className="aym-filter-chips">
              {categories.map((cat) => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={selectedCategory === cat}
                  className={`aym-filter-chip ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Counter */}
        <div className="aym-results-meta aym-mb-6" aria-live="polite">
          <span className="aym-results-count">
            Showing <strong>{filtered.length}</strong> of <strong>{programs.length}</strong> National Tracks
          </span>
          {selectedCategory !== "All" && (
            <button 
              className="aym-btn-clear-filter" 
              onClick={() => { setSelectedCategory("All"); setQuery(""); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Tracks Grid */}
        {filtered.length === 0 ? (
          <EmptyState 
            title="No tracks matched your search"
            message={`No career tracks matched your selection of Category: "${selectedCategory}" and Query: "${query}". Try resetting filters.`}
            actionLabel="Reset Filters"
            onAction={() => {
              setSelectedCategory("All");
              setQuery("");
            }}
          />
        ) : (
          <div className="aym-grid-3 aym-programs-grid-premium">
            {filtered.map((p, i) => (
              <ProgramCard key={p.id} program={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
