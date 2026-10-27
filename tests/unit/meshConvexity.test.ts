import { describe, expect, it } from "vitest";
import { CONVEXITY_TRIANGLE_LIMIT, meshIsConvex } from "@/lib/meshConvexity";

// #928: a hole mesh may be widened by a hair only when it bulges nowhere inwards.
type Point = [number, number, number];

/** The triangles of a prism standing on a closed outline (counter-clockwise from above), as a soup. */
function prism(outline: Array<[number, number]>, height: number) {
  const positions: number[] = [];
  const push = (...points: Point[]) => points.forEach((point) => positions.push(...point));
  for (let i = 1; i + 1 < outline.length; i += 1) {
    const [a, b, c] = [outline[0], outline[i], outline[i + 1]];
    push([a[0], 0, a[1]], [c[0], 0, c[1]], [b[0], 0, b[1]]);
    push([a[0], height, a[1]], [b[0], height, b[1]], [c[0], height, c[1]]);
  }
  outline.forEach((point, index) => {
    const next = outline[(index + 1) % outline.length];
    push([point[0], 0, point[1]], [next[0], 0, next[1]], [next[0], height, next[1]]);
    push([point[0], 0, point[1]], [next[0], height, next[1]], [point[0], height, point[1]]);
  });
  return positions;
}

describe("meshIsConvex", () => {
  it("takes a box with a cut-off edge and a many-sided cylinder for convex", () => {
    expect(meshIsConvex(prism([[0, 0], [10, 0], [10, 7], [7, 10], [0, 10]], 15))).toBe(true);
    const round = Array.from({ length: 64 }, (_, index) => [5 * Math.cos(index * Math.PI / 32), 5 * Math.sin(index * Math.PI / 32)] as [number, number]);
    expect(meshIsConvex(prism(round, 10))).toBe(true);
  });

  it("does not take an L or two separate boxes for convex", () => {
    expect(meshIsConvex(prism([[0, 0], [10, 0], [10, 3], [3, 3], [3, 10], [0, 10]], 5))).toBe(false);
    const square = (x: number): Array<[number, number]> => [[x, 0], [x + 2, 0], [x + 2, 2], [x, 2]];
    expect(meshIsConvex([...prism(square(0), 2), ...prism(square(10), 2)])).toBe(false);
  });

  it("leaves a mesh above the limit unchecked", () => {
    const round = Array.from({ length: CONVEXITY_TRIANGLE_LIMIT }, (_, index) => [5 * Math.cos(index * 2 * Math.PI / CONVEXITY_TRIANGLE_LIMIT), 5 * Math.sin(index * 2 * Math.PI / CONVEXITY_TRIANGLE_LIMIT)] as [number, number]);
    expect(meshIsConvex(prism(round, 10))).toBe(false);
  });
});
