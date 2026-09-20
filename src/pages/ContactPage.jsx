import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";

export default function ContactPage() {
  useEffect(() => {
    setPageMeta({
      title: "Contact · AYURDISHA · WAC 2026",
      description: "Reach the AYURDISHA Meet the Mentors desk through Register and Ask Desk at the 11th World Ayurveda Congress.",
      path: "/contact",
    });
  }, []);

  return (
    <main className="aym-page aym-py-8" id="main">
      <div className="aym-container aym-max-w-4xl">
        <Breadcrumbs items={[{ label: "Contact" }]} />
        <header className="aym-page-header">
          <p className="aym-eyebrow">MEET THE MENTORS DESK</p>
          <h1 className="aym-display">Contact</h1>
          <p className="aym-lead">
            AYURDISHA does not publish a public inbox on this site. Delegates register with a real email,
            then file one career question at the Ask Desk. Staff enter through the Staff control with a PIN.
          </p>
        </header>
        <div className="aym-btn-row aym-mt-6">
          <Link to="/#register" className="aym-btn aym-btn-primary">Register</Link>
          <Link to="/#ask" className="aym-btn aym-btn-outline">Ask Desk</Link>
          <Link to="/#track" className="aym-btn aym-btn-ghost">Track my answer</Link>
        </div>
      </div>
    </main>
  );
}
