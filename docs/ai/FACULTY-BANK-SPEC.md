# DISHA faculty Q&A bank — spec ("backend prompt")

Status: v1 (Stream 1 Clinical Practice, 100 Q&As, all *Draft – pending validation*).
Owner: AYURDISHA staff + AIIA Goa faculty reviewers. Related: `docs/ai/AI-ANSWER-PIPELINE.md`,
`docs/ai/KNOWLEDGE-BASE.md`, `docs/faculty/HOW-TO-ADD-A-STREAM.md`.

## 1. Goal

Faculty write and validate question-and-answer pairs per career stream. DISHA (the AYURDISHA AI
mentor assistant) must treat them as its **highest-priority knowledge source** when a student's
question means the same thing — however it is worded (English, Hinglish, Hindi, short/casual,
from a student, intern, practitioner, career-switcher or abroad aspirant) — while every answer still
goes through mentor/official review. Target load: 3,000+ students at WAC 2026.

## 2. Strategy (no fine-tuning)

* **No model fine-tuning.** Faculty answers change (regulations, review cycles); fine-tuning would
  freeze unvalidated text into weights, cannot be cited, and cannot be withdrawn. Instead:
* **Retrieval-augmented drafting with a faculty bank on top.**
  1. Match the incoming question to faculty Q&As (lexical BM25 over question + paraphrases +
     keywords, plus the merge engine's question similarity and intent-signature conflict check).
  2. On a confident match, put the faculty answer into the drafting prompt as `FACULTY_ANSWER`,
     ahead of everything else, labelled with its validation status.
  3. Boost the row's official source URLs in passage retrieval so citations come from the same
     regulator pages the faculty pointed at.
  4. The model writes the student-specific answer under the existing rules (facts only from cited
     official passages), the verifier checks it, and a mentor/official approves it on the desk.
* **Status decides authority.**
  * `approved` / `edited` → "faculty-validated: the authoritative position". Very high similarity
    → *reuse with light personalisation* mode (keep the substance, adapt wording/stage).
  * `draft` → "faculty draft, unvalidated": framing and coverage only; never authoritative.
  * `rejected` → never matched.
* **Never bypass review.** A faculty match never auto-sends; it changes the prompt and adds
  provenance (`facultyBankId`, chip "Matched faculty Q&A CP-01-002 (approved/draft)") only.
* **Medical screen first.** The existing classifier still runs before matching; patient-specific
  questions go to a mentor even if they resemble a faculty row.

## 3. Data model

Bundled file per stream: `data/faculty/<streamId>.json` (built by the importer, enriched offline).

```jsonc
{
  "version": 1,
  "stream": "Clinical Practice",          // workbook "Stream" text
  "streamId": "clinical-practice",        // DISHA stream id (server/ai/personas/index.js)
  "workbook": "data/faculty/source/DISHA_Stream_1_Clinical_Practice_100_QA_Draft.xlsx",
  "importedAt": "2026-11-07T…Z",
  "sources": [{ "name": "…", "url": "https://…", "note": "…" }],   // "Sources" sheet
  "instructions": [["Purpose", "…"], …],                          // "Instructions" sheet (verbatim)
  "entries": [{
    "id": "CP-01-002",                    // Question ID, unique, /^[A-Z]{2,4}-\d{2}-\d{3}$/
    "stream": "Clinical Practice",
    "streamId": "clinical-practice",
    "relatedStreams": ["clinical-practice", "internship-early-career"],  // from subcategory
    "subcategory": "Career opportunities after BAMS",
    "audience": "BAMS / Intern / New graduate",
    "question": "Can I start private clinical practice immediately after completing BAMS?",
    "draftAnswer": "…faculty draft (~220 chars)…",
    "keywords": ["career opportunities after bams", "private", "clinical", "practice"],
    "sources": ["https://ncism.org.in/ayurveda.html"],
    "priority": "high" | "standard",      // Validation priority
    "reviewer": "",                       // Expert reviewer ("Unassigned" → "")
    "status": "draft" | "approved" | "edited" | "rejected",
    "statusText": "Draft – pending validation",   // original cell text
    "reviewerNotes": "",
    "approvedAnswer": "",                 // the text faculty approved (enriched or draft cell)
    "enrichedAnswer": "", "actions": [], "mistake": "", "verifyLocally": "",
    "citations": [{ "url": "…", "title": "…", "chunkId": "…", "quote": "…" }],
    "confidence": 0.0, "flags": [],
    "enrichedBy": { "provider": "gemini", "model": "…", "at": "…" },
    "variants": { "openai": { "enrichedAnswer": "…", … } },   // --both comparison
    "paraphrases": [{ "text": "…", "lang": "en|hinglish|hi", "persona": "student|intern|…" }],
    "updatedAt": "2026-11-07T…Z"
  }]
}
```

App state is stored **one record per entry** (`server/ai/facultyStore.js`), so a full enriched
stream workbook fits: Firestore `faculty_bank/<streamId>__<entryId>` (KV fallback
`aym:faculty:doc:<streamId>__<entryId>`) holds `data` (the uploaded row; paraphrases ≤ 12,
citations ≤ 6; fields of a row still over 200 KB go to the child doc `…/parts/long`) and `review`
(status, reviewer, notes, edited answer made in the app). A small manifest per stream
(`faculty_streams/<streamId>` / `aym:faculty:manifest:<streamId>`: count, version, last upload,
source workbook, Sources / Instructions) bumps its `version` on every write; readers check the
manifests at most every 60 s and reload entries only when a version changed. Reads layer the
bundled JSON (baseline) ⊕ stored rows (newer `updatedAt` wins; a newer bundled draft never
demotes a stored approval) ⊕ reviews. Import merge rule: an uploaded "Draft" never demotes an
approved / edited / rejected row; any other uploaded status wins; reviewer notes are kept
("Workbook review columns win" mode also lets Draft win). The panel sends the workbook in parts of
~100 rows. The legacy single-doc format (`stream~` / `entry~` docs, `aym:faculty:stream:` /
`aym:faculty:entry:` keys) is migrated on the first read.

### Status mapping ("Approval status" text → status)

| Cell text (case/dash-insensitive) | status |
|---|---|
| blank, "Draft", "Draft – pending validation", "Pending", "In review" | `draft` |
| "Approved", "Validated", "Approved – no change", "Final" | `approved` |
| "Approved with edits", "Edited", "Revised", "Approved after revision" | `edited` |
| "Rejected", "Not approved", "Remove", "Do not use", "Withdrawn" | `rejected` |
| anything else | `draft` + import warning |

`edited` is authoritative like `approved`; the approved text is the (possibly faculty-edited)
"DISHA enriched answer" cell when present, else the "DISHA draft answer" cell. Reviewers edit the
answer cell in place and use "Reviewer edits / notes" for comments.

### Stream ids

The workbook "Stream" text maps to a DISHA stream id (`shared/facultyWorkbook.js` →
`FACULTY_STREAMS`): Clinical Practice → `clinical-practice`, and one row per remaining DISHA
stream with its ID prefix (e.g. PG → `pg-entrance`, GJ → `govt-jobs`, PK → `panchakarma-wellness`…).
`relatedStreams` per subcategory lets a Clinical Practice row also serve routing to
`panchakarma-wellness`, `pg-entrance` or `internship-early-career`; stream is a mild boost in
matching, never a gate (a student's question is often routed to a neighbouring persona).

## 4. Faculty validation workflow

1. **Import** the faculty workbook (`scripts/faculty/import-bank.mjs` or Staff → Insights →
   Faculty Q&A bank → Upload). Validation: required columns, unique IDs, ID pattern, known stream,
   non-empty question/answer, source URLs parse and are allow-listed (warning otherwise).
2. **Fetch sources** (`scripts/faculty/fetch-sources.mjs`): the Sources sheet + row URLs into the
   KB (`data/kb/manual` → clean → chunk), so enriched answers can cite real passages.
3. **Enrich** (`scripts/faculty/enrich.mjs`, spend-capped): DISHA answer standard (§7) answer,
   next steps, mistake, citations, confidence, flags; 8–10 paraphrases per question.
4. **Export the enriched workbook** (`docs/faculty/DISHA_Stream_1_…_Enriched.xlsx`) → faculty
   validate offline (assign reviewer, edit answer cell in place, set Approval status, notes) **or**
   in-app (Faculty Q&A bank panel: Approve / Edit & approve / Reject with notes).
5. **Re-import** the validated workbook (same importer; review columns merge onto existing entries,
   enrichment kept unless the answer cell was edited → `edited`).
6. Only `approved`/`edited` rows are authoritative. Review time-sensitive rows before launch and on
   a cadence (`updatedAt`; rows older than 180 days flagged in the panel).

## 5. Matching approach (`server/ai/facultyBank.js`)

* **Index**: per entry, variant documents = question (+ keywords + subcategory), each paraphrase.
  Tokens via `shared/merge.js` `analyzeQuestion` (boilerplate strip, Hinglish/Devanagari stop
  words, synonyms, stemming) after a small cross-lingual fold (Hinglish/Hindi → English canonical:
  *kholna* → start, *पंजीकरण* → registration, *ऑनलाइन परामर्श* → online consultation …).
* **Score** per variant: `0.6 × idf-weighted Dice` (query coverage × variant coverage, IDF from
  the faculty corpus) `+ 0.4 × merge.questionSimilarity`; entry score = best variant; +0.03 when
  the persona stream is one of the entry's `relatedStreams`.
* **Conflict gate**: `merge.pairVerdict` hard conflicts (different countries / exams / PG branches /
  specialties / numbers) drop the candidate; a clash of specific asks (cost vs licence) damps it ×0.8.
* **Decision**: `high` when score ≥ `T_MATCH` and margin over the next entry ≥ 0.02;
  `reuse` when approved/edited and score ≥ `T_REUSE`; else `weak` (logged in meta, not used).
  Thresholds are tuned on the *tuning* paraphrase set (seed + generated, leave-one-out) against
  unrelated eval-set questions; the *held-out* set (`tests/ai-eval/faculty-heldout.json`) is never
  used for tuning.
* **Scale**: in-memory index (~1–2 k variants per stream, < 5 ms per query; 16 streams ≈ 30 k
  variants, still < 50 ms); rebuilt when the bundle or overlay changes (2 min TTL like the bank).
  Optional later: embed variants with the KB embedding model and add cosine as a third term
  (multilingual robustness), stored alongside the bundle.

## 6. Audience adaptation

* Entry `audience` (e.g. "BAMS / Intern / New graduate", "Registered practitioner / Clinic owner")
  and the student's `stage` both go to the drafter: the model is told to keep the faculty position
  but address the student's actual stage (an intern asking a practitioner-level question gets the
  "first finish registration" framing).
* Language: answer in the student's language (Hinglish/Hindi questions get Hinglish/Hindi answers;
  the persona already says so); faculty text stays the content anchor.
