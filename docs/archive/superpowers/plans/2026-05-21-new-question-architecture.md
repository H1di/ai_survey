# New Question Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 38-question adaptive engine with a 3-step flow (Demographics → AI-generated Big Five → 40 A/B Values Inventory) that feeds 8 dimension scores + Big Five scores + demographics into the career-path AI prompts.

**Architecture:** Three-stage assessment driven by a `session.step` state machine on the backend; the existing branch/graph engine is preserved but receives a richer profile digest. Big Five items are generated per session via OpenAI (with a static IPIP-50 fallback if the API fails). Values inventory items are static (40 hardcoded A/B pairs in 8 dimension groups, 5 each). Frontend keeps its single-file App.jsx structure but replaces the `questions` stage with four new stages.

**Tech Stack:** Node.js + Express (backend/), React 19 + Vite + reactflow (frontend/), OpenAI chat.completions JSON mode (gpt-4.1-mini), in-memory session store.

**Active code only:** `backend/` + `frontend/`. The `server/` + `client/` directories are stale per user decision and will NOT be touched.

---

## File Structure

### Backend (`backend/`)

| File | Status | Responsibility |
|---|---|---|
| `questionPool.js` | **REWRITE** | 3 demographic questions, 40 A/B Values items in 8 dimension groups, dimension metadata, `BRANCH_THEMES` (kept). |
| `bigFiveItems.js` | **NEW** | Static IPIP-20 and IPIP-50 fallback item sets (public-domain), used when AI generation fails. |
| `questionEngine.js` | **REWRITE** | Step-machine: `pickNextQuestion(session)` dispatches by `session.step`. New scoring functions: `computeBigFiveScores`, `deriveBigFiveTraits`, `computeValuesScores`. |
| `sessionStore.js` | **EXTEND** | Add fields: `step`, `demographics`, `bigFiveDepth`, `bigFiveItems`, `bigFiveAnswers`, `bigFiveScores`, `derivedTraits`, `valuesAnswers`, `valuesScores`. New mutators. |
| `server.js` | **EXTEND** | New routes for demographics, depth choice, big-five answer, values answer. Existing branch routes unchanged but use new session model. |
| `prompts.js` | **REWRITE** | New `buildProfileDigest` includes demographics + Big Five scores + derived traits + 8 dim scores. New `buildBigFiveItemsPrompt`. |
| `aiEngine.js` | **EXTEND** | New `generateBigFiveItems({ depth })`. Existing branch generators consume new digest. |

### Frontend (`frontend/src/`)

| File | Status | Responsibility |
|---|---|---|
| `api.js` | **EXTEND** | Add `submitDemographics`, `chooseBigFiveDepth`, `submitBigFiveAnswer`, `submitValuesAnswer`. Remove `setPremiumDepth` and `answerQuestion`. |
| `App.jsx` | **REWRITE** | New stage machine: `entry → demographics → depth_choice → big_five → values → tree`. Replaces old `questions` stage. Existing `tree` stage logic preserved. |
| `App.css` | **EXTEND** | New styles: A/B card, dimension header, Likert row, depth-choice card. |

### Out of scope (do NOT touch)

- `server/` and `client/` directories — confirmed stale by user.
- `BRANCH_THEMES` content — kept as-is (still drives the paid theme branches).
- Existing reactflow graph rendering / evolve logic — kept.

---

## Data Model

### Session shape (extended)

```js
{
  id,
  entryChoice: "change" | "find",
  dreamAnswer: string,
  step: "entry" | "demographics" | "depth_choice" | "big_five" | "values" | "complete",
  demographics: { sex: "male"|"female"|"other"|"prefer_not", age: number, country: string } | null,
  bigFiveDepth: "short" | "deep" | null,            // 20 or 50 items
  bigFiveItems: [ { id, text, trait, reverse } ],   // populated after depth choice
  bigFiveAnswers: { [itemId]: 1..5 },               // Likert
  bigFiveScores: { O, C, E, A, N } | null,          // 0..100 per trait
  derivedTraits: { behaviourTendencies, decisionPriorities } | null,
  valuesAnswers: { [questionId]: "A" | "B" },       // 40 entries when complete
  valuesScores: {                                   // 0..5 per dimension
    economic_return, lifestyle, achievement, intellectual_stimulation,
    meaning_impact, independence, structure, social_environment
  } | null,
  branches: [...],                                  // unchanged
  unlockedThemes: [...],                            // unchanged
  branchCounter: 0,
  createdAt, updatedAt,
}
```

### Values Inventory dimension mapping

| Key | Label | Emoji | Questions |
|---|---|---|---|
| `economic_return` | Economic Return | 💰 | 1–5 |
| `lifestyle` | Lifestyle | 🧘 | 6–10 |
| `achievement` | Achievement | 🚀 | 11–15 |
| `intellectual_stimulation` | Intellectual Stimulation | 🧠 | 16–20 |
| `meaning_impact` | Meaning / Impact | ❤️ | 21–25 |
| `independence` | Independence | 🧭 | 26–30 |
| `structure` | Structure | 🏢 | 31–35 |
| `social_environment` | Social Environment | 👥 | 36–40 |

A = high alignment with dimension (verified across all 40 items). Score = count of A choices in group (0–5).

---

## Task 1: Backend — rewrite `questionPool.js` with new question structures

**Files:**
- Modify (full rewrite): `backend/questionPool.js`

- [ ] **Step 1: Replace `QUESTION_POOL` with demographic and values question structures**

