# DISHA provider head-to-head — 2026-11-08

Same 44-question subset, same BM25 retrieval, real pipeline. Spent $2.9899 (cap $4). OpenAI adapter: script (reasoning.effort + headroom + store:false). Judges: gemini-3.1-pro-preview.

| Metric | gpt-54 | gpt-mini | hybrid-gpt-draft |
|---|---|---|---|
| Questions run | 44 | 44 | 44 |
| Drafted (grounded / mentor-assist) | 40 (9 / 31) | 41 (10 / 31) | 39 (10 / 29) |
| Errors | 0 | 0 | 0 |
| Claim support rate | 67.2% | 58.8% | 86.4% |
| Unsupported claims (in low-risk drafts) | 61 (0) | 46 (0) | 3 (0) |
| Unsourced numbers caught | 1 | 1 | 3 |
| Citation validity | 100% | 100% | 100% |
| JSON failures / JSON calls | 0 / 162 | 0 / 139 | 0 / 85 |
| Truncated (max tokens) | 0 | 0 | 0 |
| Medical routed to mentor | 80% | 60% | 100% |
| Career falsely blocked as medical | 0 | 0 | 0 |
| PII leaks | 0 | 0 | 0 |
| Thin-source handled safely | 4/4 | 4/4 | 4/4 |
| Risk mix low/med/high | 1/0/39 | 0/0/41 | 0/8/31 |
| Escalated | 88.9% | 100% | 10% |
| Triage: career → on-topic | 100% | 100% | 97.4% |
| Judge faithful / language / helpful (1-5) | 4.43 / 4.86 / 4.71 | 4.75 / 4.63 / 3.63 | 4.88 / 4.75 / 4.5 |
| Judge approvable | 100% | 75% | 100% |
| Hindi/Hinglish language score | 5 (n=1) | 4 (n=1) | 4 (n=1) |
| Latency p50 / p95 per question | 20575 / 39062 ms | 9950 / 15241 ms | 15593 / 28424 ms |
| Draft call p50 / p95 | 8418 / 18418 ms | 2282 / 6034 ms | 8523 / 15720 ms |
| Draft tokens in / out (reasoning) | 3820.9 / 525.1 (176.75) | 3824.96 / 399.43 (159.72) | 3814.81 / 525.49 (176.25) |
| Verify tokens in / out | 1523.5 / 820.94 | 1479.24 / 808.9 | 1752.14 / 457.57 |
| Spend this run | $1.2437 | $0.4468 | $1.1725 |
| Cost per draft incl. triage, 2026-12-10 prices | $0.03109 | $0.0109 | $0.03027 |

Judge scores are LLM opinions (a same-family judge may favour its own family; with both keys the two judges are averaged). Officials' review stays the real gate.