* Enrichment writes the base answer for the row's audience; paraphrases cover other personas
  (student, intern, practitioner, career-switcher, abroad aspirant) for matching only.

## 7. DISHA answer standard (enriched answers)

Warm, clear, practical; **150–250 words**:

1. **Direct answer** in 1–2 sentences.
2. **Short explanation** with context and options.
3. **3 actionable next steps** (`actions`, imperative, doable this month).
4. **One common mistake** to avoid (`mistake`).
5. **2–3 official sources with links** — only allow-listed domains; prefer the row's source and the
   Sources sheet; each cited claim must be supported by a fetched passage (`citations[].chunkId`).
6. **One-line "verify locally"** note where rules vary by state (`verifyLocally`).

Rules: no invented numbers, dates, fees, eligibility or durations; only facts supported by cited
passages (otherwise say where to check, without the number); career guidance only — no diagnosis,
prescriptions, doses or patient-specific treatment directions; emergencies → "qualified emergency
medical services"; audience-aware wording from Target audience; no coaching/agent recommendations.
Flags: `needs-state-specific-check`, `limited-sources`, `clinical-safety-sensitive`,
`time-sensitive`, `unsupported-claims-removed`.

## 8. Drafting integration (surgical)

* `retrieve.js` calls `matchFaculty(q)`; returns `faculty` (best match) and prepends the entry to
  `bank` as `source: "faculty"` (never `approved: true`, so the generic reuse/suggestion logic is
  unaffected); chunks from the row's source URLs get +0.15.
