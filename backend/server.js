const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const INITIAL_TARGET_COUNT = 3;
const BRANCH_MIN_COUNT = 2;
const BRANCH_MAX_COUNT = 3;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function parseJsonFromContent(content) {
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned an empty response.");
  }

  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Continue with fallback parsing.
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch (_) {
    // Continue with substring parsing.
  }

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = withoutFence.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }

  throw new Error("Could not parse JSON from model output.");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePath(path, index, branchMode) {
  const fallbackTitle = `Life Path ${index + 1}`;
  const title = normalizeText(path?.title) || fallbackTitle;

  if (!branchMode) {
    return {
      title,
      shortDescription: normalizeText(path?.shortDescription),
      dailyLifestyle: normalizeText(path?.dailyLifestyle),
      careerTrajectory: normalizeText(path?.careerTrajectory),
      financialOutlook: normalizeText(path?.financialOutlook),
      risks: normalizeText(path?.risks),
      psychologicalProfile: normalizeText(path?.psychologicalProfile),
      fitWhy: normalizeText(path?.fitWhy),
      keyDifferenceFromParent: "",
      newOpportunities: "",
      newRisks: "",
      isBranch: false,
    };
  }

  const newRisks = normalizeText(path?.newRisks || path?.risks);

  return {
    title,
    shortDescription: normalizeText(path?.description || path?.shortDescription),
    dailyLifestyle: normalizeText(path?.dailyLifestyle),
    careerTrajectory: normalizeText(path?.careerTrajectory),
    financialOutlook: normalizeText(path?.financialOutlook),
    risks: newRisks,
    psychologicalProfile: normalizeText(path?.psychologicalProfile),
    fitWhy: normalizeText(path?.fitWhy || path?.fit),
    keyDifferenceFromParent: normalizeText(
      path?.keyDifferenceFromParent || path?.keyDifference
    ),
    newOpportunities: normalizeText(path?.newOpportunities),
    newRisks,
    isBranch: true,
  };
}

function buildSystemPrompt({ branchMode }) {
  if (!branchMode) {
    return [
      "You are an insightful life and career strategist.",
      "Generate realistic scenarios for the user's future.",
      `Return exactly ${INITIAL_TARGET_COUNT} distinct life paths.`,
      "Return valid JSON only. No markdown, no commentary, no extra keys.",
      'Use this JSON shape: {"paths":[{"title":"","shortDescription":"","dailyLifestyle":"","careerTrajectory":"","financialOutlook":"","risks":"","psychologicalProfile":"","fitWhy":""}]}',
      "Keep every field concise and specific.",
    ].join(" ");
  }

  return [
    "You are an insightful life and career strategist.",
    "Generate deeper path variations from a selected parent path.",
    "Return 2 or 3 options.",
    "Return valid JSON only. No markdown, no commentary, no extra keys.",
    'Use this JSON shape: {"paths":[{"title":"","description":"","keyDifferenceFromParent":"","newRisks":"","newOpportunities":""}]}',
    "Each option must feel like a concrete specialization, not a duplicate.",
  ].join(" ");
}

function buildUserPrompt({ reason, dream, why, parentPath, branchMode }) {
  const base = [
    "User answers:",
    `- Reason: ${reason}`,
    `- Dream: ${dream}`,
    `- Motivation: ${why}`,
  ];

  if (!branchMode) {
    return [
      ...base,
      "Generate 3 possible life paths.",
      "For each path include: title, short description, daily lifestyle, career trajectory, financial outlook, risks, psychological profile, and why this path fits the user.",
    ].join("\n");
  }

  const selectedPath = [
    "Given this life path:",
    `- Title: ${parentPath?.title || ""}`,
    `- Description: ${parentPath?.shortDescription || parentPath?.description || ""}`,
    `- Key difference from parent: ${parentPath?.keyDifferenceFromParent || ""}`,
    `- Risks: ${parentPath?.newRisks || parentPath?.risks || ""}`,
    `- Opportunities: ${parentPath?.newOpportunities || ""}`,
  ].join("\n");

  return [
    ...base,
    selectedPath,
    "Generate 2-3 deeper variations or specializations of this path.",
    "For each include: title, description, key difference from parent path, and new risks and opportunities.",
  ].join("\n\n");
}

async function generatePaths({ reason, dream, why, parentPath, branchMode }) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is missing on the backend.");
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({ branchMode }),
      },
      {
        role: "user",
        content: buildUserPrompt({ reason, dream, why, parentPath, branchMode }),
      },
    ],
  });

  const content = completion?.choices?.[0]?.message?.content;
  const parsed = parseJsonFromContent(content);

  if (!parsed || !Array.isArray(parsed.paths)) {
    throw new Error("Model response did not include a valid paths array.");
  }

  const capped = parsed.paths.slice(
    0,
    branchMode ? BRANCH_MAX_COUNT : INITIAL_TARGET_COUNT
  );

  const normalized = capped.map((path, index) =>
    normalizePath(path, index, branchMode)
  );

  if (!branchMode && normalized.length < INITIAL_TARGET_COUNT) {
    throw new Error("Expected 3 initial paths.");
  }

  if (branchMode && normalized.length < BRANCH_MIN_COUNT) {
    throw new Error("Expected at least 2 branch options.");
  }

  return normalized;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/generate-initial", async (req, res) => {
  try {
    const { reason, dream, why } = req.body || {};

    if (!reason || !dream || !why) {
      return res.status(400).json({
        error: "reason, dream, and why are required.",
      });
    }

    const paths = await generatePaths({
      reason,
      dream,
      why,
      branchMode: false,
    });

    return res.json({ paths });
  } catch (error) {
    console.error("[generate-initial]", error);
    return res.status(500).json({
      error:
        error.message === "OPENAI_API_KEY is missing on the backend."
          ? error.message
          : "Failed to generate life paths.",
    });
  }
});

app.post("/api/generate-branch", async (req, res) => {
  try {
    const { reason, dream, why, parentPath } = req.body || {};

    if (!reason || !dream || !why || !parentPath) {
      return res.status(400).json({
        error: "reason, dream, why, and parentPath are required.",
      });
    }

    const paths = await generatePaths({
      reason,
      dream,
      why,
      parentPath,
      branchMode: true,
    });

    return res.json({ paths });
  } catch (error) {
    console.error("[generate-branch]", error);
    return res.status(500).json({
      error:
        error.message === "OPENAI_API_KEY is missing on the backend."
          ? error.message
          : "Failed to generate deeper life paths.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Life Path Explorer API listening on http://localhost:${PORT}`);
});
