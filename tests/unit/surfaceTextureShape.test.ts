import { describe, expect, it } from "vitest";
import { meshForShape } from "@/lib/editorMeshCore";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import {
  canTextureSurface,
  offersSurfaceTexture,
  surfacePatternLabel,
  surfaceTexturedShape,
  surfaceTextureInput,
  textureSurfaceOffThread,
  textureSurfacePositions,
} from "@/lib/surfaceTextureShape";
import { normalizeSurfaceTexture } from "@/lib/surfaceTexture";
import { canonicalizeShape, workplaneShapesEqual } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

function shape(overrides: Partial<WorkplaneShape>): WorkplaneShape {
  return canonicalizeShape({
    id: "c1", name: "Cylinder", kind: "cylinder", color: "#d97813", x: 12, z: -7, elevation: 3,
    size: 30, width: 30, depth: 30, height: 20, rotation: 0, ...overrides,
  });
}

function soupOf(target: WorkplaneShape) {
  const mesh = meshForShape(target);
  return mesh.faces.flatMap((face) => face.flatMap((index) => mesh.vertices[index]));
}

describe("which shapes take a surface texture", () => {
  it("takes one solid body that is not locked and has no texture yet", () => {
    expect(canTextureSurface(shape({}))).toBe(true);
    expect(canTextureSurface(shape({ locked: true }))).toBe(false);
    expect(canTextureSurface(shape({ surfaceTexture: normalizeSurfaceTexture({}) }))).toBe(false);
    expect(canTextureSurface(null)).toBe(false);
    // A textured body still shows the card, to say what it carries.
    expect(offersSurfaceTexture(shape({ surfaceTexture: normalizeSurfaceTexture({}) }))).toBe(true);
  });

  it("names the patterns in the current language", () => {
    expect(surfacePatternLabel("knurl")).toBe("Knurling");
    expect(surfacePatternLabel("honeycomb")).toBe("Honeycomb");
  });
});

describe("a textured shape", () => {
  it("reads the body where it stands in the design", () => {
    const cylinder = shape({});
    const input = surfaceTextureInput(cylinder);
    expect(input.length).toBe(meshForShape(cylinder).faces.length * 9);
    let minY = Infinity;
    for (let i = 1; i < input.length; i += 3) minY = Math.min(minY, input[i]);
    expect(minY).toBeCloseTo(3, 6);
  });

  it("stands where the body stood, as a closed mesh that remembers its settings", () => {
    const cylinder = shape({});
    const settings = normalizeSurfaceTexture({ pattern: "grooves", spacing: 3, depth: 0.5, angle: 0 });
    const outcome = textureSurfacePositions(surfaceTextureInput(cylinder), settings, 200_000);
    expect(outcome.stats.nothing).toBe(false);
    expect(outcome.stats.around).toBe(Math.round((Math.PI * 30) / 3));
    const textured = surfaceTexturedShape(cylinder, outcome.positions, settings);
    if (!textured) throw new Error("no shape");
    expect(textured.kind).toBe("mesh");
    expect(textured.id).toBe(cylinder.id);
    expect(textured.color).toBe(cylinder.color);
    expect(textured.surfaceTexture).toEqual(settings);
    expect(textured.x).toBeCloseTo(12, 3);
    expect(textured.z).toBeCloseTo(-7, 3);
    expect(textured.elevation).toBeCloseTo(3, 6);
    expect(textured.height).toBeCloseTo(20, 3);
    // Inward grooves leave the outer diameter as it was.
    expect(textured.width).toBeCloseTo(30, 2);
    // The editor's mesh of the new shape is the textured one, where the texture put it.
    const placed = soupOf(textured);
    expect(placed.length).toBe(outcome.positions.length);
    for (let i = 0; i < placed.length; i += 997) expect(placed[i]).toBeCloseTo(outcome.positions[i], 4);
    const analysis = analyzeTriangleSoup(placed);
    expect(analysis.boundaryEdges).toBe(0);
    expect(analysis.nonManifoldEdges).toBe(0);
    // The record of the texture counts as a change of the shape.
    expect(workplaneShapesEqual(textured, { ...textured, surfaceTexture: normalizeSurfaceTexture({ ...settings, depth: 1 }) })).toBe(false);
  });

  it("textures a turned body where it stands, and the new body starts upright", () => {
    const lying = shape({ rotationX: 90 });
    const outcome = textureSurfacePositions(surfaceTextureInput(lying), normalizeSurfaceTexture({ pattern: "bumps", projection: "allRound", spacing: 4, depth: 0.4 }), 150_000);
    const textured = surfaceTexturedShape(lying, outcome.positions, normalizeSurfaceTexture({}));
    if (!textured) throw new Error("no shape");
    expect(textured.rotationX ?? 0).toBe(0);
    // Lying down, the cylinder is as tall as it is wide.
    expect(textured.height).toBeGreaterThan(29);
  });

  it("works without a worker, here in the tests", async () => {
    const outcome = await textureSurfaceOffThread(surfaceTextureInput(shape({})), normalizeSurfaceTexture({ pattern: "honeycomb", spacing: 6 }), 150_000);
    expect(outcome.stats.triangles).toBeGreaterThan(1000);
    expect(outcome.positions.length).toBe(outcome.stats.triangles * 9);
  });
});
