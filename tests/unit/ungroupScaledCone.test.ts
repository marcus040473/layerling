import { describe, expect, it } from "vitest";
import { groupedShape, restoreGroupedChildren } from "@/lib/editorBooleans";
import type { WorkplaneShape } from "@/types/layerling";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "shape",
    name: "Shape",
    kind: "box",
    color: "#ff5a47",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

// A box with a cone on top, grouped and then made larger, then ungrouped (#756).
describe("ungrouping a scaled group with a cone", () => {
  it("stretches the cone's radii with its width", () => {
    const box = shape({ id: "box" });
    const cone = shape({ id: "cone", kind: "cone", width: 28, depth: 28, size: 28, height: 20, elevation: 20, baseRadius: 14, topRadius: 0 });
    const group = groupedShape([box, cone]);
    if (!group) throw new Error("the parts did not group");
    const doubled = { ...group, width: (group.width ?? group.size) * 2, depth: group.depth * 2, size: group.size * 2, height: group.height * 2 };
    const parts = restoreGroupedChildren(doubled);
    const restored = parts.find((part) => part.kind === "cone");
    expect(restored).toBeDefined();
    expect(restored?.height).toBeCloseTo(40);
    expect(restored?.baseRadius).toBeCloseTo((restored?.width ?? 0) / 2);
    expect(restored?.baseRadius).toBeCloseTo(28);
    expect(restored?.topRadius).toBeCloseTo(0);
  });

  it("leaves the radii alone when the group was not resized", () => {
    const cone = shape({ id: "cone", kind: "cone", width: 28, depth: 28, size: 28, baseRadius: 14, topRadius: 5 });
    const group = groupedShape([shape({ id: "box" }), cone]);
    if (!group) throw new Error("the parts did not group");
    const restored = restoreGroupedChildren(group).find((part) => part.kind === "cone");
    expect(restored?.baseRadius).toBeCloseTo(14);
    expect(restored?.topRadius).toBeCloseTo(5);
  });
});
