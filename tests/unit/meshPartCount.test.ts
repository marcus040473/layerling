import { describe, expect, it } from "vitest";
import { quantizedPointKey, type MeshData, type Vec3 } from "@/lib/editorMeshCore";
import { meshPartCount } from "@/lib/meshPartCount";

/**
 * meshPartCount must count exactly the parts "Separate parts" makes. The reference is the way the
 * editor finds those parts (meshFaceComponents in LayerlingEditor.tsx), copied here as it is.
 */
function referenceCount(mesh: MeshData, tolerance: number) {
  if (mesh.faces.length === 0) return 0;
  const keysByFace = mesh.faces.map((face) => face.map((vertexIndex) => quantizedPointKey(mesh.vertices[vertexIndex], tolerance)));
  const facesByVertex = new Map<string, number[]>();
  keysByFace.forEach((keys, faceIndex) => {
    keys.forEach((key) => {
      const current = facesByVertex.get(key);
      if (current) current.push(faceIndex);
      else facesByVertex.set(key, [faceIndex]);
    });
  });
  const visited = new Uint8Array(mesh.faces.length);
  let components = 0;
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    if (visited[faceIndex]) continue;
    const queue = [faceIndex];
    visited[faceIndex] = 1;
    while (queue.length > 0) {
      const current = queue.pop() as number;
      keysByFace[current].forEach((key) => {
        const neighbors = facesByVertex.get(key);
        if (!neighbors) return;
        facesByVertex.delete(key);
        neighbors.forEach((neighbor) => {
          if (visited[neighbor]) return;
          visited[neighbor] = 1;
          queue.push(neighbor);
        });
      });
    }
    components += 1;
  }
  return components;
}

/** Triangles as a non-indexed mesh, three corners each, as an import comes in. */
function soup(triangles: Vec3[][]): MeshData {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  for (const triangle of triangles) {
    faces.push([vertices.length, vertices.length + 1, vertices.length + 2]);
    vertices.push(...triangle);
  }
  return { name: "test", vertices, faces };
}

function tetrahedron(offset: Vec3, size = 1): Vec3[][] {
  const [x, y, z] = offset;
  const p: Vec3[] = [[x, y, z], [x + size, y, z], [x, y + size, z], [x, y, z + size]];
  return [[p[0], p[2], p[1]], [p[0], p[1], p[3]], [p[0], p[3], p[2]], [p[1], p[2], p[3]]];
}

/** A random generator that gives the same numbers every run. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const TOLERANCE = 0.0005;

describe("counting the parts of a mesh", () => {
  it("counts separate bodies, and bodies that touch at a corner as one", () => {
    const apart = soup([...tetrahedron([0, 0, 0]), ...tetrahedron([5, 0, 0]), ...tetrahedron([10, 0, 0])]);
    expect(meshPartCount(apart, TOLERANCE)).toBe(3);
    const touching = soup([...tetrahedron([0, 0, 0]), ...tetrahedron([1, 0, 0])]);
    expect(meshPartCount(touching, TOLERANCE)).toBe(referenceCount(touching, TOLERANCE));
    expect(meshPartCount(touching, TOLERANCE)).toBe(1);
    expect(meshPartCount(soup([]), TOLERANCE)).toBe(0);
  });

  it("treats corners closer than the grid like the text keys do, -0 and NaN included", () => {
    const nearly = soup([...tetrahedron([0, 0, 0]), ...tetrahedron([1.0002, 0, 0])]);
    expect(meshPartCount(nearly, TOLERANCE)).toBe(referenceCount(nearly, TOLERANCE));
    const signed = soup([[[-0.0001, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [0, 0, 1], [0, 1, 5]]]);
    expect(meshPartCount(signed, TOLERANCE)).toBe(referenceCount(signed, TOLERANCE));
    const broken = soup([[[Number.NaN, 0, 0], [1, 0, 0], [0, 1, 0]], [[Number.NaN, 0, 0], [7, 0, 0], [7, 1, 0]], [[9, 9, 9], [9, 8, 9], [8, 9, 9]]]);
    expect(meshPartCount(broken, TOLERANCE)).toBe(referenceCount(broken, TOLERANCE));
  });

  it("agrees with the editor's own way on random meshes, large and small coordinates", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = random(seed);
      const scale = [0.01, 1, 1000, 1e7][seed % 4];
      // Few distinct grid points, so triangles share corners in many ways.
      const points: Vec3[] = Array.from({ length: 30 }, () => [next() * scale, next() * scale, next() * scale] as Vec3);
      const triangles: Vec3[][] = Array.from({ length: 25 }, () => [0, 1, 2].map(() => {
        const [x, y, z] = points[Math.floor(next() * points.length)];
        // Sometimes a hair off the point, inside or across a grid step.
        const jitter = next() < 0.3 ? (next() - 0.5) * TOLERANCE : 0;
        return [x + jitter, y, z] as Vec3;
      }));
      const mesh = soup(triangles);
      expect(meshPartCount(mesh, TOLERANCE), `seed ${seed}`).toBe(referenceCount(mesh, TOLERANCE));
    }
  });

  it("works through 200,000 triangles quickly", () => {
    const triangles: Vec3[][] = [];
    for (let body = 0; body < 2500; body += 1) {
      for (let k = 0; k < 20; k += 1) triangles.push(...tetrahedron([(body % 50) * 3, Math.floor(body / 50) * 3, k * 0.5], 0.5));
    }
    const mesh = soup(triangles);
    const start = performance.now();
    const count = meshPartCount(mesh, TOLERANCE);
    const fast = performance.now() - start;
    const referenceStart = performance.now();
    expect(count).toBe(referenceCount(mesh, TOLERANCE));
    const reference = performance.now() - referenceStart;
    console.log(`meshPartCount ${fast.toFixed(0)} ms, text keys ${reference.toFixed(0)} ms, ${mesh.faces.length} triangles, ${count} parts`);
    expect(fast).toBeLessThan(reference);
  });
});
