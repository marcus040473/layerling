import { describe, expect, it } from "vitest";
import { applySurfaceTexture, normalizeSurfaceTexture, surfaceTexturePositions, type SurfaceTextureResult } from "@/lib/surfaceTexture";
import { surfaceMeshReport } from "@/lib/surfaceTextureMesh";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import { surfaceTextOutline } from "@/lib/surfaceTextOutline";

type Vec3 = [number, number, number];

/** A closed cylinder standing on the plate (inside frame, y up), faces wound outward, `rings` rows of points up the wall. */
function cylinder(radius: number, height: number, segments = 96, rings = 8): number[] {
  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  const at = (k: number, y: number): Vec3 => {
    const a = (2 * Math.PI * k) / segments;
    return [radius * Math.cos(a), y, radius * Math.sin(a)];
  };
  for (let k = 0; k < segments; k += 1) {
    for (let j = 0; j < rings - 1; j += 1) {
      const y0 = (height * j) / (rings - 1), y1 = (height * (j + 1)) / (rings - 1);
      tri(at(k, y0), at(k, y1), at(k + 1, y1));
      tri(at(k, y0), at(k + 1, y1), at(k + 1, y0));
    }
    tri([0, height, 0], at(k + 1, height), at(k, height));
    tri([0, 0, 0], at(k, 0), at(k + 1, 0));
  }
  return out;
}

/** A closed box on the plate (inside frame, y up), two triangles a face, wound outward. */
function box(w: number, h: number, d: number): number[] {
  const p = (x: number, y: number, z: number): Vec3 => [(x - 0.5) * w, y * h, (z - 0.5) * d];
  const quads: Vec3[][] = [
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    [p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0)],
    [p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)],
    [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)],
    [p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)],
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
  ];
  return quads.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
}

function signedVolume(positions: ArrayLike<number>) {
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => positions[i + k]);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

function expectClosed(result: Pick<SurfaceTextureResult, "vertices" | "indices">) {
  expect(surfaceMeshReport(result.indices, result.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0 });
  const positions = surfaceTexturePositions(result);
  const analysis = analyzeTriangleSoup(positions);
  expect(analysis.boundaryEdges).toBe(0);
  expect(analysis.nonManifoldEdges).toBe(0);
  expect(signedVolume(positions)).toBeGreaterThan(0);
}

/** A square ring - an "O" of straight strokes, 10 mm high, 2 mm strokes - centred on 0, 0, plus an "I" beside it. */
const OI = [
  [-8, -5, 2, -5, 2, 5, -8, 5],
  [-6, -3, 0, -3, 0, 3, -6, 3],
  [4, -5, 6, -5, 6, 5, 4, 5],
];

const TEXT = { pattern: "text", depth: 0.6, direction: "outward", textOutline: OI, detail: "coarse" };

