const { randomUUID } = require("node:crypto");

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
const { deriveHigherOrder, deriveAxes } = require("./schwartzValues");
const { MINI_IPIP_20 } = require("./bigFiveItems");

const SERIALIZED_DEMOGRAPHIC_QUESTIONS = DEMOGRAPHIC_QUESTIONS.map(serializeDemographic);
const SERIALIZED_JOURNEY_QUESTIONS = CAREER_JOURNEY_QUESTIONS.map(
  ({ id, question, placeholder }) => ({ id, question, placeholder })
);

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const SESSION_KEY_PREFIX = "session:";

class SessionStore {
  // `redis` (optional) enables durable persistence: the in-process Map stays
  // the authoritative working set for the sync require()/get() interface, and
  // every mutation is written through to Redis. On startup hydrate() reloads
  // the Map so sessions survive a process restart (e.g. Render idle-sleep).
  constructor({ ttlMs = DEFAULT_TTL_MS, sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS, redis = null } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this.sweepTimer = null;
    this.redis = redis;
  }

  // Write-through to the durable store (fire-and-forget). Each write is the
  // whole session, so a dropped write self-heals on the next mutation; the only
  // unrecoverable loss is a crash between a mutation and its write with no
  // further mutation. No-op without a configured backend.
  _persist(session) {
    if (!this.redis) return;
    const ttlSeconds = Math.max(1, Math.ceil(this.ttlMs / 1000));
    Promise.resolve(
      this.redis.set(SESSION_KEY_PREFIX + session.id, JSON.stringify(session), { ex: ttlSeconds })
    ).catch((error) => console.error("[sessionStore persist]", error.message));
  }

  _deletePersisted(id) {
    if (!this.redis) return;
    Promise.resolve(this.redis.del(SESSION_KEY_PREFIX + id)).catch(() => {});
  }

  // Reload durable sessions into the Map at startup. Redis EX already dropped
  // anything past its TTL, so SCAN only returns live sessions. Best-effort:
  // a failing store degrades to in-memory rather than blocking boot.
  async hydrate() {
    if (!this.redis) return 0;
    let cursor = "0";
    let loaded = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, {
        match: `${SESSION_KEY_PREFIX}*`,
        count: 100,
      });
      cursor = String(next);
      for (const key of keys) {
        const raw = await this.redis.get(key);
        const session = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (session && session.id) {
          this.sessions.set(session.id, session);
          loaded += 1;
        }
      }
    } while (cursor !== "0");
    return loaded;
  }

  evictExpired(now = Date.now()) {
    let evicted = 0;
    for (const [id, session] of this.sessions) {
      if (now - Date.parse(session.updatedAt) > this.ttlMs) {
        this.sessions.delete(id);
        this._deletePersisted(id);
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

  createSession({ whyHereAnswer, dreamAnswer }) {
    const id = randomUUID();
    const now = new Date().toISOString();

    const session = {
      id,
      whyHereAnswer,
      dreamAnswer,
      step: "demographics",
      demographics: {},
      bigFiveItems: MINI_IPIP_20,
      bigFiveAnswers: {},
      bigFiveScores: null,
      derivedTraits: null,
      personaSummary: null,
      // Chosen on the CV slide via /api/cv/intent, not at session start.
      cvIntent: null,
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
      // Page 3 — Life Path Engine (Oriented Field / output loop)
      pathStage: "output",
      outputs: [],
      acceptedOutputId: null,
      refinementHistory: [],
      roadmaps: {},
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    this._persist(session);
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
    this._persist(session);
  }

  setDemographicAnswer(session, questionId, value) {
    session.demographics[questionId] = value;
    this.touch(session);
  }

  advanceStep(session, nextStep) {
    session.step = nextStep;
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

  setPersonaSummary(session, personaSummary) {
    session.personaSummary = personaSummary;
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

  setCvIntent(session, cvIntent) {
    session.cvIntent = cvIntent;
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

  // Appends a scored output to the iteration chain. parentId links each
  // regeneration to the output it replaced so the graph shows the trail.
  appendOutput(session, output) {
    const id = `output_${session.outputs.length + 1}`;
    const parentId = session.outputs.length
      ? session.outputs[session.outputs.length - 1].id
      : null;
    const full = { id, parentId, ...output };
    session.outputs.push(full);
    session.pathStage = "output";
    this.touch(session);
    return full;
  }

  recordRefinement(session, entry) {
    session.refinementHistory.push(entry);
    this.touch(session);
  }

  acceptOutput(session, outputId, detail) {
    const output = session.outputs.find((o) => o.id === outputId);
    output.accepted = true;
    output.detail = detail;
    session.acceptedOutputId = outputId;
    session.pathStage = "detail";
    this.touch(session);
  }

  setRoadmap(session, roadmap) {
    session.roadmaps[roadmap.professionId] = roadmap;
    this.touch(session);
  }

  // includeStatic=false trims the per-answer payload: question banks only
  // travel on session start, GET (resume), and riasec-start (where
  // riasecItems change). The frontend merges, so answer responses carry only
  // the state that can actually have moved.
  serializeSessionState(session, progress, summary, { includeStatic = true } = {}) {
    const staticPart = includeStatic
      ? {
          demographicQuestions: SERIALIZED_DEMOGRAPHIC_QUESTIONS,
          bigFiveItems: session.bigFiveItems.map((i) => ({ id: i.id, text: i.text })),
          riasecItems: session.riasecItems.map(serializeRiasecItem),
          jobCharParams: JOB_CHAR_PARAMS,
          careerJourneyQuestions: SERIALIZED_JOURNEY_QUESTIONS,
        }
      : {};

    return {
      sessionId: session.id,
      whyHereAnswer: session.whyHereAnswer,
      dreamAnswer: session.dreamAnswer,
      step: session.step,
      ...staticPart,
      demographics: session.demographics,
      bigFiveAnswers: session.bigFiveAnswers,
      bigFiveScores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
      personaSummary: session.personaSummary,
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
      // Pre-derived plane point for the Schwartz map — keeps the axis math
      // single-sourced on the backend.
      userValuesAxes: session.userValues
        ? deriveAxes(deriveHigherOrder(session.userValues.scores))
        : null,
      progress,
      summary,
      pathStage: session.pathStage,
      outputs: session.outputs,
      acceptedOutputId: session.acceptedOutputId,
      refinementHistory: session.refinementHistory,
      roadmaps: session.roadmaps,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = {
  SessionStore,
};
