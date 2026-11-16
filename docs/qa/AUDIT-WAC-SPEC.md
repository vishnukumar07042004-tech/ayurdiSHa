# AYURDISHA / Meet the Mentors — WAC Product Spec Audit

**Repo:** `/Users/vishnukumar/AndroidStudioProjects/heybee/ayurmarg-preview`  
**Live:** https://ayushmarg.vercel.app (`/mentors`)  
**Event:** 11th WAC Bhubaneswar, 10–13 Dec 2026  
**Audit date:** 16 Nov 2026  
**Audience:** mostly mobile (phone-ux ≤640px)  
**Method:** Code inventory of `src/`, `server/`, `api/`, `shared/`, `tests/`, `docs/`, `vercel.json`, content. **No secrets or env VALUES** recorded (names only).  
**Sibling:** `docs/AUDIT.md` (same loop) — this file is the durable QA-path copy so older audits under `docs/qa/` are not overwritten.

---

## 1. Routes / pages

| Path | Component | Purpose |
|------|-----------|---------|
| `/welcome` | `WelcomePage` | First-visit orientation deck |
| `/` | `HomePage` + hash tabs | Landing + Ask/Register/Track/Staff desks |
| `/ask` | → `/#ask` | Ask Desk deep link |
| `/track-answer` | → `/#track` | Track my answer |
| `/account` | `AccountPage` | Profile / WAC share consent |
| `/about` | `AboutPage` | About |
| `/how-it-works` | `HowItWorksPage` | Public explainer + FAQ |
| `/mentors` | `MentorsPage` | Mentor directory |
| `/mentors/:slug` | `MentorDetailPage` | Mentor profile |
| `/programs`, `/programs/:slug` | Programs | Career programs |
| `/events`, `/events/:slug` | Events | Congress-adjacent events |
| `/resources`, `/resources/:slug` | Resources | Guides + FAQ anchor |
| `/contact` | `ContactPage` | Contact |
| `/careers` | → `/programs` | Alias |
| `/staff`, `/staff/*` | → hash staff tabs | Staff desks |
| `/privacy`, `/terms`, `/disclaimer` | Legal routes | Legal |
| `*` | `NotFoundPage` | 404 |

**Hash tabs:** `intro`, `hall`, `mentors`, `register`, `ask`, `pods`, `exchange`, `track`, `board`, `staff`, `curate`, `insights`, `pack`, `ai`, `podcast`, `account`.

**Vercel:** SPA rewrite to `index.html` except `api/`, assets, `robots.txt`, `sitemap.xml`. Region `bom1`. CSP + security headers in `vercel.json`.

---

## 2. Key components

| Area | Files |
|------|--------|
| Shell | `AppHeader.jsx`, `SiteFooter.jsx`, `AskDeskFab.jsx`, `phone-ux.css` |
| Home | `pages/HomePage.jsx`, `pages/home/*` |
| Ask | `AskView` in `App.jsx`, `AskTriageHint.jsx`, `content/askPrompts.js` |
| Track | `TrackAnswer.jsx` |
| Mentors | `MentorsDirectory.jsx`, `MentorCard.jsx`, `mentors.js`, portraits `/assets/mentors/portraits/` |
| How it works | `HowItWorksPage.jsx`, `content/howItWorks.js` |
| Staff | `StaffWorkspace.jsx`, `staff/StaffAccess.jsx`, `AiReviewDesk.jsx`, … |
| WAC | `components/WacSignIn.jsx` |
| SEO | `siteMeta.js`, `index.html`, `scripts/write-sitemap.js` |
| Branding | `content/site.js` (`WAC`, `SITE_TAGLINE`), `siteMeta.js` (`SITE_NAME`) |
| Misnamed | `ActionCard.jsx` = **staff tool tile**, not student shareable Action Card |

---

## 3. Data models / store keys / Firestore

| Key / collection | Purpose |
|------------------|---------|
| `aym:q:*` → `questions/{id}` | Ask Desk questions |
| `aym:clusters` | Merged answers / theme stage |
| `aym:config` | Public config (`hasPin` today) |
| `aym:wac-results` | Selection list |
| `aym:podcasts` | Hall recordings |
| `aym:user:*`, `aym:email:*`, `aym:regno:*` | Profiles / indexes |
| `aym:sess:*` | Delegate sessions |
| `aym:otp:*`, `aym:wacrate:*` | Rate / OTP records |
| `aym:mail:*` | Outbound mail queue |
| `ai_*` / faculty / KB | DISHA pipeline (staff-gated publish) |
| `wac_delegates` | Imported WAC list (no payment/address/UTR) |

