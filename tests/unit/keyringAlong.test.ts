import manifoldModule, { type CrossSection, type ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error - the bridge is plain JavaScript without types.
import { tools } from "../../scripts/layerling-mcp-tools.mjs";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { iconLayerKeyrings, iconLayersOf, ICON_TAG_LAYERS } from "@/lib/iconTag";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { exportLylProject, importLylProject, type LylProjectExportInput } from "@/lib/lylProject";
import { textLetterSizePatch } from "@/lib/nameTag";
import { iconKeyringAlongLimit, iconKeyringFor, isSketchKeyring, normalizeSketchKeyring } from "@/lib/sketchKeyring";
import { textFillComponents } from "@/lib/textFill";
import { loadTextFonts } from "@/lib/textFonts";
import { isTextKeyring, keyringAlongLimit, normalizeTextKeyring } from "@/lib/textGeometry";
import { DEFAULT_TEXT_LAYERS, layerTextKeyringArgument, nameTagKeyringAlongLimit, textLayerShapes, textLayersOf } from "@/lib/textLayers";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { SketchPoint, SketchProfile, SketchSegment, TextKeyringSide, WorkplaneShape } from "@/types/layerling";

// #671: the key ring tab can be moved along its side, so it meets a letter that reaches out instead of a gap ("J").
let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
  rememberManifoldRuntime(runtime);
  await loadTextFonts();
});

const text = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "t", name: "Text", kind: "text", color: "#ffffff", x: 0, z: 0, elevation: 0, rotation: 0,
  width: 60, depth: 20, height: 1.2, size: 60, text: "Jess", font: "Sans", ...overrides,
});
const sized = (shape: WorkplaneShape, size: number) => ({ ...shape, ...textLetterSizePatch(shape, size) });

