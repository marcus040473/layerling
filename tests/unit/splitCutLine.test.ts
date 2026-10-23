import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planeCrossingSegments } from "@/lib/splitCutLine";

describe("the cut line of the split tool (#615)", () => {
  it("runs round a box where a horizontal plane crosses it", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20));
    const points = planeCrossingSegments([mesh], [0, 0, 0], [0, 1, 0]);
    expect(points.length).toBeGreaterThan(0);
    // Every point lies in the plane, on the surface of the box (its outline is 20 x 20).
    for (let i = 0; i < points.length; i += 3) {
      expect(points[i + 1]).toBeCloseTo(0);
      expect(Math.max(Math.abs(points[i]), Math.abs(points[i + 2]))).toBeCloseTo(10);
    }
  });

  it("draws nothing for a plane that misses the body", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20));
    expect(planeCrossingSegments([mesh], [0, 50, 0], [0, 1, 0])).toEqual([]);
  });

  it("follows the position of the mesh in the scene", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(100, 0, 0);
    const points = planeCrossingSegments([mesh], [100, 0, 0], [1, 0, 0]);
    expect(points.length).toBeGreaterThan(0);
    for (let i = 0; i < points.length; i += 3) expect(points[i]).toBeCloseTo(100);
  });
});