**Ask record fields (normalizeAskRecord):**  
`id`, `ticket`, `name`, `email`, `mobile`, `state`, `institution`, `stage`, `registered`, `regNo`/`delegateNo`, `wacId`, `inPerson`, `days[]`, `theme`, `subtheme`, `question`, `context`, `outcome`, `consentFollow`, `consentPublish`, `anonId`, `createdAt`, `source`, + staff/AI fields.

**Track mismatch (document, do not silently drop):**  
App has **10** themes **T01–T10**. Spec wants **9** tracks T1–T9 (Clinical; Academia; Research; Entrepreneurship; Industry/Quality; Export/Trade; Public Health/Policy; Tech/AI/Digital; Medicinal Plants/Sustainability/TK). Current app includes Brand Building, Practice Abroad, MVT; lacks explicit Tech/AI and Medicinal Plants. **Needs decision** before remapping stored questions.

---

## 4. API routes / storePlugin ops

| Surface | Notes |
|---------|--------|
| `POST /api/aym-store` | Main store + auth + ask + staff |
| `GET /api/aym-store?op=publicStats` | CDN-cacheable aggregates |
| `POST /api/knowledge-chat` | Knowledge search (rate-limited, PII-redacted) |
| `POST/GET /api/ai-worker` | Cron + kick for DISHA queue |

**Public ops (no staff cookie):** `ping`, `whoami`, `publicStats`, `visitSource(s)`, `regStart/Resend/Verify/Me/Recover`, `accountGet`/`accountWacShare`, WAC sign-in ops, `set` (own question only), `lookup` (ticket public; email needs matching session), `get` config/public clusters, `podcastsList`, published `wacResultsGet`.

**Staff-gated:** snapshots, list/stats, cluster edit/merge, AI ops, WAC import, retention, sessions, etc.

**Rate limits today:** OTP/IP strong (`otpLimits.js`); knowledge-chat IP limit; **no dedicated ask-submit IP/user limit** (P0).

---

## 5. Auth / admin / staff

1. **Delegate:** email OTP → HttpOnly session → AYURDISHA pass (or linked WAC Delegate ID).  
2. **WAC sign-in:** ID + WAC email → OTP → confirm + consent (`WAC_CONSENT_TEXT`).  
3. **Staff:** passcode → email OTP → admin auto-approve / co-admin request. Cookie `aym_staff`.  
4. **Admin identity fixed:** Vishnu Kumar / `vishnukumar07042004@gmail.com` (see staff specs).  
5. **Service token:** `STAFF_SERVICE_TOKEN` / `AYM_SERVICE_TOKEN` for scripts.

DISHA: Hybrid GPT draft + Gemini verify; **never auto-publishes** (`docs/ai/AI-ANSWER-PIPELINE.md`, `server/ai/*`).

---

## 6. Env var NAMES only

