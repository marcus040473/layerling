// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A Gridfinity bin's open sides in its settings (#682): a switch for each side, none on a baseplate
 * or a solid block, an open side's shelf and scoop switches hidden with their settings, and a note
 * under a compartment's label shelf chosen on an open side.
 */
beforeAll(() => {
  // jsdom lays nothing out; the panel only scrolls itself back to the top.
  Element.prototype.scrollTo ??= () => {};
});

/** The settings panel's text for a Gridfinity part with these fields, unmounted again once read. */
function panelText(fields: Partial<WorkplaneShape>) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(ShapeInspector, { shape, snap: DEFAULT_SNAP_GRID, snapOpen: false, workspace: DEFAULT_WORKPLANE_WORKSPACE, onUpdate: () => {}, onSnapChange: () => {}, onSnapOpenChange: () => {} }));
  });
  const text = container.textContent ?? "";
  act(() => root.unmount());
  container.remove();
  return text;
}

const bin = { width: 83.5, depth: 41.5, height: 25.4, gridfinityType: "bin" as const, gridfinityLip: true };

describe("a Gridfinity bin's open sides in its settings", () => {
  it("has a switch for each side and hides an open side's shelf and scoop with their settings", () => {
    const text = panelText({ ...bin, gridfinityOpenFront: true, gridfinityLabelFront: true, gridfinityScoopFront: true });
    for (const side of ["Open at the back", "Open at the front", "Open on the left", "Open on the right"]) expect(text.split(side).length - 1, side).toBe(1);
    expect(text).toContain("Label shelf at the back");
    // The front's shelf and scoop are still set, but neither is built, so their switches and settings go.
    for (const gone of ["Label shelf at the front", "Finger scoop at the front", "Shelf corners", "Scoop radius"]) expect(text, gone).not.toContain(gone);
  });

  it("has no switches on a baseplate or a solid block", () => {
    expect(panelText({ gridfinityType: "baseplate", gridfinityOpenFront: true })).not.toContain("Open at the front");
    expect(panelText({ ...bin, height: 21, gridfinityLip: false, gridfinityFloorHeight: 21 })).not.toContain("Open at the front");
  });

  it("notes that a compartment's label shelf chosen on an open side is left out", () => {
    const text = panelText({ ...bin, gridfinityCompartmentsX: 2, gridfinityOpenFront: true, gridfinityCompartmentLabels: [{ column: 0, row: 0, side: "front" }] });
    expect(text).toContain("This side of the bin is open and has no wall, so the shelf is left out.");
  });
});
