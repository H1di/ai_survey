const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const { createAiEngine } = require("./aiEngine");
const {
  BRANCH_THEMES,
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
const { SessionStore } = require("./sessionStore");

dotenv.config();

const app = express();
const store = new SessionStore();

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

app.post("/api/branches/initial", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);

    if (session.step !== "complete") {
      return res.status(400).json({
        error: "Complete the assessment before generating the first branch.",
      });
    }

    const existingPrimary = session.branches.find((branch) => branch.theme === "primary");

    if (existingPrimary) {
      return sendSessionSnapshot(res, session, {
        branch: existingPrimary,
      });
    }

    const payload = await aiEngine.generateInitialBranch({
      session,
      themeId: "primary",
    });

    const branch = store.createBranch(session, {
      themeId: "primary",
      payload,
    });

    return sendSessionSnapshot(res, session, {
      branch,
    });
  } catch (error) {
    console.error("[branches/initial]", error);
    return res.status(error.statusCode || 500).json({
      error: "Failed to generate the initial branch.",
    });
  }
});

app.post("/api/payment/unlock-theme", (req, res) => {
  try {
    const { sessionId, themeId } = req.body || {};
    const session = store.require(sessionId);

    const theme = BRANCH_THEMES.find((item) => item.id === themeId);

    if (!theme) {
      return res.status(400).json({ error: "Unknown theme." });
    }

    const unlockedThemes = store.unlockTheme(session, themeId);

    return res.json({
      ok: true,
      unlockedThemes,
      receipt: {
        id: `pay_${Date.now()}`,
        themeId,
        amount: 900,
        currency: "usd",
        status: "paid",
        paidAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/branches/create", async (req, res) => {
  try {
    const { sessionId, themeId } = req.body || {};
    const session = store.require(sessionId);

    if (!themeId || themeId === "primary") {
      return res.status(400).json({ error: "themeId must be one paid thematic branch." });
    }

    if (!store.isThemeUnlocked(session, themeId)) {
      return res.status(402).json({
        error: "Theme is locked. Unlock it first.",
      });
    }

    const existing = session.branches.find((branch) => branch.theme === themeId);

    if (existing) {
      return sendSessionSnapshot(res, session, { branch: existing });
    }

    const payload = await aiEngine.generateInitialBranch({
      session,
      themeId,
    });

    const branch = store.createBranch(session, {
      themeId,
      payload,
    });

    return sendSessionSnapshot(res, session, {
      branch,
    });
  } catch (error) {
    console.error("[branches/create]", error);
    return res.status(error.statusCode || 500).json({
      error: "Failed to create branch.",
    });
  }
});

app.post("/api/branches/evolve", async (req, res) => {
  try {
    const { sessionId, branchId, nodeId, answer } = req.body || {};
    const session = store.require(sessionId);
    const branch = store.getBranch(session, branchId);

    if (!branch) {
      return res.status(404).json({ error: "Branch not found." });
    }

    const node = branch.nodes.find((item) => item.id === nodeId);

    if (!node) {
      return res.status(404).json({ error: "Node not found." });
    }

    if (!node.question) {
      return res.status(400).json({ error: "This node has no further question." });
    }

    if (node.answeredChoice) {
      return res.status(400).json({ error: "This node was already answered." });
    }

    const option = node.question.options.find((item) => item.value === answer);

    if (!option) {
      return res.status(400).json({ error: "Invalid branch answer option." });
    }

    const evolution = await aiEngine.evolveBranch({
      session,
      branch,
      node,
      answerLabel: option.label,
    });

    const nextNode = store.appendNode(session, branch, {
      parentNodeId: nodeId,
      parentAnswer: answer,
      parentAnswerLabel: option.label,
      nextNodeTitle: evolution.nextNodeTitle,
      nextNodeSummary: evolution.nextNodeSummary,
      clarityGain: evolution.clarityGain,
      riskNote: evolution.riskNote,
      question: evolution.question,
      shouldStop: evolution.shouldStop,
    });

    return sendSessionSnapshot(res, session, {
      branch,
      nextNode,
    });
  } catch (error) {
    console.error("[branches/evolve]", error);
    return res.status(error.statusCode || 500).json({
      error: "Failed to evolve branch.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Working Name API listening on http://localhost:${PORT}`);
});