describe("text stuck on", () => {
  it("knows its settings and keeps them within their limits", () => {
    const s = normalizeSurfaceTexture({ pattern: "text", textContent: "x".repeat(300), textFont: 7, textSize: 1000, textTurn: "45", textOutline: [[0, 0, 1, 0, 1, 1], [0, 0, NaN, 1, 1, 1], [1, 2], "no"] });
    expect(s).toMatchObject({ pattern: "text", textFont: "Multilanguage", textSize: 200, textTurn: 45 });
    expect(s.textContent).toHaveLength(200);
    expect(s.textOutline).toEqual([[0, 0, 1, 0, 1, 1]]);
  });

  it("raises the letters on the front of a cylinder, closed, readable from outside and nowhere else", () => {
    const result = applySurfaceTexture(cylinder(30, 60), TEXT);
    expect(result.stats.text).toEqual({ placed: true, torn: 0 });
    expectClosed(result);
    // Front (inside frame +z), half way up: out by the depth inside the strokes, smooth outside the window.
    let strayed = 0;
    const raisedAt: number[] = [];
    const v = result.vertices;
    for (let i = 0; i < v.length; i += 3) {
      const [x, y, z] = [v[i], v[i + 1], v[i + 2]];
      if (y < 0.5 || y > 59.5) continue;
      const out = Math.hypot(x, z) - 30;
      // Along the wall to the right, seen from the front.
      const along = Math.atan2(x, z) * 30;
      if (out > 0.55) raisedAt.push(along);
      if (out > 0.01 && (Math.abs(y - 30) > 7 || Math.abs(along + 1) > 10)) strayed += 1;
    }
    expect(strayed).toBe(0);
    // The "O" on the left, the "I" on the right - not mirrored - and their length and the gap kept round the wall.
    expect(raisedAt.some((along) => along < -6)).toBe(true);
    expect(raisedAt.some((along) => along > 4.5 && along < 5.5)).toBe(true);
    expect(Math.min(...raisedAt)).toBeGreaterThan(-8.3);
    expect(Math.max(...raisedAt)).toBeLessThan(6.3);
    expect(raisedAt.some((along) => along > 2.3 && along < 3.7)).toBe(false);
  });

  it("goes round the edge of a box unbroken, engraved into both faces", () => {
    const result = applySurfaceTexture(box(40, 40, 40), { ...TEXT, direction: "inward", textAround: 45 });
    expect(result.stats.text).toEqual({ placed: true, torn: 0 });
    expectClosed(result);
    let front = 0, right = 0;
    const v = result.vertices;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i + 2] < 19.5 && v[i + 2] > 19.4 && Math.abs(v[i]) < 19.4) front += 1;
      if (v[i] < 19.5 && v[i] > 19.4 && Math.abs(v[i + 2]) < 19.4) right += 1;
    }
    expect(front).toBeGreaterThan(10);
    expect(right).toBeGreaterThan(10);
  });

  it("lies on top of a plate with the axis lying, readable from the front", () => {
    const result = applySurfaceTexture(box(60, 3, 40), { ...TEXT, axis: "y" });
    expect(result.stats.text?.placed).toBe(true);
    expectClosed(result);
    const raised: number[] = [];
    const v = result.vertices;
    for (let i = 0; i < v.length; i += 3) {
      expect(v[i + 1]).toBeGreaterThan(-1e-9);
      if (v[i + 1] > 3.55) raised.push(v[i]);
    }
    // The "O" left of the middle, the "I" right of it.
    expect(raised.some((x) => x < -6)).toBe(true);
    expect(raised.some((x) => x > 4.5 && x < 5.5)).toBe(true);
  });

  it("turns on the surface", () => {
    const result = applySurfaceTexture(box(60, 3, 40), { ...TEXT, axis: "y", textTurn: 90 });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const v = result.vertices;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i + 1] < 3.55) continue;
      minX = Math.min(minX, v[i]);
      maxX = Math.max(maxX, v[i]);
      minZ = Math.min(minZ, v[i + 2]);
      maxZ = Math.max(maxZ, v[i + 2]);
    }
    // 14 mm long and 10 mm high, turned a quarter: now 10 across and 14 along the plate's depth.
    expect(maxX - minX).toBeLessThan(10.6);
    expect(maxZ - minZ).toBeGreaterThan(13.4);
  });

  it("tears over a real corner, as a sticker would, and says so", () => {
    const big = OI.map((ring) => ring.map((value) => value * 1.5));
    const result = applySurfaceTexture(box(20, 20, 20), { ...TEXT, direction: "inward", textOutline: big, textAround: 45, textHeight: 95 });
    expect(result.stats.text?.placed).toBe(true);
    expect(result.stats.text?.torn).toBeGreaterThan(0);
    expectClosed(result);
  });

  it("leaves the body as it was without letters", () => {
    const result = applySurfaceTexture(cylinder(30, 60), { ...TEXT, textOutline: [] });
    expect(result.stats.text).toEqual({ placed: false, torn: 0 });
    const v = result.vertices;
    for (let i = 0; i < v.length; i += 3) if (v[i + 1] > 0.5 && v[i + 1] < 59.5) expect(Math.hypot(v[i], v[i + 2])).toBeCloseTo(30, 6);
  });

  it("draws the outlines from the words and the font, a capital as high as the letter size", async () => {
    const rings = await surfaceTextOutline({ content: "Hi", font: "Multilanguage", size: 10 });
    expect(rings.length).toBeGreaterThanOrEqual(3);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k += 2) {
        minX = Math.min(minX, ring[k]);
        maxX = Math.max(maxX, ring[k]);
        minY = Math.min(minY, ring[k + 1]);
        maxY = Math.max(maxY, ring[k + 1]);
      }
    }
    // Centred, the "H" 10 mm high.
    expect(maxY - minY).toBeCloseTo(10, 1);
    expect(minX + maxX).toBeCloseTo(0, 6);
    expect(minY + maxY).toBeCloseTo(0, 6);
    expect(await surfaceTextOutline({ content: "   ", font: "Sans", size: 10 })).toEqual([]);
    const result = applySurfaceTexture(cylinder(30, 60), { ...TEXT, textOutline: rings });
    expect(result.stats.text?.placed).toBe(true);
  });
});
