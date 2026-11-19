# AYURDISHA — load readiness (registration + Ask Desk burst)

Written 2026-11-05. Scope: thousands of delegates registering and asking within minutes at the
11th World Ayurveda Congress (many behind one venue Wi-Fi address). Code: `server/passIssuer.js`,
`server/register.js`, `server/otpLimits.js`, `server/mailer.js`, `server/store.js`,
`server/storePlugin.js`, `server/publicStats.js`, `server/testProbe.js`, `src/App.jsx` (Register).

**Status: hardened and tested locally; production load test not yet run** (PARENT TO RUN after
deploy — see the end). Nothing here has been deployed by the agent.

## What was hardened

| Area | Before | Now |
|---|---|---|
| Pass numbers (`11WAC/2026/NNNN`) | Every registration ran a transaction on one doc, `meta/wac-seq` (~1 sustained write/s per doc → retries, timeouts, 500s in a burst) | Each instance reserves a **block of 10** numbers with one short transaction on one of **8 shard docs** (`meta/wac-seq~s0..7`, picked by "power of two choices" so shards stay level). Numbers are handed out from memory to a FIFO queue. Shard k owns blocks k, k+8, k+16… so blocks never overlap. Format unchanged, numbers roughly sequential; a recycled instance leaves ≤ 9 unused numbers (gaps are acceptable) |
| Uniqueness | Index written with plain `set` after a read check | Regno index doc claimed with **create-if-absent** (`ref.create()`): a number can never reach two people, even with a bug elsewhere |
| One number per person | Random user id per verify; double-click / retry could create two users or overwrite an issued number | New delegates get an id **derived from the email**; profile saved with a per-user transaction that never clobbers an issued number; the number is written only if the user still has none (else the claim is released). Retried / parallel verifies on different instances return the **same** number |
| Verify retry | Code cookie cleared before saving → a failed save forced a restart | Cookie kept until the registration is saved, so "press Verify again" works with the same code |
| Deadlines | none (30 s function limit) | Post-OTP work capped at 18 s → `503 {code:"busy"}` "Your email is verified — press Verify again"; store failures are 503 (retryable), never a bare 500 |
| Contention retries | SDK default only | Firestore transactions / creates retried on ABORTED / UNAVAILABLE / DEADLINE_EXCEEDED / RESOURCE_EXHAUSTED with exponential backoff + jitter |
| OTP limits | 60 s cookie cooldown only (per browser) | Per browser 60 s (cookie) · **per email 5 sends / 15 min** across instances (one tiny doc per email, hashed key `aym:otp:*` — no shared doc) · **per network 300 / 10 min per instance** (in memory; generous for a venue NAT). Store trouble fails open. Clear 429 messages with `retryIn` |
| OTP storage | signed cookie | still a signed cookie (hmac, not digits). If send fails, a sealed copy (AES-256-GCM) sits in `aym:mail:*` for retry only — never on the staff mail list or in logs on Vercel |
| Email | single attempt, 502 on failure | Up to 3 attempts per provider (6 s timeout each) on 429 / 5xx / network; **Resend primary + SMTP/Gmail fallback** (`RESEND_API_KEY`, `MAIL_PROVIDER`, `SMTP_*`). If both fail, the message is stored at `aym:mail:*` and the worker retries with backoff. Register / Ask / staff still return 200 (`delivery: "queued"`). OTP digits never appear on the staff mail backlog. Reserved test domains (`*.test`, `*.example`) are never sent to a real provider |
| `meta/stats` | Transaction on **every question write** (hot doc on the submit path) | Removed from the write path; staff-only stats recomputed on read at most every 5 min |
| Visit counters | Blind increments on one doc `meta/visit-sources`; 12 visits / 10 min per IP | 10 shard docs (`meta/visit-sources~s*`), summed on read; bounded 2 s, failures logged and never surfaced; 300 / 10 min per IP |
| Public stats | Per-instance 60 s cache; each cold instance ran aggregations + a 30-min full scan | CDN-cacheable `GET /api/aym-store?op=publicStats` (`s-maxage=30, stale-while-revalidate=120`), 30 s instance cache, plus one shared store record (60 s) with a recompute lease so only one instance recomputes. Probe / load-test data excluded |
| Public clusters (`get aym:clusters`, every page load) | Doc read per request | 10 s per-instance cache, invalidated on every cluster save in that instance |
| DISHA worker kicks | One `/api/ai-worker` invocation per submit (each writes `ai_config/worker`) | One post-submit kick per instance per 15 s; kick-triggered runs start at most once per 10 s globally (`lastKickAt`) |
| DISHA daily cap | — | `[TEST][LOAD]` questions from probe emails are never enqueued (enqueue, sweep, backfill, regenerate) |
| Student flows vs staff reads | — | Verified: no student flow calls `staffSnapshot` / `regUsers` / `list`; staff snapshot stays staff-only |
| Client | Buttons disabled while busy; no retry on register | Ref guard against double-submit (Enter + click); register start / resend / verify retry automatically on network / 502 / 503 / 504 with jittered backoff and show "The hall is busy — retrying…" (screen-reader live region). Ask Desk already retried once with the same id + ticket (server answers `duplicate: true`) |

