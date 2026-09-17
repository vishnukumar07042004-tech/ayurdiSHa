import React from "react";
import { Link } from "react-router-dom";
import {
  getMentorByParam,
  mentorInitials,
  mentorHasProfile,
  mentorPortraitUrl,
  mentorDocumentPhotoUrl,
} from "./mentors.js";

export default function MentorProfile({ mentorId }) {
  const mentor = getMentorByParam(mentorId);

  if (!mentor) {
    return (
      <div className="aym-mentor-profile">
        <section className="aym-mentor-missing" aria-labelledby="mentor-missing-title">
          <h1 id="mentor-missing-title" className="aym-display">
            Mentor not found
          </h1>
          <p>That profile is not on the current WAC tentative roster.</p>
          <p className="aym-mentor-missing-cta">
            <Link to="/mentors" className="aym-btn aym-btn-outline">
              Browse mentors
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const designation = String(mentor.designation || "").trim();
  const affiliation = String(mentor.affiliation || "").trim();
  const expertise = String(mentor.expertise || "").trim();
  const bio = String(mentor.bio || "").trim();
  const credentials = String(mentor.credentials || "").trim();
  const hasProfile = mentorHasProfile(mentor);
  const portrait = mentorPortraitUrl(mentor);
  const documentPhoto = mentorDocumentPhotoUrl(mentor);

  return (
    <article className="aym-mentor-profile">
      <header className="aym-mentor-profile-hero">
        <div className="aym-mentor-avatar aym-mentor-avatar-xl">
          {portrait ? (
            <img
              src={portrait}
              alt={`Portrait of ${mentor.name}`}
              width={88}
              height={88}
            />
          ) : (
            <span aria-hidden="true">{mentorInitials(mentor.name)}</span>
          )}
        </div>
        <div className="aym-mentor-profile-intro">
          <p className="aym-eyebrow aym-mentor-profile-kicker">WAC 2026 Mentor</p>
          <h1 className="aym-display aym-mentor-profile-name">{mentor.name}</h1>
          {designation && <p className="aym-mentor-profile-lead">{designation}</p>}
          {credentials && <p className="aym-mentor-profile-creds">{credentials}</p>}
        </div>
      </header>

      <section className="aym-mentor-profile-main" aria-labelledby="mentor-about-title">
        <h2 id="mentor-about-title" className="aym-visually-hidden">
          About this mentor
        </h2>
        {documentPhoto && (
          <figure className="aym-mentor-document">
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
        {affiliation && (
          <div className="aym-mentor-meta-block">
            <h3>Affiliation</h3>
            <p>{affiliation}</p>
          </div>
        )}
        {expertise && (
          <div className="aym-mentor-meta-block">
            <h3>Expertise</h3>
            <p>{expertise}</p>
          </div>
        )}
        {bio && (
          <div className="aym-mentor-meta-block">
            <h3>Bio</h3>
            <p>{bio}</p>
          </div>
        )}
        {!hasProfile && (
          <p className="aym-mentor-role-soft">Details to follow for this tentative listing.</p>
        )}
      </section>
    </article>
  );
}
