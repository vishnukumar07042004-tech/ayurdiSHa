# AYURDISHA knowledge base (AI answer pipeline — knowledge half)

The knowledge base is what the AI drafter is allowed to cite. It is a crawl of authentic, allow-listed
sources (regulators, research councils, WHO, PubMed, the World Ayurveda Congress) chunked into
~500-token passages, plus a question bank of real career questions grouped into intents, one expert
persona per career stream, and a golden-answer file per intent. Nothing here is ever shown to a
student directly: drafts go to the officials' review desk (see `docs/ai/AI-ANSWER-PIPELINE.md`).

State as of 28 Oct 2026.

## What is where

| Path | What |
|---|---|
| `config/ai-sources.json` | Allow-list: 31 sources with domain, authority (`regulator` / `research` / `congress` / `other`), streams, seeds, page caps. The server's retriever and the golden check only accept URLs on this list. |
| `data/kb/chunks.jsonl` | 3,139 chunks `{id, url, title, text, tokens, publishedAt, fetchedAt, authority, streams[], contentHash}` (+ `embedding`, `embeddingModel` once embedded). Bundled into the serverless functions (`vercel.json` `includeFiles`). |
| `data/kb/pages.jsonl` | 629 fetched pages / PDFs (URL, title, ETag / Last-Modified for conditional re-crawl). |
| `data/kb/crawl-report.json` | Per-source crawl status, errors, chunk counts. |
| `data/kb/quality-report.json` | Output of the quality pass: removed chunks by reason, per-stream coverage, blocked sources. |
| `data/kb/golden-report.json` | Output of the golden run: counts, per-stream retrieval sufficiency, cost. |
| `data/kb/changed.json` | Chunks added / changed / removed by the last refresh or upload (for re-checking answers that cite them). |
| `data/kb/cache/` | Raw downloads, logs, backups, `removed-chunks.jsonl` audit (gitignored). |
| `data/kb/manual/` | Optional: officially published PDFs saved by hand for sources that block bots (see below). |
| `data/qbank/qbank.json` | 5,620 student questions (en 2,302 / hi 1,368 / Hinglish 1,950) with theme, subtheme, subject, ask, stage, region, intent. |
| `data/qbank/intents.json` | 368 intents sorted by priority (`rank`), each with canonical question, theme/subtheme, stream. |
| `data/golden/<intentId>.json` | One golden answer per intent (all 368). |
| `server/ai/provider.js` | Provider-agnostic chat + embeddings client (Anthropic / OpenAI / Gemini). |
| `server/ai/personas/` | `index.js` (themes, streams, `personaFor`) + one `<stream>.md` expert prompt per stream. |
| `scripts/qbank/` | `build.mjs` (+ `catalog.mjs`) — builds the question bank and intents; fails if themes drift from the Ask Desk. |
| `scripts/kb/` | Crawl / clean / embed / upload / refresh / golden scripts (below). |

## Scripts

All are plain Node (no extra dependencies) and safe to rerun.

```bash
node scripts/kb/crawl.mjs [--only=domain,...] [--depth=2]   # polite crawl (robots.txt, delays, conditional GETs)
node scripts/kb/clean.mjs [--dry]                           # drop junk chunks, re-tag streams, fix titles → quality-report.json
node scripts/kb/embed.mjs [--batch=64] [--limit=N]          # embed chunks (resume-safe; skips when no key)
node scripts/kb/upload.mjs [--dry] [--prune]                # Firestore kb_chunks, idempotent by id + contentHash
node scripts/kb/refresh.mjs [--skip-upload]                 # weekly: crawl → clean → diff → embed → upload
node scripts/kb/golden.mjs [--top=500] [--only=id,...] [--force] [--min-coverage=0.6]
node scripts/kb/provider-smoke.mjs                          # one tiny chat + embed call to check a key
node scripts/qbank/build.mjs                                # rebuild qbank + intents
```

- **crawl** keeps chunks of sources not crawled in a run (`--only`) or that failed this time, so a
  blocked site never wipes good data. A partial run now merges into the existing crawl report.
  Some `.gov.in` / `.nic.in` sites chain to Let's Encrypt's newer roots; `scripts/kb/certs/` adds them
  via `NODE_EXTRA_CA_CERTS` (TLS verification stays on).
