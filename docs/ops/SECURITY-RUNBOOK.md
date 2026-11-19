# AYURDISHA security runbook

Who: the admin (`STAFF_ADMIN_EMAILS`, default the owner). Run commands from `ayurmarg-preview/`.
Never paste a secret into chat, a doc, a commit or a terminal command line that is logged — use
`vercel env add <NAME> production` (it prompts for the value) or the Vercel dashboard.

Related: [staff access spec](../security/STAFF-ACCESS-SPEC.md) · [backups](BACKUPS.md) ·
[data retention](DATA-RETENTION.md).

## 1. Secrets and where they live

| Secret | Used for | Where |
|---|---|---|
| `ADMIN_PIN` | Staff passcode (step 1 of Staff access; never enough alone) | Vercel production env, `.env.local` |
| `STAFF_SERVICE_TOKEN` | Scripts (`Authorization: Bearer`), acts as admin | Vercel production env; scripts read `AYM_SERVICE_TOKEN` |
| `STAFF_ADMIN_EMAILS` | Who is admin (not secret, but controls access) | Vercel production env |
| `OTP_COOKIE_SECRET` | Signs email-code, delegate and staff session cookies | Vercel production env |
| `CRON_SECRET` | Daily `/api/ai-worker` cron (retention cleanup + AI worker) | Vercel production env |
| `FIREBASE_*` / service-account JSON | Firestore Admin SDK | Vercel production env |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | DISHA drafting | Vercel production env |
| `RESEND_API_KEY` or `SMTP_*` | Email codes and notifications | Vercel production env |
| `BLOB_READ_WRITE_TOKEN` | Legacy Blob store | Vercel production env |

Rules: server-only (never `VITE_`), never printed by scripts, never committed. Check before every
release: `npm run build && npm run scan:secrets` (reports file + key name, never values).

## 2. Key rotation

Rotate on a schedule (every 90 days for the passcode and service token, yearly for provider keys)
and at once after any suspected leak, staff departure or laptop loss.

1. **Staff passcode (`ADMIN_PIN`)** — choose a passphrase of 12+ characters (the admin sees a
   banner while it is shorter). Make sure `OTP_COOKIE_SECRET` is set first (otherwise cookies are
   signed with the passcode and changing it signs out every delegate and staff member).
   `vercel env rm ADMIN_PIN production && vercel env add ADMIN_PIN production`, redeploy, tell
   approved co-admins privately. Existing staff sessions stay valid; revoke anyone who should lose access.
2. **Service token** — `openssl rand -hex 32 | vercel env add STAFF_SERVICE_TOKEN production`
   (after `vercel env rm STAFF_SERVICE_TOKEN production`), redeploy, update the script machine's
   `.env.local` / password manager. Old token stops working on deploy.
3. **Cookie secret (`OTP_COOKIE_SECRET`)** — `openssl rand -hex 32 | vercel env add OTP_COOKIE_SECRET production`.
   Effect: every staff and delegate session ends; delegates restore with their saved token, staff sign in again.
4. **Provider keys (Gemini / OpenAI / Resend / Firebase)** — create the new key in the provider
   console, add it in Vercel, redeploy, run `node scripts/ai/prod-smoke.mjs --test`, then delete the old key.
5. **CRON_SECRET** — new random value in Vercel; the cron picks it up on the next deploy.

## 3. Two-factor authentication (do once, check quarterly)

Turn on 2FA (authenticator app or passkey, not SMS) for every account that can reach production:
Vercel (team + personal), GitHub / Cursor origin, Google Cloud / Firebase, Google AI Studio,
OpenAI, Resend (or the SMTP mailbox), the domain registrar and the admin's email account
(`vishnukumar07042004@gmail.com` receives staff access requests and staff codes). Store recovery
codes offline. Remove ex-collaborators from Vercel, GitHub and Firebase IAM.

## 4. Spending caps

- **DISHA**: Staff → DISHA drafts → Settings → daily spend cap (default $5; admin only). The worker
  stops at the cap and shows a banner.
- **Google Cloud / Gemini**: Billing → Budgets & alerts (e.g. $25 / month with 50 / 90 / 100 %
  emails); AI Studio → set per-project quotas.
- **OpenAI**: Settings → Limits → monthly budget + email threshold.
- **Vercel**: Settings → Billing → Spend Management (hard limit + notifications).
- **Firestore**: budget alert on the project; the retention cleanup keeps rate / audit records bounded.

## 5. Staff access operations

- Requests: the admin gets an email and a gold badge on **Staff portal**; approve / deny / revoke in
  Staff portal → **Access requests**. Revoke takes effect on the next request (≤ 30 s across instances).
- Audit: Staff portal → **Audit log** (filter: access, passcode, exports, settings …).
- Lockouts: 5 wrong passcodes per network or per email → 15-minute lock. A venue Wi-Fi lock clears by
  itself; the admin can sign in from mobile data meanwhile.
- Smoke after each deploy: `AYM_SERVICE_TOKEN=… npm run smoke:staff -- --base=https://ayushmarg.vercel.app`.

## 6. Incident response

1. **Contain (first 15 minutes)**: revoke suspicious co-admins (Access requests); rotate
   `ADMIN_PIN` and `STAFF_SERVICE_TOKEN` (§2); if a provider key leaked, delete it in the provider
   console first, then rotate. If the app itself is being abused, set DISHA off and the spend cap
   to 0, or roll back in Vercel (Deployments → previous → Promote).
2. **Assess**: Staff portal → Audit log (`passcode.fail`, `passcode.locked`, `access.*`, `export`,
   `settings.ai`, `wac.*`); Vercel → Logs; Firebase → usage; provider dashboards for unusual spend.
3. **Preserve**: `npm run backup:firestore` (see BACKUPS.md) before any clean-up; export the audit
   entries you need.
4. **Recover**: restore from PITR / export if data was changed; rotate `OTP_COOKIE_SECRET` to end
   every session; re-approve legitimate co-admins (they sign in again).
5. **Notify**: if personal data (delegate names / emails) may have been exposed, inform the WAC
   organisers and affected people per the privacy notice and applicable law (India DPDP Act 2023)
   without undue delay; record what happened, when, and what was done.
6. **Review**: write a short post-incident note in `docs/PROGRESS.md` (no secrets), fix the cause,
   add a test.
