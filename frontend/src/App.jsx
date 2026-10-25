import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import Wordmark from "./ui/Wordmark";
import { HomeNavContext } from "./ui/homeNav";
import ConfirmDialog from "./ui/ConfirmDialog";
import BranchCanvas from "./ui/BranchCanvas";
import ScreenShell from "./ui/ScreenShell";
import EntryScreen from "./screens/EntryScreen";
import JourneyIntroScreen from "./screens/JourneyIntroScreen";
import DemographicsScreen from "./screens/DemographicsScreen";
import BigFiveScreen from "./screens/BigFiveScreen";
import RiasecScreen from "./screens/RiasecScreen";
import ValuesTournamentScreen from "./screens/ValuesTournamentScreen";
import ValuesHierarchyScreen from "./screens/ValuesHierarchyScreen";
import ExperienceScreen from "./screens/ExperienceScreen";
import SummaryScreen from "./screens/SummaryScreen";
import StepRail from "./screens/StepRail";
import OutputDecision from "./screens/OutputDecision";
import ProfilePanel from "./components/ProfileCharts";
import DevPanel from "./components/DevPanel";
import { captureDevToken, isDevMode } from "./devMode";
import {
  acceptOutput,
  confirmValues,
  continueSummary,
  devJump,
  fetchFirstOutput,
  fetchSession,
  generateRoadmap,
  postCvIntent,
  refineOutput,
  sessionGoto,
  skipRiasec,
  startRiasec,
  startSession,
  startValues,
  submitBigFiveAnswer,
  submitDemographics,
  submitCvText,
  submitJourneyAnswer,
  submitRiasecAnswer,
  submitValuesAnswer,
  uploadCvFile,
} from "./api";
import {
  buildLifePathGraph,
  deriveArchetype,
  demographicsPayloads,
  firstUnansweredIndex,
  moveRankItemTo,
  selectDockCard,
  whyThisFitsSections,
  onetSection,
  WORK_VALUE_META,
} from "./lifePath";
import "./App.css";
import "./components/GraphView/GraphPage.css";

// Runs before React mounts: moves ?dev=<token> into sessionStorage and scrubs
// it from the URL, so the panel's visibility is settled by first render.
captureDevToken();
const DEV_MODE = isDevMode();

// One journey, one bar. Unknown-yet block sizes assume the short variants so
// the bar can only get more accurate, never jump backwards. The CV block
// counts as the 7 journey questions until a CV text makes them moot.
function overallProgress(progress) {
  if (!progress) return null;
  const bigFiveTotal = progress.bigFive.total || 20;
  const riasecTotal = progress.riasec.total || 12;
  const valuesTotal = progress.values?.total || 10;
  const journeyTotal = progress.journey.active ? progress.journey.total : 0;
  const total =
    progress.demographics.total + bigFiveTotal + riasecTotal + valuesTotal + journeyTotal;
  const answered =
    progress.demographics.answered +
    progress.bigFive.answered +
    progress.riasec.answered +
    (progress.values?.confirmed ? valuesTotal : progress.values?.answered || 0) +
    (progress.journey.active ? progress.journey.answered : 0);
  if (!total) return null;
  return { answered, total, percent: Math.min(100, Math.round((answered / total) * 100)) };
}

// Side panel for output details and advice lists — same visual language as
// the roadmap DetailPanel, but section-driven.
function InfoPanel({ view, onClose }) {
  if (!view) return null;
  return (
    <div className="detail-panel">
      <button className="detail-close" onClick={onClose}>×</button>
      <p className="detail-archetype">{view.archetype}</p>
      <h2 className="detail-title">{view.title}</h2>
      {view.description && <p className="detail-desc">{view.description}</p>}
      {(view.sections || []).map((section, index) => (
        <div className="detail-section" key={index}>
          {section.heading && <h4>{section.heading}</h4>}
          {section.text && <p>{section.text}</p>}
          {section.items && section.items.length > 0 && (
            <ul>
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )}
          {section.footnote && <p className="detail-footnote">{section.footnote}</p>}
        </div>
      ))}
    </div>
  );
}

function ErrorRow({ error, retryAction, className = "" }) {
  if (!error) return null;
  return (
    <div className={`error-row ${className}`.trim()}>
      <p className="error-text">{error}</p>
      {retryAction && (
        <button type="button" className="ghost-action" onClick={() => retryAction()}>
          Try again
        </button>
      )}
    </div>
  );
}

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SESSION_STORAGE_KEY = "lpe.sessionId";

