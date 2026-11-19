import React, { useEffect, useRef } from "react";
import {
  Compass, Handshake, Layers, LockKeyhole, MessageCircleQuestion, Mic2, ShieldCheck, Sparkles, Tag, Ticket, Users,
} from "lucide-react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { LocalNav, useReveal } from "../components/ui/PageChrome.jsx";
import { StoreHeader, ShelfHead } from "../components/ui/Store.jsx";
import { HALL_MAP_SCROLL_KEY } from "../components/hallMapZones.js";
import { WAC } from "../content/site.js";
import {
  HOW_AUDIENCE,
  HOW_CLOSE,
  HOW_FAQS,
  HOW_INTRO,
  HOW_JOURNEY,
  HOW_NAV,
  HOW_PATH,
  HOW_PLACES,
  HOW_PRIVACY,
  HOW_QUESTION,
  HOW_STEPS,
} from "../content/howItWorks.js";
import "../styles/how-it-works.css";

const ICONS = {
  Ask: MessageCircleQuestion,
  Tag: Tag,
  Cluster: Layers,
  Spotlight: Sparkles,
  Answer: Mic2,
  Meet: Users,
  Act: Handshake,
};

const TAB_HREF = {
  hall: { pathname: "/", hash: "#hall" },
  register: { pathname: "/", hash: "#register" },
  ask: { pathname: "/", hash: "#ask" },
  track: { pathname: "/", hash: "#track" },
  board: { pathname: "/", hash: "#board" },
};

