import { describe, expect, it } from "vitest";
import { changesLockedOutline, setSketchPointsLocked, sketchLockState } from "@/lib/sketchLock";
import { resizeSketchPoints, resizeSketchPointsToSize, type SelectionBounds } from "@/lib/sketchSelectionResize";
import type { SketchProfile } from "@/types/layerling";

// A square, and a loose line beside it (#653).
const square: SketchProfile = {
  points: [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: 10, z: 0 },
    { id: "c", x: 10, z: 10 },
    { id: "d", x: 0, z: 10 },
    { id: "e", x: 20, z: 0 },
    { id: "f", x: 30, z: 0 },
  ],
  segments: [
    { id: "ab", startId: "a", endId: "b" },
    { id: "bc", startId: "b", endId: "c" },
    { id: "cd", startId: "c", endId: "d" },
    { id: "da", startId: "d", endId: "a" },
    { id: "ef", startId: "e", endId: "f" },
  ],
};
const locked = setSketchPointsLocked(square, ["a", "b", "c", "d"], true);
const moved = (profile: SketchProfile, id: string, dx: number) => ({ ...profile, points: profile.points.map((point) => point.id === id ? { ...point, x: point.x + dx } : point) });

describe("locked sketch outlines (#653)", () => {
  it("locks and unlocks points, and tells how much of a selection is locked", () => {
    expect(sketchLockState(locked, ["a", "b", "c", "d"])).toBe("all");
    expect(sketchLockState(locked, ["a", "e"])).toBe("some");
    expect(sketchLockState(locked, ["e", "f"])).toBe("none");
    const unlocked = setSketchPointsLocked(locked, ["a", "b", "c", "d"], false);
    expect(unlocked.points.some((point) => "locked" in point)).toBe(false);
  });

  it("refuses to move, reshape or remove a locked outline", () => {
    expect(changesLockedOutline(locked, moved(locked, "a", 1))).toBe(true);
    expect(changesLockedOutline(locked, { ...locked, points: locked.points.map((point) => point.id === "b" ? { ...point, handleOut: { x: 12, z: 2 } } : point) })).toBe(true);
    expect(changesLockedOutline(locked, { ...locked, points: locked.points.filter((point) => point.id !== "c") })).toBe(true);
    expect(changesLockedOutline(locked, { ...locked, segments: locked.segments.filter((segment) => segment.id !== "ab") })).toBe(true);
    expect(changesLockedOutline(locked, { ...locked, segments: locked.segments.map((segment) => segment.id === "bc" ? { ...segment, construction: true } : segment) })).toBe(true);
  });

  it("leaves the rest of the sketch free, and the lock itself can be taken off", () => {
    expect(changesLockedOutline(locked, moved(locked, "e", 5))).toBe(false);
    expect(changesLockedOutline(locked, { ...locked, points: [...locked.points, { id: "g", x: 0, z: 20 }], segments: [...locked.segments, { id: "ag", startId: "a", endId: "g" }] })).toBe(false);
    expect(changesLockedOutline(locked, setSketchPointsLocked(locked, ["a", "b", "c", "d"], false))).toBe(false);
    expect(changesLockedOutline(square, moved(square, "a", 1))).toBe(false);
  });
});

describe("keeping the proportions of a sketch selection (#653)", () => {
  const points = square.points.slice(0, 4);
  const bounds: SelectionBounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10, width: 10, depth: 10, cx: 5, cz: 5 };
  const extent = (list: { x: number; z: number }[]) => ({
    width: Math.max(...list.map((point) => point.x)) - Math.min(...list.map((point) => point.x)),
    depth: Math.max(...list.map((point) => point.z)) - Math.min(...list.map((point) => point.z)),
    cz: (Math.max(...list.map((point) => point.z)) + Math.min(...list.map((point) => point.z))) / 2,
  });

  it("stretches one way from a side, both ways while the proportions are kept", () => {
    expect(extent(resizeSketchPoints(points, bounds, "e", { x: 20, z: 5 }))).toMatchObject({ width: 20, depth: 10 });
    const kept = extent(resizeSketchPoints(points, bounds, "e", { x: 20, z: 5 }, true));
    expect(kept).toMatchObject({ width: 20, depth: 20 });
    // The other direction grows about the middle.
    expect(kept.cz).toBeCloseTo(5, 12);
  });

  it("scales a typed size both ways while the proportions are kept", () => {
    expect(extent(resizeSketchPointsToSize(points, bounds, "x", 15))).toMatchObject({ width: 15, depth: 10 });
    expect(extent(resizeSketchPointsToSize(points, bounds, "z", 4, true))).toMatchObject({ width: 4, depth: 4 });
  });
});
