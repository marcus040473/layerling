import { describe, expect, it } from "vitest";
import { applySurfaceTexture, insideToScreenPositions, isRoundBody, normalizeSurfaceTexture, surfaceFalloff } from "@/lib/surfaceTexture";
import { prepareSurfaceBase } from "@/lib/surfaceTextureMesh";
import { analyzeTriangleSoup } from "@/lib/svgImport";

/** A box standing on the bed, as the editor hands it over (inside frame: y up). */
function box(w: number) {
  const h = w / 2;
  const P = [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0], [-h, -h, w], [h, -h, w], [h, h, w], [-h, h, w]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const out: number[] = [];
  for (const f of F) for (const k of f) out.push(P[k][0], P[k][2], -P[k][1]);
  return out;
}

/** A prism of `n` sides round the up axis (64: a cylinder). */
function prism(r: number, height: number, n: number) {
  const out: number[] = [];
  const at = (k: number, z: number) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), z];
  const push = (...points: number[][]) => points.forEach(([x, y, z]) => out.push(x, z, -y));
  for (let k = 0; k < n; k += 1) {
    const a0 = at(k, 0), a1 = at(k + 1, 0), b0 = at(k, height), b1 = at(k + 1, height);
    push(a0, a1, b1);
    push(a0, b1, b0);
    push([0, 0, 0], a1, a0);
    push([0, 0, height], b0, b1);
  }
  return out;
}

function closedness(r: { vertices: Float64Array; indices: Uint32Array }) {
  const soup: number[] = [];
  for (const i of r.indices) soup.push(r.vertices[i * 3], r.vertices[i * 3 + 1], r.vertices[i * 3 + 2]);
  const a = analyzeTriangleSoup(soup);
  return { open: a.boundaryEdges, nonManifold: a.nonManifoldEdges };
}

describe("bumps: half balls and cones, cut out and laid anew", () => {
  it("are half balls unless a profile is asked for", () => {
    expect(normalizeSurfaceTexture({ pattern: "bumps" }).profile).toBe("dome");
    expect(normalizeSurfaceTexture({ pattern: "bumps", profile: "pointed" }).profile).toBe("pointed");
    expect(normalizeSurfaceTexture({ pattern: "knurl" }).profile).toBe("pointed");
    expect(surfaceFalloff(0, "dome")).toBe(1);
    expect(surfaceFalloff(0.6, "dome")).toBeCloseTo(0.8, 9);
    expect(surfaceFalloff(1, "dome")).toBe(0);
  });

  it("stay closed on a cylinder and a cube, in every shape", () => {
    for (const [name, positions] of [["cylinder", prism(10, 20, 64)], ["cube", box(20)]] as const) {
      for (const profile of ["dome", "pointed", "round", "flat"]) {
        const r = applySurfaceTexture(positions, { pattern: "bumps", direction: "outward", profile });
        expect(closedness(r), `${name} ${profile}`).toEqual({ open: 0, nonManifold: 0 });
      }
    }
  }, 120_000);

  it("follow a half ball on a cylinder, and a cone ends in a point", () => {
    const depth = 0.6;
    for (const profile of ["dome", "pointed"] as const) {
      const r = applySurfaceTexture(prism(10, 20, 64), { pattern: "bumps", direction: "outward", profile, depth, projection: "cylinder" });
      const R = (r.stats.spacing * (r.stats.around ?? 1)) / (2 * Math.PI);
      const hw = (r.stats.spacing / 2) * normalizeSurfaceTexture({}).width;
      const cell = r.stats.spacing, sq3 = Math.sqrt(3), size = cell / sq3;
      // The middle of the bump at (u, v), as the pattern lays them out (pointy-top hexagons).
      const middle = (u: number, v: number) => {
        const q = ((sq3 / 3) * u - v / 3) / size, rr = ((2 / 3) * v) / size;
        let rx = Math.round(q), ry = Math.round(-q - rr), rz = Math.round(rr);
        const dx = Math.abs(rx - q), dy = Math.abs(ry + q + rr), dz = Math.abs(rz - rr);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dy > dz) ry = -rx - rz;
        else rz = -rx - ry;
        return [size * sq3 * (rx + rz / 2), size * 1.5 * rz];
      };
      // The body under a point: the 64-gon's side there.
      const side = (a: number) => {
        const seg = (2 * Math.PI) / 64;
        const t = ((a % seg) + seg) % seg;
        return (10 * Math.cos(seg / 2)) / Math.cos(t - seg / 2);
      };
      let sum = 0, count = 0, top = 0;
      for (const i of new Set(r.indices)) {
        const x = r.vertices[i * 3], v = r.vertices[i * 3 + 1], z = r.vertices[i * 3 + 2];
        if (v < 4 || v > 16) continue;
        const a = Math.atan2(-z, x);
        const u = a * R;
        const [mu, mv] = middle(u, v);
        const d = Math.hypot(u - mu, v - mv) / hw;
        if (d >= 0.999) continue;
        const height = Math.hypot(x, z) - side(a);
        sum += Math.abs(height - depth * surfaceFalloff(d, profile));
        count += 1;
        top = Math.max(top, height);
      }
      expect(sum / count, profile).toBeLessThan(0.02);
      expect(top, profile).toBeGreaterThan(depth * 0.99);
    }
  }, 120_000);
});

describe("laid on as the body asks", () => {
  it("knows a round body from an angular one", () => {
    const round = (positions: number[]) => isRoundBody(prepareSurfaceBase(insideToScreenPositions(positions)), "z");
    expect(round(prism(10, 20, 64))).toBe(true);
    expect(round(prism(10, 20, 16))).toBe(true);
    expect(round(box(20))).toBe(false);
    expect(round(prism(10, 20, 6))).toBe(false);
  });

  it("chooses around the axis on a cylinder and all round on a cube when left to itself", () => {
    expect(applySurfaceTexture(prism(10, 20, 64), { pattern: "grooves" }).stats.projection).toBe("cylinder");
    expect(applySurfaceTexture(box(20), { pattern: "grooves" }).stats.projection).toBe("allRound");
    expect(applySurfaceTexture(box(20), { pattern: "grooves", projection: "cylinder" }).stats.projection).toBe("cylinder");
  }, 60_000);

  it("cuts every pattern on a cube's flat sides and stays closed", () => {
    for (const pattern of ["grooves", "knurl", "honeycomb", "bumps"]) {
      const r = applySurfaceTexture(box(20), { pattern, projection: "allRound" });
      expect(closedness(r), pattern).toEqual({ open: 0, nonManifold: 0 });
      expect(r.stats.projection).toBe("allRound");
    }
  }, 120_000);
});
