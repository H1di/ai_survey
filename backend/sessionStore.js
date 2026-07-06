const { randomUUID } = require("node:crypto");

const { DIRECTIONS } = require("./directions");
const { DEMOGRAPHIC_QUESTIONS, VALUES_QUESTIONS } = require("./questionPool");
const { serializeDemographic, serializeValueQuestion } = require("./questionEngine");

const DIRECTION_CATALOG = DIRECTIONS.map(({ id, label }) => ({ id, label }));

const SERIALIZED_DEMOGRAPHIC_QUESTIONS = DEMOGRAPHIC_QUESTIONS.map(serializeDemographic);
const SERIALIZED_VALUES_QUESTIONS = VALUES_QUESTIONS.map(serializeValueQuestion);

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

class SessionStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this.sweepTimer = null;
  }

  evictExpired(now = Date.now()) {
    let evicted = 0;
    for (const [id, session] of this.sessions) {
      if (now - Date.parse(session.updatedAt) > this.ttlMs) {
        this.sessions.delete(id);
        evicted += 1;
      }
    }
    return evicted;
  }

  startSweep() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.evictExpired(), this.sweepIntervalMs);
    // Never keep the process alive just for the sweep.
    if (typeof this.sweepTimer.unref === "function") this.sweepTimer.unref();
  }

  stopSweep() {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = null;
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
      directionTieCandidates: [],
      proposedDirection: null,
      direction: null,
      narrowingQuestions: [],
      narrowingAnswers: {},
      professionOptions: [],
      selectedProfession: null,
      roadmaps: {},
      rejectedDirections: [],
      refineNotes: [],
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
    session.directionTieCandidates = [];
    session.proposedDirection = null;
    this.touch(session);
  }

  setDirectionTie(session, candidates) {
    session.directionTieCandidates = candidates;
    session.proposedDirection = null;
    this.touch(session);
  }

  recordDirectionAnswer(session, questionId, value) {
    session.directionAnswers[questionId] = value;
    this.touch(session);
  }

  setProposedDirection(session, direction) {
    session.proposedDirection = direction;
    session.directionTieCandidates = [];
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
    session.roadmaps[roadmap.professionId] = roadmap;
    session.pathStage = "roadmap";
    this.touch(session);
  }

  rejectProposedDirection(session, note) {
    if (session.proposedDirection) {
      session.rejectedDirections.push({
        id: session.proposedDirection.id,
        label: session.proposedDirection.label,
      });
    }
    session.refineNotes.push(note);
    session.proposedDirection = null;
    this.touch(session);
  }

  serializeSessionState(session, progress, summary) {
    return {
      sessionId: session.id,
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      step: session.step,
      demographicQuestions: SERIALIZED_DEMOGRAPHIC_QUESTIONS,
      demographics: session.demographics,
      bigFiveDepth: session.bigFiveDepth,
      bigFiveItems: session.bigFiveItems.map((i) => ({ id: i.id, text: i.text })),
      bigFiveAnswers: session.bigFiveAnswers,
      bigFiveScores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
      valuesQuestions: SERIALIZED_VALUES_QUESTIONS,
      valuesAnswers: session.valuesAnswers,
      valuesScores: session.valuesScores,
      progress,
      summary,
      pathStage: session.pathStage,
      directionQuestions: session.directionQuestions,
      directionAnswers: session.directionAnswers,
      directionTieCandidates: session.directionTieCandidates,
      proposedDirection: session.proposedDirection,
      direction: session.direction,
      narrowingQuestions: session.narrowingQuestions,
      narrowingAnswers: session.narrowingAnswers,
      professionOptions: session.professionOptions,
      selectedProfession: session.selectedProfession,
      roadmaps: session.roadmaps,
      rejectedDirections: session.rejectedDirections,
      directionCatalog: DIRECTION_CATALOG,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
