const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const OpenAI = require("openai");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 3001;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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

function normalizePath(path, index) {
  const fallbackTitle = `Life Path ${index + 1}`;

  return {
    title: String(path.title || fallbackTitle).trim(),
    shortDescription: String(path.shortDescription || "").trim(),
    dailyLifestyle: String(path.dailyLifestyle || "").trim(),
    careerTrajectory: String(path.careerTrajectory || "").trim(),
    financialOutlook: String(path.financialOutlook || "").trim(),
    risks: String(path.risks || "").trim(),
    psychologicalProfile: String(path.psychologicalProfile || "").trim(),
    fitWhy: String(path.fitWhy || "").trim(),
  };
}

function buildSystemPrompt({ targetCount, branchMode }) {
  const pathType = branchMode
    ? "sub-paths that evolve from the selected parent path"
    : "life paths";

  return [
    "You are an insightful life and career strategist.",
    "Your task is to generate realistic future scenarios for a user.",
    `Return exactly ${targetCount} distinct ${pathType}.`,
    "Return valid JSON only. No markdown, no commentary, no extra keys.",
    'Use this JSON shape: {"paths":[{"title":"","shortDescription":"","dailyLifestyle":"","careerTrajectory":"","financialOutlook":"","risks":"","psychologicalProfile":"","fitWhy":""}]}',
    "Keep fields concise and concrete.",
    "Write with balanced optimism: practical, non-fantasy, and specific.",
  ].join(" ");
}

function buildUserPrompt({ reason, dream, why, parentPath, branchMode }) {
  const base = [
    `Reason: ${reason}`,
    `Dream: ${dream}`,
    `Motivation: ${why}`,
  ];

  if (!branchMode) {
    base.push(
      "Generate alternative top-level life directions the user could explore."
    );
    return base.join("\n");
  }

  const parentSection = [
    "Selected parent path:",
    `Title: ${parentPath.title || ""}`,
    `Description: ${parentPath.shortDescription || ""}`,
    `Daily lifestyle: ${parentPath.dailyLifestyle || ""}`,
    `Career trajectory: ${parentPath.careerTrajectory || ""}`,
    `Financial outlook: ${parentPath.financialOutlook || ""}`,
    `Risks: ${parentPath.risks || ""}`,
    `Psychological profile: ${parentPath.psychologicalProfile || ""}`,
    `Why it fits: ${parentPath.fitWhy || ""}`,
  ].join("\n");

  return [
    ...base,
    parentSection,
    "Generate deeper sub-path options that branch from this selected path.",
    "These sub-paths should feel like concrete next decisions, not duplicates.",
  ].join("\n\n");
}

async function generatePaths({ reason, dream, why, parentPath, branchMode }) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is missing on the backend.");
  }

  const targetCount = branchMode ? 3 : 3;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt({ targetCount, branchMode }),
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

  const normalized = parsed.paths
    .slice(0, targetCount)
    .map((path, index) => normalizePath(path, index));

  if (normalized.length === 0) {
    throw new Error("No paths were generated.");
  }

  if (branchMode && normalized.length < 2) {
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
