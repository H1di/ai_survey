const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { extractCvText, getCvUploadExtensions } = require("./assessment/cvExtract");
const { createAiEngine } = require("./engine/aiEngine");
const { getStaticRiasecItems } = require("./assessment/riasecItems");
const {
  DEMOGRAPHIC_QUESTIONS,
  CAREER_JOURNEY_QUESTIONS,
} = require("./assessment/questionPool");
const {
  deriveTopValues,
  valuesFit,
  buildFallbackProfessionValues,
  rankToWorkValueScores,
  WORK_VALUE_CURVE_VERSION,
  WORK_VALUES_ORDER,
} = require("./engine/workValues");
const { startTournament, finalOrder, recordAnswer } = require("./assessment/valuesTournament");
const {
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  buildProgress,
  summarizeAnswersForClient,
} = require("./assessment/questionEngine");
const { SessionStore, STEP_ORDER } = require("./core/sessionStore");
const { DEV_PROFILE, seedTo } = require("./core/devSeed");
const { createRedisClient } = require("./core/redisClient");
const {
  getOccupation,
  getRelated,
  JOB_ZONE_LABELS,
  ONET_ATTRIBUTION,
  SNAPSHOT_VERSION,
  SNAPSHOT_OCCUPATION_COUNT,
} = require("./engine/onet");
const { createOnetApi } = require("./services/onetApi");
const { randomUUID, createHash, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { logError, resolveStatus } = require("./core/logger");

// Tests set their own env (and force fallback by blanking the key) — skip
// .env entirely so it can't refill a real key underneath them.
if (process.env.NODE_ENV !== "test") {
  // An empty OPENAI_API_KEY inherited from the launching shell would otherwise
  // shadow the real value in .env — dotenv never overrides an already-set var.
  // An empty key is never useful, so drop it and let .env win.
  if (!process.env.OPENAI_API_KEY) delete process.env.OPENAI_API_KEY;
  dotenv.config();
}

// Trust proxy: hosting platforms (Render) put us behind a reverse proxy, so
// req.ip is the proxy's address unless we trust its forwarding header. Without
// this, express-rate-limit keys every visitor under one IP — a single shared
// bucket for everyone — and logs a ValidationError per request. Default: one
// hop in production, untrusted in dev/test. Override with TRUST_PROXY (hops).
function resolveTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw !== undefined) {
    const hops = Number(raw);
    return Number.isFinite(hops) ? hops : false;
  }
  return process.env.NODE_ENV === "production" ? 1 : false;
}

const app = express();
app.set("trust proxy", resolveTrustProxy());

const store = new SessionStore({ redis: createRedisClient() });
store.startSweep();

const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";

const aiEngine = createAiEngine({
  apiKey: process.env.OPENAI_API_KEY,
  model: MODEL,
});

// Optional like the OpenAI key: without ONET_API_KEY the occupation card is
// built from the bundled snapshot alone (no US salary/outlook).
const onetApi = createOnetApi({ apiKey: process.env.ONET_API_KEY });

const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

// Request-id: assign or propagate a trace id on EVERY request, mounted before
// body parsing and rate limiting so even malformed-JSON 400s and rate-limit
// 429s carry the X-Request-Id header. An inbound header is sanitized to a safe
// charset and truncated; used only when the result is non-empty, else a fresh
// UUID (an all-invalid-char header must never be echoed back as an empty id).
app.use((req, res, next) => {
  const raw = req.get("x-request-id");
  const cleaned =
    typeof raw === "string" ? raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64) : "";
  req.id = cleaned || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

// Requests proxied by the Vite dev server are same-origin and bypass CORS,
// so this only constrains direct cross-origin browser calls.
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: "1mb" }));

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const globalLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", globalLimiter);

