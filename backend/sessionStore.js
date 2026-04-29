const { randomUUID } = require("node:crypto");
const { BRANCH_THEMES } = require("./questionPool");

const THEME_LOOKUP = new Map(BRANCH_THEMES.map((theme) => [theme.id, theme]));

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession({ entryChoice, dreamAnswer, premiumDepth }) {
    const id = randomUUID();

    const session = {
      id,
      entryChoice,
      dreamAnswer,
      premiumDepth: Boolean(premiumDepth),
      answers: [],
      branches: [],
      unlockedThemes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  setPremiumDepth(session, enabled) {
    session.premiumDepth = Boolean(enabled);
    this.touch(session);
    return session.premiumDepth;
  }

  upsertAnswer(session, { questionId, answer }) {
    const existingIndex = session.answers.findIndex(
      (item) => item.questionId === questionId
    );

    const answerRecord = {
      questionId,
      answer,
      answeredAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      session.answers[existingIndex] = answerRecord;
    } else {
      session.answers.push(answerRecord);
    }

    this.touch(session);
    return answerRecord;
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

  serializeSessionState(session, progress, answerSummary) {
    return {
      sessionId: session.id,
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      premiumDepth: session.premiumDepth,
      progress,
      answers: answerSummary,
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
