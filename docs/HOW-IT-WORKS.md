# How AYURDISHA works (operator notes)

Short operator guide. Details: `docs/ai/AI-ANSWER-PIPELINE.md` (DISHA drafts), `docs/DATA-STORAGE.md`,
`docs/qa/LOAD-READINESS.md` (burst load, limits, plans).

**DISHA** is AYURDISHA's AI mentor assistant: it drafts answers that an official reviews. The name
appears on staff screens (DISHA drafts desk, settings, badges) and, for students, only in the note
on an approved AI-assisted answer: "Prepared with DISHA, our AI assistant, and reviewed by WAC
mentors." Internal ids, ops and storage keys keep the `ai` names (`aiConfigGet`, `ai_jobs`, `#ai`).

## A question's journey

1. A registered student asks on the Ask Desk and gets a ticket (`AYM-Q-…`).
2. Staff see it on Insights → Briefing board and the Curation desk (merged into groups).
3. If DISHA is on for its stream, a draft is queued (`ai_jobs`), written from trusted
   sources, checked claim by claim and shown on **DISHA drafts** for an official.
4. An official approves / edits (the answer goes on the question or group, same fields as a
   mentor answer), rejects, or sends it to a mentor.
5. The student reads the answer on **Track my answer**. A DISHA-assisted answer carries the small
   DISHA note above.

## Which model writes the draft (Hybrid)

DISHA's primary is **Hybrid**: GPT (`gpt-5.4`) writes the draft, Gemini checks every claim against
the sources, rules (then the cheapest Gemini model) classify. If GPT fails, is slow or has no key,
Gemini writes that draft instead — the desk says "Drafted by Gemini (fallback)" — so no question
waits on GPT. Settings → **Models** shows the provider and model of each step. Chosen on
2026-11-09 from a real 44-question eval: claims supported 86.4% vs 44.6% for Gemini alone, 3 vs 71
unsupported claims, 100% vs 60% approvable, $0.030 vs $0.046 per draft. Rollback: set the primary
to `gemini` (Gemini for every step).

**Compare mode** (on for the evaluation): each question also gets a "Gemini only" draft from the
same sources, side by side with "Hybrid (GPT draft + Gemini check)". Approve or edit the one you
prefer — the choice is recorded for the stats. Compare mode is for evaluation; turn it off after
the review (Settings, or `node scripts/ai/compare-drafts.mjs --disable`; `--status` prints the
comparison).

**Medical questions** never get a draft, whatever the models say: rules (English, Hinglish, Hindi),
the triage model, the drafter, the verifier and a final scan for doses / treatment advice each
send the question to a mentor on their own — also for career-framed asks like "which branch is
best for treating skin diseases?". A career question that only mentions a disease ("scope for a
diabetes clinic?") is still drafted.

## Why I don't see DISHA answers

| Check | What you see | Fix |
|---|---|---|
| DISHA is off | Desk banner "DISHA is off — turn it on in Settings" | Settings → DISHA on/off |
| Stream is off | Question never appears on the desk | Settings → Streams (pilot: PG entrance, government jobs) |
| Shadow mode on | Banner "Shadow mode: drafts are hidden" | Turn off shadow mode (or Show shadow drafts) |
| Asked before DISHA was on | Older questions have no draft | Settings → **Draft existing questions** → Process queue now |
| Waiting for approval | Track says "Being reviewed by the desk" | An official approves on the DISHA drafts desk |
| Thin topic | Amber "Limited sources — mentor to complete" draft | Add the specific facts from the official homepages listed, then Edit then send (see below) |
| Medical question | "medical → mentor" | By design: a mentor answers |
| Queue paused | Spend-cap / "DISHA can't reach its AI provider" banner | Raise the cap or fix the key (Settings → Test DISHA connection), then Process queue now |
| AI quota / 429 / timeout | Insight **Waiting for AI**; DISHA card **waiting for AI / quota** (question + asker saved) | Recharge the Gemini/GPT key, then DISHA → **Retry AI** (or **Retry AI after recharge** for the batch). Nothing is published until you approve |
| Load-test question | `[TEST][LOAD]` probe questions never get a draft | By design: the load test must not spend the daily cap |

## "Limited sources" (mentor-assist) drafts

When the trusted sources don't cover a career question, the desk still gets a starting draft
instead of a dead "no sources" block. It is marked with an amber **Limited sources — mentor to
complete** badge and sorted after the normal drafts (before blocked / medical ones). Filter them
with *Draft type → Limited sources*.

