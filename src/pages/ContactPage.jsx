import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, KeyRound, MessageCircleQuestion, Ticket, UserPlus, Users } from "lucide-react";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import { StoreHeader, ShelfHead, FeatureCard, HelpRow } from "../components/ui/Store.jsx";

const ROUTES = [
  {
    to: "/#register",
    icon: UserPlus,
    title: "Register",
    body: "Register with a real email and receive your issued WAC registration number.",
    cta: "Register",
  },
  {
    to: "/#ask",
    icon: MessageCircleQuestion,
    title: "Ask Desk",
    body: "File one career question. The desk routes it to the right mentor.",
    cta: "Go to the Ask Desk",
  },
  {
    to: "/#track",
    icon: Ticket,
    title: "Track my answer",
    body: "Enter your Ask Desk ticket to see whether your question is received, with a mentor, or published.",
    cta: "Track my answer",
  },
];

export default function ContactPage() {
  useEffect(() => {
    setPageMeta({
      title: "Contact · AYURDISHA · WAC 2026",
      description: "Reach the AYURDISHA Meet the Mentors desk through Register and Ask Desk at the 11th World Ayurveda Congress.",
      path: "/contact",
    });
  }, []);

  return (
    <main className="ui-page ui-contact" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ label: "Contact" }]} />
      </div>

      <StoreHeader
        eyebrow="Meet the Mentors desk"
        title="Contact the desk."
        soft="Three ways to reach a mentor."
        helpers={[
          {
            icon: <MessageCircleQuestion size={22} strokeWidth={1.7} />,
            text: "Quickest route",
            label: "Go to the Ask Desk",
            to: { pathname: "/", hash: "#ask" },
          },
          {
            icon: <Users size={22} strokeWidth={1.7} />,
            text: "Common questions",
            label: "Read the FAQs",
            to: { pathname: "/resources", hash: "#faq-title" },
          },
        ]}
      />

      <section className="st-section" aria-labelledby="contact-routes-title">
        <div className="ui-container">
          <div className="st-split st-contact-split">
            <FeatureCard
              className="st-fcard--hero"
              as="h2"
              image="/assets/sections/contact-desk.webp"
              alt="A volunteer at a wooden help desk in the congress hall answering a student's question"
              width={1400}
              height={1050}
              sizes="(max-width: 1023px) 94vw, 700px"
              eyebrow="Help desk"
              title="Real people, one clear route."
              text="AYURDISHA does not publish a public inbox on this site. Delegates register with a real email, then file one career question at the Ask Desk."
            />
            <div className="st-contact-routes">
              <h2 id="contact-routes-title" className="aym-visually-hidden">Ways to reach the desk</h2>
              {ROUTES.map(({ to, icon: Icon, title, body, cta }) => (
                <article key={title} className="st-route">
                  <span className="st-help-icon" aria-hidden="true">
                    <Icon size={24} strokeWidth={1.7} />
                  </span>
                  <div className="st-route-copy">
                    <h3 className="st-route-title">
                      <Link to={to} className="st-route-link">{title}</Link>
                    </h3>
                    <p className="st-route-text">{body}</p>
                    <span className="ui-link st-route-cta" aria-hidden="true">
                      {cta} <ChevronRight size={16} className="ui-link-chev" />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="ui-container st-help-section">
        <ShelfHead title="Other help." soft="For delegates and staff." />
        <HelpRow
          items={[
            {
              icon: <Users size={26} strokeWidth={1.6} />,
              title: "Looking for a specific mentor?",
              text: "Browse the tentative WAC 2026 roster by field.",
              label: "Meet the mentors",
              to: "/mentors",
            },
            {
              icon: <KeyRound size={26} strokeWidth={1.6} />,
              title: "AYURDISHA staff",
              text: "Staff enter through the Staff control with a PIN.",
              label: "Read about the hall",
              to: "/about",
            },
          ]}
        />
      </div>
    </main>
  );
}
