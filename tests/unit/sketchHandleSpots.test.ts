import { describe, expect, it } from "vitest";
import { lockBadgeSpot, rotateHandleSpots } from "@/lib/sketchHandleSpots";

const square = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }];
const wideView = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };

describe("sketch handle spots", () => {
  it("puts a turning arrow beyond each corner, bowing away from the centre", () => {
    const spots = rotateHandleSpots(square, { x: 0, z: 0 }, Math.SQRT2 * 5);
    expect(spots[0].x).toBeCloseTo(-15, 6);
    expect(spots[0].z).toBeCloseTo(-15, 6);
    expect(spots[2].x).toBeCloseTo(15, 6);
    expect(spots[0].outward.x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(spots[0].outward.z).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it("shows only the dragged arrow, under the pointer and bowing away from the centre", () => {
    const spots = rotateHandleSpots(square, { x: 0, z: 0 }, Math.SQRT2 * 5, { corner: 1, at: { x: 0, z: -30 } });
    expect(spots).toEqual([{ x: 0, z: -30, outward: { x: 0, z: -1 }, corner: 1 }]);
  });

  it("keeps the lock badge on the part of the picture that is on screen", () => {
    expect(lockBadgeSpot(square[0], square, wideView, 3)).toEqual({ x: -7, z: -7 });
    // Zoomed in on its lower right: the badge moves to the top left of what can be seen.
    expect(lockBadgeSpot(square[0], square, { minX: 0, minZ: 0, maxX: 50, maxZ: 50 }, 3)).toEqual({ x: 3, z: 3 });
    // The picture is off screen.
    expect(lockBadgeSpot(square[0], square, { minX: 20, minZ: 20, maxX: 50, maxZ: 50 }, 3)).toBeNull();
  });
});