// Tighter budget for routes that can trigger OpenAI spend. One honest
// session needs ~10 of these; the cap mainly stops scripted wallet drain.
const aiLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_AI_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests from this address. Try again later." },
});
for (const path of [
  "/api/riasec/skip",
  "/api/cv",
  "/api/cv/journey",
  "/api/output/first",
  "/api/output/refine",
  "/api/output/accept",
  "/api/roadmap/generate",
]) {
  app.use(path, aiLimiter);
}

const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY);

// Advertised CV upload formats. Resolved once at boot: the markitdown probe
// is async but settles in milliseconds, long before the first session starts.
let cvUploadFormats = [".pdf", ".docx", ".txt", ".html", ".htm"];
getCvUploadExtensions().then((list) => {
  cvUploadFormats = list;
});

// Single-flight guard for the AI-heavy routes. A double-submit or a
// retry-after-timeout on the same session+operation would otherwise race past
// the pre-await state checks and create a duplicate output or double the
// OpenAI spend; a second concurrent call for the same key gets 409 instead.
const inFlightKeys = new Set();
const BUSY_MESSAGE = "Another change to this path is still processing.";

async function withLock(req, res, key, fn, busyMessage = BUSY_MESSAGE) {
  if (inFlightKeys.has(key)) return fail(res, req, 409, busyMessage);
  inFlightKeys.add(key);
  try {
    return await fn();
  } finally {
    inFlightKeys.delete(key);
  }
}

// Leak-safe error responders (see logger.js). `fail` is for intentional client
// errors — our own 4xx/409 messages are safe to return verbatim. `sendError`
// wraps route catch tails: a <500 keeps its intentional message, a 500 is
// logged and answered with a generic fallback so internal error text never
// reaches the client. Both attach the request id; neither double-sends.
function fail(res, req, status, message) {
  const code = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  return res.status(code).json({ error: message, requestId: req && req.id });
}

function sendError(res, req, error, fallbackMessage) {
  if (res.headersSent) return;
  const status = resolveStatus(error);
  if (status < 500) {
    return res.status(status).json({ error: error.message, requestId: req && req.id });
  }
  logError(req, error);
  return res.status(500).json({ error: fallbackMessage, requestId: req && req.id });
}

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

// Every route body runs inside this: anything it throws (an unknown session's
// 404, a validator's 400, a failed AI call) goes out through sendError.
const handle =
  (fn, fallbackMessage = "Something went wrong.") =>
  async (req, res) => {
    try {
      return await fn(req, res, req.body || {});
    } catch (error) {
      return sendError(res, req, error, fallbackMessage);
    }
  };

const STEP_ERRORS = {
  big_five: "Not currently in the Big Five step.",
  riasec: "Not currently in the RIASEC step.",
  values: "Not currently in the values step.",
  cv: "Not currently in the CV step.",
  tree: "Complete the assessment before this step.",
};

function assertStep(session, step) {
  if (session.step !== step) throw httpError(400, STEP_ERRORS[step]);
}

// The body's session, which must sit on `step`.
function sessionAt(body, step) {
  const session = store.require(body.sessionId);
  assertStep(session, step);
  return session;
}

// A single-flight route. The session is required BEFORE locking so a missing
// or unknown id 404s rather than sharing an `undefined:<op>` bucket.
function lockedRoute(op, fn, fallbackMessage, busyMessage) {
  return handle(async (req, res, body) => {
    const session = store.require(body.sessionId);
    return withLock(req, res, `${session.id}:${op}`, () => fn(req, res, session, body), busyMessage);
  }, fallbackMessage);
}

function sendSessionSnapshot(res, session, { includeStatic = false } = {}) {
  const progress = buildProgress(session);
  const summary = summarizeAnswersForClient(session);

  return res.json({
    ...store.serializeSessionState(session, progress, summary, { includeStatic }),
    // Lets the UI say honestly when suggestions come from fixed fallback
    // rules rather than AI (no key configured).
    aiEnabled: AI_ENABLED,
    // What the file input should accept — depends on markitdown availability.
    cvUploadFormats,
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    sessionStore: store.redis ? "redis" : "memory",
    // Snapshot grounding + live-client liveness. getStatus() is cached
    // in-process state (no request, no key) — it is what tells a wrong
    // ONET_API_KEY (liveKey true, lastLookupOk false) from no key at all.
    onet: {
      snapshotVersion: SNAPSHOT_VERSION,
      occupations: SNAPSHOT_OCCUPATION_COUNT,
      ...onetApi.getStatus(),
    },
  });
});

