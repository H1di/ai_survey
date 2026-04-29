const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const { createAiEngine } = require("./aiEngine");
const { BRANCH_THEMES } = require("./questionPool");
const {
  QUESTION_BY_ID,
  TARGET_COUNTS,
  buildProgress,
  getQuestionById,
  isQuestionAvailableForSession,
  normalizeAnswer,
  pickNextQuestion,
  resolveAnswerLabel,
  serializeQuestion,
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
  const answers = summarizeAnswersForClient(session);

  return res.json({
    ...store.serializeSessionState(session, progress, answers),
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
  const { entryChoice, dreamAnswer, premiumDepth = false } = req.body || {};

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
    premiumDepth,
  });

  const nextQuestion = pickNextQuestion(session);

  return sendSessionSnapshot(res, session, {
    nextQuestion: serializeQuestion(nextQuestion),
    questionPoolSize: QUESTION_BY_ID.size,
    targetRange: {
      min: TARGET_COUNTS.minimum,
      core: TARGET_COUNTS.core,
      premium: TARGET_COUNTS.premium,
    },
  });
});

app.get("/api/session/:sessionId", (req, res) => {
  try {
    const session = store.require(req.params.sessionId);
    const nextQuestion = pickNextQuestion(session);

    return sendSessionSnapshot(res, session, {
      nextQuestion: serializeQuestion(nextQuestion),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/session/premium", (req, res) => {
  try {
    const { sessionId, premiumDepth } = req.body || {};
    const session = store.require(sessionId);

    store.setPremiumDepth(session, Boolean(premiumDepth));

    const nextQuestion = pickNextQuestion(session);

    return sendSessionSnapshot(res, session, {
      nextQuestion: serializeQuestion(nextQuestion),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/questions/answer", (req, res) => {
  try {
    const { sessionId, questionId, answer } = req.body || {};

    const session = store.require(sessionId);
    const question = getQuestionById(questionId);

    if (!question) {
      return res.status(404).json({ error: "Question not found." });
    }

    if (!isQuestionAvailableForSession(question, session)) {
      return res.status(400).json({
        error:
          "This question is not currently available. Continue with the suggested next question.",
      });
    }

    const normalizedAnswer = normalizeAnswer(question, answer);

    store.upsertAnswer(session, {
      questionId,
      answer: normalizedAnswer,
    });

    const progress = buildProgress(session);
    const nextQuestion = pickNextQuestion(session);

    return res.json({
      ok: true,
      progress,
      recordedAnswer: {
        questionId,
        answer: normalizedAnswer,
        answerLabel: resolveAnswerLabel(question, normalizedAnswer),
      },
      nextQuestion: serializeQuestion(nextQuestion),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post("/api/branches/initial", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = store.require(sessionId);

    if (session.answers.length < TARGET_COUNTS.minimum) {
      return res.status(400).json({
        error: `Answer at least ${TARGET_COUNTS.minimum} questions before generating the first branch.`,
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
      questionById: QUESTION_BY_ID,
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
      questionById: QUESTION_BY_ID,
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
      questionById: QUESTION_BY_ID,
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