function scrollToId(id, event) {
  const el = document.getElementById(id);
  if (!el) return;
  event?.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function rememberHallMap() {
  try { sessionStorage.setItem(HALL_MAP_SCROLL_KEY, "1"); } catch { /* private mode */ }
}

export default function HowItWorksPage() {
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  useReveal(rootRef);

  useEffect(() => {
    setPageMeta({
      title: "How it works · AYURDISHA · WAC 2026",
      description:
        "Register with a verified email, ask one career question, and track a written or recorded answer via the answer bank — not a personal mentor guarantee. Live talks in Bhubaneswar are by invitation.",
      path: HOW_PATH,
    });
  }, []);

  return (
    <main className="ui-page hiw" id="main" ref={rootRef}>
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ label: "How it works" }]} />
      </div>

      <StoreHeader
        ref={heroRef}
        eyebrow={HOW_INTRO.eyebrow}
        title={HOW_INTRO.title}
        soft={HOW_INTRO.soft}
        titleId="hiw-title"
        helpers={[
          {
            icon: <Compass size={22} strokeWidth={1.7} />,
            text: "Look around first",
            label: "Enter the Hall",
            to: TAB_HREF.hall,
            onClick: rememberHallMap,
          },
          {
            icon: <Ticket size={22} strokeWidth={1.7} />,
            text: "Email code, then one question",
            label: "Register & ask",
            to: TAB_HREF.register,
          },
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Already have a ticket?",
            label: "Track my answer",
            to: TAB_HREF.track,
          },
        ]}
      >
        <p className="hiw-lead">{HOW_INTRO.lead}</p>
        <nav className="hiw-jumps" aria-label="On this page">
          {HOW_NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`} onClick={(e) => scrollToId(item.id, e)}>
              {item.label}
            </a>
          ))}
        </nav>
      </StoreHeader>

      <LocalNav
        title="How it works"
        watchRef={heroRef}
        links={HOW_NAV.map((item) => ({ label: item.label, href: `#${item.id}` }))}
        cta={{ label: "Register", to: TAB_HREF.register }}
      />

      <section id="hiw-steps" className="st-section ui-anchor" aria-labelledby="hiw-steps-title">
        <div className="ui-container">
          <ShelfHead id="hiw-steps-title" title="Seven steps." soft="Ask → Tag → Cluster → Spotlight → Answer → Meet → Act." />
          <ol className="hiw-steps" data-reveal-stagger>
            {HOW_STEPS.map((step) => {
              const Icon = ICONS[step.title] || Compass;
              const to = step.action.path || TAB_HREF[step.action.tab] || TAB_HREF.hall;
              return (
                <li key={step.n} className="ui-tile ui-tile--surface hiw-step" data-reveal>
                  <div className="hiw-step-top">
                    <span className="ui-icon-badge">
                      <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="hiw-step-num" aria-hidden="true">{step.n}</span>
                  </div>
                  <h3 className="ui-tile-title">
                    <span className="aym-visually-hidden">Step {step.n}: </span>
                    {step.title}
                  </h3>
                  <p className="hiw-step-lead">{step.lead}</p>
                  <dl className="hiw-meta">
                    <div>
                      <dt>What you do</dt>
                      <dd>{step.do}</dd>
                    </div>
                    <div>
                      <dt>What you get</dt>
                      <dd>{step.get}</dd>
                    </div>
                    <div>
                      <dt>How long</dt>
                      <dd>{step.time}</dd>
                    </div>
                  </dl>
                  <div className="ui-tile-foot">
                    <MoreLink
                      to={to}
                      onClick={step.action.tab === "hall" ? rememberHallMap : undefined}
                    >
                      {step.action.label}
                    </MoreLink>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="hiw-fine" data-reveal>
            Career and education guidance — never medical advice or treatment.
          </p>
        </div>
      </section>

      <section id="hiw-who" className="st-section ui-anchor hiw-band" aria-labelledby="hiw-who-title">
        <div className="ui-container">
          <ShelfHead id="hiw-who-title" title={HOW_AUDIENCE.title} soft={HOW_AUDIENCE.soft} />
          <p className="hiw-prose" data-reveal>{HOW_AUDIENCE.lead}</p>
          <ul className="hiw-people" data-reveal-stagger>
            {HOW_AUDIENCE.groups.map((group) => (
              <li key={group.kicker} className="ui-tile hiw-person" data-reveal>
                <p className="hiw-kicker">{group.kicker}</p>
                <h3 className="hiw-person-title">{group.title}</h3>
                <p className="ui-body">{group.body}</p>
              </li>
            ))}
          </ul>
          <p className="hiw-note" data-reveal>{HOW_AUDIENCE.note}</p>
        </div>
      </section>

      <section id="hiw-question" className="st-section ui-anchor" aria-labelledby="hiw-question-title">
        <div className="ui-container">
          <ShelfHead id="hiw-question-title" title={HOW_QUESTION.title} soft={HOW_QUESTION.soft} />
          <div className="hiw-split">
            <div className="hiw-question-main" data-reveal>
              <p className="hiw-prose">{HOW_QUESTION.lead}</p>
              <ul className="hiw-quotes">
                {HOW_QUESTION.examples.map((example) => (
                  <li key={example}>
                    <blockquote>
                      <p>{example}</p>
                    </blockquote>
                  </li>
                ))}
              </ul>
              <MoreLink to={TAB_HREF.register}>Register & ask</MoreLink>
            </div>
            <aside className="ui-tile ui-tile--surface hiw-avoid" data-reveal aria-labelledby="hiw-avoid-title">
              <span className="ui-icon-badge" aria-hidden="true">
                <ShieldCheck size={22} strokeWidth={1.8} />
              </span>
              <h3 id="hiw-avoid-title" className="hiw-person-title">{HOW_QUESTION.avoidTitle}</h3>
              <ul>
                {HOW_QUESTION.avoid.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section id="hiw-after" className="st-section ui-anchor hiw-band" aria-labelledby="hiw-after-title">
        <div className="ui-container">
          <ShelfHead id="hiw-after-title" title={HOW_JOURNEY.title} soft={HOW_JOURNEY.soft} />
          <p className="hiw-prose" data-reveal>{HOW_JOURNEY.lead}</p>
          <ol className="hiw-journey" data-reveal>
            {HOW_JOURNEY.steps.map((step) => (
              <li key={step.n}>
                <span className="hiw-journey-n" aria-hidden="true">{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="hiw-note" data-reveal>
            If a DISHA draft was approved, the answer includes this line: “{HOW_JOURNEY.dishaNote}” Track uses these words for where a ticket stands: {HOW_JOURNEY.statuses.join(", ")}.
          </p>
        </div>
      </section>

      <section id="hiw-privacy" className="st-section ui-anchor" aria-labelledby="hiw-privacy-title">
        <div className="ui-container">
          <ShelfHead id="hiw-privacy-title" title={HOW_PRIVACY.title} soft={HOW_PRIVACY.soft} />
          <p className="hiw-prose" data-reveal>{HOW_PRIVACY.lead}</p>
          <ul className="hiw-privacy" data-reveal-stagger>
            {HOW_PRIVACY.points.map((point) => (
              <li key={point.title} className="hiw-privacy-item" data-reveal>
                <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="hiw-fine" data-reveal>
            <MoreLink to="/privacy">Read the privacy note</MoreLink>
          </p>
        </div>
      </section>

      <section id="hiw-congress" className="st-section ui-anchor hiw-band" aria-labelledby="hiw-congress-title">
        <div className="ui-container">
          <ShelfHead id="hiw-congress-title" title={HOW_PLACES.title} soft={HOW_PLACES.soft} />
          <div className="hiw-places" data-reveal-stagger>
            <article className="ui-tile hiw-place" data-reveal>
              <p className="hiw-kicker">{HOW_PLACES.online.kicker}</p>
              <h3 className="hiw-person-title">{HOW_PLACES.online.title}</h3>
              <ul>
                {HOW_PLACES.online.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <MoreLink to={TAB_HREF.track}>Track my answer</MoreLink>
            </article>
            <article className="ui-tile ui-tile--dark hiw-place" data-reveal>
              <p className="hiw-kicker">{HOW_PLACES.floor.kicker}</p>
              <h3 className="hiw-person-title">{HOW_PLACES.floor.title}</h3>
              <ul>
                {HOW_PLACES.floor.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              <p className="hiw-place-note">By selection — not automatic for every delegate.</p>
            </article>
          </div>
          <p className="hiw-fine" data-reveal>
            <MoreLink href={WAC.officialUrl} target="_blank" rel="noopener noreferrer">
              Official WAC site
              <span className="aym-visually-hidden"> (opens in a new tab)</span>
            </MoreLink>
          </p>
        </div>
      </section>

      <section id="hiw-faq" className="st-section ui-anchor" aria-labelledby="hiw-faq-title">
        <div className="ui-container hiw-faq-wrap">
          <ShelfHead id="hiw-faq-title" title="Questions people ask first." soft="Straight answers, no extra process." />
          <div className="ui-faq-list" data-reveal>
            {HOW_FAQS.map((faq) => (
              <details key={faq.q} className="ui-faq-item">
                <summary className="ui-faq-q">
                  <span>{faq.q}</span>
                  <span className="ui-faq-toggle" aria-hidden="true" />
                </summary>
                <div className="ui-faq-a"><p>{faq.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="st-section st-section--last" aria-labelledby="hiw-close-title">
        <div className="ui-container">
          <div className="ui-tile ui-tile--dark ui-tile--center ui-page-cta" data-reveal>
            <p className="ui-eyebrow">{HOW_CLOSE.eyebrow}</p>
            <h2 id="hiw-close-title" className="ui-headline">{HOW_CLOSE.title}</h2>
            <p className="ui-lead">{HOW_CLOSE.lead}</p>
            <div className="ui-btn-row ui-btn-row--center">
              <Button to={TAB_HREF.register} size="lg" variant="on-dark">Register & ask</Button>
              <Button to={TAB_HREF.hall} size="lg" variant="on-dark-secondary" onClick={rememberHallMap}>Enter the Hall</Button>
              <Button to={TAB_HREF.track} size="lg" variant="on-dark-secondary">Track my answer</Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
