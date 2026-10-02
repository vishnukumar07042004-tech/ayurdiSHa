import React, { useEffect, useRef } from "react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import {
  Compass,
  Handshake,
  MailCheck,
  MessageCircleQuestion,
  Ticket,
  Users,
} from "lucide-react";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { LocalNav, useReveal } from "../components/ui/PageChrome.jsx";
import { StoreHeader, ShelfHead, FeatureCard } from "../components/ui/Store.jsx";
import CountUp from "../components/editorial/CountUp.jsx";
import { MENTORS, mentorsWithNames } from "../mentors.js";
import { getAllPrograms } from "../data/programs.js";
import { WAC } from "../content/site.js";
import useLiveStats from "../useLiveStats.js";
import {
  ABOUT_HEADER,
  ABOUT_MISSION,
  ABOUT_QUESTIONS,
  ABOUT_WHY,
  ABOUT_STEPS,
  ABOUT_ORGANISERS,
  ABOUT_CLOSING,
} from "../content/about.js";

const ASK = { pathname: "/", hash: "#ask" };
const TRACK = { pathname: "/", hash: "#track" };
const REGISTER = { pathname: "/", hash: "#register" };

const MENTOR_COUNT = mentorsWithNames(MENTORS).length;
const TRACK_COUNT = getAllPrograms().length;

const OFFERS = [
  {
    icon: Users,
    eyebrow: "Hall of mentors",
    title: `${MENTOR_COUNT} mentors. One floor.`,
    body: "Vice Chancellors, institute heads, scientists and senior practitioners on the tentative WAC roster.",
    link: { label: "Browse mentors", to: "/mentors" },
  },
  {
    icon: Handshake,
    eyebrow: "Live at Bhubaneswar",
    title: "Live 1:1 mentor talks.",
    body: "Selected students sit down one-to-one with a mentor on the Congress floor, arranged by the AYURDISHA team.",
    highlight: true,
  },
  {
    icon: MessageCircleQuestion,
    eyebrow: "Ask Desk",
    title: "One question. Real answers.",
    body: "File one focused career question. We email you as soon as a mentor replies.",
    link: { label: "Ask the desk", to: ASK },
  },
  {
    icon: Ticket,
    eyebrow: "Track my answer",
    title: "Your ticket, your reply.",
    body: "Look up your WAC number anytime and read the mentor’s written guidance.",
    link: { label: "Track my answer", to: TRACK },
  },
  {
    icon: Compass,
    eyebrow: "Career tracks",
    title: `${TRACK_COUNT} paths, mapped.`,
    body: "Clinical practice, academics, research, start-ups, GMP, export, practice abroad, public health and more.",
    link: { label: "Explore tracks", to: "/programs" },
  },
];

function LiveValue({ value, loading }) {
  if (value == null) {
    return (
      <span className={loading ? "ui-live-placeholder is-loading" : "ui-live-placeholder"} aria-label={loading ? "Loading" : "Not available right now"}>
        —
      </span>
    );
  }
  return <CountUp value={value} />;
}

