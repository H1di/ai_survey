// Step 3–4 of the free flow: build a roadmap from real catalogue courses and
// let the user manage it. Everything here is pure and deterministic — the AI
// (engine/aiEngine.js) only ever chooses among `candidatesForSlot` results and
// writes the one-line "why"; it never scores and never invents a course.
//
// Every step carries `basis`: the answers and scores it rests on, in plain
// words (report §05 "Every step is traceable").

const { getDirection } = require("../engine/directions");
const { BUDGET_CAP_EUR, labelFor } = require("./personalQuestions");

const MAX_STEPS = 8;
const CANDIDATES_PER_SLOT = 6;
// Constraints loosen in this order when a slot would otherwise be empty. The
// field goes last: it is what the user came for.
const RELAX_ORDER = ["budget", "location", "time", "field"];

const CITY_LABELS = {
  dublin: "Dublin",
  cork: "Cork",
  galway: "Galway",
  limerick: "Limerick",
  waterford: "Waterford",
  online: "Online",
};
const MODE_LABELS = { full_time: "Full-time", part_time: "Part-time", online: "Online, flexible" };

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

const formatEur = (n) => `€${Number(n).toLocaleString("en-IE")}`;

// The fields a course should come from: the user's answer, or — when they
// are unsure — the top three families of their interest test, if they took it.
function targetFields(profile, interestRanking) {
  if (profile.field && profile.field !== "unsure") return [profile.field];
  if (interestRanking?.length) return interestRanking.slice(0, 3).map((r) => r.id);
  return null; // unsure and untested: every field is fair
}

function meets(course, profile, constraint, fields) {
  switch (constraint) {
    case "budget":
      return course.feeEur <= (BUDGET_CAP_EUR[profile.budget] ?? Infinity);
    case "location":
      if (profile.location === "anywhere") return true;
      if (profile.location === "online_only") return course.mode === "online";
      return course.mode === "online" || course.city === profile.location;
    case "time":
      if (profile.time === "either" || course.mode === "online") return true;
      return course.mode === profile.time;
    case "field":
      return !fields || course.directionIds.some((d) => fields.includes(d));
    default:
      return true;
  }
}

function monthsUntil(startMonth, nowMonth) {
  return (startMonth - nowMonth + 12) % 12;
}

// Deterministic 0–100 fit for one course in one slot. Higher is better.
function scoreCourse(course, slot, profile, { fields, interestRanking, nowMonth }) {
  let score = 0;
  const kindRank = slot.kinds.indexOf(course.kind);
  score += kindRank === 0 ? 30 : kindRank === 1 ? 20 : 10;

  if (fields) {
    const hit = course.directionIds.find((d) => fields.includes(d));
    if (hit) {
      // Declared field: full marks; interest-derived: by rank.
      score += profile.field !== "unsure" ? 40 : 40 - 10 * fields.indexOf(hit);
    }
  } else if (interestRanking?.length) {
    const rank = interestRanking.findIndex((r) => course.directionIds.includes(r.id));
    if (rank >= 0 && rank < 5) score += 25 - rank * 5;
  }

  if (profile.location === "anywhere") score += 10;
  else if (course.city === profile.location) score += 15;
  else if (course.mode === "online") score += 10;

  if (profile.start === "asap" && monthsUntil(course.startMonth, nowMonth) <= 4) score += 10;
  else if (profile.start === "september" && course.startMonth === 9) score += 10;
  else if (profile.start === "later") score += 5;

  if (course.feeEur <= (BUDGET_CAP_EUR[profile.budget] ?? Infinity)) score += 5;
  return Math.min(100, score);
}

// Ranked candidates for one slot, loosening constraints until something fits.
function candidatesForSlot(catalogue, slot, profile, ctx = {}) {
  const fields = targetFields(profile, ctx.interestRanking);
  const exclude = new Set(ctx.excludeIds || []);
  const scoringCtx = { fields, interestRanking: ctx.interestRanking, nowMonth: ctx.nowMonth ?? 1 };
  const pool = catalogue.courses.filter((c) => slot.kinds.includes(c.kind) && !exclude.has(c.id));
  // `keep` names constraints that must never be loosened (a rebuild keeps the
  // field rather than wander into another one just to look different).
  const keep = new Set(ctx.keep || []);

  for (let k = 0; k <= RELAX_ORDER.length; k += 1) {
    const relaxed = RELAX_ORDER.slice(0, k);
    if (relaxed.some((con) => keep.has(con))) break;
    const active = RELAX_ORDER.slice(k);
    const fit = pool.filter((c) => active.every((con) => meets(c, profile, con, fields)));
    if (fit.length) {
      const ranked = fit
        .map((course) => ({ course, score: scoreCourse(course, slot, profile, scoringCtx) }))
        .sort((a, b) => b.score - a.score || a.course.id.localeCompare(b.course.id))
        .slice(0, ctx.limit || CANDIDATES_PER_SLOT);
      return { candidates: ranked, relaxed };
    }
  }
  return { candidates: [], relaxed: RELAX_ORDER.slice() };
}

