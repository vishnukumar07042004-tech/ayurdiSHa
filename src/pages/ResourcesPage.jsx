import React, { useEffect, useState, useMemo } from "react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import ResourceCard from "../components/ResourceCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { getAllResources } from "../data/resources.js";
import { Search } from "lucide-react";

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const resources = useMemo(() => getAllResources(), []);

  useEffect(() => {
    setPageMeta({
      title: "Ayurveda Podcasts & Career Knowledge Guides · AYURDISHA",
      description: "Access recorded mentor talks, clinical practice briefs, PG preparation guidelines, and regulatory resources.",
      path: "/resources",
    });
  }, []);

  const filtered = useMemo(() => {
    return resources.filter(r => {
      const matchTab = activeTab === "all" || 
        (activeTab === "podcasts" && r.type === "podcast") ||
        (activeTab === "guides" && r.type === "guide");
      
      const q = query.trim().toLowerCase();
      const matchQuery = !q || 
        r.title.toLowerCase().includes(q) || 
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);

      return matchTab && matchQuery;
    });
  }, [resources, activeTab, query]);

  return (
    <div className="aym-page aym-py-8">
      <div className="aym-container">
        <Breadcrumbs items={[{ name: "Resources & Knowledge Base" }]} />

        <header className="aym-page-header aym-mb-8">
          <p className="aym-eyebrow">PODCASTS & CAREER BRIEFS</p>
          <h1 className="aym-display">Resources & guides</h1>
          <p className="aym-lead aym-max-w-3xl">
            Mentor conversations, practice checklists, research funding notes, and regulatory references for BAMS graduates.
          </p>
        </header>

        <div className="aym-toolbar aym-mb-8">
          <div className="aym-filter-tabs">
            <button 
              type="button" 
              className={`aym-btn aym-btn-sm ${activeTab === "all" ? "aym-btn-primary" : "aym-btn-ghost"}`}
              onClick={() => setActiveTab("all")}
            >
              All Resources ({resources.length})
            </button>
            <button 
              type="button" 
              className={`aym-btn aym-btn-sm ${activeTab === "guides" ? "aym-btn-primary" : "aym-btn-ghost"}`}
              onClick={() => setActiveTab("guides")}
            >
              Career Guides ({resources.filter(r => r.type === "guide").length})
            </button>
            <button 
              type="button" 
              className={`aym-btn aym-btn-sm ${activeTab === "podcasts" ? "aym-btn-primary" : "aym-btn-ghost"}`}
              onClick={() => setActiveTab("podcasts")}
            >
              Podcasts ({resources.filter(r => r.type === "podcast").length})
            </button>
          </div>

          <div className="aym-search-box">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              className="aym-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search resources..."
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState 
            title="No resources found"
            message={`No items matched your filters. Try clearing your search term or switching tabs.`}
            actionLabel="Reset filters"
            onAction={() => { setQuery(""); setActiveTab("all"); }}
          />
        ) : (
          <div className="aym-grid-3">
            {filtered.map((r, i) => (
              <ResourceCard key={r.id} resource={r} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
