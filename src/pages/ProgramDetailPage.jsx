import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getProgramBySlug } from "../data/programs.js";
import { setPageMeta, breadcrumbJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import { BookOpen, ArrowUpRight, CheckCircle2, AlertTriangle, IndianRupee } from "lucide-react";
import NotFoundPage from "./NotFoundPage.jsx";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { PageHero, LocalNav, useReveal } from "../components/ui/PageChrome.jsx";

const ASK = { pathname: "/", hash: "#ask" };

function sectionIcon(title) {
  if (title.includes("opportunities")) return CheckCircle2;
  if (title.includes("Challenges")) return AlertTriangle;
  if (title.includes("Income")) return IndianRupee;
  return BookOpen;
}

export default function ProgramDetailPage() {
  const { slug } = useParams();
  const program = getProgramBySlug(slug);
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  useReveal(rootRef, [slug]);

  useEffect(() => {
    if (program) {
      setPageMeta({
        title: `[${program.code}] ${program.title} — Career Track · AYURDISHA`,
        description: program.tagline,
        path: program.path,
        breadcrumbLd: breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Programs", path: "/programs" },
          { name: `Track ${program.code}`, path: program.path }
        ]),
      });
    }
  }, [program]);

  if (!program) return <NotFoundPage message="The requested career track does not exist." />;

  const links = program.sections.map((sec, idx) => ({
    label: sec.title.split(/[&(:]/)[0].trim(),
    href: `#track-section-${idx}`,
  }));
  if (program.references?.length) links.push({ label: "References", href: "#track-references" });

  return (
    <main className="ui-page ui-detail" id="main" ref={rootRef}>
      <div className="ui-container ui-crumbs">
        <Breadcrumbs
          backTo="/programs"
          backLabel="Back to Programs"
          items={[
            { label: "Programs & Tracks", to: "/programs" },
            { label: `Track ${program.code}` }
          ]}
        />
      </div>

      <PageHero
        ref={heroRef}
        eyebrow="National career pathway"
        title={program.title}
        lead={program.tagline}
        meta={<span className="ui-tag ui-tag--gold">Track {program.code}</span>}
        actions={
          <>
            <Button to={ASK} size="lg">Ask about Track {program.code}</Button>
            <Button to="/programs" size="lg" variant="secondary">All tracks</Button>
          </>
        }
      />
      <LocalNav
        title={`Track ${program.code}`}
        watchRef={heroRef}
        links={links.slice(0, 4)}
        cta={{ label: "Ask a mentor", to: ASK }}
      />

      <div className="ui-container ui-container--text ui-detail-body">
        {program.sections.map((sec, idx) => {
          const Icon = sectionIcon(sec.title);
          return (
            <section key={idx} id={`track-section-${idx}`} className="ui-detail-section ui-anchor" data-reveal>
              <div className="ui-detail-h">
                <span className="ui-icon-badge ui-icon-badge--sm"><Icon size={18} strokeWidth={1.9} aria-hidden="true" /></span>
                <h2 className="ui-title">{sec.title}</h2>
              </div>
              <ul className="ui-checklist">
                {sec.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          );
        })}

        {program.references && program.references.length > 0 && (
          <section id="track-references" className="ui-tile ui-tile--surface ui-detail-refs ui-anchor" data-reveal>
            <h2 className="ui-title">Official References &amp; Publications</h2>
            <ul>
              {program.references.map((ref, i) => (
                <li key={i}>
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ui-link">
                    {ref.label} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <aside className="ui-tile ui-tile--dark ui-tile--center ui-page-cta" data-reveal>
          <p className="ui-eyebrow">Ask Desk</p>
          <h2 className="ui-tile-title">Have a specific question about {program.title}?</h2>
          <p className="ui-body">Submit your question to the AYURDISHA Ask Desk and receive guidance from experienced mentors.</p>
          <div className="ui-btn-row ui-btn-row--center">
            <Button to={ASK} size="lg" variant="on-dark">Ask a Mentor About Track {program.code}</Button>
          </div>
          <MoreLink to="/programs" onDark>Explore other tracks</MoreLink>
        </aside>
      </div>
    </main>
  );
}
