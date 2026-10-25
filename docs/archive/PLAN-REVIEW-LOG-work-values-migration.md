# Plan Review Log: Work-Values redesign + progress %, entry trim, character summary
Act 1 (grill) complete — plan locked with the user. MAX_ROUNDS=5.

Reviewer model: gpt-5.5 (config default gpt-5.3-codex 400s on ChatGPT-account auth; overridden with -c model="gpt-5.5"). codex-cli 0.144.5. thread_id=019f715f-3ad9-7421-989a-a6503addd093.

## Round 1 — Codex
No files modified. Material problems required before implementation:

- `valuesFit` schema conflict: PLAN said 0–1, UI (App.jsx:955-958,1199) renders `overall`/100, `%`, `axisFit`, `detailFit`, "Plane fit". Fix: one response shape, 0–100 ints, drop axis/plane fields from UI/tests.
- O*NET parsing underspecified: `Work Values.txt` has `EX` extent rows + `VH` high-point rows, `Data Value` on 1–7 scale, not 0–100. Fix: parse only `Scale ID === "EX"` for the six values, normalize `(value-1)/6*100`. (Codex cited the O*NET Work Values data dictionary.)
- Values tournament resume state missing from serializer/progress. Fix: serialize `valueItems`, `pendingComparison`, `valueRanking`, `progress.values`.
- Ford–Johnson named not specified; HTTP serving corruptible on stale/double answers. Fix: pure tournament engine, exhaustive 720-permutation test proving ≤10 comparisons, require `{comparisonId, winner}` with stale-answer rejection.
- New `summary` step renders blank — App.jsx (1368) only renders known step bodies + `tree`. Fix: Summary component + frontend API call + resume handling + backend `POST /api/summary/continue`.
- AI spend/race gap: persona on no-CV path fires from `/api/cv/journey`, which is NOT in `aiLimiter` (server.js:111-120). Fix: add `/api/cv/journey` to `aiLimiter`, single-flight lock CV completion on both routes.
- Work Values absent from AI digest; `whyThisFits` still defines "values" as top job-char priority (prompts.js:328); `scoreProfessionValues` still emits 10-key Schwartz schema (prompts.js:173). Fix: add confirmed work-value order/scores to `buildProfileDigest`, retarget `whyThisFits` + value scoring to MWV.
- `userValues` provenance wrong for an explicit instrument: hardcodes `confidence:"low", source:"inferred"` (sessionStore:257). Fix: `{scores, order, source:"tournament", confidence:"explicit", curveVersion}`.
- Rank-to-score curve is a cross-layer contract but unnamed. Fix: one pure `rankToWorkValueScores(order)`, backend-confirmed scores authoritative.
- Persisted-session migration absent; Redis-hydrated sessions can skip the new `values` step or carry old 10-key Schwartz vectors. Fix: session schema version + reset/migrate unfinished/old sessions on hydrate.
- Output-detail cleanup incomplete: Schwartz labels + "Plane fit" remain (App.jsx:940,957-958; NodeComponent.jsx:18). Fix: replace all Schwartz label maps; remove or synthesize deterministic MWV `valuesRationale`.

VERDICT: REVISE

### Claude's response (Round 1)
Verified every finding against the code — **all 11 accepted, none rejected.** My one initial doubt (the Redis migration point) was checked and confirmed valid: CLAUDE.md calls the store "in-memory Map with TTL sweep," but `sessionStore.js` has optional Redis write-through (`_persist` on every mutation, `hydrate()` JSON.parse on startup), so persisted sessions genuinely survive deploys and need migration. Also confirmed: `valuesFit` shape is `{overall,axisFit,detailFit}` (App.jsx:957-958); `/api/cv/journey` is absent from the `aiLimiter` path list (server.js:111-118); `whyThisFits`/value-scoring still use Schwartz vocabulary (prompts.js:173,328); provenance hardcoded (sessionStore:257). PLAN.md revised: added Section H (session schema version + migration), a `valuesFit`/`rankToWorkValueScores`/tournament-state contract block, O*NET `EX`-scale parsing spec, tournament-engine spec (pure engine + 720-perm test + `{comparisonId,winner}` + stale rejection), summary route/render wiring, `aiLimiter` + single-flight fix, and MWV retargeting of digest/whyThisFits/scoreProfessionValues.

## Round 2 — Codex (resume, same thread)
Prior blockers all addressed (progress serialization/resume, `valuesFit` shape, O*NET `EX` parsing, tournament tests/idempotency, `userValues` provenance, rank curve, summary route/render, AI limiter/locks, digest updates, Schwartz cleanup, Redis migration). Remaining items called out as **implementation-level, not plan blockers**:

- `buildScoredOutput` call shape not restated. Fix: `resolveProfessionWorkValues({ socCode: rawOutput.socCode, directionId, jobCharProfile })`; test SOC data wins over fallback.
- `/api/values/confirm` double-submit unspecified (only `/answer` covers stale/dupes). Fix: make confirm idempotent when the same order is already stored, or lock per session.
- Backend accepts `/api/cv`//`/api/cv/journey` without `cvIntent` (frontend gates, API doesn't). Fix: reject CV completion unless `session.cvIntent` is set. (Pre-existing gap.)

No new material blocker found.

VERDICT: APPROVED

### Claude's response (Round 2)
Converged. All three non-blocker items folded into PLAN.md (Section E resolver call shape + SOC-wins test; Section F confirm idempotency; Section G optional `cvIntent` API guard, flagged pre-existing). Plan is locked pending user sign-off — no code written in either act.
