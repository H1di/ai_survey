# Life Path Explorer

Two-part web app. **Part one** is a psychological assessment
(demographics → Big Five/OCEAN → RIASEC interests → ranked 7-parameter
job-characteristic targets → CV or career-journey signal). **Part two** is the
**Life Path Engine**: the assessment profile feeds AI prompts that produce an
Oriented Field + a concrete job (the "1st Output"), explained through the 7
parameters and scored on Schwartz Basic Human Values. The user iterates it
through a Yes/No loop; accepting an output reveals four advice blocks plus a
step-by-step roadmap — all rendered as an interactive React Flow graph.

Every AI call has a deterministic fallback, so the app works with **no API key**
(demo mode). Nothing in the flow depends on OpenAI being reachable.

For the full technical spec (module map, JSON contracts, data-flow diagram,
engineering assessment) see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for current
status and backlog see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

## Product flow

1. **Entry** — two open questions: why you're here, and what you would do if
   you knew you would definitely succeed.
2. **Assessment** — a server-driven `step` machine
   (`demographics → big_five → riasec → job_characteristics → cv → tree`),
   presented as one "Career Discovery Journey" rail:
   - **Demographics** — sex, age, country, city.
   - **Big Five** — the fixed public-domain Mini-IPIP-20, Likert 1–5; scored to
     OCEAN 0–100 + Stability/Plasticity.
   - **RIASEC interests** — 12 fixed enjoyment-rated activities scored to a
     Holland code, or skip to infer interests from personality.
   - **Job characteristics** — rank the 7 parameters (compensation, work mode,
     job security, career growth, complexity, meaning/impact, social), then
     answer 5 or 10 trade-off questions that set 0–100 targets per parameter.
   - **Experience** — paste/upload a CV (`.pdf/.docx/.html/.txt`, plus `.pptx`
     with MarkItDown; max 5 MB) or answer 7 career-journey questions.
3. **Life Path Engine** — an Oriented Field + concrete job, scored on Schwartz
   values with a fit against your inferred value vector, plus a structured
   "Why this fits" block that traces every bullet to your scores, ranks, and
   answers. Say **Yes** to accept (unlocks four advice blocks + a roadmap) or
   **No** to tune specific parameters or regenerate from a genuinely different
   field family. Everything renders as a graph you can explore node by node,
   with a profile panel that includes per-axis takeaways and a "Who you are"
   summary.

## Tech stack

- **Frontend** — React 19 + Vite + `@xyflow/react` (React Flow), `recharts`,
  `framer-motion`. Single page, no router; the server snapshot is the single
  source of truth.
- **Backend** — Node.js + Express 5 (CommonJS). In-memory sessions with a TTL
  sweep (see Limitations).
- **AI** — OpenAI `gpt-4.1-mini`, `chat.completions` JSON mode, with a
  deterministic fallback per generator.

## Project structure

- `frontend/` — React app: `src/App.jsx` (stage machine + all state),
  `src/api.js` (fetch wrappers), `src/lifePath.js` (graph builder),
  `src/components/GraphView/` (React Flow wrapper),
  `src/components/ProfileCharts.jsx` + `SchwartzMap.jsx` (profile panel).
- `backend/` — Express API, assessment engine, AI prompt engine.

Key backend modules:
- `server.js` — routes, rate limiting, CORS allowlist, step guards
- `sessionStore.js` — in-memory sessions + snapshot serializer
- `questionEngine.js` — answer validation + all scoring
- `questionPool.js` — demographics, the 7 job-char params, journey questions
- `bigFiveItems.js` / `riasecItems.js` — public-domain fallback item pools
- `cvExtract.js` — CV file → text: MarkItDown-first hybrid (pdf / docx / pptx / html / txt)
- `services/markitdown.js` — optional MarkItDown CLI wrapper; without the binary the built-in parsers take over
- `aiEngine.js` — one generator per AI artifact, each with a fallback
- `prompts.js` — prompt builders + the shared profile digest
- `directions.js` — field-family catalog (prompt grounding + fallback seeds)
- `riasec.js` — Holland weights + direction ranking
- `schwartzValues.js` — Schwartz derivations, values fit, direction prototypes

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
cd backend && npm test              # node:test + supertest (112 tests)
cd frontend && npm test -- --run    # vitest over src/lifePath.js (13 tests)
```

## API Routes

### Session + Assessment
- `POST /api/session/start`
  - body: `{ "whyHereAnswer": "...", "dreamAnswer": "..." }` — both required, capped at 500 chars
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
- `POST /api/job-characteristics/rank`
  - body: `{ "sessionId": "...", "ranking": [7 param ids most→least important], "depth": 5|10 }`
- `POST /api/job-characteristics/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": <one of the option values> }`
- `POST /api/cv/intent`
  - body: `{ "sessionId": "...", "cvIntent": "new|use_skills" }` — the "where should we start from" choice, made on the CV slide
- `POST /api/cv`
  - JSON body: `{ "sessionId": "...", "cvText": "..." }` — or multipart `sessionId` + `file` (.pdf/.docx/.pptx/.html/.txt, max 5 MB; the live list is `cvUploadFormats` in every snapshot)
- `POST /api/cv/journey`
  - body: `{ "sessionId": "...", "questionId": "cj_...", "value": "..." }` — 7 career-journey questions when there is no CV

### Life Path Engine (output loop)
- `POST /api/output/first`
  - body: `{ "sessionId": "..." }` — generates the Oriented Field + 1st Output (idempotent), Schwartz-scored with a values-fit against the user's inferred value vector
- `POST /api/output/refine`
  - body: `{ "sessionId": "...", "outputId": "...", "changes": [{ "param": "<one of the 7>", "reason": "..." }] }` — shifts the named parameters while holding the rest
  - or: `{ "sessionId": "...", "outputId": "...", "notSuitable": true }` — regenerates from a genuinely different field family
- `POST /api/output/accept`
  - body: `{ "sessionId": "...", "outputId": "..." }` — accepts the output and generates the four advice blocks (AI recommendations, events, universities, courses)
- `POST /api/roadmap/generate`
  - body: `{ "sessionId": "...", "outputId": "..." }` — ordered roadmap for the accepted output

## Limitations

- **Sessions are in-memory.** A backend restart, deploy, or Render free-tier
  idle-sleep drops all active sessions; the client keeps its `sessionId` in
  `localStorage` and resumes only while the server process is alive. Persistence
  is on the backlog — see `PROJECT_STATUS.md`.
- Every feature is free — there is no payment flow.
- This is an exploratory self-reflection tool, not professional career
  counseling or a psychological assessment.
