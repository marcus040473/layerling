import { describe, expect, it } from "vitest";
import { exportLylProject, importLylProject, inspectLylProjectPackage, withLylProjectName } from "@/lib/lylProject";
import type { WorkplaneShape } from "@/types/layerling";

const box = {
  id: "box-1",
  name: "Box",
  kind: "box",
  x: 0,
  y: 0,
  z: 0,
  size: 20,
  width: 20,
  depth: 10,
  height: 5,
  rotation: 0,
  color: "#d84a3a",
} as WorkplaneShape;

async function savedPackage(projectName: string) {
  return exportLylProject({
    projectId: "design-1",
    projectName,
    createdAt: Date.UTC(2026, 9, 1),
    modifiedAt: Date.UTC(2026, 9, 2),
    shapes: [box],
    history: [],
    historyIndex: 0,
    assets: [],
    compressionLevel: 1,
  });
}

describe("a renamed design keeps its name in the package it is handed on in (#689)", () => {
  it("writes the card's name into the saved package and leaves the rest as it was", async () => {
    const renamed = await withLylProjectName(await savedPackage("Old name"), "New name");
    const summary = await inspectLylProjectPackage(renamed);
    expect(summary.projectName).toBe("New name");
    expect(summary.createdAt).toBe(Date.UTC(2026, 9, 1));
    const restored = await importLylProject(renamed);
    expect(restored.projectName).toBe("New name");
    expect(restored.shapes.map((shape) => [shape.kind, shape.width, shape.depth, shape.height])).toEqual([["box", 20, 10, 5]]);
  });

  it("hands back a package that already has the name as it is", async () => {
    const saved = await savedPackage("Same");
    expect(await withLylProjectName(saved, "Same")).toEqual(saved);
    expect(await withLylProjectName(saved, "  ")).toEqual(saved);
  });
});
