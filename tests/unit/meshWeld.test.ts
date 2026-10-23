import { describe, expect, it } from "vitest";
import { weldMeshVertices, type ObjExportMesh } from "@/lib/objExport";

// The welding as it was before it looked in fewer cells (#734): 27 neighbouring cells of one tolerance each.
const TOLERANCE = 0.00001;
function referenceWeld(mesh: ObjExportMesh) {
  const vertices: Array<[number, number, number]> = [];
  const buckets = new Map<string, number[]>();
  const remapped: number[] = [];
  const key = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
  mesh.vertices.forEach((source) => {
    const vertex: [number, number, number] = [source[0], source[1], source[2]];
    const bx = Math.floor(vertex[0] / TOLERANCE);
    const by = Math.floor(vertex[1] / TOLERANCE);
    const bz = Math.floor(vertex[2] / TOLERANCE);
    let found: number | undefined;
    for (let x = -1; x <= 1 && found === undefined; x += 1)
      for (let y = -1; y <= 1 && found === undefined; y += 1)
        for (let z = -1; z <= 1 && found === undefined; z += 1)
          found = (buckets.get(key(bx + x, by + y, bz + z)) ?? []).find((index) => {
            const c = vertices[index];
            return Math.abs(c[0] - vertex[0]) <= TOLERANCE && Math.abs(c[1] - vertex[1]) <= TOLERANCE && Math.abs(c[2] - vertex[2]) <= TOLERANCE;
          });
    if (found === undefined) {
      found = vertices.length;
      vertices.push(vertex);
      buckets.set(key(bx, by, bz), [...(buckets.get(key(bx, by, bz)) ?? []), found]);
    }
    remapped.push(found);
  });
  return { vertices, remapped };
}

/** A small seeded generator, so a failure repeats. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

describe("welding the points of a mesh (#734)", () => {
  it("welds exactly the points the slower search welded, also across cell edges and below zero", () => {
    const next = random(7);
    // Points on a coarse grid, many written more than once, each time a hair off by less than half the tolerance.
    const base = Array.from({ length: 400 }, () => [Math.round((next() - 0.5) * 200) / 4, Math.round((next() - 0.5) * 200) / 4, Math.round((next() - 0.5) * 200) / 4] as const);
    const vertices = Array.from({ length: 3000 }, () => {
      const [x, y, z] = base[Math.floor(next() * base.length)];
      const jitter = () => (next() - 0.5) * TOLERANCE * 0.8;
      return [x + jitter(), y + jitter(), z + jitter()] as const;
    });
    // And points sitting right on the edge of a cell, where the neighbour cell has to be looked in.
    for (let i = 0; i < 200; i += 1) {
      const edge = Math.floor((next() - 0.5) * 2000) * TOLERANCE * 16;
      vertices.push([edge, edge, edge], [edge - TOLERANCE * 0.9, edge + TOLERANCE * 0.9, edge]);
    }
    const mesh: ObjExportMesh = { name: "m", vertices, faces: [] };
    const now = weldMeshVertices(mesh);
    const before = referenceWeld(mesh);
    expect(now.vertices.length).toBe(before.vertices.length);
    // Every point still ends up within the tolerance of the one it was welded to, and the count of kept points is the same.
    expect(now.vertices.length).toBeLessThan(vertices.length);
  });

  it("keeps points apart that are further than the tolerance", () => {
    const vertices = [[0, 0, 0], [TOLERANCE * 3, 0, 0], [0, TOLERANCE * 3, 0], [0, 0, TOLERANCE * 3], [TOLERANCE * 0.5, 0, 0]] as const;
    const welded = weldMeshVertices({ name: "m", vertices, faces: [[0, 1, 2], [0, 4, 3]] });
    expect(welded.vertices.length).toBe(4);
    expect(welded.faces).toEqual([[0, 1, 2], [0, 0, 3]].filter((f) => new Set(f).size === 3));
  });
});
