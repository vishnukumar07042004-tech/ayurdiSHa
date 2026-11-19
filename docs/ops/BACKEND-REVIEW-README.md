# AYURDISHA staff/backend review pack

Give a coding agent this **self-contained PDF** when a one-time review URL is unavailable or already spent.

## Download

**PDF:** [`docs/ops/AYURDISHA-Staff-Backend-Review.pdf`](./AYURDISHA-Staff-Backend-Review.pdf)

Absolute path on this machine:

`/Users/vishnukumar/AndroidStudioProjects/heybee/ayurmarg-preview/docs/ops/AYURDISHA-Staff-Backend-Review.pdf`

## Contents

- Title, date, live URL (`https://ayushmarg.vercel.app`), stack one-liner
- Architecture: Ask → store → DISHA queue → draft → human approve → Track / answer bank
- Security: review-only vs admin; never auto-publish
- Annotated screenshots of staff desks + key student surfaces
- Explicit **Not built yet** for huddle / 1:1 booking

## Related

| Doc | Purpose |
|-----|---------|
| [`BACKEND-REVIEW-CAPTURE.md`](./BACKEND-REVIEW-CAPTURE.md) | Screen inventory, routes, masking rules |
| [`STAFF-REVIEW-LINK.md`](./STAFF-REVIEW-LINK.md) | How to mint a fresh one-time review URL (when usable) |
| `backend-review/screens/` | Raw PNG captures used in the PDF |
| `backend-review/build-pdf.py` | ReportLab rebuild script |

## Rebuild

```bash
# optional: refresh screens (needs Chrome + .env.local STAFF_SERVICE_TOKEN; never logs it)
node scripts/ops/backend-review-capture.mjs
node scripts/ops/backend-review-recapture.mjs   # PII scrub + local how-it-works

python3 docs/ops/backend-review/build-pdf.py
```

Do **not** put `ADMIN_PIN`, passcodes, API keys, review tokens, or raw emails/phones into the PDF or these docs.
