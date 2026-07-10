# [working name] - AI Life Path Engine (MVP)

Premium minimal web app for exploring realistic career and life directions through an adaptive AI branching system.

## Product Flow

1. **Page 1 - Entry**
- Centered question: `Why are you here?`
- Two intents: `Change my career` or `Find my career`
- Dream prompt: `If you knew that you would definitely succeed, what would you do?`

2. **Page 2 - Deep Analysis**
- Adaptive question engine (pool of 38 questions)
- Core categories: demographic, career reality, values, psychology, lifestyle
- Optional premium depth modules: motivation profile, personality style, values conflict, cognitive style, etc.
- Questions adapt to previous answers and constraints

3. **Page 3 - Life Path Engine** (free for every session)
- React Flow graph with centered root node: `Me`
- **Direction finding**: 2-3 sharp AI-generated questions converge on one broad professional direction (e.g. Programming, Healthcare, Design), rendered as a confirmed Direction node
- **Narrowing**: 1-2 follow-up questions about work style and environment, then exactly 3 realistic professions fork off the Direction node
- **Confirm**: clicking a profession asks "Would you like to see how to reach this profession?"
- **Roadmap**: on confirmation, a personalized ordered step-by-step roadmap (foundations → first projects → entry role → credential → established role) renders as a vertical chain under the chosen profession; click any step for details

## Tech Stack

- Frontend: React + Vite + React Flow
- Backend: Node.js + Express
- AI: OpenAI API (`chat.completions` JSON mode)
- State: in-memory backend sessions (MVP)

## Project Structure

- `frontend/` React app and UI
- `backend/` Express API, adaptive question engine, AI prompt engine

Key backend modules:
- `backend/server.js` API routes
- `backend/questionPool.js` question bank + themes
- `backend/questionEngine.js` adaptive selection + validation
- `backend/aiEngine.js` direction questions, profession narrowing, roadmap generation
- `backend/prompts.js` AI prompt templates
- `backend/directions.js` broad-direction catalog + deterministic direction tally
- `backend/sessionStore.js` in-memory session, direction, profession, and roadmap state

## Run Locally

1. Install dependencies:
```bash
cd backend && npm install
cd ../frontend && npm install
```

2. Configure env:
```bash
cp backend/.env.example backend/.env
```
Then set `OPENAI_API_KEY`.

3. Start backend:
```bash
cd backend
npm run dev
```

4. Start frontend (new terminal):
```bash
cd frontend
npm run dev
```

5. Open:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`

## API Routes

### Session + Assessment
- `POST /api/session/start`
  - body: `{ "entryChoice": "change|find", "dreamAnswer": "...", "cvIntent": "new|use_skills" }`
- `GET /api/session/:sessionId` — full session snapshot (used to resume after reload)
- `POST /api/session/demographics`
  - body: `{ "sessionId": "...", "questionId": "sex|age|country|city", "value": ... }`
- `POST /api/session/big-five-depth`
  - body: `{ "sessionId": "...", "depth": "short|deep" }` — 20 or 50 items
- `POST /api/big-five/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": 1-5 }`
- `POST /api/riasec/start`
  - body: `{ "sessionId": "..." }` — generates the RIASEC activity items (12 short / 18 deep)
- `POST /api/riasec/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": 1-5 }`
- `POST /api/riasec/skip`
  - body: `{ "sessionId": "..." }` — infers a low-confidence interest profile instead of the quiz
- `POST /api/job-characteristics/rank`
  - body: `{ "sessionId": "...", "ranking": [7 param ids most→least important], "depth": 5|10 }`
- `POST /api/job-characteristics/answer`
  - body: `{ "sessionId": "...", "itemId": "...", "value": <one of the option values> }`
- `POST /api/cv`
  - JSON body: `{ "sessionId": "...", "cvText": "..." }` — or multipart `sessionId` + `file` (.pdf/.docx/.txt, max 2 MB)
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

## Notes

- Every feature is free — there is no payment flow.
- If OpenAI fails or no API key is set, deterministic fallback generators cover direction questions, narrowing questions, professions, and roadmaps, so the flow never breaks.

:)