app.post("/api/session/start", (req, res) => {
  const { dreamAnswer } = req.body || {};
  // The dream answer is quoted inside every AI prompt — cap it.
  const normalizedDream =
    typeof dreamAnswer === "string" ? dreamAnswer.trim().slice(0, 500) : "";
  if (!normalizedDream) {
    return fail(res, req, 400, "dreamAnswer is required.");
  }
  const session = store.createSession({ dreamAnswer: normalizedDream });
  return sendSessionSnapshot(res, session, { includeStatic: true });
});

app.get(
  "/api/session/:sessionId",
  handle((req, res) =>
    sendSessionSnapshot(res, store.require(req.params.sessionId), { includeStatic: true })
  )
);

app.post(
  "/api/session/demographics",
  handle((req, res, { sessionId, questionId, value }) => {
    const session = store.require(sessionId);
    if (session.step !== "demographics") {
      return fail(res, req, 400, "Session is past the demographics step.");
    }
    store.setDemographicAnswer(session, questionId, validateDemographicAnswer(questionId, value));
    if (DEMOGRAPHIC_QUESTIONS.every((q) => session.demographics[q.id] !== undefined)) {
      store.advanceStep(session, "big_five");
    }
    return sendSessionSnapshot(res, session);
  })
);

app.post(
  "/api/big-five/answer",
  handle((req, res, body) => {
    const session = sessionAt(body, "big_five");
    const { itemId, value } = body;
    store.recordBigFiveAnswer(session, itemId, validateBigFiveAnswer(session, itemId, value));
    if (session.bigFiveItems.every((i) => session.bigFiveAnswers[i.id] !== undefined)) {
      const scores = computeBigFiveScores(session);
      store.setBigFiveScores(session, scores, deriveBigFiveTraits(scores));
      store.advanceStep(session, "riasec");
    }
    return sendSessionSnapshot(res, session);
  })
);

app.post(
  "/api/riasec/start",
  handle((req, res, body) => {
    const session = sessionAt(body, "riasec");
    if (!session.riasecItems.length) {
      store.setRiasecItems(session, getStaticRiasecItems());
    }
    // riasecItems just changed — one of the static-list snapshots.
    return sendSessionSnapshot(res, session, { includeStatic: true });
  })
);

app.post(
  "/api/riasec/answer",
  handle((req, res, body) => {
    const session = sessionAt(body, "riasec");
    const { itemId, value } = body;
    store.recordRiasecAnswer(session, itemId, validateRiasecAnswer(session, itemId, value));
    const { scores } = computeRiasecScores(session);
    if (scores) {
      store.setRiasecScores(session, scores, deriveRiasecCode(scores));
      store.advanceStep(session, "values");
    }
    return sendSessionSnapshot(res, session);
  })
);

app.post(
  "/api/riasec/skip",
  handle(async (req, res, body) => {
    const session = sessionAt(body, "riasec");
    const scores = await aiEngine.inferRiasecProfile({ session });
    store.setRiasecScores(session, scores, deriveRiasecCode(scores), { inferred: true });
    store.advanceStep(session, "values");
    return sendSessionSnapshot(res, session);
  }, "Failed to estimate your interests.")
);

// --- Work-values tournament (adaptive pairwise comparison) -----------------

app.post(
  "/api/values/start",
  handle((req, res, body) => {
    const session = sessionAt(body, "values");
    if (!session.valuesTournament) {
      store.setValuesTournament(session, startTournament(WORK_VALUES_ORDER));
    }
    return sendSessionSnapshot(res, session);
  })
);

