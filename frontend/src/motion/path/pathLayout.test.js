import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAGE_MONTHS,
  approxMonths,
  chooseTicks,
  layoutPath,
  parseTimeframeMonths,
  revealExtent,
  scheduleStages,
  stageInitials,
  stageWindow,
  testScoreRows,
  topInterestRows,
  wavePoint,
} from "./pathLayout";
import profile from "../../../demos/data/demo-profile.json";

const DEMO = profile.roadmap.stages;
const stage = (id, title, timeframe) => ({ id, title, timeframe, description: "", milestone: "" });

describe("parseTimeframeMonths", () => {
  it.each([
    ["2-3 months", 2.5],
    ["2–3 months", 2.5],
    ["3 to 6 months", 4.5],
    ["0-3 months of searching", 1.5],
    ["12-24 months", 18],
    ["1 year", 12],
    ["1-2 years", 18],
    ["a year", 12],
    ["half a year", 6],
    ["six months", 6],
    ["3+ months", 3],
    ["Month 4", 4],
    ["3-6", 4.5],
  ])("%s → %s months", (text, months) => {
    expect(parseTimeframeMonths(text)).toBeCloseTo(months, 5);
  });

  it("converts weeks and days", () => {
    expect(parseTimeframeMonths("6 weeks")).toBeCloseTo(6 * (12 / 52), 5);
    expect(parseTimeframeMonths("4-8 weeks")).toBeCloseTo(6 * (12 / 52), 5);
    expect(parseTimeframeMonths("a couple of weeks")).toBe(0.5); // floored
    expect(parseTimeframeMonths("90 days")).toBeCloseTo(90 / 30.44, 5);
  });

  it("falls back to the default for empty or unreadable text", () => {
    for (const t of ["", "   ", null, undefined, "ongoing", "as long as it takes", "0 months"]) {
      expect(parseTimeframeMonths(t)).toBe(DEFAULT_STAGE_MONTHS);
    }
  });

  it("clamps absurd values", () => {
    expect(parseTimeframeMonths("50 years")).toBe(120);
    expect(parseTimeframeMonths("1 day")).toBe(0.5);
  });
});

describe("schedule and ticks", () => {
  it("accumulates stage windows from now", () => {
    const s = scheduleStages([stage("a", "A", "2-3 months"), stage("b", "B", "1 year"), stage("c", "C", "")]);
    expect(s.map((x) => [x.start, x.end])).toEqual([
      [0, 2.5],
      [2.5, 14.5],
      [14.5, 17.5],
    ]);
  });

  it("picks round steps with room after the last stage", () => {
    expect(chooseTicks(30.5, 8)).toMatchObject({ step: 6, end: 36 });
    expect(chooseTicks(5, 8)).toMatchObject({ step: 1, end: 6 });
    expect(chooseTicks(11, 8)).toMatchObject({ step: 2, end: 12 });
    const long = chooseTicks(100, 8);
    expect(long.end).toBeGreaterThan(100);
    expect(long.months.length - 1).toBeLessThanOrEqual(8);
    expect(long.months[0]).toBe(0);
  });

  it("labels ticks from now, in months", () => {
    const { ticks } = layoutPath(DEMO);
    expect(ticks.map((t) => t.label)).toEqual(["now", "6m", "12m", "18m", "24m", "30m", "36m"]);
  });

  it("formats approximate months and stage windows", () => {
    expect(approxMonths(2.5)).toBe("≈3m");
    expect(approxMonths(0.3)).toBe("≈1m");
    expect(stageWindow({ start: 0, end: 2.5 })).toBe("now → ≈3m");
    expect(stageWindow({ start: 5, end: 6.5 })).toBe("≈5m → ≈7m");
  });
});

describe("stageInitials", () => {
  it("takes two meaningful initials", () => {
    expect(stageInitials("First real projects")).toBe("FR");
    expect(stageInitials("Entry-level readiness")).toBe("ER");
    expect(stageInitials("Foundations")).toBe("FO");
    expect(stageInitials("The first job")).toBe("FJ");
    expect(stageInitials("")).toBe("··");
  });
});

// Every pair of pill rectangles is disjoint.
function expectNoOverlap(labels) {
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i];
      const b = labels[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `${a.text} / ${b.text}`).toBe(true);
    }
  }
}

const EIGHT_EVEN = Array.from({ length: 8 }, (_, i) => stage(`s${i}`, `Stage number ${i + 1} title`, "2 months"));
const CROWDED = [
  ...Array.from({ length: 6 }, (_, i) => stage(`w${i}`, `Quick sprint ${i + 1}`, "2 weeks")),
  stage("long", "Established practitioner", "2 years"),
];
const CASES = { demo: DEMO, eight: EIGHT_EVEN, crowded: CROWDED, one: [DEMO[0]] };

