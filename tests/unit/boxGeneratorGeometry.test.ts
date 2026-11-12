import { describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type * as THREE from "three";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import {
  boxGeneratorIssues,
  boxGeneratorGridfinityBoxSize,
  boxGeneratorGridfinityFit,
  boxGeneratorGridfinityMargin,
  boxGeneratorOutline,
  boxGeneratorGridfinityFloor,
  boxGeneratorInsideOutline,
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
    // 84 mm deep is 0.5 mm short of two cells with their play: one row.
    expect(boxGeneratorGridfinityRoom({ width: 130, depth: 90, height: 48 }, { boxWall: 3 })).toEqual({ width: 124, depth: 84, columns: 2, rows: 1 });
    expect(boxGeneratorGridfinityRoom({ width: 130, depth: 90, height: 48 }, { boxWall: 3.2 })).toMatchObject({ depth: 83.6, rows: 1 });
    // Smaller than a cell: none fit.
    expect(boxGeneratorGridfinityRoom({ width: 40, depth: 40, height: 20 }, {})).toMatchObject({ columns: 0, rows: 0 });
    // Not a rectangle, or a lid: no rectangular inside to plan with.
    expect(boxGeneratorGridfinityRoom(SIZE, { boxShape: "round" })).toBeNull();
    expect(boxGeneratorGridfinityRoom(SIZE, { boxShape: "polygon" })).toBeNull();
    expect(boxGeneratorGridfinityRoom(SIZE, { boxPart: "lid" })).toBeNull();
  });

  it("sizes a rectangular box to a Gridfinity grid and finds the largest grid that fits a round or polygon box", () => {
    // 3 x 4 cells: 126.5 x 168.5 mm of baseplate with its play, and the wall twice round it.
    expect(boxGeneratorGridfinityBoxSize(3, 4, 2.4)).toEqual({ width: 131.3, depth: 173.3 });
    const size = boxGeneratorGridfinityBoxSize(3, 4, 2.4);
    const rectangle = boxGeneratorGridfinityFit({ ...size, height: 48 }, { boxGridfinity: true });
    expect(rectangle).toMatchObject({ rectangle: true, innerWidth: 126.5, innerDepth: 168.5, best: { columns: 3, rows: 4 }, maxColumns: 3, maxRows: 4 });
    expect(rectangle!.fits(3, 4)).toBe(true);
    expect(rectangle!.fits(4, 4)).toBe(false);
    // One millimetre less and the third cell no longer fits across.
    expect(boxGeneratorGridfinityFit({ width: size.width - 1, depth: size.depth, height: 48 }, {})!.fits(3, 4)).toBe(false);
    // A round box of 140 mm: the corners of a grid must lie inside the circle, so 2 x 2 (84.5 mm square, 119.5 across the corners) fits, 3 x 3 does not.
    const round = boxGeneratorGridfinityFit({ width: 140, depth: 140, height: 40 }, { boxShape: "round" })!;
    expect(round.rectangle).toBe(false);
    expect(round.fits(2, 2)).toBe(true);
    expect(round.fits(3, 3)).toBe(false);
    expect(round.best).toEqual({ columns: 2, rows: 2 });
    // The most cells across with one row is more than a square grid allows.
    expect(round.maxColumns).toBeGreaterThanOrEqual(2);
    expect(round.maxColumns * 42 + 0.5).toBeLessThan(140);
    // A hexagon takes less than a circle of its size, and a box too small for one cell takes none.
    const hexagon = boxGeneratorGridfinityFit({ width: 140, depth: 140, height: 40 }, { boxShape: "polygon", boxSides: 6 })!;
    expect(hexagon.best!.columns * hexagon.best!.rows).toBeLessThanOrEqual(round.best!.columns * round.best!.rows);
    expect(boxGeneratorGridfinityFit({ width: 40, depth: 40, height: 20 }, { boxShape: "round" })!.best).toBeNull();
    // A lid has no inside.
    expect(boxGeneratorGridfinityFit({ width: 140, depth: 140, height: 40 }, { boxPart: "lid" })).toBeNull();
  });

  it("keeps a Gridfinity baseplate clear of the rounded corners of a box sized to its cells", () => {
    // Small corners ask for nothing but the play; large ones push the walls out.
    expect(boxGeneratorGridfinityMargin(0)).toBe(0.25);
    expect(boxGeneratorGridfinityMargin(4)).toBe(0.25);
    expect(boxGeneratorGridfinityMargin(27.6)).toBeCloseTo(0.2929 * 23.6, 2);
    expect(boxGeneratorGridfinityBoxSize(3, 3, 2.4, 3)).toEqual({ width: 131.3, depth: 131.3 });
    const grown = boxGeneratorGridfinityBoxSize(3, 3, 2.4, 30);
    expect(grown.width).toBeGreaterThan(140);
    const fields = { boxCornerRadius: 30 };
    const fit = boxGeneratorGridfinityFit({ width: grown.width, depth: grown.depth, height: 40 }, fields)!;
    expect(fit.fits(3, 3)).toBe(true);
    expect(boxGeneratorGridfinityFit({ width: grown.width - 1, depth: grown.depth - 1, height: 40 }, fields)!.fits(3, 3)).toBe(false);
    // The plate itself (3 x 42 mm, its corners rounded by 4 mm) lies inside the rounded inside, corner by corner.
    const settings = normalizeBoxGenerator({ width: grown.width, depth: grown.depth, height: 40 }, fields);
    const inside = boxGeneratorInsideOutline(boxGeneratorOutline(settings), settings.boxWall)!;
    const half = (3 * 42) / 2;
    const plate: { x: number; z: number }[] = [];
    for (const [cx, cz] of [[half - 4, half - 4], [-(half - 4), half - 4], [-(half - 4), -(half - 4)], [half - 4, -(half - 4)]]) {
      for (let k = 0; k <= 12; k += 1) {
        const angle = Math.atan2(cz, cx) - Math.PI / 4 + (k / 12) * (Math.PI / 2);
        plate.push({ x: cx + 4 * Math.cos(angle), z: cz + 4 * Math.sin(angle) });
      }
    }
    const outsideBy = Math.max(...plate.map((p) => Math.max(...inside.map((a, i) => {
      const b = inside[(i + 1) % inside.length];
      return -((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z);
    }))));
    expect(outsideBy).toBeLessThan(0.2);
  });

  it("fits the Gridfinity floor to the inside of a box of any outline as it was given", () => {
    // The box keeps its size; its inside holds the whole cells the baseplate's own count finds.
    expect(boxGeneratorGridfinityFloor({ width: 126, depth: 90, height: 48 }, {})).toEqual({ cells: 4 });
    expect(boxGeneratorGridfinityFloor({ width: 131.3, depth: 173.3, height: 48 }, {})).toEqual({ cells: 12 });
    const round = boxGeneratorGridfinityFloor({ width: 140, depth: 140, height: 40 }, { boxShape: "round" })!;
    const hexagon = boxGeneratorGridfinityFloor({ width: 140, depth: 140, height: 40 }, { boxShape: "polygon", boxSides: 6 })!;
    expect(round.cells).toBeGreaterThanOrEqual(4);
    expect(round.cells).toBeLessThan(16);
    expect(hexagon.cells).toBeGreaterThan(0);
    expect(boxGeneratorGridfinityFloor({ width: 40, depth: 40, height: 20 }, {})).toEqual({ cells: 0 });
    expect(boxGeneratorGridfinityFloor({ width: 126, depth: 90, height: 48 }, { boxPart: "lid" })).toBeNull();
    // A thicker wall leaves a smaller inside.
    expect(boxGeneratorGridfinityFloor({ width: 126, depth: 90, height: 48 }, { boxWall: 20 })!.cells).toBeLessThan(4);
  });

  it("pulls an outline in by the wall, whichever way round it runs", () => {
    const square = [{ x: 10, z: 10 }, { x: 10, z: -10 }, { x: -10, z: -10 }, { x: -10, z: 10 }];
    const inside = boxGeneratorInsideOutline(square, 2)!;
    const xs = inside.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-8, 6);
    expect(Math.max(...xs)).toBeCloseTo(8, 6);
    expect(boxGeneratorInsideOutline(square, 11)).toBeNull();
    expect(boxGeneratorInsideOutline([{ x: 0, z: 0 }], 1)).toBeNull();
  });

  it("makes a stackable box with a step, a collar and a groove under the wall: a closed body, the floor flat on the bed", () => {
    const area = (points: { x: number; z: number }[]) => Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].z - points[(i + 1) % points.length].x * p.z, 0)) / 2;
    for (const fields of [{ boxCornerRadius: 6 }, { boxShape: "round" as const }, { boxShape: "polygon" as const, boxSides: 6 }, { boxColumns: 3, boxRows: 2 }]) {
      const settings = { ...fields, boxStackable: true, boxStackHeight: 4 };
      const plan = boxGeneratorPlan(SIZE, settings);
      expect(plan.issues.filter((issue) => issue.code.startsWith("stack"))).toEqual([]);
      const stack = plan.stack!;
      expect(stack).not.toBeNull();
      const geometry = createBoxGeneratorGeometry(SIZE, settings);
      expect(openEdges(geometry)).toBe(0);
      const h = stack.height;
      // The same box unstacked, less the step round the top and the groove under the wall.
      const plain = volumeOf(createBoxGeneratorGeometry(SIZE, { ...fields }));
      const expected = plain - (area(plan.outer) - area(stack.collar)) * h - (area(stack.skirt) - area(stack.groove)) * stack.grooveHeight;
      expect(volumeOf(geometry)).toBeCloseTo(expected, 0);
      // The floor is not lifted: it keeps its thickness and lies on the bed.
      expect(plan.floorTop).toBeCloseTo(plan.settings.boxFloor, 6);
      const positions = geometry.getAttribute("position");
      let flatBottom = 0;
      for (let i = 0; i < positions.count; i += 3) {
        if (positions.getY(i) === 0 && positions.getY(i + 1) === 0 && positions.getY(i + 2) === 0) flatBottom += 1;
      }
      expect(flatBottom).toBeGreaterThan(0);
    }
  });

  it("stacks one stackable box on another: foot on the step, collar in the groove, the play is the fit", () => {
    const settings = { boxStackable: true, boxStackHeight: 3, boxFit: 0.3, boxWall: 2.4 };
    const plan = boxGeneratorPlan(SIZE, settings);
    const stack = plan.stack!;
    const xs = (points: { x: number }[]) => Math.max(...points.map((p) => p.x));
    const outerX = xs(plan.outer);
    // The foot's inner face is wall/2 - fit/2 in from the outside, the collar's outer face wall/2 + fit/2: the play between them is the fit.
    expect(outerX - xs(stack.skirt)).toBeCloseTo(2.4 / 2 - 0.3 / 2, 2);
    expect(outerX - xs(stack.collar)).toBeCloseTo(2.4 / 2 + 0.3 / 2, 2);
    expect(xs(stack.skirt) - xs(stack.collar)).toBeCloseTo(0.3, 2);
    // The groove reaches in to the cavity, where the collar's inner face is, so the collar fills it up to the play.
    expect(outerX - xs(stack.groove)).toBeCloseTo(2.4, 2);
    // The groove is a millimetre deeper than the collar is high, so the box never sits on the collar's top.
    expect(stack.grooveHeight).toBeCloseTo(stack.height + 1, 6);
  });

  it("says so, and leaves the box unstacked, when the wall is too thin or the box too low for the step", () => {
    expect(boxGeneratorIssues(SIZE, { boxStackable: true, boxWall: 0.9, boxFit: 0.3 })).toContainEqual({ code: "stackWallThin" });
    expect(boxGeneratorPlan(SIZE, { boxStackable: true, boxWall: 0.9, boxFit: 0.3 }).stack).toBeNull();
    expect(boxGeneratorIssues({ width: 60, depth: 60, height: 6 }, { boxStackable: true, boxStackHeight: 3 })).toContainEqual({ code: "stackTooLow" });
    // The lid is not stacked, and off is off.
    expect(boxGeneratorPlan(SIZE, { boxStackable: true, boxPart: "lid" }).stack).toBeNull();
    expect(boxGeneratorPlan(SIZE, {}).stack).toBeNull();
  });

  it("keeps the Gridfinity settings inside their limits and off by default", () => {
    const off = normalizeBoxGenerator(SIZE, {});
    expect(off).toMatchObject({ boxGridfinity: false, boxGridfinityFloor: false, boxGridfinityColumns: 2, boxGridfinityRows: 2 });
    expect(normalizeBoxGenerator(SIZE, { boxGridfinity: true, boxGridfinityColumns: 99, boxGridfinityRows: -3 })).toMatchObject({ boxGridfinity: true, boxGridfinityColumns: 12, boxGridfinityRows: 1 });
    // The cells change no geometry: the body is the same with the switch on.
    const plain = createBoxGeneratorGeometry(SIZE, {});
    const prepared = createBoxGeneratorGeometry(SIZE, { boxGridfinity: true, boxGridfinityColumns: 3, boxGridfinityRows: 3 });
    expect(volumeOf(prepared)).toBeCloseTo(volumeOf(plain), 6);
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

describe("a Gridfinity baseplate in the floor", () => {
  const size = { ...boxGeneratorGridfinityBoxSize(3, 2, 2.4, 6), height: 30 };
  const fields = { boxCornerRadius: 6, boxWall: 2.4, boxGridfinityPlate: true };

  it("makes the floor as thick as a baseplate and a closed floor, with the grid's cells that fit", () => {
    const plan = boxGeneratorPlan(size, fields);
    expect(plan.issues).toEqual([]);
    expect(plan.plate!.cells).toHaveLength(6);
    // The cells sit on the box's middle, a 3 x 2 grid of 42 mm.
    expect(plan.plate!.cells.map((c) => `${Math.round(c.x)},${Math.round(c.z)}`).sort()).toEqual(["-42,-21", "-42,21", "0,-21", "0,21", "42,-21", "42,21"]);
    expect(plan.plate!.bottom).toBeCloseTo(1.2, 6);
    expect(plan.floorTop).toBeCloseTo(5 + 1.2, 6);
    // Without the switch there is no plate, and the floor is the one asked for.
    expect(boxGeneratorPlan(size, { ...fields, boxGridfinityPlate: false }).plate).toBeNull();
    // A round box takes the cells that fit its inside too.
    expect(boxGeneratorPlan({ width: 100, depth: 100, height: 30 }, { boxShape: "round", boxGridfinityPlate: true }).plate!.cells.length).toBeGreaterThan(0);
  });

  it("says so, and leaves the floor plain, when the box is too low or no cell fits", () => {
    expect(boxGeneratorIssues({ ...size, height: 7 }, fields)).toContainEqual({ code: "plateTooLow" });
    expect(boxGeneratorPlan({ ...size, height: 7 }, fields).plate).toBeNull();
    expect(boxGeneratorIssues({ width: 30, depth: 30, height: 30 }, { boxGridfinityPlate: true })).toContainEqual({ code: "plateNoCell" });
  });

  it("is drawn plain until the kernel is there, then with a socket in each cell, closed", async () => {
    const plain = createBoxGeneratorGeometry(size, fields);
    expect(openEdges(plain)).toBe(0);
    const runtime = await manifoldModule();
    runtime.setup();
    rememberManifoldRuntime(runtime);
    const cut = createBoxGeneratorGeometry(size, fields);
    expect(openEdges(cut)).toBe(0);
    // Each socket takes a good part of the 42 x 42 x 5 mm block away; the bottom of the floor is untouched.
    const removed = volumeOf(plain) - volumeOf(cut);
    expect(removed).toBeGreaterThan(6 * 1500);
    expect(removed).toBeLessThan(6 * 42 * 42 * 5);
    cut.computeBoundingBox();
    expect(cut.boundingBox!.min.y).toBeCloseTo(0, 6);
  });
});
