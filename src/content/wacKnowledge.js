/**
 * WAC + Meet the Mentors knowledge, kept short. Every WAC fact below appears on
 * ayurworld.org (home, "About WAC", "11th WAC & Arogya Expo 2026") or in the official
 * 11th WAC brochure hosted there — checked 20 Oct 2026. Leave out anything not published.
 */

export const WAC_SOURCES = [
  { label: "ayurworld.org — home (Journey of WAC)", url: "https://ayurworld.org/" },
  { label: "ayurworld.org — 11th WAC & Arogya Expo 2026", url: "https://ayurworld.org/11th-wac-arogya-expo-2026/" },
  { label: "ayurworld.org — About WAC", url: "https://ayurworld.org/about-wac-2/" },
  { label: "Official 11th WAC brochure (PDF)", url: "https://ayurworld.org/wp-content/uploads/2026/09/11th-WAC-Main-Brochure-V15.pdf" },
];

export const WAC_AT_A_GLANCE = [
  { label: "What", value: "World Ayurveda Congress & Arogya Expo — a global platform for Ayurveda’s classical knowledge, practice, research, education and industry." },
  { label: "When", value: "10–13 December 2026" },
  // Venue name is printed on the brochure cover; the web pages give only the city.
  { label: "Where", value: "Janata Maidan, Bhubaneswar, Odisha" },
  { label: "Theme", value: "Integrative Ayurveda for Global Health" },
  { label: "Organised by", value: "World Ayurveda Foundation — founded in 2011 as an initiative of Vijnana Bharati" },
  { label: "Supported by", value: "Ministry of Ayush, Government of India · Host state: Government of Odisha" },
];

/** Editions as listed on ayurworld.org / the brochure's "At a Glance" table. */
export const WAC_EDITIONS = [
  { n: 1, year: 2002, city: "Kochi", theme: "Ayurveda and World Health" },
  { n: 2, year: 2006, city: "Pune", theme: "Globalisation of Ayurveda" },
  { n: 3, year: 2008, city: "Jaipur", theme: "Mainstreaming Ayurveda" },
  { n: 4, year: 2010, city: "Bengaluru", theme: "Ayurveda for All" },
  { n: 5, year: 2012, city: "Bhopal", theme: "Enriching Public Health Through Ayurveda" },
  { n: 6, year: 2014, city: "New Delhi", theme: "Health Challenges and Ayurveda" },
  { n: 7, year: 2016, city: "Kolkata", theme: "Strengthening the Ayurveda Ecosystem" },
  { n: 8, year: 2018, city: "Ahmedabad", theme: "Re-aligning the Focus on Health" },
  { n: 9, year: 2022, city: "Goa", theme: "Ayurveda for One Health" },
  { n: 10, year: 2024, city: "Dehradun", theme: "Digital Health: An Ayurveda Perspective" },
  { n: 11, year: 2026, city: "Bhubaneswar", theme: "Integrative Ayurveda for Global Health", current: true },
];

export const MEET_THE_MENTORS = {
  title: "Meet the Mentors at WAC",
  body: "The 11th WAC programme lists Meet the Mentors among its Experience Zones, and a “Career Zone: Meet the mentors / Job Fair” among its associated events. AYURDISHA is the digital side of that hall: your question reaches a mentor before, during and after the Congress.",
};

/** How AYURDISHA works — five steps, including the merge. */
export const HOW_AYURDISHA_WORKS = [
  { n: "01", title: "Register", body: "Verify your email with a one-time code. If your email is on WAC's delegate list, your WAC Delegate ID is linked; otherwise an AYURDISHA pass number (11WAC/2026/…) is issued." },
  { n: "02", title: "Ask", body: "One focused career question at the Ask Desk, filed under a theme. You get a ticket ID." },
  { n: "03", title: "Merge", body: "The curation desk groups near-identical questions — up to seven students — so one mentor answers all of you." },
  { n: "04", title: "Answer", body: "A mentor writes the answer, with next steps and official resources. Personal notes are added where needed." },
  { n: "05", title: "Track", body: "Open Track my answer with your ticket. It shows “Received” until the mentor’s letter is ready." },
];

export const WAC_FAQS = [
  {
    q: "Which number identifies me — WAC Delegate ID or AYURDISHA pass number?",
    a: "Register in the hall and verify your email with the one-time code. If that email is on the WAC 2026 delegate list, your WAC Delegate ID (for example BHA12345) is linked and shown on your pass. Otherwise the hall issues an AYURDISHA pass number (format 11WAC/2026/NNNN) — you never type it. Registered for WAC with a different email? Use “Link your Delegate ID” on the Ask Desk.",
  },
  {
    q: "Why was my question merged?",
    a: "When several students ask essentially the same thing in the same theme, staff group them so one mentor answers the whole group in depth. Your own wording stays on file, and you still see the answer on your own ticket.",
  },
  {
    q: "When will I get an answer?",
    a: "There is no fixed turnaround: answers come as mentors return them. Track my answer shows “Received” until then; if your email is on file you also get a short notice when the answer is posted.",
  },
  {
    q: "Is this medical advice?",
    a: "No. AYURDISHA is career and education guidance only — not diagnosis, treatment or patient care.",
  },
];
