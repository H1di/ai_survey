const {
  QUESTION_POOL,
  TARGET_COUNTS,
  CATEGORY_TARGETS,
} = require("./questionPool");

const QUESTION_BY_ID = new Map(QUESTION_POOL.map((question) => [question.id, question]));

function getQuestionById(questionId) {
  return QUESTION_BY_ID.get(questionId) || null;
}

function getTargetCount(session) {
  return session.premiumDepth ? TARGET_COUNTS.premium : TARGET_COUNTS.core;
}

function getAnswerMap(session) {
  return Object.fromEntries(session.answers.map((item) => [item.questionId, item.answer]));
}

function getCategoryCounts(session) {
  return session.answers.reduce((acc, item) => {
    const question = getQuestionById(item.questionId);

    if (!question) {
      return acc;
    }

    acc[question.category] = (acc[question.category] || 0) + 1;
    return acc;
  }, {});
}

function dependencySatisfied(dep, answerMap) {
  const currentValue = answerMap[dep.id];

  if (currentValue === undefined) {
    return false;
  }

  if (!dep.values || dep.values.length === 0) {
    return true;
  }

  return dep.values.includes(currentValue);
}

function isQuestionAvailable(question, session, answerMap) {
  if (session.answers.some((item) => item.questionId === question.id)) {
    return false;
  }

  if (question.module === "premium" && !session.premiumDepth) {
    return false;
  }

  if (question.dependsOn && question.dependsOn.length > 0) {
    return question.dependsOn.every((dep) => dependencySatisfied(dep, answerMap));
  }

  return true;
}

function isQuestionAvailableForSession(question, session) {
  const answerMap = getAnswerMap(session);
  return isQuestionAvailable(question, session, answerMap);
}

function getQuestionScore(question, session, answerMap, categoryCounts) {
  const categoryTarget = CATEGORY_TARGETS[question.category] || 2;
  const currentCount = categoryCounts[question.category] || 0;
  const deficit = Math.max(0, categoryTarget - currentCount);

  let score = (question.priority || 0) + deficit * 10;

  if (question.kind === "text") {
    score -= 3;
  }

  if (question.boostIf && question.boostIf.length > 0) {
    question.boostIf.forEach((rule) => {
      if (dependencySatisfied(rule, answerMap)) {
        score += 6;
      }
    });
  }

  if (session.entryChoice === "change" && question.category === "career_reality") {
    score += 3;
  }

  if (session.entryChoice === "find" && question.category === "psychology") {
    score += 2;
  }

  const answeredCount = session.answers.length;
  const targetCount = getTargetCount(session);

  if (answeredCount >= targetCount - 2 && question.category === "values") {
    score += 4;
  }

  return score;
}

function pickNextQuestion(session) {
  const answerMap = getAnswerMap(session);
  const categoryCounts = getCategoryCounts(session);

  const candidates = QUESTION_POOL.filter((question) =>
    isQuestionAvailable(question, session, answerMap)
  );

  if (!candidates.length) {
    return null;
  }

  const ranked = candidates
    .map((question) => ({
      question,
      score: getQuestionScore(question, session, answerMap, categoryCounts),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if ((b.question.priority || 0) !== (a.question.priority || 0)) {
        return (b.question.priority || 0) - (a.question.priority || 0);
      }

      return a.question.id.localeCompare(b.question.id);
    });

  return ranked[0].question;
}

function serializeQuestion(question) {
  if (!question) {
    return null;
  }

  return {
    id: question.id,
    category: question.category,
    module: question.module,
    kind: question.kind,
    question: question.question,
    placeholder: question.placeholder || "",
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({ ...option }))
      : [],
  };
}

function normalizeAnswer(question, rawAnswer) {
  if (!question) {
    throw new Error("Question not found.");
  }

  if (question.kind === "text") {
    const normalized = typeof rawAnswer === "string" ? rawAnswer.trim() : "";

    if (!normalized) {
      throw new Error("Text answer cannot be empty.");
    }

    if (normalized.length > 500) {
      throw new Error("Text answer is too long.");
    }

    return normalized;
  }

  const normalized = typeof rawAnswer === "string" ? rawAnswer.trim() : "";

  if (!normalized) {
    throw new Error("Please select an answer.");
  }

  const validOption = question.options.find((option) => option.value === normalized);

  if (!validOption) {
    throw new Error("Invalid answer option.");
  }

  return normalized;
}

function resolveAnswerLabel(question, answer) {
  if (question.kind === "text") {
    return answer;
  }

  return question.options.find((option) => option.value === answer)?.label || answer;
}

function buildProgress(session) {
  const answered = session.answers.length;
  const target = getTargetCount(session);

  return {
    answered,
    target,
    remaining: Math.max(0, target - answered),
    canFinish: answered >= TARGET_COUNTS.minimum,
    done: answered >= target,
  };
}

function summarizeAnswersForClient(session) {
  return session.answers.map((item) => {
    const question = getQuestionById(item.questionId);

    return {
      questionId: item.questionId,
      category: question?.category || "unknown",
      question: question?.question || item.questionId,
      answer: item.answer,
      answerLabel: question ? resolveAnswerLabel(question, item.answer) : item.answer,
    };
  });
}

module.exports = {
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
};
