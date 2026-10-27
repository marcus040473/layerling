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
 * A vase in its settings: its measures under Properties, its form and pattern, bottom and wall, accessories and
 * printing on cards of their own; a choice shows the rows that belong to it and changes the vase's settings, and
 * the accessories card lays them out.
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

type Calls = { updates: Array<Partial<WorkplaneShape>>; accessories: number };

/** The settings panel for a vase from the shape library, with these fields. */
function mount(fields: Partial<WorkplaneShape> = {}) {
  const calls: Calls = { updates: [], accessories: 0 };
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "vase")!;
  const shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...fields } as WorkplaneShape;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ShapeInspector, {
      shape,
      snap: DEFAULT_SNAP_GRID,
      snapOpen: false,
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      onUpdate: (patch: Partial<WorkplaneShape>) => calls.updates.push(patch),
      onSnapChange: () => {},
      onSnapOpenChange: () => {},
      onVaseAccessories: () => {
        calls.accessories += 1;
      },
    }));
  });
  return { panel: container, calls, shape };
}

const headers = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>(".property-card-header")].map((header) => header.textContent?.trim());
const header = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>(".property-card-header")].find((entry) => entry.textContent?.trim() === name)!;
const selectNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.select-property")]
  .find((row) => row.querySelector("span")?.textContent === name)
  ?.querySelector("select") ?? undefined;
const rangeNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.range-property")]
  .find((row) => row.querySelector(".range-property-name")?.textContent === name);

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("a vase in its settings", () => {
  it("is in the shape library and comes out plain, as a bottle", () => {
    const { shape } = mount();
    expect(shape.kind).toBe("vase");
    expect(shape.vase?.profile).toBe("flasche");
    expect(shape.vase?.effect).toBe("keine");
  });

  it("has its form, its bottom and wall, its accessories and printing on cards of their own", () => {
    const { panel } = mount();
    expect(headers(panel)).toEqual(expect.arrayContaining(["Form and pattern", "Bottom and wall", "Accessories", "Print"]));
    expect(selectNamed(panel, "Body form")?.value).toBe("flasche");
    expect([...panel.querySelectorAll("button")].some((button) => button.textContent === "Draw the vase")).toBe(true);
  });

  it("shows the rows of a choice and changes the vase's settings with it", () => {
    const { panel, calls } = mount();
    expect(rangeNamed(panel, "Corners")).toBeUndefined();
    choose(selectNamed(panel, "Cross-section")!, "vieleck");
    expect(calls.updates.at(-1)?.vase?.section).toBe("vieleck");
    const polygon = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    expect(rangeNamed(polygon.panel, "Corners")).toBeDefined();
  });

  it("lays its accessories out from their card", () => {
    const { panel, calls } = mount();
    act(() => header(panel, "Accessories").click());
    const button = [...panel.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === "Lay out accessories")!;
    act(() => button.click());
    expect(calls.accessories).toBe(1);
  });
});
