# Life Path Explorer

Two-part web app. **Part one** is a psychological assessment
(demographics → Big Five/OCEAN → RIASEC interests → an adaptive work-values
tournament → CV or career-journey signal). **Part two** is the **Life Path
Engine**: the assessment profile feeds AI prompts that produce an Oriented Field
+ a concrete job (the "1st Output"), scored on the six Minnesota / O\*NET Work
Values with a fit against your confirmed values hierarchy. The user iterates it through a Yes/No loop; accepting an output
reveals four advice blocks plus a step-by-step roadmap — all rendered as an
interactive React Flow graph.

Every AI call has a deterministic fallback, so the app works with **no API key**
(demo mode). Nothing in the flow depends on OpenAI being reachable. Real
occupation data (RIASEC profile, job zone, skills, work values) comes from a
checked-in O\*NET snapshot, so it works offline too.

For the full technical spec (module map, JSON contracts, data-flow diagram,
engineering assessment) see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for current
status and backlog see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

## Product flow

1. **Entry** — one open question: what you would do if you knew you would
   definitely succeed (`dreamAnswer`, required, capped at 500 chars).
2. **Assessment** — a server-driven `step` machine
   (`demographics → big_five → riasec → values → cv → summary → tree`),
   presented as one "Career Discovery Journey" rail:
   - **Demographics** — sex, age, country, city.
   - **Big Five** — the fixed public-domain Mini-IPIP-20, Likert 1–5; scored to
     OCEAN 0–100 + Stability/Plasticity.
   - **RIASEC interests** — 12 fixed enjoyment-rated activities scored to a
     Holland code, or skip to infer interests from personality.
   - **Values** — an adaptive pairwise tournament (Ford–Johnson merge-insertion,
     ≤10 comparisons) that ranks the six work values, then a reorderable
     hierarchy you confirm.
   - **Experience** — paste/upload a CV (`.pdf/.docx/.html/.txt`, plus `.pptx`
     with MarkItDown; max 5 MB) or answer 7 career-journey questions.
   - **Summary** — a "who you are" conclusion: a deterministic named archetype,
     a Big Five radar, AI persona prose, and your confirmed work-values radar.
3. **Life Path Engine** — an Oriented Field + concrete job (grounded in real
   O\*NET occupations), scored on the six work values with a fit against your
   confirmed hierarchy, plus a structured "Why this fits" block that traces every
   bullet to your scores, ranks, and answers. Say **Yes** to accept (unlocks four
   advice blocks + a roadmap) or **No** to regenerate from a genuinely
   different field family. Everything renders as a graph you can
   explore node by node, with a profile panel that includes per-axis takeaways
   and a "Who you are" summary.

## Tech stack

- **Frontend** — React 19 + Vite + `@xyflow/react` (React Flow), `recharts`,
  `framer-motion`. Single page, no router; the server snapshot is the single
  source of truth.
- **Backend** — Node.js + Express 5 (CommonJS). In-memory sessions with a TTL
  sweep, plus optional Upstash Redis durability (see Limitations). **Runs as a
  single instance** — session state, the single-flight lock, and rate-limit
  counters are process-local.
- **AI** — OpenAI `gpt-4.1-mini`, `chat.completions` JSON mode, with a
  deterministic fallback per generator.
- **Occupation data** — a checked-in O\*NET 30.3 snapshot (with work values
  merged from O\*NET 28.0); optional live US salary/outlook with an `ONET_API_KEY`.

## Project structure

> Question logic & scoring algorithms in depth (Big Five/RIASEC scoring, the
> Ford–Johnson values tournament, Pearson occupation grounding, `valuesFit`):
> see [`ASSESSMENT-LOGIC.md`](ASSESSMENT-LOGIC.md).

- `frontend/` — React app: `src/App.jsx` (stage machine + all state),
  `src/api.js` (fetch wrappers), `src/lifePath.js` (graph builder),
  `src/components/GraphView/` (React Flow wrapper),
  `src/components/ProfileCharts.jsx` (Big Five radar + RIASEC bars + work-values
  radar).
- `backend/` — Express API, assessment engine, AI prompt engine.

Key backend modules:
- `server.js` — routes, rate limiting, CORS allowlist, step guards, request-id +
  leak-safe error responders
- `logger.js` — dependency-free structured error logging + status/route helpers
- `sessionStore.js` — in-memory sessions (+ optional Redis) + snapshot serializer
- `questionEngine.js` — answer validation + all scoring
- `questionPool.js` — demographics, the 7 job-char params, journey questions
- `bigFiveItems.js` / `riasecItems.js` — public-domain fallback item pools
- `valuesTournament.js` — pure Ford–Johnson merge-insertion engine (≤10 comparisons)
- `workValues.js` — the six Minnesota work values: rank curve, `valuesFit`
  (centered cosine), per-direction prototypes
