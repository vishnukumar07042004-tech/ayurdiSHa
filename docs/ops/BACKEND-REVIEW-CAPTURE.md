# AYURDISHA staff/backend review — capture spec

One-shot visual + route map so a coding agent can review the staff/backend **without** a live one-time review URL. Screenshots live under `docs/ops/backend-review/screens/`. PDF: `docs/ops/AYURDISHA-Staff-Backend-Review.pdf`.

**Live:** https://ayushmarg.vercel.app  
**Stack:** Vite + React (SPA hash/path tabs), Vercel serverless (`/api/aym-store`, `/api/ai-worker`), Firestore via Admin SDK  
**Date for this pack:** 2026-11-17

---

## Hard rules (capture + PDF)

- **Never** show, print, log, or commit: `ADMIN_PIN`, passcodes, OTP digits, `STAFF_SERVICE_TOKEN`, API keys, review tokens, raw emails, phones, or real delegate names when avoidable.
- **Mask PII** in screenshots: blur/crop/overlay emails, phones, and real names on WAC/delegates/briefing contacts. Demo tickets and question text OK.
- **One-time review create panel:** capture the empty create UI (TTL + button). Do **not** leave a redeemed or live URL in the image or PDF.
- Prefer **desktop (≥1280×900)** for staff desks; **mobile (~390×844)** for Ask Desk + Track.
- Sharp, full chrome readable; crop empty margins; dark overlays OK for PII.

---

## Route cheat sheet

| Surface | Preferred URL | Alt |
|--------|----------------|-----|
| Staff portal | `/#staff` | `/staff` → redirect |
| Curation | `/#curate` | `/staff/curation` |
| Theme stage | `/#board` | `/staff/theme-stage` |
| Insights | `/#insights` | `/staff/insights` |
| Mentor pack | `/#pack` | `/staff/mentor-pack` |
| DISHA drafts | `/#ai` | `/staff/ai-drafts` |
| Ask Desk | `/#ask` | `/ask` → `/#ask` |
| Track | `/#track` | `/track-answer` → `/#track` |
| Register | `/#register` | — |
| Podcast (staff-aware) | `/#podcast` | — |
| Mentors | `/mentors` | `/mentors/:slug` |
| How it works | `/how-it-works` | — |
| Answer bank | `/answers` | — |
| Account | `/account` | — |
| Review redeem | `/#staff?review=<token>` | `/staff/review/<token>` |

Staff tabs only render desk data when `whoami` reports an approved staff session (cookie) or equivalent service auth used only for capture tooling.

---

## Screen inventory

### Staff / backend

| # | File | Viewport | URL / entry | What to capture | Annotate | Mask |
|---|------|----------|-------------|-----------------|----------|------|
| 01 | `01-staff-signin.png` | desktop | Open **Staff access** dialog from header/footer (signed out) | Step 1 passcode field empty; step indicator | “Passcode never stored in client; never screenshot filled field” | No digits |
| 02 | `02-staff-home.png` | desktop | `/#staff` signed in | Staff workspace hero + action cards (Curation, Theme stage, Insights, Mentor pack, DISHA) | Session bar role (admin / co-admin / review) | Mask email in identity bar if shown |
| 03 | `03-insights.png` | desktop | `/#insights` | Chips/counts, mail health, Waiting for AI, queue strip, topic mix | Status chip legend | Contacts hidden |
| 04 | `04-theme-stage.png` | desktop | `/#board` | Theme stage / published mentor letters board | Staff subnav | Stage shows no mentee names by design |
| 05 | `05-mentor-pack.png` | desktop | `/#pack` | Merge groups, unmerged list, briefing export | Merge confidence / suggested merges if present | Hide contacts |
| 06 | `06-faculty-bank.png` | desktop | `/#insights` → Faculty Q&A bank section (scroll) | Bank list + settings/import controls | Streams; draft vs approved | No faculty PII |
| 07 | `07-disha-desk.png` | desktop | `/#ai` | Waiting / status tabs; Hybrid \| Gemini compare if compare mode on; draft badges | “Nothing published until approve” | Redacted draft bodies OK |
| 08 | `08-disha-settings.png` | desktop | `/#ai` → Settings | Budget/spend cap, models, safety switches, streams, Process now / Retry AI | Ops: `aiConfigGet` / `aiConfigSet`, `aiRunNow` | No API keys |
| 09 | `09-wac-delegates.png` | desktop | `/#insights` → WAC delegates **or** staff portal delegates | List view with emails/phones **masked** | Import/clear admin-only | Overlay email/phone columns |
| 10 | `10-huddles-scheduling.png` | desktop | Search hall map / How it works “live” copy / empty stub | Whatever exists for huddles / 1:1 booking | Mark **Not shipped** if no booking UI | — |
| 11 | `11-review-invite-create.png` | desktop | `/#staff` → One-time review link panel | TTL select + Create button; **no live URL** | Admin-only; hash stored server-side | Never capture `url` after create |
| 12 | `12-briefing-board.png` | desktop | `/#insights` → Briefing board | Answer-flow statuses + table (contacts **hidden**) | Statuses: Received → Waiting for AI → Being reviewed → … | Names/emails off |
| 13a | `13a-curation.png` | desktop | `/#curate` | Curation desk merge / groups | Suggested merges | — |
| 13b | `13b-admin-access-audit.png` | desktop | `/#staff` admin panels | Access requests + Audit log (+ retention if visible) | Admin-only ops | Mask member emails |
| 13c | `13c-register-ops.png` | desktop | `/#register` or hall WAC selection staff strip | Register / ask ops / selection desk if staff | — | Mask delegate rows |
| 13d | `13d-podcast-staff.png` | desktop | `/#podcast` | Podcast view (staff may see extra controls) | — | — |

