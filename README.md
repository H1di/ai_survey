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

### Session + Questions
- `POST /api/session/start`
  - body: `{ "entryChoice": "change|find", "dreamAnswer": "...", "premiumDepth": false }`
- `GET /api/session/:sessionId`
- `POST /api/session/premium`
  - body: `{ "sessionId": "...", "premiumDepth": true|false }`
- `POST /api/questions/answer`
  - body: `{ "sessionId": "...", "questionId": "...", "answer": "..." }`

### Life Path Engine
- `POST /api/direction/question`
  - body: `{ "sessionId": "..." }` — generates/returns the direction-finding questions
- `POST /api/direction/answer`
  - body: `{ "sessionId": "...", "questionId": "...", "value": "..." }`
- `POST /api/direction/confirm`
  - body: `{ "sessionId": "..." }` — locks the proposed direction, returns narrowing questions
- `POST /api/professions/narrow`
  - body: `{ "sessionId": "...", "questionId": "...", "value": "..." }` — after the last answer, returns exactly 3 profession options
- `POST /api/professions/select`
  - body: `{ "sessionId": "...", "professionId": "..." }`
- `POST /api/roadmap/generate`
  - body: `{ "sessionId": "..." }` — personalized ordered roadmap for the selected profession

## Notes

- Every feature is free — there is no payment flow.
- If OpenAI fails or no API key is set, deterministic fallback generators cover direction questions, narrowing questions, professions, and roadmaps, so the flow never breaks.

:)