Idempotency keys: registration = **email** (user id derived from it); Ask submit = **question
id + ticket** (`aym:q:<id>`; a resend with the same ticket is a no-op success).

## Evidence (local)

- `npm test` — 295/295, including `tests/register-burst.test.mjs` (17) and
  `tests/register-burst-http.test.mjs` (4):
  - 500 parallel registrations on the in-memory adapter: 0 failures, numbers exactly 0001–0500.
  - **Firestore contention simulation**: 20 simulated instances, 500 delegates + 100 double
    submits on other instances, optimistic transactions that abort on concurrent writes plus 10 %
    random ABORTED: 0 failures, 0 duplicate numbers, one user / regno / email index per person,
    same number for both submits, hottest counter doc ≤ 40 writes for 600 registrations
    (vs 600 with the old single counter), numbers above the legacy counter + margin.
  - 5 simultaneous verifies of one delegate on 5 instances → one number.
  - 150 delegates through the real HTTP handler from **one** venue IP → all 200, numbers 1–150.
  - Per-email window, NAT-friendly IP limit, mail retry/backoff/no-retry/suppression, deadline →
    503, side work never throws, sharded visit sums, probe-free public stats + shared cache,
    load-test questions never queued for DISHA, purge leaves nothing.
- `npm run e2e` 41/41; `qa-render-smoke` 29/29; `ui-smoke` 31/31; `ask-render-check` 6/6;
  `prod-ask-probe --local` 17/17; `npm run build` OK.
- `node scripts/load/register-burst.mjs --local --total=400 --max-concurrency=200` (local file
  store — single process with synchronous file I/O, so latencies are NOT representative of
  production; correctness is):

| Step | Concurrency | Requests | Success | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|---:|---:|
| wave 1 · total | 25 | 27 | 100 % | 33 | 55 | 57 |
| wave 2 · total | 50 | 53 | 100 % | 91 | 139 | 144 |
| wave 3 · total | 100 | 107 | 100 % | 281 | 514 | 529 |
| wave 4 · total | 200 | 213 | 100 % | 1032 | 1917 | 2009 |
| Ask submit | 200 | 200 | 100 % | 814 | 814 | 814 |

  Duplicate pass numbers 0 · 400/400 delegates on server · re-register keeps number 10/10 · Ask
  resend = duplicate 5/5 · DISHA jobs for load questions 0 · cleanup leftovers 0.

## Production load test (PARENT TO RUN, after deploy)

```bash
cd ayurmarg-preview
AYM_SERVICE_TOKEN=... node scripts/load/register-burst.mjs --dry-run                         # plan + leftovers, writes nothing
AYM_SERVICE_TOKEN=... node scripts/load/register-burst.mjs --total=400 --max-concurrency=200  # the run (≈ 1–3 min)
AYM_SERVICE_TOKEN=... node scripts/load/register-burst.mjs --cleanup-only                     # only if a run was interrupted
```

- Test delegates only: `aym-probe+load-<run>-<n>@ayurdisha-qa.test`. No email is sent (reserved
  domain). Pass numbers come from the separate load-test range `11WAC/2026/9xxxxx`.
- Each registration = public `regStart` (real limits, real OTP cookie) + staff-only
  `testProbeRegister` (the same post-OTP code path as `regVerify`). PIN-gated, probe emails only.
- Questions are `[TEST][LOAD] …` → never queued for DISHA; the daily cap is untouched.
- Cleanup always runs (also on failure / Ctrl-C); a state file in the OS temp dir lets
  `--cleanup-only` finish the job later. Exit 1 on any duplicate, < 99 % success or leftovers.