const PANEL_MOTION = {
  initial: { x: 20, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 20, opacity: 0 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
};

const ADVICE_VIEWS = {
  aiRecommendations: { title: "AI Recommendations", format: (i) => `${i.title} — ${i.detail}` },
  events: { title: "Events", format: (i) => `${i.name} — ${i.why}` },
  universities: { title: "Universities & Majors", format: (i) => `${i.name}: ${i.program}` },
  courses: { title: "Courses", format: (i) => `${i.name} (${i.provider}) — ${i.why}` },
};

// The hero nav opens the same side panel the graph uses, carrying the
// methodology rather than marketing copy.
const METHODOLOGY_VIEWS = {
  "how-it-works": {
    archetype: "how it works",
    title: "Five instruments, one profile",
    sections: [
      {
        heading: "What you answer",
        items: [
          "Four demographic questions.",
          "The public-domain Mini-IPIP-20, rated 1–5, scored to OCEAN 0–100 plus Stability/Plasticity.",
          "Twelve fixed activity statements, rated for enjoyment — never job titles — scored to a Holland code.",
          "An adaptive Ford–Johnson merge-insertion tournament, ≤10 comparisons, ranking the six Minnesota work values.",
          "Your CV, or seven career-journey questions if you don't have one.",
        ],
      },
    ],
  },
  "the-engine": {
    archetype: "the engine",
    title: "Grounded in O*NET, traced to your answers",
    sections: [
      {
        heading: "How a suggestion is built",
        items: [
          "Your Holland code ranks the field families; the O*NET snapshot ranks occupations inside them by measured interest profile.",
          "The occupation must come from that shortlist — the engine cannot invent one.",
          "Its six measured work values are scored against your confirmed hierarchy as a single fit percentage.",
          "Every line of the explanation points back to a score, a rank, or a sentence you wrote.",
        ],
      },
    ],
  },
};

// Restart remounts the whole app under a new key: every piece of state goes
// back to its initial value without a hand-kept list of setters.
export default function App() {
  const [generation, setGeneration] = useState(0);
  const reset = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setGeneration((g) => g + 1);
  };
  return <LifePathApp key={generation} onReset={reset} />;
}

