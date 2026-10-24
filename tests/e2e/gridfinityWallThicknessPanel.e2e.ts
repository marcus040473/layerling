// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A Gridfinity bin's wall thickness in its settings (#455): a row on a bin with or without the lip, none on a
 * baseplate, a solid block or a bin open on every side; it stays at the thickest wall, which builds the bin solid and
 * hides the floor row, and a value typed in is one change, from 0.8 mm up to where the walls meet.
 */
beforeAll(() => {
  // jsdom lays nothing out; the panel only scrolls itself back to the top.
  Element.prototype.scrollTo ??= () => {};
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

/** The settings panel for a Gridfinity part with these fields. */
function mount(fields: Partial<WorkplaneShape>, onUpdate: (patch: Partial<WorkplaneShape>) => void = () => {}) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ShapeInspector, { shape, snap: DEFAULT_SNAP_GRID, snapOpen: false, workspace: DEFAULT_WORKPLANE_WORKSPACE, onUpdate, onSnapChange: () => {}, onSnapOpenChange: () => {} }));
  });
  return container;
}

const rowNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")].find((row) => row.querySelector(".range-property-name")?.textContent === name);
const field = (panel: HTMLElement) => rowNamed(panel, "Wall thickness")!.querySelector<HTMLInputElement>("input:not([type=range])")!;

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

const bin = { width: 83.5, depth: 41.5, height: 25.4, gridfinityType: "bin" as const, gridfinityLip: true };

describe("a Gridfinity bin's wall thickness in its settings", () => {
  it("has a row on a bin with the lip, showing 0.95 mm to begin with", () => {
    expect(field(mount(bin)).value).toBe("0.95");
  });

  it("has a row on a bin without the lip", () => {
    expect(field(mount({ ...bin, height: 21, gridfinityLip: false, gridfinityWallThickness: 2.5 })).value).toBe("2.50");
  });

  it("has no row on a baseplate, a solid block or a bin open on every side", () => {
    expect(rowNamed(mount({ gridfinityType: "baseplate", width: 84, depth: 42, height: 5 }), "Wall thickness")).toBeUndefined();
    expect(rowNamed(mount({ ...bin, height: 21, gridfinityLip: false, gridfinityFloorHeight: 21 }), "Wall thickness")).toBeUndefined();
    expect(rowNamed(mount({ ...bin, gridfinityOpenBack: true, gridfinityOpenFront: true, gridfinityOpenLeft: true, gridfinityOpenRight: true }), "Wall thickness")).toBeUndefined();
  });

  it("stays at the thickest wall, which builds the bin solid, and hides the floor row then", () => {
    const panel = mount({ ...bin, gridfinityWallThickness: 99 });
    expect(field(panel).value).toBe("20.75");
    expect(rowNamed(panel, "Floor height")).toBeUndefined();
    expect(rowNamed(mount(bin), "Floor height")).toBeDefined();
  });

  it("writes a wall typed in as one change, from 0.8 mm up to where the walls meet", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    const panel = mount(bin, (patch) => updates.push(patch));
    type(field(panel), "2.5");
    expect(updates).toEqual([{ gridfinityWallThickness: 2.5 }]);
    type(field(panel), "0.3");
    expect(updates.slice(1)).toEqual([{ gridfinityWallThickness: 0.8 }]);
    type(field(panel), "50");
    expect(updates.slice(2)).toEqual([{ gridfinityWallThickness: 20.75 }]);
  });
});
