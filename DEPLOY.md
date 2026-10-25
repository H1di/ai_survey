# Деплой — инструкция для Claude Code

Этот файл написан так, чтобы Claude Code мог выполнить деплой сам, шаг за шагом,
почти без вмешательства человека. Единственное, что нужно от человека — залогиниться
в Render (через браузер, один раз) и, по желанию, дать ключ OpenAI.

## Что деплоим

Один сервис — **Render free web service** `ai-survey-backend`:
https://ai-survey-backend-3g62.onrender.com

- Билд (из корня репозитория): ставит зависимости `backend/` и `frontend/`,
  собирает Vite-фронт в `frontend/dist` (команда — в `render.yaml`).
- Рантайм: `backend/server.js` отдаёт `/api/*` и, если `frontend/dist/index.html`
  существует, статику фронта + SPA fallback для остальных путей без расширения
  (блок «Frontend» в `server.js`; путь можно переопределить `FRONTEND_DIST`).
  Фронт ходит на относительные `/api/...` — браузер видит один origin, CORS не
  участвует.
- Root Directory сервиса — **корень репозитория** (не `backend`): Render не
  отдаёт билду файлы вне Root Directory, а фронт лежит в `frontend/`. Если
  Blueprint sync не сбросил старое значение — очисти поле вручную
  (Settings → Build & Deploy → Root Directory).
- Автодеплой на push в `main`, но только при изменениях в `backend/**`,
  `frontend/**` или `render.yaml` (`buildFilter`) — правки доков не тратят
  free-минуты билда.

## Холодный старт и keep-alive

Free tier засыпает после 15 минут без запросов; первый запрос будит сервис
~30–60 сек — теперь это касается и открытия самой страницы. Лечится внешним
пингом: бесплатный монитор (UptimeRobot / cron-job.org) делает
`GET https://ai-survey-backend-3g62.onrender.com/api/health` каждые 10 минут.
750 free-часов Render в месяц хватает на один сервис 24/7 (~744 ч), но
**только на один** — второй free-сервис в том же workspace с таким пингом
выбьет лимит.

## Хранение сессий: in-memory по умолчанию, Upstash Redis опционально

`backend/core/sessionStore.js` держит сессии в памяти процесса. На Render free
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

## Деплой с нуля (Render)

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
   тогда обнови `CORS_ORIGIN` в `render.yaml` под фактический URL).
3. При создании Render попросит заполнить переменные с `sync: false` — это
   `OPENAI_API_KEY`. Если ключа пока нет — можно оставить пустым, приложение
   само уйдёт в детерминированный fallback-режим (см. `backend/.env.example`).
4. Deploy. Дождаться статуса "Live".
5. Проверить: `curl https://ai-survey-backend-3g62.onrender.com/api/health` →
   JSON со статусом ok, а `https://ai-survey-backend-3g62.onrender.com/` —
   стартовый экран приложения.

### Вариант B — Render CLI (если человек предпочитает терминал)
```bash
# один раз, интерактивный логин через браузер
render login

# из корня репозитория — применяет render.yaml
render blueprint launch
```

## Если имя занято

Если Render сообщит, что имя `ai-survey-backend` уже используется кем-то
другим: выбери новое уникальное имя и обнови синхронно `render.yaml`
(`services[0].name`, `CORS_ORIGIN`) и URL keep-alive монитора.

## Что дальше

- Платный tier Render (Starter, $7/мес) — без засыпания, keep-alive не нужен.
- Секреты для CI (GitHub Actions) не нужны — Render сам следит за репозиторием
  и передеплоивает на push в `main`.
