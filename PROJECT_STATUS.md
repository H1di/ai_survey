# PROJECT_STATUS — Life Path Explorer

> **Процесс:** это живой документ. При каждом значимом изменении в проекте он
> обновляется (вместе с `ARCHITECTURE.md`, если меняется структура). Новые
> файлы для логов не создаются — вся история статуса ведётся здесь.

**Дата последнего обновления:** 2026-07-18 (Work-Values миграция + backend-хардеринг)

---

## Готово

### Бэкенд — опросник (Pages 1–2)
- **Session state machine** — `entry → demographics → big_five → riasec → values → job_characteristics → cv → summary → tree` (`backend/server.js`, guard на каждом роуте). Во фронтенде поверх шагов лежит display-only рейл «Career Discovery Journey» (интро-карта + полоса в шапке).
- **Entry** — один обязательный свободный вопрос: `dreamAnswer`, trim + кап 500 → `POST /api/session/start`. Выбор `cvIntent` (new|use_skills) делается позже, на CV-слайде (`POST /api/cv/intent`, guard на `cv`-шаге, перевыбор разрешён; пути paste/upload/journey заблокированы до выбора).
- **Values** — явный адаптивный парный турнир над 6 work values (Ford–Johnson, ≤10 сравнений, `valuesTournament.js`) → переупорядочиваемая иерархия + confirm; `userValues` из турнира (`source:"tournament"`, `confidence:"explicit"`).
- **Summary** — экран-заключение между `cv` и `tree`: детерминированный архетип + Big Five радар + AI-persona + work-values радар; `POST /api/summary/continue` → `tree`.
- **Демография** — 4 статичных вопроса (sex, age 13–99, country, city) с whitelist-валидацией.
- **Big Five** — единственный фиксированный инструмент: статичный public-domain Mini-IPIP-20 (`bigFiveItems.js`), сидируется в сессию при создании; без AI-генерации и выбора глубины. Скоринг reverse + нормировка 0–100 + Big Two (Stability/Plasticity).
- **RIASEC** — фиксированные 12 статичных activity-пунктов (`getStaticRiasecItems`), скоринг 0–100 по 6 типам + топ-3 код; skip-путь с инференсом из Big Five + dream (`riasecInferred`, low-confidence).
- **Job characteristics** — один экран: ранжирование 7 канонических параметров; таргеты 0–100 выводит детерминированная кривая ранг→значение (90→25), без вопросов и без AI.
- **CV** — вставка текста или загрузка `.pdf/.docx/.html/.txt` + `.pptx` при наличии MarkItDown (5 МБ, `cvExtract.js` — MarkItDown-first гибрид с Node-фоллбеками, ошибки чтения → 400) с AI-парсингом в `{roles, skills, domains, seniority, keywords}`; поддерживаемые форматы едут в снапшоте как `cvUploadFormats`; альтернатива — 7 career-journey вопросов.

### Бэкенд — Life Path Engine (Page 3)
- **Work-values слой** (`workValues.js`) — чистый модуль: 6 Minnesota / O*NET work values, rank→score кривая (`rankToWorkValueScores` + `curveVersion`), `valuesFit` (centered cosine → одно `{overall}` 0–100), прототипы по 15 направлениям, детерминированные фоллбеки. Ценности профессии — из O*NET-снапшота (28.0, фоллбек — прототип направления); **AI ценности не скорит**.
- **Ценности пользователя** — из явного парного турнира на шаге `values` (`valuesTournament.js`, атомарная запись `finalizeValues`), `source:"tournament"`, `confidence:"explicit"`; прежний AI-инференс на `cv → tree` удалён.
- **Output loop** — `output/first` (идемпотентный; grounding через `rankDirections` по RIASEC), `output/refine` (`changes` XOR `notSuitable`, история в `refinementHistory`, цепочка parent-linked outputs), `output/accept` (accept-once + 4 блока советов), `roadmap/generate` (только для принятого, кэш в `session.roadmaps`).
- **Каждый output** work-values-скорится (`resolveProfessionWorkValues`) и получает `workValues/topValues/valuesFit` server-side, плюс структурированный `whyThisFits` отдельным вторым AI-вызовом (2 personality / 1 interests / 1 values / 2–3 current skills / 3–4 skills to develop, каждый буллет трассируется к конкретному баллу/рангу/ответу).
- **Persona summary** — на переходе `cv → summary` генерируется `session.personaSummary` (3–5 предложений во втором лице из Big Five; keyless-фоллбек детерминированный).

