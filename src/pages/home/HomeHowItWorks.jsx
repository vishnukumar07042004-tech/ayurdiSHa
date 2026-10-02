import React from "react";
import { Compass, Handshake, MessageCircleQuestion } from "lucide-react";
import { MoreLink } from "../../components/ui/Button.jsx";
import { ShelfHead } from "../../components/ui/Store.jsx";

const STEPS = [
  {
    n: "01",
    title: "Discover",
    Icon: Compass,
    body:
      "Walk the digital hall first — browse mentor profiles, career tracks, podcast conversations and published answers on the Open Theme Stage.",
    action: { label: "Enter the Hall", tab: "hall" },
  },
  {
    n: "02",
    title: "Choose",
    Icon: MessageCircleQuestion,
    body:
      "Register with a verified email to receive your WAC number, then file one focused career question at the Ask Desk.",
    action: { label: "Register & ask", tab: "register" },
  },
  {
    n: "03",
    title: "Connect",
    Icon: Handshake,
    body:
      "A mentor replies in writing and your ticket updates. At Bhubaneswar, selected students are invited to a live one-to-one talk, arranged by the AYURDISHA team.",
    action: { label: "Track my answer", tab: "track" },
  },
];

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
            soft="Three steps to a meaningful conversation."
          />
        </div>

        <ol className="ui-bento ui-how-steps" data-reveal-stagger>
          {STEPS.map(({ n, title, Icon, body, action }) => (
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
              <div className="ui-tile-foot">
                <MoreLink onClick={(e) => onGo(action.tab, e)}>{action.label}</MoreLink>
              </div>
            </li>
          ))}
        </ol>

        <p className="ui-how-note ui-small" data-reveal>
          Career and education guidance for Congress delegates — never medical advice or treatment.
        </p>
      </div>
    </section>
  );
}