```js
// backend/questionPool.js

const BRANCH_THEMES = [
  { id: "safe", label: "Safe Path", description: "Predictable progress, lower downside, steady compounding.", aiDirective: "Design for stability, lower volatility, and realistic short-term cash-flow security." },
  { id: "high_income", label: "High Income Path", description: "Optimized for earning power and upside over comfort.", aiDirective: "Design for income acceleration and upside, while acknowledging pressure and tradeoffs." },
  { id: "meaning", label: "Meaning Path", description: "Purpose, contribution, and psychological alignment first.", aiDirective: "Design for purpose, contribution, and values congruence over pure status." },
  { id: "creative", label: "Creative Path", description: "Expression, originality, and autonomy in craft.", aiDirective: "Design for creative output, portfolio growth, and identity-based work." },
  { id: "freedom", label: "Freedom Path", description: "Flexibility, autonomy, and life-design optionality.", aiDirective: "Design for autonomy, schedule flexibility, and long-term optionality." },
];

const DEMOGRAPHIC_QUESTIONS = [
  {
    id: "sex",
    kind: "single",
    question: "What is your sex?",
    options: [
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "other", label: "Other / non-binary" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  {
    id: "age",
    kind: "number",
    question: "How old are you?",
    placeholder: "e.g. 32",
    min: 13,
    max: 99,
  },
  {
    id: "country",
    kind: "text",
    question: "Which country are you currently based in?",
    placeholder: "Type your country",
  },
];

const VALUES_DIMENSIONS = [
  { id: "economic_return", label: "Economic Return", emoji: "💰", subtitle: "Money & Security" },
  { id: "lifestyle", label: "Lifestyle", emoji: "🧘", subtitle: "Balance & Time" },
  { id: "achievement", label: "Achievement", emoji: "🚀", subtitle: "Success & Growth" },
  { id: "intellectual_stimulation", label: "Intellectual Stimulation", emoji: "🧠", subtitle: "" },
  { id: "meaning_impact", label: "Meaning / Impact", emoji: "❤️", subtitle: "" },
  { id: "independence", label: "Independence", emoji: "🧭", subtitle: "Autonomy" },
  { id: "structure", label: "Structure", emoji: "🏢", subtitle: "Stability & Order" },
  { id: "social_environment", label: "Social Environment", emoji: "👥", subtitle: "" },
];

// Each row: [dimension_id, A_text, B_text]. 5 rows per dimension, 40 total.
const VALUES_ROWS = [
  // Economic Return
  ["economic_return", "Higher salary with pressure", "Lower salary with comfort"],
  ["economic_return", "Stable income every month", "Income that can grow but is uncertain"],
  ["economic_return", "Financial security long-term", "Opportunity to earn a lot quickly"],
  ["economic_return", "Predictable financial path", "Risky but high-reward opportunities"],
  ["economic_return", "Guaranteed income", "Performance-based income"],
  // Lifestyle
  ["lifestyle", "Free time and flexibility", "Busy schedule with higher rewards"],
  ["lifestyle", "Clear work-life boundaries", "Work blending into life"],
  ["lifestyle", "Fixed hours, predictable routine", "Flexible hours, changing schedule"],
  ["lifestyle", "Energy left after work", "Full commitment to work"],
  ["lifestyle", "Calm pace", "Intense, fast-paced lifestyle"],
  // Achievement
  ["achievement", "Climb career ladder fast", "Stay in stable, comfortable role"],
  ["achievement", "Compete and win", "Collaborate and maintain harmony"],
  ["achievement", "Be recognized for success", "Work without needing recognition"],
  ["achievement", "Constant challenge and growth", "Mastery in a stable role"],
  ["achievement", "Ambitious career trajectory", "Consistent, predictable progression"],
  // Intellectual Stimulation
  ["intellectual_stimulation", "Solve complex problems", "Do clear, structured tasks"],
  ["intellectual_stimulation", "Learn new things constantly", "Use already mastered skills"],
  ["intellectual_stimulation", "Creative thinking", "Practical execution"],
  ["intellectual_stimulation", "Variety of tasks", "Repetition and specialization"],
  ["intellectual_stimulation", "Abstract thinking", "Hands-on, tangible work"],
  // Meaning / Impact
  ["meaning_impact", "Help people directly", "Focus on results and outcomes"],
  ["meaning_impact", "Work that feels meaningful", "Work that is efficient and profitable"],
  ["meaning_impact", "Contribute to society", "Focus on personal success"],
  ["meaning_impact", "Emotional connection to work", "Detachment from work"],
  ["meaning_impact", "Purpose-driven career", "Pragmatic career"],
  // Independence
  ["independence", "Decide how to work", "Follow clear instructions"],
  ["independence", "Freedom in decisions", "Guidance and supervision"],
  ["independence", "Self-directed tasks", "Assigned responsibilities"],
  ["independence", "Control over schedule", "Structured schedule"],
  ["independence", "Independence in work style", "Alignment with system rules"],
  // Structure
  ["structure", "Clear rules and expectations", "Flexible and undefined environment"],
  ["structure", "Stable system", "Constantly changing environment"],
  ["structure", "Predictable tasks", "Uncertain and evolving tasks"],
  ["structure", "Defined career path", "Open, unpredictable future"],
  ["structure", "Organized environment", "Chaotic but dynamic environment"],
  // Social Environment
  ["social_environment", "Work with people constantly", "Work mostly alone"],
  ["social_environment", "Team-based decisions", "Independent decisions"],
  ["social_environment", "Frequent communication", "Minimal interaction"],
  ["social_environment", "Supportive team environment", "Competitive individual environment"],
  ["social_environment", "Build relationships at work", "Focus on tasks over people"],
];

const VALUES_QUESTIONS = VALUES_ROWS.map(([dimension, a, b], index) => {
  const dimIndex = VALUES_DIMENSIONS.findIndex((d) => d.id === dimension);
  const dimensionLabel = VALUES_DIMENSIONS[dimIndex].label;
  return {
    id: `values_${index + 1}`,
    dimension,
    dimensionLabel,
    dimensionEmoji: VALUES_DIMENSIONS[dimIndex].emoji,
    groupIndex: dimIndex,
    indexInGroup: index % 5,
    optionA: a,
    optionB: b,
  };
});

const DEMOGRAPHIC_BY_ID = new Map(DEMOGRAPHIC_QUESTIONS.map((q) => [q.id, q]));
const VALUES_BY_ID = new Map(VALUES_QUESTIONS.map((q) => [q.id, q]));

module.exports = {
  BRANCH_THEMES,
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  VALUES_DIMENSIONS,
  VALUES_QUESTIONS,
  VALUES_BY_ID,
};
```

- [ ] **Step 2: Verify counts**

Run: `node -e "const p=require('./backend/questionPool'); console.log({demo:p.DEMOGRAPHIC_QUESTIONS.length, values:p.VALUES_QUESTIONS.length, dims:p.VALUES_DIMENSIONS.length})"`
Expected: `{ demo: 3, values: 40, dims: 8 }`

- [ ] **Step 3: Commit**

```bash
git add backend/questionPool.js
git commit -m "feat(backend): replace question pool with demographics + 40-item values inventory"
```

---

## Task 2: Backend — add static IPIP fallback item sets in `bigFiveItems.js`

**Files:**
- Create: `backend/bigFiveItems.js`

Public-domain Mini-IPIP-20 (Donnellan 2006) and IPIP-50 (Goldberg 1992). These are used only if the OpenAI call to generate items fails.

- [ ] **Step 1: Create file with 20-item and 50-item sets**

