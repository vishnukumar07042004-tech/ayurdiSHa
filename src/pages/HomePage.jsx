import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Users,
  BookOpen,
  Calendar,
  CheckCircle2,
  Compass,
  Layers,
  Send,
  Ticket,
} from "lucide-react";
import {
  MENTORS,
  mentorsWithNames,
  mentorPublicPath,
  mentorInitials,
  mentorPortraitUrl,
} from "../mentors.js";
import { setPageMeta, faqJsonLd } from "../siteMeta.js";

export default function HomePage() {
  const FAQS = [
    {
      q: "What is AYURDISHA?",
      a: "AYURDISHA is the official digital Meet the Mentors hall of the 11th World Ayurveda Congress (Bhubaneswar 2026). It connects BAMS students, interns, postgraduates, and practitioners with senior Ayurveda academicians, researchers, and clinicians.",
    },
    {
      q: "How do I ask a mentor a career question?",
      a: "Click 'Ask a Mentor' to register with your details and state. You will receive an official ticket ID to track your question as it is curated and answered by experienced mentors.",
    },
    {
      q: "Is there any fee to use AYURDISHA?",
      a: "No, AYURDISHA is a free institutional guidance initiative supported by the World Ayurveda Foundation for all BAMS students, scholars, and practitioners.",
    },
    {
      q: "What career tracks are covered?",
      a: "AYURDISHA covers 10 national pathways including Clinical Practice & Integrative Care, Academics & PG Entrance, Research & Evidence, Entrepreneurship, Manufacturing & GMP, Export & Global Trade, and Public Health.",
    },
  ];

  useEffect(() => {
    setPageMeta({
      title: "AYURDISHA · Ayurveda Education, Mentors & Career Guidance · WAC 2026",
      description:
        "Digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026. Learn from experienced practitioners, explore 10 career tracks, and submit career questions.",
      path: "/",
      jsonLd: faqJsonLd(FAQS),
    });
  }, []);

  const featuredMentors = mentorsWithNames(MENTORS).slice(0, 6);

  const pathways = [
    {
      title: "10 Career Tracks",
      desc: "Comprehensive post-BAMS career roadmaps and educational directions.",
      link: "/programs",
      icon: Compass,
      label: "Explore Tracks",
    },
    {
      title: "Faculty Roster",
      desc: "Connect with 23+ distinguished clinicians and academic mentors.",
      link: "/mentors",
      icon: Users,
      label: "Meet Mentors",
    },
    {
      title: "Congress Events",
      desc: "Key schedules, sessions, and theme-stage details in Bhubaneswar.",
      link: "/events",
      icon: Calendar,
      label: "View Events",
    },
    {
      title: "Info & Resources",
      desc: "Access essential reference articles, files, and career guides.",
      link: "/resources",
      icon: BookOpen,
      label: "Browse Resources",
    },
  ];

  return (
    <div className="aym-homepage">
      {/* 1. HERO — editorial split, Aysa-style structure, AYURDISHA identity */}
      <section className="aym-home-hero" aria-labelledby="hero-title">
        <div className="aym-home-hero-wash" aria-hidden="true" />
        <div className="aym-home-hero-shell">
          <div className="aym-home-hero-copy">
            <p className="aym-home-hero-eyebrow">WAC 2026 · Bhubaneswar</p>
            <h1 id="hero-title" className="aym-home-hero-title">
              Meet the Mentors shaping Ayurveda careers
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
              >
                Ask a Mentor
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/mentors" className="aym-home-hero-cta-secondary">
                Explore Mentors
              </Link>
            </div>
          </div>

          <div className="aym-home-hero-media">
            <div className="aym-home-hero-photo">
              <img
                src="/assets/ayurdisha-hero.png"
                alt="Senior Ayurveda mentor guiding BAMS students at the World Ayurveda Congress digital hall"
                className="aym-home-hero-img"
                width={768}
                height={512}
                fetchPriority="high"
              />
              <div className="aym-home-hero-photo-blend" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. PATHWAYS */}
      <section
        className="aym-section aym-home-section aym-pathways-section"
        aria-labelledby="pathways-title"
      >
        <div className="aym-container">
          <div className="aym-section-header aym-home-section-header">
            <p className="aym-eyebrow">Start here</p>
            <h2 id="pathways-title" className="aym-display">
              Choose your next step
            </h2>
            <p className="aym-section-lead">
              Career tracks, mentors, congress sessions, and reference guides.
            </p>
          </div>

          <div className="aym-grid-4 aym-pathways-grid">
            {pathways.map((path, idx) => {
              const Icon = path.icon;
              return (
                <Link key={idx} to={path.link} className="aym-pathway-card">
                  <div className="aym-pathway-icon-wrap">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <h3 className="aym-pathway-card-title">{path.title}</h3>
                  <p className="aym-pathway-card-desc">{path.desc}</p>
                  <span className="aym-pathway-card-cta">
                    {path.label}
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section
        className="aym-section aym-home-section aym-bg-surface"
        aria-labelledby="how-it-works-title"
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

          <div className="aym-grid-3 aym-steps-grid">
            <div className="aym-step-card">
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

            <div className="aym-step-card">
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

            <div className="aym-step-card">
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

      {/* 4. FEATURED MENTORS */}
      <section
        className="aym-section aym-home-section aym-home-mentors-section"
        aria-labelledby="home-mentors-title"
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
                  src="/assets/hall-photo.png"
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

          <div className="aym-mentors-grid-premium">
            {featuredMentors.map((m) => {
              const portrait = mentorPortraitUrl(m);
              const initials = mentorInitials(m.name);
              const specialty = m.expertise
                ? String(m.expertise).split(";")[0].split("(")[0].trim()
                : "";
              return (
                <article key={m.id} className="aym-mentor-card-premium">
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

      {/* 5. CONGRESS HALL */}
      <section
        className="aym-section aym-home-section aym-bg-surface"
        aria-labelledby="home-hall-title"
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
                  to={{ pathname: "/", hash: "#board" }}
                  className="aym-btn aym-btn-primary"
                >
                  <span>Open Theme Stage</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/resources" className="aym-btn aym-btn-outline">
                  <span>Podcast Corner</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ */}
      <section
        className="aym-section aym-home-section"
        aria-labelledby="faq-title"
      >
        <div className="aym-container aym-max-w-4xl">
          <div className="aym-section-header aym-home-section-header aym-text-center">
            <p className="aym-eyebrow">Questions & answers</p>
            <h2 id="faq-title" className="aym-display">
              Frequently asked questions
            </h2>
          </div>

          <div className="aym-faq-list">
            {FAQS.map((faq, i) => (
              <details key={i} className="aym-faq-item">
                <summary className="aym-faq-question">
                  <span>{faq.q}</span>
                </summary>
                <div className="aym-faq-answer">
                  <p>{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className="aym-cta-banner-premium aym-home-cta">
        <div className="aym-container aym-cta-container">
          <h2 className="aym-display aym-cta-title">
            Ready to ask a mentor?
          </h2>
          <p className="aym-cta-lead">
            Join the 11th World Ayurveda Congress digital hall and receive
            authentic career guidance.
          </p>
          <div className="aym-cta-actions">
            <Link
              to={{ pathname: "/", hash: "#ask" }}
              className="aym-btn aym-btn-primary aym-btn-lg"
            >
              <Send size={18} aria-hidden="true" />
              <span>Ask a Mentor</span>
            </Link>
            <Link
              to={{ pathname: "/", hash: "#track" }}
              className="aym-btn aym-btn-ghost-light aym-btn-lg"
            >
              <Ticket size={18} aria-hidden="true" />
              <span>Track my answer</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
