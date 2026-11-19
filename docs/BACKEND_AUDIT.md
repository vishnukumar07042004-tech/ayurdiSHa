# AYURDISHA — Backend / Security / Ops Audit (Phase 0)

**Date:** 19 Nov 2026 (IST)  
**Scope:** Read-only. No production data changes. No secrets printed.  
**Live:** https://ayushmarg.vercel.app (Vercel `bom1`, Hobby)  
**Stack:** Vite + React SPA; `/api/aym-store`, `/api/ai-worker`; Firestore Admin SDK (Spark); DISHA = GPT draft + Gemini verify (staff pilot).

**Method:** Docs (`AUDIT.md`, `AI-ANSWER-PIPELINE.md`, `STAFF-ACCESS-SPEC.md`, `STAFF-REVIEW-LINK.md`, `DATA-STORAGE.md`, `LOAD-READINESS.md`, `BACKUPS.md`) + code in `server/`, `shared/`, `api/`, `vercel.json`, `src/`. Deep-dive supplements: [Audit auth and ops matrix](07f033e6-84e7-42a8-bbec-c4b020624474), [Audit quota and public abuse](954745af-c3ca-42d6-bfc2-cec7ebb7adcc). (AI-pipeline deep-dive agent was blocked by provider policy; B-section relies on direct code review.)

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

The app already has strong foundations: Firestore deny-all client rules, staff passcode+OTP+roles (admin/co-admin/review), AI never auto-publishes, PII redaction before model calls, paged staff data ops, spend-cap checks, daily cron. Congress-week risk on the **free plan** is dominated by **Firestore write exhaustion on ~2,000 registrations alone (~16–20k writes → Spark 20k/day)**, **weak ticket entropy + no Track lookup rate limit**, **hard-coded intake close**, **service token = full admin**, **no step-up OTP**, and **role model too coarse** for publication approval. Docs (`LOAD-READINESS.md`) already call for **Blaze** before open — **Needs decision** vs staying on Spark with lite mode.

**Do not start Phase A until this audit is approved.**

---

## Checklist vs requested items

### Phase A — Security & quota

