# Job Fair — separation stub (P1/P2)

**Status:** Not built for Dec 2026 mentoring launch. Documented so mentoring and Job Fair never share data by accident.

## Rules

- Job Fair is a **separate workflow**: separate tables/collections, separate staff roles, separate UI routes.
- Job Fair roles **must not** read `aym:q:*`, clusters, AI drafts, answer bank, or mentor briefs.
- Mentoring staff roles **must not** gain Job Fair employer/applicant PII unless product explicitly dual-grants later.
- No fake Job Fair UI in the mentoring app until a real owner ships schema + authz.

## Suggested future namespace (additive only)

| Concern | Proposed prefix / collection |
|---------|------------------------------|
| Employer booths | `aym:jf:employer:*` |
| Applicant profiles | `aym:jf:applicant:*` |
| Interviews / slots | `aym:jf:slot:*` |
| Staff role | `jobfair-coordinator` (not `co-admin` mentoring) |

## Until then

- Footer / nav may omit Job Fair or link to an external WAC page only.
- Mentoring promise copy must not imply Job Fair placement.
