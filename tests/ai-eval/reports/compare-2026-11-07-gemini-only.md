# DISHA provider head-to-head — 2026-11-07

Same 44-question subset, same BM25 retrieval, real pipeline. Spent $1.4663 (cap $2). OpenAI adapter: script (reasoning.effort + headroom + store:false). Judges: gemini-3.1-pro-preview.

| Metric | gemini-current | gemini-flash |
|---|---|---|
| Questions run | 41 | 44 |
| Drafted (grounded / mentor-assist) | 33 (4 / 29) | 38 (8 / 30) |
| Errors | 5 | 3 |
| Claim support rate | 44.6% | 30.1% |
| Unsupported claims (in low-risk drafts) | 71 (0) | 99 (0) |
| Unsourced numbers caught | 0 | 1 |
| Citation validity | 100% | 100% |
| JSON failures / JSON calls | 0 / 140 | 0 / 151 |
| Truncated (max tokens) | 0 | 0 |
| Medical routed to mentor | 60% | 60% |
| Career falsely blocked as medical | 0 | 0 |
| PII leaks | 0 | 0 |
| Thin-source handled safely | 4/4 | 4/4 |
| Risk mix low/med/high | 0/1/32 | 3/2/33 |
| Escalated | 0% | 37.5% |
| Triage: career → on-topic | 88.9% | 87.2% |
| Judge faithful / language / helpful (1-5) | 3.25 / 4.85 / 4.3 | 2.65 / 4.8 / 3.95 |
| Judge approvable | 60% | 30% |
| Hindi/Hinglish language score | 5 (n=3) | 5 (n=3) |
| Latency p50 / p95 per question | 38697 / 1215401 ms | 14494 / 909168 ms |
| Draft call p50 / p95 | 14528 / 245077 ms | 4193 / 11190 ms |
| Draft tokens in / out (reasoning) | 3993.05 / 319.42 (0) | 3984.36 / 291.61 (0) |
| Verify tokens in / out | 1214 / 518.7 | 999.03 / 458 |
| Spend this run | $0.8198 | $0.3845 |
| Cost per draft incl. triage, 2026-12-10 prices | $0.0463 | $0.01012 |

Judge scores are LLM opinions (a same-family judge may favour its own family; with both keys the two judges are averaged). Officials' review stays the real gate.
