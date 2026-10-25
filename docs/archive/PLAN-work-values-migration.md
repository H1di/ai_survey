# Plan: Work-Values redesign + progress %, entry trim, character summary
_Locked via grill — by Claude + Eugene (h1di)_

## Goal
Five coupled changes to Life Path Explorer's assessment flow. (1) Show a running numeric
completion **percent** during the assessment. (2) Remove the rhetorical **"Why are you here?"**
entry question entirely (data model + prompts + tests), leaving `dreamAnswer` as the single entry
question. (3) Replace the **Schwartz 10-value** model wholesale with the **Minnesota / O\*NET 6
Work Values** (`achievement, independence, recognition, relationships, support,
working_conditions`), including a full module rename. (4) Replace the AI-inferred values step with
an **explicit adaptive pairwise tournament** (Ford–Johnson merge-insertion, ≤10 comparisons for 6
items) that yields a strict 1–6 hierarchy, shown in the existing reorderable vertical table with a
"You can modify it" confirm gate. (5) Add a new **`summary` step** between `cv` and `tree` — a
full-screen "who you are" conclusion: a circular character chart (Big Five radar) + deterministic
named archetype + AI persona prose.

The app must keep working **keyless** at every step (deterministic fallbacks), an invariant of this
repo.

## Approach

### A. New step order & state machine
Insert two steps. New order:
```
entry → demographics → big_five → riasec → values → job_characteristics → cv → summary → tree
```
- Backend `session.step` string set gains `values` and `summary` (cross-layer contract; update
  frontend `stage`/step handling to match).
- `riasec` completion (`/api/riasec/answer` last item + `/api/riasec/skip`, server.js ~246→ now
  advances to `values` instead of `job_characteristics`).
- New values endpoints advance `values → job_characteristics`.
- `cv` completion (server.js 350 path that currently sets `tree`) advances to `summary`.
- New `summary` acknowledge advances `summary → tree`.
- `JOURNEY_RAIL` in `frontend/src/lifePath.js` gains the two stages (display-only rail).

### B. Progress percent (change 1)
- `overallProgress()` in App.jsx already computes `{answered,total,percent}` and renders a fill bar.
  Add a **visible numeric label** (e.g. `42%`) next to/over the bar.
- Extend the denominator to include the `values` stage as a **fixed 10** questions (worst-case
  Ford–Johnson count, keeps percent monotonic even though a run may finish in fewer) and the
  `summary` step contributes 0 counted questions.
- Entry contributes 0 counted questions (unchanged), now with only `dreamAnswer`.
- **Serialize `progress.values` (Codex R1).** `questionEngine.js`/`serializeSessionState` currently
  expose `progress.{demographics,bigFive,riasec,jobChar,journey}`; add
  `progress.values = { answered, total: 10, active }` so `stepProgressText`/`overallProgress` and the
  rail can read it. The serialized tournament state (`valueItems`, `pendingComparison` with its
  `comparisonId`, `valueRanking`) lives on the session and is included in the snapshot so a
  refresh/resume mid-tournament restores the exact pending comparison.

### C. Remove "Why are you here?" (change 2) — full removal
- Frontend: delete the `whyHereAnswer` textarea + state + submit gating in App.jsx; `dreamAnswer`
  becomes the sole required entry field.
- Backend: drop `whyHereAnswer` from `POST /api/session/start` validation (server.js ~170–186),
  from `sessionStore.createSession`, from `serializeSessionState`, from `buildProfileDigest`
  (prompts.js 19/36) and from `aiEngine.js` digest input (99).
- Tests: update ~15 references across `sessionStore.test.js`, `server.test.js`,
  `onetIntegration.test.js`, `rateLimit.test.js` to drop the field (and delete the
  "whyHereAnswer required/blank/capped" assertions in server.test.js 127–136).

### D. Work Values model swap (change 3) — full rename, module rewrite
`schwartzValues.js` is **rewritten**, not field-swapped: Schwartz's circular structure
(higher-order poles, plane axes, `dominantPole`, circular order, hedonism split) has **no analog**
in the 6 independent MWV scales.
- Rename `backend/schwartzValues.js` → `backend/workValues.js`; `SCHWARTZ_ORDER` →
  `WORK_VALUES_ORDER` (the 6 keys above); `SCHWARTZ_VALUE_META` → work-value meta; delete
  `deriveHigherOrder`, `deriveAxes`, `dominantPole`, hedonism handling, circular-order/prototype
  keys tied to Schwartz.
