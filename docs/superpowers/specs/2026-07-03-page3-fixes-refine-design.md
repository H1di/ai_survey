# Page 3 Fixes + Direction Refinement — Design

**Date:** 2026-07-03
**Scope:** `backend/` + `frontend/src`. Pages 1–2 visually and functionally untouched.
**Base:** `main` @ b607d71 (Page 3 rebuild + visual polish merged).

## Problems addressed (user-reported)

1. **Me icon overlaps question text** — root cause: `.question-card` (App.css) has no background; the graph (Me node, edges, dots) shows through the floating dock card.
2. **Questions blend with the graph** — same root cause. The profession ConfirmModal is fine (own opaque bg + blur overlay) — must not change.
3. **Graphs disappear on navigation** — root cause: the roadmap chain renders only while `roadmap.professionId === selectedProfession.id`; clicking any other profession unmounts it.
4. **Line animation replays from scratch on step/profession clicks** — root cause: same unmount/remount; on return the whole 3.8s cascade replays.
5. **No recourse when the proposed direction feels wrong** — feature gap.

## Decisions (user interview)

- Multiple roadmaps: **all built roadmaps stay visible simultaneously**, each under its own profession node.
- Refinement: **structured question + free text** ("Not quite right" → 1 multiple-choice reason + textarea "what do you actually want") → AI proposes a different catalog direction with a short reason; after **2 rejections** → manual picker over the remaining catalog directions.

## 1. Opaque dock cards + delayed Me (P1, P2)

- `GraphPage.css`: add `background: var(--color-bg);` to the existing `.graph-question-dock .question-card` rule. Scoped — Pages 1–2 cards and the ConfirmModal untouched.
- `NodeComponent.css`: `.me-ring circle` animation gains a **450ms delay** (dock card enter is 350ms); `.node-me-label` delay moves 700ms → **1150ms**. Question renders first on all three quiz screens; Me appears after.

## 2. Persistent multi-roadmap (P3)

**Backend:**
- `sessionStore`: `roadmap` (single) → **`roadmaps: {}`** keyed by professionId. `setRoadmap(session, roadmap)` inserts into the map (never clears others) and sets `pathStage = "roadmap"`. `serializeSessionState` exposes `roadmaps`.
- `POST /api/roadmap/generate`: cached per profession — `if (!session.roadmaps[selectedProfession.id]) generate`. Repeat confirms of an already-built profession cost zero AI calls.

**Frontend:**
- State `roadmaps` (object) replaces `roadmap`. `buildLifePathGraph` renders **every** entry of `roadmaps` under its own profession (skip entries whose profession is not in `professionOptions`).
- Node/edge ids namespaced per profession: `stage-${professionId}-${stage.id}` (today two roadmaps would collide on `stage-stage_1`).
- Nothing unmounts when the user clicks around → chains never disappear.

## 3. No animation replay (P4)

- P3 removes the unmount/remount, which is the entire replay mechanism: element ids and their `--appear-delay`/`data.delay` values stay constant across renders, so CSS animations run exactly once per element lifetime. A wave animates only when it first mounts (new roadmap chains animate; existing ones stay static).
- Flow catch-up fix (absorbs a prior accepted Minor): `BranchEdge` stops computing flow delay from a hardcoded `+600`; the builder passes **`data.flowDelayMs`** per edge — `me→direction` and chain edges: `edgeDelay + EDGE_DRAW_MS` (flow starts as the line completes); `direction→profession` edges: **150ms** (they only ever become active long after their line drew — no ~1s catch-up lag).
- Acceptance: clicking a roadmap step (DetailPanel) or another profession must not restart any line/node animation; a newly generated second roadmap animates only its own chain.

## 4. Direction refinement (P5)

**Catalog + reasons (`backend/directions.js`):**
- `computeDirection(questions, answers, excludeIds = [])` — excluded directions get no votes; fallback default = first non-excluded catalog direction.
- `REFINE_REASONS`: `[{value:"environment"},{value:"interests"},{value:"too_technical"},{value:"prospects"}]` (values validated server-side; labels live in the frontend card).

**Session (`sessionStore`):** new fields `rejectedDirections: []` (list of `{id,label}`) and `refineNotes: []` (list of `{reasonChoice, feedbackText}`); method `rejectProposedDirection(session, note)` — pushes `proposedDirection` to `rejectedDirections`, pushes `note`, nulls `proposedDirection`. `serializeSessionState` exposes `rejectedDirections` and a `directionCatalog: [{id,label}×8]` (single source for the frontend picker).

**Prompts:** `buildDirectionRefinePrompt({profileDigest, directionDigest, rejectedDirections, reasonChoice, feedbackText})` → JSON `{"directionId":"","reason":""}`; directionId from the catalog, MUST NOT be a rejected id; reason = 1–2 English sentences addressed to the user.

**Engine:** `refineDirection({session, reasonChoice, feedbackText})` → `{id, label, reason}`. Fallback: `computeDirection(questions, answers, rejectedIds)` + reason "Based on your quiz answers, this is your next strongest match." Normalizer throws on non-catalog or rejected id → fallback.

**Routes:**
- `POST /api/direction/refine` `{sessionId, reasonChoice, feedbackText}` — guards: step complete, no confirmed direction, `proposedDirection` present, `reasonChoice ∈ REFINE_REASONS` values; `feedbackText` optional, trimmed, ≤ 500 chars. Rejects current proposal, sets the refined one.
- `POST /api/direction/choose` `{sessionId, directionId}` — guards: step complete, no confirmed direction, catalog id, not previously rejected. Sets `proposedDirection = {id, label, reason: "Chosen by you."}`. Confirmation continues through the existing `/api/direction/confirm`.
- The tally proposal in `/api/direction/answer` now carries `reason: "Your answers across the quiz point most strongly to this direction."`

**Frontend dock flow (`App.jsx`):**
- Proposal card: shows `proposedDirection.reason` line; second ghost button **"Not quite right"**.
- "Not quite right" → if `rejectedDirections.length < 2`: refine card (`key "refine"`) — heading "Let's get this right", question "What feels off about {label}?", the 4 reason options (single-select), textarea placeholder "Tell me what you actually want — interests, environment, anything…", submit "Suggest another direction" (disabled until a reason is picked; busy.refine).
- If `rejectedDirections.length >= 2`: picker card (`key "direction-pick"`) — "Pick your direction", buttons for `directionCatalog` minus rejected ids → `chooseDirection` → proposal card → normal confirm.
- New api functions: `refineDirection`, `chooseDirection`. Textarea styled via a scoped `.dock-card textarea` rule in GraphPage.css.
- All copy English.

## Boundaries & a11y

- ConfirmModal untouched. Pages 1–2 untouched (all CSS scoped; `.question-card` global rule NOT modified). `session.step` still never advances past "complete".
- Existing reduced-motion blocks remain valid (no new animation kinds introduced; flow delay change is a value, not a mechanism).

## Verification

Backend: updated + new node:test suites green (roadmaps map, refine/choose routes incl. guards, fallback exclusion, prompt structure). Frontend: build + lint. Playwright: (a) dock card fully opaque over the graph, Me appears after the question on all 3 quiz screens; (b) roadmap A stays visible while clicking profession B and after "Not now"; (c) no line/node animation restart on step click or profession click (second roadmap animates only its own chain); (d) refine flow end-to-end in fallback mode: reject → different direction with reason → reject → picker appears → choose → confirm; (e) ConfirmModal unchanged.

## Out of scope

Session persistence across page refresh; showing roadmaps for professions that left `professionOptions`; Pages 1–2; backend REFINE_REASONS labels.
