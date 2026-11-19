# AYURDISHA — Backend / Security / Ops Audit (Phase 0)

**Date:** 19 Nov 2026 (IST)  
**Scope:** Read-only. No production data changes. No secrets printed.  
**Live:** https://ayushmarg.vercel.app (Vercel `bom1`, Hobby)  
**Stack:** Vite + React SPA; `/api/aym-store`, `/api/ai-worker`; Firestore Admin SDK (Spark); DISHA = GPT draft + Gemini verify (staff pilot).

**Method:** Docs (`AUDIT.md`, `AI-ANSWER-PIPELINE.md`, `STAFF-ACCESS-SPEC.md`, `STAFF-REVIEW-LINK.md`, `DATA-STORAGE.md`, `LOAD-READINESS.md`, `BACKUPS.md`) + code in `server/`, `shared/`, `api/`, `vercel.json`, `src/`.

**Legend:** **Confirmed** = gap exists in code/docs · **Not an issue** = already adequate for free-plan Congress · **Needs decision** = blocked on owner choice.

---

## Owner decisions already recorded (this brief)

| Decision | Implication for later phases |
|----------|------------------------------|
| **10 career tracks are final** (no migration to 9) | D1 = keep 10; fix public copy that still says T1–T9; map DISHA streams to the ten. |
| Venue = **Janata Maidan, Bhubaneswar** | Fix Events page “WAC Convention Centre”. |
| Data owner = WAF/WAC; publication approver = WAC Secretariat; privacy contact = **TBC** | C3 config placeholders; never invent an email. |
| Live slots = **staff-only** selection | D4; students get Track Action card + notify only. |
| **No deadline dates decided** | D2: empty date config; remove hard-coded intake close / countdowns. |
| `PLAN_MODE=free\|paid` | Design for Spark + Hobby; document paid PITR later. |
| AI stays staff pilot + kill switch | Keep; never auto-publish. |
| Ignore mentor consent/photo | Out of scope. |
| **Student-facing AI honesty (OVERRIDE)** | **Do not tell students an AI wrote the answer.** Student UI/emails must attribute a **mentor / mentor desk** only. Staff-only labels (DISHA, Hybrid, “AI-assisted draft”) remain. Redact before LLM; **no** public “AI processing” consent banner that names OpenAI/Gemini to students — Privacy page may hold a brief third-party processing notice for legal compliance without framing answers as “AI replies”. |

---

## Executive summary

The app already has strong foundations: Firestore deny-all client rules, staff passcode+OTP+roles (admin/co-admin/review), AI never auto-publishes, PII redaction before model calls, paged staff data ops, spend-cap checks, daily cron. Congress-week risk on the **free plan** is dominated by **Firestore read hotspots**, **weak ticket entropy**, **hard-coded intake close**, **service token = full admin**, **no step-up OTP**, and **role model too coarse** for publication approval.

**Do not start Phase A until this audit is approved.**

---

## Checklist vs requested items

### Phase A — Security & quota

