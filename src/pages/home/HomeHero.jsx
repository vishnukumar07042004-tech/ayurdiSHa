import React, { useRef } from "react";
import { ArrowDown } from "lucide-react";
import Picture from "../../components/editorial/Picture.jsx";
import Button, { MoreLink } from "../../components/ui/Button.jsx";
import { Branch, Rings } from "../../components/editorial/Ornaments.jsx";
import { useHeroScroll } from "../../components/editorial/motion.js";
import { scrollToSection } from "../../AppHeader.jsx";
import { WAC } from "../../content/site.js";

const SEAL_TEXT = `${WAC.theme} · WAC ${WAC.year} · `;

function ThemeSeal() {
  return (
    <svg className="ui-hero-seal-svg" viewBox="0 0 120 120" role="img" aria-label={`Congress theme: ${WAC.theme}`}>
      <defs>
        <path id="hero-seal-ring" d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" />
      </defs>
      <circle cx="60" cy="60" r="57" className="ui-hero-seal-edge" />
      <circle cx="60" cy="60" r="33" className="ui-hero-seal-inner" />
      <text className="ui-hero-seal-ring">
        <textPath href="#hero-seal-ring" textLength="286" lengthAdjust="spacing">
          {SEAL_TEXT.toUpperCase()}
        </textPath>
      </text>
      <text x="60" y="58" textAnchor="middle" className="ui-hero-seal-num">{WAC.edition}</text>
      <text x="60" y="72" textAnchor="middle" className="ui-hero-seal-cap">WAC</text>
    </svg>
  );
}

export default function HomeHero({ mentorCount, onAsk }) {
  const ref = useRef(null);
  useHeroScroll(ref);

  const facts = [
    { label: "Dates", value: "10–13 Dec 2026" },
    { label: "Venue", value: `${WAC.city}, Odisha` },
    { label: "WAC roster", value: `${mentorCount} mentors` },
    { label: "Format", value: "Live 1:1 mentoring" },
  ];

  return (
    <section className="ui-hero" aria-labelledby="hero-title" ref={ref}>
      <div className="ui-hero-bg" aria-hidden="true">
        <span className="ui-glow ui-glow--sage ui-hero-glow-a" />
        <span className="ui-glow ui-glow--gold ui-hero-glow-b" />
        <Branch className="ui-hero-branch" />
      </div>

      <div className="ui-container ui-hero-grid">
        <div className="ui-hero-copy">
          <p className="ui-eyebrow ui-hero-eyebrow ed-hero-anim" style={{ "--i": 0 }}>
            <span className="ui-hero-eyebrow-text">
              <span>11th World Ayurveda Congress</span>
              <span className="ui-hero-eyebrow-sep" aria-hidden="true"> · </span>
              <span>Bhubaneswar 2026</span>
            </span>
          </p>
          <h1 id="hero-title" className="ui-hero-title">
            <span className="ed-line"><span style={{ "--i": 1 }}>Meet the minds</span></span>
            <span className="ed-line"><span style={{ "--i": 2 }}>shaping</span></span>
            <span className="ed-line"><em style={{ "--i": 3 }}>Ayurveda.</em></span>
          </h1>
          <p className="ui-hero-sub ed-hero-anim" style={{ "--i": 4 }}>
            The Meet the Mentors hall of WAC 2026 — for BAMS students, interns and young practitioners.
          </p>
          <div className="ui-btn-row ui-hero-actions ed-hero-anim" style={{ "--i": 5 }}>
            <Button to="/mentors" size="lg">Explore Mentors</Button>
            <Button to="/about" size="lg" variant="secondary">About AYURDISHA</Button>
          </div>
          <p className="ui-hero-aside ed-hero-anim" style={{ "--i": 6 }}>
            <span>Have a career question?</span>
            <MoreLink to={{ pathname: "/", hash: "#ask" }} onClick={onAsk}>Ask the desk</MoreLink>
          </p>
          <dl className="ui-hero-facts ed-hero-anim" style={{ "--i": 7 }}>
            {facts.map((f) => (
              <div key={f.label} className="ui-hero-fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="ui-hero-stage">
          <Rings className="ui-hero-rings" data-parallax="-18" />
          <span className="ui-hero-keyline" aria-hidden="true" data-parallax="-12" />

          <figure className="ui-hero-shot ui-hero-shot--main ed-media" data-scroll-img>
            <Picture
              src="/assets/home/home-hero.png"
              alt="A senior Ayurveda mentor in conversation with students at a Meet the Mentors table, World Ayurveda Congress"
              width={1024}
              height={1024}
              priority
              sizes="(max-width: 959px) 92vw, 720px"
            />
          </figure>

          <figure className="ui-hero-shot ui-hero-shot--side ed-media" data-parallax="-34">
            <Picture
              src="/assets/home/mentors-gathering.png"
              alt="A veteran vaidya talking with a young practitioner in a quiet mentoring booth"
              width={1152}
              height={864}
              sizes="(max-width: 959px) 44vw, 300px"
            />
          </figure>

          <figure className="ui-hero-shot ui-hero-shot--top ed-media" data-parallax="28">
            <Picture
              src="/assets/home/congress-booths.png"
              alt=""
              width={1152}
              height={864}
              sizes="200px"
            />
          </figure>

          <div className="ui-hero-seal" data-parallax="22">
            <ThemeSeal />
          </div>

          <p className="ui-hero-chip" data-parallax="-22">
            <span className="ui-hero-dot" aria-hidden="true" />
            Live 1:1 talks · selected students
          </p>
        </div>
      </div>

      <button type="button" className="ui-scroll-cue" onClick={() => scrollToSection("at-a-glance")}>
        <span className="aym-visually-hidden">Scroll to AYURDISHA at a glance</span>
        <ArrowDown size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
