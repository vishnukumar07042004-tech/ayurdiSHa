import React, { useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { getEventBySlug } from "../data/events.js";
import { setPageMeta, breadcrumbJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import { Calendar, MapPin, Clock } from "lucide-react";
import { getMentorById, mentorPublicPath } from "../mentors.js";
import { MentorPortrait } from "../MentorCard.jsx";
import NotFoundPage from "./NotFoundPage.jsx";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { PageHero, LocalNav, useReveal } from "../components/ui/PageChrome.jsx";

const REGISTER = { pathname: "/", hash: "#register" };

export default function EventDetailPage() {
  const { slug } = useParams();
  const event = getEventBySlug(slug);
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  useReveal(rootRef, [slug]);

  useEffect(() => {
    if (event) {
      setPageMeta({
        title: `${event.title} · WAC 2026 Session · AYURDISHA`,
        description: event.description,
        path: event.path,
        breadcrumbLd: breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Events", path: "/events" },
          { name: event.date, path: event.path }
        ]),
      });
    }
  }, [event]);

  if (!event) return <NotFoundPage message="The requested Congress session could not be found." />;

  const mentors = (event.mentorsInvolved || []).map(getMentorById).filter(Boolean);
  const links = [
    ...(event.highlights ? [{ label: "Highlights", href: "#event-highlights" }] : []),
    ...(mentors.length ? [{ label: "Mentors", href: "#event-mentors" }] : []),
  ];

  return (
    <main className="ui-page ui-detail" id="main" ref={rootRef}>
      <div className="ui-container ui-crumbs">
        <Breadcrumbs
          backTo="/events"
          backLabel="Back to Events"
          items={[
            { label: "Congress Sessions", to: "/events" },
            { label: event.date }
          ]}
        />
      </div>

      <PageHero
        ref={heroRef}
        eyebrow="WAC 2026 Bhubaneswar"
        title={event.title}
        lead={event.description}
        meta={<span className="ui-tag">{event.category}</span>}
        actions={<Button to={REGISTER} size="lg">Register for Hall &amp; Ask Desk</Button>}
      />
      <LocalNav
        title={event.title}
        watchRef={heroRef}
        links={links}
        cta={{ label: "Register", to: REGISTER }}
      />

      <div className="ui-container ui-container--text ui-detail-body">
        <dl className="ui-facts-row" data-reveal>
          <div>
            <dt><Calendar size={16} aria-hidden="true" /> Date</dt>
            <dd>{event.date}</dd>
          </div>
          <div>
            <dt><Clock size={16} aria-hidden="true" /> Timing</dt>
            <dd>{event.time}</dd>
          </div>
          <div>
            <dt><MapPin size={16} aria-hidden="true" /> Location</dt>
            <dd>{event.location}</dd>
          </div>
        </dl>

        {event.highlights && (
          <section id="event-highlights" className="ui-detail-section ui-anchor" data-reveal>
            <h2 className="ui-title">Session Highlights &amp; Focus Areas</h2>
            <ul className="ui-checklist">
              {event.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </section>
        )}

        {mentors.length > 0 && (
          <section id="event-mentors" className="ui-detail-section ui-anchor" data-reveal>
            <h2 className="ui-title">Mentors Present at This Session</h2>
            <ul className="ui-person-list">
              {mentors.map((m) => (
                <li key={m.id} className="ui-person">
                  <span className="ui-person-avatar">
                    <MentorPortrait mentor={m} size="card" tone="sage" />
                  </span>
                  <span className="ui-person-text">
                    <Link to={mentorPublicPath(m)} className="ui-person-name">{m.name}</Link>
                    <span className="ui-person-role">{m.designation || "Ayurveda Specialist"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <aside className="ui-tile ui-tile--dark ui-tile--center ui-page-cta" data-reveal>
          <p className="ui-eyebrow">Take part</p>
          <h2 className="ui-tile-title">Participate in the Digital Hall</h2>
          <p className="ui-body">Register online to submit your question and track your answer ticket for this session.</p>
          <div className="ui-btn-row ui-btn-row--center">
            <Button to={REGISTER} size="lg" variant="on-dark">Register for Hall &amp; Ask Desk</Button>
          </div>
          <MoreLink to="/events" onDark>See the full schedule</MoreLink>
        </aside>
      </div>
    </main>
  );
}