| ID | Item | Status | Notes |
|----|------|--------|-------|
| A1 | Quota safety (no full lists, cache, meter, lite mode) | **Confirmed** (partial) | Paged ops exist (`staffQuestionsPage` default 250 — still high). `staffSnapshot` + `listQuestions()` remain hot paths. Insights cache ~4s instance only. No staff Quota meter / lite mode. |
| A2 | `STAFF_SERVICE_TOKEN` scoped + rotate | **Confirmed** | Accepts as **full admin** via Bearer (`staffAuth.js` ~638–639). Length ≥32, SHA-256 + timing-safe compare. Not scoped, not IP-restricted, not rate-limited separately, use not specially audited as service. **Rotate now** after Phase A ships. |
| A3 | `ADMIN_PIN` ≥12 fail-closed | **Confirmed** | `passcodeConfigured()` only requires length ≥4 (`staffAuth.js` 129–131). Weak pin warned (`weakPasscode`) but still works. Lockout/backoff per IP+email exists. |
| A4 | Step-up OTP + trusted device 7–14d | **Confirmed** | Spec explicitly: “Not enabled: re-asking passcode for admin-only destructive actions.” Trusted devices roll up to **180d** cookie / **90d** idle — longer than 7–14d. Sign-out-all invalidates server-side (good). |
| A5 | Fine-grained roles + deny-by-default matrix test | **Confirmed** | Roles today: `admin` \| `co-admin` \| `service` \| `review` (read-only). Missing: curator, appointment coordinator, mentor, **publication approver**. `ADMIN_ONLY_OPS` + `STAFF_ONLY_OPS` exist but many ops fall through without an explicit allow-list test. |
| A6 | Review links + refused redeem alert | **Partial / Confirmed** | Single-use hashed token, TTL, cookie exchange, audited `review.redeem` (success + `bad_token`). Investigate 17 Nov 18:23 refused redeem in audit export (staging/prod). No alert on refused redeems. Confirm `history.replaceState` in UI. |
| A7 | Crawling / security headers | **Partial** | CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy in `vercel.json`. **No HSTS.** `robots.txt` Disallows `/api/` but **not** `/staff*`, `/account`. No `X-Robots-Tag` / staff noindex. |
| A8 | Public abuse (Turnstile, shared RL) | **Confirmed** | OTP limits strong; ask IP/user limiters exist (post-audit). **No Turnstile/CAPTCHA.** Limits are mostly in-memory/per-instance → weak under multi-instance. |
| A9 | Track ticket = bearer secret | **Confirmed** | Ticket = `AYM-Q-` + time slice + `Math.random` 3 chars (`App.jsx` 629–630) — **well under 40 bits crypto entropy**; predictable time component. Lookup is public by ticket. |
| A10 | PII mask; remove Age/Sex; no delegate phones | **Confirmed** | Registration still requires **age** + **sex** (`register.js` 71–78, 365–398). Delegate cards expose age/sex (`staffData.js` 60–67). WAC panel shows phone columns. Masking exists but not default-everywhere. Exports need super-admin + reveal audit. |
| A11 | Delegate import + verify tool + relink | **Partial** | Import is admin-only. Need step-up, diff preview hardening, formula injection audit, late “Verify/Add delegate”, keep link-conflict flow. |

### Phase B — AI

| ID | Item | Status | Notes |
|----|------|--------|-------|
| B1 | Redact + consent | **Partial / Owner override** | **Redaction Confirmed working** before providers (`server/ai/redact.js`, used in draft/triage/queue). Store keeps redacted snippets on drafts. **Do not** add student-facing “AI agent” notices (owner). Privacy page: third-party processing notice OK; answers remain mentor-attributed. |
| B2 | Queue durability + external sweeper | **Confirmed** | Jobs written (`putJob` before work). Worker retries/backoff exist. Hobby cron **once daily** (`vercel.json` `30 2 * * *`) — too slow for Congress. Need CRON_SECRET sweeper + GHA every 5–10 min + opportunistic sweeps. |
| B3 | Atomic spend cap + verifier fail → Unverified | **Partial** | Cap checked before runs (`queue.js` ~506) but **not** reserve/settle atomic under concurrency. Verifier 402 path needs “Unverified” + override reason. |
| B4 | Honesty / safety / sources | **Owner override + Confirmed gaps** | Student UI already says “Answered by … mentor desk” (`TrackAnswer.jsx`) — **keep / strengthen mentor attribution; never add “AI-assisted” on student surfaces**. Staff desk may keep DISHA labels. Require reviewer name (today optional → defaults to “The AYURDISHA mentor desk”). Block thin-source licensing/legal/country claims. Fix 100% confidence with “no clear subject”. |
| B5 | Publication Approver role | **Confirmed** | Missing role; approve today = any staff co-admin/admin. |
| B6 | Single status machine | **Confirmed** | Counts can disagree across Insights / Curation / Briefing / Track (known symptom). Need one authoritative status + legal transitions. |
| B7 | Clustering threshold + split | **Confirmed** | Weak auto-merges reported (e.g. ~0.06). Need min similarity, “Check this group”, split tool, edit locks. |
| B8 | Faculty bank + KB licensing | **Needs decision** | Clinical stream mature; expand streams. Review licensing of ~3,198 passages / 38 domains before public longevity. |

### Phase C — Quality / privacy / ops

| ID | Item | Status |
|----|------|--------|
| C1 | CI + Playwright all routes + ShieldCheck fix | **Partial** — unit tests strong; full route smoke + error monitoring incomplete. Confirm ShieldCheck deploy. |
| C2 | Four consents + retention erase | **Partial** — four consents shipped earlier; retention job exists but **does not** hard-delete questions/delegates without decision. |
| C3 | Privacy config (owner/approver/contact TBC) | **Confirmed** — placeholders needed; region + DPDP/GDPR notice. |
| C4 | Encrypted nightly backup (GHA) | **Confirmed** — docs exist; automated encrypted export not production-proven on free plan. |
| C5 | Mentor Pack Excel + podcast URL allow-list | **Confirmed** — blank render / formula injection / PII strip / CSP frame-src already partial. |
| C6 | System health panel | **Confirmed** — missing unified panel. |
| C7 | Email deliverability | **Needs decision** — confirm provider free-tier + SPF/DKIM/DMARC. |

