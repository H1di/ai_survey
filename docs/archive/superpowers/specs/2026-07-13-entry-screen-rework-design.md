# Entry Screen Rework — Design

**Date:** 2026-07-13
**Branch:** `feat/entry-screen-rework` (off `main`, post PR #7)

Two changes, both user-requested: the entry screen keeps only two open
questions (the change/find choice is removed), and the "use the skills I
already have / something completely new" choice moves from the entry screen
to the CV slide.

## Decisions made with the user

1. "Why are you here?" becomes a **required free-text** question (like the
   dream question), capped at 500 chars. Both entry questions are required.
2. The CV-intent choice is **required on the CV slide**: the paste/upload/
   journey buttons stay disabled until an intent is picked.
3. Intent submission goes through a **dedicated route** `POST /api/cv/intent`
   (option A) — resume-friendly, cleanly testable, not coupled to the CV
   submission bodies.

## 1. Entry screen (frontend)

- Keep exactly two questions, both required free text:
  1. **"Why are you here?"** — new textarea, `maxLength=500`, same styling as
     the dream input.
  2. **"What would you do if you knew you would definitely succeed?"** —
     unchanged.
- Delete the `ENTRY_OPTIONS` buttons (Change my career / Find my career) and
  the "Where should we start from?" block with `CV_INTENT_OPTIONS`.
- The start button enables when both trimmed answers are non-empty.
- Disclaimer text unchanged.

## 2. Session start contract (backend)

- `POST /api/session/start` body becomes `{ whyHereAnswer, dreamAnswer }`.
  Both are trimmed, capped at 500 chars, and required (400 when empty).
- `entryChoice` is removed everywhere: request validation
  (`isValidEntryChoice`), `createSession`, the session object, and
  `serializeSessionState`. The snapshot gains `whyHereAnswer`.
- `createSession` sets `cvIntent: null` (the old `"new"` default is gone —
  the value now arrives at the CV step).

## 3. New route: `POST /api/cv/intent`

- Body `{ sessionId, cvIntent }`, `cvIntent` must be `"new"` or
  `"use_skills"` (400 otherwise).
- Step guard: only while `session.step === "cv"` (400 otherwise).
- Re-selection is allowed while still on the `cv` step (idempotent set).
- Stores via a new `store.setCvIntent(session, cvIntent)`; returns the
  standard session snapshot.
- Not an AI route: global rate limiter only.

## 4. CV slide (frontend)

- The CV choice screen gets a "Where should we start from?" question at the
  top with the two intent buttons (reusing the `entry-option` button style),
  above the three path options.
- Tapping an intent calls `postCvIntent` (new `api.js` wrapper) and applies
  the returned snapshot; the selected button highlights from snapshot
  `cvIntent`, so resume shows the saved choice.
- Paste / upload / journey buttons are disabled until snapshot `cvIntent` is
  set.

## 5. AI digest (`buildProfileDigest`)

- The `Entry intent: ${entryChoice}` line is replaced by
  `Why they are here: "<text>"` — printed only when `whyHereAnswer` is
  present, so old Redis sessions without the field don't break the digest.
- The dream line and the `Intent: build on existing skills / open to
  something completely new` line are unchanged (the latter already prints
  only when `cvIntent` is set).
- `fallbackWhyThisFits` is untouched: by output time the intent is always
  set (required at the CV step).

## 6. Testing

- `server.test.js`: start payload `{whyHereAnswer, dreamAnswer}` (+400 on a
  missing/empty `whyHereAnswer`, cap at 500); `/api/cv/intent` — step guard,
  value validation, re-selection, snapshot carries `cvIntent`; full walks
  pick an intent before submitting the CV/journey; snapshot no longer has
  `entryChoice`.
- `prompts.test.js`: digest shows `Why they are here`, no `Entry intent`.
- `sessionStore.test.js`: `createSession` has `cvIntent: null`, no
  `entryChoice`; `setCvIntent` mutator.
- Frontend: existing Vitest suite + build; no new pure helpers, so no new
  unit tests.
- Both modes (keyed and keyless) — repo rule.

## Out of scope

- No changes to prompts beyond the digest line; no changes to the output
  loop, rail, or assessment steps.
- Old sessions mid-flight keep working: missing `whyHereAnswer` just omits
  the digest line; their pre-set `cvIntent` shows preselected on the CV
  slide.
