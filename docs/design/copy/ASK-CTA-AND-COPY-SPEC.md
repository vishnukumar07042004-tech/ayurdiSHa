# Ask Desk CTA + inclusive copy — spec

Owner: UX writing / product design · Status: implemented (see bottom) · Date: 30 Oct 2026

AYURDISHA is the digital Meet the Mentors hall of the 11th World Ayurveda Congress (WAC),
Bhubaneswar, 10–13 Dec 2026. Its audience is **anyone seeking career guidance in Ayurveda** —
BAMS and other Ayurveda students, interns, PG scholars, young practitioners, researchers and
career switchers — not only BAMS students. This spec covers three things:

1. The home **Ask Desk** call to action (hero + a floating button).
2. The Ask Desk question example and starter prompts.
3. A whole-app wording audit with a canonical glossary.

---

## 1. Hero CTA wording

The old hero row read *"Have a career question? A WAC mentor answers in writing. Ask the desk ›"*
— 13 words, three ideas, and a CTA that lost to "Explore mentors" for attention.

### Five options

| # | Kicker (small) | Label (large) | Notes |
|---|---|---|---|
| A | Career question? | **Ask Desk →** | Brand noun = label. 2 + 2 words. Matches nav, footer, floating button, QR posters ("Ask Desk"). |
| B | — | **Ask the Desk →** | Reads as a verb phrase, but "the Desk" capitalised mid-sentence is odd and drifts from the brand name. |
| C | Free · answered in writing | **Ask a mentor** | Strong verb, but promises a direct mentor chat (the desk routes/merges) and drops "Ask Desk". |
| D | One question, one written answer | **Open Ask Desk** | Accurate, but "Open" is a weak, app-like verb; kicker too long for 390 px. |
| E | — | **Ask Desk — free** | Price cue helps trust, but "free" on a congress site reads salesy and repeats the FAQ. |

### Chosen: **A — kicker "Career question?" + label "Ask Desk"**

- **Precise and short**: 4 words total vs 13. The kicker names the visitor's need; the label names
  the place. Together they read as a natural exchange: *Career question? → Ask Desk.*
- **One name everywhere**: "Ask Desk" is already the feature name in nav, footer, hall map,
  emails and QR posters. A first-time visitor who sees it in the hero recognises it on the poster.
- **Fits every width**: two short lines fit a 52 px pill at 320 px without wrapping.
- **Accessible name** = visible text ("Career question? Ask Desk"), so voice-control users can say
  "click Ask Desk".

Link target: **`/ask`** — the QR short link. It skips the welcome deck, opens the Ask Desk
directly, and after registering returns the visitor to Ask with their draft. In-app clicks are
handled by the router (no full reload); "open in new tab" / copy-link still yields `/ask`.

---

## 2. Visual + motion spec

### 2.1 Hero CTA (`.hx-ask`, `src/pages/home/HomeHero.jsx`, `src/styles/home-hero.css`)

**Placement** — first item in the hero action row, directly under the sub-line. It is the hero's
only filled control. "Explore mentors" becomes an outline (secondary) pill; "About AYURDISHA ›"
stays a text link. One clear primary.

**Anatomy** (left → right)

| Part | Spec |
|---|---|
| Icon chip | 38 px forest circle (`#0B211C`), gold `MessageCircleQuestion` 19 px |
| Kicker | "Career question?" · 12.5 px / 600 · forest at 70 % |
| Label | "Ask Desk" · 18 px / 650 · forest `#0B211C` · −0.015 em |
| Arrow | `ArrowRight` 18 px, nudges +3 px on hover |

**Surface** — gold pill: `linear-gradient(180deg, #F1DDB0 0%, #E3C88E 100%)`, 1 px inner
highlight, soft warm drop shadow `0 10px 30px -12px rgba(230,207,159,.55)`. Contrast forest on
gold ≈ 11:1 (AAA). Against the dark hero the pill is the brightest object on the left half.

**Size** — min-height 58 px (desktop) / 56 px (≤ 767 px); padding 8 px 22px 8 px 8 px. Tap target
well over 48 px. On ≤ 767 px the pill is full width; the secondary actions sit on the row below.

**States**