app.post(
  "/api/values/answer",
  handle((req, res, body) => {
    const session = sessionAt(body, "values");
    if (!session.valuesTournament) {
      return fail(res, req, 400, "Tournament has not started.");
    }
    const { comparisonId, winner } = body;
    const result = recordAnswer(session.valuesTournament, { comparisonId, winner });
    // Stale/duplicate answers are a no-op: the snapshot is the single source of
    // truth, so returning current state lets the client reconcile silently.
    if (result.ok) store.setValuesTournament(session, result.state);
    return sendSessionSnapshot(res, session);
  })
);

app.post(
  "/api/values/confirm",
  handle((req, res, { sessionId, order }) => {
    const session = store.require(sessionId);
    if (session.step !== "values") {
      // Idempotent: a double-submit after advancing just returns the snapshot.
      if (session.userValues) return sendSessionSnapshot(res, session);
      return fail(res, req, 400, "Not currently in the values step.");
    }
    // First pass: the finished tournament supplies both the guard and the
    // fallback order. Revisit (rail navigation back to this step): the
    // tournament is gone — finalizeValues clears it — so the already-confirmed
    // hierarchy is what authorizes the edit, and the submitted order must stand
    // on its own because there is nothing to fall back to.
    const tournamentOrder = session.valuesTournament
      ? finalOrder(session.valuesTournament)
      : null;
    if (!tournamentOrder && !session.userValues) {
      return fail(res, req, 400, "Finish the comparisons before confirming.");
    }

    const requested = Array.isArray(order) ? order : tournamentOrder;
    const validPermutation =
      Array.isArray(requested) &&
      requested.length === WORK_VALUES_ORDER.length &&
      WORK_VALUES_ORDER.every((k) => requested.includes(k));
    if (!validPermutation && !tournamentOrder) {
      return fail(res, req, 400, "A full ordering of the six values is required.");
    }
    const finalHierarchy = validPermutation ? requested : tournamentOrder;
    store.finalizeValues(session, {
      order: finalHierarchy,
      scores: rankToWorkValueScores(finalHierarchy),
      curveVersion: WORK_VALUE_CURVE_VERSION,
      nextStep: "cv",
    });
    return sendSessionSnapshot(res, session);
  })
);

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// The "where should we start from" choice, made on the CV slide. Re-selection
// while still on the cv step is allowed; not an AI route.
app.post(
  "/api/cv/intent",
  handle((req, res, body) => {
    const session = sessionAt(body, "cv");
    if (body.cvIntent !== "new" && body.cvIntent !== "use_skills") {
      return fail(res, req, 400, "cvIntent must be 'new' or 'use_skills'.");
    }
    store.setCvIntent(session, body.cvIntent);
    return sendSessionSnapshot(res, session);
  })
);

// Both CV completions share the `cv` lock, so a double-submit can't double the
// AI spend or advance twice. Completing either path generates the persona shown
// on the summary screen.
function cvRoute(fn, fallbackMessage) {
  return lockedRoute(
    "cv",
    (req, res, session, body) => {
      assertStep(session, "cv");
      if (!session.cvIntent) throw httpError(400, "Choose where to start (cvIntent) first.");
      return fn(req, res, session, body);
    },
    fallbackMessage
  );
}

app.post(
  "/api/cv",
  cvUpload.single("file"),
  cvRoute(async (req, res, session, body) => {
    const rawText = req.file
      ? await extractCvText(req.file)
      : typeof body.cvText === "string"
        ? body.cvText
        : "";
    const cvText = rawText.trim().slice(0, 6000);
    if (!cvText) {
      return fail(res, req, 400, "Provide cvText or upload a supported file (.pdf/.docx/.pptx/.html/.txt).");
    }
    store.setCvAnalysis(session, cvText, await aiEngine.analyzeCV({ cvText }));
    store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
    store.advanceStep(session, "summary");
    return sendSessionSnapshot(res, session);
  }, "Failed to analyse the CV.")
);

