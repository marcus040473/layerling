import { describe, expect, it } from "vitest";
import { joinOpenEnds, openEndPoints, openEndUnder } from "@/lib/sketchPointJoin";
import { orderedPaths } from "@/lib/sketchPaths";
import type { SketchProfile } from "@/types/layerling";

// A square with its last side taken away: d and a are open ends.
function openSquare(): SketchProfile {
  return {
    points: [
      { id: "a", x: 0, z: 0 }, { id: "b", x: 40, z: 0 }, { id: "c", x: 40, z: 40 }, { id: "d", x: 0, z: 40 },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line" },
      { id: "bc", startId: "b", endId: "c", kind: "line" },
      { id: "cd", startId: "c", endId: "d", kind: "line" },
    ],
  };
}

describe("closing a gap by dragging an open end onto the other (#698)", () => {
  it("lists only the open ends as snap places", () => {
    expect(openEndPoints(openSquare(), "d")).toEqual([{ x: 0, z: 0 }]);
  });

  it("does nothing while the ends lie apart", () => {
    expect(openEndUnder(openSquare(), "d")).toBeNull();
    expect(joinOpenEnds(openSquare(), "d")).toBeNull();
  });

  it("makes one point of two ends that meet, and the outline closes", () => {
    const profile = openSquare();
    profile.points[3] = { id: "d", x: 0, z: 0 };
    const joined = joinOpenEnds(profile, "d")!;
    expect(joined.points.map((point) => point.id)).toEqual(["a", "b", "c"]);
    expect(joined.segments.find((segment) => segment.id === "cd")).toMatchObject({ startId: "c", endId: "a" });
    const paths = orderedPaths(joined);
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
  });

  it("takes the handle of the dragged end across when the sides meet end to start", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, handleOut: { x: 5, z: -10 } },
        { id: "b", x: 40, z: 0 },
        { id: "c", x: 0, z: 0, handleIn: { x: -5, z: 8 } },
      ],
      segments: [
        { id: "ab", startId: "a", endId: "b", kind: "bezier" },
        { id: "bc", startId: "b", endId: "c", kind: "bezier" },
      ],
    };
    const joined = joinOpenEnds(profile, "c")!;
    expect(joined.points.find((point) => point.id === "a")).toMatchObject({ handleOut: { x: 5, z: -10 }, handleIn: { x: -5, z: 8 }, mode: "split" });
  });

  it("leaves two curved sides that would both start there as they are", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, handleOut: { x: 5, z: -10 } },
        { id: "b", x: 40, z: 0, handleIn: { x: 30, z: 5 } },
        { id: "c", x: 0, z: 0, handleOut: { x: -5, z: 8 } },
        { id: "d", x: -40, z: 0, handleIn: { x: -30, z: 5 } },
      ],
      segments: [
        { id: "ab", startId: "a", endId: "b", kind: "bezier" },
        { id: "cd", startId: "c", endId: "d", kind: "bezier" },
      ],
    };
    expect(joinOpenEnds(profile, "c")).toBeNull();
  });

  it("does not join the two ends of one single side, nor a point of a locked outline", () => {
    const single: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 0, z: 0 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line" }],
    };
    expect(joinOpenEnds(single, "b")).toBeNull();
    const locked = openSquare();
    locked.points[3] = { id: "d", x: 0, z: 0, locked: true };
    expect(joinOpenEnds(locked, "d")).toBeNull();
  });
});
