import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { totalDuration } from "../timeline";
import { WORK_VALUE_ORDER } from "../../lifePath";
import profile from "../../../demos/data/demo-profile.json";
import { MAX_CHOICES, buildStages, frameAt, knownRelations, layoutAt, layoutFrom } from "./insertionModel";

const trace = profile.tournamentTrace;
const STAGES = buildStages(trace);
const require = createRequire(import.meta.url);
const engine = require("../../../../backend/assessment/valuesTournament.js");

describe("values-insertion model", () => {
  it("replays the trace into demo-profile.valuesOrder within the 10-choice budget", () => {
    expect(trace.length).toBeLessThanOrEqual(MAX_CHOICES);
    const end = layoutAt(trace, WORK_VALUE_ORDER, trace.length);
    expect(end.pending).toBeNull();
    expect(end.pool).toEqual([]);
    expect(end.column.map((r) => r.key)).toEqual(profile.valuesOrder);
    expect(end.column.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(end.column.every((r, i, all) => i === all.length - 1 || r.linkBelow)).toBe(true);
  });

  it("is the real engine's question sequence", () => {
    let state = engine.startTournament(WORK_VALUE_ORDER);
    for (const step of trace) {
      const next = engine.nextComparison(state);
      expect([next.a, next.b]).toEqual([step.a, step.b]);
      state = engine.recordAnswer(state, { comparisonId: next.comparisonId, winner: step.winner }).state;
    }
    expect(engine.nextComparison(state)).toBeNull();
    expect(engine.finalOrder(state)).toEqual(profile.valuesOrder);
  });

  it("shows every value exactly once at every step, ranks only when certain", () => {
    for (let k = 0; k <= trace.length; k += 1) {
      const { pending, column, pool } = layoutAt(trace, WORK_VALUE_ORDER, k);
      const shown = [...(pending ? [pending.a, pending.b] : []), ...column.map((r) => r.key), ...pool];
      expect(shown.slice().sort()).toEqual(WORK_VALUE_ORDER.slice().sort());
      for (const row of column.filter((r) => r.rank)) {
        expect(profile.valuesOrder.indexOf(row.key) + 1).toBe(row.rank);
      }
    }
  });

  it("derives the partial order from the answers alone, exactly as recorded", () => {
    // The fixture's partialOrder was computed next to the real engine; the
    // product has only { a, b, winner } per answer and must reach the same set.
    const key = (pairs) => pairs.map(([b, w]) => `${b}>${w}`).sort();
    trace.forEach((step, i) => {
      expect(key(knownRelations(trace.slice(0, i + 1)))).toEqual(key(step.partialOrder));
    });
    expect(knownRelations([])).toEqual([]);
    expect(knownRelations(trace)).toHaveLength(15);
  });

  it("lays out a live tournament state: answers so far plus the pending pair", () => {
    const decided = trace.slice(0, 4).map(({ a, b, winner }) => ({ a, b, winner }));
    const pending = { comparisonId: "x", a: trace[4].a, b: trace[4].b };
    expect(layoutFrom({ decided, pending, items: WORK_VALUE_ORDER })).toEqual(
      layoutAt(trace, WORK_VALUE_ORDER, 4)
    );
    // Before the first answer everything but the pair waits in the pool.
    const start = layoutFrom({ decided: [], pending: trace[0], items: WORK_VALUE_ORDER });
    expect(start.column).toEqual([]);
    expect(start.pool).toHaveLength(4);
    // A finished tournament with no record (rail revisit): nothing to claim.
    const blank = layoutFrom({ items: WORK_VALUE_ORDER });
    expect(blank.pending).toBeNull();
    expect(blank.column).toEqual([]);
  });

  it("applies each answer before its stage ends; the end frame is confirmed", () => {
    expect(frameAt(0, trace, STAGES)).toMatchObject({ applied: 0, chosen: null, choice: 1 });
    expect(frameAt(0.6, trace, STAGES).chosen).toBe(trace[0].winner);
    expect(frameAt(STEP(1), trace, STAGES)).toMatchObject({ applied: 1, chosen: null, choice: 2 });
    expect(frameAt(totalDuration(STAGES), trace, STAGES)).toMatchObject({
      applied: trace.length,
      confirmed: true,
    });
  });
});

function STEP(n) {
  return totalDuration(STAGES.slice(0, n));
}
