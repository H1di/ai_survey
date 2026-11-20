// "Deeper AI guidance" (paid add-on, report §01/§07): once the tests are done,
// explain the path, propose two or three scenarios and recommend what to add.
// The numbers here are all deterministic; the AI only writes prose around
// them (engine/aiEngine.js → generateGuidance).

const { rankDirections, rankingRiasec } = require("../engine/riasec");
const { rankOccupations, getOccupation } = require("../engine/onet");
const { valuesFit, buildFallbackProfessionValues } = require("../engine/workValues");
const { getDirection } = require("../engine/directions");
const { pathTotals, targetFields, meets, scoreCourse, CITY_LABELS } = require("./pathEngine");

function interestRanking(tests) {
  if (!tests?.riasecScores) return null;
  return rankDirections(rankingRiasec(tests.riasecScores, tests.bigFiveScores));
}

// The field the path is mostly about: the most common family across steps.
function pathField(steps, catalogue) {
  const counts = new Map();
  for (const s of steps) {
    for (const d of catalogue.get(s.courseId)?.directionIds || []) {
      counts.set(d, (counts.get(d) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

// Real O*NET occupations the path leads toward: ranked by measured interest fit
// inside the path's field, each with a values-fit against the user's hierarchy.
function occupationsFor(tests, directionId, limit = 3) {
  const scores = rankingRiasec(tests.riasecScores, tests.bigFiveScores);
  const picks = rankOccupations(scores, { directionIds: directionId ? [directionId] : undefined, limit });
  return picks.map((o) => {
    const full = getOccupation(o.soc);
    const jobValues = full?.workValues || buildFallbackProfessionValues(o.directionId);
    return {
      soc: o.soc,
      title: o.title,
      directionId: o.directionId,
      // Pearson r (−1…1) shown as 0–100.
      interestFit: Math.round(((o.score ?? 0) + 1) * 50),
      valuesFit: tests.userValues ? valuesFit(tests.userValues.scores, jobValues).overall : null,
      skills: full?.skills || [],
    };
  });
}

// Scenario = the same slots filled with a different priority: fastest
// (shortest total duration), cheapest (lowest fees) or closest (no move).
const SCENARIO_KINDS = [
  { id: "fastest", label: "The faster way", sort: (a, b) => a.course.durationMonths - b.course.durationMonths },
  { id: "cheapest", label: "The cheaper way", sort: (a, b) => a.course.feeEur - b.course.feeEur },
  {
    id: "closest",
    label: "Closer to home",
    sort: (a, b, profile) => homeRank(a.course, profile) - homeRank(b.course, profile),
  },
];

function homeRank(course, profile) {
  if (course.mode === "online") return 0;
  if (course.city === profile.location) return 0;
  return 1;
}

// A scenario is a trade-off, so it may break the user's location, budget or
// time answers — but never the field — and it says exactly which it breaks.
const SCENARIO_FLEX = ["budget", "location", "time"];

function buildScenarios({ session, catalogue, slots, ranking, nowMonth }) {
  const profile = session.profile;
  const fields = targetFields(profile, ranking);
  const current = pathTotals(session.path.steps, catalogue);
  const seen = new Set([session.path.steps.map((s) => s.courseId).join("|")]);
  const scenarios = [];
  for (const kind of SCENARIO_KINDS) {
    const used = new Set();
    const courseIds = [];
    for (const slot of slots) {
      const pick = catalogue.courses
        .filter((c) => slot.kinds.includes(c.kind) && !used.has(c.id) && meets(c, profile, "field", fields))
        .map((course) => ({ course, score: scoreCourse(course, slot, profile, { fields, interestRanking: ranking, nowMonth }) }))
        .sort((a, b) => kind.sort(a, b, profile) || b.score - a.score || a.course.id.localeCompare(b.course.id))[0];
      if (pick) {
        used.add(pick.course.id);
        courseIds.push({ slot: slot.id, courseId: pick.course.id });
      }
    }
    const key = courseIds.map((c) => c.courseId).join("|");
    if (!courseIds.length || seen.has(key)) continue;
    seen.add(key);
    const totals = pathTotals(courseIds, catalogue);
    const breaks = SCENARIO_FLEX.filter((con) =>
      courseIds.some(({ courseId }) => !meets(catalogue.get(courseId), profile, con, fields))
    );
    scenarios.push({
      id: kind.id,
      label: kind.label,
      steps: courseIds,
      totals,
      breaks,
      versusCurrent: {
        months: totals.months - current.months,
        fees: totals.fees - current.fees,
      },
    });
  }
  return scenarios.slice(0, 3);
}

// Short courses that build skills the target occupation needs and the path
// does not yet cover — "matching is the overlap".
// Only from the path's field or the user's top interest fields: generic skills
// (Coordination, Speaking…) would otherwise pull in unrelated courses.
function recommendAdditions({ session, catalogue, occupation, allowedFields, limit = 3 }) {
  if (!occupation || !allowedFields?.length) return [];
  const onPath = new Set(session.path.steps.map((s) => s.courseId));
  const covered = new Set(
    session.path.steps.flatMap((s) => catalogue.get(s.courseId)?.skills || [])
  );
  const needed = occupation.skills.filter((s) => !covered.has(s));
  if (!needed.length) return [];
  return catalogue.courses
    .filter((c) => !onPath.has(c.id) && (c.kind === "short" || c.kind === "plc"))
    .filter((c) => c.directionIds.some((d) => allowedFields.includes(d)))
    .map((c) => ({ course: c, overlap: c.skills.filter((s) => needed.includes(s)) }))
    .filter((r) => r.overlap.length)
    .sort((a, b) => b.overlap.length - a.overlap.length || a.course.id.localeCompare(b.course.id))
    .slice(0, limit)
    .map((r) => ({ courseId: r.course.id, buildsSkills: r.overlap }));
}

function buildGuidanceFacts({ session, catalogue, slots, nowMonth }) {
  const tests = session.tests;
  const ranking = interestRanking(tests);
  const field = pathField(session.path.steps, catalogue);
  const occupations = occupationsFor(tests, field);
  return {
    interestTop: (ranking || []).slice(0, 3).map((r) => ({ id: r.id, label: getDirection(r.id)?.label || r.id, score: r.score })),
    pathField: field ? { id: field, label: getDirection(field)?.label || field } : null,
    pathFieldRank: ranking ? ranking.findIndex((r) => r.id === field) + 1 || null : null,
    occupations,
    scenarios: buildScenarios({ session, catalogue, slots, ranking, nowMonth }),
    additions: recommendAdditions({
      session,
      catalogue,
      occupation: occupations[0],
      allowedFields: [...new Set([field, ...(ranking || []).slice(0, 3).map((r) => r.id)].filter(Boolean))],
    }),
    homeCity: CITY_LABELS[session.profile.location] || null,
  };
}

module.exports = {
  interestRanking,
  pathField,
  occupationsFor,
  buildScenarios,
  recommendAdditions,
  buildGuidanceFacts,
};
