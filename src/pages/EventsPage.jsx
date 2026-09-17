import React, { useEffect } from "react";
import { setPageMeta, eventJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import EventCard from "../components/EventCard.jsx";
import { getAllEvents } from "../data/events.js";
import { Calendar, MapPin } from "lucide-react";

export default function EventsPage() {
  const events = getAllEvents();

  useEffect(() => {
    setPageMeta({
      title: "WAC 2026 Meet the Mentors Sessions & Schedule · AYURDISHA",
      description: "Official schedule for Meet the Mentors hall sessions at the 11th World Ayurveda Congress, Bhubaneswar 2026.",
      path: "/events",
      jsonLd: eventJsonLd(),
    });
  }, []);

  return (
    <div className="aym-page aym-py-8">
      <div className="aym-container">
        <Breadcrumbs items={[{ name: "Congress Sessions & Events" }]} />

        <header className="aym-page-header aym-mb-8">
          <p className="aym-eyebrow">11TH WORLD AYURVEDA CONGRESS · BHUBANESWAR 2026</p>
          <h1 className="aym-display">Meet the Mentors hall schedule</h1>
          <p className="aym-lead aym-max-w-3xl">
            In-person mentor visits, Ask Desk reviews, and expert panels — 11–13 December 2026 in Bhubaneswar.
          </p>
        </header>

        <div className="aym-event-location-banner aym-mb-8">
          <div className="aym-flex-align-center aym-gap-3">
            <MapPin size={24} className="aym-text-maroon" />
            <div>
              <strong>Main Venue:</strong> Meet the Mentors Digital Hall, WAC Convention Centre, Bhubaneswar, Odisha
            </div>
          </div>
        </div>

        <div className="aym-grid-2">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