* `draft.js`: `studentPayload` adds `FACULTY_ANSWER` (status-specific instruction + answer +
  actions + mistake + audience); `prepareDraft` stamps `facultyBankId` + `faculty {id, status,
  score, mode}` on the draft (`base`) so every path (grounded, mentor-assist, reuse, blocked) keeps
  provenance.
* Desk chip (`src/staff/FacultyMatchChip.jsx`): "Matched faculty Q&A CP-01-002 (approved)" /
  "(draft — unvalidated)".

## 9. Staff UI + ops (PIN-gated)

`server/ai/facultyOps.js`, wired with one dispatch line in `server/storePlugin.js` (staff cookie
required): `facultyList {streamId, status}`, `facultyStreams`, `facultyPreview {rows}`,
`facultyImport {rows, streamId, mode}`, `facultyReview {id, status, reviewer, notes, answer}`,
`facultyExport {streamId}` (base64 xlsx), `facultyMatchTest {question}`.
Panel `src/staff/FacultyBankPanel.jsx` in Staff → Insights.

## 10. Adding the other 15 streams

Template `docs/faculty/STREAM-TEMPLATE.xlsx` (same 12 columns + Instructions + Sources), guide
`docs/faculty/HOW-TO-ADD-A-STREAM.md`. Per stream: faculty fill the template → import (CLI or
panel) → fetch sources → enrich → validate → re-import → commit the bundle. Nothing in code changes
per stream; `FACULTY_STREAMS` already lists every DISHA stream id + prefix.

## 11. Evaluation (`tests/ai-eval/faculty-bank-eval.mjs`)

* **Matching** — held-out paraphrases (EN / Hinglish / Hindi / casual): top-1 accuracy, recall at
  the decision threshold, wrong-entry rate; unrelated eval-set questions (non-clinical streams):
  false-match rate (target ≤ 2 %); in-domain eval-set questions: match rate (informational).
* **Answer quality** on enriched answers: citation validity (allow-listed + chunk exists + quote
  verbatim), unsupported-claim count (numbers/dates not in cited passages), structure compliance
  (words 150–250, 3 steps, mistake, 2–3 sources, verify-locally when state-dependent),
  medical-safety (no dose/prescription language; classifier verdicts on the 100 questions),
  language handling (Hinglish/Hindi paraphrases still match; enriched paraphrase coverage).
* Report: `tests/ai-eval/reports/faculty-bank-<date>.md`.

## 12. Scale & cost notes (3,000+ users)

* Matching is local CPU, no API calls; bundle loads once per instance.
* A confident approved match can shorten prompts (fewer passages needed) — `AI_RETRIEVE_K` stays.
* Enrichment is offline and capped (`--max-usd`, default $5); paraphrases are generated once.
* Frequent unmatched questions (desk analytics) → candidates for new faculty rows.
