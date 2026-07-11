const {
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  JOB_CHAR_PARAM_IDS,
  CAREER_JOURNEY_QUESTIONS,
  CAREER_JOURNEY_BY_ID,
} = require("./questionPool");

const TRAIT_KEYS = ["O", "C", "E", "A", "N"];

function serializeDemographic(q) {
  return {
    id: q.id,
    kind: q.kind,
    question: q.question,
    options: q.options || [],
    placeholder: q.placeholder || "",
    min: q.min,
    max: q.max,
  };
}

function validateDemographicAnswer(id, value) {
  const q = DEMOGRAPHIC_BY_ID.get(id);
  if (!q) throw httpErr(404, "Unknown demographic question.");

  if (q.kind === "single") {
    if (typeof value !== "string" || !q.options.find((o) => o.value === value)) {
      throw httpErr(400, "Invalid option.");
    }
    return value;
  }
  if (q.kind === "number") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < q.min || n > q.max) {
      throw httpErr(400, `Enter a number between ${q.min} and ${q.max}.`);
    }
    return n;
  }
  if (q.kind === "text") {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s) throw httpErr(400, "Answer cannot be empty.");
    if (s.length > 80) throw httpErr(400, "Answer is too long.");
    return s;
  }
  throw httpErr(400, "Unsupported question kind.");
}

function validateBigFiveAnswer(session, itemId, value) {
  const item = (session.bigFiveItems || []).find((i) => i.id === itemId);
  if (!item) throw httpErr(404, "Unknown Big Five item.");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw httpErr(400, "Big Five answer must be an integer 1–5.");
  }
  return n;
}

function validateJobCharRanking(ranking) {
  const ok =
    Array.isArray(ranking) &&
    ranking.length === JOB_CHAR_PARAM_IDS.length &&
    new Set(ranking).size === ranking.length &&
    ranking.every((id) => JOB_CHAR_PARAM_IDS.includes(id));
  if (!ok) throw httpErr(400, "ranking must order all 7 job-characteristic parameters.");
  return ranking;
}

function validateJobCharAnswer(session, itemId, value) {
  const item = (session.jobCharItems || []).find((i) => i.id === itemId);
  if (!item) throw httpErr(404, "Unknown job-characteristics question.");
  const n = Number(value);
  if (!item.options.some((o) => o.value === n)) {
    throw httpErr(400, "Answer must be one of the question's option values.");
  }
  return n;
}

function computeJobCharProfile(session) {
  const items = session.jobCharItems || [];
  const answered = items.filter((i) => session.jobCharAnswers[i.id] !== undefined).length;
  if (!items.length || answered < items.length) return { profile: null, answered };

  const profile = {};
  for (const param of JOB_CHAR_PARAM_IDS) {
    const group = items.filter((i) => i.param === param);
    profile[param] = group.length
      ? Math.round(group.reduce((s, i) => s + session.jobCharAnswers[i.id], 0) / group.length)
      : 50; // unasked (low-ranked) parameters sit at the neutral midpoint
  }
  return { profile, answered };
}

function validateCareerJourneyAnswer(questionId, value) {
  if (!CAREER_JOURNEY_BY_ID.has(questionId)) throw httpErr(404, "Unknown career-journey question.");
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw httpErr(400, "Answer cannot be empty.");
  return s.slice(0, 400);
}

function serializeJobCharItem(item) {
  return { id: item.id, param: item.param, text: item.text, options: item.options };
}

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function computeBigFiveScores(session) {
  if (!session.bigFiveItems || !session.bigFiveItems.length) return null;

  const sum = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  const count = { O: 0, C: 0, E: 0, A: 0, N: 0 };

  for (const item of session.bigFiveItems) {
    const raw = session.bigFiveAnswers[item.id];
    if (raw === undefined) return null;
    const scored = item.reverse ? 6 - raw : raw;
    sum[item.trait] += scored;
    count[item.trait] += 1;
  }

  const scores = {};
  for (const k of TRAIT_KEYS) {
    if (!count[k]) {
      scores[k] = 50;
    } else {
      const mean = sum[k] / count[k];
      scores[k] = Math.round(((mean - 1) / 4) * 100);
    }
  }
  return scores;
}

function deriveBigFiveTraits(scores) {
  if (!scores) return null;
  const invertedN = 100 - scores.N;
  const behaviourTendencies = Math.round((scores.A + scores.C + invertedN) / 3);
  const decisionPriorities = Math.round((scores.O + scores.E) / 2);
  return {
    behaviourTendencies,
    decisionPriorities,
    summary: describeTraits({ behaviourTendencies, decisionPriorities, scores }),
  };
}

