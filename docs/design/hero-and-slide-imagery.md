# Home hero + welcome-slide imagery — design brief

Scope: the **home hero only** (`src/pages/home/HomeHero.jsx` + `src/styles/home-hero.css`) and the **six welcome-slide images** (`/welcome`, `src/pages/WelcomePage.jsx`). No other home section changes design.

Context: AYURDISHA is the digital **Meet the Mentors hall** of the **11th World Ayurveda Congress (WAC)**, Bhubaneswar, Odisha, **10–13 Dec 2026**, organised by World Ayurveda Foundation. Audience: BAMS students, interns, young practitioners. Brand: forest green `#173F35`, cream `#FCFBF7`, oak, gold `#C49A52` / `#E6CF9F`; display type = system sans (SF/Inter) 600, accent italic = Cormorant Garamond.

---

## 1. Audit

### 1.1 Current hero (screenshot 22 Oct 2026, ~414px wide)

| Element | Problem |
|---|---|
| Overall | Cream page with black text — reads like a document header, not the doorway to a world congress. No sense of place (Bhubaneswar), occasion (WAC) or people (mentors meeting students). |
| Visual | On phones the only image is pushed *below* the fold, so the first screen is text-only. On desktop a 3-photo collage + spinning seal + rings + keyline compete; the main photo shows a generic daytime meeting with blue lanyards (off-palette). |
| Eyebrow | Gold hairline + small caps is fine but tiny and low-contrast (`#8C6A2E` at 12px). |
| Headline | Strong copy, but black on cream with no depth; the italic *Ayurveda.* signature is the only flourish. |
| CTAs | Two equal-weight pills; secondary looks as loud as primary. |
| Ask pill | Pale-yellow pill floating in cream space — reads like a cookie banner rather than a feature. |
| Facts strip | Plain `dl` with hairline dividers, no icons, wraps awkwardly ("Live 1:1 mentoring" clipped at the right edge in the screenshot). |

### 1.2 Current slide images (all 1280×720)

| Slide | Copy theme | Current image | Why it's weak |
|---|---|---|---|
| 01 Welcome | "Welcome to the Meet the Mentors hall." | Dark carved hall, empty oak tables, marigolds | Atmospheric but **empty** — no mentors, no students, no congress energy; left 40% is black mush; reads "deserted temple café". |
| 02 Register | "Register once. Get your WAC number." | Hands holding a blank badge over a counter | Small, flat, stock-like crop; the person is a green blob on the left; no congress desk context, no light drama. |
| 03 Ask | "Ask the desk one clear question." | Back of one student at a desk, grid of blank cards | Underexposed; the board looks like a bus-timetable; the student is tiny and turned away; no hero moment. |
| 04 Merge | "Similar questions, answered together." | Hands bundling cards on a table | Literal and murky; the idea "many → one" is not legible; magnifier is a cliché. |
| 05 Answer | "A mentor writes back." | Still-life letter, pen, envelope | **No mentor** — the human act of writing back is missing; gibberish "handwriting" is visible. |
| 06 Track | "Track your answer. Then step inside." | Generic Bhubaneswar temple tank (shared with the WAC section) | Pretty postcard, but unrelated to tracking an answer; and reused elsewhere so the finale feels second-hand. |

Common issues: low resolution for full-bleed 1440–1920 displays, inconsistent exposure, no shared colour grade, nothing that says "World Ayurveda Congress 2026 in Bhubaneswar".

---

## 2. Hero redesign spec

**Concept — "The doorway to the hall."** A full-width cinematic frame (inset 12–20px from the viewport edges, 28px radius — Apple-style "card hero") showing the WAC Meet the Mentors hall at golden hour with a Kalinga-temple silhouette through tall windows, a senior mentor and students at an oak table. Copy sits on a forest-green gradient on the left (desktop) or under the image (phone). The cream nav bar stays as-is above it.