app.post(
  "/api/cv/journey",
  cvRoute(async (req, res, session, { questionId, value }) => {
    store.recordCareerJourneyAnswer(
      session,
      questionId,
      validateCareerJourneyAnswer(questionId, value)
    );
    if (CAREER_JOURNEY_QUESTIONS.every((q) => session.careerJourneyAnswers[q.id] !== undefined)) {
      store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
      store.advanceStep(session, "summary");
    }
    return sendSessionSnapshot(res, session);
  })
);

// The character-conclusion screen. Nothing to generate (persona was produced at
// cv completion); acknowledging it advances to the Life Path Engine.
app.post(
  "/api/summary/continue",
  handle((req, res, { sessionId }) => {
    const session = store.require(sessionId);
    // Idempotent: a re-submit after advancing just returns the snapshot.
    if (session.step === "tree") return sendSessionSnapshot(res, session);
    if (session.step !== "summary") {
      return fail(res, req, 400, "Not currently in the summary step.");
    }
    store.advanceStep(session, "tree");
    return sendSessionSnapshot(res, session);
  })
);

// Rail navigation: move between steps the user has already reached. Ungated on
// purpose — the furthestStep check means it can never skip unanswered work, so
// it exposes nothing a user could not reach by answering. It writes only
// session.step: answers, scores, and outputs are left exactly as they are.
app.post(
  "/api/session/goto",
  handle((req, res, { sessionId, step }) => {
    const session = store.require(sessionId);
    if (!STEP_ORDER.includes(step)) {
      return fail(res, req, 400, "Unknown step.");
    }
    const furthest = session.furthestStep || session.step;
    if (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(furthest)) {
      return fail(res, req, 400, "You haven't reached that step yet.");
    }
    store.gotoStep(session, step);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  })
);

// --- Dev tools -------------------------------------------------------------
// Stage switcher for manual testing: seeds a session forward to any step so a
// late screen is reachable without answering the whole assessment.
//
// Gated twice. Without DEV_TOOLS_TOKEN the route is never registered, so the
// production deploy does not carry it unless it is deliberately switched on. A
// wrong token falls through to the default 404 rather than answering 403 — a
// 403 would confirm the route is there.
const DEV_TOOLS_TOKEN = process.env.DEV_TOOLS_TOKEN;

function devTokenMatches(provided) {
  if (typeof provided !== "string" || !provided) return false;
  // Hash both sides first: equal-length buffers, so neither the token's length
  // nor its prefix leaks through comparison timing.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(DEV_TOOLS_TOKEN).digest();
  return timingSafeEqual(a, b);
}

if (DEV_TOOLS_TOKEN) {
  app.post("/api/dev/jump", async (req, res, next) => {
    // next() falls through to Express's default 404, so a wrong token produces
    // byte-for-byte the same response as a path that was never mounted.
    if (!devTokenMatches(req.get("x-dev-token"))) return next();

    const { sessionId, step } = req.body || {};
    if (!STEP_ORDER.includes(step)) {
      return fail(res, req, 400, "Unknown step.");
    }

    // An expired or unknown id must not 404: the point of the tool is to land
    // on a working screen, so fall through to a fresh session instead.
    const existing = sessionId ? store.get(sessionId) : null;
    const behind = existing && STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(existing.step);
    const session =
      existing && !behind
        ? existing
        : store.createSession({
            dreamAnswer: existing ? existing.dreamAnswer : DEV_PROFILE.dreamAnswer,
          });

    try {
      return await withLock(req, res, `${session.id}:dev`, async () => {
        await seedTo(session, step, { store, aiEngine });
        return sendSessionSnapshot(res, session, { includeStatic: true });
      });
    } catch (error) {
      return sendError(res, req, error, "Could not seed the session.");
    }
  });

  console.warn(
    "[dev-tools] DEV_TOOLS_TOKEN is set — POST /api/dev/jump is live. Unset it to remove the route."
  );
}

