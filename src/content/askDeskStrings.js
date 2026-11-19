/**
 * Ask Desk copy — keep UI strings here for i18n. Do not hard-code hostnames.
 */

export const ASK_DESK_STRINGS = {
  eyebrow: "Ask Desk · Meet the Mentors · AYURDISHA",
  title: "Walk up. Ask one question.",
  lead:
    "For anyone planning a career in Ayurveda. One focused question under a track (T1–T9).",

  steps: [
    { id: "question", label: "Question" },
    { id: "who", label: "Who" },
    { id: "consent", label: "Consent" },
    { id: "review", label: "Review" },
  ],

  promptsEyebrow: "Start from a hall prompt",

  question: {
    eyebrow: "Your one question",
    title: "What should my next career step in Ayurveda be?",
    trackLabel: "Which career track is closest to your question?",
    trackHint: "Tap a track. We still answer if the match is imperfect.",
    notSureName: "Not sure",
    notSureLabel: "Not sure — route it for me",
    imperfectMatch:
      "We answer even when the track is an imperfect match — the desk routes for you.",
    questionLabel: "One focused question",
    questionHint: "One decision only — not a list. Career guidance only.",
    checklistTitle: "A good question usually",
    checklist: [
      "Names one decision you need to make",
      "Says where you are now (programme or role)",
      "Avoids patient details and unpublished data",
    ],
    contextLabel: "Where you are stuck",
    contextHint: "Keep it general — no unpublished data or patient reports.",
    outcomeLabel: "What should a useful answer help you do in the next 90 days?",
  },

  who: {
    eyebrow: "Who is at the desk",
    title: "Introduce yourself",
    edit: "Edit",
    doneEdit: "Done",
    filledNotice: "Details from your verified record",
    verified: "Verified",
    lockedHintWac:
      "From your WAC delegate record, linked by your verified email. You cannot change it here.",
    lockedHintPass:
      "Issued when you registered. The Ask Desk uses this number — you cannot change it here.",
    name: "Full name",
    email: "Email",
    emailHint:
      "Used only to send you your answer and, if shortlisted, a slot confirmation.",
    state: "State or union territory",
    stage: "Programme or stage",
    institution: "Institution or college",
    hallEyebrow: "Coming to the Congress?",
    hallTitle: "The live hall",
    hallLead:
      "Anyone seeking career guidance in Ayurveda may ask. Only registered mentees attending in person can be considered for a live pod or stage session.",
    registered: "Have you registered for WAC 2026?",
    inPerson: "Will you attend in person at Bhubaneswar?",
    days: "Which core days can you attend?",
    mobile: "Mobile number",
    mobileHint: "Optional. Used only if you are shortlisted for a live session.",
  },

  consent: {
    eyebrow: "Permissions",
    title: "Four separate consents",
    lead:
      "All start unticked. Nothing is published without the matching consent, and unresolved safety flags stay off the public stage.",
    aiNotice:
      "A drafting assistant may prepare a first reply for mentor or curator review. Mentors remain responsible for what you receive. Your question may be processed by AI service providers under our Privacy Policy.",
    anon:
      "I consent to anonymous publication of my question or a clustered composite on the answer bank / theme stage.",
    named:
      "I consent to my name being shown with my question or answer where the desk chooses to name contributors.",
    recording:
      "I consent to audio or video recording if I am invited to a live Meet the Mentors session.",
    follow:
      "I consent to one follow-up contact after the Congress about relevant opportunities.",
  },

  review: {
    eyebrow: "Review",
    title: "Check before you hand it over",
    lead: "Confirm the summary. Submit stays off until every required field is valid.",
    question: "Question",
    track: "Track",
    you: "You",
    hall: "Hall",
    consents: "Consents ticked",
    noneConsent: "None — that is fine; we still answer privately to you.",
    missingTitle: "Still needed before Submit",
    submit: "Hand this to the Ask Desk",
    sending: "Sending",
    footnote:
      "Your name stays with the curation desk. Similar questions may be merged before a composite answer is published. Your question draft autosaves on this device until you send.",
  },

  side: {
    title: "What happens next",
    honesty: [
      { step: "Ask", body: "One focused career question under a track." },
      { step: "Answer", body: "A written or recorded reply via the answer bank — not a personal mentor guarantee." },
      { step: "Meet", body: "A live slot is separate, limited, and only if you attend in person." },
    ],
    tipsTitle: "Tips",
    tips: [
      "Ask about one decision, not a whole career plan.",
      "Say your programme or stage so the desk can pitch the answer.",
      "Skip patient names, unpublished data, and clinic gossip.",
    ],
    privacyTitle: "Privacy",
    privacyBody:
      "WAF / WAC programmes own Ask Desk data for Meet the Mentors. Drafting may use AI third parties under our",
    privacyLink: "Privacy Policy",
    privacyTail: ".",
  },

  done: {
    title: "The Ask Desk has your question.",
    lead:
      "Keep this reference ID. Use it under Track my answer when a written or recorded reply is posted.",
    emailNote: " We will also send a short note to your registered email once it is answered.",
    copy: "Copy ticket",
    copied: "Copied",
    track: "Track my answer",
    askAnother: "Ask another question",
    noSlot: "Sending a question does not reserve a live mentor slot.",
  },

  closed: {
    title: "Question intake is closed.",
    browse: "Browse answer bank",
    track: "Track my answer",
  },

  register: {
    eyebrow: "One quick step first",
    title: "Register in 30 seconds to use the Ask Desk.",
    meta: "Email code · pass issued · we bring you straight back here",
    cta: "Register in 30 sec",
  },

  nav: {
    back: "Back",
    next: "Next",
    submit: "Submit",
  },

  leaveWarn: "You have a draft question on this device. Leave without sending?",

  autofill: "Autofill",
  select: "Select",
};