// behaviourTendencies/decisionPriorities are the Big Two meta-traits
// (DeYoung): Stability = mean(A, C, 100-N), Plasticity = mean(O, E). The
// field names stay for API compatibility; the copy uses the real names.
function describeTraits({ behaviourTendencies, decisionPriorities, scores }) {
  const high = (v) => v >= 65;
  const low = (v) => v <= 35;
  const parts = [];
  parts.push(
    high(behaviourTendencies)
      ? "Stability (composure & self-discipline): steady, organized, low-volatility under stress."
      : low(behaviourTendencies)
        ? "Stability (composure & self-discipline): volatile, reactive, less structured."
        : "Stability (composure & self-discipline): balanced steadiness."
  );
  parts.push(
    high(decisionPriorities)
      ? "Plasticity (drive toward the new): novelty-seeking, exploratory, energized by people and ideas."
      : low(decisionPriorities)
        ? "Plasticity (drive toward the new): conservative, prefers depth and routine over novelty."
        : "Plasticity (drive toward the new): balanced between exploration and routine."
  );
  parts.push(
    `OCEAN: O=${scores.O}, C=${scores.C}, E=${scores.E}, A=${scores.A}, N=${scores.N}`
  );
  return parts.join(" ");
}

const RIASEC_TYPE_KEYS = ["R", "I", "A", "S", "E", "C"];

function serializeRiasecItem(item) {
  return { id: item.id, text: item.text };
}

function validateRiasecAnswer(session, itemId, value) {
  const item = (session.riasecItems || []).find((i) => i.id === itemId);
  if (!item) throw httpErr(404, "Unknown RIASEC item.");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw httpErr(400, "RIASEC answer must be an integer 1–5.");
  }
  return n;
}

function computeRiasecScores(session) {
  const items = session.riasecItems || [];
  const answered = items.filter((i) => session.riasecAnswers[i.id] !== undefined).length;
  if (!items.length || answered < items.length) return { scores: null, answered };

  const scores = {};
  for (const type of RIASEC_TYPE_KEYS) {
    const group = items.filter((i) => i.type === type);
    const mean = group.reduce((sum, i) => sum + session.riasecAnswers[i.id], 0) / group.length;
    scores[type] = Math.round(((mean - 1) / 4) * 100);
  }
  return { scores, answered };
}

function deriveRiasecCode(scores) {
  return RIASEC_TYPE_KEYS
    .map((key, index) => ({ key, index, score: scores[key] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((e) => e.key)
    .join("");
}

function buildProgress(session) {
  const demographicTotal = DEMOGRAPHIC_QUESTIONS.length;
  const demographicAnswered = session.demographics
    ? DEMOGRAPHIC_QUESTIONS.filter((q) => session.demographics[q.id] !== undefined).length
    : 0;

  const bigFiveTotal = session.bigFiveItems ? session.bigFiveItems.length : 0;
  const bigFiveAnswered = Object.keys(session.bigFiveAnswers || {}).length;

  // journey.active: the journey question flow only applies when no CV text
  // was submitted; the frontend uses it to size the overall progress bar.
  return {
    step: session.step,
    demographics: { answered: demographicAnswered, total: demographicTotal },
    bigFive: { answered: bigFiveAnswered, total: bigFiveTotal, depth: session.bigFiveDepth },
    riasec: {
      answered: Object.keys(session.riasecAnswers || {}).length,
      total: (session.riasecItems || []).length,
      inferred: session.riasecInferred,
    },
    jobChar: {
      ranked: Boolean(session.jobCharRanking),
      answered: Object.keys(session.jobCharAnswers || {}).length,
      total: (session.jobCharItems || []).length,
    },
    journey: {
      answered: Object.keys(session.careerJourneyAnswers || {}).length,
      total: CAREER_JOURNEY_QUESTIONS.length,
      active: !session.cvText,
    },
    done: session.step === "tree",
  };
}

function summarizeAnswersForClient(session) {
  return {
    demographics: session.demographics || {},
    bigFive: {
      depth: session.bigFiveDepth,
      scores: session.bigFiveScores,
      derivedTraits: session.derivedTraits,
    },
    riasec: {
      scores: session.riasecScores,
      code: session.riasecCode,
      inferred: session.riasecInferred,
    },
    jobChar: {
      ranking: session.jobCharRanking,
      profile: session.jobCharProfile,
    },
  };
}

module.exports = {
  serializeDemographic,
  serializeRiasecItem,
  serializeJobCharItem,
  validateRiasecAnswer,
  computeRiasecScores,
  deriveRiasecCode,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateJobCharRanking,
  validateJobCharAnswer,
  computeJobCharProfile,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  buildProgress,
  summarizeAnswersForClient,
};
