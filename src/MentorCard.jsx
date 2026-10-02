import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  mentorInitials,
  mentorAffiliationSnippet,
  mentorPortraitUrl,
  mentorPublicPath,
} from "./mentors.js";
import { getMentorDomain } from "./mentorDomains.js";
import { Lotus, Sprig } from "./components/editorial/Ornaments.jsx";
import FieldIcon, { fieldKey } from "./components/ui/FieldIcons.jsx";

/**
 * Portrait when the roster has one; otherwise a monogram plate. With `field`,
 * the plate is tinted per mentor field and carries that field's line motif.
 */
export function MentorPortrait({ mentor, size = "card", tone = "ivory", field }) {
  const portrait = mentorPortraitUrl(mentor);
  const initials = mentorInitials(mentor.name);
  const key = field ? fieldKey(field) : null;
  return (
    <div className={`ed-portrait ed-portrait--${size} ed-portrait--${tone}${key ? ` st-plate st-plate--${key}` : ""}`}>
      {portrait ? (
        <img
          src={portrait}
          alt={`Portrait of ${mentor.name}`}
          loading="lazy"
          decoding="async"
          width={480}
          height={600}
        />
      ) : key ? (
        <div className="st-plate-inner" aria-hidden="true">
          <span className="st-plate-halo" />
          <FieldIcon name={key} size={220} strokeWidth={0.9} className="st-plate-motif" />
          <Sprig className="st-plate-sprig" />
          <span className="st-plate-initials">{initials}</span>
        </div>
      ) : (
        <div className="ed-portrait-plate" aria-hidden="true">
          <Lotus className="ed-portrait-lotus" />
          <Sprig className="ed-portrait-sprig" />
          <span className="ed-portrait-initials">{initials}</span>
          <span className="ed-portrait-mark">AYURDISHA · WAC 2026</span>
        </div>
      )}
    </div>
  );
}

/** Focus areas from the roster's expertise text (never invented). */
export function mentorFocus(mentor, max = 2) {
  return String(mentor.expertise || "")
    .split(/[;,]/)
    .map((s) => s.replace(/\([^)]*\)/g, " ").replace(/^\s*(MD|MS|BAMS|Ph\.?\s?D\.?)\s+(\(Ayu\.\)\s*)?/i, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

export default function MentorCard({ mentor, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  const designation = String(mentor.designation || "").trim();
  const affiliation = mentorAffiliationSnippet(mentor.affiliation, 80);
  const field = getMentorDomain(mentor);
  const focus = mentorFocus(mentor);
  const path = mentorPublicPath(mentor);

  return (
    <article className={`st-mcard st-mcard--${fieldKey(field)}`} data-cursor="meet">
      <div className="st-mcard-copy">
        <p className="st-mcard-eyebrow">{field}</p>
        <H className="st-mcard-name">
          <Link to={path}>{mentor.name}</Link>
        </H>
        <p className={`st-mcard-role${designation ? "" : " is-soft"}`}>
          {designation || "Mentor · WAC 2026 roster"}
        </p>
        {affiliation && <p className="st-mcard-inst">{affiliation}</p>}
        <p className="st-mcard-meta">
          {focus.length ? focus.join(" · ") : "Profile details to be announced"}
        </p>
      </div>
      <div className="st-mcard-media">
        <MentorPortrait mentor={mentor} field={field} />
      </div>
      <span className="st-mcard-cta" aria-hidden="true">
        View profile <ChevronRight size={16} strokeWidth={2.2} className="ui-link-chev" />
      </span>
    </article>
  );
}

/** Wide shelf card for the spotlight mentor: portrait left, roster copy right. */
export function MentorSpotlightCard({ mentor, headingLevel = 3 }) {
  if (!mentor) return null;
  const H = `h${headingLevel}`;
  const field = getMentorDomain(mentor);
  const focus = mentorFocus(mentor, 3);
  const path = mentorPublicPath(mentor);
  return (
    <article className="st-spot" data-cursor="meet">
      <div className="st-spot-media">
        <MentorPortrait mentor={mentor} field={field} size="feature" />
      </div>
      <div className="st-spot-copy">
        <p className="st-mcard-eyebrow st-spot-eyebrow">Spotlight · {field}</p>
        <H className="st-spot-name">
          <Link to={path}>{mentor.name}</Link>
        </H>
        {mentor.designation && <p className="st-spot-role">{mentor.designation}</p>}
        {mentor.affiliation && <p className="st-spot-inst">{mentorAffiliationSnippet(mentor.affiliation, 120)}</p>}
        {mentor.bio && <p className="st-spot-bio">{mentor.bio}</p>}
        {focus.length > 0 && <p className="st-mcard-meta">{focus.join(" · ")}</p>}
        <span className="st-mcard-cta st-spot-cta" aria-hidden="true">
          Read full profile <ChevronRight size={16} strokeWidth={2.2} className="ui-link-chev" />
        </span>
      </div>
    </article>
  );
}
