import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DxfImportError, sketchProfileFromDxf, type DxfImportResult } from "@/lib/dxfImport";
import { circularArcCenter } from "@/lib/sketchCircularArc";
import type { SketchPoint } from "@/types/layerling";

// The files were written by ezdxf (an independent DXF library), the last one by layerling's own export.
const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures/dxf", name), "utf8");

/** Every closed ring of the sketch as its points, in order. */
function rings(result: DxfImportResult) {
  const byId = new Map(result.profile.points.map((point) => [point.id, point]));
  const groups = new Map<string, SketchPoint[]>();
  result.profile.segments.forEach((segment) => {
    const ring = segment.id.split("-s")[0];
    const list = groups.get(ring) ?? [];
    list.push(byId.get(segment.startId)!);
    groups.set(ring, list);
  });
  return [...groups.values()];
}

function bounds(points: readonly SketchPoint[]) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** The circles the sketch will build: every curve that is a circular arc, by its centre and radius. */
function arcs(result: DxfImportResult) {
  const byId = new Map(result.profile.points.map((point) => [point.id, point]));
  return result.profile.segments.filter((segment) => segment.kind === "bezier").map((segment) => {
    const a = byId.get(segment.startId)!;
    const b = byId.get(segment.endId)!;
    const center = circularArcCenter(a, a.handleOut!, b.handleIn!, b);
    return center ? { center, radius: Math.hypot(a.x - center.x, a.z - center.z) } : null;
  });
}

