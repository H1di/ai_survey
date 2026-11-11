import { describe, it, expect } from "vitest";
import { DURATION, SIT_END, STAGES, buildProfiles, frameAt, lightStart } from "./settleEngine";
import { RIASEC_ORDER, projectRiasec } from "../kit/riasecPlane";
import { totalDuration } from "../kit/timeline";
import persona from "../data/demo-profile.json";

const PROFILES = buildProfiles(persona);
const litKeys = (f) => RIASEC_ORDER.filter((k) => f.lit[k] >= 1);

describe("riasec-settle engine", () => {
  it("timeline matches the brief", () => {
    expect(STAGES.map((s) => totalDuration(STAGES.slice(0, STAGES.indexOf(s) + 1)))).toEqual([1.2, 3.0, 5.0, 6.0]);
    expect(DURATION).toBe(6);
  });

  it("persona code is the backend's stored riasecCode", () => {
    expect(PROFILES[0].code).toBe(persona.riasecCode);
  });

  it("starts empty", () => {
    for (const p of PROFILES) {
      const f = frameAt(0, p);
      expect(f.spokes.every((s) => s.len === 0)).toBe(true);
      expect(Math.hypot(f.point.x, f.point.y)).toBe(0);
      expect(f.pointAlpha).toBe(0);
      expect(litKeys(f)).toEqual([]);
    }
  });

  it("spokes end at score / 100", () => {
    for (const p of PROFILES) {
      for (const s of frameAt(1.2, p).spokes) expect(s.len).toBeCloseTo(p.scores[s.key] / 100);
    }
  });

  it("point at the end of stage 2 is projectRiasec(scores), and stays", () => {
    for (const p of PROFILES) {
      const target = projectRiasec(p.scores);
      for (const T of [SIT_END, DURATION]) {
        const f = frameAt(T, p);
        expect(f.point.x).toBeCloseTo(target.x, 10);
        expect(f.point.y).toBeCloseTo(target.y, 10);
      }
      expect(frameAt(SIT_END, p).trail.alpha).toBe(0);
      expect(litKeys(frameAt(SIT_END, p))).toEqual([]); // nothing lit before stage 3
    }
  });

  it("lit vertices equal riasecCode, lighting in code order", () => {
    for (const p of PROFILES) {
      const [a, b, c] = p.code;
      const mid = frameAt(lightStart(1), p);
      expect(mid.lit[a]).toBe(1);
      expect(mid.lit[b]).toBe(0);
      expect(mid.lit[c]).toBe(0);

      const end = frameAt(5.0, p);
      expect(litKeys(end).sort()).toEqual([...p.code].sort());
      expect(RIASEC_ORDER.filter((k) => end.lit[k] > 0).length).toBe(3);
      expect(end.letters.map((l) => l.key).join("")).toBe(p.code);
      expect(end.letters.every((l) => l.chars === l.name.length)).toBe(true);
    }
  });

  it("the three profiles really move the point", () => {
    expect(new Set(PROFILES.map((p) => p.code)).size).toBe(3);
    for (let i = 0; i < PROFILES.length; i += 1) {
      for (let j = i + 1; j < PROFILES.length; j += 1) {
        const d = Math.hypot(PROFILES[i].target.x - PROFILES[j].target.x, PROFILES[i].target.y - PROFILES[j].target.y);
        expect(d).toBeGreaterThan(0.3);
      }
    }
  });
});
