// Invector v2 — path-first API (business report, November 2026).
//
// Free flow:  personal questions → case → AI builds a path from the course
//             catalogue → the user manages it (add / swap / remove / move,
//             3 free rebuilds).
// Paid add-ons (after the first path): psychological tests → deeper AI
//             guidance (explanation, scenarios, what to add); unlimited rebuilds.
//
// Guardrails (report §07): test scoring is deterministic code; the AI picks
// only listed catalogue courses and real O*NET occupations; every AI call has
// an output cap and a deterministic fallback.

const dotenv = require("dotenv");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { rateLimit } = require("express-rate-limit");

if (process.env.NODE_ENV !== "test") {
  if (!process.env.OPENAI_API_KEY) delete process.env.OPENAI_API_KEY;
  dotenv.config();
}

const { logError, resolveStatus } = require("./core/logger");
const { SessionStore } = require("./core/sessionStore");
const { createCatalogue } = require("./catalogue");
const { createAiEngine } = require("./engine/aiEngine");
const {
  PERSONAL_QUESTIONS,
  DIGITAL_AGE_OF_CONSENT,
  validateProfile,
  needsParentalConsent,
} = require("./path/personalQuestions");
const { detectCase, slotsFor, describeCase } = require("./path/caseEngine");
const {
  buildCandidateSets,
  assembleSteps,
  addStep,
  removeStep,
  swapStep,
  moveStep,
} = require("./path/pathEngine");
const { ADDONS, ADDON_BY_ID, FREE_REBUILDS, grantsFor, rebuildAllowance } = require("./path/addons");
const { buildGuidanceFacts, interestRanking } = require("./path/guidance");
const { MINI_IPIP_20 } = require("./assessment/bigFiveItems");
const { getStaticRiasecItems } = require("./assessment/riasecItems");
const { startTournament, finalOrder, recordAnswer } = require("./assessment/valuesTournament");
const {
  validateBigFiveAnswer,
  validateRiasecAnswer,
  validateCareerJourneyAnswer,
  computeBigFiveScores,
  computeRiasecScores,
  deriveRiasecCode,
} = require("./assessment/questionEngine");
const { CAREER_JOURNEY_QUESTIONS } = require("./assessment/questionPool");
const {
  WORK_VALUES_ORDER,
  rankToWorkValueScores,
  WORK_VALUE_CURVE_VERSION,
} = require("./engine/workValues");

const PORT = Number(process.env.PORT) || 3002;
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY);
// Payments are not built. Mock unlocks are on by default outside production
// and must be switched on explicitly (MOCK_PAYMENTS=1) in production.
const MOCK_PAYMENTS =
  process.env.MOCK_PAYMENTS !== undefined
    ? process.env.MOCK_PAYMENTS === "1"
    : process.env.NODE_ENV !== "production";
const MIN_EXPERIENCE_ANSWERS = 3;

const store = new SessionStore();
store.startSweep();
const catalogue = createCatalogue();
const ai = createAiEngine({ apiKey: process.env.OPENAI_API_KEY, model: MODEL });

const app = express();
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

app.use((req, res, next) => {
  const raw = req.get("x-request-id");
  const cleaned = typeof raw === "string" ? raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64) : "";
  req.id = cleaned || randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});
