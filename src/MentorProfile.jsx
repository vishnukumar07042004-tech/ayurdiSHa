import React, { useRef } from "react";
import { UserX } from "lucide-react";
import {
  getMentorByParam,
  mentorHasProfile,
  mentorDocumentPhotoUrl,
  mentorAffiliationSnippet,
} from "./mentors.js";
import { getMentorDomain, mentorFieldLabel } from "./mentorDomains.js";
import { MentorPortrait } from "./MentorCard.jsx";
import Button, { MoreLink } from "./components/ui/Button.jsx";
import { LocalNav, useReveal } from "./components/ui/PageChrome.jsx";

const ASK = { pathname: "/", hash: "#ask" };

export default function MentorProfile({ mentorId }) {
  const mentor = getMentorByParam(mentorId);
  const heroRef = useRef(null);
  const rootRef = useRef(null);
  useReveal(rootRef, [mentorId]);

  if (!mentor) {
    return (
      <div className="ui-container ui-profile-missing">
        <section className="ui-empty" aria-labelledby="mentor-missing-title">
          <span className="ui-icon-badge"><UserX size={24} strokeWidth={1.8} aria-hidden="true" /></span>
          <h1 id="mentor-missing-title" className="ui-title">Mentor not found</h1>
          <p className="ui-body">That profile is not on the current WAC tentative roster.</p>
          <div className="ui-btn-row">
            <Button to="/mentors">Browse mentors</Button>
          </div>
        </section>
      </div>
    );
  }

  const designation = String(mentor.designation || "").trim();
  const affiliation = String(mentor.affiliation || "").trim();
  const expertise = String(mentor.expertise || "").trim();
  const expertiseList = expertise.split(";").map((s) => s.trim()).filter(Boolean);
  const bio = String(mentor.bio || "").trim();
  const credentials = String(mentor.credentials || "").trim();
  const hasProfile = mentorHasProfile(mentor);
  const documentPhoto = mentorDocumentPhotoUrl(mentor);
  const field = getMentorDomain(mentor);

  const links = [
    ...(bio ? [{ label: "About", href: "#mentor-bio" }] : []),
    ...(expertiseList.length ? [{ label: "Expertise", href: "#mentor-expertise" }] : []),
    ...(affiliation ? [{ label: "Affiliation", href: "#mentor-affiliation" }] : []),
  ];

  return (
    <article className="ui-profile" ref={rootRef}>
      <header className="ui-profile-hero" ref={heroRef}>
        <div className="ui-page-hero-glow" aria-hidden="true" />
        <div className="ui-container ui-profile-hero-inner">
          <div className="ui-profile-portrait ui-rise" style={{ "--i": 0 }}>
            <MentorPortrait mentor={mentor} size="feature" tone="sage" />
          </div>
          <div className="ui-profile-intro">
            <p className="ui-profile-kicker ui-rise" style={{ "--i": 1 }}>
              <span className="ui-tag ui-tag--gold">WAC 2026 Mentor</span>
              <span className="ui-tag">{mentorFieldLabel(mentor)}</span>
            </p>
            <h1 className="ui-display ui-profile-name ui-rise" style={{ "--i": 2 }}>{mentor.name}</h1>
            {designation && <p className="ui-profile-role ui-rise" style={{ "--i": 3 }}>{designation}</p>}
            {credentials && <p className="ui-profile-creds ui-rise" style={{ "--i": 3 }}>{credentials}</p>}
            <div className="ui-btn-row ui-rise" style={{ "--i": 4 }}>
              <Button to={ASK} size="lg">Ask the desk</Button>
              <Button to="/mentors" size="lg" variant="secondary">All mentors</Button>
            </div>
          </div>
        </div>
      </header>

      <LocalNav title={mentor.name} watchRef={heroRef} links={links} cta={{ label: "Ask the desk", to: ASK }} />

      <div className="ui-container ui-profile-body">
        <dl className="ui-bento ui-profile-facts" data-reveal-stagger>
          <div className="ui-tile ui-tile--surface" data-reveal>
            <dt>Field</dt>
            <dd>{field}</dd>
          </div>
          <div className="ui-tile ui-tile--surface" data-reveal>
            <dt>Institution</dt>
            <dd>{affiliation ? mentorAffiliationSnippet(affiliation, 70) : "To be confirmed"}</dd>
          </div>
          <div className="ui-tile ui-tile--surface" data-reveal>
            <dt>Roster</dt>
            <dd>Tentative · WAC 2026</dd>
          </div>
        </dl>

        <div className="ui-profile-sections">
          {bio && (
            <section id="mentor-bio" className="ui-profile-section" data-reveal>
              <h2 className="ui-profile-h">About</h2>
              <p className="ui-profile-bio">{bio}</p>
            </section>
          )}
          {expertiseList.length > 0 && (
            <section id="mentor-expertise" className="ui-profile-section" data-reveal>
              <h2 className="ui-profile-h">Expertise</h2>
              <ul className="ui-profile-tags">
                {expertiseList.map((e) => <li key={e} className="ui-tag ui-tag--neutral">{e}</li>)}
              </ul>
            </section>
          )}
          {affiliation && (
            <section id="mentor-affiliation" className="ui-profile-section" data-reveal>
              <h2 className="ui-profile-h">Affiliation</h2>
              <p className="ui-body">{affiliation}</p>
            </section>
          )}
          {documentPhoto && (
            <figure className="ui-profile-document" data-reveal>
              <img
                src={documentPhoto}
                alt={`Published academic credentials for ${mentor.name}`}
                width={800}
                height={600}
                loading="lazy"
                decoding="async"
              />
              <figcaption>Published academic credentials</figcaption>
            </figure>
          )}
          {!hasProfile && (
            <p className="ui-body ui-profile-soft">Details to follow for this tentative listing.</p>
          )}
        </div>

        <aside className="ui-tile ui-tile--dark ui-tile--center ui-profile-next" data-reveal>
          <p className="ui-eyebrow">Next step</p>
          <p className="ui-tile-title">Have a career question for a mentor?</p>
          <p className="ui-body">Questions go through the Ask Desk — staff route each one to the right mentor.</p>
          <div className="ui-tile-foot">
            <Button to={ASK} variant="on-dark" size="lg">Ask the desk</Button>
            <MoreLink to="/mentors" onDark>Browse all mentors</MoreLink>
          </div>
        </aside>
      </div>
    </article>
  );
}
