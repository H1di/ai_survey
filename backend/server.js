const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { extractCvText } = require("./cvExtract");
const { createAiEngine } = require("./aiEngine");
const {
  DEMOGRAPHIC_QUESTIONS,
  CAREER_JOURNEY_QUESTIONS,
  JOB_CHAR_PARAM_IDS,
} = require("./questionPool");
const {
  deriveHigherOrder,
  deriveAxes,
  deriveTopValues,
  dominantPole,
  valuesFit,
} = require("./schwartzValues");
const {
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateJobCharRanking,
  validateJobCharAnswer,
  computeJobCharProfile,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  buildProgress,
  summarizeAnswersForClient,
} = require("./questionEngine");
const { SessionStore } = require("./sessionStore");
const { createRedisClient } = require("./redisClient");

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

const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173"];

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
  "/api/riasec/start",
  "/api/riasec/skip",
  "/api/job-characteristics/rank",
  "/api/cv",
  "/api/output/first",
  "/api/output/refine",
  "/api/output/accept",
  "/api/roadmap/generate",
]) {
  app.use(path, aiLimiter);
}

function isValidEntryChoice(value) {
  return value === "change" || value === "find";
}

const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY);

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

function sendSessionSnapshot(res, session, { includeStatic = false } = {}) {
  const progress = buildProgress(session);
  const summary = summarizeAnswersForClient(session);

  return res.json({
    ...store.serializeSessionState(session, progress, summary, { includeStatic }),
    // Lets the UI say honestly when suggestions come from fixed fallback
    // rules rather than AI (no key configured).
    aiEnabled: AI_ENABLED,
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
  const { entryChoice, dreamAnswer, cvIntent } = req.body || {};

  if (!isValidEntryChoice(entryChoice)) {
    return res.status(400).json({ error: "entryChoice must be 'change' or 'find'." });
  }
  if (cvIntent !== "new" && cvIntent !== "use_skills") {
    return res.status(400).json({ error: "cvIntent must be 'new' or 'use_skills'." });
  }

  // Capped like feedbackText: the dream is quoted inside every AI prompt.
  const normalizedDream =
    typeof dreamAnswer === "string" ? dreamAnswer.trim().slice(0, 500) : "";

  if (!normalizedDream) {
    return res.status(400).json({ error: "dreamAnswer is required." });
  }

  const session = store.createSession({
    entryChoice,
    dreamAnswer: normalizedDream,
    cvIntent,
  });

  return sendSessionSnapshot(res, session, { includeStatic: true });
});

app.get("/api/session/:sessionId", (req, res) => {
  try {
    const session = store.require(req.params.sessionId);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/session/demographics", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "demographics") {
      return res.status(400).json({ error: "Session is past the demographics step." });
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
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/big-five/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "big_five") {
      return res.status(400).json({ error: "Not currently in the Big Five step." });
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
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/riasec/start", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    if (!session.riasecItems.length) {
      const items = await aiEngine.generateRiasecItems({ depth: session.bigFiveDepth });
      store.setRiasecItems(session, items);
    }
    // riasecItems just changed — one of the static-list snapshots.
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    if (!error.statusCode) console.error("[riasec/start]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to start the interests quiz." });
  }
});

app.post("/api/riasec/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    const normalized = validateRiasecAnswer(session, itemId, value);
    store.recordRiasecAnswer(session, itemId, normalized);

    const { scores } = computeRiasecScores(session);
    if (scores) {
      store.setRiasecScores(session, scores, deriveRiasecCode(scores));
      store.advanceStep(session, "job_characteristics");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/riasec/skip", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "riasec") {
      return res.status(400).json({ error: "Not currently in the RIASEC step." });
    }
    const scores = await aiEngine.inferRiasecProfile({ session });
    store.setRiasecScores(session, scores, deriveRiasecCode(scores), { inferred: true });
    store.advanceStep(session, "job_characteristics");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[riasec/skip]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to estimate your interests." });
  }
});

app.post("/api/job-characteristics/rank", async (req, res) => {
  try {
    const { sessionId, ranking, depth } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "job_characteristics") {
      return res.status(400).json({ error: "Not currently in the job-characteristics step." });
    }
    if (session.jobCharItems.length) {
      return res.status(400).json({ error: "Ranking already submitted." });
    }
    if (depth !== 5 && depth !== 10) {
      return res.status(400).json({ error: "depth must be 5 or 10." });
    }
    const validRanking = validateJobCharRanking(ranking);
    const items = await aiEngine.generateJobCharQuestions({ session, ranking: validRanking, count: depth });
    store.setJobCharRanking(session, validRanking, depth, items);
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    if (!error.statusCode) console.error("[job-characteristics/rank]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to build your priority questions." });
  }
});

app.post("/api/job-characteristics/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "job_characteristics") {
      return res.status(400).json({ error: "Not currently in the job-characteristics step." });
    }
    const normalized = validateJobCharAnswer(session, itemId, value);
    store.recordJobCharAnswer(session, itemId, normalized);

    const { profile } = computeJobCharProfile(session);
    if (profile) {
      store.setJobCharProfile(session, profile);
      store.advanceStep(session, "cv");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

app.post("/api/cv", cvUpload.single("file"), async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return res.status(400).json({ error: "Not currently in the CV step." });
    }
    let rawText = typeof req.body.cvText === "string" ? req.body.cvText : "";
    if (req.file) {
      rawText = await extractCvText(req.file);
    }
    const cvText = rawText.trim().slice(0, 6000);
    if (!cvText) {
      return res.status(400).json({ error: "Provide cvText or upload a .pdf/.docx/.txt file." });
    }
    const analysis = await aiEngine.analyzeCV({ cvText });
    store.setCvAnalysis(session, cvText, analysis);
    // The Schwartz user vector must exist before the graph renders.
    const userValues = await aiEngine.inferUserValues({ session });
    store.setUserValues(session, userValues);
    store.advanceStep(session, "tree");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[cv]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to analyse the CV." });
  }
});

