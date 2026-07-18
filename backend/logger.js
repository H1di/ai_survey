// Structured, dependency-free error logging + shared helpers for the error
// responders in server.js. One JSON line per logged error keeps Render's log
// stream greppable; successful requests are not logged here (the platform
// already records HTTP access).

// A path segment that looks like a session UUID must never reach the logs — the
// opaque session id is the only bearer secret in this app. Prefer the route
// *template* (which keeps `:sessionId` literal), and redact UUID-like segments
// for paths where no route matched (framework errors raised before routing).
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function redactUuids(path) {
  return typeof path === "string" ? path.replace(UUID_RE, ":id") : path;
}

// The route to log: the matched template (no secret values) when available,
// otherwise the redacted raw path. Never `req.originalUrl` — it carries query
// strings that could hold caller-supplied data.
function routeOf(req) {
  if (!req) return undefined;
  if (req.route) return `${req.baseUrl || ""}${req.route.path}`;
  return redactUuids(req.path);
}

// Coerce a thrown error's status into a sane HTTP code: an integer clamped to
// 400..599, defaulting anything else (undefined, NaN, a stray 200) to 500 — so
// a malformed library status can never yield a bad response or a <500 leak.
function resolveStatus(error) {
  const raw = Number(error && (error.statusCode ?? error.status));
  if (!Number.isInteger(raw) || raw < 400 || raw > 599) return 500;
  return raw;
}

// One JSON line for a server-side (>=500) error. The request travels in so the
// trace id and route go with it. Guarded for req-less unit calls.
function logError(req, error) {
  const stack =
    error && typeof error.stack === "string" ? error.stack.slice(0, 1000) : undefined;
  console.error(
    JSON.stringify({
      t: new Date().toISOString(),
      lvl: "error",
      reqId: req && req.id,
      method: req && req.method,
      route: routeOf(req),
      msg: error && error.message,
      status: resolveStatus(error),
      stack,
    })
  );
}

module.exports = { logError, resolveStatus, redactUuids, routeOf };