// The real-occupation card for one output: snapshot facts always, live US
// salary/outlook only when the O*NET key answered. Null when the output was
// never pinned to a SOC (snapshot missing).
function buildOnetBlock(socCode, extras) {
  const occupation = socCode ? getOccupation(socCode) : null;
  if (!occupation) return null;
  return {
    soc: occupation.soc,
    jobZone: occupation.jobZone,
    jobZoneLabel: JOB_ZONE_LABELS[occupation.jobZone] || null,
    skills: occupation.skills,
    tech: occupation.tech,
    related: getRelated(occupation.soc),
    usMarket: true,
    attribution: ONET_ATTRIBUTION,
    ...(extras?.salary ? { salary: extras.salary } : {}),
    ...(extras?.outlook ? { outlook: extras.outlook } : {}),
  };
}

// The single place an output is assembled: the profession's work values
// (measured O*NET values for the chosen SOC, else the per-direction prototype
// for the ~40 occupations without them and any keyless job — the AI never
// scores values), its top three, the fit against the user's confirmed
// hierarchy, the O*NET card, and the traceable whyThisFits explanation.
async function buildOutput(session, excludeDirectionIds) {
  const raw = await aiEngine.generateFirstOutput({ session, excludeDirectionIds });
  const onetExtras = await onetApi.fetchCareerExtras(raw.socCode);
  const workValues =
    (raw.socCode && getOccupation(raw.socCode)?.workValues) ||
    buildFallbackProfessionValues(raw.directionId);
  const output = {
    ...raw,
    workValues,
    topValues: deriveTopValues(workValues),
    valuesFit: session.userValues ? valuesFit(session.userValues.scores, workValues) : null,
    onet: buildOnetBlock(raw.socCode, onetExtras),
    accepted: null,
    detail: null,
  };
  output.whyThisFits = await aiEngine.generateWhyThisFits({ session, output });
  return output;
}

// The output loop runs only after the assessment, under one `output` lock so
// first/refine/accept can never interleave.
function outputRoute(fn, fallbackMessage) {
  return lockedRoute(
    "output",
    (req, res, session, body) => {
      assertStep(session, "tree");
      return fn(req, res, session, body);
    },
    fallbackMessage
  );
}

// The output the Yes/No acts on — refused once an output is accepted.
function pendingOutput(session, outputId) {
  if (session.acceptedOutputId) throw httpError(400, "An output is already accepted.");
  const output = session.outputs.find((o) => o.id === outputId);
  if (!output) throw httpError(400, "Unknown output.");
  return output;
}

app.post(
  "/api/output/first",
  outputRoute(async (req, res, session) => {
    if (!session.outputs.length) {
      store.appendOutput(session, await buildOutput(session, []));
    }
    return sendSessionSnapshot(res, session);
  }, "Failed to generate your first output.")
);

app.post(
  "/api/output/refine",
  outputRoute(async (req, res, session, { outputId }) => {
    pendingOutput(session, outputId);
    // Refining means "this one is not for me": regenerate from a genuinely
    // different field family, excluding every family already shown.
    const used = session.outputs.map((o) => o.directionId).filter(Boolean);
    const appended = store.appendOutput(session, await buildOutput(session, used));
    store.recordRefinement(session, {
      fromOutputId: outputId,
      notSuitable: true,
      toOutputId: appended.id,
    });
    return sendSessionSnapshot(res, session);
  }, "Failed to regenerate the output.")
);

app.post(
  "/api/output/accept",
  outputRoute(async (req, res, session, { outputId }) => {
    const output = pendingOutput(session, outputId);
    const detail = await aiEngine.generateOutputDetail({ session, output });
    store.acceptOutput(session, outputId, detail);
    return sendSessionSnapshot(res, session);
  }, "Failed to build the advice blocks.")
);

