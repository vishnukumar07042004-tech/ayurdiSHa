import React from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Clock, ChevronRight } from "lucide-react";
import { eventPublicPath } from "../data/events.js";

export default function EventCard({ event }) {
  if (!event) return null;

  return (
    <article className="ui-card aym-event-card">
      <div className="ui-card-top">
        <span className="ui-tag">{event.category}</span>
        <span className="ui-card-kicker">
          <Calendar size={14} aria-hidden="true" /> {event.date}
        </span>
      </div>

      <h3 className="ui-card-title">
        <Link to={eventPublicPath(event)} className="ui-card-link">
          {event.title}
        </Link>
      </h3>
      <p className="ui-card-desc">{event.description}</p>

      <ul className="ui-card-meta">
        <li>
          <Clock size={15} aria-hidden="true" />
          <span>{event.time}</span>
        </li>
        <li>
          <MapPin size={15} aria-hidden="true" />
          <span>{event.location}</span>
        </li>
      </ul>

      <span className="ui-link ui-card-cta" aria-hidden="true">
        View session details <ChevronRight size={16} className="ui-link-chev" />
      </span>
    </article>
  );
}
