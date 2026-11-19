# AYURDISHA merge — precision-first specification

Status: implemented in `shared/merge.js` (server + Curation desk), 25 Oct 2026.
Threshold 0.48, pack cap 7, pair floor 0.75 × threshold, suggestion floor 0.30.

## 1. What a correct merge is

Two student questions may share a group **only if one mentor answer fully serves both**:

- **same subject** — what the answer is about (AIAPGET, PSC medical officer exam, own clinic, UK, MD Shalya, CTRI…), and
- **same ask** — what the student wants to know about it (how to, cost, salary, books, syllabus, cut-off, eligibility, licence, timing, location, comparison…).

"Clinic licence" and "clinic cost" share a subject but not an ask; "practise in the UK" and "practise in Germany" share an ask but not a subject. Both are **wrong merges**: one of the students gets an answer to a question they did not ask. A missed merge only costs mentor time; a wrong merge costs a student their answer. So the engine is **precision-first**: when in doubt it does not merge, it *suggests* to staff.

Wrong-answer rate = share of students whose intent differs from their group's mentor question. Pairwise precision = same-intent pairs ÷ all pairs inside automatic groups.

## 2. Error taxonomy — what the live engine got wrong

Every wrong pair made by the engine live before this work (H = `scripts/bench/merge-live-hybrid-oct24.js`, 0.48, avg-linkage guard + packing pass), on all six datasets, classified by the first precision-first rule that rejects it (`node scripts/bench/error-taxonomy.mjs`; full rows in `error-taxonomy.json`, baseline A in `error-taxonomy-tables.md`).

**Sub-areas kept (default)**

| category | A-1200 | B-dev | Fresh-403 | B-heldout | New-460 | New2-499 | total | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| One adds a specific ask the other lacks (books vs how-to, cut-off vs prep) | 40 | 10 | 0 | 1 | 4 | 12 | 67 | 62% |
| Extra subject on one side (PG vs PG + PhD, clinic vs clinic + Panchakarma) | 11 | 7 | 0 | 0 | 1 | 3 | 22 | 20% |
| Chained (pair below threshold, joined through the group) | 0 | 0 | 0 | 0 | 2 | 5 | 7 | 6% |
| Same subject, clashing asks (licence vs cost) | 0 | 5 | 0 | 0 | 0 | 0 | 5 | 5% |
| With vs without PG | 0 | 0 | 4 | 0 | 0 | 0 | 4 | 4% |
| Different PG branch / specialty | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 1% |
| No shared subject anchor (only a shared back-story) | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1% |
| Not caught by pair rules | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1% |
| **wrong pairs** | 51 | 23 | 4 | 1 | 8 | 21 | **108** | |
| wrong-answer students | 12 | 9 | 2 | 1 | 7 | 8 | **39** | |
| look-alike sibling pairs | 14 | 2 | 4 | 1 | 5 | 14 | 40 | |
| pair score itself < 0.48 (joined via group averaging / packing) | 38 | 21 | 3 | 1 | 6 | 17 | 86 (80%) | |

**Sub-areas mixed**: 187 wrong pairs, 72 wrong-answer students — 48% extra specific ask, 40% extra subject, 4% clashing asks, 3% chained, 2% with/without PG, 1% each no shared subject / PG branch / too few words / uncaught.

What this says:

1. **80% of wrong pairs scored below the threshold on their own** — they were pulled in by average linkage or the packing pass. Complete linkage (every pair must qualify) removes the whole class.
2. **Word overlap cannot see the ask.** "Best books for AIAPGET" and "How to prepare for AIAPGET" share every content word except the ask. 62–67% of errors are an ask mismatch.
3. **Subjects must match exactly**, not mostly: one extra subject (PhD, Panchakarma, abroad) changes the answer.
4. Conflicting specifics (country, exam, PG branch, numbers, with/without PG) are rare but always fatal, so they are hard blocks — never merged, never even suggested.

## 3. Design

### 3.1 Intent signature (per question, deterministic)

After cleaning (greetings, self-introductions, back-story sign-offs stripped; EN + Hinglish + Devanagari stopwords; synonym folding; stemming; typo snapping within the bucket):

