import { describe, expect, it } from "vitest";
import { alignSketchSelection, canAlignSketchSelection, sketchSelectionOutlines } from "@/lib/sketchAlign";
import type { SketchPoint, SketchProfile } from "@/types/layerling";

/** A square outline of four points, its top left corner at (x, z), `size` wide. */
function square(id: string, x: number, z: number, size: number, locked = false) {
  const points: SketchPoint[] = [
    { id: `${id}1`, x, z }, { id: `${id}2`, x: x + size, z }, { id: `${id}3`, x: x + size, z: z + size }, { id: `${id}4`, x, z: z + size },
  ].map((point) => (locked ? { ...point, locked: true } : point));
  const segments = points.map((point, index) => ({ id: `${id}s${index}`, startId: point.id, endId: points[(index + 1) % points.length].id }));
  return { points, segments };
}

function profile(...parts: Array<ReturnType<typeof square>>): SketchProfile {
  return { points: parts.flatMap((part) => part.points), segments: parts.flatMap((part) => part.segments), images: [] };
}

const ids = (sketch: SketchProfile) => sketch.points.map((point) => point.id);
const middle = (points: readonly SketchPoint[]) => ({
  x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
  z: (Math.min(...points.map((p) => p.z)) + Math.max(...points.map((p) => p.z))) / 2,
});

describe("aligning outlines in a sketch (#836)", () => {
  it("tells the outlines of a selection apart by the lines that join them", () => {
    const sketch = profile(square("a", 0, 0, 10), square("b", 30, 5, 4));
    expect(sketchSelectionOutlines(sketch, ids(sketch)).map((outline) => outline.length)).toEqual([4, 4]);
    expect(canAlignSketchSelection(sketch, ids(sketch))).toBe(true);
    expect(canAlignSketchSelection(sketch, sketch.points.slice(0, 4).map((point) => point.id))).toBe(false);
  });

  it("centres two outlines on each other in both directions, a ring from two circles", () => {
    const sketch = profile(square("a", 0, 0, 40), square("b", 3, 2, 10));
    const afterX = alignSketchSelection(sketch, ids(sketch), "centerX")!;
    const once = { ...sketch, points: sketch.points.map((point) => afterX.find((moved) => moved.id === point.id) ?? point) };
    const afterZ = alignSketchSelection(once, ids(once), "centerZ")!;
    const done = once.points.map((point) => afterZ.find((moved) => moved.id === point.id) ?? point);
    const [big, small] = [done.slice(0, 4), done.slice(4)];
    expect(middle(small).x).toBeCloseTo(middle(big).x, 9);
    expect(middle(small).z).toBeCloseTo(middle(big).z, 9);
    // Each outline keeps its size.
    expect(Math.max(...small.map((p) => p.x)) - Math.min(...small.map((p) => p.x))).toBeCloseTo(10, 9);
  });

  it("lines up edges on the frame round all of them, and moves handles with their points", () => {
    const withHandle = square("b", 30, 5, 4);
    withHandle.points[0] = { ...withHandle.points[0], handleOut: { x: 31, z: 4 } };
    const sketch = profile(square("a", 0, 0, 10), withHandle);
    const left = alignSketchSelection(sketch, ids(sketch), "left")!;
    expect(left.every((point) => point.id.startsWith("b"))).toBe(true);
    expect(Math.min(...left.map((point) => point.x))).toBeCloseTo(0, 9);
    expect(left.find((point) => point.id === "b1")?.handleOut).toEqual({ x: 1, z: 4 });
    const bottom = alignSketchSelection(sketch, ids(sketch), "bottom")!;
    expect(Math.max(...bottom.map((point) => point.z))).toBeCloseTo(10, 9);
  });

  it("keeps a locked outline in place and lines the others up on it", () => {
    const sketch = profile(square("a", 0, 0, 10), square("b", 50, 50, 20, true));
    const moved = alignSketchSelection(sketch, ids(sketch), "right")!;
    expect(moved.every((point) => point.id.startsWith("a"))).toBe(true);
    expect(Math.max(...moved.map((point) => point.x))).toBeCloseTo(70, 9);
    expect(alignSketchSelection(profile(square("a", 0, 0, 10, true), square("b", 5, 5, 3, true)), ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"], "left")).toBeNull();
  });
});
