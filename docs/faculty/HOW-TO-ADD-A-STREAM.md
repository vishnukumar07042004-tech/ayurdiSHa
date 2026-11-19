# How to add a faculty Q&A stream to DISHA

Faculty write and validate question-and-answer rows per career stream. DISHA treats approved rows
as its highest-priority knowledge when a student's question means the same thing (any wording,
English / Hinglish / Hindi). A mentor still approves every reply. Background and rules:
`docs/ai/FACULTY-BANK-SPEC.md`.

Nothing in the code changes per stream: every DISHA stream already has an ID prefix (see the
**Streams** sheet of the template).

## 1. Faculty fill the template

1. Copy `docs/faculty/STREAM-TEMPLATE.xlsx` (regenerate with `node scripts/faculty/make-template.mjs`).
2. Fill the **Stream Q&A** sheet, one question per row, keeping the 12 columns and their order:
   Question ID · Stream · Subcategory · Target audience · Student question · DISHA draft answer ·
   Keywords / intent · Source links (context) · Validation priority · Expert reviewer ·
   Approval status · Reviewer edits / notes.
   * Question ID: `<prefix>-<subcategory 01–10>-<question 001–010>`, e.g. `GJ-03-004`. Unique; never
     reuse an ID for a different question.
   * Stream: the name on the Streams sheet (e.g. "Government Jobs") or the stream id.
   * Source links: official pages only (regulator, ministry, council, exam body).
   * Approval status: leave "Draft – pending validation" until a reviewer signs off.
3. List the stream's official sources on the **Sources** sheet; adapt the **Instructions** sheet.
4. Delete the example row.

## 2. Import

Either in the app — Staff → Insights → **Faculty Q&A bank** → *Upload stream workbook* → check
the preview (errors block the import; warnings such as non-allow-listed URLs do not) → *Import* —
or from the command line (writes the bundled JSON that ships with the app):

```bash
node scripts/faculty/import-bank.mjs path/to/Stream.xlsx --dry-run   # validate only
node scripts/faculty/import-bank.mjs path/to/Stream.xlsx             # → data/faculty/<streamId>.json
```

App uploads are stored in Firestore (`faculty_bank`, one document per row) on top of the bundled
files and work at once — the full enriched workbook can be uploaded in one go (the panel sends it
in parts of 100 rows). The command-line import is the record of truth once committed and deployed.

## 3. Fetch the official sources (network)

```bash
node scripts/faculty/fetch-sources.mjs --stream=<streamId> --check   # allow-list + KB coverage
node scripts/faculty/fetch-sources.mjs --stream=<streamId>
```

Add any blocked domain to `config/ai-sources.json` first (only official bodies).

## 4. Enrich (network, spend-capped)

```bash
node scripts/faculty/enrich.mjs --stream=<streamId> --dry-run              # prompt preview, no calls
node scripts/faculty/enrich.mjs --stream=<streamId> --both --concurrency=6 --spend-cap=5   # recommended
```

Recommended: `node scripts/faculty/enrich.mjs --both --concurrency=6 --spend-cap=5` (≈ 8–10 min per
100 questions; Gemini + GPT variant).

Per row: a DISHA-standard answer (150–250 words, 3 next steps, one mistake, 2–3 cited official
passages, "verify locally"), confidence, flags and 8–10 paraphrases.

* `--concurrency=N` (default 4, max 8): rows processed in parallel; with `--both` the Gemini and
  GPT calls for one row also run together. Rate limits (429) and server errors (5xx) back off
  exponentially with jitter (Retry-After honoured); repeated 429s halve that provider's
  concurrency, which recovers after a run of successes.
* `--spend-cap` is global across workers: no new call starts once spent + in-flight estimate would
  pass it; calls already in flight finish and are kept.
* Progress: one line per finished row, e.g.
  `[12/100] CP-02-003 gemini ✓ (2.1s) gpt ✓ (3.4s) · $0.412 · ETA 6m40s`.
* Safe to interrupt: the bundle is written atomically (`<file>.tmp` then rename) every 5 finished
  rows, at the end and on Ctrl-C, so a crash never leaves half-written JSON. Resumable — re-run the
  same command; rows (and, with `--both`, each provider side) already enriched are skipped unless
  `--force`. Never run two enrichments of the same stream at once.

It writes the enriched workbook to
`docs/faculty/DISHA_<Stream>_QA_Enriched.xlsx` (Clinical Practice:
`DISHA_Stream_1_Clinical_Practice_100_QA_Enriched.xlsx`).

## 5. Faculty validate

Send the enriched workbook to the reviewers. For each row: name in **Expert reviewer**, check the
enriched answer against its citations, edit the answer cell in place if needed, set
**Approval status** (Approved / Approved with edits / Rejected), comments in **Reviewer edits /
notes**. Reviewers can also work in the app panel (Approve, Edit answer → Save edit & approve,
Reject, with notes); approving needs the reviewer's name.

## 6. Re-import and ship

Re-import the validated workbook (step 2). Enrichment and paraphrases are kept; an approved row
whose answer cell changed becomes "Approved with edits". In the app, choose *Keep reviews made in
the app* (default) or *Workbook review columns win*. Commit `data/faculty/<streamId>.json` and
deploy.

## 7. Check

```bash
npm test                                   # includes the faculty matcher tests
node tests/ai-eval/faculty-bank-eval.mjs   # matching accuracy + enriched-answer checks (offline)
```

Use *Test match* in the panel to try student wordings; "not used (below threshold)" means DISHA
drafts without the faculty row. Frequent unmatched questions on the desk are candidates for new rows.