app.use(express.json({ limit: "100kb" }));

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
app.use(
  "/api",
  rateLimit({
    windowMs: RATE_WINDOW_MS,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 400,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
const aiLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_AI_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Try again later." },
});
for (const p of ["/api/path/build", "/api/path/rebuild", "/api/guidance/generate"]) app.use(p, aiLimiter);

// ---------------------------------------------------------------------------
// Helpers (same leak-safe contract as v1: 4xx keep their message, 500s are
// logged and answered generically; every error carries the request id).
// ---------------------------------------------------------------------------

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function fail(res, req, status, message) {
  return res.status(status).json({ error: message, requestId: req.id });
}

function sendError(res, req, error, fallbackMessage) {
  if (res.headersSent) return;
  const status = resolveStatus(error);
  if (status < 500) return res.status(status).json({ error: error.message, requestId: req.id });
  logError(req, error);
  return res.status(500).json({ error: fallbackMessage, requestId: req.id });
}

const handle =
  (fn, fallbackMessage = "Something went wrong.") =>
  async (req, res) => {
    try {
      return await fn(req, res, req.body || {});
    } catch (error) {
      return sendError(res, req, error, fallbackMessage);
    }
  };

const inFlight = new Set();
function lockedRoute(op, fn, fallbackMessage) {
  return handle(async (req, res, body) => {
    const session = store.require(body.sessionId);
    const key = `${session.id}:${op}`;
    if (inFlight.has(key)) return fail(res, req, 409, "Your path is still being updated.");
    inFlight.add(key);
    try {
      return await fn(req, res, session, body);
    } finally {
      inFlight.delete(key);
    }
  }, fallbackMessage);
}

function snapshot(res, session) {
  return res.json({ ...store.serialize(session, { catalogue }), aiEnabled: AI_ENABLED });
}

function requirePath(session) {
  if (!session.path) throw httpError(400, "Build your first path before this step.");
}

function requireEntitlement(session, id, message) {
  if (!session.entitlements[id]) throw httpError(402, message);
}

function requireTestStep(session, step) {
  if (session.tests?.step !== step) throw httpError(400, "Not currently at this test.");
}

const currentMonth = () => new Date().getMonth() + 1;

// One build: candidate sets from the catalogue → AI (or rules) picks → steps.
// Returns the new path without storing it, so a rebuild can check it differs.
async function buildPath(session, { note, avoidIds }) {
  const caseInfo = describeCase(session.caseId);
  const ranking = interestRanking(session.tests);
  const sets = buildCandidateSets(catalogue, session.slots, session.profile, {
    interestRanking: ranking,
    nowMonth: currentMonth(),
    avoidIds,
  });
  if (!sets.some((s) => s.candidates.length)) {
    throw httpError(422, "No course in the catalogue fits these answers yet.");
  }
  const result = await ai.generatePath({
    profile: session.profile,
    caseInfo,
    sets,
    note,
    tests: session.tests?.step === "done" ? session.tests : null,
  });
  const { steps, nextSeq } = assembleSteps(sets, result.picks, session.profile, {
    nextSeq: session.stepSeq,
    interestRanking: ranking,
    whyBySlot: result.whyBySlot,
  });
  return { steps, summary: result.summary, source: result.source, nextSeq };
}

const courseKey = (steps) => steps.map((s) => s.courseId).join("|");

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    version: "v2-path-first",
    hasOpenAIKey: AI_ENABLED,
    catalogue: catalogue.describe(),
    mockPayments: MOCK_PAYMENTS,
  });
});

// Everything static the entry screen needs, in one call.
app.get("/api/meta", (_req, res) => {
  res.json({
    personalQuestions: PERSONAL_QUESTIONS,
    digitalAgeOfConsent: DIGITAL_AGE_OF_CONSENT,
    freeRebuilds: FREE_REBUILDS,
    addons: ADDONS,
    catalogue: catalogue.describe(),
    mockPayments: MOCK_PAYMENTS,
    aiEnabled: AI_ENABLED,
  });
});

app.get(
  "/api/session/:id",
  handle((req, res) => snapshot(res, store.require(req.params.id)))
);

// 1 · About you → 2 · Your case. The path is built by a separate call so the
// UI can show the case while the AI works.
app.post(
  "/api/session/start",
  handle((req, res, body) => {
    const profile = validateProfile(body.answers);
    const parentalConsent = body.parentalConsent === true;
    if (needsParentalConsent(profile) && !parentalConsent) {
      throw httpError(400, `Under ${DIGITAL_AGE_OF_CONSENT}, a parent or guardian must agree before we save your answers.`);
    }
    const caseId = detectCase(profile);
    const session = store.create({
      profile,
      caseId,
      slots: slotsFor(caseId, profile),
      parentalConsent: needsParentalConsent(profile) ? parentalConsent : false,
    });
    return snapshot(res, session);
  })
);