- Paste the printed table into the QA report. What it does **not** measure: real email delivery
  (see the email section) and browser rendering.
- Cost of one run (≈ 400 registrations + 200 submits + cleanup): roughly 6–8 k Firestore writes,
  4–6 k reads, 2–3 k deletes — over the free Spark daily write quota, fine on Blaze (cents).

## Required plans and provider limits

| Service | Requirement | Why |
|---|---|---|
| **Vercel Pro** | Required for the event | Hobby is for non-commercial use and has lower concurrency / usage ceilings; Pro raises concurrent function executions and adds spend management. `api/aym-store.js` has `maxDuration: 60` (a ceiling for the staff "run worker and wait" op; normal ops take well under a second), region `bom1`. Make sure Attack Challenge Mode / firewall rules don't challenge a burst from one venue IP |
| **Firestore Blaze** (pay as you go) + budget alert | Required | Spark free quotas (50 k reads, 20 k writes, 20 k deletes per day) are exhausted by a few thousand registrations (~8–10 writes each) plus submits, staff desk scans and the load test. Set a budget alert (e.g. ₹2,000 / month) |
| **Email provider** | Verified sending domain + raised rate limit | Every registration sends one OTP. Resend (as of writing — verify in the dashboard): free tier 100 emails/day and 3,000/month, default API rate limit ~2 requests/s per team; `onboarding@resend.dev` only delivers to the account owner. For thousands of delegates: a paid plan (e.g. Resend Pro, 50 k/month) with a **verified domain** (`MAIL_FROM`) and a rate-limit increase to ≥ 10 req/s; or Amazon SES / a transactional SMTP relay with similar throughput. Gmail / personal SMTP (~500/day) is not suitable |

At a 2 req/s provider limit, a burst of 200 code requests in 10 s would see 429s: the server
retries (3 attempts, ~2 s) and then **queues** the mail (`delivery: "queued"`). The delegate
sees that the verification email will arrive when mail capacity returns — registration is not
failed. Raising the provider limit (or using Resend/Postmark/SendGrid as primary with Gmail
as fallback) is the production fix; the queue is so a free Gmail cap never stops Ask or OTP.

## Remaining limits and risks

- **Email throughput is the real bottleneck** (above). The load test suppresses mail, so it
  proves the app path, not the provider. Before the event, send a small real burst (e.g. 20 codes
  to team inboxes within 10 s) and confirm the provider's dashboard shows no 429s.
- **Theoretical pass-number ceiling**: 8 shards × ~1 transaction/s × 10 numbers ≈ 80 new
  registrations/s sustained before shard contention — far above venue arrival rates.
- **Gaps / order**: numbers are unique and roughly sequential, not strictly. Each new instance
  starts a fresh block, so a recycled instance can leave up to 9 unused numbers; under load the
  highest issued number can run ahead of the count by a few blocks until lagging shards catch up.
  The first number after deploy is the legacy `meta/wac-seq.last + 51`.
- **Deploy overlap**: instances still running the old code during rollout increment
  `meta/wac-seq` directly; the 50-number margin plus the create-if-absent regno index keep new
  numbers unique. **Rollback caution**: old code continues from `meta/wac-seq.last` and skips
  taken numbers only 12 at a time; before rolling back, set `meta/wac-seq.last` to the highest
  issued number.
- **Per-network limit is per instance and in memory** (300 / 10 min). A determined abuser on many
  IPs is limited by the per-email window and the provider's own quotas, not by the app.
- **Sessions** (`aym:sess:*`) and OTP rate records (`aym:otp:*`) accumulate; consider a Firestore
  TTL policy on `kv` docs with an `expiresAt` field after the event (not added here).
- **Staff desk** (`staffSnapshot`) still reads every question and delegate on each reload; with
  thousands of records that is thousands of reads per staff refresh — fine for a handful of staff,
  but avoid leaving many staff tabs auto-reloading during the peak.
- **Knowledge chat** (`/api/knowledge-chat`) was not part of this hardening.
- **CDN caching** of public stats relies on Vercel caching GET function responses with
  `s-maxage`; if it doesn't, the 30 s instance cache and the shared record still cap the load.
- The Firestore contention behaviour is simulated in tests; only the production load test
  measures real Firestore + Vercel latency.
