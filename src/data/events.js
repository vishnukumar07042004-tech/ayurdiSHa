/**
 * AYURDISHA Events Data Architecture
 * Official events and session schedules for the 11th World Ayurveda Congress & Meet the Mentors Hall.
 */

export function eventSlug(event) {
  if (!event) return "";
  const nameSlug = String(event.title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${event.id}-${nameSlug}`;
}

export function eventPublicPath(event) {
  if (!event) return "/events";
  return `/events/${eventSlug(event)}`;
}

export const EVENTS = [
  {
    id: "wac-2026-day1",
    title: "Meet the Mentors Hall Opening & Clinical Orientation",
    date: "11 December 2026",
    isoDate: "2026-12-11",
    time: "09:30 AM – 05:00 PM IST",
    location: "Meet the Mentors Digital Hall, Janata Maidan, Bhubaneswar, Odisha",
    category: "Congress Session",
    description: "Opening day of AYURDISHA Meet the Mentors at the 11th World Ayurveda Congress. In-person guider visits, Ask Desk ticket routing, and Track T01 (Clinical Practice) & T02 (Academics) mentor discussions.",
    highlights: [
      "Digital Ask Desk check-in & WAC Delegate ID verification",
      "Keynote orientation on choosing clinical specialties & hospital posts after graduation",
      "Interactive Q&A on AIAPGET entrance preparation & PG branch selection",
    ],
    mentorsInvolved: ["m03", "m04", "m06", "m07", "m17"],
    registrationRequired: true,
    registrationUrl: "/#register",
  },
  {
    id: "wac-2026-day2",
    title: "Research, Evidence & Start-up Incubation Workshop",
    date: "12 December 2026",
    isoDate: "2026-12-12",
    time: "09:30 AM – 05:00 PM IST",
    location: "Meet the Mentors Digital Hall, Janata Maidan, Bhubaneswar, Odisha",
    category: "Workshop & Panel",
    description: "Focus on Track T03 (Research & Evidence), T04 (Entrepreneurship & Start-ups), and T05 (Manufacturing & Quality). Mentors unpack CCRAS grants, ethics approvals, formulation licensing, and D2C brand building.",
    highlights: [
      "CCRAS SPARK research schemes and paper publication guidelines",
      "Regulatory pathways for Ayush products & manufacturing licenses",
      "Incubation support and funding pitch guidance for young Ayush founders",
    ],
    mentorsInvolved: ["m05", "m08", "m09", "m10", "m23"],
    registrationRequired: true,
    registrationUrl: "/#register",
  },
  {
    id: "wac-2026-day3",
    title: "Global Ayurveda Practice, Policy & Public Health Summit",
    date: "13 December 2026",
    isoDate: "2026-12-13",
    time: "09:30 AM – 04:00 PM IST",
    location: "Meet the Mentors Digital Hall, Janata Maidan, Bhubaneswar, Odisha",
    category: "Global Policy Forum",
    description: "Concluding day covering Track T07 (Export & Global Trade), T08 (Practice Abroad), T09 (Medical Value Travel), and T10 (Public Health & Policy). Insights into international licensing, WHO GTMC initiatives, and government medical officer posts.",
    highlights: [
      "Country-by-country legal recognition rules for BAMS graduates abroad",
      "Careers in Medical Value Travel resorts & wellness hospitality",
      "National Ayush Mission (NAM) government service recruitment pathways",
    ],
    mentorsInvolved: ["m01", "m06", "m09", "m14", "m23"],
    registrationRequired: true,
    registrationUrl: "/#register",
  },
];

export function getAllEvents() {
  return EVENTS.map(e => ({
    ...e,
    slug: eventSlug(e),
    path: eventPublicPath(e),
  }));
}

export function getEventBySlug(slug) {
  if (!slug) return null;
  const clean = decodeURIComponent(slug).toLowerCase().trim();
  const events = getAllEvents();
  return events.find(e => 
    e.slug.toLowerCase() === clean || 
    e.id.toLowerCase() === clean ||
    e.slug.startsWith(clean)
  ) || null;
}

export default getAllEvents;
