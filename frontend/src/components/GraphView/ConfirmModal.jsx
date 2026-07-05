import { motion as Motion } from 'framer-motion';
import './ConfirmModal.css';

export default function ConfirmModal({ profession, busy, onConfirm, onDismiss }) {
  return (
    <Motion.div
      className="confirm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && !busy && onDismiss()}
    >
      <Motion.div
        className="confirm-modal"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <button className="confirm-close" onClick={onDismiss} disabled={busy}>×</button>
        <p className="confirm-label">Chosen profession</p>
        <h2 className="confirm-title">{profession.title}</h2>
        {profession.whyFit && (
          <div className="confirm-whyfit">
            <p className="confirm-whyfit-label">Why it fits you</p>
            <p className="confirm-whyfit-text">{profession.whyFit}</p>
            {profession.dayToDay && (
              <p className="confirm-daytoday">{profession.dayToDay}</p>
            )}
          </div>
        )}
        <p className="confirm-question">Would you like to see how to reach this profession?</p>
        <div className="confirm-actions">
          <button className="confirm-yes" onClick={onConfirm} disabled={busy}>
            {busy ? 'Building your roadmap…' : 'Yes, show me the way'}
          </button>
          <button className="confirm-later" onClick={onDismiss} disabled={busy}>
            Not now
          </button>
        </div>
      </Motion.div>
    </Motion.div>
  );
}
