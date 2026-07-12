# PROJECT_STATUS — Life Path Explorer

> **Процесс:** это живой документ. При каждом значимом изменении в проекте он
> обновляется (вместе с `ARCHITECTURE.md`, если меняется структура). Новые
> файлы для логов не создаются — вся история статуса ведётся здесь.

**Дата последнего обновления:** 2026-07-11 (вечер — партия приоритетных фиксов)

---

## Готово

### Бэкенд — опросник (Pages 1–2)
- **Session state machine** — `entry → demographics → depth_choice → big_five → riasec → job_characteristics → cv → tree` (`backend/server.js`, guard на каждом роуте).
- **Entry** — `entryChoice` (change|find) + `cvIntent` (new|use_skills) + `dreamAnswer` (обрезка до 500 симв.) → `POST /api/session/start`.
- **Демография** — 4 статичных вопроса (sex, age 13–99, country, city) с whitelist-валидацией.
- **Big Five** — выбор глубины 20/50; пункты генерируются AI per-session (жёсткий психометрический валидатор: точное число пунктов на черту, доля reverse 0.3–0.7, дедупликация) с фоллбеком на выверенные public-domain IPIP-наборы (`bigFiveItems.js`); скоринг reverse + нормировка 0–100 + Big Two (Stability/Plasticity).
- **RIASEC** — 12/18 activity-пунктов (AI / статичный пул), скоринг 0–100 по 6 типам + топ-3 код; skip-путь с инференсом из Big Five + dream (`riasecInferred`, low-confidence).
- **Job characteristics** — ранжирование 7 канонических параметров + 5/10 tradeoff-вопросов (AI / статичный банк); профиль 0–100, неспрошенные параметры = 50.
- **CV** — вставка текста или загрузка `.pdf/.docx/.txt` (2 МБ, `cvExtract.js`, ошибки чтения → 400) с AI-парсингом в `{skills, domains, seniority}`; альтернатива — 7 career-journey вопросов.

### Бэкенд — Life Path Engine (Page 3)
- **Schwartz-слой** (`schwartzValues.js`) — чистый модуль: 10 ценностей, higher-order полюса, оси плоскости, `valuesFit` (0.6·axis + 0.4·centered cosine), прототипы по 15 направлениям, детерминированные фоллбеки. AI отдаёт только 10 сырых баллов — все агрегаты считает бэкенд.
- **Инференс ценностей пользователя** на переходе `cv → tree` (AI или документированная эвристика), всегда `confidence: "low"`.
- **Output loop** — `output/first` (идемпотентный; grounding через `rankDirections` по RIASEC), `output/refine` (`changes` XOR `notSuitable`, история в `refinementHistory`, цепочка parent-linked outputs), `output/accept` (accept-once + 4 блока советов), `roadmap/generate` (только для принятого, кэш в `session.roadmaps`).
- **Каждый output** Schwartz-скорится и получает `higherOrder/axes/dominantPole/topValues/valuesFit` server-side.

### Надёжность и безопасность
- **Keyless-режим**: каждый из 11 AI-генераторов имеет детерминированный фоллбек; нормализаторы бросают на структурно неверных payload'ах → вызов уходит в фоллбек. UI честно показывает «Demo mode».
- Таймауты: OpenAI-клиент 30 с / 1 retry; фронтенд-fetch 45 с + AbortController + кнопка «Try again».
- Rate limiting: 300 запросов/15 мин глобально, 30/15 мин на AI-роуты (см. баг про `trust proxy` ниже).
- CORS-allowlist из env, `express.json` 1 МБ, multer 2 МБ с отдельным error handler'ом.
- Скоринговые ключи (`trait`/`reverse`, RIASEC `type`) никогда не сериализуются клиенту.

### Фронтенд
- SPA без роутера: stage machine `entry → survey → tree`, серверный снапшот — единственный источник правды (`applySessionSnapshot`), локально только view-state.
- Восстановление сессии после перезагрузки: `sessionId` в localStorage + `GET /api/session/:id`, резюме с первого неотвеченного вопроса.
- Опросник: single-click ответы, «← Back» внутри блоков, общий прогресс-бар с честной оценкой, лоадеры на всех AI-паузах.
- Граф (React Flow): узлы `me/output/advice/roadmap/loading`, кастомное ребро `branch` с каскадной анимацией, camera director (`fitView` по волнам узлов), reduced-motion.
- Dock-карточки review/refine (чекбоксы 7 параметров + причины), панель деталей output'а, панель профиля: радар Big Five, бары RIASEC, SVG-карта Schwartz-циркумплекса с точками пользователя и всех output'ов.
- Дисклеймеры («не проф. консультация», «preliminary profile», «low confidence») на entry и в профиле.

