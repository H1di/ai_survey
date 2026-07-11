# Question Engine v2 — Phase 2 (Schwartz Values Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend-only Schwartz Basic Human Values layer: a pure derivation module (`schwartzValues.js`), AI generators for the user values inference + profession scoring (with deterministic keyless fallbacks), and `session.userValues` computed at the `cv → tree` transition.

**Architecture:** Spec §4–§5 of `docs/superpowers/specs/2026-07-09-question-engine-v2-schwartz-design.md`. The AI only ever outputs the 10 raw scores (+ top-3 rationale); every aggregate (higher-order poles, axes, top values, fit) is derived deterministically in `schwartzValues.js`. Phase 3 consumes `scoreProfessionValues` + `valuesFit` when it builds outputs; Phase 2 lands them fully tested but unwired to any route except the `userValues` hook.

**Tech Stack:** Node CommonJS, node:test. No new dependencies. Branch: continue on `feat/question-engine-v2`.

## Global Constraints

- The 10 value keys, in circular order (a cross-layer contract):
  `self_direction, stimulation, hedonism, achievement, power, security, conformity, tradition, benevolence, universalism`.
- AI outputs ONLY `{schwartzValues: {10×0-100}, valuesRationale?: {top-3 key: line}}` — aggregates are always backend-derived.
- Keyless mode must produce plausible, NON-FLAT profiles (fallbacks below); a flat AI payload (max−min < 8) is rejected into the fallback.
- `userValues` = `{ scores, confidence: "low", source: "inferred" }` — always low-confidence in Phase 2 (no PVQ instrument).
- Tests: `cd backend && npm test` green after every task; commit per task.

## File Map

| File | Action |
|---|---|
| `backend/schwartzValues.js` | NEW — ORDER/meta, derivations, fit, direction prototypes, deterministic fallbacks |
| `backend/prompts.js` | + `buildUserValuesInferencePrompt`, `buildProfessionValuesProfilePrompt` |
| `backend/aiEngine.js` | + `normalizeSchwartzValuesPayload`, `inferUserValues`, `scoreProfessionValues` |
| `backend/sessionStore.js` | + `userValues` field, `setUserValues`, serialization |
| `backend/server.js` | compute userValues at both `cv → tree` transitions |
| `backend/tests/schwartzValues.test.js` | NEW |
| `backend/tests/{prompts,aiEngine,sessionStore,server}.test.js` | additions |

---

### Task 1: schwartzValues.js — derivations + fit (pure math)

**Interfaces produced:**
- `SCHWARTZ_ORDER` (10 keys), `SCHWARTZ_VALUE_META` (`[{id,label}]` in order)
- `deriveHigherOrder(v)` → `{openness_to_change, self_enhancement, conservation, self_transcendence}` (0–100, hedonism split 50/50)
- `deriveAxes(h)` → `{x_open_vs_conserv, y_transc_vs_enhance}` (−100..100)
- `deriveTopValues(v)` → top-3 keys (circular-order tie-break); `dominantPole(h)` → highest pole key
- `valuesFit(userV, jobV)` → `{overall, axisFit, detailFit, userPoint, jobPoint}` = `0.6*axisFit + 0.4*centeredCosineFit`

Test cases (write first, expect fail, implement, pass, commit):
```js
// tests/schwartzValues.test.js
const V = (over = {}) => ({
  self_direction: 50, stimulation: 50, hedonism: 50, achievement: 50, power: 50,
  security: 50, conformity: 50, tradition: 50, benevolence: 50, universalism: 50,
  ...over,
});
// deriveHigherOrder: openness = (sd + st + he*0.5)/2.5 etc.; verify a hand-computed vector
// deriveAxes: x = open - conserv, y = transc - enhance
// deriveTopValues: scores with ties resolve by circular order
// valuesFit: identical varied vectors -> overall 100; strongly opposed patterns -> overall < 40;
// symmetry: fit(u, j).overall === fit(j, u).overall; flat vector doesn't crash (zero-norm cosine -> 0)
```

Implementation is spec §4 verbatim (with `center`/`cosine` helpers; `cosine` returns 0 when either norm is 0).

Commit: `feat(schwartz): value order, higher-order poles, axes, values fit`

---

### Task 2: schwartzValues.js — direction prototypes + deterministic fallbacks

