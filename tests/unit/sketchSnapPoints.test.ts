import { describe, expect, it } from "vitest";
import { circularArcCenter } from "@/lib/sketchCircularArc";
import { sketchPrimitiveGeometry } from "@/lib/sketchPrimitives";
import { outlineSideMiddles, sketchSnapPoints } from "@/lib/sketchSnapPoints";
import type { SketchProfile } from "@/types/layerling";

const square: SketchProfile = {
  points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 40, z: 0 }, { id: "c", x: 40, z: 20 }],
  segments: [
    { id: "ab", startId: "a", endId: "b", kind: "line" },
    { id: "bc", startId: "b", endId: "c", kind: "line", construction: true },
  ],
};

describe("snapping to middles and centres (#624)", () => {
  it("lists the middle of every straight line, construction lines too", () => {
    expect(sketchSnapPoints(square)).toEqual([{ x: 20, z: 0 }, { x: 40, z: 10 }]);
  });

  it("leaves out the lines of a point that is dragged", () => {
    expect(sketchSnapPoints(square, "c")).toEqual([{ x: 20, z: 0 }]);
    expect(sketchSnapPoints(square, "b")).toEqual([]);
  });

  it("does not list a middle that is a point already", () => {
    const withMiddle: SketchProfile = { ...square, points: [...square.points, { id: "m", x: 20, z: 0 }] };
    expect(sketchSnapPoints(withMiddle)).toEqual([{ x: 40, z: 10 }]);
  });

  it("lists the centre of a circle once, not once per arc", () => {
    let count = 0;
    const circle = sketchPrimitiveGeometry("circle", { x: 12, z: -7 }, () => `id-${count++}`, undefined, undefined);
    const profile: SketchProfile = { points: circle.points, segments: circle.segments };
    const snaps = sketchSnapPoints(profile);
    const centres = snaps.filter((point) => Math.hypot(point.x - 12, point.z + 7) < 0.01);
    expect(centres.length).toBe(1);
  });

  it("takes the centre of a quarter circle arc", () => {
    const radius = 10;
    const k = (4 / 3) * Math.tan(Math.PI / 8) * radius;
    const centre = circularArcCenter({ x: radius, z: 0 }, { x: radius, z: k }, { x: k, z: radius }, { x: 0, z: radius });
    expect(centre!.x).toBeCloseTo(0, 3);
    expect(centre!.z).toBeCloseTo(0, 3);
  });

  it("gives the middles of the sides of an outline", () => {
    expect(outlineSideMiddles([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 }, { x: 0, z: 4 }])).toEqual([
      { x: 5, z: 0 }, { x: 10, z: 2 }, { x: 5, z: 4 }, { x: 0, z: 2 },
    ]);
  });
});
