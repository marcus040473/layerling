import { describe, expect, it } from "vitest";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import { buildVase, normalizeParams, PATTERNS, type VaseMesh } from "@/lib/vase/vase-geometry.mjs";
import { patternStarter } from "@/lib/vase/vase-patterns.mjs";

/**
 * The patterns worked out on the vase's own wall (Discussions #1153 and #954: a Surface Texture on a vase took
 * seconds and too many triangles): rings, honeycomb, bumps, a hammered face, scales, knitting, a weave, bricks and
 * a grain, as the vase's pattern or as a second one over it.
 */

const closed = (mesh: VaseMesh) => analyzeTriangleSoup(Array.from(mesh.indices, (index) => [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1], mesh.vertices[index * 3 + 2]]).flat());

/** A straight cylinder of radius 30, in draft quality (quick), with a pattern and the measures it starts with. */
const cylinder = (pattern: string, extra: Record<string, unknown> = {}) => ({ profile: "zylinder", height: 80, diameter: 60, quality: "entwurf", effect: pattern, ...patternStarter(pattern), ...extra }) as never;

/** The radii of the outer wall's points between two heights: the wall's rows come first in the mesh. */
function wallRadii(mesh: VaseMesh & { grid?: { segments: number; rows: number } }, from: number, to: number) {
  const out: number[] = [];
  const count = (mesh.grid!.rows + 1) * mesh.grid!.segments;
  for (let i = 0; i < count; i++) {
    const z = mesh.vertices[i * 3 + 2];
    if (z >= from && z <= to) out.push(Math.hypot(mesh.vertices[i * 3], mesh.vertices[i * 3 + 1]));
  }
  return out;
}