### Phase D — Features / global / polish

| ID | Item | Status |
|----|------|--------|
| D1 | 10 tracks final + venue Janata Maidan | **Confirmed** — `shared/tracks.js` is 9 product tracks; personas still 10 themes; How-it-works may say T1–T9; Events still “WAC Convention Centre”. |
| D2 | All dates empty by default | **Confirmed** — `shared/productConfig.js` hard-codes intake 25 Nov, briefs, roster, answer-bank-by. **Conflicts with owner: no deadlines.** |
| D3–D9 | Institutions, live slots, i18n, path routing, staff UI, analytics, handover | **Confirmed** missing or stub — schedule after A–C. |

---

## P0 / P1 / P2 findings

Effort: **S** ≤0.5d · **M** 1–3d · **L** ≥1w.

### P0 — fix before / during Congress week (free-plan survival + trust)

| # | Finding | File / line (approx.) | Impact | Fix | Effort |
|---|---------|----------------------|--------|-----|--------|
| P0-1 | Hard-coded intake close + key dates | `shared/productConfig.js` 8–20 | Form can auto-close; countdown/copy violates “no deadlines” | Empty optional dates; form open when unset; copy = “Dates will be announced by the WAC Secretariat” | M |
| P0-2 | Ticket entropy too low (`Math.random` + time) | `src/App.jsx` 629–630 | Track IDs guessable → answer leak | Server-issued tickets ≥40 bits (`crypto.randomBytes`); rate-limit lookup | M |
| P0-3 | Full / large staff loads | `staffSnapshot`, `listQuestions`, page default 250 | Spark 50k reads/day exhaustion = hard outage | Cap pages 25–50; kill snapshot on prod; aggregate counters; Insights cache 30–60s; Quota meter + lite mode | L |
| P0-4 | Service token = unrestricted admin | `server/staffAuth.js` 146–148, 638–639 | Stolen token = full compromise | Scoped allow-list ops; rate limit; optional IP allow; audit every use; **rotate token** | M |
| P0-5 | ADMIN_PIN accepts &lt;12 chars | `staffAuth.js` 129–131, 140 | Weak gate | Fail closed if &lt;12 at boot; remove “short is OK” path | S |
| P0-6 | Daily-only AI worker cron | `vercel.json` 71–73 | Queue stalls hours | External sweeper (GHA 5–10 min) + submit/staff opportunistic kick; daily cron = retention/health only | M |
| P0-7 | Wrong venue on Events | `src/data/events.js`, `EventsPage.jsx` | Public misinformation | Single venue config = Janata Maidan | S |
| P0-8 | Age/Sex required; phones on delegates | `register.js` 71–78; `staffData.js` 60–67; WAC panel | DPDP over-collection | “I am 18+”; drop sex; mask phones; migration proposal (no destructive delete without OK) | M |
| P0-9 | Student mentor attribution optional | `AiReviewDesk.jsx` 268–269; `TrackAnswer.jsx` 106–119 | Weak trust / generic desk name | Require reviewer display name on approve; student letter “Reviewed and approved by &lt;name&gt;”; **never** student-visible “AI” | S |
| P0-10 | No HSTS / staff robots | `vercel.json`, `public/robots.txt` | Crawl/MITM surface | HSTS; Disallow `/staff*`, `/account`; noindex staff shells | S |

### P1 — soon after P0

| # | Finding | Impact | Fix | Effort |
|---|---------|--------|-----|--------|
| P1-1 | No step-up OTP on destructive ops | Import/config abuse if session stolen | Fresh OTP ≤10 min for listed ops | M |
| P1-2 | Trusted device TTL 180d | Long-lived staff cookies | Cap 7–14d absolute; revoke on role change | M |
| P1-3 | Roles too coarse | Wrong people publish / see contacts | Add publication approver, curator, coordinator; deny-by-default matrix + test | L |
| P1-4 | Spend cap not atomic | Concurrent jobs can overspend | Reserve/settle counters; 80% alert | M |
| P1-5 | Status / count inconsistency | Staff distrust Insights | One status enum + transactional transitions + tests | L |
| P1-6 | Weak cluster merges | Bad composites | Min similarity; flag; split tool | M |
| P1-7 | Turnstile / shared rate limits | OTP/ask abuse | Turnstile + Redis/Firestore rate docs | M |
| P1-8 | Privacy config + backup drill | Legal / longevity | Placeholders + encrypted GHA export + emulator restore drill | L |
| P1-9 | 10-track single source of truth | Drift tracks.js ↔ personas ↔ copy | One config; aliases; fix HIW “T1–T9” | M |