// Plain-words reasons a step was chosen — each tied to an answer or a score.
function basisFor(course, slot, profile, { relaxed = [], interestRanking } = {}) {
  const lines = [];
  const fieldLabel = getDirection(course.directionIds[0])?.label || course.directionIds[0];
  if (profile.field !== "unsure" && course.directionIds.includes(profile.field)) {
    lines.push(`Field: ${fieldLabel} — your answer`);
  } else if (interestRanking?.length) {
    const rank = interestRanking.findIndex((r) => course.directionIds.includes(r.id));
    lines.push(
      rank >= 0
        ? `Field: ${fieldLabel} — #${rank + 1} in your interest test`
        : `Field: ${fieldLabel} — outside your top interests`
    );
  } else if (profile.field === "unsure") {
    lines.push(`Field: ${fieldLabel} — you're still exploring, so this is one option to try`);
  } else {
    lines.push(`Field: ${fieldLabel} — outside your chosen field (no match fitted your other answers)`);
  }

  lines.push(`${course.award} (NFQ ${course.nfqLevel}) — fills “${slot.label}”`);

  const place = course.mode === "online" ? "Online" : CITY_LABELS[course.city] || course.city;
  const locationOk = meets(course, profile, "location");
  lines.push(
    locationOk
      ? `${place} — fits “${labelFor("location", profile.location)}”`
      : `${place} — outside “${labelFor("location", profile.location)}” (nothing closer fitted)`
  );

  const budgetOk = meets(course, profile, "budget");
  lines.push(
    `${formatEur(course.feeEur)} a year — ${budgetOk ? "within" : "over"} your budget (${labelFor("budget", profile.budget)})`
  );

  const timeOk = meets(course, profile, "time");
  lines.push(`${MODE_LABELS[course.mode]} — ${timeOk ? "fits" : "differs from"} your time (${labelFor("time", profile.time)})`);

  // Name only the loosened answers this course actually breaks.
  const broken = relaxed.filter((con) => con !== "field" && !meets(course, profile, con));
  if (broken.length) {
    lines.push(`Nothing fitted all your answers for this step, so it goes outside your ${broken.join(" and ")}`);
  }
  return lines;
}

function makeStep(seq, slot, course, profile, extra = {}) {
  return {
    id: `step_${seq}`,
    slot: slot.id,
    slotLabel: slot.label,
    courseId: course.id,
    basis: basisFor(course, slot, profile, extra),
    why: extra.why || null,
    addedBy: extra.addedBy || "builder",
  };
}

// Per-slot candidate lists for one build. `avoidIds` are courses to steer away
// from (the previous path, on a rebuild) — honoured only where a slot still has
// another option, so a rebuild never empties a step just to be different.
function buildCandidateSets(catalogue, slots, profile, ctx = {}) {
  return slots.map((slot) => {
    const base = candidatesForSlot(catalogue, slot, profile, ctx);
    if (ctx.avoidIds?.length) {
      const avoid = new Set(ctx.avoidIds);
      const fresh = base.candidates.filter((c) => !avoid.has(c.course.id));
      if (fresh.length) return { slot, candidates: fresh, relaxed: base.relaxed };
      // Every strict candidate was on the old path: look one relaxation
      // further for a different course, but never outside the field unless the
      // original build had already left it. Nothing found → keep the original.
      const alt = candidatesForSlot(catalogue, slot, profile, {
        ...ctx,
        excludeIds: [...(ctx.excludeIds || []), ...ctx.avoidIds],
        keep: base.relaxed.includes("field") ? [] : ["field"],
      });
      if (alt.candidates.length) return { slot, ...alt };
    }
    return { slot, ...base };
  });
}

