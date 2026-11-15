import { describe, it, expect } from "vitest";
import { HEX_VERTICES, RIASEC_ORDER, projectRiasec } from "./riasecPlane";

const at = (key) => HEX_VERTICES.find((v) => v.key === key);

describe("HEX_VERTICES", () => {
  it("puts R on top and runs R, I, A, S, E, C clockwise on a unit radius", () => {
    expect(HEX_VERTICES.map((v) => v.key)).toEqual(RIASEC_ORDER);
    expect(at("R").x).toBeCloseTo(0);
    expect(at("R").y).toBeCloseTo(-1); // screen space: up is negative y
    expect(at("I").x).toBeGreaterThan(0); // clockwise → I to the right of R
    expect(at("S").y).toBeCloseTo(1);
    expect(at("C").x).toBeLessThan(0);
    for (const v of HEX_VERTICES) expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
});

describe("projectRiasec", () => {
  it("lands on a vertex when one type carries all the weight", () => {
    const p = projectRiasec({ R: 10, I: 90, A: 10, S: 10, E: 10, C: 10 });
    expect(p.x).toBeCloseTo(at("I").x);
    expect(p.y).toBeCloseTo(at("I").y);
  });

  it("ignores elevation: a uniform shift does not move the point", () => {
    const base = { R: 13, I: 100, A: 88, S: 50, E: 63, C: 38 };
    const shifted = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v + 200]));
    expect(projectRiasec(shifted)).toEqual(projectRiasec(base));
  });

  it("sends a flat profile to the centre and stays inside the hexagon", () => {
    expect(projectRiasec({ R: 50, I: 50, A: 50, S: 50, E: 50, C: 50 })).toEqual({ x: 0, y: 0 });
    const p = projectRiasec({ R: 0, I: 100, A: 100, S: 0, E: 0, C: 0 });
    expect(p.x).toBeCloseTo((at("I").x + at("A").x) / 2);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1);
  });
});
