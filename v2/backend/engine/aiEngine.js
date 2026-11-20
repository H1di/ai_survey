// v2 AI generators. Same contract as v1: keyless → deterministic fallback;
// with a key, one JSON call whose payload a normalizer validates, and any
// failure (network, timeout, malformed or off-list payload) falls back.
// The model only ever chooses from closed lists and writes prose.

const OpenAI = require("openai");
const { buildPathPrompt, buildGuidancePrompt, buildTestsDigest } = require("./prompts");
const { defaultPicks } = require("../path/pathEngine");

function cleanText(value, max = 400) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") throw new Error("Empty model response.");
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("Could not parse model JSON output.");
  return JSON.parse(content.slice(first, last + 1));
}

async function runJsonCompletion(client, { model, system, user, maxTokens }) {
  const response = await client.responses.create({
    model,
    reasoning: { effort: "none" },
    // Prompts can carry a minor's answers — never let OpenAI retain them.
    store: false,
    instructions: system,
    input: user,
    max_output_tokens: maxTokens,
    text: { format: { type: "json_object" } },
  });
  return parseJsonObject(response?.output_text);
}

// Keep only picks that are listed candidates of their slot; the assembler
// fills anything missing from the slot's best candidate.
function normalizePathPayload(payload, sets) {
  if (!payload || !Array.isArray(payload.steps)) throw new Error("Path payload has no steps.");
  const picks = {};
  const whyBySlot = {};
  for (const step of payload.steps) {
    const set = sets.find((s) => s.slot.id === step?.slot);
    if (!set || picks[set.slot.id]) continue;
    if (!set.candidates.some((c) => c.course.id === step.courseId)) continue;
    picks[set.slot.id] = step.courseId;
    whyBySlot[set.slot.id] = cleanText(step.why, 200) || null;
  }
  if (!Object.keys(picks).length) throw new Error("No listed course was picked.");
  return { picks, whyBySlot, summary: cleanText(payload.summary, 500), source: "ai" };
}

function fallbackPath({ caseInfo, sets }) {
  return {
    picks: defaultPicks(sets),
    whyBySlot: {},
    summary: `${caseInfo.summary} Each step is the best-fitting course for your answers, chosen by fixed rules.`,
    source: "rules",
  };
}

function normalizeGuidancePayload(payload, facts) {
  const explanation = cleanText(payload?.explanation, 900);
  if (!explanation) throw new Error("Guidance payload has no explanation.");
  const points = (Array.isArray(payload.points) ? payload.points : [])
    .map((p) => cleanText(p, 220))
    .filter(Boolean)
    .slice(0, 4);
  const scenarioNotes = {};
  for (const s of facts.scenarios) {
    const note = cleanText(payload.scenarioNotes?.[s.id], 220);
    if (note) scenarioNotes[s.id] = note;
  }
  return { explanation, points, scenarioNotes, source: "ai" };
}

function fallbackGuidance(facts) {
  const top = facts.interestTop[0];
  const occ = facts.occupations[0];
  const sentences = [];
  if (facts.pathField && facts.pathFieldRank) {
    sentences.push(
      `Your path sits in ${facts.pathField.label}, which is #${facts.pathFieldRank} of 15 fields in your interest test.`
    );
  } else if (top) {
    sentences.push(`Your strongest interest field is ${top.label}.`);
  }
  if (occ) {
    sentences.push(
      `Among real occupations in that field, ${occ.title} matches your interest profile best (fit ${occ.interestFit}/100${
        occ.valuesFit !== null ? `, values fit ${occ.valuesFit}/100` : ""
      }).`
    );
  }
  sentences.push("The scenarios below fill the same steps with a different priority, so you can compare before you commit.");
  const points = facts.interestTop.map((t, i) => `#${i + 1} interest field: ${t.label} (${t.score})`);
  const scenarioNotes = {};
  for (const s of facts.scenarios) {
    scenarioNotes[s.id] =
      s.id === "fastest"
        ? `${s.totals.months} months in total — for when time matters most.`
        : s.id === "cheapest"
          ? `€${s.totals.fees.toLocaleString("en-IE")} in total fees — for when cost matters most.`
          : "Keeps you close to home or online — for when moving is not an option.";
  }
  return { explanation: sentences.join(" "), points, scenarioNotes, source: "rules" };
}

// `client` may be injected (tests); otherwise one is built from the key.
function createAiEngine({ apiKey, model, client: injected = null }) {
  const client = injected || (apiKey ? new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 }) : null);

  async function generate(label, { prompt, maxTokens, normalize, fallback }) {
    if (!client) return fallback();
    try {
      const { system, user } = prompt();
      const parsed = await runJsonCompletion(client, { model, system, user, maxTokens });
      return normalize(parsed);
    } catch (error) {
      console.error(`[AI ${label} fallback]`, error.message);
      return fallback();
    }
  }

  function generatePath({ profile, caseInfo, sets, note, tests }) {
    return generate("path", {
      maxTokens: 900,
      prompt: () => buildPathPrompt({ profile, caseInfo, sets, note, testsDigest: buildTestsDigest(tests) }),
      normalize: (parsed) => normalizePathPayload(parsed, sets),
      fallback: () => fallbackPath({ caseInfo, sets }),
    });
  }

  function generateGuidance({ profile, caseInfo, facts, pathCourses, tests }) {
    return generate("guidance", {
      maxTokens: 900,
      prompt: () => buildGuidancePrompt({ profile, caseInfo, facts, pathCourses, tests }),
      normalize: (parsed) => normalizeGuidancePayload(parsed, facts),
      fallback: () => fallbackGuidance(facts),
    });
  }

  return { generatePath, generateGuidance, enabled: Boolean(client) };
}

module.exports = {
  createAiEngine,
  normalizePathPayload,
  normalizeGuidancePayload,
  fallbackPath,
  fallbackGuidance,
  parseJsonObject,
};
