import { describe, expect, it } from "vitest";
import { arrayFollowingPivot, type ArraySettings } from "@/lib/shapeArray";

const settings: ArraySettings = { mode: "circle", count: 6, spacingX: 10, spacingY: 0, spacingZ: 0, angle: 360, centerX: 0, centerY: 0, rotateCopies: true, rise: 0, radiusChange: 0 };

describe("the circle of a pattern follows the pivot (#638)", () => {
  it("moves the centre to the pivot, in the user's Y (scene z reversed)", () => {
    const moved = arrayFollowingPivot(settings, { x: 12, z: -30 });
    expect(moved.centerX).toBe(12);
    expect(moved.centerY).toBe(30);
    expect(moved.count).toBe(6);
  });

  it("returns the same object when the centre already sits at the pivot", () => {
    const placed = arrayFollowingPivot(settings, { x: 0, z: 0 });
    expect(placed).toBe(settings);
  });
});
