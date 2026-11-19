# Ask Desk UI refresh — plan

**Scope:** Ask Desk page UI/layout only (`/#ask`). No Home hero, top nav, staff, or API/data-model changes.
**Keep:** free-plan quotas (no new Firestore reads on load), no fixed deadline dates, no secrets, WAC-portal ready hosts, WCAG 2.1 AA, i18n strings file, existing design tokens.

## Steps

1. **Layout** — Desktop ≥1100px: max-width ~1200px, 8/12 form + 4/12 sticky side panel. Below 1100: single column; side panel → collapsible “What happens next” above submit.
2. **Question-first stepper** — Question · Who · Consent · Review. Large auto-grow textarea, counter, good-question checklist (non-blocking). Topic chips preselect track + prompt. Track cards + “Not sure — route it for me”.
3. **Identity** — Compact WAC summary when prefilled; Edit expands fields. Neutral locked ID + Verified (no yellow). Autofill unchanged. Hall fields stay on Who (same validation).
4. **Consent / Review** — Four unticked consents + AI notice; review summary; Submit disabled until valid with inline reasons.
5. **Country** — **Propose only** (see § Item 5). Do not implement.
6. **Convenience** — `sessionStorage` draft for question fields only; clear on success; leave warning; `aria-live` errors; sticky mobile Back/Next/Submit; confirmation ticket copy + Track link; no countdowns.
7. **A11y / perf** — Focus management on step change; reduced-motion safe; no extra network on load.
8. **Tests** — Playwright not in repo; strengthen `scripts/e2e/ask-render-check.mjs` + unit test for draft helpers. Document Playwright gap.

## File list

| File | Role |
|------|------|
| `src/AskDeskView.jsx` | Ask Desk UI + stepper (extracted from App) |
| `src/content/askDeskStrings.js` | i18n-ready copy |
| `src/styles/ask-form.css` | Ask Desk layout / panel / sticky bar |
| `src/askDraft.js` | sessionStorage question draft helpers |
| `src/App.jsx` | Thin `AskView` wrapper + remove inlined Ask UI |
| `docs/design/ASK-DESK-UI-PLAN.md` | This plan + Item 5 proposal |
| `tests/ask-draft.test.mjs` | Draft helper unit tests |
| `scripts/e2e/ask-render-check.mjs` | Stepper-aware fill helpers |

## Item 5 — Country field (PROPOSE ONLY)

**Intent:** Collect country; if India → keep State/UT select; else free-text region.

### Exact data-model / API changes (when approved)

1. **Client form state:** add `country` (default `"India"`), keep `state` (repurpose label: “State or UT” when India, “Region / province” otherwise).
2. **`shared/askOptions.js`:**
   - Add `ASK_COUNTRIES` (short curated list + “Other”) or free-text with max length in `TEXT_FIELDS.country` (e.g. 80).
   - Extend `normalizeAskRecord` / `TEXT_FIELDS` with `country`.
   - `offListAskFields`: optionally validate country against list; do **not** reject unknown values (same policy as stage/state today).
3. **Submit payload (`AskDeskView` / store):** send `country` alongside existing fields. No new endpoints.
4. **Staff exports / mentor pack:** add `country` column after email or before state; keep `state` column.
5. **Privacy copy (`LegalPages` / privacy):** document country + region purpose (routing / desk stats only).

### Privacy impact

- New PII geography field beyond Indian State/UT.
- Useful for diaspora / outside-India asks already using `OUTSIDE_INDIA` in state.
- Retention same as other Ask Desk fields; no extra third-party share beyond existing AI enqueue of question text (country is metadata for staff, not required for DISHA).

### Rollback

- Stop sending `country` from the form; older clients omit it.
- Server already drops unknown? → with `normalizeAskRecord` whitelist, omitting `country` from `TEXT_FIELDS` ignores the field.
- Staff grids tolerate missing columns; no migration required for existing tickets.

### Decision needed from owner

Approve Item 5 before any code. Until then, keep State/UT (+ existing `Outside India` option) only.