| ID | Item | Status | Notes |
|----|------|--------|-------|
| A1 | Quota safety (no full lists, cache, meter, lite mode) | **Confirmed** (partial) | Public paths OK (no list-all; CDN `publicClusters`/`publicStats`). Staff desk **paged** (default **250** — still high). Legacy `staffSnapshot` fallback remains. No Quota meter / lite mode. **~2k regs alone can exhaust Spark writes.** |
| A2 | `STAFF_SERVICE_TOKEN` scoped + rotate | **Confirmed** / **Needs decision** | One acceptance path in `resolveStaff` (aym-store + ai-worker staff path). Length ≥32, SHA-256 + timing-safe compare. **Full admin**, not scoped/rate-limited/IP-bound; reads not audited. **Rotate after scoping.** |
| A3 | `ADMIN_PIN` ≥12 fail-closed | **Confirmed** / **Needs decision** | Effective min **≥4**; weak banner if &lt;12. Lockout 5 fails / 15 min; OTP 6 digits, 10 min, ≤5 tries. |
| A4 | Step-up OTP + trusted device 7–14d | **Confirmed** / **Needs decision** | Spec: step-up **not enabled**. Trusted idle **90 days** (not 7–14). Sign-out-all + epoch bump on revoke = server-side OK. |
| A5 | Fine-grained roles + deny-by-default matrix test | **Confirmed** | Only admin / co-admin / review / service. Missing curator, coordinator, mentor, **publication approver**. Opt-in staff sets — new handler can forget the set. |
| A6 | Review links + refused redeem alert | **Not an issue** (alerts open) | Single-use, hashed, TTL, read-only, cookie exchange; URL cleared via `navigate(..., { replace: true })`. Refused redeems audited (`ok: false` + reason). **No automated alert.** Live 17 Nov entry = store lookup later. |
| A7 | Crawling / security headers | **Partial** | CSP / XFO / Referrer / Permissions in `vercel.json`. **No HSTS** in app config. Staff/account meta `noindex` in UI; `robots.txt` missing `/staff*` `/account` Disallow. |
| A8 | Public abuse (Turnstile, shared RL) | **Confirmed** | **No CAPTCHA.** OTP email limits shared in Firestore; OTP/ask IP limits mostly **in-memory** (multi-instance weak). |
| A9 | Track ticket = bearer secret | **Confirmed** | Weak entropy (`App.jsx` 629–630). Lookup returns no name/email (**OK**) but **no rate limit** on `lookup`. |
| A10 | PII mask; remove Age/Sex; no delegate phones | **Confirmed** | Age/sex required at register; on staff cards. Insights can hide contacts; **Mentor Pack Excel always exports Name/Email**. Phones from WAC often masked in API. |
| A11 | Delegate import + verify tool + relink | **Needs decision** | Admin-only, ≤2000 rows, schema-validated, audited. **No** step-up, WAC diff preview, Verify/Add tool, or formula-injection hardening found. Link-conflict 409 exists. |

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
| C1 | CI + Playwright all routes + ShieldCheck fix | **Confirmed** gap — **no** `.github/workflows`; local `npm test` only. Full route smoke incomplete. |
| C2 | Four consents + retention erase | **Partial** — four consents shipped earlier; retention job exists but **does not** hard-delete questions/delegates without decision. |
| C3 | Privacy config (owner/approver/contact TBC) | **Confirmed** — placeholders needed; region + DPDP/GDPR notice. |
| C4 | Encrypted nightly backup (GHA) | **Confirmed** — docs exist; automated encrypted export not production-proven on free plan. |
| C5 | Mentor Pack Excel + podcast URL allow-list | **Confirmed** — workbook always includes Name/Email today (`shared/mentorWorkbook.js`); need PII-off default + formula-injection prefix. |
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

Gates: **Pub** · **Sess** (delegate) · **Staff** (admin/co-admin) · **Admin** (admin or service Bearer) · **Rev** (review-only).  
**Step-up:** none. **Service token ≡ admin.** Unknown op → 400.

### Public / delegate / auth

| Op | Gate | Audited | Notes |
|----|------|---------|-------|
| `ping`, `whoami`, `staffMe`, `publicStats`, `visitSource`, `podcastsList` | Pub | no | |
| `lookup` | Pub ticket; email needs Sess match or Staff | no | No RL; empty hits if unauthorized |
| `get` | Pub for config + published clusters; else Staff/Rev | no | |
| `wacResultsGet` | Pub (filtered if non-staff) | no | |
| `set` new `aym:q:*` | Sess + intake + RL | no | |
| `reg*`, `account*`, `wacConfig/Start/Verify/Me/Confirm` | Pub/Sess | no | OTP / WAC limits |
| `login` | Pub | no | **410** |
| `staffStart`, `staffVerify` | Pub | yes | passcode + OTP |
| `staffReviewRedeem` | Pub | yes | success + refused |
| `logout` / `staffLogout` | anyone | yes | |

### Staff (co-admin+); review read-only where noted

| Op | Gate | Audited | Notes |
|----|------|---------|-------|
| `staffCounts/Clusters/QuestionsPage/DelegatesPage`, `staffSnapshot`, `regUsers`, `list`, `stats`, `visitSourcesGet`, `mailHealth` | Staff/Rev | no | **PII** on pages/snapshot |
| `aiQueue/Index/ConfigGet/Stats/CompareStats` | Staff/Rev | no | |
| `aiApprove/EditApprove/Reject/SendToMentor/Regenerate`, `aiRefile`, `aiAskRephrase` | Staff | yes | No publication-approver split |
| `aiRunNow`, `aiRetryFailed/Deferred` | Staff | partial | |
| `aiProviderTest` | Staff | no | |
| `answerIndividual`, `clustersSave/Merge`, `podcastsSave` | Staff | yes | |
| `wacResultsSave/Publish/Mail` | Staff | yes | Co-admin can publish |
| `wacDelegatesStats`, `facultyStreams/List/Preview/Review/Export/MatchTest` | Staff | partial | |
| `staffAuditExport`, `staffSessions`, `staffSessionRevoke(_All)` | Staff | yes (revokes) | Co-admin: self devices |
| `mailRetry` | Staff | yes | |
| `set` non-Q (clusters etc.) | Staff | yes | Co-admin: Q+clusters only |

