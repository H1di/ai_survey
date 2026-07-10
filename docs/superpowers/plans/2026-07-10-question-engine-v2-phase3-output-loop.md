# Question Engine v2 — Phase 3 (Oriented Field / Output Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Page 3's direction → narrowing → professions flow with the v2 Oriented Field → 1st Output → Yes/No refinement loop: one concrete job explained through the 7 parameters, Schwartz-scored and fit-ranked, iterated as a linked node chain on the graph; Yes reveals 4 advice blocks + the (reused) roadmap; a Schwartz circumplex map joins the profile panel.

**Architecture:** Hybrid per the approved spec: the 15-direction catalog + `rankDirections` stay as internal grounding (prompt hint + deterministic fallback source via `professionSeeds`); `computeDirection`, the direction quiz, tie/refine/choose, narrowing, and the 3-professions step are deleted (code, routes, UI, tests). `pathStage` becomes `"output" | "detail"`. Every output carries `schwartzValues` + backend-derived aggregates + `valuesFit` vs `userValues` (Phase 2 machinery). Roadmaps re-key to `outputId`.

**Tech Stack:** unchanged. Branch: continue on `feat/question-engine-v2`. Note: individual tasks keep the TEST SUITES green, but the app is only fully playable again after Task 7 — the phase, not each task, leaves working software.

## Global Constraints

- Output object (serialized): `{ id: "output_N", parentId, directionId, orientedField, jobTitle, thesis, parameterFit{7}, whyFit, firstMilestone, constraintsNote, changeSummary?, schwartzValues{10}, valuesRationale, higherOrder, axes, dominantPole, topValues[3], valuesFit, accepted, detail }`.
- The AI never outputs Schwartz aggregates; the backend attaches them via `schwartzValues.js`.
- Keyless mode must complete the whole loop: first output → parameter refine → notSuitable refine → accept → 4 advice blocks → roadmap, all deterministic and non-flat.
- Refine request: `{ outputId, notSuitable: true }` XOR `{ outputId, changes: [{param ∈ 7 keys, reason ≤200}] (1..7) }`; rejected once an output is accepted.
- Rate-limited AI routes: `/api/output/first`, `/api/output/refine`, `/api/output/accept`, `/api/roadmap/generate` (direction/professions paths leave the list).

## Tasks

### Task 1 — prompts: oriented field / refinement / output detail (+ delete direction-era builders)
`buildOrientedFieldPrompt({ profileDigest, directionHint, excludeFields })` — BASE_SYSTEM + "ONE oriented career field and a concrete resulting job", spec §6.3 schema (`orientedField, jobTitle, thesis, parameterFit{7 keys}, whyFit, firstMilestone, constraintsNote`), parameterFit must reference the user's targets; directionHint = ranked catalog labels from `rankDirections`; excludeFields listed as forbidden families (notSuitable path).
`buildRefinementPrompt({ profileDigest, previousOutput, changes })` — §6.4: same schema + `changeSummary`; keep everything else stable, shift only the named parameters toward the stated reasons.
`buildOutputDetailPrompt({ profileDigest, output })` — §6.5 schema (`aiRecommendations[], events[], universities[], courses[]`), tailored to location + seniority.
Delete `buildDirectionQuestionsPrompt`, `buildDirectionRefinePrompt`, `buildNarrowingQuestionsPrompt`, `buildProfessionsPrompt`, `buildAnswersDigest`; `buildRoadmapPrompt` loses `narrowingDigest` and takes `{ profileDigest, orientedField, jobTitle, thesis }`-shaped args via profession/direction objects built by the caller. Rewrite `tests/prompts.test.js` accordingly.

### Task 2 — aiEngine: output generators + normalizers, roadmap re-target, delete direction-era generators
- `normalizeOutputPayload(payload)` — every string field non-empty (cleanText), `parameterFit` must contain all 7 keys with non-empty lines; optional `changeSummary` kept when present.
- `normalizeOutputDetailPayload(payload)` — 4 arrays, 2–4 entries each, per-entry required fields (`title/detail`, `name/why`, `name/program`, `name/provider/why`); throws otherwise.
- `generateFirstOutput({ session, excludeDirectionIds })` — AI via oriented-field prompt (hint = `rankDirections(session.riasecScores…)`); fallback: top non-excluded ranked direction → `getDirection().professionSeeds[0]` → deterministic templates; `parameterFit` lines from `jobCharProfile` targets (qualitative wording by band). Returns raw output fields + `directionId`.
- `refineOutput({ session, previousOutput, changes })` — AI via refinement prompt; fallback: same direction's next unused seed (or next ranked direction when seeds run out), changed-param lines rewritten toward the requested direction, deterministic `changeSummary`.
- `generateOutputDetail({ session, output })` — AI; fallback: 4 blocks parameterized by country/city, cvAnalysis.seniority, jobTitle.
- `generateRoadmap` now takes the accepted output (`profession = { id: output.id, title: jobTitle, summary: thesis }`, `direction = { label: orientedField }`).
- Delete `generateDirectionQuestions`, `generateNarrowingQuestions`, `generateProfessions`, `refineDirection` + their fallbacks + `normalizeQuestionsPayload`/`normalizeProfessionsPayload`/`normalizeRefinePayload`. Rewrite `tests/aiEngine.test.js` direction-era tests into output-loop tests.

