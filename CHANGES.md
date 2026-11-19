# CHANGES

## 2026-11-19 — Phase 0 backend audit (read-only)

- Added `docs/BACKEND_AUDIT.md`: P0/P1/P2 findings with file cites, op auth matrix, Firestore read/write estimates, checklist (Confirmed / Not an issue / Needs decision), owner overrides (10 tracks, no deadlines, mentor-only student attribution — no student-facing AI disclosure), decisions-needed, draft Congress runbook.
- Merged deep-dive refinements: fuller op matrix; A6 review-links = Not an issue (alerts open); Spark write exhaustion on ~2k regs; uncapped Track lookup; Mentor Pack always exports Name/Email; Blaze vs Spark + CAPTCHA as decisions.
- No production data changes. No code behaviour changes in this step.
