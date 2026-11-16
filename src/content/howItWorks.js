/**
 * How it works — public explainer aligned to Ask → Tag → Cluster → Spotlight → Answer → Meet → Act.
 * Facts match Register, Ask Desk, Track, and desk publish gates. No invented bios or turnaround.
 */
import { ASK_EXAMPLES } from "./askPrompts.js";
import { DISHA_TRACK_NOTE } from "./glossary.js";
import { WAC } from "./site.js";
import { KEY_DATES, PROMISE_SHORT, formatKeyDate } from "../../shared/productConfig.js";

export const HOW_PATH = "/how-it-works";

export const HOW_INTRO = {
  eyebrow: "Meet the Mentors · WAC 2026",
  title: "How it works.",
  soft: "Seven steps from one question to a next action.",
  lead:
    `Browse the hall, verify your email, and file one focused career question under tracks T1–T9. ${PROMISE_SHORT} Live slots are only for verified Congress in-person delegates, and selection is human — never automatic.`,
};

export const HOW_NAV = [
  { id: "hiw-steps", label: "Steps" },
  { id: "hiw-who", label: "Who can ask" },
  { id: "hiw-question", label: "Your question" },
  { id: "hiw-after", label: "After you ask" },
  { id: "hiw-privacy", label: "Privacy" },
  { id: "hiw-congress", label: "Congress" },
  { id: "hiw-faq", label: "FAQ" },
];

export const HOW_STEPS = [
  {
    n: "01",
    title: "Ask",
    lead: "File one focused career question at the Ask Desk after you verify your email and receive a pass.",
    do: "Choose a track (T1–T9), write one decision (not a list), and set the four consents — all start unticked.",
    get: "A ticket (AYM-Q-…) and a receipt email. Intake closes " + formatKeyDate(KEY_DATES.intakeCloses) + ".",
    time: "A few minutes once your email code arrives.",
    action: { label: "Register & ask", tab: "register" },
  },
  {
    n: "02",
    title: "Tag",
    lead: "Your question is tagged to a career track. Automation may suggest tags; a track curator validates shortlists.",
    do: "Pick the closest track on the form. “Not sure” is fine — the desk will classify.",
    get: "A tagged ticket the desk can route without inventing access decisions.",
    time: "Immediate on submit.",
    action: { label: "Open Ask Desk", tab: "ask" },
  },
  {
    n: "03",
    title: "Cluster",
    lead: "Similar questions in the same track may be grouped so one composite answer can serve several students.",
    do: "Nothing — staff merge where it helps. Your wording stays on your ticket.",
    get: "Fewer duplicate mentor briefs; clearer hall answers.",
    time: "During desk curation before Congress.",
    action: { label: "How clustering works", path: "/how-it-works#hiw-after" },
  },
  {
    n: "04",
    title: "Spotlight",
    lead: "Theme spotlights surface recurring career dilemmas for the hall — not a personal inbox promise.",
    do: "Browse the open theme stage / answer bank when composites are published.",
    get: "Shared guidance other mentees can learn from (only with publication consent and no unresolved safety flag).",
    time: "As the desk publishes.",
    action: { label: "Open theme stage", tab: "board" },
  },
  {
    n: "05",
    title: "Answer",
    lead: "Every valid question gets a written or recorded answer via the answer bank and clustered composites.",
    do: "Open Track my answer with your ticket. Nothing publishes until a person approves it.",
    get: "Status on your ticket, plus a short email when the answer is posted if your address is on file.",
    time: "No fixed turnaround. Track stays on Received until ready.",
    action: { label: "Track my answer", tab: "track" },
  },
  {
    n: "06",
    title: "Meet",
    lead: "Live huddles and 1:1s at Bhubaneswar are limited and only for verified in-person Congress delegates.",
    do: "Say whether you attend in person and which days you can be there. Capacity and conflicts are confirmed by the appointment coordinator — not by scores alone.",
    get: "An invite only if selected. One live slot per student; institution spread rules apply.",
    time: `Congress ${WAC.dates} at ${WAC.venue}.`,
    action: { label: "WAC 2026", path: "/events" },
  },
  {
    n: "07",
    title: "Act",
    lead: "Take one clear next step from your answer — shareable as an Action Card when the desk enables export.",
    do: "Read the answer on Track, note the next step, and follow it at your own pace.",
    get: "A concrete career action, not a job offer or clinical advice.",
    time: "Whenever you are ready after the answer lands.",
    action: { label: "Enter the Hall", tab: "hall" },
  },
];

