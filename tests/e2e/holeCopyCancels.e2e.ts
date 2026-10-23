import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { buildGroupedShapeFromSelection, exportSolidVolume } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";

/**
 * A copy of an imported part set to hole takes the part away entirely (#607). The hole used to be made a
 * thousandth wider by scaling it round its middle; on a wide sign that pushed both walls of a letter far from the
 * middle the same way, and one wall of the part stayed standing as a thin strip.
 */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));

beforeAll(async () => {
  kernel.runtime = manifoldModule().then((runtime) => {
    runtime.setup();
    rememberManifoldRuntime(runtime);
    return runtime;
  });
  await kernel.runtime;
});

// A box from (x0, y0, z0) to (x1, y1, z1) as 12 triangles, wound outward.
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): number[][][] {
  const v = (x: number, y: number, z: number) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [[a, c, b], [a, d, c]];
  return [
    ...quad(v(0, 0, 0), v(0, 0, 1), v(1, 0, 1), v(1, 0, 0)),
    ...quad(v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0)),
    ...quad(v(1, 1, 0), v(1, 1, 1), v(0, 1, 1), v(0, 1, 0)),
    ...quad(v(0, 1, 0), v(0, 1, 1), v(0, 0, 1), v(0, 0, 0)),
    ...quad(v(0, 0, 1), v(0, 1, 1), v(1, 1, 1), v(1, 0, 1)),
    ...quad(v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)),
  ];
}

/** Three strips 2 mm wide on a sign 1204 mm long, like the letters of an imported SVG: 3 x 2 x 10 x 4 mm. */
const SIGN_VOLUME = 3 * 2 * 10 * 4;

function sign(id: string, hole: boolean, elevation: number, height: number): WorkplaneShape {
  const triangles = [-602, -1, 600].flatMap((x) => box(x, x + 2, 0, 4, -5, 5));
  return {
    id,
    name: "Sign",
    kind: "mesh",
    color: "#0098c7",
    x: 0,
    z: 0,
    elevation,
    size: 1204,
    width: 1204,
    depth: 10,
    height,
    rotation: 0,
    hole,
    importedMesh: { positions: triangles.flat(2), baseWidth: 1204, baseDepth: 10, baseHeight: 4, triangleCount: triangles.length, sourceFormat: "svg" },
  } as unknown as WorkplaneShape;
}

describe("a copy of an imported part set to hole", () => {
  it("is a closed sign of three strips on its own", async () => {
    const { volumeMm3 } = await exportSolidVolume([sign("sign", false, 0, 4)]);
    expect(Math.abs(volumeMm3 - SIGN_VOLUME)).toBeLessThan(0.01);
  });

  it.each([
    ["the same size", 0, 4],
    ["taller", -0.5, 5],
  ])("takes the whole part away when it has %s", async (_label, elevation, height) => {
    const result = await buildGroupedShapeFromSelection([sign("sign", false, 0, 4), sign("copy", true, elevation, height)], 100_000);
    // With the old padding 24 triangles of wall stayed standing at the outer strips.
    expect(result.consumed).toBe(true);
    expect(result.group).toBeNull();
  });
});
