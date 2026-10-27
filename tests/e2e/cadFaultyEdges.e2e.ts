import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctError, OcctKernel, type OcctModuleFactory, type ShapeHandle } from "occt-wasm";
import { cadFaultyEdgeIds } from "@/lib/cadFaultyEdges";

// On a 20 x 20 x 2 plate a 3 mm round fits a corner edge (its faces are 20 wide) but not a top edge (its side face is 2 tall).
describe("the edges a refused fillet or chamfer names", () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    // As the CAD workers start it: the Emscripten glue loaded on its own, then handed to the kernel.
    const dist = dirname(fileURLToPath(import.meta.resolve("occt-wasm")));
    const createModule = ((await import(join(dist, "occt-wasm.js"))) as { default: OcctModuleFactory }).default;
    kernel = await OcctKernel.init({ createModule, wasm: join(dist, "occt-wasm.wasm") });
  });

  function plate() {
    const body = kernel.makeBox(20, 20, 2);
    const edges = kernel.getSubShapes(body, "edge");
    const span = (edge: ShapeHandle) => kernel.getBoundingBox(edge);
    const corner = edges.find((edge) => span(edge).zmax - span(edge).zmin > 1);
    const top = edges.find((edge) => span(edge).zmax - span(edge).zmin < 1e-6 && Math.abs(span(edge).zmin - 2) < 1e-6);
    if (corner === undefined || top === undefined) throw new Error("plate edges not found");
    return { body, entries: [{ id: 4, edge: corner }, { id: 7, edge: top }] };
  }

  function refusal(run: () => unknown) {
    try {
      run();
    } catch (error) {
      return error;
    }
    throw new Error("expected the kernel to refuse");
  }

  it("a fillet names the top edge, not the corner", () => {
    const { body, entries } = plate();
    expect(() => kernel.fillet(body, [entries[0].edge], 3)).not.toThrow();
    const error = refusal(() => kernel.fillet(body, entries.map((entry) => entry.edge), 3));
    expect(cadFaultyEdgeIds(error, entries)).toEqual([7]);
  });

  it("a chamfer names the top edge, not the corner", () => {
    const { body, entries } = plate();
    const error = refusal(() => kernel.chamfer(body, entries.map((entry) => entry.edge), 3));
    expect(cadFaultyEdgeIds(error, entries)).toEqual([7]);
  });

  it("names nothing for an error without edges or with edges outside the selection", () => {
    const { entries } = plate();
    expect(cadFaultyEdgeIds(new Error("fillet: failed"), entries)).toEqual([]);
    expect(cadFaultyEdgeIds(new OcctError("fillet", "failed"), entries)).toEqual([]);
    expect(cadFaultyEdgeIds(new OcctError("fillet", "failed [faulty edges: 999999]"), entries)).toEqual([]);
  });
});