### Тесты и CI
- Backend: **112 тестов** (`node:test` + supertest) — все проходят (проверено 2026-07-11).
- Frontend: **13 тестов** (Vitest, `lifePath.js`) — все проходят.
- GitHub Actions CI: backend-тесты + frontend-тесты + build на push/PR в `main`.

### Деплой (production)
- Backend → Render free tier: `https://ai-survey-backend-3g62.onrender.com` (blueprint `render.yaml`).
- Frontend → Vercel: `https://ai-survey-frontend-bay.vercel.app`; `frontend/vercel.json` проксирует `/api/*` на Render — фронтенд-код ходит на относительные пути.
- Автодеплой обоих сервисов на push в `main`. Инструкция — `DEPLOY.md`.

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

- **Незакоммиченные изменения** — эта партия фиксов + `frontend/.gitignore` (+`.vercel`, +`.env*`) лежат в рабочем дереве несмонтированными. Коммит по запросу пользователя.
- **Локальный `main` устарел** — стоит на `190e839` (до мержа PR #3–#5). Актуальна `deploy-config` (== origin/main); при желании синхронизировать: `git checkout main && git pull`.

---

## Нужно сделать

> Персистентность сессий (была высоким приоритетом) реализована через Upstash
> Redis — осталось завести базу и задать `UPSTASH_REDIS_REST_URL`/`_TOKEN` в
> Render Dashboard (код и render.yaml готовы). См. «Сделано».

### Средний приоритет
| Задача | Обоснование |
|---|---|
| E2E-тест полного пути (Playwright) | Самая хрупкая часть — интеграция App.jsx ↔ снапшот ↔ граф — покрыта только 13 unit-тестами `lifePath.js`; регрессии в 1636-строчном App.jsx ловятся вручную. |
| Логирование/мониторинг + метрика fallback-доли | Сейчас только `console.error` в AI-фоллбеках. Нет request-логов, нет алёртов, нет метрики «сколько артефактов ушло в fallback» (её отсутствие = качество прода неизмеримо). На Render логи эфемерны. |
| Контроль расходов OpenAI | Нет учёта токенов/стоимости per-session; полный проход = ~10 AI-вызовов. При росте трафика нужен хотя бы счётчик и дневной лимит. |
| Структурный retry на AI-вызовы | `maxRetries: 1` покрывает сетевые ошибки, но структурно кривой JSON сразу роняет вызов в фоллбек. Один повтор с сообщением об ошибке валидации поднял бы долю настоящих AI-ответов (актуально для Big Five items). |
| Локализация UI | Интерфейс только на английском; если целевая аудитория русскоязычная — нужен i18n-слой. |

### Низкий приоритет
| Задача | Обоснование |
|---|---|
| Измеряемый Schwartz-инструмент (PVQ-21) | Сейчас ценности всегда инферятся (low confidence). Короткий PVQ дал бы измеренный вектор и честный valuesFit. |
| Заменить `pdf-parse@1.1.4` | Пакет не обновлялся с 2018, известные краевые баги; кандидаты — `pdf-parse` v2 или `unpdf`. |
| Убрать устаревшие `AUDIT_FINDINGS.md` / `AUDIT_ACTION_PROMPT.md` и скриншоты из корня | Аудит 2026-07-06 описывал v1; почти все находки закрыты (см. git-историю `fix/audit-p0-p2`, `feat/question-engine-v2`). История сохраняется в git. |
| Разбить бандл фронтенда | `npm run build` предупреждает о чанке 865 КБ (recharts + React Flow); code-splitting через dynamic import снизил бы вес первой загрузки. |

---

## Известные баги / технический долг

1. **Один процесс.** Даже с Redis-персистентностью Map / single-flight lock / rate-limit счётчики привязаны к процессу — горизонтальное масштабирование требует sticky sessions или общего стора для локов и лимитов. Для одного инстанса не проблема.
2. **AI-генерируемые Big Five пункты психометрически не валидированы** — структурный валидатор строгий, но конструктная валидность и межсессионная сравнимость отсутствуют по определению. Осознанный компромисс; `AI_BIG_FIVE_ITEMS=false` принудительно включает IPIP.
3. **`directionId` на output'е приблизителен** — `refineOutput` наследует id предыдущего output'а, `output/first` присваивает `ranked[0]` независимо от того, куда реально ушла модель. Влияет на Schwartz-фоллбек и на исключение семейств в notSuitable.
4. **`jobCharItems` сериализуются в каждом снапшоте** (не входят в static-часть) — лишние ~килобайты на каждый ответ. Мелочь.
5. **Prompt-injection канал** — `dreamAnswer`, `reason`, journey-ответы попадают в промпты как есть. Риск ограничен (JSON mode + строгий нормализатор, у сессии нет привилегий), но стоит упомянуть инъекцию в system-промпте.
