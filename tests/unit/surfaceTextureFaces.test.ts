import { describe, expect, it } from "vitest";
import {
  applySurfaceTexture,
  insideToScreenPositions,
  normalizeSurfaceTexture,
  SURFACE_TEXTURE_MAX_FACES,
  surfaceTextureChosenTriangles,
  surfaceTextureFacePick,
  surfaceTexturePickedFaceIds,
  toggleSurfaceTexturePickedFace,
} from "@/lib/surfaceTexture";
import { mergeFlatPoints, prepareSurfaceBase, subdivide, surfaceMeshReport } from "@/lib/surfaceTextureMesh";

type Vec3 = [number, number, number];

/** A closed box standing on the plate, inside frame (y up), faces wound outward. */
function box(w: number, h: number, d: number): number[] {
  const [x0, x1, y0, y1, z0, z1] = [-w / 2, w / 2, 0, h, -d / 2, d / 2];
  const p: Vec3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  return faces.flatMap((face) => face.flatMap((i) => p[i]));
}

/** A closed cylinder standing on the plate, inside frame, a point in the middle of top and bottom. */
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

type Result = { vertices: Float32Array | Float64Array; indices: Uint32Array };

/** The points the triangles use (moving and merging leave others behind). */
function usedPoints(result: Result) {
  const used = new Set<number>(result.indices);
  return [...used].map((i): Vec3 => [result.vertices[i * 3], result.vertices[i * 3 + 1], result.vertices[i * 3 + 2]]);
}

function closed(result: Result) {
  return surfaceMeshReport(result.indices, result.vertices.length / 3);
}

/** How many points of a 40 mm box moved off each face (in or out), counted away from the edges. */
function boxMoves(result: Result) {
  const moved = { top: 0, bottom: 0, front: 0, back: 0, left: 0, right: 0 };
  const off = (a: number, plane: number) => (Math.abs(a - plane) > 1e-6 ? 1 : 0);
  // Away from the edges, so a point is plainly on one face.
  const inner = (a: number) => Math.abs(a) < 17;
  const middle = (y: number) => y > 3 && y < 37;
  for (const [x, y, z] of usedPoints(result)) {
    if (inner(x) && inner(z) && y > 37) moved.top += off(y, 40);
    else if (inner(x) && inner(z) && y < 3) moved.bottom += off(y, 0);
    else if (inner(x) && middle(y) && z > 17) moved.front += off(z, 20);
    else if (inner(x) && middle(y) && z < -17) moved.back += off(z, -20);
    else if (inner(z) && middle(y) && x > 17) moved.right += off(x, 20);
    else if (inner(z) && middle(y) && x < -17) moved.left += off(x, -20);
  }
  return moved;
}

