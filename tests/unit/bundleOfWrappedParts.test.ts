import { describe, expect, it } from "vitest";
import { groupedShape } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

/** A flat box lying on the plate, as the triangle soup an imported mesh keeps. */
function boxPositions(width: number, thickness: number, depth: number) {
  const [x0, x1, z0, z1] = [-width / 2, width / 2, -depth / 2, depth / 2];
  const v = (x: number, y: number, z: number) => [x, y, z];
  const c = [v(x0, 0, z0), v(x1, 0, z0), v(x1, 0, z1), v(x0, 0, z1), v(x0, thickness, z0), v(x1, thickness, z0), v(x1, thickness, z1), v(x0, thickness, z1)];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]];
  return faces.flatMap((face) => face.flatMap((index) => c[index]));
}

// #667: a body wrapped round a cylinder covers only an arc, but its box is the whole cylinder's. A bundle of it was
// sized by that box and shown stretched over the arc.
describe("a bundle of wrapped bodies (#667)", () => {
  const medal: WorkplaneShape = { id: "medal", name: "Medal", kind: "mesh", color: "#d41721", x: 0, z: 0, size: 100, width: 100, depth: 100, height: 3, rotation: 0, importedMesh: { positions: boxPositions(100, 3, 100), baseWidth: 100, baseDepth: 100, baseHeight: 3, triangleCount: 12, sourceFormat: "json" } };
  const text: WorkplaneShape = { ...medal, id: "text", name: "Text", x: 10, z: 5, size: 120, width: 120, depth: 120, height: 1, rotation: 30, cylinderWrap: { diameter: 120 }, importedMesh: { positions: boxPositions(30, 1, 30), baseWidth: 30, baseDepth: 30, baseHeight: 1, triangleCount: 12, sourceFormat: "json" } };

  it("is as big as the parts it holds, so nothing is stretched", () => {
    const bundle = groupedShape([medal, text])!;
    const vertices = [medal, text].flatMap((part) => meshForShape(part).vertices);
    const span = (axis: number) => Math.max(...vertices.map((v) => v[axis])) - Math.min(...vertices.map((v) => v[axis]));
    expect(bundle.width).toBeCloseTo(span(0), 2);
    expect(bundle.depth).toBeCloseTo(span(2), 2);
    expect(bundle.groupedBaseWidth).toBe(bundle.width);
    expect(bundle.groupedBaseDepth).toBe(bundle.depth);
  });
});