| State | Treatment |
|---|---|
| Rest | Gold gradient, warm shadow |
| Hover | Lighter gradient, shadow grows, lift −1 px, arrow +3 px |
| Active | scale(0.98), shadow tightens |
| Focus-visible | 3 px cream ring (`#FCFBF7`) with 3 px offset — visible on gold and on the dark scrim |
| First load | Entrance rise with the hero copy (existing `.hx-rise`, `--i: 3`), then **one** sheen sweep + soft glow ring, 1.2 s, starting at ≈ 1.1 s. Never loops. |
| Reduced motion | No rise, no sheen, no glow, no lift — static gold pill |

No modal, no badge, no blinking — the pop comes from colour, size, position and a single sheen.

### 2.2 Floating Ask Desk button (`src/components/AskDeskFab.jsx`, `src/styles/ask-fab.css`)

A compact gold pill (icon chip + "Ask Desk"), fixed bottom-right, with a small dismiss button.

| Rule | Behaviour |
|---|---|
| Appears | Only after every in-page Ask CTA (`[data-ask-cta]`: hero pill, Ask Desk band button) has scrolled out of view **and** the page is scrolled > 480 px. On pages without such a CTA, > 480 px of scroll. |
| Hides near footer | When the site footer enters the viewport — so it never sits on the last content or the footer links. |
| Hidden routes | `/#ask`, `/#register`, `/#track`, `/track-answer`, `/ask`, `/a`, `/welcome`, all staff views (`#staff`, `#curate`, `#insights`, `#pack`, `#ai`, `/staff/*`). Everywhere else (home, The Hall, mentors, tracks, events, resources, legal) it may appear. |
| Dismiss | "×" (aria-label "Hide Ask Desk button") hides it for the rest of the browser session (`sessionStorage`). |
| Mobile (≤ 767 px) | Bottom-right, 16 px from edges + `env(safe-area-inset-bottom)`; 52 px tall pill; label stays "Ask Desk". Hidden while the mobile menu is open (body scroll lock). |
| Desktop | Bottom-right, 28 px from edges; 54 px tall. |
| Motion | Fade + 12 px rise in 240 ms; out 180 ms. Reduced motion: opacity only, no translate. |
| A11y | It is a link named "Ask Desk" (`href="/ask"`); dismiss is a separate button. When hidden it is `visibility:hidden` + `inert`, so it leaves the tab order. Focus ring as hero. |
| Never covers content | Compact (≈ 150 × 52 px), right-aligned where body text does not run on phones because of page gutters; hides near the footer; dismissible. |

Visibility logic lives in the pure helper `src/askFabRules.js` (unit-tested in
`tests/ask-cta.test.mjs`).

---

## 3. Ask Desk question example

Old: section "3 · Your one question" had the heading **"What should I do after BAMS?"** and the
placeholder *"For example: What should I do after BAMS if I am unsure between PG in Kayachikitsa
and starting a small clinic?"* — both exclude interns-turned-practitioners, PG scholars,
researchers, other Ayurveda programmes and career switchers.

New heading: **"What should my next career step in Ayurveda be?"**

New placeholder rotates (one per visit, picked on mount — no live-changing text) through
`ASK_EXAMPLES` in `src/content/askPrompts.js`:

1. "For example: I am unsure between PG in Kayachikitsa and starting a small clinic. How do I decide?"
2. "For example: How can I move into Ayurveda research from where I am now?"
3. "For example: I have five years in clinical practice. Is teaching or industry a better next step?"
4. "For example: I am moving into Ayurveda from another field. Where should I start?"

Starter chips (`ASK_PROMPTS`) — labels shortened, BAMS-only framing removed; the AYUSH medical
officer chip keeps "after BAMS" because the post's eligibility is the BAMS degree (factual).

| Before (label · question) | After |
|---|---|
| What should I do after BAMS? · "What should I do after BAMS — PG, …" | **Next career step** · "What should my next career step in Ayurveda be — PG, clinical practice, research, or something else — and how do I choose?" |
| PG / MD branch · "…branch after BAMS, and when…" | PG / MD branch · "How should I choose a PG / MD branch, and when should I start preparing?" |
| Hospital vs practice · "…hospital first after BAMS, or…" | Hospital vs practice · "Is it better to work in a hospital first, or go into private practice straight away?" |
| Research after BAMS · "…research career after BAMS if I am not yet in MD?" | **Start in research** · "How do I begin a research career in Ayurveda before, or without, an MD?" |
| AYUSH / public health | unchanged (factual) |

---

## 4. Wording audit — findings

Categories: **A** audience excludes non-BAMS · **L** too long · **T** terminology · **C** casing/grammar/clarity · **P** placeholder · **N** tone.
Line numbers are from the tree before this change.