### 2.1 Structure
```
section.hx  (cream canvas, padding-top = nav height + 12px)
  div.hx-frame  (rounded card, dark forest base, overflow hidden)
    picture.hx-media  (full-bleed image, slow drift, scroll scale)
    span.hx-scrim     (left→right forest gradient + bottom vignette + gold glow)
    div.hx-inner
      div.hx-copy
        p.hx-eyebrow      (glass pill: gold dot · "11th World Ayurveda Congress" · "Bhubaneswar 2026")
        h1.hx-title       ("Meet the minds" / "shaping" / em "Ayurveda.")
        p.hx-sub
        div.hx-actions    (primary cream pill "Explore Mentors" → /mentors; ghost "About AYURDISHA" → /about)
        a.hx-ask          (glass card with gold hairline: icon · "Have a career question?" · "A WAC mentor answers in writing." · gold CTA "Ask the desk →" → /#ask)
      aside.hx-badge      (desktop only: "Meet the Mentors hall · Live 1:1 talks · selected students")
    dl.hx-stats       (glass bar pinned to frame bottom: 4 cells, lucide icons CalendarDays / MapPin / Users / MessagesSquare)
  button.hx-scroll    (scroll cue, desktop tall screens only)
```

### 2.2 Type & colour
- Eyebrow 12–13px, 600, letter-spacing .14em, uppercase, `--ui-gold-light` on a `rgba(252,251,247,.08)` glass pill with gold hairline. AA: `#E6CF9F` on ≤ `#173F35`-tinted backdrop ≈ 9:1.
- Headline `clamp(2.6rem, 6.2vw, 6.5rem)`, 600, line-height .96, tracking -0.04em, cream `#FCFBF7`. *Ayurveda.* in Cormorant italic 1.18em, gold gradient text (`#F1DDB0 → #C49A52`), with solid fallback colour.
- Sub 18–22px, `rgba(252,251,247,.84)`, max 36ch.
- All text sits on the scrim where the backdrop ≤ 35% luminance → white/cream text ≥ 7:1.

### 2.3 Components
- **Primary CTA**: cream pill, forest text, 54px, subtle gold inner hairline, hover lifts 1px + brighter. **Secondary**: transparent with `rgba(255,255,255,.4)` border, cream text; hover fills 10% white.
- **Ask card**: `backdrop-filter: blur(18px) saturate(1.4)`, `rgba(20,52,43,.55)` fill, 1px gold hairline `rgba(230,207,159,.45)`, radius 22px; gold circular icon; CTA is a gold pill (`#E6CF9F` bg, forest text). Micro-motion: arrow nudges 3px on hover, a slow gold sheen sweeps across the border every 6s (disabled with reduced motion).
- **Stats bar**: 4 equal cells, 1px vertical dividers `rgba(255,255,255,.14)`, each: 36px round icon in gold hairline, label 11px uppercase gold-light, value 16–17px 600 cream. Real data only: `10–13 Dec 2026`, `Bhubaneswar, Odisha`, `{mentorCount} mentors` (from `src/mentors.js`), `Live 1:1 mentoring`.

### 2.4 Motion
- Staggered reveal (eyebrow → 3 headline lines rising from masks → sub → actions → ask → stats), 80–110ms apart, 900ms `cubic-bezier(.22,1,.36,1)`.
- Image: 1.5s settle from scale 1.08 → 1.0, then a 24s alternating slow drift (translate ±1.2%). Scroll-linked: image scales up 6% and copy fades as the hero leaves (`--hero-p` from `useHeroScroll`).
- `prefers-reduced-motion: reduce` → no drift, no stagger, no sheen; everything visible immediately.

