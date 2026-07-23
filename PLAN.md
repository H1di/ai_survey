# Plan: Assessment-logic & algorithm document (Life Path Explorer)
_Locked via grill — by Claude + Eugene (h1di)_

> **Meta:** this PLAN is written in English for cross-model review. The
> **deliverable it describes is a Russian-language Markdown document** (prose in
> Russian; all identifiers, formulas, function names, code blocks in English —
> exactly the convention of the existing `ARCHITECTURE.md`).

## Goal
Produce one new, self-contained Markdown document that explains, in algorithmic
detail, **how the project's questions work and what each scoring/grounding
algorithm actually computes** — end to end, from the entry dream-answer through
the adaptive work-values tournament to the Page-3 O*NET grounding pipeline. The
document's value-add over the existing `ARCHITECTURE.md` is depth on the
**algorithms** (formulas, invariants, a worked Ford–Johnson example, the Pearson
grounding math, the centered-cosine `valuesFit`), which the current docs state
only in passing. It is a reader's companion for a developer (or future-Eugene)
who needs to understand *why the numbers come out the way they do*, not just
which files exist.

## Approach
Deliverable file: **`ASSESSMENT-LOGIC.md`** at repo root (same location and
class as `ARCHITECTURE.md` / `PROJECT_STATUS.md`; discoverable next to them).
It carries a dated "synced to commit `<sha>` / <date>" header like
`ARCHITECTURE.md`, and every algorithm section cites its source as
`file.js:function` anchors so the doc stays checkable against code.

**Sourcing rule (non-negotiable):** every formula and constant is transcribed
**from the actual source files read at write time** (`questionEngine.js`,
`valuesTournament.js`, `workValues.js`, `riasec.js`, `onet.js`, `aiEngine.js`,
`server.js`, `questionPool.js`, `riasecItems.js`, `bigFiveItems.js`), and
cross-checked against `backend/tests/` where a test pins the property (e.g. the
720-permutation tournament optimality). CLAUDE.md / ARCHITECTURE.md are treated
as leads, never as the source of truth for a number.

Document outline (sections):

1. **Orientation (short).** One-paragraph product framing + the pipeline as a
   `session.step` state machine (`entry → demographics → big_five → riasec →
   values → job_characteristics → cv → summary → tree`, then `pathStage:
   output → detail`). A mermaid state diagram. Two invariants that govern the
   whole flow: (a) server snapshot is the single source of truth; (b)
   step-guards make the pipeline strictly linear (no server back-nav).
   Explicitly delimits scope: *this doc = the question/scoring/grounding
   algorithms; `ARCHITECTURE.md` = system/modules/contracts; `README.md` = API
   routes* — with links, so the three don't drift into duplicates.

2. **Entry & demographics.** `dreamAnswer` (required, trim, 500 cap); the 4
   static demographic questions and their validators (`single` whitelist /
   `number` min–max / `text` non-empty ≤80) from `questionEngine.js`.

3. **Big Five (Mini-IPIP-20).** Fixed public-domain instrument seeded at session
   creation; Likert 1–5. Algorithm: reverse-keyed items score `6 − raw`;
   per-trait mean; normalize `((mean − 1) / 4) × 100` → OCEAN 0–100. Big Two
   derivation (`deriveBigFiveTraits`): Stability = mean(A, C, 100 − N),
   Plasticity = mean(O, E); the stored field names (`behaviourTendencies` /
   `decisionPriorities`) vs their real DeYoung names; `describeTraits`
   thresholds (≥65 high, ≤35 low). Note the display convention: N is shown as
   "Emotional Steadiness" = 100 − N while the stored score keeps raw N.

4. **RIASEC.** 12 static interleaved enjoyment-Likert items (`riasecItems.js`);
   per-type mean → `((mean − 1) / 4) × 100`; top-3 → `riasecCode`
   (`deriveRiasecCode`, ties broken by canonical R-I-A-S-E-C order). The skip
   path: `inferRiasecScores(bigFiveScores)` produces a low-confidence profile
   (`riasecInferred`) instead of asking.

5. **Work-values tournament (the centerpiece).** The six Minnesota/O*NET values
   (`WORK_VALUES_ORDER`). The Ford–Johnson merge-insertion engine
   (`valuesTournament.js`): why n=6 sorts in ≤10 comparisons (information-
   theoretic minimum), and the key design property — the engine is a **pure
   function of (items, decided answers)** that replays the sort each call, so
   the first undecided pair becomes the pending question; this makes it
   resumable, serializable over HTTP, and immune to stale/double answers.
   Include a **worked example**: a concrete 6-value permutation walked through
   the comparisons, showing pairing → recursive sort of bigs → insertion of the
   pend in largest-partner-first order → final order. State the proof anchor
   (exhaustive over all 720 permutations in the test suite). Then confirmation:
   `/confirm {order}` validates a permutation of the 6 keys →
   `rankToWorkValueScores` maps rank→intensity via the fixed curve
   `[100, 84, 68, 52, 36, 20]` (`curveVersion` 1) → `finalizeValues` writes
   `session.userValues` atomically and clears the tournament. Call out the
   honest limitation: an ordinal instrument can't measure magnitudes, so the
   curve is assigned, not observed.

