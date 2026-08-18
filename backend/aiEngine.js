const OpenAI = require("openai");
const {
  buildProfileDigest,
  buildRoadmapPrompt,
  buildRiasecInferencePrompt,
  buildCvParsePrompt,
  buildPersonaSummaryPrompt,
  buildOrientedFieldPrompt,
  buildWhyThisFitsPrompt,
  buildOutputDetailPrompt,
} = require("./prompts");
const {
  WORK_VALUES_META,
  buildFallbackProfessionValues,
} = require("./workValues");
const { DIRECTIONS, getDirection } = require("./directions");
const { rankDirections, inferRiasecScores } = require("./riasec");
const { rankOccupations, getOccupation } = require("./onet");

// SOC codes already shown this session — the occupation-level analog of the
// old seed-title dedupe.
function usedSocs(session) {
  return (session.outputs || []).map((o) => o.socCode).filter(Boolean);
}

function sessionRiasec(session) {
  return session.riasecScores ?? inferRiasecScores(session.bigFiveScores);
}

// The AI must pick from the shortlist; hold it to that. Unknown/missing code
// falls back to a title match, then to the top-ranked candidate.
function resolveShortlistSoc(payload, shortlist) {
  if (!Array.isArray(shortlist) || !shortlist.length) return null;
  if (shortlist.some((o) => o.soc === payload?.socCode)) return payload.socCode;
  const title = cleanText(payload?.jobTitle).toLowerCase();
  const match =
    title &&
    shortlist.find((o) => {
      const candidate = o.title.toLowerCase();
      return candidate === title || candidate.includes(title) || title.includes(candidate);
    });
  return match ? match.soc : shortlist[0].soc;
}

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
    dreamAnswer: session.dreamAnswer,
    cvIntent: session.cvIntent,
    demographics: session.demographics,
    bigFiveScores: session.bigFiveScores,
    derivedTraits: session.derivedTraits,
    riasecScores: session.riasecScores,
    riasecCode: session.riasecCode,
    riasecInferred: session.riasecInferred,
    userValues: session.userValues,
    cvAnalysis: session.cvAnalysis,
    cvText: session.cvText,
    careerJourneyAnswers: session.careerJourneyAnswers,
  });
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (used when there is no API key or the AI call fails)
// ---------------------------------------------------------------------------

// Shared shape for every snapshot-grounded fallback output.
function occupationOutput(session, pick) {
  const direction = getDirection(pick.directionId) || DIRECTIONS[0];
  return {
    directionId: pick.directionId,
    socCode: pick.soc,
    orientedField: direction.label,
    jobTitle: pick.title,
    thesis: pick.blurb,
    whyFit: `Your interest profile (${session.riasecCode || "balanced"}) correlates with the measured interests of working ${pick.title} (O*NET ${pick.soc}) — the strongest real-occupation match in the ${direction.label} family.`,
    firstMilestone: `Spend two weeks talking to people doing this work and shadow one full day of a real ${pick.title.toLowerCase()} shift.`,
    constraintsNote:
      "Demo mode — matched from measured O*NET interest profiles by fixed rules; treat it as a structured starting point, not advice.",
  };
}

// Keyless oriented field: walk RIASEC-ranked direction families (minus
// excluded ones) and take the best-correlated unused O*NET occupation.
function fallbackFirstOutput(session, excludeDirectionIds = []) {
  const scores = sessionRiasec(session);
  const ranked = rankDirections(scores, { excludeIds: excludeDirectionIds });
  const excludeSocs = usedSocs(session);
  for (const { id } of ranked) {
    const [pick] = rankOccupations(scores, { directionIds: [id], excludeSocs, limit: 1 });
    if (pick) return occupationOutput(session, pick);
  }
  return fallbackFirstOutputFromSeeds(session, excludeDirectionIds);
}

// Last-resort path for a missing/broken snapshot: the legacy hand-written
// profession seeds.
function fallbackFirstOutputFromSeeds(session, excludeDirectionIds = []) {
  const scores = sessionRiasec(session);
  const ranked = rankDirections(scores, { excludeIds: excludeDirectionIds });
  const direction = getDirection(ranked[0]?.id) || DIRECTIONS[0];
  const usedTitles = new Set((session.outputs || []).map((o) => o.jobTitle));
  const seed =
    direction.professionSeeds.find((s) => !usedTitles.has(s.title)) || direction.professionSeeds[0];

  return {
    directionId: direction.id,
    orientedField: direction.label,
    jobTitle: seed.title,
    thesis: seed.summary,
    whyFit: `Your interest profile (${session.riasecCode || "balanced"}) points to the ${direction.label} family, and this role lines up with the priorities you ranked highest.`,
    firstMilestone: `Spend two weeks talking to working ${seed.title.toLowerCase()}s and shadow one full day of the real work.`,
    constraintsNote:
      "Demo mode — assembled from fixed rules; treat it as a structured starting point, not advice.",
  };
}

