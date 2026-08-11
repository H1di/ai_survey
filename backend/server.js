const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { extractCvText, getCvUploadExtensions } = require("./cvExtract");
const { createAiEngine } = require("./aiEngine");
const { getStaticRiasecItems } = require("./riasecItems");
const {
  DEMOGRAPHIC_QUESTIONS,
  CAREER_JOURNEY_QUESTIONS,
  JOB_CHAR_PARAM_IDS,
} = require("./questionPool");
const {
  deriveTopValues,
  valuesFit,
  buildFallbackProfessionValues,
  rankToWorkValueScores,
  WORK_VALUE_CURVE_VERSION,
  WORK_VALUES_ORDER,
} = require("./workValues");
const {
  startTournament,
  nextComparison,
  finalOrder,
  recordAnswer,
} = require("./valuesTournament");
const {
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateJobCharRanking,
  rankToJobCharTargets,
  JOB_CHAR_CURVE_VERSION,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  buildProgress,
  summarizeAnswersForClient,
} = require("./questionEngine");
const { SessionStore, STEP_ORDER } = require("./sessionStore");
const { DEV_PROFILE, seedTo } = require("./devSeed");
const { createRedisClient } = require("./redisClient");
const { getOccupation, getRelated, JOB_ZONE_LABELS, ONET_ATTRIBUTION } = require("./onet");
const { createOnetApi } = require("./services/onetApi");
const { randomUUID, createHash, timingSafeEqual } = require("node:crypto");
const { logError, resolveStatus } = require("./logger");

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
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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

// Single-flight guard for the AI-heavy output routes. A double-submit or a
// retry-after-timeout on the same session+operation would otherwise race past
// the pre-await state checks and create a duplicate output or double the
// OpenAI spend; a second concurrent call for the same key gets 409 instead.
const inFlightKeys = new Set();
function acquireLock(key) {
  if (inFlightKeys.has(key)) return false;
  inFlightKeys.add(key);
  return true;
}
function releaseLock(key) {
  inFlightKeys.delete(key);
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

app.get("/api/session/:sessionId", (req, res) => {
  try {
    const session = store.require(req.params.sessionId);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/session/demographics", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "demographics") {
      return fail(res, req, 400, "Session is past the demographics step.");
    }

    const normalized = validateDemographicAnswer(questionId, value);
    store.setDemographicAnswer(session, questionId, normalized);

    const allAnswered = DEMOGRAPHIC_QUESTIONS.every(
      (q) => session.demographics[q.id] !== undefined
    );
    if (allAnswered) {
      store.advanceStep(session, "big_five");
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/big-five/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "big_five") {
      return fail(res, req, 400, "Not currently in the Big Five step.");
    }

    const normalized = validateBigFiveAnswer(session, itemId, value);
    store.recordBigFiveAnswer(session, itemId, normalized);

    const allAnswered = session.bigFiveItems.every(
      (i) => session.bigFiveAnswers[i.id] !== undefined
    );
    if (allAnswered) {
      const scores = computeBigFiveScores(session);
      const derived = deriveBigFiveTraits(scores);
      store.setBigFiveScores(session, scores, derived);
      store.advanceStep(session, "riasec");
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/riasec/start", (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return fail(res, req, 400, "Not currently in the RIASEC step.");
    }
    if (!session.riasecItems.length) {
      store.setRiasecItems(session, getStaticRiasecItems());
    }
    // riasecItems just changed — one of the static-list snapshots.
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/riasec/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return fail(res, req, 400, "Not currently in the RIASEC step.");
    }
    const normalized = validateRiasecAnswer(session, itemId, value);
    store.recordRiasecAnswer(session, itemId, normalized);

    const { scores } = computeRiasecScores(session);
    if (scores) {
      store.setRiasecScores(session, scores, deriveRiasecCode(scores));
      store.advanceStep(session, "values");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/riasec/skip", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return fail(res, req, 400, "Not currently in the RIASEC step.");
    }
    const scores = await aiEngine.inferRiasecProfile({ session });
    store.setRiasecScores(session, scores, deriveRiasecCode(scores), { inferred: true });
    store.advanceStep(session, "values");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to estimate your interests.");
  }
});