describe("DXF import (#774): a part outline as a sketch", () => {
  it("joins loose lines and arcs into the plate, its hole and its slot, and leaves the text out", () => {
    const result = sketchProfileFromDxf(fixture("plate-lines-arcs-r12.dxf"));
    expect(result.outlines).toBe(3);
    expect(result.openLeftOut).toBe(0);
    expect(result.skipped).toEqual({ TEXT: 1 });
    // R12 has no unit: read as millimetres, and said so.
    expect(result.unitless).toBe(true);
    expect(result.width).toBeCloseTo(100, 6);
    expect(result.depth).toBeCloseTo(60, 6);
    // Every curve is a true arc the sketch builds as one: corners of 5, the hole of 5, the slot ends of 4.
    const radii = arcs(result).map((arc) => Number(arc!.radius.toFixed(6)));
    expect(new Set(radii)).toEqual(new Set([5, 4]));
  });

  it("reads a polyline's bulges as arcs and an ellipse as its curve", () => {
    const result = sketchProfileFromDxf(fixture("plate-lwpolyline-bulge-ellipse-r2000.dxf"));
    expect(result.outlines).toBe(2);
    expect(result.skipped).toEqual({ MTEXT: 1 });
    expect(result.unitless).toBe(false);
    const [plate, ellipse] = rings(result);
    const plateBox = bounds(plate);
    expect(plateBox.maxX - plateBox.minX).toBeCloseTo(100, 6);
    expect(plateBox.maxZ - plateBox.minZ).toBeCloseTo(60, 6);
    const corners = arcs(result).filter((arc) => arc && Math.abs(arc.radius - 5) < 1e-6);
    expect(corners).toHaveLength(4);
    const ellipseBox = bounds(ellipse);
    expect(ellipseBox.maxX - ellipseBox.minX).toBeCloseTo(20, 6);
    expect(ellipseBox.maxZ - ellipseBox.minZ).toBeCloseTo(10, 6);
  });

  it("converts inches to millimetres", () => {
    const result = sketchProfileFromDxf(fixture("inch-rectangle.dxf"));
    expect(result.unit).toBe("in");
    expect(result.width).toBeCloseTo(50.8, 6);
    expect(result.depth).toBeCloseTo(25.4, 6);
    const hole = arcs(result).find(Boolean)!;
    expect(hole.radius).toBeCloseTo(6.35, 6);
  });

  it("places blocks moved, scaled, turned and in arrays, and leaves a layer that is off out", () => {
    const result = sketchProfileFromDxf(fixture("block-array-layer-off.dxf"));
    // The plate, one hole scaled 1.5 times and a 3 x 2 array of turned holes; not the circle on the hidden layer.
    expect(result.outlines).toBe(8);
    const radii = arcs(result).map((arc) => Number(arc!.radius.toFixed(6)));
    expect(new Set(radii)).toEqual(new Set([3, 2]));
    // The array runs along the turned axes: its last hole 2 x 15 along 30 degrees and 15 across from the first.
    const centres = [...new Set(arcs(result).filter((arc) => Math.abs(arc!.radius - 2) < 1e-6).map((arc) => `${arc!.center.x.toFixed(3)},${arc!.center.z.toFixed(3)}`))];
    expect(centres).toHaveLength(6);
    const angle = Math.PI / 6;
    const far = { x: 30 + 30 * Math.cos(angle) - 15 * Math.sin(angle), y: 10 + 30 * Math.sin(angle) + 15 * Math.cos(angle) };
    // The sketch is centred on the plate (80 x 40) and its y runs to the front.
    expect(centres).toContain(`${(far.x - 40).toFixed(3)},${(20 - far.y).toFixed(3)}`);
  });

  it("turns an arc drawn with its extrusion down the right way, and follows a spline", () => {
    const result = sketchProfileFromDxf(fixture("mirrored-arc-and-spline.dxf"));
    expect(result.outlines).toBe(2);
    const [first, second] = rings(result).map(bounds).sort((a, b) => a.minX - b.minX);
    // The D: the line at x 0 and the arc bulging to the right, to x 10.
    expect(first.maxX - first.minX).toBeCloseTo(10, 6);
    expect(second.minX - first.minX).toBeCloseTo(40, 6);
  });

  it("reads back what the DXF export writes, at the same size and in the same place", () => {
    const result = sketchProfileFromDxf(fixture("layerling-export-text.dxf"));
    // The plate, four holes, the slot and the seven outlines of the letters LASER.
    expect(result.outlines).toBe(13);
    // The letters' arcs keep their curve, which reaches up to a hundredth past the corners the editor measured.
    expect(Math.abs(result.width - 100)).toBeLessThan(0.02);
    expect(Math.abs(result.depth - 97.5)).toBeLessThan(0.02);
    // The large hole sits front left of the plate's middle, as designed: 38 left, 0.75 behind the middle of the drawing.
    const large = arcs(result).find((arc) => arc && Math.abs(arc.radius - 5.001) < 1e-3)!;
    expect(Math.abs(large.center.x + 38)).toBeLessThan(0.02);
    expect(Math.abs(large.center.z + 0.75)).toBeLessThan(0.02);
  });

  it("takes the drawing apart into solids and loose holes, round ones as cylinders", () => {
    const plate = sketchProfileFromDxf(fixture("plate-lines-arcs-r12.dxf")).parts;
    // The plate on its own, the slot a hole of its own, the round hole a cylinder of 10 at its place.
    expect(plate.solids).toHaveLength(1);
    expect(plate.holes).toHaveLength(1);
    expect(plate.roundHoles).toHaveLength(1);
    expect(plate.roundHoles[0].diameter).toBeCloseTo(10, 6);
    expect(plate.roundHoles[0].x).toBeCloseTo(-30, 6);
    expect(plate.roundHoles[0].z).toBeCloseTo(0, 6);
    // The solid keeps only its outer outline.
    expect(plate.solids[0].segments.every((segment) => segment.id.startsWith(plate.solids[0].segments[0].id.split("-s")[0]))).toBe(true);
    // An ellipse is no circle: a hole of its own.
    const ellipse = sketchProfileFromDxf(fixture("plate-lwpolyline-bulge-ellipse-r2000.dxf")).parts;
    expect([ellipse.solids.length, ellipse.holes.length, ellipse.roundHoles.length]).toEqual([1, 1, 0]);
    // The array of turned holes: seven cylinders, the scaled one 6 across.
    const array = sketchProfileFromDxf(fixture("block-array-layer-off.dxf")).parts;
    expect(array.roundHoles.map((hole) => Number(hole.diameter.toFixed(6))).sort()).toEqual([4, 4, 4, 4, 4, 4, 6]);
    // The plate and the five letters, the slot and the holes in A and R loose, the four round holes cylinders.
    const text = sketchProfileFromDxf(fixture("layerling-export-text.dxf")).parts;
    expect([text.solids.length, text.holes.length, text.roundHoles.length]).toEqual([6, 3, 4]);
  });

  it("leaves a hole with a part inside it in the solid's sketch", () => {
    // A square plate with a square cut-out, and a disc lying in the cut-out: a loose hole would cut the disc too.
    const square = (size: number, layer = "0") => {
      const h = size / 2;
      return ["  0", "LWPOLYLINE", "  8", layer, " 90", "4", " 70", "1", ...[[-h, -h], [h, -h], [h, h], [-h, h]].flatMap(([x, y]) => [" 10", String(x), " 20", String(y)])];
    };
    const text = ["  0", "SECTION", "  2", "ENTITIES", ...square(100), ...square(50), "  0", "CIRCLE", "  8", "0", " 10", "0", " 20", "0", " 40", "10", "  0", "ENDSEC", "  0", "EOF", ""].join("\n");
    const parts = sketchProfileFromDxf(text).parts;
    expect(parts.holes).toHaveLength(0);
    expect(parts.roundHoles).toHaveLength(0);
    // The plate with its cut-out, and the disc.
    expect(parts.solids.map((solid) => solid.segments.length).sort()).toEqual([4, 8]);
  });

  it("drops a step shorter than the join tolerance instead of failing on it (a QR code's 0.008 mm steps)", () => {
    // Two QR modules touching at a corner, as layerling's own DXF export writes them: their outline steps 0.008 mm
    // round the corner where they meet. Once the ends are joined, those steps had no length left, and the CAD
    // kernel cannot build an edge of no length, so the whole import failed.
    const lines: Array<[[number, number], [number, number]]> = [
      [[1.56, 2.34], [0.78, 2.34]], [[0.78, 2.34], [0.78, 0.787796]], [[0.78, 0.787796], [0.772198, 0.787796]],
      [[0.772198, 0.787796], [0.772198, 0.779998]], [[0.772198, 0.779998], [0, 0.779998]], [[0, 0.779998], [0, 0]],
      [[0, 0], [0.78, 0]], [[0.78, 0], [0.78, 0.772194]], [[0.78, 0.772194], [0.7878, 0.772194]],
      [[0.7878, 0.772194], [0.7878, 0.779998]], [[0.7878, 0.779998], [1.56, 0.779998]], [[1.56, 0.779998], [1.56, 2.34]],
    ];
    const entities = lines.map(([a, b]) => `0\nLINE\n8\n0\n10\n${a[0]}\n20\n${a[1]}\n11\n${b[0]}\n21\n${b[1]}\n`).join("");
    const result = sketchProfileFromDxf(`0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`);
    const byId = new Map(result.profile.points.map((point) => [point.id, point]));
    const lengths = result.profile.segments.map((segment) => {
      const a = byId.get(segment.startId)!;
      const b = byId.get(segment.endId)!;
      return Math.hypot(a.x - b.x, a.z - b.z);
    });
    expect(lengths.length).toBeGreaterThan(0);
    expect(Math.min(...lengths)).toBeGreaterThan(1e-6);
    expect(result.width).toBeCloseTo(1.56, 3);
  });

  it("does not make an outline of a few pieces shorter than the join tolerance between two curves", () => {
    // A square whose top side ends in three 0.005 mm lines, as an exported curve can: they are within the join
    // tolerance of each other, so a ring started at them closed on itself with no size, and the import failed.
    const line = (a: [number, number], b: [number, number]) => `0\nLINE\n8\n0\n10\n${a[0]}\n20\n${a[1]}\n11\n${b[0]}\n21\n${b[1]}\n`;
    const entities = [
      line([0.005, 10], [0.01, 10.002]), line([0.01, 10.002], [0.015, 10.001]), line([0.015, 10.001], [0.02, 10]),
      line([0.02, 10], [10, 10]), line([10, 10], [10, 0]), line([10, 0], [0, 0]), line([0, 0], [0, 10]), line([0, 10], [0.005, 10]),
    ].join("");
    const result = sketchProfileFromDxf(`0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`);
    expect(result.outlines).toBe(1);
    expect(result.width).toBeCloseTo(10, 2);
  });

  it("says why a file cannot be read", () => {
    expect(() => sketchProfileFromDxf("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(DxfImportError);
    expect(() => sketchProfileFromDxf("  0\nSECTION\n  2\nENTITIES\n  0\nTEXT\n  1\nhello\n  0\nENDSEC\n  0\nEOF\n")).toThrow(/no closed outline/);
    expect(() => sketchProfileFromDxf("not a dxf\nat all\n")).toThrow(DxfImportError);
  });
});
