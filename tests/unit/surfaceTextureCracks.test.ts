import { describe, expect, it } from "vitest";
import { applySurfaceTexture, normalizeSurfaceTexture, surfaceTexturePositions, type SurfaceTextureResult } from "@/lib/surfaceTexture";
import { surfaceMeshReport } from "@/lib/surfaceTextureMesh";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { sceneWithSurfaceBody, surfaceTextureGoldShape, surfaceTexturedShape, surfaceTextureInput, SURFACE_TEXTURE_GOLD, textureSurfacePositions } from "@/lib/surfaceTextureShape";
import { canonicalizeShape } from "@/lib/workplaneShapes";

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

const CRACKS = { pattern: "cracks", depth: 0.8, direction: "inward", crackCount: 4, crackLength: 70, crackWidth: 1.5, detail: "coarse" };

describe("cracks (kintsugi)", () => {
  it("knows its settings and keeps them within their limits", () => {
    const s = normalizeSurfaceTexture({ pattern: "cracks", crackStyle: "lightning", crackStart: "anywhere", crackCount: 30.4, crackWidth: 0.01, crackSeed: "7.6", crackGold: "true" });
    expect(s).toMatchObject({ pattern: "cracks", crackStyle: "lightning", crackStart: "anywhere", crackCount: 24, crackWidth: 0.2, crackSeed: 8, crackGold: true });
    expect(normalizeSurfaceTexture({ crackStyle: "zigzag", crackStart: "middle" })).toMatchObject({ crackStyle: "crack", crackStart: "top" });
  });

  it("grows cracks down a cylinder from its rim, notched into a closed body", () => {
    const result = applySurfaceTexture(cylinder(30, 80), CRACKS);
    expect(result.stats.cracks?.lines).toBeGreaterThanOrEqual(4);
    expect(result.stats.cracks?.length).toBeGreaterThan(4 * 30);
    expect(result.stats.nothing).toBe(false);
    expectClosed(result);
    // Notched in: some points sink by about the depth, none stands out.
    let deepest = 0, outermost = 0;
    for (let i = 0; i < result.vertices.length; i += 3) {
      const y = result.vertices[i + 1];
      if (y < 1 || y > 79) continue;
      const r = Math.hypot(result.vertices[i], result.vertices[i + 2]);
      deepest = Math.max(deepest, 30 - r);
      outermost = Math.max(outermost, r - 30);
    }
    expect(deepest).toBeGreaterThan(0.5);
    expect(outermost).toBeLessThan(0.01);
    expect(result.fill).toBeNull();
  });

  it("gives the same cracks for the same number, other cracks for another", () => {
    const a = applySurfaceTexture(cylinder(30, 80), CRACKS);
    const b = applySurfaceTexture(cylinder(30, 80), CRACKS);
    const c = applySurfaceTexture(cylinder(30, 80), { ...CRACKS, crackSeed: 2 });
    expect(b.stats.cracks).toEqual(a.stats.cracks);
    expect(c.stats.cracks?.length).not.toBeCloseTo(a.stats.cracks?.length ?? 0, 3);
  });

  it("fills the notch with gold: a closed body of its own, below the surface", () => {
    const result = applySurfaceTexture(cylinder(30, 80), { ...CRACKS, crackGold: true, crackRecess: 0.2 });
    expect(result.fill).not.toBeNull();
    const fill = result.fill!;
    expectClosed(fill);
    // Inside the notch: never beyond the surface less the recess.
    for (let i = 0; i < fill.vertices.length; i += 3) {
      const y = fill.vertices[i + 1];
      if (y < 1 || y > 79) continue;
      expect(Math.hypot(fill.vertices[i], fill.vertices[i + 2])).toBeLessThan(30 - 0.2 + 1e-3);
    }
  });

  it("starts anywhere, and as lightning, on a box too", () => {
    const box = cylinder(25, 60, 4, 6);
    for (const extra of [{ crackStart: "anywhere" }, { crackStyle: "lightning" }, { crackStart: "bottom" }]) {
      const result = applySurfaceTexture(box, { ...CRACKS, ...extra });
      expect(result.stats.cracks?.lines, JSON.stringify(extra)).toBeGreaterThan(0);
      expectClosed(result);
    }
  });

  it("puts the gold beside the textured body as a part of its own, and takes it along when the texture changes", () => {
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "cylinder");
    if (!asset) throw new Error("no cylinder");
    const cylinderShape = canonicalizeShape({ ...makeShapeFromAsset(asset, { x: 5, z: -5 }), width: 50, depth: 50, size: 50, height: 70 });
    const other = canonicalizeShape({ ...makeShapeFromAsset(asset, { x: 100, z: 0 }), id: "other" });
    const settings = normalizeSurfaceTexture({ ...CRACKS, crackGold: true });
    const outcome = textureSurfacePositions(surfaceTextureInput(cylinderShape), settings, 120_000);
    expect(outcome.fill).not.toBeNull();
    const textured = surfaceTexturedShape(cylinderShape, outcome.positions, settings)!;
    const gold = surfaceTextureGoldShape(textured, outcome.fill!, "Gold")!;
    expect(gold.surfaceFillOf).toBe(textured.id);
    expect(gold.color).toBe(SURFACE_TEXTURE_GOLD);
    // In the notch, where the body stands.
    expect(Math.abs(gold.x - 5)).toBeLessThan(30);
    expect(gold.elevation).toBeGreaterThanOrEqual(0);
    const first = sceneWithSurfaceBody([cylinderShape, other], cylinderShape.id, textured, gold);
    expect(first.map((shape) => shape.id)).toEqual([textured.id, gold.id, "other"]);
    // Made again without gold, or taken off: the gold goes.
    const again = sceneWithSurfaceBody(first, textured.id, textured, null);
    expect(again.map((shape) => shape.id)).toEqual([textured.id, "other"]);
  });
});
