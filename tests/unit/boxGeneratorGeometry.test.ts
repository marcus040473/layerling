import { describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type * as THREE from "three";
import { loadedManifoldRuntime, rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";
import {
  boxGeneratorIssues,
  boxGeneratorLatchClip,
  boxGeneratorLatchClipProfile,
  boxGeneratorLatchHeight,
  boxGeneratorLatchLidHeight,
  boxGeneratorLatchMeasures,
  boxGeneratorGridfinityBoxSize,
  boxGeneratorGridfinityFit,
  boxGeneratorGridfinityMargin,
  boxGeneratorOutline,
  boxGeneratorGridfinityFloor,
  boxGeneratorInsideOutline,
  boxGeneratorGridfinityRoom,
  boxGeneratorMatchingLidPatch,
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
    expect(boxGeneratorPlan(SIZE, { boxStackable: true, boxPart: "lid", boxLidStyle: "overlap" }).stack).toBeNull();
    expect(boxGeneratorPlan(SIZE, { boxStackable: true, boxPart: "lid", boxLidStyle: "plug" }).stack).toBeNull();
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

describe("a plug lid", () => {
  const area = (points: { x: number; z: number }[]) => Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].z - points[(i + 1) % points.length].x * p.z, 0)) / 2;
  const base = { boxPart: "lid" as const, boxLidStyle: "plug" as const, boxWall: 2.4, boxFit: 0.3, boxLidPlate: 2 };

  it("is as large as the box, a plate with a ring that fits inside the box with the play", () => {
    for (const fields of [{ boxCornerRadius: 6 }, { boxShape: "round" as const }, { boxShape: "polygon" as const, boxSides: 6 }]) {
      const settings = { ...base, ...fields };
      const lid = { width: 126, depth: 90, height: 8 };
      const plan = boxGeneratorPlan(lid, settings);
      expect(plan.issues).toEqual([]);
      const plug = plan.plug!;
      expect(plug.plate).toBeCloseTo(2, 6);
      // The ring's outside is the box's inside, Fit smaller; its inside one wall further in.
      const box = boxGeneratorInsideOutline(plan.outer, 2.4)!;
      expect(area(plug.outline)).toBeLessThan(area(box));
      expect(area(plug.hole!)).toBeLessThan(area(plug.outline));
      const geometry = createBoxGeneratorGeometry(lid, settings);
      expect(openEdges(geometry)).toBe(0);
      // Volume: the plate, and the ring from the plate up.
      expect(volumeOf(geometry)).toBeCloseTo(area(plan.outer) * 2 + (area(plug.outline) - area(plug.hole!)) * 6, 0);
    }
  });

  it("is a solid plug when the ring leaves no room inside, and says so when there is no ring at all", () => {
    const thin = boxGeneratorPlan({ width: 12, depth: 12, height: 8 }, { ...base, boxWall: 3 });
    expect(thin.plug).not.toBeNull();
    expect(thin.plug!.hole).toBeNull();
    expect(openEdges(createBoxGeneratorGeometry({ width: 12, depth: 12, height: 8 }, { ...base, boxWall: 3 }))).toBe(0);
    expect(boxGeneratorIssues({ width: 8, depth: 8, height: 8 }, { ...base, boxWall: 3, boxFit: 2 })).toContainEqual({ code: "lidNoSkirt" });
  });

  it("leaves the other lid styles and the box as they were", () => {
    expect(boxGeneratorPlan(SIZE, { boxPart: "lid", boxLidStyle: "restOn" }).plug).toBeNull();
    expect(boxGeneratorPlan(SIZE, { boxPart: "box", boxLidStyle: "plug" }).plug).toBeNull();
    expect(normalizeBoxGenerator(SIZE, { boxLidStyle: "plug" }).boxLidStyle).toBe("plug");
  });
});