### Admin / service only (`ADMIN_ONLY_OPS`)

| Op | Audited | Needs step-up (Phase A) |
|----|---------|-------------------------|
| `aiConfigSet`, `aiBackfill`, `aiCompareBackfill` | yes | yes |
| `wacDelegatesImport/Clear`, `wacAutoLinkAll` | yes | yes (+ diff) |
| `facultyImport`, `del`, `testProbe*` | yes | yes |
| `staffRequests`, `staffDecide`, `staffAudit` | decide yes | decide yes |
| `staffRetentionGet/Set`, `staffCleanup` | set/cleanup yes | yes |
| `staffReviewInviteCreate` | yes | yes |

**Not routed:** `mailQueue` (defined, unused on this handler).

**Gap:** No CI test that every op has an explicit allow/deny rule. **P1.**

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

**Writes:** ~2,000 registrations × ~8–10 writes ≈ **16–20k writes** → **Spark daily write quota exhausted before asks/staff/OTP/mail.**  
**Reads:** Track lookups + staff pages (250/page × ~2k Q ≈ ~2k reads per full desk load) + AI drafts + any `lookup` abuse (uncapped). Margin thin even before abuse.

Top 5 hotspots: (1) registration write volume / Spark vs Blaze, (2) staff page size 250 + `staffSnapshot`, (3) uncapped Track `lookup`, (4) AI backfill `listQuestions`, (5) in-memory-only IP rate limits under multi-instance.

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

## Owner answers (19 Nov 2026) — Phase A unlocked

| # | Topic | Decision |
|---|--------|----------|
| 1 | Phase 0 audit | **Approved** — proceed Phase A |
| 2 | Privacy contact | **Leave for now** (TBC placeholder) |
| 3–4 | Age / Sex / phone | **No change** — keep registration + delegate phone behaviour as today |
| 5 | Trusted-device TTL | **Leave for now** |
| 6 | Fine-grained roles / Publication Approver | **Leave** — owner will provide roles later |
| 7 | KB licensing (excerpt + citation) | **Yes for now**; paid/licensed path when funded |
| 8 | Email / deliverability section | **Leave as earlier** — no change this phase |
| — | Firestore plan | **Free for now**; **pay-as-you-go (Blaze) when funded** — design `PLAN_MODE=free\|paid`, do not force Blaze yet |
| — | CAPTCHA | Not decided — defer Turnstile unless needed for a P0 abuse fix |

**Phase A in-scope now:** A1 quota safety (page caps, cache, meter, lite mode), A2 scoped service token (+ rotate reminder), A3 ADMIN_PIN ≥12 fail-closed, A7 headers/robots, A9 ticket entropy + lookup rate limit, P0 dates empty + Janata Maidan venue, A6 refused-redeem alert (lightweight), A11 import hardening **without** dropping phone fields.  
**Out of scope until owner says:** age/sex/phone, trusted-device TTL, new roles, privacy contact text, email stack rewrite, CAPTCHA, forcing Blaze.

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

**Owner decisions (2026-11-19) received — Phase A unlocked.** Keep age/sex/phone; leave privacy contact, trusted-device TTL, roles, email stack; KB OK for now; Firestore free until funded (payg later).

Next: finish Phase A deploy (token rotation reminder after scoped service token ships).
