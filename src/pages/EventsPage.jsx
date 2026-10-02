import React, { useEffect, useRef } from "react";
import { setPageMeta, eventJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import EventCard from "../components/EventCard.jsx";
import { getAllEvents } from "../data/events.js";
import { MapPin, MessageCircleQuestion, UserPlus } from "lucide-react";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { StoreHeader, ShelfHead, Shelf, ShelfItem, FeatureCard, HelpRow } from "../components/ui/Store.jsx";
import { WAC } from "../content/site.js";

const REGISTER = { pathname: "/", hash: "#register" };
const ASK = { pathname: "/", hash: "#ask" };

export default function EventsPage() {
  const events = getAllEvents();
  const heroRef = useRef(null);

  useEffect(() => {
    setPageMeta({
      title: "WAC 2026 Meet the Mentors Sessions & Schedule · AYURDISHA",
      description: "Official schedule for Meet the Mentors hall sessions at the 11th World Ayurveda Congress, Bhubaneswar 2026.",
      path: "/events",
      jsonLd: eventJsonLd(),
    });
  }, []);

  return (
    <main className="ui-page ui-events" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ name: "Congress Sessions & Events" }]} />
      </div>

      <StoreHeader
        ref={heroRef}
        eyebrow="11th World Ayurveda Congress · Bhubaneswar 2026"
        title="Hall schedule."
        soft="Three days of mentoring on the Congress floor."
        helpers={[
          {
            icon: <UserPlus size={22} strokeWidth={1.7} />,
            text: "Delegates register once",
            label: "Register for the Hall",
            to: REGISTER,
          },
          {
            icon: <MapPin size={22} strokeWidth={1.7} />,
            text: `WAC Convention Centre, ${WAC.city}`,
            label: "Official WAC 2026 site",
            href: WAC.officialUrl,
          },
        ]}
      />

      <section className="st-section" aria-labelledby="events-feature-title">
        <div className="ui-container">
          <h2 id="events-feature-title" className="aym-visually-hidden">At the hall</h2>
          <div className="st-split">
            <FeatureCard
              className="st-fcard--hero"
              image="/assets/sections/events-stage.webp"
              alt="A senior mentor and a young student in conversation on a low stage with plants, an audience in the foreground"
              width={1400}
              height={1050}
              sizes="(max-width: 1023px) 94vw, 700px"
              eyebrow="Live in the hall"
              title="Conversations you can pull up a chair for."
              text="Mentor visits, Ask Desk reviews and open-stage answers, every day of the Congress."
              action={<Button to={REGISTER} variant="on-dark" size="md">Register for the Hall</Button>}
            />
            <div className="st-panel">
              <p className="ui-eyebrow">Main venue</p>
              <h3 className="st-panel-title">Meet the Mentors Digital Hall</h3>
              <dl className="st-facts">
                <div>
                  <dt>Where</dt>
                  <dd>WAC Convention Centre, {WAC.city}, Odisha</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{WAC.dates}</dd>
                </div>
                <div>
                  <dt>Who</dt>
                  <dd>BAMS students, interns and young practitioners</dd>
                </div>
              </dl>
              <MoreLink to={ASK}>Ask a question before you arrive</MoreLink>
            </div>
          </div>
        </div>
      </section>

      <section className="st-shelf-section" aria-labelledby="events-shelf-title">
        <div className="ui-container">
          <ShelfHead id="events-shelf-title" title="Day by day." soft="Plan your visit to the hall." />
        </div>
        <Shelf label="Hall sessions">
          {events.map((e) => (
            <ShelfItem key={e.id} size="wide">
              <EventCard event={e} />
            </ShelfItem>
          ))}
        </Shelf>
      </section>

      <div className="ui-container st-help-section">
        <ShelfHead title="Before you go." soft="A little preparation goes a long way." />
        <HelpRow
          items={[
            {
              icon: <UserPlus size={26} strokeWidth={1.6} />,
              title: "Register once",
              text: "Get your WAC registration number so the desk can route your question.",
              label: "Register for the Hall",
              to: REGISTER,
            },
            {
              icon: <MessageCircleQuestion size={26} strokeWidth={1.6} />,
              title: "Bring one focused question",
              text: "File it at the Ask Desk now and follow the reply in Track.",
              label: "Go to the Ask Desk",
              to: ASK,
            },
          ]}
        />
      </div>
    </main>
  );
}
