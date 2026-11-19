# AYURDISHA QA audit — 2026-11-09

Live: https://ayushmarg.vercel.app (Vercel project `ayurdisha`, Firestore `ayurdisha-4917b`).  
Latest production deploy: `dpl_3fAQqishjeKRS6aCdCfw3EJgszKy` (Mumbai).

## Result

| Gate | Result |
|---|---|
| `npm test` | **494/494** |
| `npm run build` | OK (main JS 753 KB / 236 KB gz, hashed under `/assets/app/`) |
| Production deploy | READY, aliased to https://ayushmarg.vercel.app |
| Home + `ping` + `publicStats` | HTTP 200; backend Firestore |
| `npm run smoke:staff` | **5/5** |
| `prod-ask-probe.mjs` | **19/19** (submit, Track, desk paging, AI jobs, anonymous 403, cleanup) |

No secrets, passcodes, or API keys are recorded here.

## What this deploy includes

- **DISHA Hybrid primary:** GPT draft + Gemini claim check, Gemini fallback if OpenAI is missing or times out. Medical questions are routed to a mentor by six layers (rules, classify, triage model, drafter flag, post-draft scan, verifier). They are not auto-published.
- **GPT persona brief:** Hybrid / OpenAI drafts use identity + expertise only, so the persona’s Ask Desk `## Rules` / `## Output` cannot force `{"insufficient": true}` on thin career questions. Mentor-assist still applies.
- **Staff access:** passcode + email code; admin (`vishnukumar07042004@gmail.com`) approves co-admins; trusted-device sessions (90-day idle, live role check); lockout; audit log. Legacy PIN `login` is **410**.
- **Paged staff desk** and **faculty bank per-entry** storage (full workbook upload).
- **CDN:** hashed `/assets/app/*` immutable; API defaults to `no-store`; public GET ops are CDN-cached.

## Lacunae found and fixed in this pass

1. **Local tests vs a real service token in the environment.** Two script tests (`compare-drafts-script`, `wac-autolink`) sent `AYM_SERVICE_TOKEN` from the parent env to the isolated local server and failed `whoami`. Fix: `tests/helpers/staffAuth.mjs` pins both `STAFF_SERVICE_TOKEN` and `AYM_SERVICE_TOKEN` to a random per-run test token. After that: 494/494.
2. **GPT / Hybrid prompt conflict** (known from faculty enrichment): persona `## Rules` told GPT to decline on thin sources. Fix: `personaBrief` + `draftSystemFor` in `server/ai/runtime.js` / `draft.js`; covered by `tests/ai/draft-gpt-prompt.test.mjs`.

## Production smoke (this run)

- DISHA: `enabled=true`, shadow off, **16 streams on**, spend cap **$10/day**. Probe submits **3/3 queued a job or draft** without failing Ask submit.
- Staff: service token is admin; anonymous / wrong token 403; probe co-admin pending → no data → approve → desk works (14 questions, 32 delegates, page 40 ms) → revoke → 403; probe purged.
- Public stats during the probe: 32–33 registered, 14–17 questions (probe rows cleaned up).
- Hashed app bundle served from `/assets/app/index-*.js`. HTML is `max-age=0, must-revalidate` (correct for the SPA shell).

## Remaining risks (2k+ concurrent users)

| Risk | Why it still matters | Mitigation already in code |
|---|---|---|
| **Production mixed-traffic load test not run** | Local 500 / 1,000 VU read mix passed; 2,000 VU failed on this laptop’s loopback, not on Firestore | Burst-safe pass numbers, OTP limits, paged desk, worker kick coalescing. Run `scripts/load/mixed-traffic.mjs` against prod with a small `--max-registrations` when ready |
| **OTP email throughput** | Gmail SMTP daily caps can stall WAC-ID / staff codes if thousands register in hours | Move OTP to Resend/SES with a verified domain before announcing WAC-ID sign-in |
| **Staff passcode strength** | Smoke reports the weak-passcode banner is **shown** | Owner should set a 12+ character `ADMIN_PIN` in Vercel (value never stored in git or this file) |
| **KB gaps** | Little/no NTA AIAPGET and NBEMS bulletin text in `chunks.jsonl` | Mentor-assist drafts on those topics until `scripts/kb/fetch-gaps.mjs` is run and redeployed |
| **Vector search off** | Service account still lacks a 768-dim Firestore index | Retrieval is BM25-only until Datastore Index Admin is granted |
| **DISHA spend** | Hybrid ≈ $0.03/answer; cap $10/day | Compare mode can stay on for evaluation; turn off in Settings after review |
| **Main JS ~753 KB** | Vite warning only; immutable cache | Further split of `App.jsx` / podcast knowledge is optional |

## Staff access (operator)

1. Open Staff access → passcode → **your** email → code from Gmail.
2. You remain admin; co-admins stay approved on that browser as a trusted device (sign-out this device / all devices in the portal).
3. Scripts use `STAFF_SERVICE_TOKEN` / `AYM_SERVICE_TOKEN`, never the passcode.

## Follow-ups (optional, not blockers)

- `node tests/ai-eval/compare-providers.mjs --pairings=hybrid-gpt-draft --cap=2` (live hybrid check, spend).
- `node scripts/ai/compare-drafts.mjs --status` (counts/costs only).
- Firestore TTL + PITR as in `docs/ops/DATA-RETENTION.md` and `docs/ops/BACKUPS.md`.
- Finish remaining GPT faculty variants (`scripts/faculty/enrich.mjs --both`) if the Clinical Practice workbook still has empty GPT sides.
