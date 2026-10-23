import { describe, expect, it } from "vitest";
import { shapeFromCadMesh } from "@/lib/editorSketchCad";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * #733: a tapered box with a width offset took a fillet and came out leaning a second time. The CAD
 * result is the finished surface, so the taper, the twist and the lean must not ride along on it.
 */
describe("a CAD result of a deformed body", () => {
  const source = {
    id: "b", name: "Box", kind: "box", x: 0, z: 0, elevation: 0, size: 30, width: 60, depth: 30, height: 26, rotation: 0, color: "#cc3333",
    taperBottomWidth: 50, taperBottomDepth: 30, taperTopWidth: 60, taperTopDepth: 30,
    extrudeTwist: 20, extrudeTopOffsetX: 5, extrudeTopOffsetZ: -3,
  } as WorkplaneShape;
  const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10, 0, 10, 0]);
  const normals = new Float32Array(12);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);

  it("carries no taper, twist or lean on", () => {
    const result = shapeFromCadMesh(source, positions, normals, indices, "brep");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("mesh");
    expect(result?.taperTopWidth).toBeUndefined();
    expect(result?.taperBottomWidth).toBeUndefined();
    expect(result?.extrudeTwist).toBeUndefined();
    expect(result?.extrudeTopOffsetX).toBeUndefined();
    expect(result?.extrudeTopOffsetZ).toBeUndefined();
  });
});
