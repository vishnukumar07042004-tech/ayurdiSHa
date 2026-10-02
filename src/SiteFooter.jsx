import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { WAC, PLACEHOLDERS } from "./content/site.js";
import { HOME_SECTIONS } from "./AppHeader.jsx";
import { Watermark } from "./components/editorial/Ornaments.jsx";

export default function SiteFooter({ onStaff, variant = "app" }) {
  return (
    <footer className={`ed-footer ui-footer${variant === "land" ? " ed-footer--land" : ""}`}>
      <Watermark className="ed-footer-watermark" />
      <div className="ui-footer-inner">
        <div className="ui-footer-top">
          <div className="ui-footer-brand">
            <p className="ui-footer-word">AYURDISHA</p>
            <p className="ui-footer-tag">Meet the Mentors · WAC 2026</p>
          </div>
          <p className="ui-footer-desc">
            The official digital “Meet the Mentors” hall of the 11th World Ayurveda Congress,
            Bhubaneswar 2026. A structured career guidance platform for BAMS students,
            interns, and postgraduates.
          </p>
        </div>

        <p className="ui-footer-note">
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Career guidance platform — not for diagnostic or medical advice.</span>
        </p>

        <div className="ui-footer-grid">
          <nav className="ui-footer-col" aria-label="Take part">
            <p className="ui-footer-label">Take part</p>
            <ul>
              <li><Link to="/#register">Register</Link></li>
              <li><Link to="/#ask">Ask Desk</Link></li>
              <li><Link to="/#track">Track my answer</Link></li>
              <li><Link to="/#board">Open theme stage</Link></li>
            </ul>
          </nav>

          <nav className="ui-footer-col" aria-label="Explore">
            <p className="ui-footer-label">Explore</p>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/mentors">Mentors</Link></li>
              <li><Link to="/" state={{ section: HOME_SECTIONS.how }}>How It Works</Link></li>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/programs">Career Tracks</Link></li>
            </ul>
          </nav>

          <nav className="ui-footer-col" aria-label="Resources">
            <p className="ui-footer-label">Resources</p>
            <ul>
              <li><Link to="/resources">Important Guides</Link></li>
              <li><Link to="/resources#faq-title">FAQs</Link></li>
              <li><Link to="/events">Congress Events</Link></li>
              <li><Link to="/contact">Help &amp; Support</Link></li>
            </ul>
          </nav>

          <div className="ui-footer-col">
            <p className="ui-footer-label">WAC 2026</p>
            <ul className="ui-footer-facts">
              <li><strong>{WAC.shortName}</strong></li>
              <li>{WAC.dates}</li>
              <li>{WAC.city}, {WAC.region}</li>
              <li className="ui-footer-theme">“{WAC.theme}”</li>
            </ul>
          </div>

          <div className="ui-footer-col">
            <p className="ui-footer-label">Connect</p>
            <ul>
              <li>
                <a href={WAC.officialUrl} target="_blank" rel="noopener noreferrer">
                  Official WAC 2026 site <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </li>
              <li><Link to="/contact">Contact the help desk</Link></li>
              {PLACEHOLDERS.socialLinks.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
                </li>
              ))}
            </ul>
            {onStaff && (
              <button type="button" className="ui-footer-staff" onClick={onStaff}>
                Staff Portal Login
              </button>
            )}
          </div>
        </div>

        <div className="ui-footer-bottom">
          <p>© 2026 AYURDISHA · Supported by the World Ayurveda Foundation. All rights reserved.</p>
          <ul>
            <li><Link to="/privacy">Privacy</Link></li>
            <li><Link to="/terms">Terms</Link></li>
            <li><Link to="/disclaimer">Medical Disclaimer</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
