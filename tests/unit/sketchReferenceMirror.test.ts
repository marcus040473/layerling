import { describe, expect, it } from "vitest";
import { sketchReferenceShapeOnWorkplane } from "@/lib/editorSketchCad";
import { horizontalPlacementWorkplane } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/layerling";

// #896: the sketch of a mirrored body opens as it was drawn, so the bodies around it are shown mirrored to match.
const box: WorkplaneShape = { id: "b", name: "Box", kind: "box", color: "#123456", x: 50, z: -24, size: 10, width: 10, depth: 10, height: 10, rotation: 0 };
const plate = horizontalPlacementWorkplane();

function signedArea(positions: number[]) {
  // The triangles of the bottom... any triangle's winding seen from above: the sign of x1*z2 - x2*z1 summed.
  let total = 0;
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = positions.slice(index, index + 9);
    total += (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
  }
  return total;
}

describe("the bodies around the sketch of a mirrored body (#896)", () => {
  it("stay where they are without a mirror", () => {
    const shown = sketchReferenceShapeOnWorkplane(box, plate);
    expect(shown.x).toBeCloseTo(50);
    expect(shown.z).toBeCloseTo(-24);
  });

  it("are put to the other side of the body's middle along x", () => {
    const shown = sketchReferenceShapeOnWorkplane(box, plate, false, { x: 10 });
    expect(shown.x).toBeCloseTo(-30);
    expect(shown.z).toBeCloseTo(-24);
  });

  it("are put to the other side along z, and both ways together", () => {
    const z = sketchReferenceShapeOnWorkplane(box, plate, false, { z: -10 });
    expect(z.x).toBeCloseTo(50);
    expect(z.z).toBeCloseTo(4);
    const both = sketchReferenceShapeOnWorkplane(box, plate, false, { x: 10, z: -10 });
    expect(both.x).toBeCloseTo(-30);
    expect(both.z).toBeCloseTo(4);
  });

  it("keep the winding of their triangles through two mirrors and reverse it through one", () => {
    const area = (shape: WorkplaneShape) => signedArea(shape.importedMesh?.positions ?? []);
    const plain = area(sketchReferenceShapeOnWorkplane(box, plate));
    expect(Math.sign(area(sketchReferenceShapeOnWorkplane(box, plate, false, { x: 0 })))).toBe(-Math.sign(plain) || 0);
    expect(Math.sign(area(sketchReferenceShapeOnWorkplane(box, plate, false, { x: 0, z: 0 })))).toBe(Math.sign(plain));
  });
});
