import { describe, expect, it } from "vitest";
import { surfaceMeshReport } from "@/lib/surfaceTextureMesh";
import { buildVase } from "@/lib/vase/vase-geometry.mjs";

/** A straight cylinder with Voronoi joints: radius 30, 1 mm deep, 1.6 mm wide, in draft quality (quick). */
const VORONOI = { profile: "zylinder", height: 80, diameter: 60, effect: "voronoi", voronoiCell: 12, voronoiGap: 1.6, voronoiDepth: 1, wall: 2, body: "hohl", quality: "entwurf" };

describe("Voronoi joints of a vase", () => {
  it("stays closed, hollow or solid, twisted, with the pattern only part of the way up", () => {
    for (const extra of [{}, { body: "voll" }, { twist: 90 }, { zoneFrom: 20, zoneTo: 60 }, { section: "vieleck", polySides: 6 }]) {
      const mesh = buildVase({ ...VORONOI, ...extra } as never);
      expect(surfaceMeshReport(mesh.indices, mesh.vertices.length / 3), JSON.stringify(extra)).toMatchObject({ shells: 1, openEdges: 0, nonManifoldEdges: 0 });
    }
  });

  it("cuts the wall along the joints' height lines instead of leaving them in steps on the grid", () => {
    const mesh = buildVase(VORONOI as never);
    const v = mesh.vertices;
    // The joint's profile at a quarter and at 60 % of its half width from the middle: the depths of two of the cuts.
    const profile = (share: number) => 0.5 * (1 + Math.cos(Math.PI * share));
    const counts = [0, 0];
    for (let i = 0; i < v.length; i += 3) {
      if (v[i + 2] < 1 || v[i + 2] > 79) continue;
      const depth = 30 - Math.hypot(v[i], v[i + 1]);
      if (depth < -1e-6 || depth > 1.01) continue;
      [0.25, 0.6].forEach((share, k) => {
        if (Math.abs(depth - profile(share)) < 1e-4) counts[k] += 1;
      });
    }
    // Every joint is lined on both sides by points at exactly these depths - a grid alone hardly ever meets them.
    expect(counts[0]).toBeGreaterThan(500);
    expect(counts[1]).toBeGreaterThan(500);
  });
});
