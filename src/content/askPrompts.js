/** Starter questions shown on the Ask Desk ("Start from a hall prompt") and the home Ask Desk band. */
export const ASK_PROMPTS = [
  { label: "Next career step", theme: "Academics, Teaching & Higher Education", sub: "Choosing a PG branch", text: "What should my next career step in Ayurveda be — PG, clinical practice, research, or something else — and how do I choose?" },
  { label: "PG / MD branch", theme: "Academics, Teaching & Higher Education", sub: "Choosing a PG branch", text: "How should I choose a PG / MD branch, and when should I start preparing?" },
  { label: "Start a clinic", theme: "Clinical Practice & Integrative Care", sub: "Setting up private practice", text: "What licences and first steps do I need to start a small Ayurveda clinic after internship?" },
  { label: "Hospital vs practice", theme: "Clinical Practice & Integrative Care", sub: "Hospital employment", text: "Is it better to work in a hospital first, or go into private practice straight away?" },
  { label: "Start in research", theme: "Research, Evidence & Publication", sub: "Framing a research question", text: "How do I begin a research career in Ayurveda before, or without, an MD?" },
  // Medical officer eligibility is the BAMS degree, so this one names it.
  { label: "AYUSH / public health", theme: "Policy, Public Health & Global Agencies", sub: "Government service routes", text: "What is the route to a government AYUSH medical officer post after BAMS?" },
];

/** Placeholder examples for the Ask Desk question box — one is picked per visit. */
export const ASK_EXAMPLES = [
  "I am unsure between PG in Kayachikitsa and starting a small clinic. How do I decide?",
  "How can I move into Ayurveda research from where I am now?",
  "I have five years in clinical practice. Is teaching or industry a better next step?",
  "I am moving into Ayurveda from another field. Where should I start?",
];

export function pickAskExample(rand = Math.random) {
  return ASK_EXAMPLES[Math.floor(rand() * ASK_EXAMPLES.length) % ASK_EXAMPLES.length];
}
