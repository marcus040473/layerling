import { describe, expect, it } from "vitest";
import { insideToScreenPositions, makeSurfaceTextureLayout, normalizeSurfaceTexture, surfaceTextureValueAt, SURFACE_TEXTURE_PATTERNS, SURFACE_TEXTURE_TOPO_DEPTH, SURFACE_TEXTURE_TOPO_STYLES } from "@/lib/surfaceTexture";
import { prepareSurfaceBase } from "@/lib/surfaceTextureMesh";
import { SURFACE_TEXTURE_LABELS } from "@/lib/surfaceTextureShape";

/*
 * Topographic (Discussion #1892): the contour lines of a map over rolling land, or the land itself in terraces.
 * Checked on the front of a box and round a cup through the value the texture lays (0 the ground, 1 its full depth).
 */

type Vec3 = [number, number, number];

function box(w: number, h: number, d: number): number[] {
  const p = (x: number, y: number, z: number): Vec3 => [(x - 0.5) * w, y * h, (z - 0.5) * d];
  const quads: Vec3[][] = [
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    [p(1, 0, 0), p(0, 0, 0), p(0, 1, 0), p(1, 1, 0)],
    [p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)],
    [p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)],
    [p(0, 1, 1), p(1, 1, 1), p(1, 1, 0), p(0, 1, 0)],
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
  ];
  return quads.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
}

function cup(radius: number, height: number, segments = 96): number[] {
  const out: number[] = [];
  const at = (r: number, k: number, y: number): Vec3 => [r * Math.cos((2 * Math.PI * k) / segments), y, r * Math.sin((2 * Math.PI * k) / segments)];
  for (let k = 0; k < segments; k += 1) {
    out.push(...at(radius, k, 0), ...at(radius, k, height), ...at(radius, k + 1, height));
    out.push(...at(radius, k, 0), ...at(radius, k + 1, height), ...at(radius, k + 1, 0));
    out.push(...at(0, 0, height), ...at(radius, k + 1, height), ...at(radius, k, height));
    out.push(...at(0, 0, 0), ...at(radius, k, 0), ...at(radius, k + 1, 0));
  }
  return out;
}

/** The values along rows across the front of a 300 mm box (screen frame: its front faces -y), `step` mm apart. */
function frontValues(settings: Record<string, unknown>, step = 0.1) {
  const s = normalizeSurfaceTexture({ pattern: "topographic", ...settings });
  const layout = makeSurfaceTextureLayout(prepareSurfaceBase(insideToScreenPositions(box(300, 300, 300))), s);
  const rows: number[][] = [];
  for (let z = 20; z < 280; z += 12.7) {
    const row: number[] = [];
    for (let x = -140; x <= 140; x += step) row.push(surfaceTextureValueAt(x, -150, z, 0, -1, 0, s, layout));
    rows.push(row);
  }
  return rows;
}

/** How many lines a row crosses: the places where the value leaves the ground. */
const crossings = (row: number[]) => row.filter((value, i) => i > 0 && value > 0 && row[i - 1] === 0).length;