- Keep/redefine: `deriveTopValues` (top-N of 6), `valuesFit(userV, jobV)` → **centered cosine
  (Pearson-style) similarity of the two 6-dim vectors**, mapped to **a single `{overall: 0–100
  integer}`** (no axis term — there are no axes). `buildFallbackProfessionValues` and
  `JOB_CHAR_VALUE_INFLUENCE` redefined per-direction for the 6 MWV keys.
- **`valuesFit` shape is a hard cross-layer contract (Codex R1).** Today the UI reads
  `valuesFit.overall`/100, `.axisFit`, `.detailFit`, `%`, and prints "Plane fit …"
  (App.jsx:955-958, :1199). The new shape is `{overall}` only — **delete every `axisFit`/`detailFit`/
  "Plane fit" reference** in App.jsx, `NodeComponent.jsx` (:18 label map), and tests.
- `frontend/src/components/SchwartzMap.jsx` + `.css` → **deleted**, replaced by a 6-axis
  **Work-Values radar** (new component in/near `ProfileCharts.jsx`, reusing the recharts Radar
  already used for Big Five). Overlay "you vs profession" in the output detail panel; "you" alone on
  the summary screen.
- `buildScoredOutput` (server.js 471–492): drop `higherOrder/axes/dominantPole`; keep
  `topValues` + `valuesFit`. `serializeSessionState` (sessionStore 336) drops `userValuesAxes`.
- Prompts / `prompts.js`, `directions.js` prototype keys, and all `schwartz*` identifiers in
  `aiEngine.js`, tests (`schwartzValues.test.js` → `workValues.test.js`, `prompts.test.js`,
  `aiEngine.test.js`, `server.test.js`) renamed. The 6-key list becomes the new cross-layer
  contract (backend ↔ frontend labels), replacing `SCHWARTZ_ORDER`.
- **Sweep the Schwartz vocabulary out of the AI layer (Codex R1).** `scoreProfessionValues` still
  emits the 10-key `schwartzValues` JSON schema + `valuesRationale` (prompts.js:173-178); since
  section E removes AI value scoring, delete that generator's schema. `whyThisFits` still defines
  its "values" bullet as "the person's top-ranked **job-characteristic** priority"
  (prompts.js:328) — retarget it to **MWV fit** (user's top work values vs the occupation's).
- **Feed confirmed work values into `buildProfileDigest` (Codex R1).** The digest currently omits
  work values, so `whyThisFits` cannot reason about them. Add the confirmed 6-key order/scores to
  the digest so the (retained) AI explanation is grounded. `valuesRationale`: either drop it or
  synthesize it deterministically from the snapshot MWV scores — do **not** leave the Schwartz
  version.

### E. Profession Work-Values source (change 3, data) — snapshot from O\*NET DB
- **DISCOVERY (build-time, verified):** O\*NET **30.3 removed the Work Values descriptor** — the
  30.3 text distribution has no `Work Values.txt` and no `1.B.2` branch in the Content Model. The
  **last version carrying Work Values is O\*NET 28.0** (data vintage 2020, `Work Values.txt` present,
  874 SOCs). Resolution: keep the occupation/RIASEC/skills snapshot on **30.3**, and **merge Work
  Values from the 28.0 distribution by SOC**. Measured overlap: **874 exact SOC matches + 9
  base-code matches = 883 of 923 occupations (96%)** get real O\*NET values; the remaining **40** fall
  to the per-direction prototype (Section-E fallback, as designed).
