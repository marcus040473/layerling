import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { buildGroupedShapeFromSelection, exportSolidVolume, splitShapeByPlane } from "@/lib/editorBooleans";
import { simplifyTrianglePositions } from "@/lib/meshSimplify";
import { packValue, unpackValue } from "@/lib/geometryTransfer";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { importedShapesFromObj } from "@/lib/objImport";
import { importedShapeFromStl } from "@/lib/stlImport";

/**
 * The geometry worker (workers/geometry.worker.ts) gets its shapes packed and sends its answer
 * back packed (lib/geometryTransfer.ts). What arrives must be what the page would have worked out
 * itself, to the last bit, and lists the answer took over unchanged must be the page's own arrays.
 * This runs the worker's way without a worker - pack, unpack, compute, pack, unpack - next to
 * the direct call.
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

/** A 20 mm cube whose faces are cut into a grid, outward-facing: enough numbers to be packed. */
function gridCube(cells: number): number[] {
  const size = 20;
  const positions: number[] = [];
  const faces: Array<(u: number, v: number) => number[]> = [
    (u, v) => [u, v, size], (u, v) => [v, u, 0],
    (u, v) => [size, u, v], (u, v) => [0, v, u],
    (u, v) => [v, size, u], (u, v) => [u, 0, v],
  ];
  for (const face of faces) {
    for (let i = 0; i < cells; i += 1) {
      for (let j = 0; j < cells; j += 1) {
        const [u0, u1, v0, v1] = [i, i + 1, j, j + 1].map((value) => (value * size) / cells);
        const a = face(u0, v0), b = face(u1, v0), c = face(u1, v1), d = face(u0, v1);
        positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
  }
  return positions.map((value) => value - size / 2);
}

function meshShape(id: string, positions: number[]): WorkplaneShape {
  return {
    id, name: "Part", kind: "mesh", color: "#0098c7",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20, rotation: 0,
    importedMesh: { positions, baseWidth: 20, baseDepth: 20, baseHeight: 20, triangleCount: positions.length / 9, sourceFormat: "stl" },
  } as unknown as WorkplaneShape;
}

function holeCylinder(): WorkplaneShape {
  return {
    id: "hole", name: "Hole", kind: "cylinder", color: "#888888", hole: true,
    x: 3, z: -2, elevation: -5, size: 8, width: 8, depth: 8, height: 30, rotation: 0, sides: 48,
  } as unknown as WorkplaneShape;
}

/** What the worker hands back, the way the page receives it. */
async function viaTransfer<T>(args: unknown, compute: (unpacked: never) => Promise<T>): Promise<T> {
  const request = packValue(args);
  const received = new Map<unknown[], number>();
  const workerArgs = unpackValue(structuredClone(request.value), request.buffers.map((buffer) => buffer.slice()), [], received);
  const result = await compute(workerArgs as never);
  const answer = packValue(result, received);
  return unpackValue(structuredClone(answer.value), answer.buffers.map((buffer) => buffer.slice()), request.lists) as T;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Same values to the bit (ids are fresh every run); an input list kept by one is kept by the other. */
function expectSame(direct: unknown, transferred: unknown, inputs: Set<unknown>, path = "result") {
  if (typeof direct === "number") {
    expect(Object.is(direct, transferred), path).toBe(true);
    return;
  }
  if (typeof direct === "string") {
    expect((transferred as string).replace(UUID, "ID"), path).toBe(direct.replace(UUID, "ID"));
    return;
  }
  if (Array.isArray(direct)) {
    expect(Array.isArray(transferred), path).toBe(true);
    if (inputs.has(direct)) expect(transferred, `${path} is the page's own array`).toBe(direct);
    expect((transferred as unknown[]).length, path).toBe(direct.length);
    direct.forEach((entry, index) => expectSame(entry, (transferred as unknown[])[index], inputs, `${path}[${index}]`));
    return;
  }
  if (direct && typeof direct === "object") {
    expect(Object.keys(transferred as object).sort(), path).toEqual(Object.keys(direct).sort());
    for (const key of Object.keys(direct)) expectSame((direct as Record<string, unknown>)[key], (transferred as Record<string, unknown>)[key], inputs, `${path}.${key}`);
    return;
  }
  expect(transferred, path).toBe(direct);
}

describe("geometry worker transfer", () => {
  it("packs number lists bit for bit and sends a shared list once", () => {
    const list = Array.from({ length: 300 }, (_, index) => (index === 0 ? -0 : index === 1 ? Number.NaN : index / 7));
    const packed = packValue({ a: list, b: { c: list }, short: [1, 2, 3], mixed: [...list.slice(0, 299), "x"] });
    expect(packed.buffers).toHaveLength(1);
    const back = unpackValue(packed.value, packed.buffers) as { a: number[]; b: { c: number[] }; short: number[]; mixed: unknown[] };
    expect(back.a).toBe(back.b.c);
    expect(Object.is(back.a[0], -0)).toBe(true);
    expect(Number.isNaN(back.a[1])).toBe(true);
    back.a.forEach((value, index) => expect(Object.is(value, list[index])).toBe(true));
    expect(back.short).toEqual([1, 2, 3]);
    expect(back.mixed.at(-1)).toBe("x");
  });

  it("cuts an imported mesh the same way as on the page", async () => {
    const selected = [meshShape("body", gridCube(12)), holeCylinder()];
    const inputs = new Set<unknown>([selected[0].importedMesh!.positions]);
    const direct = await buildGroupedShapeFromSelection(selected, 250_000);
    const transferred = await viaTransfer({ selected, triangleLimit: 250_000 }, (args: { selected: WorkplaneShape[]; triangleLimit: number }) => buildGroupedShapeFromSelection(args.selected, args.triangleLimit));
    expect(direct.group?.importedMesh?.positions.length).toBeGreaterThan(1000);
    expectSame(direct, transferred, inputs);
  });

  it("merges two imported meshes the same way as on the page", async () => {
    const positions = gridCube(10);
    const shifted = { ...meshShape("right", positions), x: 12 };
    const selected = [meshShape("left", positions), shifted];
    const inputs = new Set<unknown>([positions]);
    const direct = await buildGroupedShapeFromSelection(selected, 250_000);
    const transferred = await viaTransfer({ selected, triangleLimit: 250_000 }, (args: { selected: WorkplaneShape[]; triangleLimit: number }) => buildGroupedShapeFromSelection(args.selected, args.triangleLimit));
    expectSame(direct, transferred, inputs);
  });

  it("reads an STL and an OBJ file the same way as on the page", async () => {
    const positions = gridCube(12);
    const stl = Buffer.alloc(84 + (positions.length / 9) * 50);
    stl.writeUInt32LE(positions.length / 9, 80);
    for (let triangle = 0; triangle < positions.length / 9; triangle += 1) {
      for (let k = 0; k < 9; k += 1) stl.writeFloatLE(positions[triangle * 9 + k], 84 + triangle * 50 + 12 + k * 4);
    }
    const buffer = stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength);
    const directStl = importedShapeFromStl("cube.stl", buffer);
    const transferredStl = await viaTransfer({ fileName: "cube.stl", buffer }, async (args: { fileName: string; buffer: ArrayBuffer }) => importedShapeFromStl(args.fileName, args.buffer));
    expectSame(directStl, transferredStl, new Set());

    const lines: string[] = [];
    for (let index = 0; index < positions.length; index += 3) lines.push(`v ${positions[index]} ${positions[index + 1]} ${positions[index + 2]}`);
    for (let face = 0; face < positions.length / 9; face += 1) lines.push(`f ${face * 3 + 1} ${face * 3 + 2} ${face * 3 + 3}`);
    const obj = lines.join("\n");
    const directObj = importedShapesFromObj("cube.obj", obj, []);
    const transferredObj = await viaTransfer({ fileName: "cube.obj", text: obj, mtlSources: [] }, async (args: { fileName: string; text: string; mtlSources: string[] }) => importedShapesFromObj(args.fileName, args.text, args.mtlSources));
    expect(directObj.shapes[0].importedMesh?.positions.length).toBeGreaterThan(1000);
    expectSame(directObj, transferredObj, new Set());
  });

  it("simplifies a mesh and estimates a print the same way as on the page", async () => {
    const positions = gridCube(20);
    const direct = await simplifyTrianglePositions(positions, 400);
    const transferred = await viaTransfer({ positions, target: 400 }, (args: { positions: number[]; target: number }) => simplifyTrianglePositions(args.positions, args.target));
    expect(direct.triangleCount).toBeLessThan(positions.length / 9);
    expectSame(direct, transferred, new Set());

    const source = [meshShape("body", gridCube(12)), holeCylinder()];
    const estimate = await exportSolidVolume(source);
    const transferredEstimate = await viaTransfer({ source }, (args: { source: WorkplaneShape[] }) => exportSolidVolume(args.source));
    expect(estimate.volumeMm3).toBeGreaterThan(0);
    expectSame(estimate, transferredEstimate, new Set());
  });

  it("splits a mesh the same way as on the page", async () => {
    const shape = meshShape("body", gridCube(12));
    const plane = { axis: "x" as const, normal: [1, 0, 0] as [number, number, number], position: 1.5 };
    const direct = await splitShapeByPlane(shape, plane);
    const transferred = await viaTransfer({ shape, plane }, (args: { shape: WorkplaneShape; plane: typeof plane }) => splitShapeByPlane(args.shape, args.plane));
    expect(direct.parts).toHaveLength(2);
    expectSame(direct, transferred, new Set([shape.importedMesh!.positions]));
  });
});
