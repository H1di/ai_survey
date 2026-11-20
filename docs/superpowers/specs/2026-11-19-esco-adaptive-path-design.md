# ESCO-first matching + adaptive path — design

**Date:** 2026-11-19
**Status:** Draft, awaiting approval
**Deferred from the same request:** grades from DCU Loop / manual grades → `project-plans/2026-11-19-loop-grades-import.md`

## Intent

The product's result (which occupation, which education, which path) must rest on the European
occupation database, ESCO, with O*NET only completing the picture where ESCO is silent. The last slide
stops being a static AI roadmap: the person moves and stretches the stages themselves, sees real
events, courses, volunteering and education next to the stage they belong to, and keeps a sandbox of
their own unconfirmed plans that stays off the main graph until they pin one.

Why: the product targets Europe (7 languages, EU pilots); an American taxonomy behind the result is
the wrong foundation, and AI-invented events/courses with no dates or links are not trustworthy.

## Goals

1. **ESCO wins, O*NET complements.** Every fact the person sees about their occupation (title,
   description, skills) comes from ESCO. O*NET supplies only what ESCO does not have: the RIASEC
   profile and work values that personality matching needs, the job zone, tech, and US salary/outlook
   (still visibly US-flagged). Where both have a value, ESCO's is used and O*NET's is not shown.
2. **One chain from profile to education:**
   profile → occupation (O*NET ranking, ESCO content) → ESCO skills the person lacks →
   education level → concrete programs and courses for those skills → nodes beside path stages.
3. **Adaptive path.** The person can move a stage in time and stretch/shrink it; edits persist.
4. **Side nodes.** Events, courses, volunteering and education appear as one node per kind beside
   the related stage, showing the top 3 finds (relevance, then date). Finds are temporary (cached);
   only what the person pins is kept.
5. **Sandbox of variants.** The person writes their own wishes ("a year in a big corporation"); AI
   suggests the best-fitting stage. Unpinned variants live only in the sandbox panel; a pinned variant
   becomes a side node beside its stage. The line itself does not change.

## Non-goals

- Grades import (Loop) and manual grade entry — deferred.
- UI translation (the i18n epic). ESCO titles are stored in all 7 languages now, shown in English.
- Ranking ESCO occupations directly (rejected approach B, below).
- Multi-instance, queues, background workers.

## Anti-goals (failure even if it "works")

- Any event, course, program or volunteering item with an invented title, date or link. If it was not
  found on a fetched page and verified there, it is not shown.
- O*NET and ESCO contradicting each other on screen (two titles, two skill lists).
- A cluttered path: never more than 3 finds under a node; sandbox variants never on the graph.
- The app breaking without keys.

## Approaches considered (for ESCO in matching)

- **A — ESCO over the existing ranking (chosen).** Ranking stays on O*NET RIASEC profiles
  (`rankOccupations`), restricted to SOCs that have at least one ESCO occupation. After the SOC is
  picked, one ESCO occupation among that SOC's matches is chosen; everything shown comes from it.
  Same matching precision as B (ESCO profiles are inherited from O*NET anyway), funnel and tests stay.
- **B — rank ~3000 ESCO occupations directly.** Several ESCO occupations share one SOC's profile →
  ties; a 15-item shortlist could be 15 variants of one job. Rewrites the funnel, the client data chunk
  and its mirror test. 3× the work for the same precision. Rejected.
- **C — live ESCO API per request.** Breaks keyless mode and depends on EU uptime. Rejected; the
  API is not used at runtime.

Chosen by the user: **A**.

## Decisions (made in conversation)