export default function AboutPage() {
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  useReveal(rootRef);
  const live = useLiveStats();
  const d = live.data || {};
  const loading = live.status === "loading";

  useEffect(() => {
    setPageMeta({
      title: "About AYURDISHA · 11th World Ayurveda Congress 2026",
      description: "AYURDISHA is the Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026 — career direction for BAMS students, interns and young practitioners.",
      path: "/about",
    });
  }, []);

  const stats = [
    { label: "Mentors", count: MENTOR_COUNT, note: "On the tentative WAC roster" },
    { label: "Career tracks", count: TRACK_COUNT, note: "Mapped for your next step" },
    { label: "Registered students", live: d.registeredStudents, note: "Live from the hall" },
    { label: "Questions asked", live: d.questionsAsked, note: "Live from the Ask Desk" },
  ];

  return (
    <main className="ui-page ui-about" id="main" ref={rootRef}>
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ name: "About AYURDISHA" }]} />
      </div>

      <StoreHeader
        ref={heroRef}
        eyebrow={ABOUT_HEADER.eyebrow}
        title={ABOUT_HEADER.title}
        soft={ABOUT_HEADER.soft}
        className="ab-header"
        helpers={[
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Questions?",
            label: "Ask the desk",
            to: ASK,
          },
          {
            icon: <Handshake size={22} strokeWidth={1.7} />,
            text: "10–13 December, Bhubaneswar",
            label: "Live 1:1 at WAC 2026",
            href: "#about-get",
          },
        ]}
      />
      <LocalNav
        title="About"
        watchRef={heroRef}
        links={[
          { label: "Mission", href: "#about-mission" },
          { label: "What you get", href: "#about-get" },
          { label: "How it works", href: "#about-how" },
          { label: "Why it matters", href: "#about-why" },
        ]}
        cta={{ label: "Register", to: REGISTER }}
      />

      <section id="about-mission" className="st-section ui-anchor" aria-label="Our mission">
        <div className="ui-container">
          <div className="st-split" data-reveal>
            <FeatureCard
              className="st-fcard--hero"
              as="h2"
              image="/assets/sections/about-team.webp"
              alt="AYURDISHA volunteers welcoming arriving BAMS students at a hall entrance decorated with marigold garlands"
              width={1800}
              height={1013}
              sizes="(max-width: 1023px) 94vw, 700px"
              eyebrow="The Meet the Mentors hall"
              title={ABOUT_MISSION.imageTitle}
              text={ABOUT_MISSION.imageText}
            />
            <div className="st-panel ab-mission">
              <p className="ab-eyebrow">{ABOUT_MISSION.eyebrow}</p>
              <p className="ab-statement">{ABOUT_MISSION.statement}</p>
              <p className="ui-body">{ABOUT_MISSION.body}</p>
              <MoreLink to="/welcome">Take the welcome tour</MoreLink>
            </div>
          </div>
        </div>
      </section>

      <section id="about-get" className="st-section ui-anchor" aria-labelledby="about-get-title">
        <div className="ui-container">
          <ShelfHead id="about-get-title" title="What you get at WAC 2026." soft="Five ways the hall works for you." />
          <ul className="ab-offers" data-reveal-stagger>
            {OFFERS.map(({ icon: Icon, eyebrow, title, body, link, highlight }) => (
              <li key={eyebrow} className={`ab-offer${highlight ? " ab-offer--dark" : ""}`} data-reveal>
                <span className="ab-offer-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.7} />
                </span>
                <p className="ab-offer-eyebrow">{eyebrow}</p>
                <h3 className="ab-offer-title">{title}</h3>
                <p className="ab-offer-body">{body}</p>
                {link && <MoreLink to={link.to} onDark={highlight} className="ab-offer-link">{link.label}</MoreLink>}
                {highlight && <p className="ab-offer-note">By selection — not automatic for every delegate.</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about-how" className="st-section ui-anchor" aria-labelledby="about-how-title">
        <div className="ui-container">
          <ShelfHead id="about-how-title" title="How it works." soft="Four steps to a written answer." />
          <ol className="ab-steps" data-reveal-stagger>
            {ABOUT_STEPS.map((s) => (
              <li key={s.n} className="ab-step" data-reveal>
                <span className="ab-step-n" aria-hidden="true">{s.n}</span>
                <h3 className="ab-step-title">
                  <span className="aym-visually-hidden">Step {s.n}: </span>
                  {s.title}
                </h3>
                <p className="ab-step-body">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="ab-fine" data-reveal>
            <MailCheck size={15} strokeWidth={1.8} aria-hidden="true" />
            Career and education guidance for Congress delegates — never medical advice or treatment.
          </p>
        </div>
      </section>

      <section id="about-why" className="st-section ui-anchor" aria-labelledby="about-why-title">
        <div className="ui-container">
          <ShelfHead id="about-why-title" title="Why it matters." soft="Real numbers from the hall." />
          <div className="ab-why" data-reveal-stagger>
            <div className="st-panel st-panel--dark ab-why-panel" data-reveal>
              <h3 className="st-panel-title">{ABOUT_WHY.title}</h3>
              <ul className="ab-questions">
                {ABOUT_QUESTIONS.map((q) => <li key={q}><em>{q}</em></li>)}
              </ul>
              <p className="ui-body">{ABOUT_WHY.body}</p>
            </div>
            <dl className="ab-stats" aria-busy={loading || undefined}>
              {stats.map((s) => (
                <div key={s.label} className="ab-stat" data-reveal>
                  <dt className="ab-stat-label">{s.label}</dt>
                  <dd className="ab-stat-value">
                    {s.count != null ? <CountUp value={s.count} /> : <LiveValue value={s.live} loading={loading} />}
                  </dd>
                  <dd className="ab-stat-note">{s.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="st-section" aria-labelledby="about-team-title">
        <div className="ui-container">
          <div className="st-panel st-panel--surface ab-team" data-reveal>
            <div>
              <p className="ab-eyebrow">The team</p>
              <h2 id="about-team-title" className="st-panel-title">{ABOUT_ORGANISERS.title}</h2>
            </div>
            <div className="ab-team-copy">
              <p className="ui-body">{ABOUT_ORGANISERS.body}</p>
              <p className="ui-body">{ABOUT_ORGANISERS.wac}</p>
              <MoreLink href={WAC.officialUrl} target="_blank" rel="noopener noreferrer">
                Visit the official WAC site
              </MoreLink>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-section ui-section--tight ui-section--last">
        <div className="ui-container">
          <div className="ui-tile ui-tile--dark ui-tile--center ui-page-cta" data-reveal>
            <p className="ui-eyebrow">{ABOUT_CLOSING.eyebrow}</p>
            <h2 className="ui-headline">{ABOUT_CLOSING.title}</h2>
            <p className="ui-lead">{ABOUT_CLOSING.lead}</p>
            <div className="ui-btn-row ui-btn-row--center">
              <Button to="/mentors" size="lg" variant="on-dark">Meet the Mentors</Button>
              <Button to={REGISTER} size="lg" variant="on-dark-secondary">Register</Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
