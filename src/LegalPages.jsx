import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "./siteMeta.js";

const PAGES = {
  about: {
    title: "About AYURDISHA · WAC 2026",
    description:
      "AYURDISHA is the digital Meet the Mentors hall of the 11th World Ayurveda Congress, Bhubaneswar 2026 — register, ask one question, and receive a written or recorded answer via the answer bank.",
    heading: "About this hall",
  },
  privacy: {
    title: "Privacy · AYURDISHA",
    description: "How AYURDISHA handles delegate registration, Ask Desk questions, and staff curation data.",
    heading: "Privacy",
  },
  terms: {
    title: "Terms of use · AYURDISHA",
    description: "Terms for using the AYURDISHA Meet the Mentors hall at the 11th World Ayurveda Congress.",
    heading: "Terms of use",
  },
  disclaimer: {
    title: "Disclaimer · AYURDISHA",
    description: "AYURDISHA offers career guidance for Ayurveda students and practitioners. It is not medical advice.",
    heading: "Disclaimer",
  },
};

function LegalShell({ page, children }) {
  const meta = PAGES[page];
  useEffect(() => {
    setPageMeta({
      title: meta.title,
      description: meta.description,
      path: `/${page}`,
    });
  }, [page, meta.description, meta.title]);

  return (
    <main className="aym-legal" id="main">
      <nav className="aym-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link to="/">Home</Link></li>
          <li aria-current="page">{meta.heading}</li>
        </ol>
      </nav>
      <p className="aym-eyebrow">AYURDISHA · Meet the Mentors · WAC 2026</p>
      <h1 className="aym-display">{meta.heading}</h1>
      {children}
    </main>
  );
}

export function AboutPage() {
  return (
    <LegalShell page="about">
      <p>
        AYURDISHA is the digital Meet the Mentors hall of the 11th World Ayurveda Congress in Bhubaneswar.
        Delegates register with a real email, receive a pass (their WAC Delegate ID, or an AYURDISHA pass number), ask one career
        question at the Ask Desk, and track the mentor’s answer here — on a phone or laptop, before or after the floor.
      </p>
      <p>
        This is not a chatbot and not a brochure. Mentors read what you asked — PG, clinic, research, public health,
        start-ups, or practice abroad — and write guidance you can act on. Nothing here is a job offer, a Congress
        seat, or medical advice.
      </p>
      <p>
        Some mentees are invited by the guider for an in-person Meet the Mentors visit at the Congress.
        Registration on this site does not guarantee a place in that room. Everyone else keeps using the same
        hall online: the same Track page, the same pass.
      </p>
      <p>
        Staff and mentors use a gated desk (Curation, Insights, Mentor pack) to merge similar questions and
        publish answers on the open theme stage. Contact details stay with that desk. Published answers do not
        carry student names.
      </p>
      <p>
        AYURDISHA sits with the World Ayurveda Foundation’s Meet the Mentors experience at WAC 2026.
        It is not a generic Ayurveda school or marketing site.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell page="privacy">
      <p className="aym-legal-note" role="note">
        Placeholder until the organising legal entity names a privacy officer and registered address.
        The practices below describe how this hall actually works today.
      </p>
      <h2>What we collect</h2>
      <p>
        Registration asks for your name, age, sex, institute, and email so we can send a one-time code and
        issue your AYURDISHA pass number, and to link your WAC Delegate ID when your verified email is on the WAC delegate list. Ask Desk questions, optional context, and your ticket stay with
        the curation desk so a mentor can answer. Staff may also hold Congress selection lists that a guider uploads.
      </p>
      <h2>How it is used</h2>
      <p>
        Data is used to verify you, attach your pass (WAC Delegate ID or AYURDISHA pass number) to questions, route answers, and — if you allow merging —
        group similar questions so the hall can help more mentees. Published stage answers do not include mentee names.
        OTP mail is sent only to the address you typed.
      </p>
      <h2>Where it is stored</h2>
      <p>
        Live hall data is stored in the AYURDISHA backend (serverless API plus Firestore). A session token may be
        kept in this browser so you stay signed in as a delegate. Staff access uses a passcode plus an emailed code and a signed session cookie, not a public account.
      </p>
      <h2>Your choices</h2>
      <p>
        You can sign out of the delegate session on Register. To correct a registration or withdraw a question,
        contact the curation desk through Congress / World Ayurveda Foundation channels used for Meet the Mentors —
        this site does not yet publish a dedicated privacy email.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell page="terms">
      <p className="aym-legal-note" role="note">
        Placeholder terms for a Congress hall product. They are not a substitute for a signed contract with
        the World Ayurveda Foundation or the 11th World Ayurveda Congress organisers.
      </p>
      <h2>Who this is for</h2>
      <p>
        AYURDISHA is for people walking into Meet the Mentors — Ayurveda students, interns, PG scholars, researchers, practitioners,
        and Congress staff/mentors. You do not need a physical Congress pass to use the online hall.
      </p>
      <h2>What you may do</h2>
      <p>
        Register once with accurate details, ask one focused career question, track your ticket, and read published
        hall answers. Do not impersonate another delegate, harvest other people’s tickets, or treat staff tools as public.
      </p>
      <h2>What we do not promise</h2>
      <p>
        A mentor answer is guidance, not a placement, visa, licence, or admission. In-person visits in Bhubaneswar
        are by shortlist only. The tentative mentor roster may change before the Congress.
      </p>
      <h2>Content</h2>
      <p>
        Knowledge briefs and stage answers are for career orientation. Official circulars, NCISM/AYUSH notices, and
        university rules override anything summarised here.
      </p>
    </LegalShell>
  );
}

export function DisclaimerPage() {
  return (
    <LegalShell page="disclaimer">
      <p>
        AYURDISHA offers <strong>career guidance for Ayurveda students and practitioners</strong>. It is <strong>not medical advice</strong>,
        not a diagnosis, and not a prescription. Do not use Ask Desk or Knowledge pods for clinical decisions about
        a patient — including yourself.
      </p>
      <p>
        Mentor answers, knowledge briefs, and podcast talks reflect professional orientation (PG, practice, research,
        public health, start-ups, mobility). They are not legal advice on licences, advertising claims, or immigration.
      </p>
      <p>
        Names on the Mentors pages are a <strong>tentative WAC 2026 roster</strong> extracted from Congress presentation
        slides. Listing someone here does not confirm they will sit on every Ask Desk ticket.
      </p>
      <p className="aym-legal-note" role="note">
        Organising entity, CIN, and postal address are not published on this site yet. Until they are, treat
        World Ayurveda Foundation / 11th World Ayurveda Congress, Bhubaneswar 2026 as the event context — not as
        a verified registered-office listing.
      </p>
    </LegalShell>
  );
}
