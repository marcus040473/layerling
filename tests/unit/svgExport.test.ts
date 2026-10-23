import manifoldModule, { type Manifold, type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { DrawingTooComplexError, MAX_DRAWING_EDGES, type DrawingMesh, type DrawingPoint3 } from "@/lib/drawingProjection";
import { toSvgProjection, toSvgTopEdges } from "@/lib/svgExport";

describe("SVG projection export", () => {
  it("writes an SVG 1.1 document with millimeter dimensions and even-odd contours", () => {
    const svg = toSvgProjection([
      {
        name: "Plate & ring",
        color: "#d41721",
        polygons: [
          [[-5, -3], [5, -3], [5, 3], [-5, 3]],
          [[-2, -1], [-2, 1], [2, 1], [2, -1]],
        ],
      },
    ], "Fixture <top>");

    expect(svg).toContain('version="1.1"');
    expect(svg).toContain('width="10mm" height="6mm" viewBox="-5 -3 10 6"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('data-name="Plate &amp; ring"');
    expect(svg).toContain("<title>Fixture &lt;top&gt;</title>");
    expect(svg.match(/M/g)).toHaveLength(2);
  });

  it("rejects empty and zero-area projections", () => {
    expect(() => toSvgProjection([])).toThrow(/no readable contours/i);
    expect(() => toSvgProjection([{ name: "Line", color: "bad", polygons: [[[0, 0], [1, 0], [2, 0]]] }])).toThrow(/visible area/i);
  });
});

describe("SVG top view of the visible edges", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  /** A box in the editor's axes (y up), from x0/z0 to x1/z1, between the heights y0 and y1. */
  const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) =>
    runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const bore = (x: number, z: number, radius: number) =>
    runtime.Manifold.cylinder(10, radius, radius, 48).rotate([-90, 0, 0]).translate([x, -2, z]);
  const meshOf = (solid: Manifold): DrawingMesh => {
    const mesh = solid.getMesh();
    return {
      vertices: Array.from({ length: mesh.numVert }, (_, vertex): DrawingPoint3 => {
        const at = vertex * mesh.numProp;
        return [mesh.vertProperties[at]!, mesh.vertProperties[at + 1]!, mesh.vertProperties[at + 2]!];
      }),
      faces: Array.from({ length: mesh.triVerts.length / 3 }, (_, face): [number, number, number] => [mesh.triVerts[face * 3]!, mesh.triVerts[face * 3 + 1]!, mesh.triVerts[face * 3 + 2]!]),
    };
  };
  /** The name tag: a plate with a bore and a pocket at the front, and a blue block standing on it. */
  const nameTag = () => [
    { name: "Plate", color: "#c8a165", mesh: meshOf(box(-40, -20, 40, 20, 0, 3).subtract(bore(-32, 0, 2.5)).subtract(box(-5, 14, 5, 18, 2, 4))) },
    { name: "Block", color: "#2266aa", mesh: meshOf(box(-20, -6, 16, 6, 3, 3.5)) },
  ];
  const pathOf = (svg: string, name: string) => svg.match(new RegExp(`<path data-name="${name}"[^>]*>`))![0];
  const loopsOf = (path: string) => path.match(/ d="([^"]*)"/)![1]!.split("M").filter(Boolean);

  it("keeps the size and place of the silhouette export, in millimetres", () => {
    const svg = toSvgTopEdges(nameTag(), "Name tag");
    expect(svg).toContain('version="1.1"');
    expect(svg).toContain('width="80mm" height="40mm" viewBox="-40 -20 80 40"');
    expect(svg).toContain("<title>Name tag</title>");
  });

  it("draws each body's visible edges as an unfilled line in its colour", () => {
    const svg = toSvgTopEdges(nameTag());
    const plate = pathOf(svg, "Plate");
    const block = pathOf(svg, "Block");
    expect(plate).toContain('stroke="#c8a165" stroke-width="0.1"');
    expect(block).toContain('stroke="#2266aa"');
    // Filled in a laser program, a body's areas keep out what lies inside them, as in the silhouette export.
    for (const path of [plate, block]) expect(path).toContain('fill="none" fill-rule="evenodd"');
  });

  it("shows the bore and the pocket inside the outline, where a silhouette only has the bore", () => {
    const svg = toSvgTopEdges(nameTag());
    const plate = loopsOf(pathOf(svg, "Plate"));
    // Outline, bore, pocket and the block standing on it, each a closed loop.
    expect(plate).toHaveLength(4);
    expect(plate.every((loop) => loop.trim().endsWith("Z"))).toBe(true);
    expect(loopsOf(pathOf(svg, "Block"))).toHaveLength(1);
  });

  it("gives a line where two bodies meet to both, so each one's areas stay closed", () => {
    const svg = toSvgTopEdges(nameTag());
    const block = "M-20 -6 L16 -6 L16 6 L-20 6 Z";
    const corners = (path: string) => loopsOf(path).map((loop) => [...loop.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => `${match[1]},${match[2]}`).sort().join(" "));
    const blockCorners = corners(` d="${block}"`)[0];
    expect(corners(pathOf(svg, "Plate"))).toContain(blockCorners);
    expect(corners(pathOf(svg, "Block"))).toContain(blockCorners);
  });

  it("puts the front of the design at the bottom of the page, as the silhouette does", () => {
    const pocket = loopsOf(pathOf(toSvgTopEdges(nameTag()), "Plate"))
      .map((loop) => [...loop.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])] as const))
      .find((points) => points.every(([x]) => Math.abs(x) <= 5 + 1e-6))!;
    expect(Math.min(...pocket.map(([, y]) => y))).toBeCloseTo(14, 6);
    expect(Math.max(...pocket.map(([, y]) => y))).toBeCloseTo(18, 6);
  });

  it("leaves out what another body hides", () => {
    // A bar of the plate's height under a wider lid: from above only the lid shows.
    const svg = toSvgTopEdges([
      { name: "Bar", color: "#ff0000", mesh: meshOf(box(-5, -5, 5, 5, 0, 3)) },
      { name: "Lid", color: "#0000ff", mesh: meshOf(box(-10, -10, 10, 10, 3, 4)) },
    ]);
    expect(svg).not.toContain('data-name="Bar"');
    expect(loopsOf(pathOf(svg, "Lid"))).toHaveLength(1);
  });

  it("draws the line where a slanting part comes out of another, closed for both bodies", () => {
    // A bar tilted 30 degrees, rising out of the cube's top: as the export hands them over, the bar is taken
    // out of the cube, so the cube's top carries the line where the bar comes out, at x = 11.
    const bar = box(-15, -2, 15, 2, -2, 2).rotate([0, 0, 30]).translate([15, 20, 0]);
    const svg = toSvgTopEdges([
      { name: "Cube", color: "#d41721", mesh: meshOf(box(0, -10, 20, 10, 0, 20).subtract(bar)) },
      { name: "Bar", color: "#0098c7", mesh: meshOf(bar) },
    ]);
    // Each body's area seen from above has a closed outline running along that line; the bar's crease
    // between its slanted top and its end is a line inside its outline.
    for (const name of ["Cube", "Bar"]) {
      const outline = loopsOf(pathOf(svg, name)).filter((loop) => loop.trim().endsWith("Z"));
      expect(outline).toHaveLength(1);
      expect(outline[0]).toMatch(/(?<![\d.])11 -2(?![\d.])/);
      expect(outline[0]).toMatch(/(?<![\d.-])11 2(?![\d.])/);
    }
    expect(loopsOf(pathOf(svg, "Cube")).every((loop) => loop.trim().endsWith("Z"))).toBe(true);
    // The bar's edges start where it comes out, not inside the cube; a drawing would be a few tenths off here.
    const barX = loopsOf(pathOf(svg, "Bar")).flatMap((loop) => [...loop.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[1])));
    expect(Math.min(...barX)).toBeCloseTo(11, 3);
  });

  it("draws the outline of a rounded top where it meets the wall below it", () => {
    // An arch: a block with a half-round top along its length. Its top runs smoothly into both side walls, so
    // there is no sharp edge at x = -5 and x = 5 - but from above that is where the arch ends.
    const arch = box(-5, -10, 5, 10, 0, 5).add(runtime.Manifold.cylinder(20, 5, 5, 48).translate([0, 5, -10]));
    const loops = loopsOf(pathOf(toSvgTopEdges([{ name: "Arch", color: "#d41721", mesh: meshOf(arch) }]), "Arch"));
    expect(loops).toHaveLength(1);
    expect(loops[0]!.trim()).toMatch(/Z$/);
    const corners = [...loops[0]!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => `${match[1]},${match[2]}`).sort();
    expect(corners).toEqual(["-5,-10", "-5,10", "5,-10", "5,10"]);
  });

  it("keeps an outline closed at the tip of a sharp notch in a body above it", () => {
    // A block with a narrow V cut into its back edge, just above a plate - as a name tag's letters lie on their
    // backing: in the notch the plate shows, and its outline runs into the tip, where a look beside the line
    // lands on the block across the notch.
    const notched = new runtime.CrossSection([[[-10, -5], [10, -5], [10, 5], [1, 5], [0, 0], [-1, 5], [-10, 5]]])
      .extrude(1).rotate([-90, 0, 0]).translate([0, 2.5, 0]);
    const svg = toSvgTopEdges([
      { name: "Plate", color: "#2b2b2b", mesh: meshOf(box(-20, -10, 20, 10, 0, 2)) },
      { name: "Block", color: "#d41721", mesh: meshOf(notched) },
    ]);
    for (const name of ["Plate", "Block"]) {
      const loops = loopsOf(pathOf(svg, name));
      expect(loops.length).toBeGreaterThan(0);
      expect(loops.every((loop) => loop.trim().endsWith("Z"))).toBe(true);
    }
  });

  it("says a design is too complex for the view, so the export can fall back on the silhouette", () => {
    // Boxes of 1 mm side by side: twelve sharp edges each, more than the projection takes.
    const vertices: DrawingPoint3[] = [];
    const faces: [number, number, number][] = [];
    const corners: DrawingPoint3[] = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
    const sides: [number, number, number][] = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6], [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4]];
    for (let box = 0; box * 12 <= MAX_DRAWING_EDGES; box += 1) {
      const start = vertices.length;
      corners.forEach(([x, y, z]) => vertices.push([x + (box % 40) * 2, y, z + Math.floor(box / 40) * 2]));
      sides.forEach(([a, b, c]) => faces.push([start + a, start + b, start + c]));
    }
    expect(() => toSvgTopEdges([{ name: "Boxes", color: "#ff0000", mesh: { vertices, faces } }])).toThrow(DrawingTooComplexError);
  });

  it("rejects a design with nothing to see", () => {
    expect(() => toSvgTopEdges([])).toThrow();
  });
});