- What it contains: general, durable guidance only — how to decide, options to weigh, what to
  verify, which official body to check (NCISM, NTA, AACCC, UPSC, State PSC, Ministry of Ayush …).
  Any number, date, fee or percentage that no trusted source states is removed automatically
  (the removed sentences are listed in the amber box). References are official homepages only.
- What you do: **add the specific facts from the official source before sending** (Edit then
  send). Approve as-is only if general guidance really is the right answer. Send to mentor and
  Regenerate work as usual.
- The student sees an approved one like any other answer on Track.
- Medical, restricted and off-topic questions are unchanged (mentor / scripted replies).

Drafts that were blocked as "insufficient source" before this existed: run
`node scripts/ai/enable-pilot.mjs --redraft-insufficient --runs=12` once after deploying.
To close the gaps for good, `node scripts/kb/fetch-gaps.mjs` (open network) fetches the official
AIAPGET, NEET-PG, UPSC / state PSC, NCISM, Clinical Establishments Act and Gulf licensing documents
into the knowledge base; redeploy, then redraft again.

## Pilot switch from the command line

Scripts authenticate with the service token from `AYM_SERVICE_TOKEN` (or `STAFF_SERVICE_TOKEN` in `.env.local`); it is never printed.

```bash
node scripts/ai/enable-pilot.mjs --status          # read-only summary
node scripts/ai/enable-pilot.mjs --limit=30        # DISHA on, pg-entrance + govt-jobs, shadow off, $10 cap, backfill, run worker
node scripts/ai/enable-pilot.mjs --all-streams     # same, every stream
node scripts/ai/enable-pilot.mjs --disable         # DISHA off (drafts and approved answers are kept)
node scripts/ai/enable-pilot.mjs --redraft-insufficient --runs=12   # redraft old "insufficient source" drafts as mentor-assist
```

## Sign in with WAC ID

Delegates who registered on the World Ayurveda Congress site can sign in with their **WAC
registration ID + the email they used on the WAC site** instead of filling the Register form.
Spec: `docs/wac-signin/WAC-SIGNIN-SPEC.md`.

**Staff — import WAC's delegate list** (Staff Portal → Insights → **WAC delegates**):

1. Get WAC's delegate export as CSV or XLSX. Needed columns: Registration ID, Name, Email; optional
   Mobile, Institution, Category, Country, State, Attendance. Headers are auto-detected (e.g. "Reg No",
   "E-mail", "College", "Mode"); fix any column in the drop-downs. Try it with
   `docs/wac-signin/sample-delegates.csv` (dummy data) on a test deploy.
2. Check the preview (emails / phones masked; *Show contacts* to reveal) and the skipped rows
   (missing ID, name or email, bad email, duplicate ID — first row kept).
3. **Import**. Safe to repeat: rows are updated by registration ID, AYURDISHA profiles and links
   are never changed. Upload a newer list the same way.
4. The card shows delegates on file, how many have signed in, the last import and any **blocked
   second-account attempts** (one WAC ID can belong to one AYURDISHA account only — resolve at the
   help desk). *Find* looks a delegate up by WAC ID or email.
5. *Clear unlinked* (type `CLEAR UNLINKED`) removes only delegates nobody has signed in with.

The WAC option appears on Register and the Ask Desk once the list has at least one row (within a
minute); with no list it shows "coming soon". `WAC_SIGNIN=off` hides it. When WAC offers an API,
set `WAC_VERIFY_MODE=api`, `WAC_VERIFY_URL`, `WAC_VERIFY_KEY` (see `.env.example`) — no upload needed.

**Delegate — sign in:**

1. Register (or the Ask Desk "One quick step first" card) → **I'm registered for WAC 2026 → Sign in
   with WAC ID**.
2. Type the WAC Delegate ID and the WAC-site email → a 6-digit code goes to the email on WAC's
   record (shown masked). A wrong pair only ever says "We couldn't match those details…".
3. Type the code → **Confirm your details**: WAC fields are locked (corrections on the WAC site);
   choose career stage, optional interests, tick consent → enter the hall (or back to the Ask Desk
   with the draft question).
4. The pass shows the WAC ID. Someone who had already registered with the same email keeps their
   account, tickets and internal pass number; the pass card now shows the WAC ID. Next time the same
   flow signs them straight in.

## WAC Delegate ID auto-link (by verified email)

