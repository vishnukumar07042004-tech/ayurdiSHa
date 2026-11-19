# Faculty Q&A bank evaluation — Clinical Practice (clinical-practice)

Run 2026-11-07T22:27:07.785Z · 100 rows · 1179 indexed variants · thresholds match 0.48, margin 0.02, reuse 0.7

## Matching

| Metric | Value |
|---|---|
| Held-out paraphrases | 60 |
| Top-1 accuracy | 59/60 (98.3%) |
| Confident and correct (used in drafting) | 58/60 (96.7%) |
| Confident but wrong row | 0/60 (0%) |
| — en | 28/30 (93.3%) |
| — hinglish | 18/18 (100%) |
| — hi | 12/12 (100%) |
| False matches, unrelated streams | 0/122 (0%; target ≤ 2%) |
| In-domain eval-set questions matched (informational) | 18/32 (56.3%) |

Held-out not used:

- CP-01-001 [en] "what clinical careers can i choose once i finish bams" → CP-06-002 0.351 weak
- CP-08-010 [en] "a patient complained about my clinical care, how should i handle it" → CP-08-010 0.406 weak

## Enriched answers

| Check | Rows |
|---|---|
| Enriched | 97/100 |
| 150–250 words | 97/97 |
| 3 next steps | 97/97 |
| Mistake to avoid | 97/97 |
| 2–3 sources | 59/97 |
| Verify-locally when state-specific | 97/97 |
| Citations valid (in KB, allow-listed, verbatim quote) | 314/314 |
| Dose / prescription wording | 0 |
| ≥ 8 generated paraphrases | 97/97 |
