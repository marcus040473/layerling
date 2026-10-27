import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { buildGroupedShapeFromSelection, faceReadMesh, groupedShape } from "@/lib/editorBooleans";
import { meshForShape, type MeshData } from "@/lib/editorMeshCore";
import { readPerforableFace } from "@/lib/holePatternShapes";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";

/**
 * A plain group or bundle of solids is its parts' surfaces side by side, and the face tools grow a face over
 * triangles that share corners, so on two overlapping cubes they took one cube's top. The face tools now read the
 * parts joined into one, as the export and the volume do; a pile with a hole among its parts stays as it is drawn.
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

const box = (id: string, x: number, z: number, extra: Partial<WorkplaneShape> = {}) => ({ id, name: "Box", kind: "box", color: "#cf101b", x, z, elevation: 0, rotation: 0, width: 20, depth: 20, size: 20, height: 20, locked: false, hidden: false, ...extra } as WorkplaneShape);

/** The mesh's triangles, nine numbers each, as the editor hands them to the face readers. */
function positions(mesh: MeshData) {
  const out = new Float64Array(mesh.faces.length * 9);
  mesh.faces.forEach((face, index) => face.forEach((vertex, corner) => out.set(mesh.vertices[vertex], index * 9 + corner * 3)));
  return out;
}

/** The face read on the top of `shape` at (x, z): its outline's corners and area. */
async function topFace(shape: WorkplaneShape, x = shape.x, z = shape.z) {
  const read = readPerforableFace(positions(await faceReadMesh(shape)), { x, y: (shape.elevation ?? 0) + shape.height, z }, { x: 0, y: 1, z: 0 });
  if (!read.ok) throw new Error(read.reason);
  const loops = read.face.outline.loops;
  const area = loops.reduce((sum, loop) => sum + Math.abs(loop.reduce((twice, p, i) => {
    const q = loop[(i + 1) % loop.length];
    return twice + p.u * q.v - q.u * p.v;
  }, 0)) / 2, 0);
  return { loops: loops.length, points: loops[0].length, area };
}

