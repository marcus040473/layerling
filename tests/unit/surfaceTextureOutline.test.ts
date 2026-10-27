import { describe, expect, it } from "vitest";
import { applySurfaceTexture, insideToScreenPositions, surfaceFalloff } from "@/lib/surfaceTexture";
import { prepareSurfaceBase, surfaceMeshReport } from "@/lib/surfaceTextureMesh";
import { nearestOnOutline, outlineAngle, outlineRing, prismOutline } from "@/lib/surfaceTextureOutline";

type Vec3 = [number, number, number];

/** A closed box standing on the plate, inside frame (y up), faces wound outward. */
function box(w: number, h: number, d: number): number[] {
  const [x0, x1, y0, y1, z0, z1] = [-w / 2, w / 2, 0, h, -d / 2, d / 2];
  const p: Vec3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  return faces.flatMap((face) => face.flatMap((i) => p[i]));
}

/** A prism of `sides` sides standing on the plate, inside frame, top and bottom fans round a middle point. */
function prism(radius: number, height: number, sides: number): number[] {
  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  const at = (k: number, y: number): Vec3 => [radius * Math.cos((2 * Math.PI * k) / sides), y, radius * Math.sin((2 * Math.PI * k) / sides)];
  for (let k = 0; k < sides; k += 1) {
    tri(at(k, 0), at(k, height), at(k + 1, height));
    tri(at(k, 0), at(k + 1, height), at(k + 1, 0));
    tri([0, height, 0], at(k + 1, height), at(k, height));
    tri([0, 0, 0], at(k, 0), at(k + 1, 0));
  }
  return out;
}

/** The body as the texture sees it: welded, in the screen frame (z up), and its outline round z. */
function outlineOf(soup: number[]) {
  const base = prepareSurfaceBase(insideToScreenPositions(soup));
  return prismOutline(base, 2, 0, 1, 30);
}

function usedPoints(result: { vertices: ArrayLike<number>; indices: Uint32Array }) {
  return [...new Set(result.indices)].map((i): Vec3 => [result.vertices[i * 3], result.vertices[i * 3 + 1], result.vertices[i * 3 + 2]]);
}

describe("the outline of an angular body", () => {
  it("find a box's and a prism's outline, but not one of a body that is no prism", () => {
    const square = outlineOf(box(40, 30, 20))!;
    expect(square.loops).toHaveLength(1);
    expect(square.loops[0].length).toBeCloseTo(120, 6);
    expect(square.corners).toHaveLength(4);
    expect(square.ringable).toBe(true);
    const hexagon = outlineOf(prism(20, 30, 6))!;
    expect(hexagon.corners).toHaveLength(6);
    expect(hexagon.loops[0].length).toBeCloseTo(120, 6);
    // A pyramid's sides lean: no prism.
    const pyramid: number[] = [];
    const tip: Vec3 = [0, 30, 0];
    const corners: Vec3[] = [[-20, 0, -20], [20, 0, -20], [20, 0, 20], [-20, 0, 20]];
    for (let k = 0; k < 4; k += 1) pyramid.push(...corners[k], ...tip, ...corners[(k + 1) % 4]);
    pyramid.push(...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]);
    expect(outlineOf(pyramid)).toBeNull();
  });

  it("measure round the outline without a jump at the corners", () => {
    const outline = outlineOf(box(40, 30, 40))!;
    // Screen frame: x across, y back; the box's corners at ±20.
    for (const [cx, cy] of [[20, 20], [-20, 20], [-20, -20], [20, -20]]) {
      const before = outlineAngle(outline, cx, cy - Math.sign(cy) * 1e-6);
      const after = outlineAngle(outline, cx - Math.sign(cx) * 1e-6, cy);
      const d = Math.abs(before - after);
      expect(Math.min(d, 2 * Math.PI - d)).toBeLessThan(1e-6);
    }
    // From the middle of one side to the middle of the next: a quarter of the way round, a quarter turn.
    expect(Math.abs(outlineAngle(outline, 20, 0) - outlineAngle(outline, 0, 20))).toBeCloseTo(Math.PI / 2, 6);
  });

  it("lay rings inside a convex outline that run on across the corners' bisectors", () => {
    const outline = outlineOf(box(40, 30, 30))!;
    expect(nearestOnOutline(outline, 0, 0).distance).toBeCloseTo(15, 9);
    for (const depth of [2, 5, 9]) {
      // Either side of a corner's bisector at the same depth: the same place round the ring.
      const a = outlineRing(outline, 20 - depth + 1e-7, 15 - depth - 1e-4);
      const b = outlineRing(outline, 20 - depth - 1e-4, 15 - depth + 1e-7);
      expect(a.depth).toBeCloseTo(depth, 3);
      const d = Math.abs(a.turn - b.turn);
      expect(Math.min(d, 1 - d)).toBeLessThan(1e-4);
      // A rectangle's ring is shorter by eight times its depth.
      expect(a.lengthAt(depth)).toBeCloseTo(140 - 8 * depth, 6);
    }
  });
});