// The variables are the user's to change at any time (report §05: "the user
// sets the variables"). The case and slots follow the new answers; the path
// stays until they rebuild, and the snapshot flags it as built for old answers.
app.post(
  "/api/profile/update",
  lockedRoute("path", async (req, res, session, body) => {
    const profile = validateProfile(body.answers);
    if (needsParentalConsent(profile) && !(session.parentalConsent || body.parentalConsent === true)) {
      throw httpError(400, `Under ${DIGITAL_AGE_OF_CONSENT}, a parent or guardian must agree before we save your answers.`);
    }
    if (needsParentalConsent(profile)) session.parentalConsent = true;
    session.profile = profile;
    session.caseId = detectCase(profile);
    session.slots = slotsFor(session.caseId, profile);
    if (session.path) session.profileChanged = true;
    store.touch(session);
    return snapshot(res, session);
  })
);

// 3 · AI builds the path. Idempotent: a second call returns the same path.
app.post(
  "/api/path/build",
  lockedRoute(
    "path",
    async (req, res, session) => {
      if (!session.path) {
        store.setPath(session, { ...(await buildPath(session, {})), reason: "first" });
        session.profileChanged = false;
      }
      return snapshot(res, session);
    },
    "Could not build your path."
  )
);

// 4 · Rebuild — three free, unlimited with the add-on. Steers away from the
// current courses where a slot has another option. Counts only on success.
app.post(
  "/api/path/rebuild",
  lockedRoute(
    "path",
    async (req, res, session, body) => {
      requirePath(session);
      const allowance = rebuildAllowance(session);
      if (!allowance.unlimited && allowance.remaining <= 0) {
        throw httpError(402, `You've used your ${FREE_REBUILDS} free rebuilds. Unlimited rebuilds are an add-on.`);
      }
      const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      // After the user changed their answers, rebuild for the new answers;
      // otherwise steer away from the current courses.
      const built = await buildPath(session, {
        note,
        avoidIds: session.profileChanged ? [] : session.path.steps.map((s) => s.courseId),
      });
      // Nothing different fits: say so and keep the allowance.
      if (courseKey(built.steps) === courseKey(session.path.steps)) {
        throw httpError(
          409,
          "No different path fits your answers in the catalogue right now. Try changing an answer, or swap a step yourself — that's free."
        );
      }
      store.setPath(session, { ...built, reason: note ? `rebuild: ${note}` : "rebuild" });
      session.profileChanged = false;
      session.rebuildsUsed += 1;
      return snapshot(res, session);
    },
    "Could not rebuild your path."
  )
);

// Undo: bring back the path before the last rebuild or scenario. Free.
app.post(
  "/api/path/restore",
  lockedRoute("path", async (req, res, session) => {
    requirePath(session);
    const [previous, ...rest] = session.pathHistory;
    if (!previous) throw httpError(400, "There is no earlier path to go back to.");
    session.pathHistory = rest;
    session.path = { steps: previous.steps, summary: session.path.summary, source: "restored", reason: previous.reason, builtAt: Date.now() };
    session.guidance = null;
    store.touch(session);
    return snapshot(res, session);
  })
);

// Manage operations — free and unlimited.
const MANAGE = {
  add: (session, body) =>
    addStep(session.path.steps, catalogue, session.profile, {
      courseId: body.courseId,
      position: body.position,
      seq: session.stepSeq++,
    }),
  remove: (session, body) => removeStep(session.path.steps, { stepId: body.stepId }),
  swap: (session, body) =>
    swapStep(session.path.steps, catalogue, session.profile, { stepId: body.stepId, courseId: body.courseId }),
  move: (session, body) => moveStep(session.path.steps, { stepId: body.stepId, direction: body.direction }),
};
for (const [op, fn] of Object.entries(MANAGE)) {
  app.post(
    `/api/path/${op}`,
    lockedRoute("path", async (req, res, session, body) => {
      requirePath(session);
      store.editSteps(session, fn(session, body));
      return snapshot(res, session);
    })
  );
}

