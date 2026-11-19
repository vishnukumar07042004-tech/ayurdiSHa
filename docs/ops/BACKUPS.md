# Firestore backups

Three layers, cheapest first. All backups hold personal data (delegate names, emails, questions):
keep them encrypted, never commit or share them (`backups/` is gitignored).

## 1. Point-in-time recovery (managed, recommended)

Keeps a rolling 7-day history; restore to any minute.

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=<project-id>
# Restore into a NEW database, check it, then switch or copy back:
gcloud firestore databases restore --source-database='(default)' --destination-database=restore-YYYYMMDD \
  --snapshot-time=2026-11-08T10:00:00Z --project=<project-id>
```

## 2. Scheduled exports to Cloud Storage (managed)

```bash
gcloud storage buckets create gs://<project-id>-firestore-backups --location=asia-south1 --uniform-bucket-level-access
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d --project=<project-id>
# One-off export: gcloud firestore export gs://<project-id>-firestore-backups/$(date +%F) --project=<project-id>
# Restore:        gcloud firestore import gs://<project-id>-firestore-backups/<folder> --project=<project-id>
```

Set a lifecycle rule on the bucket (delete after 30 days) and restrict it to the admin.

## 3. Local NDJSON snapshot (script)

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run backup:firestore
# options: --out=backups --collections=questions,kv --subcollections=parts
```

Writes `backups/firestore-<project>-<timestamp>/<collection>.ndjson` (`{path, data}` per line) plus
`manifest.json` with counts. Read-only against Firestore. Use before risky migrations and during an
incident (SECURITY-RUNBOOK.md §6). Restoring from NDJSON is manual: write each `data` back to its
`path` with the Admin SDK (decode `{"_ts": ISO}` → Timestamp, `{"_b64"}` → bytes).

Test a restore into a scratch project once per quarter.
