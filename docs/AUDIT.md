# AYURDISHA Meet the Mentors — Product / Code Audit

**Repo:** `ayurmarg-preview` (Vite + React SPA, Vercel `bom1`)  
**Live:** https://ayushmarg.vercel.app  
**Audit date:** 16 Nov 2026  
**Method:** Read-only inventory of `src/`, `server/`, `api/`, `shared/`, `tests/`, `docs/`, `vercel.json`, `package.json`, Firestore/KV patterns. No secrets or env **values** recorded.

Sibling trees `AYURDISHA-source-for-WAC*` under `heybee/` are older zip extracts; **this repo is the deployed app.**

---

## 1. Routes / pages inventory

### React Router (`src/App.jsx`)

| Path | Component / behaviour |
|------|------------------------|
| `/welcome` | `WelcomePage` — orientation deck |
| `/` | Home + hash tabs (`#intro` `#hall` `#ask` `#register` `#track` `#board` `#staff` `#curate` `#insights` `#pack` `#ai` `#podcast` `#account` `#pods` `#exchange` …) |
| `/ask` | Redirect → `/#ask` |
| `/track-answer` | Redirect → `/#track` |
| `/account` | `AccountPage` |
| `/about` | `AboutPage` (new) / legacy `LegalPages` about |
| `/how-it-works` | `HowItWorksPage` |
| `/mentors` | `MentorsPage` → `MentorsDirectory` |
| `/mentors/:slug` | `MentorDetailPage` |
| `/programs`, `/programs/:slug` | Career programs |
| `/events`, `/events/:slug` | Events |
| `/resources`, `/resources/:slug` | Resources + FAQ anchor |
| `/contact` | `ContactPage` |
| `/careers` | Redirect → `/programs` |
| `/staff`, `/staff/*` | Redirects into hash staff desks |
| `/privacy`, `/terms`, `/disclaimer` | Legal routes |
| `*` | `NotFoundPage` |

### Vercel SPA rewrites

Catch-all to `index.html` except `api/`, assets, `robots.txt`, `sitemap.xml`, favicon. Explicit rewrites for mentors/about/privacy/terms/disclaimer.

### Hash “app tabs” (still primary UX for Ask / Track / Staff)

`intro`, `hall`, `mentors`, `register`, `ask`, `pods`, `exchange`, `track`, `board`, `staff`, `curate`, `insights`, `pack`, `ai`, `podcast`, `account`.

---

## 2. Key components

| Area | Files |
|------|--------|
| Shell / nav | `AppHeader.jsx`, `SiteFooter.jsx`, `main.jsx`, `AskDeskFab.jsx` |
| Home | `pages/HomePage.jsx`, `pages/home/HomeHero.jsx`, `HomeAskDesk.jsx`, `HomeHowItWorks.jsx`, `HomeMentors.jsx`, … |
| Ask Desk | Large `AskView` in `App.jsx`; `AskTriageHint.jsx`, `content/askPrompts.js`, `askSubmitError.js`, `askLink.js` |
| Track | `TrackAnswer.jsx` |
| Mentors | `MentorsDirectory.jsx`, `MentorCard.jsx`, `MentorProfile.jsx`, `mentors.js`, `mentorDomains.js` |
| How it works | `pages/HowItWorksPage.jsx`, `content/howItWorks.js` |
| Legal / about | `LegalPages.jsx`, `pages/LegalPage.jsx`, `pages/AboutPage.jsx` |
| Staff | `StaffWorkspace.jsx`, `staff/StaffAccess.jsx`, `AiReviewDesk.jsx`, `TriagePanel.jsx`, `FacultyBankPanel.jsx`, `WacDelegatesPanel.jsx` |
| WAC | `components/WacSignIn.jsx`, `WacKnowledge.jsx` |
| SEO | `siteMeta.js`, `index.html`, `scripts/write-sitemap.js` |
| Misnamed “ActionCard” | `ActionCard.jsx` = **staff tool tile**, not student shareable Action Card |
| Branding constants | `content/site.js` (`WAC`, `SITE_TAGLINE`), `siteMeta.js` (`SITE_NAME = AYURDISHA`) |

