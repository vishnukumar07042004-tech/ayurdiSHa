# Home Ask Desk CTA + cinematic welcome slides — design brief

Scope: the home page (`/`, `src/pages/HomePage.jsx`) and the first-visit welcome deck
(`/welcome`, `src/pages/WelcomePage.jsx`). Reference for tone and motion: apple.com product
pages — one idea per screen, very large type, full-bleed imagery, slow, confident motion.

All copy uses facts the app already states (WAC number format, OTP, theme filing,
curation merge with up to seven students per group, "Received" status, email notice when
answered). No stats, testimonials, credentials or dates beyond what `src/content/site.js`
and `src/content/wacKnowledge.js` publish (10–13 Dec 2026, Bhubaneswar, 11th WAC).

---

## 1. Audit (before)

### Ask Desk prompt on home
- Lives in the hero as `p.ui-hero-aside`: a 15px grey line "Have a career question?" plus
  a small green text link "Ask the desk ›" — *below* two large pill buttons
  (Explore Mentors, About AYURDISHA).
- Visual weight ≈ 5% of the hero; it reads as a footnote. The primary job of the product
  (ask → mentor answers) is the least visible action on the page.
- Nothing else on the home page explains *what* you can ask or that Track my answer exists
  until far down the scroll.

### Welcome deck (`/welcome`)
- Five slides: Purpose → Four doors (card grid) → Four steps (number cards) → Congress &
  trust (text list) → Finale (bento + live counts).
- Light cream background on every slide; images are framed in cards on one side, so no
  slide feels "heroic". Slides 2–4 are text/card grids that look like a web page, not a
  presentation.
- Order mixes "what" and "how" (features before steps; trust after steps). The merge — the
  most distinctive part of AYURDISHA — is never shown.
- No autoplay, no prev/next buttons (tap-anywhere only), no pause; progress segments are
  `role="tab"` without tabpanels. Slide 3 says "WAC tracking number" where the app actually
  uses a ticket ID for Track.

---

## 2. Ask Desk CTA — design

### Two touch points
1. **Hero action card** (replaces the footnote line). A gold-edged pill card directly under
   the hero buttons: icon chip · "Have a career question?" (bold) · "Ask the desk" solid
   gold button. Same width as the button row on desktop; full width on mobile.
2. **Ask Desk band** — a new full-bleed section right after the hero facts / stats strip
   (`HomeAskDesk`, id `ask-desk`). This is the loud, Apple-style moment.