app.post("/api/cv/journey", async (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "cv") {
      return res.status(400).json({ error: "Not currently in the CV step." });
    }
    const normalized = validateCareerJourneyAnswer(questionId, value);
    store.recordCareerJourneyAnswer(session, questionId, normalized);

    const allAnswered = CAREER_JOURNEY_QUESTIONS.every(
      (q) => session.careerJourneyAnswers[q.id] !== undefined
    );
    if (allAnswered) {
      // The Schwartz user vector must exist before the graph renders.
      const userValues = await aiEngine.inferUserValues({ session });
      store.setUserValues(session, userValues);
      store.advanceStep(session, "tree");
    }
    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

function requireCompletedAssessment(session) {
  if (session.step !== "tree") {
    const error = new Error("Complete the assessment before this step.");
    error.statusCode = 400;
    throw error;
  }
}

// The single place output aggregates are computed: Schwartz-score the raw
// output, derive poles/axes/top values, and measure fit against the user's
// inferred value vector. The AI never outputs these numbers.
async function buildScoredOutput(session, rawOutput) {
  const { schwartzValues, valuesRationale } = await aiEngine.scoreProfessionValues({
    jobTitle: rawOutput.jobTitle,
    orientedField: rawOutput.orientedField,
    thesis: rawOutput.thesis,
    directionId: rawOutput.directionId,
    jobCharProfile: session.jobCharProfile,
  });
  const higherOrder = deriveHigherOrder(schwartzValues);
  return {
    ...rawOutput,
    schwartzValues,
    valuesRationale,
    higherOrder,
    axes: deriveAxes(higherOrder),
    dominantPole: dominantPole(higherOrder),
    topValues: deriveTopValues(schwartzValues),
    valuesFit: session.userValues
      ? valuesFit(session.userValues.scores, schwartzValues)
      : null,
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
    return res.status(409).json({ error: "Another change to this path is still processing." });
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.outputs.length) {
      const raw = await aiEngine.generateFirstOutput({ session, excludeDirectionIds: [] });
      const scored = await buildScoredOutput(session, raw);
      store.appendOutput(session, scored);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[output/first]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to generate your first output." });
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/output/refine", async (req, res) => {
  const { sessionId, outputId, notSuitable, changes } = req.body || {};
  const lockKey = `${sessionId}:output`;
  if (!acquireLock(lockKey)) {
    return res.status(409).json({ error: "Another change to this path is still processing." });
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.acceptedOutputId) {
      return res.status(400).json({ error: "An output is already accepted." });
    }
    const previous = session.outputs.find((o) => o.id === outputId);
    if (!previous) {
      return res.status(400).json({ error: "Unknown output." });
    }

    if (notSuitable && changes !== undefined) {
      return res.status(400).json({
        error: "Provide either notSuitable: true or parameter changes — not both.",
      });
    }
    const normalizedChanges = notSuitable ? null : validateRefineChanges(changes);
    if (!notSuitable && !normalizedChanges) {
      return res.status(400).json({
        error: "Provide either notSuitable: true or 1-7 valid parameter changes.",
      });
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
    const appended = store.appendOutput(session, scored);
    store.recordRefinement(session, {
      fromOutputId: outputId,
      notSuitable: Boolean(notSuitable),
      changedParams: normalizedChanges || [],
      toOutputId: appended.id,
    });

    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[output/refine]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to regenerate the output." });
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/output/accept", async (req, res) => {
  const { sessionId, outputId } = req.body || {};
  const lockKey = `${sessionId}:output`;
  if (!acquireLock(lockKey)) {
    return res.status(409).json({ error: "Another change to this path is still processing." });
  }
  try {
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.acceptedOutputId) {
      return res.status(400).json({ error: "An output is already accepted." });
    }
    const output = session.outputs.find((o) => o.id === outputId);
    if (!output) {
      return res.status(400).json({ error: "Unknown output." });
    }

    const detail = await aiEngine.generateOutputDetail({ session, output });
    store.acceptOutput(session, outputId, detail);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[output/accept]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to build the advice blocks." });
  } finally {
    releaseLock(lockKey);
  }
});

app.post("/api/roadmap/generate", async (req, res) => {
  const { sessionId, outputId } = req.body || {};
  const lockKey = `${sessionId}:roadmap`;
  if (!acquireLock(lockKey)) {
    return res.status(409).json({ error: "The roadmap for this output is still building." });
  }
  try {
    const session = store.require(sessionId);

    if (!session.acceptedOutputId || session.acceptedOutputId !== outputId) {
      return res.status(400).json({ error: "Accept this output before building its roadmap." });
    }
    const output = session.outputs.find((o) => o.id === outputId);

    if (!session.roadmaps[outputId]) {
      const roadmap = await aiEngine.generateRoadmap({ session, output });
      store.setRoadmap(session, roadmap);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[roadmap/generate]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to generate roadmap." });
  } finally {
    releaseLock(lockKey);
  }
});

// Multer failures (size cap, malformed multipart) are user errors, not 500s.
app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: "File too large (max 2 MB) or malformed upload." });
  }
  return next(error);
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
      });
    });
}

module.exports = { app };
