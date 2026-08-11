# Clickable journey rail — design

**Date:** 2026-08-11
**Status:** approved, ready for planning
**Follows:** `2026-08-11-dev-stage-jump-design.md`

## Problem

The journey rail (`JOURNEY_RAIL` — "About you" through "Who you are") is a display-only progress
strip. Reviewing a step you already answered means restarting the assessment or using the gated dev
panel, which fabricates answers rather than showing your own.

## Goal

Clicking a rail entry moves between steps you have already reached — in both directions — with your
answers intact. Removable later by flipping one flag.

## Non-goals

Jumping past your own progress from the rail. That means fabricating answers, and it stays in the
dev panel behind `DEV_TOOLS_TOKEN`. Rail navigation from the graph page: `railIndexForStep("tree")`
is `-1`, so the strip does not render there and the graph keeps its own navigation.

## Decisions

| Question | Decision |
| --- | --- |
| Audience | Everyone — no token |
| Reach | Steps at or before the furthest one reached, both directions |
| Data | Never touched; only `session.step` moves |
| Removal | One flag, `RAIL_NAVIGATION` in `lifePath.js` |

Restricting the reach is what makes an ungated route safe: `goto` can never skip unanswered work, so
it exposes nothing a user could not already reach by answering.

## Architecture

```
JourneyRailStrip / JourneyRailCard  (rail entry is a <button> when reachable)
    │  onNavigate(step)
    ▼
App.handleRailNavigate → POST /api/session/goto {sessionId, step}
    ▼
server: reject unless STEP_ORDER.indexOf(step) <= indexOf(session.furthestStep)
    ▼
store.gotoStep(session, step)   // moves session.step only
    ▼
standard snapshot → App.hydrateFromSnapshot
```

## Backend

### The high-water mark

`session.furthestStep` records the furthest step ever reached. Set it in the three writers that
already move the step — `advanceStep`, `finalizeValues`, `finalizeJobChar` — so no route has to
remember to maintain it:

```js
if (STEP_ORDER.indexOf(nextStep) > STEP_ORDER.indexOf(session.furthestStep || session.step)) {
  session.furthestStep = nextStep;
}
```

New sessions initialize it to `"demographics"`. Sessions persisted before this change hydrate
without the field, so every read falls back to `session.furthestStep || session.step` — no schema
version bump, no invalidated live sessions.

`serializeSessionState` exposes `furthestStep`; the frontend needs it to decide reachability.

### `POST /api/session/goto`

Body `{ sessionId, step }`. Ungated. Responds with the standard snapshot (`includeStatic: true`).

- `step` not in `STEP_ORDER` → 400.
- `step` beyond `furthestStep` → 400 ("You haven't reached that step yet."). This is the rule that
  makes the route safe to leave open.
- Otherwise `store.gotoStep(session, step)` — assigns `session.step` and touches. It writes nothing
  else: answers, scores, `userValues`, `jobCharProfile`, `outputs` all stay exactly as they were, and
  `furthestStep` never moves backward.

`gotoStep` is a separate mutator rather than a reuse of `advanceStep`, because `advanceStep` means
"progress forward" and now also raises the high-water mark. Conflating them would let a backward move
silently rewrite the mark.

### Re-confirming values

`/api/values/confirm` currently requires a live finished tournament:

```js
if (!session.valuesTournament || !finalOrder(session.valuesTournament)) return 400;
```

But `finalizeValues` clears the tournament. So after returning to `values`, re-confirming would fail
with "Finish the comparisons before confirming." Widen the guard: accept a submitted permutation when
either a finished tournament exists (first pass) **or** `session.userValues` is already set (revisit).
In the revisit case the tournament is not restarted and `order` must be a valid permutation — there is
no tournament order to fall back to.

## Frontend

### Reachability helper

`lifePath.js` gains `railStepReachable(step, furthestStep)` — pure, returns whether a rail entry is
clickable: both steps must be in `JOURNEY_RAIL` and the target's index must be at or below the
furthest one's. Rail entries beyond it render as plain text, exactly as today.