### Ask Desk band layout
- Background: deep forest (`--ui-dark` #0F2C25) with a soft gold radial glow; right half is a
  heroic image (help desk with question cards) that bleeds off the edge, masked with a
  left-to-right gradient so text never sits on busy pixels.
- **Eyebrow:** "The Ask Desk · Meet the Mentors hall" — gold (#E6CF9F on #0F2C25 ≈ 11:1).
- **Headline (display, 48–88px):** "Have a career question? *Ask the desk.*" — second clause
  in the accent serif italic, gold-light.
- **Sub-copy (lead, 18–21px, on-dark 0.8 alpha ≥ 9:1):** "Register once, ask one focused
  question under a career theme, and a WAC mentor answers in writing. Similar questions are
  grouped so one mentor can answer up to seven students in depth."
- **Primary:** "Ask the desk" → `/#ask` (real `<a href="/#ask">` via router `Link`), cream
  button on dark, 54px tall, arrow nudges 4px on hover.
- **Secondary:** "Track my answer" → `/#track`, outline-on-dark text link.
- **Example question chips** — taken verbatim from the app's `ASK_PROMPTS` labels (What
  should I do after BAMS? · PG / MD branch · Start a clinic · Hospital vs practice ·
  Research after BAMS · AYUSH / public health). Rendered as a slowly drifting marquee row
  (CSS transform, 60s loop, pauses on hover/focus). Each chip is a real `<button>` that opens
  the Ask Desk pre-filled with that theme, sub-theme and question.
- **Three micro-steps** under the CTAs (small, numbered): Register · Ask · Track — reinforcing
  the flow without a second card grid.

### Motion
- Entrance (IntersectionObserver, existing `data-reveal`): eyebrow → headline lines → copy →
  buttons stagger 80ms; image does a slow 1.08→1.0 scale-in over 1.6s.
- Hover: primary lifts 2px, shadow deepens, arrow translates 4px; press scales 0.98.
- Chips: background brightens, border turns gold on hover/focus.
- `prefers-reduced-motion`: no marquee (chips wrap statically), no scale-in, instant reveal.

### Accessibility
- Real links/buttons only; visible 3px gold focus ring with 3px offset on dark.
- Marquee duplicates are `aria-hidden` and `tabindex=-1` so screen readers and keyboard
  users meet each chip once.
- Section `aria-labelledby` the headline; image has descriptive alt.

### Mobile (≤ 760px)
- Image moves on top (16:10, rounded bottom fade into green), copy below; buttons stack full
  width; chips scroll horizontally in the marquee lane (no page overflow — lane is
  `overflow: hidden`).

---

## 3. Welcome slides — design

### Story order (one idea per slide, follows the real product flow)

| # | Chapter | Headline | One-line support | Image |
|---|---------|----------|------------------|-------|
| 1 | Welcome | Welcome to the Meet the Mentors hall. | The digital hall of the 11th World Ayurveda Congress — Bhubaneswar, 10–13 December 2026. | Grand congress hall with oak mentoring pods |
| 2 | Register | Register once. Get your WAC number. | Verify your email with a one-time code — your number, 11WAC/2026/…, is issued automatically. | Registration desk, badge + lanyard |
| 3 | Ask | Ask the desk one clear question. | Choose a career theme, write one focused question, and keep the ticket ID you receive. | Help desk with handwritten question cards |
| 4 | Merge | Similar questions, answered together. | The curation desk groups near-identical questions — up to seven students — so mentors reach more of you, in more depth. | Hands gathering question cards into one stack |
| 5 | Answer | A mentor writes back. | A written answer with next steps and official resources — and a personal note where your situation needs one. | Answer letter on an oak desk, herbs, manuscripts |
| 6 | Track | Track your answer. Then step inside. | Track my answer shows "Received" until the mentor's letter is ready — and you're emailed when it is. | Bhubaneswar temple at golden hour (existing) |

Slide 6 carries the actions: **Enter AYURDISHA** (primary, home `/` — same as the old deck),
**Ask a question** (`/#ask`), then text links **Track my answer** (`/#track`), **Walk the
hall** (`/#hall`), **Meet the mentors** (`/mentors`). Every exit marks the welcome as seen
for the session. Slide 1 also offers **Take the tour** and **Skip to AYURDISHA**.

Per-slide detail cards (glass, under the support line) — all from app facts:
- Register: WAC number format `11WAC/2026/NNNN`, "Issued on email verification".
- Ask: one real starter question from `ASK_PROMPTS` with its theme.
- Merge: seven dots gathering into one ring — "Up to 7 questions · 1 mentor answer".
- Answer: live mentor roster count from `mentors.js`.

### Layout (every slide)
- Full-bleed image (`object-fit: cover`) under a two-stop scrim: bottom-left forest gradient
  (0.92 → 0) + top vignette for the bar. Text block bottom-left, max 640px, so the image
  subject sits right/centre.
- Chapter marker: "01 / 06 · Register" in small caps gold, with a thin gold rule.
- Headline: 44–104px display, tight tracking (-0.03em), cream; last phrase in accent serif
  italic gold-light. Support line 18–22px, cream 0.86.

### Motion
- **Crossfade** 900ms between slides (outgoing fades out while incoming fades in), both
  absolutely stacked → zero layout shift.
- **Ken Burns**: active image scales 1.0 → 1.12 with a small per-slide pan over the slide
  duration (8s) — `transform` only, GPU-friendly.
- **Staggered text**: chapter (0ms) → headline lines rise out of a mask (120ms each) →
  support (+360ms) → actions (+480ms); 900ms `cubic-bezier(.2,.7,.1,1)`.
- **Progress**: six segments at the bottom; the active one fills over the autoplay duration
  (CSS animation, paused with the deck), done segments full.

### Controls
- Prev / Next round buttons (48px, labelled "Previous slide" / "Next slide"), visible pause/
  play toggle ("Pause slideshow" / "Play slideshow"), segment buttons ("Go to slide 3: Ask").
- Keyboard: ← / → anywhere in the deck, Home/End, Space toggles pause when the deck has
  focus. Swipe left/right on touch (56px threshold). Skip link in the top bar → home.
- Autoplay 8s per slide, stops at slide 6 (no loop — the finale has the actions). Pauses on
  hover, on focus inside the deck, when the tab is hidden, and permanently after the user
  presses pause.

### Performance
- WebP images ≤ ~300KB at 1920px with JPG fallback via `<picture>`; explicit width/height.
- Slide 1 image `fetchpriority="high"`; the next slide's image is preloaded with `new Image()`.
- All slides are rendered stacked (only the active one visible/interactive, others `inert`),
  so there's no mount flash or CLS.

### Accessibility
- Deck: `section` with `aria-roledescription="carousel"` and label. Each slide: `role="group"`,
  `aria-roledescription="slide"`, `aria-label="3 of 6: Ask"`; inactive slides `inert` +
  `aria-hidden`.
- A polite live region announces "Slide 3 of 6: Ask the desk one clear question." only after
  user-initiated navigation — never during autoplay.
- Focus rings 3px gold on all controls; controls meet 3:1 non-text contrast on the scrim.
- `prefers-reduced-motion: reduce` → no autoplay, no Ken Burns, no text stagger, instant
  slide change.

---

## 4. Implementation

- `src/pages/home/HomeHero.jsx` — `.ui-hero-ask` action card replaces the footnote line.
- `src/pages/home/HomeAskDesk.jsx` + `src/styles/ask-desk.css` — the band (after `HomeStats`).
- `src/content/askPrompts.js` — `ASK_PROMPTS` shared by the Ask Desk (App.jsx), the home
  chips and slide 3.
- `src/pages/WelcomePage.jsx` + `src/styles/welcome.css` — the six-slide deck.
- Images: `public/assets/slides/slide-{hall,register,ask,merge,answer}.{webp,jpg}` (generated,
  1280×720, 39–118KB WebP); slide 6 reuses `public/assets/sections/bhubaneswar-temple`.
- Autoplay is driven by the active progress segment's CSS animation (`animationend` →
  next slide), so pausing the animation pauses the timer with no drift.