function fallbackOutputDetail(session, output) {
  const place = session.demographics?.city || session.demographics?.country || "your area";
  const country = session.demographics?.country || "your country";
  return {
    aiRecommendations: [
      {
        title: "Map the local market",
        detail: `Search current ${output.jobTitle} openings in ${place} and write down the 3 most repeated requirements.`,
      },
      {
        title: "Close the sharpest gap",
        detail: "Pick the one requirement you miss most and plan four weeks of focused practice on it.",
      },
    ],
    events: [
      {
        name: `${output.orientedField} meetups or professional gatherings near ${place}`,
        why: "Direct contact with working practitioners beats any course catalog.",
      },
      {
        name: "An open day or trade fair in the field",
        why: "One afternoon inside the environment tells you more than a week of reading.",
      },
    ],
    universities: [
      {
        name: `A public university or college in ${country}`,
        program: `${output.orientedField} programs — compare entry requirements against your background.`,
      },
      {
        name: "A short certificate program",
        program: "Look for evening or remote formats if you need to keep earning meanwhile.",
      },
    ],
    courses: [
      {
        name: `Foundations of ${output.orientedField}`,
        provider: "A recognized online platform",
        why: "Structured basics before you commit money to a longer program.",
      },
      {
        name: `Practical ${output.jobTitle} skills`,
        provider: "An industry body or local provider",
        why: "Chosen to produce a small portfolio piece, not just a certificate.",
      },
    ],
  };
}

const RIASEC_INTEREST_LABELS = {
  R: "hands-on building",
  I: "investigation and analysis",
  A: "creating and shaping",
  S: "helping and teaching",
  E: "leading and persuading",
  C: "organizing and structure",
};
const BIG_FIVE_TRAIT_LABELS = {
  O: "Openness",
  C: "Conscientiousness",
  E: "Extraversion",
  A: "Agreeableness",
  N: "Neuroticism",
};

// Deterministic whyThisFits: every line quotes the score, rank, or answer it
// rests on — the same traceability rule the AI prompt enforces.
function fallbackWhyThisFits(session, output) {
  const scores = session.bigFiveScores || {};
  const ranked = Object.keys(BIG_FIVE_TRAIT_LABELS)
    .filter((k) => scores[k] !== undefined)
    .sort((a, b) => Math.abs(scores[b] - 50) - Math.abs(scores[a] - 50));
  const personality = ranked.slice(0, 2).map((k) => ({
    point: `${BIG_FIVE_TRAIT_LABELS[k]} ${scores[k]}/100 (${scores[k] >= 50 ? "high" : "low"}) — shapes how the day-to-day work of a ${output.jobTitle} will feel to you.`,
  }));
  while (personality.length < 2) {
    personality.push({ point: `Your balanced profile leaves room to grow into a ${output.jobTitle}.` });
  }

  const topLetter = (session.riasecCode || "").charAt(0);
  const interests = [
    {
      point: topLetter
        ? `Your strongest interest is ${RIASEC_INTEREST_LABELS[topLetter] || topLetter} (code ${session.riasecCode}) — the core of this work.`
        : "Your interest profile was estimated, so treat the interest match as a sketch.",
    },
  ];

  const valueLabelOf = new Map(WORK_VALUES_META.map((m) => [m.id, m.label]));
  const topValue = session.userValues?.order?.[0];
  const values = [
    {
      point: topValue
        ? `You ranked ${valueLabelOf.get(topValue) || topValue} as your top work value — weigh this job against that bar before anything else.`
        : "No confirmed work-value hierarchy — compare the role against what matters most to you.",
    },
  ];

  const cvSkills = (session.cvAnalysis?.skills || []).slice(0, 3);
  const currentSkills =
    cvSkills.length >= 2
      ? cvSkills.map((skill) => ({ point: `${skill} — already on your CV and reusable here.` }))
      : [
          {
            point: session.cvText
              ? "Your CV was recorded but not parsed in demo mode — reread it against this role's needs."
              : "You answered the career-journey questions instead of a CV — your reported experience is the starting point.",
          },
          {
            point:
              session.cvIntent === "use_skills"
                ? "You said you want to build on existing skills — list the three you would defend in an interview."
                : "You said you are open to something completely new — expect to start from fundamentals.",
          },
        ];

  return {
    personality,
    interests,
    values,
    currentSkills,
    skillsToDevelop: buildFallbackSkillsToDevelop(output),
  };
}

