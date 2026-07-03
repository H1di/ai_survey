const { randomUUID } = require("node:crypto");

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
      // Page 3 — Life Path Engine
      pathStage: "direction",
      directionQuestions: [],
      directionAnswers: {},
      proposedDirection: null,
      direction: null,
      narrowingQuestions: [],
      narrowingAnswers: {},
      professionOptions: [],
      selectedProfession: null,
      roadmap: null,
      createdAt: now,
      updatedAt: now,
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

  setDirectionQuestions(session, questions) {
    session.directionQuestions = questions;
    session.directionAnswers = {};
    session.proposedDirection = null;
    this.touch(session);
  }

  recordDirectionAnswer(session, questionId, value) {
    session.directionAnswers[questionId] = value;
    this.touch(session);
  }

  setProposedDirection(session, direction) {
    session.proposedDirection = direction;
    this.touch(session);
  }

  confirmDirection(session, direction) {
    session.direction = direction;
    session.pathStage = "narrowing";
    this.touch(session);
  }

  setNarrowingQuestions(session, questions) {
    session.narrowingQuestions = questions;
    session.narrowingAnswers = {};
    this.touch(session);
  }

  recordNarrowingAnswer(session, questionId, value) {
    session.narrowingAnswers[questionId] = value;
    this.touch(session);
  }

  setProfessionOptions(session, professions) {
    session.professionOptions = professions;
    session.pathStage = "professions";
    this.touch(session);
  }

  selectProfession(session, profession) {
    session.selectedProfession = profession;
    this.touch(session);
  }

  setRoadmap(session, roadmap) {
    session.roadmap = roadmap;
    session.pathStage = "roadmap";
    this.touch(session);
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
      pathStage: session.pathStage,
      directionQuestions: session.directionQuestions,
      directionAnswers: session.directionAnswers,
      proposedDirection: session.proposedDirection,
      direction: session.direction,
      narrowingQuestions: session.narrowingQuestions,
      narrowingAnswers: session.narrowingAnswers,
      professionOptions: session.professionOptions,
      selectedProfession: session.selectedProfession,
      roadmap: session.roadmap,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