```js
// backend/bigFiveItems.js
// Public-domain IPIP items. Used as fallback when AI generation fails.
// `reverse: true` means answer is reverse-scored against the trait.

const MINI_IPIP_20 = [
  { id: "mip_1",  trait: "E", reverse: false, text: "I am the life of the party." },
  { id: "mip_2",  trait: "A", reverse: false, text: "I sympathize with others' feelings." },
  { id: "mip_3",  trait: "C", reverse: false, text: "I get chores done right away." },
  { id: "mip_4",  trait: "N", reverse: false, text: "I have frequent mood swings." },
  { id: "mip_5",  trait: "O", reverse: false, text: "I have a vivid imagination." },
  { id: "mip_6",  trait: "E", reverse: true,  text: "I don't talk a lot." },
  { id: "mip_7",  trait: "A", reverse: true,  text: "I am not interested in other people's problems." },
  { id: "mip_8",  trait: "C", reverse: true,  text: "I have difficulty understanding abstract ideas." },
  { id: "mip_9",  trait: "N", reverse: true,  text: "I am relaxed most of the time." },
  { id: "mip_10", trait: "O", reverse: true,  text: "I am not interested in abstract ideas." },
  { id: "mip_11", trait: "E", reverse: false, text: "I talk to a lot of different people at parties." },
  { id: "mip_12", trait: "A", reverse: false, text: "I feel others' emotions." },
  { id: "mip_13", trait: "C", reverse: true,  text: "I often forget to put things back in their proper place." },
  { id: "mip_14", trait: "N", reverse: false, text: "I get upset easily." },
  { id: "mip_15", trait: "O", reverse: false, text: "I have excellent ideas." },
  { id: "mip_16", trait: "E", reverse: true,  text: "I keep in the background." },
  { id: "mip_17", trait: "A", reverse: true,  text: "I am not really interested in others." },
  { id: "mip_18", trait: "C", reverse: true,  text: "I make a mess of things." },
  { id: "mip_19", trait: "N", reverse: true,  text: "I seldom feel blue." },
  { id: "mip_20", trait: "O", reverse: true,  text: "I do not have a good imagination." },
];

const IPIP_50 = [
  // Extraversion (E) — 10 items
  { id: "ipip_1",  trait: "E", reverse: false, text: "I am the life of the party." },
  { id: "ipip_2",  trait: "E", reverse: true,  text: "I don't talk a lot." },
  { id: "ipip_3",  trait: "E", reverse: false, text: "I feel comfortable around people." },
  { id: "ipip_4",  trait: "E", reverse: true,  text: "I keep in the background." },
  { id: "ipip_5",  trait: "E", reverse: false, text: "I start conversations." },
  { id: "ipip_6",  trait: "E", reverse: true,  text: "I have little to say." },
  { id: "ipip_7",  trait: "E", reverse: false, text: "I talk to a lot of different people at parties." },
  { id: "ipip_8",  trait: "E", reverse: true,  text: "I don't like to draw attention to myself." },
  { id: "ipip_9",  trait: "E", reverse: false, text: "I don't mind being the center of attention." },
  { id: "ipip_10", trait: "E", reverse: true,  text: "I am quiet around strangers." },
  // Agreeableness (A)
  { id: "ipip_11", trait: "A", reverse: true,  text: "I feel little concern for others." },
  { id: "ipip_12", trait: "A", reverse: false, text: "I am interested in people." },
  { id: "ipip_13", trait: "A", reverse: true,  text: "I insult people." },
  { id: "ipip_14", trait: "A", reverse: false, text: "I sympathize with others' feelings." },
  { id: "ipip_15", trait: "A", reverse: true,  text: "I am not interested in other people's problems." },
  { id: "ipip_16", trait: "A", reverse: false, text: "I have a soft heart." },
  { id: "ipip_17", trait: "A", reverse: true,  text: "I am not really interested in others." },
  { id: "ipip_18", trait: "A", reverse: false, text: "I take time out for others." },
  { id: "ipip_19", trait: "A", reverse: false, text: "I feel others' emotions." },
  { id: "ipip_20", trait: "A", reverse: false, text: "I make people feel at ease." },
  // Conscientiousness (C)
  { id: "ipip_21", trait: "C", reverse: false, text: "I am always prepared." },
  { id: "ipip_22", trait: "C", reverse: true,  text: "I leave my belongings around." },
  { id: "ipip_23", trait: "C", reverse: false, text: "I pay attention to details." },
  { id: "ipip_24", trait: "C", reverse: true,  text: "I make a mess of things." },
  { id: "ipip_25", trait: "C", reverse: false, text: "I get chores done right away." },
  { id: "ipip_26", trait: "C", reverse: true,  text: "I often forget to put things back in their proper place." },
  { id: "ipip_27", trait: "C", reverse: false, text: "I like order." },
  { id: "ipip_28", trait: "C", reverse: true,  text: "I shirk my duties." },
  { id: "ipip_29", trait: "C", reverse: false, text: "I follow a schedule." },
  { id: "ipip_30", trait: "C", reverse: false, text: "I am exacting in my work." },
  // Neuroticism (N)
  { id: "ipip_31", trait: "N", reverse: false, text: "I get stressed out easily." },
  { id: "ipip_32", trait: "N", reverse: true,  text: "I am relaxed most of the time." },
  { id: "ipip_33", trait: "N", reverse: false, text: "I worry about things." },
  { id: "ipip_34", trait: "N", reverse: true,  text: "I seldom feel blue." },
  { id: "ipip_35", trait: "N", reverse: false, text: "I am easily disturbed." },
  { id: "ipip_36", trait: "N", reverse: false, text: "I get upset easily." },
  { id: "ipip_37", trait: "N", reverse: false, text: "I change my mood a lot." },
  { id: "ipip_38", trait: "N", reverse: false, text: "I have frequent mood swings." },
  { id: "ipip_39", trait: "N", reverse: false, text: "I get irritated easily." },
  { id: "ipip_40", trait: "N", reverse: false, text: "I often feel blue." },
  // Openness (O)
  { id: "ipip_41", trait: "O", reverse: false, text: "I have a rich vocabulary." },
  { id: "ipip_42", trait: "O", reverse: true,  text: "I have difficulty understanding abstract ideas." },
  { id: "ipip_43", trait: "O", reverse: false, text: "I have a vivid imagination." },
  { id: "ipip_44", trait: "O", reverse: true,  text: "I am not interested in abstract ideas." },
  { id: "ipip_45", trait: "O", reverse: false, text: "I have excellent ideas." },
  { id: "ipip_46", trait: "O", reverse: true,  text: "I do not have a good imagination." },
  { id: "ipip_47", trait: "O", reverse: false, text: "I am quick to understand things." },
  { id: "ipip_48", trait: "O", reverse: false, text: "I use difficult words." },
  { id: "ipip_49", trait: "O", reverse: false, text: "I spend time reflecting on things." },
  { id: "ipip_50", trait: "O", reverse: false, text: "I am full of ideas." },
];

function getFallbackItems(depth) {
  return depth === "deep" ? IPIP_50 : MINI_IPIP_20;
}

module.exports = { MINI_IPIP_20, IPIP_50, getFallbackItems };
```

- [ ] **Step 2: Verify item counts and trait distribution**

Run: `node -e "const m=require('./backend/bigFiveItems'); const c=(s)=>s.reduce((a,i)=>{a[i.trait]=(a[i.trait]||0)+1;return a;},{}); console.log({mini20:c(m.MINI_IPIP_20),ipip50:c(m.IPIP_50)})"`
Expected: both objects have `O, C, E, A, N` with 4 items each (mini) and 10 each (full).

- [ ] **Step 3: Commit**

```bash
git add backend/bigFiveItems.js
git commit -m "feat(backend): add static IPIP-20 and IPIP-50 fallback item pools"
```

---

## Task 3: Backend — rewrite `questionEngine.js` to drive the step machine and compute scores

**Files:**
- Modify (full rewrite): `backend/questionEngine.js`

- [ ] **Step 1: Replace file contents**

```js
// backend/questionEngine.js
const {
  DEMOGRAPHIC_QUESTIONS,
  DEMOGRAPHIC_BY_ID,
  VALUES_DIMENSIONS,
  VALUES_QUESTIONS,
  VALUES_BY_ID,
} = require("./questionPool");

const TRAIT_KEYS = ["O", "C", "E", "A", "N"];

// === step-machine dispatch ===

function pickNextQuestion(session) {
  switch (session.step) {
    case "demographics":
      return pickNextDemographic(session);
    case "big_five":
      return pickNextBigFive(session);
    case "values":
      return pickNextValue(session);
    default:
      return null;
  }
}

function pickNextDemographic(session) {
  for (const q of DEMOGRAPHIC_QUESTIONS) {
    if (!session.demographics || session.demographics[q.id] === undefined) {
      return { stage: "demographics", question: serializeDemographic(q) };
    }
  }
  return null;
}

function pickNextBigFive(session) {
  if (!session.bigFiveItems || !session.bigFiveItems.length) {
    return null;
  }
  for (const item of session.bigFiveItems) {
    if (session.bigFiveAnswers[item.id] === undefined) {
      return { stage: "big_five", question: { ...item } };
    }
  }
  return null;
}

function pickNextValue(session) {
  for (const q of VALUES_QUESTIONS) {
    if (session.valuesAnswers[q.id] === undefined) {
      return { stage: "values", question: serializeValueQuestion(q) };
    }
  }
  return null;
}

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

// === validation ===

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

// === scoring ===

function computeBigFiveScores(session) {
  if (!session.bigFiveItems || !session.bigFiveItems.length) return null;

  const sum = { O: 0, C: 0, E: 0, A: 0, N: 0 };
  const count = { O: 0, C: 0, E: 0, A: 0, N: 0 };

  for (const item of session.bigFiveItems) {
    const raw = session.bigFiveAnswers[item.id];
    if (raw === undefined) return null; // not finished yet
    const scored = item.reverse ? 6 - raw : raw;
    sum[item.trait] += scored;
    count[item.trait] += 1;
  }

  const scores = {};
  for (const k of TRAIT_KEYS) {
    if (!count[k]) {
      scores[k] = 50;
    } else {
      // mean of 1..5 → percent 0..100
      const mean = sum[k] / count[k];
      scores[k] = Math.round(((mean - 1) / 4) * 100);
    }
  }
  return scores;
}

function deriveBigFiveTraits(scores) {
  if (!scores) return null;
  // Two higher-order factors:
  //   Stability (behaviour tendencies) = avg(A, C, inverted N)
  //   Plasticity (decision priorities) = avg(O, E)
  const invertedN = 100 - scores.N;
  const behaviourTendencies = Math.round((scores.A + scores.C + invertedN) / 3);
  const decisionPriorities = Math.round((scores.O + scores.E) / 2);
  return {
    behaviourTendencies,
    decisionPriorities,
    summary: describeTraits({ behaviourTendencies, decisionPriorities, scores }),
  };
}

function describeTraits({ behaviourTendencies, decisionPriorities, scores }) {
  const high = (v) => v >= 65;
  const low = (v) => v <= 35;
  const parts = [];
  parts.push(
    high(behaviourTendencies)
      ? "Behaviour tendencies: steady, organized, low-volatility under stress."
      : low(behaviourTendencies)
        ? "Behaviour tendencies: volatile, reactive, less structured."
        : "Behaviour tendencies: balanced steadiness."
  );
  parts.push(
    high(decisionPriorities)
      ? "Decision priorities: novelty-seeking, exploratory, energized by people and ideas."
      : low(decisionPriorities)
        ? "Decision priorities: conservative, prefers depth and routine over novelty."
        : "Decision priorities: balanced between exploration and routine."
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
    if (choice === "A") totals[q.dimension] += 1;
  }
  if (answered < VALUES_QUESTIONS.length) return { scores: null, answered };
  return { scores: totals, answered };
}

// === progress ===

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

// === client-facing summary of answers (for debugging / digest) ===

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
  pickNextQuestion,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateValuesAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeValuesScores,
  buildProgress,
  summarizeAnswersForClient,
};
```

