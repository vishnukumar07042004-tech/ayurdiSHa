# Staff access with admin approval — spec

Status: implemented (2026-11-08); trusted-device sessions added 2026-11-09 (§4). Owner decisions
marked **DECIDE** at the end.

## 1. Goals

- The staff passcode (`ADMIN_PIN`) alone no longer opens the staff area.
- Staff access = a **verified email session** + a **role**: `admin` or an approved `co-admin`.
- The admin (`vishnukumar07042004@gmail.com`, or the comma-separated list in env
  `STAFF_ADMIN_EMAILS`) is auto-approved after passcode + email code.
- Anyone else who completes passcode + email code becomes a **pending access request**. The admin
  approves, denies and later revokes co-admins in the staff area.
- Scripts use a separate server-to-server **service token** (`STAFF_SERVICE_TOKEN`), never the
  passcode.
- Every staff decision that matters is in an **audit log**.
- Secrets are read from env only and never appear in code, docs, tests, logs or the client bundle.

Non-goals: per-feature permissions beyond admin / co-admin / one-time review, SSO, hardware keys, SMS codes.

One-time **review** invites (admin-created, hashed, single-use, short TTL, read-only): see `docs/ops/STAFF-REVIEW-LINK.md`.

## 2. Roles and permissions

| Capability | Admin | Co-admin | Pending / denied / revoked |
|---|---|---|---|
| Staff area, curation, merges, Insights, briefing board, exports, Mentor pack | yes | yes | no |
| DISHA review (approve / edit / reject / regenerate / send to mentor / run now / refile) | yes | yes | no |
| Faculty bank list / preview / review / export / match test | yes | yes | no |
| WAC selection list (save / publish / mail), WAC delegate stats, podcasts, visit sources | yes | yes | no |
| DISHA settings (`aiConfigSet`, incl. daily spend cap), bulk backfills (`aiBackfill`, `aiCompareBackfill`) | yes | **no** | no |
| WAC delegate import / clear / auto-link-all, faculty import | yes | **no** | no |
| Test probes (`testProbe*`), raw `del` | yes | **no** | no |
| Access requests (approve / deny / revoke), audit log, retention settings + cleanup | yes | **no** | no |

