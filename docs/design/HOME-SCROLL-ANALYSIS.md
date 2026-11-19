# Home scroll UX analysis — ayurworld.org → AYURDISHA

**Status:** ANALYSIS ONLY — **STOP — await owner approval** before any Home UI implementation.  
**Studied:** 19 Nov 2026 · live [ayurworld.org](https://ayurworld.org/) (desktop ~1920×1080 + mobile metrics override)  
**AYURDISHA code:** `src/pages/HomePage.jsx`, `src/pages/home/*`, `src/styles/home-hero.css`, `src/styles/editorial.css`, `src/styles/ui.css`, `src/scrollReveal.js`, `src/components/editorial/motion.js`  
**Prior hero work:** `docs/design/home-hero-slider.md` · commit `f844896` (cinematic hero only)

This doc asks whether to extend ayurworld-inspired **motion / presentation** to the **whole Home screen** (below the hero), brand-adapted for Meet the Mentors — not as a congress-org marketing clone.

---

## 1. ayurworld.org section map (below-fold)

**Stack observed:** WordPress · Divi Builder · Revolution Slider 6 · DIPI modules · fixed nav · GTM · floating WhatsApp + social rail.  
**Page length:** ~10.8k px tall · ~150 `<img>` (~85 lazy) · ~50+ button CTAs on one scroll.  
**Hero (in-fold, already adapted in `f844896`):** RevSlider ~600px full-width; layered sky / lawn / crest assets; multi-slide; event seals/logos on media. **Do not copy seals/logos.**

| # | Approx. band | Layout | Scroll / motion | Stats | CTAs | Density | Mobile notes |
|---|---|---|---|---|---|---|---|
| 0 | **Hero slider** | Full-bleed RevSlider; layered photography + crests | Auto-advance; heavy JS slider; browser session had `prefers-reduced-motion: reduce` (animations muted) | None | Implicit (visual only) | High media, low copy | Hamburger; slider height/CLS risk if assets lag |
| 1 | **Welcome + theme** | Navy full-bleed; centered long H1; theme phrase accented | Divi waypoint fades (~27 on page) as bands enter | None | Soft “READ MORE” later in band | Low–medium; long institutional prose | Long text block; large vertical cost |
| 2 | **App download cards** | Two rounded cards: phone mock + QR (Android / iOS) | Card entrance on scroll | None | QR / store intent | Medium | Side-by-side → likely stack; QR needs size |
| 3 | **Quote + illustration** | Split: watercolor place art \| PM quote card | Fade/slide cards | None | None on quote | Medium; prestige signal | Cards stack; quote type large |
| 4 | **Action card grid** | Rounded cards on dark: WAC overview, presentation templates, register delegate, exhibitor, film fest, satellite seminar spotlight | Staggered module reveals | None | REGISTER NOW ×3, template downloads, film links | **High** — many parallel jobs | Dense; many equal-weight CTAs compete |
| 5 | **Satellite Seminars** | Dark blue; dual heading; grid/list of many events | Reveal + repeated **KNOW MORE** (~21 on page) | None | KNOW MORE per event | **Very high** | Horizontal overflow / card carousels risk; thumb fatigue |
| 6 | **Journey of WAC** | Black band; DIPI dual heading (“Journey of / WORLD AYURVEDA CONGRESS”); past-edition list (Kochi → … → Bhubaneswar) | Heading animation (DIPI); list reveal | Edition history as narrative, not live counters | READ MORE | Medium | Timeline/list readable if stacked |
| 7 | **Messages (dignitaries)** | White band; portrait/message cards | Reveal + carousel-like repetition | None | READ MESSAGE × many | Medium–high | Card swipe / stack |
| 8 | **Odisha place story** | Dark olive/earth; “INDIA’S BEST KEPT SECRET” + destination copy | Reveal on enter | None | READ MORE | Low–medium; atmospheric | Full-bleed photo + copy stack |
| 9 | **Blog / topics slider** | DIPI blog slider: Integrative Ayurveda themes (Oncology, One Health, NCDs, …) | Horizontal slider | None | Read More per post | Medium | Swipe carousel; peek next card |
| 10 | **Partners / sponsors** | Mint/teal band; ~19 institutional & sponsor logos (AYUSH, Odisha, WAF, brands) | Section anim class | None | Logo links implied | Logo wall | Multi-row logo grid |
| 11 | **Footer** | Blue; address, social, WhatsApp number | Minimal | — | Social | Low | Standard |

**Presentation patterns (inspiration candidates):**

1. **Alternating full-bleed colour planes** (navy → black → white → earth → mint) that make each scroll stop feel like a new “room.”
2. **Breathing room** between major ideas; hero and welcome are airy; later bands get denser.
3. **Card islands on dark** for conversion tasks (register / download / event).
4. **Place storytelling** (Odisha) as emotional punctuation — not only logistics.
5. **Congress lineage** (Journey) as a vertical story.
6. **Scroll-triggered fades** (Divi waypoints) — soft, not scroll-jacking.
7. **Persistent chrome** (fixed nav + WhatsApp) — high conversion for an org site; noisy for a student product.

**Not observed (or weak):** CSS parallax layers (`et_pb_parallax` count 0); animated number counters; scroll-jacking; sticky section pins.

---

## 2. AYURDISHA Home today (gap baseline)

Order in `HomePage.jsx`:

| Order | Section | Motion already | Role |
|---|---|---|---|
| 1 | `HomeHero` | Crossfade slider, Ken Burns-lite, `--hero-p` scroll fade, reduced-motion safe | Brand + congress line + Ask / Mentors CTAs |
| 2 | `HomeStats` | CountUp + `data-reveal` | Live publicStats **network poll** + static facts |
| 3 | `HomeAskDesk` | Reveal | Primary product CTA band |
| 4 | `HomeIdea` | Reveal + `data-scroll-img` zoom | Editorial story bento |
| 5 | `HomeMentors` | Reveal + horizontal Shelf | Product directory preview |
| 6 | `HomeHowItWorks` | Reveal stagger | Process education |
| 7 | `HomePhotoBand` | Parallax `-160` + reveal | Full-bleed quote/CTA interlude |
| 8 | `HomePathways` | Reveal + scroll-img | Career tracks |
| 9 | `HomeWac` | Dark band + reveal | Congress affiliation |
| 10 | `HomeTimeline` | Scroll `--progress` fill + reveal | WAC editions journey |
| 11 | `HomeGoodToKnow` | Reveal | Steps + FAQ |
| 12 | `HomeCollage` | Reveal stagger + zoom | Mood imagery |
| 13 | `HomeQuote` | Scale reveal | Idea line |
| 14 | `HomeFinalCta` | Dark + glow ornaments | Closing CTAs |

**Global motion:** `observeScrollReveal(..., { once: true })` + `useParallax` on `[data-parallax]` / `[data-scroll-img]`. Reduced motion forces visible / no parallax.

### Gap vs ayurworld.org (presentation only)

| Pattern | ayurworld.org | AYURDISHA | Gap |
|---|---|---|---|
| Full-bleed colour “rooms” | Strong alternating navy/black/white/earth/mint | Mix of canvas/white/surface + a few `ui-dark` bands | Moderate — dark bands exist but rhythm is softer / more “editorial store” |
| Hero cinema | RevSlider + seals | Project imagery slider (`f844896`) | **Closed** (adapted) |
| Action-card conversion grid | Many equal org CTAs | Ask Desk + Final CTA + scattered MoreLinks | Product already clearer; don’t import CTA spam |
| Place story band | Odisha essay | Temple in hero + timeline figure | Mild — could strengthen one dedicated place beat |
| Journey / lineage | DIPI journey heading + editions | `HomeTimeline` already | Mild polish, not a new section type |
| Dignitary messages | PM quote + Messages wall | None (correct for product) | **Do not adopt** |
| Sponsor logo wall | ~19 logos | None | **Do not adopt** |
| Satellite / blog carousels | Dense KNOW MORE / topics | Pathways + mentors shelf (purposeful) | Don’t add news clutter |
| Live stats | None prominent | `HomeStats` + `/api/...publicStats` poll | Inverse gap — we already pay network on load |
| Scroll density | Very long, many jobs | Also long (14 bands) | Risk of **more** motion without cutting length |
| Third-party motion weight | RevSlider + Divi + DIPI | First-party CSS/IO | Keep first-party |

---

## 3. What to adopt (brand-adapted)

Adopt **feel and rhythm**, not assets, copy structure, or org IA.

1. **Clearer below-fold “rooms”** — strengthen 2–3 full-bleed tonal shifts (e.g. Ask Desk / WAC / Final CTA already dark) so scroll stops read as intentional stages: *Ask → Mentors → How → Congress → Act*.
2. **One conversion island early** — Ask Desk as the single loud card/band (already present); visually elevate it the way ayurworld elevates Register — without QR walls or exhibitor CTAs.
3. **Place beat** — one short Bhubaneswar / Temple City interlude (copy + existing temple asset), not an Odisha tourism essay.
4. **Journey polish** — keep `HomeTimeline`; optional dual-line heading treatment **in our type system** (Cormorant/UI tokens), not DIPI typing effects.
5. **Soft once-only reveals** — already shipping; tune thresholds / stagger so bands feel “hosted,” not busy.
6. **Photo interludes as punctuation** — keep `HomePhotoBand` / collage; limit to 1–2 strong moments (ayurworld’s strength is occasional atmosphere, not continuous chrome).

**Hard rules (carry forward from hero doc):**

- No WAC / ministry / government **logos, seals, crests**.
- No PM / dignitary quote walls.
- No sponsor grids.
- No RevSlider / Page-builder plugins / new motion CDNs.
- No hard-coded production hostnames.
- Free-plan: **no new network on Home load**; prefer reducing `publicStats` chatter over adding third-party pixels.

---

## 4. Demerits / risks

| Risk | Why it matters | Severity |
|---|---|---|
| **Performance** | ayurworld-like density (many images, sliders, reveals) fights LCP/INP on student phones; our Home already loads hero + collage + pathway art | High |
| **A11y / vestibular** | Extra parallax, Ken Burns, typing headings, auto carousels → nausea; must keep `prefers-reduced-motion` complete | High |
| **Brand dilution** | Looking like the **congress org site** weakens AYURDISHA as “Meet the Mentors hall” and can imply official portal parity we don’t have | High |
| **Content mismatch** | Org CTAs (exhibitor, papers, film fest, satellite seminars, dignitary messages) ≠ student Ask Desk / mentors / track | High |
| **CLS / SEO** | Late-revealed sections, reserved-height failures, carousel swaps → layout shift; long thin content can dilute topical focus for `/` | Medium |
| **Maintenance** | Scroll choreography across 14 sections is brittle (breakpoints, reduced motion, Shelf + parallax + CountUp) | Medium |
| **Free-plan / network** | `HomeStats` already polls `publicStats`; copying “live dashboards,” chat widgets, or GTM-like tags adds cost and quota risk | High if expanded |
| **Length fatigue** | Adding motion without cutting sections makes a long page feel longer | Medium |
| **Legal / trust** | Seals, PM imagery, sponsor marks → brand/IP and false-authority risk | High if copied |

---

## 5. Phased plan (proposal only)

### Phase A — Rhythm & restraint (low risk)

- Audit Home length: mark candidates to **merge or demote** (e.g. Quote vs Final CTA redundancy; Collage vs PhotoBand).
- Tune existing `data-reveal` / dark-band rhythm only (tokens, spacing, one place beat).
- Confirm reduced-motion paths for hero + parallax + timeline + CountUp.
- **No new sections, no new network, no new image weight.**

### Phase B — Presentation upgrade (medium)

- Elevate Ask Desk + Mentors as the two “rooms” below hero (ayurworld-like card island **language**, our content).
- Polish `HomeTimeline` heading/track to feel more ceremonial (CSS only).
- Optional short Bhubaneswar place strip using **existing** assets.
- Lighthouse mobile pass gate before merge.

### Phase C — Motion enrichment (optional, highest scrutiny)

- At most **one** new intentional motion motif below fold (e.g. stronger once-stagger on How-it-works **or** timeline progress emphasis — not both plus new carousels).
- Still no third-party sliders, logo walls, or dignitary modules.
- Explicit vestibular QA checklist + `prefers-reduced-motion` screenshot pair.

### What NOT to copy

- Revolution Slider / Divi / DIPI / typing dual headings as products.
- Government or WAC seals on any surface.
- Sponsor / partner logo walls.
- PM or dignitary “Messages” carousels.
- Satellite seminar grids and KNOW MORE spam.
- Floating WhatsApp + social rail on Home.
- App QR twin cards (unless product later ships a real app — out of scope).
- Exhibitor / call-for-papers / film-fest IA.
- Auto-playing below-fold carousels that fight the hero carousel.

---

## 6. Recommendation

**Proceed with Phase A only after owner answers §8.**  
Treat ayurworld.org as a **congress-atmosphere reference** for colour-plane rhythm and place credibility — not as a template for Home IA or CTA density. AYURDISHA’s job is Meet the Mentors + Ask Desk; the org site’s job is registration, papers, expo, and prestige. Extending cinematic presentation below the fold is valuable only if we **shorten or focus** the scroll at the same time and keep free-plan / a11y constraints intact.

Hero (`f844896`) already captured the highest-value borrow. Below-fold work should be **editorial rhythm + restraint**, not feature expansion.

---

## 7. STOP — await owner approval

No Home UI implementation from this analysis until the owner answers the decision questions below and explicitly unlocks a phase (A / B / C).

---

## 8. Decision questions

1. **Scope:** Approve Phase A only, A+B, or the full A→C path (or decline below-fold ayurworld-inspired work)?
2. **Length:** May we cut or merge Home sections (e.g. Collage / Quote / PhotoBand) to make stronger “rooms,” or must section count stay as-is?
3. **Live stats:** Keep `HomeStats` polling on first paint, defer until interaction/visibility, or replace with static facts only (free-plan / no extra network preference)?
4. **Place story:** Want a dedicated short Bhubaneswar / Temple City band, or is hero slide + timeline figure enough?
5. **Dark-band intensity:** Should below-fold use more high-contrast navy/black planes (closer to ayurworld), or stay in the current cream/sage editorial system with only selective dark CTAs?
6. **Motion budget:** Cap below-fold to existing reveal + parallax + timeline progress, or allow one new motif in Phase C (specify which section)?
