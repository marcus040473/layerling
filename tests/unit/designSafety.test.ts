import { describe, expect, it } from "vitest";
// @ts-expect-error the tool list is a plain .mjs module
import { tools } from "../../scripts/layerling-mcp-tools.mjs";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { meshReachAlong } from "@/lib/editorMeshCore";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import { displayShapeName, makeShapeFromAsset, renamedShapeName, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

function box(id: string, name?: string): WorkplaneShape {
  const shape = makeShapeFromAsset(toolbarShapeAssets.find((asset) => asset.id === "box")!);
  return canonicalizeShape({ ...shape, id, ...(name === undefined ? {} : { name }) });
}

async function roundTrip(shapes: WorkplaneShape[]) {
  const bytes = await exportLylProject({
    projectId: "safety",
    projectName: "Safety",
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
  return importLylProject(bytes);
}

describe("a design with an emptied object name", () => {
  it("opens again, and the object shows its default name", async () => {
    // Clearing the name field stores "", which shows the shape's default name again.
    const original = box("b1");
    expect(renamedShapeName(original, "   ")).toBe("");
    const cleared = canonicalizeShape({ ...original, name: "" });
    const restored = await roundTrip([cleared, box("b2", "Lid")]);
    const byId = new Map(restored.shapes.map((shape) => [shape.id, shape]));
    expect(byId.get("b1")!.name).toBe("");
    expect(displayShapeName(byId.get("b1")!)).toBe(displayShapeName(original));
    expect(byId.get("b2")!.name).toBe("Lid");
  });
});

describe("meshReachAlong", () => {
  it("finds the farthest vertex along a direction", () => {
    const mesh = { vertices: [[0, 0, 0], [1, 2, 3], [-4, 5, 0]] as [number, number, number][] };
    expect(meshReachAlong(mesh, { x: 0, y: 1, z: 0 })).toBe(5);
    expect(meshReachAlong(mesh, { x: 1, y: 0, z: 0 })).toBe(1);
    expect(meshReachAlong({ vertices: [] }, { x: 1, y: 0, z: 0 })).toBe(-Infinity);
  });

  it("copes with a large import, where spreading into Math.max overflows the stack", () => {
    const vertices = Array.from({ length: 300_000 }, (_, index) => [index % 97, index / 1000, 0] as [number, number, number]);
    expect(() => Math.max(...vertices.map(([, y]) => y))).toThrow(RangeError);
    expect(meshReachAlong({ vertices }, { x: 0, y: 1, z: 0 })).toBeCloseTo(299.999);
  });
});

type Tool = { name: string; inputSchema: { properties: Record<string, { exclusiveMinimum?: number }> } };

describe("MCP sizes", () => {
  it("create_shape and update_object ask for sizes above 0", () => {
    for (const name of ["layerling_create_shape", "layerling_update_object"]) {
      const tool = (tools as Tool[]).find((entry) => entry.name === name)!;
      for (const key of ["width", "depth", "height", "size"]) {
        expect(tool.inputSchema.properties[key].exclusiveMinimum, `${name}.${key}`).toBe(0);
      }
    }
  });
});
