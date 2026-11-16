import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "../siteMeta.js";

export default function AccessibilityPage() {
  useEffect(() => {
    setPageMeta({
      title: "Accessibility · AYURDISHA",
      description: "How AYURDISHA aims to work with keyboards, screen readers, and reduced motion on Meet the Mentors.",
      path: "/accessibility",
    });
  }, []);

  return (
    <main className="aym-legal" id="main">
      <nav className="aym-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link to="/">Home</Link></li>
          <li aria-current="page">Accessibility</li>
        </ol>
      </nav>
      <p className="aym-eyebrow">AYURDISHA · Meet the Mentors · WAC 2026</p>
      <h1 className="aym-display">Accessibility</h1>
      <p>
        AYURDISHA is built to be usable on a phone or laptop at the Congress and at home. We aim for clear
        focus states, keyboard reach for primary actions, and respect for reduced-motion preferences.
      </p>
      <h2>What we design for</h2>
      <ul>
        <li>Skip to main content and visible focus rings on interactive controls.</li>
        <li>Ask Desk, Register, and Track forms with labels, errors announced as alerts, and large tap targets on small screens.</li>
        <li>Decorative motion that stops under <code>prefers-reduced-motion</code>.</li>
        <li>Text alternatives on primary imagery where the image carries meaning.</li>
      </ul>
      <h2>Known limits</h2>
      <p>
        Some staff desks and dense data tables are optimised for desktop. The public Ask → Track journey is the
        priority path for accessibility fixes.
      </p>
      <h2>Report a barrier</h2>
      <p>
        If something blocks you from asking or tracking an answer, write via{" "}
        <Link to="/contact">Help &amp; support</Link>. Please describe the page, the device or browser, and what you tried.
      </p>
    </main>
  );
}
