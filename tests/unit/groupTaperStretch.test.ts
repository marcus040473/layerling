import { describe, expect, it } from "vitest";
import { restoreGroupedChildren } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

// #893: a tapered part of a widened group keeps its widened taper when the group is opened or cut.
const box = (overrides: Partial<WorkplaneShape>): WorkplaneShape => ({
  id: "b", name: "Box", kind: "box", color: "#2f80ed", x: 0, z: 0, elevation: 0, rotation: 0,
  width: 20, depth: 20, height: 20, size: 20, ...overrides,
});

const group = (width: number): WorkplaneShape => ({
  id: "g", name: "Group", kind: "group", color: "#2f80ed", x: 0, z: 0, elevation: 0, rotation: 0,
  width, depth: 20, height: 40, size: width,
  groupedShapes: [
    box({ id: "bottom" }),
    box({ id: "top", elevation: 20, taperTopWidth: 10, taperTopDepth: 10, extrudeTopOffsetX: 2 }),
  ],
});

describe("a tapered part in a stretched group (#893)", () => {
  it("stretches its taper and lean with it", () => {
    const top = restoreGroupedChildren(group(60)).find((part) => part.id.startsWith("top"))!;
    expect(top.width).toBeCloseTo(60, 6);
    expect(top.taperTopWidth).toBeCloseTo(30, 6);
    expect(top.taperBottomWidth).toBeCloseTo(60, 6);
    expect(top.taperTopDepth).toBeCloseTo(10, 6);
    expect(top.extrudeTopOffsetX).toBeCloseTo(6, 6);
  });

  it("leaves a part without a taper as it was", () => {
    const bottom = restoreGroupedChildren(group(60)).find((part) => part.id.startsWith("bottom"))!;
    expect(bottom.taperTopWidth).toBeUndefined();
    expect(bottom.extrudeTopOffsetX).toBeUndefined();
  });
});
