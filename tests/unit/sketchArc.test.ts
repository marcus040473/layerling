import { describe, expect, it } from "vitest";
import { arcBezierPoints, arcThroughThreePoints, sketchProfileWithArc } from "@/lib/sketchArc";
import type { SketchProfile } from "@/types/layerling";

function bezier(p0: { x: number; z: number }, p1: { x: number; z: number }, p2: { x: number; z: number }, p3: { x: number; z: number }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
  };
}

describe("arcThroughThreePoints (#643)", () => {
  it("finds the circle and the side the third point is on", () => {
    const upper = arcThroughThreePoints({ x: -10, z: 0 }, { x: 0, z: -10 }, { x: 10, z: 0 })!;
    expect(upper.center.x).toBeCloseTo(0);
    expect(upper.center.z).toBeCloseTo(0);
    expect(upper.radius).toBeCloseTo(10);
    expect(Math.abs(upper.sweep)).toBeCloseTo(Math.PI);
    const lower = arcThroughThreePoints({ x: -10, z: 0 }, { x: 0, z: 10 }, { x: 10, z: 0 })!;
    expect(Math.sign(lower.sweep)).toBe(-Math.sign(upper.sweep));
  });

  it("takes the long way round when the third point lies beyond the ends", () => {
    // Start and end close together at the bottom, the third point at the top: almost a whole circle.
    const arc = arcThroughThreePoints({ x: -1, z: 9.95 }, { x: 0, z: -10 }, { x: 1, z: 9.95 })!;
    expect(Math.abs(arc.sweep)).toBeGreaterThan(1.9 * Math.PI);
  });

  it("refuses three points on a line and two that coincide", () => {
    expect(arcThroughThreePoints({ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 })).toBeNull();
    expect(arcThroughThreePoints({ x: 0, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 0 })).toBeNull();
  });
});

describe("arcBezierPoints", () => {
  it("lays the arc in quarter pieces that stay on the circle", () => {
    const arc = arcThroughThreePoints({ x: -10, z: 0 }, { x: 0, z: -10 }, { x: 10, z: 0 })!;
    const points = arcBezierPoints(arc);
    expect(points).toHaveLength(3);
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      for (const t of [0.25, 0.5, 0.75]) {
        const p = bezier(a, a.handleOut!, b.handleIn!, b, t);
        expect(Math.hypot(p.x, p.z)).toBeCloseTo(10, 2);
      }
    }
  });
});

describe("sketchProfileWithArc", () => {
  it("joins existing end points and closes an outline", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: -10, z: 0 }, { id: "b", x: 10, z: 0 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line" }],
    };
    const result = sketchProfileWithArc(profile, { x: -10, z: 0, pointId: "a" }, { x: 0, z: -10 }, { x: 10, z: 0, pointId: "b" })!;
    expect(result.radius).toBeCloseTo(10);
    // One new point in the middle, two new Bezier sides, both ends shared with the line.
    expect(result.profile.points).toHaveLength(3);
    const sides = result.profile.segments.filter((segment) => segment.kind === "bezier");
    expect(sides).toHaveLength(2);
    const ends = new Set(sides.flatMap((segment) => [segment.startId, segment.endId]));
    expect(ends.has("a") && ends.has("b")).toBe(true);
  });

  it("runs the other way where a curve already uses the start's outgoing handle", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: -10, z: 0, handleOut: { x: -10, z: 5 } },
        { id: "c", x: -20, z: 10, handleIn: { x: -15, z: 10 } },
      ],
      segments: [{ id: "ac", startId: "a", endId: "c", kind: "bezier" }],
    };
    const result = sketchProfileWithArc(profile, { x: -10, z: 0, pointId: "a" }, { x: 0, z: -10 }, { x: 10, z: 0 })!;
    const a = result.profile.points.find((point) => point.id === "a")!;
    expect(a.handleOut).toEqual({ x: -10, z: 5 });
    expect(a.handleIn).toBeDefined();
  });

  it("marks a construction arc and refuses a straight one", () => {
    const empty: SketchProfile = { points: [], segments: [] };
    const result = sketchProfileWithArc(empty, { x: 0, z: 0 }, { x: 5, z: 5 }, { x: 10, z: 0 }, { construction: true })!;
    expect(result.profile.segments.every((segment) => segment.construction)).toBe(true);
    expect(sketchProfileWithArc(empty, { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 })).toBeNull();
  });
});
