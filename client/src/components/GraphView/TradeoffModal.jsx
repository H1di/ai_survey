import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './TradeoffModal.css';

export default function TradeoffModal({ questions, pathTitle, onSubmit, onClose }) {
  const [answers, setAnswers] = useState({});
  const allAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;

  function handleAnswer(questionText, option) {
    setAnswers(prev => ({ ...prev, [questionText]: option }));
  }

  function handleSubmit() {
    const result = Object.entries(answers).map(([question, answer]) => ({ question, answer }));
    onSubmit(result);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="tradeoff-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="tradeoff-modal"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <button className="tradeoff-close" onClick={onClose}>×</button>
          <p className="tradeoff-path-label">Exploring</p>
          <h2 className="tradeoff-title">{pathTitle}</h2>
          <p className="tradeoff-subtitle">Answer these to reveal deeper paths within this direction.</p>

          <div className="tradeoff-questions">
            {questions.map((q, i) => (
              <div key={q.id} className="tradeoff-q">
                <p className="tradeoff-q-text">{q.text}</p>
                <div className="tradeoff-q-options">
                  {q.options.map(opt => (
                    <button
                      key={opt}
                      className={`tradeoff-option ${answers[q.text] === opt ? 'selected' : ''}`}
                      onClick={() => handleAnswer(q.text, opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="tradeoff-footer">
            <button
              className="tradeoff-submit"
              disabled={!allAnswered}
              onClick={handleSubmit}
            >
              Reveal deeper paths →
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
