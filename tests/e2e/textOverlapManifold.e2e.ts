import { beforeAll, describe, expect, it, vi } from "vitest";
import manifoldModule from "manifold-3d";
import type { WorkplaneShape } from "@/types/layerling";
import { exportBodiesWithLooseHoles, manifoldFromMeshData } from "@/lib/editorBooleans";
import { meshForShape } from "@/lib/editorMeshCore";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { footprintCutOffset, sliceMeshContours } from "@/lib/sectionSvg";
import { loadTextFonts } from "@/lib/textFonts";

/**
 * A letter whose outline is drawn as several overlapping strokes - the "#" of most fonts, the "f" of Rounded - was built as
 * several solids that overlap, and the 3D kernel refused that mesh as "Not manifold" (#916): the silhouette export stopped,
 * and grouped as a hole the counters of the letters beside it were lost. The text's mesh is now the union of the letters.
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
  await loadTextFonts();
});

const text = (value: string, font: string, extra: Partial<WorkplaneShape> = {}) => ({ id: "t", name: "Text", kind: "text", color: "#000", x: 0, z: 0, elevation: 0, rotation: 0, size: 60, width: 60, depth: 20, height: 3, text: value, font, locked: false, hidden: false, ...extra } as WorkplaneShape);

function problem(shape: WorkplaneShape) {
  try {
    const solid = manifoldFromMeshData(runtime, meshForShape(shape));
    const status = solid.status();
    const volume = solid.volume();
    solid.delete();
    return status === "NoError" && volume > 0 ? null : `status ${status}, volume ${volume}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("text with overlapping strokes is a solid the kernel accepts (#916)", () => {
  for (const font of ["Multilanguage", "Sans", "Serif", "Script", "Monospace", "Rounded", "Stencil"]) {
    it(`"A#B" in ${font}`, () => {
      expect(problem(text("A#B", font))).toBeNull();
    });
  }

  it("\"f\" in Rounded", () => {
    expect(problem(text("fff", "Rounded"))).toBeNull();
  });

  it("keeps the counters of the letters beside it", () => {
    const solid = manifoldFromMeshData(runtime, meshForShape(text("A#B", "Sans")));
    const pieces = solid.decompose();
    const counters = pieces.reduce((sum, piece) => sum + piece.genus(), 0);
    pieces.forEach((piece) => piece.delete());
    solid.delete();
    // A has one counter, "#" its middle pocket, B two.
    expect(pieces.length).toBe(3);
    expect(counters).toBe(4);
  });

  it("leaves a text that is fine as it is, and a text with a bevel, to the plain mesh", () => {
    expect(problem(text("Hello", "Sans"))).toBeNull();
    // A bevel cannot be carried by the joined region: the plain mesh stays (and may still be refused).
    expect(meshForShape(text("Hello", "Sans", { bevel: 1 })).faces.length).toBeGreaterThan(0);
  });

  it("is exported as a silhouette and as a hole in a plate with the counters of its letters", async () => {
    const letters = text("A#B", "Sans", { hole: true, elevation: -1, height: 7 });
    const plate = { id: "p", name: "Box", kind: "box", color: "#123456", x: 0, z: 0, elevation: 0, rotation: 0, size: 100, width: 100, depth: 50, height: 5, locked: false, hidden: false } as WorkplaneShape;
    const alone = await exportBodiesWithLooseHoles([text("A#B", "Sans")]);
    expect(alone.meshes.length).toBe(1);
    const cut = await exportBodiesWithLooseHoles([plate, letters]);
    expect(cut.holeCutsFailed ?? 0).toBe(0);
    const pieces = cut.meshes.flatMap((mesh) => manifoldFromMeshData(runtime, mesh).decompose());
    // The plate, and the islands the counters of A, # and B leave standing in it: one, one and two.
    expect(pieces.length).toBe(5);
    pieces.forEach((piece) => piece.delete());
  });

  for (const [font, value] of [["Rounded", "fff"], ["Rounded", "A#B"], ["Script", "A#B"], ["Sans", "A#B"], ["Multilanguage", "A#B"]] as const) {
    it(`the footprint of "${value}" in ${font} has only closed outlines`, () => {
      const mesh = meshForShape(text(value, font));
      const offset = footprintCutOffset([mesh]);
      expect(offset).not.toBeNull();
      const loops = sliceMeshContours(mesh, "y", offset as number);
      expect(loops.length).toBeGreaterThan(0);
      expect(loops.filter((loop) => !loop.closed).length).toBe(0);
    });
  }
});
