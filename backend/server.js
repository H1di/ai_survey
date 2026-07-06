const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const { createAiEngine } = require("./aiEngine");
const {
  VALUES_DIMENSIONS,
  DEMOGRAPHIC_QUESTIONS,
} = require("./questionPool");
const {
  pickNextQuestion,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateValuesAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeValuesScores,
  buildProgress,
  summarizeAnswersForClient,
} = require("./questionEngine");
const { computeDirection, getDirection, REFINE_REASON_VALUES } = require("./directions");
const { SessionStore } = require("./sessionStore");

dotenv.config();

const app = express();
const store = new SessionStore();
store.startSweep();

const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const aiEngine = createAiEngine({
  apiKey: process.env.OPENAI_API_KEY,
  model: MODEL,
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function isValidEntryChoice(value) {
  return value === "change" || value === "find";
}

function sendSessionSnapshot(res, session, extras = {}) {
  const progress = buildProgress(session);
  const summary = summarizeAnswersForClient(session);

  return res.json({
    ...store.serializeSessionState(session, progress, summary),
    ...extras,
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
  const { entryChoice, dreamAnswer } = req.body || {};

  if (!isValidEntryChoice(entryChoice)) {
    return res.status(400).json({ error: "entryChoice must be 'change' or 'find'." });
  }

  const normalizedDream = typeof dreamAnswer === "string" ? dreamAnswer.trim() : "";

  if (!normalizedDream) {
    return res.status(400).json({ error: "dreamAnswer is required." });
  }

  const session = store.createSession({
    entryChoice,
    dreamAnswer: normalizedDream,
  });

  return sendSessionSnapshot(res, session, {
    nextQuestion: pickNextQuestion(session),
    valuesDimensions: VALUES_DIMENSIONS,
  });
});

app.get("/api/session/:sessionId", (req, res) => {
  try {
    const session = store.require(req.params.sessionId);
    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
      valuesDimensions: VALUES_DIMENSIONS,
    });
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

    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
    });
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

    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
    });
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
      store.advanceStep(session, "values");
    }

    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/values/answer", (req, res) => {
  try {
    const { sessionId, questionId, choice } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "values") {
      return res.status(400).json({ error: "Not currently in the values step." });
    }

    const normalized = validateValuesAnswer(questionId, choice);
    store.recordValuesAnswer(session, questionId, normalized);

    const { scores, answered } = computeValuesScores(session);
    if (scores) {
      store.setValuesScores(session, scores);
      store.advanceStep(session, "complete");
    }

    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
      valuesAnswered: answered,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

function requireCompletedAssessment(session) {
  if (session.step !== "complete") {
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
      store.setProposedDirection(session, {
        ...computeDirection(session.directionQuestions, session.directionAnswers),
        reason: "Your answers across the quiz point most strongly to this direction.",
      });
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Working Name API listening on http://localhost:${PORT}`);
  });
}

module.exports = { app };