describe("a stackable lid that rests on top", () => {
  const lid = { width: 126, depth: 90, height: 10 };
  const settings = { boxPart: "lid" as const, boxLidStyle: "restOn" as const, boxStackable: true, boxStackHeight: 3, boxLidPlate: 2, boxWall: 2.4, boxFit: 0.3, boxCornerRadius: 6 };

  it("is made like a low stackable box with its plate for a floor and no compartments", () => {
    const plan = boxGeneratorPlan(lid, settings);
    expect(plan.issues).toEqual([]);
    expect(plan.stack).not.toBeNull();
    expect(plan.cells).toHaveLength(1);
    expect(plan.floorTop).toBeCloseTo(2, 6);
    const geometry = createBoxGeneratorGeometry(lid, settings);
    expect(openEdges(geometry)).toBe(0);
    // The same solid as a stackable box of that height whose floor is the plate, with its dividers left out.
    const box = createBoxGeneratorGeometry(lid, { ...settings, boxPart: "box", boxFloor: 2, boxColumns: 1, boxRows: 1 });
    expect(volumeOf(geometry)).toBeCloseTo(volumeOf(box), 3);
  });

  it("says so when it is too low for the collar, and does not take a Gridfinity floor or dividers from the settings", () => {
    expect(boxGeneratorIssues({ ...lid, height: 6 }, settings)).toContainEqual({ code: "stackTooLow" });
    const plan = boxGeneratorPlan(lid, { ...settings, boxColumns: 3, boxRows: 2, boxGridfinityPlate: true });
    expect(plan.cells).toHaveLength(1);
    expect(plan.plate).toBeNull();
  });

  it("fits on the box: the lid's groove takes the box's collar and its foot stands on the box's step", () => {
    const boxPlan = boxGeneratorPlan({ width: 126, depth: 90, height: 48 }, { ...settings, boxPart: "box" });
    const lidPlan = boxGeneratorPlan(lid, settings);
    const xs = (points: { x: number }[]) => Math.max(...points.map((p) => p.x));
    expect(xs(lidPlan.stack!.skirt)).toBeCloseTo(xs(boxPlan.stack!.skirt), 6);
    expect(xs(lidPlan.stack!.collar)).toBeCloseTo(xs(boxPlan.stack!.collar), 6);
    expect(xs(lidPlan.stack!.groove)).toBeCloseTo(xs(boxPlan.stack!.groove), 6);
    expect(lidPlan.stack!.grooveHeight).toBeGreaterThan(boxPlan.stack!.height);
  });
});

describe("the matching lid of a box", () => {
  const box = { width: 126, depth: 90, height: 48 };

  it("takes the box's size for a lid that rests on top or plugs in, and the grown size for one that overlaps", () => {
    expect(boxGeneratorMatchingLidPatch(box, {})).toEqual({ boxPart: "lid", width: 126, depth: 90, height: 3 });
    expect(boxGeneratorMatchingLidPatch(box, { boxLidStyle: "plug" })).toEqual({ boxPart: "lid", width: 126, depth: 90, height: 10 });
    const grown = boxGeneratorMatchingLidSize(box, 2.4, 0.2);
    expect(boxGeneratorMatchingLidPatch(box, { boxLidStyle: "overlap", boxWall: 2.4, boxFit: 0.2 })).toEqual({ boxPart: "lid", width: grown.width, depth: grown.depth, height: 10 });
  });

  it("gives a stackable resting lid the room for its groove and collar, so it raises no issue", () => {
    for (const boxStackHeight of [1, 3, 6, 10]) {
      const fields = { boxStackable: true, boxStackHeight };
      const patch = boxGeneratorMatchingLidPatch(box, fields);
      const { boxPart, width, depth, height } = patch;
      expect(boxPart).toBe("lid");
      expect(boxGeneratorIssues({ width, depth, height }, { ...fields, boxPart })).toEqual([]);
    }
  });
});

