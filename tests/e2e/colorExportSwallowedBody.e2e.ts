import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { colorSeparatedExportMeshes } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { closedMeshVolume } from "@/lib/cadProfileExtrusion";

/**
 * Colours are bodies of their own in a 3MF, and where two colours overlap the later shape wins and cuts its place out
 * of the earlier one (Discussion #79). An earlier body that lies entirely inside a later one of another colour was cut
 * to nothing and vanished from the file without a word (#906: a text inside a plate). It stays whole now, and the
 * later body takes its pocket.
 */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));
beforeAll(async () => {
  kernel.runtime = manifoldModule().then((runtime) => { runtime.setup(); rememberManifoldRuntime(runtime); return runtime; });
  await kernel.runtime;
});

const box = (id: string, color: string, x: number, size: number, height: number): WorkplaneShape => (
  { id, name: id, kind: "box", color, x, z: 0, elevation: 0, rotation: 0, width: size, depth: size, size, height, locked: false, hidden: false } as WorkplaneShape
);
const volumeOf = (mesh: { vertices: [number, number, number][]; faces: [number, number, number][] }) => Math.abs(closedMeshVolume(mesh.vertices, mesh.faces));

async function separate(shapes: WorkplaneShape[]) {
  const meshes = shapes.map(meshForShape);
  const result = await colorSeparatedExportMeshes(shapes, meshes, shapes.map(() => false));
  return result.meshes.map((mesh, index) => ({ name: shapes[result.quellen[index]].name, volume: volumeOf(mesh) }));
}

describe("a body inside a body of another colour in the colour-separated export", () => {
  const PLATE = 40 * 40 * 10;
  const INSET = 10 * 10 * 4;

  it("keeps an earlier body that lies entirely inside a later one, and the later one takes its pocket", async () => {
    const bodies = await separate([box("inset", "#ffffff", 0, 10, 4), box("plate", "#cf101b", 0, 40, 10)]);
    expect(bodies.map((body) => body.name).sort()).toEqual(["inset", "plate"]);
    expect(bodies.find((body) => body.name === "inset")!.volume).toBeCloseTo(INSET, 3);
    expect(bodies.find((body) => body.name === "plate")!.volume).toBeCloseTo(PLATE - INSET, 3);
  });

  it("writes the same two bodies when the inner one comes last", async () => {
    const bodies = await separate([box("plate", "#cf101b", 0, 40, 10), box("inset", "#ffffff", 0, 10, 4)]);
    expect(bodies.find((body) => body.name === "inset")!.volume).toBeCloseTo(INSET, 3);
    expect(bodies.find((body) => body.name === "plate")!.volume).toBeCloseTo(PLATE - INSET, 3);
  });

  it("still cuts an earlier body that only reaches into a later one", async () => {
    // The first box runs half way into the second: its overlap goes to the later body, as before.
    const bodies = await separate([box("first", "#ffffff", 0, 20, 10), box("second", "#cf101b", 10, 20, 10)]);
    expect(bodies.find((body) => body.name === "first")!.volume).toBeCloseTo(20 * 20 * 10 - 10 * 20 * 10, 3);
    expect(bodies.find((body) => body.name === "second")!.volume).toBeCloseTo(20 * 20 * 10, 3);
  });
});