describe("a pattern laid round an angular body", () => {
  it("run round a box's upright edges instead of stopping there", () => {
    const result = applySurfaceTexture(box(40, 30, 40), { pattern: "rope", spacing: 5, depth: 2 });
    expect(result.stats.projection).toBe("cylinder");
    expect(surfaceMeshReport(result.indices, result.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    // Points that started on the upright edges (in the middle of the height) moved out: the edge is not kept smooth.
    let onEdge = 0;
    for (const [x, y, z] of usedPoints(result)) {
      if (y < 8 || y > 22) continue;
      // Out along the bisector, so the point stays on the diagonal through the corner.
      if (Math.abs(Math.abs(x) - Math.abs(z)) < 1e-6 && Math.abs(x) > 20 + 0.3) onEdge += 1;
    }
    expect(onEdge).toBeGreaterThan(20);
    // All the way round, a whole number of strands: none breaks off at a seam.
    expect(result.stats.around).toBeGreaterThan(0);
  }, 120_000);

  it("bend a raised pattern round a convex corner in an arc, not in a mitre", () => {
    const depth = 2;
    const result = applySurfaceTexture(box(40, 30, 40), { pattern: "rope", spacing: 5, depth });
    let checked = 0;
    for (const [x, y, z] of usedPoints(result)) {
      if (y < 8 || y > 22 || Math.abs(x) < 17 || Math.abs(z) < 17) continue;
      // Beyond both faces of a corner: at most the depth from the corner line (a mitre reaches 1.41 times as far).
      if (Math.abs(x) > 20 && Math.abs(z) > 20) {
        expect(Math.hypot(Math.abs(x) - 20, Math.abs(z) - 20)).toBeLessThan(depth + 0.02);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  }, 120_000);

  it("lay grooves on a box's top in rings following its outline, or in rows", () => {
    const rings = applySurfaceTexture(box(40, 30, 30), { pattern: "grooves", faces: ["top"], capStyle: "rings" });
    expect(surfaceMeshReport(rings.indices, rings.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    const P = rings.stats.spacing;
    let inGroove = 0;
    for (const [x, y, z] of usedPoints(rings)) {
      if (y < 25) continue;
      const fromEdge = Math.min(20 - Math.abs(x), 15 - Math.abs(z));
      if (fromEdge < 2) continue;
      const t = fromEdge / P;
      const expected = 0.6 * surfaceFalloff(Math.abs(t - Math.floor(t) - 0.5) / 0.3, "pointed");
      expect(30 - y).toBeCloseTo(expected, 2);
      if (expected > 0.5) inGroove += 1;
    }
    // The rings are straight between the corners' bisectors: cut, they need points only where they bend.
    expect(inGroove).toBeGreaterThan(3);
    // By default an angular top takes rows: straight across, not following the outline.
    const rows = applySurfaceTexture(box(40, 30, 30), { pattern: "grooves", faces: ["top"] });
    let off = 0;
    for (const [x, y, z] of usedPoints(rows)) {
      if (y < 25 || Math.min(20 - Math.abs(x), 15 - Math.abs(z)) < 2) continue;
      const t = Math.min(20 - Math.abs(x), 15 - Math.abs(z)) / P;
      if (Math.abs(30 - y - 0.6 * surfaceFalloff(Math.abs(t - Math.floor(t) - 0.5) / 0.3, "pointed")) > 0.05) off += 1;
    }
    expect(off).toBeGreaterThan(3);
  }, 120_000);

  it("keep rope round a hexagonal prism closed, with rings on its top", () => {
    const result = applySurfaceTexture(prism(22, 30, 6), { pattern: "rope", topFree: 0, capStyle: "rings" });
    expect(result.stats.projection).toBe("cylinder");
    expect(surfaceMeshReport(result.indices, result.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    expect(usedPoints(result).filter(([, y]) => y > 30.5).length).toBeGreaterThan(1000);
  }, 120_000);
});
