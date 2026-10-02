import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { programPublicPath } from "../data/programs.js";

export default function ProgramCard({ program }) {
  if (!program) return null;

  return (
    <article className="ui-card aym-program-card">
      <div className="ui-card-top">
        <span className="ui-tag ui-tag--gold">{program.code}</span>
        <span className="ui-card-kicker">Career track</span>
      </div>

      <h3 className="ui-card-title">
        <Link to={programPublicPath(program)} className="ui-card-link">
          {program.title}
        </Link>
      </h3>
      <p className="ui-card-desc">{program.tagline}</p>

      {program.sections && program.sections[1] && (
        <div className="ui-card-sub">
          <span className="ui-card-subhead">Opportunities include</span>
          <ul>
            {program.sections[1].bullets.slice(0, 2).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <span className="ui-link ui-card-cta" aria-hidden="true">
        Explore track <ChevronRight size={16} className="ui-link-chev" />
      </span>
    </article>
  );
}
