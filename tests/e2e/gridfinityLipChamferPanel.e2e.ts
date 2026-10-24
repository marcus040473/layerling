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
 * A Gridfinity bin's lip chamfer in its settings (#780): a row under the stacking lip on a bin with
 * the lip, none without it or on a baseplate, and a value typed in is one change, at most 1 mm.
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
const field = (panel: HTMLElement) => rowNamed(panel, "Lip chamfer")!.querySelector<HTMLInputElement>("input:not([type=range])")!;

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

const bin = { width: 83.5, depth: 41.5, height: 25.4, gridfinityType: "bin" as const, gridfinityLip: true };

describe("a Gridfinity bin's lip chamfer in its settings", () => {
  it("has a row on a bin with the lip, showing no chamfer to begin with", () => {
    expect(field(mount(bin)).value).toBe("0.00");
  });

  it("shows the chamfer a bin has", () => {
    expect(field(mount({ ...bin, gridfinityLipChamfer: 0.25 })).value).toBe("0.25");
  });

  it("has no row on a bin without the lip", () => {
    expect(rowNamed(mount({ ...bin, height: 21, gridfinityLip: false, gridfinityLipChamfer: 0.25 }), "Lip chamfer")).toBeUndefined();
  });

  it("has no row on a baseplate", () => {
    expect(rowNamed(mount({ gridfinityType: "baseplate", width: 84, depth: 42, height: 5, gridfinityLipChamfer: 0.25 }), "Lip chamfer")).toBeUndefined();
  });

  it("writes a chamfer typed in as one change, at most 1 mm", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    const panel = mount(bin, (patch) => updates.push(patch));
    type(field(panel), "0.25");
    expect(updates).toEqual([{ gridfinityLipChamfer: 0.25 }]);
    type(field(panel), "3");
    expect(updates.slice(1)).toEqual([{ gridfinityLipChamfer: 1 }]);
  });
});