describe("patterns worked out on the vase's wall", () => {
  it("gives a closed body for every pattern, solid and hollow, twisted, with a lid's thread and a cut-out wall", () => {
    for (const pattern of Object.keys(PATTERNS)) {
      for (const extra of [{}, { body: "hohl" }, { body: "hohl", twist: 120, section: "vieleck", polySides: 6 }]) {
        expect(closed(buildVase(cylinder(pattern, extra))), `${pattern} ${JSON.stringify(extra)}`).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
      }
    }
    expect(closed(buildVase(cylinder("waben", { body: "hohl", lidMode: "schraube" })))).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
    expect(closed(buildVase(cylinder("strick", { body: "hohl", cutout: "rauten", zoneTo: 12 })))).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
  }, 60000);

  it("moves the wall by the depth set and no further, into the body or out of it", () => {
    const inward = wallRadii(buildVase(cylinder("waben", { patternDepth: 1.5 })), 0, 80);
    expect(Math.min(...inward)).toBeCloseTo(28.5, 2);
    expect(Math.max(...inward)).toBeCloseTo(30, 6);
    const outward = wallRadii(buildVase(cylinder("noppen", { patternDepth: 1.2 })), 0, 80);
    expect(Math.min(...outward)).toBeCloseTo(30, 6);
    expect(Math.max(...outward)).toBeGreaterThan(31.1);
    expect(Math.max(...outward)).toBeLessThanOrEqual(31.2 + 1e-6);
  });

  it("keeps a pattern to its height band and leaves the wall smooth outside it", () => {
    const mesh = buildVase(cylinder("waben", { zoneFrom: 40, zoneTo: 60, zoneFade: 0 }));
    for (const radius of [...wallRadii(mesh, 0, 31), ...wallRadii(mesh, 49, 80)]) expect(radius).toBeCloseTo(30, 6);
    expect(Math.min(...wallRadii(mesh, 33, 47))).toBeLessThan(29.5);
  });

  it("lays a second pattern over the first, each in its own band", () => {
    const mesh = buildVase(cylinder("rillen", { ribCount: 24, ribDepth: 1, zoneFrom: 0, zoneTo: 45, effect2: "noppen", ...patternStarter("noppen", 1), zone2From: 55, zone2To: 100, zoneFade: 0 }));
    expect(closed(mesh)).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
    // Below, the grooves go into the body; above, the bumps stand out of it.
    expect(Math.min(...wallRadii(mesh, 5, 40))).toBeCloseTo(29, 1);
    expect(Math.max(...wallRadii(mesh, 5, 40))).toBeCloseTo(30, 6);
    expect(Math.max(...wallRadii(mesh, 60, 75))).toBeGreaterThan(30.8);
  });

  it("keeps the inner wall behind a pattern that goes into the body", () => {
    const mesh = buildVase(cylinder("waben", { body: "hohl", wall: 2, patternDepth: 2 }));
    let innermost = Infinity;
    for (let i = 0; i < mesh.vertices.length; i += 3) if (mesh.vertices[i + 2] > 10 && mesh.vertices[i + 2] < 70) innermost = Math.min(innermost, Math.hypot(mesh.vertices[i], mesh.vertices[i + 1]));
    // 30 mm less the pattern's 2 mm less the wall's 2 mm.
    expect(innermost).toBeCloseTo(26, 2);
  });

  it("closes round the vase without a seam: every cell round a row is like the others", () => {
    const mesh = buildVase(cylinder("noppen", { patternCount: 12 })) as VaseMesh & { grid: { segments: number; rows: number } };
    const segments = mesh.grid.segments;
    expect(segments % 12).toBe(0);
    const row = Math.floor(mesh.grid.rows / 2) * segments;
    const radius = (j: number) => Math.hypot(mesh.vertices[(row + j) * 3], mesh.vertices[(row + j) * 3 + 1]);
    for (let j = 0; j < segments / 12; j++) expect(radius(j)).toBeCloseTo(radius(j + (segments / 12) * 11), 9);
  });

  it("stays within the triangles a wall may take, however large the vase and fine the pattern", () => {
    const mesh = buildVase({ height: 400, diameter: 300, effect: "waben", ...patternStarter("waben"), patternCount: 60 } as never) as VaseMesh & { grid: { segments: number; rows: number } };
    expect(2 * mesh.grid.segments * mesh.grid.rows).toBeLessThanOrEqual(700000 * 1.1);
    expect(closed(mesh)).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
  });

  it("leaves facets alone, which are shape and take no pattern", () => {
    const plain = buildVase({ effect: "lowpoly" } as never);
    const second = buildVase({ effect: "lowpoly", effect2: "waben", ...patternStarter("waben", 1) } as never);
    expect(second.triangleCount).toBe(plain.triangleCount);
    expect(Array.from(second.vertices)).toEqual(Array.from(plain.vertices));
  });

  it("starts each pattern with the measures that suit it, for the vase's own pattern and for the second", () => {
    expect(patternStarter("noppen")).toMatchObject({ patternCount: 26, patternWay: "aussen", patternFlank: "gewoelbt" });
    expect(patternStarter("ziegel", 1)).toMatchObject({ pattern2Count: 14, pattern2Way: "innen", pattern2Aspect: 0.5 });
    expect(patternStarter("rillen")).toEqual({});
    expect(patternStarter("keine", 1)).toEqual({});
  });

  it("completes settings from anywhere: an unknown second pattern is none, a band is turned the right way round", () => {
    const p = normalizeParams({ effect: "schuppen", effect2: "rillen", patternFlank: "eckig", patternWay: 3, patternCount: 12.6, patternDepth: 99, zone2From: 80, zone2To: 20 } as never);
    expect(p.effect).toBe("schuppen");
    expect(p.effect2).toBe("keine");
    expect(p.patternFlank).toBe("rund");
    expect(p.patternWay).toBe("innen");
    expect(p.patternCount).toBe(13);
    expect(p.patternDepth).toBe(4);
    expect([p.zone2From, p.zone2To]).toEqual([20, 80]);
  });
});