- **Subject anchors** — curated Ayurveda-career taxonomy (`STRONG_SUBJECTS`, `WEAK_SUBJECTS` in `shared/merge.js`), derived from the 10 themes / 56 sub-areas and the datasets: PG / AIAPGET / NEET-PG; 13 PG branches (Kayachikitsa, Shalya, Shalakya, Prasuti, Kaumarbhritya, Dravyaguna, Rasashastra, Swasthavritta, Agadtantra, Roganidana, Samhita, Sharira, Manasroga) and specialties (skin, infertility, ortho); PhD, diploma, internship; government / PSC / UPSC / medical officer / NAM / CCRAS / WHO / MPH; clinic, hospital, Panchakarma, therapist, staff, patients, records, camp, yoga, insurance; faculty, leadership; research, thesis, publish, ethics, CTRI, trial, statistics, sample size, grant; funding, incubation, patent, trademark, startup; GMP, manufacturing, QA/QC, pharmacovigilance, regulatory; social media, advertising; export, MVT, resort, NABH; abroad, visa, bridging and 18 countries/regions. Weak anchors (journal, course, college, product, brand…) count as shared subjects but never block. "PG entrance" ⇒ AIAPGET, "MO exam" ⇒ PSC, any branch / AIAPGET ⇒ PG, any country ⇒ abroad.
- **Ask type** — specific asks change the answer: cost / fees, salary / income, books / resources, **syllabus / pattern** (new), cut-off / rank, eligibility, is it required, licence / legal, timing, location, changing course, comparison. Generic asks (how-to, which one, scope, is it possible) are mutually compatible.
- **Specifics** — country, exam, PG branch, specialty, numbers with units (months normalised), "without PG".

### 3.2 Hard requirements for a pair to share an automatic group (`pairVerdict` → `close`)

1. Same theme (and same sub-area when "Keep sub-areas separate" is on).
2. No conflicting specifics (different country / exam / PG branch / specialty / numbers / with vs without PG). A conflict means never merged and never suggested.
3. At least one shared subject anchor, and no strong subject on one side only ("own clinic" ≈ "private practice"; research/government as a modifier of an already-shared subject is forgiven). Two subject-less questions qualify only when both reduce to the general "what after BAMS" ask (fallback analysis); a shared back-story is never an anchor.
4. Compatible ask: neither names a specific ask, or both share one.
5. At least 2 shared content words (1 when both questions are ≤ 2 words).
6. Score ≥ threshold to link; every pair in the group ≥ threshold × 0.75 (score = 0.55 weighted Jaccard + 0.35 Jaccard + 0.10 bigram, with ask-type damping).

Grouping is **complete linkage** over these pairs (strongest first, ties broken by question id): two groups join only if every cross pair is `close`. The packing pass is gone. Groups never exceed 7; overflow starts a new group. The optional context field never creates a merge — it only adds ≤ 0.02 to the ordering weight of a pair that already qualifies.

### 3.3 Confidence tiers

| tier | where | rule |
|---|---|---|
| **AUTO** | merged | all hard requirements, score ≥ threshold. Badge **High confidence** (weakest pair ≥ threshold) or **Good match** (weakest pair ≥ 0.75 × threshold). |
| **SUGGESTED** | "Suggested merges" panel, not merged | same theme, no conflict, shared subject (or two "after BAMS" questions), at most one unmatched subject, same ask or a soft extra ask (is it required / legal / eligibility), score ≥ 0.30. Reason shown: different sub-areas, one also mentions X, one asks something more specific, worded differently, would make a weak group. Never: locked groups, > 7 students together, pairs staff kept apart. |
| **LOW** | never | everything else. |

Manual merges and older groups are re-explained on the fly; a group whose pairs do not all meet the rules is flagged **Check this group** with the reason (e.g. "members differ (different countries)").

### 3.4 "Why merged"

Each automatic group stores `why = { subjects, ask, min, avg }`, `confidence`, `cohesion` (= weakest pair score). The desk shows: *Why merged: same subject AIAPGET · same ask: books / resources · weakest pair 0.58 · average 0.73*.

### 3.5 Mentor question