Delegates who register with **email** (the normal "New here" form) are linked to their WAC
delegate record automatically when the email they just verified with a code is on the imported
list — no Delegate ID to type. Code: `server/wacAutoLink.js`.

- **When:** right after the email code is accepted (`regVerify`), and on every session refresh
  (`regMe`, i.e. any page load of a signed-in delegate). A no-match is remembered until the list is
  next imported, so page loads stay cheap.
- **Rule:** exact lower-case match on the verified email.
  - one record, not linked to anyone else → linked: `wacId`, `wacVerified` (by email code),
    `wacLinkedAt`; empty profile fields prefilled (a typed name / institute is never replaced);
    WAC category / state / institution kept on the account; the delegate record marked linked.
    Their earlier Ask Desk questions get the `wacId` too.
  - several Delegate IDs for the email → nothing auto-picked; the account is marked
    `wacLinkPending`, the Ask Desk shows **Choose your Delegate ID**, and staff get an alert.
  - the record is already linked to another account → nothing changes; staff alert.
  - no record → nothing changes.
- **Phones are not used** — registration does not verify them. Linking by phone needs an SMS code
  first (future).
- The internal `regNo` (`11WAC/2026/NNNN`) never changes, so tickets, Track and history keep
  working; it is just no longer the number shown when a Delegate ID exists.

**What people see** (one rule, `displayPassId()` in `shared/passId.js`, used by the pass card,
registration success, Ask Desk, staff delegate cards / PDF / Excel exports / mentor pack /
curation table and the selection email):

- linked → **WAC Delegate ID: BHA12345** (Ask Desk field read-only, note "Filled from your WAC
  delegate record");
- not linked → **AYURDISHA pass number: 11WAC/2026/NNNN** (never "WAC registration number"), with
  **Registered for WAC? Link your Delegate ID** on the Ask Desk: Delegate ID + WAC-site email → code
  to the WAC-record email → linked to the signed-in account (any email).
- Questions from a linked account carry `wacId` (from the account, never from the form) beside
  `regNo` / `delegateNo`.

**Staff — backfill existing accounts** (after a deploy or a new list import): the PIN-gated op
`wacAutoLinkAll` (dry run by default; counts only), driven by
`AYM_SERVICE_TOKEN=… node scripts/wac/autolink-existing.mjs --dry-run`, then
`--apply --url=https://ayushmarg.vercel.app`. Apply is paged and idempotent (linked accounts are
skipped, alerts raised once, questions already stamped are left). Ambiguous and blocked cases show
in **WAC delegates → Link alerts**.

## Staff access (passcode + email code + admin approval)

Full spec: docs/security/STAFF-ACCESS-SPEC.md · runbook: docs/ops/SECURITY-RUNBOOK.md.

1. **Staff access** (header or footer) → *Step 1* staff passcode → *Step 2* your email → *Step 3* the
   6-digit code we email you. The passcode alone never opens anything.
2. The admin (`STAFF_ADMIN_EMAILS`, default the owner) is in at once. Anyone else becomes a
   **pending request**: no staff data, "Waiting for admin approval" (*Check again* / *Sign out*).
3. The admin sees a gold badge on **Staff portal** (and gets an email), then approves, denies or
   later revokes in Staff portal → **Access requests**. Approved people are **co-admins**: every desk,
   DISHA review, exports — but not DISHA settings / spend cap, bulk backfills, WAC delegate
   import / clear, faculty import, access decisions, the audit log or retention.
4. "Signed in as … (Admin / Co-admin) · Sign out" shows on every staff screen. Sessions end after
   12 h idle or 7 days; a revoke works on the next click.
5. 5 wrong passcodes (per network or per email) lock sign-in for 15 minutes.
6. Scripts use the service token (`AYM_SERVICE_TOKEN`), never the passcode. After a deploy:
   `AYM_SERVICE_TOKEN=… npm run smoke:staff -- --base=https://ayushmarg.vercel.app`.

## Mail that must not stop the hall

OTP, staff codes, and answer notices use `sendOrQueue`: if Resend and Gmail both fail (free-plan
quota, auth, network), the rest of the app still succeeds and the message is retried. Staff see
**Mail health** on Insights (queued count, last error class — quota / auth / network — no
credentials). Production recommendation: a dedicated transactional provider (Resend, Postmark, or
SendGrid) as primary, Gmail SMTP as fallback (`RESEND_API_KEY` + `SMTP_*`, `MAIL_PROVIDER=auto`).
Dual-provider send runs only when both transports are already in env.