- Both distributions download from onetcenter.org/database.html (CC-BY). **Update the snapshot
  `attribution` string** to cite both versions ("information from the O\*NET 30.3 Database and O\*NET
  28.0 Database"). Do **not** touch the fixed `OnetAttribution` badge/footnote wording required by
  CLAUDE.md — only the version note in the data attribution changes.
- Extend `backend/scripts/build-onet-snapshot.js` to take the 28.0 `Work Values.txt` (a second input
  path or a sibling dir) and attach a 6-number `workValues` block to each occupation in
  `backend/data/onet-snapshot.json`. Regenerate the snapshot.
- **Exact O\*NET parse (Codex R1, verified against the real 28.0 file):** `Work Values.txt` columns
  are `O*NET-SOC Code, Element ID, Element Name, Scale ID, Data Value, …`. Each SOC has 6 `EX`
  (Extent, 1–7 importance) rows + 3 `VH` (high-point) rows. Parse **only `Scale ID === "EX"`**,
  normalize the 1–7 `Data Value` to 0–100 via **`(value − 1) / 6 × 100`**, ignore `VH`. Element-ID →
  canonical-key map (verified): `1.B.2.a`→achievement, `1.B.2.b`→working_conditions,
  `1.B.2.c`→recognition, `1.B.2.d`→relationships, `1.B.2.e`→support, `1.B.2.f`→independence.
  Occupations with no matched SOC get `workValues: null` (→ prototype fallback at scoring time).
- `scoreProfessionValues` no longer calls AI. New resolution order for a chosen SOC:
  **snapshot `workValues` for the SOC → per-direction MWV prototype fallback** (when a SOC lacks
  values). AI never scores values; it only *explains* fit via the existing `whyThisFits`
  (unchanged behavior, retargeted to MWV vocabulary). `inferUserValues`/`inferUserValuesFallback`
  (AI value inference at cv→tree, server.js 400/428) are **removed** — user values now come from
  step D's tournament.
- **Restate the `buildScoredOutput` call shape (Codex R2).** Replace the `scoreProfessionValues({...})`
  call with `resolveProfessionWorkValues({ socCode: rawOutput.socCode, directionId, jobCharProfile })`
  and add a test asserting **snapshot SOC `workValues` win over the per-direction prototype fallback**
  when both exist.

### F. Adaptive values tournament (change 4)
- **Static instrument, algorithmic (no AI)** — the 6 MWV values are the items being sorted; each is
  shown with a concrete MIQ-style "need" description. Comparison questions are pairwise A/B
  ("What matters more?"), phrasings fixed in code (like `MINI_IPIP_20`/RIASEC items).
- **Pure tournament engine, not just "Ford–Johnson" hand-waving (Codex R1).** Implement
  merge-insertion (Ford–Johnson) as a **pure, framework-free module** (`backend/valuesTournament.js`)
  that, given the decided comparisons so far, returns either the next `{comparisonId, a, b}` or the
  final strict order. Ship an **exhaustive unit test over all 720 permutations of 6 items** asserting
  (a) the recovered order is correct and (b) comparison count ≤ 10 for every permutation.
- **Stateful over HTTP, corruption-hardened (Codex R1).** Tournament state
  (`valueItems`, decided pairs, `pendingComparison` incl. its `comparisonId`, `valueRanking`) lives
  in the session and is **serialized** (see contract block below). Endpoints:
  - `POST /api/values/start` (step-guarded to `values`) → first `{comparisonId, a, b}` + progress.
  - `POST /api/values/answer` `{comparisonId, winner}` → **rejects a stale/duplicate `comparisonId`**
    (returns the current pending comparison instead of advancing); else records and returns the next
    comparison, or the final ranking when sorted.
  - `POST /api/values/confirm` `{order}` (validated as a permutation of the 6 keys) → sets
    `session.userValues` and advances to `job_characteristics`. **Idempotent (Codex R2):** if the
    same `order` is already stored / step already past `values`, return the current snapshot instead
    of re-advancing (guards double-submit).
- **Provenance (Codex R1).** `session.userValues` for this explicit instrument is
  `{scores, order, source: "tournament", confidence: "explicit", curveVersion}` — **not** the
  hardcoded `{confidence:"low", source:"inferred"}` at sessionStore:257 (that inference path is
  deleted per section E).
- **Magnitudes = one named, backend-authoritative curve (Codex R1).** A single pure
  `rankToWorkValueScores(order)` (in `workValues.js`) maps rank → 0–100 with exact, documented
  scores and a `curveVersion`. **The backend computes and stores the scores** (server snapshot is the
  single source of truth); the frontend only renders. Reordering in the table re-POSTs `confirm`
  (or recomputes client-side purely for preview) so the radar reflects the stored scores.
- UI: after the comparisons, render the existing reorderable vertical table (`RankCard` /
  `moveRankItem` pattern) prefilled with the tournament order, the prompt *"Does this feel like your
  hierarchy?"* + **"You can modify it"**, then Confirm.

### G. Summary / character conclusion (change 5) — new `summary` step
- Full-screen step between `cv` and `tree`: **circular character chart** (reuse Big Five
  `PersonalityRadarChart`) + **deterministic named archetype** (lookup table keyed on RIASEC top
  code + salient Big Five poles) + **AI persona prose** (existing `personaSummary`, deterministic
  fallback) + per-axis takeaways, and the confirmed Work-Values radar. `personaSummary` generation
  **moves** from the cv→tree transition to the cv→summary transition. The `Me`-node `ProfilePanel`
  stays and reuses the same components.
- **Render + route wiring so the step is not blank (Codex R1).** App.jsx (~1368) only renders known
  step bodies + `tree`; add a **`Summary` component** to that switch, a frontend `api.js` wrapper,
  **resume handling** (a mid-`summary` session must re-render it, not fall through), and a backend
  **`POST /api/summary/continue`** (step-guarded to `summary`) that advances `summary → tree`.
- **AI-limiter + double-submit safety (Codex R1).** Persona generation now fires at CV completion
  for **both** paths (`/api/cv` and `/api/cv/journey`). `/api/cv/journey` is **missing from the
  `aiLimiter` list** (server.js:111-118) — add it (and `/api/summary/continue` if it triggers any AI).
  Guard CV completion with a **single-flight/idempotency check** so a double-submit doesn't generate
  `personaSummary` twice.
- **Enforce `cvIntent` server-side (Codex R2, pre-existing gap).** The frontend gates CV paths on
  `cvIntent`, but `/api/cv` and `/api/cv/journey` accept calls without it. Reject CV completion
  unless `session.cvIntent` is set (small hardening, independent of this feature).

### H. Persisted-session migration (Codex R1) — Redis is real
CLAUDE.md calls the store "in-memory Map," but `sessionStore.js` has **optional Redis
write-through** (`_persist` on every mutation, `hydrate()` JSON.parse at startup). A session
persisted before this deploy will be rehydrated with **no `values` step, old 10-key Schwartz
`userValues`, and the removed `whyHereAnswer`**.
- Add a `schemaVersion` to the session shape. On `hydrate()`, **migrate or reset** any session whose
  `userValues` is absent or not a 6-key MWV vector, and whose `step` predates the new machine — the
  safest path is to **drop/expire incompatible unfinished sessions** rather than half-migrate a
  live state machine. Completed (`tree`/output-stage) sessions with old data: expire as well, since
  their `userValues`/`valuesFit`/outputs are Schwartz-shaped and would crash the new UI contract.

## Key decisions & tradeoffs
- **O\*NET DB download over live API.** The occupation API does **not** document a `work_values`
  sub-resource (only interests/skills/…); Work Values live in the downloadable DB. Baking them into
  the snapshot gives all 923 occupations real values offline & keyless. Risk: the download must
  succeed (mitigation below).
- **Full module rename over content-only swap.** Bigger diff now, but no "schwartz means Minnesota"
  landmine. Chosen deliberately.
- **Ford–Johnson full strict ranking over win-count scoring.** 6 items sort in ≤10 comparisons —
  exactly the requested "10 questions" budget — and guarantees a clean hierarchy for the reorder
  table; magnitudes are a derived presentation curve, not a measured quantity (accepted).
- **`valuesFit` redefined as centered cosine of 6-vectors.** The old 0.6·axis + 0.4·cosine formula
  is Schwartz-circumplex-specific and cannot survive the model change.
- **Deterministic archetype + AI prose**, not full-AI — stable label across reloads, keyless-safe,
  matches the repo's "deterministic base, AI explains" direction.
- **Values magnitudes are rank-derived, not independently measured.** A pure ordinal instrument
  can't produce true per-value intensities; the curve is a visualization choice.

## Risks / open questions
- **O\*NET DB availability / format.** `Work Values.txt` column layout and 0–100 normalization must
  be verified against the actual 30.3 distribution. Mitigation: if download or parse fails, ship
  per-direction MWV prototypes as the *primary* profession source (option the grill kept in
  reserve) — the app still works, less granular.
- **Snapshot size / regeneration.** Adding 6 floats × 923 occupations is small, but the regenerate
  step must preserve existing fields and attribution exactly.
- **Persisted-session migration (Redis).** Handled in Section H — the store persists through Redis,
  so old Schwartz-shaped sessions survive deploys and must be expired/migrated, not assumed
  ephemeral.
- **Progress percent monotonicity.** Fixed-10 denominator for a variable-length tournament means a
  short run jumps the last few percent at confirm; accepted as minor.
- **Test churn.** Rename + field removal touches 6+ test files; must stay green keyless
  (`cd backend && npm test`, `cd frontend && npm test -- --run`).
- **MWV ↔ 7 job-characteristics overlap.** "Working Conditions" partly overlaps compensation/
  security. Kept as distinct stages by design; watch that pair-questions read at the *values* level,
  not the job-char level.

## Out of scope
- No change to the Life Path Engine output loop (first/refine/accept/roadmap) beyond the
  values-scoring internals and MWV vocabulary in `whyThisFits`.
- No change to Big Five / RIASEC / job-characteristics / CV instruments or scoring.
- No new AI generators; the tournament is purely algorithmic.
- O\*NET attribution badge + footnote and the `X-API-Key`-header rule are untouched (hard license
  constraints).