### Student / public

| # | File | Viewport | URL | What to capture | Annotate | Mask |
|---|------|----------|-----|-----------------|----------|------|
| 14 | `14-ask-desk-mobile.png` | mobile | `/#ask` | Tracks, consents, submit | Consent checkboxes | Empty personal fields |
| 15 | `15-track-mobile.png` | mobile | `/#track` | Ticket lookup UI + empty/demo state | Public lookup by ticket | No email lookup with real email |
| 16a | `16a-mentors.png` | desktop | `/mentors` | Directory grid | — | — |
| 16b | `16b-mentor-profile.png` | desktop | `/mentors/<one-slug>` | One mentor profile | — | Public bio only |
| 17a | `17a-how-it-works.png` | desktop | `/how-it-works` | Programme flow | Note huddles/1:1 as capacity-limited copy only | — |
| 17b | `17b-answer-bank.png` | desktop | `/answers` | Published answer bank | — | — |
| 18 | `18-account.png` | desktop or mobile | `/account` | Account shell / sign-in | — | Mask any profile fields |

---

## Architecture notes (for PDF prose)

```
Ask Desk submit → store (questions) → DISHA enqueue (ai_jobs) if enabled
  → worker classify/retrieve/draft/verify → ai_drafts (pending)
  → Staff DISHA desk Approve/Edit → published answer fields
  → Track my answer + optional answer bank
```

Human approve is mandatory. Review sessions are read-only (`review_only`). Medical/treatment asks route to mentor (never auto-draft as clinical advice).

### Useful store ops (names only)

`whoami`, `staffStart`, `staffVerify`, `staffLogout`, `staffReviewInviteCreate`, `staffReviewRedeem`, desk loaders (`staffCounts` / paged questions), `aiQueue`, `aiIndex`, `aiConfigGet`, `aiConfigSet`, `aiRunNow`, faculty bank ops, WAC delegate import/list, `staffAudit`, `staffDecide`, `staffRetentionGet`.

---

## Capture tooling

1. Prefer browser MCP or Puppeteer + Chrome (`scripts/ops/backend-review-capture.mjs`).
2. Staff access for capture: inject `Authorization: Bearer` **service token** from local env (never write token into docs/PDF/screens), **or** mint a fresh one-time review invite and redeem in the browser (do not paste token into PDF).
3. After staff shots: sign out / discard review session.
4. Build PDF with ReportLab from `docs/ops/backend-review/build-pdf.py`.

---

## Missing-screen policy

If a surface has no UI (e.g. huddle/1:1 booking engine), capture the closest public stub or empty state and label **Not built yet** in the PDF. Do not invent screenshots.

### Notes from 2026-11-17 capture

- Live `/how-it-works` crashed with `ShieldCheck is not defined` (missing lucide import in `HowItWorksPage.jsx`). Import fixed in repo; How-it-works + Meet screenshots taken from local Vite. Redeploy when convenient so production matches.
- Extra stub: `10b-events-schedule.png` (`/events`) alongside Meet-step huddles copy.
- Staff screens used service-token Authorization injection in Puppeteer only (never written into docs/PDF).
