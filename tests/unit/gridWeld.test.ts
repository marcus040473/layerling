import { describe, expect, it } from "vitest";
import { weldOnGrid } from "@/lib/gridWeld";

/** What the editor did before: a text key of the rounded coordinates, numbered in a Map. */
function reference(vertices: number[][], step: number) {
  const index = new Map<string, number>();
  const first: number[] = [];
  const ids = vertices.map((vertex, at) => {
    const key = vertex.map((value) => Math.round(value / step)).join(",");
    const found = index.get(key);
    if (found !== undefined) return found;
    index.set(key, first.length);
    first.push(at);
    return first.length - 1;
  });
  return { ids, first };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("welding corners on a grid", () => {
  it("numbers corners as the text keys did, at every scale, -0, NaN and huge values included", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = random(seed);
      const step = [1e-9, 1e-7, 1e-5, 0.0005, 0.1][seed % 5];
      const scale = [1e-6, 1, 1e3, 1e9][seed % 4];
      const points = Array.from({ length: 40 }, () => [next() * scale - scale / 2, next() * scale, next() * scale]);
      if (seed % 6 === 0) points.push([-0, 0, 0], [0, -0, 0], [Number.NaN, 1, 2], [Number.NaN, 1, 2], [Infinity, -Infinity, 0]);
      const vertices = Array.from({ length: 300 }, () => {
        const [x, y, z] = points[Math.floor(next() * points.length)];
        // Some a hair off the point, so they fall on either side of a grid line.
        return next() < 0.3 ? [x + (next() - 0.5) * step, y, z] : [x, y, z];
      });
      const expected = reference(vertices, step);
      const actual = weldOnGrid(vertices, step);
      expect(Array.from(actual.ids), `seed ${seed}`).toEqual(expected.ids);
      expect(actual.first).toEqual(expected.first);
      expect(actual.count).toBe(expected.first.length);
    }
  });

  it("copes with no corners", () => {
    expect(weldOnGrid([], 1)).toEqual({ ids: new Int32Array(0), first: [], count: 0 });
  });
});
