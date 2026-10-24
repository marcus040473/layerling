import { describe, expect, it } from "vitest";
import { closedMeshFaceOrientation } from "@/lib/cadProfileExtrusion";

type Vertex = [number, number, number];
type Face = [number, number, number];

/** closedMeshFaceOrientation as it was with text keys, copied here as the reference. */
function reference(vertices: ReadonlyArray<readonly [number, number, number]>, faces: ReadonlyArray<readonly [number, number, number]>) {
  let extent = 0;
  vertices.forEach(([x, y, z]) => {
    extent = Math.max(extent, Math.abs(x), Math.abs(y), Math.abs(z));
  });
  const quantum = Math.max(1e-9, extent * 1e-7);
  const welded = new Map<string, number>();
  const ids = vertices.map(([x, y, z]) => {
    const key = `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`;
    let id = welded.get(key);
    if (id === undefined) {
      id = welded.size;
      welded.set(key, id);
    }
    return id;
  });
  const edgeFaces = new Map<string, number[]>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  faces.forEach((face, index) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = edgeKey(ids[face[corner]], ids[face[(corner + 1) % 3]]);
      const list = edgeFaces.get(key);
      if (list) list.push(index);
      else edgeFaces.set(key, [index]);
    }
  });
  const runs = (faceIndex: number, a: number, b: number) => {
    const face = faces[faceIndex];
    for (let corner = 0; corner < 3; corner += 1) {
      const from = ids[face[corner]];
      const to = ids[face[(corner + 1) % 3]];
      if (from === a && to === b) return 1;
      if (from === b && to === a) return -1;
    }
    return 0;
  };
  const signedVolume = (faceIndex: number) => {
    const [ax, ay, az] = vertices[faces[faceIndex][0]];
    const [bx, by, bz] = vertices[faces[faceIndex][1]];
    const [cx, cy, cz] = vertices[faces[faceIndex][2]];
    return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  };
  const orientation = new Array<number>(faces.length).fill(0);
  const pieceOf = new Array<number>(faces.length).fill(-1);
  const pieceVolume: number[] = [];
  for (let seed = 0; seed < faces.length; seed += 1) {
    if (orientation[seed] !== 0) continue;
    const pieceIndex = pieceVolume.length;
    orientation[seed] = 1;
    pieceOf[seed] = pieceIndex;
    const queue = [seed];
    let piece = 0;
    while (queue.length) {
      const current = queue.pop() as number;
      piece += orientation[current] * signedVolume(current);
      const face = faces[current];
      for (let corner = 0; corner < 3; corner += 1) {
        const a = ids[face[corner]];
        const b = ids[face[(corner + 1) % 3]];
        if (a === b) continue;
        (edgeFaces.get(edgeKey(a, b)) ?? []).forEach((neighbour) => {
          if (orientation[neighbour] !== 0) return;
          const direction = runs(neighbour, a, b);
          if (direction === 0) return;
          orientation[neighbour] = -direction * orientation[current];
          pieceOf[neighbour] = pieceIndex;
          queue.push(neighbour);
        });
      }
    }
    pieceVolume.push(piece);
  }
  const flip = orientation.map((value, index) => (pieceVolume[pieceOf[index]] < 0 ? -value : value));
  return { flip, pieceVolume: pieceVolume.map(Math.abs) };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A UV sphere as a soup (three corners per triangle), some triangles turned the wrong way. */
function sphereSoup(rings: number, center: Vertex, radius: number, next: () => number) {
  const point = (ring: number, segment: number): Vertex => {
    const theta = (ring / rings) * Math.PI;
    const phi = (segment / (rings * 2)) * Math.PI * 2;
    return [center[0] + radius * Math.sin(theta) * Math.cos(phi), center[1] + radius * Math.cos(theta), center[2] + radius * Math.sin(theta) * Math.sin(phi)];
  };
  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const start = vertices.length;
    vertices.push(a, ...(next() < 0.1 ? [c, b] : [b, c]));
    faces.push([start, start + 1, start + 2]);
  };
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < rings * 2; segment += 1) {
      const a = point(ring, segment), b = point(ring + 1, segment), c = point(ring + 1, segment + 1), d = point(ring, segment + 1);
      if (ring < rings - 1) triangle(a, c, b);
      if (ring > 0) triangle(a, d, c);
    }
  }
  return { vertices, faces };
}

function expectSame(vertices: Vertex[], faces: Face[]) {
  const expected = reference(vertices, faces);
  const actual = closedMeshFaceOrientation(vertices, faces);
  expect(actual.flip).toEqual(expected.flip);
  expect(actual.pieceVolume.length).toBe(expected.pieceVolume.length);
  actual.pieceVolume.forEach((volume, index) => expect(Object.is(volume, expected.pieceVolume[index])).toBe(true));
}

describe("which way the triangles of a closed mesh face", () => {
  it("gives the text-key version's answer for spheres with turned triangles, apart and overlapping", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const next = random(seed);
      const a = sphereSoup(10 + seed, [0, 0, 0], 10, next);
      const b = sphereSoup(8, [seed % 3 === 0 ? 5 : 40, 0, 0], 6, next);
      const offset = a.vertices.length;
      expectSame([...a.vertices, ...b.vertices], [...a.faces, ...b.faces.map(([x, y, z]) => [x + offset, y + offset, z + offset] as Face)]);
    }
  });

  it("gives the same answer for random soups at large and small scales, -0 and NaN included", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const next = random(seed * 7);
      const scale = [1e-6, 1, 1e4][seed % 3];
      const points: Vertex[] = Array.from({ length: 12 }, () => [next() * scale, next() * scale, next() * scale]);
      if (seed % 5 === 0) points[0] = [-0, 0, Number.NaN];
      const vertices: Vertex[] = [];
      const faces: Face[] = [];
      for (let k = 0; k < 40; k += 1) {
        const start = vertices.length;
        for (let c = 0; c < 3; c += 1) vertices.push([...points[Math.floor(next() * points.length)]] as Vertex);
        faces.push([start, start + 1, start + 2]);
      }
      expectSame(vertices, faces);
    }
  });
});
