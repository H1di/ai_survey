# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Life Path Explorer** — a two-part web app that guides users through a career/life-path survey and renders their personalized paths as an interactive node graph. The survey answers are sent to an Express backend that calls the OpenAI API (GPT-4o) to generate paths, tradeoff questions, and deeper variations.

## Development Commands

From the root (runs both processes concurrently):
```bash
npm run dev
```

Individual processes:
```bash
npm run dev:server   # nodemon on server/, port 3001
npm run dev:client   # react-scripts on client/, port 3000
```

First-time setup:
```bash
npm run install:all  # installs both server/ and client/ node_modules
```

The client proxies `/api/*` to `http://localhost:3001` (configured in `client/package.json`).

## Environment

`server/.env` must contain:
```
OPENAI_API_KEY=...
```

## Architecture

### Flow
```
Home (/) → Questions (/questions) → Graph (/graph)
```
- **Home**: user picks intent (`reason`: change career / find direction) and enters a free-text `dream`.
- **Questions**: 15 static survey questions defined in `client/src/pages/questions.js`; answers stored in global context.
- **Graph**: fetches initial 3 paths from `/api/generate-paths`, then on node click fetches tradeoff questions (`/api/tradeoff-questions`) and renders them in a modal. On modal submit, calls `/api/expand-branch` to add 2 variation nodes as children.

### State

`client/src/state/AppContext.js` — single `useReducer` store passed via React context. Key fields:
- `reason`, `dream`, `answers` — user inputs from survey
- `paths` — raw AI-generated paths (fetched in Graph, kept for expand calls)
- `graphNodes`, `graphEdges` — `@xyflow/react` node/edge arrays (managed locally in `Graph.jsx` rather than via context)
- `expandingPathId`, `tradeoffQuestions`, `tradeoffAnswers` — ephemeral expansion state

Graph page manages its own `graphNodes`/`graphEdges` with `useState` (the context versions are not used for rendering).

### Backend

`server/index.js` → mounts `server/routes/paths.js` at `/api`

Three endpoints, all POST:
- `/api/generate-paths` — requires `reason`, `dream`; accepts `answers`
- `/api/tradeoff-questions` — requires `selectedPath`
- `/api/expand-branch` — requires `selectedPath`, `tradeoffAnswers`; accepts `previousAnswers`

`server/services/aiService.js` — thin wrapper around OpenAI `chat.completions.create` with `response_format: json_object`. All three functions follow the same pattern: build a prompt → call GPT-4o → parse JSON.

`server/utils/promptBuilder.js` — prompt templates. Each template specifies an exact JSON schema in the prompt so the model returns structured data directly.

### Graph Rendering

`client/src/components/GraphView/` wraps `@xyflow/react`. Three custom node types:
- `me` — root "you are here" node
- `path` — first-level AI path; has an "Expand" button that triggers the tradeoff modal flow
- `variation` — second-level nodes added after tradeoff answers; clicking opens `DetailPanel`
- `loading` — placeholder shown while `expand-branch` is in flight

`TradeoffModal` renders the 4 path-specific tradeoff questions and collects answers before calling `handleTradeoffSubmit` in `Graph.jsx`.
