# Invector v2: path-first preview

v2 rebuilds the product around the flow in the November 2026 business report ([`docs/invector-business-report-2026-11.pdf`](../docs/invector-business-report-2026-11.pdf)): **a free roadmap built from real courses first, with paid add-ons on top**. It is a copy that sits beside v1. Nothing in the repository root (`backend/`, `frontend/`) was changed or removed, and both versions run at the same time.

|          | v1 (root)                         | v2 (`v2/`)                                 |
|----------|-----------------------------------|--------------------------------------------|
| API      | `:3001`                           | `:3002`                                    |
| Web      | `:5173`                           | `:5174`                                    |
| Flow     | assessment first, then job output | personal questions, case, path, add-ons    |

## Run

```bash
cd v2
npm run install:all && npm install
npm run dev            # API on :3002, web on :5174
npm test               # backend (node:test) + frontend (vitest)
```

Everything works keyless. Without `OPENAI_API_KEY`, every AI call uses its deterministic fallback, the same rule as v1. See `backend/.env.example`.

## The flow

**Free (everyone)**

1. **About you** (`POST /api/session/start`). Nine personal questions: status, age, field, target level, goal, location, budget, time, start date (`backend/path/personalQuestions.js`). Under 16, the request needs `parentalConsent: true` (the digital age of consent in Ireland).
2. **Your case** (`backend/path/caseEngine.js`). The status answer picks one of three cases: `first_course`, `studying` or `next_step`. Each case defines the roadmap's slots (for example prepare → main → next), and each slot lists the course kinds that can fill it.
3. **The path** (`POST /api/path/build`). For every slot, `pathEngine.candidatesForSlot` filters the catalogue by the user's answers and ranks it with a deterministic fit score. If nothing fits, it loosens constraints in a fixed order (budget, location, time, then field). The AI picks one candidate per slot and writes a one-line "why". A pick that isn't on the candidate list is replaced by the slot's best candidate. Every step carries `basis`: the answers it rests on, in plain words.
4. **Managing the path.** These operations are free and unlimited: `add`, `swap`, `move` and `remove` (`/api/path/*`), course search (`GET /api/courses`), comparing up to 3 courses side by side (client-side), editing answers (`/api/profile/update`), and undoing the last rebuild (`/api/path/restore`).
   - **Rebuilds:** `/api/path/rebuild` takes an optional note such as "cheaper". 3 are free; after that the route returns 402 until the `rebuilds` add-on is unlocked. A rebuild that can't find a different path returns 409 and doesn't count against the allowance.

**Paid add-ons (only after a first path exists)**, see `backend/path/addons.js`:

| Add-on | Price | What it does |
|--------|-------|--------------|
| `tests` | €5 | Mini-IPIP (20 items), RIASEC (12), the work-values tournament (≤10 pairs) and experience (7 questions, at least 3 answered). Then `/api/guidance/generate` returns: real O*NET occupations ranked by interest fit, each with a values-fit score; 2–3 scenarios (faster, cheaper, closer to home), each listing which answers it breaks; and short courses that build missing skills, limited to the path's field and the user's top interests. |
| `rebuilds` | €4 | Unlimited rebuilds. |
| `extras` | €5 | Events, volunteering and internships. **Not built**: it's listed as "coming soon" and can't be unlocked. |
| `pass` | €10 | Everything available, for 12 months, with no auto-renewal. |

**Payments are not built.** With `MOCK_PAYMENTS` on, an unlock is recorded straight away and marked `mock: true`, and the UI says "test mode, no payment". `MOCK_PAYMENTS` is on by default outside production and off in production unless `MOCK_PAYMENTS=1`. With it off, unlocks return 501.

## The catalogue is sample data

The Irish course import (Qualifax, FETCH, CAO) doesn't exist yet. Until it does, `backend/catalogue/sampleCatalogue.js` generates **105 fictional courses**: 15 field families, 7 courses each. Every provider name starts with "Sample", every course has `sample: true`, and both the API and the UI show a notice saying so.

To use real data, drop `backend/data/ie-courses.json` (an array, in the course shape documented in `backend/catalogue/index.js`). It loads automatically, and invalid rows are skipped. Course `skills` use the O*NET skill vocabulary so that "worth adding" can match on skill overlap.

## What came from v1

These were copied unchanged, together with their v1 tests:

- `assessment/`: bigFiveItems, riasecItems, valuesTournament, questionPool, questionEngine
- `engine/`: workValues, riasec, directions, piiScrub, onet, plus the O*NET snapshot
- `core/logger.js`
- Frontend: the design tokens, logo, `LikertScale`, `ProgressLine`, `Wordmark` and `ErrorBoundary`

## Guardrails

- Test scoring is deterministic code. The AI never scores the user.
- The AI only chooses from the candidate lists it's given. It never invents a course or an occupation, and responses are normalized against those lists.
- Every AI call has an output-token cap, `store: false` and a fallback. PII in the goal and experience text is scrubbed before it reaches a prompt.
- The O*NET attribution is shown wherever occupation data appears.

## Not in this version

These are deliberately out of scope for the first pass:

- Supabase accounts and saved paths. v2 sessions live in memory with a 24-hour TTL, so they're lost on restart, and it must run as a single instance.
- Redis durability.
- The extras feed (events, volunteering, internships).
- Real payments.
- Institution subscriptions and dashboards.
- Reviews.
- The Qualifax/FETCH import.
- Localisation.
