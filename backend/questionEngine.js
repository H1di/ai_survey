const {
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  VALUES_DIMENSIONS,
  VALUES_QUESTIONS,
  VALUES_BY_ID,
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

function serializeValueQuestion(q) {
  return {
    id: q.id,
    dimension: q.dimension,
    dimensionLabel: q.dimensionLabel,
    dimensionEmoji: q.dimensionEmoji,
    indexInGroup: q.indexInGroup,
    optionA: q.optionA,
    optionB: q.optionB,
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

function validateValuesAnswer(questionId, choice) {
  const q = VALUES_BY_ID.get(questionId);
  if (!q) throw httpErr(404, "Unknown values question.");
  if (choice !== "A" && choice !== "B") {
    throw httpErr(400, "Choice must be 'A' or 'B'.");
  }
  return choice;
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

function computeValuesScores(session) {
  const totals = Object.fromEntries(VALUES_DIMENSIONS.map((d) => [d.id, 0]));
  let answered = 0;
  for (const q of VALUES_QUESTIONS) {
    const choice = session.valuesAnswers[q.id];
    if (choice === undefined) continue;
    answered += 1;
    // The dimension-aligned pole is displayed as B on flipped questions.
    const alignedChoice = q.flip ? "B" : "A";
    if (choice === alignedChoice) totals[q.dimension] += 1;
  }
  if (answered < VALUES_QUESTIONS.length) return { scores: null, answered };
  return { scores: totals, answered };
}

function buildProgress(session) {
  const demographicTotal = DEMOGRAPHIC_QUESTIONS.length;
  const demographicAnswered = session.demographics
    ? DEMOGRAPHIC_QUESTIONS.filter((q) => session.demographics[q.id] !== undefined).length
    : 0;

  const bigFiveTotal = session.bigFiveItems ? session.bigFiveItems.length : 0;
  const bigFiveAnswered = Object.keys(session.bigFiveAnswers || {}).length;

  const valuesTotal = VALUES_QUESTIONS.length;
  const valuesAnswered = Object.keys(session.valuesAnswers || {}).length;

  return {
    step: session.step,
    demographics: { answered: demographicAnswered, total: demographicTotal },
    bigFive: { answered: bigFiveAnswered, total: bigFiveTotal, depth: session.bigFiveDepth },
    values: { answered: valuesAnswered, total: valuesTotal },
    done: session.step === "complete",
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
    values: {
      scores: session.valuesScores,
    },
  };
}

module.exports = {
  serializeDemographic,
  serializeValueQuestion,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateValuesAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeValuesScores,
  buildProgress,
  summarizeAnswersForClient,
};
