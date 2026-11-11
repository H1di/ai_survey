# Task plan: strategic direction to the school pilot
_Derived from `PLAN-project-review.md` + the 2026-10-12 follow-up grill (`/grill-me`). Repo at `fdc5896`._

Act 2 (Codex review of the strategy) was **skipped by Eugene**. Review happens per diff
instead (verify-before-merge on every worker task).

## Decision log (supersedes the plan where they conflict)

Carried over from the locked plan (unchanged): #1 primary user 17–24 B2C, UA school pilot
as first cohort · #2 differentiator = verified local steps · #3 hybrid sourcing, LLM selects
from server shortlists only, no item without a real link · #4 O*NET core + SOC→ISCO-08→КП→UA
specialty chain · #5 privacy-by-design before pilot · #6 north star = real step within 14 days ·
#8 adaptive RIASEC over the Mini-IP pool (12 → ≤30).

Changed or added on 2026-10-12:
- **#7′ Accounts move before the pilot** — paywall/Paddle stay after the pilot
  (implies: accounts are part of stage 1; the business report's "saved profile = Premium" is moot for now).
- **#9′ Languages = 7: EN, UA, RU, FR, DE, ES, PT, all before the pilot**
  (implies: RU added; the i18n epic covers 7 item sets).
- **#11 Unvalidated item translations (default, not contested):** published translation where
  one exists; otherwise MT + native-speaker review, item data carries `validated:false`, no UI difference.
- **#12 `sex` demographic stays as is** — still collected and still sent to the prompt (Eugene's call).
- **#13 Auth = Supabase Auth (EU): email magic link + Google OAuth**
  (implies: Supabase + Google OAuth client + custom SMTP are new processors in the policy).
- **#14 Account is mandatory before the assessment starts** (sign-in → consent → entry)
  (implies: every `/api/*` session route is user-bound; rate limits key on user id, not IP —
  this also defuses the school-NAT blocker from the deferred infra track).
- **#15 Storage = Supabase Postgres EU** for `profiles`, `saved_paths`, `checkins`. The live
  assessment session keeps today's engine (Map + Upstash, 24 h idle TTL) and gets a `userId`;
  the finished path is copied to `saved_paths` on accept (default).
- **#16 14-day follow-up = email on day 14** with one-click per-step answers
  (done / planned / not yet), written to `checkins` — one mechanism for pilot and B2C
  (implies: a scheduler + transactional email provider, EU region).
- **#17 Under-16 only via a cohort link.** Sign-up asks birth year; under-16 without a valid
  `?cohort=` is refused with a "ask your school / come back later" screen; the school collects
  parental consent offline. Under-16 also gets no CV upload/paste (journey only).

Defaults taken without asking (overturn any of them by saying so):
- Birth year from sign-up pre-fills `demographics.age`; the age question is no longer asked.
- PII scrub is deterministic (regex + CV-header heuristic), keyless, applied to CV text,
  dream answer and journey answers before any prompt.
- OpenAI Responses calls send `store: false`.
- Retention: live session 24 h idle (unchanged); account + saved paths + check-ins until
  deletion or 12 months of inactivity; "Delete my data" removes account, rows, live session
  and the PostHog person immediately.
- Analytics: PostHog EU, `persistence: "memory"`, autocapture and recordings off, identified by
  the Supabase user UUID (pseudonymous); no-op without a key.
- Keyless rule extended: without `SUPABASE_URL` the backend runs a dev-only auth bypass
  (fixed local user), without `VITE_POSTHOG_KEY` analytics is a no-op, without an email key
  check-ins are logged, not sent.
- Positioning wording: "built on validated instruments and O*NET data; a self-exploration
  tool, not a diagnosis".

Still open / deferred: infra track (Render sleep, OpenAI limits, deploy) — Eugene, separate ·
design freeze during the pilot — unconfirmed · legal review of the policy text — Eugene.

## New order
1. Privacy + accounts → 2. Measurement → 3. i18n (7 languages) → 4. UA local steps →
5. Adaptive RIASEC → 6. Pilot → 7. Events / paywall.
Stages 1–2 are detailed below; 3–5 are epics that each open with a spike.

## Stage 1 — Privacy + accounts

| # | Task | Owner | Depends on | Done when |
|---|---|---|---|---|
| T1 | Create Supabase EU project, Google OAuth client, EU email provider (custom SMTP for magic links + check-ins); put keys in `backend/.env` / `frontend/.env` | **Eugene** | — | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, email key exist; magic link arrives from the custom SMTP |
| T2 | `store: false` on every Responses call | Claude | — | unit test asserts the request body; `npm test` green |
| T3 | `backend/piiScrub.js` (pure) + apply to CV text, dream, journey answers before prompts | **worker (codex)** | — | node:test cases for emails, intl phones, URLs, @handles, CV-header name line; route test shows the prompt never contains the seeded email/phone; all tests green |
| T4 | Auth middleware: verify Supabase JWT (JWKS, `jose`), `req.user`; session bound to `userId` at start, ownership check on every session route (foreign session ⇒ 404); rate-limit `keyGenerator` = user id; dev bypass when `SUPABASE_URL` unset | Claude (security) | T1 for live check | route tests with a locally-signed JWKS: no token 401, foreign session 404, own session 200; keyless suite still green |
| T5 | Supabase schema + RLS: `profiles`, `saved_paths`, `checkins` (SQL migration in `supabase/migrations/`) | Claude (RLS) | T1 | migration applies; RLS denies cross-user reads (SQL test or manual proof logged) |
| T6 | Consent + age gate on `POST /api/session/start`: requires `consentVersion` + `birthYear` (+ optional `cohort` from allowlist); under-16 without cohort ⇒ 403 `UNDER_16_NO_COHORT`; snapshot gains `cvAllowed`; `/api/cv` paste/upload 403 when `!cvAllowed`; age pre-filled into demographics | Claude | T4 | route tests for each branch; demographics no longer asks age; existing tests updated |
| T7 | Frontend sign-in + consent screens: supabase-js, magic link + Google, consent (policy link, checkbox, birth year, cohort carried from `?cohort=`), under-16 refusal screen, bearer token in `api.js`, dev bypass without `VITE_SUPABASE_URL` | **worker (codex)** | T4, T6 (contracts) | Vitest for the gate logic; manual run: sign-in → consent → entry; keyless dev still starts |
| T8 | Save path on accept → `saved_paths`; `GET /api/me/paths`; on sign-in, a user with a saved path sees it (read-only) | **worker (codex)** | T5, T6 | route test: accept writes one row (idempotent); frontend shows saved path after reload |
| T9 | "Delete my data": `DELETE /api/me` (rows, auth user, live session Map+Redis, PostHog person) + button in profile panel | Claude (security) | T5, T12 | route test: everything gone, second call 404; UI confirm dialog |
| T10 | Privacy policy draft (EN) + in-app page; retention, processors (OpenAI, Supabase, email provider, PostHog, Google, Upstash, Render, Vercel), minors, rights | Claude drafts → **Eugene** legal review | — | policy rendered and linked from consent screen; `consentVersion` matches its version |

## Stage 2 — Measurement

| # | Task | Owner | Depends on | Done when |
|---|---|---|---|---|
| T11 | `frontend/src/analytics.js` (posthog-js, EU host, memory persistence, autocapture/recording off, `identify(userId)`, super-props `cohort`, `locale`; `trackOutbound(url, block, itemId)`), no-op without key; wire funnel events in `App.jsx`: `signup_completed`, `step_completed{step}`, `output_first_shown`, `output_refined`, `output_accepted`, `roadmap_viewed` | **worker (codex)** | — (identify hook lands with T7) | Vitest: no-op without key, no PII in any event payload, events fire in order on a scripted flow |
| T12 | Server-side PostHog client (backend) for check-in answers + person deletion | Claude | T11 | unit test with injected fetch |
| T13 | Day-14 check-in: due rows from `saved_paths`, scheduled runner `POST /api/internal/checkins/run` (secret header), email with HMAC-signed one-click links `GET /api/checkin/:token?answer=done\|planned\|no` (idempotent) → `checkins` + PostHog event; same runner purges accounts inactive 12 months | Claude (signed tokens) | T5, T8, T12 | tests: forged/expired token 400, double click idempotent, purge deletes only inactive users; keyless = logged not sent |

## Stage 3–5 — epics (each starts with a spike, detailed after it)

- **E3 i18n, 7 languages.** Spike S3 (Claude): inventory of published Mini-IPIP-20 and Mini-IP
  translations per language, licence of each, i18n library choice. Then: string extraction
  (worker), backend `session.locale` + per-locale item sets with `validated` flag (Claude),
  prompts emit the user's language (Claude), translation files MT + native review (Eugene sources reviewers).
- **E4 UA local steps.** Spike S4 (Claude): ЄДЕБО / vstup.osvita.ua access, licence, refresh;
  current specialty list (2024–25 reform); BLS SOC→ISCO-08 crosswalk import. Then: snapshot
  builder script (worker), crosswalk + ISCO→specialty hand mapping (Claude + Eugene), courses
  catalog (worker scaffold, Eugene curates), shortlist selection with membership enforcement
  (Claude), `trackOutbound` on every link (worker), non-UA/US-salary rules (worker).
- **E5 Adaptive RIASEC.** Spike S5 (Claude): Mini-IP licence/attribution, stopping-rule
  thresholds by simulation. Then: pure engine + exhaustive/property tests (worker, codex),
  route + frontend integration (Claude).

## Owner split (stages 1–2)
- **Worker (codex):** T3, T7, T8, T11 — self-contained, fully specifiable from this file.
- **Claude:** T2, T4, T5, T6, T9, T10 draft, T12, T13 — security-sensitive or contract-defining.
- **Eugene:** T1, T10 legal review.
- **Wave 1 (now, no deps):** T3, T11 to codex in separate worktrees; T2 by Claude.
- **Wave 2:** after T1 + T4/T5/T6 land → T7, T8 to codex.