### P2 — post-Congress / longevity

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| P2-1 | Live slots engine | Staff-only desk + Track Action card | L |
| P2-2 | Institutions canonical + merge | Collection + aliases | L |
| P2-3 | Path routing + SEO + i18n (EN/HI/OR) | Rewrites + prerender + fonts | L |
| P2-4 | Faculty streams + KB license review | Legal + UX | L |
| P2-5 | PLAN_MODE=paid PITR docs | When funded | S |
| P2-6 | Handover / ownership doc | WAF accounts | M |

---

## Op-by-op auth matrix (current)

Gates today: **Pub** = unauthenticated · **Sess** = delegate session · **Staff** = approved admin/co-admin cookie · **Admin** = admin or service token · **Rev** = review-only cookie · **Svc** = Bearer `STAFF_SERVICE_TOKEN` (acts as Admin).  
**Step-up:** none implemented.  
**Audit:** subset via `AUDITED_OPS` / staff decisions / review.redeem / exports.

| Op | Gate | Step-up | Audited | Notes |
|----|------|---------|---------|-------|
| `ping`, `whoami`, `staffMe`, `publicStats`, `visitSource` | Pub | — | no | |
| `lookup` | Pub (ticket) / Sess (email) | — | no | Ticket is secret — strengthen |
| `get` clusters public slice | Pub | — | no | Published only |
| `podcastsList`, `wacResultsGet` | Pub | — | no | Results if published |
| `regStart/Resend/Verify/Me/Recover`, WAC sign-in | Pub/Sess | — | partial | OTP limited |
| `set` new `aym:q:*` | Sess | — | no | Ask submit |
| `accountGet`, `accountWacShare` | Sess | — | no | |
| `staffStart`, `staffVerify` | Pub | — | yes (fail paths) | Passcode+OTP |
| `logout` / `staffLogout` | Staff/Rev | — | yes | |
| `staffSessions`, `staffSessionRevoke` | Staff | — | yes | Co-admin: self only |
| `staffSessionRevokeAll` | Staff/Admin rules | — | yes | |
| `staffRequests`, `staffDecide`, `staffAudit` | Admin | — | yes | |
| `staffRetentionGet/Set`, `staffCleanup` | Admin | — | yes | Need step-up |
| `staffReviewInviteCreate` | Admin | — | yes | Need step-up |
| `staffReviewInviteRedeem` | Pub (token) | — | yes | success + refused |
| `staffAuditExport` | Staff | — | yes | |
| `staffCounts/Clusters/QuestionsPage/DelegatesPage` | Staff/Rev | — | no | Prefer these over snapshot |
| `staffSnapshot` | Staff | — | no | **Hotspot — deprecate** |
| `list`, `stats`, `get` (full) | Staff | — | no | |
| `answerIndividual`, `clustersSave/Merge` | Staff | — | partial | |
| `aiQueue`, `aiIndex`, `aiStats`, `aiConfigGet`, `aiRunNow`, `aiProviderTest`, `aiRetry*` | Staff | — | no | |
| `aiApprove/EditApprove/Reject/SendToMentor/Regenerate`, `aiRefile`, `aiAskRephrase` | Staff | — | partial | Need publication approver for bank |
| `aiConfigSet`, `aiBackfill`, `aiCompareBackfill` | Admin | — | partial | Need step-up |
| `wacDelegatesImport/Clear`, `wacAutoLinkAll` | Admin | — | yes | Need step-up + diff |
| `wacDelegatesStats`, results save/publish/mail | Staff/Admin mix | — | partial | |
| `faculty*` | Staff; import Admin | — | partial | |
| `del`, `testProbe*` | Admin | — | yes | |
| `/api/ai-worker` | `CRON_SECRET` or staff kick | — | no | |

**Gap:** No single deny-by-default table tested in CI. Ops not in `STAFF_ONLY_OPS` / `ADMIN_ONLY_OPS` can be mishandled. **P1:** generate matrix from code + fail test if op lacks explicit rule.

---

## Firestore reads/writes estimate (free Spark)

Daily budget (order of magnitude): **50k reads · 20k writes · 20k deletes · 1 GiB storage · 10 GiB egress/mo**. Exhaustion = hard outage until reset.