`export const RAIL_NAVIGATION = true;` sits next to it. Setting it to `false` makes every entry
inert and restores the current display-only rail; nothing else needs editing. That is the whole
removal procedure.

### Rail components

Only `JourneyRailStrip` takes an `onNavigate` prop. `JourneyRailCard` is shown once, immediately
after `handleStartSession` sets `showRail`, and only while `step === "demographics"` — at which point
`furthestStep` is also `demographics`, so no entry on it can ever be both reachable and inactive.
Wiring it would be dead code.

A reachable entry renders its label as a `<button class="journey-rail-jump">` inside the existing
`<li class="journey-rail-step">`, so the current colour states (`done`, `active`) keep working
untouched. An unreachable entry keeps its plain-text markup. The active step is never clickable — it
is where you already are.

`App.handleRailNavigate(step)` calls `sessionGoto`, applies the result through `hydrateFromSnapshot`,
and reuses the existing error banner. A new `busy.goto` flag disables the rail during the request.

### Re-entry fixes

Without these, navigating back lands on blank screens — both are required, not optional polish.

- **`job_characteristics`**: `applySessionSnapshot` seeds `rankDraft` only when `jobCharRanking` is
  absent (`App.jsx:654`), so a revisit leaves the draft empty and the card renders nothing
  (`rankDraft.length === 7` is false). Seed the draft from `data.jobCharRanking` when it exists.
- **`values`**: two separate blocks suppress the screen on a revisit. The tournament auto-start effect
  is blocked by `!(profile?.userValues)` (`App.jsx:723`), so nothing starts and both
  `valuesComparison` and `valuesRanking` stay null; and the hierarchy card itself is rendered only
  when `!profile?.userValues` (`App.jsx:1589`), so filling the draft alone would still show nothing.
  Fix both: prefill `valuesRankDraft` from `userValues.order` on revisit, and drop the
  `!profile?.userValues` condition from the card — `step === "values"` is the authoritative gate, and
  step and profile arrive in the same snapshot, so the card cannot flash after a confirm. The
  tournament is not re-run: the user's confirmed order is better data than a second pass of the same
  comparisons, and re-answering 10 comparisons to change one rank would be hostile.

## Revisit semantics

Answer routes are unchanged, so completing a revisited step advances one step forward exactly as it
did the first time, and the rail is how you get back to where you were. Two consequences worth
knowing rather than discovering:

- Re-answering a step re-scores it. Changing Big Five answers recomputes `bigFiveScores` and the
  derived traits; that is the point of going back.
- Demographics are all already answered on a revisit, so the completion check fires on the first
  submitted answer and the step advances immediately. Editing one demographic answer therefore bounces
  you to `big_five` rather than letting you walk the remaining three. Accepted as-is: making the
  step "sticky" would mean a new completion rule for one screen, and the rail gets you straight back.

## Error handling

A 400 from `goto` (racing a stale rail, hand-crafted request) surfaces in the existing error banner.
Unknown session → the standard 404 path. No new error shapes.

## Testing

Backend (`backend/tests/railNavigation.test.js`):

1. `goto` to an earlier reached step returns 200, `step` moves, `furthestStep` unchanged.
2. Answers, scores, `userValues`, and `jobCharProfile` are byte-identical after a round trip
   back and forward again.
3. `goto` beyond `furthestStep` → 400.
4. `goto` with an unknown step → 400.
5. `furthestStep` rises through a full seeded walk and never falls.
6. A session hydrated without `furthestStep` (pre-change shape) still answers `goto` correctly.
7. Re-confirming values after returning to the step succeeds and stores the submitted permutation.

Frontend (`lifePath.test.js`): `railStepReachable` — true at and below the mark, false beyond it,
false for steps outside the rail (`tree`, `entry`).

## Documentation

`CLAUDE.md`: the rail is no longer display-only — document `furthestStep`, the `goto` route, and the
`RAIL_NAVIGATION` flag as the removal switch.
