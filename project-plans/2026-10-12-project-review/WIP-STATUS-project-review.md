# WIP status: whole-project & product-idea review

**Updated:** 2026-10-12 (second session, `/grill-me`) · **Status: task plan written, wave 1 blocked on workers**

## Latest (supersedes "Where it stopped" below)
- Act 2 (Codex review of the strategy) **skipped by Eugene**; review moves to per-diff verification.
- Follow-up grill changed decisions #7 (accounts **before** the pilot, mandatory before start,
  Supabase EU, magic link + Google, day-14 check-in email, under-16 only via cohort link) and
  #9 (7 languages: EN, UA, RU, FR, DE, ES, PT). `sex` stays as is.
- Full decision log + ordered task list + owner split: **`PLAN-project-review-tasks.md`**.
- Done: T2 (`store: false` on Responses calls, test added, 195/195 green, uncommitted).
- Blocked: worker tasks T3/T11 (wave 1). Codex hit the ChatGPT usage limit until 2026-10-28;
  `agy`/`opencode` not installed; no `dispatch` skill / `dispatch-policy.md` on disk.
- Waiting on Eugene: T1 (Supabase EU project, Google OAuth client, EU SMTP provider, keys).

---

# WIP status: whole-project & product-idea review (`/grill-me-codex`)

**Updated:** 2026-10-12 · repo at `fdc5896` (main) · **Status: PAUSED between Act 1 and Act 2**

## Where it stopped
- **Act 1 (grill) — DONE.** All decisions locked with Eugene and written to
  [`PLAN-project-review.md`](PLAN-project-review.md). Do not re-grill; the
  decisions are final unless Eugene reopens them.
- **Act 2 (Codex review) — NOT STARTED.** Round 1 failed before any review:
  `~/.codex/config.toml` pins `model = "gpt-5.3-codex"`, and Codex returns
  `400: The 'gpt-5.3-codex' model is not supported when using Codex with a ChatGPT account.`
  No round is logged. Eugene is reworking the skill for Claude Code; wait for it.
- **Act 3 (build) — not applicable yet.** No code has been written. None should be
  written until Act 2 resolves and Eugene signs off.

## Files
| File | Role |
|---|---|
| `PLAN-project-review.md` | The locked plan (Goal / Approach 1–7 / decisions / risks / out of scope) |
| `PLAN-REVIEW-LOG-project-review.md` | Review log, initialised, `MAX_ROUNDS=5`, no rounds yet |
| `WIP-STATUS-project-review.md` | This handoff |

`PLAN.md` / `PLAN-REVIEW-LOG.md` at the repo root belong to an **older, finished**
task (the assessment-logic document). Leave them alone.

## How to resume
1. Make sure the reviewer model works with a ChatGPT account. Either remove or
   change the `model` line in `~/.codex/config.toml`, or pass `-c model="gpt-5.5"`
   per call. Use whatever the reworked skill says. A trivial probe:
   `codex exec -s read-only --json "Reply OK" < /dev/null`.
2. Run Round 1 of Act 2 against `PLAN-project-review.md`, read-only, and append
   it to `PLAN-REVIEW-LOG-project-review.md`. Use this extra framing in the
   review prompt: the plan is a product-strategy and work-programme plan. Attack
   both the product decisions (user, differentiator, monetisation, metric,
   sequencing) and how well they fit the actual code.
3. Claude is the final arbiter on each REVISE. Log what was accepted or rejected
   and why. Never change a decision Eugene made in the grill without asking him.

## Decisions locked in the grill (summary — the plan has the detail)
1. **Primary user:** students 17–24, monetised B2C. The UA school pilot (ages
   14–17) stays as the first real-user cohort.
2. **Differentiator:** "from profile to concrete, real, local next steps"
   (universities, courses, events, each with a real link). The psychometrics and
   the graph are not the differentiator.
3. **Sourcing:** a hybrid. Universities come from a curated UA snapshot
   (ЄДЕБО / vstup.osvita.ua), courses from a small catalog, events from web
   search plus JSON-LD verification after the pilot. The LLM only selects from a
   server shortlist. Rule: no item without a real link.
4. **Taxonomy:** O*NET stays the matching core. Add the chain SOC → ISCO-08
   (BLS crosswalk) → UA КП → hand-made ISCO-group → UA specialty codes. US salary
   is hidden or flagged for non-US users.
5. **Privacy-by-design before the pilot:** policy and consent screen; under-16
   users get no CV upload and give parental consent through the school; PII is
   scrubbed before OpenAI; sessions have a retention period and a
   "delete my data" action.
6. **North star:** "took a real step within 14 days", measured by link clicks
   plus a school follow-up. The secondary funnel goes through cookieless
   PostHog EU.
7. **Free/Premium:** Free gets 1 verified step per block. The paywall and
   accounts come only after the pilot shows activation. This contradicts the
   business report.
8. **RIASEC:** adaptive over the O*NET Mini-IP pool. Start at 12 items (2 per
   type), add items while the top-3 is unstable, cap at 30. The engine is
   deterministic and pure.
9. **Languages:** all six (EN, UA, ES, FR, DE, PT) **before** the pilot. This is
   Eugene's choice over "UA+EN first".
10. **Order:** privacy → analytics → i18n (6 languages) → UA local steps →
    adaptive RIASEC → pilot → events / paywall.

**Deferred by Eugene to a separate track (not decided):**
- infrastructure for a classroom: per-IP rate limits in `backend/server.js:121-133`
  would block a class behind one NAT; the Render free tier sleeps; OpenAI limits;
- deployment.

**Not confirmed:** design freeze during the pilot, and the positioning wording
("validated instruments + O*NET; self-exploration, not a diagnosis"). It was the
default and Eugene did not contest it.
