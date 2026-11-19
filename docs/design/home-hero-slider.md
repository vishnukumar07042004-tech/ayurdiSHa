# Home hero — cinematic congress slider

Scope: `src/pages/home/HomeHero.jsx` + `src/styles/home-hero.css` only. Ask Desk unchanged.

Updated: 19 Nov 2026 (owner Mac / live feedback).

## Problems (owner feedback)

1. **Motion invisible on Mac** — Ken Burns pans (~1%) and long settle delay made motion feel broken or imperceptible; autoplay also stopped forever after any dot/keyboard press.
2. **Gaps too long** — ~7s dwell meant users rarely saw a crossfade; motion never “arrived.”
3. **Chrome clutter** — Pause/Play pill + chunky controls read as a segmented bar; wrong for a brand-first full-bleed hero.
4. **Weak third slide** — `/assets/sections/hall-wac.webp` (~57KB, soft/small) undercut the cinematic set.

## Image picks (audit of `public/assets/` home / hall / mentors / sections / slides)

Chosen **4** strongest widescreen cinematic frames. No new seals/logos invented; project assets only.

| # | Path | Role | Why |
|---|---|---|---|
| 1 | `/assets/home/hero-hall` (+ `-m` phone) | Meet Mentors (LCP) | 1920×1080 mentor + students at oak table, temple through arches; strongest people moment |
| 2 | `/assets/slides/slide-hall` | Congress hall energy | 1920×1080 one-point hall, marigold pillars, mentors at tables; clear WAC scale |
| 3 | `/assets/sections/bhubaneswar-temple` | Place / Bhubaneswar | Kalinga temple + tank + marigolds; host-city presence without fake marks |
| 4 | `/assets/slides/slide-track` | Ayurveda threshold | 1920×1080 student at temple doorway; journey / invitation beat |

**Rejected:** `hall-wac.webp` (too soft/small), square crops (`home-hero`, welcome feature squares), mentor portraits (not full-bleed cinematic).

## Motion spec

| Token | Value | Notes |
|---|---|---|
| Autoplay dwell | **4000ms** | Target band 3.5–4.5s |
| Crossfade | **750ms** | Opacity only; GPU-friendly |
| Ken Burns | **scale 1.06 → 1.15** + pan **±2.4–3.2%** | Continuous over the dwell; no long pre-settle |
| Pause | Hover / focus within hero | Autoplay resumes on leave/blur |
| Keyboard | ← → | Advances without killing autoplay |
| `prefers-reduced-motion: reduce` | Static **slide 1 only**, no autoplay, no Ken Burns, no entrance stagger | |

Mac Safari/Chrome: `translate3d` + `scale` in one `transform`; `will-change: transform, opacity` on active media; remount/tick so CSS animations restart each advance.

## Control spec

- **Keep:** thin progress **dots** (active elongates + gold fill timed to dwell). Clickable; keyboard ←→.
- **Remove:** Play/Pause button; any segmented / three-column chrome.
- No cards, chips, badges, or floating seals on the media plane.

## Composition (unchanged hierarchy)

Brand `AYURDISHA` → WAC line (edition · dates · venue/city) → headline → one support line → CTA group (Ask Desk / Explore mentors / About). Full-bleed, one composition, brand-first.