### Task 3 — sessionStore: outputs chain, delete direction-era fields
Add `outputs: []`, `acceptedOutputId: null`, `refinementHistory: []`, `pathStage: "output"`; mutators `appendOutput(session, output)` (assigns `output_N`, `parentId` = last output or null), `acceptOutput(session, outputId, detail)` (marks accepted, stores detail, `pathStage="detail"`), `recordRefinement(session, entry)`, `setRoadmap` unchanged (keys by `roadmap.professionId` = outputId). Delete direction/narrowing/profession fields, their mutators, `rejectedDirections`, `refineNotes`, `directionCatalog`/`refineReasons` from the static part. Serialization adds `outputs`, `acceptedOutputId`, `refinementHistory`. Update `tests/sessionStore.test.js`.

### Task 4 — server: output routes replace direction/professions routes
- `POST /api/output/first` — step `tree`; idempotent (returns existing chain); generates, Schwartz-scores (`scoreProfessionValues` + derive aggregates + `valuesFit` vs `userValues.scores`), appends.
- `POST /api/output/refine` — validates XOR body, output exists, nothing accepted yet; `notSuitable` → `generateFirstOutput` excluding all used directionIds; else `refineOutput`; scores + appends + `recordRefinement`.
- `POST /api/output/accept` — output exists, none accepted; `generateOutputDetail` → `acceptOutput`.
- `POST /api/roadmap/generate` — body gains `outputId`; requires `acceptedOutputId === outputId`; caches per outputId.
- Delete `/api/direction/*`, `/api/professions/*` routes and direction imports; update the aiLimiter path list. Attachment helper `attachSchwartzToOutput(session, rawOutput)` lives in server.js (or aiEngine) and is the only place aggregates are computed. Rewrite the Page-3 part of `tests/server.test.js`: full loop test (first → refine param → notSuitable → accept → detail blocks → roadmap), guards (refine after accept 400, roadmap for non-accepted 400, XOR body 400), Schwartz assertions (10 scores, aggregates present, fit 0–100, non-flat).

### Task 5 — directions.js cleanup
Delete `computeDirection`, `REFINE_REASONS`, `REFINE_REASON_VALUES`; keep `DIRECTIONS`, `DIRECTION_IDS`, `getDirection`, `professionSeeds`. Rewrite `tests/directions.test.js` (catalog shape only).

### Task 6 — frontend lifePath.js rewrite + tests
`buildLifePathGraph({ outputs, acceptedOutputId, roadmaps, roadmapPending, detailPending, onOutputOpen, onAdviceOpen, onStageOpen })`:
- me → horizontal output chain (`x = i*380, y = 240`), node type `output` (jobTitle, orientedField, fit badge, topValues, accepted flag, onOpen), edges parent→child (`active` = accepted or latest).
- accepted output grows 4 `advice` nodes (`y = 500`, spread around the accepted x; label + count + onOpen) and the roadmap chain below (`y = 760+`, reuse `roadmap`/`loading` nodes, parent = accepted output).
`selectDockCard({ stage, currentOutput, acceptedOutputId, refineMode })` → `"output-review" | "refine" | null`.
Rewrite `lifePath.test.js` (chain layout, parent links, accepted expansion, dock kinds); keep `firstUnansweredIndex`/`moveRankItem` tests.

### Task 7 — App.jsx tree rework + api.js + node components + CSS
- api.js: remove direction/professions wrappers; add `fetchFirstOutput`, `refineOutput`, `acceptOutput`; `generateRoadmap` payload gains `outputId`.
- App.jsx: replace direction/narrowing/professions state+handlers+dock cards with `outputs/acceptedOutputId/refinementHistory` snapshot state, refine-panel view state (`refineMode`, `refineChecks {param: reason}`), handlers (`handleEnterLifePath` → `fetchFirstOutput`; `handleAcceptOutput`; `handleRefineOutput(notSuitable)`); dock cards `output-review` (thesis + whyFit + fit badge + Yes/No buttons) and `refine` (7 checkboxes + per-checked reason inputs + "It doesn't fit overall" + Back); DetailPanel reused for output parameterFit (7 sections) and advice lists; resume `inTree` = `step==="tree" && outputs.length`; focus/treeHint rework; delete `GraphQuestionCard`, ConfirmModal usage, `narrowIntent`, `refineReasons`.
- NodeComponent.jsx: add `OutputNode` (title/field/fit badge/top values/accepted ring) + `AdviceNode`; register both in GraphView index.jsx nodeTypes. CSS for both + refine panel.

### Task 8 — SchwartzMap + ProfilePanel integration
New `frontend/src/components/SchwartzMap.jsx`: self-contained SVG circumplex — axes Openness↔Conservation (x) / Transcendence↔Enhancement (y), quadrant labels, user point + one point per output (accepted highlighted), −100..100 domain mapped into the circle. Rendered inside `ProfilePanel` when `valuesMap` prop present (`{ userPoint, jobs: [{id, label, point, fit, accepted}] }`); App.jsx builds it from `userValues`/`outputs` (axes already serialized per output; user point derived client-side from scores via a tiny exported helper `deriveUserPoint` in lifePath.js using the same formulas — or serialize the user's axes from the backend: DO the backend variant — add `userValuesAxes` next to `userValues` in the snapshot in Task 3 to keep the math single-sourced). CSS.

### Task 9 — docs + full keyless E2E + final verify
CLAUDE.md (Page 3 section, pathStage values, modules, contracts: 7-param refine payload; drop direction-era lines), README route list, scratchpad E2E walk v2 (first → refine → notSuitable → accept → detail → roadmap → reload-resume mid-loop), both suites + build green.