**Interfaces produced:**
- `SCHWARTZ_DIRECTION_PROTOTYPES` — one 10-score circumplex-respecting profile per catalog direction (all 15)
- `buildFallbackProfessionValues(directionId, jobCharProfile)` — prototype (default: a varied generic profile for unknown ids) modulated toward the user's jobChar targets: for each `[param → {value: weight}]` influence pair, `score = round(proto*(1-w) + jcTarget*w)`; influences: compensation→power .3/achievement .2; job_security→security .3/conformity .15/tradition .1; meaning_impact→universalism .3/benevolence .2; complexity→self_direction .25/stimulation .25; work_mode→self_direction .15/hedonism .15; social→benevolence .15; career_growth→achievement .25/power .15
- `inferUserValuesFallback({bigFiveScores, riasecScores, jobCharProfile})` — documented heuristic weights over O/C/E/A, RIASEC E/S/C types, and the 7 targets (all inputs default 50)

Tests: every prototype has 10 in-range scores, non-flat (max−min ≥ 25), and opposite pairs `(self_direction, tradition)` / `(power, universalism)` never both > 70; modulation pulls toward targets (meaning_impact=95 raises tech's universalism); fallback inference is in-range and non-flat for a varied profile, all-50 for an empty one.

Commit: `feat(schwartz): direction prototypes and deterministic value fallbacks`

---

### Task 3: prompts — user inference + profession scoring

**Interfaces produced:**
- `buildUserValuesInferencePrompt({ profileDigest })` — schema `{"schwartzValues":{10×0-100}}`, grounded in Big Five/RIASEC/targets/dream, full-range + circumplex instructions
- `buildProfessionValuesProfilePrompt({ jobTitle, orientedField, thesis })` — spec §3 of the add-on doc verbatim: score what the ROLE structurally rewards, circular order listed, opposites rarely both high, flat = failure, rationale for top-3 only

Tests: schema strings present, circular order listed, job fields embedded in user message.

Commit: `feat(prompts): Schwartz user-inference and profession-scoring builders`

---

### Task 4: aiEngine — normalizer + two generators

**Interfaces produced:**
- `normalizeSchwartzValuesPayload(payload)` → `{ scores, rationale }`; requires all 10 numeric keys (clamp/round), throws on flat (max−min < 8); rationale kept only for valid keys, ≤3 entries, cleaned ≤200 chars
- `inferUserValues({ session })` → 10-score object (AI via profile digest; fallback `inferUserValuesFallback`)
- `scoreProfessionValues({ jobTitle, orientedField, thesis, directionId, jobCharProfile })` → `{ schwartzValues, valuesRationale }` (fallback `buildFallbackProfessionValues(directionId, jobCharProfile)` with a one-line deterministic rationale for the top value)

Tests: normalizer clamp/missing-key/flat rejection; keyless engine returns non-flat profiles for both generators; keyless rationale names the top value.

Commit: `feat(ai): Schwartz inference + profession scoring with deterministic fallbacks`

---

### Task 5: session field + cv→tree hook + serialization

- `sessionStore`: `userValues: null` in `createSession`; `setUserValues(session, scores)` stores `{ scores, confidence: "low", source: "inferred" }`; `userValues` joins the dynamic snapshot part.
- `server.js`: in BOTH `/api/cv` and `/api/cv/journey`, right before `store.advanceStep(session, "tree")`:
  ```js
  const userValues = await aiEngine.inferUserValues({ session });
  store.setUserValues(session, userValues);
  ```
  (`/api/cv/journey` handler becomes `async`.)
- Tests: sessionStore mutator/serialization; server: `completeAssessment` (journey path) and the paste-path test both assert `snapshot.userValues.scores` has 10 in-range keys and `confidence === "low"`; the acceptance rule "userValues exists before the graph renders" = step is `tree` ⇒ userValues non-null.

Commit: `feat(session): infer Schwartz user values at the cv→tree transition`

---

## Acceptance (Phase 2 slice of spec §8)

1. All 10 scores + derived aggregates available and backend-derived only.
2. `userValues` exists (inferred, low-confidence) the moment `step === "tree"`, keyless included.
3. `scoreProfessionValues` + `valuesFit` ready for Phase 3, fully unit-tested, non-flat in fallback mode.
