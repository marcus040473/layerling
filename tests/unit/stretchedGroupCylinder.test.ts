import { describe, expect, it } from "vitest";
import { restoreGroupedChildren } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

// #844: a group stretched in one direction only keeps its cylinders oval when it is hollowed or taken apart.
const part = (overrides: Partial<WorkplaneShape>): WorkplaneShape => ({
  id: "p", name: "Cylinder", kind: "cylinder", color: "#2b2b2b", x: 0, z: 0, elevation: 0, rotation: 0,
  width: 30, depth: 30, height: 10, size: 30, ...overrides,
});

const bone = (width: number): WorkplaneShape => ({
  id: "g", name: "Group", kind: "group", color: "#2b2b2b", x: 0, z: 0, elevation: 0, rotation: 0,
  width, depth: 30, height: 10, size: width,
  groupedShapes: [
    part({ id: "a", x: -20 }),
    part({ id: "b", x: 20, name: "End" }),
    part({ id: "c", kind: "cube", name: "Box", width: 40 }),
  ],
});

describe("a cylinder in a stretched group (#844)", () => {
  it("comes back as an ellipse of the stretched size", () => {
    const parts = restoreGroupedChildren(bone(100));
    const ends = parts.filter((p) => p.kind === "ellipse");
    expect(ends).toHaveLength(2);
    for (const end of ends) {
      expect(end.width).toBeCloseTo(30 * 100 / 70, 3);
      expect(end.depth).toBeCloseTo(30, 6);
    }
    // The palette's name follows the kind, one the person gave stays.
    expect(ends.map((e) => e.name).sort()).toEqual(["Ellipse", "End"]);
  });

  it("stays a cylinder when the group grows the same both ways", () => {
    const group = { ...bone(70) };
    const parts = restoreGroupedChildren({ ...group, width: 140, depth: 60, height: 20 });
    expect(parts.filter((p) => p.kind === "cylinder")).toHaveLength(2);
    expect(parts.some((p) => p.kind === "ellipse")).toBe(false);
  });
});