export const HOW_AUDIENCE = {
  title: "Who can ask.",
  soft: "Anyone may ask online. Live slots are narrower.",
  lead:
    "Anyone seeking career guidance in Ayurveda may ask once they have a verified email and a pass. Walking the hall is open before that. Only verified Congress-registered in-person delegates are considered for live slots.",
  groups: [
    {
      kicker: "WAC delegates",
      title: "You already registered for the Congress.",
      body:
        "Sign in with your WAC Delegate ID and the email on that registration, or register here with the same email and the ID links on its own. Live consideration needs in-person attendance.",
    },
    {
      kicker: "Students and practitioners",
      title: "You are building a career in Ayurveda.",
      body:
        "Verify your email. If it is not on the WAC list, you receive an AYURDISHA pass number. You can still ask online even if you are not coming to Bhubaneswar.",
    },
    {
      kicker: "Guests",
      title: "You are looking, and have not asked yet.",
      body:
        "Guests can read mentor profiles, career tracks, podcasts and published answers with no account. Filing a question uses the same registration as everyone else.",
    },
  ],
  note:
    "Asking here is free. Attending the Congress in Bhubaneswar is a separate registration on the official WAC site. Job Fair is a separate workflow and never shares mentoring tables.",
};

export const HOW_QUESTION = {
  title: "What makes a good career question.",
  soft: "One decision, with enough context for a composite answer to aim.",
  lead:
    "The Ask Desk is built for a single career decision: your stage, the options you are weighing, and what a useful answer should help you do. Leave patient IDs, confidential business detail, and unpublished research off the ticket — the desk flags those for a curator; it does not silently block a valid career ask.",
  examples: ASK_EXAMPLES,
  avoidTitle: "Leave these off the ticket",
  avoid: [
    "Diagnosis, treatment, medicines, doses, or a personal Prakriti reading.",
    "Someone else’s patient details, reports or prescriptions.",
    "Several unrelated decisions in one ticket.",
    "A question with no stage and no options.",
  ],
};

export const HOW_JOURNEY = {
  title: "What happens after you ask.",
  soft: "A queue, a person, then your ticket.",
  lead:
    "Sending the question does not publish an answer. Track shows where the ticket is. A draft, when one is written, stays with the desk until a person approves it.",
  steps: [
    {
      n: "1",
      title: "You receive a ticket",
      body: "The Ask Desk confirms AYM-Q-…. Track my answer shows Received. Save the ticket.",
    },
    {
      n: "2",
      title: "The desk queues it",
      body: "Staff see it on the briefing board. Similar questions may be grouped so one composite can answer the cluster.",
    },
    {
      n: "3",
      title: "A draft or a mentor brief",
      body: "Where DISHA is on for that stream, it can prepare a draft for review. Medical questions are not drafted as clinical advice.",
    },
    {
      n: "4",
      title: "A person approves it",
      body: "Nothing is emailed as the answer, and nothing is published on the open theme stage, until a person approves it — and only with the matching publication consent and no unresolved safety flag.",
    },
    {
      n: "5",
      title: "Track updates",
      body: "The ticket moves to Answered, or On the stage if a composite is published. You get a short notice when it is posted if email is on file.",
    },
  ],
  dishaNote: DISHA_TRACK_NOTE,
  statuses: ["Received", "With mentor", "Being reviewed by the desk", "Answered", "On the stage"],
};