| Screen / action | Est. reads | Est. writes | Notes |
|-----------------|------------|-------------|-------|
| Home / public pages (CDN) | 0–2 | 0 | Prefer CDN; `publicStats` ~30s cache |
| Ask submit (signed-in) | 5–15 | 3–8 | Question + indexes + mail queue + optional AI job |
| Track lookup (1 ticket) | 1–5 | 0 | Must stay O(1); rate-limit |
| Staff desk open (`staffCounts`+clusters+1 page) | 5–40 | 0 | OK if page ≤50 |
| Staff desk via `staffSnapshot` / full list | **500–5,000+** | 0 | **P0 hotspot** |
| Insights refresh uncached | 100–2,000 | 0 | Cache 30–60s |
| DISHA draft 1 question | 20–100 | 5–20 | Jobs/drafts/usage + KB retrieval |
| WAC delegates import 2,107 rows | 2k–10k | 2k–5k | Admin only; off-peak |
| AI worker sweep (N jobs) | ~10–50×N | ~5–20×N | External sweeper cadence matters |
| Retention dry-run | hundreds–thousands | 0 | |

### Load sketch: ~2,000 student-active day

Assume 2,000 Track lookups × 3 retries ≈ 6k reads; 800 asks × 10 reads ≈ 8k; public stats/CDN small; **one** careless staff full snapshot of 3k questions ≈ 3k+ reads; 200 AI drafts × 40 ≈ 8k. **Total easily 25–40k reads** before abuse — **margin thin**. Top 5 hotspots to fix first: (1) `staffSnapshot`/full `listQuestions`, (2) Insights uncached scans, (3) AI backfill listing all questions, (4) delegate full export/UI, (5) multi-instance rate-limit miss → OTP/ask storms.

---

## AI pipeline notes (student trust)

| Control | Current | Target (owner) |
|---------|---------|----------------|
| Redact before OpenAI/Gemini | Yes | Keep; extend institution strings if missing |
| Kill switch `aiConfig.enabled` | Server-enforced | Keep |
| Auto-publish | No | Keep |
| Student sees “AI” | No (good) | **Keep no**; forbid future student AI badges |
| Student attribution | Optional → “mentor desk” | **Required reviewer name** |
| Privacy / DPDP | Incomplete | Third-party processing notice on Privacy page **without** telling students “an AI answered you” |

---

## Decisions needed before Phase 1

1. **Approve this Phase 0 audit** and priority order (recommend P0-1…P0-10 then A2 token rotation).
2. **Privacy contact** name/email (or confirm leave “to be confirmed”).
3. **Age/Sex migration:** drop fields going forward only vs backfill anonymise existing `age`/`sex` (destructive needs explicit OK).
4. **Delegate phones:** strip from import schema only vs purge existing phone fields (OK required).
5. **Trusted device TTL:** pick 7 vs 14 days.
6. **Publication Approver** identity (WAC Secretariat emails for `STAFF_*` list or new role env).
7. **KB licensing** OK to keep excerpt+citation model for post-Congress answer bank?
8. **Email provider** confirmation for free-tier OTP volume during Congress.
9. **Tracks copy:** confirm public UI should say “10 career tracks” (not T1–T9) everywhere.

---

## Rollback / safety (for later phases)

- Prefer feature flags (`PLAN_MODE`, AI `enabled`, lite mode) over schema drops.
- Additive fields only; no destructive migrations without written OK.
- Deploy Preview → smoke → Production; keep previous Vercel deployment for instant rollback.
- Never run retention cleanup / delegate clear against production without dry-run review.

---

## Congress-week runbook (draft — finalize in Phase C)

| Watch | Who | Alert when | Action |
|-------|-----|------------|--------|
| Firestore quota meter | Admin on duty | ≥60% / ≥80% reads | Enable lite mode; pause nonessential staff scans; delay imports |
| AI queue age | DISHA staff | Oldest job &gt;15 min | Kick sweeper; check provider credits |
| AI spend | Admin | ≥80% daily cap | Pause streams; raise cap only with step-up |
| Mail / OTP | Admin | Bounce spike / lockouts | Check provider; widen backoff |
| Backups | Admin | Last backup &gt;36h | Run GHA export; verify artifact |
| Escalation | Owner → WAC Secretariat | Outage / data incident | Disable AI; freeze imports; Privacy contact TBD |

---

## Phase gate

**STOP.** No Phase A implementation until you approve this audit (and answer Decisions 1–9 as needed).

Next after approval: Phase A starting with **P0 quota + ticket entropy + PIN fail-closed + date config empty + venue fix + service-token scope**, then token rotation reminder.
