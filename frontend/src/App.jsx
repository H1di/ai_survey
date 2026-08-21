import { useEffect, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import GraphView from "./components/GraphView";
import { DetailPanel } from "./components/GraphView/NodeComponent";
import Wordmark from "./ui/Wordmark";
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

// Runs before React mounts: moves ?dev=<token> into sessionStorage and scrubs
// it from the URL, so the panel's visibility is settled by first render.
captureDevToken();
const DEV_MODE = isDevMode();
import "./components/GraphView/GraphPage.css";

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

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SESSION_STORAGE_KEY = "lpe.sessionId";

function App() {
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
  const [journeyDraft, setJourneyDraft] = useState("");
  const [cvMode, setCvMode] = useState("choice"); // choice | paste | journey
  const [cvDraft, setCvDraft] = useState("");

  const [outputs, setOutputs] = useState([]);
  const [acceptedOutputId, setAcceptedOutputId] = useState(null);
  const [roadmaps, setRoadmaps] = useState({});

  // Refine panel view state: checked params map to their brief reasons.

  const [stageDetail, setStageDetail] = useState(null);
  const [infoView, setInfoView] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  // Journey intro rail: shown once right after the entry screen, never on resume.
  const [showRail, setShowRail] = useState(false);

  const [busy, setBusy] = useState({
    start: false,
    demo: false,
    bigFive: false,
    riasecStart: false,
    riasec: false,
    riasecSkip: false,
    values: false,
    valuesConfirm: false,
    summary: false,
    cv: false,
    cvIntent: false,
    journey: false,
    enterTree: false,
    accept: false,
    roadmap: false,
    refine: false,
    dev: false,
    goto: false,
  });

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
    // Revisiting a confirmed values step: finalizeValues cleared the tournament
    // and the auto-start effect is blocked by userValues, so there is nothing to
    // render unless the confirmed hierarchy is put back into the draft.
    if (
      data.step === "values" &&
      !data.valuesComparison &&
      data.userValues &&
      data.userValues.order &&
      data.userValues.order.length === 6
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

  // Kick off the values tournament the moment the step opens (once).
  useEffect(() => {
    if (
      step === "values" &&
      sessionId &&
      !valuesComparison &&
      !(profile?.userValues) &&
      !valuesRanking &&
      !busy.values
    ) {
      handleValuesStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, valuesComparison, valuesRanking]);

  // Prefill the reorderable hierarchy once the comparisons resolve.
  useEffect(() => {
    if (valuesRanking && valuesRankDraft.length !== 6) {
      setValuesRankDraft(valuesRanking);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesRanking]);

  const handleStartSession = async () => {
    if (!dreamAnswer.trim()) {
      return;
    }
    setError("");
    setBusy((p) => ({ ...p, start: true }));
    try {
      const data = await startSession({
        dreamAnswer: dreamAnswer.trim(),
      });
      applySessionSnapshot(data);
      localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setStage("survey");
      setShowRail(true);
      setDemoDrafts({});
    } catch (e) {
      setError(e.message || "Could not start.");
    } finally {
      setBusy((p) => ({ ...p, start: false }));
    }
  };

  const handleDemoDraftChange = (questionId, value) =>
    setDemoDrafts((drafts) => ({ ...drafts, [questionId]: value }));

  // All four answers land on one screen, but the route takes one at a time and
  // advances the step the moment all four are present. On a first pass that is
  // the last POST, and the loop is trivial. A rail revisit is where it bites:
  //   * Every answer is already saved, so the FIRST post advances the step and
  //     every later one 400s on the route's step guard — silently dropping the
  //     user's other edits. Stepping back through /goto keeps them all.
  //   * If the revisit changed nothing there is no post to make at all, and the
  //     user would sit on a Continue button that does nothing. Re-posting one
  //     unchanged answer is what makes the backend re-run its all-answered
  //     check and move forward, which is the documented rail invariant:
  //     completing a revisited step advances exactly as on the first pass.
  // A failure mid-chain leaves the earlier answers saved; re-submitting sends
  // only what the snapshot still lacks.
  const handleSubmitDemographics = async () => {
    if (!sessionId) return;
    const changed = demographicsPayloads(demographicQuestions, demoDrafts, demoAnswers);
    const payloads = changed.length
      ? changed
      : demographicsPayloads(demographicQuestions, demoDrafts, {}).slice(0, 1);
    if (!payloads.length) return;
    setError("");
    setBusy((p) => ({ ...p, demo: true }));
    try {
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
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, demo: false }));
    }
  };

  const handleSubmitBigFive = async (value) => {
    if (!sessionId) return;
    const item = bigFiveItems[bigFiveIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, bigFive: true }));
    try {
      const data = await submitBigFiveAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (bigFiveIndex < bigFiveItems.length - 1) {
        setBigFiveIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, bigFive: false }));
    }
  };

  const handleBackBigFive = () => {
    setBigFiveIndex((i) => Math.max(0, i - 1));
  };

  const handleStartRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecStart: true }));
    try {
      const data = await startRiasec({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setRiasecIndex(0);
    } catch (e) {
      setError(e.message || "Could not load the interests quiz.");
      setRetryAction(() => handleStartRiasec);
    } finally {
      setBusy((p) => ({ ...p, riasecStart: false }));
    }
  };

  // Item generation is server-side; kick it off the moment the step arrives.
  useEffect(() => {
    if (stage !== "survey" || step !== "riasec") return;
    if (riasecItems.length || busy.riasecStart) return;
    handleStartRiasec();
    // busy flag + handler identity intentionally omitted: this effect must
    // fire once per riasec-step entry, not on every busy-state flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, step, riasecItems.length]);

  const handleSubmitRiasec = async (value) => {
    if (!sessionId) return;
    const item = riasecItems[riasecIndex];
    if (!item) return;
    setError("");
    setBusy((p) => ({ ...p, riasec: true }));
    try {
      const data = await submitRiasecAnswer({ sessionId, itemId: item.id, value });
      applySessionSnapshot(data);
      if (riasecIndex < riasecItems.length - 1) setRiasecIndex((i) => i + 1);
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, riasec: false }));
    }
  };

  const handleSkipRiasec = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, riasecSkip: true }));
    try {
      const data = await skipRiasec({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not estimate interests.");
    } finally {
      setBusy((p) => ({ ...p, riasecSkip: false }));
    }
  };

  const handleValuesStart = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await startValues({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not start the values step.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleValuesAnswer = async (winner) => {
    if (!sessionId || !valuesComparison) return;
    setError("");
    setBusy((p) => ({ ...p, values: true }));
    try {
      const data = await submitValuesAnswer({
        sessionId,
        comparisonId: valuesComparison.comparisonId,
        winner,
      });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not record your choice.");
    } finally {
      setBusy((p) => ({ ...p, values: false }));
    }
  };

  const handleValuesConfirm = async () => {
    if (!sessionId || valuesRankDraft.length !== 6) return;
    setError("");
    setBusy((p) => ({ ...p, valuesConfirm: true }));
    try {
      const data = await confirmValues({ sessionId, order: valuesRankDraft });
      applySessionSnapshot(data);
      setValuesRankDraft([]);
    } catch (e) {
      setError(e.message || "Could not save your hierarchy.");
    } finally {
      setBusy((p) => ({ ...p, valuesConfirm: false }));
    }
  };

  const handleSummaryContinue = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, summary: true }));
    try {
      const data = await continueSummary({ sessionId });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not continue.");
    } finally {
      setBusy((p) => ({ ...p, summary: false }));
    }
  };

  const handleSelectCvIntent = async (value) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cvIntent: true }));
    try {
      const data = await postCvIntent({ sessionId, cvIntent: value });
      applySessionSnapshot(data);
    } catch (e) {
      setError(e.message || "Could not save your choice.");
    } finally {
      setBusy((p) => ({ ...p, cvIntent: false }));
    }
  };

  const handleSubmitCvText = async () => {
    if (!sessionId || !cvDraft.trim()) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await submitCvText({ sessionId, cvText: cvDraft.trim() });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not analyse the CV.");
      setRetryAction(() => handleSubmitCvText);
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleUploadCv = async (file) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, cv: true }));
    try {
      const data = await uploadCvFile({ sessionId, file });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not read the file.");
    } finally {
      setBusy((p) => ({ ...p, cv: false }));
    }
  };

  const handleSubmitJourney = async (rawValue) => {
    if (!sessionId) return;
    const q = careerJourneyQuestions[journeyIndex];
    if (!q || !String(rawValue).trim()) return;
    setError("");
    setBusy((p) => ({ ...p, journey: true }));
    try {
      const data = await submitJourneyAnswer({
        sessionId,
        questionId: q.id,
        value: String(rawValue).trim(),
      });
      applySessionSnapshot(data);
      if (journeyIndex < careerJourneyQuestions.length - 1) {
        const nextQ = careerJourneyQuestions[journeyIndex + 1];
        setJourneyDraft(data.careerJourneyAnswers?.[nextQ.id] || "");
        setJourneyIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e.message || "Could not save.");
    } finally {
      setBusy((p) => ({ ...p, journey: false }));
    }
  };

  const handleEnterLifePath = async () => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, enterTree: true }));
    try {
      const data = await fetchFirstOutput({ sessionId });
      applySessionSnapshot(data);
      setRetryAction(null);
      setStage("tree");
    } catch (e) {
      setError(e.message || "Could not start the Life Path Engine.");
      setRetryAction(() => handleEnterLifePath);
    } finally {
      setBusy((p) => ({ ...p, enterTree: false }));
    }
  };

  const currentBigFiveItem = bigFiveItems[bigFiveIndex] || null;

  const latestOutput = outputs.length ? outputs[outputs.length - 1] : null;
  const acceptedOutput = outputs.find((o) => o.id === acceptedOutputId) || null;

  const ADVICE_VIEWS = {
    aiRecommendations: { title: "AI Recommendations", format: (i) => `${i.title} — ${i.detail}` },
    events: { title: "Events", format: (i) => `${i.name} — ${i.why}` },
    universities: { title: "Universities & Majors", format: (i) => `${i.name}: ${i.program}` },
    courses: { title: "Courses", format: (i) => `${i.name} (${i.provider}) — ${i.why}` },
  };

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

  const handleGenerateRoadmap = async (outputId) => {
    if (!sessionId) return;
    setError("");
    setBusy((p) => ({ ...p, roadmap: true }));
    try {
      const data = await generateRoadmap({ sessionId, outputId });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not generate roadmap.");
      setRetryAction(() => () => handleGenerateRoadmap(outputId));
    } finally {
      setBusy((p) => ({ ...p, roadmap: false }));
    }
  };

  const handleAcceptOutput = async () => {
    if (!sessionId || !latestOutput) return;
    const outputId = latestOutput.id;
    setError("");
    setBusy((p) => ({ ...p, accept: true }));
    try {
      const data = await acceptOutput({ sessionId, outputId });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not accept the output.");
      setRetryAction(() => handleAcceptOutput);
      setBusy((p) => ({ ...p, accept: false }));
      return;
    }
    setBusy((p) => ({ ...p, accept: false }));
    // Yes-branch: the roadmap builds right after the advice blocks land.
    await handleGenerateRoadmap(outputId);
  };

  // Rail navigation between steps already reached. The backend refuses anything
  // past furthestStep, so this cannot skip unanswered work; it only moves the
  // step, which is why the full snapshot can be applied wholesale.
  const handleRailNavigate = async (targetStep) => {
    if (!sessionId || targetStep === step) return;
    setError("");
    setBusy((p) => ({ ...p, goto: true }));
    try {
      const data = await sessionGoto({ sessionId, step: targetStep });
      hydrateFromSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not switch steps.");
    } finally {
      setBusy((p) => ({ ...p, goto: false }));
    }
  };

  // Dev stage jump. The composite targets cannot call handleEnterLifePath /
  // handleAcceptOutput: those read sessionId and latestOutput from React state,
  // which has not re-rendered yet inside this same async function. So chain the
  // api wrappers on ids taken straight from each response and hydrate once at
  // the end.
  const handleDevJump = async (target) => {
    const step = target === "tree+output" || target === "detail" ? "tree" : target;
    setError("");
    setBusy((p) => ({ ...p, dev: true }));
    try {
      let data = await devJump({ sessionId: sessionId || undefined, step });
      const jumpedSessionId = data.sessionId;
      localStorage.setItem(SESSION_STORAGE_KEY, jumpedSessionId);

      if (target === "tree+output" || target === "detail") {
        data = await fetchFirstOutput({ sessionId: jumpedSessionId });
      }
      if (target === "detail") {
        const outputId = data.outputs[data.outputs.length - 1].id;
        data = await acceptOutput({ sessionId: jumpedSessionId, outputId });
        // The real Yes-branch always builds the roadmap right after accepting;
        // stopping short would leave a state no user ever sees.
        data = await generateRoadmap({ sessionId: jumpedSessionId, outputId });
      }

      hydrateFromSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Dev jump failed.");
    } finally {
      setBusy((p) => ({ ...p, dev: false }));
    }
  };

  const handleNotSuitable = async () => {
    if (!sessionId || !latestOutput) return;
    setError("");
    setBusy((p) => ({ ...p, refine: true }));
    try {
      const data = await refineOutput({ sessionId, outputId: latestOutput.id, notSuitable: true });
      applySessionSnapshot(data);
      setRetryAction(null);
    } catch (e) {
      setError(e.message || "Could not regenerate the output.");
      setRetryAction(() => handleNotSuitable);
    } finally {
      setBusy((p) => ({ ...p, refine: false }));
    }
  };

  const handleStageOpen = (stageItem, index) => {
    setInfoView(null);
    setStageDetail({ stage: stageItem, index });
  };

  // The hero nav is real navigation: both entries open the same side panel the
  // graph uses, carrying the methodology rather than marketing copy.
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

  const handleOpenMethodology = (key) => setInfoView(METHODOLOGY_VIEWS[key] || null);

  const resetAll = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setRestoring(false);
    setStage("entry");
    setDreamAnswer("");
    setSessionId("");
    setStep("entry");
    setPathStage("output");
    setFurthestStep("demographics");
    setProgress(null);
    setDemographicQuestions([]);
    setDemoAnswers({});
    setDemoDrafts({});
    setBigFiveItems([]);
    setBigFiveAnswers({});
    setBigFiveIndex(0);
    setRiasecItems([]);
    setRiasecAnswers({});
    setRiasecIndex(0);
    setValuesComparison(null);
    setValuesRanking(null);
    setValuesRankDraft([]);
    setCareerJourneyQuestions([]);
    setJourneyIndex(0);
    setJourneyDraft("");
    setCvMode("choice");
    setCvDraft("");
    setCvIntent("");
    setOutputs([]);
    setAcceptedOutputId(null);
    setRoadmaps({});
    setStageDetail(null);
    setInfoView(null);
    setProfile(null);
    setProfileOpen(false);
    setError("");
    setRetryAction(null);
    setBusy({
      start: false,
      demo: false,
      bigFive: false,
      riasecStart: false,
      riasec: false,
      riasecSkip: false,
        values: false,
      valuesConfirm: false,
      summary: false,
        cv: false,
      cvIntent: false,
      journey: false,
      enterTree: false,
      accept: false,
      roadmap: false,
      refine: false,
    });
  };

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

  const treeHint = !outputs.length
    ? "Generating your first path…"
    : !acceptedOutputId
      ? "Review the suggestion — accept it or ask for a different direction"
      : roadmapVisible
        ? "Your roadmap — click any step for details"
        : "Accepted — building your next steps";

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
    </>
  );

  if (restoring) {
    return (
      <main className="app-shell">
        <p className="restore-hint">Resuming your session…</p>
      </main>
    );
  }

  return (
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
              onBack={handleBackBigFive}
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
                // starts, even as journeyIndex advances underneath it.
                setCvMode("journey");
                handleSubmitJourney(journeyDraft);
              }}
              onStartJourney={() => setCvMode("journey")}
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
            <div className="question-card">
              <h3>Assessment complete.</h3>
              <p>You're ready to generate your first life path branch.</p>
              <div className="question-actions single">
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleEnterLifePath}
                  disabled={busy.enterTree}
                >
                  {busy.enterTree ? "Preparing..." : "Run Life Path Engine"}
                </button>
              </div>
            </div>
          )}

          <div className="bottom-actions">
            <button type="button" className="ghost-action" onClick={resetAll}>
              Restart
            </button>
          </div>

          {error && (
            <div className="error-row">
              <p className="error-text">{error}</p>
              {retryAction && (
                <button type="button" className="ghost-action" onClick={() => retryAction()}>
                  Try again
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {stage === "tree" && (
        <div className="graph-page">
          <BranchCanvas preset="graph" className="graph-branch" reducedMotion={REDUCED_MOTION} />
          <div className="graph-header">
            <button type="button" className="screen-back" onClick={resetAll}>
              ← Restart
            </button>
            <Wordmark />
            <span className="graph-header-side">
              {!aiEnabled && <span className="demo-notice demo-notice-inline">Demo mode</span>}
              <button
                type="button"
                className={`graph-profile-toggle ${profileOpen ? "active" : ""}`}
                onClick={() => setProfileOpen((open) => !open)}
              >
                {profileOpen ? "Hide profile" : "My profile"}
              </button>
              <span className="graph-hint">{treeHint}</span>
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
          </div>

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

          <AnimatePresence>
            {stageDetail && (
              <Motion.div
                key="stage-detail"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
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

          {error && (
            <div className="error-row graph-error">
              <p className="error-text">{error}</p>
              {retryAction && (
                <button type="button" className="ghost-action" onClick={() => retryAction()}>
                  Try again
                </button>
              )}
            </div>
          )}
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

      <AnimatePresence>
        {infoView && (
          <Motion.div
            key="info-view"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <InfoPanel view={infoView} onClose={() => setInfoView(null)} />
          </Motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
