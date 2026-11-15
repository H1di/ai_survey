const { createRemoteJWKSet, jwtVerify } = require("jose");
const { logError } = require("./logger");

// Fixed identity for the keyless dev bypass. Every request shares it, so the
// ownership check degrades to "the session id is the capability" — exactly
// the pre-accounts behaviour. Never a real Supabase user id.
const DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

// Supabase Auth access tokens: asymmetric signing keys (ES256/RS256) published
// at the project's JWKS endpoint, issuer `<url>/auth/v1`, audience
// "authenticated". Legacy HS256-only projects publish no keys and will 401 —
// switch the project to asymmetric JWT signing keys.
const TOKEN_VERDICTS = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

// `onOutage(req)` fires when the JWKS cannot be reached (the 503 below): that
// failure locks every user out and never passes through sendError.
function createAuth({ supabaseUrl, onOutage } = {}) {
  if (!supabaseUrl) {
    return {
      enabled: false,
      middleware(req, _res, next) {
        req.user = { id: DEV_USER_ID, bypass: true };
        next();
      },
    };
  }

  const base = supabaseUrl.replace(/\/+$/, "");
  const issuer = `${base}/auth/v1`;
  // jose caches the key set and refetches on an unknown `kid` (key rotation).
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return {
    enabled: true,
    async middleware(req, res, next) {
      const header = req.get("authorization") || "";
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match) return unauthorized(req, res);
      try {
        const { payload } = await jwtVerify(match[1], jwks, {
          issuer,
          audience: "authenticated",
        });
        if (typeof payload.sub !== "string" || !payload.sub) return unauthorized(req, res);
        req.user = { id: payload.sub, bypass: false };
        return next();
      } catch (error) {
        // Only a verdict about THIS token means "sign in again". Everything
        // else — a network failure, a timeout, a non-200 or malformed JWKS
        // (jose codes those ERR_JOSE_GENERIC / ERR_JWKS_INVALID) — is our
        // outage: 503, logged. A 401 there would sign every user out.
        if (TOKEN_VERDICTS.has(error && error.code)) return unauthorized(req, res);
        logError(req, error);
        try {
          if (onOutage) onOutage(req);
        } catch {
          // an alert hook must never turn a 503 into a crash
        }
        return res
          .status(503)
          .json({ error: "Sign-in service is unavailable. Try again shortly.", requestId: req.id });
      }
    },
  };
}

function unauthorized(req, res) {
  return res.status(401).json({ error: "Sign in to continue.", requestId: req.id });
}

module.exports = { createAuth, DEV_USER_ID };
