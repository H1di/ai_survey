# ARCHITECTURE — Life Path Explorer

Постоянная техническая спецификация. Обновляется при изменении структуры
(вместе с `PROJECT_STATUS.md`). Актуальна на 2026-07-11.

---

## 1. Общая схема

```
┌──────────────────────┐   /api/* (JSON, multipart для CV)   ┌──────────────────────────┐
│  frontend/ (SPA)     │ ──────────────────────────────────▶ │  backend/ (Express 5)     │
│  React 19 + Vite     │ ◀────────────────────────────────── │  Node, CommonJS, :3001    │
│  @xyflow/react 12    │      полный снапшот сессии          │  in-memory SessionStore   │
└──────────────────────┘                                     └────────────┬─────────────┘
                                                                          │ chat.completions
                                                                          │ (JSON mode)
                                                                          ▼
                                                             ┌──────────────────────────┐
                                                             │  OpenAI gpt-4.1-mini      │
                                                             │  timeout 30 c, 1 retry    │
                                                             │  нет ключа/ошибка →       │
                                                             │  детерминир. фоллбек      │
                                                             └──────────────────────────┘
```

Принципы обмена данными:

- **Снапшот — единственный источник правды.** Каждый мутирующий запрос
  возвращает полное состояние сессии (`serializeSessionState`); фронтенд
  применяет его целиком в `applySessionSnapshot`. Локальный стейт фронтенда —
  только view-state (индексы вопросов, busy-флаги, открытые панели).
- **Статичные банки вопросов** (`demographicQuestions`, `bigFiveItems`,
  `riasecItems`, `jobCharParams`, `careerJourneyQuestions`) едут только в
  снапшотах `start` / `GET session` / `big-five-depth` / `riasec/start` /
  `job-characteristics/rank` (`includeStatic`); ответные снапшоты несут только
  динамику — фронтенд мёржит, а не заменяет.
- **AI никогда не отдаёт агрегаты.** Модель возвращает сырые баллы и тексты;
  всё производное (Big Two, RIASEC-код, higher-order полюса Schwartz, оси,
  valuesFit) считает бэкенд детерминированно.
- Дев-режим: Vite-прокси `/api → localhost:3001`; продакшен: Vercel rewrite
  `/api/* → https://ai-survey-backend-3g62.onrender.com/api/*`. Фронтенд-код в
  обоих случаях ходит на относительные пути.

## 2. Модули backend