// Catalogue browse for add / swap / compare.
app.get(
  "/api/courses",
  handle((req, res) => {
    const { q, field, city, mode, kind, maxFee, limit } = req.query;
    const str = (v) => (typeof v === "string" && v ? v : undefined);
    const courses = catalogue.search({ q: str(q), field: str(field), city: str(city), mode: str(mode), kind: str(kind), maxFee: str(maxFee), limit: str(limit) });
    res.json({ courses, catalogue: catalogue.describe() });
  })
);

// Paid add-ons — mock unlock until payments exist.
app.post(
  "/api/addons/unlock",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requirePath(session);
    const addon = ADDON_BY_ID.get(body.addon);
    if (!addon) throw httpError(404, "Unknown add-on.");
    if (!addon.available) throw httpError(409, "This add-on is not available yet.");
    if (!MOCK_PAYMENTS) throw httpError(501, "Payments are not available yet.");
    const grants = grantsFor(addon.id);
    if (grants.every((id) => session.entitlements[id])) throw httpError(409, "You already have this add-on.");
    for (const id of grants) session.entitlements[id] = true;
    session.purchases.push({ addon: addon.id, priceEur: addon.priceEur, at: Date.now(), mock: true });
    store.touch(session);
    return snapshot(res, session);
  })
);

// 5 · Psychological tests (paid). Fixed public instruments, deterministic scoring.
app.post(
  "/api/tests/start",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requirePath(session);
    requireEntitlement(session, "tests", "The psychological tests are a paid add-on.");
    if (!session.tests) {
      session.tests = {
        step: "big_five",
        bigFiveItems: MINI_IPIP_20.map((i) => ({ ...i })),
        bigFiveAnswers: {},
        riasecItems: getStaticRiasecItems(),
        riasecAnswers: {},
        valuesTournament: null,
        experienceAnswers: {},
      };
      store.touch(session);
    }
    return snapshot(res, session);
  })
);

app.post(
  "/api/tests/big-five",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requireTestStep(session, "big_five");
    const t = session.tests;
    t.bigFiveAnswers[body.itemId] = validateBigFiveAnswer(t, body.itemId, body.value);
    const scores = computeBigFiveScores(t);
    if (scores) {
      t.bigFiveScores = scores;
      t.step = "riasec";
    }
    store.touch(session);
    return snapshot(res, session);
  })
);

app.post(
  "/api/tests/riasec",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requireTestStep(session, "riasec");
    const t = session.tests;
    t.riasecAnswers[body.itemId] = validateRiasecAnswer(t, body.itemId, body.value);
    const { scores } = computeRiasecScores(t);
    if (scores) {
      t.riasecScores = scores;
      t.riasecCode = deriveRiasecCode(scores);
      t.valuesTournament = startTournament(WORK_VALUES_ORDER);
      t.step = "values";
    }
    store.touch(session);
    return snapshot(res, session);
  })
);

app.post(
  "/api/tests/values",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requireTestStep(session, "values");
    const t = session.tests;
    const result = recordAnswer(t.valuesTournament, { comparisonId: body.comparisonId, winner: body.winner });
    // A stale or duplicate answer (double click) is a no-op, not an error.
    if (result.ok) t.valuesTournament = result.state;
    const order = finalOrder(t.valuesTournament);
    if (order) {
      t.userValues = {
        scores: rankToWorkValueScores(order),
        order,
        source: "tournament",
        confidence: "explicit",
        curveVersion: WORK_VALUE_CURVE_VERSION,
      };
      t.step = "experience";
    }
    store.touch(session);
    return snapshot(res, session);
  })
);

