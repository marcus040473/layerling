import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { buildGroupedShapeFromSelection, manifoldFromMeshData, splitBoreTube } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";

/**
 * Two tubes grouped into a T-junction: the bore of one does not cut the wall of the other, so nothing flows through (#892).
 * With "Bore cuts as a hole when grouped" the tube is cut as an outer cylinder and a bore hole, and the junction opens.
 */
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));
let runtime: Awaited<ReturnType<typeof manifoldModule>>;
beforeAll(async () => {
  kernel.runtime = manifoldModule().then((loaded) => { loaded.setup(); rememberManifoldRuntime(loaded); runtime = loaded; return loaded; });
  await kernel.runtime;
});

const tube = (id: string, extra: Partial<WorkplaneShape>) => ({ id, name: "Tube", kind: "tube", color: "#c33", x: 0, z: 0, elevation: 0, rotation: 0, size: 20, width: 20, depth: 20, height: 60, bevel: 3, locked: false, hidden: false, ...extra } as WorkplaneShape);

/** A standing tube (outer 20, bore 14) and a tube lying along x (outer 12, bore 8) that ends in the middle of the first. */
const tubes = (bore: boolean) => [
  tube("upright", { tubeBoreHole: bore || undefined }),
  tube("lying", { x: 25, elevation: 5, rotationZ: 90, width: 12, depth: 12, size: 12, height: 50, bevel: 2, tubeBoreHole: bore || undefined }),
];

/** The volume of the group inside a thin rod along x through the middle of the lying tube's bore, across the standing tube's wall. */
async function blockedVolume(bore: boolean) {
  const { group } = await buildGroupedShapeFromSelection(tubes(bore), 500_000);
  expect(group).not.toBeNull();
  const solid = manifoldFromMeshData(runtime, meshForShape(group!));
  const rod = runtime.Manifold.cylinder(2, 1, 1, 32).rotate([0, 90, 0]).translate([7.5, 30, 0]);
  const inside = solid.intersect(rod);
  const volume = inside.volume();
  [solid, rod, inside].forEach((item) => item.delete());
  return volume;
}

describe("a tube whose bore cuts as a hole (#892)", () => {
  it("leaves the wall of the other tube standing without the switch", async () => {
    expect(await blockedVolume(false)).toBeGreaterThan(5);
  });

  it("opens the wall of the other tube with it", async () => {
    expect(await blockedVolume(true)).toBeLessThan(0.01);
  });

  it("is cut as an outer cylinder and a bore hole, and stays one shape otherwise", () => {
    const parts = splitBoreTube(tube("t", { tubeBoreHole: true }));
    expect(parts.map((part) => [part.kind, part.hole === true, part.width])).toEqual([["cylinder", false, 20], ["cylinder", true, 14]]);
    expect(parts[1].id).not.toBe(parts[0].id);
    expect(splitBoreTube(tube("t", {}))).toHaveLength(1);
    expect(splitBoreTube(tube("t", { tubeBoreHole: true, hole: true }))).toHaveLength(1);
    // A wall as thick as the radius has no bore to cut.
    expect(splitBoreTube(tube("t", { tubeBoreHole: true, bevel: 10 }))).toHaveLength(1);
  });
});
