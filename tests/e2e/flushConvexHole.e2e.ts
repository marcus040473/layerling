import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { buildGroupedShapeFromSelection } from "@/lib/editorBooleans";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";

/** #928: a hole made of a mesh with a fillet, flush with a wall, cuts through it without leaving a skin. */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));

let runtime: ManifoldToplevel;
beforeAll(async () => {
  kernel.runtime = manifoldModule().then((loaded) => {
    loaded.setup();
    rememberManifoldRuntime(loaded);
    return loaded;
  });
  runtime = (await kernel.runtime) as ManifoldToplevel;
});

/** A 10 x 10 x 15 box with one upright edge cut off, as a triangle soup round its middle: convex, but a mesh, not a box. */
function chamferedBoxPositions() {
  const points: [number, number, number][] = [];
  for (const y of [0, 15]) {
    points.push([-5, y, -5], [5, y, -5], [-5, y, 5], [5, y, 2], [2, y, 5]);
  }
  const mesh = runtime.Manifold.hull(points).getMesh();
  const positions: number[] = [];
  for (let triangle = 0; triangle < mesh.numTri; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.triVerts[triangle * 3 + corner];
      positions.push(mesh.vertProperties[vertex * mesh.numProp], mesh.vertProperties[vertex * mesh.numProp + 1], mesh.vertProperties[vertex * mesh.numProp + 2]);
    }
  }
  return positions;
}

/** The area of the faces lying on x = at, split by which way they face. */
function areasOnPlaneX(positions: number[], at: number) {
  let outward = 0;
  let inward = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const xs = [positions[i], positions[i + 3], positions[i + 6]];
    if (xs.some((x) => Math.abs(x - at) > 1e-3)) continue;
    const uy = positions[i + 4] - positions[i + 1], uz = positions[i + 5] - positions[i + 2];
    const vy = positions[i + 7] - positions[i + 1], vz = positions[i + 8] - positions[i + 2];
    const nx = uy * vz - uz * vy;
    if (nx < 0) outward += -nx / 2;
    else inward += nx / 2;
  }
  return { outward, inward };
}

describe("a convex mesh hole flush with a wall (#928)", () => {
  it("leaves no skin on that wall", async () => {
    const solid: WorkplaneShape = {
      id: "solid", name: "Box", kind: "box", color: "#d41721", x: 0, z: 0, elevation: 0, rotation: 0,
      width: 20, depth: 20, height: 20, size: 20,
    };
    // A hair off the wall, as float rounding leaves a hole that was aligned flush with it.
    const hole: WorkplaneShape = {
      id: "hole", name: "Box", kind: "mesh", color: "#d41721", x: -5 + 1.3e-6, z: 0, elevation: 0, rotation: 0,
      width: 10, depth: 10, height: 15, size: 10, hole: true, importedMesh: { positions: chamferedBoxPositions(), baseWidth: 10, baseDepth: 10, baseHeight: 15 },
    };
    const result = await buildGroupedShapeFromSelection([solid, hole], 200_000);
    const group = result.group;
    expect(group).not.toBeNull();
    const positions = group!.importedMesh!.positions;
    const xs = positions.filter((_, index) => index % 3 === 0);
    const left = Math.min(...xs);
    const { outward, inward } = areasOnPlaneX(positions, left);
    // The wall keeps what the hole does not cover; nothing faces into the body on it.
    expect(inward).toBeLessThan(0.01);
    expect(outward).toBeCloseTo(400 - 10 * 15, 0);
  });
});
