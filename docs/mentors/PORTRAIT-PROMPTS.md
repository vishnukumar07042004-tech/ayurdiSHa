# Mentor hall portraits — generation lock

Illustrated faces for Meet the Mentors. Files live at `public/assets/mentors/portraits/mXX.webp`
(under `/assets` so Vercel does not SPA-rewrite them to `index.html`).

## Shared style

- Painterly editorial illustration, cream–sage AYURDISHA palette
- White/cream clinical apron + clearly visible stethoscope on **every** mentor
- Bust / three-quarter view, South Asian faculty look matching the roster name
- No text, initials, logos, or watermarks in the image
- Unique face, hair, age cue, and pose per mentor — never reuse one plate

## Domain backgrounds

| Field | Atmosphere |
|---|---|
| Clinical Practice | Warm sage consultation room, herbs / pulse desk |
| Academics & Samhita | Gold–olive study, palm-leaf / copper sutra shelf |
| Research & Evidence | Soft teal–sage research office / lab blend |
| Pharmacology & GMP | Cream pharmacy, copper vessels, materia medica jars |

## Sex

Inferred only from given names on the roster (e.g. Sujata, Bharti, Nisha, Pradnya → female).
No invented biography.

## Web motion

`MentorPortrait` wraps art in `.ed-portrait-motion` (slow breathe + gleam + leaf).
`prefers-reduced-motion: reduce` disables animation.
