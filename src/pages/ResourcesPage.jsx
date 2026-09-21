import React, { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { setPageMeta, faqJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import ResourceCard from "../components/ResourceCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { getAllResources } from "../data/resources.js";
import { SITE_FAQS } from "../data/faqs.js";
import { Search } from "lucide-react";

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const location = useLocation();

  const resources = useMemo(() => getAllResources(), []);

  useEffect(() => {
    setPageMeta({
      title: "Ayurveda Podcasts & Career Knowledge Guides · AYURDISHA",
      description:
        "Access recorded mentor talks, clinical practice briefs, PG preparation guidelines, regulatory resources, and frequently asked questions.",
      path: "/resources",
      jsonLd: faqJsonLd(SITE_FAQS),
    });
  }, []);

  useEffect(() => {
    if (location.hash !== "#faq-title") return;
    const t = window.setTimeout(() => {
      document.getElementById("faq-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname]);

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      const matchTab =
        activeTab === "all" ||
        (activeTab === "podcasts" && r.type === "podcast") ||
        (activeTab === "guides" && r.type === "guide");

      const q = query.trim().toLowerCase();
      const matchQuery =
        !q ||
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
              Career Guides ({resources.filter((r) => r.type === "guide").length})
            </button>
            <button
              type="button"
              className={`aym-btn aym-btn-sm ${activeTab === "podcasts" ? "aym-btn-primary" : "aym-btn-ghost"}`}
              onClick={() => setActiveTab("podcasts")}
            >
              Podcasts ({resources.filter((r) => r.type === "podcast").length})
            </button>
          </div>

          <div className="aym-search-box">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              className="aym-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resources..."
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No resources found"
            message="No items matched your filters. Try clearing your search term or switching tabs."
            actionLabel="Reset filters"
            onAction={() => {
              setQuery("");
              setActiveTab("all");
            }}
          />
        ) : (
          <div className="aym-grid-3">
            {filtered.map((r, i) => (
              <ResourceCard key={r.id} resource={r} index={i} />
            ))}
          </div>
        )}

        <section
          className="aym-section aym-resources-faq"
          aria-labelledby="faq-title"
          id="faq"
        >
          <div className="aym-section-header aym-text-center aym-resources-faq-header">
            <p className="aym-eyebrow">Questions & answers</p>
            <h2 id="faq-title" className="aym-display">
              Frequently asked questions
            </h2>
            <p className="aym-section-lead aym-resources-faq-lead">
              Clear answers about the digital Meet the Mentors hall, Ask Desk, tracking, and WAC 2026 —
              career guidance only.
            </p>
          </div>

          <div className="aym-faq-list aym-max-w-3xl aym-resources-faq-list">
            {SITE_FAQS.map((faq) => (
              <details key={faq.q} className="aym-faq-item aym-resources-faq-item">
                <summary className="aym-faq-question aym-resources-faq-question">
                  <span className="aym-resources-faq-q">{faq.q}</span>
                  <span className="aym-resources-faq-toggle" aria-hidden="true" />
                </summary>
                <div className="aym-faq-answer aym-resources-faq-answer">
                  <p>{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