describe("layoutPath", () => {
  for (const orientation of ["horizontal", "vertical"]) {
    describe(orientation, () => {
      for (const [name, stages] of Object.entries(CASES)) {
        it(`${name}: pills never overlap and stay inside the plot`, () => {
          const layout = layoutPath(stages, { orientation });
          expect(layout.labels).toHaveLength(stages.length);
          expectNoOverlap(layout.labels);
          for (const l of layout.labels) {
            expect(l.x).toBeGreaterThanOrEqual(0);
            expect(l.x + l.w).toBeLessThanOrEqual(layout.width + 0.5);
            expect(l.y).toBeGreaterThanOrEqual(0);
            expect(l.y + l.h).toBeLessThanOrEqual(layout.height);
          }
        });

        it(`${name}: markers sit on the wave, in time order, never touching`, () => {
          const layout = layoutPath(stages, { orientation });
          const along = (p) => (orientation === "vertical" ? p.y : p.x);
          layout.markers.forEach((m, i) => {
            const onWave = wavePoint(layout, along(m));
            expect(m.x).toBeCloseTo(onWave.x, 5);
            expect(m.y).toBeCloseTo(onWave.y, 5);
            expect(along(m)).toBeCloseTo(layout.track[i + 1], 5);
            if (i) expect(along(m) - along(layout.markers[i - 1])).toBeGreaterThanOrEqual(2 * layout.r);
          });
          expect(along(layout.now)).toBe(layout.track[0]);
        });
      }
    });
  }

  it("horizontal: a pill always covers its marker's x, and leaders join the two", () => {
    for (const stages of Object.values(CASES)) {
      const layout = layoutPath(stages);
      for (const l of layout.labels) {
        const m = layout.markers[l.index];
        expect(m.x).toBeGreaterThanOrEqual(l.x);
        expect(m.x).toBeLessThanOrEqual(l.x + l.w);
        expect(l.leader.x1).toBe(m.x);
        expect([l.y, l.y + l.h]).toContain(l.leader.y2);
      }
    }
  });

  it("horizontal demo roadmap: no leader runs through another stage's pill", () => {
    const layout = layoutPath(DEMO);
    for (const l of layout.labels) {
      const top = Math.min(l.leader.y1, l.leader.y2);
      const bottom = Math.max(l.leader.y1, l.leader.y2);
      for (const other of layout.labels) {
        if (other === l) continue;
        const crossesX = l.leader.x1 > other.x && l.leader.x1 < other.x + other.w;
        const crossesY = top < other.y + other.h && bottom > other.y;
        expect(crossesX && crossesY, `${l.text} through ${other.text}`).toBe(false);
      }
    }
  });

  it("labels carry the title and the approximate month it is done by", () => {
    const layout = layoutPath(DEMO);
    expect(layout.labels[0].text).toBe("Foundations · ≈3m");
    expect(layout.markers[1]).toMatchObject({ id: "stage_2", initials: "FR", start: 2.5, end: 5 });
  });

  it("empty roadmap lays out without stages", () => {
    const layout = layoutPath([]);
    expect(layout.markers).toEqual([]);
    expect(layout.labels).toEqual([]);
    expect(layout.track).toHaveLength(2);
  });
});

describe("revealExtent", () => {
  const layout = layoutPath(DEMO.slice(0, 3));
  const t = layout.track;
  const f = (edge, node = 0, label = 0) => ({ edge, node, label });

  it("outside a reveal the whole line is drawn", () => {
    expect(revealExtent(layout, null)).toBe(t[t.length - 1]);
  });

  it("each edge window draws the stretch into its marker, then the tail runs out", () => {
    expect(revealExtent(layout, [f(0), f(0), f(0)])).toBe(t[0]);
    expect(revealExtent(layout, [f(0.5), f(0), f(0)])).toBeCloseTo((t[0] + t[1]) / 2, 5);
    expect(revealExtent(layout, [f(1, 1, 1), f(1, 1, 1), f(0.5)])).toBeCloseTo((t[2] + t[3]) / 2, 5);
    expect(revealExtent(layout, [f(1, 1, 1), f(1, 1, 1), f(1, 1, 0)])).toBe(t[3]);
    expect(revealExtent(layout, [f(1, 1, 1), f(1, 1, 1), f(1, 1, 1)])).toBe(t[4]);
  });
});

describe("side panel rows", () => {
  it("shows Neuroticism as Steadiness = 100 − N", () => {
    const rows = testScoreRows({ O: 94, C: 75, E: 44, A: 75, N: 25 });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Openness", 94],
      ["Conscientiousness", 75],
      ["Extraversion", 44],
      ["Agreeableness", 75],
      ["Steadiness", 75],
    ]);
    expect(testScoreRows(null)).toEqual([]);
  });

  it("ranks the top interests, highest first", () => {
    const rows = topInterestRows({ R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 });
    expect(rows.map((r) => r.label)).toEqual(["Investigative", "Artistic", "Enterprising", "Social"]);
    expect(topInterestRows(null)).toEqual([]);
  });
});
