# Hall map — interactive "How the hall works"

Component: `src/components/HallMap.jsx` (+ `src/styles/hall-map.css`, zone data `src/components/hallMapZones.js`).
Image: `public/assets/hall/hall-map.webp` (desktop, ~1600 px) and `hall-map-m.webp` (mobile, ~900 px); generated originals in `design-src/hall-map/`.
Source: the organiser's booth-overview render (WhatsApp, 29 Oct 2026).

## Purpose

The organiser's render shows the physical Meet the Mentors hall at the **11th World Ayurveda Congress, Bhubaneswar
(10–13 Dec 2026)**. Turned into a tappable map, it answers "what is this hall and where do I go?" in one glance, and
every zone hands the visitor to the matching place in the app. Career guidance only — nothing clinical.

The render cannot be used as is: baked-in signage says "AIIA Goa" (wrong venue), has typos ("2–3 Peeple", cut-off
"Welcom"), uses "AyurDisha" casing, and is graded flat/bright against the site's warm cinematic look. We use a
**text-free** re-render of the same layout and put every label in real HTML.

## Placement

1. **Hall page (`/#hall`)** — new section "How the hall works", directly after the "What happens in this hall" beats and
   before the atmosphere strip / "On this floor" zones. This is the primary home of the map. The hero is unchanged.
2. **Home "How it works" section** (`src/pages/home/HomeHowItWorks.jsx`) — a quiet text link under the three steps:
   "See the hall map ›" opens `/#hall` and scrolls to `#hall-map`. The home hero is untouched.

## Zones (pin order = walking order from the entrance)

| # | Label | What happens there | Tap goes to |
|---|---|---|---|
| 1 | Welcome | Arrival arch; register for a WAC number before you ask. | `/#register` |
| 2 | Ask kiosks | Two self-service kiosks: file one focused career question. | `/#ask` |
| 3 | Organiser desk | AYURDISHA team, QR codes, help with registration and schedules. | `/contact` |
| 4 | Career videos | Replay screen of recorded career talks. | `/#podcast` |
| 5 | Mentor pods | Three pods, one mentor with four or five students each. | `/mentors` |
| 6 | Theme stage | Central stage + seating: mentors answer the hall's most-asked questions. | `/#board` |
| 7 | One-to-one room | Selected students meet a mentor in person (by selection). | `/#ask` (start with a question) |
| 8 | Podcast room | Mentor conversations recorded for those who could not attend. | `/#podcast` |

Every target exists in code (`APP_TAB_IDS` hash tabs in `src/App.jsx`, `/mentors` and `/contact` routes). A unit test
(`tests/hall-map.test.mjs`) checks labels, targets and coordinates.

## Image treatment

- Reference-guided re-render (two passes): `design-src/hall-map/hall-map-v1.jpg` removed most signage but kept the
  stage header text; `hall-map-v2.jpg` (from v1) blanked it and warmed the grade. v2 → `hall-map.webp` (1600×1200,
  197 KB, upscaled from 1152×864 with light unsharp) and `hall-map-m.webp` (900×675, 105 KB). The original render is
  kept as `source-render-aiia.jpg` for reference only — never ship it.
- Same top-down/isometric composition and zone arrangement as the render.
- No text anywhere: blank signboards or a small leaf mark only; no logos, no QR legibility, no venue names.
- Warm golden-hour grade: forest green, cream, teak, brass; Indian academic attire; no clinical elements.
- Pins and labels are HTML over the image (percent coordinates), so copy can change without re-rendering.
- Caption: "Illustrative layout of the Meet the Mentors hall at WAC 2026, Bhubaneswar."

## Interaction & accessibility

- Each pin is a `<button>` with an accessible name ("5. Mentor pods") and `aria-expanded`/`aria-controls` pointing at
  a single card (`role="dialog"`, `aria-labelledby`). Enter/Space opens, Esc closes and returns focus to the pin,
  clicking outside closes. The card has a title, one line, and one CTA link.
- The legend list beside (desktop) / below (mobile) uses the same buttons, so keyboard and screen-reader users get the
  whole map as a list; the image itself is `alt=""`-equivalent decoration described by the caption.
- Visible focus ring (gold), 44 px minimum touch targets on the legend, colour contrast AA on cream.
- Pin pulse only under `prefers-reduced-motion: no-preference`; otherwise static.

## Mobile behaviour (< 768 px)

- The legend list is the primary interaction; the map sits above it at full container width inside a horizontally
  scrollable frame (image at ~150% width, `touch-action: pan-x pan-y pinch-zoom`) so pins stay tappable without
  page overflow. Small pins show numbers only; labels live in the legend.
- Tapping a legend item opens the same card inline under the list item (no off-screen popovers). Tapping a pin opens
  that same inline card and moves focus to it, which scrolls it into view.

## Previews

Headless Chrome and the IDE browser were unavailable in the agent sandbox, so the previews are **simulated** from the
real image, zone data and CSS dimensions (`design-src/hall-map/sim-preview.py`):
`docs/design/screenshots/hall-map-1440-sim.png` (Podcast room card open) and `hall-map-390-sim.png` (Ask kiosks open).
Verify in a real browser after deploy.