describe("picked faces", () => {
  it("read faces by name or as a point with its normal, each once, and drop the rest", () => {
    const s = normalizeSurfaceTexture({
      faces: ["top", "front", "top", "nowhere", 7, { at: [0.5, 2, 0.5], normal: [0, 3, 0] }, { at: [0.5, 0.5], normal: [1, 0, 0] }, { at: [0.2, 0.5, 0.5], normal: [0, 0, 0] }],
    });
    expect(s.faces).toEqual([
      { at: [0.5, 1, 0.5], normal: [0, 1, 0] },
      { at: [0.5, 0.5, 1], normal: [0, 0, 1] },
      { at: [0.5, 1.05, 0.5], normal: [0, 1, 0] },
    ]);
    expect(normalizeSurfaceTexture({}).faces).toEqual([]);
    expect(normalizeSurfaceTexture({ faces: Array.from({ length: 100 }, (_, k) => ({ at: [k / 100, 0.5, 0.5], normal: [1, 0, 0] })) }).faces).toHaveLength(SURFACE_TEXTURE_MAX_FACES);
  });

  it("find a face as the region within the sharp edges round its point", () => {
    const base = prepareSurfaceBase(insideToScreenPositions(cylinder(15, 30)));
    const count = (faces: unknown) => surfaceTextureChosenTriangles(base, normalizeSurfaceTexture({ faces }).faces, 30).reduce((sum, c) => sum + c, 0);
    // 96 triangles in the top's fan, 192 round the mantle.
    expect(count(["top"])).toBe(96);
    expect(count([{ at: [1, 0.5, 0.5], normal: [1, 0, 0] }])).toBe(192);
    expect(count(["top", "bottom", "left"])).toBe(384);
  });

  it("toggle a face with a click: in, out again, and another one beside it", () => {
    const pick = surfaceTextureFacePick(box(40, 40, 40));
    // The face of the triangles facing a way (the pick's normals in the screen frame: z up).
    const facing = (axis: number) => pick.triangleFaces[Array.from(pick.triangleFaces.keys()).find((t) => pick.normals[t * 3 + axis] > 0.99)!];
    const top = facing(2), right = facing(0);
    expect(top).not.toBe(right);
    const once = toggleSurfaceTexturePickedFace(pick, [], top);
    expect(surfaceTexturePickedFaceIds(pick, once)).toEqual([top]);
    // The same face as given by name.
    expect(surfaceTexturePickedFaceIds(pick, normalizeSurfaceTexture({ faces: ["top", "right"] }).faces)).toEqual([top, right]);
    expect(toggleSurfaceTexturePickedFace(pick, once, top)).toEqual([]);
    const two = toggleSurfaceTexturePickedFace(pick, once, right);
    expect(surfaceTexturePickedFaceIds(pick, two)).toEqual([top, right]);
    expect(toggleSurfaceTexturePickedFace(pick, two, top)).toEqual([two[1]]);
  });

  it("texture only the top of a box, the other faces stay as they were", () => {
    const result = applySurfaceTexture(box(40, 40, 40), { faces: ["top"] });
    expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    const moved = boxMoves(result);
    expect(moved.top).toBeGreaterThan(100);
    expect([moved.bottom, moved.front, moved.back, moved.left, moved.right]).toEqual([0, 0, 0, 0, 0]);
    // The sides were not refined for nothing.
    expect(result.stats.triangles).toBeLessThan(10_000);
  }, 60_000);

  it("texture the top and the front of a box together", () => {
    const result = applySurfaceTexture(box(40, 40, 40), { pattern: "rope", faces: ["top", "front"] });
    expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    const moved = boxMoves(result);
    expect(moved.top).toBeGreaterThan(100);
    expect(moved.front).toBeGreaterThan(100);
    expect([moved.bottom, moved.back, moved.left, moved.right]).toEqual([0, 0, 0, 0]);
  }, 60_000);

  it("texture a cylinder's mantle alone: top and bottom stay flat", () => {
    const result = applySurfaceTexture(cylinder(15, 30), { pattern: "bumps", faces: [{ at: [1, 0.5, 0.5], normal: [1, 0, 0] }] });
    expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    let mantle = 0;
    for (const [x, y, z] of usedPoints(result)) {
      const r = Math.hypot(x, z);
      if (r < 13) expect(Math.min(Math.abs(y), Math.abs(y - 30))).toBeLessThan(1e-6);
      else if (y > 3 && y < 27 && Math.abs(r - 15) > 0.05) mantle += 1;
    }
    expect(mantle).toBeGreaterThan(1000);
  }, 60_000);

  it("texture a cylinder's top flat, not in rays round the axis, with a clean rim", () => {
    for (const pattern of ["knurl", "grooves", "honeycomb", "bumps"]) {
      const result = applySurfaceTexture(cylinder(15, 30), { pattern, faces: ["top"] });
      expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
      let top = 0;
      for (const [x, y, z] of usedPoints(result)) {
        const r = Math.hypot(x, z);
        // The mantle stays as it was.
        if (y > 1 && y < 29) expect(Math.abs(r - 15)).toBeLessThan(1e-6);
        // Inside the fade at the rim the top stays at its height; further in the pattern goes down to its depth.
        if (y > 25 && r > 14.2 + 1e-6) expect(y).toBeCloseTo(30, 6);
        if (y > 25 && y < 30 - 1e-6) top += 1;
        if (y > 25) expect(y).toBeGreaterThan(30 - 0.6 - 1e-6);
      }
      expect(top, pattern).toBeGreaterThan(100);
      // Nothing goes round the axis: the status line does not count grooves round.
      expect(result.stats.around).toBeNull();
    }
  }, 120_000);

  it("texture a cylinder's top and mantle together", () => {
    const result = applySurfaceTexture(cylinder(15, 30), { pattern: "bumps", faces: ["top", { at: [1, 0.5, 0.5], normal: [1, 0, 0] }] });
    expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    let top = 0, mantle = 0;
    for (const [x, y, z] of usedPoints(result)) {
      const r = Math.hypot(x, z);
      if (r < 13 && y > 15 && Math.abs(y - 30) > 0.05) top += 1;
      if (y > 3 && y < 27 && Math.abs(r - 15) > 0.05) mantle += 1;
    }
    expect(top).toBeGreaterThan(500);
    expect(mantle).toBeGreaterThan(1000);
  }, 60_000);
});

describe("faces that stay smooth stay coarse", () => {
  it("keep the smooth top and bottom of a box with bumps at a few triangles", () => {
    const result = applySurfaceTexture(box(40, 40, 40), { pattern: "bumps" });
    expect(closed(result)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    let flat = 0;
    for (let t = 0; t < result.indices.length; t += 3) {
      const ys = [0, 1, 2].map((k) => result.vertices[result.indices[t + k] * 3 + 1]);
      if (ys.every((y) => Math.abs(y - 40) < 1e-9) || ys.every((y) => Math.abs(y) < 1e-9)) flat += 1;
    }
    expect(flat).toBeLessThan(200);
  }, 60_000);

  it("merge points inside flat pieces and along straight creases, without moving any", () => {
    // A cylinder's mantle and caps cut into a fine grid: every facet flat, the creases between them straight.
    const base = prepareSurfaceBase(insideToScreenPositions(cylinder(15, 30, 32)));
    const fine = subdivide(base, 1, 1e6);
    const merged = mergeFlatPoints(fine.vertices, fine.indices);
    expect(merged.merged).toBeGreaterThan(0);
    expect(surfaceMeshReport(merged.indices, fine.vertices.length / 3)).toMatchObject({ openEdges: 0, nonManifoldEdges: 0, shells: 1 });
    // Back to about as coarse as it came in: 32 facets of two, two fans of 32 (each kept point of the rims adds a few).
    expect(merged.indices.length / 3).toBeLessThan(fine.indices.length / 3 / 20);
    // The same volume, so nothing moved out of its surface.
    const volume = (I: Uint32Array) => {
      let sum = 0;
      const v = fine.vertices;
      for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
        sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
      }
      return sum / 6;
    };
    expect(volume(merged.indices)).toBeCloseTo(volume(fine.indices), 6);
  });
});