The most central, best-worded member, with greetings and introductions removed: Pranam/Pranaam, Namaste/Namaskar(am), Hello/Hi/Hey (doctor/sir/ma'am/team/everyone), Respected sir/ma'am/panel/team, Dear sir, Good morning/afternoon/evening, Sir/Madam, "Myself X, BAMS intern.", "My name is X and I am in 2nd prof.", "This is X from Y.", "I am X, a final-year student."; trailing "pls reply sir", "thanks a lot 🙏", "kindly guide me in detail", "(please answer)". Content words are never removed.

### 3.6 Staff decisions

- **Accept** = existing manual-merge path (`clustersMerge`) with `suggestion: true`: refused (422) if the two groups together exceed 7 or either is locked; 409 on a stale version; answers never copied.
- **Keep apart** = `apartFrom` on both groups (question ids of the other group), saved with the clusters document. Decisions are question-level, so they survive re-merges that renumber groups, follow a student who is split out, block automatic merging of that pair at any threshold, and are cleared only when staff merge those groups by hand. The older group-id `keepApart` is still honoured.

### 3.7 Invariants (unchanged)

No cross-theme automatic group; cap 7; every question in exactly one group; deterministic under input shuffle; answered / sent-to-mentor / published groups keep their members; answers never copied; re-merge idempotent; one module for server and browser; 409 version locking.

## 4. Acceptance criteria and result

Report sets: **B held-out** (163) and **NEW-2** (499, frozen 25 Oct before the round-2 fixes and never inspected before the final run). New-460 was frozen before round 1, but its errors were inspected after round 1, so it is shown for reference only. Tuning used A-1200, B-dev and Fresh-403 only.

| criterion | target | B held-out | NEW-2 | met |
|---|---|---|---|---|
| wrong-answer rate (kept / mixed) | ≤ 0.3% | 0.0% / 0.0% | 0.2% / 0.2% | yes |
| AUTO pairwise precision (kept / mixed) | ≥ 0.99 | 1.000 / 1.000 | 0.995 / 0.996 | yes |
| cross-theme automatic groups, groups > 7, lost / duplicated | 0 | 0 | 0 | yes |
| deterministic on shuffle, re-merge idempotent, locks kept, answers not copied | yes | yes | yes | yes |
| runtime at 1,500 questions | < 1 s | 92 ms build + 73 ms suggestions (kept), 130 ms (mixed) | | yes |
| at least as safe as live engine | — | 0.6% → 0.0% | 1.6% → 0.2% | yes |

Recall cost (honest): AUTO recall on NEW-2 falls from 0.284 (live) to 0.219 (kept) and 0.381 → 0.266 (mixed); with staff accepting suggestions it rises to 0.490 / 0.472, above the live engine. On A-1200 AUTO recall is 0.509 vs 0.582 live. Fewer students are auto-merged (NEW-2 kept: 40% vs 47.5%); the gap moves into the Suggested merges panel (120 suggestions on 499 questions, 96% of suggested pairs correct).

Full tables: `precision-bench-tables.md` (`node scripts/bench/precision-bench.mjs --final`).

## 5. Known limitations

- **Ask words inside a back-story.** The single remaining NEW-2 error: two AIAPGET questions both prefixed with "I feel pressure to start **earning** soon" — "earning" reads as a salary ask on both, so a test-series question joined a drop-year question. Ask detection should read only the question sentence; not fixed, to keep NEW-2 clean.
- **Typo'd representative.** The most central member may carry a typo ("Can I pactise Aurveda in Australia?"); staff edit the composite.
- **Taxonomy coverage.** A subject not in the taxonomy falls back to shared words + ask; new event topics should be added to `STRONG_SUBJECTS`.
- Benchmarks are synthetic (hand-written templates with noise); real Ask Desk data may contain phrasings none of the sets anticipated. Watch "Check this group" flags on event day.

## 6. Files

- Engine: `shared/merge.js` (`intentSignature`, `pairVerdict`, `buildClusters`, `suggestMerges`, `explainGroup`, `keepGroupsApart`, `keptApartPairs`, `tidyQuestion`, `mergeClusterGroup(..., { suggestion })`).
- Desk: `src/App.jsx` (Curation desk §01–04); server: `server/storePlugin.js` (`clustersMerge` with `suggestion`).
- Tests: `tests/merge-precision.test.mjs` (hard negatives, hard positives, suggestions, keep apart, invariants, scale guards on both frozen sets), `tests/pipeline.test.mjs` (accept / keep apart through the API).
- Bench: `scripts/bench/precision-bench.mjs`, `error-taxonomy.mjs`, `build-new-set.mjs`, `build-new2-set.mjs`; fixtures `tests/fixtures/merge-new-460.json`, `merge-new2-500.json` (sha256 pinned in tests).
