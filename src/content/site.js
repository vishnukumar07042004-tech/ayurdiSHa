/**
 * Verified event facts + editorial placeholders for the AYURDISHA site.
 *
 * WAC facts below were checked against the official 11th WAC site
 * (https://ayurworld.org/) on 27 Sep 2026. Anything not verifiable lives in
 * PLACEHOLDERS and is rendered with a visible "placeholder" treatment.
 *
 * Key dates and public promise copy: shared/productConfig.js (browser + server).
 * See docs/qa/AUDIT-WAC-SPEC.md.
 */

import {
  KEY_DATES,
  CONGRESS_CORE_DAYS,
  META_DESCRIPTION,
  PROMISE_SHORT,
  isIntakeOpen,
  intakeClosesAt,
  formatKeyDate,
} from "../../shared/productConfig.js";

export {
  KEY_DATES,
  CONGRESS_CORE_DAYS,
  META_DESCRIPTION,
  PROMISE_SHORT,
  isIntakeOpen,
  intakeClosesAt,
  formatKeyDate,
};

export const WAC = {
  name: "11th World Ayurveda Congress & Arogya Expo 2026",
  shortName: "11th World Ayurveda Congress",
  edition: "11th",
  year: "2026",
  city: "Bhubaneswar",
  region: "Odisha, India",
  /** Named in the official 11th WAC brochure on ayurworld.org (checked 20 Oct 2026). */
  venue: "Janata Maidan",
  dates: "10–13 December 2026",
  startDate: "2026-12-10",
  endDate: "2026-12-13",
  theme: "Integrative Ayurveda for Global Health",
  organizer: "World Ayurveda Foundation",
  supporters: "Ministry of Ayush, Government of India, and the Government of Odisha",
  officialUrl: "https://ayurworld.org/",
};

/** Brand strings — use these instead of inventing alternate product names in UI copy. */
export const BRAND = {
  name: "AYURDISHA",
  tagline: "Meet the Mentors",
  productLine: "Meet the Mentors · WAC 2026",
};

/** Content the project does not yet have. Swap these before launch. */
export const PLACEHOLDERS = {
  /** Official AYURDISHA social / contact links — none verified yet. */
  socialLinks: [],
  /** Public contact for privacy / DPDP requests — override when a shared inbox is ready. */
  privacyEmail: "",
  contactEmail: "",
};

export const SITE_TAGLINE = BRAND.tagline;

export function isIntakeClosed(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return !isIntakeOpen(Number.isFinite(t) ? t : Date.now());
}

/** Roster id spotlighted on Home and Mentors (editorial choice; any id in src/mentors.js works). */
export const FEATURED_MENTOR_ID = "m23";