// Assemble steps from per-slot picks (course ids), enforcing: the id is one of
// that slot's candidates, no course twice. A missing/invalid pick falls back to
// the slot's best unused candidate; a slot with nothing left is dropped.
function assembleSteps(sets, picks, profile, { nextSeq, interestRanking, whyBySlot = {} }) {
  const used = new Set();
  const steps = [];
  let seq = nextSeq;
  for (const { slot, candidates, relaxed } of sets) {
    const wanted = picks[slot.id];
    let chosen = candidates.find((c) => c.course.id === wanted && !used.has(wanted));
    if (!chosen) chosen = candidates.find((c) => !used.has(c.course.id));
    if (!chosen) continue;
    used.add(chosen.course.id);
    const aiWhy = chosen.course.id === wanted ? whyBySlot[slot.id] : null;
    steps.push(makeStep(seq, slot, chosen.course, profile, { relaxed, interestRanking, why: aiWhy }));
    seq += 1;
  }
  return { steps, nextSeq: seq };
}

// Deterministic picks: the top candidate of each slot.
function defaultPicks(sets) {
  return Object.fromEntries(sets.map(({ slot, candidates }) => [slot.id, candidates[0]?.course.id]));
}

// ---------------------------------------------------------------------------
// Manage operations (free, unlimited): add, remove, swap, move. Each returns a
// new steps array; the caller stores it. Courses must exist in the catalogue.
// ---------------------------------------------------------------------------

const USER_SLOT = { id: "custom", label: "Added by you", kinds: [] };

function assertCourse(catalogue, courseId) {
  const course = typeof courseId === "string" ? catalogue.get(courseId) : null;
  if (!course) throw httpErr(404, "That course is not in the catalogue.");
  return course;
}

function findStep(steps, stepId) {
  const index = steps.findIndex((s) => s.id === stepId);
  if (index === -1) throw httpErr(404, "That step is not on your path.");
  return index;
}

function addStep(steps, catalogue, profile, { courseId, position, seq }) {
  const course = assertCourse(catalogue, courseId);
  if (steps.length >= MAX_STEPS) throw httpErr(400, `A path can hold at most ${MAX_STEPS} steps.`);
  if (steps.some((s) => s.courseId === course.id)) throw httpErr(409, "That course is already on your path.");
  const step = makeStep(seq, USER_SLOT, course, profile, { addedBy: "user" });
  const at = Number.isInteger(position) ? Math.max(0, Math.min(steps.length, position)) : steps.length;
  return [...steps.slice(0, at), step, ...steps.slice(at)];
}

function removeStep(steps, { stepId }) {
  const index = findStep(steps, stepId);
  if (steps.length <= 1) throw httpErr(400, "A path needs at least one step.");
  return steps.filter((_, i) => i !== index);
}

function swapStep(steps, catalogue, profile, { stepId, courseId }) {
  const index = findStep(steps, stepId);
  const course = assertCourse(catalogue, courseId);
  if (steps.some((s, i) => i !== index && s.courseId === course.id)) {
    throw httpErr(409, "That course is already on your path.");
  }
  const old = steps[index];
  const slot = { id: old.slot, label: old.slotLabel, kinds: [] };
  const replaced = { ...makeStep(0, slot, course, profile, { addedBy: "user" }), id: old.id };
  return steps.map((s, i) => (i === index ? replaced : s));
}

function moveStep(steps, { stepId, direction }) {
  const index = findStep(steps, stepId);
  const target = direction === "up" ? index - 1 : direction === "down" ? index + 1 : NaN;
  if (!Number.isInteger(target)) throw httpErr(400, "Direction must be up or down.");
  if (target < 0 || target >= steps.length) return steps;
  const next = steps.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Totals the UI and scenarios compare on.
function pathTotals(steps, catalogue) {
  let months = 0;
  let fees = 0;
  const cities = new Set();
  for (const s of steps) {
    const c = catalogue.get(s.courseId);
    if (!c) continue;
    months += c.durationMonths;
    fees += c.totalFeeEur ?? c.feeEur;
    if (c.mode !== "online") cities.add(c.city);
  }
  return { months, fees, cities: [...cities] };
}

module.exports = {
  MAX_STEPS,
  RELAX_ORDER,
  CITY_LABELS,
  MODE_LABELS,
  targetFields,
  meets,
  scoreCourse,
  candidatesForSlot,
  basisFor,
  buildCandidateSets,
  assembleSteps,
  defaultPicks,
  addStep,
  removeStep,
  swapStep,
  moveStep,
  pathTotals,
};
