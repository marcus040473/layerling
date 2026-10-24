import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fastEdgesGeometry } from "@/lib/fastEdgesGeometry";

/** fastEdgesGeometry must give exactly the lines THREE.EdgesGeometry gives, in the same order. */
function expectSameEdges(geometry: THREE.BufferGeometry, threshold: number) {
  const expected = new THREE.EdgesGeometry(geometry, threshold).getAttribute("position").array;
  const actual = fastEdgesGeometry(geometry, threshold).getAttribute("position").array;
  expect(actual.length).toBe(expected.length);
  expect(Array.from(actual)).toEqual(Array.from(expected));
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("edge lines without text keys", () => {
  it("matches three.js on its own shapes, indexed and not, at the editor's thresholds", () => {
    const shapes = [
      new THREE.BoxGeometry(10, 5, 3, 2, 2, 2),
      new THREE.SphereGeometry(7, 40, 20),
      new THREE.CylinderGeometry(3, 5, 9, 33, 3, true),
      new THREE.TorusKnotGeometry(5, 1.5, 80, 12),
    ];
    for (const geometry of shapes) {
      for (const threshold of [1, 14, 25, 40]) {
        expectSameEdges(geometry, threshold);
        expectSameEdges(geometry.toNonIndexed(), threshold);
      }
    }
  });

  it("matches three.js on messy triangle soups: shared, near and degenerate corners, -0", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const next = random(seed);
      const points = Array.from({ length: 20 }, () => [next() * 10 - 5, next() * 10 - 5, next() * 10 - 5]);
      const positions: number[] = [];
      for (let k = 0; k < 60; k += 1) {
        for (let c = 0; c < 3; c += 1) {
          const [x, y, z] = points[Math.floor(next() * points.length)];
          const jitter = next() < 0.3 ? (next() - 0.5) * 1e-4 : 0;
          positions.push(next() < 0.05 ? -0 : x + jitter, y, z);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      expectSameEdges(geometry, [1, 14, 25][seed % 3]);
    }
  });

  it("is quicker on a large mesh", () => {
    const geometry = new THREE.SphereGeometry(30, 316, 158).toNonIndexed();
    fastEdgesGeometry(geometry, 14);
    new THREE.EdgesGeometry(geometry, 14);
    let started = performance.now();
    fastEdgesGeometry(geometry, 14);
    const fast = performance.now() - started;
    started = performance.now();
    new THREE.EdgesGeometry(geometry, 14);
    const three = performance.now() - started;
    console.log(`fastEdgesGeometry ${fast.toFixed(0)} ms, THREE.EdgesGeometry ${three.toFixed(0)} ms, ${geometry.getAttribute("position").count / 3} triangles`);
    expect(fast).toBeLessThan(three);
  });
});
