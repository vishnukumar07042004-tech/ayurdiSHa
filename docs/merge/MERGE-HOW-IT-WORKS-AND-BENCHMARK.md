# AYURDISHA merge — how it works, benchmark, and recommended threshold

*Curation desk · Meet the Mentors · 11th World Ayurveda Congress (Bhubaneswar, Dec 2026). Written 24 Oct 2026.*

## TL;DR

- On a realistic, labelled desk of **539 BAMS questions (113 intents)**, the merge as it shipped (here "**v1**", frozen in `scripts/bench/merge-v1.js`) under-merges badly. At its 0.42 default only **29 %** of questions land in a group, mentors would face **430 groups** where ~133 would do, and **9 %** of students sit in a group whose shown question is a different ask.
- A benchmark-tuned engine ("**v2**", `scripts/bench/merge-candidate.js`, a drop-in for `shared/merge.js`) improves every quality metric on **held-out intents never looked at during tuning**. At its recommended 0.45:
  - pairwise precision **0.785 → 0.922**;
  - recall **0.087 → 0.122** (+40 %);
  - B-cubed F1 **0.444 → 0.503**;
  - mis-served students **5.5 % → 2.5 %**;
  - groups **133 → 122**.

  It also wins on an independent 1,200-question desk built by a different author.