---

## 3. Data models / store keys / tables

### KV / Firestore prefixes (`server/store.js`, `docs/DATA-STORAGE.md`)

| Key / collection | Purpose |
|------------------|---------|
| `aym:q:*` → `questions/{id}` | Ask Desk questions (+ `emailLower`, `ticketLower`) |
| `aym:clusters` (+ meta version) | Merged answer groups / theme stage |
| `aym:config` | Public-ish config blob |
| `aym:wac-results` | Selection list publish |
| `aym:podcasts` | Hall recordings |
| `aym:user:*`, `aym:email:*`, `aym:regno:*` | Delegate profiles / indexes |
| `aym:sess:*` | Delegate sessions |
| `aym:otp:*`, `aym:wacrate:*` | OTP / WAC rate records |
| `aym:mail:*` | Queued outbound mail |
| `aym:meta:public-stats`, visit-source shards | Public counters |
| Staff: `staff_sessions`, `staff_audit`, members, attempts | Staff auth + audit |
| `wac_delegates` | Uploaded Congress delegate list |
| AI: `ai_jobs`, `ai_drafts`, `ai_answer_bank`, `ai_config`, KB chunks | Draft pipeline (staff-gated publish) |
| Faculty bank | Faculty Q&A streams |

### Ask record shape (`shared/askOptions.js` + submit)

`id`, `ticket`, `name`, `email`, `mobile`, `state`, `institution`, `stage`, `registered`, `regNo` / `delegateNo`, `wacId`, `inPerson`, `days[]`, `theme`, `subtheme`, `question`, `context`, `outcome`, `consentFollow`, `consentPublish`, `anonId`, `createdAt`, `source`, plus staff/AI fields (`individualAnswer`, `aiDraft`, flags, etc.).

### Scheduling / Job Fair tables

**Not present** as first-class collections or roles. Live selection today is WAC results upload + “in person” ask fields — not huddle/1:1/walk-in capacity engines.

---

## 4. API routes

### `POST /api/aym-store` (`api/aym-store.js` → `server/storePlugin.js`)

Public (examples): `ping`, `whoami`, `publicStats`, `lookup` (ticket; email if session matches), `get` public clusters slice, `podcastsList`, `wacResultsGet` (if published), registration (`regStart`/`regResend`/`regVerify`/`regMe`/`regRecover`), WAC sign-in ops, `visitSource`, `accountGet` / `accountWacShare`, `set` **new** `aym:q:*` only when signed-in delegate.

Staff (`aym_staff` cookie or service token): `staffSnapshot`, paged staff data, `list`/`stats`/`get` full, `clustersSave`/`clustersMerge`, `answerIndividual`, WAC delegates import, AI ops, faculty ops, retention, audit, podcasts save, WAC results save/publish/mail, etc.

Admin-only subset: retention set, co-admin decide, session revoke-all, some imports/clears (`ADMIN_ONLY_OPS` in `staffAuth.js`).

### `POST/GET /api/ai-worker`

Cron (`CRON_SECRET`) + staff kick: retention sweep then AI queue. Throttled.

### `POST /api/knowledge-chat`

Grounded journal search; IP rate limit in `knowledgeChat.js`.

---

## 5. Auth / admin / staff flow

1. **Delegates:** email OTP → HttpOnly session cookie; optional WAC ID sign-in (`WAC_VERIFY_MODE`).
2. **Staff:** `ADMIN_PIN` only starts flow (legacy `login` → 410). Passcode + email OTP → pending **co-admin** until admin approves; `STAFF_ADMIN_EMAILS` auto-approved as **admin**. Service: `STAFF_SERVICE_TOKEN` / `AYM_SERVICE_TOKEN` Bearer.
3. **Roles today:** `admin` | `co-admin` | `service`. **No** distinct track-curator or appointment-coordinator roles.
4. Cookie: signed HttpOnly `aym_staff`. Spec: `docs/security/STAFF-ACCESS-SPEC.md`.