describe("latches", () => {
  const box = { width: 90, depth: 60, height: 40 };
  const fields = { boxLatches: 2, boxCornerRadius: 4 };
  const lidHeight = boxGeneratorMatchingLidPatch(box, fields).height;
  const lid = { ...box, height: lidHeight };
  const lidFields = { ...fields, boxPart: "lid" as const };
  const kernel = async () => {
    if (loadedManifoldRuntime()) return;
    const runtime = await manifoldModule();
    runtime.setup();
    rememberManifoldRuntime(runtime);
  };
  const sizeOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox!;
    return { min, max };
  };

  it("makes a clip with a C-shaped socket at each end whose opening is narrower than the pin by the grip", () => {
    const measures = boxGeneratorLatchMeasures({ boxLatchWidth: 12, boxLatchGrip: 0.3 });
    expect(measures.pin).toBeCloseTo(1.5, 6);
    expect(2 * measures.opening).toBeCloseTo(2 * measures.pin - 0.3, 6);
    const profile = boxGeneratorLatchClipProfile(measures);
    // Nothing of the clip comes nearer the wall than its gap, and the sockets' ends stop where they are as wide as the opening.
    const nearest = Math.min(...profile.map((point) => point.n));
    expect(nearest).toBeGreaterThan(0.5);
    const ends = profile.filter((point) => Math.abs(point.n - nearest) < 1e-6 && Math.abs(point.v) < measures.rim);
    expect(Math.min(...ends.map((point) => Math.abs(point.v)))).toBeCloseTo(measures.opening, 6);
    // The two sockets are as far apart as the pins of a box and its lid.
    const clip = boxGeneratorLatchClip({ boxLatchWidth: 12 });
    expect(clip.size.width).toBeCloseTo(2 * measures.offset + 2 * measures.rim + measures.tab, 1);
    expect(clip.size.height).toBe(12);
  });

  it("draws the clip on its side as a closed body of its own size, whatever size the shape was given", () => {
    const clip = boxGeneratorLatchClip({ boxLatchWidth: 16 });
    const geometry = createBoxGeneratorGeometry(box, { boxPart: "latch", boxLatchWidth: 16 });
    expect(openEdges(geometry)).toBe(0);
    expect(volumeOf(geometry)).toBeGreaterThan(0);
    const { min, max } = sizeOf(geometry);
    expect(max.x - min.x).toBeCloseTo(clip.size.width, 3);
    expect(max.z - min.z).toBeCloseTo(clip.size.depth, 3);
    expect(min.y).toBeCloseTo(0, 6);
    expect(max.y).toBeCloseTo(16, 6);
  });

  it("puts the pins of box and lid twice the offset apart when the lid sits on the box, as the clip's sockets are", async () => {
    const boxPlan = boxGeneratorPlan(box, fields);
    const lidPlan = boxGeneratorPlan(lid, lidFields);
    expect(boxPlan.issues).toEqual([]);
    expect(lidPlan.issues).toEqual([]);
    expect(boxPlan.latches!.spots).toHaveLength(4);
    expect(lidPlan.latches!.spots).toHaveLength(4);
    const { offset } = boxPlan.latches!.measures;
    // The lid prints top side down: flipped onto the box its pins stand at box height + lid height - their height.
    const lidPinOnBox = box.height + lidHeight - lidPlan.latches!.pinY;
    expect(lidPinOnBox - boxPlan.latches!.pinY).toBeCloseTo(2 * offset, 6);
    // Flipped, the lid's front is the box's back: the latches line up along the wall.
    const along = (plan: typeof boxPlan) => plan.latches!.spots.map((spot) => `${spot.origin.x.toFixed(3)},${Math.abs(spot.origin.z).toFixed(3)}`).sort();
    expect(along(lidPlan)).toEqual(along(boxPlan));
    // A resting lid with latches is a shallow tray: the cheeks need a wall to stand on.
    expect(lidPlan.cells).toHaveLength(1);
  });

  it("joins the cheeks and pins to the wall once the kernel is there: closed, on the bed, standing out at the front and back", async () => {
    await kernel();
    const plain = createBoxGeneratorGeometry(box, {});
    const latched = createBoxGeneratorGeometry(box, fields);
    expect(openEdges(latched)).toBe(0);
    expect(volumeOf(latched)).toBeGreaterThan(volumeOf(plain) + 100);
    const { min, max } = sizeOf(latched);
    const measures = boxGeneratorLatchMeasures(fields);
    expect(min.y).toBeCloseTo(0, 6);
    expect(max.y).toBeCloseTo(box.height, 6);
    expect(max.x - min.x).toBeCloseTo(box.width, 3);
    expect(max.z).toBeCloseTo(box.depth / 2 + measures.reach + measures.cheekRadius, 1);
    // The clip's outside stands clear of the cheeks.
    expect(measures.reach + measures.rim).toBeGreaterThan(measures.reach + measures.cheekRadius);
    const lidGeometry = createBoxGeneratorGeometry(lid, lidFields);
    expect(openEdges(lidGeometry)).toBe(0);
    expect(sizeOf(lidGeometry).min.y).toBeCloseTo(0, 6);
  });

  it("puts them on left and right, or on all four sides", () => {
    expect(boxGeneratorPlan(box, { ...fields, boxLatchSides: "leftRight" }).latches!.spots).toHaveLength(4);
    expect(boxGeneratorPlan(box, { ...fields, boxLatches: 1, boxLatchSides: "all" }).latches!.spots).toHaveLength(4);
    const right = boxGeneratorPlan(box, { ...fields, boxLatches: 1, boxLatchSides: "leftRight" }).latches!.spots.find((spot) => spot.normal.x > 0.5)!;
    expect(right.origin.x).toBeCloseTo(box.width / 2, 6);
    expect(right.bulge).toBeCloseTo(0, 6);
  });

  it("fits a round box, the wall under each latch straightened", async () => {
    await kernel();
    const round = { width: 100, depth: 80, height: 40 };
    const plan = boxGeneratorPlan(round, { ...fields, boxShape: "round" });
    expect(plan.issues).toEqual([]);
    expect(plan.latches!.spots).toHaveLength(4);
    for (const spot of plan.latches!.spots) expect(spot.bulge).toBeLessThan(2.4 - 0.6);
    expect(openEdges(createBoxGeneratorGeometry(round, { ...fields, boxShape: "round" }))).toBe(0);
  });

  it("fits a stackable box and its stackable lid: the pins stand off the collar, twice the offset apart", () => {
    const stack = { ...fields, boxStackable: true, boxStackHeight: 3 };
    const patch = boxGeneratorMatchingLidPatch(box, stack);
    expect(patch.height).toBeGreaterThanOrEqual(boxGeneratorLatchLidHeight(stack));
    const boxPlan = boxGeneratorPlan(box, stack);
    const lidPlan = boxGeneratorPlan({ ...box, height: patch.height }, { ...stack, boxPart: "lid" });
    expect(boxPlan.issues).toEqual([]);
    expect(lidPlan.issues).toEqual([]);
    // The stackable lid stands on its foot on the box's step, below the box's collar.
    const step = box.height - 3;
    expect(step + lidPlan.latches!.pinY - boxPlan.latches!.pinY).toBeCloseTo(2 * boxPlan.latches!.measures.offset, 6);
  });

  it("says why, and makes none, for another lid style, a polygon, a short side or a low box", () => {
    expect(boxGeneratorPlan(box, { ...fields, boxLidStyle: "overlap" }).issues).toContainEqual({ code: "latchLidStyle" });
    expect(boxGeneratorPlan(box, { ...fields, boxLidStyle: "plug" }).latches).toBeNull();
    expect(boxGeneratorPlan(box, { ...fields, boxShape: "polygon" }).issues).toContainEqual({ code: "latchOutline" });
    const short = boxGeneratorPlan({ width: 30, depth: 60, height: 40 }, fields);
    expect(short.issues).toContainEqual({ code: "latchNoRoom" });
    expect(short.latches).toBeNull();
    const low = { ...box, height: boxGeneratorLatchHeight(fields) - 1 };
    expect(boxGeneratorPlan(low, fields).issues).toContainEqual({ code: "latchLow" });
    expect(boxGeneratorPlan({ ...box, height: boxGeneratorLatchHeight(fields) }, fields).issues).toEqual([]);
    expect(boxGeneratorPlan({ ...lid, height: 5 }, lidFields).issues).toContainEqual({ code: "latchLow" });
    // Without latches nothing changes: a resting lid stays a flat plate.
    expect(boxGeneratorPlan(lid, { boxPart: "lid" }).cells).toEqual([]);
  });

  it("gives a clip part the size of its clip, whatever size it was given", () => {
    const shape = canonicalizeShape({ id: "clip", kind: "boxGenerator", x: 0, y: 0, z: 0, width: 90, depth: 60, height: 40, size: 90, color: "#fff", boxPart: "latch", boxLatchWidth: 14 } as unknown as WorkplaneShape);
    const clip = boxGeneratorLatchClip({ boxLatchWidth: 14 }).size;
    expect(shape.width).toBeCloseTo(clip.width, 6);
    expect(shape.depth).toBeCloseTo(clip.depth, 6);
    expect(shape.height).toBe(14);
  });

  it("keeps the latch settings inside their limits and off by default", () => {
    const off = normalizeBoxGenerator(box, {});
    expect(off.boxLatches).toBe(0);
    expect(off.boxLatchSides).toBe("frontBack");
    const wild = normalizeBoxGenerator(box, { boxLatches: 99, boxLatchWidth: 1, boxLatchGrip: 5, boxLatchSides: "nonsense" as never, boxPart: "latch" });
    expect(wild.boxLatches).toBe(4);
    expect(wild.boxLatchWidth).toBe(6);
    expect(wild.boxLatchGrip).toBe(1);
    expect(wild.boxLatchSides).toBe("frontBack");
    expect(wild.boxPart).toBe("latch");
  });
});
