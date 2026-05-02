import React, { createContext, useContext, useReducer } from 'react';

const initialState = {
  reason: null,
  dream: '',
  answers: {},
  paths: [],
  graphNodes: [],
  graphEdges: [],
  expandingPathId: null,
  tradeoffQuestions: [],
  tradeoffAnswers: [],
  loading: false,
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ENTRY':
      return { ...state, reason: action.reason, dream: action.dream };
    case 'SET_ANSWER':
      return { ...state, answers: { ...state.answers, [action.key]: action.value } };
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.value };
    case 'SET_PATHS':
      return { ...state, paths: action.paths };
    case 'SET_GRAPH':
      return { ...state, graphNodes: action.nodes, graphEdges: action.edges };
    case 'UPDATE_GRAPH_NODES':
      return { ...state, graphNodes: action.nodes };
    case 'UPDATE_GRAPH_EDGES':
      return { ...state, graphEdges: action.edges };
    case 'SET_EXPANDING_PATH':
      return { ...state, expandingPathId: action.pathId, tradeoffQuestions: action.questions || [], tradeoffAnswers: [] };
    case 'SET_TRADEOFF_ANSWER': {
      const existing = state.tradeoffAnswers.findIndex(a => a.question === action.question);
      const updated = existing >= 0
        ? state.tradeoffAnswers.map((a, i) => i === existing ? { ...a, answer: action.answer } : a)
        : [...state.tradeoffAnswers, { question: action.question, answer: action.answer }];
      return { ...state, tradeoffAnswers: updated };
    }
    case 'CLEAR_EXPANDING':
      return { ...state, expandingPathId: null, tradeoffQuestions: [], tradeoffAnswers: [] };
    default:
      return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
