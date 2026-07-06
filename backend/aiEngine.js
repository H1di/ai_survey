const OpenAI = require("openai");
const {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildAnswersDigest,
  buildDirectionQuestionsPrompt,
  buildNarrowingQuestionsPrompt,
  buildProfessionsPrompt,
  buildRoadmapPrompt,
  buildDirectionRefinePrompt,
} = require("./prompts");
const { VALUES_DIMENSIONS } = require("./questionPool");
const { DIRECTIONS, DIRECTION_IDS, getDirection, computeDirection } = require("./directions");
const { getFallbackItems } = require("./bigFiveItems");

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
    // continue
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch (_error) {
    // continue
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Could not parse model JSON output.");
}

function buildSessionDigest(session) {
  return buildProfileDigest({
    entryChoice: session.entryChoice,
    dreamAnswer: session.dreamAnswer,
    demographics: session.demographics,
    bigFiveScores: session.bigFiveScores,
    derivedTraits: session.derivedTraits,
    valuesScores: session.valuesScores,
    valuesDimensions: VALUES_DIMENSIONS,
  });
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (used when there is no API key or the AI call fails)
// ---------------------------------------------------------------------------

// 12 option slots cover 12 distinct directions — no domain repeats, so the
// keyless flow can land anywhere in the catalog, not just knowledge work.
function fallbackDirectionQuestions() {
  return [
    {
      id: "dir_q1",
      text: "Which kind of problem would you happily spend a whole day on?",
      options: [
        { value: "opt_1", label: "Building or fixing a system until it works", directionId: "tech" },
        { value: "opt_2", label: "Helping one person through a difficult situation", directionId: "social" },
        { value: "opt_3", label: "Running an experiment to find out what's true", directionId: "science" },
        { value: "opt_4", label: "Shaping how something looks, feels, and reads", directionId: "design" },
      ],
    },
    {
      id: "dir_q2",
      text: "Which work setting drains you the least?",
      options: [
        { value: "opt_1", label: "Quiet focus with numbers, models, and precision", directionId: "finance" },
        { value: "opt_2", label: "A workshop or site, building with my hands", directionId: "trades" },
        { value: "opt_3", label: "A room where I explain things and people learn", directionId: "education" },
        { value: "opt_4", label: "A busy venue where guests leave happier than they came", directionId: "hospitality" },
      ],
    },
    {
      id: "dir_q3",
      text: "Which result would make you proudest at the end of a year?",
      options: [
        { value: "opt_1", label: "Someone's health or life is concretely better", directionId: "healthcare" },
        { value: "opt_2", label: "A fairer outcome I argued for became real", directionId: "law" },
        { value: "opt_3", label: "Work I created moved an audience", directionId: "arts" },
        { value: "opt_4", label: "A team or athlete I trained hit their best season", directionId: "sports" },
      ],
    },
  ];
}

function fallbackNarrowingQuestions() {
  return [
    {
      id: "nar_q1",
      text: "Day to day, which working mode fits you best?",
      options: [
        { value: "opt_1", label: "Deep solo focus with few interruptions" },
        { value: "opt_2", label: "Constant collaboration inside a team" },
        { value: "opt_3", label: "A mix of craft work and client contact" },
        { value: "opt_4", label: "Coordinating people and decisions" },
      ],
    },
    {
      id: "nar_q2",
      text: "What pace of environment do you want?",
      options: [
        { value: "opt_1", label: "Calm and structured, few surprises" },
        { value: "opt_2", label: "Fast and changing, new problems weekly" },
        { value: "opt_3", label: "Project-based bursts with recovery time" },
        { value: "opt_4", label: "Steady rhythm with clear routines" },
      ],
    },
  ];
}

function fallbackProfessions(direction) {
  const catalogDirection = getDirection(direction?.id) || DIRECTIONS[0];

  return catalogDirection.professionSeeds.map((seed, index) => ({
    id: `prof_${index + 1}`,
    title: seed.title,
    summary: seed.summary,
    whyFit: `Fits your confirmed ${catalogDirection.label} direction and the preferences you expressed in your answers.`,
    dayToDay: `A typical day centers on the core work of a ${seed.title.toLowerCase()}, at a pace matching your stated preferences.`,
  }));
}

function fallbackRoadmap(profession) {
  const title = profession.title;

  const stages = [
    {
      title: "Foundations",
      description: `Learn the core skills every ${title} uses daily. Pick one reputable beginner course and finish it end to end.`,
      timeframe: "2-3 months",
      milestone: "Core concepts applied in small exercises without help.",
    },
    {
      title: "First real projects",
      description: "Build 2-3 small but complete projects that mirror real work, and document them publicly as a portfolio.",
      timeframe: "2-3 months",
      milestone: "A portfolio you can walk a stranger through in 10 minutes.",
    },
    {
      title: "Entry-level readiness",
      description: "Translate the portfolio into a focused CV, practice common interview formats, and apply consistently every week.",
      timeframe: "1-2 months",
      milestone: "First interviews scheduled.",
    },
    {
      title: "First role",
      description: `Land an entry-level or junior ${title} position — prioritize learning environment over salary at this stage.`,
      timeframe: "0-3 months of searching",
      milestone: "Signed offer and first 90 days completed.",
    },
    {
      title: "Credibility milestone",
      description: "Earn the one certification or visible achievement most recognized in this field, chosen with input from seniors around you.",
      timeframe: "3-6 months",
      milestone: "Credential earned and added to your profile.",
    },
    {
      title: `Established ${title}`,
      description: "Deepen a specialization, take ownership of larger pieces of work, and build the track record that defines the target role.",
      timeframe: "12-24 months",
      milestone: "Operating independently at the level you set out to reach.",
    },
  ];

  return {
    professionId: profession.id,
    stages: stages.map((stage, index) => ({ id: `stage_${index + 1}`, ...stage })),
  };
}

function fallbackRefineDirection(session) {
  const rejectedIds = session.rejectedDirections.map((d) => d.id);
  const next = computeDirection(session.directionQuestions, session.directionAnswers, rejectedIds);
  // Refine must always propose something concrete; on a residual tie the
  // earliest tied candidate is the deterministic "next strongest match".
  const pick = next.tie ? next.candidates[0] : next;
  return {
    ...pick,
    reason: "Based on your quiz answers, this is your next strongest match.",
  };
}

// ---------------------------------------------------------------------------
// Normalizers — throw on structurally invalid AI payloads so the caller
// falls back deterministically.
// ---------------------------------------------------------------------------

function normalizeQuestionOption(option, index, { requireDirectionId }) {
  const normalized = {
    value: cleanText(option?.value, `opt_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_"),
    label: cleanText(option?.label),
  };

  if (!normalized.label) {
    throw new Error("Question option missing label.");
  }

  if (requireDirectionId) {
    if (!DIRECTION_IDS.includes(option?.directionId)) {
      throw new Error(`Invalid directionId: ${option?.directionId}`);
    }
    normalized.directionId = option.directionId;
  }

  return normalized;
}

function normalizeQuestionsPayload(payload, { count, idPrefix, requireDirectionId }) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];

  if (questions.length !== count) {
    throw new Error(`Expected ${count} questions, got ${questions.length}.`);
  }

  return questions.map((question, index) => {
    const text = cleanText(question?.text);
    if (!text) {
      throw new Error("Question missing text.");
    }
    const rawOptions = Array.isArray(question?.options) ? question.options : [];
    if (rawOptions.length !== 4) {
      throw new Error(`Question needs exactly 4 options, got ${rawOptions.length}.`);
    }
    return {
      id: `${idPrefix}${index + 1}`,
      text,
      options: rawOptions.map((option, optionIndex) =>
        normalizeQuestionOption(option, optionIndex, { requireDirectionId })
      ),
    };
  });
}

function normalizeProfessionsPayload(payload) {
  const professions = Array.isArray(payload?.professions) ? payload.professions : [];

  if (professions.length !== 3) {
    throw new Error(`Expected exactly 3 professions, got ${professions.length}.`);
  }

  return professions.map((profession, index) => {
    const title = cleanText(profession?.title);
    if (!title) {
      throw new Error("Profession missing title.");
    }
    return {
      id: `prof_${index + 1}`,
      title,
      summary: cleanText(profession?.summary, "A realistic role within your confirmed direction."),
      whyFit: cleanText(profession?.whyFit, "Aligned with your profile and answers."),
      dayToDay: cleanText(profession?.dayToDay, "Day-to-day work typical for this role."),
    };
  });
}

function normalizeRoadmapPayload(payload, profession) {
  let stages = Array.isArray(payload?.stages) ? payload.stages : [];

  if (stages.length > 8) {
    stages = stages.slice(0, 8);
  }
  if (stages.length < 4) {
    throw new Error(`Expected at least 4 roadmap stages, got ${stages.length}.`);
  }

  return {
    professionId: profession.id,
    stages: stages.map((stage, index) => {
      const title = cleanText(stage?.title);
      const description = cleanText(stage?.description);
      if (!title || !description) {
        throw new Error("Roadmap stage missing title or description.");
      }
      return {
        id: `stage_${index + 1}`,
        title,
        description,
        timeframe: cleanText(stage?.timeframe, ""),
        milestone: cleanText(stage?.milestone, ""),
      };
    }),
  };
}

const BIG_FIVE_TRAITS = ["O", "C", "E", "A", "N"];

// Psychometric guardrails for AI-generated Big Five items: the payload is
// only accepted when it is a balanced instrument (exact per-trait counts,
// a real share of reverse-keyed items, no duplicate ids or texts).
function normalizeBigFiveItemsPayload(payload, expected) {
  const raw = Array.isArray(payload?.items) ? payload.items : [];

  const items = raw
    .filter(
      (i) => i && typeof i.text === "string" && i.text.trim() && BIG_FIVE_TRAITS.includes(i.trait)
    )
    .map((i, idx) => ({
      id: `ai_${idx + 1}`,
      trait: i.trait,
      reverse: Boolean(i.reverse),
      text: i.text.trim().slice(0, 200),
    }));

  if (items.length !== expected) {
    throw new Error(`Expected ${expected} valid items, got ${items.length}.`);
  }

  const seenTexts = new Set();
  for (const item of items) {
    const key = item.text.toLowerCase();
    if (seenTexts.has(key)) {
      throw new Error(`Duplicate item text: "${item.text}"`);
    }
    seenTexts.add(key);
  }

  const perTrait = expected / BIG_FIVE_TRAITS.length;
  for (const trait of BIG_FIVE_TRAITS) {
    const group = items.filter((i) => i.trait === trait);
    if (group.length !== perTrait) {
      throw new Error(`Trait ${trait} has ${group.length} items, expected ${perTrait}.`);
    }
    const reversed = group.filter((i) => i.reverse).length;
    const share = reversed / group.length;
    if (share < 0.3 || share > 0.7) {
      throw new Error(`Trait ${trait} reverse share ${share} outside [0.3, 0.7].`);
    }
  }

  return items;
}

function normalizeRefinePayload(payload, rejectedIds) {
  const directionId = payload?.directionId;
  if (!DIRECTION_IDS.includes(directionId) || rejectedIds.includes(directionId)) {
    throw new Error(`Invalid refined directionId: ${directionId}`);
  }
  const dir = getDirection(directionId);
  return {
    id: dir.id,
    label: dir.label,
    reason: cleanText(payload?.reason, "This direction better matches what you described."),
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

function createAiEngine({ apiKey, model }) {
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  async function generateDirectionQuestions({ session }) {
    if (!client) {
      return fallbackDirectionQuestions();
    }

    try {
      const prompts = buildDirectionQuestionsPrompt({
        profileDigest: buildSessionDigest(session),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeQuestionsPayload(parsed, {
        count: 3,
        idPrefix: "dir_q",
        requireDirectionId: true,
      });
    } catch (error) {
      console.error("[AI direction questions fallback]", error.message);
      return fallbackDirectionQuestions();
    }
  }

  async function generateNarrowingQuestions({ session }) {
    if (!client) {
      return fallbackNarrowingQuestions();
    }

    try {
      const prompts = buildNarrowingQuestionsPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeQuestionsPayload(parsed, {
        count: 2,
        idPrefix: "nar_q",
        requireDirectionId: false,
      });
    } catch (error) {
      console.error("[AI narrowing questions fallback]", error.message);
      return fallbackNarrowingQuestions();
    }
  }

  async function generateProfessions({ session }) {
    if (!client) {
      return fallbackProfessions(session.direction);
    }

    try {
      const prompts = buildProfessionsPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
        directionDigest: buildAnswersDigest(session.directionQuestions, session.directionAnswers),
        narrowingDigest: buildAnswersDigest(session.narrowingQuestions, session.narrowingAnswers),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
      });
      return normalizeProfessionsPayload(parsed);
    } catch (error) {
      console.error("[AI professions fallback]", error.message);
      return fallbackProfessions(session.direction);
    }
  }

  async function generateRoadmap({ session }) {
    const profession = session.selectedProfession;

    if (!client) {
      return fallbackRoadmap(profession);
    }

    try {
      const prompts = buildRoadmapPrompt({
        profileDigest: buildSessionDigest(session),
        direction: session.direction,
        profession,
        narrowingDigest: buildAnswersDigest(session.narrowingQuestions, session.narrowingAnswers),
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
      });
      return normalizeRoadmapPayload(parsed, profession);
    } catch (error) {
      console.error("[AI roadmap fallback]", error.message);
      return fallbackRoadmap(profession);
    }
  }

  async function refineDirection({ session, reasonChoice, feedbackText }) {
    if (!client) {
      return fallbackRefineDirection(session);
    }

    try {
      const prompts = buildDirectionRefinePrompt({
        profileDigest: buildSessionDigest(session),
        directionDigest: buildAnswersDigest(session.directionQuestions, session.directionAnswers),
        rejectedDirections: session.rejectedDirections,
        reasonChoice,
        feedbackText,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
      });
      return normalizeRefinePayload(parsed, session.rejectedDirections.map((d) => d.id));
    } catch (error) {
      console.error("[AI refine direction fallback]", error.message);
      return fallbackRefineDirection(session);
    }
  }

  async function generateBigFiveItems({ depth }) {
    // Validated public-domain IPIP sets are the default instrument: every
    // session gets identical, psychometrically anchored items. AI-generated
    // items are experimental and must be opted into explicitly.
    if (!client || process.env.AI_BIG_FIVE_ITEMS !== "true") {
      return getFallbackItems(depth);
    }
    try {
      const { system, user } = buildBigFiveItemsPrompt(depth);
      const parsed = await runJsonCompletion(client, {
        model,
        system,
        user,
        temperature: 0.85,
      });
      return normalizeBigFiveItemsPayload(parsed, depth === "deep" ? 50 : 20);
    } catch (error) {
      console.error("[AI Big Five items fallback]", error.message);
      return getFallbackItems(depth);
    }
  }

  return {
    generateDirectionQuestions,
    generateNarrowingQuestions,
    generateProfessions,
    generateRoadmap,
    refineDirection,
    generateBigFiveItems,
  };
}

module.exports = {
  createAiEngine,
  normalizeBigFiveItemsPayload,
};
