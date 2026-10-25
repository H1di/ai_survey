# Invector — visual redesign of the Life Path Explorer frontend

**Date:** 2026-08-18
**Status:** approved for planning
**Source of truth:** `Invector - Gold Branch (Standalone).html` (a bundled design artifact; the
real markup lives in its `__bundler/template` JSON payload — 947 lines of HTML plus the canvas
growth logic in the trailing `text/x-dc` script).

## 1. Goal

Replace the current frontend presentation layer (light theme, Inter, purple accent) with the
Invector design: a near-black, gold-accented, hairline-ruled interface with a canvas-drawn
glowing branch motif. Every screen of the existing product — entry, six assessment steps,
summary, the 1st-output decision, and the accepted life-path graph — is re-composed in the new
language. The step machine, API contract, and backend are untouched.

Non-goal: changing what the product *does*. No route, no scoring function, and no session field
changes. This is a presentation-layer replacement plus two contained UX changes (demographics on
one screen, drag-to-reorder in the values hierarchy).

## 2. Decisions locked in the design interview

| Question | Decision |
|---|---|
| Mockup's "Step 5 · Job Characteristics" (removed from the product in `37e0a08`) | Drop it. Six real steps. |
| Redesign scope | Whole app, including the graph page. |
| Mockup's 1440px rounded artboards | Artboards, not UI. Each section becomes a full-viewport screen; internal composition preserved 1:1. |
| Product name | Rename to **Invector** — wordmark, `<title>`, every UI mention. |
| Final graph | Keep React Flow; restyle nodes/edges and add the branch canvas behind it. |
| "Your 1st output" section | Renders inside the existing dock over the graph, widened to the three-column composition. |
| "drag to reorder" in step 4b | Implement real drag (native HTML5, no new dependency) with arrow-key fallback. |
| Hero nav (`how it works · the engine · github`) | Wire it: the first two open an info panel with real methodology copy, `github` links to the repo. |
| Demographics layout | As in the mockup — all four fields on one screen, one submit. |

## 3. Design tokens

Centralised in `frontend/src/theme/tokens.css`, consumed everywhere as custom properties. Values
are transcribed from the mockup; no invented colors.

### Color

```
--ink-void:      #000000   /* hero background */
--ink-page:      #0a0a0a   /* page background behind screens */
--ink-screen:    #0e0e0e   /* step-screen surface */
--ink-graph:     #050308   /* accepted-graph surface */
--ink-on-gold:   #05070b   /* text on gold/bone buttons */

--gold:          #ffd98c
--gold-70:       rgba(255,217,140,.7)   /* eyebrow text */
--gold-60:       rgba(255,217,140,.6)   /* wordmark on step screens, "or" divider */
--gold-50:       rgba(255,217,140,.5)   /* radio ring, rail meta */
--gold-40:       rgba(255,217,140,.4)   /* roadmap numerals, section accents */
--gold-35:       rgba(255,217,140,.35)  /* large ghost numerals (A/B, ranking) */
--gold-30:       rgba(255,217,140,.3)   /* dashed rules */
--gold-25:       rgba(255,217,140,.25)  /* primary hairlines */
--gold-20:       rgba(255,217,140,.2)   /* pill borders, advice-row rules */
--gold-18:       rgba(255,217,140,.18)  /* ranking row rules */
--gold-15:       rgba(255,217,140,.15)  /* radio row rules */
--gold-wash:     rgba(255,217,140,.06)  /* Me-node fill */
--gold-hover:    rgba(255,217,140,.05)  /* A/B hover wash */

--bone:          #f4f0e7                /* hero CTA fill, hero wordmark */
--text:          #ffffff
--text-72:       rgba(255,255,255,.72)  /* screen sub-headline */
--text-60:       rgba(255,255,255,.6)   /* body copy */
--text-55:       rgba(255,255,255,.55)  /* meta */
--text-45:       rgba(255,255,255,.45)  /* graph card meta */
--text-40:       rgba(255,255,255,.4)   /* footnotes */
--bone-50:       rgba(244,240,231,.5)   /* hero nav */
--bone-40:       rgba(244,240,231,.4)   /* O*NET legal text */

--positive:      #7CFFB2                /* "Accepted" state only */
--violet-glow:   rgba(163,120,255,.06)  /* background glow + branch children only */
```

Two radial glows compose the step-screen background, exactly as in the mockup:

