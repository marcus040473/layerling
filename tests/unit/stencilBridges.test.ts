import { describe, expect, it } from "vitest";
import { normalizedStencilBridges, stencilBridges } from "@/lib/stencilBridges";

const square = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx: number, cy: number, r: number, n = 96): Array<[number, number]> => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as [number, number]);

const bounds = (rect: Array<[number, number]>) => {
  const xs = rect.map((p) => p[0]);
  const ys = rect.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

describe("stencil bridges", () => {
  it("hold a part inside a hole to the plate round it, as many as asked, the short way across", () => {
    // A plate with a square hole and a square part in it, like the middle of an "o": 10 mm of gap all round.
    const loops = [square(0, 0, 50, 50), square(10, 10, 40, 40).reverse(), square(20, 20, 30, 30)];
    const two = stencilBridges(loops, { width: 1, count: 2 });
    expect(two.rects).toHaveLength(2);
    expect(two.unheld).toBe(0);
    for (const rect of two.rects) {
      const box = bounds(rect);
      // Upright, 1 mm wide, in the middle of the part's flat side, across the 10 mm gap and 0.3 mm into both.
      expect(box.maxX - box.minX).toBeCloseTo(1, 6);
      expect((box.maxX + box.minX) / 2).toBeCloseTo(25, 6);
      expect(box.maxY - box.minY).toBeCloseTo(10 + 0.6, 6);
    }
    expect(stencilBridges(loops, { width: 1, count: 3 }).rects).toHaveLength(3);
    expect(stencilBridges(loops, { width: 1, count: 1 }).rects).toHaveLength(1);
  });

  it("leaves the plate, its holes and a part that does not fall out alone", () => {
    expect(stencilBridges([square(0, 0, 50, 50), square(10, 10, 40, 40)], { width: 1, count: 2 }).rects).toHaveLength(0);
    // Two parts in one hole: each gets its own bridges.
    const loops = [square(0, 0, 100, 50), square(10, 10, 90, 40), square(20, 20, 30, 30), square(70, 20, 80, 30)];
    expect(stencilBridges(loops, { width: 2, count: 2 }).rects).toHaveLength(4);
    // A part inside a part's hole (the depth goes on): plate, hole, part with a hole, part in that.
    const nested = [square(0, 0, 100, 100), square(10, 10, 90, 90), square(20, 20, 80, 80), square(30, 30, 70, 70), square(40, 40, 60, 60)];
    expect(stencilBridges(nested, { width: 1, count: 1 }).rects).toHaveLength(2);
  });

  it("does not reach into another hole through a thin web", () => {
    // The hole round the part has a 0.2 mm web to a second hole on its right and above: the 0.3 mm a bridge reaches
    // into the material would open that web; left and below are solid.
    const loops = [square(-40, -25, 40, 25), square(-20, -10, 0, 10), square(-14, -4, -6, 4), square(0.2, -10, 5.2, 10), square(-20, 10.2, 0, 13.2)];
    const { rects, unheld } = stencilBridges(loops, { width: 1, count: 2 });
    expect(unheld).toBe(0);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      const box = bounds(rect);
      expect(box.maxX).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(box.maxY).toBeLessThanOrEqual(10.2 + 1e-9);
    }
  });

  it("counts a part no bridge can reach instead of leaving it out silently", () => {
    // Webs of 0.04 mm all round: every way out would open a neighbouring hole.
    const loops = [square(-40, -25, 40, 25), square(-20, -10, 0, 10), square(-14, -4, -6, 4), square(0.04, -10, 5.04, 10), square(-20, 10.04, 0, 13.04), square(-20, -13.04, 0, -10.04), square(-23.04, -10, -20.04, 10)];
    const result = stencilBridges(loops, { width: 1, count: 2 });
    expect(result.unheld).toBe(1);
  });

  it("reaches less far into a thin web than into solid material", () => {
    // Webs of 0.2 mm all round: a bridge reaches 0.1 mm into one instead of 0.3 mm.
    const loops = [square(-40, -25, 40, 25), square(-20, -10, 0, 10), square(-14, -4, -6, 4), square(0.2, -10, 5.2, 10), square(-20, 10.2, 0, 13.2), square(-20, -13.2, 0, -10.2), square(-23.2, -10, -20.2, 10)];
    const { rects, unheld } = stencilBridges(loops, { width: 1, count: 2 });
    expect(unheld).toBe(0);
    expect(rects).toHaveLength(2);
    for (const rect of rects) {
      const box = bounds(rect);
      expect(box.maxX).toBeLessThan(0.2);
      expect(box.maxY).toBeLessThan(10.2);
      expect(box.minX).toBeGreaterThan(-20.2);
      expect(box.minY).toBeGreaterThan(-10.2);
    }
  });

  it("ties parts that would only hold each other to the hole's edge", () => {
    // Two parts 0.6 mm apart in a wide hole: with one bridge each, the shortest way for both is to each other.
    const loops = [square(0, 0, 100, 60), square(10, 10, 90, 50), square(40, 25, 49.7, 35), square(50.3, 25, 60, 35)];
    const result = stencilBridges(loops, { width: 1, count: 1 });
    expect(result.unheld).toBe(0);
    // At least one bridge reaches the hole's edge.
    expect(result.rects.some((rect) => { const box = bounds(rect); return box.minX < 10 || box.maxX > 90 || box.minY < 10 || box.maxY > 50; })).toBe(true);
  });

  it("holds the slanting middle of a serif \"#\" square to one of its sides", () => {
    // The outline of a serif "#" cut from a plate (from a real export): the middle is a slanting parallelogram, the
    // strokes round it 0.8 mm wide. Upright, a 1 mm bridge would run up a stroke; square to a slanting side it fits.
    const hash: Array<[number, number]> = [[158.19, 43.52], [159.64, 43.52], [159.64, 44.3], [158.35, 44.3], [158.74, 46.4], [160.0, 46.4], [160.0, 47.2], [158.89, 47.2], [159.32, 49.43], [158.5, 49.43], [158.07, 47.2], [156.87, 47.2], [157.28, 49.43], [156.46, 49.43], [156.06, 47.2], [154.58, 47.2], [154.58, 46.4], [155.91, 46.4], [155.5, 44.3], [154.21, 44.3], [154.21, 43.52], [155.35, 43.52], [154.91, 41.21], [155.73, 41.21], [156.17, 43.52], [157.37, 43.52], [156.94, 41.21], [157.76, 41.21]];
    const middle: Array<[number, number]> = [[157.53, 44.3], [156.32, 44.3], [156.73, 46.4], [157.94, 46.4]];
    const result = stencilBridges([square(150, 38, 165, 53), hash, middle], { width: 1, count: 2 });
    expect(result.unheld).toBe(0);
    expect(result.rects.length).toBeGreaterThan(0);
  });

  it("holds a part far inside a large hole too", () => {
    const loops = [square(-100, -100, 100, 100), square(-90, -90, 90, 90), circle(0, 0, 5)];
    const result = stencilBridges(loops, { width: 1, count: 2 });
    expect(result.rects).toHaveLength(2);
    expect(result.unheld).toBe(0);
  });

  it("keeps its settings in range", () => {
    expect(normalizedStencilBridges({ width: 0, count: 9 })).toEqual({ width: 0.2, count: 4 });
    expect(normalizedStencilBridges(undefined)).toEqual({ width: 1, count: 2 });
  });
});
