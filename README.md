# AYURDISHA

Digital **Meet the Mentors** hall of the **11th World Ayurveda Congress, Bhubaneswar 2026**.

Vite + React SPA (not Next.js). Live: [https://ayushmarg.vercel.app](https://ayushmarg.vercel.app) · Vercel project `ayurdisha`.

Delegates register, receive an issued WAC number (`11WAC/2026/NNNN`), ask one career question, and track the mentor’s answer. Staff curate, publish the theme stage, and post podcast talks.

## Routes

| Path | What it is |
| --- | --- |
| `/` | Cinematic landing (How it works, Benefits, Register) |
| `/#hall` | The hall — zones, podcast card, selection board |
| `/#podcast` | Podcast corner (second screen from the hall card, not a public nav tab) |
| `/#register` `/#ask` `/#track` | Delegate flow. Track shows a **Mentor’s answer** letter when answered; otherwise **Received** |
| `/#pods` | Knowledge (long-form tabs). No Gemini search in the UI |
| `/#board` | Open theme stage |
| `/mentors` `/mentors/:slug` | Tentative roster (`src/mentors.js`). Old `/mentors/m01`-style ids redirect to name slugs |
| `/about` `/privacy` `/terms` `/disclaimer` | Product copy + clearly marked legal placeholders |
| Staff hashes (`#curate` `#insights` `#pack`) | PIN-gated. Not in public nav |

Unknown paths render a 404 inside the SPA.

## Local

```bash
cp .env.example .env.local   # server-only secrets — never VITE_
npm install
npm run dev                  # http://localhost:5173
npm run build
```

## Env (server only)

See `.env.example`. Do not prefix with `VITE_` (that would leak to the browser).

- `ADMIN_PIN` — staff passcode (step 1 of Staff access; email code + admin approval follow), `STAFF_ADMIN_EMAILS`, `STAFF_SERVICE_TOKEN` (scripts) — see docs/security/STAFF-ACCESS-SPEC.md  
- `RESEND_API_KEY` / `MAIL_PROVIDER` / `MAIL_FROM` / `SMTP_*` — mail (Resend primary, Gmail SMTP fallback; durable queue if both fail)
- `OTP_COOKIE_SECRET` — OTP cookie signing  
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` — Firestore `ayurdisha-4917b`  
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob fallback store  
- `GEMINI_API_KEY` — optional server Knowledge enrichment only (not a public search UI)

## Deploy

From this folder:

```bash
npx vercel --prod --yes
# if CLI auth fails: npx vercel@59.10.0 --prod --yes
```

Preserve: WAC auto-issue, OTP sessions, staff access (passcode + email code + admin approval), merge/Excel/briefing board, `podcastsList`/`podcastsSave`, Firestore store.

## Structure

- `src/App.jsx` — hall shell, register, ask, track, staff desks  
- `src/mentors.js` — roster (do not invent people)  
- `src/LegalPages.jsx` `src/NotFound.jsx` `src/AppHeader.jsx` `src/SiteFooter.jsx`  
- `api/` + `server/` — Vercel serverless store  
- `public/robots.txt` `public/sitemap.xml` (generated at build)
