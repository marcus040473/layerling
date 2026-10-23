import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";
import { cadMeshHasOpenEdges, meshTreatedBody } from "@/lib/cadMeshAccuracy";

// The block of #651 after its third 1 mm fillet round a pocket: a valid body whose mesh had 30 open edges.
const GAPPED = readFileSync("tests/fixtures/pocket-fillet-gap-651.brep", "utf8");
const DEFLECTION = { linear: 0.05, angular: 0.16 };

describe("a filleted body whose mesh came out with gaps (#651)", () => {
  let cad: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    cad = await OcctKernel.init({ wasm });
  });

  it("had an open mesh as it was", () => {
    const body = cad.fromBREP(GAPPED);
    expect(cad.isValid(body)).toBe(true);
    expect(cadMeshHasOpenEdges(cad.tessellate(body, { linearDeflection: DEFLECTION.linear, angularDeflection: DEFLECTION.angular }))).toBe(true);
    cad.release(body);
  });

  it("is meshed closed, with the same volume", () => {
    const body = cad.fromBREP(GAPPED);
    const volume = cad.getVolume(body);
    const meshed = meshTreatedBody(cad, [body], body, DEFLECTION, DEFLECTION);
    expect(cadMeshHasOpenEdges(meshed.mesh)).toBe(false);
    expect(cad.getVolume(meshed.result)).toBeCloseTo(volume, 3);
    expect(cad.getSubShapes(meshed.result, "face")).toHaveLength(62);
  });

  it("leaves a body with a closed mesh as it is", () => {
    const box = cad.makeBox(20, 10, 5);
    const edges = cad.getSubShapes(box, "edge");
    const filleted = cad.fillet(box, edges.slice(0, 4), 1);
    const meshed = meshTreatedBody(cad, [filleted], filleted, DEFLECTION, DEFLECTION);
    expect(meshed.result).toBe(filleted);
    expect(cadMeshHasOpenEdges(meshed.mesh)).toBe(false);
  });
});
