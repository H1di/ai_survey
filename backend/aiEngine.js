const OpenAI = require("openai");
const {
  buildProfileDigest,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
} = require("./prompts");
const { BRANCH_THEMES } = require("./questionPool");

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") {
    throw new Error("Empty model response.");
  }

  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // Continue with fallback extraction.
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch (_error) {
    // Continue with substring extraction.
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Could not parse model JSON output.");
}

function normalizeOptions(options, fallbackPrefix) {
  const normalized = Array.isArray(options)
    ? options
        .map((option, index) => {
          if (typeof option === "string") {
            return {
              value: `option_${index + 1}`,
              label: cleanText(option, `Option ${index + 1}`),
            };
          }

          return {
            value: cleanText(option?.value, `option_${index + 1}`)
              .toLowerCase()
              .replace(/[^a-z0-9_]+/g, "_"),
            label: cleanText(option?.label, `Option ${index + 1}`),
          };
        })
        .filter((option) => option.label.length > 0)
    : [];

  while (normalized.length < 4) {
    const index = normalized.length + 1;
    normalized.push({
      value: `option_${index}`,
      label: `${fallbackPrefix} option ${index}`,
    });
  }

  return normalized.slice(0, 4);
}

function summarizeAnswers(session, questionById) {
  return session.answers.map((item) => {
    const question = questionById.get(item.questionId);
    const label =
      question?.options?.find((option) => option.value === item.answer)?.label ||
      item.answer;

    return {
      question: question?.question || item.questionId,
      answer: item.answer,
      answerLabel: label,
    };
  });
}

function getTheme(themeId) {
  if (!themeId || themeId === "primary") {
    return null;
  }

  return BRANCH_THEMES.find((theme) => theme.id === themeId) || null;
}

function inferPrimaryTitle(session, answerMap) {
  if (session.entryChoice === "change") {
    if (
      ["money", "mostly_money"].includes(answerMap.money_vs_meaning) ||
      ["urgent", "soon"].includes(answerMap.stable_income_timing)
    ) {
      return "Strategic Career Pivot Path";
    }

    if (answerMap.creativity_level === "essential") {
      return "Creative Repositioning Path";
    }

    return "Deliberate Reinvention Path";
  }

  if (answerMap.autonomy_importance === "critical") {
    return "Autonomy-First Career Discovery Path";
  }

  if (["certainty", "mostly_certainty"].includes(answerMap.risk_vs_certainty)) {
    return "Stability-Optimized Career Direction Path";
  }

  return "High-Fit Career Discovery Path";
}

function fallbackInitialBranch(session, themeId, questionById) {
  const answerMap = Object.fromEntries(
    session.answers.map((item) => [item.questionId, item.answer])
  );

  const theme = getTheme(themeId);

  const title =
    themeId === "safe"
      ? "Stability-First Professional Path"
      : themeId === "high_income"
        ? "Income Acceleration Path"
        : themeId === "meaning"
          ? "Purpose-Led Contribution Path"
          : themeId === "creative"
            ? "Creative Independence Path"
            : themeId === "freedom"
              ? "Freedom-by-Design Path"
              : inferPrimaryTitle(session, answerMap);

  const profileDigest = buildProfileDigest({
    entryChoice: session.entryChoice,
    dreamAnswer: session.dreamAnswer,
    answers: summarizeAnswers(session, questionById),
  });

  return {
    title,
    thesis: "A realistic first path that balances aspiration and constraints.",
    whyFit:
      "This path reflects your stated motivation and current tradeoff tolerance, without assuming ideal conditions.",
    firstMilestone:
      "Define a 90-day transition plan: target roles, skill gaps, and one measurable weekly action.",
    constraintsNote:
      cleanText(
        theme
          ? `${theme.label} emphasis applied while preserving real-world feasibility.`
          : "Built around your immediate constraints, not generic career advice.",
        "Built around your immediate constraints, not generic career advice."
      ),
    question: {
      text: "Which tradeoff are you most willing to accept first to make this path real?",
      options: [
        { value: "lower_short_term_income", label: "Lower income for 12-18 months" },
        { value: "slower_pace", label: "Slower progress for lower stress" },
        { value: "higher_intensity", label: "Higher intensity for faster momentum" },
        { value: "identity_shift", label: "Identity shift and beginner discomfort" },
      ],
    },
    _fallback: true,
    _debugProfileDigest: profileDigest,
  };
}

