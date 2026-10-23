import { describe, expect, it } from "vitest";
import { sketchProfileWithoutPoint } from "@/lib/sketchPointRemoval";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

const K = 0.5522847498307936;

/** A circle of radius r about the origin, four Bezier quarters, as sketchPrimitives builds it. */
function circle(r: number): { points: SketchPoint[]; segments: SketchSegment[] } {
  const points: SketchPoint[] = [
    { id: "e", x: r, z: 0, handleIn: { x: r, z: -K * r }, handleOut: { x: r, z: K * r } },
    { id: "s", x: 0, z: r, handleIn: { x: K * r, z: r }, handleOut: { x: -K * r, z: r } },
    { id: "w", x: -r, z: 0, handleIn: { x: -r, z: K * r }, handleOut: { x: -r, z: -K * r } },
    { id: "n", x: 0, z: -r, handleIn: { x: -K * r, z: -r }, handleOut: { x: K * r, z: -r } },
  ];
  const segments: SketchSegment[] = [
    { id: "es", startId: "e", endId: "s", kind: "bezier" },
    { id: "sw", startId: "s", endId: "w", kind: "bezier" },
    { id: "wn", startId: "w", endId: "n", kind: "bezier" },
    { id: "ne", startId: "n", endId: "e", kind: "bezier" },
  ];
  return { points, segments };
}

function bezierPoint(p0: { x: number; z: number }, p1: { x: number; z: number }, p2: { x: number; z: number }, p3: { x: number; z: number }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
  };
}

describe("sketchProfileWithoutPoint (#641)", () => {
  it("joins the arc halves and the line halves at a crossing, instead of dropping all four", () => {
    // A circle with a straight line across its east point, both cut there.
    const base = circle(10);
    const profile: SketchProfile = {
      points: [...base.points, { id: "l1", x: 5, z: 0 }, { id: "l2", x: 20, z: 0 }],
      segments: [...base.segments, { id: "a", startId: "l1", endId: "e", kind: "line" }, { id: "b", startId: "e", endId: "l2", kind: "line" }],
    };
    const next = sketchProfileWithoutPoint(profile, "e");
    const pairs = next.segments.map((segment) => [segment.startId, segment.endId, segment.kind].join(">"));
    expect(pairs).toContain("n>s>bezier");
    expect(pairs).toContain("l1>l2>line");
    expect(next.segments).toHaveLength(4);
    expect(next.points.some((point) => point.id === "e")).toBe(false);
  });

  it("keeps arc with arc where the line only touches the circle", () => {
    const base = circle(10);
    const profile: SketchProfile = {
      points: [...base.points, { id: "l1", x: 10, z: -20 }, { id: "l2", x: 10, z: 20 }],
      segments: [...base.segments, { id: "a", startId: "l1", endId: "e", kind: "line" }, { id: "b", startId: "e", endId: "l2", kind: "line" }],
    };
    const pairs = sketchProfileWithoutPoint(profile, "e").segments.map((segment) => [segment.startId, segment.endId, segment.kind].join(">"));
    expect(pairs).toContain("n>s>bezier");
    expect(pairs).toContain("l1>l2>line");
  });

  it("keeps the joined arc on the circle", () => {
    const base = circle(10);
    const next = sketchProfileWithoutPoint({ points: base.points, segments: base.segments }, "e");
    const n = next.points.find((point) => point.id === "n")!;
    const s = next.points.find((point) => point.id === "s")!;
    const mid = bezierPoint(n, n.handleOut!, s.handleIn!, s, 0.5);
    // The half circle's middle is where the removed point was; a cubic is within a few per cent.
    expect(Math.hypot(mid.x, mid.z)).toBeGreaterThan(9.5);
    expect(mid.x).toBeGreaterThan(9.5);
  });

  it("still bridges a point between two sides, and drops sides that turn away at a crossing", () => {
    const square: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 10, z: 0 }, { id: "c", x: 10, z: 10 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line" }, { id: "bc", startId: "b", endId: "c", kind: "line" }],
    };
    const bridged = sketchProfileWithoutPoint(square, "b");
    expect(bridged.segments.map((segment) => [segment.startId, segment.endId])).toEqual([["a", "c"]]);

    // Four lines meeting like an X with one arm bent back: only the straight pair is joined.
    const star: SketchProfile = {
      points: [{ id: "m", x: 0, z: 0 }, { id: "l", x: -10, z: 0 }, { id: "r", x: 10, z: 0 }, { id: "u", x: 0, z: -10 }, { id: "d", x: -7, z: -7 }],
      segments: ["l", "r", "u", "d"].map((other) => ({ id: `m${other}`, startId: "m", endId: other, kind: "line" as const })),
    };
    const kept = sketchProfileWithoutPoint(star, "m").segments.map((segment) => [segment.startId, segment.endId].sort().join(""));
    expect(kept).toEqual(["lr"]);
  });
});