- **clean** (new) re-applies `junkReason()` from `scripts/kb/lib.mjs` to existing chunks. Removed this
  pass: 246 chunks — 158 corrupted Hindi PDF text (legacy-font extraction that cannot be quoted
  verbatim), 52 clinical dosing / treatment-protocol text (drug dossiers, standard treatment
  guidelines — this desk is career-only), 33 NABH website disclaimers, 2 reference lists, 1 legacy-font
  garble. Every removed chunk is kept in `data/kb/cache/removed-chunks.jsonl`. It also re-tagged 536
  chunks (the agency "WHO" no longer matches the pronoun "who"; general abroad chunks are also tagged
  for the Gulf / USA / UK-EU personas and vice versa, because the server retriever filters by stream)
  and fixed 118 junk titles ("/", "7212", "ic").
- **golden** retrieves with local BM25 (+ cosine when embedded), drafts with the stream persona when
  a key is present, then checks the draft: each citation must quote its chunk verbatim, resources must
  be allow-listed, numbers in the answer must appear in a retrieved source. Files that have been
  reviewed (`reviewedBy` set or status ≠ `draft`) are never overwritten. Cost guard: the run stops on
  quota / auth errors; check `golden-report.json` `usage.costUsd`.

## Environment variables (names only)

| Variable | Used by |
|---|---|
| `AI_PROVIDER` | `gemini` \| `vertex` \| `anthropic` \| `openai`; optional, otherwise auto-detected from whichever key exists (Vertex only when set) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | chat; embeddings need OpenAI, Gemini or Vertex (Anthropic has no embedding API) |
| `VERTEX_SA_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`, `VERTEX_LOCATION`, `VERTEX_PROJECT`, `VERTEX_API_KEY` | Vertex AI on Google Cloud billing / credits (see below) |
| `AI_DRAFT_MODEL`, `AI_VERIFY_MODEL`, `AI_VERIFY_ESCALATE_MODEL`, `AI_CLASSIFY_MODEL`, `AI_EMBED_MODEL`, `AI_EMBED_DIM` | optional overrides (default dimension 768) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS`) | `upload.mjs` (same resolution as `server/store.js`) |
| `AYM_KB_DIR` | write KB files somewhere else (e.g. `/tmp/kb` in a serverless cron) |

Default models (override with the env vars above). Each provider falls back down its chain if the
key's tier lacks the first model:

| Provider | Draft | Verify (re-check) | Embeddings |
|---|---|---|---|
| Gemini API / Vertex AI | `gemini-4-argon` → `gemini-3.1-pro-preview` → `gemini-3.8-flash` | `gemini-3.8-flash` (`gemini-4-argon` when unsure) | `gemini-embedding-001` (768-d, normalised) |
| Anthropic | `claude-fable-5-1` | `claude-sonnet-5-5` (`claude-fable-5-1`) | — (uses OpenAI/Gemini key if present) |
| OpenAI | `gpt-6-astra` | `gpt-6.1-sol` (`gpt-6-astra`) | `text-embedding-3-large` (768-d) |

Routing, pricing and the per-day cost estimate are in [AI-ANSWER-PIPELINE.md](AI-ANSWER-PIPELINE.md#models-and-routing).

### Use Google Cloud credits (Vertex AI)

The scripts run on Vertex AI, so Cloud billing / credits pay instead of an AI Studio prepaid key. The
same embedding model (`gemini-embedding-001`, 768-d) is used, so vectors made through Vertex and
through the Gemini API are interchangeable. Console steps (one time, project `ayurdisha-4917b`):
link the billing account with the credits (check the terms cover Vertex AI), enable the Vertex AI API,
grant **Vertex AI User** (`roles/aiplatform.user`) to the Firebase service account
(`FIREBASE_CLIENT_EMAIL`), and add a budget with alerts. Full steps are in
[AI-ANSWER-PIPELINE.md](AI-ANSWER-PIPELINE.md#use-google-cloud-credits-vertex-ai).

`.env.local` (gitignored; names and a placeholder path only):

```
AI_PROVIDER=vertex
VERTEX_LOCATION=global
VERTEX_SA_JSON=/absolute/path/to/service-account.json
```

```bash
node scripts/kb/provider-smoke.mjs        # same check as Settings → Test connection
node scripts/kb/embed.mjs                 # Vertex :predict, one text per request, 4 in flight
node scripts/kb/golden.mjs --force        # drafts with the routing in AI-ANSWER-PIPELINE.md
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json node scripts/kb/upload.mjs
npm run eval:ai                           # live part runs when the provider works
```

Shell variables override `.env.local` (e.g. `AI_PROVIDER=vertex GOOGLE_APPLICATION_CREDENTIALS=… node
scripts/kb/embed.mjs`). Keep `GOOGLE_APPLICATION_CREDENTIALS` out of `.env.local`. It would also switch
the local dev server's store to production Firestore. `VERTEX_SA_JSON` is read only by the AI provider.
Regions: `global` for the newest models; `asia-south1` for India data residency if the chosen models are
listed there (+10% price).

**Key status (28 Oct 2026).** A Gemini API (AI Studio) key is now in `.env.local` and Vercel. It lists
every model and `countTokens` works, but generation and embedding return 402 "prepaid credits are
depleted". The Firebase service-account JSON reaches Vertex AI (token issued) and Firestore (dry-run
upload read `kb_chunks`: empty, 3,139 to add), but Vertex calls return "Enable the Vertex AI API in
project ayurdisha-4917b". Until one of those is fixed, embed / golden drafting cannot run.
Earlier note: Vercel Production has `GEMINI_API_KEY` and the three `FIREBASE_*` variables, but they
are stored as *Sensitive*, so `vercel env pull` only returns placeholders and they cannot be used
locally. Production drafting therefore uses Gemini; the local scripts (embed / upload / golden
drafting) could not run here. To run them, put a key in `.env.local` (gitignored) or the shell:

```bash
GEMINI_API_KEY=… node scripts/kb/embed.mjs
GEMINI_API_KEY=… node scripts/kb/golden.mjs --force     # redraft the needs-draft files
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat sa.json)" node scripts/kb/upload.mjs
```

## Firestore vector index

`upload.mjs` stores embeddings as Firestore vectors in `kb_chunks.embedding`. `findNearest()` needs a
vector index; create it once (dimension must equal `AI_EMBED_DIM`):

```bash
gcloud firestore indexes composite create \
  --project=ayurdisha-4917b \
  --collection-group=kb_chunks \
  --query-scope=COLLECTION \
  --field-config=field-path=embedding,vector-config='{"dimension":"768","flat":"{}"}'
