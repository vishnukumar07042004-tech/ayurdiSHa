# AYURDISHA merge engines — head-to-head comparison

*24 Oct 2026 · harness `scripts/bench/compare-engines.mjs` · raw results `docs/merge/engine-comparison.json` · every table: `docs/merge/engine-comparison-tables.md`*

## Verdict

| | |
|---|---|
| **Winner** | **Hybrid-lite** = engine A's algorithm + engine B's domain vocabulary, minus the 5 vocabulary items that misfired on the tuning sets. Now live in `shared/merge.js`. |
| **Engine B** | **Not recommended.** It merges more but sends a wrong answer to 3–6× as many students as A on every dataset, including its own held-out split. At matched safety (wrong-answer ≤ 2 %) it does not out-recall A on held-out or fresh data. Fails 8 of 61 existing tests. |
| **Recommended threshold** | **0.48, sub-areas kept** (unchanged default). 0.46 is a safe "more merges" setting with sub-areas kept; avoid < 0.46 with sub-areas mixed. |
| **Safety invariants** | All four engines: 0 cross-theme merges, 0 groups > 7, 0 lost / duplicated / orphaned questions across 288 runs; deterministic under shuffled input; re-merge stable; locked (answered / sent / published) groups never change and answers are never copied. |

At the recommended setting (0.48, sub-areas kept), hybrid-lite vs the previous live engine A:

| dataset | role | wrong-answer A → hybrid-lite | recall A → hybrid-lite |
|---|---|---|---|
| Fresh-403 | never tuned on | 0.5 % → **0.5 %** (2 → 2 students) | 0.152 → **0.167** |
| B-heldout (163) | held-out intents | 0.6 % → **0.6 %** (1 → 1) | 0.138 → **0.167** |
| B-dev (376) | B's tuning set | 2.4 % → **2.4 %** (9 → 9) | 0.140 → **0.165** |
| A-1200 | A's tuning set | 1.4 % → **1.0 %** (17 → 12) | 0.559 → **0.582** |

With sub-areas mixed, hybrid-lite is equal or safer on three datasets and costs 2 more students on A-1200 (1.7 % → 1.8 %), with higher recall on all four.

---

## 1. Method

**Engines** (all expose the same `buildClusters(subs, threshold, useSub, prev, opts)` API):

| key | file | what it is |
|---|---|---|
| A | `scripts/bench/merge-a-live-oct24.js` | frozen copy of `shared/merge.js` as live before this comparison |
| B | `scripts/bench/merge-candidate.js` | candidate from the other session |
| H | `scripts/bench/merge-hybrid.js` | A + **all** of B's vocabulary (phrases, synonyms, Hinglish stopwords) |
| L | `scripts/bench/merge-hybrid-lite.js` | H minus 5 vocabulary items that caused wrong merges on the tuning sets — **adopted** |

**Identical inputs and gates.** Each engine gets the same question objects, the same threshold, the same sub-area switch, and `maxPack 7, packTarget 6, packFloor 0.28`. Each keeps its own internal link-average ratios: A uses 0.6 in the first pass and 0.75 when packing, B uses 0.8 in both. Those ratios are part of the algorithm. Sweep: thresholds 0.40–0.56 (step 0.02) × sub-areas kept / mixed × 4 datasets × 4 engines = 288 runs.

**Datasets**

| dataset | size | origin | tuned on by |
|---|---|---|---|
| A-1200 | 1,200 | `tests/fixtures/merge-1200.json` (templated, 20 % of students pick a "wrong" theme) | A |
| B-dev | 376 | `tests/fixtures/merge-benchmark.json` split=dev (hand-written) | B |
| B-heldout | 163 | same file, split=test — 37 intents B never saw while tuning | nobody |
| Fresh-403 | 403 | `scripts/bench/fresh-400.json` (generator `build-fresh-dataset.mjs`) — written for this comparison | nobody |

The fresh set has 68 intents and 36 one-off questions. It mixes English, Hinglish and Devanagari phrasings with a new noise model: WhatsApp shorthand (u/r/wat/shud), vowel-drop, doubled-letter and adjacent-key typos, new greetings ("Pranam.", "Myself Ritika, BAMS intern.", "Hello team,"), emoji sign-offs, and distractor contexts such as "I am also preparing for AIAPGET." on a clinic question. Placement: 78 % of questions go in their home sub-area, 14 % in another sub-area of the same theme, 5 % in "Not sure", and 3 % in a different theme. It is dense in look-alike asks: clinic licence vs cost vs location vs first patients; AIAPGET strategy vs books vs cut-off; private-college PG; USA vs UK vs Gulf; hospital job vs hospital salary; resort job vs resort salary; trademark vs patent; ad rules vs social media; QC testing vs QC jobs; and others. Only 4 of 403 questions exactly match a question in the older fixtures, all generic ones such as "What should I do after BAMS?".

