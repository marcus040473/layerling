import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import {
  boxGeneratorIssues,
  boxGeneratorGridfinityRoom,
  boxGeneratorMatchingLidSize,
  boxGeneratorPlan,
  createBoxGeneratorGeometry,
  insetConvex,
  normalizeBoxGenerator,
} from "@/lib/boxGeneratorGeometry";

const SIZE = { width: 126, depth: 90, height: 48 };

/** Signed volume of an indexed mesh; positive when the faces point outwards. */
function volumeOf(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  let volume = 0;
  for (let i = 0; i < position.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((v) => [position.getX(v), position.getY(v), position.getZ(v)]);
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return volume;
}

/** Every edge must be walked once in each direction, or the body is open or twisted. */
function openEdges(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const key = (v: number) => [position.getX(v), position.getY(v), position.getZ(v)].map((n) => Math.round(n * 1e4)).join(",");
  const edges = new Map<string, number>();
  for (let i = 0; i < position.count; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const edge = `${key(i + k)}>${key(i + ((k + 1) % 3))}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [edge, count] of edges) {
    const [from, to] = edge.split(">");
    if (count !== 1 || edges.get(`${to}>${from}`) !== 1) bad += 1;
  }
  return bad;
}

describe("box generator", () => {
  it("builds a closed rectangular box with the volume of its wall and floor", () => {
    const geometry = createBoxGeneratorGeometry(SIZE, { boxShape: "rectangle", boxCornerRadius: 0, boxWall: 2.4, boxFloor: 2.4 });
    const expected = 126 * 90 * 48 - (126 - 4.8) * (90 - 4.8) * (48 - 2.4);
    expect(openEdges(geometry)).toBe(0);
    expect(volumeOf(geometry)).toBeCloseTo(expected, 1);
  });

  it("keeps fixed dividers in one closed body and takes their volume out of the compartments", () => {
    const plain = createBoxGeneratorGeometry(SIZE, { boxCornerRadius: 0 });
    const divided = createBoxGeneratorGeometry(SIZE, { boxCornerRadius: 0, boxColumns: 3, boxRows: 2, boxDivider: 1.6 });
    const inner = { width: 126 - 4.8, depth: 90 - 4.8 };
    const dividerArea = 2 * 1.6 * inner.depth + 1 * 1.6 * inner.width - 2 * 1 * 1.6 * 1.6;
    expect(openEdges(divided)).toBe(0);
    expect(volumeOf(divided) - volumeOf(plain)).toBeCloseTo(dividerArea * (48 - 2.4), 0);
    expect(boxGeneratorPlan(SIZE, { boxColumns: 3, boxRows: 2 }).cells).toHaveLength(6);
  });

  it("builds a round and a polygon box as closed bodies with an even wall", () => {
    const round = createBoxGeneratorGeometry({ width: 80, depth: 80, height: 30 }, { boxShape: "round", boxWall: 2 });
    const area = (r: number) => Math.PI * r * r * 0.9973;
    expect(openEdges(round)).toBe(0);
    expect(volumeOf(round) / (area(40) * 30 - area(38) * 27.6)).toBeGreaterThan(0.99);
    const hexagon = createBoxGeneratorGeometry({ width: 60, depth: 60, height: 20 }, { boxShape: "polygon", boxSides: 6, boxWall: 2 });
    expect(openEdges(hexagon)).toBe(0);
    expect(volumeOf(hexagon)).toBeGreaterThan(0);
  });

  it("makes a lid that rests on top, and one with a skirt over the outside", () => {
    const flat = createBoxGeneratorGeometry({ width: 100, depth: 60, height: 3 }, { boxPart: "lid", boxCornerRadius: 0 });
    expect(openEdges(flat)).toBe(0);
    expect(volumeOf(flat)).toBeCloseTo(100 * 60 * 3, 1);
    const skirt = createBoxGeneratorGeometry({ width: 100, depth: 60, height: 8 }, { boxPart: "lid", boxLidStyle: "overlap", boxCornerRadius: 0, boxWall: 2, boxLidPlate: 2 });
    expect(openEdges(skirt)).toBe(0);
    expect(volumeOf(skirt)).toBeCloseTo(100 * 60 * 8 - 96 * 56 * 6, 1);
  });

  it("sizes an overlapping lid so its skirt clears the box by the fit", () => {
    expect(boxGeneratorMatchingLidSize({ width: 126, depth: 90 }, 2.4, 0.3)).toEqual({ width: 126 + 5.4, depth: 90 + 5.4 });
  });

  it("gives a rectangular box's inside to Gridfinity and builds no Gridfinity of its own", () => {
    // 126 x 90 with a 2.4 wall: 121.2 x 85.2 inside, two 42 mm cells each way.
    expect(boxGeneratorGridfinityRoom(SIZE, { boxCornerRadius: 3 })).toEqual({ width: 121.2, depth: 85.2, columns: 2, rows: 2 });
    // A thicker wall takes the second row's room away.
    expect(boxGeneratorGridfinityRoom({ width: 130, depth: 90, height: 48 }, { boxWall: 3 })).toEqual({ width: 124, depth: 84, columns: 2, rows: 2 });
    expect(boxGeneratorGridfinityRoom({ width: 130, depth: 90, height: 48 }, { boxWall: 3.2 })).toMatchObject({ depth: 83.6, rows: 1 });
    // Smaller than a cell: none fit.
    expect(boxGeneratorGridfinityRoom({ width: 40, depth: 40, height: 20 }, {})).toMatchObject({ columns: 0, rows: 0 });
    // Not a rectangle, or a lid: no rectangular inside to plan with.
    expect(boxGeneratorGridfinityRoom(SIZE, { boxShape: "round" })).toBeNull();
    expect(boxGeneratorGridfinityRoom(SIZE, { boxShape: "polygon" })).toBeNull();
    expect(boxGeneratorGridfinityRoom(SIZE, { boxPart: "lid" })).toBeNull();
  });

  it("keeps every setting inside its limits, so no value breaks the body", () => {
    const settings = normalizeBoxGenerator({ width: 20, depth: 20, height: 10 }, { boxWall: 99, boxFloor: 99, boxColumns: 500, boxSides: 1 });
    expect(settings.boxWall).toBeLessThan(10);
    expect(settings.boxFloor).toBeLessThan(10);
    expect(settings.boxColumns).toBe(12);
    expect(settings.boxSides).toBe(3);
    expect(openEdges(createBoxGeneratorGeometry({ width: 20, depth: 20, height: 10 }, { boxWall: 99, boxColumns: 500, boxRows: 500 }))).toBe(0);
  });

  it("says so when compartments are too narrow and stay solid", () => {
    expect(boxGeneratorIssues(SIZE, {})).toEqual([]);
    expect(boxGeneratorIssues({ width: 30, depth: 30, height: 20 }, { boxColumns: 12 })).toEqual([{ code: "compartmentSolid", count: expect.any(Number) }]);
  });

  it("pulls a convex outline in by the distance on every side", () => {
    const square = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }];
    const inset = insetConvex(square, 2)!;
    expect(Math.max(...inset.map((p) => p.x))).toBeCloseTo(8);
    expect(insetConvex(square, 11)).toBeNull();
  });
});