- [ ] **Step 2: Smoke test scoring**

Run:
```bash
node -e "
const e = require('./backend/questionEngine');
const s = {
  bigFiveItems: [
    {id:'a',trait:'O',reverse:false},
    {id:'b',trait:'O',reverse:true}
  ],
  bigFiveAnswers: { a: 5, b: 1 },
  valuesAnswers: {}
};
console.log(e.computeBigFiveScores(s));
"
```
Expected: `{ O: 100, C: 50, E: 50, A: 50, N: 50 }` (both items score max because b is reverse-scored: 6-1=5; mean 5 → 100%).

- [ ] **Step 3: Commit**

```bash
git add backend/questionEngine.js
git commit -m "feat(backend): rewrite question engine as step machine with Big Five + values scoring"
```

---

## Task 4: Backend — extend `sessionStore.js` with the new session model

**Files:**
- Modify: `backend/sessionStore.js`

- [ ] **Step 1: Add new fields to `createSession` and add mutators**

Replace `createSession` and add new methods. Apply this set of changes:

```js
// In createSession, the returned session must include:
{
  id,
  entryChoice,
  dreamAnswer,
  step: "demographics",
  demographics: {},
  bigFiveDepth: null,
  bigFiveItems: [],
  bigFiveAnswers: {},
  bigFiveScores: null,
  derivedTraits: null,
  valuesAnswers: {},
  valuesScores: null,
  branches: [],
  unlockedThemes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  branchCounter: 0,
}
// (Drop the old `premiumDepth` and `answers` fields.)
```

Remove `setPremiumDepth` and `upsertAnswer`. Add these methods:

```js
setDemographicAnswer(session, questionId, value) {
  session.demographics[questionId] = value;
  this.touch(session);
}

advanceStep(session, nextStep) {
  session.step = nextStep;
  this.touch(session);
}

setBigFiveDepthAndItems(session, depth, items) {
  session.bigFiveDepth = depth;
  session.bigFiveItems = items;
  session.bigFiveAnswers = {};
  session.bigFiveScores = null;
  session.derivedTraits = null;
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

recordValuesAnswer(session, questionId, choice) {
  session.valuesAnswers[questionId] = choice;
  this.touch(session);
}

setValuesScores(session, scores) {
  session.valuesScores = scores;
  this.touch(session);
}
```

- [ ] **Step 2: Update `serializeSessionState` to expose new fields and drop premium/answers**

```js
serializeSessionState(session, progress, summary) {
  return {
    sessionId: session.id,
    entryChoice: session.entryChoice,
    dreamAnswer: session.dreamAnswer,
    step: session.step,
    demographics: session.demographics,
    bigFiveDepth: session.bigFiveDepth,
    bigFiveScores: session.bigFiveScores,
    derivedTraits: session.derivedTraits,
    valuesScores: session.valuesScores,
    progress,
    summary,
    branches: session.branches,
    unlockedThemes: [...session.unlockedThemes],
    themes: BRANCH_THEMES,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/sessionStore.js
git commit -m "feat(backend): extend session store with demographics, Big Five, and values state"
```

---

## Task 5: Backend — rewrite `prompts.js` with new profile digest and Big Five item-generation prompt

**Files:**
- Modify (full rewrite): `backend/prompts.js`

- [ ] **Step 1: Replace contents**