/** The round hole of a layer's outline: the hole ring about as wide as deep, its middle in the world. */
function measuredHole(shape: WorkplaneShape) {
  const rings = textFillComponents(runtime, shape)!.flatMap(({ holes }) => holes);
  const round = rings.map((ring) => {
    const xs = ring.map((point) => point.x);
    const zs = ring.map((point) => point.z);
    return { x: shape.x + (Math.min(...xs) + Math.max(...xs)) / 2, z: shape.z + (Math.min(...zs) + Math.max(...zs)) / 2, width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
  }).filter((hole) => Math.abs(hole.width - hole.depth) < 0.05);
  expect(round).toHaveLength(1);
  return round[0];
}

describe("the key ring tab along its side (#671)", () => {
  it.each([["left", 3], ["right", -2.5], ["top", 6]] as [TextKeyringSide, number][])("on the %s moves %s mm off the middle and stays one piece with the plate", (side, along) => {
    const source = sized(text({ x: 5, z: -4 }), 12);
    const middle = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side, diameter: 4 });
    const moved = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side, diameter: 4, along });
    const before = measuredHole(middle[2]);
    const after = measuredHole(moved[2]);
    expect(after.width).toBeCloseTo(4, 1);
    // Up on the left and right is -z, where the tops of the letters are; to the right on top is +x.
    if (side === "top") {
      expect(after.x - before.x).toBeCloseTo(along, 2);
      expect(after.z).toBeCloseTo(before.z, 1);
    } else {
      expect(before.z - after.z).toBeCloseTo(along, 2);
    }
    expect(moved[2].textKeyring).toMatchObject({ side, diameter: 4, along, ear: true });
    expect(textFillComponents(runtime, moved[2])).toHaveLength(1);
    // The letters and the box across the side stay where they were.
    expect(moved[0]).toEqual(middle[0]);
    expect(moved[1]).toEqual(middle[1]);
    if (side === "top") expect(moved[2].width).toBeCloseTo(middle[2].width!, 3);
    else expect(moved[2].depth).toBeCloseTo(middle[2].depth!, 3);
  });

  it("the tab's flat end meets the plate where it reaches out in the moved band", () => {
    const made: CrossSection[] = [];
    // "Jess" on the left: in the middle the J's hook reaches further out than its stem higher up; at the
    // top of the side its bar does. The hole's edge stays 2 mm beyond the plate in the band it runs in.
    const source = sized(text(), 12);
    const plain = textLayerShapes(source, DEFAULT_TEXT_LAYERS)[2];
    const limit = nameTagKeyringAlongLimit(source, DEFAULT_TEXT_LAYERS, { side: "left", diameter: 3 });
    for (const along of [0, limit / 2, limit]) {
      const parts = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side: "left", diameter: 3, along });
      const hole = measuredHole(parts[2]);
      const half = 1.5 + 1.75;
      const rings = textFillComponents(runtime, plain)!.flatMap(({ outer, holes }) => [outer, ...holes]).map((ring) => ring.map((point) => [plain.x + point.x, plain.z + point.z] as [number, number]));
      const plate = new runtime.CrossSection(rings, "EvenOdd");
      const band = runtime.CrossSection.square([1000, 2 * half]).translate([-500, hole.z - half]);
      const near = plate.intersect(band);
      made.push(plate, band, near);
      expect(hole.x + 1.5 + 2).toBeCloseTo(near.bounds().min[0], 1);
      expect(textFillComponents(runtime, parts[2])).toHaveLength(1);
    }
    made.forEach((section) => section.delete());
  });

  it("is held within the side, and the limit shrinks with a bigger hole", () => {
    const source = sized(text(), 12);
    const limit = nameTagKeyringAlongLimit(source, DEFAULT_TEXT_LAYERS, { side: "left", diameter: 4 });
    expect(limit).toBeGreaterThan(0);
    expect(nameTagKeyringAlongLimit(source, DEFAULT_TEXT_LAYERS, { side: "left", diameter: 8 })).toBeCloseTo(limit - 2, 6);
    const far = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side: "left", diameter: 4, along: 500 });
    expect(far[2].textKeyring?.along).toBeCloseTo(limit, 3);
    const back = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side: "left", diameter: 4, along: -500 });
    expect(back[2].textKeyring?.along).toBeCloseTo(-limit, 3);
    expect(keyringAlongLimit(5, 4)).toBe(0);
  });

  it("0 or left out is the middle, as before", () => {
    const source = sized(text(), 12);
    const before = textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side: "right", diameter: 4 });
    expect(textLayerShapes(source, DEFAULT_TEXT_LAYERS, [], { side: "right", diameter: 4, along: 0 })).toEqual(before);
    expect(before[2].textKeyring).not.toHaveProperty("along");
  });

  it("is read back from the stack and built again the same", () => {
    const parts = textLayerShapes(sized(text({ x: 4, z: 9, rotation: 25 }), 12), DEFAULT_TEXT_LAYERS, [], { side: "left", diameter: 3, along: 2.5 });
    const read = textLayersOf([parts[1], parts[2], parts[0]])!;
    expect(read.keyring).toEqual({ side: "left", diameter: 3, along: 2.5 });
    expect(textLayerShapes(read.source, read.layers, read.ids, read.keyring)).toEqual(parts);
  });

  it("is checked when stored", () => {
    expect(normalizeTextKeyring({ side: "left", diameter: 3, offset: 2, along: 4 })).toEqual({ side: "left", diameter: 3, offset: 2, along: 4 });
    expect(normalizeTextKeyring({ side: "left", diameter: 3, offset: 2, along: 0 })).toEqual({ side: "left", diameter: 3, offset: 2 });
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 2, along: 4 })).toBe(true);
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 2, along: "4" })).toBe(false);
    expect(isTextKeyring({ side: "left", diameter: 3, offset: 2, along: 5000 })).toBe(false);
  });
});

describe("the key ring tab along its side in .lyl files (#671)", () => {
  function input(shapes: WorkplaneShape[]): LylProjectExportInput {
    return {
      projectId: "p", projectName: "Name tags", createdAt: 1_700_000_000_000, modifiedAt: 1_700_000_100_000,
      shapes, history: [editorHistoryEntry(shapes, [])], historyIndex: 0, assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE, snapGrid: DEFAULT_SNAP_GRID, placementElevation: 0,
    };
  }

  it("keeps it through saving and opening", async () => {
    const parts = textLayerShapes(sized(text(), 12), DEFAULT_TEXT_LAYERS, [], { side: "top", diameter: 4, along: -3 });
    const restored = await importLylProject(await exportLylProject(input(parts)));
    expect(restored.shapes).toEqual(parts.map(canonicalizeShape));
    expect(textLayersOf(restored.shapes)!.keyring).toEqual({ side: "top", diameter: 4, along: -3 });
  });
});

