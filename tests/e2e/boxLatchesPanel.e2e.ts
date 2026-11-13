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
 * The box generator's latches in its settings: how many per side, the sides, the clip's width and grip, shown only once
 * there are latches; the clip as a part of its own with only its latch settings; and the button that lays out the clips.
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

function mount(fields: Partial<WorkplaneShape>, onUpdate: (patch: Partial<WorkplaneShape>) => void = () => {}, onMakeBoxLatches?: () => void) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "boxGenerator")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ShapeInspector, { shape, snap: DEFAULT_SNAP_GRID, snapOpen: false, workspace: DEFAULT_WORKPLANE_WORKSPACE, onUpdate, onSnapChange: () => {}, onSnapOpenChange: () => {}, onMakeBoxLatches }));
  });
  return container;
}

const row = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")].find((label) => label.querySelector(".range-property-name")?.textContent === name);
const field = (panel: HTMLElement, name: string) => row(panel, name)!.querySelector<HTMLInputElement>("input:not([type=range])")!;
const select = (panel: HTMLElement, option: string) => [...panel.querySelectorAll<HTMLSelectElement>("select")].find((one) => [...one.options].some((entry) => entry.value === option));
const button = (panel: HTMLElement, text: string) => [...panel.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === text);

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

function choose(element: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("the box generator's latches in its settings", () => {
  it("offers latches per side, and the sides, width and grip only once there are latches", () => {
    const panel = mount({});
    expect(field(panel, "Latches per side").value).toBe("0");
    expect(select(panel, "leftRight")).toBeUndefined();
    expect(row(panel, "Clip width")).toBeUndefined();
    expect(button(panel, "Matching clips beside it")).toBeUndefined();

    const latched = mount({ boxLatches: 2 }, () => {}, () => {});
    expect(select(latched, "leftRight")!.value).toBe("frontBack");
    expect(field(latched, "Clip width").value).toBe("12.00");
    expect(field(latched, "Clip grip").value).toBe("0.30");
    expect(row(latched, "Latches per side")!.nextElementSibling?.textContent).toMatch(/^4 latch\(es\): a pin with two cheeks/);
    expect(button(latched, "Matching clips beside it")).toBeTruthy();
  });

  it("writes each change as one patch, and lays out the clips from its button", () => {
    const patches: Partial<WorkplaneShape>[] = [];
    let made = 0;
    const panel = mount({ boxLatches: 1 }, (patch) => patches.push(patch), () => {
      made += 1;
    });
    type(field(panel, "Latches per side"), "2");
    choose(select(panel, "leftRight")!, "all");
    type(field(panel, "Clip width"), "16");
    type(field(panel, "Clip grip"), "0.4");
    type(field(panel, "Latches per side"), "0");
    expect(patches).toEqual([{ boxLatches: 2 }, { boxLatchSides: "all" }, { boxLatchWidth: 16 }, { boxLatchGrip: 0.4 }, { boxLatches: undefined }]);
    act(() => button(panel, "Matching clips beside it")!.click());
    expect(made).toBe(1);
  });

  it("says why there are no latches with another lid style", () => {
    const panel = mount({ boxLatches: 2, boxLidStyle: "overlap" });
    expect(row(panel, "Latches per side")!.nextElementSibling?.textContent).toBe("Latches need the lid style Rests on top. No latches are made.");
  });

  it("shows the clip with only its latch settings, and gives a box made from a clip the generator's size", () => {
    const patches: Partial<WorkplaneShape>[] = [];
    const panel = mount({ boxPart: "latch", boxLatches: 2, width: 21.6, depth: 4.1, height: 12 }, (patch) => patches.push(patch));
    expect(select(panel, "latch")!.value).toBe("latch");
    expect(row(panel, "Width")).toBeUndefined();
    expect(row(panel, "Latches per side")).toBeUndefined();
    expect(row(panel, "Clip width")).toBeTruthy();
    expect(row(panel, "Clip grip")).toBeTruthy();
    choose(select(panel, "latch")!, "box");
    expect(patches[0]).toMatchObject({ boxPart: "box", width: 126, depth: 90, height: 48 });
  });
});
