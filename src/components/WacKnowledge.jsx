import React from "react";
import { ExternalLink } from "lucide-react";
import {
  WAC_AT_A_GLANCE, WAC_EDITIONS, WAC_FAQS, WAC_SOURCES, MEET_THE_MENTORS, HOW_AYURDISHA_WORKS,
} from "../content/wacKnowledge.js";

export function WacGlance({ compact = false }) {
  const rows = compact ? WAC_AT_A_GLANCE.slice(1, 5) : WAC_AT_A_GLANCE;
  return (
    <dl className={`wk-glance${compact ? " wk-glance--compact" : ""}`}>
      {rows.map(r => (
        <div key={r.label} className="wk-glance-row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AyurdishaSteps() {
  return (
    <ol className="wk-steps" data-reveal-stagger>
      {HOW_AYURDISHA_WORKS.map(s => (
        <li key={s.n} className={`wk-step${s.title === "Merge" ? " wk-step--merge" : ""}`} data-reveal>
          <span className="wk-step-num" aria-hidden="true">{s.n}</span>
          <h3 className="wk-step-title"><span className="aym-visually-hidden">Step {s.n}: </span>{s.title}</h3>
          <p>{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function WacFaq({ headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  return (
    <div className="wk-faq">
      <H className="wk-faq-title">Good to know</H>
      <div className="ui-faq-list">
        {WAC_FAQS.map(f => (
          <details key={f.q} className="ui-faq-item">
            <summary className="ui-faq-q">
              <span>{f.q}</span>
              <span className="ui-faq-toggle" aria-hidden="true" />
            </summary>
            <div className="ui-faq-a"><p>{f.a}</p></div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function WacSources() {
  return (
    <p className="wk-sources">
      <span>Source:</span>
      {WAC_SOURCES.map((s, i) => (
        <React.Fragment key={s.url}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.label}<ExternalLink size={12} aria-hidden="true" />
            <span className="aym-visually-hidden"> (opens in a new tab)</span>
          </a>
        </React.Fragment>
      ))}
    </p>
  );
}

/** Full "About WAC" panel for the Knowledge hub. */
export function WacKnowledgePanel({ onAsk }) {
  const latest = WAC_EDITIONS[WAC_EDITIONS.length - 1];
  return (
    <div className="wk-panel">
      <section className="wk-block" aria-labelledby="wk-what">
        <p className="wk-eyebrow">World Ayurveda Congress</p>
        <h2 id="wk-what" className="wk-title">A Congress for the whole of Ayurveda.</h2>
        <p className="wk-lead">
          The World Ayurveda Congress (WAC) is a platform established by the World Ayurveda Foundation to
          propagate Ayurveda globally. The first was held in Kochi in 2002; the {latest.n}th edition comes to {latest.city}.
        </p>
        <WacGlance />
      </section>

      <section className="wk-block" aria-labelledby="wk-editions">
        <h2 id="wk-editions" className="wk-subtitle">Every edition, in one line</h2>
        <ol className="wk-editions">
          {WAC_EDITIONS.map(e => (
            <li key={e.n} className={e.current ? "is-current" : undefined}>
              <span className="wk-ed-year">{e.year}</span>
              <span className="wk-ed-city">{e.city}</span>
              <span className="wk-ed-theme">{e.theme}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="wk-block wk-block--split" aria-labelledby="wk-mtm">
        <div>
          <h2 id="wk-mtm" className="wk-subtitle">{MEET_THE_MENTORS.title}</h2>
          <p className="wk-body">{MEET_THE_MENTORS.body}</p>
          {onAsk && (
            <button type="button" className="aym-btn aym-btn-primary wk-cta" onClick={() => onAsk(null)}>
              Ask your question
            </button>
          )}
        </div>
        <WacFaq />
      </section>

      <section className="wk-block" aria-labelledby="wk-how">
        <h2 id="wk-how" className="wk-subtitle">How AYURDISHA works</h2>
        <AyurdishaSteps />
      </section>

      <WacSources />
    </div>
  );
}