`ADMIN_PIN`, `STAFF_ADMIN_EMAILS`, `STAFF_SERVICE_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `MAIL_PROVIDER`, `MAIL_FROM`, `OTP_COOKIE_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_DRAFT_MODEL`, `OPENAI_DRAFT_TIMEOUT_MS`, `BLOB_READ_WRITE_TOKEN`, `WAC_VERIFY_MODE`, `WAC_VERIFY_URL`, `WAC_VERIFY_KEY`, `WAC_ID_PATTERN`, `WAC_SIGNIN`, plus runtime `AYM_STORE`, `AYM_STORE_FILE`, `AYM_MAIL`, `AYM_AI_NO_KICK`, `AI_PROVIDER`, `AYM_SERVICE_TOKEN`, `AYM_STAFF_PIN`.

**Never** use `VITE_` for secrets (documented in `.env.example`).

---

## 7. Gaps vs PRODUCT SPEC (P0 / P1 / P2)

### Already matches (do not rebuild)

- Ask Desk flow, register gate, ticket + Track  
- Double-submit guard + server idempotent duplicate ticket  
- Char counters on question/context/outcome  
- Theme/subtheme tagging + AI triage assist  
- Cluster merge + theme stage (published, PII-stripped)  
- DISHA never auto-publish  
- Overflow queue for AI  
- WAC import excluding payment/address/UTR  
- Mentors portraits under `/assets/mentors/portraits`  
- phone-ux ≤640 + sticky Ask FAB  
- SEO: canonical, OG, Event JSON-LD, sitemap/robots  
- CSP / security headers  
- Brand word **AYURDISHA** in header/footer  

### P0 gaps (ship this pass)

| Gap | Pointers |
|-----|----------|
| Promise copy implies personal mentor reply | `index.html`, `siteMeta.js`, `glossary.js` `META_DESCRIPTION`, `HomePage.jsx`, `howItWorks.js`, `HowItWorksPage.jsx`, `HomeAskDesk.jsx`, `HomeHowItWorks.jsx`, `FirstVisitGuide.jsx`, `faqs.js`, `about.js`, Ask lead in `App.jsx` |
| Consent: 4 unticked checkboxes missing; `consentPublish` hardcoded `"Yes"` | `App.jsx` AskView submit ~2114; Permissions card ~2371 |
| No ask-localStorage autosave while typing | `AskView` |
| Track cards vs `<select>` for themes | `AskView` theme field |
| PII/patient warning + submit **flag** (not block) incomplete for ask persist | medical in `shared/triageRules.js`; ask path lacks `safetyFlags` on record |
| Ask submit rate limit missing | `storePlugin.js` `set` question branch |
| Configurable congress/intake dates + closed-intake UI | `content/site.js`, `CORE_DAYS` in `App.jsx`; `publicConfig()` only `{ hasPin }` |
| Status/reference without PII | Ticket confirmation OK; no dedicated `/status/:id` (acceptable if Track stays ticket-only) |

### P1 gaps

| Gap | Notes |
|-----|-------|
| Dedicated Answer Bank page | Theme stage exists; thin as bank browse |
| FAQ / Privacy contact configurable | Partially hard-coded |
| Nine-track page refine + mentor filter by track | 10 themes today |
| Sticky Ask CTA refine | Exists — polish only |
| Institution cap / live-slot / 80–20 | Stub + admin messaging; no destructive schema |
| Sitemap/robots/JSON-LD | Exists — copy align only |

### P2 (plan only)

- i18n Hindi/Odia  
- Kiosk mode  
- MFA for staff  
- Sentry  
- Full Playwright suite (e2e script exists, not full suite)  
- Job Fair separation (no mentoring data access)  
- SSR/prerender — **Vite SPA limitation**; document only  

---

## 8. Needs decision (ask before destructive work)

1. **10 themes → 9 tracks:** additive dual-write + mapping table vs one-time remap of stored `theme` strings?  
2. **90-day post-Congress contact erase:** anonymise vs hard-delete (retention currently preserves questions).  
3. **Recording consent** before AV exists — store flag only for Dec 2026?  
4. **Job Fair** same host stub vs separate app?  
5. **Answer Bank** may show composites lacking anonymous-publication consent? Spec says never without consent.  
6. **Intake close date** default **25 Nov 2026** — confirm before enforcing closed UI in production.

**No destructive DB migration or schema wipe in this pass.** Additive fields (`consentAnon`, `consentNamed`, `consentRecording`, `consentFollow` as Yes/No, `safetyFlags[]`, `trackId`) OK if tested.

---

## 9. Implementation order (this loop)

1. This audit file (`docs/qa/AUDIT-WAC-SPEC.md`).  
2. P0: branding/meta/promise copy → key dates + intake gate → ask consents/flags/autosave/track cards → ask rate limit.  
3. P1 as time allows: Answer Bank page, FAQ contact fields, institution-cap stub + tests.  
4. Small git commits per chunk; **no push** unless asked.  
5. One `npx vercel --prod --yes` when solid.

---

## 10. Status after this pass (16 Nov 2026)

### P0 done
- Branding + `META_DESCRIPTION` / `PROMISE_SHORT` via `shared/productConfig.js` (no personal-mentor guarantee)
- Four unticked consents + never hardcode `consentPublish: "Yes"`
- Ask polish: char counters, T1–T9 track cards, autosave draft, double-submit guard, PII/patient flag (not block)
- Intake closed UI + server gate; key dates single config
- Ask IP/user rate limits; file-store relaxed for QA
- Ticket/reference confirmation without requiring PII lookup

### P1 done / stubbed
- `/answers` Answer Bank (approved/public clusters only) + sitemap/footer
- `/accessibility` page
- How-it-works seven-step Ask→…→Act
- `shared/liveSlotRules.js` institution cap / 80–20 / eligibility helpers + admin note (no destructive migration)
- Focused tests: `tests/product-config.test.mjs`

### Deferred (still Needs decision / P2)
- Destructive 10→9 theme remap of stored questions
- Full scheduling ladder / MFA / Sentry / i18n / Playwright suite / Job Fair app
- 90-day contact erasure job
- Student shareable Action Card (not staff `ActionCard.jsx`)
