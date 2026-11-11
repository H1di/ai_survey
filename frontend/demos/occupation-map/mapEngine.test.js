import { describe, it, expect } from "vitest";
import occupations from "../data/occupations.json";
import {
  HIGHLIGHT,
  HIGHLIGHT_VISIBLE,
  LOOP_S,
  OPACITY,
  basePosition,
  buildField,
  highlightAt,
  highlightOrder,
  labelBox,
  layoutFor,
  opacityAt,
  position,
} from "./mapEngine";

const field = buildField(occupations);
const layouts = [layoutFor(360, 640), layoutFor(1280, 720)];

describe("position(i, T)", () => {
  it("is a pure function of T — same input, same point, even from a rebuilt field", () => {
    const again = buildField(occupations);
    const lay = layouts[1];
    for (const i of [0, 17, 461, 922]) {
      for (const T of [0, 3.3, 119.7, 239.99]) {
        expect(position(again, i, T, lay)).toEqual(position(field, i, T, lay));
      }
    }
  });

  it("orbits 1.5–3 px around the base point and closes the loop at LOOP_S", () => {
    const lay = layouts[0];
    field.forEach((d, i) => {
      expect(d.period).toBeGreaterThanOrEqual(20);
      expect(d.period).toBeLessThanOrEqual(40);
      const b = basePosition(d, lay);
      const p = position(field, i, 7.1, lay);
      const r = Math.hypot(p.x - b.x, p.y - b.y);
      expect(r).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(r).toBeLessThanOrEqual(3 + 1e-9);
      const a = position(field, i, 0, lay);
      const z = position(field, i, LOOP_S, lay);
      expect(z.x).toBeCloseTo(a.x, 6);
      expect(z.y).toBeCloseTo(a.y, 6);
    });
  });
});

describe("highlight schedule", () => {
  it("never shows two occupations at once and never repeats back-to-back", () => {
    expect(HIGHLIGHT_VISIBLE).toBeLessThan(HIGHLIGHT.slot);
    for (const lay of layouts) {
      const order = highlightOrder(field, lay);
      expect(order.length).toBeGreaterThan(LOOP_S / HIGHLIGHT.slot);
      // Walk the loop finely: the active index may only change after a dark gap.
      let prev = null;
      let darkSince = true;
      for (let T = 0; T <= LOOP_S; T += 0.05) {
        const h = highlightAt(T, order);
        if (!h) {
          darkSince = true;
          continue;
        }
        if (prev !== null && h.index !== prev) expect(darkSince).toBe(true);
        prev = h.index;
        darkSince = false;
      }
      const slots = LOOP_S / HIGHLIGHT.slot;
      for (let k = 1; k < slots; k += 1) expect(order[k]).not.toBe(order[k - 1]);
    }
  });

  it("highlights only dots and titles that sit fully outside the hero copy mask", () => {
    for (const lay of layouts) {
      for (const i of highlightOrder(field, lay)) {
        const b = basePosition(field[i], lay);
        expect(opacityAt(b.x, b.y, lay)).toBe(OPACITY.full);
        expect(labelBox(field[i].title, b.x, b.y, lay)).not.toBeNull();
      }
    }
  });

  it("is off under reduced motion", () => {
    const order = highlightOrder(field, layouts[1]);
    expect(highlightAt(1, order)).not.toBeNull();
    expect(highlightAt(1, order, true)).toBeNull();
  });
});

describe("hero mask", () => {
  it("keeps every point of the copy box at ≤ 25 % dot opacity", () => {
    for (const lay of layouts) {
      const { x, y, w, h } = lay.copy;
      for (let u = 0; u <= 1; u += 0.05) {
        for (let v = 0; v <= 1; v += 0.05) {
          expect(opacityAt(x + u * w, y + v * h, lay)).toBeLessThanOrEqual(0.25);
        }
      }
    }
  });
});
