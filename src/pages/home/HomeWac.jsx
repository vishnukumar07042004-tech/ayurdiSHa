import React, { useEffect, useRef } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import Picture from "../../components/editorial/Picture.jsx";
import Button, { MoreLink } from "../../components/ui/Button.jsx";
import { prefersReducedMotion } from "../../components/editorial/motion.js";
import { WAC } from "../../content/site.js";

const FACTS = [
  { label: "Dates", value: WAC.dates },
  { label: "City", value: `${WAC.city}, ${WAC.region}` },
  { label: "Theme", value: WAC.theme },
  { label: "Organiser", value: WAC.organizer },
];

const HALL = [
  "Knowledge Pods for ten career pathways",
  "Podcast Corner — recorded mentor conversations",
  "Two-Chair Open Theme Stage — published answers",
];

export function HomeWac({ onGo }) {
  return (
    <section id="wac-2026" className="ui-section ui-dark ui-wac" aria-labelledby="wac-title">
      <div className="ui-wac-bg" aria-hidden="true">
        <span className="ui-cta-glow ui-cta-glow--a" />
        <span className="ui-cta-glow ui-cta-glow--b" />
      </div>
      <div className="ui-container">
        <header className="ui-head" data-reveal="scale">
          <p className="ui-eyebrow">WAC 2026 · {WAC.city}</p>
          <h2 id="wac-title" className="ui-headline">
            Part of the <em>11th World Ayurveda Congress.</em>
          </h2>
          <p className="ui-lead">
            AYURDISHA is the Meet the Mentors hall of the {WAC.name} — organised by the{" "}
            {WAC.organizer} with the support of the {WAC.supporters}.
          </p>
        </header>

        <div className="ui-bento ui-wac-grid" data-reveal-stagger>
          <figure className="ui-tile ui-tile--flush ui-wac-photo" data-reveal>
            <div className="ui-wac-media ed-media ed-zoom" data-scroll-img>
              <Picture
                src="/assets/sections/home-wac.webp"
                alt="Delegates seated in a large convention auditorium facing a panel on a forest-green stage"
                width={1152}
                height={864}
                sizes="(max-width: 1023px) 94vw, 700px"
              />
            </div>
          </figure>

          <div className="ui-tile ui-wac-facts-tile" data-reveal>
            <dl className="ui-facts ui-wac-facts">
              {FACTS.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="ui-tile ui-wac-hall" data-reveal>
            <p className="ui-wac-hall-title">Inside the digital hall</p>
            <ul>
              {HALL.map((h) => (
                <li key={h}>
                  <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ui-btn-row ui-btn-row--center ui-wac-actions" data-reveal>
          <Button
            href={WAC.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="on-dark"
            size="lg"
            iconAfter={<ArrowUpRight size={17} aria-hidden="true" />}
          >
            Explore WAC 2026
            <span className="aym-visually-hidden"> (opens the official site in a new tab)</span>
          </Button>
          <Button variant="on-dark-secondary" size="lg" onClick={(e) => onGo("hall", e)}>
            Enter the Hall
          </Button>
        </div>
        <p className="ui-wac-more" data-reveal>
          <MoreLink onDark onClick={(e) => onGo("board", e)}>Read published answers on the Open Theme Stage</MoreLink>
        </p>
      </div>
    </section>
  );
}

const ERAS = [
  { title: "Ancient Knowledge", body: "Insight carried in memory and verse, passed from teacher to student." },
  { title: "Classical Ayurveda", body: "Knowledge gathered into the classical texts that still anchor study today." },
  { title: "Modern Research", body: "Laboratories, clinical studies and pharmacology test and extend the tradition." },
  { title: "Digital Ayurveda", body: "Learning, records and conversation move online and across borders." },
  { title: "Global Collaboration", body: "Practitioners, researchers and institutions meet on shared international platforms." },
  { title: "AYURDISHA", body: "A mentor for every question — the teacher–student conversation, reimagined for a new generation.", current: true },
];

export function HomeTimeline() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersReducedMotion()) {
      el.style.setProperty("--progress", "1");
      return undefined;
    }
    let frame = 0;
    let active = false;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (vh * 0.6 - r.top) / r.height;
      el.style.setProperty("--progress", Math.max(0, Math.min(1, p)).toFixed(3));
    };
    const onScroll = () => {
      if (active && !frame) frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([e]) => {
      active = e.isIntersecting;
      if (active) update();
    });
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="ui-section ui-bg-white ui-timeline" aria-labelledby="timeline-title">
      <div className="ui-container ui-timeline-grid">
        <header className="ui-timeline-head">
          <p className="ui-eyebrow" data-reveal>A living tradition</p>
          <h2 id="timeline-title" className="ui-headline" data-reveal>
            From tradition <em>to tomorrow.</em>
          </h2>
          <p className="ui-lead" data-reveal>
            Ayurveda has always travelled through conversation. AYURDISHA is the newest
            chapter in that long line — not a replacement for it.
          </p>
        </header>

        <ol className="ui-timeline-list" ref={ref}>
          <span className="ui-timeline-track" aria-hidden="true">
            <span className="ui-timeline-fill" />
          </span>
          {ERAS.map((e, i) => (
            <li key={e.title} className={`ui-era${e.current ? " is-current" : ""}`} data-reveal>
              <span className="ui-era-dot" aria-hidden="true" />
              <span className="ui-era-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="ui-era-title">{e.title}</h3>
              <p className="ui-body">{e.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
