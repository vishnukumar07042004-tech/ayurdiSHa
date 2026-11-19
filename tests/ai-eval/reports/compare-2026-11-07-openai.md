# DISHA provider head-to-head — 2026-11-07

Same 44-question subset, same BM25 retrieval, real pipeline. Spent $0.0017 (cap $4). OpenAI adapter: script (reasoning.effort + headroom + store:false). Judges: gemini-3.1-pro-preview.

| Metric | gpt-54 | gpt-mini | hybrid-gpt-draft |
|---|---|---|---|
| Questions run | 4 | 4 | 4 |
| Drafted (grounded / mentor-assist) | 0 (0 / 0) | 0 (0 / 0) | 0 (0 / 0) |
| Errors | 4 | 4 | 4 |
| Claim support rate | — | — | — |
| Unsupported claims (in low-risk drafts) | 0 (0) | 0 (0) | 0 (0) |
| Unsourced numbers caught | 0 | 0 | 0 |
| Citation validity | — | — | — |
| JSON failures / JSON calls | 0 / 0 | 0 / 0 | 0 / 4 |
| Truncated (max tokens) | 0 | 0 | 0 |
| Medical routed to mentor | — | — | — |
| Career falsely blocked as medical | 0 | 0 | 0 |
| PII leaks | 0 | 0 | 0 |
| Thin-source handled safely | 0/0 | 0/0 | 0/0 |
| Risk mix low/med/high | 0/0/0 | 0/0/0 | 0/0/0 |
| Escalated | — | — | — |
| Triage: career → on-topic | 100% | 100% | 100% |
| Judge faithful / language / helpful (1-5) | — | — | — |
| Judge approvable | — | — | — |
| Hindi/Hinglish language score | — | — | — |
| Latency p50 / p95 per question | 1003 / 2466 ms | 1722 / 2539 ms | 2131 / 2208 ms |
| Draft call p50 / p95 | null / null ms | null / null ms | null / null ms |
| Draft tokens in / out (reasoning) | null / null (null) | null / null (null) | null / null (null) |
| Verify tokens in / out | null / null | null / null | null / null |
| Spend this run | $0 | $0 | $0.0017 |
| Cost per draft incl. triage, 2026-12-10 prices | — | — | — |

Judge scores are LLM opinions (a same-family judge may favour its own family; with both keys the two judges are averaged). Officials' review stays the real gate.
