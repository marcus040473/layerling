import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import { thread } from "./helpers/threadHarness";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { boltKeySide, boltSplitFits, splitBoltForShape } from "@/lib/boltSplit";
import type { WorkplaneShape } from "@/types/layerling";

const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));
beforeAll(async () => {
  kernel.runtime = manifoldModule().then((loaded) => { loaded.setup(); rememberManifoldRuntime(loaded); return loaded; });
  await kernel.runtime;
});

/** The volume of a mesh shape's triangles (mm³). */
function volumeOf(shape: WorkplaneShape) {
  const p = shape.importedMesh!.positions;
  let sum = 0;
  for (let i = 0; i < p.length; i += 9) {
    sum += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  }
  return Math.abs(sum) / 6;
}

/** The area of the shape's faces lying on the bed (all three corners at its lowest point, facing down). */
function areaOnBed(shape: WorkplaneShape) {
  const p = shape.importedMesh!.positions;
  let area = 0;
  for (let i = 0; i < p.length; i += 9) {
    if (Math.max(p[i + 1], p[i + 4], p[i + 7]) > 0.001) continue;
    const ux = p[i + 3] - p[i], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vz = p[i + 8] - p[i + 2];
    area += Math.abs(ux * vz - uz * vx) / 2;
  }
  return area;
}

const screw = (extra: Partial<WorkplaneShape> = {}) => thread({ threadRole: "screw", threadDiameter: 10, threadPitch: 1.5, threadHead: "cylinder", height: 40, ...extra } as Partial<WorkplaneShape>);

describe("splitting a screw lengthwise to print it lying flat", () => {
  it("offers itself for screws and rods only", () => {
    expect(boltSplitFits(screw())).toBe(true);
    expect(boltSplitFits(thread({ threadRole: "rod" } as Partial<WorkplaneShape>))).toBe(true);
    expect(boltSplitFits(thread({ threadRole: "nut" } as Partial<WorkplaneShape>))).toBe(false);
    expect(boltSplitFits(thread({ threadRole: "bore", hole: true } as Partial<WorkplaneShape>))).toBe(false);
  });

  it("cuts an M10 screw in two equal halves lying on their cut faces, with a key that fits its groove", async () => {
    const shape = screw();
    const result = await splitBoltForShape(shape, { key: true, keyPlay: 0.15 });
    if (!result.parts) throw new Error(result.error);
    expect(result.parts).toHaveLength(3);
    const [a, b, key] = result.parts;
    // The halves: as long as the screw, as high as the head's radius, on the bed.
    for (const half of [a, b]) {
      expect(half.elevation).toBeCloseTo(0, 3);
      expect(half.width).toBeCloseTo(shape.height, 0);
      expect(half.height).toBeGreaterThan(4.5);
      expect(half.height).toBeLessThan(shape.width / 2 + 0.2);
    }
    const va = volumeOf(a);
    const vb = volumeOf(b);
    expect(Math.abs(va - vb) / va).toBeLessThan(0.03);
    // Each lies on its flat cut face: most of the core's length times its width is on the bed (the V-groove aside).
    const side = boltKeySide(shape)!;
    for (const half of [a, b]) expect(areaOnBed(half)).toBeGreaterThan(0.6 * 8 * shape.height - side * Math.SQRT2 * shape.height);
    // The key: a square bar, play off each side, shorter than its groove, lying flat.
    expect(result.keySide).toBeCloseTo(side - 0.3, 2);
    expect(key.height).toBeCloseTo(result.keySide, 2);
    expect(key.depth).toBeCloseTo(result.keySide, 2);
    expect(key.width).toBeCloseTo(result.keyLength, 2);
    expect(result.keyLength).toBeGreaterThan(shape.height / 2);
    expect(result.keyLength).toBeLessThan(shape.height - 3);
    // Nothing is lost but the groove: the two halves and the groove make up the screw.
    const grooveVolume = side * side * (result.keyLength + 0.6);
    const whole = await splitBoltForShape(shape, { key: false });
    if (!whole.parts) throw new Error(whole.error);
    const wholeVolume = volumeOf(whole.parts[0]) + volumeOf(whole.parts[1]);
    expect(Math.abs(va + vb + grooveVolume - wholeVolume) / wholeVolume).toBeLessThan(0.01);
    // Laid out side by side, not overlapping.
    const zs = result.parts.map((part) => [part.z - (part.depth ?? 0) / 2, part.z + (part.depth ?? 0) / 2]).sort((p, q) => p[0] - q[0]);
    for (let index = 1; index < zs.length; index += 1) expect(zs[index][0]).toBeGreaterThan(zs[index - 1][1]);
  });

  it("splits along the screw's own axis whatever way it is turned", async () => {
    const upright = await splitBoltForShape(screw(), { key: true });
    const lying = await splitBoltForShape(screw({ rotationX: 90, rotationZ: 30 }), { key: true });
    if (!upright.parts || !lying.parts) throw new Error("no parts");
    upright.parts.forEach((part, index) => {
      expect(lying.parts![index].width).toBeCloseTo(part.width, 2);
      expect(lying.parts![index].height).toBeCloseTo(part.height, 2);
    });
  });

  it("leaves the key out of a thread too thin for one, and splits it all the same", async () => {
    const rod = thread({ threadRole: "rod", threadDiameter: 4, threadPitch: 0.7, height: 30 } as Partial<WorkplaneShape>);
    expect(boltKeySide(rod)).toBeNull();
    const result = await splitBoltForShape(rod, { key: true });
    if (!result.parts) throw new Error(result.error);
    expect(result.parts).toHaveLength(2);
    expect(result.keyLeftOut).toBe("tooThin");
  });

  it("refuses a nut", async () => {
    const result = await splitBoltForShape(thread({ threadRole: "nut" } as Partial<WorkplaneShape>), {});
    expect(result.parts).toBeNull();
  });
});