| Topic | Decision |
|---|---|
| Source priority | ESCO first; O*NET only where it does not contradict and adds information |
| Matching | Approach A |
| Side features | One node per kind beside the related path stage |
| Finds | Kept temporarily (cache); 3 shown under the node; "more →" lists the rest |
| Pinned finds | Kept permanently |
| Pinned sandbox variant | Becomes a side node beside the nearest stage; the line does not change |
| Search pipeline | The 2026-09-28 spike: the model finds pages, items come from structured data on fetched pages or are verified against page text (`project-plans/2026-09-28-local-events-finder.md`) |
| Education | Both occupation and education are chosen: education = the gap between the occupation's ESCO skills and what the person already has |
| Build order | 1 ESCO → 2 adaptive path → 3 side nodes → 4 sandbox; each ships on its own |
| Skills the person has | Checklist of ESCO essential skills after "Yes", pre-ticked from the CV; no AI |
| Search cost | Script over fixed sites first (zero tokens); AI web search only when a node has < 3 finds; ≤ 4 lookups per path; shared non-personal cache |
| Universities | DCU programmes and DCU short courses first (pilot); others later |
| Tokens | Minimise: AI only for understanding the person's free text; see "Token budget" |

## Design

### Part 1 — ESCO data and precedence

**Snapshot.** `node backend/scripts/build-esco-snapshot.js <esco csv dir> <esco-onet crosswalk csv>`
→ `backend/data/esco-snapshot.json`, checked in, like the O*NET snapshot. Inputs are the official
ESCO CSV download and the official ESCO ↔ O*NET-SOC crosswalk (esco.ec.europa.eu → "Other
crosswalks"). Per ESCO occupation kept:

```
{ uri, code, iscoGroup,
  titles: { en, uk, fr, de, es, pt },   // ESCO has no Russian; ru reads en
  description,                       // en
  essentialSkills: [{ uri, label }], // en labels
  optionalSkills:  [{ uri, label }],
  soc: [{ soc, match: "exact"|"close"|"narrow"|"broad" }],
  inherited: false }
```

The crosswalk is published by the European Commission as CSV (match types exact / close / narrow /
broad, a second version adds "related"); use the version without "related". ESCO is free to reuse
with source acknowledgement; the builder copies the exact required wording from the download terms.

Only occupations whose SOC exists in `onet-snapshot.json` are kept. An ESCO occupation with no
crosswalk pair is attached at build time to the SOC that most of its ISCO 4-digit siblings map to,
with `inherited: true` (shown as a less certain match). A SOC with no ESCO occupation drops out of
ranking. The build script prints counts of each case. Skill labels are English only until the i18n
epic. The titles (6 languages — ESCO has no Russian) live in the backend snapshot only; the client chunk (`onet-field.json`)
carries no ESCO text.

*Builder's call (settled):* coverage is measured by the build script in the first step. A direction
family with fewer than 15 surviving SOCs just yields a shorter shortlist; a family with none is
excluded from `rankDirections` like an exhausted family in the refine loop.

**Ranking.** `rankOccupations` and its client mirror (`onetField.js`, `onet-field.json`) filter to
SOCs with ESCO occupations. Funnel copy takes the count from the data instead of the hard-coded 923.

**Picking the ESCO occupation.** The first-output prompt lists, for each shortlist SOC, its ESCO
candidate titles; the AI returns `escoUri` alongside `socCode`. `resolveEsco` validates it like
`resolveShortlistSoc`: a URI among that SOC's candidates → else the best match type
(exact > close > narrow > broad, non-inherited first, then title order). Keyless uses the
deterministic rule directly.

**Precedence (`mergeOccupation`).**

| Field | Source |
|---|---|
| `jobTitle`, description, skills | ESCO |
| RIASEC profile, work values (→ `valuesFit`) | O*NET (ESCO has none) |
| Job zone, tech, related, US salary/outlook | O*NET, shown as complementary facts; salary/outlook stay US-flagged |
| Education level | ESCO side: the ISCO skill level of the occupation's ISCO group (1–4) sets the range; O*NET job zone refines within that range (it never overrides it). Mapped to EQF, always labelled as an estimate |

`output.esco = { uri, code, title, essentialSkills, optionalSkills, match, inherited, attribution }`.
`output.socCode` and `output.onet` stay (internal key + complementary block). `whyThisFits` grounds
"current skills" and "skills to develop" in ESCO essential skills instead of O*NET skills.

**Skills gap — checkboxes, no AI** (built in the Part 3 plan, where it is first consumed). After "Yes" on an output, the person sees the occupation's ESCO
essential skills as a checklist: "which of these can you already do?" Pre-ticked by token overlap
with the CV `skills`/`keywords` when a CV exists; empty otherwise. `POST /api/skills/confirm`
`{sessionId, outputId, have: [skillUri]}` stores `output.skillsGap = { have, missing }`. Skippable:
skipping keeps the pre-ticked state. Zero tokens, and more accurate than an AI guess. The gap drives
education and course matching in Part 3.

### Token budget (applies to every AI call)

- AI only where free text about the person must be understood (dream, CV, persona, shortlist pick,
  why-this-fits, sandbox stage suggestion). Everything numeric stays deterministic.
- The ESCO pick rides in the existing first-output call; no new call for it.
- Stable instructions first, personal data last in every prompt, so OpenAI's automatic prefix cache
  (≥ 1024 tokens) applies.
- `buildProfileDigest` compacted: numbers and codes rather than prose; ESCO candidates as titles only;
  output length capped per generator.
- Each generator logs its `usage` (input / cached / output tokens) in one structured line, so further
  cuts are made from measurements.

**Attribution.** An ESCO attribution line renders wherever ESCO data shows, next to the existing
O*NET one. The O*NET license blocks stay exactly as they are.

### Part 2 — Adaptive path

- Roadmap generation is unchanged (5–7 AI stages, keyless fallback). Each stage gains a stable `id`
  and, once edited, explicit `startMonth` / `durationMonths`; `pathLayout` uses those over the parsed
  `timeframe` when present.
- Drag on desktop: the middle of a stage moves it, the edges stretch it. Every stage also has
  accessible controls (start / duration steppers) in its stage panel, which is the primary control on
  phones.
- Stage order is fixed. A move is clamped between neighbours; stretching a stage pushes later stages
  forward (ripple). (Builder's call on exact snapping.)
- `POST /api/roadmap/edit` `{ sessionId, outputId, stageId, startMonth, durationMonths }` → snapshot.
  Accepted output only, values within `MIN_STAGE_MONTHS..MAX_STAGE_MONTHS`, 400 otherwise.
  "Reset to suggested" restores the AI timing.
- Each edit re-saves the path to `saved_paths` the same way accept/roadmap already do. No migration:
  the `roadmap` jsonb column carries the edited stages and `items` (pinned finds + sandbox, Part 3/4).
  Stable stage `id`s are also what `checkins.step_id` will reference.
- Stage `id` and `needs` land with Part 2 (the roadmap schema change), so Parts 3–4 only add on top.

### Part 3 — Side nodes (events, courses, volunteering, education)

- **Which stage gets which node.** The roadmap prompt tags each stage with up to two `needs` from
  `event | course | volunteering | education`. Keyless fallback by stage position (foundations →
  education + course, first practice → volunteering + event, entry role → event, later → course).
- **Finder, script first** (`backend/services/webFinder.js`). Tier 1 costs zero tokens: a fixed list
  of sites with search-URL templates × keywords (ESCO title in the country's language — ESCO has 28 —
  plus the top missing ESCO skills) × city → country → online. The server fetches those pages and
  extracts schema.org JSON-LD (`Event`, `Course`, `EducationalOccupationalProgram`, volunteering as
  `Event`/`JobPosting` with volunteer markers). Proven in the spike: Eventbrite
  `/d/{country}--{city}/{keyword}/`, Meetup `/find/…`, dev.events. Each other site (Coursera / Class
  Central catalogues, Europass learning opportunities, European Solidarity Corps) gets a short spike
  before it joins the list. Tier 2, only when tier 1 yields fewer than 3 items for a node: OpenAI
  Responses + `web_search` with `include: ["web_search_call.action.sources"]`, same extraction; items
  without JSON-LD may come from LLM extraction only if the title and the date (when given) are found
  verbatim in the fetched page text. Past events are dropped.
- **Site health.** A template returning zero items for every query is a broken site, not "no events":
  log it (throttled, like `onetApi`) and expose per-site last-success on `GET /api/health`.
- **Site terms.** Eventbrite and Meetup restrict automated collection in their terms. Acceptable for
  the pilot at low volume behind the cache; before a paid launch, switch those sites to official APIs
  or to deep links only.
- **Education: DCU first.** For now the education node and university choice focus on Dublin City
  University: DCU degree programmes and DCU short courses / micro-credentials. They come from a
  checked-in DCU snapshot (`backend/data/dcu-courses.json`, built by a script from dcu.ie, refreshed
  by hand), matched to the occupation by ESCO skills and field — deterministic, zero tokens, works
  keyless. Shown to everyone regardless of city during the pilot, labelled as DCU. Other universities
  come later. DCU short courses also feed the course node alongside the online catalogues. How dcu.ie
  exposes its catalogue (JSON-LD, listing pages) is the first spike of Part 3.
- **Fetch safety.** Server-side fetching of model-supplied URLs: http(s) only, public addresses only
  (no private/loopback/link-local after DNS resolution), timeout, response size cap, no redirects to
  private addresses.
- **Ranking.** Relevance (overlap with the stage's missing ESCO skills and the occupation title), then
  date ascending. Top 3 under the node; "more →" opens the rest.
- **Temporary storage.** Results cached 7 days, keyed by ESCO URI + city + country + kind — nothing
  personal, so a second person with the same occupation and city costs nothing. Personal order
  (overlap with *their* missing skills) is computed in code on top of the shared cache. In-process
  plus Redis when configured. Single-flight per key. Nothing about finds is written to the session
  except pinned items.
- **When it runs.** On first render of the accepted path: one lookup per kind (≤ 4 per path, not per
  stage), in the background; finds are distributed to the stages tagged with that kind by skill
  overlap. Nodes show a loading state and never block a button.
- **Pinning.** A pinned find is copied into `session.pathItems[outputId].pinned` and saved with the
  path; pinned items show under the node above the top 3.
- **Keyless.** Nodes show deep links only (Eventbrite, Meetup, LinkedIn events; ESC portal; course
  and program search pages). The server fetches nothing.
- **Replaces** the AI-invented `events`, `universities` and `courses` blocks in `output.detail`.
  `aiRecommendations` stays.

### Part 4 — Sandbox of variants

- A sandbox panel beside the graph. The person writes a wish (≤ 200 chars, ≤ 20 items). With a key
  the AI suggests the best stage and a one-line reason; keyless, the person picks the stage.
- Unpinned variants are only in the panel. "Pin" places the variant as a side node (kind `variant`)
  beside its stage; "unpin" returns it to the panel; delete removes it. The person can change the
  stage before or after pinning.
- Stored in `session.pathItems[outputId].sandbox` and saved with the path (it is the person's own
  content, not a temporary find). Text goes through `scrubPii` before any prompt.

### Contracts and compatibility

- New snapshot fields (`output.esco`, `output.skillsGap`, stage `id`/`startMonth`/`durationMonths`/
  `needs`, `pathItems`) are read with defaults; sessions persisted before them still load; no
  `SESSION_SCHEMA_VERSION` bump.
- Keyless mode works end to end for every part.
- No new runtime dependency (JSON-LD extraction without an HTML parser library).
- Single instance; caches and locks stay process-local (Redis only for durability).
- `onet-field.json` regenerated after the SOC filter changes.

## Left to the builder

- Exact ESCO release and crosswalk file version; snapshot size trimming (number of skills kept).
- The job-zone → EQF table.
- Snapping/ripple details, drag affordances, node visuals (colours from `tokens.css`, motion rules
  from `frontend/demos/README.md`), and whether side nodes render inside `RoadmapPath` or as graph
  nodes — provided they never overlap the line or stage pills.
- Deep-link set per kind; relevance scoring weights.
- Test split (node:test for snapshot build, precedence, `resolveEsco`, skills gap, edit bounds,
  finder parsing on fixture HTML, fetch guard, cache TTL; Vitest for layout with explicit months,
  drag → edit, side-node layout).
