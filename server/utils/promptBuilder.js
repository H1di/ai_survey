function buildInitialPathsPrompt({ reason, dream, answers }) {
  const answerSummary = Object.entries(answers)
    .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');

  return `You are a thoughtful life path advisor. Based on this person's inputs, generate exactly 3 distinct, realistic life paths.

USER CONTEXT:
- Primary goal: ${reason === 'change' ? 'Change existing career' : 'Find first or new career direction'}
- Dream / aspiration: "${dream}"
- Survey answers:
${answerSummary}

INSTRUCTIONS:
- Each path must be genuinely distinct — different lifestyle, risk profile, trajectory
- Be specific and personal, not generic
- Paths should feel possible, not fantasy
- Titles should be evocative and short (3–6 words)
- Return ONLY valid JSON, no markdown, no extra text

JSON FORMAT:
{
  "paths": [
    {
      "id": "path_1",
      "title": "Short evocative title",
      "archetype": "e.g. Builder, Explorer, Expert, Creator, Connector",
      "description": "2–3 sentences describing this life path",
      "lifestyle": "What daily life looks like",
      "careerTrajectory": "How this path evolves over 5–10 years",
      "financialOutlook": "Honest income expectations and trajectory",
      "risks": ["Risk 1", "Risk 2"],
      "whyItFits": "Why this path matches their specific inputs",
      "tradeoffs": ["What they gain", "What they give up"]
    }
  ]
}`;
}

function buildExpansionPrompt({ selectedPath, tradeoffAnswers, previousAnswers }) {
  const prevSummary = Object.entries(previousAnswers)
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');

  const tradeoffSummary = tradeoffAnswers
    .map(a => `- ${a.question}: ${a.answer}`)
    .join('\n');

  return `You are expanding a specific life path based on how this person answered follow-up tradeoff questions.

SELECTED PATH:
Title: ${selectedPath.title}
Description: ${selectedPath.description}
Archetype: ${selectedPath.archetype}

ORIGINAL CONTEXT:
${prevSummary}

TRADEOFF ANSWERS:
${tradeoffSummary}

INSTRUCTIONS:
- Generate 2 deeper variations of this path that diverge based on their tradeoff answers
- Each variation represents a real fork — different enough to matter
- Be concrete and honest about what each variation demands
- Return ONLY valid JSON, no markdown, no extra text

JSON FORMAT:
{
  "variations": [
    {
      "id": "var_1",
      "title": "Short evocative title",
      "difference": "One sentence: how this differs from the parent path",
      "description": "2–3 sentences describing this variation",
      "lifestyle": "What daily life looks like",
      "risks": ["Risk 1", "Risk 2"],
      "opportunities": ["Opportunity 1", "Opportunity 2"],
      "timeToReality": "Honest estimate of how long to get here"
    }
  ]
}`;
}

function buildTradeoffQuestionsPrompt({ selectedPath }) {
  return `Generate 4 follow-up tradeoff questions for someone exploring this life path.

PATH: ${selectedPath.title}
Description: ${selectedPath.description}
Archetype: ${selectedPath.archetype}

INSTRUCTIONS:
- Questions should surface real tradeoffs specific to this path
- Each question forces a meaningful choice
- Options should be genuinely different (not obvious)
- Return ONLY valid JSON, no markdown, no extra text

JSON FORMAT:
{
  "questions": [
    {
      "id": "tq_1",
      "text": "Question text",
      "type": "choice",
      "options": ["Option A", "Option B"]
    }
  ]
}`;
}

module.exports = { buildInitialPathsPrompt, buildExpansionPrompt, buildTradeoffQuestionsPrompt };
