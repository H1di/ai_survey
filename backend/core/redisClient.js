// Optional Upstash Redis client for durable sessions. Returns null when the
// credentials are absent, so the app falls back to in-memory sessions
// (local dev, tests, and any deploy without a store configured).
function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Required lazily so the dependency is only touched when actually configured.
  const { Redis } = require("@upstash/redis");
  return new Redis({ url, token });
}

module.exports = { createRedisClient };
