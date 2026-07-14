const test = require("node:test");
const assert = require("node:assert/strict");
const { createOnetApi } = require("../services/onetApi");

const SOC = "15-1252.00";

function outlookPayload(overrides = {}) {
  return {
    code: SOC,
    outlook: { category: "Bright", description: "New job opportunities are very likely." },
    bright_outlook: { category: ["Grow Rapidly"] },
    salary: {
      annual_10th_percentile: 77020,
      annual_median: 133080,
      annual_90th_percentile: 208000,
      hourly_median: 63.98,
    },
    ...overrides,
  };
}

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(calls.length, String(url), options);
  };
  impl.calls = calls;
  return impl;
}

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
const status = (code) => ({ ok: false, status: code, json: async () => ({}) });

test("without an API key every call resolves null and never fetches", async () => {
  const fetchImpl = fakeFetch(() => ok(outlookPayload()));
  const api = createOnetApi({ apiKey: undefined, fetchImpl });
  assert.equal(await api.fetchCareerExtras(SOC), null);
  assert.equal(fetchImpl.calls.length, 0);
});

test("fetches job outlook with the X-API-Key header and normalizes the payload", async () => {
  const fetchImpl = fakeFetch(() => ok(outlookPayload()));
  const api = createOnetApi({ apiKey: "test-key", fetchImpl });

  const extras = await api.fetchCareerExtras(SOC);
  assert.deepEqual(extras, {
    salary: { annualMedian: 133080, hourlyMedian: 63.98 },
    outlook: { category: "Bright", brightOutlook: true },
  });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, options } = fetchImpl.calls[0];
  assert.ok(url.endsWith(`/mnm/careers/${SOC}/job_outlook`), url);
  assert.equal(options.headers["X-API-Key"], "test-key");
  assert.equal(options.headers.Accept, "application/json");
});

test("caches by SOC for 24h and refetches after expiry", async () => {
  let clock = 0;
  const fetchImpl = fakeFetch(() => ok(outlookPayload()));
  const api = createOnetApi({ apiKey: "k", fetchImpl, now: () => clock });

  await api.fetchCareerExtras(SOC);
  await api.fetchCareerExtras(SOC);
  assert.equal(fetchImpl.calls.length, 1);

  await api.fetchCareerExtras("29-1141.00");
  assert.equal(fetchImpl.calls.length, 2);

  clock = 25 * 60 * 60 * 1000;
  await api.fetchCareerExtras(SOC);
  assert.equal(fetchImpl.calls.length, 3);
});

test("retries once after a 429 and succeeds", async () => {
  const fetchImpl = fakeFetch((n) => (n === 1 ? status(429) : ok(outlookPayload())));
  const api = createOnetApi({ apiKey: "k", fetchImpl, retryDelayMs: 1 });

  const extras = await api.fetchCareerExtras(SOC);
  assert.equal(extras.outlook.category, "Bright");
  assert.equal(fetchImpl.calls.length, 2);
});

test("server errors, network failures, and bad JSON all degrade to null", async () => {
  const failing = createOnetApi({ apiKey: "k", fetchImpl: fakeFetch(() => status(500)) });
  assert.equal(await failing.fetchCareerExtras(SOC), null);

  const rejecting = createOnetApi({
    apiKey: "k",
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(await rejecting.fetchCareerExtras(SOC), null);

  const badJson = createOnetApi({
    apiKey: "k",
    fetchImpl: fakeFetch(() => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } })),
  });
  assert.equal(await badJson.fetchCareerExtras(SOC), null);
});

test("missing salary or outlook fields normalize to nulls, not crashes", async () => {
  const fetchImpl = fakeFetch(() =>
    ok({ code: SOC, outlook: { category: "Average" } })
  );
  const api = createOnetApi({ apiKey: "k", fetchImpl });
  const extras = await api.fetchCareerExtras(SOC);
  assert.deepEqual(extras, {
    salary: null,
    outlook: { category: "Average", brightOutlook: false },
  });
});

test("failed lookups are not cached — a later call retries", async () => {
  let healthy = false;
  const fetchImpl = fakeFetch(() => (healthy ? ok(outlookPayload()) : status(500)));
  const api = createOnetApi({ apiKey: "k", fetchImpl });

  assert.equal(await api.fetchCareerExtras(SOC), null);
  healthy = true;
  const extras = await api.fetchCareerExtras(SOC);
  assert.equal(extras.outlook.category, "Bright");
});
