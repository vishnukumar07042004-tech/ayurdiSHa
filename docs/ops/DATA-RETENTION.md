# Data retention

The daily cron (`/api/ai-worker`, `Authorization: Bearer $CRON_SECRET`) runs the retention cleanup
first (≤ 6–8 s, ≤ 400 deletions per kind per run, best effort), then the AI worker. The admin can
change the limits and run the cleanup (preview or apply) in Staff portal → **Data retention**.
Every run started by staff is audited (`retention.cleanup`); limit changes as `retention.set`.

| Record | Default | Range | Store |
|---|---|---|---|
| Staff audit log | 365 days | 30–3650 | `staff_audit` (`expireAt` TTL field) / `aym:staff:audit:*` |
| Passcode-attempt / lockout records | 1 day after `expireAt` | fixed | `staff_attempts` / `aym:staff:att:*` |
| Email-code rate records | 2 days | 1–90 | `aym:otp:*` |
| Queued outbound mail | 30 days (KV TTL) | fixed | `aym:mail:*` (OTP sealed; expired OTP jobs are not sent) |
| WAC-ID rate records | 2 days | 1–90 | `aym:wacrate:*` |
| Delegate session records | 45 days | 31–365 | `aym:sess:*` |
| Test-probe data (probe access requests, `[TEST]` questions) | 7 days | 1–90 | probe members / questions (skipped while a probe is < 1 h old) |

Never deleted by the cleanup: staff members, questions, curated groups, delegates, AI drafts and the
answer bank.

## Firestore TTL backstop (recommended)

TTL policies delete expired documents even if the cron does not run:

```bash
gcloud firestore fields ttls update expireAt --collection-group=staff_attempts --enable-ttl --project=<project-id>
gcloud firestore fields ttls update expireAt --collection-group=staff_audit --enable-ttl --project=<project-id>
```

TTL deletion runs within ~24 h of `expireAt`. The audit `expireAt` is set when an entry is written,
from the audit-log limit at that time.