function fallbackEvolution({ branch, node, answerLabel }) {
  const shouldStop = branch.nodes.length >= 6;

  return {
    nextNodeTitle: shouldStop
      ? "Clarity Consolidation"
      : `${branch.title}: ${cleanText(answerLabel, "Next")}`,
    nextNodeSummary: shouldStop
      ? "You now have enough signal to choose and commit to one focused 90-day path experiment."
      : "This step narrows uncertainty by converting preferences into concrete operating constraints.",
    clarityGain: shouldStop
      ? "High"
      : "Medium-high: clearer boundaries and more realistic expectations.",
    riskNote: shouldStop
      ? "Main risk is over-analysis. Move to action and review after real-world feedback."
      : "Main risk is carrying old identity assumptions into a new environment.",
    question: shouldStop
      ? null
      : {
          text: "What should this path optimize next?",
          options: [
            { value: "cash_flow", label: "Cash flow reliability" },
            { value: "skill_compounding", label: "Skill compounding speed" },
            { value: "lifestyle_fit", label: "Lifestyle compatibility" },
            { value: "long_term_optionality", label: "Long-term optionality" },
          ],
        },
    shouldStop,
    _fallback: true,
  };
}

async function runJsonCompletion(client, { model, system, user, temperature = 0.7 }) {
  const completion = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = completion?.choices?.[0]?.message?.content;
  return parseJsonObject(content);
}

function normalizeInitialPayload(payload) {
  return {
    title: cleanText(payload?.title, "Personalized Path"),
    thesis: cleanText(payload?.thesis, "A realistic path shaped by your psychology and constraints."),
    whyFit: cleanText(
      payload?.whyFit,
      "This path aligns with your stated motivations and tradeoff tolerance."
    ),
    firstMilestone: cleanText(
      payload?.firstMilestone,
      "Run one concrete 30-day experiment to test fit and viability."
    ),
    constraintsNote: cleanText(
      payload?.constraintsNote,
      "This path remains bounded by your current life constraints."
    ),
    question: {
      text: cleanText(
        payload?.question?.text,
        "Which tradeoff are you most ready to accept first?"
      ),
      options: normalizeOptions(payload?.question?.options, "Tradeoff"),
    },
  };
}

function normalizeEvolutionPayload(payload) {
  const shouldStop = Boolean(payload?.shouldStop);

  return {
    nextNodeTitle: cleanText(payload?.nextNodeTitle, "Next Decision Point"),
    nextNodeSummary: cleanText(
      payload?.nextNodeSummary,
      "Your branch has become more specific and testable."
    ),
    clarityGain: cleanText(payload?.clarityGain, "More signal around what is realistic."),
    riskNote: cleanText(payload?.riskNote, "Watch for overcommitting before testing assumptions."),
    question: shouldStop
      ? null
      : {
          text: cleanText(
            payload?.question?.text,
            "What should this branch optimize next?"
          ),
          options: normalizeOptions(payload?.question?.options, "Direction"),
        },
    shouldStop,
  };
}

function createAiEngine({ apiKey, model }) {
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  async function generateInitialBranch({ session, themeId, questionById }) {
    const theme = getTheme(themeId);
    const profileDigest = buildProfileDigest({
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      answers: summarizeAnswers(session, questionById),
    });

    if (!client) {
      return fallbackInitialBranch(session, themeId, questionById);
    }

    try {
      const prompts = buildInitialBranchPrompts({
        profileDigest,
        theme,
      });

      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });

      return normalizeInitialPayload(parsed);
    } catch (error) {
      console.error("[AI initial branch fallback]", error.message);
      return fallbackInitialBranch(session, themeId, questionById);
    }
  }

  async function evolveBranch({ session, branch, node, answerLabel, questionById }) {
    const profileDigest = buildProfileDigest({
      entryChoice: session.entryChoice,
      dreamAnswer: session.dreamAnswer,
      answers: summarizeAnswers(session, questionById),
    });

    if (!client) {
      return fallbackEvolution({ branch, node, answerLabel });
    }

    try {
      const prompts = buildEvolutionPrompts({
        profileDigest,
        branch,
        node,
        answerLabel,
      });

      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.75,
      });

      return normalizeEvolutionPayload(parsed);
    } catch (error) {
      console.error("[AI evolve branch fallback]", error.message);
      return fallbackEvolution({ branch, node, answerLabel });
    }
  }

  return {
    generateInitialBranch,
    evolveBranch,
  };
}

module.exports = {
  createAiEngine,
};