describe("the topographic pattern", () => {
  it("is a pattern of its own with a name, and starts as raised, soft lines about 1.2 mm wide and 4 mm apart", () => {
    expect(SURFACE_TEXTURE_PATTERNS).toContain("topographic");
    expect(normalizeSurfaceTexture({ pattern: "topographic" })).toMatchObject({ topoStyle: "lines", spacing: 4, depth: 0.4, width: 0.3, profile: "round", direction: "outward" });
    expect(SURFACE_TEXTURE_LABELS.pattern.topographic).toBe("surfaceTexture.topographic");
    expect(Object.keys(SURFACE_TEXTURE_LABELS.topoStyle)).toEqual([...SURFACE_TEXTURE_TOPO_STYLES]);
    // What is told stays as told; a style that is not there falls back to lines.
    expect(normalizeSurfaceTexture({ pattern: "topographic", topoStyle: "terraces", depth: 1.6 })).toMatchObject({ topoStyle: "terraces", depth: 1.6 });
    expect(normalizeSurfaceTexture({ pattern: "topographic", topoStyle: "ridges" }).topoStyle).toBe("lines");
    expect(SURFACE_TEXTURE_TOPO_DEPTH).toEqual({ lines: 0.4, terraces: 1.6 });
  });

  it("draws lines about the spacing apart on average, most of the face left as ground between them", () => {
    for (const spacing of [4, 8]) {
      const rows = frontValues({ spacing });
      const values = rows.flat();
      expect(Math.max(...values)).toBeLessThanOrEqual(1);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      // A straight row meets lines lying d apart at every slant every d * pi / 2 on average.
      const met = rows.reduce((sum, row) => sum + crossings(row), 0);
      const apart = ((2 / Math.PI) * rows.length * 280) / met;
      expect(apart).toBeGreaterThan(spacing * 0.8);
      expect(apart).toBeLessThan(spacing * 1.25);
      // About the width's share of the face is line (a little more where two lines run together on level ground).
      const line = values.filter((value) => value > 0).length / values.length;
      expect(line).toBeGreaterThan(0.2);
      expect(line).toBeLessThan(0.45);
    }
  });

  it("keeps a line's width on steep and on gentle ground alike, and makes it wider with the width", () => {
    // The runs of a row inside a line, mm: where the row crosses a line squarely they are the line's width.
    const runs = (width: number) => {
      const out: number[] = [];
      for (const row of frontValues({ width }, 0.05)) {
        let run = 0;
        for (const value of row) {
          if (value > 0) run += 1;
          else if (run) {
            out.push(run * 0.05);
            run = 0;
          }
        }
      }
      return out.sort((a, b) => a - b);
    };
    const narrow = runs(0.3), wide = runs(0.6);
    // The narrowest crossings are the square ones: 0.3 of 4 mm, 1.2 mm, whatever the slope there.
    expect(narrow[Math.floor(narrow.length * 0.1)]).toBeGreaterThan(1.1);
    expect(narrow[Math.floor(narrow.length * 0.1)]).toBeLessThan(1.4);
    expect(wide[Math.floor(wide.length * 0.1)]).toBeGreaterThan(2.2);
  });

  it("has no step anywhere along a line's flanks", () => {
    for (const profile of ["round", "pointed"] as const) {
      for (const row of frontValues({ profile }, 0.02)) {
        for (let i = 1; i < row.length; i += 1) expect(Math.abs(row[i] - row[i - 1])).toBeLessThan(0.12);
      }
    }
  });

  it("builds terraces instead: eight steps of one height, flat between their risers, most levels on the face", () => {
    const values = frontValues({ topoStyle: "terraces", depth: 1.6 }, 0.25).flat();
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    const levels = new Map<number, number>();
    let onLevel = 0;
    for (const value of values) {
      const level = Math.round(value * 8);
      if (Math.abs(value * 8 - level) > 0.02) continue;
      onLevel += 1;
      levels.set(level, (levels.get(level) ?? 0) + 1);
    }
    // Most of the face lies flat on a terrace; the rest is riser.
    expect(onLevel / values.length).toBeGreaterThan(0.6);
    expect([...levels.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // No level is all there is: the lowest and the highest ground take less than a quarter of the face each.
    expect(Math.max(...levels.values()) / values.length).toBeLessThan(0.25);
  });

  it("closes round a cup: the same land at the seam from both sides, lines and terraces", () => {
    for (const topoStyle of SURFACE_TEXTURE_TOPO_STYLES) {
      const s = normalizeSurfaceTexture({ pattern: "topographic", topoStyle, projection: "cylinder" });
      const layout = makeSurfaceTextureLayout(prepareSurfaceBase(insideToScreenPositions(cup(30, 70))), s);
      const at = (angle: number, z: number) => surfaceTextureValueAt(30 * Math.cos(angle), 30 * Math.sin(angle), z, Math.cos(angle), Math.sin(angle), 0, s, layout);
      let lines = 0;
      for (let z = 22; z < 48; z += 0.37) {
        // Whole turns apart, and a hair on either side of the seam (the angle jumps from pi to -pi there).
        expect(at(0.4, z)).toBeCloseTo(at(0.4 + 2 * Math.PI, z), 6);
        expect(Math.abs(at(Math.PI - 1e-4, z) - at(-Math.PI + 1e-4, z))).toBeLessThan(0.02);
        if (at(Math.PI - 1e-4, z) > 0.5) lines += 1;
      }
      // (The seam is not left bare: the pattern runs over it.)
      expect(lines).toBeGreaterThan(0);
    }
  });
});
