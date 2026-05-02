import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../state/AppContext';
import { QUESTIONS } from './questions';
import './Questions.css';

const variants = {
  enter: { opacity: 0, y: 20 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export default function Questions() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (!state.dream) navigate('/');
  }, [state.dream, navigate]);

  const questions = QUESTIONS;
  const current = questions[index];
  const progress = ((index) / questions.length) * 100;
  const isLast = index === questions.length - 1;

  function handleAnswer(value) {
    dispatch({ type: 'SET_ANSWER', key: current.id, value });
    if (isLast) {
      goToGraph();
    } else {
      setDirection(1);
      setIndex(i => i + 1);
    }
  }

  function handleBack() {
    if (index === 0) { navigate('/'); return; }
    setDirection(-1);
    setIndex(i => i - 1);
  }

  async function goToGraph() {
    navigate('/graph');
  }

  if (!current) return null;

  return (
    <div className="questions">
      <div className="questions-top">
        <button className="questions-back" onClick={handleBack}>
          ← Back
        </button>
        <div className="questions-progress-wrap">
          <div className="questions-progress-bar">
            <motion.div
              className="questions-progress-fill"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="questions-count">{index + 1} / {questions.length}</span>
        </div>
      </div>

      <div className="questions-body">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.id}
            className="questions-card"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="questions-category">{current.category}</p>
            <h2 className="questions-text">{current.text}</h2>

            <div className="questions-options">
              {current.options.map(opt => (
                <button
                  key={opt}
                  className={`questions-option ${state.answers[current.id] === opt ? 'selected' : ''}`}
                  onClick={() => handleAnswer(opt)}
                >
                  <span className="questions-option-check" />
                  {opt}
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="questions-bottom">
        {isLast && state.answers[current.id] && (
          <motion.button
            className="questions-finish"
            onClick={goToGraph}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Generate my paths →
          </motion.button>
        )}
      </div>
    </div>
  );
}
