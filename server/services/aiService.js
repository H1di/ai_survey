const OpenAI = require('openai');
const { buildInitialPathsPrompt, buildExpansionPrompt, buildTradeoffQuestionsPrompt } = require('../utils/promptBuilder');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callAI(prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });
  return JSON.parse(response.choices[0].message.content);
}

async function generateInitialPaths(data) {
  const prompt = buildInitialPathsPrompt(data);
  return callAI(prompt);
}

async function generateTradeoffQuestions(data) {
  const prompt = buildTradeoffQuestionsPrompt(data);
  return callAI(prompt);
}

async function expandBranch(data) {
  const prompt = buildExpansionPrompt(data);
  return callAI(prompt);
}

module.exports = { generateInitialPaths, generateTradeoffQuestions, expandBranch };
