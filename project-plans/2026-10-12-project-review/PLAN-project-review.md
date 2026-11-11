# Plan: Whole-project & product-idea review — strategic direction to the school pilot
_Locked via grill — by Claude + Eugene (2026-10-12, repo at `fdc5896`)_

> **Meta.** This is a product/strategy plan, not a single feature. It records what
> the grill decided about *who Invector is for, why it wins, and what must exist
> before the first real users*, and it turns that into an ordered work programme.
> Codex: attack the decisions *and* their fit with the current code (`backend/`,
> `frontend/`, `CLAUDE.md`, `project-plans/`). Business assumptions come from the
> 2026-09-28 business report (not in repo) and are summarised under "Context".

## Context (state of the product today, verified in code)
- Mature assessment + output engine: Mini-IPIP-20 Big Five, 12-item RIASEC
  (2 items/type, `backend/riasecItems.js`), Ford–Johnson work-values tournament,
  O*NET-grounded occupation pick (Pearson vs 923 SOC profiles), traceable
  `whyThisFits`, 187 backend tests, keyless deterministic fallbacks. Live on
  Vercel + Render free tier, single instance, Upstash Redis write-through.
- The four advice blocks (`aiRecommendations/events/universities/courses`) are
  **pure LLM output with no links and no verification** (`backend/prompts.js:253`,
  schema `{name, program}` / `{name, provider, why}`).
- **No analytics** of any kind, **no privacy policy / consent / data-deletion**,
  no accounts, no payments, no i18n (English only). Demographics accept age 13+,
  collect sex + city; CV text and the dream answer are sent to OpenAI; sessions
  persist in Upstash.
- Rate limits are **per IP**: 300 req / 15 min global, 30 AI req / 15 min
  (`backend/server.js:121-133`).
- Business report (2026-09-28): freemium where the 4 advice blocks + full roadmap
  are Premium; €9.99 PPP one-off; schools €5/student/yr; UA school pilot
  (~150 students, grades 9–11); launch in EN/ES/FR/DE/PT/UA; positioning
  "evidence-based" while the UI disclaimer says "exploratory self-reflection tool".

## Goal
Re-aim Invector at **students aged 17–24 (choosing a specialisation / first job)
as the product's primary user, monetised B2C**, while **keeping the Ukrainian
school pilot** (ages ~14–17) as the first real-user cohort and data source. The
product's defensible difference becomes **"from profile to concrete, real, local
next steps"** — verified universities/programmes, courses and events with real
links — rather than the psychometrics or the graph, which are easy to copy.
Success is measured by one north-star metric: **share of users who take a real
step within 14 days**. Everything below exists to make that difference real,
measurable and lawful before the pilot starts.

## Approach (ordered; the pilot starts only when steps 1–5 are done)

1. **Privacy-by-design (pilot blocker).**
   a. Privacy policy + consent screen before `POST /api/session/start`.
   b. Age gate: under-16 ⇒ CV upload/paste disabled (journey questions only);
      parental consent for school cohorts collected by the school offline.
   c. PII scrub (names, emails, phone numbers, URLs to personal profiles) on CV
      text **before** it reaches OpenAI.
   d. Explicit retention period for sessions (memory + Redis) and a
      "delete my data" action.
2. **Measurement (pilot blocker).**
   a. Cookieless, PII-free product analytics (PostHog EU) for the funnel
      entry → summary → first output → accept.
   b. North-star instrumentation: outbound-link click events on every local step,
      plus a short 14-day follow-up ("did you do any of these?") — via the school
      for the pilot cohort.
3. **i18n for all six languages (EN, UA, ES, FR, DE, PT) before the pilot.**
   i18n scaffolding on the frontend; AI prompts emit the user's language;
   psychometric items (Mini-IPIP, Mini-IP pool) use published/validated
   translations where they exist.
4. **Local next steps, "no item without a real link".**
   a. Occupation core stays O*NET (only source with measured RIASEC + work values).
   b. Localisation chain: SOC → ISCO-08 (official BLS crosswalk) → Ukrainian
      КП (ISCO-based) → hand-curated ISCO group → Ukrainian higher-education
      specialty codes.
   c. Checked-in **UA universities/programmes snapshot** from official data
      (ЄДЕБО / vstup.osvita.ua), same pattern as `onet-snapshot.json`.
   d. Small curated **courses catalog** (Prometheus, Coursera, EdEra, …) with URLs.
   e. The LLM only **selects and explains** from a server-built shortlist (same
      membership-enforcement pattern as `resolveShortlistSoc`); anything not in
      the shortlist is dropped. Keyless fallback = top shortlist items.
   f. Outside Ukraine: online courses only; universities shown only for countries
      with a snapshot. US salary/outlook hidden or marked "US reference" for
      non-US users.
