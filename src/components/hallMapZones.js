/** Set before opening /#hall when the next view should land on the map. */
export const HALL_MAP_SCROLL_KEY = "aym-open-hall-map";

/**
 * Zones on the Meet the Mentors hall map (`public/assets/hall/hall-map.webp`).
 * Coordinates are percentages of the image (x from left, y from top). The first point carries the
 * numbered pin; extra points mark repeated fixtures (three pods, two kiosks) and are pointer-only.
 * Pin labels sit right of the pin unless `labelSide: "left"` or the pin is in the right 30%.
 * Targets: `tab` = in-app hash view (`/#tab`, see APP_TAB_IDS in App.jsx); `to` = router path.
 */
export const HALL_MAP_ZONES = [
  {
    id: "welcome",
    label: "Welcome",
    body: "Enter through the arch. Register first so you have a pass before you ask.",
    cta: "Register",
    tab: "register",
    points: [{ x: 49, y: 57 }],
  },
  {
    id: "kiosks",
    label: "Ask kiosks",
    body: "Two self-service kiosks where you file one focused career question for the mentors.",
    cta: "Ask Desk",
    tab: "ask",
    points: [{ x: 31, y: 70 }, { x: 59, y: 70 }],
  },
  {
    id: "desk",
    label: "Organiser desk",
    body: "The AYURDISHA team helps with registration, schedules and anything you can’t find.",
    cta: "Contact the team",
    to: "/contact",
    points: [{ x: 77, y: 76 }],
  },
  {
    id: "videos",
    label: "Career videos",
    body: "A replay screen of recorded career talks — the same conversations are online.",
    cta: "Watch career talks",
    tab: "podcast",
    points: [{ x: 17, y: 56 }],
  },
  {
    id: "pods",
    label: "Mentor pods",
    body: "Three pods, each with one mentor and four or five students, talking careers in small circles.",
    cta: "Meet the mentors",
    to: "/mentors",
    points: [{ x: 21, y: 20 }, { x: 20, y: 38 }, { x: 79, y: 19 }],
  },
  {
    id: "stage",
    label: "Theme stage",
    body: "Mentors answer the hall’s most-asked questions on stage; answers are published for everyone.",
    cta: "Open theme stage",
    tab: "board",
    points: [{ x: 54, y: 29 }],
    labelSide: "left",
  },
  {
    id: "one-to-one",
    label: "One-to-one room",
    body: "Selected students meet a mentor in person at Bhubaneswar. It starts with a question at the Ask Desk.",
    cta: "Ask Desk",
    tab: "ask",
    points: [{ x: 83, y: 33 }],
  },
  {
    id: "podcast",
    label: "Podcast room",
    body: "Mentor conversations are recorded here for students who couldn’t be in the hall.",
    cta: "Open podcast corner",
    tab: "podcast",
    points: [{ x: 83, y: 51 }],
  },
];

export function hallZoneHref(zone) {
  return zone.tab ? `/#${zone.tab}` : zone.to;
}
