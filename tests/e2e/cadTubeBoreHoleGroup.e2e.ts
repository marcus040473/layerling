import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { CadModifierMeshPart, CadModifierWorkerRequest, CadModifierWorkerResponse } from "@/lib/cadModifierTypes";
import type { MeshData } from "@/lib/editorMeshCore";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * A tube or bent tube whose bore cuts as a hole, grouped with a box it passes through, through the edge tool's worker
 * (Issue #1790): grouping cuts the bore through the box, and a chamfer or fillet on the group has to leave it there.
 * The tube went to the kernel as the one hollow body it is drawn as, which is only added to the box, so the box closed
 * the bore again and the hole was gone from the treated body.
 */

const occtDir = dirname(fileURLToPath(import.meta.resolve("occt-wasm")));

vi.mock("@/lib/cadModifierRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cadModifierRuntime")>()),
  CAD_MODIFIER_RUNTIME_BASE: pathToFileURL(occtDir).href,
}));
vi.mock("occt-wasm", async (importOriginal) => {
  const original = await importOriginal<typeof import("occt-wasm")>();
  const init = original.OcctKernel.init.bind(original.OcctKernel);
  original.OcctKernel.init = ((options: object) => init({ ...options, wasm: join(occtDir, "occt-wasm.wasm") })) as typeof original.OcctKernel.init;
  return original;
});
const kernel = vi.hoisted(() => ({ runtime: null as Promise<unknown> | null }));
vi.mock("@/lib/editorMeshCore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editorMeshCore")>()),
  getManifoldRuntime: () => kernel.runtime,
}));

type Self = { postMessage: (message: unknown) => void; onmessage: ((event: { data: CadModifierWorkerRequest }) => Promise<void>) | null };
const replies: CadModifierWorkerResponse[] = [];
const self: Self = { postMessage: (message) => replies.push(message as CadModifierWorkerResponse), onmessage: null };
(globalThis as unknown as { self: Self }).self = self;

let requestId = 0;
async function ask(request: Omit<CadModifierWorkerRequest, "requestId"> & { type: string }) {
  requestId += 1;
  const id = requestId;
  replies.length = 0;
  await self.onmessage!({ data: { ...request, requestId: id } as CadModifierWorkerRequest });
  const reply = replies.find((entry) => (entry as { requestId?: number }).requestId === id);
  if (!reply) throw new Error("no reply");
  if (reply.type === "error") throw new Error(reply.message);
  return reply;
}

function meshVolume(positions: ArrayLike<number>, indices: ArrayLike<number>) {
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index] * 3, indices[index + 1] * 3, indices[index + 2] * 3];
    volume += (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) / 6;
  }
  return volume;
}

function meshDataVolume(mesh: MeshData) {
  return meshVolume(mesh.vertices.flat(), mesh.faces.flat());
}

/** The parts of a group as the edge tool hands them to its worker: exact where the shape has an exact body, its mesh otherwise. */
async function workerParts(group: WorkplaneShape) {
  const { restoreGroupedChildrenForEdges } = await import("@/lib/editorBooleans");
  const { cadModifierPrimitiveForBakedShape, cadModifierPrimitiveForAnalyticShape } = await import("@/lib/cadBakeMetadata");
  const { cadModifierProfileForShape, cadProfileExpectation } = await import("@/lib/cadProfileExtrusion");
  const { meshForShape } = await import("@/lib/editorMeshCore");
  return restoreGroupedChildrenForEdges(group).map(({ shape, scope }) => {
    const hole = Boolean(shape.hole);
    const withScope = (part: CadModifierMeshPart) => (scope.length ? { ...part, scope } : part);
    const primitive = cadModifierPrimitiveForBakedShape(shape) ?? cadModifierPrimitiveForAnalyticShape(shape);
    if (primitive) return withScope({ primitive, hole });
    const mesh = meshForShape(shape);
    const transfer = { positions: new Float32Array(mesh.vertices.flat()), indices: new Uint32Array(mesh.faces.flat()) };
    const profile = cadModifierProfileForShape(shape);
    if (profile) return withScope({ profile: { ...profile, expected: cadProfileExpectation(mesh.vertices, mesh.faces) }, ...transfer, hole });
    return withScope({ ...transfer, hole });
  });
}

const base = { color: "#c33", x: 0, z: 0, rotation: 0, locked: false, hidden: false } as const;

beforeAll(async () => {
  const { rememberManifoldRuntime } = await import("@/lib/manifoldHandle");
  kernel.runtime = manifoldModule().then((loaded) => { loaded.setup(); rememberManifoldRuntime(loaded); return loaded; });
  await kernel.runtime;
  vi.stubGlobal("WebAssembly", WebAssembly);
  await import("@/workers/cadModifier.worker");
});