```js
// backend/prompts.js

const BASE_SYSTEM = [
  "You are an elite career strategist and life-design psychologist.",
  "This is not a quiz. You are building realistic, emotionally honest, practical futures.",
  "Respect constraints. Do not hallucinate impossible paths.",
  "Tone: elegant, calm, intelligent, specific.",
  "Write concise outputs and avoid buzzwords.",
].join(" ");

function buildProfileDigest({
  entryChoice,
  dreamAnswer,
  demographics,
  bigFiveScores,
  derivedTraits,
  valuesScores,
  valuesDimensions,
}) {
  const lines = [];
  lines.push(`Entry intent: ${entryChoice}`);
  lines.push(`Dream answer: ${dreamAnswer}`);

  if (demographics && Object.keys(demographics).length) {
    lines.push("Demographics:");
    if (demographics.sex !== undefined) lines.push(`- Sex: ${demographics.sex}`);
    if (demographics.age !== undefined) lines.push(`- Age: ${demographics.age}`);
    if (demographics.country !== undefined) lines.push(`- Country: ${demographics.country}`);
  }

  if (bigFiveScores) {
    lines.push("Big Five (0–100):");
    lines.push(`- Openness: ${bigFiveScores.O}`);
    lines.push(`- Conscientiousness: ${bigFiveScores.C}`);
    lines.push(`- Extraversion: ${bigFiveScores.E}`);
    lines.push(`- Agreeableness: ${bigFiveScores.A}`);
    lines.push(`- Neuroticism: ${bigFiveScores.N}`);
  }

  if (derivedTraits) {
    lines.push(
      `Derived: behaviour tendencies=${derivedTraits.behaviourTendencies}, decision priorities=${derivedTraits.decisionPriorities}.`
    );
    if (derivedTraits.summary) lines.push(`Trait summary: ${derivedTraits.summary}`);
  }

  if (valuesScores && valuesDimensions) {
    lines.push("Values inventory (0–5, A-choices per dimension):");
    for (const dim of valuesDimensions) {
      const score = valuesScores[dim.id];
      if (score === undefined) continue;
      lines.push(`- ${dim.emoji} ${dim.label}: ${score}/5`);
    }
  }

  return lines.join("\n");
}

function buildBigFiveItemsPrompt(depth) {
  const count = depth === "deep" ? 50 : 20;
  const perTrait = count / 5;

  const system = [
    "You generate Big Five (OCEAN) self-report items in the style of the IPIP item pool.",
    "Return valid JSON only. No prose, no markdown fences, no commentary.",
    `JSON schema: {"items":[{"id":"item_1","trait":"O|C|E|A|N","reverse":true|false,"text":"..."}]}`,
    `Generate exactly ${count} items.`,
    `Distribute exactly ${perTrait} items per trait across O, C, E, A, N.`,
    "Roughly half of each trait's items should be reverse-keyed (reverse: true).",
    "Each `text` is a first-person statement (e.g., 'I am the life of the party.', 'I rarely worry.').",
    "Items must be answerable on a 1–5 Likert (Strongly disagree → Strongly agree).",
    "Avoid double-barrelled or negated-twice phrasings. Keep each item under 90 characters.",
    "Use varied phrasings per session; do not output identical wording each call.",
  ].join(" ");

  const user = `Generate ${count} Big Five items now.`;

  return { system, user };
}

function buildInitialBranchPrompts({ profileDigest, theme }) {
  const themeLine =
    theme && theme !== "primary"
      ? `Thematic emphasis: ${theme.label}. ${theme.aiDirective}`
      : "Thematic emphasis: Primary baseline branch that best fits the user right now.";

  const system = [
    BASE_SYSTEM,
    "Generate one initial life path branch.",
    "Integrate demographics, Big Five personality scores, derived traits, and the 8-dimension values inventory.",
    "Reflect the user's strongest values dimensions (highest scores) in the path's tradeoffs.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"title":"","thesis":"","whyFit":"","firstMilestone":"","constraintsNote":"","question":{"text":"","options":[{"value":"","label":""}]}}',
    "question.options must have exactly 4 options.",
    "The question must be a realistic tradeoff question about this path.",
  ].join(" ");

  const user = [
    themeLine,
    "Build the first branch node.",
    "Profile:",
    profileDigest,
    "Constraints:",
    "- Keep the branch realistic and grounded in labor-market reality.",
    "- Avoid generic motivational language.",
    "- Reflect the dominant values dimensions in the whyFit copy.",
    "- The branch should feel immediately actionable.",
  ].join("\n\n");

  return { system, user };
}

function buildEvolutionPrompts({ profileDigest, branch, node, answerLabel }) {
  const system = [
    BASE_SYSTEM,
    "Evolve one branch step after the user answered a tradeoff question.",
    "Return valid JSON only and no extra keys.",
    'JSON schema: {"nextNodeTitle":"","nextNodeSummary":"","clarityGain":"","riskNote":"","question":{"text":"","options":[{"value":"","label":""}]},"shouldStop":false}',
    "question.options must have exactly 4 options.",
    "Continue to reflect the user's values dimensions and personality scores in the tradeoff design.",
    "If clarity is already high, you may set shouldStop true.",
  ].join(" ");

  const user = [
    `Branch theme: ${branch.themeLabel}`,
    `Current branch title: ${branch.title}`,
    `Current node title: ${node.title}`,
    `Current node summary: ${node.summary}`,
    `User answered: ${answerLabel}`,
    "Generate the next node that logically follows from this answer.",
    "Profile:",
    profileDigest,
    "Requirements:",
    "- Keep it concrete and realistic.",
    "- Explicitly reflect tradeoffs.",
    "- The next question must pressure-test feasibility or life satisfaction.",
  ].join("\n\n");

  return { system, user };
}

module.exports = {
  buildProfileDigest,
  buildBigFiveItemsPrompt,
  buildInitialBranchPrompts,
  buildEvolutionPrompts,
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/prompts.js
git commit -m "feat(backend): rewrite profile digest and add Big Five item-generation prompt"
```

---

## Task 6: Backend — extend `aiEngine.js` with `generateBigFiveItems` and new digest call sites

**Files:**
- Modify: `backend/aiEngine.js`

- [ ] **Step 1: Add `generateBigFiveItems` and refactor `buildProfileDigest` callers**

Add this near the top, after the `require`s:

```js
const { VALUES_DIMENSIONS } = require("./questionPool");
const { getFallbackItems } = require("./bigFiveItems");
const { buildBigFiveItemsPrompt } = require("./prompts");
```

Replace the `summarizeAnswers` helper (no longer relevant — there are no free-text question answers anymore) with a digest builder that pulls structured fields from `session`:

```js
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
```

Delete `summarizeAnswers`, `inferPrimaryTitle`'s references to old fields, and update the fallback to use the new digest. The fallback `inferPrimaryTitle` now uses `session.valuesScores`:

```js
function inferPrimaryTitle(session) {
  const v = session.valuesScores || {};
  const top = Object.entries(v).sort((a, b) => b[1] - a[1])[0];

  if (session.entryChoice === "change") {
    if (top?.[0] === "economic_return") return "Strategic Career Pivot Path";
    if (top?.[0] === "intellectual_stimulation") return "Creative Repositioning Path";
    return "Deliberate Reinvention Path";
  }
  if (top?.[0] === "independence") return "Autonomy-First Career Discovery Path";
  if (top?.[0] === "structure") return "Stability-Optimized Career Direction Path";
  return "High-Fit Career Discovery Path";
}
```

Update `fallbackInitialBranch` and `generateInitialBranch` / `evolveBranch` to call `buildSessionDigest(session)` instead of the old `summarizeAnswers`/`buildProfileDigest` pair. Drop the `questionById` parameter — it is no longer used.

Add the new function at the bottom of `createAiEngine`:

```js
async function generateBigFiveItems({ depth }) {
  if (!client) {
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
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const expected = depth === "deep" ? 50 : 20;
    const normalized = items
      .filter((i) => i && typeof i.text === "string" && ["O","C","E","A","N"].includes(i.trait))
      .map((i, idx) => ({
        id: typeof i.id === "string" && i.id ? i.id : `ai_${idx + 1}`,
        trait: i.trait,
        reverse: Boolean(i.reverse),
        text: i.text.trim().slice(0, 200),
      }));
    if (normalized.length !== expected) {
      console.warn("[AI Big Five items] count mismatch, using fallback");
      return getFallbackItems(depth);
    }
    return normalized;
  } catch (error) {
    console.error("[AI Big Five items fallback]", error.message);
    return getFallbackItems(depth);
  }
}
```

Return it from `createAiEngine` alongside the existing functions:

```js
return {
  generateInitialBranch,
  evolveBranch,
  generateBigFiveItems,
};
```

- [ ] **Step 2: Smoke test (without API key) — fallback path returns 20 items**

Run:
```bash
node -e "
const { createAiEngine } = require('./backend/aiEngine');
const eng = createAiEngine({ apiKey: null, model: 'x' });
eng.generateBigFiveItems({ depth: 'short' }).then(items => console.log('count:', items.length, 'first:', items[0].text));
"
```
Expected: `count: 20  first: I am the life of the party.`

- [ ] **Step 3: Commit**

```bash
git add backend/aiEngine.js
git commit -m "feat(backend): add Big Five item generator and rewire digest to new session model"
```

---

## Task 7: Backend — extend `server.js` with the new step-machine routes

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Update imports**

Replace the imports at the top of server.js with:

```js
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const { createAiEngine } = require("./aiEngine");
const { BRANCH_THEMES, VALUES_DIMENSIONS, DEMOGRAPHIC_QUESTIONS } = require("./questionPool");
const {
  pickNextQuestion,
  validateDemographicAnswer,
  validateBigFiveAnswer,
  validateValuesAnswer,
  computeBigFiveScores,
  deriveBigFiveTraits,
  computeValuesScores,
  buildProgress,
  summarizeAnswersForClient,
} = require("./questionEngine");
const { SessionStore } = require("./sessionStore");
```

- [ ] **Step 2: Replace `/api/session/start` to drop premium + answers and return the first demographic question**

```js
app.post("/api/session/start", (req, res) => {
  const { entryChoice, dreamAnswer } = req.body || {};

  if (!isValidEntryChoice(entryChoice)) {
    return res.status(400).json({ error: "entryChoice must be 'change' or 'find'." });
  }
  const normalizedDream = typeof dreamAnswer === "string" ? dreamAnswer.trim() : "";
  if (!normalizedDream) {
    return res.status(400).json({ error: "dreamAnswer is required." });
  }

  const session = store.createSession({
    entryChoice,
    dreamAnswer: normalizedDream,
  });

  return sendSessionSnapshot(res, session, {
    nextQuestion: pickNextQuestion(session),
    valuesDimensions: VALUES_DIMENSIONS,
  });
});
```

