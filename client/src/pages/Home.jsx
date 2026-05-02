import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../state/AppContext';
import './Home.css';

export default function Home() {
  const { dispatch } = useApp();
  const navigate = useNavigate();
  const [dream, setDream] = useState('');
  const [focused, setFocused] = useState(false);

  function handleStart(reason) {
    if (!dream.trim()) return;
    dispatch({ type: 'SET_ENTRY', reason, dream: dream.trim() });
    navigate('/questions');
  }

  return (
    <div className="home">
      <motion.div
        className="home-inner"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="home-header">
          <span className="home-logo">Life Path Explorer</span>
        </header>

        <main className="home-main">
          <h1 className="home-question">Why are you here?</h1>

          <div className="home-buttons">
            <button
              className="home-btn home-btn--primary"
              onClick={() => handleStart('change')}
              disabled={!dream.trim()}
            >
              Change my career
            </button>
            <button
              className="home-btn home-btn--secondary"
              onClick={() => handleStart('find')}
              disabled={!dream.trim()}
            >
              Find my career
            </button>
          </div>

          <div className="home-divider" />

          <p className="home-prompt">
            If you knew you would definitely succeed, what would you do?
          </p>

          <div className={`home-input-wrap ${focused ? 'focused' : ''}`}>
            <textarea
              className="home-input"
              placeholder="Describe it honestly. There's no wrong answer."
              value={dream}
              onChange={e => setDream(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={4}
            />
          </div>

          {dream.trim() && (
            <motion.p
              className="home-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              Choose an intention above to continue.
            </motion.p>
          )}
        </main>

        <footer className="home-footer">
          <p>Your answers shape every path. This is not a quiz — it's a mirror.</p>
        </footer>
      </motion.div>
    </div>
  );
}
