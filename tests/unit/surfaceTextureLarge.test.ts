import { describe, expect, it } from "vitest";
import { fixCaps } from "@/lib/surfaceTextureMesh";

describe("large bodies", () => {
  it("fold away more slivers than one call takes as arguments", () => {
    // Pairs side by side: a sliver (p, q, m) with its tip m in the middle of p-q, and the triangle (q, p, s) across p-q.
    // So many that their new corners would overrun the stack spread into one push, as on a large knurled box.
    const pairs = 25_000;
    const vertices = new Float64Array(pairs * 12);
    const indices = new Uint32Array(pairs * 6);
    for (let k = 0; k < pairs; k += 1) {
      const x = k * 2;
      vertices.set([x, 0, 0, x + 1, 0, 0, x + 0.5, 0, 0, x + 0.5, 1, 0], k * 12);
      const [p, q, m, s] = [k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 3];
      indices.set([p, q, m, q, p, s], k * 6);
    }
    const out = fixCaps(vertices, indices);
    // Every sliver is gone and its neighbour split at the tip: two triangles a pair, each with area.
    expect(out.length).toBe(pairs * 6);
    for (let t = 0; t < out.length; t += 3) expect(new Set([out[t], out[t + 1], out[t + 2]]).size).toBe(3);
    expect(Array.from(out.slice(0, 6))).toEqual([1, 2, 3, 2, 0, 3]);
  });
});