- [ ] **Step 3: Remove `/api/session/premium` and `/api/questions/answer` and add four new routes**

Delete:
```js
app.post("/api/session/premium", ...);
app.post("/api/questions/answer", ...);
```

Add in their place:

```js
// Demographics
app.post("/api/session/demographics", (req, res) => {
  try {
    const { sessionId, questionId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "demographics") {
      return res.status(400).json({ error: "Session is past the demographics step." });
    }
    const normalized = validateDemographicAnswer(questionId, value);
    store.setDemographicAnswer(session, questionId, normalized);

    const allAnswered = DEMOGRAPHIC_QUESTIONS.every(
      (q) => session.demographics[q.id] !== undefined
    );
    if (allAnswered) {
      store.advanceStep(session, "depth_choice");
    }
    return sendSessionSnapshot(res, session, { nextQuestion: pickNextQuestion(session) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Depth choice + Big Five item generation
app.post("/api/session/big-five-depth", async (req, res) => {
  try {
    const { sessionId, depth } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "depth_choice") {
      return res.status(400).json({ error: "Big Five depth already chosen or not yet available." });
    }
    if (depth !== "short" && depth !== "deep") {
      return res.status(400).json({ error: "depth must be 'short' or 'deep'." });
    }

    const items = await aiEngine.generateBigFiveItems({ depth });
    store.setBigFiveDepthAndItems(session, depth, items);
    store.advanceStep(session, "big_five");

    return sendSessionSnapshot(res, session, { nextQuestion: pickNextQuestion(session) });
  } catch (error) {
    console.error("[session/big-five-depth]", error);
    return res.status(error.statusCode || 500).json({ error: "Failed to start Big Five." });
  }
});

// Big Five answers
app.post("/api/big-five/answer", (req, res) => {
  try {
    const { sessionId, itemId, value } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "big_five") {
      return res.status(400).json({ error: "Not currently in the Big Five step." });
    }
    const normalized = validateBigFiveAnswer(session, itemId, value);
    store.recordBigFiveAnswer(session, itemId, normalized);

    const allAnswered = session.bigFiveItems.every(
      (i) => session.bigFiveAnswers[i.id] !== undefined
    );
    if (allAnswered) {
      const scores = computeBigFiveScores(session);
      const derived = deriveBigFiveTraits(scores);
      store.setBigFiveScores(session, scores, derived);
      store.advanceStep(session, "values");
    }
    return sendSessionSnapshot(res, session, { nextQuestion: pickNextQuestion(session) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Values answers
app.post("/api/values/answer", (req, res) => {
  try {
    const { sessionId, questionId, choice } = req.body || {};
    const session = store.require(sessionId);
    if (session.step !== "values") {
      return res.status(400).json({ error: "Not currently in the values step." });
    }
    const normalized = validateValuesAnswer(questionId, choice);
    store.recordValuesAnswer(session, questionId, normalized);

    const { scores, answered } = computeValuesScores(session);
    if (scores) {
      store.setValuesScores(session, scores);
      store.advanceStep(session, "complete");
    }
    return sendSessionSnapshot(res, session, {
      nextQuestion: pickNextQuestion(session),
      valuesAnswered: answered,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Update `sendSessionSnapshot` and `/api/session/:sessionId` to use new summary helper**

```js
function sendSessionSnapshot(res, session, extras = {}) {
  const progress = buildProgress(session);
  const summary = summarizeAnswersForClient(session);
  return res.json({
    ...store.serializeSessionState(session, progress, summary),
    ...extras,
  });
}

