import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import Button, { MoreLink } from "../../components/ui/Button.jsx";
import { useHeroScroll } from "../../components/editorial/motion.js";
import { WAC } from "../../content/site.js";
import { ASK_DESK, ASK_HREF, ASK_KICKER, AUDIENCE } from "../../content/glossary.js";
import "../../styles/home-hero.css";

export default function HomeHero({ onAsk }) {
  const ref = useRef(null);
  useHeroScroll(ref);

  return (
    <section className="hx" aria-labelledby="hero-title" ref={ref}>
      <div className="hx-frame ui-dark">
        <div className="hx-media">
          <picture>
            <source media="(max-width: 767px)" srcSet="/assets/home/hero-hall-m.webp" type="image/webp" />
            <source media="(max-width: 767px)" srcSet="/assets/home/hero-hall-m.jpg" />
            <source srcSet="/assets/home/hero-hall.webp" type="image/webp" />
            <img
              src="/assets/home/hero-hall.jpg"
              alt="A senior Ayurveda mentor talks with three young students at a lamp-lit oak table in a carved sandstone hall, a Kalinga temple spire glowing through the arches at golden hour"
              width={1920}
              height={1080}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </picture>
        </div>
        <span className="hx-scrim" aria-hidden="true" />

        <div className="hx-inner">
          <div className="hx-copy">
            <p className="hx-eyebrow hx-rise" style={{ "--i": 0 }}>
              <span>{WAC.edition} World Ayurveda Congress</span>
              <span className="hx-eyebrow-sep" aria-hidden="true">·</span>
              <span>{WAC.city}</span>
              <span className="hx-eyebrow-sep" aria-hidden="true">·</span>
              <span>10–13 Dec {WAC.year}</span>
            </p>
            <h1 id="hero-title" className="hx-title hx-rise" style={{ "--i": 1 }}>
              <span className="hx-line">Meet the minds</span>{" "}
              <span className="hx-line">shaping <em className="hx-accent">Ayurveda.</em></span>
            </h1>
            <p className="hx-sub hx-rise" style={{ "--i": 2 }}>
              The Meet the Mentors hall of WAC {WAC.year}. Career guidance from senior Ayurveda mentors for {AUDIENCE}.
            </p>
            <div className="hx-actions hx-rise" style={{ "--i": 3 }}>
              <Link to={ASK_HREF} onClick={onAsk} className="hx-ask" data-ask-cta="">
                <span className="hx-ask-icon" aria-hidden="true">
                  <MessageCircleQuestion size={19} strokeWidth={2} />
                </span>
                <span className="hx-ask-text">
                  <span className="hx-ask-kicker">{ASK_KICKER}</span>{" "}
                  <span className="hx-ask-label">{ASK_DESK}</span>
                </span>
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" className="hx-ask-arrow" />
              </Link>
              <div className="hx-secondary">
                <Button to="/mentors" variant="on-dark-secondary" className="hx-btn-secondary">
                  Explore mentors
                </Button>
                <MoreLink to="/about" onDark className="hx-more">About AYURDISHA</MoreLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