// Prefer the occupation's measured O*NET core skills over generic phrasing.
function buildFallbackSkillsToDevelop(output) {
  const onetSkills = (output.socCode && getOccupation(output.socCode)?.skills) || [];
  if (onetSkills.length) {
    return [...onetSkills.slice(0, 3), `Day-to-day tools of a ${output.jobTitle}`];
  }
  return [
    `${output.orientedField} fundamentals`,
    `Day-to-day tools of a ${output.jobTitle}`,
    "A small public portfolio piece",
  ];
}

// Deterministic "who you are" prose: the same bands describeTraits uses,
// phrased second person with the score each sentence rests on named.
function fallbackPersonaSummary(session) {
  const s = session.bigFiveScores;
  if (!s) return "Your personality scores are not available yet.";
  const high = (v) => v >= 65;
  const low = (v) => v <= 35;
  const steadiness = 100 - s.N;
  const sentences = [
    high(s.O)
      ? `New ideas pull you more than routines do (Openness ${s.O}).`
      : low(s.O)
        ? `You trust the proven route over the novel one (Openness ${s.O}).`
        : `You weigh new ideas against proven routines (Openness ${s.O}).`,
    high(s.C)
      ? `You finish what you start and keep things in order (Conscientiousness ${s.C}).`
      : low(s.C)
        ? `You work in bursts of energy, not schedules (Conscientiousness ${s.C}).`
        : `You run on a plan without being ruled by it (Conscientiousness ${s.C}).`,
    high(s.E)
      ? `People and rooms give you energy (Extraversion ${s.E}).`
      : low(s.E)
        ? `You do your best work away from the crowd (Extraversion ${s.E}).`
        : `You move between company and solo work without strain (Extraversion ${s.E}).`,
    high(steadiness)
      ? `You stay level when things go wrong (Emotional Steadiness ${steadiness}).`
      : low(steadiness)
        ? `Pressure lands hard on you, so the environment matters (Emotional Steadiness ${steadiness}).`
        : `You hold steady under everyday pressure (Emotional Steadiness ${steadiness}).`,
  ];
  return sentences.join(" ");
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

// ---------------------------------------------------------------------------
// Normalizers — throw on structurally invalid AI payloads so the caller
// falls back deterministically.
// ---------------------------------------------------------------------------

function normalizeOutputPayload(payload) {
  const output = {
    orientedField: cleanText(payload?.orientedField),
    jobTitle: cleanText(payload?.jobTitle),
    thesis: cleanText(payload?.thesis),
    whyFit: cleanText(payload?.whyFit),
    firstMilestone: cleanText(payload?.firstMilestone),
    constraintsNote: cleanText(payload?.constraintsNote),
  };
  for (const [key, value] of Object.entries(output)) {
    if (!value) throw new Error(`Output missing ${key}.`);
  }

  return output;
}

function normalizeOutputDetailPayload(payload) {
  const block = (list, requiredKeys, name) => {
    const raw = Array.isArray(list) ? list : [];
    const entries = raw
      .map((item) => {
        const entry = {};
        for (const key of requiredKeys) {
          entry[key] = cleanText(item?.[key]);
          if (!entry[key]) return null;
        }
        return entry;
      })
      .filter(Boolean)
      .slice(0, 4);
    if (entries.length < 2) throw new Error(`Detail block ${name} needs at least 2 valid entries.`);
    return entries;
  };

  return {
    aiRecommendations: block(payload?.aiRecommendations, ["title", "detail"], "aiRecommendations"),
    events: block(payload?.events, ["name", "why"], "events"),
    universities: block(payload?.universities, ["name", "program"], "universities"),
    courses: block(payload?.courses, ["name", "provider", "why"], "courses"),
  };
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

const RIASEC_TYPES = ["R", "I", "A", "S", "E", "C"];

function normalizeRiasecScoresPayload(payload) {
  const raw = payload?.scores || {};
  const scores = {};
  for (const key of RIASEC_TYPES) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) throw new Error(`RIASEC score ${key} missing or not a number.`);
    scores[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return scores;
}

function normalizeWhyThisFitsPayload(payload) {
  const points = (list, min, max, name) => {
    const entries = (Array.isArray(list) ? list : [])
      .map((item) => cleanText(item?.point).slice(0, 220))
      .filter(Boolean)
      .slice(0, max)
      .map((point) => ({ point }));
    if (entries.length < min) throw new Error(`whyThisFits ${name} needs at least ${min} points.`);
    return entries;
  };
  const skills = (Array.isArray(payload?.skillsToDevelop) ? payload.skillsToDevelop : [])
    .map((s) => cleanText(s).slice(0, 80))
    .filter(Boolean)
    .slice(0, 4);
  if (skills.length < 3) throw new Error("whyThisFits skillsToDevelop needs 3-4 skills.");
  return {
    personality: points(payload?.personality, 2, 2, "personality"),
    interests: points(payload?.interests, 1, 1, "interests"),
    values: points(payload?.values, 1, 1, "values"),
    currentSkills: points(payload?.currentSkills, 2, 3, "currentSkills"),
    skillsToDevelop: skills,
  };
}

function normalizePersonaSummaryPayload(payload) {
  const summary = cleanText(payload?.summary).slice(0, 700);
  if (!summary) throw new Error("Persona summary missing.");
  const sentences = summary.split(/[.!?]+/).map((t) => t.trim()).filter(Boolean);
  if (sentences.length < 3 || sentences.length > 5) {
    throw new Error(`Persona summary needs 3-5 sentences, got ${sentences.length}.`);
  }
  return summary;
}

function normalizeCvAnalysisPayload(payload) {
  const strings = (list, max) =>
    (Array.isArray(list) ? list : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim().slice(0, 60))
      .slice(0, max);
  const analysis = {
    roles: strings(payload?.roles, 6),
    skills: strings(payload?.skills, 12),
    domains: strings(payload?.domains, 6),
    seniority: cleanText(payload?.seniority, "").slice(0, 80),
    keywords: strings(payload?.keywords, 6),
  };
  if (!analysis.skills.length) throw new Error("CV analysis produced no skills.");
  return analysis;
}

// Shared JSON-mode completion for every generator: sends the system+user
// prompt, enforces the output-token ceiling, and parses the model's JSON so the
// caller's normalizer can validate it (or throw into the deterministic
// fallback). Values are no longer AI-scored — they come from the tournament.
async function runJsonCompletion(client, { model, system, user, temperature = 0.7, maxTokens }) {
  const completion = await client.chat.completions.create({
    model,
    temperature,
    // Explicit output ceiling on every call — an unbounded response is the
    // one OpenAI cost knob nothing else in this file controls.
    ...(Number.isFinite(maxTokens) ? { max_tokens: maxTokens } : {}),
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
  // A hung upstream call must fail fast into the deterministic fallback
  // instead of pinning the request for the SDK's 10-minute default.
  const client = apiKey ? new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 }) : null;

  // The oriented field / 1st Output. excludeDirectionIds carries the field
  // families the user rejected as "not suitable overall".
  async function generateFirstOutput({ session, excludeDirectionIds = [] }) {
    if (!client) {
      return fallbackFirstOutput(session, excludeDirectionIds);
    }
    try {
      const scores = sessionRiasec(session);
      const ranked = rankDirections(scores, { excludeIds: excludeDirectionIds }).slice(0, 5);
      const excludeFields = excludeDirectionIds
        .map((id) => getDirection(id)?.label)
        .filter(Boolean);
      const shortlist = rankOccupations(scores, {
        directionIds: ranked.map((r) => r.id),
        excludeSocs: usedSocs(session),
        limit: 15,
      });
      const prompts = buildOrientedFieldPrompt({
        profileDigest: buildSessionDigest(session),
        directionHint: ranked.map((r) => ({ id: r.id, label: getDirection(r.id)?.label || r.id })),
        excludeFields,
        occupationShortlist: shortlist,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
        maxTokens: 1500,
      });
      // Pin the output to a real shortlist occupation; its family grounds the
      // work-value fallback + notSuitable exclusions even for AI outputs.
      const socCode = resolveShortlistSoc(parsed, shortlist);
      const occupation = socCode ? getOccupation(socCode) : null;
      return {
        directionId: occupation?.directionId || ranked[0]?.id || null,
        socCode,
        ...normalizeOutputPayload(parsed),
      };
    } catch (error) {
      console.error("[AI first output fallback]", error.message);
      return fallbackFirstOutput(session, excludeDirectionIds);
    }
  }

  // Option B (user decision): a separate second call after the output is
  // built — the core output prompt and schema stay untouched.
  async function generateWhyThisFits({ session, output }) {
    if (!client) return fallbackWhyThisFits(session, output);
    try {
      const valueLabelOf = new Map(WORK_VALUES_META.map((m) => [m.id, m.label]));
      const prompts = buildWhyThisFitsPrompt({
        profileDigest: buildSessionDigest(session),
        output,
        topValueLabel: session.userValues?.order?.[0]
          ? valueLabelOf.get(session.userValues.order[0])
          : "",
        onetSkills: (output.socCode && getOccupation(output.socCode)?.skills) || [],
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.6,
        // ~9 bullets ≤220 chars + 4 skill names ≈ 450 tokens; ceiling ≥ 2×.
        maxTokens: 1000,
      });
      return normalizeWhyThisFitsPayload(parsed);
    } catch (error) {
      console.error("[AI whyThisFits fallback]", error.message);
      return fallbackWhyThisFits(session, output);
    }
  }

  async function generateOutputDetail({ session, output }) {
    if (!client) {
      return fallbackOutputDetail(session, output);
    }
    try {
      const prompts = buildOutputDetailPrompt({
        profileDigest: buildSessionDigest(session),
        output,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
        maxTokens: 1500,
      });
      return normalizeOutputDetailPayload(parsed);
    } catch (error) {
      console.error("[AI output detail fallback]", error.message);
      return fallbackOutputDetail(session, output);
    }
  }

  // Roadmap for the ACCEPTED output: profession/direction shims keep the
  // existing prompt and normalizer unchanged.
  async function generateRoadmap({ session, output }) {
    const profession = { id: output.id, title: output.jobTitle, summary: output.thesis };

    if (!client) {
      return fallbackRoadmap(profession);
    }

    try {
      const prompts = buildRoadmapPrompt({
        profileDigest: buildSessionDigest(session),
        direction: { label: output.orientedField },
        profession,
      });
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.7,
        maxTokens: 1500,
      });
      return normalizeRoadmapPayload(parsed, profession);
    } catch (error) {
      console.error("[AI roadmap fallback]", error.message);
      return fallbackRoadmap(profession);
    }
  }

  async function inferRiasecProfile({ session }) {
    if (!client) return inferRiasecScores(session.bigFiveScores);
    try {
      const { system, user } = buildRiasecInferencePrompt({
        bigFiveScores: session.bigFiveScores,
        dreamAnswer: session.dreamAnswer,
      });
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.4, maxTokens: 400 });
      return normalizeRiasecScoresPayload(parsed);
    } catch (error) {
      console.error("[AI riasec inference fallback]", error.message);
      return inferRiasecScores(session.bigFiveScores);
    }
  }

  // Keyless fallback returns an EMPTY signal on purpose: the profile digest
  // then quotes a raw excerpt instead of pretending a parse happened.
  async function analyzeCV({ cvText }) {
    const empty = { roles: [], skills: [], domains: [], seniority: "", keywords: [] };
    if (!client) return empty;
    try {
      const { system, user } = buildCvParsePrompt(cvText);
      // temperature 0: deterministic extraction — creative variance here only
      // costs retries, never adds signal.
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0, maxTokens: 300 });
      return normalizeCvAnalysisPayload(parsed);
    } catch (error) {
      console.error("[AI cv parse fallback]", error.message);
      return empty;
    }
  }

  async function generatePersonaSummary({ session }) {
    if (!client) return fallbackPersonaSummary(session);
    try {
      const { system, user } = buildPersonaSummaryPrompt({
        profileDigest: buildSessionDigest(session),
      });
      // 3-5 sentences ≤700 chars ≈ 200 tokens; ceiling ≥ 2×.
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.6, maxTokens: 400 });
      return normalizePersonaSummaryPayload(parsed);
    } catch (error) {
      console.error("[AI persona summary fallback]", error.message);
      return fallbackPersonaSummary(session);
    }
  }

  return {
    generateRoadmap,
    inferRiasecProfile,
    analyzeCV,
    generatePersonaSummary,
    generateFirstOutput,
    generateWhyThisFits,
    generateOutputDetail,
  };
}

module.exports = {
  createAiEngine,
  runJsonCompletion,
  normalizeRiasecScoresPayload,
  normalizeCvAnalysisPayload,
  normalizePersonaSummaryPayload,
  normalizeWhyThisFitsPayload,
  normalizeOutputPayload,
  resolveShortlistSoc,
  normalizeOutputDetailPayload,
};