describe("the face of a group or bundle, read from its parts joined", () => {
  it("reads the whole top of two overlapping cubes, not one cube's", async () => {
    // 20 mm cubes whose middles are 7 mm and 8 mm apart: the top is a 27 x 28 rectangle less two opposite 7 x 8 corners.
    const group = groupedShape([box("a", -3.5, -4), box("b", 3.5, 4)])!;
    const face = await topFace(group);
    expect([face.loops, face.points]).toEqual([1, 8]);
    expect(face.area).toBeCloseTo(644, 6);
  });

  it("reads the same top on a group turned, mirrored and stretched", async () => {
    const group = groupedShape([box("a", -3.5, -4), box("b", 3.5, 4)])!;
    const stretched = { ...group, rotation: 30, mirrorX: true, width: 54, size: 54 };
    const face = await topFace(stretched);
    expect([face.loops, face.points]).toEqual([1, 8]);
    expect(face.area).toBeCloseTo(1288, 3);
  });

  it("reads the top of a group with a group in it", async () => {
    // A, B and C: 3 x 400 less A and B (156), A and C (39), B and C (189), plus all three (39).
    const inner = groupedShape([box("a", -3.5, -4), box("b", 3.5, 4)])!;
    const group = groupedShape([inner, box("c", 10, 10)])!;
    const face = await topFace(group, inner.x, inner.z);
    expect(face.loops).toBe(1);
    expect(face.area).toBeCloseTo(855, 6);
  });

  it("reads a part that touches no other as before", async () => {
    const group = groupedShape([box("a", -20, 0), box("b", 20, 0)])!;
    const before = readPerforableFace(positions(meshForShape(group)), { x: -20, y: 20, z: 0 }, { x: 0, y: 1, z: 0 });
    if (!before.ok) throw new Error(before.reason);
    const face = await topFace(group, -20, 0);
    expect([face.loops, face.points]).toEqual([before.face.outline.loops.length, before.face.outline.loops[0].length]);
    expect(face.area).toBeCloseTo(400, 6);
  });

  it("leaves a single body and a group with a hole as they are", async () => {
    const single = box("a", 0, 0);
    expect(await faceReadMesh(single)).toEqual(meshForShape(single));
    const holed = (await buildGroupedShapeFromSelection([box("a", -3.5, -4), box("b", 3.5, 4), box("h", 0, 0, { kind: "cylinder", width: 4, depth: 4, size: 4, hole: true })], 200000)).group!;
    expect(holed.importedMesh).toBeTruthy();
    expect(await faceReadMesh(holed)).toEqual(meshForShape(holed));
  });

  it("leaves a bundle with a hole among its parts as it is drawn", async () => {
    // Joined, the hole would count as solid and the box's top would grow over it.
    const bundle = { ...groupedShape([box("a", 0, 0), box("h", 10, 0, { kind: "cylinder", width: 8, depth: 8, size: 8, hole: true })])!, groupOperation: "bundle" } as WorkplaneShape;
    expect(bundle.importedMesh).toBeFalsy();
    expect(await faceReadMesh(bundle)).toEqual(meshForShape(bundle));
    const face = await topFace(bundle, -5, 0);
    expect(face.area).toBeCloseTo(400, 6);
  });

  it("leaves a bundle with a hole in a bundle inside it as it is drawn", async () => {
    const inner = { ...groupedShape([box("a", 0, 0), box("h", 10, 0, { kind: "cylinder", width: 8, depth: 8, size: 8, hole: true })])!, groupOperation: "bundle" } as WorkplaneShape;
    const apart = { ...groupedShape([inner, box("c", 60, 0)])!, groupOperation: "bundle" } as WorkplaneShape;
    expect(await faceReadMesh(apart)).toEqual(meshForShape(apart));
    expect((await topFace(apart, -5, 0)).area).toBeCloseTo(400, 6);
    const overlapping = { ...groupedShape([inner, box("c", 5, 5)])!, groupOperation: "bundle" } as WorkplaneShape;
    expect(await faceReadMesh(overlapping)).toEqual(meshForShape(overlapping));
  });

  it("joins a group with a cut group among its parts, its hole as cut", async () => {
    // A box with a 4 mm hole already cut, and a box over a quarter of it: one top of 700 mm², the hole's three
    // quarters still open in it.
    const holed = (await buildGroupedShapeFromSelection([box("a", 0, 0), box("h", 0, 0, { kind: "cylinder", width: 4, depth: 4, size: 4, hole: true })], 200000)).group!;
    expect(holed.importedMesh).toBeTruthy();
    const group = groupedShape([holed, box("c", 10, 10)])!;
    const read = readPerforableFace(positions(await faceReadMesh(group)), { x: -5, y: 20, z: -5 }, { x: 0, y: 1, z: 0 });
    if (!read.ok) throw new Error(read.reason);
    const areas = read.face.outline.loops.map((loop) => Math.abs(loop.reduce((twice, p, i) => {
      const q = loop[(i + 1) % loop.length];
      return twice + p.u * q.v - q.u * p.v;
    }, 0)) / 2).sort((a, b) => b - a);
    expect(areas.length).toBe(2);
    expect(areas[0]).toBeCloseTo(700, 3);
    expect(areas[1]).toBeGreaterThan(9);
    expect(areas[1]).toBeLessThan(9.5);
  });

  it("joins a bundle whose only hole is hidden", async () => {
    const bundle = { ...groupedShape([box("a", -3.5, -4), box("b", 3.5, 4), box("h", 0, 0, { kind: "cylinder", width: 8, depth: 8, size: 8, hole: true, hidden: true })])!, groupOperation: "bundle" } as WorkplaneShape;
    const face = await topFace(bundle, -3.5, -4);
    expect([face.loops, face.points]).toEqual([1, 8]);
    expect(face.area).toBeCloseTo(644, 6);
  });
});
