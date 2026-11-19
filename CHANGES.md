# CHANGES

## 2026-11-19 — Home hero slider motion + imagery (owner Mac feedback)

- Shortened autoplay to **4s** with **750ms** crossfade; Ken Burns scale **1.06→1.15** + clearer pan so motion reads on Mac Safari/Chrome.
- Removed Play/Pause chrome; minimal progress dots + keyboard ←→ only; hover/focus still pauses; reduced-motion = static slide 1.
- Replaced weak `hall-wac` with four strongest frames: `home/hero-hall`, `slides/slide-hall`, `sections/bhubaneswar-temple`, `slides/slide-track`.
- Spec: `docs/design/home-hero-slider.md`. Ask Desk untouched.

## 2026-11-19 — Home hero cinematic slider

- Redesigned home hero only to a full-bleed, auto-advancing cinematic slider (congress feel adapted from ayurworld.org — no copied logos/seals).
- Brand `AYURDISHA` as hero-level signal; congress line includes 10–13 Dec 2026 / Janata Maidan / Bhubaneswar; same Ask Desk / Explore mentors / About CTAs.
- Three project slides (hall, Bhubaneswar temple, WAC hall) with crossfade + Ken Burns–lite; pause on hover/focus; progress dots + keyboard ←/→; `prefers-reduced-motion` freezes on slide 1 with no autoplay.
- Files: `src/pages/home/HomeHero.jsx`, `src/styles/home-hero.css`, `docs/design/home-hero-slider.md`. No Ask Desk / staff / API changes.

## 2026-11-19 — DISHA V2 Phase 1 (welcome-by-default)

- Scope policy v2: rules catch spam/abuse/unsafe/medical; keyword OFF_TOPIC no longer declines normal language; scripted OFF_TOPIC/UNFOCUSED off by default (`AI_ALLOW_SCRIPTED_OFFTOPIC=false`).
- Coding / app-from-zero stays ON_TOPIC; Tech track no longer falls through to Internship; track is a hint.
- Answer writer: beginner-from-zero, `mustKnow` callouts, scrub false “links below”; resources only from allow-list.
- Mentor Provide-answer modal: multi-line Action/Mistake fields + Resources; DISHA edit panel wraps next steps.
- Risk badge uses explainable reasons; routing-why panel; confirm on unsupported claims.
- Hybrid GPT credit fallback: quality draft until 429/billing, then `AI_GPT_CREDIT_FALLBACK_MODEL` + paid Gemini verify.
- Flags: `AI_SCOPE_POLICY_VERSION`, `AI_COMPARE_SAMPLE_RATE`, `AI_KILL_SWITCH`, `PLAN_MODE`, GPT fallback envs.
- Gold set + `npm run eval:disha`; docs `docs/ai/DISHA-V2.md`. Students: mentor attribution only (no AI disclosure on Track).

## 2026-11-19 — Phase A (security & quota, slice 1)

- Empty intake deadlines + Janata Maidan venue; `PLAN_MODE=free` (Blaze later when funded).
- ADMIN_PIN fail-closed if &lt;12; service token scoped allow-list (rotate `STAFF_SERVICE_TOKEN` after deploy).
- Crypto track tickets (~50 bits) + Track lookup rate limit; staff page default/max **50**; HSTS + robots `/staff` `/account`.
- Quota meter on staff `whoami`/`staffMe`; opt-in `AYM_LITE_MODE` (page cap 25, no `staffSnapshot`).
- Refused review-link redeem → staff `aym:wacalert:` (lightweight); import formula sanitise **keeps phones**.
- No change: age/sex/phone, roles, privacy contact, trusted-device TTL, email stack.

## 2026-11-19 — Phase 0 decisions (owner)

- Audit **approved**; Phase A unlocked.
- Keep age/sex/phone as today; leave privacy contact, trusted-device TTL, roles, and email stack for later.
- KB excerpt+citation OK for now; Firestore stays free until funded (pay-as-you-go later).

## 2026-11-19 — Phase 0 backend audit (read-only)

- Added `docs/BACKEND_AUDIT.md`: P0/P1/P2 findings with file cites, op auth matrix, Firestore read/write estimates, checklist (Confirmed / Not an issue / Needs decision), owner overrides (10 tracks, no deadlines, mentor-only student attribution — no student-facing AI disclosure), decisions-needed, draft Congress runbook.
- Merged deep-dive refinements: fuller op matrix; A6 review-links = Not an issue (alerts open); Spark write exhaustion on ~2k regs; uncapped Track lookup; Mentor Pack always exports Name/Email; Blaze vs Spark + CAPTCHA as decisions.
- No production data changes. No code behaviour changes in this step.
