// v2 session store: an in-memory Map with a TTL sweep. Same single-instance
// rule as v1 (process-local — never run more than one instance). No Redis
// mirror yet; sessions are lost on restart.
//
// `serialize` is the single snapshot the frontend consumes. It resolves course
// ids to catalogue entries and never leaks a scoring key (Big Five trait /
// reverse, RIASEC type).

const { randomUUID } = require("node:crypto");
const { describeCase } = require("../path/caseEngine");
const { pathTotals } = require("../path/pathEngine");
const { ADDONS, emptyEntitlements, rebuildAllowance } = require("../path/addons");
const { nextComparison } = require("../assessment/valuesTournament");
const { CAREER_JOURNEY_QUESTIONS } = require("../assessment/questionPool");
const { WORK_VALUES_META } = require("../engine/workValues");
const { ONET_ATTRIBUTION } = require("../engine/onet");

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const WORK_VALUE_LABEL = new Map(WORK_VALUES_META.map((m) => [m.id, m.label]));
const TEST_STEPS = Object.freeze(["big_five", "riasec", "values", "experience", "done"]);

class SessionStore {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.now = now;
    this.timer = null;
  }

  create({ profile, caseId, slots, parentalConsent = false }) {
    const at = this.now();
    const session = {
      id: randomUUID(),
      createdAt: at,
      updatedAt: at,
      profile,
      parentalConsent,
      caseId,
      slots,
      path: null,
      stepSeq: 1,
      rebuildsUsed: 0,
      pathHistory: [],
      entitlements: emptyEntitlements(),
      purchases: [],
      tests: null,
      guidance: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  require(id) {
    const session = typeof id === "string" ? this.sessions.get(id) : null;
    if (!session || this.now() - session.updatedAt > this.ttlMs) {
      const err = new Error("Session not found or expired.");
      err.statusCode = 404;
      throw err;
    }
    return session;
  }

  touch(session) {
    session.updatedAt = this.now();
    return session;
  }

  // Replace the path, keeping the previous one in history (newest first, 10 max).
  setPath(session, { steps, summary, source, nextSeq, reason }) {
    if (session.path) {
      session.pathHistory = [
        { at: session.path.builtAt, reason: session.path.reason, steps: session.path.steps },
        ...session.pathHistory,
      ].slice(0, 10);
    }
    session.path = { steps, summary, source, reason, builtAt: this.now() };
    if (Number.isInteger(nextSeq)) session.stepSeq = nextSeq;
    // A changed path invalidates guidance built for the old one.
    session.guidance = null;
    return this.touch(session);
  }

  // Manage edits (add/remove/swap/move) keep the path object, update steps.
  editSteps(session, steps) {
    session.path = { ...session.path, steps, edited: true };
    session.guidance = null;
    return this.touch(session);
  }

  sweep() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, s] of this.sessions) if (s.updatedAt < cutoff) this.sessions.delete(id);
  }

  startSweep(intervalMs = 60 * 60 * 1000) {
    this.timer = setInterval(() => this.sweep(), intervalMs);
    this.timer.unref?.();
  }

  serialize(session, { catalogue }) {
    const steps = (session.path?.steps || []).map((s) => ({ ...s, course: catalogue.get(s.courseId) }));
    return {
      sessionId: session.id,
      profile: session.profile,
      case: describeCase(session.caseId),
      slots: session.slots,
      path: session.path
        ? {
            steps,
            summary: session.path.summary,
            source: session.path.source,
            edited: Boolean(session.path.edited),
            totals: pathTotals(session.path.steps, catalogue),
          }
        : null,
      previousPaths: session.pathHistory.length,
      // The answers changed after the path was built — the UI offers a rebuild.
      profileChanged: Boolean(session.profileChanged),
      rebuilds: rebuildAllowance(session),
      entitlements: session.entitlements,
      addons: ADDONS.map((a) => ({
        ...a,
        owned: (a.includes || [a.id]).filter((id) => ADDONS.find((x) => x.id === id)?.available).every((id) => session.entitlements[id]),
      })),
      tests: serializeTests(session.tests),
      guidance: session.guidance
        ? { ...session.guidance, attribution: ONET_ATTRIBUTION, courses: guidanceCourses(session.guidance, catalogue) }
        : null,
    };
  }
}

// Scenario and "worth adding" courses resolved, so the UI can name them.
function guidanceCourses(guidance, catalogue) {
  const ids = new Set([
    ...(guidance.scenarios || []).flatMap((s) => s.steps.map((st) => st.courseId)),
    ...(guidance.additions || []).map((a) => a.courseId),
  ]);
  return Object.fromEntries([...ids].map((id) => [id, catalogue.get(id)]).filter(([, c]) => c));
}

function serializeTests(tests) {
  if (!tests) return null;
  const out = { step: tests.step, steps: TEST_STEPS };
  if (tests.step === "big_five") {
    out.items = tests.bigFiveItems.map((i) => ({ id: i.id, text: i.text }));
    out.answers = tests.bigFiveAnswers;
  } else if (tests.step === "riasec") {
    out.items = tests.riasecItems.map((i) => ({ id: i.id, text: i.text }));
    out.answers = tests.riasecAnswers;
  } else if (tests.step === "values") {
    const pending = nextComparison(tests.valuesTournament);
    out.comparison = pending
      ? { ...pending, aLabel: WORK_VALUE_LABEL.get(pending.a), bLabel: WORK_VALUE_LABEL.get(pending.b) }
      : null;
    out.decided = tests.valuesTournament.decided.length;
    out.maxComparisons = 10;
  } else if (tests.step === "experience") {
    out.questions = CAREER_JOURNEY_QUESTIONS.map((q) => ({ id: q.id, question: q.question, placeholder: q.placeholder }));
  }
  if (tests.bigFiveScores) out.bigFiveScores = tests.bigFiveScores;
  if (tests.riasecScores) {
    out.riasecScores = tests.riasecScores;
    out.riasecCode = tests.riasecCode;
  }
  if (tests.userValues) {
    out.valuesOrder = tests.userValues.order.map((id) => ({ id, label: WORK_VALUE_LABEL.get(id) }));
  }
  return out;
}

module.exports = { SessionStore, TEST_STEPS, serializeTests };