6. **Job characteristics.** User ranks the 7 canonical params
   (`JOB_CHAR_PARAMS`) and picks depth 5|10 → single-parameter tradeoff
   questions (AI-generated, static bank fallback of 2/param, weighted toward the
   top of the user's ranking). Each option encodes a 0–100 target;
   `computeJobCharProfile` averages a param's answered options, and **unasked
   (low-ranked) params default to the neutral 50**.

7. **CV / career-journey.** `cvIntent` (`new` | `use_skills`); `cvExtract.js`
   MarkItDown-first hybrid (formats + 5 MB cap + hard-failure→400); AI-parse →
   `{roles, skills, domains, seniority, keywords}`; OR the 7 static journey
   questions when no CV. Note the single-flight lock (`${id}:cv`) that stops a
   double-submit from doubling AI spend or advancing twice. Completion generates
   `personaSummary` and advances to `summary`.

8. **Summary.** Deterministic `deriveArchetype`; Big Five radar; AI
   `personaSummary` (with deterministic keyless fallback); confirmed work-values
   radar. `summary/continue` advances to `tree`.

9. **Page-3 grounding & scoring algorithm.** The output-generation pipeline as
   an algorithm: `rankDirections(riasecScores)` → top-5 direction families →
   `rankOccupations` (**Pearson correlation** of the user's RIASEC vector
   against each occupation's measured O*NET RIASEC profile) → 15-occupation
   shortlist → AI picks one and returns `socCode` → `resolveShortlistSoc`
   enforces membership (valid code → title match → shortlist top). Keyless
   fallback = best-correlated unused occupation. Then `buildScoredOutput`:
   `resolveProfessionWorkValues` (measured O*NET values, else per-direction
   prototype fallback) → `deriveTopValues` + `valuesFit`. Document the
   **`valuesFit` math**: center each 6-vector (removes scale-use bias), cosine
   similarity, map [−1, 1] → [0, 100], single `{overall}`. Then the second AI
   call `generateWhyThisFits` (structured, traceable explanation grounded in the
   occupation's O*NET skills). Finally the loop: refine `changes[]` shifts named
   params within the same direction family (minus used SOCs) **XOR**
   `notSuitable` regenerates from a fresh direction family; accept → 4 advice
   blocks; roadmap on demand.

10. **Appendix — algorithm cheatsheet.** A compact table: each block → input →
    formula/algorithm → output field → source anchor. Plus the two canonical key
    lists (7 job-char params, 6 work-values) as the cross-layer contract.

Diagrams (mermaid, inline): (a) the step state machine; (b) the tournament as a
pure replay loop (answers in → replay sort → next pending pair or final order);
(c) the Page-3 grounding pipeline (riasec → directions → Pearson shortlist → AI
pick → scored output → refine/notSuitable/accept).

Finally: add one cross-link line to `ASSESSMENT-LOGIC.md` from `ARCHITECTURE.md`
§3 and from `README.md` so the new doc is discoverable (append-only, no
rewrite of those files).

## Key decisions & tradeoffs
- **New document, not an extension of `ARCHITECTURE.md` §3.** §3 documents
  question *structure*; the request is about *algorithms*. Keeping them separate
  avoids bloating the system spec, but introduces two docs that can drift —
  mitigated by explicit scope delimiting + cross-links + `file:function`
  anchors in both.
- **Russian prose, English identifiers.** Matches the existing detailed specs
  (`ARCHITECTURE.md`, `PROJECT_STATUS.md` are Russian; `README.md`/code are
  English). Tradeoff: a non-Russian contributor leans on `README.md`/code, which
  stay English. User confirmed Russian twice.
- **Root-level, named `ASSESSMENT-LOGIC.md`.** Consistent with where the other
  specs live; name signals scope. (Covers Page-3 grounding too, despite the
  "assessment" name — stated in the intro.)
- **Depth cap: formulas + invariants + one worked FJ example**, not a
  line-by-line code transcript. Enough to reconstruct the math; not a
  maintenance burden that mirrors every branch.
- **Code is the source of truth.** Numbers are transcribed from source at write
  time and checked against tests, not paraphrased from CLAUDE.md (which can lag
  code).

## Risks / open questions
- **Doc drift.** A detailed algorithm doc rots when constants change (e.g. the
  work-value curve, the 80-char demographic cap). Mitigation: dated
  "synced-to-commit" header + `file:function` anchors + a one-line "if a number
  here disagrees with code, code wins" note. Open: is that enough, or should a
  test assert the doc's key constants? (Leaning: no test — over-engineering for
  a prose doc.)
- **Overlap with `ARCHITECTURE.md` §3/§4 and README API section.** Risk of
  saying the same thing twice and having them diverge. Mitigation: the intro
  delimits scope and links out instead of restating contracts.
- **Formula transcription errors.** The whole value of the doc is correct math;
  a wrong reverse-key or normalization would be worse than no doc. Mitigation:
  copy from source, verify against `backend/tests/`.
- **Name / location.** User may prefer `docs/` or a different filename; this is
  the sign-off gate.

## Out of scope
- **No code changes.** Documentation only (plus the two append-only cross-link
  lines in `ARCHITECTURE.md`/`README.md`).
- **Not** rewriting or replacing `ARCHITECTURE.md`, `README.md`, or
  `PROJECT_STATUS.md`.
- **Not** deploy/infra (`DEPLOY.md`), frontend component internals beyond what a
  reader needs to follow the flow, or verbatim AI prompt texts.
- **Not** a full API reference (routes live in `README.md`); the doc references
  routes only where an algorithm needs the context.
