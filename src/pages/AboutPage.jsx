import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import { ArrowRight, Award, ShieldCheck, HeartHandshake } from "lucide-react";

export default function AboutPage() {
  useEffect(() => {
    setPageMeta({
      title: "About AYURDISHA · 11th World Ayurveda Congress 2026",
      description: "AYURDISHA is the digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026 — bridging BAMS students and veteran practitioners.",
      path: "/about",
    });
  }, []);

  return (
    <div className="aym-page aym-py-12">
      <div className="aym-container aym-max-w-4xl">
        <Breadcrumbs items={[{ name: "About AYURDISHA" }]} />

        <header className="aym-page-header">
          <p className="aym-eyebrow">WORLD AYURVEDA CONGRESS · BHUBANESWAR 2026</p>
          <h1 className="aym-display">About AYURDISHA</h1>
          <p className="aym-lead">
            The official Meet the Mentors digital hall empowering BAMS mentees, postgraduates, and early-career practitioners with authentic professional direction.
          </p>
        </header>

        <section className="aym-prose">
          <p>
            AYURDISHA is the digital Meet the Mentors hall of the 11th World Ayurveda Congress in Bhubaneswar.
            Delegates register with a real email, receive an issued WAC registration number, ask one career
            question at the Ask Desk, and track the mentor’s answer online — on a mobile phone or laptop, before, during, or after the floor sessions.
          </p>

          <h2>Why AYURDISHA Was Built</h2>
          <p>
            Every year thousands of BAMS graduates complete internship and ask: <em>Should I prepare for MD entrance? Should I open a clinic? Can I join research or public health? How do I start a start-up or practice abroad?</em>
          </p>
          <p>
            AYURDISHA eliminates confusion by connecting mentees directly with leaders of the profession — Vice Chancellors, heads of institutes, CCRAS scientists, and veteran practitioners.
          </p>

          <div className="aym-grid-3 aym-my-8">
            <div className="aym-feature-card">
              <Award size={24} className="aym-text-gold" />
              <h3>23+ Tentative Mentors</h3>
              <p>Distinguished directors, VCs, and subject experts across Ayurveda specialties.</p>
            </div>
            <div className="aym-feature-card">
              <ShieldCheck size={24} className="aym-text-green" />
              <h3>10 Core National Tracks</h3>
              <p>Structured roadmaps covering clinical practice, academics, research, start-ups, and global trade.</p>
            </div>
            <div className="aym-feature-card">
              <HeartHandshake size={24} className="aym-text-maroon" />
              <h3>Direct Answer Tracking</h3>
              <p>Submit questions and receive mentor guidance backed by official ticket tracking.</p>
            </div>
          </div>

          <h2>How the Digital Hall Operates</h2>
          <p>
            Mentors read questions submitted to the Ask Desk — spanning clinical practice, PG selection, research, public health, start-ups, or practice abroad — and craft actionable responses.
          </p>
          <p>
            Staff and mentors use a curation desk to merge similar questions and publish composite answers on the open theme stage. Published answers protect mentee privacy by withholding personal names while maximizing learning for the entire community.
          </p>

          <div className="aym-callout-box aym-mt-8">
            <h3>Get Started Today</h3>
            <p>Ready to ask a question, explore mentor profiles, or revisit the orientation?</p>
            <div className="aym-btn-row aym-mt-4">
              <Link to={{ pathname: "/", hash: "#ask" }} className="aym-btn aym-btn-primary">
                Ask a Mentor <ArrowRight size={16} />
              </Link>
              <Link to="/mentors" className="aym-btn aym-btn-outline">
                Browse Mentors
              </Link>
              <Link to="/welcome" className="aym-btn aym-btn-ghost">
                Welcome overview
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