| # | File:line | Current | Cat | New |
|---|---|---|---|---|
| 1 | `src/pages/home/HomeHero.jsx:48` | "…for BAMS students, interns and young practitioners." | A | "…for students, scholars and practitioners at every stage." |
| 2 | `src/pages/home/HomeHero.jsx:62-68` | "Have a career question? A WAC mentor answers in writing. Ask the desk ›" | L,T | Kicker "Career question?" + "Ask Desk" (gold pill) |
| 3 | `src/pages/home/HomeHero.jsx:23` | alt "…three BAMS students…" | A | "…three young students…" |
| 4 | `src/App.jsx:2242` | "What should I do after BAMS?" | A | "What should my next career step in Ayurveda be?" |
| 5 | `src/App.jsx:2263` | placeholder "…after BAMS if I am unsure…" | A | rotating `ASK_EXAMPLES` |
| 6 | `src/App.jsx:2130` | "You are a BAMS mentee. Mentors are here for future development — what to do after BAMS, PG, practice, research — not a support ticket." | A,L,N | "For anyone planning a career in Ayurveda. Ask about PG, practice, research, teaching or work abroad — mentors answer in writing." |
| 7 | `src/App.jsx:2204` | "Every BAMS student in India may ask." | A | "Anyone seeking career guidance in Ayurveda may ask." |
| 8 | `src/App.jsx:141` | stage list lacks researchers / other programmes / switchers | A | + "Ayurveda student (other course)", "Researcher", "Changing careers" (old values kept) |
| 9 | `src/App.jsx:857` | "…career guidance for BAMS students and practitioners." | A | "…career guidance for Ayurveda students and practitioners." |
| 10 | `src/App.jsx:1021` | "BAMS mentees" | A | "Mentees" |
| 11 | `src/App.jsx:1404` | "a career hall for BAMS mentees" | A | "a career hall for anyone building a life in Ayurveda" |
| 12 | `src/App.jsx:1847` | aria "BAMS students and a mentor…" | A | "Students and a mentor…" |
| 13 | `src/App.jsx:1850` | "Ten paths after BAMS — authoritative career briefs." | A,N | "Ten career paths in Ayurveda, briefed." |
| 14 | `src/App.jsx:1851` | "…ready for a 1:1 mentor question, walk to the Ask Desk." | T | "…ready to ask a mentor, walk to the Ask Desk." |
| 15 | `src/App.jsx:1889` | alt "BAMS graduates and a mentor…" | A | "Young practitioners and a mentor…" |
| 16 | `src/App.jsx:1893` | "After BAMS — which wall is yours?" | A | "Your next step — which wall is yours?" |
| 17 | `src/App.jsx:133-138` | Exchange paths: "PG / MD after BAMS", prompts "…after BAMS" | A | "PG / MD", prompts without "after BAMS" (abroad + MO prompts keep BAMS — factual) |
| 18 | `src/App.jsx:2533` | "Merge what BAMS students are asking" (staff) | A | "Merge what students are asking" |
| 19 | `src/App.jsx:3171` | "career guidance for BAMS mentees" (staff) | A | "Ayurveda career guidance" |
| 20 | `src/App.jsx:3229` | "After-BAMS topic mix" (staff) | A | "Career topic mix" |
| 21 | `src/App.jsx:4383` | meta "…career guides for BAMS mentees." | A | "…career guides for students and practitioners." |
| 22 | `src/App.jsx:4393` | meta "Discover and connect with mentors, practitioners, researchers and thought leaders…" | L,N | glossary `META_DESCRIPTION` (what it is, where, when, what you get) |
| 23 | `src/App.jsx:4397-4398` | "…for BAMS career pathways…", "Career paths after BAMS…" | A | "…Ayurveda career pathways…", "Career paths in Ayurveda…" |
| 24 | `src/App.jsx:4616` | "…for every BAMS mentee…" | A | "…for every mentee…" |
| 25 | `src/content/askPrompts.js:3-8` | chips "What should I do after BAMS?", "Research after BAMS" | A,L | see §3 |
| 26 | `src/welcome/slides.js:15` | "…for BAMS students, interns and young practitioners." | A | "…for students, interns, PG scholars and young practitioners." |
| 27 | `src/SiteFooter.jsx:20` | "…for BAMS students, interns, and postgraduates." | A | "…for Ayurveda students, interns, PG scholars and practitioners." |
| 28 | `src/SiteFooter.jsx:49,56-59,90,101` | "Career Tracks", "Important Guides", "Congress Events", "Help & Support", "Staff Portal Login", "Medical Disclaimer" | C | sentence case: "Career tracks", "Guides", "Congress events", "Help & support", "Staff sign-in", "Medical disclaimer" ("How It Works" kept — mirrors the must-keep nav label) |
| 29 | `src/siteMeta.js:20,31` | "…for BAMS mentees." / "Discover and connect…" | A,L | `META_DESCRIPTION` |
| 30 | `index.html:7,13,24` | "Discover and connect with mentors, practitioners, researchers and thought leaders…" | L,N | "Career guidance from senior Ayurveda mentors at the 11th World Ayurveda Congress, Bhubaneswar, 10–13 Dec 2026. Ask one question; a mentor answers in writing." |
| 31 | `src/pages/HomePage.jsx:36` | same meta | L | same |
| 32 | `src/pages/home/HomeStory.jsx:38` | "Every year thousands of BAMS graduates finish internship with the same questions." | A | "Every year thousands of students, interns and young practitioners reach the same crossroads." |
| 33 | `src/pages/home/HomeStory.jsx:24` | alt "…two BAMS students" | A | "…two students" |
| 34 | `src/pages/home/HomeAskDesk.jsx:62,71` | "Ask the desk." / button "Ask the desk" | T | Button "Ask Desk"; headline accent "Bring it to the Ask Desk." |
| 35 | `src/pages/home/HomeAskDesk.jsx:66-68` | "…one mentor can answer up to seven students in depth." | A | "…one mentor can answer up to seven people in depth." |
| 36 | `src/pages/home/HomeAskDesk.jsx:94` | "Start from a question students already ask" | A | "Start from a question others already ask" |
| 37 | `src/pages/home/HomeInterludes.jsx:24` | "Explore the Mentors" | C | "Explore mentors" |
| 38 | `src/pages/home/HomeInterludes.jsx:65` | "Ask a question" | T | "Ask Desk" |
| 39 | `src/pages/home/HomeMentors.jsx:64` | "Ask the desk" | T | "Ask Desk" |
| 40 | `src/pages/AboutPage.jsx:97` | meta "…for BAMS students, interns and young practitioners." | A | "…for Ayurveda students, interns, PG scholars and young practitioners." |
| 41 | `src/pages/AboutPage.jsx:155` | alt "…arriving BAMS students…" | A | "…arriving students…" |
| 42 | `src/pages/AboutPage.jsx:48` | "Live 1:1 mentor talks." | T | "Live one-to-one talks." |
| 43 | `src/pages/AboutPage.jsx:57,125` | "Ask the desk" | T | "Ask Desk" |
| 44 | `src/pages/AboutPage.jsx:63` | "Look up your WAC number anytime…" | C (wrong: lookup is by ticket ID) | "Look up your ticket ID anytime…" |
| 45 | `src/content/about.js:14` | "Every BAMS graduate deserves a clear next step…" | A | "Everyone building a career in Ayurveda deserves a clear next step…" |
| 46 | `src/pages/EventsPage.jsx:84` | "BAMS students, interns and young practitioners" | A | "Ayurveda students, interns, PG scholars and young practitioners" |
| 47 | `src/pages/EventsPage.jsx:87` | "Ask a question before you arrive" | T | "Use the Ask Desk before you arrive" |
| 48 | `src/pages/EventsPage.jsx:121`, `ContactPage.jsx:21,55`, `ProgramsPage.jsx:236` | "Go to the Ask Desk" | T,L | "Ask Desk" |
| 49 | `src/pages/ProgramsPage.jsx:63` | meta "…career tracks after BAMS…" | A | "…career tracks in Ayurveda…" |
| 50 | `src/pages/ProgramsPage.jsx:111` | "Ten roadmaps for life after BAMS." | A | "Ten roadmaps for a life in Ayurveda." |
| 51 | `src/pages/ProgramsPage.jsx:116,131`, `ResourcesPage.jsx:87,105,236`, `MentorsDirectory.jsx:145,160,309`, `MentorProfile.jsx:70,77,139` | "Ask the desk" | T | "Ask Desk" |
| 52 | `src/MentorsDirectory.jsx:306` | "…or ask the desk to route your question." | T | "…or use the Ask Desk to route your question." |
| 53 | `src/pages/ProgramDetailPage.jsx:80` | "Ask a mentor" | T | "Ask Desk" |
| 54 | `src/pages/ProgramDetailPage.jsx:121` | "Ask a Mentor About Track {code}" | L,C,T | "Ask Desk" |
| 55 | `src/pages/ResourceDetailPage.jsx:143,145` | "…personalized mentor feedback." / "Ask a Mentor" | C,T | "…personalised mentor guidance." / "Ask Desk" |
| 56 | `src/pages/EventDetailPage.jsx:64,124` | "Register for Hall & Ask Desk" | C,L | "Register to ask" |
| 57 | `src/components/FirstVisitGuide.jsx:11,27,33,41,57,64-65,72,74` | "Track My Answer", "Ask a Question", "Open Theme Stage", "Published Mentor Answers", "Continue to Track My Answer"… | C,T | sentence case + "Ask Desk" title |
| 58 | `src/components/FirstVisitGuide.jsx:36,68` | "…pathways after BAMS.", "…for every BAMS mentee…" | A | "…next steps after your degree.", "…for every mentee…" |
| 59 | `src/components/hallMapZones.js:21,62` | "Open the Ask Desk", "Ask a question" | T | "Ask Desk" |
| 60 | `src/AppHeader.jsx:205,377` | "Ask a question" | T | "Ask Desk" |
| 61 | `src/AppHeader.jsx:206,385` | "Open Theme Stage" | C | "Open theme stage" |
| 62 | `src/AppHeader.jsx:374` | "Meet a Mentor" | C | "Meet a mentor" |
| 63 | `src/data/faqs.js:5,13` | "It connects BAMS students, interns…", "BAMS students, scholars, interns…may register" | A | "Ayurveda students (BAMS and other courses), interns, PG scholars, researchers, practitioners and career switchers…" |
| 64 | `src/data/faqs.js:17` | "Open Ask a Mentor (or Ask Desk from the header)… Track My Answer." | T,C | "Open the Ask Desk from the header or home page… Track my answer." |
| 65 | `src/data/faqs.js:29` | "Browse Programs…" | T | "Browse Career tracks…" |
| 66 | `src/data/faqs.js:32-33,64` | "live 1-on-1 mentor talk", "1-on-1" | T | "one-to-one" |
| 67 | `src/data/faqs.js:37` | "digital WAC tracking number" | T | "WAC number" |
| 68 | `src/data/events.js:34` | "…hospital posts after BAMS" | A | "…hospital posts after graduation" |
| 69 | `src/data/resources.js:57` | "Navigating Ayurveda Career Pathways After BAMS" | A,C | "Navigating Ayurveda career pathways" |
| 70 | `src/LegalPages.jsx:24,154` | "career guidance for BAMS mentees" | A | "career guidance for Ayurveda students and practitioners" |
| 71 | `src/LegalPages.jsx:128` | "BAMS students, interns, graduates, practitioners…" | A | "Ayurveda students, interns, PG scholars, researchers, practitioners…" |
| 72 | `src/PodcastView.jsx:151,257,263` | "After BAMS — a conversation…", "after-BAMS question", "…room of BAMS students…" | A | "Your next step — a conversation…", "career question", "…room of students…" |
| 73 | `server/ai/triageTemplates.js:30,36` | "…the Meet the Mentors hall for BAMS students…" (en + Hinglish) | A | "…for anyone building a career in Ayurveda…" |
| 74 | `server/ai/triageTemplates.js:44,50` | "most BAMS careers branch into…" | A | "most Ayurveda careers branch into…" |
| 75 | `shared/triageRules.js:38,40,44,45,46` | example questions "…by a BAMS graduate", "…after BAMS if I am unsure…" | A | inclusive rewrites (T08 + MO kept — factual licensing / eligibility) |
| 76 | `server/ai/triage.js:46`, `server/ai/draft.js:69`, `server/ai/verify.js:88` | "…for BAMS (Ayurveda) students, interns and young practitioners" | A | "…for Ayurveda students (BAMS and other courses), interns, PG scholars, researchers and young practitioners" |
| 77 | `server/ai/personas/*.md` (15) + `scripts/kb/write-personas.mjs:222` | "Write for an Indian BAMS student or young practitioner" | A,N | "Write for an Ayurveda student, intern, PG scholar or young practitioner (usually in India)" |
| 78 | `server/mailer.js:241` | subject "AYURDISHA · Selected for Bhubaneswar WAC Meet the Mentors" | C | "AYURDISHA · You're selected for Meet the Mentors in Bhubaneswar" |
| 79 | `src/App.jsx:928` | landing CTA "Ask a question" | T | "Ask Desk" |
| 80 | `src/App.jsx:3757` | "Ask the desk staff for it." | C (reads as a CTA) | "Ask the help desk staff for it." |
| 81 | `HomeHowItWorks.jsx:12`, `HomeWac.jsx:26,102`, `App.jsx:4657`, `StaffWorkspace.jsx:19,24` | "Open Theme Stage", "Two-Chair Open Theme Stage" | C | "open theme stage" / "Open theme stage" / "Open the theme stage" (button) |
| 82 | `src/pages/ResourcesPage.jsx:228` | "live 1-on-1 talks" | T | "live one-to-one talks" |

