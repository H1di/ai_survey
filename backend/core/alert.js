// Optional webhook alerts for server errors (>=500) and client-reported crashes.
// One POST per status+route per minute; the payload is one line with no stack,
// no session id (the route is the UUID-redacted template from logger.js) and no
// secrets. `text` is read by Slack, `content` by Discord. Without a url this is
// a no-op, and notify never throws or rejects — it must stay off the request path.

function createAlerter({ url, fetchImpl = globalThis.fetch, now = Date.now, minIntervalMs = 60_000 } = {}) {
  const lastSent = new Map();

  function notify({ status, route, requestId, message } = {}) {
    try {
      if (!url || typeof fetchImpl !== "function") return;
      const key = `${status} ${route}`;
      const t = now();
      const prev = lastSent.get(key);
      if (prev !== undefined && t - prev < minIntervalMs) return;
      lastSent.set(key, t);
      if (lastSent.size > 500) {
        for (const [k, v] of lastSent) if (t - v >= minIntervalMs) lastSent.delete(k);
      }
      const line = `${status} ${route} ${requestId} ${message}`;
      Promise.resolve(
        fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line, content: line }),
        })
      ).catch(() => {});
    } catch {
      // swallowed on purpose
    }
  }

  return { notify };
}

module.exports = { createAlerter };