app.post(
  "/api/tests/experience",
  handle((req, res, body) => {
    const session = store.require(body.sessionId);
    requireTestStep(session, "experience");
    const raw = body.answers && typeof body.answers === "object" ? body.answers : {};
    const answers = {};
    for (const q of CAREER_JOURNEY_QUESTIONS) {
      if (typeof raw[q.id] === "string" && raw[q.id].trim()) {
        answers[q.id] = validateCareerJourneyAnswer(q.id, raw[q.id]);
      }
    }
    if (Object.keys(answers).length < MIN_EXPERIENCE_ANSWERS) {
      throw httpError(400, `Answer at least ${MIN_EXPERIENCE_ANSWERS} of the experience questions.`);
    }
    session.tests.experienceAnswers = answers;
    session.tests.step = "done";
    store.touch(session);
    return snapshot(res, session);
  })
);

// 6 · Deeper AI guidance (paid, after the tests). Idempotent per path.
app.post(
  "/api/guidance/generate",
  lockedRoute(
    "guidance",
    async (req, res, session) => {
      requirePath(session);
      requireEntitlement(session, "tests", "Deeper guidance comes with the tests add-on.");
      if (session.tests?.step !== "done") throw httpError(400, "Finish the tests first.");
      if (!session.guidance) {
        const facts = buildGuidanceFacts({ session, catalogue, slots: session.slots, nowMonth: currentMonth() });
        const prose = await ai.generateGuidance({
          profile: session.profile,
          caseInfo: describeCase(session.caseId),
          facts,
          pathCourses: session.path.steps.map((s) => catalogue.get(s.courseId)).filter(Boolean),
          tests: session.tests,
        });
        session.guidance = { ...facts, ...prose, generatedAt: Date.now() };
        store.touch(session);
      }
      return snapshot(res, session);
    },
    "Could not prepare your guidance."
  )
);

// Replace the path with one of the guidance scenarios. Not a rebuild — the
// scenario was already computed — so it does not use an allowance.
app.post(
  "/api/path/apply-scenario",
  lockedRoute("path", async (req, res, session, body) => {
    const scenario = session.guidance?.scenarios?.find((s) => s.id === body.scenarioId);
    if (!scenario) throw httpError(404, "That scenario is not available.");
    const sets = scenario.steps
      .map(({ slot, courseId }) => ({
        slot: session.slots.find((s) => s.id === slot),
        candidates: [{ course: catalogue.get(courseId) }],
        relaxed: [],
      }))
      .filter((s) => s.slot && s.candidates[0].course);
    const picks = Object.fromEntries(scenario.steps.map((s) => [s.slot, s.courseId]));
    const { steps, nextSeq } = assembleSteps(sets, picks, session.profile, {
      nextSeq: session.stepSeq,
      interestRanking: interestRanking(session.tests),
    });
    store.setPath(session, {
      steps,
      summary: `${scenario.label}: ${session.guidance.scenarioNotes?.[scenario.id] || "the same steps with a different priority."}`,
      source: "scenario",
      nextSeq,
      reason: `scenario: ${scenario.id}`,
    });
    return snapshot(res, session);
  })
);

// Production: serve the built v2 frontend next to the API.
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
  app.use(express.static(FRONTEND_DIST, { index: false }));
  // `root` keeps send's dotfile check off the absolute prefix (a checkout
  // under a dot-directory would otherwise 404 the shell).
  app.get(/^(?!\/api(?:\/|$))[^.]*$/, (req, res) => res.sendFile("index.html", { root: FRONTEND_DIST }));
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return fail(res, req, 413, "Request body too large.");
  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return fail(res, req, 400, "Malformed JSON body.");
  }
  return sendError(res, req, error, "Something went wrong.");
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Invector v2 (path-first) API on http://localhost:${PORT}`);
    console.log(`Catalogue: ${catalogue.describe().source} (${catalogue.count} courses) · AI: ${AI_ENABLED ? MODEL : "keyless fallbacks"} · mock payments: ${MOCK_PAYMENTS ? "on" : "off"}`);
  });
}

module.exports = { app, store, catalogue, __locks: inFlight };
