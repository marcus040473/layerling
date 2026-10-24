import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { planarFaceCentre } from "@/lib/faceCentre";

function topTriangle(geometry: THREE.BufferGeometry, height: number) {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const count = (index ? index.count : position.count) / 3;
  for (let tri = 0; tri < count; tri += 1) {
    const ys = [0, 1, 2].map((corner) => position.getY(index ? index.getX(tri * 3 + corner) : tri * 3 + corner));
    if (ys.every((y) => Math.abs(y - height) < 1e-6)) return tri;
  }
  return -1;
}

describe("planarFaceCentre (#823)", () => {
  it("finds the middle of the top of a box, whichever top triangle was hit", () => {
    const geometry = new THREE.BoxGeometry(40, 10, 20).translate(5, 5, -3);
    const tri = topTriangle(geometry, 10);
    const centre = planarFaceCentre(geometry.getAttribute("position").array, geometry.index!.array, tri);
    expect(centre?.centre[0]).toBeCloseTo(5);
    expect(centre?.centre[1]).toBeCloseTo(10);
    expect(centre?.centre[2]).toBeCloseTo(-3);
    expect(centre?.radius).toBeCloseTo(Math.hypot(20, 10));
  });

  it("finds the middle of a cylinder's top, also in a mesh without an index", () => {
    const geometry = new THREE.CylinderGeometry(15, 15, 30, 48).translate(-7, 15, 12).toNonIndexed();
    const tri = topTriangle(geometry, 30);
    const centre = planarFaceCentre(geometry.getAttribute("position").array, null, tri);
    expect(centre?.centre[0]).toBeCloseTo(-7);
    expect(centre?.centre[1]).toBeCloseTo(30);
    expect(centre?.centre[2]).toBeCloseTo(12);
  });

  it("keeps two separate faces in the same plane apart", () => {
    const left = new THREE.BoxGeometry(10, 10, 10).translate(-20, 5, 0).toNonIndexed();
    const right = new THREE.BoxGeometry(10, 10, 10).translate(20, 5, 0).toNonIndexed();
    const positions = new Float32Array([...left.getAttribute("position").array, ...right.getAttribute("position").array]);
    const leftCount = left.getAttribute("position").count / 3;
    const tri = leftCount + topTriangle(right, 10);
    const centre = planarFaceCentre(positions, null, tri);
    expect(centre?.centre[0]).toBeCloseTo(20);
  });
});