- Hover pause applies to the text block and the control bar (the deck is full-screen, so
  pausing on any hover would stop autoplay entirely). Focus pause triggers on
  keyboard focus (`:focus-visible`).

Screenshots: `docs/design/screenshots/` (welcome-1440-*, welcome-768-*, welcome-375-*,
home-1440-*, home-768-*, home-375-*).

## 5. Acceptance checklist

- [x] Home hero shows a high-contrast Ask Desk action card; clicking opens `/#ask`.
- [x] Ask Desk band: eyebrow, headline, sub-copy, primary → `/#ask`, secondary → `/#track`.
- [x] Example chips use only real `ASK_PROMPTS` copy and open Ask pre-filled.
- [x] Welcome deck has 6 slides in the order above with full-bleed images.
- [x] Crossfade + Ken Burns + staggered text; progress fill tracks autoplay.
- [x] Prev/next, segments, pause/play, arrow keys / Home / End and swipe all work.
- [x] Autoplay pauses on hover/focus/hidden tab; reduced motion disables autoplay & motion.
- [x] Live region speaks only on user navigation.
- [x] Final slide: Enter AYURDISHA, Ask a question, Track my answer, Walk the hall, Meet the mentors.
- [x] No horizontal overflow at 375 / 768 / 1440; text readable over every image.
- [x] Images WebP (< ~300KB) + JPG fallback, explicit dimensions, next image preloaded.
- [x] No new stats, testimonials, credentials or dates.
- [x] `npm test` and `npm run build` pass.
