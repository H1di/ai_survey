import { describe, expect, it } from "vitest";
import {
  compareRows,
  deltaLabel,
  formToAnswers,
  formatDuration,
  formatEur,
  missingAnswers,
  profileToForm,
  rebuildState,
  toggleCompare,
} from "./pathView";

describe("formatting", () => {
  it("formats fees and durations", () => {
    expect(formatEur(0)).toBe("Free");
    expect(formatEur(3000)).toBe("€3,000");
    expect(formatDuration(3)).toBe("3 months");
    expect(formatDuration(48)).toBe("4 years");
    expect(formatDuration(18)).toBe("18 months");
    expect(deltaLabel(-1500, "fees")).toBe("−€1,500");
    expect(deltaLabel(12, "months")).toBe("+1 year");
    expect(deltaLabel(0, "months")).toBe("same length");
  });
});

describe("rebuildState", () => {
  it("counts down the free rebuilds and locks at zero", () => {
    expect(rebuildState({ free: 3, remaining: 2, unlimited: false }).hint).toBe("2 of 3 free rebuilds left");
    const out = rebuildState({ free: 3, remaining: 0, unlimited: false });
    expect(out.disabled).toBe(true);
    expect(out.exhausted).toBe(true);
    expect(rebuildState({ free: 3, remaining: null, unlimited: true }).disabled).toBe(false);
  });
});

describe("compare list", () => {
  it("toggles and caps at three, dropping the oldest", () => {
    let l = toggleCompare([], "a");
    l = toggleCompare(l, "b");
    l = toggleCompare(l, "c");
    l = toggleCompare(l, "d");
    expect(l).toEqual(["b", "c", "d"]);
    expect(toggleCompare(l, "c")).toEqual(["b", "d"]);
  });

  it("builds one row per detail with a value per course", () => {
    const course = {
      provider: "P",
      award: "A",
      nfqLevel: 8,
      kind: "undergrad",
      mode: "online",
      city: "online",
      durationMonths: 12,
      feeEur: 0,
      totalFeeEur: 0,
      startMonth: 9,
      skills: ["Writing"],
    };
    const rows = compareRows([course, { ...course, feeEur: 500, totalFeeEur: 500 }]);
    expect(rows.find((r) => r.label === "Fee per year").values).toEqual(["Free", "€500"]);
    expect(rows.find((r) => r.label === "Starts").values).toEqual(["Sep", "Sep"]);
  });
});

describe("profile form", () => {
  const questions = [
    { id: "age", kind: "number" },
    { id: "goal", kind: "text" },
    { id: "field", kind: "single" },
  ];
  it("round-trips age as a number and finds missing answers", () => {
    const form = profileToForm({ age: 17, goal: "x", field: "tech" });
    expect(form.age).toBe("17");
    expect(formToAnswers(form).age).toBe(17);
    expect(missingAnswers(questions, form)).toEqual([]);
    expect(missingAnswers(questions, { age: "", goal: " " })).toEqual(["age", "goal", "field"]);
  });
});