app.get("/api/session/:sessionId", (req, res) => {
  try {
    const session = store.require(req.params.sessionId);
    return sendSessionSnapshot(res, session, { nextQuestion: pickNextQuestion(session) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});
```

- [ ] **Step 5: Update `/api/branches/initial` gate to require completed values inventory**

```js
if (session.step !== "complete") {
  return res.status(400).json({
    error: "Complete the assessment before generating the first branch.",
  });
}
```

(Remove the old `session.answers.length < TARGET_COUNTS.minimum` check and the `questionById` argument when calling `aiEngine.generateInitialBranch`. Same for `/api/branches/create` and `/api/branches/evolve`: drop `questionById` from the call.)

- [ ] **Step 6: Smoke test the new flow with curl (server must be running)**

Start server in another terminal: `cd backend && npm run dev`

```bash
SID=$(curl -s -X POST localhost:3001/api/session/start \
  -H 'content-type: application/json' \
  -d '{"entryChoice":"find","dreamAnswer":"build something meaningful"}' | jq -r .sessionId)
echo "session: $SID"

curl -s -X POST localhost:3001/api/session/demographics \
  -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SID\",\"questionId\":\"sex\",\"value\":\"male\"}" | jq '.step,.progress'
```
Expected: step `demographics` → after all 3 demographic submissions, step becomes `depth_choice`.

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): wire step-machine routes for demographics, Big Five, and values"
```

---

## Task 8: Frontend — extend `api.js` with new endpoint helpers

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Replace contents**

```js
async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function startSession(payload) {
  return request("/api/session/start", { method: "POST", body: JSON.stringify(payload) });
}
export function submitDemographics(payload) {
  return request("/api/session/demographics", { method: "POST", body: JSON.stringify(payload) });
}
export function chooseBigFiveDepth(payload) {
  return request("/api/session/big-five-depth", { method: "POST", body: JSON.stringify(payload) });
}
export function submitBigFiveAnswer(payload) {
  return request("/api/big-five/answer", { method: "POST", body: JSON.stringify(payload) });
}
export function submitValuesAnswer(payload) {
  return request("/api/values/answer", { method: "POST", body: JSON.stringify(payload) });
}
export function generateInitialBranch(payload) {
  return request("/api/branches/initial", { method: "POST", body: JSON.stringify(payload) });
}
export function unlockTheme(payload) {
  return request("/api/payment/unlock-theme", { method: "POST", body: JSON.stringify(payload) });
}
export function createThematicBranch(payload) {
  return request("/api/branches/create", { method: "POST", body: JSON.stringify(payload) });
}
export function evolveBranch(payload) {
  return request("/api/branches/evolve", { method: "POST", body: JSON.stringify(payload) });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): add helpers for demographics, Big Five, and values endpoints"
```

---

## Task 9: Frontend — rewrite `App.jsx` with new stage machine

**Files:**
- Modify (substantial rewrite of state machine + stage rendering): `frontend/src/App.jsx`

- [ ] **Step 1: Replace component state and helper imports**

Replace the imports block:

```jsx
import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import {
  chooseBigFiveDepth,
  createThematicBranch,
  evolveBranch,
  generateInitialBranch,
  startSession,
  submitBigFiveAnswer,
  submitDemographics,
  submitValuesAnswer,
  unlockTheme,
} from "./api";
import "./App.css";
```

Replace state block (after `const [stage, setStage] = useState("entry");`):

```jsx
const [entryChoice, setEntryChoice] = useState("");
const [dreamAnswer, setDreamAnswer] = useState("");

const [sessionId, setSessionId] = useState("");
const [step, setStep] = useState("entry");
const [nextQuestion, setNextQuestion] = useState(null);
const [demoDraft, setDemoDraft] = useState("");
const [bigFiveDraft, setBigFiveDraft] = useState(0); // 1..5
const [valuesScores, setValuesScores] = useState(null);
const [bigFiveScores, setBigFiveScores] = useState(null);
const [progress, setProgress] = useState(null);

const [branches, setBranches] = useState([]);
const [themes, setThemes] = useState([]);
const [unlockedThemes, setUnlockedThemes] = useState([]);
const [selectedNodeId, setSelectedNodeId] = useState(ROOT_NODE_ID);
const [branchAnswer, setBranchAnswer] = useState("");
const [graphInstance, setGraphInstance] = useState(null);

const [busy, setBusy] = useState({
  start: false, demo: false, depth: "", bigFive: false, values: false,
  initialBranch: false, unlockThemeId: "", createThemeId: "", evolve: false,
});
const [error, setError] = useState("");
```

(Remove `currentQuestion`, `draftAnswer`, `premiumDepth` and their setters.)

- [ ] **Step 2: Add `applySessionSnapshot` helper to centralize state updates**

```jsx
const applySessionSnapshot = (data) => {
  setSessionId(data.sessionId);
  setStep(data.step);
  setNextQuestion(data.nextQuestion || null);
  setProgress(data.progress || null);
  setBigFiveScores(data.bigFiveScores || null);
  setValuesScores(data.valuesScores || null);
  setBranches(data.branches || []);
  setThemes(data.themes || []);
  setUnlockedThemes(data.unlockedThemes || []);
};
```

- [ ] **Step 3: Replace `handleStartSession` and add four new handlers**

```jsx
const handleStartSession = async () => {
  if (!entryChoice || !dreamAnswer.trim()) return;
  setError("");
  setBusy((p) => ({ ...p, start: true }));
  try {
    const data = await startSession({ entryChoice, dreamAnswer: dreamAnswer.trim() });
    applySessionSnapshot(data);
    setStage("survey");
    setDemoDraft("");
  } catch (e) { setError(e.message || "Could not start."); }
  finally { setBusy((p) => ({ ...p, start: false })); }
};

const handleSubmitDemographic = async () => {
  if (!sessionId || !nextQuestion) return;
  const value = nextQuestion.question.kind === "number" ? Number(demoDraft) : demoDraft;
  if (value === "" || value === null || (typeof value === "number" && Number.isNaN(value))) return;
  setError("");
  setBusy((p) => ({ ...p, demo: true }));
  try {
    const data = await submitDemographics({
      sessionId, questionId: nextQuestion.question.id, value,
    });
    applySessionSnapshot(data);
    setDemoDraft("");
  } catch (e) { setError(e.message || "Could not save."); }
  finally { setBusy((p) => ({ ...p, demo: false })); }
};

const handleChooseDepth = async (depth) => {
  if (!sessionId) return;
  setError("");
  setBusy((p) => ({ ...p, depth }));
  try {
    const data = await chooseBigFiveDepth({ sessionId, depth });
    applySessionSnapshot(data);
    setBigFiveDraft(0);
  } catch (e) { setError(e.message || "Could not start Big Five."); }
  finally { setBusy((p) => ({ ...p, depth: "" })); }
};

const handleSubmitBigFive = async (value) => {
  if (!sessionId || !nextQuestion) return;
  setError("");
  setBusy((p) => ({ ...p, bigFive: true }));
  try {
    const data = await submitBigFiveAnswer({
      sessionId, itemId: nextQuestion.question.id, value,
    });
    applySessionSnapshot(data);
    setBigFiveDraft(0);
  } catch (e) { setError(e.message || "Could not save."); }
  finally { setBusy((p) => ({ ...p, bigFive: false })); }
};

const handleSubmitValues = async (choice) => {
  if (!sessionId || !nextQuestion) return;
  setError("");
  setBusy((p) => ({ ...p, values: true }));
  try {
    const data = await submitValuesAnswer({
      sessionId, questionId: nextQuestion.question.id, choice,
    });
    applySessionSnapshot(data);
  } catch (e) { setError(e.message || "Could not save."); }
  finally { setBusy((p) => ({ ...p, values: false })); }
};
```

(Update `handleGenerateInitialBranch` to also call `applySessionSnapshot(data)` and set `setStage("tree")`. Drop `handleAnswerQuestion` and `handleTogglePremium`.)

- [ ] **Step 4: Replace the stage rendering for `questions` with new stages**

Replace the `{stage === "questions" && ( ... )}` block with a `{stage === "survey" && ( ... )}` block that branches by `step`:

```jsx
{stage === "survey" && (
  <section className="questions-screen">
    {/* Header showing step + progress */}
    <header className="screen-header">
      <h2>{stepHeading(step)}</h2>
      <p>{stepProgressText(step, progress)}</p>
    </header>

    {step === "demographics" && nextQuestion?.question && (
      <DemographicQuestionCard
        q={nextQuestion.question}
        draft={demoDraft}
        setDraft={setDemoDraft}
        busy={busy.demo}
        onSubmit={handleSubmitDemographic}
      />
    )}

    {step === "depth_choice" && (
      <DepthChoiceCard busy={busy.depth} onChoose={handleChooseDepth} />
    )}

    {step === "big_five" && nextQuestion?.question && (
      <BigFiveQuestionCard
        q={nextQuestion.question}
        draft={bigFiveDraft}
        setDraft={setBigFiveDraft}
        busy={busy.bigFive}
        onSubmit={handleSubmitBigFive}
        progress={progress?.bigFive}
      />
    )}

    {step === "values" && nextQuestion?.question && (
      <ValuesQuestionCard
        q={nextQuestion.question}
        busy={busy.values}
        onChoose={handleSubmitValues}
        progress={progress?.values}
      />
    )}

    {step === "complete" && (
      <div className="question-card">
        <h3>Assessment complete.</h3>
        <p>You're ready to generate your first life path branch.</p>
        <button
          type="button"
          className="primary-action"
          onClick={handleGenerateInitialBranch}
          disabled={busy.initialBranch}
        >
          {busy.initialBranch ? "Building..." : "Run Life Path Engine"}
        </button>
      </div>
    )}

    <div className="bottom-actions">
      <button type="button" className="ghost-action" onClick={resetAll}>Restart</button>
    </div>
    {error && <p className="error-text">{error}</p>}
  </section>
)}
```

Then define the four small sub-components above `App()` (each ~20-40 lines):

```jsx
function stepHeading(step) {
  switch (step) {
    case "demographics": return "About you";
    case "depth_choice": return "Choose depth";
    case "big_five":     return "Personality";
    case "values":       return "Values";
    case "complete":     return "Ready";
    default:             return "Deep Analysis";
  }
}

function stepProgressText(step, progress) {
  if (!progress) return "";
  if (step === "demographics")
    return `${progress.demographics.answered} / ${progress.demographics.total}`;
  if (step === "big_five")
    return `${progress.bigFive.answered} / ${progress.bigFive.total}`;
  if (step === "values")
    return `${progress.values.answered} / ${progress.values.total}`;
  return "";
}

function DemographicQuestionCard({ q, draft, setDraft, busy, onSubmit }) {
  return (
    <div className="question-card">
      <h3>{q.question}</h3>
      {q.kind === "single" && (
        <div className="option-list">
          {q.options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`option-button ${draft === o.value ? "selected" : ""}`}
              onClick={() => setDraft(o.value)}
            >{o.label}</button>
          ))}
        </div>
      )}
      {q.kind === "number" && (
        <input
          type="number"
          className="question-textarea"
          value={draft}
          min={q.min}
          max={q.max}
          placeholder={q.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      {q.kind === "text" && (
        <input
          type="text"
          className="question-textarea"
          value={draft}
          placeholder={q.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="question-actions single">
        <button
          type="button"
          className="primary-action"
          onClick={onSubmit}
          disabled={busy || draft === "" || draft === null}
        >{busy ? "Saving..." : "Next"}</button>
      </div>
    </div>
  );
}

function DepthChoiceCard({ busy, onChoose }) {
  return (
    <div className="question-card">
      <h3>How deep do you want to go?</h3>
      <div className="depth-options">
        <button
          type="button"
          className="depth-card"
          onClick={() => onChoose("short")}
          disabled={Boolean(busy)}
        >
          <p className="depth-title">Short</p>
          <p className="depth-meta">20 questions • 3–5 minutes</p>
        </button>
        <button
          type="button"
          className="depth-card"
          onClick={() => onChoose("deep")}
          disabled={Boolean(busy)}
        >
          <p className="depth-title">Deep</p>
          <p className="depth-meta">50 questions • 8–12 minutes</p>
        </button>
      </div>
      {busy && <p className="depth-loading">Generating items…</p>}
    </div>
  );
}

const LIKERT = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
];

function BigFiveQuestionCard({ q, draft, setDraft, busy, onSubmit, progress }) {
  return (
    <div className="question-card">
      <p className="question-category">
        {progress ? `Item ${progress.answered + 1} of ${progress.total}` : "Personality"}
      </p>
      <h3>{q.text}</h3>
      <div className="likert-row">
        {LIKERT.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`option-button likert-button ${draft === l.value ? "selected" : ""}`}
            onClick={() => setDraft(l.value)}
            disabled={busy}
          >
            <span className="likert-value">{l.value}</span>
            <span className="likert-label">{l.label}</span>
          </button>
        ))}
      </div>
      <div className="question-actions single">
        <button
          type="button"
          className="primary-action"
          onClick={() => onSubmit(draft)}
          disabled={busy || !draft}
        >{busy ? "Saving..." : "Next"}</button>
      </div>
    </div>
  );
}

function ValuesQuestionCard({ q, busy, onChoose, progress }) {
  return (
    <div className="question-card values-card">
      <p className="dimension-header">
        <span className="dimension-emoji">{q.dimensionEmoji}</span>{" "}
        <span className="dimension-label">{q.dimensionLabel}</span>
        {" "}
        <span className="dimension-counter">({q.indexInGroup + 1} / 5)</span>
      </p>
      <p className="question-category">
        {progress ? `Question ${progress.answered + 1} of ${progress.total}` : ""}
      </p>
      <h3>Which feels more like you?</h3>
      <div className="ab-pair">
        <button
          type="button"
          className="ab-option"
          onClick={() => onChoose("A")}
          disabled={busy}
        >
          <span className="ab-tag">A</span>
          <span className="ab-text">{q.optionA}</span>
        </button>
        <button
          type="button"
          className="ab-option"
          onClick={() => onChoose("B")}
          disabled={busy}
        >
          <span className="ab-tag">B</span>
          <span className="ab-text">{q.optionB}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `resetAll` to match the new state shape**

```jsx
const resetAll = () => {
  setStage("entry");
  setEntryChoice("");
  setDreamAnswer("");
  setSessionId("");
  setStep("entry");
  setNextQuestion(null);
  setDemoDraft("");
  setBigFiveDraft(0);
  setBigFiveScores(null);
  setValuesScores(null);
  setProgress(null);
  setBranches([]);
  setThemes([]);
  setUnlockedThemes([]);
  setSelectedNodeId(ROOT_NODE_ID);
  setBranchAnswer("");
  setError("");
  setBusy({
    start: false, demo: false, depth: "", bigFive: false, values: false,
    initialBranch: false, unlockThemeId: "", createThemeId: "", evolve: false,
  });
};
```

- [ ] **Step 6: Update entry-screen CTA label**

In the entry screen `<button>` change:
```jsx
{busy.start ? "Entering..." : "Help to explore my career"}
```

- [ ] **Step 7: Run the dev servers and click through the full flow**

```bash
# Terminal 1
cd backend && npm install && npm run dev
# Terminal 2
cd frontend && npm install && npm run dev
```

Open http://localhost:5173, click through entry → demographics (3) → depth=short → 20 Likert items → 40 A/B items → click "Run Life Path Engine" → see the graph.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): new entry CTA + step-machine UI for demographics, Big Five, and values"
```

---

## Task 10: Frontend — extend `App.css` with new styles

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Append new styles**

Append to `frontend/src/App.css`:

```css
/* Depth choice */
.depth-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.depth-card {
  appearance: none;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  border-radius: 20px;
  padding: 24px;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, opacity 160ms ease;
}
.depth-card:hover:enabled { background: #111111; color: #ffffff; }
.depth-title { margin: 0 0 6px; font-weight: 600; font-size: 1.2rem; }
.depth-meta { margin: 0; color: #555555; }
.depth-loading { margin: 8px 0 0; color: #444444; font-size: 0.9rem; }

/* Likert */
.likert-row { display: grid; gap: 8px; }
.likert-button {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}
.likert-value {
  display: inline-flex;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid currentColor;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
}
.likert-label { font-size: 0.98rem; }

/* Values A/B */
.values-card { gap: 14px; }
.dimension-header {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.dimension-emoji { font-size: 1.3rem; }
.dimension-label { letter-spacing: -0.01em; }
.dimension-counter { color: #777777; font-weight: 400; font-size: 0.92rem; }

.ab-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.ab-option {
  appearance: none;
  border: 1px solid #111111;
  background: #ffffff;
  color: #111111;
  border-radius: 20px;
  padding: 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 160ms ease, color 160ms ease, opacity 160ms ease;
}
.ab-option:hover:enabled { background: #111111; color: #ffffff; }
.ab-tag {
  display: inline-flex;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid currentColor;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.ab-text { line-height: 1.35; font-size: 1.02rem; }

@media (max-width: 760px) {
  .depth-options, .ab-pair { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.css
git commit -m "style(frontend): add depth-choice, Likert, and A/B value styles"
```

---

## Task 11: Verification — full-flow manual test + AI digest spot-check

**Files:** (no edits)

- [ ] **Step 1: Restart both dev servers (clean state)**
- [ ] **Step 2: Walk through the full flow with the OPENAI_API_KEY unset to confirm fallback path**

```bash
unset OPENAI_API_KEY
cd backend && npm run dev   # in one terminal
cd frontend && npm run dev  # in another
```
Expected: depth choice still works (uses static IPIP fallback), values flow works, branch generation falls back to the deterministic fallback.

- [ ] **Step 3: Walk through the full flow with a real OPENAI_API_KEY**

Expected: depth choice triggers AI generation (~3-8s latency), items differ from fallback. Branch text reflects the user's top values dimensions.

- [ ] **Step 4: Spot-check the digest log line**

Add a `console.log("[profileDigest]", profileDigest)` in `backend/aiEngine.js` `generateInitialBranch` (or use the existing `_debugProfileDigest`). After completing one session, confirm the digest includes demographics, all 5 OCEAN scores, derived traits, and all 8 values dimension scores. Remove the log after verification.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify end-to-end flow"  # only if there are changes
```

---

## Self-review checklist

- [x] **Spec coverage:**
  - Entry layout with two intent buttons + dream textarea + "Help to explore my career" CTA → Task 9 step 6
  - Demographics (sex, age, country) → Tasks 1, 3, 4, 7, 9
  - Big Five with short (20) / deep (50) choice, AI-generated, fallback static → Tasks 2, 5, 6, 7
  - Two derived dimensions (behaviour tendencies + decision priorities) → Task 3 `deriveBigFiveTraits`
  - 40 A/B values questions, exact wording, 8 groups → Task 1
  - 8 dimension scores stored per session → Tasks 3, 4
  - AI prompt receives demographics + Big Five + 8 values scores → Tasks 5, 6
  - Frontend A/B component with dimension header and progress → Task 9 `ValuesQuestionCard` + Task 10 CSS
  - Branch starts at "Me", existing branch/graph logic preserved → not modified
- [x] **Placeholder scan:** no TBD/TODO/"similar to" — all code blocks complete.
- [x] **Type consistency:** Endpoint payloads consistent (`questionId`/`value` for demographics, `itemId`/`value` for Big Five, `questionId`/`choice` for values). `session.step` strings match across backend and frontend (`demographics`, `depth_choice`, `big_five`, `values`, `complete`).
