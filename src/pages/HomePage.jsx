import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Layers,
  Microscope,
  Send,
  Stethoscope,
} from "lucide-react";
import {
  MENTORS,
  mentorsWithNames,
  mentorPublicPath,
  mentorInitials,
  mentorPortraitUrl,
} from "../mentors.js";
import { getProgramByCode } from "../data/programs.js";
import { setPageMeta } from "../siteMeta.js";

const CAREER_TRACK_VISUALS = [
  {
    id: "clinical",
    code: "T01",
    title: "Clinical Practice & Integrative Care",
    desc: "Hospital posts, private OPD setup, Nadi Pariksha, Panchakarma centers, and integrative care models.",
    image: "/assets/home/career-clinical.png",
    icon: Stethoscope,
    badge: "Clinical Track",
  },
  {
    id: "research",
    code: "T03",
    title: "Research, Evidence & Publication",
    desc: "CCRAS research fellowships, PhD pathways, clinical trials, phytomedicine research, and publication guidance.",
    image: "/assets/home/career-research.png",
    icon: Microscope,
    badge: "Research Track",
  },
  {
    id: "academics",
    code: "T02",
    title: "Academics, Teaching & Higher Education",
    desc: "AIAPGET preparation, MD/MS branch selection, Assistant Professor posts, and institutional teaching careers.",
    image: "/assets/home/career-academics.png",
    icon: GraduationCap,
    badge: "Academic Track",
  },
  {
    id: "global",
    code: "T07",
    title: "Export & Global Trade",
    desc: "International licensing, WHO benchmarks, export regulations, global wellness centers, and practice abroad.",
    image: "/assets/home/career-global.png",
    icon: Globe2,
    badge: "Global Track",
  },
];

