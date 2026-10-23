import { describe, expect, it } from "vitest";
import { importedShapeFromObj } from "@/lib/objImport";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

// A part thinner than 1 mm: a 40 x 20 plate, 0.76 mm high (#700).
const THIN_PLATE = [
  "v 0 0 0", "v 40 0 0", "v 40 0 20", "v 0 0 20",
  "v 0 0.76 0", "v 40 0.76 0", "v 40 0.76 20", "v 0 0.76 20",
  "f 1 2 3 4", "f 5 8 7 6", "f 1 5 6 2", "f 2 6 7 3", "f 3 7 8 4", "f 4 8 5 1",
].join("\n");

function realHeight(shape: WorkplaneShape) {
  const mesh = shape.importedMesh!;
  const ys = mesh.positions.filter((_, index) => index % 3 === 1);
  return (Math.max(...ys) - Math.min(...ys)) * (shape.height / mesh.baseHeight);
}

describe("meshes thinner than 1 mm (#700)", () => {
  it("reports the real extent instead of rounding it up to 1 mm", () => {
    const shape = importedShapeFromObj("plate.obj", THIN_PLATE);
    expect(shape.height).toBeCloseTo(0.76, 6);
    expect(shape.importedMesh?.baseHeight).toBeCloseTo(0.76, 6);
    expect(realHeight(shape)).toBeCloseTo(shape.height, 6);
  });

  it("makes a height typed in come out as typed", () => {
    const shape = { ...importedShapeFromObj("plate.obj", THIN_PLATE), height: 5 };
    expect(realHeight(shape)).toBeCloseTo(5, 6);
  });

  it("repairs a saved shape that still carries the 1 mm base, without changing its size in the world", () => {
    const fresh = importedShapeFromObj("plate.obj", THIN_PLATE);
    const saved: WorkplaneShape = { ...fresh, height: 1, importedMesh: { ...fresh.importedMesh!, baseHeight: 1 } };
    expect(realHeight(saved)).toBeCloseTo(0.76, 6);
    const repaired = canonicalizeShape(saved);
    expect(repaired.importedMesh?.baseHeight).toBeCloseTo(0.76, 6);
    expect(repaired.height).toBeCloseTo(0.76, 6);
    expect(realHeight(repaired)).toBeCloseTo(0.76, 6);
    const scaled = canonicalizeShape({ ...repaired, height: 5 });
    expect(realHeight(scaled)).toBeCloseTo(5, 6);
  });

  it("keeps the repaired size of a shape that was stretched before", () => {
    const fresh = importedShapeFromObj("plate.obj", THIN_PLATE);
    const saved: WorkplaneShape = { ...fresh, height: 5, importedMesh: { ...fresh.importedMesh!, baseHeight: 1 } };
    const repaired = canonicalizeShape(saved);
    expect(realHeight(repaired)).toBeCloseTo(3.8, 6);
    expect(repaired.height).toBeCloseTo(3.8, 6);
  });

  it("leaves a mesh with a sheet of no thickness at 1", () => {
    const flat = importedShapeFromObj("sheet.obj", ["v 0 0 0", "v 2 0 0", "v 2 3 0", "f 1 2 3"].join("\n"));
    expect(flat.depth).toBe(1);
    expect(canonicalizeShape(flat).importedMesh?.baseDepth).toBe(1);
  });
});
