import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
// @ts-expect-error the tool list is a plain .mjs module
import { tools } from "../../scripts/layerling-mcp-tools.mjs";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { exportBodiesWithLooseHoles, visibleExportShapes } from "@/lib/editorBooleans";
import { guideSectionForShape } from "@/lib/guideLinks";
import { exportLylProject, importLylProject, type LylProjectDocumentV1 } from "@/lib/lylProject";
import { bedOverhangs } from "@/lib/printBed";
import {
  calibratedReferenceImage,
  dataUrlByteLength,
  DEFAULT_REFERENCE_IMAGE_OPACITY,
  isReferenceImage,
  mirrorHidesReferenceImage,
  referenceImageFacingAxis,
  referenceImageOpacity,
  referenceImagePixelDistance,
  referenceImageShape,
  REFERENCE_IMAGE_HEIGHT,
} from "@/lib/referenceImage";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape, isNonSolidShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

// A 2 x 1 pixel PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwMYAAAZ8QHvGmkkmQAAAABJRU5ErkJggg==";
const picture = { dataUrl: PNG, mimeType: "image/png", pixelWidth: 2, pixelHeight: 1 };

function image(id = "photo") {
  return referenceImageShape(picture, "Board", id);
}

function box(id: string, x = 0): WorkplaneShape {
  return canonicalizeShape({ id, name: "Box", kind: "box", color: "#d41721", hole: false, x, z: 0, elevation: 0, rotation: 0, width: 20, depth: 20, height: 20, size: 20 });
}

async function exported(shapes: WorkplaneShape[]) {
  return exportLylProject({
    projectId: "reference",
    projectName: "Reference",
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_100_000,
    shapes,
    history: [editorHistoryEntry(shapes, [])],
    historyIndex: 0,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
  });
}

describe("a reference image (#680)", () => {
  it("is a thin picture plate, its longer side 100 mm with the picture's proportions, half see-through", () => {
    const shape = image();
    expect(isReferenceImage(shape)).toBe(true);
    expect(shape.kind).toBe("box");
    expect(shape.width).toBeCloseTo(100, 6);
    expect(shape.depth).toBeCloseTo(50, 6);
    expect(shape.height).toBeCloseTo(REFERENCE_IMAGE_HEIGHT, 6);
    expect(referenceImageOpacity(shape)).toBeCloseTo(DEFAULT_REFERENCE_IMAGE_OPACITY, 6);
    // An old picture plate without an opacity stays solid.
    expect(referenceImageOpacity({ imagePlate: { ...picture } })).toBe(1);
    expect(guideSectionForShape(shape)).toBe("referenceImage");
  });

  it("is a guide: never exported, cut, printed or counted on the plate", async () => {
    const shapes = [box("body"), image()];
    expect(isNonSolidShape(shapes[1])).toBe(true);
    expect(isNonSolidShape(shapes[0])).toBe(false);
    const { visible, hiddenNote } = visibleExportShapes(shapes);
    expect(visible.map((shape) => shape.id)).toEqual(["body"]);
    // Leaving it out is not reported as a hidden object.
    expect(hiddenNote).toBe("");
    const { solids } = await exportBodiesWithLooseHoles(shapes);
    expect(solids.map((shape) => shape.id)).toEqual(["body"]);
    // Far past a small printer's plate, it still does not warn.
    const far = { ...image("far"), x: 500 };
    expect(bedOverhangs([box("body"), far], 200, 200, 200)).toEqual([]);
  });

  it("keeps its picture and see-through through saving and loading, the picture once", async () => {
    const shape = canonicalizeShape({ ...image(), imagePlate: { ...picture, opacity: 0.35 }, locked: true });
    const copy = canonicalizeShape({ ...shape, id: "copy", x: 30 });
    const bytes = await exported([shape, copy, box("body")]);
    const files = unzipSync(bytes);
    const document = JSON.parse(strFromU8(files["project.json"])) as LylProjectDocumentV1;
    const node = document.states[0].nodes.find((entry) => entry.objectId === shape.id)!;
    const stored = node.definition.imagePlate as Record<string, unknown>;
    // In the file the picture is an asset, not a data URL in the shape.
    expect(stored.dataUrl).toBeUndefined();
    expect(typeof stored.assetId).toBe("string");
    expect(document.assets.filter((asset) => asset.kind === "image")).toHaveLength(1);
    const restored = await importLylProject(bytes);
    const back = restored.shapes.find((entry) => entry.id === shape.id)!;
    expect(back.imagePlate).toEqual({ ...picture, opacity: 0.35 });
    expect(back.locked).toBe(true);
    expect(back.width).toBeCloseTo(shape.width!, 6);
    expect(restored.shapes.find((entry) => entry.id === "copy")!.imagePlate?.dataUrl).toBe(PNG);
  });

  it("refuses a file whose see-through is out of range", async () => {
    const files = unzipSync(await exported([image()]));
    const document = JSON.parse(strFromU8(files["project.json"])) as LylProjectDocumentV1;
    document.states.forEach((state) => state.nodes.forEach((node) => {
      if (node.definition.imagePlate) (node.definition.imagePlate as Record<string, unknown>).opacity = 0;
    }));
    files["project.json"] = strToU8(JSON.stringify(document));
    await expect(importLylProject(zipSync(files))).rejects.toThrow(/imagePlate\.opacity/);
  });

  it("calibrates by two points and their real distance, keeping its proportions", () => {
    const shape = image();
    // Two points 40 mm apart on the picture as it is now, 85 mm apart in reality.
    const patch = calibratedReferenceImage(shape, 40, 85)!;
    expect(patch.width).toBeCloseTo(100 * 85 / 40, 3);
    expect(patch.depth).toBeCloseTo(50 * 85 / 40, 3);
    expect(calibratedReferenceImage(shape, 0, 85)).toBeNull();
    expect(calibratedReferenceImage(shape, 40, 0)).toBeNull();
    // In the picture's own pixels (the AI bridge): across its 2 pixels is its whole width.
    expect(referenceImagePixelDistance(shape as Parameters<typeof referenceImagePixelDistance>[0], { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(100, 6);
  });

  it("is mirrored left-right and front-back, never onto the back of its plate", () => {
    const flat = image();
    expect(referenceImageFacingAxis(flat)).toBe("y");
    expect(mirrorHidesReferenceImage(flat, "y")).toBe(true);
    expect(mirrorHidesReferenceImage(flat, "x")).toBe(false);
    expect(mirrorHidesReferenceImage(flat, "z")).toBe(false);
    // Laid on a side face (stood up facing front or right), the blocked axis follows the face.
    expect(referenceImageFacingAxis({ ...flat, rotationX: 90 })).toBe("z");
    expect(referenceImageFacingAxis({ ...flat, rotationZ: 90 })).toBe("x");
    // Any other body mirrors every way.
    expect(mirrorHidesReferenceImage(box("body"), "y")).toBe(false);
  });

  it("knows the size of the picture a data URL holds", () => {
    expect(dataUrlByteLength(PNG)).toBe(atob(PNG.split(",")[1]).length);
  });

  it("has an action in the AI bridge to add, move, calibrate, fade and lock one", () => {
    const tool = (tools as Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }>).find((entry) => entry.name === "layerling_reference_image")!;
    expect(tool).toBeTruthy();
    for (const key of ["id", "base64", "fileName", "width", "x", "z", "rotation", "opacity", "calibrate", "locked"]) {
      expect(tool.inputSchema.properties, key).toHaveProperty(key);
    }
  });
});
