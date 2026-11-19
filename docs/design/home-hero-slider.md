# Home hero — cinematic congress slider

Scope: `src/pages/home/HomeHero.jsx` + `src/styles/home-hero.css` only.

## Inspiration (ayurworld.org, studied 19 Nov 2026)

- Full-bleed RevSlider: edge-to-edge photography, ~80–100vh.
- Clear hierarchy: event identity → place/date → one message; breathing room in sky/negative space.
- Motion: auto-advancing slides with soft crossfades; pause on interaction.
- Credible congress presence via place (temple/city) + gathering imagery — **not** copied logos, seals, or WAC brand marks.

## AYURDISHA adaptation

One composition for the first viewport:

1. **Brand** — `AYURDISHA` as a hero-level wordmark (Cormorant accent).
2. **Congress line** — 11th WAC · 10–13 Dec 2026 · Janata Maidan, Bhubaneswar (from `WAC` in `site.js`).
3. **Headline** — Meet the minds shaping *Ayurveda.*
4. **One support sentence** + **one CTA group** (Ask Desk / Explore mentors / About).
5. **Dominant visual plane** — three full-bleed project images that crossfade:

| # | Asset | Role |
|---|---|---|
| 1 | `/assets/home/hero-hall` (+ `-m` phone) | Mentors in the hall (LCP) |
| 2 | `/assets/sections/bhubaneswar-temple` | Place / Odisha presence |
| 3 | `/assets/sections/hall-wac` | Congress gathering energy |

No cards, no floating chips/badges on media, no government seals, no hard-coded production hostnames, no new network/Firestore on home load.

## Motion (2–3 intentional)

1. **Auto-advance** (~7s) with crossfade; pause while hovered, focused, or when a control is pressed.
2. **Ken Burns–lite** slow scale/pan on the active slide only.
3. **Progress dots** (and optional prev/next) with `aria-roledescription="carousel"`, keyboard ←/→, and a polite live region.

`prefers-reduced-motion: reduce` → show slide 1 only, no autoplay, no Ken Burns, no entrance stagger.

## A11y / responsive

- Section is a carousel; each slide is a group; inactive slides `aria-hidden` + `inert`.
- Scrims keep cream text ≥ ~7:1 on forest-tinted media.
- Mobile: full-bleed stack; Ask Desk CTA full-width; same hierarchy.