function LifePathApp({ onReset }) {
  const [stage, setStage] = useState("entry");
  const [restoring, setRestoring] = useState(() =>
    Boolean(localStorage.getItem(SESSION_STORAGE_KEY))
  );

  const [dreamAnswer, setDreamAnswer] = useState("");
  const [cvIntent, setCvIntent] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [step, setStep] = useState("entry");
  const [pathStage, setPathStage] = useState("output");
  const [furthestStep, setFurthestStep] = useState("demographics");
  const [progress, setProgress] = useState(null);

  const [demographicQuestions, setDemographicQuestions] = useState([]);
  const [demoAnswers, setDemoAnswers] = useState({});
  const [demoDrafts, setDemoDrafts] = useState({});
  const [bigFiveItems, setBigFiveItems] = useState([]);
  const [bigFiveAnswers, setBigFiveAnswers] = useState({});
  const [bigFiveIndex, setBigFiveIndex] = useState(0);
  const [riasecItems, setRiasecItems] = useState([]);
  const [riasecAnswers, setRiasecAnswers] = useState({});
  const [riasecIndex, setRiasecIndex] = useState(0);
  // Work-values step: the pending pairwise comparison, the sorted hierarchy
  // once comparisons finish, and the reorderable draft the user can tweak.
  const [valuesComparison, setValuesComparison] = useState(null);
  const [valuesRanking, setValuesRanking] = useState(null);
  const [valuesRankDraft, setValuesRankDraft] = useState([]);
  const [careerJourneyQuestions, setCareerJourneyQuestions] = useState([]);
  const [cvUploadFormats, setCvUploadFormats] = useState([".pdf", ".docx", ".txt"]);
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [journeyAnswers, setJourneyAnswers] = useState({});
  const [journeyDraft, setJourneyDraft] = useState("");
  const [cvMode, setCvMode] = useState("choice"); // choice | paste | journey
  const [cvDraft, setCvDraft] = useState("");

  const [outputs, setOutputs] = useState([]);
  const [acceptedOutputId, setAcceptedOutputId] = useState(null);
  const [roadmaps, setRoadmaps] = useState({});

  const [stageDetail, setStageDetail] = useState(null);
  const [infoView, setInfoView] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // Set while the wordmark is asking whether it may drop the session.
  const [confirmHome, setConfirmHome] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  // Journey intro rail: shown once right after the entry screen, never on resume.
  const [showRail, setShowRail] = useState(false);

  // In-flight request flags keyed by action; a missing key means idle.
  const [busy, setBusy] = useState({});

  const [error, setError] = useState("");
  // Re-runs the last failed AI-backed action; rendered next to the error text.
  const [retryAction, setRetryAction] = useState(null);

  const applySessionSnapshot = (data) => {
    setSessionId(data.sessionId);
    setStep(data.step);
    setPathStage(data.pathStage || "output");
    setFurthestStep(data.furthestStep || data.step);
    setProgress(data.progress || null);
    // Static question banks only travel on start/resume/riasec-start
    // snapshots; answer responses omit them, so merge instead of replacing.
    if (data.demographicQuestions) setDemographicQuestions(data.demographicQuestions);
    if (data.bigFiveItems) setBigFiveItems(data.bigFiveItems);
    if (data.riasecItems) setRiasecItems(data.riasecItems);
    if (data.careerJourneyQuestions) setCareerJourneyQuestions(data.careerJourneyQuestions);
    if (data.cvUploadFormats) setCvUploadFormats(data.cvUploadFormats);
    setCvIntent(data.cvIntent || "");
    setDemoAnswers(data.demographics || {});
    setBigFiveAnswers(data.bigFiveAnswers || {});
    setRiasecAnswers(data.riasecAnswers || {});
    setJourneyAnswers(data.careerJourneyAnswers || {});
    setOutputs(data.outputs || []);
    setAcceptedOutputId(data.acceptedOutputId || null);
    setRoadmaps(data.roadmaps || {});
    setProfile({
      bigFiveScores: data.bigFiveScores || null,
      derivedTraits: data.derivedTraits || null,
      personaSummary: data.personaSummary || null,
      riasecScores: data.riasecScores || null,
      riasecCode: data.riasecCode || null,
      riasecInferred: Boolean(data.riasecInferred),
      userValues: data.userValues || null,
    });
    setValuesComparison(data.valuesComparison || null);
    setValuesRanking(data.valuesRanking || null);
    // The reorderable draft starts from the finished tournament's ranking. On a
    // rail revisit finalizeValues has cleared the tournament and the auto-start
    // effect is blocked by userValues, so the confirmed order seeds it instead.
    if (data.valuesRanking) {
      setValuesRankDraft((draft) => (draft.length === 6 ? draft : data.valuesRanking));
    } else if (
      data.step === "values" &&
      !data.valuesComparison &&
      data.userValues?.order?.length === 6
    ) {
      setValuesRankDraft(data.userValues.order);
    }
    if (data.aiEnabled !== undefined) setAiEnabled(Boolean(data.aiEnabled));
  };

  // A full session snapshot arriving from outside the normal answer flow —
  // page reload, or a dev stage jump. Beyond the shared state, this repositions
  // the local question indexes and picks the top-level stage. Both callers must
  // go through here: a second place that knows about indexes would drift.
  const hydrateFromSnapshot = (data) => {
    applySessionSnapshot(data);
    setDreamAnswer(data.dreamAnswer || "");
    setDemoDrafts(
      Object.fromEntries(
        Object.entries(data.demographics || {}).map(([id, value]) => [id, String(value)])
      )
    );
    setBigFiveIndex(firstUnansweredIndex(data.bigFiveItems || [], data.bigFiveAnswers));
    setRiasecIndex(firstUnansweredIndex(data.riasecItems || [], data.riasecAnswers));
    setJourneyIndex(
      firstUnansweredIndex(data.careerJourneyQuestions || [], data.careerJourneyAnswers)
    );
    if (Object.keys(data.careerJourneyAnswers || {}).length) setCvMode("journey");
    const inTree = data.step === "tree" && (data.outputs || []).length > 0;
    setStage(inTree ? "tree" : "survey");
  };

  // Every server call has one shape: clear the error, flag the busy key, and on
  // failure show the message, offering `retry` as "Try again" when given.
  // Resolves true on success so callers can chain.
  const run = async (key, failMessage, task, retry) => {
    setError("");
    setRetryAction(null);
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      await task();
      return true;
    } catch (e) {
      setError(e.message || failMessage);
      if (retry) setRetryAction(() => retry);
      return false;
    } finally {
      setBusy((p) => ({ ...p, [key]: false }));
    }
  };

  // The common case: one request whose snapshot is applied wholesale.
  const sync = (key, failMessage, call, retry) =>
    run(key, failMessage, async () => applySessionSnapshot(await call()), retry);

  // Resume a stored session after reload; a dead/unknown id falls back to entry.
  useEffect(() => {
    const storedId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedId) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSession(storedId);
        if (cancelled) return;
        hydrateFromSnapshot(data);
      } catch {
        if (!cancelled) localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount-only restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartSession = () => {
    if (!dreamAnswer.trim()) return;
    return run("start", "Could not start.", async () => {
      const data = await startSession({ dreamAnswer: dreamAnswer.trim() });
      applySessionSnapshot(data);
      localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setStage("survey");
      setShowRail(true);
      setDemoDrafts({});
    });
  };

  const handleDemoDraftChange = (questionId, value) =>
    setDemoDrafts((drafts) => ({ ...drafts, [questionId]: value }));

  // All four answers land on one screen, but the route takes one at a time and
  // advances the step the moment all four are present. On a rail revisit every
  // answer is already saved, so the first post advances the step and later ones
  // would 400 on the step guard — stepping back through /goto keeps them all.
  // An unchanged revisit re-posts one answer so the backend re-runs its
  // all-answered check and moves forward, as on the first pass. A failure
  // mid-chain leaves earlier answers saved; re-submitting sends only the rest.
  const handleSubmitDemographics = () => {
    if (!sessionId) return;
    const changed = demographicsPayloads(demographicQuestions, demoDrafts, demoAnswers);
    const payloads = changed.length
      ? changed
      : demographicsPayloads(demographicQuestions, demoDrafts, {}).slice(0, 1);
    if (!payloads.length) return;
    return run("demo", "Could not save.", async () => {
      let currentStep = step;
      for (const payload of payloads) {
        if (currentStep !== "demographics") {
          const back = await sessionGoto({ sessionId, step: "demographics" });
          applySessionSnapshot(back);
          currentStep = back.step;
        }
        const data = await submitDemographics({ sessionId, ...payload });
        applySessionSnapshot(data);
        currentStep = data.step;
      }
    });
  };

  const handleSubmitBigFive = (value) => {
    const item = bigFiveItems[bigFiveIndex];
    if (!sessionId || !item) return;
    return run("bigFive", "Could not save.", async () => {
      applySessionSnapshot(await submitBigFiveAnswer({ sessionId, itemId: item.id, value }));
      if (bigFiveIndex < bigFiveItems.length - 1) setBigFiveIndex((i) => i + 1);
    });
  };

  const handleStartRiasec = () => {
    if (!sessionId) return;
    return run(
      "riasecStart",
      "Could not load the interests quiz.",
      async () => {
        applySessionSnapshot(await startRiasec({ sessionId }));
        setRiasecIndex(0);
      },
      handleStartRiasec
    );
  };

  const handleSubmitRiasec = (value) => {
    const item = riasecItems[riasecIndex];
    if (!sessionId || !item) return;
    return run("riasec", "Could not save.", async () => {
      applySessionSnapshot(await submitRiasecAnswer({ sessionId, itemId: item.id, value }));
      if (riasecIndex < riasecItems.length - 1) setRiasecIndex((i) => i + 1);
    });
  };

  const handleSkipRiasec = () =>
    sessionId &&
    sync("riasecSkip", "Could not estimate interests.", () => skipRiasec({ sessionId }));

  const handleValuesStart = () =>
    sessionId &&
    sync("values", "Could not start the values step.", () => startValues({ sessionId }));

  const handleValuesAnswer = (winner) =>
    sessionId &&
    valuesComparison &&
    sync("values", "Could not record your choice.", () =>
      submitValuesAnswer({ sessionId, comparisonId: valuesComparison.comparisonId, winner })
    );

  const handleValuesConfirm = () => {
    if (!sessionId || valuesRankDraft.length !== 6) return;
    return run("valuesConfirm", "Could not save your hierarchy.", async () => {
      applySessionSnapshot(await confirmValues({ sessionId, order: valuesRankDraft }));
      setValuesRankDraft([]);
    });
  };

  const handleSummaryContinue = () =>
    sessionId && sync("summary", "Could not continue.", () => continueSummary({ sessionId }));

  const handleSelectCvIntent = (value) =>
    sessionId &&
    sync("cvIntent", "Could not save your choice.", () =>
      postCvIntent({ sessionId, cvIntent: value })
    );

  const handleSubmitCvText = () =>
    sessionId &&
    cvDraft.trim() &&
    sync(
      "cv",
      "Could not analyse the CV.",
      () => submitCvText({ sessionId, cvText: cvDraft.trim() }),
      handleSubmitCvText
    );

  const handleUploadCv = (file) =>
    sessionId && sync("cv", "Could not read the file.", () => uploadCvFile({ sessionId, file }));

  // Back on the journey: step to the previous question with its saved answer
  // restored, or leave the journey entirely from the first one. Answers live on
  // the server, so nothing is lost either way — re-answering overwrites.
  const handleJourneyBack = () => {
    if (journeyIndex <= 0) {
      setCvMode("choice");
      setJourneyDraft("");
      return;
    }
    const prev = careerJourneyQuestions[journeyIndex - 1];
    setJourneyDraft((prev && journeyAnswers[prev.id]) || "");
    setJourneyIndex((i) => i - 1);
  };

  const handleSubmitJourney = (rawValue) => {
    const q = careerJourneyQuestions[journeyIndex];
    const value = String(rawValue).trim();
    if (!sessionId || !q || !value) return;
    return run("journey", "Could not save.", async () => {
      const data = await submitJourneyAnswer({ sessionId, questionId: q.id, value });
      applySessionSnapshot(data);
      if (journeyIndex < careerJourneyQuestions.length - 1) {
        const nextQ = careerJourneyQuestions[journeyIndex + 1];
        setJourneyDraft(data.careerJourneyAnswers?.[nextQ.id] || "");
        setJourneyIndex((i) => i + 1);
      }
    });
  };

  // Generation runs unattended on the `tree` screen, where the rail is still
  // live — the step can change while the request is in flight. Applying the
  // snapshot after a rail click would drag the user back out of the step they
  // just opened, so the completion checks the current step through this ref.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const handleEnterLifePath = () =>
    sessionId &&
    run(
      "enterTree",
      "Could not start the Life Path Engine.",
      async () => {
        const data = await fetchFirstOutput({ sessionId });
        if (stepRef.current !== "tree") return;
        applySessionSnapshot(data);
        setStage("tree");
      },
      handleEnterLifePath
    );

  const latestOutput = outputs.length ? outputs[outputs.length - 1] : null;
  const acceptedOutput = outputs.find((o) => o.id === acceptedOutputId) || null;

  const handleOutputOpen = (output) => {
    setStageDetail(null);
    setInfoView({
      archetype: output.orientedField,
      title: output.jobTitle,
      description: output.thesis,
      sections: [
        ...whyThisFitsSections(output),
        onetSection(output),
        { heading: "First milestone", text: output.firstMilestone },
        output.valuesFit
          ? {
              heading: `Work-values match: ${output.valuesFit.overall}/100`,
              text: "How this profession's measured work values line up with your hierarchy.",
              items: (output.topValues || []).map(
                (k) => `${WORK_VALUE_META[k]?.label || k} — strong for this role`
              ),
            }
          : null,
        { heading: "Constraints", text: output.constraintsNote },
      ].filter(Boolean),
    });
  };

  const handleAdviceOpen = (blockKey) => {
    if (!acceptedOutput?.detail) return;
    const view = ADVICE_VIEWS[blockKey];
    setStageDetail(null);
    setInfoView({
      archetype: acceptedOutput.jobTitle,
      title: view.title,
      sections: [{ heading: "", items: acceptedOutput.detail[blockKey].map(view.format) }],
    });
  };

  const handleGenerateRoadmap = (outputId) =>
    sessionId &&
    sync(
      "roadmap",
      "Could not generate roadmap.",
      () => generateRoadmap({ sessionId, outputId }),
      () => handleGenerateRoadmap(outputId)
    );

  // Yes-branch: the roadmap builds right after the advice blocks land.
  const handleAcceptOutput = async () => {
    if (!sessionId || !latestOutput) return;
    const outputId = latestOutput.id;
    const accepted = await sync(
      "accept",
      "Could not accept the output.",
      () => acceptOutput({ sessionId, outputId }),
      handleAcceptOutput
    );
    if (accepted) await handleGenerateRoadmap(outputId);
  };

  const handleNotSuitable = () =>
    sessionId &&
    latestOutput &&
    sync(
      "refine",
      "Could not regenerate the output.",
      () => refineOutput({ sessionId, outputId: latestOutput.id }),
      handleNotSuitable
    );

  // Rail navigation between steps already reached. The backend refuses anything
  // past furthestStep, so this cannot skip unanswered work; it only moves the
  // step, which is why the full snapshot can be applied wholesale.
  const handleRailNavigate = (targetStep) =>
    sessionId &&
    targetStep !== step &&
    run("goto", "Could not switch steps.", async () =>
      hydrateFromSnapshot(await sessionGoto({ sessionId, step: targetStep }))
    );

  // Dev stage jump. The composite targets cannot call handleEnterLifePath /
  // handleAcceptOutput: those read sessionId and latestOutput from React state,
  // which has not re-rendered yet inside this same async function. So chain the
  // api wrappers on ids taken straight from each response and hydrate once.
  const handleDevJump = (target) =>
    run("dev", "Dev jump failed.", async () => {
      const composite = target === "tree+output" || target === "detail";
      let data = await devJump({
        sessionId: sessionId || undefined,
        step: composite ? "tree" : target,
      });
      const jumpedSessionId = data.sessionId;
      localStorage.setItem(SESSION_STORAGE_KEY, jumpedSessionId);
      if (composite) data = await fetchFirstOutput({ sessionId: jumpedSessionId });
      if (target === "detail") {
        const outputId = data.outputs[data.outputs.length - 1].id;
        await acceptOutput({ sessionId: jumpedSessionId, outputId });
        // The real Yes-branch always builds the roadmap right after accepting.
        data = await generateRoadmap({ sessionId: jumpedSessionId, outputId });
      }
      hydrateFromSnapshot(data);
    });

  const handleStageOpen = (stageItem, index) => {
    setInfoView(null);
    setStageDetail({ stage: stageItem, index });
  };

  const handleOpenMethodology = (key) => setInfoView(METHODOLOGY_VIEWS[key] || null);

  // Kick off the values tournament the moment the step opens (once).
  useEffect(() => {
    if (
      step === "values" &&
      sessionId &&
      !valuesComparison &&
      !profile?.userValues &&
      !valuesRanking &&
      !busy.values
    ) {
      // Starts a request; the busy flag set here is its pending state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleValuesStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, valuesComparison, valuesRanking]);

  // The RIASEC items are served by the backend; fetch them the moment the step
  // arrives. Fires once per step entry, not on every busy-state flip.
  useEffect(() => {
    if (stage !== "survey" || step !== "riasec") return;
    if (riasecItems.length || busy.riasecStart) return;
    handleStartRiasec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, step, riasecItems.length]);

  // `tree` has no screen of its own: reaching it is the request for the 1st
  // output (after Summary, or on a reload that lands here before an output
  // exists). A failure sets the error and stops the effect re-firing; the error
  // row's Try again is the way back in.
  useEffect(() => {
    if (step === "tree" && sessionId && outputs.length === 0 && !busy.enterTree && !error) {
      handleEnterLifePath();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, outputs.length, busy.enterTree, error]);

  const currentBigFiveItem = bigFiveItems[bigFiveIndex] || null;

  const graph = buildLifePathGraph({
    outputs,
    acceptedOutputId,
    roadmaps,
    roadmapPending: busy.roadmap,
    detailPending: busy.accept,
    onOutputOpen: handleOutputOpen,
    onAdviceOpen: handleAdviceOpen,
    onStageOpen: handleStageOpen,
  });

  const selectedRoadmap = acceptedOutputId ? roadmaps[acceptedOutputId] : null;
  const roadmapVisible = Boolean(selectedRoadmap);

  const graphHeadline = `${
    !outputs.length ? "generating" : !acceptedOutputId ? "exploring" : "accepted"
  } · your life path graph`;

  let focusKey = "start";
  let focusNodeIds = ["me"];
  if (roadmapVisible) {
    focusKey = `roadmap-${acceptedOutputId}`;
    focusNodeIds = [
      acceptedOutputId,
      ...selectedRoadmap.stages.map((st) => `stage-${acceptedOutputId}-${st.id}`),
    ];
  } else if (acceptedOutput?.detail) {
    focusKey = `detail-${acceptedOutputId}`;
    focusNodeIds = [acceptedOutputId, "advice-aiRecommendations", "advice-courses"];
  } else if (latestOutput) {
    focusKey = latestOutput.id;
    focusNodeIds = [latestOutput.parentId || "me", latestOutput.id];
  }

  const dockCardKind = selectDockCard({ stage, outputs, acceptedOutputId });

  let dockCard = null;
  if (dockCardKind === "output-review" && latestOutput) {
    dockCard = {
      key: `review-${latestOutput.id}`,
      content: (
        <OutputDecision
          output={latestOutput}
          busy={busy}
          onAccept={handleAcceptOutput}
          onRegenerate={handleNotSuitable}
          onOpenDetails={handleOutputOpen}
        />
      ),
    };
  }

  const overall = overallProgress(progress);
  const surveyFooter = (
    <>
      {overall && (
        <div className="screen-progress">
          <div
            className="screen-progress-track"
            role="progressbar"
            aria-valuenow={overall.answered}
            aria-valuemin={0}
            aria-valuemax={overall.total}
            aria-label={`Overall: ${overall.answered} of ${overall.total} questions`}
          >
            <div className="screen-progress-fill" style={{ width: `${overall.percent}%` }} />
          </div>
          <span className="screen-progress-percent">{overall.percent}%</span>
        </div>
      )}
      <StepRail
        step={step}
        furthestStep={furthestStep}
        busy={busy.goto}
        onNavigate={handleRailNavigate}
      />
      {/* Restart sits with the rail: the screen's top-left slot belongs to the
          per-step Back. */}
      <button type="button" className="screen-restart" onClick={onReset}>
        Restart
      </button>
    </>
  );

  if (restoring) {
    return (
      <main className="app-shell">
        <p className="restore-hint">Resuming your session…</p>
      </main>
    );
  }

  // The wordmark is the way home. There is no router, so home means Restart;
  // a logo reads as navigation rather than a reset, so it asks first. On the
  // entry screen no handler is published and the mark stays plain text.
  const homeNav = stage === "entry" ? null : () => setConfirmHome(true);

  return (
    <HomeNavContext.Provider value={homeNav}>
      <main className="app-shell">
        {stage === "entry" && (
          <EntryScreen
            value={dreamAnswer}
            onChange={setDreamAnswer}
            onStart={handleStartSession}
            busy={busy.start}
            error={error}
            reducedMotion={REDUCED_MOTION}
            onOpenInfo={handleOpenMethodology}
          />
        )}

        {stage === "survey" && (
          <section className="questions-screen">
            {!aiEnabled && (
              <p className="demo-notice">
                Demo mode — suggestions come from fixed rules, not AI.
              </p>
            )}

            {showRail && step === "demographics" && (
              <JourneyIntroScreen onBegin={() => setShowRail(false)} />
            )}

            {!showRail && step === "demographics" && demographicQuestions.length > 0 && (
              <DemographicsScreen
                questions={demographicQuestions}
                drafts={demoDrafts}
                onDraftChange={handleDemoDraftChange}
                busy={busy.demo}
                onSubmit={handleSubmitDemographics}
                footer={surveyFooter}
              />
            )}

            {step === "big_five" && currentBigFiveItem && (
              <BigFiveScreen
                item={currentBigFiveItem}
                savedValue={bigFiveAnswers[currentBigFiveItem.id] ?? null}
                index={bigFiveIndex}
                total={bigFiveItems.length}
                busy={busy.bigFive}
                onAnswer={handleSubmitBigFive}
                onBack={() => setBigFiveIndex((i) => Math.max(0, i - 1))}
                canGoBack={bigFiveIndex > 0}
                footer={surveyFooter}
              />
            )}

            {step === "riasec" && !riasecItems.length && (
              <ScreenShell
                eyebrow="step 3 · riasec interests"
                title="Preparing the interests quiz…"
                footer={surveyFooter}
              />
            )}

            {step === "riasec" && riasecItems[riasecIndex] && (
              <RiasecScreen
                item={riasecItems[riasecIndex]}
                savedValue={riasecAnswers[riasecItems[riasecIndex].id] ?? null}
                index={riasecIndex}
                total={riasecItems.length}
                busy={busy.riasec || busy.riasecSkip}
                onAnswer={handleSubmitRiasec}
                onBack={() => setRiasecIndex((i) => Math.max(0, i - 1))}
                canGoBack={riasecIndex > 0}
                onSkip={handleSkipRiasec}
                canSkip={Object.keys(riasecAnswers).length === 0}
                footer={surveyFooter}
              />
            )}

            {step === "values" && valuesComparison && (
              <ValuesTournamentScreen
                comparison={valuesComparison}
                progress={progress?.values || null}
                busy={busy.values}
                onChoose={handleValuesAnswer}
                footer={surveyFooter}
              />
            )}

            {step === "values" && !valuesComparison && valuesRankDraft.length === 6 && (
              <ValuesHierarchyScreen
                ranking={valuesRankDraft}
                onReorder={(from, to) => setValuesRankDraft((list) => moveRankItemTo(list, from, to))}
                busy={busy.valuesConfirm}
                onConfirm={handleValuesConfirm}
                footer={surveyFooter}
              />
            )}

            {step === "cv" && careerJourneyQuestions.length > 0 && (
              <ExperienceScreen
                mode={cvMode}
                intent={cvIntent}
                intentBusy={busy.cvIntent}
                onSelectIntent={handleSelectCvIntent}
                cvDraft={cvDraft}
                onCvDraftChange={setCvDraft}
                onStartPaste={() => setCvMode("paste")}
                onSubmitCvText={handleSubmitCvText}
                onUploadFile={handleUploadCv}
                uploadFormats={cvUploadFormats}
                busy={busy.cv || busy.journey}
                journeyQuestion={careerJourneyQuestions[journeyIndex]}
                journeyIndex={journeyIndex}
                journeyTotal={careerJourneyQuestions.length}
                journeyDraft={journeyDraft}
                onJourneyDraftChange={setJourneyDraft}
                onSubmitJourney={() => {
                  // Answering the B-side question is the commitment to the
                  // journey path — without this the eyebrow's counter never
                  // starts, even as journeyIndex advances underneath it. Guard on
                  // the same emptiness handleSubmitJourney checks, or Enter on an
                  // empty field commits the path and records nothing.
                  if (!journeyDraft.trim()) return;
                  setCvMode("journey");
                  handleSubmitJourney(journeyDraft);
                }}
                onBackToChoice={() => {
                  setCvMode("choice");
                  setCvDraft("");
                }}
                onJourneyBack={handleJourneyBack}
                footer={surveyFooter}
              />
            )}

            {step === "summary" && (
              <SummaryScreen
                archetype={deriveArchetype({
                  riasecCode: profile?.riasecCode,
                  bigFiveScores: profile?.bigFiveScores,
                })}
                bigFiveScores={profile?.bigFiveScores}
                personaSummary={profile?.personaSummary}
                userValues={profile?.userValues}
                busy={busy.summary}
                onContinue={handleSummaryContinue}
                footer={surveyFooter}
              />
            )}

            {step === "tree" && (
              <ScreenShell
                eyebrow="life path engine"
                title="Building your first life path…"
                sub="Matching your profile against the O*NET occupation set."
                glow="center"
                footer={surveyFooter}
              >
                <div className="screen-loading-dots" aria-live="polite" aria-label="Generating">
                  <span /><span /><span />
                </div>
              </ScreenShell>
            )}

            <ErrorRow error={error} retryAction={retryAction} />
          </section>
        )}

        {stage === "tree" && (
          <div className="graph-page">
            <BranchCanvas preset="graph" className="graph-branch" reducedMotion={REDUCED_MOTION} />
            <div className="graph-header">
              <span className="graph-header-lead">
                <Wordmark />
                <button type="button" className="screen-back" onClick={onReset}>
                  ← Restart
                </button>
              </span>
              <span className="graph-headline">{graphHeadline}</span>
              <span className="graph-header-side">
                {!aiEnabled && <span className="demo-notice demo-notice-inline">Demo mode</span>}
                <button
                  type="button"
                  className={`graph-profile-toggle ${profileOpen ? "active" : ""}`}
                  onClick={() => setProfileOpen((open) => !open)}
                >
                  {profileOpen ? "Hide profile" : "My profile"}
                </button>
              </span>
            </div>

            <div className="graph-canvas">
              <GraphView
                nodes={graph.nodes}
                edges={graph.edges}
                focusKey={focusKey}
                focusNodeIds={focusNodeIds}
              />
              {profileOpen && (
                <ProfilePanel
                  profile={profile}
                  userValues={profile?.userValues}
                  onClose={() => setProfileOpen(false)}
                />
              )}

              {/* The dock lives inside .graph-canvas, not .graph-page: it is
                  capped against its containing block, and the canvas is the part
                  of the page below the header — so a tall card can never grow
                  over the header and swallow its controls. */}
              <div className="graph-question-dock">
                <AnimatePresence mode="wait">
                  {dockCard && (
                    <Motion.div
                      key={dockCard.key}
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{
                        y: 12,
                        opacity: 0,
                        transition: { duration: REDUCED_MOTION ? 0 : 0.25 },
                      }}
                      transition={
                        REDUCED_MOTION
                          ? { duration: 0 }
                          : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
                      }
                    >
                      {dockCard.content}
                    </Motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {stageDetail && (
                <Motion.div key="stage-detail" {...PANEL_MOTION}>
                  <DetailPanel
                    data={{
                      path: {
                        archetype: `Step ${stageDetail.index + 1}${stageDetail.stage.timeframe ? ` · ${stageDetail.stage.timeframe}` : ""}`,
                        title: stageDetail.stage.title,
                        description: stageDetail.stage.description,
                        careerTrajectory: stageDetail.stage.milestone || null,
                      },
                      onClose: () => setStageDetail(null),
                    }}
                  />
                </Motion.div>
              )}
            </AnimatePresence>

            <ErrorRow error={error} retryAction={retryAction} className="graph-error" />
          </div>
        )}

        {DEV_MODE && (
          <DevPanel
            step={step}
            pathStage={pathStage}
            sessionId={sessionId}
            busy={busy.dev}
            onJump={handleDevJump}
          />
        )}

        {confirmHome && (
          <ConfirmDialog
            eyebrow="leave the assessment"
            title="Start over from the beginning?"
            body="Going back to the start page ends this session. Your answers and every generated path are dropped, and there is no way back to them."
            confirmLabel="Yes, start over"
            cancelLabel="Stay here"
            onConfirm={onReset}
            onCancel={() => setConfirmHome(false)}
          />
        )}

        <AnimatePresence>
          {infoView && (
            <Motion.div key="info-view" {...PANEL_MOTION}>
              <InfoPanel view={infoView} onClose={() => setInfoView(null)} />
            </Motion.div>
          )}
        </AnimatePresence>
      </main>
    </HomeNavContext.Provider>
  );
}
