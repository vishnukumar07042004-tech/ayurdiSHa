import React from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Sparkles, ShieldAlert } from "lucide-react";

export default function SiteFooter({ onStaff, variant = "app" }) {
  return (
    <footer className={variant === "land" ? "aym-footer aym-footer-land premium-footer" : "aym-footer premium-footer"}>
      <div className="aym-footer-inner-premium">
        
        {/* Column 1: AYURDISHA & description */}
        <div className="aym-footer-col aym-footer-brand-col">
          <p className="aym-wordmark aym-footer-wordmark-premium">AYURDISHA</p>
          <p className="aym-footer-desc">
            The official digital "Meet the Mentors" hall of the 11th World Ayurveda Congress, Bhubaneswar 2026. 
            A structured career guidance platform for BAMS students, interns, and postgraduates.
          </p>
          <div className="aym-footer-disclaimer-chip">
            <ShieldAlert size={14} className="aym-text-gold" aria-hidden="true" />
            <span>Career guidance platform — not for diagnostic or medical advice.</span>
          </div>
        </div>

        {/* Column 2: EXPLORE */}
        <nav className="aym-footer-col aym-footer-nav-col" aria-label="Explore links">
          <p className="aym-eyebrow-footer">EXPLORE</p>
          <ul className="aym-footer-list">
            <li><Link to="/">Home</Link></li>
            <li><a href="https://worldayurvedacongress.com" target="_blank" rel="noopener noreferrer">About WAC</a></li>
            <li><Link to="/mentors">Mentors</Link></li>
            <li><Link to="/programs">Career Tracks</Link></li>
          </ul>
        </nav>

        {/* Column 3: RESOURCES */}
        <nav className="aym-footer-col aym-footer-nav-col" aria-label="Resources links">
          <p className="aym-eyebrow-footer">RESOURCES</p>
          <ul className="aym-footer-list">
            <li><Link to="/resources">Important Guides</Link></li>
            <li><Link to="/resources#faq-title">FAQs</Link></li>
            <li><Link to="/contact">Help & Support</Link></li>
          </ul>
        </nav>

        {/* Column 4: EVENT INFORMATION */}
        <div className="aym-footer-col aym-footer-event-col">
          <p className="aym-eyebrow-footer">EVENT INFORMATION</p>
          <div className="aym-footer-event-details">
            <div className="aym-footer-event-item">
              <Sparkles size={14} className="aym-text-gold" aria-hidden="true" />
              <strong>11th World Ayurveda Congress</strong>
            </div>
            <div className="aym-footer-event-item">
              <Calendar size={14} className="aym-text-gold" aria-hidden="true" />
              <span>11–13 December 2026</span>
            </div>
            <div className="aym-footer-event-item">
              <MapPin size={14} className="aym-text-gold" aria-hidden="true" />
              <span>Bhubaneswar, Odisha, India</span>
            </div>
          </div>
          
          {onStaff && (
            <div className="aym-footer-staff-wrap">
              <button type="button" className="aym-land-staff-premium" onClick={onStaff}>
                Staff Portal Login
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Bottom bar */}
      <div className="aym-footer-bottom-premium">
        <div className="aym-footer-bottom-inner">
          <p className="aym-footer-copy">
            © 2026 AYURDISHA · Supported by the World Ayurveda Foundation. All rights reserved.
          </p>
          <div className="aym-footer-bottom-links">
            <Link to="/disclaimer">Medical Disclaimer</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
