import React from "react";
import Picture from "../../components/editorial/Picture.jsx";
import CountUp from "../../components/editorial/CountUp.jsx";
import { MoreLink } from "../../components/ui/Button.jsx";
import { WAC } from "../../content/site.js";
import useLiveStats, { formatUpdated } from "../../useLiveStats.js";

export function HomeIdea() {
  return (
    <section id="the-idea" className="ui-section ui-bg-white ui-idea" aria-labelledby="idea-title">
      <div className="ui-container">
        <header className="ui-head" data-reveal="scale">
          <p className="ui-eyebrow">The idea</p>
          <h2 id="idea-title" className="ui-headline">
            Where timeless Ayurvedic wisdom meets <em>meaningful human connection.</em>
          </h2>
        </header>

        <div className="ui-bento" data-reveal-stagger>
          <figure className="ui-tile ui-tile--flush ui-span-7 ui-idea-photo" data-reveal>
            <div className="ui-idea-media ed-media ed-zoom" data-scroll-img>
              <Picture
                src="/assets/sections/home-idea.webp"
                alt="A senior vaidya on a sunlit college veranda sharing an open classical text with two BAMS students"
                width={1152}
                height={864}
                sizes="(max-width: 1023px) 94vw, 700px"
              />
            </div>
            <figcaption className="ui-photo-caption">Knowledge, passed from one generation to the next.</figcaption>
          </figure>

          <div className="ui-tile ui-tile--surface ui-span-5 ui-idea-copy" data-reveal>
            <p className="ui-idea-q">
              Should I prepare for MD entrance? Open a clinic? Join research or public health? Practise abroad?
            </p>
            <p className="ui-body">
              Every year thousands of BAMS graduates finish internship with the same questions.
              AYURDISHA answers them the way Ayurveda has always been passed on — person to person.
            </p>
            <p className="ui-body">
              It connects mentees with leaders of the profession: vice chancellors, heads of
              institutes, CCRAS scientists and veteran practitioners.
            </p>
            <p className="ui-body">
              Register once, ask one focused question, and follow the written reply online —
              before, during or after the Congress.
            </p>
            <div className="ui-tile-foot">
              <MoreLink to="/about">Learn more about AYURDISHA</MoreLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

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

export function HomeStats({ mentorCount, trackCount }) {
  const live = useLiveStats();
  const d = live.data || {};
  const loading = live.status === "loading";
  const updated = live.status === "ok" ? formatUpdated(d.updatedAt, live.now) : "";
  const answeredNote = d.questionsAnswered != null && d.questionsAsked
    ? `${d.questionsAnswered} answered by mentors so far`
    : "One focused career question each, answered in writing";

  const facts = [
    { value: WAC.edition, label: "World Ayurveda Congress", note: WAC.theme },
    { value: WAC.year, label: WAC.city, note: WAC.dates },
    { count: mentorCount, label: "Mentors", note: "On the tentative WAC roster" },
    { count: trackCount, label: "Career tracks", note: "Clinical, academic, research & more" },
  ];

  return (
    <section id="at-a-glance" className="ui-section ui-section--tight ui-bg-canvas ui-stats" aria-labelledby="stats-title">
      <div className="ui-container">
        <h2 id="stats-title" className="aym-visually-hidden">AYURDISHA at a glance</h2>
        <div className="ui-stats-bento" data-reveal-stagger>
          <dl className="ui-tile ui-live ui-live--feature" data-reveal>
            <span className="ui-glow ui-glow--sage ui-live-glow" aria-hidden="true" />
            <div className="ui-live-head">
              <span className={`ui-live-badge${live.status === "error" ? " is-off" : ""}`}>
                <span className="ui-live-dot" aria-hidden="true" />
                {live.status === "error" ? "Offline" : "Live"}
              </span>
              {updated && <span className="ui-live-time">{updated}</span>}
            </div>
            <div className="ui-live-body">
              <dt className="ui-live-label">Registered students</dt>
              <dd className="ui-live-value"><LiveValue value={d.registeredStudents} loading={loading} /></dd>
              <dd className="ui-live-note">Verified registrations for the Meet the Mentors hall</dd>
            </div>
          </dl>

          <dl className="ui-tile ui-live ui-live--questions" data-reveal>
            <div className="ui-live-head">
              <span className="ui-live-kicker">Ask Desk</span>
            </div>
            <div className="ui-live-body">
              <dt className="ui-live-label">Questions asked</dt>
              <dd className="ui-live-value"><LiveValue value={d.questionsAsked} loading={loading} /></dd>
              <dd className="ui-live-note">{answeredNote}</dd>
            </div>
          </dl>

          <dl className="ui-stats-facts" data-reveal-stagger>
            {facts.map((s) => (
              <div key={s.label} className="ui-tile ui-stat" data-reveal>
                <dt className="ui-stat-label">{s.label}</dt>
                <dd className="ui-stat-value">
                  {s.count != null ? <CountUp value={s.count} /> : s.value}
                </dd>
                <dd className="ui-stat-note">{s.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
