import React from "react";
import { Link } from "react-router-dom";
import Picture from "../../components/editorial/Picture.jsx";
import { MoreLink } from "../../components/ui/Button.jsx";
import { ShelfHead } from "../../components/ui/Store.jsx";
import { getProgramByCode } from "../../data/programs.js";

const TRACKS = [
  {
    code: "T01",
    title: "Clinical Practice & Integrative Care",
    desc: "Hospital posts, private OPD setup, Nadi Pariksha, Panchakarma centres and integrative care models.",
    image: "/assets/home/career-clinical.png",
  },
  {
    code: "T03",
    title: "Research, Evidence & Publication",
    desc: "CCRAS research fellowships, PhD pathways, clinical trials, phytomedicine research and publication guidance.",
    image: "/assets/home/career-research.png",
  },
  {
    code: "T02",
    title: "Academics, Teaching & Higher Education",
    desc: "AIAPGET preparation, MD/MS branch selection, Assistant Professor posts and institutional teaching careers.",
    image: "/assets/home/career-academics.png",
  },
  {
    code: "T07",
    title: "Export & Global Trade",
    desc: "International licensing, WHO benchmarks, export regulations, global wellness centres and practice abroad.",
    image: "/assets/home/career-global.png",
  },
];

export default function HomePathways({ trackCount }) {
  return (
    <section className="ui-section ui-bg-canvas ui-paths" aria-labelledby="paths-title">
      <div className="ui-container">
        <div data-reveal>
          <ShelfHead
            id="paths-title"
            className="st-shelf-head--lg"
            title="Career pathways."
            soft="Visual roadmaps for the questions mentors are asked most."
            action={<MoreLink to="/programs">View all {trackCount} tracks</MoreLink>}
          />
        </div>

        <div className="ui-bento ui-paths-grid" data-reveal-stagger>
          {TRACKS.map((t) => {
            const href = getProgramByCode(t.code)?.path || "/programs";
            return (
              <article key={t.code} className="ui-tile ui-tile--flush ui-tile--link ui-path" data-reveal>
                <Link to={href} className="ui-path-media ed-media ed-zoom" tabIndex={-1} aria-hidden="true" data-scroll-img>
                  <Picture src={t.image} alt="" width={1152} height={864} sizes="(max-width: 767px) 94vw, 600px" />
                </Link>
                <div className="ui-path-body">
                  <p className="ui-path-code"><span className="ui-tag ui-tag--gold">Track {t.code.slice(1)}</span></p>
                  <h3 className="ui-tile-title ui-path-title">
                    <Link to={href}>{t.title}</Link>
                  </h3>
                  <p className="ui-body">{t.desc}</p>
                  <div className="ui-tile-foot">
                    <MoreLink to={href} aria-label={`Explore pathway: ${t.title}`}>Explore pathway</MoreLink>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
