import React from "react";
import { Link } from "react-router-dom";
import { Mic, FileText, ChevronRight, User } from "lucide-react";
import { resourcePublicPath } from "../data/resources.js";

export default function ResourceCard({ resource }) {
  if (!resource) return null;

  const isPodcast = resource.type === "podcast";

  return (
    <article className="ui-card aym-resource-card">
      <div className="ui-card-top">
        <span className={`ui-tag ${isPodcast ? "" : "ui-tag--gold"}`}>
          {isPodcast ? <Mic size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
          {resource.category}
        </span>
        {resource.trackCode && (
          <span className="ui-card-kicker">Track {resource.trackCode}</span>
        )}
      </div>

      <h3 className="ui-card-title">
        <Link to={resourcePublicPath(resource)} className="ui-card-link">
          {resource.title}
        </Link>
      </h3>
      <p className="ui-card-desc">{resource.description}</p>

      {resource.author && (
        <ul className="ui-card-meta">
          <li>
            <User size={15} aria-hidden="true" />
            <span>{resource.author}</span>
          </li>
        </ul>
      )}

      <span className="ui-link ui-card-cta" aria-hidden="true">
        {isPodcast ? "Listen / Watch" : "Read guide"} <ChevronRight size={16} className="ui-link-chev" />
      </span>
    </article>
  );
}
