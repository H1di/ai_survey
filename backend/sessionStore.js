const { randomUUID } = require("node:crypto");

const { DIRECTIONS, REFINE_REASONS } = require("./directions");
const {
  DEMOGRAPHIC_QUESTIONS,
  JOB_CHAR_PARAMS,
  CAREER_JOURNEY_QUESTIONS,
} = require("./questionPool");
const {
  serializeDemographic,
  serializeRiasecItem,
  serializeJobCharItem,
} = require("./questionEngine");

const DIRECTION_CATALOG = DIRECTIONS.map(({ id, label }) => ({ id, label }));

const SERIALIZED_DEMOGRAPHIC_QUESTIONS = DEMOGRAPHIC_QUESTIONS.map(serializeDemographic);
const SERIALIZED_JOURNEY_QUESTIONS = CAREER_JOURNEY_QUESTIONS.map(
  ({ id, question, placeholder }) => ({ id, question, placeholder })
);

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

  createSession({ entryChoice, dreamAnswer, cvIntent }) {
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
      cvIntent: cvIntent || "new",
      cvText: null,
      cvAnalysis: null,
      riasecItems: [],
      riasecAnswers: {},
      riasecScores: null,
      riasecCode: null,
      riasecInferred: false,
      jobCharRanking: null,
      jobCharDepth: null,
      jobCharItems: [],
      jobCharAnswers: {},
      jobCharProfile: null,
      careerJourneyAnswers: {},
      userValues: null,
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

  setRiasecItems(session, items) {
    session.riasecItems = items;
    session.riasecAnswers = {};
    session.riasecScores = null;
    session.riasecCode = null;
    session.riasecInferred = false;
    this.touch(session);
  }

  recordRiasecAnswer(session, itemId, value) {
    session.riasecAnswers[itemId] = value;
    this.touch(session);
  }

  setRiasecScores(session, scores, code, { inferred = false } = {}) {
    session.riasecScores = scores;
    session.riasecCode = code;
    session.riasecInferred = inferred;
    this.touch(session);
  }

  setJobCharRanking(session, ranking, depth, items) {
    session.jobCharRanking = ranking;
    session.jobCharDepth = depth;
    session.jobCharItems = items;
    session.jobCharAnswers = {};
    session.jobCharProfile = null;
    this.touch(session);
  }

  recordJobCharAnswer(session, itemId, value) {
    session.jobCharAnswers[itemId] = value;
    this.touch(session);
  }

  setJobCharProfile(session, profile) {
    session.jobCharProfile = profile;
    this.touch(session);
  }

  setCvAnalysis(session, cvText, analysis) {
    session.cvText = cvText;
    session.cvAnalysis = analysis;
    this.touch(session);
  }

  recordCareerJourneyAnswer(session, questionId, value) {
    session.careerJourneyAnswers[questionId] = value;
    this.touch(session);
  }

  // No PVQ instrument yet — the Schwartz vector is always inferred from the
  // rest of the assessment, so the confidence flag is fixed at "low".
  setUserValues(session, scores) {
    session.userValues = { scores, confidence: "low", source: "inferred" };
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

  // includeStatic=false trims the per-answer payload: question banks and the
  // direction catalog only travel on session start, GET (resume), and the
  // depth choice (where bigFiveItems change). The frontend merges, so answer
  // responses carry only the state that can actually have moved.
  serializeSessionState(session, progress, summary, { includeStatic = true } = {}) {
    const staticPart = includeStatic
      ? {
          demographicQuestions: SERIALIZED_DEMOGRAPHIC_QUESTIONS,
          bigFiveItems: session.bigFiveItems.map((i) => ({ id: i.id, text: i.text })),
          riasecItems: session.riasecItems.map(serializeRiasecItem),
          jobCharParams: JOB_CHAR_PARAMS,
          careerJourneyQuestions: SERIALIZED_JOURNEY_QUESTIONS,
          directionCatalog: DIRECTION_CATALOG,
          refineReasons: REFINE_REASONS,
        }
      : {};

    return {
      sessionId: session.id,
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      step: session.step,
      ...staticPart,
      demographics: session.demographics,
      bigFiveDepth: session.bigFiveDepth,
      bigFiveAnswers: session.bigFiveAnswers,
      bigFiveScores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
      cvIntent: session.cvIntent,
      cvProvided: Boolean(session.cvText),
      cvAnalysis: session.cvAnalysis,
      riasecAnswers: session.riasecAnswers,
      riasecScores: session.riasecScores,
      riasecCode: session.riasecCode,
      riasecInferred: session.riasecInferred,
      jobCharRanking: session.jobCharRanking,
      jobCharDepth: session.jobCharDepth,
      jobCharItems: session.jobCharItems.map(serializeJobCharItem),
      jobCharAnswers: session.jobCharAnswers,
      jobCharProfile: session.jobCharProfile,
      careerJourneyAnswers: session.careerJourneyAnswers,
      userValues: session.userValues,
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
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
