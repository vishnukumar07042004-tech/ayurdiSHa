# DISHA V2 — Phase 1 design + what shipped

**Date:** 2026-11-19  
**Status:** Phase 1 implemented (welcome-by-default scope)  
**Prior audit:** [DISHA-V2-AUDIT.md](./DISHA-V2-AUDIT.md)

## Goals

1. **Welcome by default** — career and professional-skill questions (including coding / apps from zero) are answered, not scripted-declined.
2. **Track = hint** — selected Ask Desk track routes the persona; it never gates a reply.
3. **Human approve before students see** — desk approve / edit unchanged.
4. **No student-facing AI disclosure** — mentor attribution only on Track.
5. **Hybrid cost fallback** — keep quality GPT draft until credits/quota fail; then cheap GPT draft + paid Gemini verify.

## Scope policy (v2)

| Layer | Behaviour |
|---|---|
| Rules | Catch spam / abuse / unsafe / medical / exam integrity / PII asks / chit-chat / homework dumps. Keyword OFF_TOPIC for sport/films etc. is **soft** (label only, low confidence). |
| Scripted replies | Default **off** for OFF_TOPIC / UNFOCUSED (`AI_ALLOW_SCRIPTED_OFFTOPIC=false`). Still on for RESTRICTED, DUPLICATE, and empty chit-chat. |
| LLM router | JSON schema with `routedTrack` + `routingWhy`. Soft OFF_TOPIC / UNFOCUSED always get a second opinion when the triage LLM is on. |
| Coding / apps | `SKILL_LEARNING` → `ON_TOPIC` / `skill-learning`. Never OFF_TOPIC. |

Set `AI_SCOPE_POLICY_VERSION=v1` only to restore legacy keyword OFF_TOPIC confidence gates.

## Config / env flags

| Flag | Default | Meaning |
|---|---|---|
| `AI_SCOPE_POLICY_VERSION` | `v2` | Welcome-by-default vs legacy |
| `AI_ALLOW_SCRIPTED_OFFTOPIC` | `false` | Scripted decline / rephrase for OFF_TOPIC / UNFOCUSED |
| `AI_COMPARE_SAMPLE_RATE` | `0` | Fraction of jobs that still run compare when Settings compareMode is off |
| `AI_KILL_SWITCH` | (unset) | Set `off`/`false` to force pipeline off via env (Settings `enabled` remains the staff kill switch) |
| `PLAN_MODE` | `free` | Ops label (free vs paid) |
| `AI_GPT_CREDIT_FALLBACK` | `true` | After GPT 429 / RESOURCE_EXHAUSTED / billing, flip draft model |
| `AI_GPT_CREDIT_FALLBACK_MODEL` | `gpt-4.1-mini` | Cheap/free draft model used only after credit exhaustion |
| Settings `compareMode` | `false` | Full compare still available for eval desks |
| Settings `scopePolicyVersion` / `allowScriptedOfftopic` | v2 / false | Stored alongside other AI settings |

### Hybrid cost flip (owner-approved)

Until GPT paid credits fail, Hybrid keeps the **quality** draft model (`gpt-5.4` / Settings override).  
On **429 RESOURCE_EXHAUSTED / billing / quota**, `gptCreditFallback.js` latches and subsequent drafts use `AI_GPT_CREDIT_FALLBACK_MODEL`. **Gemini verify stays paid.** Per-call Gemini draft fallback (when GPT errors with time left) is unchanged.

## Answer writer

- Beginner / from-zero structure when the student says they know nothing.
- `mustKnow[]` crucial points (shown as **Must know** callouts on desk preview + Track).
- Never invent URLs; resources only from KB / learning allow-list.
- Never claim “links below” unless resources are present (`scrubFalseLinkClaims`).

## Reviewer UX

- Action / mistake fields are multi-line (wrap) on the Provide-answer modal and DISHA edit panel.
- Resources fields shown on the Provide-answer modal.
- Risk badge shows explainable reasons (not fake “90% confidence”).
- “Why this route” panel from triage `routingWhy` / `routedTrack`.
- Confirm dialog when approving drafts with unsupported claims.

## Eval

```bash
npm run eval:disha
```

Gold seed: `docs/ai/gold-set.jsonl` (includes the coding false-off-topic case). The stub **fails** if that case is OFF_TOPIC or scripted-declined.

## Staff guide (short)

1. Keep DISHA **on** only while you can review the queue; turn off via Settings or `AI_KILL_SWITCH=off`.
2. Coding / app / digital-skill asks are **in scope** — edit the draft, fill Resources from allow-list links, then Approve.
3. If Risk says unsupported claims, fix or confirm before Approve.
4. Students see **mentor name + answer only** — never mention DISHA/AI in student-facing text.
5. If OpenAI credits exhaust, drafts auto-switch to the cheap model; verify stays on Gemini. Recharge GPT to restore quality drafts (restart worker to clear the process latch, or redeploy).

## What shipped (Phase 1 checklist)

1. Scope policy + kill keyword OFF_TOPIC for normal language  
2. Router schema + Tech→entrepreneurship stream fix (no false Internship)  
3. Answer writer beginner + structure + mustKnow  
4. Link scrub / resources honesty  
5. Risk signals (explainable)  
6. Reviewer UX: routing why, unsupported confirm, modal wrap + resources  
7. Config flags + GPT credit fallback  
8. Gold-set + `eval:disha` stub  
9. This doc  
10. Tests in `tests/ai/disha-v2-phase1.test.mjs`

## Open decisions

- Unify product 9 tracks vs triage 10 legacy themes into one config (deferred; aliases remain).
- Whether soft entertainment OFF_TOPIC should ever be scripted again (today: draft path).
- Process latch reset API for GPT credit fallback without worker restart.