```

Not created yet (no gcloud / credentials on this machine). Without it the server uses its fallbacks:
in-memory cosine over the bundled `chunks.jsonl` when chunks carry embeddings, otherwise BM25.
Production retrieval today is **BM25 over the bundled chunks** (no embeddings yet).

## Coverage (after the quality pass)

3,139 chunks, ~1.34M tokens, from 19 of 31 sources. "Specific" counts chunks tagged with at most three
streams, a better signal of on-topic material than the raw count. "Sufficient" is the number of intents
where at least two retrieved chunks cover ≥ 60% of the question's distinctive terms. That is a
lexical pre-check only; the drafter makes the final "insufficient source" call.

| Stream | Chunks | Specific | Intents | Sufficient intents |
|---|---:|---:|---:|---:|
| pg-entrance | 131 | 45 | 53 | 9 |
| govt-jobs | 815 | 255 | 76 | 4 |
| clinical-practice | 594 | 361 | 32 | 3 |
| panchakarma-wellness | 481 | 281 | 26 | 13 |
| research-phd | 1,782 | 940 | 35 | 13 |
| teaching-academia | 336 | 141 | 9 | 2 |
| industry-pharma | 841 | 264 | 20 | 8 |
| entrepreneurship | 79 | 62 | 13 | 2 |
| export-trade | 261 | 192 | 11 | 6 |
| digital-branding | 76 | 52 | 13 | 1 |
| practice-abroad | 422 | 106 | 22 | 3 |
| abroad-gulf | 288 | **2** | 8 | 3 |
| abroad-usa | 381 | 85 | 8 | 1 |
| abroad-uk-eu | 333 | **22** | 16 | 4 |
| public-health-policy | 815 | 124 | 11 | 6 |
| internship-early-career | 225 | 71 | 15 | 1 |

298 chunks are wildcard (`*`, no stream keyword) and are eligible for every stream.

## Golden answers

368 files in `data/golden/` (all intents; the bank has fewer than 500). Shape:
`{intentId, theme, subtheme, subject, ask, question, stream, region, answer, actions[3], mistake,
resources[2], citations[], status:"draft", createdBy:"ai", model, createdAt, reviewedBy:null, flags[],
retrieved[]}`. `retrieved` lists candidate chunks with BM25 score and term coverage, for the reviewer.

Current state: **0 drafted, 368 `needs-draft`**, 289 of them also `insufficient-source`. These are
metadata-only placeholders because no key was usable locally; resources are pre-filled from the top
retrieved allow-listed pages only when retrieval looked sufficient. Re-run `golden.mjs` with a key to
draft them. Estimated cost: ~$9 with `gemini-4-argon` before 30 Nov 2026 ($2 / $10 per 1M; 368 × ~5.5k
input + ~1.3k output tokens with thinking `low`), ~$18 from 1 Dec ($4 / $20), ~$3 with `gemini-3.8-flash`.
Draft them before December to pay the lower Argon rate.

## Costs so far

$0 for AI calls (no key was usable). Embedding the whole KB once is ~1.34M tokens ≈ $0.20 with
`gemini-embedding-001`; weekly refreshes only re-embed changed chunks.

## Blocked sources

| Source | Status | Why | Workaround |
|---|---|---|---|
| NCISM `ncismindia.org` | empty | HTTP 409 (bot challenge) | save regulations / notices as PDFs into `data/kb/manual/` |
| NTA AIAPGET `exams.nta.ac.in` | blocked | 404 / 403 | save the AIAPGET information bulletin PDF manually |
| National AYUSH Mission `nam.ayush.gov.in` | blocked | 403 | Ministry of Ayush pages partly cover NAM |
| UPSC `upsc.gov.in` | blocked | 403 | save the relevant exam notices manually |
| QCI `qcin.org` | blocked | 403 | manual PDFs (AYUSH Mark scheme) |
| MPPSC `mppsc.mp.gov.in` | failed | robots.txt disallows | respected — do not crawl; manual PDFs only if published for download |
| AIIA `aiia.gov.in`, DHA `dha.gov.ae` | empty | only the home page loaded (no crawlable links; JS-rendered) | manual PDFs / specific deep links as seeds |
| NIA `nia.nic.in`, Rajasthan Ayurveda Dept | empty | pages fetched but none career-relevant | add deep-link seeds to `config/ai-sources.json` |
| DOH Abu Dhabi `doh.gov.ae` | blocked | TLS handshake failure (also via curl) | manual PDFs |
| MOHAP `mohap.gov.ae` | blocked | connection timeout | manual PDFs |

The AYUSH Research Portal (`ayushportal.nic.in`) was TLS-blocked in the first crawl and now works
(244 chunks after cleaning).

Manual ingestion: put the file in `data/kb/manual/` and list it in `data/kb/manual/manifest.json` as
`[{ "file": "x.pdf", "url": "https://ncismindia.org/…", "title": "…", "publishedAt": "2026-…" }]`.
The URL must be on the allow-list; the crawler then treats it like a fetched page of that source.

## Gaps (what will produce "insufficient source")

- **PG entrance**: no NTA bulletin and no NCISM PG regulations, so AIAPGET syllabus, attempts, age
  limits and cut-offs are uncovered. AACCC is thin (5 chunks).
- **Government jobs**: UPSC and NAM are blocked, and state PSCs are thin (Kerala 10, Rajasthan 15,
  Gujarat 4, MP none). Prep / eligibility answers for state Medical Officer exams will mostly be
  insufficient.
- **Gulf**: effectively no regulator content (2 Gulf-specific chunks); DHA / DOH / MOHAP licensing
  questions will be insufficient until PDFs are added manually.
- **UK / EU**: 22 specific chunks (GOV.UK herbal regulation + Swiss OdA AM). Nothing on Germany
  (Heilpraktiker) or other EU registration routes.
- **Teaching**: the NCISM minimum-standards / faculty-eligibility regulations are missing (NCISM blocked).
- **Digital branding**: little beyond the Drugs & Magic Remedies / advertising rules.
- **Hindi**: most Hindi PDF text was corrupted at extraction and removed; Hindi and Hinglish questions
  are answered from English sources.
- **Embeddings**: not created yet (no local key), so retrieval is lexical only and Hinglish /
  paraphrased questions retrieve worse.