**Checked and fine**: event times already carry "IST" (`src/data/events.js`); OTP email copy;
answer-notice email ("Track my answer"); no lorem/placeholder text in user-facing UI (only the
deliberate `PLACEHOLDERS.socialLinks` empty list and the labelled "Placeholder terms" note on
`/terms`). Factual BAMS mentions left as-is: mentor credentials, the PG-entrance persona's
AIAPGET vs NEET-PG rule, practice-abroad recognition, knowledge-pod briefs (career facts about the
BAMS degree), the stage options "BAMS student (…prof)".

### Totals by category (a finding can count in more than one)

| Category | Fixes |
|---|---|
| A — audience inclusivity | 47 |
| L — length | 10 |
| T — terminology | 23 |
| C — casing / grammar / clarity | 14 |
| P — placeholder | 0 found |
| N — tone | 5 |

82 findings in total; several rows cover many strings (e.g. row 51 is 11 "Ask the desk"
buttons, row 77 is 16 persona files).

---

## 5. Glossary (canonical labels) — `src/content/glossary.js`

| Concept | Use | Avoid |
|---|---|---|
| The question desk | **Ask Desk** (name, CTA, nav, footer). In a sentence: "the Ask Desk". | Ask the desk, Ask a mentor, Ask a question (as a CTA), Ask Desk page |
| Hero kicker | **Career question?** | Have a career question? A WAC mentor answers in writing. |
| Answer lookup | **Track my answer** (sentence case) | Track My Answer, Track answer, Track |
| Issued ID at registration | **WAC number** (short) · **WAC registration number** (form labels, emails) | pass number, WAC tracking number, WAC reg no |
| Question reference | **ticket ID** (format AYM-Q-…) | ticket number, Ask Desk ID |
| People who answer | **mentor** (lower case in running text; "Meet the Mentors" is the programme name) | Mentor, guider |
| People who ask | **students, scholars and practitioners** / "anyone seeking career guidance in Ayurveda" | BAMS students only, BAMS mentees |
| Published answers | **Open theme stage** | Open Theme Stage, Theme Stage |
| In-person talk | **one-to-one** | 1:1, 1-on-1 |
| Career areas | **Career tracks** | Programs (in copy) |
| Event times | always with **IST** | bare times |

