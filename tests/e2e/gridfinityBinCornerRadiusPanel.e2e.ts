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
 * A Gridfinity bin's corner radius in its settings (#856): a row on a bin with a closed corner, none where every
 * corner is square on an open side, on a baseplate (which has its own) or on a tray, and a value typed in is one
 * change, at most 3.75 mm. The row has the baseplate's label, so it is found by that label and told apart by the field it writes.
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

const rows = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")].filter((row) => row.querySelector(".range-property-name")?.textContent === "Corner radius");
const field = (panel: HTMLElement) => rows(panel)[0].querySelector<HTMLInputElement>("input:not([type=range])")!;

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

const bin = { width: 83.5, depth: 41.5, height: 25.4, gridfinityType: "bin" as const, gridfinityLip: true };

describe("a Gridfinity bin's corner radius in its settings", () => {
  it("has one row on a bin, showing the specification's 3.75 mm to begin with", () => {
    const panel = mount(bin);
    expect(rows(panel)).toHaveLength(1);
    expect(field(panel).value).toBe("3.75");
  });

  it("shows the radius a bin has", () => {
    expect(field(mount({ ...bin, gridfinityBinCornerRadius: 1.2 })).value).toBe("1.20");
  });

  it("sits under the magnet holes and before the wall", () => {
    const text = mount(bin).textContent ?? "";
    expect(text.indexOf("Corner radius")).toBeGreaterThan(text.indexOf("Magnet holes"));
    expect(text.indexOf("Magnet holes")).toBeGreaterThan(-1);
    expect(text.indexOf("Corner radius")).toBeLessThan(text.indexOf("Wall thickness"));
  });

  it("has no row where every corner is square on an open side, and one where a corner is left", () => {
    expect(rows(mount({ ...bin, gridfinityOpenBack: true, gridfinityOpenFront: true }))).toHaveLength(0);
    expect(rows(mount({ ...bin, gridfinityOpenBack: true }))).toHaveLength(1);
  });

  it("has no row on a tray, and on a baseplate only the plate's own, which writes the plate's field", () => {
    expect(rows(mount({ gridfinityType: "tray", width: 80, depth: 40, height: 20, gridfinityBinCornerRadius: 1 }))).toHaveLength(0);
    const updates: Partial<WorkplaneShape>[] = [];
    const panel = mount({ gridfinityType: "baseplate", width: 84, depth: 42, height: 5, gridfinityBinCornerRadius: 1 }, (patch) => updates.push(patch));
    expect(rows(panel)).toHaveLength(1);
    expect(field(panel).value).toBe("4.00");
    type(field(panel), "2");
    expect(updates).toEqual([{ gridfinityCornerRadius: 2 }]);
  });

  it("writes a radius typed in as one change, at most 3.75 mm", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    const panel = mount(bin, (patch) => updates.push(patch));
    type(field(panel), "0");
    expect(updates).toEqual([{ gridfinityBinCornerRadius: 0 }]);
    type(field(panel), "9");
    expect(updates.slice(1)).toEqual([{ gridfinityBinCornerRadius: 3.75 }]);
  });
});
