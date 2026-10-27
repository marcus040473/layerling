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
 * A Gridfinity tray in its settings (#837): Tray under Type, its size in mm in place of the grid units, the bin's
 * wall, floor, open sides, shelves and scoops, and none of the lip, magnets, half-size grid, drawer or padding; its
 * floor starts at 1.2 mm.
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
function mount(fields: Partial<WorkplaneShape>, onUpdate: (patch: Partial<WorkplaneShape>) => void = () => {}, workspace = DEFAULT_WORKPLANE_WORKSPACE) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ShapeInspector, { shape, snap: DEFAULT_SNAP_GRID, snapOpen: false, workspace, onUpdate, onSnapChange: () => {}, onSnapOpenChange: () => {} }));
  });
  return container;
}

const rowNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")].find((row) => row.querySelector(".range-property-name")?.textContent === name);
const field = (panel: HTMLElement, name: string) => rowNamed(panel, name)!.querySelector<HTMLInputElement>("input:not([type=range])")!;
const slider = (panel: HTMLElement, name: string) => rowNamed(panel, name)!.querySelector<HTMLInputElement>("input[type=range]")!;
const names = (panel: HTMLElement) => [...panel.querySelectorAll(".range-property-name, .check-property span, label")].map((node) => node.textContent?.trim() ?? "");
const typeSelect = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLSelectElement>("select")].find((select) => [...select.options].some((option) => option.value === "baseplate"))!;

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const bin = { width: 83.5, depth: 41.5, height: 25.4, gridfinityType: "bin" as const, gridfinityLip: true };
const tray = { width: 80, depth: 40, height: 20, gridfinityType: "tray" as const };

describe("a Gridfinity tray in its settings", () => {
  it("offers Tray under Type beside Bin and Baseplate, with its own hint", () => {
    const panel = mount(tray);
    expect([...typeSelect(panel).options].map((option) => option.textContent)).toEqual(["Bin", "Baseplate", "Tray"]);
    expect(typeSelect(panel).value).toBe("tray");
    expect(panel.textContent).toContain("A tray of any size in mm with a flat bottom");
  });

  it("shows its size in mm in place of the grid units, and the bin's settings for its inside without the lip, magnets or grid", () => {
    const panel = mount({ ...tray, gridfinityScoopFront: true });
    expect(field(panel, "Length").value).toBe("40.00");
    expect(field(panel, "Width").value).toBe("80.00");
    expect(field(panel, "Height").value).toBe("20.00");
    expect([slider(panel, "Width").min, slider(panel, "Width").max, slider(panel, "Height").min, slider(panel, "Height").max]).toEqual(["10", "252", "3", "140"]);
    for (const name of ["Wall thickness", "Floor height", "Scoop radius"]) expect(rowNamed(panel, name), name).toBeDefined();
    const text = names(panel).join("|");
    for (const name of ["Units across", "Units deep", "Units high", "Half-size grid", "Stacking lip", "Lip chamfer", "Magnet holes", "Drawer width", "Padding at the back", "Corner radius"]) expect(text, name).not.toContain(name);
    for (const name of ["Open at the front", "Label shelf at the back", "Finger scoop at the front"]) expect(text, name).toContain(name);
  });

  it("starts its floor row at 1.2 mm, a bin's at 5.95", () => {
    expect(slider(mount(tray), "Floor height").min).toBe("1.2");
    expect(slider(mount(bin), "Floor height").min).toBe("5.95");
  });

  it("shows no reset arrow on a new tray's floor, held to a tray made new", () => {
    expect(rowNamed(mount({ gridfinityType: "tray", width: 80, depth: 40, height: 20 }), "Floor height")!.querySelector(".property-reset")).toBeNull();
  });

  it("takes a raised floor back to the tray's 1.2 mm, not a bin's 5.95", () => {
    const patches: Array<Partial<WorkplaneShape>> = [];
    const panel = mount({ gridfinityType: "tray", width: 80, depth: 40, height: 20, gridfinityFloorHeight: 5 }, (patch) => patches.push(patch));
    act(() => rowNamed(panel, "Floor height")!.querySelector<HTMLButtonElement>(".property-reset")!.click());
    expect(patches).toEqual([{ gridfinityFloorHeight: 1.2 }]);
  });

  it("holds a bin to a bin made new when Tray is the type saved as the default", () => {
    const trayDefault = { ...DEFAULT_WORKPLANE_WORKSPACE, shapeCustomizations: { ...DEFAULT_WORKPLANE_WORKSPACE.shapeCustomizations, gridfinity: { gridfinityType: "tray" as const } } };
    expect(rowNamed(mount(bin, () => {}, trayDefault), "Floor height")!.querySelector(".property-reset")).toBeNull();
  });

  it("writes a width typed in as it is, in mm, as one change", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    type(field(mount(tray, (patch) => updates.push(patch)), "Width"), "92.5");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ width: 92.5 });
  });

  it("turns a bin into a tray in one change that keeps its box", () => {
    const updates: Partial<WorkplaneShape>[] = [];
    choose(typeSelect(mount(bin, (patch) => updates.push(patch))), "tray");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ gridfinityType: "tray", width: 83.5, depth: 41.5, height: 25.4 });
  });
});
