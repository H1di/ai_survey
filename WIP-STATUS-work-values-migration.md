# WIP — Schwartz → Minnesota Work Values migration

**Status: COMPLETE and verified end-to-end.** All three phases done; both test suites green;
full flow walked in a real browser (keyless-safe + AI paths). Nothing committed yet — everything is
uncommitted in the working tree on `main`, awaiting the user's review/commit decision.

- Full spec (grilled + Codex-APPROVED): **`PLAN.md`** (sections A–H).
- Adversarial review trail: **`PLAN-REVIEW-LOG.md`**.
- Long-term project memory: `~/.claude/projects/-home-eugene-ai-survey-2/memory/project-lifepath-page3-state.md`.

---

## 1. What this migration delivered (5 user-requested changes)

1. **Numeric progress %** during the assessment (label beside the bar).
2. **Removed the "Why are you here?" entry question** entirely (only `dreamAnswer` remains).
3. Replaced the **Schwartz 10-value** model with the **6 Minnesota / O\*NET Work Values**
   (`achievement, independence, recognition, relationships, support, working_conditions`) — full rename.
4. New **`values` step** (after RIASEC): an **adaptive pairwise tournament** (Ford–Johnson, ≤10
   comparisons) → a reorderable hierarchy table with a "You can modify it" confirm gate.
5. New **`summary` step** (between `cv` and `tree`): a character conclusion — deterministic named
   archetype + Big Five radar + AI persona prose + the user's 6-axis work-values radar.

Step order:
```
entry → demographics → big_five → riasec → values → job_characteristics → cv → summary → tree
```

**Data fact:** O\*NET 30.3 removed Work Values; they were merged from **O\*NET 28.0** by SOC into
`backend/data/onet-snapshot.json` (883/923 real, 40 on per-direction prototype).

---

## 2. Verification (done)

- **Backend:** `cd backend && npm test` → **156/156 green.**
- **Frontend:** `cd frontend && npm test -- --run` → **24/24 green.** `npm run build` clean.
- **Ford–Johnson tournament:** exhaustively proven ≤10 comparisons over all 720 permutations.
- **Real browser walk** (Playwright, dev servers up): entry → … → values tournament (A/B cards with
  MIQ blurbs, progress %) → hierarchy table (reorder + confirm) → job_characteristics → cv → summary
  ("The Maker" archetype + Big Five pentagon + AI persona + work-values hexagon) → tree → output
  ("36% values fit", MWV top-3 labels) → detail panel ("WORK-VALUES MATCH: 36/100", no Schwartz/Plane
  leftovers). Confirmed `userValues` persists the reordered hierarchy with curve scores
  [100,84,68,52,36,20] + `source:"tournament", confidence:"explicit", curveVersion:1`.

---

## 3. Files changed (all uncommitted)

**Backend:** `data/onet-snapshot.json` (regenerated w/ 28.0 work values), `scripts/build-onet-snapshot.js`,
`workValues.js` (NEW, replaces deleted `schwartzValues.js`), `valuesTournament.js` (NEW), `server.js`
(values/summary routes, resolveProfessionWorkValues, buildScoredOutput rewrite, aiLimiter+cvIntent guard,
whyHere removal), `sessionStore.js` (schemaVersion + Redis-hydrate migration, tournament state, provenance,
serializer), `questionEngine.js` (progress.values), `aiEngine.js` (removed value inference/scoring, MWV
whyThisFits), `prompts.js` (MWV digest + prompts). Deleted `schwartzValues.js(.test.js)`. Tests: NEW
`workValues.test.js`, `valuesTournament.test.js`; migrated server/sessionStore/aiEngine/prompts/
onetIntegration/cvUploadMarkitdown/rateLimit tests.

**Frontend:** `api.js` (values/summary wrappers), `lifePath.js` (rail + WORK_VALUE_* + deriveArchetype),
`components/ProfileCharts.jsx` (WorkValuesRadar, ProfilePanel takes `userValues`), deleted
`components/SchwartzMap.jsx(.css)`, `App.jsx` (entry trim, % label, values step UI + handlers + effects,
summary screen, valuesFit→overall sweep, resetAll), `components/GraphView/NodeComponent.jsx` (MWV labels),
`App.css` (progress row, A/B card, summary), `lifePath.test.js` (rail + work-values + archetype tests).

---

## 4. Follow-ups / not done (optional)

- Not committed — waiting on the user.
- Deploy note: Render runs `hydrate()` on boot; the schema-version bump will **expire pre-existing
  persisted sessions** (old Schwartz shape) on first deploy — intended, users just restart.
- Optional polish: overlay you-vs-profession on the detail panel via
  `<WorkValuesRadar user={...} job={output.workValues} />` (component already supports the `job` prop;
  currently the detail shows the textual match section only).
- `.playwright-mcp/` artifacts are gitignored; safe to leave.

## 5. Gotchas (unchanged)

- App must always work **keyless**; the tournament + work-values scoring are pure (no AI).
- **O\*NET license (do not touch):** `OnetAttribution` badge + Web Services sentence on entry, and the
  `ONET_ATTRIBUTION` footnote in the detail panel. Key only in `X-API-Key`.
- Snapshot rebuild: `node backend/scripts/build-onet-snapshot.js <db_30_3_text dir> <28.0 Work Values.txt>`.
  28.0 zip: `https://www.onetcenter.org/dl_files/database/db_28_0_text.zip`.
- Codex on this machine: config pins `gpt-5.3-codex` which 400s on ChatGPT auth; override `-c model="gpt-5.5"`.
