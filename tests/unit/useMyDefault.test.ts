import { describe, expect, it } from "vitest";
import { DEFAULT_WORKPLANE_WORKSPACE, workspaceWithSavedDefault } from "@/lib/workplaneSettings";

// #754: "Use my default" puts the saved look on a design a file brought with its own.
describe("using the saved default on an open design", () => {
  const mine = { ...DEFAULT_WORKPLANE_WORKSPACE, gridColor: "#3366ff", background: "#102030", showShadows: false };
  const fromFile = { ...DEFAULT_WORKPLANE_WORKSPACE, width: 600, depth: 400, sizePreset: "Custom", gridColor: "#d9a441", gridBlockSize: 20, gridBlockPreset: "Custom" };

  it("takes the colours and the rest, but keeps the plate of the design", () => {
    const next = workspaceWithSavedDefault(fromFile, mine);
    expect(next.gridColor).toBe("#3366ff");
    expect(next.background).toBe("#102030");
    expect(next.showShadows).toBe(false);
    expect(next.width).toBe(600);
    expect(next.depth).toBe(400);
    expect(next.sizePreset).toBe("Custom");
  });

  // #850: the printer the user prints on comes along, with its plate.
  it("takes the printer of the saved default with its plate", () => {
    const printing = { ...mine, printer: "snapmaker-u1", sizePreset: "Custom", width: 270, depth: 270 };
    const next = workspaceWithSavedDefault(fromFile, printing);
    expect(next.printer).toBe("snapmaker-u1");
    expect(next.width).toBe(270);
    expect(next.depth).toBe(270);
  });

  it("keeps the printer of the design when the saved default has none", () => {
    const next = workspaceWithSavedDefault({ ...fromFile, printer: "prusa-mk4" }, mine);
    expect(next.printer).toBe("prusa-mk4");
    expect(next.width).toBe(600);
  });

  it("takes the grid spacing of the saved default when the units are the same", () => {
    expect(workspaceWithSavedDefault(fromFile, mine).gridBlockSize).toBe(mine.gridBlockSize);
  });

  it("keeps the design's grid spacing and units when the saved default counts in other units", () => {
    const imperial = { ...mine, units: "Imperial", gridBlockSize: 25.4, gridBlockPreset: "1 in" };
    const next = workspaceWithSavedDefault(fromFile, imperial);
    expect(next.units).toBe(fromFile.units);
    expect(next.gridBlockSize).toBe(20);
    expect(next.gridColor).toBe("#3366ff");
  });
});
