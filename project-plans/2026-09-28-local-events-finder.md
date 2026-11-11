# Local events finder (city → country → online)

**Date:** 2026-09-28
**Status:** Proposal — spike done, not implemented
**Related:** Phase 0 of [monthly events subscription](2026-09-28-profession-events-subscription.md)

## Goal

After the user accepts an output, show **real, dated, linked** events for that profession in their
city, then elsewhere in their country, then online. No invented events, ever. Works keyless in a
reduced form.

## What the spike showed (2026-09-28)

Ran OpenAI Responses API + `web_search` tool (`gpt-4.1-mini`, `user_location` = city/country) and
fetched the returned pages.

| Test | Result |
|---|---|
| Data Analyst, Berlin, DE — model answers directly | 5 s, 1 search call. Real-looking events, but one outside the date window and one URL wrapped in a third-party proxy (`proxy…workers.dev/https/www.tum.de/…`). |
| UX Designer, Kyiv, UA — model answers directly | 8 events, **most unusable**: URLs such as `meetup.com/producttank-odesa/` were **not among the search sources** (slug and date invented — the real page has no upcoming events), plus irrelevant items (public-speaking club). |
| Same search, `include: ["web_search_call.action.sources"]` | 18 real source URLs (meetup.com topic/find pages, dev.events, itarena.ua, kyivux.com, ithub.ua…). Sources are trustworthy; the model's summary is not. |
| Parse schema.org `Event` JSON-LD from fetched pages | `eventbrite.com/d/germany--berlin/data-analytics/` → 12 real events (MeasureCamp Berlin 2026-10-10, Berlin AI Conference 2026-10-15…). `meetup.com/find/ua--kyiv/` → 12. `dev.events/meetups/EU/UA/Kyiv/ux` → 2. University/association pages usually have **no** JSON-LD. |

**Conclusion:** use the model to *find pages*, never to *state events*. Events come from structured
data on fetched pages (deterministic) or from LLM extraction that the server verifies against the page text.

Cost measured: ~8.8k input tokens per search call (fixed 8k block for `gpt-4.1-mini`) + $10/1k calls
→ **≈ $0.013 per search call**, ≈ $0.03–0.06 per full lookup, amortized by caching.

## Pipeline

```
accepted output (jobTitle, orientedField, socCode, O*NET skills) + demographics (city, country)
  │
  ├─ 0. Deep links (always, keyless, zero risk)
  │     Eventbrite  /d/{country}--{city}/{keyword}/
  │     Meetup      /find/?keywords={keyword}&location={cc}--{city}
  │     LinkedIn    /search/results/events/?keywords={keyword}
  │     → the user clicks through; we fetch nothing
  │
  ├─ 1. Discover (OpenAI web_search, sources only)
  │     2–3 calls: city scope, country scope, online scope; English + local language
  │     user_location {type:"approximate", country:<ISO-2>, city}
  │     keep web_search_call.action.sources URLs; strip utm_*; drop proxy/redirect hosts
  │
  ├─ 2. Fetch (server, only URLs from step 1)
  │     robots.txt respected, 8 s timeout, ≤ 1 MB, ≤ 10 pages, domain allow/block list
  │
  ├─ 3. Extract
  │     a) schema.org Event JSON-LD → deterministic {title, startDate, location, url}
  │     b) no JSON-LD → gpt-4.1-mini JSON extraction from page text; keep an item only if
  │        its title and its date both appear in that page's text (server-side check)
  │
  ├─ 4. Filter + rank (server)
  │     startDate ∈ [today, today+120d]; dedupe by (normalized title, date)
  │     scope = city | country | online  (compare to user city/country)
  │     one cheap LLM call: relevance 0–100 to the job + a one-line "why"; drop < 50
  │
  └─ 5. Cache  key = socCode|city|countryISO|YYYY-MM-DD, 24 h
        + session.events[outputId] (like session.roadmaps)
```

`country` and `city` are free text today. Resolve country → ISO-2 without a dependency:
build a reverse map from `new Intl.DisplayNames(["en"], {type: "region"})` over `AA…ZZ`;
unresolved → omit `country` from `user_location` and keep it only in the query text.

## Backend

- `backend/services/webSearch.js` — wrapper over the Responses API `web_search` tool, returns source
  URLs only. Injectable client, silent `null` without `OPENAI_API_KEY`, failure logging throttled —
  same shape as `services/onetApi.js`.
- `backend/eventsFinder.js` — pure pieces: query building, deep-link building, JSON-LD parser,
  URL sanitizer, date/scope filter, dedupe, text-verification of LLM-extracted items. Fetch and LLM
  are injected, so everything is testable with recorded HTML fixtures.
- Route `POST /api/events/search { sessionId, outputId }` — accepted output only (same guard as
  `/api/roadmap/generate`), cached per output, single-flight lock `${session.id}:events`, rate-limited.
  Separate from `/api/output/accept` so accept stays fast.
- Event shape: `{title, startDate, endDate?, venue?, city?, online, scope: "city"|"country"|"online",
  url, sourceDomain, why, provenance: "jsonld"|"verified_text"}`.
- Env: nothing new required (reuses `OPENAI_API_KEY`). Optional `EVENTS_BLOCKED_DOMAINS`.
- Keyless: response is `{ status: "unavailable", deepLinks }` — the UI shows the deep links and keeps
  today's generic advice text, clearly labelled as advice, not listings.

## Frontend

"Events near you" block in the details panel: three groups (In {city} / In {country} / Online),
each row = date · title · venue · source domain ↗ (new tab). Loading state like the roadmap.
Empty group → "Nothing verified in {city} in the next 4 months" + the deep links for that scope.
The existing hallucinated `events` item list stops being presented as events.

## Tests

- JSON-LD parser over saved HTML fixtures (Eventbrite search page, Meetup find page, dev.events).
- URL sanitizer (utm stripping, proxy host rejection), ISO-2 resolver, date window, dedupe, scope.
- Text verification rejects an item whose title/date are not in the page.
- Route: guard (not accepted → 409/400), cache hit, single-flight, keyless `unavailable` + deep links.

## Risks and open points

1. **Terms of service.** robots.txt allows `eventbrite.com/d/…` and `meetup.com/find/…`, but both
   sites' ToS restrict automated access. Low volume + 24 h cache reduces load, not legal exposure.
   Decide before launch: (a) deep links only for these two, (b) fetch only pages the search engine
   returned, or (c) ask for permission/partnership. `dev.events` allows all crawling.
2. **Non-tech professions** (nurse, architect, chef) have fewer aggregator pages → more empty city
   scope. The country/online fallback and deep links cover it; measure empty-rate per direction.
3. **Latency:** 2–3 searches + fetches ≈ 10–20 s → must be async with a loading state, never block accept.
4. **Local language:** discovery queries in the country's language matter (Kyiv results were mostly
   English-language Meetup pages); the extract step must handle non-English pages.

## Suggested first slice (≈ 1–2 days)

Deep links (step 0) + discovery + JSON-LD extraction only (steps 1, 2, 3a, 4 without the LLM
relevance call) behind the new route, with the UI block. Add 3b (verified text extraction) and
relevance ranking after checking real results for 5–10 profession/city pairs.
