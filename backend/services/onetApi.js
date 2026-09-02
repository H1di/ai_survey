// O*NET Web Services client (api-v2.onetcenter.org). Like the MarkItDown
// wrapper, the key is optional infrastructure: no ONET_API_KEY -> every call
// resolves null and the app runs on the bundled snapshot alone. Live data adds
// only what the snapshot cannot carry: US salary + job outlook.
const BASE_URL = "https://api-v2.onetcenter.org";
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 250; // O*NET asks for >=200ms before retrying a 429
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // occupation data is static enough
// A wrong key fails on every lookup forever. Logging once per process hides
// that after boot; logging every time floods. Once per window is the middle.
const FAILURE_LOG_INTERVAL_MS = 15 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeExtras(payload) {
  const salary = payload?.salary || null;
  const category = payload?.outlook?.category || null;
  return {
    salary:
      salary && Number.isFinite(salary.annual_median)
        ? {
            annualMedian: salary.annual_median,
            hourlyMedian: Number.isFinite(salary.hourly_median) ? salary.hourly_median : null,
          }
        : null,
    outlook: {
      category,
      brightOutlook: category === "Bright" || Boolean(payload?.bright_outlook),
    },
  };
}

function createOnetApi({
  apiKey,
  fetchImpl = fetch,
  now = Date.now,
  baseUrl = BASE_URL,
  retryDelayMs = RETRY_DELAY_MS,
} = {}) {
  const cache = new Map(); // soc -> { at, extras }
  let lastFailureLogAt = null; // throttles the log line, not the state below
  // Cached liveness, surfaced by getStatus() for /api/health. Only real
  // lookups move these — a cache hit is not a lookup.
  let lastLookupOk = null;
  let lastLookupAt = null;
  let lastError = null;

  async function request(url, isRetry = false) {
    const response = await fetchImpl(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 429 && !isRetry) {
      await sleep(retryDelayMs);
      return request(url, true);
    }
    if (!response.ok) throw new Error(`O*NET responded ${response.status}`);
    return response.json();
  }

  // US salary + job outlook for one occupation; null on any failure so callers
  // never branch on errors. Successes cache for 24h, failures are retried.
  async function fetchCareerExtras(soc) {
    if (!apiKey || !soc) return null;

    const cached = cache.get(soc);
    if (cached && now() - cached.at < CACHE_TTL_MS) return cached.extras;

    try {
      const payload = await request(`${baseUrl}/mnm/careers/${soc}/job_outlook`);
      const extras = normalizeExtras(payload);
      cache.set(soc, { at: now(), extras });
      lastLookupOk = true;
      lastLookupAt = now();
      lastError = null; // a stale error next to a success reads as a live outage
      return extras;
    } catch (error) {
      lastLookupOk = false;
      lastLookupAt = now();
      lastError = error.message;
      if (lastFailureLogAt === null || now() - lastFailureLogAt >= FAILURE_LOG_INTERVAL_MS) {
        lastFailureLogAt = now();
        console.error("[onetApi] live lookup failed (snapshot-only mode):", error.message);
      }
      return null;
    }
  }

  // Cached in-process liveness for /api/health. Never triggers a request, and
  // reports the key as a boolean only — the key itself never leaves here.
  function getStatus() {
    return {
      liveKey: Boolean(apiKey),
      lastLookupOk,
      lastLookupAt,
      lastError,
      cachedOccupations: cache.size,
    };
  }

  return { fetchCareerExtras, getStatus };
}

module.exports = { createOnetApi };
