# Career Discovery Journey — Design

**Date:** 2026-07-13
**Branch:** `feat/career-discovery-journey` (off `main`)
**Source:** adaptation of the external "Career Discovery — AI Prompt Spec (v2, corrected)" to the
current v2 engine. The original spec targeted the May–June codebase (40-row values inventory,
no RIASEC / jobChar / CV steps). Its Section 3 (pairwise values ranking) is superseded by the
jobChar ranking step and is **not** implemented. Sections 1, 2, 5, 6 are adapted below.

## Decisions made with the user

1. **Adapt to v2**, not literal execution (literal would revert RIASEC/jobChar/CV).
2. **Static psychometrics**: Big Five *and* RIASEC move to fixed static item banks, no AI
   generation. jobChar keeps its 5|10 depth choice and AI tradeoff questions — personalization
   is the point there.
3. **"Why this fits" is a separate second AI call** (option B), not an extension of the output
   JSON schema.

## Copy rules (apply to every new user-facing string)

- Plain, human words. No jargon, no "leverage/utilize/synergy".
- No passive voice. Short sentences, one idea each.
- Every claim about the person names the specific answer/score behind it.
- No filler intros.

## 1. Fixed assessment — remove depth branching and item generation

- Delete the `depth_choice` step: route `POST /api/session/big-five-depth`, the
  `depth_choice` branch in `questionEngine.pickNextQuestion`, `DepthChoiceCard` and its
  stage branch in `App.jsx`, `stepHeading`/`stepProgressText` entries.
- Step machine becomes: `entry → demographics → big_five → riasec → job_characteristics → cv → tree`.
  After the last demographics answer the session advances directly to `big_five`.
- Big Five: always the static `MINI_IPIP_20` from `bigFiveItems.js`. Delete
  `generateBigFiveItems` from `aiEngine.js`, `IPIP_50` from `bigFiveItems.js`, the
  `AI_BIG_FIVE_ITEMS` env flag (code, `.env.example`, docs).
- RIASEC: always the static 12-item pool from `riasecItems.js`. Delete `generateRiasecItems`
  and the 18-item deep variant. `/api/riasec/skip` inference path is unchanged.
- `session.bigFiveDepth` and the snapshot's `bigFive.depth` are removed; the frontend stops
  reading them. Live sessions holding the old field are not migrated — TTL clears them and
  the snapshot code ignores unknown fields.
- jobChar step: unchanged.

## 2. "Career Discovery Journey" rail — display copy only

Execution order does not change. A full rail screen shows once, after entry and before the
first demographics question; a condensed version (current step highlighted) lives in the
assessment header on every step, replacing today's bare heading:

| Rail label                            | Est.     | `session.step`        |
| ------------------------------------- | -------- | --------------------- |
| About you                             | ~1 min   | `demographics`        |
| Step 1 — How you think                | 2–3 min  | `big_five` (20 items) |
| Step 2 — What truly interests you     | 2 min    | `riasec` (12 items)   |
| Step 3 — What motivates you           | 2–3 min  | `job_characteristics` |
| Step 4 — Your skills & experience     | 1–2 min  | `cv`                  |

`stepHeading()` / `stepProgressText()` in `App.jsx` return the matching rail label per step.
No backend change; this is a frontend-only section apart from the removed `depth` field.

## 3. Result screen — personality takeaways + "Who you are"

Lives in the profile panel (`ProfileCharts.jsx`), where the Big Five radar already renders.

- **Per-axis one-liners**: deterministic, no AI. Each trait score maps to a low/mid/high band
  with one plain-language line naming the score
  (e.g. `Openness 78 → "New ideas pull you more than familiar routines."`).
  Neuroticism is displayed as **"Emotional Steadiness"** with inverted copy; the stored score
  and scoring keys do not change.
- **"Who you are" prose (3–5 sentences)**: new generator `generatePersonaSummary` in
  `aiEngine.js` (prompt from `bigFiveScores` + `derivedTraits.summary`; second person, present
  tense, no hedging, every claim traced to a score). Runs once at the `cv → tree` transition
  (same place `userValues` inference already runs), stored as `session.personaSummary`,
  serialized in the snapshot. Deterministic fallback assembles prose from
  `derivedTraits.summary` bands so the block always renders keyless.

## 4. Structured "Why this fits" — separate second call

- New prompt builder `buildWhyThisFitsPrompt(session, output)` in `prompts.js` and generator
  `generateWhyThisFits` in `aiEngine.js` (normalizer + deterministic fallback, JSON mode,
  explicit `max_tokens`).
- Called inside `POST /api/output/first` and `POST /api/output/refine` after
  `buildScoredOutput`, attaching `output.whyThisFits`. The frontend still makes one request
  and receives the full snapshot. The core output call and its JSON schema are untouched;
  `whyFit` stays in the data but the UI renders the structured block instead.
- Shape:

```json
{
  "personality":     [{ "point": "" }, { "point": "" }],
  "interests":       [{ "point": "" }],
  "values":          [{ "point": "" }],
  "currentSkills":   [{ "point": "" }],
  "skillsToDevelop": [""]
}
```

  2 personality bullets (trait + direction → one-line consequence), 1 interest bullet (from
  `riasecCode`), 1 values bullet (from the user's top-ranked jobChar parameter — if the top
  rank conflicts with the role, say so plainly instead of hiding it), 2–3 current skills
  (from the CV digest / journey answers), 3–4 skills to develop.
- Every bullet must trace to a specific score, rank, or answer — the normalizer rejects
  responses with wrong bullet counts and falls back.
- Deterministic fallback: bullets assembled from Big Five bands, the top RIASEC letter, the
  top-ranked jobChar param, digest skills, and the matched direction's `professionSeeds`.
- Frontend: the output node/dock renders the structured block; the dead `path.whyItFits`
  branch in `GraphView/NodeComponent.jsx` is removed.

## 5. Testing

- Route tests: `/api/session/big-five-depth` returns 404; step ordering without
  `depth_choice`; demographics completion advances straight to `big_five`.
- Normalizer tests for `generateWhyThisFits` and `generatePersonaSummary`: valid payload,
  malformed payload → fallback, keyless → fallback; bullet-count enforcement.
- Snapshot serialization without `depth`; `output.whyThisFits` present on first and refined
  outputs in the full output-loop test.
- Both modes verified: with `OPENAI_API_KEY` and keyless (repo rule).

## Out of scope

- Section 3 of the original spec (pairwise values ranking) — superseded by jobChar.
- Section 4 (extra demographics questions) — superseded by the CV / career-journey step.
- Any MarkItDown / CV-format work (lives in PR #6).
- jobChar depth or tradeoff generation changes.
