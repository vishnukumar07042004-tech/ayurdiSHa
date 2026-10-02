import React from "react";
import { MentorPortrait } from "../../MentorCard.jsx";
import { mentorPublicPath } from "../../mentors.js";
import { mentorFieldLabel } from "../../mentorDomains.js";
import Button from "../ui/Button.jsx";
import { Rings } from "./Ornaments.jsx";

/** Spotlight tile built only from the mentor's roster entry. */
export default function FeaturedMentor({ mentor, headingLevel = 3 }) {
  if (!mentor) return null;
  const H = `h${headingLevel}`;
  const path = mentorPublicPath(mentor);
  const expertise = String(mentor.expertise || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <article className="ui-featured" data-reveal>
      <div className="ui-featured-media">
        <span className="ui-glow ui-glow--sage ui-featured-glow" aria-hidden="true" />
        <Rings className="ui-featured-rings" data-parallax="-30" />
        <MentorPortrait mentor={mentor} size="feature" tone="sage" />
      </div>
      <div className="ui-featured-copy">
        <p className="ui-featured-kicker">
          <span className="ui-tag ui-tag--gold">Featured mentor</span>
          <span className="ui-featured-field">{mentorFieldLabel(mentor)}</span>
        </p>
        <H className="ui-featured-name">{mentor.name}</H>
        {mentor.designation && <p className="ui-featured-role">{mentor.designation}</p>}
        {mentor.affiliation && <p className="ui-featured-inst">{mentor.affiliation}</p>}
        {mentor.bio && <p className="ui-featured-bio">{mentor.bio}</p>}
        {expertise.length > 0 && (
          <ul className="ui-featured-tags" aria-label="Areas of expertise">
            {expertise.map((e) => (
              <li key={e} className="ui-tag ui-tag--neutral">{e}</li>
            ))}
          </ul>
        )}
        <div className="ui-btn-row">
          <Button to={path}>Read full profile</Button>
        </div>
      </div>
    </article>
  );
}
