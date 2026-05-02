import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../state/AppContext';
import GraphView from '../components/GraphView';
import TradeoffModal from '../components/GraphView/TradeoffModal';
import { DetailPanel } from '../components/GraphView/NodeComponent';
import './Graph.css';

const ME_NODE = { id: 'me', type: 'me', position: { x: -40, y: 0 }, data: {} };

const PATH_POSITIONS = [
  { x: -340, y: 260 },
  { x: 0,    y: 320 },
  { x: 340,  y: 260 },
];

export default function Graph() {
  const { state } = useApp();
  const navigate = useNavigate();

  const [graphNodes, setGraphNodes] = useState([ME_NODE]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [tradeoffModal, setTradeoffModal] = useState(null);
  const [detailPath, setDetailPath] = useState(null);
  const [status, setStatus] = useState('');
  const initialized = useRef(false);
  const tradeoffCache = useRef({});

  useEffect(() => {
    if (!state.dream) { navigate('/'); return; }
    if (initialized.current) return;
    initialized.current = true;
    fetchInitialPaths();
  }, []); // eslint-disable-line

  function makePathNode(path, index, isExpanding) {
    return {
      id: path.id,
      type: 'path',
      position: PATH_POSITIONS[index] || { x: (index - 1) * 300, y: 300 },
      data: {
        title: path.title,
        archetype: path.archetype,
        locked: false,
        isExpanding,
        onExpand: () => openTradeoffModal(path),
      },
      draggable: true,
    };
  }

  async function fetchInitialPaths() {
    setStatus('Mapping your possible futures...');
    try {
      const res = await fetch('/api/generate-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: state.reason,
          dream: state.dream,
          answers: state.answers,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const paths = (data.paths || []).slice(0, 3);

      const pathNodes = paths.map((p, i) => makePathNode(p, i, false));

      const edges = paths.map((p, i) => ({
        id: `me-${p.id}`,
        source: 'me',
        target: p.id,
        type: 'branch',
        style: { stroke: '#999', strokeWidth: 1 },
        data: { delay: i * 180 },
      }));

      setGraphNodes([ME_NODE, ...pathNodes]);
      setGraphEdges(edges);
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }

  async function openTradeoffModal(path) {
    const cached = tradeoffCache.current[path.id];
    if (cached) {
      setTradeoffModal({ path, questions: cached });
      return;
    }
    setGraphNodes(prev =>
      prev.map(n => n.id === path.id ? { ...n, data: { ...n.data, isExpanding: true } } : n)
    );
    try {
      const res = await fetch('/api/tradeoff-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPath: path }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const questions = data.questions || [];
      tradeoffCache.current[path.id] = questions;
      setTradeoffModal({ path, questions });
    } catch (err) {
      setStatus(`Could not load questions: ${err.message}`);
    } finally {
      setGraphNodes(prev =>
        prev.map(n => n.id === path.id ? { ...n, data: { ...n.data, isExpanding: false } } : n)
      );
    }
  }

  async function handleTradeoffSubmit(tradeoffAnswers) {
    if (!tradeoffModal) return;
    const { path } = tradeoffModal;
    setTradeoffModal(null);

    const loadingId = `loading-${path.id}`;
    setGraphNodes(prev => {
      const parent = prev.find(n => n.id === path.id);
      const py = parent ? parent.position.y : 0;
      const px = parent ? parent.position.x : 0;
      return [...prev, {
        id: loadingId,
        type: 'loading',
        position: { x: px, y: py + 240 },
        data: {},
      }];
    });
    setGraphEdges(prev => [...prev, {
      id: `${path.id}-${loadingId}`,
      source: path.id,
      target: loadingId,
      type: 'branch',
      style: { stroke: '#ddd', strokeWidth: 1 },
    }]);

    try {
      const res = await fetch('/api/expand-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedPath: path,
          tradeoffAnswers,
          previousAnswers: state.answers,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const variations = (data.variations || []).slice(0, 3);

      const varId = (v, i) => `${path.id}::${v.id || `var_${i}`}`;

      setGraphNodes(prev => {
        const parent = prev.find(n => n.id === path.id);
        const px = parent ? parent.position.x : 0;
        const py = parent ? parent.position.y : 0;
        const without = prev.filter(n => n.id !== loadingId);
        const spread = variations.length <= 1 ? 0 : 150;

        const varNodes = variations.map((v, i) => {
          const offset = variations.length <= 1 ? 0 : (i - (variations.length - 1) / 2) * spread;
          return {
            id: varId(v, i),
            type: 'variation',
            position: { x: px + offset, y: py + 260 },
            data: {
              title: v.title,
              difference: v.difference,
              onExpand: () => setDetailPath(v),
            },
            draggable: true,
          };
        });
        return [...without, ...varNodes];
      });

      setGraphEdges(prev => {
        const without = prev.filter(e => e.target !== loadingId);
        const varEdges = variations.map((v, i) => {
          const childId = varId(v, i);
          return {
            id: `${path.id}-${childId}`,
            source: path.id,
            target: childId,
            type: 'branch',
            style: { stroke: '#bbb', strokeWidth: 1 },
            data: { delay: i * 150 },
          };
        });
        return [...without, ...varEdges];
      });

      setGraphNodes(prev =>
        prev.map(n => n.id === path.id
          ? { ...n, data: { ...n.data, onExpand: undefined, isExpanding: false } }
          : n
        )
      );
    } catch (err) {
      setGraphNodes(prev => prev.filter(n => n.id !== loadingId));
      setGraphEdges(prev => prev.filter(e => e.target !== loadingId));
      setStatus(`Could not expand path: ${err.message}`);
    }
  }

  return (
    <div className="graph-page">
      <div className="graph-header">
        <button className="graph-back" onClick={() => navigate('/questions')}>← Questions</button>
        <span className="graph-logo">Life Path Explorer</span>
        <span className="graph-hint">Click a path to explore deeper</span>
      </div>

      {status && <div className="graph-status">{status}</div>}

      <div className="graph-canvas">
        <GraphView nodes={graphNodes} edges={graphEdges} />
      </div>

      <AnimatePresence>
        {tradeoffModal && (
          <TradeoffModal
            key="tradeoff"
            questions={tradeoffModal.questions}
            pathTitle={tradeoffModal.path.title}
            onSubmit={handleTradeoffSubmit}
            onClose={() => setTradeoffModal(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailPath && (
          <motion.div
            key="detail"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <DetailPanel data={{ path: detailPath, onClose: () => setDetailPath(null) }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
