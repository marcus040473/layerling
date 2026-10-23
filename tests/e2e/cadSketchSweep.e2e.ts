import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";
import { buildSweptSketchSolid } from "@/lib/cadSketchSweep";
import type { SketchPoint, SketchProfile } from "@/types/layerling";

/*
 * A sketch swept along its construction line (#400), against the real kernel: the closed outlines
 * are the cross-section, drawn as seen along the path, the construction chain is the path.
 */

type Pt = [number, number];

let counter = 0;

/** A closed outline of straight lines. */
function outline(coordinates: Pt[]) {
  const points: SketchPoint[] = coordinates.map(([x, z], index) => ({ id: `o${counter}-${index}`, x, z }));
  counter += 1;
  return {
    points,
    segments: points.map((point, index) => ({ id: `${point.id}-s`, kind: "line" as const, startId: point.id, endId: points[(index + 1) % points.length].id })),
  };
}

/** A chain of construction lines through these points; closed joins the last one to the first. */
function path(coordinates: Pt[], closed = false) {
  const points: SketchPoint[] = coordinates.map(([x, z], index) => ({ id: `c${counter}-${index}`, x, z }));
  counter += 1;
  const count = closed ? points.length : points.length - 1;
  return {
    points,
    segments: Array.from({ length: count }, (_, index) => ({
      id: `${points[index].id}-s`,
      kind: "line" as const,
      construction: true,
      startId: points[index].id,
      endId: points[(index + 1) % points.length].id,
    })),
  };
}

function sketch(...parts: Array<{ points: SketchPoint[]; segments: SketchProfile["segments"] }>): SketchProfile {
  return { points: parts.flatMap((part) => part.points), segments: parts.flatMap((part) => part.segments), images: [] };
}

describe("a sketch swept along its path, with the real OCCT kernel", () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    kernel = await OcctKernel.init({ wasm });
  });

  // 10 wide, 6 high, drawn left of the path's start: x across, the smallest z on top.
  const section = () => outline([[-25, 0], [-15, 0], [-15, 6], [-25, 6]]);

  it("pulls the cross-section along a straight path, standing on the sketch plane", () => {
    // The path runs right from (0, 0); the section stands at its left end.
    const solid = buildSweptSketchSolid(kernel, sketch(outline([[-5, 0], [5, 0], [5, 6], [-5, 6]]), path([[-30, 0], [30, 0]])));
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(10 * 6 * 60, 1);
    const bounds = kernel.getBoundingBox(solid, false);
    expect(bounds.xmax - bounds.xmin).toBeCloseTo(60, 3);
    expect(bounds.zmax - bounds.zmin).toBeCloseTo(10, 3);
    expect(bounds.ymin).toBeCloseTo(0, 3);
    expect(bounds.ymax).toBeCloseTo(6, 3);
  });

  it("puts the left or right edge of the section on the path when the sketch says so (#732)", () => {
    // The path runs right along z = 0 and the section is drawn at its start, so looking along it the sketch's right is towards +z.
    const body = (sweepAnchor?: "left" | "center" | "right") => {
      const solid = buildSweptSketchSolid(kernel, { ...sketch(outline([[-35, 0], [-25, 0], [-25, 6], [-35, 6]]), path([[-30, 0], [30, 0]])), ...(sweepAnchor ? { sweepAnchor } : {}) });
      expect(kernel.isValid(solid)).toBe(true);
      expect(kernel.getVolume(solid)).toBeCloseTo(10 * 6 * 60, 1);
      return kernel.getBoundingBox(solid, false);
    };
    const centred = body("center");
    expect(centred.zmin).toBeCloseTo(-5, 3);
    expect(centred.zmax).toBeCloseTo(5, 3);
    const left = body("left");
    expect(left.zmin).toBeCloseTo(0, 3);
    expect(left.zmax).toBeCloseTo(10, 3);
    const right = body("right");
    expect(right.zmin).toBeCloseTo(-10, 3);
    expect(right.zmax).toBeCloseTo(0, 3);
    // Left out is the middle, as before.
    expect(body().zmin).toBeCloseTo(-5, 3);
  });

  it("turns a corner as a mitre, and the volume is the section times the length of the path", () => {
    const solid = buildSweptSketchSolid(kernel, sketch(section(), path([[-20, 0], [20, 0], [20, 30]])));
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(60 * (40 + 30), 1);
    expect(kernel.subShapeCount(solid, "face")).toBe(10);
  });

  it("starts at the end of the path the cross-section is drawn near", () => {
    // Drawn near the right end, the section is seen looking the other way: the body is the same size.
    const near = sketch(outline([[15, 0], [25, 0], [25, 6], [15, 6]]), path([[-20, 0], [20, 0], [20, 30]]));
    const solid = buildSweptSketchSolid(kernel, near);
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(60 * 70, 1);
  });

  it("follows a curved path", () => {
    const profile = sketch(section(), path([[-20, 0], [20, 0]]));
    // Bend the single construction line into a curve with handles.
    const curved: SketchProfile = {
      ...profile,
      points: profile.points.map((point) => point.id.endsWith("-0") && point.id.startsWith("c") ? { ...point, handleOut: { x: 0, z: 0 } } : point.id.startsWith("c") ? { ...point, handleIn: { x: 0, z: 30 } } : point),
      segments: profile.segments.map((segment) => segment.construction ? { ...segment, kind: "bezier" as const } : segment),
    };
    const solid = buildSweptSketchSolid(kernel, curved);
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeGreaterThan(60 * 40);
  });

  it("sweeps along a closed path, a hexagon ring", () => {
    const radius = 20;
    const hexagon: Pt[] = Array.from({ length: 6 }, (_, index) => [radius * Math.cos((index * Math.PI) / 3), radius * Math.sin((index * Math.PI) / 3)]);
    // The cross-section is drawn beside the first corner (20, 0).
    const solid = buildSweptSketchSolid(kernel, sketch(outline([[22, 0], [28, 0], [28, 6], [22, 6]]), path(hexagon, true)));
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo(6 * 6 * (6 * radius), 1);
  });

  it("makes a hollow section hollow", () => {
    const outer = outline([[-5, 0], [5, 0], [5, 10], [-5, 10]]);
    const hole = outline([[-3, 2], [3, 2], [3, 8], [-3, 8]]);
    const solid = buildSweptSketchSolid(kernel, sketch(outer, hole, path([[-30, 5], [30, 5]])));
    expect(kernel.isValid(solid)).toBe(true);
    expect(kernel.getVolume(solid)).toBeCloseTo((10 * 10 - 6 * 6) * 60, 1);
  });

  it("says what is missing", () => {
    expect(() => buildSweptSketchSolid(kernel, sketch(section()))).toThrow("sweep:no-path");
    expect(() => buildSweptSketchSolid(kernel, sketch(path([[0, 0], [10, 0]])))).toThrow("sweep:no-profile");
    expect(() => buildSweptSketchSolid(kernel, sketch(section(), path([[-20, 0], [0, 0]]), path([[-20, 30], [0, 30]])))).toThrow("sweep:many-paths");
  });
});