---

## 6. Env var **NAMES** only (no values)

From `.env.example` + server usage:

| Name | Role |
|------|------|
| `ADMIN_PIN` | Staff passcode gate |
| `STAFF_ADMIN_EMAILS` | Auto-approved admin emails |
| `STAFF_SERVICE_TOKEN` / `AYM_SERVICE_TOKEN` | Script/admin bearer |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mail fallback |
| `RESEND_API_KEY`, `MAIL_PROVIDER`, `MAIL_FROM` | Primary mail |
| `OTP_COOKIE_SECRET` | OTP + staff session signing |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firestore Admin |
| `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS` | Alt Firebase creds |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob fallback store |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_DRAFT_MODEL`, `OPENAI_DRAFT_TIMEOUT_MS` | AI |
| `WAC_VERIFY_MODE`, `WAC_VERIFY_URL`, `WAC_VERIFY_KEY`, `WAC_ID_PATTERN`, `WAC_SIGNIN` | WAC verify |
| `CRON_SECRET` | ai-worker / retention cron |
| `AYM_DEMO_OPS`, `AYM_AI_NO_KICK`, `AYM_STAFF_DELAY_MS`, `AYM_STORE`, `AYM_STORE_FILE`, `AYM_MAIL` | Dev/ops toggles |
| `VERCEL` | Platform flag (Secure cookies) |

**No `VITE_*` secrets by design** (`.env.example` warns against them). Client talks only to same-origin `/api/*`.

---

## 7. Gaps vs PRODUCT SPEC (ranked)

Legend: **EXISTS** / **PARTIAL** / **MISSING**

### Flow: Ask → Tag → Cluster → Spotlight → Answer → Meet → Act

| Step | Status | Notes |
|------|--------|-------|
| Ask | **EXISTS** | Ask Desk + register gate + ticket |
| Tag | **PARTIAL** | Manual theme/subtheme; AI triage assists; **10** themes not **9** tracks |
| Cluster | **EXISTS** | Staff merge + AI grouping hooks |
| Spotlight | **PARTIAL** | Theme stage / board + mentor spotlight card; not “9 theme spotlights” product ladder |
| Answer | **PARTIAL** | Written answers + clusters + AI bank (approve-gated). Copy still implies personal mentor letter |
| Meet | **PARTIAL** | In-person flags + WAC selection list; no huddle/1:1 capacity engine |
| Act | **MISSING** | No student Action Card (image/PDF/WhatsApp). `ActionCard.jsx` is unrelated staff UI |

### Core product rules

| Spec item | Status | Gap |
|-----------|--------|-----|
| ONE focused question | **EXISTS** | Char counter, min 25, hints |
| 9 tracks T1–T9 (Clinical; Academia; Research; Entrepreneurship; Industry/Quality; Export/Trade; Public Health/Policy; Tech/AI/Digital; Medicinal Plants/Sustainability/TK) | **PARTIAL** | App has **10** themes T01–T10 including Brand Building, Practice Abroad, MVT; missing explicit Tech/AI and Medicinal Plants tracks |
| Anyone may submit | **EXISTS** | After email verify + pass |
| Only verified Congress in-person get live slots | **PARTIAL** | Copy + form fields; no hard eligibility/capacity system |
| Promise: written/recorded via clusters/answer bank — **not** personal mentor guarantee | **PARTIAL / P0 copy** | Meta + How-it-works + Ask lead still say “a mentor answers/replies in writing” |
| Service ladder (spotlights, ~100 bank, huddles 4–6/35m/max36, 1:1 15m/2 pods/max54, walk-in triage) | **MISSING** | Document + stub later |
| One live slot/student; ≤10% institution; 80/20 pre-book/draw | **MISSING** | |
| Automation never decides access; curator + coordinator | **PARTIAL** | AI never auto-publishes (good); roles not split curator/coordinator |
| Four unticked consent checkboxes (anon pub, named display, recording, follow-up) | **MISSING / P0** | Only follow-up **select**; `consentPublish` **hardcoded `"Yes"`** on submit |
| Never public without consent / unresolved safety flag | **PARTIAL** | Publish is staff-gated; consent model incomplete; safety flags on AI triage, not full public-gate model |
| Contact review/delete 90 days post-Congress | **PARTIAL / P0 policy** | Retention cron exists but **explicitly never deletes** questions/delegates |
| No patient IDs / confidential business / unpublished research; warning + **flag** detector | **PARTIAL** | Warning on question field; medical detector for AI; no dedicated ask-submit safetyFlag for curator + PII patterns beyond medical |
| Action Card shareable image/PDF + WhatsApp | **MISSING** | |
| Job Fair separate tables/roles | **MISSING** | Stub in audit/docs only — do not fake |
| Configurable key dates + intake closed UX | **MISSING / P0** | Dates hardcoded in `content/site.js` / Ask `CORE_DAYS`; no close gate |
| Brand AYURDISHA everywhere | **EXISTS** | Minor legacy “AyushMarg” alternateName in JSON-LD only |
| Meta without personal-mentor promise | **MISSING / P0** | `index.html`, `siteMeta.js`, glossary, Home meta |
| Autosave draft | **PARTIAL** | Register round-trip draft + submit idempotency; no localStorage autosave while typing |
| Double-submit guard | **EXISTS** | `submitting` ref + server duplicate ticket |
| Rate limit on ask/register | **PARTIAL** | OTP/IP limits strong; **no** dedicated ask-submit IP/user rate limit |
| Confirmation + reference ID status page without PII | **PARTIAL** | Ticket confirmation shows question text (OK); no dedicated `/status/:ticket` page |
| Answer bank public page (approved only) | **PARTIAL** | Theme stage / clusters public slice; no dedicated Answer Bank browse page |
| Mentor directory filter by track | **PARTIAL** | Filters 4 “fields”, not 9 tracks |
| How it works 7-step | **PARTIAL** | 3 public steps + journey 5; not Ask→…→Act seven |
| FAQ / Privacy / Contact | **EXISTS** | FAQ on How-it-works + Resources |
| Accessibility page | **MISSING** | |
| JSON-LD Event / sitemap / robots | **EXISTS** | Refine copy only |
| CSP / security headers | **EXISTS** | `vercel.json` |
| Mobile ≤640 Ask CTA | **EXISTS** | Polished; do not regress desktop |
| Job Fair | **MISSING** | P1/P2 stub |

---

## 8. Prioritised change list

### P0 (implement first — refine, don’t rewrite)

1. **Promise / meta / sitewide copy** — Replace personal-mentor guarantee language with written/recorded answer via answer bank / clustered composites; keep “mentor-informed” honesty where accurate.
2. **Brand / SEO** — Keep AYURDISHA; fix meta description, OG, `websiteJsonLd`, glossary `SITE_DESCRIPTION`, Home/How-it-works/Ask leads; no invented bios.
3. **Ask consent** — Four separate **unticked checkboxes** (anonymous publication, named display, recording, follow-up). Stop hardcoding `consentPublish: "Yes"`. Persist all four fields (additive schema).
4. **Ask form polish** — Character counters (done); strengthen one-question hint + examples; PII/patient/confidential warning; client+server **flag** detector (never block); localStorage autosave; ask submit rate limit; confirmation stays ticket-centric.
5. **Tracks toward T1–T9** — Additive mapping: introduce canonical 9-track model + map legacy 10 themes → tracks without destructive migration; “Not sure” retained.
6. **Configurable key dates** — Single config module (intake close 25 Nov 2026; mentor briefs 1 Dec; roster 5 Dec; Congress 10–13 Dec; answer bank by 31 Dec). Intake-closed UX: friendly closed + browse answer bank / theme stage.
7. **Public ask/register security pass** — Confirm authz (already strong), sanitise (normalizeAskRecord), add ask rate limit, ensure no secrets in client (already), leave CSP.

### P1 (after / parallel if independent)

1. Public **Answer Bank** page (approved clusters / bank only).
2. Mentor directory filters aligned to tracks.
3. How-it-works **7-step** alignment (Ask→Tag→Cluster→Spotlight→Answer→Meet→Act).
4. Accessibility page; refine FAQ/Privacy/Contact.
5. Admin consent/flag dashboards if hooks exist; curator safety queue.
6. Student **Action Card** export (next step → image/PDF + WhatsApp share) — new feature, not `ActionCard.jsx`.
7. Countdown / key-dates banner.
8. **Job Fair:** document separation; stub empty namespace/roles — no mentoring data access; no fake fair UI.

### P2

1. Full scheduling ladder + capacity + institution caps + 80/20 draw.
2. Distinct curator / appointment-coordinator roles.
3. Recorded-answer media pipeline.
4. Automated 90-day **contact** delete/anonymise job (needs product decision — currently retention preserves questions).
5. Dedicated status URL without recap PII options.

---

## 9. Security / DPDP snapshot (honest)

| Control | Status |
|---------|--------|
| Firestore rules deny client | **EXISTS** |
| Staff HttpOnly + role gate | **EXISTS** |
| OTP rate limits | **EXISTS** |
| Ask requires session + issued pass | **EXISTS** |
| AI never auto-publishes | **EXISTS** |
| Ask IP rate limit | **MISSING** → P0 |
| Consent defaults off | **MISSING** → P0 |
| 90-day contact erasure | **MISSING** (needs decision) |
| Secrets out of client | **EXISTS** |
| CSP + security headers | **EXISTS** |

**Destructive migrations:** none proposed. Track remaps and consent fields must be **additive**. Ask before any schema drop.

---

## 10. Implementation order (this loop)

1. Write this `docs/AUDIT.md` (done).
2. P0 commits: copy/meta → dates config → tracks map → ask consent/flags/autosave/rate-limit → security nits → intake-closed UX.
3. P1 as time allows: answer bank page stub, HIW 7-step, accessibility, Action Card v1, Job Fair stub doc.
4. Single `npx vercel --prod --yes` at end.

---

## Needs decision (do not implement destructively without OK)

1. **Migrate stored questions** from 10 themes → 9 tracks: additive dual-write vs one-time remap job?
2. **90-day post-Congress contact delete:** anonymise vs hard-delete delegates/questions; confirm legal owner.
3. **Recording consent** before any hall AV exists — store flag only?
4. **Job Fair** scope for Dec 2026 — separate app vs same host path stub?
5. Whether **public Answer Bank** may show composites that lack anonymous-publication consent (spec says never without consent).

---

## 11. Post-ship status (16 Nov 2026)

Explore audits of frontend/backend completed after the refine loop and confirm the **pre-ship** gaps in §7. The following were then shipped to production (`https://ayushmarg.vercel.app`, deploy `dpl_6vUMmVjxkkYCX51js4q2tdz5tmgZ`):

| Former P0 / P1 gap | Now |
|--------------------|-----|
| Personal-mentor promise in meta/copy | **Shipped** — `META_DESCRIPTION` / Ask / HIW / Home copy |
| Four unticked consents | **Shipped** — Ask checkboxes; no hardcoded publish Yes |
| T1–T9 tracks (+ legacy map) | **Shipped** — `shared/tracks.js`; dual-write `track`/`trackCode` |
| Key dates + intake-closed UX | **Shipped** — `shared/productConfig.js`; Ask + server gate |
| Ask rate limit + safety flags | **Shipped** — IP/user limiters; `safetyFlags` on submit |
| Autosave draft | **Shipped** — `localStorage` ask draft |
| HIW 7-step Ask→Act | **Shipped** — `/how-it-works` |
| Public answer bank page | **Shipped** — `/answers` (approved slice) |
| Accessibility page | **Shipped** — `/accessibility` |
| Job Fair separation | **Stub only** — `docs/JOB-FAIR.md` |

**Still open (unchanged):** full live-slot ladder / 80–20 / institution caps; curator vs coordinator roles; student Action Card image/PDF/WhatsApp; mentor directory filter by T1–T9; destructive 90-day PII erase (needs decision § above).
