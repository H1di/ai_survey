# Life Path Explorer (MVP)

AI-powered web app for exploring life and career futures through a branching decision tree.

## Stack

- Frontend: React + Vite + React Flow
- Backend: Node.js + Express
- AI: OpenAI API

## What It Does

1. Shows one question per screen:
   - Why are you here? (3 options)
   - What would you do if you knew you couldn't fail? (free text)
   - Why this choice? (free text)
2. Sends answers to OpenAI and generates 3 life paths.
3. Displays paths in an interactive tree.
4. Clicking any path node generates deeper 2-3 branch options.

## Run Locally

1. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. Configure backend env:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Then set `OPENAI_API_KEY`.
3. Start backend:
   ```bash
   cd backend && npm run dev
   ```
4. Start frontend in another terminal:
   ```bash
   cd frontend && npm run dev
   ```
5. Open:
   - Frontend: `http://localhost:5173`
   - Backend health: `http://localhost:3001/api/health`

## API Endpoints

- `POST /api/generate-initial`
  - Body: `{ "reason": "...", "dream": "...", "why": "..." }`
- `POST /api/generate-branch`
  - Body: `{ "reason": "...", "dream": "...", "why": "...", "parentPath": { ... } }`

Both return:
```json
{
  "paths": [
    {
      "title": "...",
      "shortDescription": "...",
      "dailyLifestyle": "...",
      "careerTrajectory": "...",
      "financialOutlook": "...",
      "risks": "...",
      "psychologicalProfile": "...",
      "fitWhy": "...",
      "keyDifferenceFromParent": "...",
      "newOpportunities": "...",
      "newRisks": "...",
      "isBranch": false
    }
  ]
}
```
