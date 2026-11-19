# AYURDISHA data storage

Meet the Mentors stores delegate registrations, questions, mentor clusters, and staff
selection lists on the server. The browser never talks to Firestore directly.

## Backends (priority order)

| Priority | Backend | When used |
|----------|---------|-----------|
| 1 | **Firestore** | Firebase Admin credentials present (`FIREBASE_*` env vars) |
| 2 | **Vercel Blob** | No Firebase creds, but `BLOB_READ_WRITE_TOKEN` is set |
| 3 | **Local file** | Dev fallback (`data/store.json` or `/tmp/aym-store.json`) |

Check which backend is live:

```bash
curl -s -X POST https://ayurdisha.vercel.app/api/aym-store \
  -H 'Content-Type: application/json' \
  -d '{"op":"ping"}' | jq .backend
```

Expect `"firestore"` after migration.

## Firestore layout

All access is through `server/store.js` (Admin SDK only):

| Collection / doc | Key prefix | Contents |
|------------------|------------|----------|
| `questions/{id}` | `aym:q:*` | Submitted questions (+ normalized `emailLower`, `ticketLower` for lookup) |
| `meta/clusters` | `aym:clusters` | Merged mentor answer groups |
| `meta/stats` | — | Staff question stats (recomputed on read, at most every 5 min — never written on submit) |
| `meta/wac-seq` | — | Legacy single pass-number counter; now only holds `blockBase` for the shards |
| `meta/wac-seq~s0` … `~s7` | — | Pass-number shards: each reservation takes a block of 10 numbers (`server/passIssuer.js`) |
| `meta/wac-seq-loadtest~s*` | — | Load-test pass numbers (11WAC/2026/9xxxxx), never the real sequence |
| `meta/visit-sources~s0` … `~s9` | — | QR visit counters, sharded (plus the legacy `meta/visit-sources`) |
| `kv/{encodedKey}` | `aym:user:*`, `aym:email:*`, `aym:regno:*`, `aym:sess:*`, `aym:otp:*`, `aym:mail:*`, `aym:meta:public-stats`, `aym:wac-results`, etc. | User profiles, indexes, sessions, per-email OTP send records (hashed key), queued outbound mail (OTP sealed AES-256-GCM; staff list never sees digits), shared public-stats cache, WAC selection |

Burst safety (see `docs/qa/LOAD-READINESS.md`): no registration or submit writes a shared
document; the only shared writes are one block reservation per 10 pass numbers per instance,
spread over 8 shards.

`firestore.rules` denies **all** client reads and writes. Even if someone adds the
Firebase browser SDK later, rules block direct database access.

## Privacy model

### Server-only secrets

- `ADMIN_PIN`, `STAFF_SERVICE_TOKEN`, `OTP_COOKIE_SECRET`, SMTP/Resend keys, Firebase service account
- Pending OTP state lives in a signed **HttpOnly** cookie only (never in the store)
- Staff auth is an **HttpOnly** `aym_staff` cookie (HMAC of PIN)

### Public API (`POST /api/aym-store`)

| Operation | Who | Data returned |
|-----------|-----|----------------|
| `regStart`, `regResend`, `regVerify` | Anyone | OTP flow status only; no pending OTP in store |
| `regMe`, `regRecover` | Signed-in delegate | Own profile (name, email, regNo, …) |
| `set` (new question) | Signed-in delegate | OK/error only |
| `lookup` (ticket) | Anyone | Own questions/answers by ticket ID (no email/name) |
| `lookup` (email) | Signed-in delegate matching that email | Same as ticket lookup |
| `get` `aym:clusters` | Anyone | **Published** cluster answers only (no PII) |
| `wacResultsGet` | Anyone if published | Selected student rows (name, email, institute) |
| `ping`, `whoami` | Anyone | Backend name, staff flag, `hasPin` |
| `publicStats` (also `GET /api/aym-store?op=publicStats`, CDN-cacheable ~30 s) | Anyone | Aggregate counts only (probe / demo data excluded) |

### Staff-only API (requires `aym_staff` cookie)

`staffSnapshot`, `regUsers`, `list`, `stats`, `get` (except config/clusters public slice),
`set`/`del` on arbitrary keys, cluster editing, WAC upload/mail, full WAC rows when unpublished.

## Enable Firestore on Vercel

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Firestore Database → Create database**  
   Choose a region close to users (e.g. `asia-south1` for India). Production mode is fine.
3. **Project settings → Service accounts → Generate new private key.**
4. In Vercel → Project → Settings → Environment Variables, add (Production + Preview):

   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   Paste the private key with literal `\n` newlines, or use `FIREBASE_SERVICE_ACCOUNT_JSON` as one JSON line.

5. Deploy rules from this folder:

   ```bash
   firebase deploy --only firestore:rules
   ```

6. Redeploy the app. Ping should report `"backend": "firestore"`.

Keep `BLOB_READ_WRITE_TOKEN` during cutover if you want Blob as fallback until you verify Firestore.

## Migrate Blob → Firestore

One-time, idempotent script (safe to re-run):

```bash
cd ayurmarg-preview
# .env.local needs BLOB_READ_WRITE_TOKEN + FIREBASE_* vars
node scripts/migrate-blob-to-firestore.js --dry-run   # preview counts
node scripts/migrate-blob-to-firestore.js             # write to Firestore
```

After migration:

1. Confirm ping shows `backend: "firestore"`.
2. Staff login → verify delegate count and questions match pre-migration.
3. Optional: remove `BLOB_READ_WRITE_TOKEN` from Vercel once satisfied (Firestore takes priority when creds exist).

## Blob vs Firestore

| | Vercel Blob | Firestore |
|---|-------------|-----------|
| Model | Single JSON file | Document collections |
| Queries | Load entire file | Indexed field queries (`ticketLower`, `emailLower`) |
| Concurrency | Read-modify-write on whole blob | Per-document writes |
| Backups | Blob versioning / manual export | GCP automated backups, point-in-time recovery (paid) |
| Cost | Blob storage + ops | Free tier generous; pay per read/write/storage at scale |
| Cold start | Smaller bundle | `firebase-admin` adds ~few MB to serverless function |
| Privacy | Private blob + server API | Rules deny clients; Admin SDK only |

**Recommendation:** Use **Firestore** for production. Blob was a good bootstrap (one JSON file, no GCP setup) but does not scale for concurrent registrations, lacks query indexes, and rewrites the entire store on each change.

## Consequences of switching

**Pros:** Proper database, indexed lookups, GCP security tooling, better concurrency, optional backups/PITR, clearer data model.

**Cons:** Firebase billing after free tier, GCP project + service account management, env var hygiene (never commit keys), slightly larger serverless bundles, need to pick a Firestore region (data residency).

**Migration risks:** Existing Blob data is not auto-copied — run the migration script or lose registrations. During dual-backend period, Firebase creds win over Blob; ensure migration completes before relying on Firestore-only.

**Privacy:** Secure when rules deny all client access and the service account key lives only in Vercel env. Rotating the key requires updating Vercel and redeploying.
