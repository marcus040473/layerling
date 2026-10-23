import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// The exact kernel (Manifold) loads its files relative to the page; in node they are the public folder.
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { buildGroupedShapeFromSelection, groupedShape } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

function box(id: string, x: number, width: number, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id, name: id, kind: "box", color: "#d41721", x, z: 0, elevation: 0, size: width, width, depth: 8, height: 10, rotation: 0,
    ...overrides,
  } as unknown as WorkplaneShape;
}

function volume(shape: WorkplaneShape) {
  const positions = shape.importedMesh!.positions;
  let total = 0;
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(index, index + 9);
    total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(total / 6);
}

function bundleOf(parts: WorkplaneShape[]): WorkplaneShape {
  return { ...groupedShape(parts)!, name: "Bundle", groupOperation: "bundle" };
}

describe("a bundle with a hole, grouped with another part (#646)", () => {
  // The cube runs from -10 to 10, the bundle's peg from 8 to 16 and its hole from 4 to 12, both 8 deep.
  const cube = () => box("cube", 0, 20, { depth: 20 });
  const peg = () => box("peg", 12, 8, { color: "#f08a24" });
  const hole = () => box("hole", 8, 8, { hole: true, color: "#999999" });

  it("cuts the other part but leaves its own solid whole", async () => {
    const result = await buildGroupedShapeFromSelection([bundleOf([peg(), hole()]), cube()], 250_000);
    expect(result.group).not.toBeNull();
    // Cube 4000 less the 480 the hole takes from it, plus the whole peg of 640.
    expect(volume(result.group!)).toBeCloseTo(4160, 0);
    expect(result.group!.groupedShapes?.some((part) => part.groupOperation === "bundle")).toBe(true);
  });

  it("still lets a hole outside the bundle cut its solids", async () => {
    const outer = box("outer", 14, 4, { hole: true, depth: 20, height: 30, elevation: -10 });
    const result = await buildGroupedShapeFromSelection([bundleOf([peg(), hole()]), cube(), outer], 250_000);
    // As above, less the 4 x 8 x 10 the outer hole takes from the peg.
    expect(volume(result.group!)).toBeCloseTo(4160 - 320, 0);
  });

  it("cuts as before when the hole is not in a bundle", async () => {
    const result = await buildGroupedShapeFromSelection([peg(), hole(), cube()], 250_000);
    // Cube and peg together 4480, less the 640 of the hole inside them.
    expect(volume(result.group!)).toBeCloseTo(3840, 0);
  });
});
