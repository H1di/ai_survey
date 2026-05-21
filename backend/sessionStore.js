const { randomUUID } = require("node:crypto");
const { BRANCH_THEMES } = require("./questionPool");

const THEME_LOOKUP = new Map(BRANCH_THEMES.map((theme) => [theme.id, theme]));

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession({ entryChoice, dreamAnswer }) {
    const id = randomUUID();
    const now = new Date().toISOString();

    const session = {
      id,
      entryChoice,
      dreamAnswer,
      step: "demographics",
      demographics: {},
      bigFiveDepth: null,
      bigFiveItems: [],
      bigFiveAnswers: {},
      bigFiveScores: null,
      derivedTraits: null,
      valuesAnswers: {},
      valuesScores: null,
      branches: [],
      unlockedThemes: [],
      createdAt: now,
      updatedAt: now,
      branchCounter: 0,
    };

    this.sessions.set(id, session);
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  require(sessionId) {
    const session = this.get(sessionId);

    if (!session) {
      const error = new Error("Session not found.");
      error.statusCode = 404;
      throw error;
    }

    return session;
  }

  touch(session) {
    session.updatedAt = new Date().toISOString();
  }

  setDemographicAnswer(session, questionId, value) {
    session.demographics[questionId] = value;
    this.touch(session);
  }

  advanceStep(session, nextStep) {
    session.step = nextStep;
    this.touch(session);
  }

  setBigFiveDepthAndItems(session, depth, items) {
    session.bigFiveDepth = depth;
    session.bigFiveItems = items;
    session.bigFiveAnswers = {};
    session.bigFiveScores = null;
    session.derivedTraits = null;
    this.touch(session);
  }

  recordBigFiveAnswer(session, itemId, value) {
    session.bigFiveAnswers[itemId] = value;
    this.touch(session);
  }

  setBigFiveScores(session, scores, derivedTraits) {
    session.bigFiveScores = scores;
    session.derivedTraits = derivedTraits;
    this.touch(session);
  }

  recordValuesAnswer(session, questionId, choice) {
    session.valuesAnswers[questionId] = choice;
    this.touch(session);
  }

  setValuesScores(session, scores) {
    session.valuesScores = scores;
    this.touch(session);
  }

  unlockTheme(session, themeId) {
    if (!THEME_LOOKUP.has(themeId)) {
      const error = new Error("Theme not found.");
      error.statusCode = 400;
      throw error;
    }

    if (!session.unlockedThemes.includes(themeId)) {
      session.unlockedThemes.push(themeId);
      this.touch(session);
    }

    return [...session.unlockedThemes];
  }

  isThemeUnlocked(session, themeId) {
    return session.unlockedThemes.includes(themeId);
  }

  hasBranchForTheme(session, themeId) {
    return session.branches.some((branch) => branch.theme === themeId);
  }

  getBranch(session, branchId) {
    return session.branches.find((branch) => branch.id === branchId) || null;
  }

  createBranch(session, { themeId, payload }) {
    const existing = session.branches.find((branch) => branch.theme === themeId);

    if (existing) {
      return existing;
    }

    session.branchCounter += 1;

    const branchId = `branch_${session.branchCounter}`;
    const now = new Date().toISOString();
    const theme = THEME_LOOKUP.get(themeId);

    const firstNode = {
      id: `${branchId}_node_1`,
      parentNodeId: null,
      title: payload.title,
      summary: payload.thesis,
      milestone: payload.firstMilestone,
      whyFit: payload.whyFit,
      constraintsNote: payload.constraintsNote,
      clarityGain: "Initial branch",
      riskNote: "Unvalidated assumptions remain.",
      question: payload.question,
      answeredChoice: null,
      answeredChoiceLabel: null,
      shouldStop: false,
      createdAt: now,
    };

    const branch = {
      id: branchId,
      theme: themeId,
      themeLabel: theme ? theme.label : "Primary Path",
      title: payload.title,
      thesis: payload.thesis,
      whyFit: payload.whyFit,
      firstMilestone: payload.firstMilestone,
      constraintsNote: payload.constraintsNote,
      nodes: [firstNode],
      createdAt: now,
      updatedAt: now,
    };

    session.branches.push(branch);
    this.touch(session);

    return branch;
  }

  appendNode(
    session,
    branch,
    {
      parentNodeId,
      parentAnswer,
      parentAnswerLabel,
      nextNodeTitle,
      nextNodeSummary,
      clarityGain,
      riskNote,
      question,
      shouldStop,
    }
  ) {
    const parentNode = branch.nodes.find((node) => node.id === parentNodeId);

    if (!parentNode) {
      const error = new Error("Parent node not found.");
      error.statusCode = 404;
      throw error;
    }

    parentNode.answeredChoice = parentAnswer;
    parentNode.answeredChoiceLabel = parentAnswerLabel;

    const index = branch.nodes.length + 1;
    const now = new Date().toISOString();

    const nextNode = {
      id: `${branch.id}_node_${index}`,
      parentNodeId,
      title: nextNodeTitle,
      summary: nextNodeSummary,
      milestone: "",
      whyFit: "",
      constraintsNote: "",
      clarityGain,
      riskNote,
      question: shouldStop ? null : question,
      answeredChoice: null,
      answeredChoiceLabel: null,
      shouldStop: Boolean(shouldStop),
      createdAt: now,
    };

    branch.nodes.push(nextNode);
    branch.updatedAt = now;
    this.touch(session);

    return nextNode;
  }

  serializeSessionState(session, progress, summary) {
    return {
      sessionId: session.id,
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      step: session.step,
      demographics: session.demographics,
      bigFiveDepth: session.bigFiveDepth,
      bigFiveScores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
      valuesScores: session.valuesScores,
      progress,
      summary,
      branches: session.branches,
      unlockedThemes: [...session.unlockedThemes],
      themes: BRANCH_THEMES,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