```
radial-gradient(ellipse 480px 320px at 100% 0%, rgba(255,217,140,.07), transparent 60%),
radial-gradient(ellipse 420px 280px at 0% 100%, rgba(163,120,255,.06), transparent 60%),
var(--ink-screen)
```

The summary screen instead uses `radial-gradient(ellipse 600px 360px at 50% 0%, rgba(255,217,140,.08), transparent 65%)`.
The values-tournament and 1st-output screens use flat `--ink-screen` with no glow — that
restraint is deliberate in the source and must be preserved.

### Typography

Three families, loaded from Google Fonts via `<link>` in `frontend/index.html` (mirroring the
mockup's own `preconnect` to `fonts.googleapis.com` / `fonts.gstatic.com`). The `Inter` `@import`
in `index.css` is removed.

- **Archivo** 400/500/700/900 — display. 900 for headlines and numerals, 700 for buttons.
- **Manrope** 300–700 — body copy.
- **IBM Plex Mono** 400/500 — eyebrows, tags, step markers, wordmark, meta.

Type scale (verbatim from the mockup, desktop):

| Role | Spec |
|---|---|
| Hero H1 | Archivo 900 68px/1.05, `-.02em`, uppercase |
| Screen H2 | Archivo 900 40px/1.1, `-.02em` |
| Tournament H2 | Archivo 900 44px/1.05, `-.02em`, uppercase |
| Summary H2 | Archivo 900 36px/1.1 |
| Output field H3 | Archivo 900 40px/1.05, uppercase |
| Graph job title | Archivo 900 34px/1.1 |
| Value name (A/B) | Archivo 900 34px/1 |
| Ghost numeral (A/B) | Archivo 900 46px/1 |
| Rank numeral | Archivo 900 30px/1 |
| Item statement | Archivo 600 22–24px/1.3 (italic for Big Five and the CV prompt) |
| Card title | Archivo 700 22px/1.15 |
| Body | Manrope 400 13.5–15px/1.6–1.7 |
| Footnote | Manrope 400 12.5px/1.5–1.6 |
| Legal | Manrope 300 10.5px/1.5 |
| Eyebrow | IBM Plex Mono 500 10px/1, `.18em`, uppercase |
| Wordmark | IBM Plex Mono 500 13px/1, `.14em`, uppercase |
| Tag / meta | IBM Plex Mono 400–500 10–12px, `.05–.16em`, uppercase |

Headline scale must survive the port: clamp down for narrow viewports, but never flatten the
68/40/22 relationship into one uniform size.

### Shape and rule

Buttons are `999px` pills. The hero textarea is `16px`. Screen containers are `14px` (only
visible where a surface actually meets the page background). Everything else is square: the
design separates content with 1px hairlines in the gold ramp, not with cards. No box shadows
except the two glow effects (`0 0 14px` on the wordmark dot, `0 0 18–24px` on the Me node and
active ring) and the hero CTA hover lift (`0 12px 30px rgba(255,217,140,.35)`).

## 4. Architecture

The existing `App.jsx` (1736 lines) already holds every screen inline. Rather than restyle in
place, the presentational layer is extracted so the design's regular composition is expressed
once instead of per screen.

```
frontend/src/
  theme/tokens.css            NEW — custom properties, font stacks, motion timings
  ui/
    Wordmark.jsx              NEW — glowing dot + "invector"; `tone` = hero | screen
    ScreenShell.jsx           NEW — glow background, wordmark, eyebrow, H2, sub, body slot
    Eyebrow.jsx               NEW — mono step marker ("step 2 · big five · item 1 of 20")
    LikertScale.jsx           NEW — 5 ringed options above a hairline; select advances
    SplitChoice.jsx           NEW — the A|or|B block (values tournament, CV A/B)
    RankList.jsx              NEW — numbered rows, HTML5 drag + arrow-key reorder
    BranchCanvas.jsx          NEW — the growing-branch animation layer
    ui.css                    NEW — styles for the above
  screens/
    EntryScreen.jsx           MOVED from App.jsx (hero)
    JourneyIntroScreen.jsx    MOVED — the "Career Discovery Journey" card
    DemographicsScreen.jsx    REWRITTEN — 2x2 grid, single submit
    BigFiveScreen.jsx         MOVED + restyled
    RiasecScreen.jsx          MOVED + restyled
    ValuesTournamentScreen.jsx  MOVED + restyled (SplitChoice)
    ValuesHierarchyScreen.jsx   MOVED + restyled (RankList, drag)
    ExperienceScreen.jsx      MOVED from CvCard + journey question block
    SummaryScreen.jsx         MOVED + restyled
    StepRail.jsx              MOVED from JourneyRailStrip — pill row
    OnetAttribution.jsx       MOVED unchanged in substance
    screens.css               NEW
  App.jsx                     KEEPS all state, handlers, snapshot application; renders screens
  App.css                     REWRITTEN against the new tokens
  index.css                   REWRITTEN — reset + body defaults only
  components/GraphView/*.css  REWRITTEN — dark/gold node and edge styling
  components/ProfileCharts.*  RECOLORED — recharts axes/grids/fills to the gold ramp
frontend/index.html           <title>Invector</title> + the Google Fonts links
frontend/public/favicon.svg   REPLACED with the branch mark shipped in the design artifact
                              (gold `#ffd98c` strokes on `#0a0a0a`, 200x200 viewBox)
```

Screens stay presentational: props in, callbacks out. `App.jsx` remains the single owner of
session state and every API call, so the snapshot-is-the-source-of-truth rule is unaffected.
`lifePath.js` keeps all pure helpers and gains one (`moveRankItemTo`).

## 5. Screen specifications

Copy below is verbatim from the mockup unless a row in §6 says otherwise. Copy that comes from
the API (question text, options, placeholders, item statements) already matches the mockup
word-for-word — verified against `backend/questionPool.js`, `bigFiveItems.js`, `riasecItems.js` —
and continues to render from the snapshot.

### 5.1 Entry (hero)

Full-viewport, `--ink-void`, two stacked canvases (branch + drops) filling the frame.

- Top bar, 22px/40px padding: wordmark left (`--bone`); nav right — `how it works`, `the engine`,
  `github`, 26px gap, `--bone-50`.
- H1, left-aligned, max-width 1100px, `text-shadow: 0 4px 24px rgba(0,0,0,.6)`, broken exactly as
  the mockup breaks it: *What would you do / if you knew you / would definitely / **succeed?***
  — the last line in `--gold`.
- Textarea: max-width 520px, min-height 90px, radius 16px, `rgba(255,255,255,.07)` on a
  `rgba(255,217,140,.32)` border; focus → `--gold` border + `0 0 0 3px rgba(255,217,140,.18)`.
  Placeholder "Write your honest answer"; existing 500-char cap retained.
- CTA pill: `--bone` fill, `--ink-on-gold` text, Archivo 700 14px. Label **"Start the assessment"**;
  busy label "Entering…". Hover → `--gold`, `translateY(-2px)`, gold shadow.
- Disclaimer, max-width 420px, centered: "This is a playful exploratory tool. Because of its
  simplified structure, it is not fully reliable."
- Bottom: the O*NET badge and legal sentence (§6.1).

Nav behaviour: `how it works` and `the engine` open the existing side info panel with methodology
copy (assessment instruments; O*NET grounding and the work-values scoring); `github` is an
external link.

### 5.2 Step rail

A wrapping row of pills under the header on every assessment screen. Padding 8px 16px, radius
999px, Archivo 600 12px, 1px `--gold-20` border. Current step: `--gold` fill, `--ink-on-gold`
text. Other steps: `rgba(255,255,255,.06)` fill, `--text-60`. Reachable steps stay buttons
(`POST /api/session/goto`, existing `railStepReachable` gate); unreachable steps render as plain
text at reduced opacity. Labels, replacing the current ones: **Demographics · Big Five ·
Interests · Values · Experience · Summary**.

### 5.3 Step 1 · Demographics

Eyebrow `step 1 · demographics`; H2 "A little about you"; sub "Four quick questions — sex, age,
country, city."

All four questions render at once in a 2-column grid (24px gap, max-width 760px, left-aligned) —
this replaces the current one-question-per-screen flow. Choice questions render as radio rows:
a 16px ring in `--gold-50`, a hairline `--gold-15` under each row, label Manrope 400 14px; the
selected row fills the ring with gold and lifts the label to `--text`. Text and number questions
render as underline inputs (`--gold-35` bottom border, transparent field, Manrope 400 15px) using
the API's placeholders.

Submit posts the four answers to `POST /api/session/demographics` sequentially, applying each
snapshot; the fourth advances the step. The button is disabled until all four are non-empty and
during the flight. If a POST fails mid-chain, the error surfaces and already-saved answers stay
saved — re-submitting only re-sends what the snapshot does not yet have.

### 5.4 Step 2 · Big Five

Eyebrow `step 2 · big five · item {n} of {total}`; H2 "Mini-IPIP-20"; sub "The fixed public-domain
Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity."

Item statement in Archivo 600 24px italic, quoted. Below it a hairline `--gold-25`, then five
options spread across 520px: a 22px ring over a centered label, Manrope 400 11px `--text-55`.
Selecting an option submits and advances (existing behaviour). Anchors change to the mockup's
IPIP wording: **Very inaccurate · Moderately inaccurate · Neither · Moderately accurate · Very
accurate**. Back stays available as a mono ghost control.

### 5.5 Step 3 · RIASEC interests

Eyebrow `step 3 · riasec interests · item {n} of {total}`; H2 "How much would you enjoy this?";
sub "Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a
Holland code. You can skip to infer interests from personality instead."

Statement in Archivo 600 22px, quoted. The same `LikertScale` primitive renders the enjoyment
anchors (unchanged: Not at all / Not really / Maybe / Quite a bit / Very much — the mockup does
not show this scale). Selecting advances. Secondary pill, shown only while no item is answered:
**"Skip — infer from personality"** (transparent, `rgba(255,255,255,.3)` border).

### 5.6 Step 4 · Values tournament

Flat `--ink-screen`, no glow. Eyebrow `step 4 · values tournament · comparison {n} of {total}`;
H2 "Which matters more?" (uppercase, 44px).

`SplitChoice`: an 820px block bounded top and bottom by `--gold-25` hairlines, two equal buttons
with 34px/30px padding, left-aligned; the value name in Archivo 900 34px, its MIQ blurb in
Manrope 400 14px `--text-60` beneath. A 1px vertical rule between them carries a centered "or"
chip in IBM Plex Mono 600 11px `--gold-60` on `--ink-screen`. Hover washes the half with
`--gold-hover`.

Footnote, max-width 600px, `--text-40`: "An adaptive Ford–Johnson merge-insertion tournament, ≤10
comparisons, ranking the six Minnesota work values: Achievement, Independence, Recognition,
Relationships, Support, Working Conditions."

### 5.7 Step 4b · Confirm hierarchy

Eyebrow `step 4b · confirm your hierarchy`; H2 "Your work values, ranked"; sub "The tournament
result — reorder if something looks off, then confirm."

`RankList`: six rows, max-width 560px, each `16px 0` with a `--gold-18` hairline — rank numeral
in Archivo 900 30px `--gold-35`, label in Manrope 600 17px, and the mono hint "drag to reorder"
right-aligned in `--gold-50`. Reordering is real drag (HTML5 `draggable`, `dragover` reorder
preview, `drop` commit) plus arrow-key support on a focused row (`role="listbox"` / `option`,
`aria-grabbed` announcements); both paths go through pure helpers in `lifePath.js`
(`moveRankItem` for one-step moves, new `moveRankItemTo(list, from, to)` for drops). Confirm pill:
"Confirm hierarchy".

### 5.8 Step 5 · Experience

Eyebrow `step 5 · experience` (renumbered — see §6.4); H2 "Where should we start from?"; sub
"Paste or upload a CV (.pdf/.docx/.html/.txt/.pptx, max 5 MB) — or answer seven career-journey
questions if you don't have one." The format list stays driven by the snapshot's
`cvUploadFormats`; the sentence above is the mockup's static rendering of the same list.

An 820px block ruled top and bottom by dotted SVG lines (`stroke-dasharray="1,7"`, `--gold-30`),
split by a vertical `--gold-25` rule:

- **A** (ghost numeral, Archivo 900 46px `--gold-35`): "Drop your CV file here, or paste its
  text." — the existing drop zone, paste textarea, and file input.
- **B**: the current career-journey question in Archivo 600 17px italic, quoted, over an underline
  input carrying the API placeholder.

The H2 doubles as the intent question the CV slide already asks: its two answers (`new` |
`use_skills`, `POST /api/cv/intent`) render as mono pills directly under the sub-headline, and the
A/B block stays visibly locked — reduced opacity, controls disabled — until one is chosen, as it
does today.

### 5.9 Step 6 · Summary

Center-glow background. Eyebrow `step 6 · summary`; H2 "Who you are".

Order: archetype name and tagline (`deriveArchetype`), Big Five radar, persona prose (max-width
520px, Manrope 400 14px/1.7 `--text-60`), work-values radar. Both radars are the existing recharts
components recolored to the gold ramp on dark: `--gold-25` grid, `--text-55` tick labels, gold
stroke with a low-alpha gold fill. The mockup's four overlapping rings are its stand-in for these
charts and are not reproduced. CTA pill: **"Enter the Life Path Engine"**.

### 5.10 1st output (dock over the graph)

Eyebrow `your 1st output`; H3 = the oriented field name, Archivo 900 40px uppercase.

A 1100px three-column row bounded by `--gold-25` hairlines with `--gold-25` vertical rules
between columns. Each column: mono tag in `--gold`, Archivo 700 22px title, Manrope 300 13.5px
`--text-60` body. The columns carry the real output, not the mockup's placeholder text:

| Tag (verbatim) | Title | Body |
|---|---|---|
| `oriented field` | the field name — the mockup duplicates the H3 here, so this stays the live `orientedField` | `output.thesis` |
| `concrete job` | "Grounded in O*NET" | the job title and its O*NET line (`$X/yr median (US) · outlook: …`), US-flagged as today |
| `why this fits` | "Traced to your answers" | the lead bullets from `whyThisFits`, ending in a gold text link "See the full trace →" that opens the existing details panel |

Footnote (see §6.2), then two pills: **"Yes — accept this path"** (gold) and **"No — regenerate
from a different field"** (ghost). Busy labels reuse today's ("Building next steps…", "Finding
another…").

### 5.11 Accepted life-path graph

`--ink-graph` surface, the branch canvas behind everything at `opacity:.55`, wordmark top-left.
Center header: `accepted · your life path graph`.

React Flow is kept; its nodes and edges are restyled:

- **Me node** — 96px circle, 1.5px `--gold-60` border, `--gold-wash` fill, Archivo 700 15px gold
  label, `0 0 24px rgba(255,217,140,.15)`; caption beneath in mono `--gold-50`:
  "invector · life path model".
- **Output node** — left rule 2px `--gold`, 30px inset, max-width 480px. Header row: mono field
  tag in `--gold`, a `·`, then `{n}% VALUES FIT` in Archivo 700 gold. Title Archivo 900 34px.
  Thesis Manrope 400 13.5px/1.7 `--text-60`. Meta row in `--text-45`: salary · outlook, and for
  the accepted output the word "Accepted" in `--positive`, uppercase, 11px.
- **Advice nodes** — a row of 220px cells bounded by `--gold-20` rules top, bottom, and between:
  Archivo 700 15px title over mono `{count} suggestions`.
- **Roadmap** — a vertical list of 360px rows, `10px 0`, `--gold-15` hairline between rows,
  Archivo 900 20px numeral in `--gold-40` (the current/last step's numeral in full `--gold`),
  Manrope 600 14px label, mono 11px `--text-40` timeframe. 2px gold connectors between rows.
- **Edges** — `BranchEdge` restyled to 1.5px `rgba(255,217,140,.4)` bezier curves; the existing
  draw-in animation timing is unchanged.

The profile and detail side panels adopt the same surface, hairlines, and type ramp.

## 6. Deliberate deviations from the mockup

Approved in the design interview.

1. **O\*NET badge.** The mockup draws the badge in CSS. The USDOL/ETA terms require the official
   artwork hotlinked from `onetcenter.org`, which is what the app does today. The real badge and
   the exact legal sentence stay; only the container is restyled. Non-negotiable, per CLAUDE.md.
2. **Honest refine copy.** The mockup's "No — tune or regenerate" and the footnote clause "or No
   to tune specific parameters or regenerate from a genuinely different field family" promise
   per-parameter tuning that `POST /api/output/refine` does not implement. Button becomes "No —
   regenerate from a different field"; the footnote drops the tuning clause and otherwise stays
   verbatim: "Say Yes to accept (unlocks four advice blocks + a roadmap) or No to regenerate from
   a genuinely different field family."
3. **No RIASEC "Continue" button.** The mockup shows no rating scale, so its Continue is the only
   way forward. The product rates 12 items; selecting an anchor advances, as it does today. The
   skip control keeps the mockup's label.
4. **Step renumbering.** With Job Characteristics gone: Experience is `step 5`, Summary is
   `step 6`.
5. **Rail labels** come from the mockup, replacing "About you / Step 1 — How you think / …".
6. **Big Five anchors** change to the mockup's accurate/inaccurate wording (also the canonical
   IPIP anchors). The RIASEC enjoyment anchors are unchanged — the mockup does not show them.
7. **Space Grotesk** appears once, in the hero CTA, and nowhere else in the file. Treated as a
   slip: the CTA uses Archivo 700 like every other button.
8. **Journey intro screen** is not in the mockup but is real functionality. Kept, redrawn in the
   new language.
9. **Back controls** are absent from the mockup but exist per step today. Kept, restyled as a
   small mono ghost control in the screen's top-left, under the wordmark.
10. **"Details" becomes a link.** Today the dock carries a third ghost button opening the full
    traced explanation. The mockup has exactly two buttons, so that action moves into the third
    column as the gold text link "See the full trace →" — the functionality is kept without adding
    button chrome the design does not have.

## 7. Motion

`BranchCanvas` ports the mockup's `growScene` with two presets:

| | hero | graph |
|---|---|---|
| background | `#000` | transparent |
| origin | `0.72 × W` | `0.5 × W` |
| trunk width / life / speed | 5.5 / 280 / 4.6 | 3.5 / 260 / 3.6 |
| branch speed / wander | 2.8 / 0.32 | 2.4 / 0.4 |
| max depth / branch rate / split angle | 4 / 0.018 / 0.45 | 6 / 0.03 / 0.55 |
| child width × / life × / taper | 0.66 / 0.7 / 0.997 | 0.68 / 0.74 / 0.997 |
| drops (rate / speed / life) | 0.03 / 0.7 / 90 | 0.03 / 0.6 / 90 |
| restart pause | 270 frames | 100 frames |
| child hue | `200,165,255` | `163,120,255` |

Both use `mainHue 255,225,170` and `dropHue 255,235,190`, draw with `globalCompositeOperation:
"lighter"`, and glow via `shadowBlur` 26 (trunk) / 10 (branches). Drops are radial-gradient
haloes with a white core, drifting upward and fading over their life.

Implementation requirements beyond the prototype:

- DPR-aware sizing capped at 2, re-applied on resize.
- One `requestAnimationFrame` loop per instance, cancelled in cleanup along with the resize
  listener — React 19 StrictMode double-mounts, so leaking a loop is immediately visible.
- Tip count already caps at 260; keep it.
- `prefers-reduced-motion: reduce` → run the growth synchronously to a finished frame, paint it
  once, and never start the loop. The existing `REDUCED_MOTION` constant in `App.jsx` is reused.
- The canvas is decorative: `aria-hidden="true"`, never focusable.

## 8. Accessibility and responsiveness

- Contrast: body copy stays at or above `--text-60` on `--ink-screen`; `--text-40` is reserved for
  footnotes and never carries information not available elsewhere.
- Every interactive element keeps a visible focus ring: 2px `--gold` outline at 2px offset (the
  design's own focus treatment for the hero textarea, generalised).
- The Likert rings, radio rows, and A/B halves are real `<button>`/`<label>` elements with
  `aria-pressed` / `aria-checked`, not styled `div`s.
- `RankList` is operable from the keyboard (arrow keys move the focused row, Home/End jump) with
  live-region announcements; drag is an enhancement.
- Breakpoints: ≥1200px is the design as drawn. 900–1200px scales headline sizes down one step and
  narrows the 1100/820/760px blocks. <900px collapses every two-column grid and A/B split to a
  single column, keeps the hairline rules as horizontal dividers, and drops the H1 to 40px. The
  rail wraps.

## 9. Testing and verification

- `cd backend && npm test` — must stay green; no backend file is touched.
- `cd frontend && npm test -- --run` — existing Vitest suites over `lifePath.js` and `devMode.js`
  stay green. New unit tests for `moveRankItemTo` (in-bounds moves, no-op when `from === to`,
  clamping, permutation preserved) alongside the existing `moveRankItem` tests.
- Manual pass through the real flow, keyless and with `OPENAI_API_KEY` set, using the dev panel
  (`?dev=<token>`) to reach each step, plus a full clean run from the entry screen.
- Playwright screenshots of all eleven screens at 1440px and 900px, checked against the mockup
  rendered in the same browser.
- Reduced-motion pass: emulate `prefers-reduced-motion: reduce` and confirm both canvases paint a
  static branch and no RAF loop is running.

## 10. Out of scope

- Backend, prompts, scoring, O*NET data.
- Re-adding the Job Characteristics step.
- Replacing React Flow.
- New dependencies of any kind: drag uses native HTML5 DnD, the branch uses canvas 2D, charts stay
  on recharts, transitions stay on the framer-motion already in the tree.