### Надёжность и безопасность
- **Keyless-режим**: каждый AI-генератор имеет детерминированный фоллбек; нормализаторы бросают на структурно неверных payload'ах → вызов уходит в фоллбек. UI честно показывает «Demo mode». Турнир ценностей и work-values скоринг — чистые (без AI).
- **Наблюдаемость / утечки**: request-id middleware (заголовок `X-Request-Id` на каждом ответе), `logger.js` — структурная JSON-строка на ≥500 (route-шаблон / UUID-редакция), `fail`/`sendError` — 4xx отдают своё сообщение, 500 генерик (внутренний текст только в лог).
- Таймауты: OpenAI-клиент 30 с / 1 retry; фронтенд-fetch 45 с + AbortController + кнопка «Try again».
- Rate limiting: 300 запросов/15 мин глобально, 30/15 мин на AI-роуты (см. баг про `trust proxy` ниже).
- CORS-allowlist из env, `express.json` 1 МБ, multer 5 МБ с отдельным error handler'ом.
- Каждый OpenAI-вызов имеет явный `max_tokens`-потолок (≥2× типичного payload'а — обрезанный JSON молча деградирует в фоллбек).
- Скоринговые ключи (`trait`/`reverse`, RIASEC `type`) никогда не сериализуются клиенту.

### Фронтенд
- SPA без роутера: stage machine `entry → survey → tree`, серверный снапшот — единственный источник правды (`applySessionSnapshot`), локально только view-state.
- Восстановление сессии после перезагрузки: `sessionId` в localStorage + `GET /api/session/:id`, резюме с первого неотвеченного вопроса.
- Опросник: single-click ответы, «← Back» внутри блоков, общий прогресс-бар с честной оценкой, лоадеры на всех AI-паузах.
- Граф (React Flow): узлы `me/output/advice/roadmap/loading`, кастомное ребро `branch` с каскадной анимацией, camera director (`fitView` по волнам узлов), reduced-motion.
- Dock-карточки review/refine (чекбоксы 7 параметров + причины), панель деталей output'а, панель профиля: радар Big Five, бары RIASEC, work-values радар (6 осей) с точками пользователя и оверлеем профессии.
- Дисклеймеры («не проф. консультация», «preliminary profile», «low confidence») на entry и в профиле.

### Тесты и CI
- Backend: **164 теста** (`node:test`, роут-тесты через `app.listen(0)` + `fetch`, без supertest; турнир 720-перестановок, work-values, CV-лок, error-handling/request-id, markitdown) — все проходят (2026-07-18).
- Frontend: **24 теста** (Vitest, `lifePath.js`: граф, dock, rank-list, work-values, архетип) — все проходят.
- GitHub Actions CI: backend-тесты + frontend-тесты + build на push/PR в `main`.

### Деплой (production)
- Backend → Render free tier: `https://ai-survey-backend-3g62.onrender.com` (blueprint `render.yaml`).
- Frontend → Vercel: `https://ai-survey-frontend-bay.vercel.app`; `frontend/vercel.json` проксирует `/api/*` на Render — фронтенд-код ходит на относительные пути.
- Автодеплой обоих сервисов на push в `main`. Инструкция — `DEPLOY.md`.

---

## Сделано 2026-07-18 (Work-Values миграция + backend-хардеринг, ветка `backend-hardening`)

Спека/ревью: `PLAN-work-values-migration.md` (миграция) + `PLAN.md` (хардеринг),
`PLAN-REVIEW-LOG*.md` (Codex-ревью, 3 раунда до APPROVED).

**Work-Values миграция** (baseline-коммит):
- Schwartz 10-value модель заменена на 6 Minnesota / O*NET Work Values
  (`achievement, independence, recognition, relationships, support,
  working_conditions`); `schwartzValues.js` → `workValues.js`. Значения профессий
  вмёржены из O*NET 28.0 по SOC (883/923 реальные, 40 на прототипе направления) —
  30.3 descriptor Work Values удалён.
- Новый шаг `values`: адаптивный парный турнир (Ford–Johnson, ≤10 сравнений,
  чистый `valuesTournament.js`, доказано на всех 720 перестановках) → иерархия +
  confirm. Новый шаг `summary`: архетип + Big Five радар + persona + work-values
  радар. Убран entry-вопрос «Why are you here?» (`whyHereAnswer`). Числовой %
  прогресса.
- `valuesFit` → centered cosine, одно `{overall}`. `schemaVersion` + миграция
  несовместимых Redis-сессий на `hydrate()`.

**Backend-хардеринг** (отдельные коммиты поверх baseline, все с регресс-тестами):
- Multer-сообщение исправлено на 5 МБ (врало «2 МБ»).
- Single-flight lock на CV-роутах (`require-then-lock`, ключ `${session.id}:cv`) —
  двойной сабмит больше не удваивает AI-спенд/advance.
- Leak-safe error-хендлинг: request-id middleware (заголовок `X-Request-Id` +
  `requestId` в теле), `logger.js` (route-шаблон/UUID-редакция, `resolveStatus`
  clamp), `fail`/`sendError` (4xx — своё сообщение, 500 — генерик + лог),
  финальный error-middleware для parse-ошибок.
- Атомарный `finalizeValues` на confirm (одна Redis-запись, чистит турнир —
  убирает пересчёт FJ на каждом снапшоте).
- Инвариант single-instance задокументирован + loud-warn на `WEB_CONCURRENCY>1`
  (`render.yaml`, стартовый лог, `sessionStore.js`).
- Doc-rot: `CLAUDE.md`/`README.md`/`ARCHITECTURE.md`/`PROJECT_STATUS.md` + комментарии
  исходников синхронизированы под Work-Values модель.
- Регрессия: **backend 164/164**, frontend 24/24.

---

## Сделано 2026-07-13, вечер (entry rework, ветка `feat/entry-screen-rework`)

Спека: `docs/superpowers/specs/2026-07-13-entry-screen-rework-design.md`,
план: `docs/superpowers/plans/2026-07-13-entry-screen-rework.md`.

- **Entry-экран сокращён до двух свободных вопросов** — кнопки change/find
  удалены; «Why are you here?» стал обязательной textarea (кап 500).
  `POST /api/session/start` теперь `{whyHereAnswer, dreamAnswer}`;
  `entryChoice` удалён из сессии и снапшота; дайджест печатает
  `Why they are here: "<текст>"` (толерантно к старым сессиям без поля).
- **Выбор use_skills/new переехал на CV-слайд** — новый роут
  `POST /api/cv/intent` (guard `cv`, перевыбор разрешён, не AI-роут);
  `createSession` стартует с `cvIntent: null`; кнопки путей CV заблокированы
  до выбора, resume подсвечивает сохранённый интент из снапшота.
- Регрессия: **backend 112/112**, frontend 19/19, build чистый.

---

## Сделано 2026-07-13 (career-discovery journey, ветка `feat/career-discovery-journey`)

Адаптация внешней спеки `career-discovery-prompt (v2)` к v2-движку
(спека: `docs/superpowers/specs/2026-07-13-career-discovery-journey-design.md`,
план: `docs/superpowers/plans/2026-07-13-career-discovery-journey.md`):

- **Фиксированная психометрика** — удалён шаг `depth_choice` и роут
  `/api/session/big-five-depth`; Big Five всегда статичный Mini-IPIP-20
  (сидируется при создании сессии), RIASEC всегда статичные 12 айтемов;
  удалены `generateBigFiveItems`/`generateRiasecItems`/их нормализаторы и
  флаг `AI_BIG_FIVE_ITEMS`. jobChar позже тоже свёлся к одному ранжированию
  (кривая ранг→таргет, без AI и без выбора глубины).
- **Рейл «Career Discovery Journey»** — display-only: интро-карта после entry
  + сжатая полоса в шапке каждого шага (`JOURNEY_RAIL`/`railIndexForStep` в
  `lifePath.js`); порядок исполнения не менялся.
- **Persona summary** — `generatePersonaSummary` (+фоллбек) на переходе
  `cv → tree`, `session.personaSummary` в снапшоте, блок «Who you are» в
  панели профиля.
- **Панель профиля** — детерминированные однострочные выводы по осям Big Five
  (`bigFiveTakeaways`); Neuroticism отображается как «Emotional Steadiness»
  (100−N только в отображении, хранимый балл не тронут — и в радаре тоже).
- **Структурированный whyThisFits** — отдельный второй AI-вызов
  (`generateWhyThisFits` + нормализатор с жёсткими счётчиками + фоллбек) в
  `output/first|refine`; схема основного output-вызова не менялась, UI рендерит
  блок вместо legacy `whyFit`; мёртвый `path.whyItFits` удалён из
  `NodeComponent.jsx`.
- Регрессия: **backend 111/111**, frontend 19/19, `npm run build` проходит.

---

## Сделано 2026-07-11 (партия приоритетных фиксов)

- **`trust proxy`** — `server.js` теперь `app.set("trust proxy", resolveTrustProxy())`: 1 хоп в production (Render ставит `NODE_ENV=production`), untrusted в dev/test, переопределяемо `TRUST_PROXY`. Rate limiting снова ключует на реальный IP клиента. В `render.yaml` добавлен явный `TRUST_PROXY=1`, в `.env.example` — документация. Резолв проверен во всех трёх режимах.
- **README переписан** под фактический v2-продукт (product flow, стек, список модулей, лимиты); точный список API-роутов сохранён; добавлены ссылки на ARCHITECTURE/PROJECT_STATUS.
- **`render.yaml` / `DEPLOY.md` синхронизированы** с реальными доменами (`ai-survey-backend-3g62`, `ai-survey-frontend-bay`) и именем сервиса; добавлена шапка «сервис уже задеплоен, blueprint обновляет, а не создаёт».
- **Гонки output-роутов закрыты** — single-flight lock (`acquireLock`/`releaseLock`) на `output/first|refine|accept` (ключ `${sessionId}:output`) и `roadmap/generate` (`${sessionId}:roadmap`); параллельный/повторный запрос получает 409 вместо дублирующего AI-вызова.
- **Персистентность сессий (Upstash Redis)** — опционально через `UPSTASH_REDIS_REST_URL`/`_TOKEN` (`backend/redisClient.js`). `SessionStore` работает write-through (Map — рабочий набор для синхронного интерфейса, каждая мутация пишется в Redis с нативным EX-TTL), `hydrate()` перечитывает сессии при старте → переживают рестарт/усыпление Render. Без креды — прежний in-memory (локаль/тесты не трогаются). `/api/health` отдаёт `sessionStore: "redis"|"memory"`. Render/env/DEPLOY обновлены; 4 новых теста с fake-Redis.
- **Мёртвый код удалён** — `normalizeRefinePayload` (латентный `ReferenceError`) вырезан из `aiEngine.js`.
- **Неиспользуемая зависимость удалена** — `reactflow@11` убран из `frontend/package.json`, lockfile перестроен (−26 пакетов).
- Регрессия проверена: **backend 116/116**, frontend 13/13, `npm run build` проходит, чистый boot сервера (`sessionStore: memory` без креды).

---

## В работе

- **Ветка `backend-hardening`** — Work-Values миграция (baseline-коммит) + backend-хардеринг (см. «Сделано 2026-07-18»). Прогрилена, Codex-APPROVED (3 раунда), реализована, оба сьюта зелёные. Ждёт ревью/мержа в `main` (мерж авто-деплоит прод — `autoDeployTrigger: commit`).

---

## Нужно сделать

> Персистентность сессий (была высоким приоритетом) реализована через Upstash
> Redis — осталось завести базу и задать `UPSTASH_REDIS_REST_URL`/`_TOKEN` в
> Render Dashboard (код и render.yaml готовы). См. «Сделано».

### Средний приоритет
| Задача | Обоснование |
|---|---|
| E2E-тест полного пути (Playwright) | Самая хрупкая часть — интеграция App.jsx ↔ снапшот ↔ граф — покрыта только 13 unit-тестами `lifePath.js`; регрессии в 1636-строчном App.jsx ловятся вручную. |
| Метрика fallback-доли + алёрты | Структурное логирование ошибок + request-id уже есть (`logger.js`, 2026-07-18). Остаётся: нет метрики «сколько артефактов ушло в fallback» (её отсутствие = качество прода неизмеримо) и нет алёртов. На Render логи эфемерны. |
| Контроль расходов OpenAI | Нет учёта токенов/стоимости per-session; полный проход = ~10 AI-вызовов. При росте трафика нужен хотя бы счётчик и дневной лимит. |
| Структурный retry на AI-вызовы | `maxRetries: 1` покрывает сетевые ошибки, но структурно кривой JSON сразу роняет вызов в фоллбек. Один повтор с сообщением об ошибке валидации поднял бы долю настоящих AI-ответов (актуально для whyThisFits с его жёсткими счётчиками буллетов). |
| Локализация UI | Интерфейс только на английском; если целевая аудитория русскоязычная — нужен i18n-слой. |

### Низкий приоритет
| Задача | Обоснование |
|---|---|
| Измеряемые интенсивности work values | Турнир даёт явную иерархию (explicit), но магнитуды — из фиксированной rank→score кривой, не измерены. Короткий инструмент интенсивностей (MIQ-подобный) дал бы истинные величины вместо кривой. |
| Заменить `pdf-parse@1.1.4` | Пакет не обновлялся с 2018, известные краевые баги; кандидаты — `pdf-parse` v2 или `unpdf`. |
| Убрать устаревшие `AUDIT_FINDINGS.md` / `AUDIT_ACTION_PROMPT.md` и скриншоты из корня | Аудит 2026-07-06 описывал v1; почти все находки закрыты (см. git-историю `fix/audit-p0-p2`, `feat/question-engine-v2`). История сохраняется в git. |
| Разбить бандл фронтенда | `npm run build` предупреждает о чанке 865 КБ (recharts + React Flow); code-splitting через dynamic import снизил бы вес первой загрузки. |

---

## Известные баги / технический долг

1. **Один процесс (по дизайну).** Map / single-flight lock / rate-limit счётчики привязаны к процессу — горизонтальное масштабирование требует общего стора для сессий/локов/лимитов. Инвариант теперь явно задокументирован (`render.yaml`, `sessionStore.js`) + loud-warn в логе на `WEB_CONCURRENCY>1`. Для одного инстанса не проблема.
2. ~~AI-генерируемые Big Five пункты психометрически не валидированы~~ — снято 2026-07-13: инструмент теперь всегда статичный Mini-IPIP-20 (и RIASEC всегда статичные 12), AI-генерация айтемов удалена.
3. **`directionId` на output'е приблизителен** — `refineOutput` наследует id предыдущего output'а, `output/first` присваивает `ranked[0]` независимо от того, куда реально ушла модель. Влияет на work-value фоллбек и на исключение семейств в notSuitable.
4. ~~**`jobCharItems` сериализуются в каждом снапшоте**~~ — снято: tradeoff-батарея удалена, шаг job-characteristics это один экран ранжирования.
5. **Prompt-injection канал** — `dreamAnswer`, `reason`, journey-ответы попадают в промпты как есть. Риск ограничен (JSON mode + строгий нормализатор, у сессии нет привилегий), но стоит упомянуть инъекцию в system-промпте.
