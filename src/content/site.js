/**
 * Verified event facts + editorial placeholders for the AYURDISHA site.
 *
 * WAC facts below were checked against the official 11th WAC site
 * (https://ayurworld.org/) on 27 Sep 2026. Anything not verifiable lives in
 * PLACEHOLDERS and is rendered with a visible "placeholder" treatment.
 */

export const WAC = {
  name: "11th World Ayurveda Congress & Arogya Expo 2026",
  shortName: "11th World Ayurveda Congress",
  edition: "11th",
  year: "2026",
  city: "Bhubaneswar",
  region: "Odisha, India",
  dates: "10–13 December 2026",
  startDate: "2026-12-10",
  endDate: "2026-12-13",
  theme: "Integrative Ayurveda for Global Health",
  organizer: "World Ayurveda Foundation",
  supporters: "Ministry of Ayush, Government of India, and the Government of Odisha",
  officialUrl: "https://ayurworld.org/",
};

/** Content the project does not yet have. Swap these before launch. */
export const PLACEHOLDERS = {
  /** Official AYURDISHA social / contact links — none verified yet. */
  socialLinks: [],
  /** Specific venue inside Bhubaneswar is not published on the official site yet. */
  venue: null,
};

export const SITE_TAGLINE = "Meet the Mentors";

/** Roster id spotlighted on Home and Mentors (editorial choice; any id in src/mentors.js works). */
export const FEATURED_MENTOR_ID = "m23";