- **Recommended default: 0.45** with v2. The safe range is **0.42–0.50**; keep "**Keep sub-areas separate**" **on**.
- **Staff should review groups whose cohesion ("closest-pair floor") is below 0.30 first.** That is about a third of merged groups, and it catches the largest share of wrong merges.
- **v2 is not yet wired into `shared/merge.js` or deployed.** During this session another process was rewriting `shared/merge.js` in the same working tree. That rewrite (default 0.48, boilerplate stripping, `packMean`) was still changing on disk. Merging on top of it, or deploying a half-edited file, would have risked clobbering it. See [Adopting v2](#adopting-v2) for the exact steps; nothing was written to production Firestore.

---

## 1. How the merge works (v1, the shipped algorithm)

The code is in `shared/merge.js` (frozen copy: `scripts/bench/merge-v1.js`). It is called from the Curation desk (`src/App.jsx → CurationView.run → buildClusters(subs, threshold, useSub, clusters)`). The server (`server/storePlugin.js`) only uses `mergeClusterGroup` (staff manual merge) and `sanitizeClusters`. It never auto-merges, so **`MERGE_DEFAULTS.threshold` is the single source of the default**, which the slider (`0.15–0.70`, step 0.01, label "Word overlap needed to merge") reads.

### Step 0 — gates and locked groups
1. Groups that are **Answered / Sent to mentor / Published** (or carry an answer) are *locked*. They keep their members, and each of those questions is claimed first.
2. Every other question is bucketed by **theme** (hard gate, always). When staff tick **Keep sub-areas separate** (the default), it is bucketed by **theme + sub-area**. Questions in different buckets are never compared, so cross-theme merges are impossible (verified: 0 in every run below).

### Step 1 — normalise text
- Unicode NFD and strip accents, then lower-case.
- `PHRASES` regexes map multi-word and punctuated forms to one token *before* punctuation is stripped:
  - `M.D.→md`, `post-grad…→pg`, `Ph.D→phd`, `R&D→rnd`;
  - `NEET-PG→"pg exam"`, `AIAPGET/AI-APGET/APGET→"aiapget pg exam"`;
  - `panch(a)karma…→panchakarma`, `medical tourism / value travel→mvt`, `medical officer→medicalofficer`, `start-up→startup`, `good manufacturing practice→gmp`, `public service commission→psc`;
  - `outside India / overseas→abroad`, `U.S.A.→usa`, `U.K.→uk`, `National AYUSH Mission→nam`.
- All other characters except `a–z 0–9`, Devanagari and spaces are removed.

### Step 2 — tokens
- **Stopwords:**
  - ~130 English function words;
  - ~70 domain words that carry no topic (*ayurveda, bams, career, sir, tips, best, guide, after, scope …*);
  - ~100 Hinglish function words (*kya, kaise, hai, ke, baad, chahiye …*);
  - ~50 Devanagari function words.
- **Synonyms (≈120):**
  - `md/ms/masters/postgraduate→pg`, `doctorate→phd`;
  - `job/naukri/vacancy/employment→job`, `salary/earning/stipend→income`;
  - `exam/entrance→exam`, `preparation/prep/taiyari→prepare`, `thesis/dissertation→thesis`, `paper/publication→publish`;
  - `govt/sarkari→government`, `foreign/overseas/videsh→abroad`, `open/setup/launch/begin→start`;
  - `lecturer/teacher/professor→faculty`, licence and practise spellings, Devanagari forms (`पीजी→pg`, `नौकरी→job`, …).
- **Stemmer** (conservative, only words > 4 letters): `-ies→y`, `-ation(s)`, `-tion(s)`, `-ment(s)`, `-ing(s)`, `-ed`, plural `-s` (not `-ss/-us/-is`), then a trailing `-e`.
- **Keep** tokens of ≥ 3 letters, numbers of ≥ 3 digits, and the short whitelist `pg uk qa qc ip mo`.
- **Fallback:** if a question has no tokens left (e.g. "What should I do after BAMS?"), it is re-tokenised removing only function words. "What after BAMS" therefore still matches its twins.
- **Context:** the optional context is tokenised the same way; its tokens join the set but weigh 0.5×.
- **Typo folding** (per bucket): raw words of ≥ 7 letters with the same first letter and at most one edit apart (including one transposition) fold onto the more frequent spelling ("traning→training").

### Step 3 — pairwise score (v1)
```
score(A,B) = 1                                            if the normalised questions are identical
           = 0.55 · wJaccard(A,B) + 0.35 · Jaccard(A,B) + 0.10 · bigramJaccard(A,B)
wJaccard   = Σ_{t∈A∩B} w(t) / Σ_{t∈A∪B} w(t),   w(t) = (df_bucket(t) ≤ 2 ? 1.5 : 1) × (t only in context ? 0.5 : 1)
```
Bigrams are consecutive token pairs (question then context).

### Step 4 — pass 1, greedy assignment
- Questions in a bucket are ordered by **token count (desc)**, then `createdAt`, then id. Longer questions seed groups, and the result does not depend on input order (a test checks this).
- Each question joins the open group (< 7 members) with the highest *best-link* score, provided both of these hold:
  - `best ≥ T`;
  - `mean(score to every member) ≥ 0.6 T` (the anti-chaining rule).

  Otherwise it starts a new group.

### Step 5 — pass 2, packing to a mentor table
- Groups smaller than **packTarget = 6** try to combine with another group when:
  - the combined size is ≤ **maxPack = 7**;
  - `best ≥ max(0.28, 0.78 T)`;
  - `mean ≥ 0.6 ×` that value.
- Smallest groups go first and the pass repeats until nothing changes. **No group ever exceeds 7.**

### Step 6 — what a group looks like
- **`representative`** — v1 uses the *longest* member question (ties go to the smaller id). It is the "merged question" the desk and mentor see until staff type a **composite**. The app does **not** auto-write a composite: the composite box's placeholder is the representative, and Track / the mentor workbook show `composite || representative`.
- `variants` (up to 6 other wordings), `kind` = merged/unique, and `subtheme` (the mode when sub-areas are mixed).
- **`cohesion`** = the *weakest* pairwise score in the group, shown as "closest-pair floor".
- `sharedTerms` = up to 5 question tokens found in ≥ 2 members ("Merged on: …").
- **Re-merge** keeps an unlocked group's id, and its composite/mentor fields, when most of its members stay together. Locked groups never change.

---

## 2. The benchmark dataset

- **File:** `tests/fixtures/merge-benchmark.json`.
- **Generator:** `scripts/build-merge-benchmark.mjs` (`npm run bench:merge:data`, seeded, reproducible).

| | |
|---|---|
| Questions | **539** |
| Intents | **113** (29 singletons; largest = AIAPGET preparation strategy, 24) |
| Themes | all 10 Ask Desk themes + "Not sure — help me classify", using the real sub-areas from `TRACKS` in `src/App.jsx` |
| Skew | Academics/PG 165 · Clinical 97 · Policy/govt 65 · Research 50 · Abroad 50 · Start-ups 30 · Manufacturing 23 · MVT 19 · Brand 17 · Export 12 · Not sure 11 |
| Split | **37 intents / 163 questions held out as `test`** (~30 % of intents, stratified per theme by a stable hash). The rest (76 intents / 376 questions) is `dev`. All tuning decisions looked only at dev. |

**How the questions were written:**
- Every phrasing is hand-written as a BAMS student would type it. That covers:
  - Indian English, Hinglish ("aiapget ki taiyari kaise kare?") and some Devanagari;
  - abbreviations (PG/MD/MS, AIAPGET, NEET-PG, CCRAS, NAM, AMO, DHA, NCISM, IEC, CTRI …);
  - real typos ("preperation", "liscence", "intership", "panchkarma traning").
- A seeded noise pass then adds the things real submissions have:
  - lower-casing, missing or doubled "?", "Sir, / Respected sir," openers, "pls help / kindly suggest" endings, character typos;
  - generic student context in 30 % of questions ("Intern, Uttar Pradesh", "Final year, Karnataka…");
  - **14 verbatim hall-prompt chips** (the Ask Desk pre-fills them);
  - **32 mis-filed sub-areas** (e.g. AIAPGET questions filed under "Curriculum & assessment").

**Labels:**
- `intent` = what one mentor answer serves. `family` = intents one broader answer could still serve (e.g. the AIAPGET-prep family), used for *lenient* precision.
- **Hard negatives** (`hardNegOf`): same words, different ask. Examples:
  - Kayachikitsa vs Shalya scope, and a specific branch vs the general "which branch";
  - AIAPGET preparation vs AIAPGET attempt limit vs **NEET-PG eligibility** vs the state AMO exam;
  - clinic cost vs clinic licence vs first patients, and a clinic in India vs a clinic abroad;
  - USA vs UK vs Gulf vs the general "which countries";
  - faculty eligibility vs faculty salary, hospital salary vs RMO-in-allopathy legality vs prescribing allopathy;
  - pharma jobs vs QA/QC, case report vs journal choice.
- **Hard positives** (21, tagged): same intent, deliberately different words ("MD entrance — where do I even begin?", "Public sector openings for Ayurveda graduates").

**External check:** `tests/fixtures/merge-1200.json` is a 1,200-question, 116-intent labelled desk that another process created in this tree during the session. It was scored as an independent second corpus (`--fixture`) and never used for tuning.

---

## 3. Benchmark script and metrics

`npm run bench:merge` runs `scripts/merge-benchmark.mjs`. It calls the real `buildClusters` (pure, local, no store, nothing written to Firestore). It sweeps thresholds **0.25–0.70 in steps of 0.025** (plus the current default), each **with and without sub-area separation**, on dev, test and all.

Useful flags:

| Flag | What it does |
|---|---|
| `--module <file>` | Score any engine copy (e.g. `--module scripts/bench/merge-v1.js` for the "before" numbers). |
| `--fixture <file>` | Score another labelled corpus. |
| `--split dev\|test\|all` | Restrict the run to one split. |
| `--brief` | Print only the summary rows. |
| `--json out.json` | Write machine-readable results. |
| `--opts '{"linkMean":0.8}'` | Ablations. |
| `--example 0.45` | Worked example. |
| `--errors dev 0.45` | List wrong merges and split intents. |
| `--review all 0.45` | Cohesion-based staff review table. |
| `--compare 0.45` | Threshold to compare against the current default in the summary. |

| Metric | Meaning |
|---|---|
| **P** | Pairwise precision: share of same-group question pairs that share an intent. |
| **P~** | Lenient precision: a pair also counts as correct when the two intents share a family. |
| **R** | Pairwise recall over *all* same-intent pairs. An intent with more than 7 questions must be split across packs, so R can never reach 1. |
| **R/ceil** | R divided by the best recall any 7-capped (and, when kept, sub-area-separated) grouping could reach. |
| **F1, F0.5** | F0.5 weights precision more, because a wrong merge hurts a student more than a missed one. |
| **B³F1** | B-cubed F1: per-question precision and recall, averaged. |
| **purity** | Σ (largest intent count per group) / N. |
| **mis-served** | % of students whose intent differs from their group's *shown* question (the representative). They would read an answer to someone else's question. |
| **merged** | % of questions in a group of 2+. |
| **groups** | Mentor answers needed. "Ideal" = Σ ⌈intent size / 7⌉ = 133 for all, 42 for test. |
| **avg / max / >cap / xTheme** | Group sizes, groups over 7 (always 0), groups mixing themes (always 0). |
| **ms** | Runtime: about 10–20 ms for 539 questions. Scale test: 2,156 → 130 ms, 5,390 → 280 ms (v2 slightly faster than v1). |

---

## 4. Threshold tables

◦ = old default 0.42, ★ = recommended 0.45 (v2). These are sub-areas **kept separate** unless noted; the full tables are in `docs/merge/bench-v1.json` / `bench-v2.json`, or re-run `npm run bench:merge`.

### Held-out test split (37 intents, 163 questions) — v1 (before)
| thr | P | P~ | R | R/ceil | F1 | F0.5 | B³F1 | mis-served | merged | groups | avg | xTheme |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.300 | 0.613 | 0.903 | 0.098 | 0.182 | 0.168 | 0.298 | 0.453 | 6.7% | 31.3% | 126 | 1.29 | 0 |
| 0.350 | 0.560 | 0.857 | 0.080 | 0.150 | 0.141 | 0.255 | 0.440 | 8.0% | 31.9% | 126 | 1.29 | 0 |
| 0.400 | 0.578 | 0.875 | 0.063 | 0.118 | 0.114 | 0.220 | 0.419 | 6.7% | 25.2% | 135 | 1.21 | 0 |
| 0.420 ◦ | 0.785 | 0.954 | 0.087 | 0.162 | 0.157 | 0.302 | 0.444 | 5.5% | 26.4% | 133 | 1.23 | 0 |
| 0.450 | 0.864 | 1.000 | 0.065 | 0.121 | 0.121 | 0.250 | 0.423 | 2.5% | 19.0% | 142 | 1.15 | 0 |
| 0.500 | 0.875 | 1.000 | 0.060 | 0.111 | 0.112 | 0.235 | 0.418 | 2.5% | 17.2% | 144 | 1.13 | 0 |
| 0.550 | 0.966 | 1.000 | 0.048 | 0.089 | 0.091 | 0.200 | 0.403 | 0.6% | 12.3% | 150 | 1.09 | 0 |
| 0.600 | 1.000 | 1.000 | 0.046 | 0.086 | 0.088 | 0.195 | 0.402 | 0.0% | 9.8% | 152 | 1.07 | 0 |

### Held-out test split — v2 (after)
| thr | P | P~ | R | R/ceil | F1 | F0.5 | B³F1 | mis-served | merged | groups | avg | xTheme |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.300 | 0.853 | 0.934 | 0.199 | 0.369 | 0.322 | 0.514 | 0.598 | 5.5% | 60.1% | 97 | 1.68 | 0 |
| 0.350 | 0.820 | 0.926 | 0.171 | 0.318 | 0.283 | 0.466 | 0.573 | 6.7% | 58.3% | 100 | 1.63 | 0 |
| 0.400 | 0.827 | 0.945 | 0.156 | 0.290 | 0.262 | 0.444 | 0.551 | 5.5% | 52.1% | 107 | 1.52 | 0 |
| 0.420 ◦ | 0.824 | 0.956 | 0.128 | 0.239 | 0.222 | 0.396 | 0.519 | 4.3% | 46.0% | 114 | 1.43 | 0 |
| **0.450 ★** | **0.922** | 0.961 | **0.122** | 0.226 | **0.215** | **0.398** | 0.503 | **2.5%** | 38.7% | **122** | 1.34 | 0 |
| 0.500 | 0.789 | 0.965 | 0.077 | 0.143 | 0.140 | 0.277 | 0.458 | 2.5% | 27.6% | 133 | 1.23 | 0 |
| 0.550 | 0.800 | 1.000 | 0.068 | 0.127 | 0.126 | 0.255 | 0.445 | 1.2% | 22.7% | 138 | 1.18 | 0 |
| 0.600 | 0.850 | 1.000 | 0.058 | 0.108 | 0.109 | 0.228 | 0.427 | 0.6% | 19.0% | 143 | 1.14 | 0 |

### Whole desk (539 questions, 113 intents) — v1 vs v2
| thr | v1 P | v1 R | v1 mis-served | v1 merged | v1 groups | v2 P | v2 P~ | v2 R | v2 F0.5 | v2 mis-served | v2 merged | v2 groups |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.350 | 0.507 | 0.102 | 12.6% | 40.1% | 388 | 0.593 | 0.697 | 0.202 | 0.428 | 14.8% | 67.5% | 281 |
| 0.400 | 0.496 | 0.078 | 10.2% | 31.5% | 421 | 0.676 | 0.742 | 0.202 | 0.460 | 11.5% | 61.4% | 306 |
| 0.420 ◦ | 0.557 | 0.081 | 9.1% | 29.3% | 430 | 0.720 | 0.797 | 0.194 | 0.467 | 9.6% | 57.7% | 323 |
| **0.450 ★** | 0.547 | 0.066 | 8.2% | 24.9% | 447 | **0.734** | 0.824 | **0.172** | 0.444 | **8.3%** | 52.7% | **345** |
| 0.500 | 0.579 | 0.057 | 6.3% | 21.3% | 460 | 0.692 | 0.818 | 0.129 | 0.369 | 7.6% | 44.9% | 377 |
| 0.550 | 0.667 | 0.039 | 3.0% | 15.0% | 486 | 0.738 | 0.846 | 0.110 | 0.344 | 5.6% | 38.4% | 402 |
| 0.600 | 0.651 | 0.023 | 2.2% | 10.8% | 503 | 0.751 | 0.889 | 0.097 | 0.319 | 3.9% | 32.3% | 425 |

Read this as a trade-off frontier:
- **At the same workload**, v2 halves wrong answers. v1 at 0.42 needs 430 groups with 9.1 % mis-served; v2 at 0.60 needs 425 groups with 3.9 % mis-served, at precision 0.75 vs 0.56.
- **At the same mis-serve rate** (v2 at 0.45 vs v1 at 0.42), v2 needs **~20 % fewer mentor answers** (345 vs 430).

### Sub-areas mixed (staff untick "Keep sub-areas separate"), held-out test
| | P | R | F1 | mis-served | groups |
|---|---|---|---|---|---|
| v1 @ 0.42 | 0.744 | 0.104 | 0.183 | 8.0% | 128 |
| v2 @ 0.45 | 0.875 | 0.132 | 0.229 | 4.3% | 116 |

On the whole desk, mixing sub-areas costs a lot of precision: v2 @ 0.45 gives P 0.619 with **13.7 %** mis-served, against 8.3 % when kept. Mixed mode does catch mis-filed questions, though (recall 0.185 vs 0.172).

### External 1,200-question desk (independent author, never used for tuning), kept
| | P | R/ceil | F0.5 | B³F1 | mis-served | merged | groups |
|---|---|---|---|---|---|---|---|
| v1 @ 0.42 | 0.893 | 0.594 | 0.338 | 0.372 | 5.7% | 71.9% | 564 |
| v2 @ 0.42 | 0.880 | 0.719 | 0.382 | 0.423 | 5.8% | 80.8% | 461 |
| **v2 @ 0.45** | **0.903** | **0.727** | **0.388** | **0.424** | **4.3%** | 79.9% | **472** |

---

## 5. Worked example (v2, threshold 0.45, sub-areas kept)

Reproduce with `npm run bench:merge -- --module scripts/bench/merge-candidate.js --example 0.45`.

**Group `AYM-C-B0059`.** Academics, Teaching & Higher Education → Choosing a PG branch. Cohesion 0.29. Merged on: AIAPGET · prepare · internship.

| # | Student question (raw) | Tokens after normalisation |
|---|---|---|
| 1 | मुझे AIAPGET की तैयारी कैसे करनी चाहिए? | aiapget · prepare · करनी |
| 2 | How should I prepare for AIAPGET? | prepare · aiapget |
| 3 | How to prepare for PG entrance exam after BAMS? | prepare · aiapget *("PG entrance exam" → one AIAPGET token)* |
| 4 | Sir, aiapget ki taiyari kaise kare? kuch tips do sir | aiapget · prepare *(Hinglish and "sir/tips" dropped)* |
| 5 | Can I prepare for AIAPGET while doing rural iternship posting? | prepare · aiapget · whil · rural · internship · post |
| 6 | what mistakes should i avoid while preparing for aiapget? | mistak · avoid · whil · prepare · aiapget |
| 7 | How to balance internship duties and AIAPGET preparation? | balanc · internship · duty · aiapget · prepare |

Pairwise scores (the merge's own in-bucket scores):

|   | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| 1 | — | 0.66 | 0.66 | 0.71 | 0.35 | 0.38 | 0.40 |
| 2 | 0.66 | — | **1.00** | 0.90 | 0.49 | 0.53 | 0.51 |
| 3 | 0.66 | **1.00** | — | 0.90 | 0.49 | 0.53 | 0.51 |
| 4 | 0.71 | 0.90 | 0.90 | — | 0.47 | 0.51 | 0.53 |
| 5 | 0.35 | 0.49 | 0.49 | 0.47 | — | 0.41 | 0.40 |
| 6 | 0.38 | 0.53 | 0.53 | 0.51 | 0.41 | — | 0.29 |
| 7 | 0.40 | 0.51 | 0.51 | 0.53 | 0.40 | 0.29 | — |

**Why they merged.** Questions 2, 3 and 4 reduce to the same two tokens. "PG entrance exam" and "taiyari" are folded onto *aiapget* and *prepare*, so these pairs score 0.90–1.00. Questions 1 and 5–7 were added on their strongest links to that core (0.47–0.71). Each joined either in pass 1 (best ≥ 0.45 and mean ≥ 0.8 × 0.45 = 0.36 to the members present at the time) or in the packing pass (best ≥ 0.78 × 0.45 ≈ 0.35, mean ≥ 0.28). The group then stopped at the 7-member cap. That is why its weakest pair (6–7, 0.29) is below the threshold: cohesion 0.29 is exactly the kind of group staff should glance at. Questions 5 and 7 are labelled "AIAPGET with internship". Strictly that is a neighbouring intent, but the same family, so one good "how to prepare" answer still serves them (P~ counts them correct, P does not).

**The merged "unique" question the app shows:** *"How to prepare for PG entrance exam after BAMS?"* v2 picks the member most similar to all the others. v1 shows the **longest** member: *"Can I prepare for AIAPGET while doing rural iternship posting?"*. That is a narrower ask with a typo, and the mentor would answer the wrong framing. Staff can still write a composite, for example *"How should I prepare for AIAPGET — plan, mistakes to avoid, and balancing it with internship?"*.

**Near misses that were NOT put in this group** (best / mean score to the members):

| Question | Scores | Where it went |
|---|---|---|
| "How many months of preparation is needed for AIAPGET?" | 0.78 / 0.58 | a parallel AIAPGET pack: this group was already full at 7 |
| "aiapget preparation tips for final year bams students" | 0.67 / 0.50 | the same parallel pack |
| "When should I start preparing for AIAPGET — final year or during internship?" | 0.47 / 0.40 | the timing pack |
| "Should I take leave from internship to prepare for AIAPGET?" | 0.46 / 0.38 | its own 3-question pack |

**Correctly rejected look-alikes** (named hard negatives of this intent):

| Question | Tokens | Score vs members | v1 behaviour |
|---|---|---|---|
| "Are BAMS doctors eligible for NEET-PG exam?" | eligibility · neetpg · exam | **0.00** | v1 mapped NEET-PG to "pg exam", so the same pair scored 0.32 |
| "How many attempts are allowed in AIAPGET?" | attempt · allow · aiapget | ≤ **0.31** | v1 scored it 0.49 against "How should I prepare for AIAPGET?" and pulled it into the coaching pack |
| "Is AIAPGET preparation enough for the state medical officer exam?" | — | never compared | different theme (Policy, Public Health & Global Agencies) |

---

## 6. What changed in v2 and why (dev split only, ablation at T = 0.42, kept)

| Step | P | R | F0.5 | mis-served | Decision |
|---|---|---|---|---|---|
| v1 | 0.725 | 0.093 | 0.306 | 4.3% | — |
| + one concept → one token, ~110 synonyms, extra stopwords | 0.777 | 0.111 | 0.352 | 5.9% | keep |
| + **cosine** instead of Jaccard (weighted and plain parts) | 0.690 | 0.232 | 0.495 | 12.5% | keep (recall ×2.1) |
| + central representative (medoid) | 0.690 | 0.232 | 0.495 | 11.4% | keep |
| + stricter anti-chaining (mean ≥ **0.8** T, was 0.6) | 0.791 | 0.224 | 0.525 | 8.2% | keep |
| + contrast rule (branches / countries) | **0.809** | **0.237** | **0.545** | 7.2% | keep |
| *tried:* IDF weighting | 0.777 | 0.063 | 0.237 | — | rejected: same-intent questions mostly share common words |
| *tried:* no packing pass (packTarget 1) | 0.702 | 0.091 | 0.299 | — | rejected: pass 2 supplies most of the recall |
| *tried:* mean ≥ 0.9–1.0 T, packRatio 0.7–0.9 | ≤ 0.783 | ≤ 0.24 | ≤ 0.524 | — | rejected: no gain |

The concrete changes, all deterministic and explainable:

1. **One concept, one token.**
   - AIAPGET, and "PG/MD/MS entrance (exam/test)", become a single `aiapget` token. v1 expanded AIAPGET to three tokens, which triple-counted it and glued every AIAPGET question together.
   - **NEET-PG becomes `neetpg`.** It is the modern-medicine PG exam, a different ask.
   - New phrases: cut-off, assistant professor → faculty, teaching job, modern/English medicine and cross-pathy → allopathy, civil services → upsc, other/foreign countries → abroad, "the US" → usa, social media / digital marketing / online presence, case report/study/series, Master of Public Health → mph, ethics committee, RCT.
2. **Synonyms (~110 new entries):**
   - allopathy/allopathic; prescribe/prescription; hire/recruit/posts/openings → job; UPSC/IAS/IPS; AMO/MO → medical officer;
   - coaching/classes/tuition; resort/spa/retreat; patient/footfall; fellowship/scholarship; recognise/recognised/valid/accepted; surgery/surgical;
   - cost/budget/investment/capital/kharcha; legal/law; eligibility/qualification; drug/dawai → medicine; pharma; trial/RCT; statistics/biostatistics;
   - Instagram/reels/YouTube → social media; advertise/ads; incubator; funding/grant/investor; patent/trademark → IP; certificate/certification; course/training; ethics/IEC;
   - Dubai/UAE/DHA/DOH/Oman/Qatar/Saudi → gulf; Germany/Switzerland → europe; visa/permit.
3. **Stopwords:** *doctor(s), graduate(s), respected, morning, detail, answer, reply, help*, plus Hinglish fillers (*milta, lagti, padta, kitna, kaunsa, nahi, samajh …*).
4. **Score formula:**
   ```
   score = contrast × (0.55 · weighted cosine + 0.35 · cosine + 0.10 · bigram Jaccard)
   cosine = |A∩B| / √(|A|·|B|);  weighted cosine uses the same weights as v1 (rare 1.5×, context 0.5×)
   ```
   Cosine stops punishing a short question for being short. "How to get a job in CCRAS?" vs "Does CCRAS hire BAMS graduates without MD?" goes from 0.15 to 0.64.
5. **Contrast rule.** Two questions naming *different* PG branches (Kayachikitsa, Shalya, Shalakya, Kaumarbhritya, Prasuti/Striroga, Dravyaguna, Rasashastra, Samhita, Sharir, Rognidan, Swasthavritta, Agadtantra, Manasroga) or *different* destinations (USA, UK, Gulf, Europe, Canada, Australia, …) score × 0.5. If only one of the two names one, it scores × 0.8. Example: "Ayurveda career in the US — licence?" vs "Dubai me licence kaise milega?" drops from 0.45 to 0.23.
6. **Anti-chaining** `linkMean` 0.6 → 0.8: a newcomer must be reasonably close to *all* members, not just one.
7. **Representative = medoid** (for groups of 3+): the member with the highest summed similarity to the others, ties going to the longer wording, then the smaller id. Groups of 2 keep v1's longest-question rule.
8. **Default threshold** 0.42 → **0.45** (section 7).

**Tests:**
- `tests/merge-benchmark.test.mjs` (8 tests) covers fixture sanity, live-merge integrity on the 539-question desk (every question once, cap, never cross-theme), the NEET-PG/AIAPGET split, synonyms, the contrast rule, the medoid representative, held-out precision and recall versus v1, and order-determinism.
- The existing suite also passes against v2, except one tokeniser assertion that deliberately expects AIAPGET to emit a `pg` token. Update it when adopting.
- `npm test` passes 61/61 and `npm run build` passes on the current tree.

---

## 7. Recommendation — the threshold ("rating")

**Default 0.45 with v2; safe range 0.42–0.50; keep sub-areas separate.**

Why 0.45:
- On dev, F0.5 peaks at 0.40–0.42 (0.545) and is still 0.484 at 0.45. Because a wrong merge means a student reads someone else's answer, the choice leans to the precision side of that plateau.
- The larger, independent 1,200-question desk peaks at exactly 0.45 (F0.5 0.388, mis-served 4.3 % vs 5.8 % at 0.42).
- On the held-out test split, 0.45 is strictly better than 0.42: P 0.922 vs 0.824 and mis-served 2.5 % vs 4.3 %, at almost the same recall (0.122 vs 0.128).
- Precision also falls as the desk gets denser. At 0.45 it drops from 0.78 on the 376 dev questions to 0.73 on the full 539 (dev + test), because more look-alikes share each sub-area. Real desks of 500 to several thousand questions sit on the denser side.

What happens at the edges:

| Setting | Effect on the 539-question desk (v2) |
|---|---|
| < 0.40 | Precision falls below 0.70 and more than 11 % of students are mis-served. Avoid. |
| 0.42 | ~6 % fewer groups than 0.45 (323 vs 345) for ~1.3 points more mis-served. Fine for a small desk (< 400 questions). |
| **0.45** | **Recommended.** 345 groups, 53 % of questions merged, 8.3 % mis-served before staff review; ~2.5 % on the held-out intents. |
| 0.50 | Use for 1,000+ questions or a quick first pass you will not review: 377 groups, 7.6 % mis-served. |
| > 0.55 | Mostly singletons: fewer than 40 % merged and +15–25 % mentor answers, with little precision gain. |

**With v1** (if v2 is not adopted), no threshold is good. v1's precision on the whole desk never passes 0.67 between 0.25 and 0.60. If staying on v1, use 0.42–0.45 and rely on staff review.

### Staff guidance (Curation desk)

1. **Merge with "Keep sub-areas separate" ON** at 0.45.
2. **Review weak groups first**, sorting by the "closest-pair floor" (cohesion):

   | Review groups with cohesion below | Share of merged groups (v2 @ 0.45, 539 questions) | Wrong-intent students caught |
   |---|---|---|
   | 0.30 | 31 % (28 of 90) | 42 % |
   | 0.40 | 57 % | 69 % |
   | 0.50 | 82 % | 89 % |

   Use **Detach** for the odd one out, then write a **composite** that covers what remains.
3. **Watch for specifics.** A group containing two different PG branches, countries or exams (AIAPGET vs NEET-PG vs PSC/AMO) almost always needs a split.
4. **Leftover singletons:** run a second pass with sub-areas **mixed** at 0.50 or higher to catch mis-filed questions. Do not use mixed as the main pass, because it roughly doubles wrong merges on a full desk.
5. **Big intents fill several packs of 7** (the 24 AIAPGET-strategy questions spread over several AIAPGET groups). Give them the same mentor, or reuse the answer via manual merge. It is one answer, several tables.
6. **Re-merging is safe.** Answered, sent-out and published groups never change.

---

## 8. Limitations

- **Synthetic data.** The corpus is hand-written but synthetic, by one author. Synonyms were chosen while reading **dev** errors, so dev numbers are optimistic. The held-out test intents and the independent 1,200-question desk are the honest numbers, but the 1,200 desk is also machine-authored. **Re-run the benchmark on the first real 200–300 Ask Desk questions** (labelled by staff in an afternoon) before the congress.
- **Lexical ceiling.** Even v2 reaches only about 23–38 % of the pack-capped recall ceiling on our desk: paraphrases with no shared content words never merge ("~ Public sector openings for Ayurveda graduates" vs "government jobs after BAMS"). The next step would be an *optional* multilingual sentence-embedding "suggest merge" list for staff to accept, not automatic merging.
- **Specific vs general.** "Is Shalya a good PG branch?" vs the general "Which PG branch has the best scope?" still scores 0.54 (the one-sided contrast factor 0.8 is not enough), so staff review is needed there.
- **Neighbouring intents merge.** Fine-grained neighbours (AIAPGET timing vs strategy vs internship balance) often share a pack. Lenient precision stays ≥ 0.96 on test, so a broad answer serves them, but a precise one may not.
- **Short typos.** Typo folding only handles words of 7+ letters, so "Sahlya" is not folded onto "Shalya".
- **Context noise.** Context words (state names, "middle class family") add noise at 0.5 weight.
- **Mis-served depends on the shown question.** The metric scores the representative, not the composite staff will write. A good composite lowers real harm below the numbers here.

---

## Adopting v2

v2 lives in `scripts/bench/merge-candidate.js`. It has the same exports as `shared/merge.js`, plus `contrastFactor`. It was **not** copied into `shared/merge.js` because another process was rewriting that file concurrently (at the time: `threshold 0.48`, `packMean 0.75`, `stripBoilerplate`). That version, scored by this benchmark at its own default 0.48 on the held-out test split, gives:
- P 0.978, R 0.075, F1 0.140, mis-served 0.6 %, 139 groups — very precise, but recall is no better than v1;
- on the whole desk, P 0.651 with 439 groups.

The parallel rewrite kept evolving. By 12:12 IST, `shared/merge.js` had grown to ~68 KB, still defaulting to 0.48, and `npm test` passed 76/76. On this benchmark at 0.48 it sits at the other extreme of the trade-off:

| | P | R | mis-served | groups |
|---|---|---|---|---|
| Held-out test split | 1.000 | 0.067 | 0.0 % | 145 |
| Whole desk (539) | 0.990 | 0.055 | 0.2 % | 479 |
| External 1,200 desk | 1.000 | — | — | 575 |

For comparison, the whole desk gives 430 groups with v1 and 345 with v2, and the external desk 472 with v2. Almost no wrong merges, but more mentor answers than v1 needed. Whichever engine ships, this benchmark (`--module`) is the arbiter: pick the default from the precision/workload trade-off in section 7.

To adopt v2 once `shared/merge.js` is quiet:
1. Port the v2 changes listed in section 6 (PHRASES, SYNONYMS, stopwords, `setCosine`, `contrastFactor`, `questionSimilarity`, `centralQuestion`, `MERGE_DEFAULTS.linkMean = 0.8`, `packRatio = 0.78`, `threshold = 0.45`, DISPLAY names) into `shared/merge.js`. Keep any boilerplate-stripping from the parallel rewrite; it is compatible.
2. In `tests/merge.test.mjs`, change the first tokeniser test to expect `aiapget` (not `pg`) for AIAPGET, and point `tests/merge-benchmark.test.mjs`'s candidate import at `../shared/merge.js`.
3. Run these and compare against the tables above:
   ```
   npm test
   npm run bench:merge
   npm run bench:merge -- --fixture tests/fixtures/merge-1200.json --split all
   ```
4. The slider in `src/App.jsx` already reads `MERGE_DEFAULTS.threshold`. The server does not auto-merge, so no server change is needed.
5. Deploy: `npm run build && npx vercel --prod --yes`, then check https://ayushmarg.vercel.app.

## Files

| Path | What |
|---|---|
| `tests/fixtures/merge-benchmark.json` | 539-question labelled desk (dev/test split) |
| `scripts/build-merge-benchmark.mjs` | Dataset generator (`npm run bench:merge:data`) |
| `scripts/merge-benchmark.mjs` | Benchmark (`npm run bench:merge`) |
| `scripts/bench/merge-v1.js` | Frozen pre-tuning engine ("before") |
| `scripts/bench/merge-candidate.js` | v2 engine ("after"), a drop-in for `shared/merge.js` |
| `tests/merge-benchmark.test.mjs` | Guards for the above |
| `docs/merge/bench-v1.json`, `bench-v2.json` | Full sweep results (all splits, both sub-area modes) |