export default function HomePage({ onGoTab }) {
  const goFeature = (id, e) => {
    e?.preventDefault();
    onGoTab?.(id);
  };

  useEffect(() => {
    setPageMeta({
      title: "AYURDISHA · Ayurveda Education, Mentors & Career Guidance · WAC 2026",
      description:
        "Digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026. Learn from experienced practitioners, explore 10 career tracks, and submit career questions.",
      path: "/",
    });
  }, []);

  useEffect(() => {
    const root = document.querySelector(".aym-homepage");
    if (!root) return undefined;

    const nodes = root.querySelectorAll("[data-reveal]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const featuredMentors = mentorsWithNames(MENTORS).slice(0, 6);

  return (
    <div className="aym-homepage">
      {/* 1. HERO — full-bleed photo with soft gradient wash */}
      <section className="aym-home-hero" aria-labelledby="hero-title">
        <div className="aym-home-hero-stage" aria-hidden="true">
          <img
            src="/assets/ayurdisha-hero.png"
            alt=""
            className="aym-home-hero-img"
            width={1536}
            height={1024}
            fetchPriority="high"
          />
          <div className="aym-home-hero-veil" />
          <div className="aym-home-hero-vignette" />
        </div>

        <div className="aym-home-hero-shell">
          <div className="aym-home-hero-copy">
            <p className="aym-home-hero-eyebrow">
              <span className="aym-home-hero-eyebrow-mark" aria-hidden="true" />
              WAC 2026 · Bhubaneswar
            </p>
            <h1 id="hero-title" className="aym-home-hero-title">
              Meet the Mentors
              <span className="aym-home-hero-title-line">shaping Ayurveda careers</span>
            </h1>
            <p className="aym-home-hero-lead">
              The official digital Meet the Mentors hall of the 11th World Ayurveda
              Congress — curated guidance for BAMS students, postgraduates, and
              practitioners.
            </p>
            <div className="aym-home-hero-actions">
              <Link
                to={{ pathname: "/", hash: "#ask" }}
                className="aym-home-hero-cta"
                onClick={(e) => goFeature("ask", e)}
              >
                Ask a Mentor
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/mentors" className="aym-home-hero-cta-secondary">
                Explore Mentors
              </Link>
            </div>
            <p className="aym-home-hero-meta">
              23+ senior mentors · 10 career tracks · World Ayurveda Foundation
            </p>
          </div>
        </div>

        <span className="aym-visually-hidden">
          Senior Ayurveda mentor guiding BAMS students at the World Ayurveda Congress
          digital hall
        </span>
      </section>

      {/* 2. HOW IT WORKS */}
      <section
        className="aym-section aym-home-section aym-bg-surface"
        aria-labelledby="how-it-works-title"
        data-reveal
      >
        <div className="aym-container">
          <div className="aym-section-header aym-home-section-header">
            <p className="aym-eyebrow">How it works</p>
            <h2 id="how-it-works-title" className="aym-display">
              From question to mentor guidance
            </h2>
            <p className="aym-section-lead">
              A clear three-step path from Ask Desk to published mentor answers.
            </p>
          </div>

          <div className="aym-grid-3 aym-steps-grid" data-reveal-stagger>
            <div className="aym-step-card" data-reveal>
              <div className="aym-step-num">01</div>
              <div className="aym-step-icon">
                <Send size={22} aria-hidden="true" />
              </div>
              <h3>Ask your question</h3>
              <p>
                Submit a career query on PG branches, clinical setup, or research
                at the digital Ask Desk.
              </p>
            </div>

            <div className="aym-step-card" data-reveal>
              <div className="aym-step-num">02</div>
              <div className="aym-step-icon">
                <Layers size={22} aria-hidden="true" />
              </div>
              <h3>Academic curation</h3>
              <p>
                Desk curators review, cluster, and assign your question to the
                right domain mentors.
              </p>
            </div>

            <div className="aym-step-card" data-reveal>
              <div className="aym-step-num">03</div>
              <div className="aym-step-icon">
                <BookOpen size={22} aria-hidden="true" />
              </div>
              <h3>Mentor stage letter</h3>
              <p>
                Mentors publish written answers on the Open Theme Stage and your
                ticket is updated.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RESEARCH & PRACTICE VISUALS */}
      <section
        className="aym-section aym-home-section aym-home-research-section"
        aria-labelledby="home-research-title"
        data-reveal
      >
        <div className="aym-container">
          <div className="aym-home-research-layout">
            <div className="aym-home-research-copy">
              <p className="aym-eyebrow">Research & practice</p>
              <h2 id="home-research-title" className="aym-display">
                From lab benches to clinical wards
              </h2>
              <p className="aym-section-lead">
                AYURDISHA surfaces real career settings — evidence research,
                clinical practice, and congress-floor mentorship — so BAMS
                scholars can picture the path ahead.
              </p>
              <Link to="/programs" className="aym-home-text-link">
                Explore all 10 career tracks
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="aym-home-research-collage" aria-hidden="true">
              <figure className="aym-home-research-frame aym-home-research-frame--lead">
                <img
                  src="/assets/ayurdisha-research.png"
                  alt=""
                  width={720}
                  height={480}
                  loading="lazy"
                />
                <figcaption>Research & evidence pathways</figcaption>
              </figure>
              <figure className="aym-home-research-frame aym-home-research-frame--clinical">
                <img
                  src="/assets/ayurdisha-clinical.png"
                  alt=""
                  width={480}
                  height={360}
                  loading="lazy"
                />
                <figcaption>Clinical practice</figcaption>
              </figure>
              <figure className="aym-home-research-frame aym-home-research-frame--hall">
                <img
                  src="/assets/home/congress-booths.png"
                  alt=""
                  width={480}
                  height={320}
                  loading="lazy"
                />
                <figcaption>Digital hall · WAC</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* 4. CAREER TRACK VISUALS */}
      <section
        className="aym-section aym-home-section aym-bg-surface"
        aria-labelledby="home-tracks-title"
        data-reveal
      >
        <div className="aym-container">
          <div className="aym-section-header-flex aym-home-tracks-header">
            <div className="aym-home-section-header aym-home-tracks-copy">
              <p className="aym-eyebrow">Career pathways</p>
              <h2 id="home-tracks-title" className="aym-display">
                Explore national career tracks
              </h2>
              <p className="aym-section-lead">
                Visual roadmaps for clinical, research, academic, and global practice.
              </p>
            </div>
            <Link to="/programs" className="aym-btn aym-btn-outline">
              <span>View all 10 tracks</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="aym-grid-2 aym-visual-tracks-grid" data-reveal-stagger>
            {CAREER_TRACK_VISUALS.map((track) => {
              const IconComponent = track.icon;
              const program = getProgramByCode(track.code);
              const href = program?.path || "/programs";
              return (
                <article
                  key={track.id}
                  className="aym-track-visual-card"
                  data-reveal
                >
                  <div className="aym-track-card-img-wrap">
                    <img
                      src={track.image}
                      alt={track.title}
                      className="aym-track-card-img"
                      loading="lazy"
                      width={640}
                      height={400}
                    />
                    <span className="aym-badge aym-badge-gold aym-track-card-badge">
                      {track.badge}
                    </span>
                  </div>
                  <div className="aym-track-card-content">
                    <div className="aym-track-card-icon">
                      <IconComponent size={20} aria-hidden="true" />
                    </div>
                    <h3 className="aym-track-card-title">{track.title}</h3>
                    <p className="aym-track-card-desc">{track.desc}</p>
                    <Link to={href} className="aym-btn aym-btn-ghost aym-track-card-cta">
                      <span>Explore pathway</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. FEATURED MENTORS */}
      <section
        className="aym-section aym-home-section aym-home-mentors-section"
        aria-labelledby="home-mentors-title"
        data-reveal
      >
        <div className="aym-container">
          <div className="aym-home-mentors-intro">
            <div className="aym-home-mentors-copy">
              <p className="aym-eyebrow">Meet the Mentors</p>
              <h2 id="home-mentors-title" className="aym-display">
                Learn from experienced Ayurveda leaders
              </h2>
              <p className="aym-section-lead">
                Senior academicians and clinicians on the WAC 2026 roster —
                ready to guide BAMS students through PG choices, clinical
                practice, and research pathways.
              </p>
              <Link to="/mentors" className="aym-home-text-link">
                View all mentors
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <aside className="aym-home-mentors-visual" aria-hidden="true">
              <div className="aym-home-mentors-visual-frame">
                <img
                  src="/assets/home/mentors-gathering.png"
                  alt=""
                  className="aym-home-mentors-visual-img"
                  width={560}
                  height={360}
                  loading="lazy"
                />
                <div className="aym-home-mentors-visual-caption">
                  <span>Digital Meet the Mentors hall</span>
                  <span>WAC Bhubaneswar 2026</span>
                </div>
              </div>
            </aside>
          </div>

          <div className="aym-mentors-grid-premium" data-reveal-stagger>
            {featuredMentors.map((m) => {
              const portrait = mentorPortraitUrl(m);
              const initials = mentorInitials(m.name);
              const specialty = m.expertise
                ? String(m.expertise).split(";")[0].split("(")[0].trim()
                : "";
              return (
                <article key={m.id} className="aym-mentor-card-premium" data-reveal>
                  <div className="aym-mentor-card-top-premium">
                    <div className="aym-mentor-avatar-container">
                      {portrait ? (
                        <img
                          src={portrait}
                          alt={`Portrait of ${m.name}`}
                          width={80}
                          height={80}
                          className="aym-mentor-avatar-img"
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="aym-mentor-avatar-initials"
                          aria-hidden="true"
                        >
                          {initials}
                        </span>
                      )}
                    </div>
                    {specialty && (
                      <span className="aym-mentor-badge-specialty">
                        {specialty}
                      </span>
                    )}
                  </div>
                  <div className="aym-mentor-body-premium">
                    <h3 className="aym-mentor-name-premium">
                      <Link
                        to={mentorPublicPath(m)}
                        className="aym-mentor-name-link-premium"
                      >
                        {m.name}
                      </Link>
                    </h3>
                    <p className="aym-mentor-role-premium">
                      {m.designation || "Distinguished Mentor"}
                    </p>
                  </div>
                  <div className="aym-mentor-card-actions-premium">
                    <Link
                      to={mentorPublicPath(m)}
                      className="aym-btn aym-mentor-card-cta-premium"
                      aria-label={`View profile of ${m.name}`}
                    >
                      <span>View profile</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. CONGRESS HALL */}
      <section
        className="aym-section aym-home-section aym-bg-surface"
        aria-labelledby="home-hall-title"
        data-reveal
      >
        <div className="aym-container">
          <div className="aym-grid-2 aym-hall-preview-grid">
            <div className="aym-hall-preview-media">
              <img
                src="/assets/hall-photo.png"
                alt="Meet the Mentors Digital Hall at World Ayurveda Congress"
                className="aym-hall-img"
                loading="lazy"
              />
            </div>
            <div className="aym-hall-preview-content">
              <p className="aym-eyebrow">Bhubaneswar hall</p>
              <h2 id="home-hall-title" className="aym-display">
                The digital Meet the Mentors hall
              </h2>
              <p className="aym-hall-lead">
                Walk into the digital hall of the 11th World Ayurveda Congress.
                Access knowledge pods, podcast conversations, and published
                mentor stage letters.
              </p>
              <div className="aym-hall-features-list">
                <div className="aym-hall-feat-item">
                  <CheckCircle2
                    size={18}
                    className="aym-text-gold"
                    aria-hidden="true"
                  />
                  <span>Knowledge Pods for 10 career pathways</span>
                </div>
                <div className="aym-hall-feat-item">
                  <CheckCircle2
                    size={18}
                    className="aym-text-gold"
                    aria-hidden="true"
                  />
                  <span>Podcast Corner recorded sessions</span>
                </div>
                <div className="aym-hall-feat-item">
                  <CheckCircle2
                    size={18}
                    className="aym-text-gold"
                    aria-hidden="true"
                  />
                  <span>Two-Chair Open Theme Stage records</span>
                </div>
              </div>
              <div className="aym-hall-cta-group">
                <Link
                  to={{ pathname: "/", hash: "#hall" }}
                  className="aym-btn aym-btn-primary"
                  onClick={(e) => goFeature("hall", e)}
                >
                  <span>Enter the Hall</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to={{ pathname: "/", hash: "#board" }}
                  className="aym-btn aym-btn-outline"
                  onClick={(e) => goFeature("board", e)}
                >
                  <span>Open Theme Stage</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
