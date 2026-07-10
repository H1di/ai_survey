const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { extractCvText } = require("./cvExtract");
const { createAiEngine } = require("./aiEngine");
const { DEMOGRAPHIC_QUESTIONS, CAREER_JOURNEY_QUESTIONS } = require("./questionPool");
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
const { computeDirection, getDirection, REFINE_REASON_VALUES } = require("./directions");
const { SessionStore } = require("./sessionStore");

// Tests set their own env (and force fallback by blanking the key) — skip
// .env entirely so it can't refill a real key underneath them.
if (process.env.NODE_ENV !== "test") {
  // An empty OPENAI_API_KEY inherited from the launching shell would otherwise
  // shadow the real value in .env — dotenv never overrides an already-set var.
  // An empty key is never useful, so drop it and let .env win.
  if (!process.env.OPENAI_API_KEY) delete process.env.OPENAI_API_KEY;
  dotenv.config();
}

const app = express();
const store = new SessionStore();
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
  "/api/session/big-five-depth",
  "/api/riasec/start",
  "/api/riasec/skip",
  "/api/job-characteristics/rank",
  "/api/cv",
  "/api/direction/question",
  "/api/direction/confirm",
  "/api/direction/refine",
  "/api/professions/narrow",
  "/api/roadmap/generate",
]) {
  app.use(path, aiLimiter);
}

function isValidEntryChoice(value) {
  return value === "change" || value === "find";
}

const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY);

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
      store.advanceStep(session, "depth_choice");
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/session/big-five-depth", async (req, res) => {
  try {
    const { sessionId, depth } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "depth_choice") {
      return res
        .status(400)
        .json({ error: "Big Five depth already chosen or not yet available." });
    }
    if (depth !== "short" && depth !== "deep") {
      return res.status(400).json({ error: "depth must be 'short' or 'deep'." });
    }

    const items = await aiEngine.generateBigFiveItems({ depth });
    store.setBigFiveDepthAndItems(session, depth, items);
    store.advanceStep(session, "big_five");

    // bigFiveItems just changed — this is one of the static-list snapshots.
    return sendSessionSnapshot(res, session, { includeStatic: true });
  } catch (error) {
    console.error("[session/big-five-depth]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: "Failed to start Big Five." });
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
    store.advanceStep(session, "tree");
    return sendSessionSnapshot(res, session);
  } catch (error) {
    if (!error.statusCode) console.error("[cv]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to analyse the CV." });
  }
});

app.post("/api/cv/journey", (req, res) => {
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

app.post("/api/direction/question", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.directionQuestions.length) {
      const questions = await aiEngine.generateDirectionQuestions({ session });
      store.setDirectionQuestions(session, questions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/question]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to load direction questions." });
  }
});

app.post("/api/direction/answer", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    const question = session.directionQuestions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(400).json({ error: "Unknown direction question." });
    }
    if (!question.options.some((o) => o.value === value)) {
      return res.status(400).json({ error: "Invalid answer option." });
    }

    store.recordDirectionAnswer(session, questionId, value);

    const allAnswered = session.directionQuestions.every(
      (q) => session.directionAnswers[q.id] !== undefined
    );
    if (allAnswered) {
      const result = computeDirection(session.directionQuestions, session.directionAnswers);
      if (result.tie) {
        // Don't break the tie for the user — expose the candidates and let
        // the frontend ask; /api/direction/choose resolves it.
        store.setDirectionTie(session, result.candidates);
      } else {
        store.setProposedDirection(session, {
          ...result,
          reason: "Your answers across the quiz point most strongly to this direction.",
        });
      }
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/direction/confirm", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (!session.direction) {
      if (!session.proposedDirection) {
        return res.status(400).json({ error: "Answer the direction questions first." });
      }
      store.confirmDirection(session, session.proposedDirection);
    }

    if (!session.narrowingQuestions.length) {
      const questions = await aiEngine.generateNarrowingQuestions({ session });
      store.setNarrowingQuestions(session, questions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/confirm]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to confirm direction." });
  }
});

app.post("/api/direction/refine", async (req, res) => {
  try {
    const { sessionId, reasonChoice, feedbackText } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.direction) {
      return res.status(400).json({ error: "Direction already confirmed." });
    }
    if (!session.proposedDirection) {
      return res.status(400).json({ error: "No proposed direction to refine." });
    }
    if (!REFINE_REASON_VALUES.includes(reasonChoice)) {
      return res.status(400).json({ error: "Invalid reason." });
    }

    const note = {
      reasonChoice,
      feedbackText: typeof feedbackText === "string" ? feedbackText.trim().slice(0, 500) : "",
    };

    store.rejectProposedDirection(session, note);

    const refined = await aiEngine.refineDirection({
      session,
      reasonChoice: note.reasonChoice,
      feedbackText: note.feedbackText,
    });
    store.setProposedDirection(session, refined);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[direction/refine]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to refine direction." });
  }
});

app.post("/api/direction/choose", (req, res) => {
  try {
    const { sessionId, directionId } = req.body || {};
    const session = store.require(sessionId);
    requireCompletedAssessment(session);

    if (session.direction) {
      return res.status(400).json({ error: "Direction already confirmed." });
    }
    const chosen = getDirection(directionId);
    if (!chosen) {
      return res.status(400).json({ error: "Unknown direction." });
    }
    if (session.rejectedDirections.some((d) => d.id === directionId)) {
      return res.status(400).json({ error: "You already rejected this direction." });
    }

    store.setProposedDirection(session, {
      id: chosen.id,
      label: chosen.label,
      reason: "Chosen by you.",
    });

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/professions/narrow", async (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);

    if (!session.direction) {
      return res.status(400).json({ error: "Confirm a direction first." });
    }

    const question = session.narrowingQuestions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(400).json({ error: "Unknown narrowing question." });
    }
    if (!question.options.some((o) => o.value === value)) {
      return res.status(400).json({ error: "Invalid answer option." });
    }

    store.recordNarrowingAnswer(session, questionId, value);

    const allAnswered = session.narrowingQuestions.every(
      (q) => session.narrowingAnswers[q.id] !== undefined
    );
    if (allAnswered && !session.professionOptions.length) {
      const professions = await aiEngine.generateProfessions({ session });
      store.setProfessionOptions(session, professions);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[professions/narrow]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to narrow professions." });
  }
});

app.post("/api/professions/select", (req, res) => {
  try {
    const { sessionId, professionId } = req.body || {};
    const session = store.require(sessionId);

    const profession = session.professionOptions.find((p) => p.id === professionId);
    if (!profession) {
      return res.status(400).json({ error: "Unknown profession." });
    }

    store.selectProfession(session, profession);

    return sendSessionSnapshot(res, session);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/roadmap/generate", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);

    if (!session.selectedProfession) {
      return res.status(400).json({ error: "Select a profession first." });
    }

    if (!session.roadmaps[session.selectedProfession.id]) {
      const roadmap = await aiEngine.generateRoadmap({ session });
      store.setRoadmap(session, roadmap);
    }

    return sendSessionSnapshot(res, session);
  } catch (error) {
    console.error("[roadmap/generate]", error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : "Failed to generate roadmap." });
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
  app.listen(PORT, () => {
    console.log(`Working Name API listening on http://localhost:${PORT}`);
  });
}

module.exports = { app };