- `cvExtract.js` — CV file → text: MarkItDown-first hybrid (pdf / docx / pptx / html / txt)
- `services/markitdown.js` — optional MarkItDown CLI wrapper; without the binary the built-in parsers take over
- `aiEngine.js` — one generator per AI artifact, each with a fallback
- `prompts.js` — prompt builders + the shared profile digest
- `directions.js` — field-family catalog (prompt grounding + fallback seeds)
- `riasec.js` — Holland weights + direction ranking
- `onet.js` — snapshot lookups + `rankOccupations` (Pearson correlation)

## Run locally

From the repo root:
```bash
npm run install:all   # installs backend/ and frontend/
npm run dev           # backend on :3001, frontend on :5173 (concurrently)
```

Configure the backend env (optional — omit the key for demo mode):
```bash
cp backend/.env.example backend/.env   # then set OPENAI_API_KEY
```

Optional — MarkItDown for `.pptx` uploads and better document extraction:
```bash
python3 -m venv ~/.venvs/markitdown
~/.venvs/markitdown/bin/pip install "markitdown[all]"
# then in backend/.env: MARKITDOWN_BIN=~/.venvs/markitdown/bin/markitdown
```
Without it the backend silently uses its built-in pdf/docx/html/txt parsers.

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

The Vite dev server proxies `/api/*` to `http://localhost:3001`.

## Tests

```bash
cd backend && npm test              # node:test + fetch (160+ tests)
cd frontend && npm test -- --run    # vitest over src/lifePath.js (24 tests)
```

## API Routes

### Session + Assessment
- `POST /api/session/start`
  - body: `{ "dreamAnswer": "..." }` — required, capped at 500 chars
- `GET /api/session/:sessionId` — full session snapshot (used to resume after reload)
- `POST /api/session/demographics`
  - body: `{ "sessionId": "...", "questionId": "sex|age|country|city", "value": ... }`
- `POST /api/big-five/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": 1-5 }` — the 20 static items arrive in the start snapshot
- `POST /api/riasec/start`
  - body: `{ "sessionId": "..." }` — serves the 12 static RIASEC activity items
- `POST /api/riasec/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": 1-5 }`
- `POST /api/riasec/skip`
  - body: `{ "sessionId": "..." }` — infers a low-confidence interest profile instead of the quiz
- `POST /api/values/start`
  - body: `{ "sessionId": "..." }` — starts the pairwise tournament, returns the first A/B comparison
- `POST /api/values/answer`
  - body: `{ "sessionId": "...", "comparisonId": "...", "winner": "<one of the pair>" }` — a stale/duplicate comparisonId is a no-op
- `POST /api/values/confirm`
  - body: `{ "sessionId": "...", "order": [6 work-value keys] }` — confirms (or reorders) the hierarchy and advances
- `POST /api/cv/intent`
  - body: `{ "sessionId": "...", "cvIntent": "new|use_skills" }` — the "where should we start from" choice, made on the CV slide
- `POST /api/cv`
  - JSON body: `{ "sessionId": "...", "cvText": "..." }` — or multipart `sessionId` + `file` (.pdf/.docx/.pptx/.html/.txt, max 5 MB; the live list is `cvUploadFormats` in every snapshot)
- `POST /api/cv/journey`
  - body: `{ "sessionId": "...", "questionId": "cj_...", "value": "..." }` — 7 career-journey questions when there is no CV
- `POST /api/summary/continue`
  - body: `{ "sessionId": "..." }` — acknowledges the character-conclusion screen and enters the Life Path Engine

### Life Path Engine (output loop)
- `POST /api/output/first`
  - body: `{ "sessionId": "..." }` — generates the Oriented Field + 1st Output (idempotent), work-values-scored with a fit against your confirmed values hierarchy
- `POST /api/output/refine`
  - body: `{ "sessionId": "...", "outputId": "..." }` — regenerates from a genuinely different field family (every family already shown is excluded)
- `POST /api/output/accept`
  - body: `{ "sessionId": "...", "outputId": "..." }` — accepts the output and generates the four advice blocks (AI recommendations, events, universities, courses)
- `POST /api/roadmap/generate`
  - body: `{ "sessionId": "...", "outputId": "..." }` — ordered roadmap for the accepted output

Every response carries an `X-Request-Id` header; error responses include a
matching `requestId` in the body for tracing.

## Limitations

- **Single instance only.** Sessions live in an in-memory `Map`; the single-flight
  lock and rate-limit counters are process-local. Optional Upstash Redis
  (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) persists sessions
  through a restart / Render free-tier idle-sleep as a durability mirror, but the
  app must not be scaled to more than one instance (it logs a loud warning if
  `WEB_CONCURRENCY > 1`). Without Redis, a restart drops all active sessions; the
  client keeps its `sessionId` in `localStorage` and resumes while the process is
  alive.
- Every feature is free — there is no payment flow.
- This is an exploratory self-reflection tool, not professional career
  counseling or a psychological assessment.