describe("layerling_layer_text and layerling_layer_icon take it (#671)", () => {
  it("reads along and refuses what is not a number", () => {
    expect(layerTextKeyringArgument({ side: "left", diameter: 4, along: 3 })).toEqual({ keyring: { side: "left", diameter: 4, along: 3 } });
    expect(layerTextKeyringArgument({ side: "left", diameter: 4, along: 0 })).toEqual({ keyring: { side: "left", diameter: 4 } });
    expect(layerTextKeyringArgument({ along: "up" })).toEqual({ error: "keyring.along must be a number of mm" });
  });

  it("is in both tools' schemas", () => {
    for (const name of ["layerling_layer_text", "layerling_layer_icon"]) {
      const tool = (tools as { name: string; inputSchema: { properties: Record<string, { anyOf?: { properties?: Record<string, unknown> }[]; properties?: Record<string, unknown> }> } }[]).find((entry) => entry.name === name)!;
      const keyring = tool.inputSchema.properties.keyring;
      const objects = [keyring, ...(keyring.anyOf ?? [])].filter((entry) => entry.properties);
      expect(objects.some((entry) => entry.properties!.along !== undefined)).toBe(true);
    }
  });
});

/** A closed rectangle as a sketch. */
function rectangle(x0: number, z0: number, x1: number, z1: number): SketchProfile {
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const points: SketchPoint[] = corners.map(([x, z], index) => ({ id: `p${index}`, x, z, mode: "corner" }));
  const segments: SketchSegment[] = corners.map((_, index) => ({ id: `s${index}`, startId: `p${index}`, endId: `p${(index + 1) % 4}`, kind: "line" }));
  return { points, segments };
}

describe("the icon tag's key ring tab along its side (#671)", () => {
  it("moves the hole along the side and keeps it within it", () => {
    const area = rectangle(-10, -5, 10, 5);
    expect(iconKeyringFor(area, 3, "left", 4, true, 2, 3)).toEqual({ side: "left", diameter: 4, x: -17, z: -2, along: 2, ear: true });
    expect(iconKeyringFor(area, 3, "top", 4, true, -4, 3)).toEqual({ side: "top", diameter: 4, x: -4, z: -12, along: -4, ear: true });
    // 10 mm deep, a 3 mm wider bottom layer: 16 mm of side, half of it less the tab's half width (3.75 mm).
    expect(iconKeyringAlongLimit(area, "left", 4, 3)).toBeCloseTo(4.25, 6);
    expect(iconKeyringFor(area, 3, "right", 4, false, 50, 3)).toMatchObject({ z: -4.25, along: 4.25 });
    // Scaled to a width of 40 the side is twice as long.
    expect(iconKeyringAlongLimit(area, "left", 4, 3, 40)).toBeCloseTo(9.25, 6);
  });

  it("gives the same shift to every layer and reads it back", () => {
    const area = rectangle(-10, -5, 10, 5);
    const holes = iconLayerKeyrings(area, ICON_TAG_LAYERS, { side: "left", diameter: 3, along: 1.5 });
    holes.forEach((hole) => expect(hole).toMatchObject({ z: -1.5, along: 1.5 }));
    expect(normalizeSketchKeyring({ side: "left", diameter: 3, x: -12, z: -1.5, along: 1.5 })).toEqual({ side: "left", diameter: 3, x: -12, z: -1.5, along: 1.5 });
    expect(isSketchKeyring({ side: "left", diameter: 3, x: -12, z: -1.5, along: "1" })).toBe(false);
    const bodies = holes.map((hole, index) => ({
      id: `l${index}`, name: `Icon ${index + 1}`, kind: "sketch", color: "#ffffff", x: 0, z: 0, elevation: index, rotation: 0,
      width: 20, depth: 10, height: 1, size: 20, sketchProfile: { ...area, ...(hole ? { keyring: hole } : {}) },
    }) as WorkplaneShape);
    const read = iconLayersOf(bodies);
    if (read) expect(read.keyring).toEqual({ side: "left", diameter: 3, along: 1.5 });
  });
});
