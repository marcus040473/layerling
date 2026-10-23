import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { cadHasSolidBody } from "@/lib/cadSolidBody";

// A fillet whose radius grows along one edge (#687), as the edge tool's "Variable radius" asks the kernel for it.
describe("a variable fillet along one edge (#687)", () => {
  let cad: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    cad = await OcctKernel.init({ wasm });
  });

  const ends = (edge: ShapeHandle) => cad.getSubShapes(edge, "vertex").map((vertex) => cad.vertexPosition(vertex));

  // A prism 40 mm high whose outline has a corner of 80 degrees, as in the report: a straight wall meeting a slanted one.
  const prism = () => {
    const tilt = (80 * Math.PI) / 180;
    const outline = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, { x: 30 + 25 * Math.cos(tilt), y: 25 * Math.sin(tilt), z: 0 }, { x: 0, y: 25, z: 0 }];
    const wire = cad.makeWire(outline.map((point, index) => cad.makeLineEdge(point, outline[(index + 1) % outline.length])));
    const body = cad.extrude(cad.makeFace(wire), 0, 0, 40);
    const corner = cad.getSubShapes(body, "edge").find((edge) => ends(edge).every((point) => Math.abs(point.x - 30) < 1e-6 && Math.abs(point.y) < 1e-6));
    if (!corner) throw new Error("no corner edge");
    return { body, corner };
  };

  it("rounds the 80 degree corner from 1 mm at one end to 8 mm at the other, between the two even fillets", () => {
    const { body, corner } = prism();
    const volume = cad.getVolume(body);
    const variable = cad.filletVariable(body, corner, 1, 8);
    expect(cad.isValid(variable)).toBe(true);
    expect(cadHasSolidBody(cad, variable)).toBe(true);
    const removed = volume - cad.getVolume(variable);
    const small = volume - cad.getVolume(cad.fillet(body, [corner], 1));
    const large = volume - cad.getVolume(cad.fillet(body, [corner], 8));
    expect(removed).toBeGreaterThan(small * 2);
    expect(removed).toBeLessThan(large * 0.8);
  });

  it("puts the start radius at the edge's first vertex: swapping the values swaps the ends", () => {
    const { body, corner } = prism();
    const [first] = ends(corner);
    const growing = cad.filletVariable(body, corner, 1, 8);
    const shrinking = cad.filletVariable(body, corner, 8, 1);
    // Near the first vertex the small radius leaves more of the corner standing than the large one.
    const nearFirst = (solid: ShapeHandle) => {
      const slab = cad.makeBoxFromCorners({ x: 20, y: -5, z: first.z < 20 ? 0 : 36 }, { x: 40, y: 10, z: first.z < 20 ? 4 : 40 });
      return cad.getVolume(cad.intersect(solid, slab));
    };
    expect(nearFirst(growing)).toBeGreaterThan(nearFirst(shrinking));
  });
});