// --- Work-values tournament (adaptive pairwise comparison) -----------------

app.post("/api/values/start", (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "values") {
      return fail(res, req, 400, "Not currently in the values step.");
    }
    if (!session.valuesTournament) {
      store.setValuesTournament(session, startTournament(WORK_VALUES_ORDER));
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/values/answer", (req, res) => {
  try {
    const { sessionId, comparisonId, winner } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "values") {
      return fail(res, req, 400, "Not currently in the values step.");
    }
    if (!session.valuesTournament) {
      return fail(res, req, 400, "Tournament has not started.");
    }
    const result = recordAnswer(session.valuesTournament, { comparisonId, winner });
    // Stale/duplicate answers are a no-op: the snapshot is the single source of
    // truth, so returning current state lets the client reconcile silently.
    if (result.ok) store.setValuesTournament(session, result.state);
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/values/confirm", (req, res) => {
  try {
    const { sessionId, order } = req.body || {};
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
    const revisiting = Boolean(session.userValues);
    if (!tournamentOrder && !revisiting) {
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
      nextStep: "job_characteristics",
    });
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

// The whole job-characteristics step: the user orders the 7 parameters and a
// fixed rank->target curve turns that order into the 0-100 profile. No AI, no
// follow-up questions — submitting the ranking completes the step.
app.post("/api/job-characteristics/rank", (req, res) => {
  try {
    const { sessionId, ranking } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "job_characteristics") {
      return fail(res, req, 400, "Not currently in the job-characteristics step.");
    }
    const validRanking = validateJobCharRanking(ranking);
    store.finalizeJobChar(session, {
      ranking: validRanking,
      profile: rankToJobCharTargets(validRanking),
      curveVersion: JOB_CHAR_CURVE_VERSION,
      nextStep: "cv",
    });
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// The "where should we start from" choice, made on the CV slide. Re-selection
// while still on the cv step is allowed; not an AI route.
app.post("/api/cv/intent", (req, res) => {
  try {
    const { sessionId, cvIntent } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return fail(res, req, 400, "Not currently in the CV step.");
    }
    if (cvIntent !== "new" && cvIntent !== "use_skills") {
      return fail(res, req, 400, "cvIntent must be 'new' or 'use_skills'.");
    }
    store.setCvIntent(session, cvIntent);
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

app.post("/api/cv", cvUpload.single("file"), async (req, res) => {
  // Require the session BEFORE locking so a missing/unknown id 404s rather than
  // sharing an `undefined:cv` bucket, then single-flight the completion: a
  // double-submit would otherwise double the AI spend (analyzeCV +
  // generatePersonaSummary) and advance the step twice.
  let session;
  try {
    session = store.require((req.body || {}).sessionId);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
  const lockKey = `${session.id}:cv`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "Another change to this path is still processing.");
  }
  try {
    if (session.step !== "cv") {
      return fail(res, req, 400, "Not currently in the CV step.");
    }
    if (!session.cvIntent) {
      return fail(res, req, 400, "Choose where to start (cvIntent) first.");
    }
    let rawText = typeof req.body.cvText === "string" ? req.body.cvText : "";
    if (req.file) {
      rawText = await extractCvText(req.file);
    }
    const cvText = rawText.trim().slice(0, 6000);
    if (!cvText) {
      return fail(res, req, 400, "Provide cvText or upload a supported file (.pdf/.docx/.pptx/.html/.txt).");
    }
    const analysis = await aiEngine.analyzeCV({ cvText });
    store.setCvAnalysis(session, cvText, analysis);
    // Persona is shown on the summary screen; user values already came from the
    // values step. Advance to the character conclusion, not straight to tree.
    store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
    store.advanceStep(session, "summary");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to analyse the CV.");
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/cv/journey", async (req, res) => {
  const { sessionId, questionId, value } = req.body || {};
  // Require before locking (see /api/cv); single-flight so a double-submit of
  // the final answer can't generate the persona or advance the step twice.
  let session;
  try {
    session = store.require(sessionId);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
  const lockKey = `${session.id}:cv`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "Another change to this path is still processing.");
  }
  try {
    if (session.step !== "cv") {
      return fail(res, req, 400, "Not currently in the CV step.");
    }
    if (!session.cvIntent) {
      return fail(res, req, 400, "Choose where to start (cvIntent) first.");
    }
    const normalized = validateCareerJourneyAnswer(questionId, value);
    store.recordCareerJourneyAnswer(session, questionId, normalized);

    const allAnswered = CAREER_JOURNEY_QUESTIONS.every(
      (q) => session.careerJourneyAnswers[q.id] !== undefined
    );
    if (allAnswered) {
      // Persona shown on the summary screen; user values came from the values
      // step. Advance to the character conclusion, not straight to tree.
      store.setPersonaSummary(session, await aiEngine.generatePersonaSummary({ session }));
      store.advanceStep(session, "summary");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  } finally {
    releaseLock(lockKey);
  }
});

// The character-conclusion screen. Nothing to generate (persona was produced at
// cv completion); acknowledging it advances to the Life Path Engine.
app.post("/api/summary/continue", (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "summary") {
      // Idempotent: a re-submit after advancing just returns the snapshot.
      if (session.step === "tree") return sendSessionSnapshot(res, session);
      return fail(res, req, 400, "Not currently in the summary step.");
    }
    store.advanceStep(session, "tree");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

// Rail navigation: move between steps the user has already reached. Ungated on
// purpose — the furthestStep check means it can never skip unanswered work, so
// it exposes nothing a user could not reach by answering. It writes only
// session.step: answers, scores, and outputs are left exactly as they are.
app.post("/api/session/goto", (req, res) => {
  try {
    const { sessionId, step } = req.body || {};
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
  } catch (error) {
    return sendError(res, req, error, "Something went wrong.");
  }
});

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
    // byte-for-byte the same response as a path that was never mounted. A
    // distinct JSON error here would confirm the route exists.
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

    const lockKey = `${session.id}:dev`;
    if (!acquireLock(lockKey)) {
      return fail(res, req, 409, "Another change to this path is still processing.");
    }
    try {
      await seedTo(session, step, { store, aiEngine });
      return sendSessionSnapshot(res, session, { includeStatic: true });
    } catch (error) {
      return sendError(res, req, error, "Could not seed the session.");
    } finally {
      releaseLock(lockKey);
    }
  });

  console.warn(
    "[dev-tools] DEV_TOOLS_TOKEN is set — POST /api/dev/jump is live. Unset it to remove the route."
  );
}

function requireCompletedAssessment(session) {
  if (session.step !== "tree") {
    const error = new Error("Complete the assessment before this step.");
    error.statusCode = 400;
    throw error;
  }
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

// A profession's work-value profile: measured O*NET snapshot values for the
// chosen SOC win; the per-direction prototype fills the 40 occupations without
// them (and any keyless fallback job). The AI never scores values.
function resolveProfessionWorkValues({ socCode, directionId, jobCharProfile }) {
  const occ = socCode ? getOccupation(socCode) : null;
  if (occ?.workValues) return occ.workValues;
  return buildFallbackProfessionValues(directionId, jobCharProfile);
}

// The single place output value aggregates are computed: resolve the
// profession's work values, its top three, and the fit against the user's
// confirmed hierarchy. The live O*NET lookup rides the same async path.
async function buildScoredOutput(session, rawOutput) {
  const onetExtras = await onetApi.fetchCareerExtras(rawOutput.socCode);
  const workValues = resolveProfessionWorkValues({
    socCode: rawOutput.socCode,
    directionId: rawOutput.directionId,
    jobCharProfile: session.jobCharProfile,
  });
  return {
    ...rawOutput,
    workValues,
    topValues: deriveTopValues(workValues),
    valuesFit: session.userValues
      ? valuesFit(session.userValues.scores, workValues)
      : null,
    onet: buildOnetBlock(rawOutput.socCode, onetExtras),
    accepted: null,
    detail: null,
  };
}

function validateRefineChanges(changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > JOB_CHAR_PARAM_IDS.length) {
    return null;
  }
  const seen = new Set();
  const normalized = [];
  for (const change of changes) {
    const param = change?.param;
    if (!JOB_CHAR_PARAM_IDS.includes(param) || seen.has(param)) return null;
    seen.add(param);
    normalized.push({
      param,
      reason: typeof change.reason === "string" ? change.reason.trim().slice(0, 200) : "",
    });
  }
  return normalized;
}

app.post("/api/output/first", async (req, res) => {
  const { sessionId } = req.body || {};
  const lockKey = `${sessionId}:output`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "Another change to this path is still processing.");
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.outputs.length) {
      const raw = await aiEngine.generateFirstOutput({ session, excludeDirectionIds: [] });
      const scored = await buildScoredOutput(session, raw);
      scored.whyThisFits = await aiEngine.generateWhyThisFits({ session, output: scored });
      store.appendOutput(session, scored);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to generate your first output.");
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/output/refine", async (req, res) => {
  const { sessionId, outputId, notSuitable, changes } = req.body || {};
  const lockKey = `${sessionId}:output`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "Another change to this path is still processing.");
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.acceptedOutputId) {
      return fail(res, req, 400, "An output is already accepted.");
    }
    const previous = session.outputs.find((o) => o.id === outputId);
    if (!previous) {
      return fail(res, req, 400, "Unknown output.");
    }

    if (notSuitable && changes !== undefined) {
      return fail(res, req, 400, "Provide either notSuitable: true or parameter changes — not both.");
    }
    const normalizedChanges = notSuitable ? null : validateRefineChanges(changes);
    if (!notSuitable && !normalizedChanges) {
      return fail(res, req, 400, "Provide either notSuitable: true or 1-7 valid parameter changes.");
    }

    let raw;
    if (notSuitable) {
      // A genuinely different field family: exclude every family already shown.
      const used = session.outputs.map((o) => o.directionId).filter(Boolean);
      raw = await aiEngine.generateFirstOutput({ session, excludeDirectionIds: used });
    } else {
      raw = await aiEngine.refineOutput({ session, previousOutput: previous, changes: normalizedChanges });
    }
    const scored = await buildScoredOutput(session, raw);
    scored.whyThisFits = await aiEngine.generateWhyThisFits({ session, output: scored });
    const appended = store.appendOutput(session, scored);
    store.recordRefinement(session, {
      fromOutputId: outputId,
      notSuitable: Boolean(notSuitable),
      changedParams: normalizedChanges || [],
      toOutputId: appended.id,
    });

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to regenerate the output.");
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/output/accept", async (req, res) => {
  const { sessionId, outputId } = req.body || {};
  const lockKey = `${sessionId}:output`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "Another change to this path is still processing.");
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.acceptedOutputId) {
      return fail(res, req, 400, "An output is already accepted.");
    }
    const output = session.outputs.find((o) => o.id === outputId);
    if (!output) {
      return fail(res, req, 400, "Unknown output.");
    }

    const detail = await aiEngine.generateOutputDetail({ session, output });
    store.acceptOutput(session, outputId, detail);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to build the advice blocks.");
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/roadmap/generate", async (req, res) => {
  const { sessionId, outputId } = req.body || {};
  const lockKey = `${sessionId}:roadmap`;
  if (!acquireLock(lockKey)) {
    return fail(res, req, 409, "The roadmap for this output is still building.");
  }
  try {
    const session = store.require(sessionId);

    if (!session.acceptedOutputId || session.acceptedOutputId !== outputId) {
      return fail(res, req, 400, "Accept this output before building its roadmap.");
    }
    const output = session.outputs.find((o) => o.id === outputId);

    if (!session.roadmaps[outputId]) {
      const roadmap = await aiEngine.generateRoadmap({ session, output });
      store.setRoadmap(session, roadmap);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return sendError(res, req, error, "Failed to generate roadmap.");
  } finally {
    releaseLock(lockKey);
  }
});

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
