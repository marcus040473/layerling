import { describe, expect, it } from "vitest";
import {
  applySurfaceTexture,
  insideToScreenPositions,
  makeSurfaceTextureLayout,
  normalizeSurfaceTexture,
  SURFACE_TEXTURE_PATTERNS,
  SURFACE_TEXTURE_SIDING_BOARDS,
  surfaceTexturePositions,
  surfaceTextureValueAt,
  type SurfaceTextureResult,
} from "@/lib/surfaceTexture";
import { prepareSurfaceBase, surfaceMeshReport } from "@/lib/surfaceTextureMesh";
import { analyzeTriangleSoup } from "@/lib/svgImport";

/**
 * Siding for model buildings (Discussion #2147): boards lying level or standing upright, each leaning out over the next
 * by as much as asked, or lying flat with only a joint between them.
 */

type Vec3 = [number, number, number];

/** A closed box standing on the plate, inside frame (y up), faces wound outward. */
function box(w: number, h: number, d: number): number[] {
  const [x0, x1, y0, y1, z0, z1] = [-w / 2, w / 2, 0, h, -d / 2, d / 2];
  const p: Vec3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  return faces.flatMap((face) => face.flatMap((i) => p[i]));
}

/** A closed cylinder standing on the plate (inside frame, y up), one row of tall triangles up the wall. */
function cylinder(radius: number, height: number, segments = 96): number[] {
  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  const at = (k: number, y: number): Vec3 => {
    const a = (2 * Math.PI * k) / segments;
    return [radius * Math.cos(a), y, radius * Math.sin(a)];
  };
  for (let k = 0; k < segments; k += 1) {
    tri(at(k, 0), at(k, height), at(k + 1, height));
    tri(at(k, 0), at(k + 1, height), at(k + 1, 0));
    tri([0, height, 0], at(k + 1, height), at(k, height));
    tri([0, 0, 0], at(k, 0), at(k + 1, 0));
  }
  return out;
}

function volume(positions: ArrayLike<number>) {
  let sum = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, k) => positions[i + k]);
    sum += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return sum;
}

/** Closed, every edge between two faces of opposite ways, and no triangles of no area. */
function expectClosed(body: Pick<SurfaceTextureResult, "vertices" | "indices">) {
  expect(surfaceMeshReport(body.indices, body.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0 });
  const soup = analyzeTriangleSoup(surfaceTexturePositions(body));
  expect(soup.boundaryEdges).toBe(0);
  expect(soup.nonManifoldEdges).toBe(0);
  expect(soup.degenerateTriangles).toBe(0);
  expect(volume(surfaceTexturePositions(body))).toBeGreaterThan(0);
}

/** The pattern's value on the front of a box (screen frame: x across, z up, the front facing -y). */
function onFront(settings: Record<string, unknown>, size: Vec3 = [40, 30, 20]) {
  const s = normalizeSurfaceTexture({ pattern: "siding", projection: "allRound", ...settings });
  const layout = makeSurfaceTextureLayout(prepareSurfaceBase(insideToScreenPositions(box(...size))), s);
  return { s, layout, at: (x: number, z: number) => surfaceTextureValueAt(x, -size[2] / 2, z, 0, -1, 0, s, layout) };
}

/** The pattern's value round a cylinder standing on the plate, at `u` mm round from the +x side and `z` mm up. */
function roundCylinder(settings: Record<string, unknown>, radius = 20, height = 40) {
  const s = normalizeSurfaceTexture({ pattern: "siding", projection: "cylinder", ...settings });
  const layout = makeSurfaceTextureLayout(prepareSurfaceBase(insideToScreenPositions(cylinder(radius, height))), s);
  const R = layout.radius;
  return { s, layout, R, at: (u: number, z: number) => surfaceTextureValueAt(R * Math.cos(u / R), R * Math.sin(u / R), z, Math.cos(u / R), Math.sin(u / R), 0, s, layout) };
}

