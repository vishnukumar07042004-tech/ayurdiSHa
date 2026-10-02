import React, { useEffect, useState, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { setPageMeta, faqJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import ResourceCard from "../components/ResourceCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { getAllResources } from "../data/resources.js";
import { SITE_FAQS } from "../data/faqs.js";
import { MessageCircleQuestion, Search, Ticket, X } from "lucide-react";
import { LocalNav, useReveal } from "../components/ui/PageChrome.jsx";
import { StoreHeader, ShelfHead, Shelf, ShelfItem, QuickNav, FeatureCard, HelpRow } from "../components/ui/Store.jsx";
import FieldIcon from "../components/ui/FieldIcons.jsx";

const ASK = { pathname: "/", hash: "#ask" };

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const location = useLocation();
  const faqRef = useRef(null);
  const heroRef = useRef(null);

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

  useReveal(faqRef);

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

  const guides = useMemo(() => resources.filter((r) => r.type === "guide"), [resources]);
  const podcasts = useMemo(() => resources.filter((r) => r.type === "podcast"), [resources]);
  const hasFilters = query.trim() !== "" || activeTab !== "all";

  const reset = () => {
    setQuery("");
    setActiveTab("all");
  };

  return (
    <main className="ui-page ui-resources" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ name: "Resources & Knowledge Base" }]} />
      </div>

      <StoreHeader
        ref={heroRef}
        eyebrow="Podcasts & career briefs"
        title="Resources."
        soft="Guides and talks for your next step."
        helpers={[
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Can’t find your answer?",
            label: "Ask the desk",
            to: ASK,
          },
          {
            icon: <Ticket size={22} strokeWidth={1.7} />,
            text: "Already asked?",
            label: "Track my answer",
            to: { pathname: "/", hash: "#track" },
          },
        ]}
      />
      <LocalNav
        title="Resources"
        watchRef={heroRef}
        links={[
          { label: "Library", href: "#resource-library" },
          { label: "FAQs", href: "#faq" },
        ]}
        cta={{ label: "Ask the desk", to: ASK }}
      />

      <section id="resource-library" className="st-explorer ui-anchor" aria-label="Resource library">
        <div className="ui-container st-toolbar-wrap">
          <QuickNav
            label="Filter resources by type"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: "all", label: "All resources", icon: <FieldIcon name="all" size={34} />, count: resources.length, countLabel: "resources" },
              { value: "guides", label: "Career guides", icon: <FieldIcon name="guide" size={34} />, count: guides.length, countLabel: "guides" },
              { value: "podcasts", label: "Podcasts", icon: <FieldIcon name="talk" size={34} />, count: podcasts.length, countLabel: "podcasts" },
            ]}
          />
          <div className="st-toolbar">
            <form className="ui-search st-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <Search size={18} className="ui-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="ui-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources"
                aria-label="Search resources"
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
          <>
            <section className="st-shelf-section" aria-labelledby="guides-shelf-title">
              <div className="ui-container">
                <ShelfHead id="guides-shelf-title" title="Career guides." soft="One brief for every national track." />
              </div>
              <Shelf label="Career guides">
                <ShelfItem size="feature">
                  <FeatureCard
                    image="/assets/sections/resources-desk.webp"
                    alt="A study desk with open Ayurveda textbooks, handwritten notes, a brass bowl of dried herbs and a cup of tea"
                    width={1400}
                    height={1050}
                    eyebrow="Start here"
                    title="Read before you ask."
                    text="Short, sourced briefs so your question to a mentor goes further."
                    meta={`${guides.length} guides`}
                  />
                </ShelfItem>
                {guides.map((r) => (
                  <ShelfItem key={r.id}>
                    <ResourceCard resource={r} />
                  </ShelfItem>
                ))}
              </Shelf>
            </section>

            {podcasts.length > 0 && (
              <section className="st-shelf-section" aria-labelledby="talks-shelf-title">
                <div className="ui-container">
                  <ShelfHead id="talks-shelf-title" title="Mentor talks." soft="Conversations recorded for the hall." />
                </div>
                <Shelf label="Mentor talks">
                  {podcasts.map((r) => (
                    <ShelfItem key={r.id} size="wide">
                      <ResourceCard resource={r} />
                    </ShelfItem>
                  ))}
                </Shelf>
              </section>
            )}
          </>
        ) : (
          <div className="ui-container st-results">
            <div className="ui-results" aria-live="polite">
              <span>
                Showing <strong>{filtered.length}</strong> of <strong>{resources.length}</strong> resources
              </span>
              <button type="button" className="ui-link ui-link--sm" onClick={reset}>
                Clear filters
              </button>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="No resources found"
                message="No items matched your filters. Try clearing your search term or switching tabs."
                actionLabel="Reset filters"
                onAction={reset}
              />
            ) : (
              <div className="st-grid">
                {filtered.map((r) => (
                  <div key={r.id} className="st-grid-item">
                    <ResourceCard resource={r} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section
        ref={faqRef}
        className="ui-section ui-bg-surface ui-faq ui-anchor"
        aria-labelledby="faq-title"
        id="faq"
      >
        <div className="ui-container st-faq-grid">
          <header className="st-faq-head" data-reveal>
            <p className="ui-eyebrow">Questions &amp; answers</p>
            <h2 id="faq-title" className="st-title st-faq-title ui-anchor">
              Frequently asked questions.
              <span className="st-title-soft"> Answered in plain words.</span>
            </h2>
            <p className="ui-body st-faq-lead">
              Meet the Mentors, Ask Desk, Track, the Hall, theme stage, registration, and live 1-on-1 talks at WAC Bhubaneswar.
            </p>
            <HelpRow
              className="st-faq-help"
              items={[
                {
                  icon: <MessageCircleQuestion size={24} strokeWidth={1.6} />,
                  title: "Still unsure?",
                  label: "Ask the desk",
                  to: ASK,
                },
              ]}
            />
          </header>

          <div className="ui-faq-list" data-reveal>
            {SITE_FAQS.map((faq, i) => (
              <details key={i} className="ui-faq-item">
                <summary className="ui-faq-q">
                  <span>{faq.q}</span>
                  <span className="ui-faq-toggle" aria-hidden="true" />
                </summary>
                <div className="ui-faq-a">
                  <p>{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
