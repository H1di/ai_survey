// Writes the static data the dev-only animation demos read
// (frontend/demos/data/). Nothing here is a second implementation: the
// persona is seeded through core/devSeed.js into a real session, and every
// derived number comes from the same engine functions the server calls.
//
//   node scripts/build-demo-data.js      (node frontend/demos/scripts/build-demo-data.cjs)
//
// Keyless on purpose — the AI never enters demo data.
process.env.OPENAI_API_KEY = "";

const fs = require("node:fs");
const path = require("node:path");
const { SessionStore } = require("../../../backend/core/sessionStore");
const { DEV_PROFILE, seedTo } = require("../../../backend/core/devSeed");
const { createAiEngine } = require("../../../backend/engine/aiEngine");
const { rankDirections } = require("../../../backend/engine/riasec");
const { rankOccupations, getOccupation, ONET_ATTRIBUTION } = require("../../../backend/engine/onet");
const { getDirection } = require("../../../backend/engine/directions");
const {
  WORK_VALUES_ORDER,
  rankToWorkValueScores,
  valuesFit,
  buildFallbackProfessionValues,
} = require("../../../backend/engine/workValues");
const {
  startTournament,
  nextComparison,
  recordAnswer,
  finalOrder,
} = require("../../../backend/assessment/valuesTournament");
const snapshot = require("../../../backend/data/onet-snapshot.json");

const OUT_DIR = path.resolve(__dirname, "../data");
const SHORTLIST_LIMIT = 15;
const REFINE_ROUNDS = 3;

const round3 = (n) => Math.round(n * 1000) / 1000;

// Measured O*NET work values, or the per-direction prototype — the same
// fallback buildOutput (server.js) applies.
function occupationWorkValues(soc, directionId) {
  return getOccupation(soc)?.workValues || buildFallbackProfessionValues(directionId);
}

function shortlistItem(o) {
  return {
    soc: o.soc,
    title: o.title,
    directionId: o.directionId,
    r: round3(o.score),
    workValues: occupationWorkValues(o.soc, o.directionId),
  };
}

// Mirrors aiEngine.generateFirstOutput's grounding: top-5 families (minus the
// excluded ones), 15-occupation shortlist inside them minus used SOCs.
// `chosen` is shortlist[0] — the pick resolveShortlistSoc falls back to.
function groundingRound(riasecScores, { excludeIds, excludeSocs }) {
  const topDirections = rankDirections(riasecScores, { excludeIds })
    .slice(0, 5)
    .map((d) => ({ id: d.id, label: getDirection(d.id)?.label || d.id, score: d.score }));
  const shortlist = rankOccupations(riasecScores, {
    directionIds: topDirections.map((d) => d.id),
    excludeSocs,
    limit: SHORTLIST_LIMIT,
  }).map(shortlistItem);
  return { topDirections, shortlist, chosen: shortlist[0] };
}

// Transitive closure of the decided answers: every [better, worse] pair the
// tournament has established so far. A genuine partial order, not a ranking.
function knownRelations(decided) {
  const beats = new Map(WORK_VALUES_ORDER.map((k) => [k, new Set()]));
  for (const d of decided) beats.get(d.winner).add(d.winner === d.a ? d.b : d.a);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [, below] of beats) {
      for (const mid of [...below]) {
        for (const low of beats.get(mid)) {
          if (!below.has(low)) {
            below.add(low);
            changed = true;
          }
        }
      }
    }
  }
  const pairs = [];
  for (const better of WORK_VALUES_ORDER) {
    for (const worse of WORK_VALUES_ORDER) if (beats.get(better).has(worse)) pairs.push([better, worse]);
  }
  return pairs;
}

// Replays the real engine with an oracle that answers by the persona's order.
function tournamentTrace(order) {
  const rank = new Map(order.map((k, i) => [k, i]));
  let state = startTournament(WORK_VALUES_ORDER);
  const trace = [];
  for (let pending = nextComparison(state); pending; pending = nextComparison(state)) {
    const winner = rank.get(pending.a) < rank.get(pending.b) ? pending.a : pending.b;
    const result = recordAnswer(state, { comparisonId: pending.comparisonId, winner });
    if (!result.ok) throw new Error(`tournament replay rejected: ${result.reason}`);
    state = result.state;
    trace.push({ a: pending.a, b: pending.b, winner, partialOrder: knownRelations(state.decided) });
  }
  const final = finalOrder(state);
  if (JSON.stringify(final) !== JSON.stringify(order)) {
    throw new Error(`tournament replay ended at ${final}, expected ${order}`);
  }
  return trace;
}

async function main() {
  const store = new SessionStore();
  const aiEngine = createAiEngine({ apiKey: undefined, model: "demo" });
  const session = store.createSession({ dreamAnswer: DEV_PROFILE.dreamAnswer });
  await seedTo(session, "tree", { store, aiEngine });

  const riasecScores = session.riasecScores;
  const valuesOrder = session.userValues.order;
  const valuesScores = rankToWorkValueScores(valuesOrder);

  const first = groundingRound(riasecScores, { excludeIds: [], excludeSocs: [] });

  // Refine path (server.js /api/output/refine): every family already shown is
  // excluded, and every SOC already shown leaves the shortlist.
  const refineTrace = [];
  const usedDirections = [first.chosen.directionId];
  const usedSocs = [first.chosen.soc];
  for (let i = 0; i < REFINE_ROUNDS; i += 1) {
    const excludedDirectionIds = usedDirections.slice();
    const round = groundingRound(riasecScores, { excludeIds: excludedDirectionIds, excludeSocs: usedSocs });
    refineTrace.push({
      excludedDirectionIds,
      topDirections: round.topDirections,
      chosen: round.chosen,
      valuesFit: valuesFit(valuesScores, round.chosen.workValues),
    });
    usedDirections.push(round.chosen.directionId);
    usedSocs.push(round.chosen.soc);
  }

  // Keyless roadmap through the real generator (no client → fallbackRoadmap).
  const roadmap = await aiEngine.generateRoadmap({
    session,
    output: {
      id: "output_1",
      jobTitle: first.chosen.title,
      thesis: getOccupation(first.chosen.soc)?.blurb || "",
      orientedField: getDirection(first.chosen.directionId)?.label || first.chosen.directionId,
    },
  });

  const profile = {
    generatedFrom: "frontend/demos/scripts/build-demo-data.cjs",
    snapshotVersion: snapshot.version,
    bigFiveScores: session.bigFiveScores,
    riasecScores,
    riasecCode: session.riasecCode,
    valuesOrder,
    valuesScores,
    topDirections: first.topDirections,
    shortlist: first.shortlist,
    chosen: first.chosen,
    valuesFit: valuesFit(valuesScores, first.chosen.workValues),
    tournamentTrace: tournamentTrace(valuesOrder),
    refineTrace,
    roadmap,
    onetAttribution: ONET_ATTRIBUTION,
  };

  const occupations = snapshot.occupations.map((o) => ({
    soc: o.soc,
    title: o.title,
    riasec: o.riasec,
    directionId: o.directionId,
    workValues: o.workValues || null,
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "occupations.json"), JSON.stringify(occupations));
  fs.writeFileSync(path.join(OUT_DIR, "demo-profile.json"), `${JSON.stringify(profile, null, 2)}\n`);
  console.log(
    `[demo:data] ${occupations.length} occupations; ${profile.riasecCode}; chosen ${profile.chosen.title} ` +
      `(${profile.chosen.soc}), valuesFit ${profile.valuesFit.overall} -> ${path.relative(process.cwd(), OUT_DIR)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