export const HOW_PRIVACY = {
  title: "What stays private.",
  soft: "Four consents. Masked contacts. No public post without consent.",
  lead:
    "The hall needs a verified email to send the code and the answer notice. Four separate consents start unticked: anonymous publication, named display, recording, and follow-up contact.",
  points: [
    {
      title: "Email and mobile stay masked",
      body: "On your profile, the email is shown masked and a mobile number shows only its last four digits.",
    },
    {
      title: "Publication needs consent",
      body: "Anonymous or named display on the answer bank requires the matching checkbox. Unresolved safety flags stay off the public stage.",
    },
    {
      title: "Contact data after Congress",
      body: `Contact review/delete is planned for about 90 days after Congress (after ${formatKeyDate(KEY_DATES.congressEnd)}). Retention tooling exists; the exact erase policy needs an owner decision before any destructive job runs.`,
    },
  ],
};

export const HOW_PLACES = {
  title: "Written or recorded reply, or a live talk.",
  soft: "Online for everyone who asks. In the hall, by invitation.",
  online: {
    kicker: "Online",
    title: "Written or recorded answer",
    points: [
      "Open to every registered delegate, student and guest who verifies an email and files a question before intake closes.",
      "Delivered via answer bank / clustered composites — not a guarantee of a personal mentor letter.",
      "You follow it on Track my answer.",
      `If a DISHA draft was used, the answer carries this note: “${DISHA_TRACK_NOTE}”`,
    ],
  },
  floor: {
    kicker: `${WAC.dates} · ${WAC.venue}`,
    title: "Live Meet at Bhubaneswar",
    points: [
      "Only verified Congress-registered in-person delegates are considered.",
      "Huddles and 1:1s are capacity-limited; walk-in triage does not grant direct mentor access.",
      "Automation scores never decide access alone — curator validates shortlists; coordinator confirms capacity.",
      "If you are not selected, the written or recorded answer on your ticket still stands.",
    ],
  },
};

export const HOW_FAQS = [
  {
    q: "Is there a fee to register or ask?",
    a: "No. Registering in the hall, asking at the Ask Desk and tracking the ticket are free. Attending the Congress itself needs a separate registration on the official WAC site.",
  },
  {
    q: "Will I get a personal mentor reply?",
    a: "Not as a promise. Every valid question gets a written or recorded answer through clustered composites and the answer bank. A live slot is separate, limited, and only for verified in-person delegates.",
  },
  {
    q: "Which number is mine — a WAC Delegate ID or an AYURDISHA pass number?",
    a: "After you verify your email, the pass shows a WAC Delegate ID if that inbox is on the Congress delegate list. Otherwise it shows an AYURDISHA pass number. You do not invent or type that number.",
  },
  {
    q: "How long until the written answer?",
    a: "There is no promised number of hours or days. Track stays on Received until the reply is ready, then Answered.",
  },
  {
    q: "Can I ask more than one question?",
    a: "The desk is built for one focused question at a time. If you send the same question again, the desk links it to the earlier ticket.",
  },
  {
    q: "Will DISHA answer me on its own?",
    a: "No. DISHA can draft a reply for an official when that career stream is switched on. You never see the draft. The answer reaches you only after a person approves or edits it.",
  },
  {
    q: "Is this medical advice?",
    a: "No. AYURDISHA is career and education guidance. It is not for diagnosis, treatment, medicines, doses or a personal Prakriti assessment.",
  },
  {
    q: "Is Job Fair part of mentoring?",
    a: "No. Job Fair is a separate workflow with separate tables and roles. Mentoring data is not shared into Job Fair access.",
  },
];

export const HOW_CLOSE = {
  eyebrow: "When you are ready",
  title: "One question, asked properly.",
  lead: "Enter the hall if you are still looking. Register when the question is clear. Track the ticket after you send it.",
};
