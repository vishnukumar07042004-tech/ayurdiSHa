# One-time staff review link

Give a coding agent (or a human reviewer) temporary **read-only** staff desk access **without** sharing the staff passcode (`ADMIN_PIN`). The link is single-use and time-limited. It is not a permanent passwordless backdoor.

Live: https://ayushmarg.vercel.app

## How it works

1. An **admin** already signed in via normal Staff access creates a one-time invite.
2. The server stores only a **hash** of a random token under `aym:staff:review:*` (TTL 30–60 minutes, default 45).
3. The admin UI shows the full URL **once** (copy it). The permanent passcode is never put in the link or emailed.
4. Opening `https://ayushmarg.vercel.app/#staff?review=<token>` (or `/staff/review/<token>`) redeems the invite **once**, sets a short-lived signed `aym_staff` cookie (`v:4`, kind `staff_review`, role `review`, `reviewOnly: true`).
5. After **logout**, **TTL**, or a **second redeem attempt**, the link is dead. The UI shows “already used or expired”.

Read ops allowed (examples): `whoami`, desk pages (`staffCounts` / `staffQuestionsPage` / …), `list` / `stats` / `get`, Insights/DISHA **read** (`aiQueue`, `aiIndex`, `aiConfigGet`, …).

Blocked for review sessions: approve / edit / reject / publish, WAC import/clear, mail send/retry, pin/config changes, deletes, co-admin decisions, etc. (`code: review_only`).

Audit actions (hash **prefix** only — never the raw token): `review.invite`, `review.redeem`, `review.signout`.

Redeem is rate-limited per IP (20 attempts / 15 minutes).

## Admin steps

1. Sign in at https://ayushmarg.vercel.app with Staff access (passcode + email code) as admin (`STAFF_ADMIN_EMAILS`).
2. Open **Staff portal**.
3. In **One-time review link**, pick 30 / 45 / 60 minutes → **Create one-time review link**.
4. **Copy the URL immediately** (shown once). Paste it to the reviewer out of band (chat, etc.).
5. When they are done (or if the link leaks), ask them to **Sign out** — or wait for TTL. Create a new link for the next review.

## What to give a Cursor coding agent

Paste something like:

> Use this one-time AYURDISHA staff **review** link (read-only). Open it in the browser (or fetch with credentials after redeem). Do **not** approve, publish, import, delete, or change settings. When finished, **Sign out** from the staff bar so the session dies. Do not ask for or store `ADMIN_PIN`. Link:  
> `https://ayushmarg.vercel.app/#staff?review=…`

Agent tips:

- Prefer `whoami`, desk/Insights/DISHA **read** ops for review.
- Expect `403` / `review_only` on writes — that is intentional.
- Do not retry a spent link; ask the admin for a fresh one.
- Never log or commit the full token; treat it like a secret until it expires.

## Env names (values never in git / docs)

| Name | Required? | Purpose |
|---|---|---|
| `OTP_COOKIE_SECRET` | already used | Signs the review session cookie (same as normal staff cookies). |
| `ADMIN_PIN` | already used | Normal staff passcode only — **never** put in the review URL. |
| `STAFF_ADMIN_EMAILS` | already used | Who may create invites. |
| `PUBLIC_SITE_URL` | optional | Host used when building the invite URL (defaults to request host, then `https://ayushmarg.vercel.app`). |
| `STAFF_REVIEW_SECRET` | **not used** | Reserved name; current design reuses the existing cookie signing secret and stores token hashes server-side. |

No new secret is required to enable this feature after deploy.

## Security limits

- Not a permanent passwordless staff URL.
- Single redemption; logout and TTL both end access.
- Read-only server gate (not UI-only).
- Tokens never logged; audit stores an 8-char hash prefix only.
- Anonymous internet still cannot open staff without a valid unused invite or a normal staff session / service token.
- Do not auto-publish DISHA drafts from a review session (approve ops are blocked).
