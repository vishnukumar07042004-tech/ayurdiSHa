# Collage — mentoring imagery brief

Component: `src/pages/home/HomeCollage.jsx` (5 tiles, bento grid; may later move to `/about`).
Files are overwritten in place under `public/assets/sections/`; generated originals live in `design-src/collage/`.

## Why

AYURDISHA is the digital **Meet the Mentors** hall of the 11th World Ayurveda Congress (Bhubaneswar, 10–13 Dec 2026): a
career-guidance service for BAMS students, interns and young practitioners. The previous set drifted into clinical and
botanical territory (herb garden, white coat, Panchakarma table with oil vessels). Every tile must now read as a
*mentoring conversation* — guidance, questions, career paths, research and PG — never therapy, treatment or patients.

## Art direction (all tiles — one consistent set)

- **Mood:** heroic, cinematic but natural documentary photography; dignified, warm, hopeful. Mentors look generous, students look engaged.
- **Light:** warm golden-hour light through tall windows or jaali screens; soft rim light on hair and shoulders.
- **Palette:** forest green, cream, sandstone, teak and brass (matches the site's green/cream/gold UI). No cold blue or neon grading.
- **Attire:** Indian academic/professional — cotton kurtas, handloom sarees, Nehru jackets, smart casual shirts; at most a lanyard with a blank delegate badge.
- **Settings:** the WAC Meet the Mentors hall or a congress lounge in Bhubaneswar — teak furniture, sandstone walls/pillars, subtle Kalinga temple-architecture carving or a distant curvilinear spire in the background, soft-focus banners with no legible text.
- **Camera:** 35–50mm look, eye-level or slightly elevated, shallow depth of field; faces in the central 60% of the frame (tiles crop to ~2:1 on desktop and 4:5 on phones); at most 3 people in sharp focus.
- **People:** diverse ages and genders; fictional — no real or named people.
- **Never:** white coats, stethoscopes, patients, massage/therapy tables, oils, herbs being handled, gardens, clinical instruments, legible text, logos, watermarks, distorted hands/faces.

Shared prompt suffix (appended to every prompt below):

> Photorealistic documentary photograph, 35–50mm lens, shallow depth of field, warm golden-hour light, colour palette of forest green, cream, sandstone, teak wood and soft brass, Indian academic professional attire, subjects grouped in the central part of the frame with breathing room at the edges. No white coats, no stethoscopes, no patients, no medical equipment, no massage tables, no oils, no plants being handled, no gardens, no legible text, no logos, no watermarks; natural hands and faces.

## Tiles (same order as the component)

### 1. Large — small circle (`collage-circle.webp`, 1152×864, 4:3)

- **Purpose:** the hero tile — mentoring is a conversation among equals; small groups, real questions.
- **Caption:** Small circles, honest questions
- **Alt:** A senior mentor guiding a small circle of Ayurveda students in the WAC Meet the Mentors hall
- **Composition:** slightly elevated three-quarter view; silver-haired woman mentor in a cream handloom saree with a green border, mid-gesture, centre-right; four or five students (mixed genders, kurtas/smart casual, one with a blank lanyard badge) on teak chairs in a loose circle, leaning in, one with a raised hand; hall behind with sandstone pillars and soft-focus green banners.
- **Prompt:** "Inside a warm congress hall in Bhubaneswar during the World Ayurveda Congress, a silver-haired Indian woman mentor in her sixties wearing a cream handloom saree with a forest-green border sits on a teak chair and gestures warmly as she speaks to a small circle of five young Indian Ayurveda students — men and women in their early twenties wearing cotton kurtas and smart casual shirts, one with a lanyard and blank delegate badge — seated close around her on teak chairs, leaning in, one young woman raising her hand with a question, everyone engaged and smiling; golden light streaming through tall windows with carved sandstone jaali screens, softly blurred sandstone pillars with subtle Kalinga temple carving and plain forest-green banners in the background, slightly elevated three-quarter view." + suffix

### 2. Career paths, mapped together (`collage-garden.webp`, 1024×1024, 1:1)

- **Purpose:** replaces the herb-garden tile — shows the actual output of mentoring: a career plan.
- **Caption:** Career paths, mapped together
- **Alt:** A mentor and two students sketching career options in a notebook at a lounge table during the congress
- **Composition:** eye-level across a teak lounge table; male mentor (50s, salt-and-pepper beard, Nehru jacket over kurta) pointing with a pen at a hand-drawn branching diagram in an open notebook (lines and boxes, no legible words); two students either side, one holding a tablet with a blank glowing screen; brass tea glasses on the table.
- **Prompt:** "At a teak table in a sunlit congress lounge in Bhubaneswar, an Indian male mentor in his fifties with a neat salt-and-pepper beard, wearing a cream kurta and a forest-green Nehru jacket, points with a pen at a simple hand-drawn branching diagram of boxes and arrows (no words) in an open notebook, while two young Indian Ayurveda students — a young woman in a sandstone-coloured kurta and a young man in a smart casual shirt holding a tablet with a blank screen — lean in, attentive and hopeful; two small brass tea tumblers on the table; softly blurred lounge behind with sandstone walls, carved temple-style arch and warm golden window light, eye-level view." + suffix

### 3. One-to-one guidance (`collage-onetoone.webp`, 864×1152, 3:4)

- **Purpose:** replaces the clinical-reading white-coat tile — focused personal guidance.
- **Caption:** One-to-one guidance
- **Alt:** A young Ayurveda graduate taking notes as an experienced mentor talks through her options, one to one
- **Composition:** over-the-shoulder-ish two-shot at a small round table; young woman student in a green cotton kurta, notebook open, pen moving, looking up attentively; older woman or man mentor in profile, open-handed gesture; faces in the upper-central band (CSS crops at 50% 30%).
- **Prompt:** "A quiet one-to-one mentoring conversation at a small round teak table in a congress hall corner in Bhubaneswar: a young Indian woman Ayurveda graduate in her early twenties wearing a forest-green cotton kurta and a lanyard with a blank badge writes in an open notebook and looks up attentively, while an experienced Indian male mentor in his late fifties with grey hair and rimless glasses, wearing a cream kurta, seen in three-quarter profile, explains with an open, reassuring hand gesture; warm golden window light, sandstone wall with subtle carved temple motif softly blurred behind, both faces in the upper middle of the frame, vertical composition." + suffix

### 4. One clear question (`collage-panchakarma.webp`, 1024×1024, 1:1)

- **Purpose:** replaces the therapy-table tile — the Ask Desk, the app's core flow (write one clear question, a mentor answers).
- **Caption:** One clear question
- **Alt:** A student handing a written question card to a volunteer at the Ask Desk, with mentors talking in the background
- **Composition:** eye-level at a teak help-desk counter with a brass bell and a small stack of blank cards; young man student hands a card (handwriting implied, illegible) to a smiling woman volunteer in a green saree with lanyard; mentors chatting in soft focus behind.
- **Prompt:** "At a polished teak Ask Desk counter in a warm congress hall in Bhubaneswar, a young Indian male Ayurveda student in a cream kurta with a lanyard hands a small white question card with faint illegible handwriting to a smiling young Indian woman volunteer wearing a forest-green saree and a lanyard with a blank badge; a small brass bell and a neat stack of blank cards on the counter; in the softly blurred background, two senior mentors in kurtas talk with students beside sandstone pillars and plain green banners; golden afternoon light, eye-level view." + suffix

### 5. Research and PG, demystified (`collage-library.webp`, 1024×1024, 1:1)

- **Purpose:** keeps the library mood but makes it about research and postgraduate entry, not classical-text study.
- **Caption:** Research and PG, demystified
- **Alt:** A senior mentor explaining a research paper to two students in a wood-panelled reading room
- **Composition:** reading-room table between teak bookshelves (spines blank/illegible); senior mentor (60s, white hair, spectacles, khadi kurta) explaining a printed paper with a simple chart; two students (man and woman) on either side, one taking notes; brass reading lamp.
- **Prompt:** "In a wood-panelled reading room of the congress venue in Bhubaneswar, a senior Indian mentor in his sixties with white hair and spectacles, wearing an off-white khadi kurta, explains a printed research paper with a simple bar chart (no readable text) spread on a teak reading table, while a young Indian woman student in a sandstone-coloured kurta takes notes and a young Indian man in a smart casual shirt leans in to look; tall teak bookshelves with plain unlabelled book spines and a brass reading lamp glowing warmly, golden light from a tall window, eye-level view." + suffix

## Section copy

The section sub-line previously read "From the clinic to the garden, the therapy room and the library." and is updated to
match the new set: "From a circle of questions to a plan you can act on." The "Illustrative imagery" label stays.

## Output spec

- WebP at the original file names, same pixel dimensions as before (generated 1024-class source resized/cropped), ≤ 200 KB (≤ 260 KB for tile 1).
- The component uses `.webp` `src` directly (no JPG fallback), so no JPGs are emitted.
- Generated PNG originals kept in `design-src/collage/` (not deployed).
