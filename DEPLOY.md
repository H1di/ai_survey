# Деплой — инструкция для Claude Code

Этот файл написан так, чтобы Claude Code мог выполнить деплой сам, шаг за шагом,
почти без вмешательства человека. Единственное, что нужно от человека — залогиниться
в Render и Vercel (через браузер, один раз) и, по желанию, дать ключ OpenAI.

## Что деплоим

- **Backend** (`backend/`, Express API) → Render, free web service.
- **Frontend** (`frontend/`, Vite + React) → Vercel, free hobby tier.
- Домены выбраны заранее и захардкожены в конфигах, чтобы не было проблемы
  "курицы и яйца" (backend должен знать домен фронта для CORS, фронт должен
  знать домен бэка для прокси):
  - Backend: `https://ai-survey-backend-3g62.onrender.com`
  - Frontend: `https://ai-survey-frontend-bay.vercel.app`

Если любое из этих имён окажется занято при деплое — см. раздел
"Если имя занято" в конце файла.

## Хранение сессий: in-memory по умолчанию, Upstash Redis опционально

`backend/sessionStore.js` держит сессии в памяти процесса. На Render free
tier сервис засыпает после 15 минут простоя и просыпается по следующему
запросу (~30–60 сек, холодный старт) — при этом все in-memory сессии теряются.

Чтобы сессии переживали рестарт/усыпление, подключи **Upstash Redis** (free
tier):

1. Создай базу на https://upstash.com → скопируй `UPSTASH_REDIS_REST_URL` и
   `UPSTASH_REDIS_REST_TOKEN` (REST-интерфейс).
2. В Render Dashboard задай обе переменные (они уже объявлены в `render.yaml`
   с `sync: false`), сделай Manual Deploy.
3. Проверь: `curl https://ai-survey-backend-3g62.onrender.com/api/health` →
   поле `"sessionStore":"redis"` (без креды будет `"memory"`).

Как это работает: Map остаётся рабочим набором для синхронного интерфейса,
каждая мутация пишется в Redis (write-through, TTL нативный), а при старте
`store.hydrate()` перечитывает сессии обратно в Map. Без переменных окружения
поведение прежнее — чистый in-memory, и локально/в тестах Redis не нужен.

## Шаг 1 — Backend на Render

> **Сервис уже задеплоен** как `ai-survey-backend`, а отвечает на
> `https://ai-survey-backend-3g62.onrender.com` — суффикс `-3g62` Render добавил
> при создании, потому что имя было занято. Имя и URL здесь не совпадают, и это
> нормально: `render.yaml` содержит имя (`ai-survey-backend`), поэтому Blueprint
> **обновляет** существующий сервис, а не создаёт новый. Не «чини» это
> расхождение правкой `name` — так уже был создан лишний пустой сервис.
> Шаги ниже нужны только для деплоя с нуля.

Предварительно: человек должен один раз зайти на https://dashboard.render.com,
создать аккаунт (если его нет) и подключить GitHub-репозиторий `H1di/ai_survey`.
Дальше можно через Render CLI или Blueprint:

### Вариант A — Blueprint (проще всего)
1. В Render Dashboard → **New** → **Blueprint** → выбрать репозиторий `H1di/ai_survey`.
2. Render найдёт `render.yaml` в корне и предложит создать сервис `ai-survey-backend`
   (публичный URL Render выдаст сам; при занятом имени добавит суффикс —
   тогда обнови `destination` в `frontend/vercel.json` под фактический URL).
3. При создании Render попросит заполнить переменные с `sync: false` — это
   `OPENAI_API_KEY`. Если ключа пока нет — можно оставить пустым, приложение
   само уйдёт в детерминированный fallback-режим (см. `backend/.env.example`).
4. Deploy. Дождаться статуса "Live".
5. Проверить: `curl https://ai-survey-backend-3g62.onrender.com/api/health` →
   должен вернуть JSON со статусом ok.

### Вариант B — Render CLI (если человек предпочитает терминал)
```bash
# один раз, интерактивный логин через браузер
render login

# из корня репозитория — применяет render.yaml
render blueprint launch
```

## Шаг 2 — Frontend на Vercel

Предварительно: человек один раз выполняет `vercel login` (открывается браузер).

```bash
cd frontend
vercel link --yes --project ai-survey-frontend
vercel --prod --yes
```

`frontend/vercel.json` уже содержит:
- `rewrites` — проксирует все запросы `/api/*` на
  `https://ai-survey-backend-3g62.onrender.com/api/*`, поэтому фронтенд-код
  (`frontend/src/api.js`) не нужно менять — он и так ходит на относительные
  `/api/...` пути.
- `buildCommand`/`outputDirectory`/`framework` — стандартная Vite-сборка.

После деплоя Vercel выдаст домен вида `ai-survey-frontend-bay.vercel.app` —
он должен совпасть с тем, что уже прописан в `CORS_ORIGIN` бэкенда
(см. `render.yaml`). Если Vercel присвоил другой домен — обнови
`CORS_ORIGIN` в Render Dashboard (Environment → CORS_ORIGIN) и сделай
Manual Deploy бэкенда заново.

## Шаг 3 — Проверка сквозного сценария

1. Открыть `https://ai-survey-frontend-bay.vercel.app`.
2. Пройти entry → demographics → big five → riasec → job characteristics → cv.
3. Убедиться, что граф на Page 3 генерируется (или fallback, если нет
   OPENAI_API_KEY) без CORS-ошибок в консоли браузера.

## Если имя занято

Если Render или Vercel сообщат, что имя `ai-survey-backend` /
`ai-survey-frontend` уже используется кем-то другим:

1. Выбери новое уникальное имя, например `ai-survey-backend-<username>`.
2. Обнови везде синхронно:
   - `render.yaml` → `services[0].name` и `envVars.CORS_ORIGIN`
   - `frontend/vercel.json` → `rewrites[0].destination`
   - команду `vercel link --project <новое-имя-фронта>`
3. Закоммить изменения и передеплой оба сервиса.

## Что дальше (не входит в MVP-деплой, но пригодится)

- Персистентность сессий — **реализована через Upstash Redis** (см. раздел
  «Хранение сессий» выше); осталось только завести базу и задать креды.
- Платный tier Render (Starter, $7/мес), если холодные старты станут
  проблемой для реальных пользователей.
- Секреты для CI (GitHub Actions) не нужны — Render/Vercel сами следят
  за репозиторием и передеплоивают на push в `main`.