5. **Adaptive RIASEC.** Item pool = O*NET Mini Interest Profiler (30 items,
   5/type). Start with 2/type (12). Deterministic, pure engine (like
   `valuesTournament.js`): add items while the top-3 order is unstable (gap
   between 3rd and 4th, or within the top, below a threshold, or contradictory
   answers within a type); hard cap 30. Server keeps scoring keys hidden as today.
6. **Pilot** (1–2 Ukrainian schools, all features unlocked for the cohort).
7. **After the pilot:** events via the web-search spike pipeline (model finds
   pages; events come from verified JSON-LD), paywall + accounts (Paddle), with
   the Free/Premium line below.

## Key decisions & tradeoffs
- **Primary user = students 17–24, B2C**; schools kept as pilot cohort, not the
  revenue centre. Tension: the pilot cohort (14–17) is *not* the primary user, and
  the product carries a CV path for a cohort that mostly has none.
- **Differentiator = verified local steps**, not psychometrics/graph. Implies the
  biggest engineering investment goes into data (crosswalks, snapshots, catalogs),
  not UI.
- **Hybrid sourcing**: deterministic snapshots/catalogs for universities and
  courses; web search only for events (post-pilot). LLM never originates an item.
- **Keep O*NET as matching core** + crosswalk, rather than switching to ESCO
  (loses RIASEC/work values) or direction-family-only mapping (too coarse).
- **Free/Premium**: Free gets **one verified step per block** (1 university,
  1 course, 1 event) so the north star is measurable for free users; Premium =
  full lists, path comparison, full roadmap, PDF, saved profile. Paywall/accounts
  are built only after the pilot shows activation. This contradicts the report's
  "4 advice blocks are Premium".
- **North star = "took a real step within 14 days"**, funnel is secondary.
- **Adaptive RIASEC over a validated pool** instead of either the fixed 30-item
  Mini-IP or keeping 12 items. Tradeoff: adaptive stopping on a validated pool is
  not itself a validated administration mode.
- **Positioning (default, not contested in the grill):** one wording everywhere —
  "built on validated instruments and O*NET data; a self-exploration tool, not a
  diagnosis". Drop "playful"; drop unqualified "evidence-based" from the report.
- **All six languages before the pilot** (user's choice over "UA + EN first").
  Tradeoff: delays the pilot and multiplies translation/QA work, while local data
  exists only for Ukraine.

## Risks / open questions
- **Deferred by the user (separate track, not decided here):** infrastructure for
  a classroom — per-IP rate limits will block a class behind one school NAT IP
  (~4–6 students in, given ~50 requests and ~8–10 AI calls per student); Render
  free tier sleeps (~1 min cold start); OpenAI rate limits under 30 concurrent
  sessions; single-instance invariant. **Also deferred: deployment.** These are
  pilot blockers that must be resolved in that separate track before step 6.
- Validated translations of Mini-IPIP and Mini-IP do not exist for every target
  language; machine-translated psychometric items change the instrument.
- ЄДЕБО / vstup.osvita.ua data access format, licence and refresh cadence are
  unverified; specialty codes changed in the 2024–25 reform (letter-coded
  fields) — the crosswalk must target the current list.
- SOC → ISCO-08 is many-to-many; ISCO group → UA specialty mapping is a manual
  judgement call with no ground truth.
- Under-16 consent rules differ per EU country (GDPR Art. 8: 13–16) and under
  Ukrainian law; the OpenAI data-processing terms for minors' text need checking.
- The 14-day follow-up depends on schools; B2C users have no account/email, so
  the north star is only measurable via link clicks for them.
- Design freeze during the pilot was recommended but **not confirmed**.
- Cost: more AI calls (localised prompts, selection over shortlists) vs the
  report's ≤ $0.02/session assumption.

## Out of scope
- Infrastructure hardening and deployment changes (user will handle separately).
- Paywall, accounts, Paddle, counsellor dashboard, institution pricing — after the pilot.
- Events via web search — after the pilot.
- Local university snapshots for countries other than Ukraine.
- Switching occupation taxonomy away from O*NET.
- Visual redesigns.