describe("siding", () => {
  it("knows its settings, starts standing out at model-building sizes, and keeps them within their limits", () => {
    expect(SURFACE_TEXTURE_PATTERNS).toContain("siding");
    expect(SURFACE_TEXTURE_SIDING_BOARDS).toEqual(["level", "upright"]);
    expect(normalizeSurfaceTexture({ pattern: "siding" })).toMatchObject({ spacing: 2.4, depth: 0.5, direction: "outward", keepEdges: false, sidingBoards: "level", sidingLap: 1, sidingGap: 0.4 });
    expect(normalizeSurfaceTexture({ pattern: "siding", sidingBoards: "diagonal", sidingLap: 3, sidingGap: -1 })).toMatchObject({ sidingBoards: "level", sidingLap: 1, sidingGap: 0 });
    expect(normalizeSurfaceTexture({ pattern: "siding", sidingBoards: "upright", sidingLap: "0.25", sidingGap: 99 })).toMatchObject({ sidingBoards: "upright", sidingLap: 0.25, sidingGap: 10 });
    // The boards are cut as grooves are: level ones run level, upright ones upright, whatever angle comes along.
    expect(normalizeSurfaceTexture({ pattern: "siding", angle: 30 }).angle).toBe(90);
    expect(normalizeSurfaceTexture({ pattern: "siding", sidingBoards: "upright", angle: 30 }).angle).toBe(0);
    expect(normalizeSurfaceTexture({ pattern: "grooves", sidingBoards: "upright", angle: 30 }).angle).toBe(30);
  });

  it("lays level boards from the bottom edge up, each leaning out to its lower edge over the next one's joint", () => {
    const { at } = onFront({ spacing: 3, sidingGap: 0.4 });
    for (const x of [-15, 0, 7.3]) {
      for (const board of [0, 1, 4, 9]) {
        const z = board * 3;
        // The thick edge just above the board's bottom, after the step up from the joint below.
        expect(at(x, z + 0.1)).toBeCloseTo(1, 9);
        expect(at(x, z + 0.05)).toBeCloseTo(0.5, 9);
        // A straight face up to the thin edge under the joint: 2.4 mm of face in a 3 mm board.
        expect(at(x, z + 0.1 + 0.6)).toBeCloseTo(0.75, 9);
        expect(at(x, z + 0.1 + 1.2)).toBeCloseTo(0.5, 9);
        expect(at(x, z + 0.1 + 2.4)).toBeCloseTo(0, 9);
        // The joint's floor under the next board.
        expect(at(x, z + 2.8)).toBe(0);
        expect(at(x, z + 2.99)).toBe(0);
      }
    }
  });

  it("leans the boards by the overlap: flat boards with a joint at 0, half way at 0.5, and no joint at width 0", () => {
    const flat = onFront({ spacing: 3, sidingLap: 0, sidingGap: 0.6 }).at;
    for (const up of [0.1, 0.8, 1.5, 2.3]) expect(flat(0, 6 + up)).toBeCloseTo(1, 9);
    expect(flat(0, 6 + 2.35)).toBeCloseTo(0.5, 9);
    expect(flat(0, 6 + 2.5)).toBe(0);
    expect(flat(0, 6 + 2.95)).toBe(0);
    const half = onFront({ spacing: 3, sidingLap: 0.5, sidingGap: 0.6 }).at;
    expect(half(0, 6 + 0.1)).toBeCloseTo(1, 9);
    expect(half(0, 6 + 2.3)).toBeCloseTo(0.5, 9);
    expect(half(0, 6 + 2.35)).toBeCloseTo(0.25, 9);
    expect(half(0, 6 + 2.5)).toBe(0);
    // No joint: the face goes all the way up to the next board's step.
    const lapped = onFront({ spacing: 3, sidingGap: 0 }).at;
    expect(lapped(0, 6 + 0.1)).toBeCloseTo(1, 9);
    expect(lapped(0, 6 + 1.5)).toBeCloseTo(0.5, 9);
    expect(lapped(0, 6 + 2.9)).toBeCloseTo(0, 9);
    // A joint takes at most half a board.
    const wide = onFront({ spacing: 3, sidingGap: 10 }).at;
    expect(wide(0, 6 + 1.6)).toBe(0);
    expect(wide(0, 6 + 1.0)).toBeGreaterThan(0.2);
  });

  it("stands the boards upright, the same all the way up", () => {
    const { at } = onFront({ spacing: 3, sidingBoards: "upright", sidingGap: 0.4 });
    for (const z of [1, 11.3, 29]) {
      expect(at(0.2, z)).toBe(0);
      expect(at(0.45, z)).toBeCloseTo(0, 9);
      expect(at(0.5 + 1.2, z)).toBeCloseTo(0.5, 9);
      expect(at(2.9, z)).toBeCloseTo(1, 9);
      expect(at(2.95, z)).toBeCloseTo(0.5, 9);
      expect(at(3.2, z)).toBe(0);
    }
  });

  it("is the same shape cut into the body: the thick edge at the surface, the joint deepest", () => {
    const out = onFront({ spacing: 3 }).at;
    const cut = onFront({ spacing: 3, direction: "inward" }).at;
    for (const z of [0.1, 0.7, 1.3, 2.5, 2.8, 2.97]) expect(cut(4, 9 + z)).toBeCloseTo(1 - out(4, 9 + z), 9);
    expect(cut(4, 9 + 0.1)).toBeCloseTo(0, 9);
    expect(cut(4, 9 + 2.8)).toBe(1);
  });

  it("goes round a cylinder: level boards as rings from the bottom up, upright ones a whole number round", () => {
    const level = roundCylinder({ spacing: 3 });
    for (const u of [0, 17, 60, 110]) {
      expect(level.at(u, 12 + 0.1)).toBeCloseTo(1, 9);
      expect(level.at(u, 12 + 1.3)).toBeCloseTo(0.5, 9);
      expect(level.at(u, 12 + 2.8)).toBe(0);
    }
    const upright = roundCylinder({ spacing: 3, sidingBoards: "upright" });
    const C = 2 * Math.PI * upright.R;
    expect(upright.layout.around).toBe(Math.round(C / 3));
    expect(upright.layout.period).toBeCloseTo(C / Math.round(C / 3), 9);
    // The same boards from both sides of the seam.
    for (const u of [0.3, 1.1, 2.2]) expect(upright.at(u + C, 20)).toBeCloseTo(upright.at(u, 20), 6);
    expect(upright.at(1.5, 5)).toBeCloseTo(upright.at(1.5, 33), 9);
  });

  it("makes a closed body on a box, the boards standing out by the depth with a sharp step between them", () => {
    const input = box(40, 30, 20);
    for (const sidingBoards of SURFACE_TEXTURE_SIDING_BOARDS) {
      for (const sidingLap of [1, 0.5, 0]) {
        const result = applySurfaceTexture(input, { pattern: "siding", spacing: 3, sidingBoards, sidingLap });
        expectClosed(result);
        let front = -Infinity;
        for (let i = 0; i < result.vertices.length; i += 3) if (Math.abs(result.vertices[i]) < 15 && result.vertices[i + 1] > 3 && result.vertices[i + 1] < 27) front = Math.max(front, result.vertices[i + 2]);
        expect(front).toBeCloseTo(10 + 0.5, 6);
        expect(volume(surfaceTexturePositions(result))).toBeGreaterThan(volume(input));
      }
    }
    // Level boards on the front (inside frame: y up, the front at z = 10): each point lies as far out as its place on its
    // board says, so the cuts follow the boards' edges and no triangle reaches across a step.
    const result = applySurfaceTexture(input, { pattern: "siding", spacing: 3, sidingGap: 0.4 });
    const s = normalizeSurfaceTexture({ pattern: "siding", spacing: 3, sidingGap: 0.4, projection: "allRound" });
    const layout = makeSurfaceTextureLayout(prepareSurfaceBase(insideToScreenPositions(input)), s);
    let checked = 0;
    for (let i = 0; i < result.vertices.length; i += 3) {
      const [x, y, z] = [result.vertices[i], result.vertices[i + 1], result.vertices[i + 2]];
      if (Math.abs(x) > 15 || y < 3 || y > 26 || z < 9.99) continue;
      expect(z - 10).toBeCloseTo(0.5 * surfaceTextureValueAt(x, -10, y, 0, -1, 0, s, layout), 5);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
    // Triangles on the front stay within one board's face, joint or step: none spans a step from thick edge to joint.
    const I = result.indices;
    for (let t = 0; t < I.length; t += 3) {
      const corners = [0, 1, 2].map((k) => [result.vertices[I[t + k] * 3], result.vertices[I[t + k] * 3 + 1], result.vertices[I[t + k] * 3 + 2]]);
      if (!corners.every(([x, y, z]) => Math.abs(x) < 15 && y > 3 && y < 26 && z > 9.99)) continue;
      const ys = corners.map((c) => c[1]);
      const lowest = Math.min(...ys), highest = Math.max(...ys);
      const board = Math.floor((lowest + 1e-6) / 3);
      expect(highest).toBeLessThanOrEqual((board + 1) * 3 + 1e-6);
    }
  }, 120_000);

  it("makes a closed body cut into a box and round a cylinder", () => {
    const input = box(40, 30, 20);
    const cut = applySurfaceTexture(input, { pattern: "siding", spacing: 3, direction: "inward" });
    expectClosed(cut);
    expect(volume(surfaceTexturePositions(cut))).toBeLessThan(volume(input));
    for (let i = 0; i < cut.vertices.length; i += 3) expect(Math.abs(cut.vertices[i + 2])).toBeLessThanOrEqual(10 + 1e-6);
    const round = cylinder(20, 40);
    for (const sidingBoards of SURFACE_TEXTURE_SIDING_BOARDS) {
      const result = applySurfaceTexture(round, { pattern: "siding", spacing: 3, sidingBoards });
      expectClosed(result);
      let far = 0;
      for (let i = 0; i < result.vertices.length; i += 3) far = Math.max(far, Math.hypot(result.vertices[i], result.vertices[i + 2]));
      expect(far).toBeCloseTo(20 + 0.5, 2);
    }
  }, 120_000);
});
