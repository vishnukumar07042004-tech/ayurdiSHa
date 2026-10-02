import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronRight, MessageCircleQuestion, Search } from "lucide-react";
import MentorCard, { MentorSpotlightCard } from "../../MentorCard.jsx";
import { MoreLink } from "../../components/ui/Button.jsx";
import { ShelfHead, Shelf, ShelfItem, QuickNav, HelpRow } from "../../components/ui/Store.jsx";
import FieldIcon, { fieldKey } from "../../components/ui/FieldIcons.jsx";
import { MENTORS, mentorsWithNames, getMentorById } from "../../mentors.js";
import { MENTOR_DOMAINS, getMentorDomain } from "../../mentorDomains.js";
import { FEATURED_MENTOR_ID } from "../../content/site.js";

const PREVIEW = 8;
const ASK = { pathname: "/", hash: "#ask" };

export default function HomeMentors() {
  const navigate = useNavigate();
  const [domain, setDomain] = useState("All");
  const [query, setQuery] = useState("");

  const featured = getMentorById(FEATURED_MENTOR_ID);
  const all = useMemo(() => mentorsWithNames(MENTORS), []);
  const roster = useMemo(() => all.filter((m) => m.id !== FEATURED_MENTOR_ID), [all]);
  const total = all.length;

  const counts = useMemo(() => {
    const c = new Map();
    all.forEach((m) => c.set(getMentorDomain(m), (c.get(getMentorDomain(m)) || 0) + 1));
    return c;
  }, [all]);
  const domains = MENTOR_DOMAINS.filter((d) => d === "All" || counts.get(d));

  const preview = useMemo(() => {
    const pool = domain === "All" ? roster : all.filter((m) => getMentorDomain(m) === domain);
    const withProfile = pool.filter((m) => String(m.designation || "").trim());
    const rest = pool.filter((m) => !String(m.designation || "").trim());
    return [...withProfile, ...rest].slice(0, PREVIEW);
  }, [domain, roster, all]);

  const seeAll = domain === "All" ? "/mentors" : `/mentors?field=${encodeURIComponent(domain)}`;
  const seeAllCount = domain === "All" ? total : counts.get(domain) || 0;

  function onSearch(e) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/mentors?q=${encodeURIComponent(q)}` : "/mentors");
  }

  return (
    <section id="meet-the-mentors" className="ui-section ui-bg-surface ui-home-mentors st-home-mentors" aria-labelledby="home-mentors-title">
      <div className="ui-container">
        <div className="st-home-head" data-reveal>
          <div>
            <p className="ui-eyebrow">The mentors</p>
            <h2 id="home-mentors-title" className="st-title st-home-title">
              Meet the Mentors.
              <span className="st-title-soft"> Find the right guide for your path.</span>
            </h2>
          </div>
          <ul className="st-helpers">
            <li className="st-helper">
              <span className="st-helper-icon" aria-hidden="true"><MessageCircleQuestion size={22} strokeWidth={1.7} /></span>
              <span className="st-helper-copy">
                <span className="st-helper-text">Need help choosing?</span>
                <MoreLink to={ASK} className="st-helper-link">Ask the desk</MoreLink>
              </span>
            </li>
            <li className="st-helper">
              <span className="st-helper-icon" aria-hidden="true"><CalendarDays size={22} strokeWidth={1.7} /></span>
              <span className="st-helper-copy">
                <span className="st-helper-text">10–13 Dec · Bhubaneswar</span>
                <MoreLink to="/events" className="st-helper-link">Live 1:1 at WAC 2026</MoreLink>
              </span>
            </li>
          </ul>
        </div>

        <div className="st-toolbar-wrap st-home-toolbar" data-reveal>
          <QuickNav
            label="Preview mentors by field"
            value={domain}
            onChange={setDomain}
            options={domains.map((d) => ({
              value: d,
              label: d === "All" ? "All mentors" : d,
              icon: <FieldIcon name={fieldKey(d)} size={34} />,
              count: d === "All" ? total : counts.get(d),
              countLabel: "mentors",
            }))}
          />
          <div className="st-toolbar">
            <form className="ui-search st-search" role="search" onSubmit={onSearch}>
              <label className="aym-visually-hidden" htmlFor="home-mentor-search">
                Search mentors, expertise or institution
              </label>
              <Search size={18} className="ui-search-icon" aria-hidden="true" />
              <input
                id="home-mentor-search"
                className="ui-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mentors, expertise or institution"
                autoComplete="off"
              />
              <button type="submit" className="ui-search-action ui-search-action--go" aria-label="Search mentors">
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
            <MoreLink to={seeAll}>
              {domain === "All" ? `Explore all ${total} mentors` : `All ${seeAllCount} in ${domain}`}
            </MoreLink>
          </div>
        </div>

        <ShelfHead
          id="home-mentors-shelf-title"
          as="h3"
          title={domain === "All" ? "The latest roster." : `${domain}.`}
          soft={domain === "All" ? "Leaders ready to guide PG choices, practice and research." : "A first look at this field’s mentors."}
        />
      </div>

      <Shelf label={domain === "All" ? "Mentor preview" : `${domain} mentors`}>
        {domain === "All" && featured && (
          <ShelfItem size="wide">
            <MentorSpotlightCard mentor={featured} headingLevel={4} />
          </ShelfItem>
        )}
        {preview.map((m) => (
          <ShelfItem key={m.id}>
            <MentorCard mentor={m} headingLevel={4} />
          </ShelfItem>
        ))}
        <ShelfItem size="compact">
          <Link to={seeAll} className="st-endcard">
            <span className="st-endcard-icon" aria-hidden="true"><FieldIcon name={fieldKey(domain)} size={40} /></span>
            <span className="st-endcard-title">
              {domain === "All" ? `See all ${total} mentors` : `See all ${seeAllCount} in ${domain}`}
            </span>
            <span className="st-endcard-link" aria-hidden="true">
              Open the directory <ChevronRight size={16} strokeWidth={2.2} />
            </span>
          </Link>
        </ShelfItem>
      </Shelf>

      <div className="ui-container st-home-help" data-reveal>
        <HelpRow
          items={[
            {
              icon: <MessageCircleQuestion size={26} strokeWidth={1.6} />,
              title: "Not sure whom to ask?",
              text: "Send one focused question — the desk routes it to the right mentor.",
              label: "Send your question to the desk",
              to: ASK,
            },
            {
              icon: <CalendarDays size={26} strokeWidth={1.6} />,
              title: "Live 1:1 for selected students",
              text: "Facilitated by the AYURDISHA team on the Congress floor in Bhubaneswar.",
              label: "How live 1:1 sessions work",
              to: { pathname: "/resources", hash: "#faq-title" },
            },
          ]}
        />
      </div>
    </section>
  );
}