describe("a tube whose bore cuts as a hole, in the edge tool's worker (Issue #1790)", () => {
  /** A standing tube (outer 20, bore 14, 60 high) through a box of 40 x 40 x 20 that sits round its middle. */
  async function tubeThroughBox(bore: boolean) {
    const { buildGroupedShapeFromSelection } = await import("@/lib/editorBooleans");
    const tube = { ...base, id: "tube", name: "Tube", kind: "tube", elevation: 0, size: 20, width: 20, depth: 20, height: 60, bevel: 3, tubeBoreHole: bore || undefined } as WorkplaneShape;
    const box = { ...base, id: "box", name: "Box", kind: "box", color: "#33c", elevation: 20, size: 40, width: 40, depth: 40, height: 20 } as WorkplaneShape;
    const { group } = await buildGroupedShapeFromSelection([box, tube], 500_000);
    if (!group) throw new Error("no group");
    return group;
  }
  // The box less the bore, and the tube's wall above and below it.
  const boreInBox = Math.PI * 49 * 20;
  const open = 40 * 40 * 20 - boreInBox + Math.PI * (100 - 49) * 40;

  /** The outer rim of the tube's top end: the edge the report chamfers. */
  async function topRim(group: WorkplaneShape) {
    const ready = await ask({ type: "prepare", parts: await workerParts(group), sharpAngle: 25 });
    if (ready.type !== "ready") throw new Error("not ready");
    const rim = ready.edges.filter((edge) => edge.selectable && edge.points.length >= 6 && Array.from({ length: edge.points.length / 3 }, (_, i) => i * 3)
      .every((i) => Math.abs(edge.points[i + 1] - 60) < 1e-3 && Math.abs(Math.hypot(edge.points[i], edge.points[i + 2]) - 10) < 0.05));
    expect(rim.length).toBeGreaterThan(0);
    return rim.map((edge) => edge.id);
  }

  it("has the bore through the box in the group, the body the edge tool starts from", async () => {
    const { meshForShape } = await import("@/lib/editorMeshCore");
    expect(Math.abs(meshDataVolume(meshForShape(await tubeThroughBox(true))) - open)).toBeLessThan(300);
  });

  it.each(["chamfer", "fillet"] as const)("keeps the bore through the box after a %s on the tube's end", async (kind) => {
    const group = await tubeThroughBox(true);
    const preview = await ask({ type: "preview", kind, edgeIds: await topRim(group), amount: 1, quality: "draft", chamferAngle: 45 });
    if (preview.type !== "preview") throw new Error("no preview");
    // The treated rim takes some 30 mm^3 away; with the bore closed in the box the body is some 3000 mm^3 more.
    expect(Math.abs(meshVolume(preview.positions, preview.indices) - open)).toBeLessThan(300);
  });

  it("leaves the box whole where the switch is off", async () => {
    const group = await tubeThroughBox(false);
    const preview = await ask({ type: "preview", kind: "chamfer", edgeIds: await topRim(group), amount: 1, quality: "draft", chamferAngle: 45 });
    if (preview.type !== "preview") throw new Error("no preview");
    expect(Math.abs(meshVolume(preview.positions, preview.indices) - (open + boreInBox))).toBeLessThan(300);
  });
});

describe("a bent tube whose opening cuts as a hole, in the edge tool's worker (Issue #1790)", () => {
  /** A straight pipe along x (outer 10, opening 6, 40 long) through a wall 6 thick, as in the grouping test of #892, lifted clear of the wall's foot. */
  async function pipeThroughWall(bore: boolean) {
    const { buildGroupedShapeFromSelection } = await import("@/lib/editorBooleans");
    const { bentTubeNaturalDimensions, normalizedBentTubeFields } = await import("@/lib/bentTubeGeometry");
    const fields = normalizedBentTubeFields({ bentTubeSize: 10, bentTubeWall: 2, bentTubeSegments: [{ length: 40, bendAngle: 0, bendRadius: 15, roll: 0 }] });
    const natural = bentTubeNaturalDimensions(fields);
    const pipe = { ...base, id: "pipe", name: "Bent tube", kind: "bentTube", elevation: 10, ...fields, width: natural.width, depth: natural.depth, height: natural.height, size: natural.size, tubeBoreHole: bore || undefined } as WorkplaneShape;
    const wall = { ...base, id: "wall", name: "Wall", kind: "box", color: "#33c", elevation: 0, size: 30, width: 6, depth: 30, height: 30 } as WorkplaneShape;
    const { group } = await buildGroupedShapeFromSelection([pipe, wall], 500_000);
    if (!group) throw new Error("no group");
    return group;
  }
  const boreInWall = Math.PI * 9 * 6;
  const open = 6 * 30 * 30 - boreInWall + Math.PI * (25 - 9) * 34;

  /** The volume of the group's body after a chamfer along the four top edges of the wall, which the pipe does not touch. */
  async function chamferedVolume(group: WorkplaneShape) {
    const ready = await ask({ type: "prepare", parts: await workerParts(group), sharpAngle: 25 });
    if (ready.type !== "ready") throw new Error("not ready");
    const top = ready.edges.filter((edge) => edge.selectable && edge.points.length >= 6 && edge.points.every((value, i) => i % 3 !== 1 || Math.abs(value - 30) < 1e-3));
    expect(top.length).toBeGreaterThanOrEqual(4);
    const preview = await ask({ type: "preview", kind: "chamfer", edgeIds: top.map((edge) => edge.id), amount: 1, quality: "draft", chamferAngle: 45 });
    if (preview.type !== "preview") throw new Error("no preview");
    return meshVolume(preview.positions, preview.indices);
  }

  it("keeps the opening through the wall after a chamfer", async () => {
    // The chamfers take some 35 mm^3 away and the drawn pipe is a little less than the round one; with the opening
    // closed in the wall the body is 170 mm^3 more.
    const [withSwitch, without] = [await chamferedVolume(await pipeThroughWall(true)), await chamferedVolume(await pipeThroughWall(false))];
    expect(Math.abs(withSwitch - (open - 35))).toBeLessThan(60);
    expect(without - withSwitch).toBeGreaterThan(boreInWall * 0.9);
    expect(without - withSwitch).toBeLessThan(boreInWall * 1.1);
  });
});
