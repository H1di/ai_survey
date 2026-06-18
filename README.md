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

3. **Page 3 - Life Path Engine**
- React Flow graph with centered root node: `Me`
- First branch generated free
- Click branch nodes to answer tradeoff prompts and evolve that branch
- Unlock additional thematic branches (mock payment lock):
  - Safe Path
  - High Income Path
  - Meaning Path
  - Creative Path
  - Freedom Path

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
- `backend/aiEngine.js` initial branch + branch evolution generation
- `backend/prompts.js` AI prompt templates
- `backend/sessionStore.js` in-memory session and branch state

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

### Branch Engine
- `POST /api/branches/initial`
  - body: `{ "sessionId": "..." }`
- `POST /api/branches/evolve`
  - body: `{ "sessionId": "...", "branchId": "...", "nodeId": "...", "answer": "..." }`
- `POST /api/branches/create`
  - body: `{ "sessionId": "...", "themeId": "safe|high_income|meaning|creative|freedom" }`

### Payment Lock (MVP mock)
- `POST /api/payment/unlock-theme`
  - body: `{ "sessionId": "...", "themeId": "..." }`
  - returns mock paid receipt and unlocked state

## Notes

- Additional branches are independent and do not modify existing branch chains.
- If OpenAI fails, backend has a deterministic fallback branch generator so the flow still works.
- Current payment flow is mocked for MVP. Replace with Stripe/Checkout for production.

:)