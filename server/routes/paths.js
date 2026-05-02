const express = require('express');
const router = express.Router();
const { generateInitialPaths, generateTradeoffQuestions, expandBranch } = require('../services/aiService');

router.post('/generate-paths', async (req, res) => {
  try {
    const { reason, dream, answers } = req.body;
    if (!reason || !dream) {
      return res.status(400).json({ error: 'reason and dream are required' });
    }
    const result = await generateInitialPaths({ reason, dream, answers: answers || {} });
    res.json(result);
  } catch (err) {
    console.error('generate-paths error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/tradeoff-questions', async (req, res) => {
  try {
    const { selectedPath } = req.body;
    if (!selectedPath) {
      return res.status(400).json({ error: 'selectedPath is required' });
    }
    const result = await generateTradeoffQuestions({ selectedPath });
    res.json(result);
  } catch (err) {
    console.error('tradeoff-questions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/expand-branch', async (req, res) => {
  try {
    const { selectedPath, tradeoffAnswers, previousAnswers } = req.body;
    if (!selectedPath || !tradeoffAnswers) {
      return res.status(400).json({ error: 'selectedPath and tradeoffAnswers are required' });
    }
    const result = await expandBranch({ selectedPath, tradeoffAnswers, previousAnswers: previousAnswers || {} });
    res.json(result);
  } catch (err) {
    console.error('expand-branch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
