import React from "react";
import { Compass, Handshake, LockKeyhole, MessageCircleQuestion, Ticket } from "lucide-react";
import { MoreLink } from "../../components/ui/Button.jsx";
import { ShelfHead } from "../../components/ui/Store.jsx";
import { HOW_PATH, HOW_JOURNEY, HOW_AUDIENCE } from "../../content/howItWorks.js";

const STEPS = [
  {
    n: "01",
    title: "Discover",
    Icon: Compass,
    body:
      "Walk the digital hall first — browse mentor profiles, career tracks, podcast conversations and published answers on the open theme stage. No account, and no time limit.",
    detail: "Use the hall map to find Register, Ask, Mentors, Podcast and Track before you spend your one focused question.",
    action: { label: "Enter the Hall", tab: "hall" },
  },
  {
    n: "02",
    title: "Choose",
    Icon: MessageCircleQuestion,
    body:
      "Register with a verified email. A 6-digit code, valid for 10 minutes, issues your pass — a WAC Delegate ID if your inbox is on the Congress list, otherwise an AYURDISHA pass number. Then file one focused career question at the Ask Desk.",
    detail: "One decision per ticket: your stage, the options you are weighing, and what a useful answer should help you do in the next 90 days.",
    action: { label: "Register & ask", tab: "register" },
  },
  {
    n: "03",
    title: "Connect",
    Icon: Handshake,
    body:
      "Every valid question gets a written or recorded answer via clustered composites and the answer bank — not a promise of a personal mentor letter. Track stays on Received until the desk publishes. At Bhubaneswar, selected in-person delegates may be invited to a live talk.",
    detail: "Nothing is published until a person at the desk approves it. Automation never decides live access. A live invite is separate and not automatic.",
    action: { label: "Track my answer", tab: "track" },
  },
];

const AFTER = HOW_JOURNEY.steps.slice(0, 5).map((s) => ({ n: s.n, title: s.title, body: s.body }));

export default function HomeHowItWorks({ onGo }) {
  return (
    <section id="how-it-works" className="ui-section ui-bg-white ui-how" aria-labelledby="how-title">
      <span className="ui-glow ui-glow--sage ui-how-glow" aria-hidden="true" />
      <div className="ui-container">
        <div data-reveal>
          <ShelfHead
            id="how-title"
            className="st-shelf-head--lg"
            title="How it works."
            soft="Ask → Tag → Cluster → Spotlight → Answer → Meet → Act — then what the desk does with your ticket."
          />
          <p className="ui-how-lead" data-reveal>
            {HOW_AUDIENCE.lead}
          </p>
        </div>

        <ol className="ui-bento ui-how-steps" data-reveal-stagger>
          {STEPS.map(({ n, title, Icon, body, detail, action }) => (
            <li key={n} className="ui-tile ui-tile--surface ui-how-step" data-reveal>
              <div className="ui-how-top">
                <span className="ui-icon-badge"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="ui-how-num" aria-hidden="true">{n}</span>
              </div>
              <h3 className="ui-tile-title">
                <span className="aym-visually-hidden">Step {n}: </span>
                {title}
              </h3>
              <p className="ui-body">{body}</p>
              <p className="ui-how-detail">{detail}</p>
              <div className="ui-tile-foot">
                <MoreLink onClick={(e) => onGo(action.tab, e)}>{action.label}</MoreLink>
              </div>
            </li>
          ))}
        </ol>

        <div className="ui-how-after" data-reveal>
          <div className="ui-how-after-head">
            <span className="ui-icon-badge" aria-hidden="true">
              <Ticket size={22} strokeWidth={1.8} />
            </span>
            <div>
              <h3 className="ui-how-after-title">{HOW_JOURNEY.title}</h3>
              <p className="ui-how-after-soft">{HOW_JOURNEY.soft}</p>
            </div>
          </div>
          <ol className="ui-how-journey">
            {AFTER.map((step) => (
              <li key={step.n}>
                <span className="ui-how-journey-n" aria-hidden="true">{step.n}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="ui-how-privacy-line">
            <LockKeyhole size={16} strokeWidth={1.9} aria-hidden="true" />
            Email and mobile stay masked on your profile. WAC organisation details appear only if you allow sharing.
          </p>
        </div>

        <p className="ui-how-note" data-reveal>
          <MoreLink to={HOW_PATH}>Read the full guide</MoreLink>
          <span className="ui-how-note-aside">Who can ask, a good question, privacy, FAQ, and the Congress floor.</span>
        </p>

        <p className="ui-how-note" data-reveal>
          <MoreLink onClick={(e) => {
            onGo("hall", e);
            window.setTimeout(() => document.getElementById("hall-map")?.scrollIntoView({ block: "start" }), 120);
          }}>
            See the hall map
          </MoreLink>
        </p>

        <p className="ui-how-note ui-small" data-reveal>
          Career and education guidance for Congress delegates — never medical advice or treatment.
        </p>
      </div>
    </section>
  );
}