**Protocol (to avoid tuning on the test data).** The fresh set was written before any engine ran on it. All hybrid pruning decisions used only A-1200 and B-dev. B-heldout and Fresh-403 were looked at once per hybrid version: H, then L. L's pruning came from tuning-set error lists, not from fresh errors.

**Metrics** (computed by the harness, independent of either engine's own scorer)
- **P**: share of co-grouped pairs that have the same intent.
- **R**: same-intent co-grouped pairs ÷ the best reachable (same intent + same theme, packs ≤ 7). This is the definition A's report uses.
- **wrong (rep)**: % of all students whose intent differs from the group's mentor question. The representative is found by `representativeId` (A) or by exact text (B); 0 were unmatched.
- **wrong (majority)**: % of all students whose intent differs from the group's majority intent.
- Also measured: merged %, average group size, cross-theme groups, groups > 7, lost / duplicated / orphaned questions, runtime, determinism, re-merge behaviour and representative quality.

## 2. Key algorithmic differences (A vs B)

| aspect | A (live before) | B (candidate) |
|---|---|---|
| Boilerplate | strips greetings, self-introductions ("I am a final year BAMS student from …") and sign-offs before tokenising | none; adds "respected / morning / help / answer / reply" as stopwords instead, so "final year" etc. stay as topic words |
| Tokenising fixes | B.A.M.S. dotted → bams (not MS); Hindi "baad / बाद" → "after" in the fallback pass | no B.A.M.S. fix (reads as an MS = PG degree); fallback keeps only function-word filtering |
| Vocabulary | ~110 synonyms, ~20 phrase rules | ~240 synonyms (+ allopathy, prescribe, hire/recruit → job, UPSC/IAS, cost/budget/investment, legal/law, eligibility, patent/trademark → ip, Dubai/UAE/DHA → gulf, Germany → europe, visa, funding/grant, incubator, Instagram/reels → social media, course/training, certificate, ethics/IEC, trial/RCT, statistics) and ~33 phrase rules (NEET-PG separate from AIAPGET, "PG entrance" → AIAPGET, cut-off, assistant professor → faculty, modern medicine → allopathy, civil services → UPSC, case report, MPH, social media) |
| Typo handling | in-group one-edit folding (≥ 7 letters) **plus** snapping short typos to a known vocabulary ("patetn" → patent, "aiaget" → AIAPGET) | in-group folding only |
| Pair score | (0.55 weighted Jaccard + 0.35 Jaccard + 0.10 bigram Jaccard) × ask-type factor | (0.55 weighted cosine + 0.35 cosine + 0.10 bigram Jaccard) × contrast factor. Cosine scores short questions higher, which inflates scores at the same threshold. |
| Different-ask damping | facets (licence / cost / income / books / cut-off / eligibility / patients / staff / location / country): clash × 0.6, one-sided × 0.85 | PG branch or country only: clash × 0.5, one-sided × 0.8 — nothing for licence vs cost, books vs cut-off, job vs salary |
| Gates | best link ≥ t and mean ≥ 0.6 t; packing at max(0.28, 0.78 t) with mean ≥ 0.75 × that | best ≥ t and mean ≥ 0.8 t in both passes |
| Clustering / pack cap | greedy (most tokens first) + pack-small-groups pass, cap 7, target 6 | identical structure |
| Representative | among members within 0.1 of the top centrality, the best-worded one (English, no greeting, no typo, sensible length, "?"); greeting / "??" tidied; `representativeId` set | most central member (by un-weighted score); ties → longer; groups of 2 → longer one; raw text; no `representativeId` |
| Default threshold | 0.48 | 0.42 |

## 3. Results

### 3a. Recommended threshold 0.48 — sub-areas kept (default)

| dataset | engine | P | R | F1 | wrong (rep) | wrong (majority) | merged | avg group | groups |
|---|---|---|---|---|---|---|---|---|---|
| Fresh-403 | A | 0.958 | 0.152 | 0.262 | 0.5% (2) | 0.5% | 26.3% | 1.19 | 340 |
| Fresh-403 | B | 0.810 | 0.197 | 0.316 | 3.0% (12) | 3.0% | 37.0% | 1.29 | 312 |
| Fresh-403 | H | 0.962 | 0.169 | 0.287 | 0.5% (2) | 0.5% | 28.8% | 1.21 | 334 |
| Fresh-403 | **L** | 0.962 | 0.167 | 0.285 | 0.5% (2) | 0.5% | 28.3% | 1.20 | 335 |
| B-heldout | A | 0.978 | 0.138 | 0.242 | 0.6% (1) | 0.6% | 23.3% | 1.17 | 139 |
| B-heldout | B | 0.779 | 0.167 | 0.275 | 3.1% (5) | 3.1% | 30.7% | 1.26 | 129 |
| B-heldout | H | 0.918 | 0.176 | 0.296 | 1.2% (2) | 1.2% | 26.4% | 1.22 | 134 |
| B-heldout | **L** | 0.981 | 0.167 | 0.285 | 0.6% (1) | 0.6% | 25.2% | 1.20 | 136 |
| B-dev | A | 0.820 | 0.140 | 0.239 | 2.4% (9) | 2.4% | 24.7% | 1.20 | 314 |
| B-dev | B | 0.781 | 0.270 | 0.401 | 6.9% (26) | 6.6% | 52.4% | 1.53 | 245 |
| B-dev | H | 0.824 | 0.168 | 0.278 | 2.9% (11) | 2.9% | 32.2% | 1.27 | 297 |
| B-dev | **L** | 0.844 | 0.165 | 0.276 | 2.4% (9) | 2.4% | 30.9% | 1.25 | 300 |
| A-1200 | A | 0.960 | 0.559 | 0.707 | 1.4% (17) | 1.3% | 74.1% | 2.18 | 550 |
| A-1200 | B | 0.895 | 0.627 | 0.737 | 4.8% (57) | 4.8% | 79.3% | 2.51 | 479 |
| A-1200 | H | 0.968 | 0.588 | 0.732 | 1.3% (15) | 1.2% | 74.6% | 2.23 | 537 |
| A-1200 | **L** | 0.969 | 0.582 | 0.727 | 1.0% (12) | 1.0% | 74.6% | 2.23 | 539 |

### 3b. 0.48 — sub-areas mixed

| dataset | engine | P | R | F1 | wrong (rep) | wrong (majority) | merged | avg group | groups |
|---|---|---|---|---|---|---|---|---|---|
| Fresh-403 | A | 0.908 | 0.197 | 0.323 | 1.0% (4) | 1.0% | 32.3% | 1.24 | 324 |
| Fresh-403 | B | 0.781 | 0.306 | 0.439 | 5.2% (21) | 5.0% | 47.9% | 1.44 | 280 |
| Fresh-403 | H | 0.918 | 0.223 | 0.359 | 1.0% (4) | 1.0% | 34.2% | 1.27 | 318 |
| Fresh-403 | **L** | 0.918 | 0.221 | 0.357 | 1.0% (4) | 1.0% | 33.7% | 1.26 | 319 |
| B-heldout | A | 0.927 | 0.160 | 0.273 | 2.5% (4) | 1.8% | 26.4% | 1.21 | 135 |
| B-heldout | B | 0.892 | 0.233 | 0.369 | 2.5% (4) | 2.5% | 39.3% | 1.36 | 120 |
| B-heldout | H | 0.860 | 0.233 | 0.366 | 2.5% (4) | 2.5% | 30.1% | 1.27 | 128 |
| B-heldout | **L** | 0.967 | 0.186 | 0.311 | 1.2% (2) | 1.2% | 26.4% | 1.22 | 134 |
| B-dev | A | 0.746 | 0.141 | 0.237 | 5.9% (22) | 4.8% | 30.6% | 1.25 | 301 |
| B-dev | B | 0.682 | 0.269 | 0.385 | 11.7% (44) | 11.4% | 57.4% | 1.63 | 230 |
| B-dev | H | 0.771 | 0.184 | 0.296 | 5.6% (21) | 5.3% | 38.0% | 1.33 | 282 |
| B-dev | **L** | 0.780 | 0.170 | 0.279 | 5.1% (19) | 4.8% | 36.4% | 1.31 | 287 |
| A-1200 | A | 0.958 | 0.673 | 0.791 | 1.7% (20) | 1.6% | 84.5% | 2.69 | 446 |
| A-1200 | B | 0.862 | 0.714 | 0.781 | 7.3% (88) | 7.0% | 88.7% | 3.19 | 376 |
| A-1200 | H | 0.944 | 0.698 | 0.802 | 2.3% (28) | 2.3% | 85.4% | 2.81 | 427 |
| A-1200 | **L** | 0.955 | 0.700 | 0.808 | 1.8% (22) | 1.8% | 85.3% | 2.79 | 430 |

### 3c. Fair-to-B check: best recall at a fixed safety budget (sub-areas kept, any threshold 0.40–0.56)

Engine B's cosine scoring runs "hotter", so comparing at the same threshold could be unfair to it. Here each engine gets its own best threshold, subject to a wrong-answer budget:

| dataset | budget | A | B | Hybrid-lite |
|---|---|---|---|---|
| Fresh-403 | ≤ 2 % | R 0.193 (1.2 %, t 0.40) | R 0.149 (1.5 %, t 0.54) | **R 0.223** (1.5 %, t 0.40) |
| B-heldout | ≤ 2 % | R 0.192 (1.2 %, t 0.42) | R 0.198 (1.8 %, t 0.46) | **R 0.233** (1.2 %, t 0.40) |
| B-dev | ≤ 2 % | R 0.120 (1.9 %) | none in range | **R 0.148** (1.6 %) |
| A-1200 | ≤ 2 % | R 0.570 (1.3 %) | none in range | **R 0.611** (1.8 %) |

Even with free threshold choice, B never reaches A's safety on the tuning sets. On held-out data it only matches A's recall when it spends more of the budget.

Note on absolute recall: on the hand-written sets (B-dev, B-heldout, Fresh) every engine reaches only 14–30 % of the reachable same-intent pairs. Students there phrase the same ask with no shared topic words ("MD entrance — where do I even begin?" vs "How should I prepare for AIAPGET?"). A word-overlap engine cannot link those safely; staff manual merge remains the tool for them.

### 3d. Safety invariants and operations

| check | A | B | H | Hybrid-lite |
|---|---|---|---|---|
| cross-theme groups (288-run sweep) | 0 | 0 | 0 | 0 |
| groups > 7 | 0 | 0 | 0 | 0 |
| lost / duplicated / orphaned questions | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| runtime, 1,200 questions (median of 5, @0.48) | 40 ms | 40 ms | 40 ms | 42 ms |
| same groups on 3 shuffled inputs (kept & mixed, all datasets) | yes | yes | yes | yes |
| same representative on shuffled input | yes | yes | yes | yes |
| re-merge with own output as `prev` → identical ids + groups | yes | yes | yes | yes |
| event flow: 75 % merged → every 3rd group answered/published, every 7th "Sent to mentor", every 5th composed → rest arrive → re-merge: locked groups unchanged | yes (all datasets) | yes | yes | yes |
| answers copied to other groups | never | never | never | never |
| lost / duplicated after re-merge | 0/0 | 0/0 | 0/0 | 0/0 |

### 3e. Representative (mentor) question quality, 0.48, sub-areas kept

| dataset | engine | starts with greeting | Hinglish / Devanagari | avg chars | rep = majority intent | centrality (1 = most central) |
|---|---|---|---|---|---|---|
| A-1200 | A | 0.8% | 5.9% | 47 | 99.6% | 0.953 |
| A-1200 | B | 36.1% | 10.0% | 55 | 100.0% | 0.914 |
| A-1200 | Hybrid-lite | 0.9% | 5.1% | 47 | 100.0% | 0.950 |
| Fresh-403 | A | 7.0% | 7.0% | 56 | 100.0% | 0.921 |
| Fresh-403 | B | 37.9% | 27.6% | 65 | 100.0% | 0.882 |
| Fresh-403 | Hybrid-lite | 6.5% | 6.5% | 56 | 100.0% | 0.925 |

B's mentor question opens with "Sir / Respected / I am a … student" in more than a third of groups. It is Hinglish 2–4× as often, because B prefers the longest member. A and hybrid-lite share the same representative logic. On the fresh set, 2 of hybrid-lite's 46 merged-group questions start with a greeting that A's stripper doesn't know: "Pranam." and "Myself Ritika, BAMS intern." (comma before "BAMS intern"). That is a small follow-up, deliberately not fixed here so the fresh set stays untuned.

## 4. Engine B against the existing test suite (`npm test`, 61 tests)

Run in a gitignored scratch copy (`.qa/engine-b-tests/`, `shared/merge.js` replaced by B, dummy `ADMIN_PIN`). A control run of the same copy with A passed 61/61. Production code was never switched.

- **As-is: 53 run, 51 pass, 2 fail.** `merge-accuracy.test.mjs` cannot load because B does not export `stripBoilerplate` / `tidyQuestion`, so its 9 tests never run. The tokeniser test fails because B maps "PG entrance" to AIAPGET without a PG token.
- **With A's two helpers shimmed in so the 9 tests run: 61 run, 53 pass, 8 fail:**
  - boilerplate: a self-introduction ("final year") still becomes topic words
  - B.A.M.S. with dots is read as an MS (PG) degree
  - Hindi "bams ke baad kya kare" doesn't group with "What should I do after BAMS?"
  - typo snapping ("patetn" → patent) is missing
  - facets: "licence to open a clinic" vs "money to open a clinic" scores 0.633, so they would merge
  - representative: picks the long greeting-laden question, not "How to prepare for AIAPGET?"
  - the 1,200-question scale guard fails: no `representativeId`, and a 5.8 % wrong-answer rate at B's default 0.42 against a 2.5 % limit
  - PG / MD / postgraduate / AIAPGET collapse (as above)

Caveat: most of those tests were written alongside engine A, so they encode A's design decisions. The benchmark numbers above are the neutral evidence; the tests agree with them.

## 5. The hybrids

**H (A + all of B's vocabulary).** Recall rose everywhere, but wrong answers also rose on B-dev (9 → 11), B-heldout kept (1 → 2) and A-1200 mixed (20 → 28). Tuning-set error lists traced almost all of it to five vocabulary items:

| B vocabulary item | why it misfired |
|---|---|
| "PG / MD entrance (exam)" → AIAPGET | pulled AIAPGET *books* and *drop-a-year* questions into *preparation* groups |
| spa / spas → resort | "spas in the Maldives" joined a wellness-resort-jobs group |
| posts → job, openings → job | "posts" is ambiguous (Instagram posts vs government posts); government-jobs and NAM-contract asks merged |
| extra Hinglish stopwords (sahi, rahega, aata, padta, …) | shortened Hinglish questions until one shared word ("start") dominated |

**L (hybrid-lite) = H minus those five.** It is now in `shared/merge.js`. Scoring, gates, packing, locking and representative logic are unchanged from A; only the vocabulary grew. It passed all 61 existing tests unmodified before adoption. Three tests were added: the vocabulary pairs that must merge, the asks that must stay apart (NEET-PG vs AIAPGET, budget vs licence, "posts" never a job, spa ≠ resort), and a held-out guard. The guard runs the live engine against the frozen pre-comparison engine on Fresh-403 and B-heldout and requires no more mis-served students and more same-intent pairs.

**Adoption rule check.** The rule was: lower or equal wrong-answer rate AND higher recall on fresh data, plus all tests passing. Hybrid-lite meets it on Fresh-403 (0.5 % = 0.5 % kept, 1.0 % = 1.0 % mixed; recall +0.015 / +0.024). It also meets it on B-heldout (kept equal, mixed 2.5 % → 1.2 %; recall +0.029 / +0.026). `npm test` 64/64; `npm run build` OK.

## 6. Recommended settings

- **Threshold 0.48, sub-areas kept** (default, unchanged). It is the lowest-error setting on the tuning sets and gives ≤ 0.6 % wrong answers on held-out and fresh data.
- 0.46 with sub-areas kept: +1–2 points recall for the same fresh / held-out error. Fine when the desk is very busy.
- Sub-areas mixed: stay ≥ 0.48. At 0.44 and below, wrong answers climb to about 3 % on A-1200 and 6 % on B-dev.
- Keep the cohesion-based staff review for hand-written-style asks with no shared words; no word-overlap engine links those safely.

## 7. Reproduce

```bash
node scripts/bench/build-fresh-dataset.mjs        # regenerates scripts/bench/fresh-400.json (seed 9173301)
node scripts/bench/compare-engines.mjs            # A, B, H, L × 4 datasets × 0.40–0.56 × kept/mixed (~18 s)
npm test                                          # 64 tests incl. held-out guard vs the frozen engine
```