### 2.5 Responsive
| Width | Frame | Layout |
|---|---|---|
| 1440 (desktop) | inset 20px, height `clamp(640px, 100svh - nav - 32px, 900px)` | Copy left (max 640px) over gradient; image subject on right 55%; stats bar as a glass strip across the bottom inside the frame; floating badge top-right. |
| 768 (tablet) | inset 16px, auto height | Image fills; heavier gradient (bottom + left); copy stacked; stats 2×2 / 4-up when it fits. |
| 375 (phone) | inset 10px, radius 24px | Image occupies the top ~300px (subject visible: mentor + students), dissolves into solid forest; copy beneath; CTAs side by side; Ask card full width with full-width CTA; stats 2×2 glass grid. |

### 2.6 Performance & a11y
- LCP image preloaded in `index.html` (`<link rel="preload" as="image" type="image/webp" imagesrcset=...>`), `fetchpriority="high"`, explicit `width/height` (1920×1080 desktop, 1080×1350 phone art-direction via `<source media>`), frame has fixed aspect/min-height → zero CLS.
- WebP ≤ 300KB, JPG fallback.
- Image `alt` describes the scene; decorative scrims `aria-hidden`. Stats remain a `<dl>`. Focus rings visible on dark (2px gold outline, 3px offset).

---

## 3. Slide image specs

Shared look — **"WAC golden hour"**: cinematic 35mm photograph, warm golden-hour key light raking from one side, deep forest-green shadows, oak and sandstone mid-tones, marigold and brass accents, shallow depth of field, gentle film grain; Kalinga temple-architecture cues (Odisha sandstone, curvilinear *rekha deula* spires, carved pillars). Every frame keeps the **left 40% calmer/darker** because slide copy sits bottom-left over a scrim. 16:9, generated then exported at 1920×1080.
Rules: no real or recognisable people, faces either anonymous, softly turned, out-of-focus or partially framed; **no legible text, logos or signage** (blank cards, blank banners); no clinical/medical-procedure imagery.

Common suffix appended to every prompt:
> cinematic 35mm photograph, golden hour light, deep forest green and warm gold colour grade, oak wood and Odisha sandstone textures, marigold accents, shallow depth of field, subtle film grain, premium editorial, heroic composition, left third of the frame darker and calmer for text overlay, no text, no letters, no logos, no signage, no watermarks