Casing: sentence case for labels, buttons and headlines. Proper nouns keep caps (AYURDISHA,
Ask Desk, Meet the Mentors, The Hall, World Ayurveda Congress). Nav labels stay as listed in
`docs/PROGRESS.md` "User requirements (must keep)".

---

## 6. Tests

- `tests/copy-lint.test.mjs` — fails on BAMS-only audience phrases ("for BAMS students",
  "BAMS mentees", "every BAMS student", "after BAMS", "BAMS students, interns…", "BAMS … only") in
  user-facing source, with an explicit allow-list for factual cases; also fails on "Ask the desk",
  "Ask a Mentor" and Title-Case "Track My Answer" labels.
- `tests/ask-cta.test.mjs` — floating button visibility rules, hero CTA wiring (`/ask`, glossary
  labels, single filled primary), reduced-motion guard, inclusive Ask examples.

## Previews

Browser automation was blocked in the sandbox (headless Chrome and `vite preview` both fail), so
these are **simulated** renders from the real hero photo and the CSS values above
(`.qa/ask-cta-previews.py`; Georgia Italic stands in for Cormorant):

- `docs/design/screenshots/ask-cta-hero-1440.png`
- `docs/design/screenshots/ask-cta-hero-390.png`
- `docs/design/screenshots/ask-cta-fab-390.png`

## Implementation status

Implemented 30 Oct 2026 — see `docs/PROGRESS.md` ("READY TO DEPLOY: Ask Desk CTA + inclusive copy").
