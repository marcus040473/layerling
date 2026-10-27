import { describe, expect, it } from "vitest";
import { shapeFromCadMesh } from "@/lib/editorSketchCad";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * The kernel hands a hollowed or filleted body back as facets. A round side measured on them came out a few
 * hundredths short: a 38.7 mm cylinder hollowed showed 38.69, and typing 38.7 again stretched it into an ellipse
 * (Jürgen Keller, 25.10.2026). A size within the facets' reach of the body's own is the body's own.
 */
function facetedCylinder(diameter: number, height: number, sides: number, turn: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = (y: number) => {
    const start = positions.length / 3;
    for (let index = 0; index < sides; index += 1) {
      const angle = turn + (index / sides) * Math.PI * 2;
      positions.push(Math.cos(angle) * diameter / 2, y, Math.sin(angle) * diameter / 2);
    }
    return start;
  };
  const bottom = ring(0);
  const top = ring(height);
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    indices.push(bottom + index, top + index, top + next, bottom + index, top + next, bottom + next);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(0), indices: new Uint32Array(indices) };
}

const cylinder = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "c", name: "Cylinder", kind: "cylinder", color: "#e67e22", x: 0, z: 0, elevation: 0, rotation: 0,
  width: 38.7, depth: 38.7, height: 27, size: 38.7, ...overrides,
});

describe("sizes of a CAD result measured on its facets (Keller)", () => {
  // 120 sides turned half a step: the corners miss the widest points, so the mesh is 38.687 mm across.
  const mesh = facetedCylinder(38.7, 27, 120, Math.PI / 120);

  it("keeps the body's own size and place when the facets fall short of them", () => {
    const shape = shapeFromCadMesh(cylinder(), mesh.positions, mesh.normals, mesh.indices, "brep", { linear: 0.01, angular: 0.5 })!;
    expect(shape.width).toBe(38.7);
    expect(shape.depth).toBe(38.7);
    expect(shape.height).toBe(27);
    expect(shape.x).toBe(0);
    expect(shape.elevation).toBe(0);
    // The mesh keeps its own measure, so it is drawn stretched by that hair onto the true surface.
    expect(shape.importedMesh!.baseWidth).toBeLessThan(38.7);
  });

  it("takes the new size when the body really changed", () => {
    const smaller = facetedCylinder(30, 20, 120, 0);
    const shape = shapeFromCadMesh(cylinder(), smaller.positions, smaller.normals, smaller.indices, "brep", { linear: 0.01, angular: 0.5 })!;
    expect(shape.width).toBeCloseTo(30, 2);
    expect(shape.height).toBeCloseTo(20, 2);
  });

  it("measures a turned body on its mesh, as its own sizes lie along other axes", () => {
    const shape = shapeFromCadMesh(cylinder({ rotation: 30 }), mesh.positions, mesh.normals, mesh.indices, "brep", { linear: 0.01, angular: 0.5 })!;
    expect(shape.width).toBeLessThan(38.7);
  });
});
