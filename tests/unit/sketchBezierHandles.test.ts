import { describe, expect, it } from "vitest";
import { chordHandles, displayedHandle, isDegenerateHandle, withBezierHandles, withBezierStartHandle } from "@/lib/sketchBezierHandles";
import { isSegmentCurved } from "@/lib/sketchSegmentCurve";
import type { SketchProfile } from "@/types/layerling";

const plain: SketchProfile = {
  points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 9, z: 0 }],
  segments: [],
  images: [],
};
const sideTo = (profile: SketchProfile, endId: string): SketchProfile => ({
  ...profile,
  segments: [{ id: "s", startId: "a", endId, kind: "bezier" }],
});

describe("Bezier handles on points that were there before (#635)", () => {
  it("does nothing for a plain click on the point a chain starts from", () => {
    expect(withBezierHandles(plain, "a", null, null)).toBeNull();
  });

  it("sets both handles of a start point that is dragged out, mirrored", () => {
    const next = withBezierHandles(plain, "a", { handleIn: { x: -3, z: 4 }, handleOut: { x: 3, z: -4 } }, null)!;
    expect(next.points[0]).toMatchObject({ handleIn: { x: -3, z: 4 }, handleOut: { x: 3, z: -4 }, mode: "smooth" });
  });

  it("curves the side that ends on an existing point, from a start point without handles", () => {
    const next = withBezierHandles(plain, "b", { handleIn: { x: 7, z: 2 }, handleOut: { x: 11, z: -2 } }, "a")!;
    expect(next.points[1].handleIn).toEqual({ x: 7, z: 2 });
    expect(next.points[0].handleOut).toEqual({ x: 3, z: 0 });
    expect(isSegmentCurved(sideTo(next, "b"), sideTo(next, "b").segments[0])).toBe(true);
  });

  it("curves it for a plain click on the end point as well, with handles a third along the side (#636)", () => {
    const next = withBezierHandles(plain, "b", null, "a")!;
    expect(next.points[1].handleIn).toEqual({ x: 6, z: 0 });
    expect(next.points[0].handleOut).toEqual({ x: 3, z: 0 });
    expect(isSegmentCurved(sideTo(next, "b"), sideTo(next, "b").segments[0])).toBe(true);
  });

  it("leaves the handles a point has already, and says so when nothing changes", () => {
    const curved: SketchProfile = { ...plain, points: [{ ...plain.points[0], handleOut: { x: 2, z: 2 } }, { ...plain.points[1], handleIn: { x: 8, z: 2 } }] };
    expect(withBezierHandles(curved, "b", null, "a")).toBeNull();
    const dragged = withBezierHandles(curved, "b", { handleIn: { x: 7, z: 5 }, handleOut: { x: 11, z: -5 } }, "a")!;
    expect(dragged.points[1].handleIn).toEqual({ x: 7, z: 5 });
    expect(dragged.points[1].handleOut).toEqual({ x: 11, z: -5 });
    expect(dragged.points[0].handleOut).toEqual({ x: 2, z: 2 });
  });

  it("keeps the other handle of an existing point when a drag sets the one that faces the new side", () => {
    const corner: SketchProfile = { ...plain, points: [plain.points[0], { ...plain.points[1], handleOut: { x: 12, z: 3 } }] };
    const next = withBezierHandles(corner, "b", { handleIn: { x: 7, z: 2 }, handleOut: { x: 11, z: -2 } }, "a")!;
    expect(next.points[1].handleOut).toEqual({ x: 12, z: 3 });
  });
});

describe("Bezier handles with no length of their own (#636)", () => {
  it("gives a clicked point handles along the side that leads to it", () => {
    expect(chordHandles({ x: 0, z: 0 }, { x: 9, z: 0 })).toEqual({ handleIn: { x: 6, z: 0 }, handleOut: { x: 12, z: 0 } });
    expect(chordHandles(null, { x: 9, z: 0 })).toBeNull();
    expect(chordHandles({ x: 9, z: 0 }, { x: 9, z: 0 })).toBeNull();
  });

  it("treats a handle on its own point as missing", () => {
    expect(isDegenerateHandle({ x: 1, z: 2 }, { x: 1, z: 2 })).toBe(true);
    expect(isDegenerateHandle({ x: 1, z: 2 }, undefined)).toBe(true);
    expect(isDegenerateHandle({ x: 1, z: 2 }, { x: 1, z: 3 })).toBe(false);
    const onPoint: SketchProfile = { ...plain, points: [{ ...plain.points[0], handleOut: { x: 0, z: 0 } }, plain.points[1]] };
    const next = withBezierHandles(onPoint, "b", null, "a")!;
    expect(next.points[0].handleOut).toEqual({ x: 3, z: 0 });
  });

  it("fills the outgoing handle of the point a new side runs from, towards the new point, once", () => {
    const next = withBezierStartHandle(plain, "a", { x: 9, z: 0 });
    expect(next.points[0].handleOut).toEqual({ x: 3, z: 0 });
    expect(withBezierStartHandle(next, "a", { x: 30, z: 0 })).toBe(next);
    expect(withBezierStartHandle(plain, null, { x: 9, z: 0 })).toBe(plain);
  });

  it("draws a handle on its point a third of the way to its neighbour, and leaves a real one where it is", () => {
    const old: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0, handleIn: { x: 0, z: 0 }, handleOut: { x: 0, z: 0 } }, { id: "b", x: 9, z: 0, handleIn: { x: 0, z: 5 }, handleOut: { x: 9, z: 0 } }],
      segments: [{ id: "s", startId: "a", endId: "b", kind: "bezier" }],
      images: [],
    };
    expect(displayedHandle(old, old.points[0], "out")).toEqual({ x: 3, z: 0 });
    expect(displayedHandle(old, old.points[1], "in")).toEqual({ x: 0, z: 5 });
    expect(displayedHandle(old, old.points[0], "in")).toEqual({ x: 0, z: 0 });
  });
});
