import { describe, expect, it } from "vitest";
import { scaledHorizontalShapePatch } from "@/lib/scaleByPercent";
import { restoreGroupedChildren, groupedShape } from "@/lib/editorBooleans";
import { starSettingsForSize } from "@/lib/starGeometry";
import type { WorkplaneShape } from "@/types/layerling";

function star(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "star", name: "Star", kind: "star", color: "#ffcc00",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 5,
    rotation: 0, locked: false, hidden: false,
    starPoints: 5, starInnerSize: 8, starOuterFillet: 1, starInnerFillet: 0.5,
    ...overrides,
  };
}

// #761: a star scaled with a handle kept its inner size, so it got more or less pointy.
describe("scaling a star", () => {
  it("keeps the shape when the outer size changes from outside", () => {
    expect(starSettingsForSize(star(), 10, 10)).toEqual({ starInnerSize: 4, starOuterFillet: 0.5, starInnerFillet: 0.25 });
    expect(starSettingsForSize(star(), 20, 20)).toEqual({});
  });

  it("stretches the inner size with a percentage scale", () => {
    const patch = scaledHorizontalShapePatch(star(), 1.5, 1.5);
    expect(patch.width).toBeCloseTo(30);
    expect(patch.starInnerSize).toBeCloseTo(12);
  });

  it("stretches it when a made-larger group is ungrouped", () => {
    const group = groupedShape([star({ id: "a" }), star({ id: "b", x: 40 })]);
    if (!group) throw new Error("did not group");
    const doubled = { ...group, width: (group.width ?? group.size) * 2, depth: group.depth * 2, size: group.size * 2 };
    const parts = restoreGroupedChildren(doubled);
    expect(parts[0].width).toBeCloseTo(40);
    expect(parts[0].starInnerSize).toBeCloseTo(16);
  });
});