The admin role comes only from `STAFF_ADMIN_EMAILS` (default: the owner's address). It cannot be
granted, revoked or demoted from the UI. The service token acts as admin (`actor: "service"`).

## 3. Sign-in flow (UI: "Staff access")

The header and footer show a labelled **Staff access** button (discreet ghost style). The dialog has
three steps with a "Step N of 3" indicator:

1. **Passcode** — type the staff passcode (kept in memory in the dialog only, never stored).
2. **Email** — type your email, press *Send code*. The browser sends `staffStart {passcode, email}`.
   The server checks the lockouts, then the passcode (constant time), then sends a 6-digit code to
   that email. A wrong passcode returns to step 1 with "That passcode does not match" (email kept).
3. **Code** — type the 6-digit code; `staffVerify {email, otp}`. On success the server sets the staff
   session cookie and answers with the member status:
   - `approved` → "You're in" → enters the staff area.
   - `pending` → "Waiting for admin approval" (no staff data; *Check again* / *Sign out*).
   - `denied` → "Access was not approved" (contact the admin).
   - `revoked` → "Your staff access was revoked".
   - locked (429, `code: "locked"`) → "Too many attempts — try again in N minutes" at any step.

Passcode and email are verified in the same request (step 2) so the server can apply the per-email
limit and there is no passcode oracle without an email.

### Server ops (`POST /api/aym-store`)

| op | Who | Effect |
|---|---|---|
| `staffStart {passcode, email}` | anyone | lockout check → passcode check → email code (separate `aym_staff_otp` cookie, 10 min) |
| `staffVerify {email, otp}` | anyone with the OTP cookie | ≤ 5 tries per code; creates / updates `staff_members`; sets `aym_staff` |
| `whoami` / `staffMe` | anyone | `{ staff, email, role, status, pendingCount (admin), weakPasscode (admin), trustedDevice, expiresAt }` |
| `logout` / `staffLogout` | anyone | revokes this device's session record + clears `aym_staff` (audited `session.signout`) |
| `staffSessions {email?}` | staff | active devices `{ device, email, browser, createdAt, lastSeenAt, current }` — admin: everyone (or one email); co-admin: own only |
| `staffSessionRevoke {email, device}` | staff | signs one device out (admin: anyone's; co-admin: own); audited `session.revoke` |
| `staffSessionRevokeAll {email?}` | staff | signs every device of that person out (admin: anyone's; co-admin: own); audited `session.revoke_all` |
| `staffRequests` | admin | members grouped: pending / approved / denied / revoked |
| `staffDecide {email, decision: approve\|deny\|revoke}` | admin | updates the member, bumps its session epoch on deny / revoke, audits |
| `staffAudit {action?, actor?, limit?, before?}` | admin | newest first, filterable |
| `staffRetentionGet` / `staffRetentionSet` | admin | retention settings (§8) |
| `staffCleanup {dryRun}` | admin | runs the retention cleanup now (dry run = counts only) |
| `staffAuditExport {target}` | staff | records an export (Excel / CSV / Word / HTML downloads) |
| `login {pin}` (legacy) | — | **410** `use_staff_access`: the passcode alone never grants access |

## 4. Sessions (trusted devices)

Owner rule: once the admin or an approved co-admin has signed in on a device, they do **not** repeat
the passcode or the email code on that device. Co-admins stay co-admins until the admin revokes them;
the admin (`STAFF_ADMIN_EMAILS`) is always admin.

- A successful `staffVerify` creates a **device session** record (`staff_sessions/<sid>`, §7) and sets
  cookie `aym_staff` = signed ticket `{ v: 3, kind: "staff", email, sid, iat, n, epoch }` (HMAC-SHA256
  with the existing OTP cookie secret, domain-separated). `HttpOnly; SameSite=Lax; Path=/;
  Max-Age=180 days`, plus `Secure` on Vercel. The PIN-derived `aym_staff` value never validates.
- **Rolling, no absolute limit.** Every staff request re-reads the device record (≤ 30 s
  per-instance cache) and refreshes `lastSeenAt` at most every 10 minutes (field-level update, so it
  can never undo a concurrent revoke). Active staff therefore never expire.
- **Cookie rotation**: at most once a day of use the cookie value is re-issued (new `iat` + nonce,
  same `sid`, fresh 180-day `Max-Age`) and the record's `rotatedAt` moves on. A copy of the cookie more
  than 7 days older than the device's latest rotation is refused (an old, copied cookie dies a week
  after the real device last rotated).
- **The passcode + email code are asked again only when**: a new device / browser (no cookie), the
  cookie was cleared, the person pressed **Sign out** (that device's record is revoked, so even a
  copied cookie stops working), the admin signed that device (or all their devices) out, the admin
  revoked / denied the person, or the device was unused for **more than 90 days** (`lastSeenAt` on
  the server, and the cookie's `iat` for a device that never came back).
- **Role check on every staff request**: the member record is re-read with a per-instance cache of
  ≤ 30 s (the instance that makes a decision drops its cache at once). Approval has no expiry
  (`staff_members.status = approved` until revoked). Deny / revoke bump the member's `epoch`, so all
  of that person's devices are refused at once and stay invalid even after a later re-approval (sign
  in again). The admin role comes only from `STAFF_ADMIN_EMAILS`; a stored member record can never
  demote or revoke the admin.
- If the device record cannot be read (store outage) a co-admin gets `status: "unavailable"` (fail
  closed); the admin's signed cookie is still honoured so the owner is not locked out.
- Pre-trusted-device (v2) cookies keep their old limits (12 h idle / 7 days) and are upgraded to a
  device session on their next request, so nobody already signed in has to sign in again.
- Not enabled (owner decision): re-asking the passcode for admin-only destructive actions.
- Remembered email: after a sign-in the browser stores `aym_staff_device = { email, trusted }` in
  `localStorage` (the email only; no secret). With `trusted`, the Staff access dialog opens with
  "Checking this device's sign-in…" and goes straight to the staff area when the session is valid —
  no flash of the passcode form; otherwise it falls back to step 1 with the email filled in. Sign out
  sets `trusted: false`.
- **Device controls**: Staff portal → Access requests lists each co-admin's signed-in devices
  (browser, last seen) with **Sign out this device** and **Sign out all devices**; the identity bar
  offers everyone **Sign out** and **Sign out all my devices**. Signing devices out does not change the
  member's approval.
- `requireStaff(req, { role })` is the single gate for every staff, AI, WAC, faculty, curation,
  insights, export and settings op in `server/storePlugin.js` and for staff calls to
  `/api/ai-worker`.

## 5. Passcode hardening

- Constant-time comparison (SHA-256 digests + `timingSafeEqual`).
- Records in `staff_attempts`, one per IP hash and one per email hash: recent failures + `lockedUntil`
  + `expireAt` (TTL field).
- **Lockout**: 5 wrong passcodes within 15 min (per IP **or** per email) → locked for 15 min →
  429 `{ code: "locked", retryIn }`. Locked requests are refused before the passcode is compared.
- **Progressive delay**: each wrong passcode waits `min(2 s, 400 ms × failures)` before answering.
- If the store is unreachable an in-memory per-instance limiter still applies (fail closed on the
  lockout itself, never open).
- Every attempt is audited (`passcode.ok`, `passcode.fail`, `passcode.locked`) with the email, an
  IP hash and no passcode.
- Weak passcode warning: if `ADMIN_PIN` is shorter than 12 characters the admin sees a banner in the
  staff area asking for a longer passphrase (access is not blocked).
- Email codes reuse the existing machinery: 6 digits, 10 min, signed HttpOnly cookie, 60 s resend
  cooldown, ≤ 5 sends per email per 15 min (`reserveOtpSend`), ≤ 5 wrong codes per code.

## 6. Service token (automation)

- Env `STAFF_SERVICE_TOKEN` (≥ 32 chars; generate with `openssl rand -hex 32`). Accepted only as
  `Authorization: Bearer <token>` on `/api/aym-store` and `/api/ai-worker`; constant-time compare;
  shorter or missing tokens are ignored.
- Role admin, `actor: "service"`; every admin op it performs is audited like a person's.
- Scripts read `AYM_SERVICE_TOKEN` (fallback: `STAFF_SERVICE_TOKEN` in `.env.local`) through
  `scripts/lib/staffAuth.mjs` and never print it. `AYM_STAFF_PIN` is no longer used anywhere.
- Nothing else bypasses: the passcode, the CRON secret and the worker-kick HMAC do not open staff
  ops (the CRON secret / kick header only run the worker, as before).

## 7. Data model

On Firestore (dedicated collections, via the Admin app `server/store.js` initialised); on the file /
Blob / memory stores the same records live under KV keys `aym:staff:*` (tests, local QA). The
generic `get` / `set` / `del` / `list` ops refuse or hide `aym:staff:*` keys.

- `staff_members/<emailLower>`: `{ email, role: "admin"|"co-admin", status: "pending"|"approved"|"denied"|"revoked", requestedAt, decidedAt, decidedBy, lastSeenAt, epoch }`
- `staff_audit/<time-id>`: `{ at, who, role, action, target, ok, ipHash, detail?, expireAt }`
  (actions: `passcode.ok|fail|locked`, `email.verified`, `access.request|approve|deny|revoke`,
  `session.signout`, `answer.approve|edit|reject|send|regenerate`, `clusters.save|merge`,
  `answer.individual`, `settings.ai`, `wac.import|clear|autolink|results.save|publish|mail`,
  `faculty.import|review`, `export`, `retention.set|cleanup`, `podcasts.save`, `probe.*`, `kv.set|del`)
- `staff_attempts/<ip|email>-<hash>`: `{ fails: [ms], lockedUntil, expireAt }`
- `staff_settings/retention` (KV `aym:staff:settings`): §8.

IP addresses are stored only as salted SHA-256 prefixes. Passcodes and codes are never stored.

## 8. Data retention (cleanup runs with the daily cron, and on demand)

Admin setting (defaults): audit log 365 days, staff attempts 1 day after `expireAt`, OTP rate records
2 days, WAC-ID rate records 2 days, delegate session records 45 days, test-probe records 7 days.
The daily `/api/ai-worker` cron (Bearer `CRON_SECRET`) runs `runRetentionCleanup` first (≤ 8 s,
≤ 400 deletes per kind per run, best effort), then the AI worker. Firestore TTL policies on
`staff_attempts.expireAt` and `staff_audit.expireAt` are recommended as a backstop
(docs/ops/DATA-RETENTION.md).

## 9. Notifications

- In-app: the header shows a gold badge with the pending count for the admin; the staff area shows an
  **Access requests** panel (pending first) and an **Audit log** panel.
- Email (best effort, never blocks the request): a new request mails each admin address
  "New staff access request from <email>". Requester and admin emails are never shown to non-staff.

## 10. Other hardening in this change

- Backups: `scripts/ops/backup-firestore.mjs` (NDJSON per collection + manifest into the gitignored
  `backups/`), docs/ops/BACKUPS.md (PITR + scheduled exports).
- Security runbook: docs/ops/SECURITY-RUNBOOK.md (key rotation, 2FA, spending caps, incident response).
- Secret scan: `scripts/ops/scan-secrets.mjs` (`npm run scan:secrets`) checks `dist/` and repo files for
  secret-looking strings and for the values of secret env keys, reporting file + key name only.
- Production smoke: `scripts/ops/staff-smoke.mjs` (`npm run smoke:staff`, `--local` for a throwaway
  store): service token → probe co-admin request → pending → approve → access / admin-only refused →
  revoke → audit → purge (always).

## 11. Tests

`tests/staff-access.test.mjs` (HTTP, isolated file store, console mail): lockout after 5 wrong passcodes
(IP and email), right passcode + code → pending (co-admin) / approved (admin); approve / deny / revoke;
co-admin allowed ops vs admin-only refusals; pending / denied / revoked refused; legacy `login` 410;
service token works, wrong / short token and CRON secret do not; audit entries; idle + absolute
expiry; generic KV ops cannot read or write `aym:staff:*`; retention cleanup. `tests/staff-ui.test.mjs`
renders the entry dialog states and admin panels (esbuild + react-dom/server). All existing tests and
e2e scripts moved from the PIN login to the service token (or to the full flow in `npm run e2e`).

## 12. Owner decisions (**DECIDE**)

1. Lockout per IP can briefly block other staff behind the same venue Wi-Fi if someone guesses
   wrongly 5 times; the admin can still sign in from mobile data. Keep, or per-email only?
2. Denied requesters can request again only after the admin moves them (approve) — no self re-request.
3. Admin email notification of new requests is on whenever mail is configured. Keep?
4. Retention defaults in §8.
