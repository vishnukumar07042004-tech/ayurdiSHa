# "I'm registered for WAC 2026" — sign in with WAC ID

Status: **Built — needs the WAC delegate list (staff upload) or a WAC verification API.**

A delegate who already registered on the World Ayurveda Congress site signs in to AYURDISHA with
their **WAC registration ID + the email they used on the WAC site**. AYURDISHA checks the pair
against WAC's delegate data, emails a one-time code to the **email on WAC's record**, and on success
creates (or links) their AYURDISHA profile, prefilled from the WAC record. Their WAC ID is their pass.

## 1. Flow

1. Register (or the Ask Desk signed-out card) offers two choices:
   **I'm registered for WAC 2026 → Sign in with WAC ID** · **New here → Register with email**.
2. Delegate enters WAC ID + email → `wacStart`.
   - Server normalises the ID (trim, upper case, spaces removed), looks it up through the adapter.
   - Match (ID exists and the email equals the record's email, case-insensitive) → a 6-digit code
     goes to the record email; the response carries only the **masked** address (`an•••@g•••.com`).
   - No match / unknown ID / bad format → one generic message:
     *"We couldn't match those details. Check your WAC ID and the email you used on the WAC site."*
     The response never says which field was wrong.
3. Delegate types the code → `wacVerify` → account linked or created, session cookie issued
   (same signed `aym_del` cookie + `aym:sess:` token as normal sign-in).
4. **Confirm your details** (first sign-in only): WAC fields shown locked ("From your WAC registration —
   corrections are made on the WAC site") + AYURDISHA-only fields (career stage, interests, consent).
   `wacConfirm` saves them. Then the delegate enters the hall — or returns to the Ask Desk with their
   draft question if they came from there (QR `src` attribution kept).
5. Returning WAC users run the same flow; confirmation is skipped once done.

## 2. Data

### WAC delegate record (`wac_delegates/<key>` in Firestore; `aym:wacdel:<key>` on file/Blob stores)

| Field | Notes |
|---|---|
| `wacId` | Display form: trimmed, upper case, spaces removed |
| `key` | Doc id: `wacId` with `- _ /` removed (same rule as the pass-number index) |
| `name`, `email`, `emailLower` | `emailLower` is the lookup index (Firestore single-field query) |
| `phone` | Optional; masked on every staff/delegate screen |
| `institution`, `category`, `country`, `state`, `attendance` | `category` free text (student / delegate / international / faculty …); `attendance` normalised to `in-person` / `online` when recognisable |
| `importedAt`, `batchId` | Last import that touched the row |
| `linked`, `linkedUserId`, `linkedAt` | Set on first successful sign-in; never cleared by a re-import |

### AYURDISHA user (`aym:user:<id>`) additions

`wacId`, `wacVerified: true`, `authSource: "wac"`, `passLabel` (= WAC ID), `wac {category, country,
state, attendance, institution}`, `wacLinkedAt`, and after confirmation `stage`, `interests[]`,
`wacConsentAt`, `wacConfirmedAt`. `source` keeps its existing meaning (QR / poster attribution):
a new WAC account stores the QR source if there is one, else `"wac"`, so Insights → Sources shows
WAC sign-ins as a row.

### Pass number

- **New account:** `regNo` = WAC ID when it is a safe pass number (passes `validRegNo`) and its
  `aym:regno:` index is free — so tickets, Track, staff lists and the Ask Desk work unchanged.
- **Existing account** (registered by email before) keeps its issued `11WAC/2026/NNNN`; the pass shows
  `passLabel` (WAC ID). If the WAC ID's regno index is already taken, same: issued number + `passLabel`.

### Single link

`aym:waclink:<key>` → `{userId}` is claimed with create-if-absent. A second account trying to use a
linked WAC ID (or an account already linked to a different WAC ID) is refused with
*"This WAC ID is already linked to another AYURDISHA account. Please visit the help desk."* and a
staff alert is written (`aym:wacalert:*`, masked email only), shown on the staff panel.

### Auto-link by verified email (`server/wacAutoLink.js`)

Email-registered accounts are linked without typing a Delegate ID: after the email code is accepted
(`completeRegistration` ← `regVerify`) and on `regMe` (session refresh), an account with no `wacId`
is looked up in `wac_delegates` by `emailLower` (exact match on the verified email).

| Match | Result |
|---|---|
| One record, unlinked (or linked to this account) | `aym:waclink:<key>` claimed (create-if-absent); user gets `wacId`, `passLabel`, `wacVerified: true`, `wacVerifiedBy: "email-otp"`, `wacLinkedAt`, `wac {…}`; `name` / `institute` filled only if empty; delegate row `linked` + `linkedUserId`; the account's existing questions get `wacId` |
| Several records for the email | Not auto-picked: `wacLinkPending: true` (public profile carries it), staff alert `email-matches-several-wac-ids`; the Ask Desk shows **Choose your Delegate ID** (link mode below) |
| Record linked to another account | Nothing changes; staff alert `wac-id-linked-elsewhere` (once per account per list version) |
| No record | Nothing changes |

`regNo` is never rewritten (tickets / Track / history keep working). Each check stores
`wacAutoLinkAt`; it is repeated only after the list changes (`aym:wacdel-meta.updatedAt`, cached
≤ 60 s per instance), so `regMe` on page loads costs one cached read. Auto-link never fails or delays
a sign-in beyond 4 s (best effort). Test / probe accounts and `WAC_SIGNIN=off` skip it.

**Phones are not used** — AYURDISHA does not verify phone numbers. Linking by phone needs an SMS
code first (future).

**Link mode** (signed-in account, any email): `wacStart { link: true, token }` → code to the
WAC-record email (OTP ticket carries `linkUser`) → `wacVerify { token }` links that record to the
session's account (same single-link and one-ID-per-account rules; no confirm step). UI:
"Registered for WAC? Link your Delegate ID" under the Ask Desk pass field.

**Backfill:** staff op `wacAutoLinkAll { dryRun = true, cursor, limit }` → `{ counts: { scanned,
linkable, linked, ambiguous, conflicts, alreadyLinked, noMatch, skipped, questionsUpdated }, next }`
(counts only). `scripts/wac/autolink-existing.mjs` pages through it (`--dry-run` default,
`--apply --url=…`, `AYM_SERVICE_TOKEN`).

### Display rule (`shared/passId.js`)

`displayPassId(profile | question | staff card)` → `wacId` when present, labelled **WAC Delegate
ID**; else the issued number labelled **AYURDISHA pass number** (never "WAC registration number";
copy-lint enforces this). Used by the pass card, registration success, Ask Desk, staff delegate
cards / PDF / Excel exports / mentor pack / curation table and the selection email. Questions from a
linked account store `wacId` (from the account only — a `wacId` in a student's submit is dropped).

## 3. Privacy

- Minimal fields only (above). No passwords, no payment data, no ID documents.
- No PII in logs: import/sign-in log lines carry counts and reasons, never names/emails/phones/IDs.
- Staff panel masks emails and phones by default ("Show contacts" toggles).
- The code goes only to the WAC-record email; the browser only ever sees the masked address.
- Codes live in the existing signed httpOnly OTP cookie (never stored, never returned).
- Clearing the list removes only delegates who have not signed in (linked rows stay as the link record).

## 4. Edge cases

| Case | Behaviour |
|---|---|
| ID typed with spaces / lower case | Normalised before lookup |
| ID typed with or without dashes / slashes | Same key (`- _ /` ignored) |
| Wrong email / unknown ID | Generic message, counts against per-ID and per-network limits |
| Email changed on WAC after import | Re-import updates the record; code goes to the new record email |
| Same email already has an AYURDISHA account | Linked to it (no duplicate); its age/sex/stage etc. kept — and usually already auto-linked by email (§2) |
| Registered on AYURDISHA with a different email than on WAC | No auto-link; the delegate uses "Link your Delegate ID" (code to the WAC-record email) |
| WAC ID already linked elsewhere | Refused + staff alert |
| Delegate removed from a later list | Linked rows stay; unlinked ones only go with "Clear unlinked" |
| Too many attempts | Per WAC ID: 6 starts / 15 min (cross-instance). Per network: 600 lookups / 10 min. Per email: the existing 5 codes / 15 min. Per browser: 60 s resend cooldown, 5 wrong codes per code |
| No delegates imported and no API | WAC option hidden; Register shows "Sign in with WAC ID — coming soon" |
| API mode, WAC API down | "WAC verification is unavailable right now — register with email or try again shortly" (503) |
| Kill switch | `WAC_SIGNIN=off` hides the option and refuses the ops |

## 5. Staff upload process

Staff Portal → **Insights → WAC delegates**:

1. Get the delegate export from WAC (CSV or XLSX).
2. Choose the file. Columns are auto-detected (Registration ID / Reg No / WAC ID, Name, Email,
   Mobile / Phone, Institution / College, Category, Country, State, Attendance / Mode); fix any
   mapping in the drop-downs.
3. Preview (first rows, masked) and validation: missing ID, missing / bad email, invalid ID format,
   duplicate IDs in the file (first kept).
4. **Import** — sent in chunks; the server writes Firestore batches of ≤ 500. Imports are upserts:
   re-uploading a newer list updates WAC fields and never touches AYURDISHA profiles or links.
5. The card shows total delegates, linked count, last import, and any second-link alerts.
6. **Clear unlinked** (typed confirmation `CLEAR UNLINKED`) removes only delegates nobody has
   signed in with — production-safe.

Sample file: `docs/wac-signin/sample-delegates.csv` (dummy data).

## 6. Adapter + future WAC API contract

`server/wacDelegates.js` exposes `lookup(wacId, email)` behind an adapter chosen by
`WAC_VERIFY_MODE`:

- `list` (default) — the imported Firestore list.
- `api` — `POST $WAC_VERIFY_URL` with header `Authorization: Bearer $WAC_VERIFY_KEY`, body
  `{"wacId": "…", "email": "…"}`, 5 s timeout. Response:

```json
{ "valid": true, "name": "…", "email": "…", "phone": "…", "institution": "…",
  "category": "student", "country": "India", "state": "Odisha", "attendance": "in-person" }
```

`valid: false` (or HTTP 404) = no match. Any other error = unavailable. Disabled unless both env
vars are set. Optional `WAC_ID_PATTERN` (regex source, applied to the normalised ID) tightens the
permissive default `^[A-Z0-9][A-Z0-9/_-]{2,38}[A-Z0-9]$` once WAC confirms its format.

## 7. Ops

| Op | Who | Purpose |
|---|---|---|
| `wacConfig` | public | `{enabled, mode, comingSoon}` (cached 60 s) |
| `wacStart` | public | `{wacId, email}` → code to record email, `{maskedEmail}` |
| `wacVerify` | public | `{wacId, otp, source?}` → `{token, profile, record, needsConfirm}` |
| `wacMe` | delegate session | locked record view for the confirm screen |
| `wacConfirm` | delegate session | `{stage, interests[], consent: true}` |
| `wacDelegatesImport` | staff | `{rows[], batchId, filename, final}` → counts |
| `wacDelegatesStats` | staff | totals, linked, last import, alerts, `query` search (masked) |
| `wacDelegatesClear` | staff | `{confirm: "CLEAR UNLINKED"}` → removes unlinked only |