app.post(
  "/api/roadmap/generate",
  lockedRoute(
    "roadmap",
    async (req, res, session, { outputId }) => {
      if (!session.acceptedOutputId || session.acceptedOutputId !== outputId) {
        return fail(res, req, 400, "Accept this output before building its roadmap.");
      }
      if (!session.roadmaps[outputId]) {
        const output = session.outputs.find((o) => o.id === outputId);
        store.setRoadmap(session, await aiEngine.generateRoadmap({ session, output }));
      }
      return sendSessionSnapshot(res, session);
    },
    "Failed to generate roadmap.",
    "The roadmap for this output is still building."
  )
);

// --- Frontend --------------------------------------------------------------
// Single-service deploy: when the Vite build is present, this process also
// serves the SPA, so the browser talks to one origin. Without a build (local
// dev on Vite, most tests) nothing is mounted. /api never reaches the SPA
// fallback: an unknown API path must keep Express's default 404, which the dev
// gate's indistinguishability depends on.
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, "../frontend/dist");
const FRONTEND_INDEX = path.join(FRONTEND_DIST, "index.html");

if (fs.existsSync(FRONTEND_INDEX)) {
  app.use(
    express.static(FRONTEND_DIST, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so those never change.
        const hashed = filePath.startsWith(path.join(FRONTEND_DIST, "assets") + path.sep);
        res.setHeader(
          "Cache-Control",
          hashed ? "public, max-age=31536000, immutable" : "no-cache"
        );
      },
    })
  );
  // Extensionless non-API paths get the app shell; a missing file with an
  // extension (a stale /assets/*.js) stays a real 404 instead of HTML.
  app.get(/^(?!\/api(?:\/|$))[^.]*$/, (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(FRONTEND_INDEX);
  });
}

// Multer failures (size cap, malformed multipart) are user errors, not 500s.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return fail(res, req, 400, "File too large (max 5 MB) or malformed upload.");
  }
  return next(error);
});

// Final error middleware — catches framework errors that never reach a route
// catch block (express.json parse/size failures, any stray next(error)). Keeps
// the leak-safe contract: a body-parse error is a generic 400/413, anything
// else a generic logged 500, always with the request id.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = resolveStatus(error);
  const isBodyParse =
    error && (error.type === "entity.parse.failed" || error instanceof SyntaxError);
  if (status === 413 || error?.type === "entity.too.large") {
    return fail(res, req, 413, "Request body too large.");
  }
  if (isBodyParse) {
    return fail(res, req, 400, "Malformed JSON body.");
  }
  return sendError(res, req, error, "Something went wrong.");
});

if (require.main === module) {
  // Restore durable sessions before accepting traffic; a failing store degrades
  // to in-memory rather than blocking startup.
  store
    .hydrate()
    .then((n) => {
      if (n) console.log(`Restored ${n} session(s) from the durable store.`);
    })
    .catch((error) => console.error("[hydrate]", error.message))
    .finally(() => {
      app.listen(PORT, () => {
        console.log(`Working Name API listening on http://localhost:${PORT}`);
        console.log(
          `Session store: single-instance in-memory Map (${
            store.redis ? "Redis durability mirror on" : "no Redis — sessions lost on restart"
          }).`
        );
        // The Map, single-flight lock, and rate-limit counters are all
        // process-local: more than one instance would 404 sessions across
        // processes. We can't prevent a scaling config, but we fail loud on the
        // usual multi-process signal so it can't slip by unnoticed.
        const concurrency = Number(process.env.WEB_CONCURRENCY);
        if (Number.isFinite(concurrency) && concurrency > 1) {
          console.error(
            `[single-instance] WEB_CONCURRENCY=${concurrency} — this backend keeps sessions in a process-local Map and MUST run exactly one instance. Requests will 404 sessions across processes until sessions/locks move to a shared store.`
          );
        }
      });
    });
}

// `store` and `__locks` are exported for tests only (there is no other
// consumer): a test can monkeypatch `store.require` to force a 500 or seed a
// lock key to exercise the single-flight 409 path. Not part of the app's API.
module.exports = { app, store, __locks: inFlightKeys };