| Модуль | Что делает | Вход → Выход |
|---|---|---|
| `server.js` | Все 17 роутов, `trust proxy` (1 хоп в prod, `TRUST_PROXY` override), step-guard'ы, rate limiting (300/15 мин глобально, 30/15 мин AI-роуты), CORS-allowlist, multer (2 МБ), single-flight lock output/roadmap-роутов (409 на параллель), `buildScoredOutput` — единственное место агрегации Schwartz-оценок output'а | HTTP → снапшот сессии |
| `sessionStore.js` | In-memory `Map` сессий; TTL 24 ч, sweep раз в час (unref'd); все мутаторы (`advanceStep`, `appendOutput`, `acceptOutput`…); `serializeSessionState`. Опциональный write-through + `hydrate()` в Redis, если передан клиент | session-объект ↔ снапшот |
| `redisClient.js` | Фабрика Upstash-клиента: возвращает `null` без `UPSTASH_REDIS_REST_URL`/`_TOKEN` (→ чистый in-memory), иначе REST-клиент для durable сессий | env → Redis-клиент \| null |
| `questionEngine.js` | Валидация каждого типа ответа (whitelist, диапазоны) и весь скоринг: Big Five (reverse `6−raw`, нормировка `((mean−1)/4)·100`), Big Two (Stability/Plasticity), RIASEC 0–100 + топ-3 код, jobChar-профиль (неспрошенные = 50), прогресс | (session, answer) → normalized value / scores; бросает `{statusCode}`-ошибки |
| `questionPool.js` | Статика: 4 демо-вопроса, `JOB_CHAR_PARAMS` (7 канонических параметров — кросс-слойный контракт), банк tradeoff-вопросов (2 на параметр), 7 career-journey вопросов, `selectFallbackJobCharQuestions(ranking, 5\|10)` | константы |
| `bigFiveItems.js` | Public-domain Mini-IPIP-20 / IPIP-50 — фоллбек-инструмент | `getFallbackItems(depth)` |
| `riasecItems.js` | Статичный пул RIASEC-активностей (12/18, interleaved) | `getFallbackRiasecItems(depth)` |
| `cvExtract.js` | Файл → текст: pdf-parse / mammoth / utf8; любая ошибка чтения → 400 | multer file → string |
| `aiEngine.js` | 11 генераторов (`createAiEngine`), каждый: prompt → `runJsonCompletion` → нормализатор → при любой ошибке детерминированный фоллбек. Нормализаторы экспортированы и покрыты тестами | session-данные → валидированный артефакт |
| `prompts.js` | Билдеры промптов; `BASE_SYSTEM` (анти-tech-bias, «dream — не фильтр домена»); `buildProfileDigest` — единый текстовый дайджест профиля, попадает в каждый content-промпт | параметры → `{system, user}` |
| `directions.js` | Каталог 15 field-families (алфавитный намеренно — никакой домен не первый в детерминированных обходах): label, examples, 3 `professionSeeds`, id для Schwartz-прототипов | `getDirection(id)`, `DIRECTION_IDS` |
| `riasec.js` | Holland-веса каждого направления; `rankDirections(scores, {excludeIds})` — взвешенный dot-product; `inferRiasecScores(bigFive)` — эвристика на мета-аналитических связях для skip-пути | RIASEC-вектор → ранжированный каталог |
| `schwartzValues.js` | Чистый Schwartz-модуль: `SCHWARTZ_ORDER` (10 ценностей, круговой порядок), `deriveHigherOrder` (гедонизм 50/50 между полюсами), `deriveAxes` (±100), `deriveTopValues`, `dominantPole`, `valuesFit` (0.6·axisFit + 0.4·centered-cosine), 15 ручных прототипов направлений + модуляция jobChar-таргетами, эвристика инференса ценностей пользователя | вектора 0–100 → агрегаты |

## 3. Структура вопросов

Старой системы «branch themes» (адаптивный пул из 38 вопросов v1) больше нет —
она удалена вместе с legacy CRA (тег `archive/legacy-cra-2026-07`). Текущая
логика — **линейный step-конвейер с per-session генерацией инструментов**:

1. Порядок шагов фиксирован (`session.step`), каждый роут охраняется guard'ом
   «не тот шаг → 400». Назад по шагам сервер не ходит; «← Back» на фронтенде —
   навигация по уже отвеченным вопросам внутри блока (перезапись ответа).
2. Адаптивность достигается не ветвлением, а:
   - выбором глубины (Big Five 20/50 → RIASEC 12/18; jobChar 5/10);
   - AI-генерацией пунктов per-session (Big Five, RIASEC, jobChar) с жёсткими
     структурными валидаторами и статичными банками как фоллбеком;
   - jobChar-вопросы взвешены к топу пользовательского ранжирования и
     сортируются по нему;
   - опциональными путями: RIASEC-skip (инференс), CV-текст vs 7
     journey-вопросов.
3. На Page 3 «ветвление» — это цепочка output'ов: каждый refine/notSuitable
   добавляет `output_N` с `parentId` на предыдущий; принятый output
   отращивает 4 advice-узла и цепочку roadmap-шагов.

## 4. Контракты данных

### 4.1 Ответы пользователя (frontend → backend)

| Шаг | Payload |
|---|---|
| Демография | `{sessionId, questionId: "sex"\|"age"\|"country"\|"city", value}` |
| Big Five | `{sessionId, itemId, value: 1–5}` |
| RIASEC | `{sessionId, itemId, value: 1–5}` |
| JobChar ранжирование | `{sessionId, ranking: [7 id, перестановка], depth: 5\|10}` |
| JobChar ответ | `{sessionId, itemId, value}` — value обязан равняться `value` одной из опций пункта |
| CV | JSON `{sessionId, cvText}` **или** multipart `sessionId` + `file` |
| Journey | `{sessionId, questionId: "cj_…", value: string ≤400}` |
| Refine | `{sessionId, outputId, changes: [{param, reason ≤200}]}` **XOR** `{sessionId, outputId, notSuitable: true}` |

Канонические ключи (контракт между промптами, скорингом, сессией и UI):
- 7 jobChar-параметров: `compensation, work_mode, job_security, career_growth, complexity, meaning_impact, social`;
- 10 Schwartz-ценностей: `self_direction, stimulation, hedonism, achievement, power, security, conformity, tradition, benevolence, universalism`.

### 4.2 JSON-схемы AI-ответов (все вызовы — JSON mode; нормализатор бросает → фоллбек)

| Генератор | Схема ответа модели | Ключевые проверки нормализатора |
|---|---|---|
| Big Five items (t=0.85) | `{items:[{trait:"O\|C\|E\|A\|N", reverse:bool, text}]}` | ровно N пунктов, ровно N/5 на черту, reverse-доля 0.3–0.7 на черту, дедуп текстов |
| RIASEC items (t=0.85) | `{items:[{type:"R\|I\|A\|S\|E\|C", text}]}` | ровно N, поровну на тип, дедуп, ≤120 симв. |
| RIASEC inference (t=0.4) | `{scores:{R..C: int}}` | все 6 конечные числа, clamp 0–100 |
| JobChar questions (t=0.8) | `{items:[{param, text, options:[{value, label}]}]}` | ровно count, param ∈ ranking, 3–4 опции, value clamp 0–100; сортировка по ранжированию |
| CV parse (t=0.2) | `{skills:[], domains:[], seniority}` | ≥1 skill, лимиты 12/6, обрезка строк |
| User values (t=0.4) | `{schwartzValues:{10 ключей: int}}` | все 10 конечные, clamp, **анти-флэт**: max−min ≥ 8 |
| Profession values (t=0.4) | + `valuesRationale:{key: line}` | то же + rationale ≤3 строк по ≤200 симв. |
| Oriented Field / 1st Output (t=0.8) | `{orientedField, jobTitle, thesis, parameterFit:{7 ключей}, whyFit, firstMilestone, constraintsNote}` | все 6 текстов непустые, все 7 parameterFit-строк непустые |
| Refinement (t=0.8) | та же схема + `changeSummary` | как output; changeSummary дефолтится |
| Output detail (t=0.7) | `{aiRecommendations:[{title,detail}], events:[{name,why}], universities:[{name,program}], courses:[{name,provider,why}]}` | каждый блок ≥2 валидных записей, обрезка до 4 |
| Roadmap (t=0.7) | `{stages:[{title, description, timeframe, milestone}]}` | ≥4 стадий (обрезка до 8), title+description обязательны |

Каждый content-промпт получает `buildProfileDigest`: intent, dream (с пометкой
«не фильтр домена»), демография, OCEAN 0–100, Big Two, RIASEC-вектор + код
(+флаг inferred), ранжированные jobChar-таргеты, CV-сигнал (парсинг / сырой
фрагмент ≤300 симв. / journey-ответы).

### 4.3 Снапшот сессии (backend → frontend)

`serializeSessionState` возвращает: идентичность (`sessionId`, `entryChoice`,
`dreamAnswer`, `step`, `pathStage`), статичные банки (только с
`includeStatic`), все ответы и скоры (`demographics`, `bigFiveAnswers/Scores`,
`derivedTraits`, `riasec*`, `jobChar*`, `careerJourneyAnswers`, `cvAnalysis`,
`cvProvided`), `userValues` + предвычисленный `userValuesAxes`, `progress`,
`summary`, output-цепочку (`outputs[]` со всеми Schwartz-полями,
`acceptedOutputId`, `refinementHistory`, `roadmaps`), плюс `aiEnabled` —
честный флаг «работает AI или demo-фоллбек». Скоринговые ключи пунктов
(`trait`, `reverse`, `type`) в снапшот не попадают никогда.

## 5. Состояние сессии: где живёт и что это ограничивает

Сессии — `Map` в памяти процесса (`sessionStore.js`), TTL 24 ч от
`updatedAt`, sweep раз в час. Клиент хранит только `sessionId` в
localStorage и восстанавливается через `GET /api/session/:id`.

**Опциональная durable-персистентность (Upstash Redis).** Если заданы
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (`redisClient.js`),
`SessionStore` работает write-through: Map остаётся авторитетным рабочим
набором для синхронного `require()/get()`, а каждая мутация (`createSession`,
`touch`) пишет весь объект сессии в Redis с нативным EX-TTL. При старте
`store.hydrate()` перечитывает сессии обратно в Map (SCAN + GET) — поэтому
процесс переживает рестарт/усыпление Render. `/api/health` отдаёт
`sessionStore: "redis"|"memory"`. Без креды — прежний чистый in-memory, и
локально/в тестах Redis не нужен.

Оставшиеся ограничения:
- **Один процесс.** Горизонтальное масштабирование по-прежнему невозможно: Map,
  single-flight lock и rate-limit счётчики живут в одном процессе. Второй
  инстанс не увидит write-through другого до собственной `hydrate()`.
- **Write-through — fire-and-forget.** Единственная невосстановимая потеря —
  краш между мутацией и её записью без последующей мутации; каждая запись
  содержит весь объект, поэтому обычно самозалечивается на следующей мутации.
- **Нет аутентификации владельца**: единственный «секрет» — непрозрачный UUID
  сессии.
- Без Redis — рестарт процесса всё ещё теряет все сессии (дефолт для
  локали/демо).

## 6. Диаграмма потока данных

От ответа пользователя до отрисовки графа:

```mermaid
flowchart TD
    subgraph Frontend["frontend/src (React SPA)"]
        UI["Карточка вопроса / dock-карточка<br/>(App.jsx)"]
        API["api.js — fetch-обёртка<br/>таймаут 45 с + AbortController"]
        APPLY["applySessionSnapshot<br/>(снапшот = источник правды)"]
        BUILD["buildLifePathGraph (lifePath.js)<br/>nodes + edges декларативно"]
        FLOW["GraphView — React Flow<br/>me / output / advice / roadmap<br/>+ CameraDirector fitView"]
        PANELS["Панели: профиль (радар, RIASEC,<br/>Schwartz-карта), детали, refine-dock"]
    end

    subgraph Backend["backend (Express :3001)"]
        GUARD["server.js: rate limit → CORS →<br/>step-guard шага сессии"]
        VALIDATE["questionEngine: валидация ответа<br/>(whitelist / диапазон / опция)"]
        SCORE["Скоринг при закрытии блока:<br/>Big Five → OCEAN + Big Two<br/>RIASEC → 0–100 + код<br/>jobChar → профиль таргетов"]
        STORE[("sessionStore<br/>in-memory Map, TTL 24 ч")]
        SNAP["serializeSessionState<br/>(+ static-банки только на start/resume)"]
    end

    subgraph AI["aiEngine.js"]
        GEN["Генератор (items / inference /<br/>output / detail / roadmap)"]
        DIGEST["buildProfileDigest —<br/>профиль в каждый промпт"]
        LLM["OpenAI gpt-4.1-mini, JSON mode<br/>timeout 30 с, 1 retry"]
        NORM["Нормализатор: структурная<br/>валидация payload"]
        FB["Детерминированный фоллбек<br/>(IPIP, банки, seeds, прототипы)"]
    end

    subgraph Schwartz["Server-side агрегаты"]
        SCOREVAL["scoreProfessionValues (AI/прототип)"]
        DERIVE["buildScoredOutput: higherOrder,<br/>axes, dominantPole, topValues,<br/>valuesFit(user, job)"]
    end

    UI -->|"POST ответ / refine / accept"| API --> GUARD --> VALIDATE
    VALIDATE -->|запись ответа| STORE
    VALIDATE --> SCORE --> STORE
    GUARD -->|"AI-шаги: items, cv, values,<br/>output, detail, roadmap"| GEN
    DIGEST --> GEN
    GEN --> LLM --> NORM
    NORM -->|"валиден"| STORE
    NORM -->|"брошено исключение"| FB --> STORE
    LLM -.->|"ошибка / нет ключа / таймаут"| FB
    GEN -->|"для output'ов"| SCOREVAL --> DERIVE --> STORE
    STORE --> SNAP -->|"полный JSON-снапшот"| APPLY
    APPLY --> BUILD --> FLOW
    APPLY --> PANELS
    FLOW -->|"клик по узлу → панель<br/>Yes/No → следующий POST"| UI
```

Ключевое свойство цикла: фронтенд никогда не «додумывает» состояние — любое
действие = POST → новый снапшот → полная пересборка графа. Узлы/рёбра не
мутируются императивно.

## 7. Техническая оценка

Честная инженерная оценка на 2026-07-11.

### 7.1 Что архитектура выдержит, а что нет

**Выдержит:** рост числа вопросов и направлений — банки и каталог чисто
данные, скоринг обобщён; смену модели OpenAI (один env-var); рост фич Page 3 —
output-цепочка и Schwartz-слой расширяемы и хорошо оттестированы.

**Не выдержит без работ:**
- **Более одного инстанса бэкенда.** Всё состояние в памяти одного процесса —
  включая single-flight lock output-роутов и rate-limit счётчики; Redis-стор
  переживает рестарт, но не даёт консистентности между инстансами.
- **Заметного трафика на AI-роуты.** Нет учёта токенов, нет бюджетных
  предохранителей кроме rate limit.

**Потеря сессий на рестарт устранена** для прода: при заданной Upstash-креде
`SessionStore` персистит write-through и гидрируется при старте (§5). Без
креды (локаль/демо) поведение прежнее — in-memory.

### 7.2 Проблемные места (по убыванию важности)

1. **Обработка ошибок AI хороша, но слепа.** Фоллбек срабатывает молча для
   оператора: единственный след — `console.error` в эфемерных логах Render.
   Нет метрики «доля fallback-ответов» — можно неделями отдавать demo-контент
   с невалидным ключом и не знать (UI покажет «Demo mode» только при
   *отсутствии* ключа, не при систематических отказах API).
2. **Валидация ответов пользователя** — сильная (whitelist на всё, диапазоны,
   step-guard'ы, capped strings). Слабое место одно: `dreamAnswer`, `reason` и
   journey-ответы попадают в промпты как есть — классический prompt-injection
   канал. Риск ограничен (модель отвечает в JSON mode строгому нормализатору,
   у сессии нет привилегий), но упомянуть инъекцию в system-промпте стоит.

### 7.3 Качество AI-слоя (aiEngine + prompts)

Сильная сторона проекта; уровень выше типичного MVP:

- **Парсинг устойчив**: JSON mode + `parseJsonObject` с тремя ступенями
  (прямой parse → срез markdown-fence → срез до внешних скобок).
- **Каждый payload проходит структурный нормализатор**, и нормализаторы
  реально строгие (точные количества, доли reverse, анти-флэт для Schwartz,
  «≥2 записей на блок» для советов). Невалидный ответ модели не долетает до
  пользователя — уходит в детерминированный фоллбек. Нормализаторы покрыты
  тестами напрямую.
- **Агрегаты отделены от генерации**: модель не может выдать несогласованные
  higherOrder/fit — они всегда считаются из сырых баллов на сервере.
- **Промпты дисциплинированные**: явная схема в каждом system-промпте,
  анти-tech-bias и «dream ≠ фильтр домена» в `BASE_SYSTEM`, температуры
  осмысленно разведены (0.2 парсинг CV → 0.85 генерация пунктов).

Слабости AI-слоя:
- **Нет retry на *невалидную структуру***: `maxRetries: 1` покрывает сетевые
  ошибки, но структурно кривой JSON сразу роняет вызов в фоллбек. Один
  повторный запрос с сообщением об ошибке валидации заметно поднял бы долю
  AI-ответов (актуально для Big Five items — самый строгий валидатор).
- **Фоллбеки неотличимы для аналитики** — флага «этот артефакт из фоллбека»
  в сессии нет (кроме глобального `aiEnabled`), измерить их долю нельзя.
- **`refineOutput` наследует `directionId` предыдущего output'а**, даже если
  AI фактически сменил область; `output/first` присваивает
  `directionId = ranked[0]` независимо от того, куда реально ушла модель.
  Влияет на Schwartz-фоллбек и на исключение семейств в notSuitable —
  неточность, о которой стоит помнить.

### 7.4 Статус приоритетных фиксов

Закрыто 2026-07-11 (партия приоритетных фиксов):
- ✅ **`trust proxy`** — `app.set("trust proxy", resolveTrustProxy())`, 1 хоп в
  production, `TRUST_PROXY` override; rate limiting снова per-client.
- ✅ **Персистентность сессий** — опциональный Upstash Redis write-through +
  hydrate (§5); включается credentials, без них — прежний in-memory.
- ✅ **Идемпотентность output-роутов** — single-flight lock (409 на
  параллельный/повторный запрос) на `output/first|refine|accept` и
  `roadmap/generate`.
- ✅ **Документация** — README переписан под v2, домены/имя сервиса в
  DEPLOY.md + render.yaml приведены к реальности.
- ✅ Мёртвый `normalizeRefinePayload` (латентный `ReferenceError`) удалён;
  неиспользуемая `reactflow@11` убрана.

Остаётся, в порядке приоритета:

| # | Действие | Причина |
|---|---|---|
| 1 | Метрика fallback-доли + структурный retry | Качество продукта напрямую = доля настоящих AI-ответов, а она сейчас неизмерима |
| 2 | E2E-тест полного пути | Интеграция App.jsx ↔ снапшот ↔ граф покрыта только unit-тестами |
| 3 | Контроль расходов OpenAI | Нет учёта токенов и бюджетных предохранителей |
| 4 | Мульти-инстанс (при масштабировании) | Map / single-flight lock / rate-limit счётчики привязаны к процессу |