| # | Slide | File | Composition / mood | Generation prompt (+ common suffix) |
|---|---|---|---|---|
| 0 | **Home hero** | `public/assets/home/hero-hall.{webp,jpg}` (+ `-m` 4:5 crop) | Wide, low-angle; grand hall with tall arched windows framing a distant Kalinga temple spire in golden haze; right-of-centre a silver-haired senior Ayurveda mentor in a cream kurta with gold-bordered angavastram, gesturing, three BAMS students in white coats leaning in at a round oak table; brass lamp, herbs. Heroic, warm, aspirational. | "A grand congress hall at golden hour during the World Ayurveda Congress in Bhubaneswar, Odisha: tall arched windows reveal the silhouette of a Kalinga-style curvilinear temple spire in warm haze; light beams cross the hall; on the right of frame a silver-haired senior Ayurveda mentor in a cream kurta with a gold-bordered shawl, seen in three-quarter profile, gestures warmly to three young medical students in white coats with green lanyards gathered around a round oak table with a brass oil lamp and a sprig of tulsi; carved sandstone pillars, marigold garlands, rows of other mentoring tables softly out of focus behind" |
| 1 | **Welcome** — "Welcome to the Meet the Mentors hall." | `slides/slide-hall` | Symmetric, one-point perspective down a vast pillared hall: rows of oak mentoring tables, each with a mentor and students, lamps glowing; blank cream banners hang between carved pillars; temple-spire window at the vanishing point. Grand, alive, inviting. | "A vast majestic Meet the Mentors hall at a world Ayurveda congress in Bhubaneswar, one-point perspective down a central aisle lined with carved Odisha sandstone pillars draped with marigold garlands and long blank cream banners; dozens of round oak tables with small brass lamps where senior mentors talk with young students in white coats, all small in frame and anonymous; at the far end a tall arched window frames a Kalinga temple spire glowing in golden haze; shafts of warm light and gentle dust" |
| 2 | **Register** — "Register once. Get your WAC number." | `slides/slide-register` | Medium close-up at a polished oak registration desk: a young woman student (face turned down, partially framed) lifts a blank cream delegate badge on a forest-green lanyard into a shaft of light; brass bell, a phone face-down; blurred queue and pillars behind. Moment of arrival. | "At an elegant oak congress registration desk, a young Indian woman medical student in a white coat, face turned down and partly out of frame, lifts a blank cream delegate badge on a forest-green lanyard into a shaft of warm golden light, the badge catching a gold rim highlight; on the desk a neat row of blank badges, a small brass bell and a marigold garland; behind her carved sandstone pillars and a softly blurred queue of students" |
| 3 | **Ask** — "Ask the desk one clear question." | `slides/slide-ask` | Over-the-shoulder, low angle: a male student in a white coat writes on a single blank cream question card at a lamp-lit oak Ask Desk; beyond, a tall wall of softly glowing blank cards like a constellation; focus on the pen nib and card. Quiet courage. | "Over-the-shoulder low-angle view of a young Indian male medical student in a white coat writing one question on a single blank cream card with a brass pen at an elegant lamp-lit oak desk inside a grand congress hall; beyond him a tall dark-green wall holds hundreds of small blank cream cards glowing like a constellation in warm light; carved sandstone arch framing the scene" |
| 4 | **Merge** — "Similar questions, answered together." | `slides/slide-merge` | Top-down hero still-life: seven blank cream cards arranged in an arc drawn by thin gold threads converging into one neat bundle tied with gold cord at centre-right; a staff member's hands guide the last thread; oak table, brass lamp glow, tulsi. Clear "many → one" metaphor. | "Dramatic top-down view of a dark oak curation table: seven blank cream question cards fanned in an arc on the left, each connected by a fine glowing gold thread that converges into one neat stack of cards tied with gold cord at the right; a pair of hands in forest-green sleeves gently draws the threads together; a brass lamp casts a warm pool of light, tulsi leaves and a small brass bowl at the edge" |
| 5 | **Answer** — "A mentor writes back." | `slides/slide-answer` | Medium shot, side light through a jali window: a senior mentor (grey hair, spectacles, face in soft profile/partial, anonymous) writes with a fountain pen on a cream letter (strokes unreadable, out of focus); palm-leaf manuscripts, herbs, brass lamp, green envelope with gold seal. Wisdom, care. | "A senior Ayurveda mentor with silver hair and spectacles, seen in soft side profile and partly in shadow, writing a letter with a gold fountain pen on cream paper at an oak desk, the handwriting softly out of focus and unreadable; warm golden light through a carved stone jali window throws patterned shadows; palm-leaf manuscripts, a brass oil lamp, fresh herbs and a forest-green envelope with a gold wax seal on the desk" |
| 6 | **Track** — "Track your answer. Then step inside." | `slides/slide-track` (new; the temple image stays for the WAC section) | Student seen from behind/three-quarter, holding an opened cream letter with a green envelope in hand at the threshold of the glowing hall doorway; temple spire silhouette through the doorway at sunset. Fulfilment + invitation. | "A young Indian medical student in a white coat seen from behind and slightly to the side, standing at the threshold of a tall carved sandstone doorway, holding an opened cream letter and a forest-green envelope with a broken gold seal; beyond the doorway a glowing congress hall full of warm lamps and, through a far arched window, the silhouette of a Kalinga temple spire at sunset; long golden light spills across the stone floor toward the viewer" |

Review gate per image: matches slide verb (welcome / register / ask / merge / answer / track); WAC + Odisha cues present; no legible text; faces anonymous; left third calm; grade consistent. Regenerate once if not.

Export: 1920×1080 (or source max), WebP q≈80 (< 300KB), progressive JPG q≈82 fallback; hero also a 4:5 phone crop.
