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
 * A vase in its settings: the vase designer, one card with the tabs Form, Pattern and Print. Body shapes, patterns and
 * leaves are tiles, the pattern's height range has two handles, a choice shows the rows that belong to it and changes
 * the vase's settings, the Print tab shows how it prints and lays out the accessories.
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

// A folded card names what is chosen in it beside its title (Print · PLA); the title is the rest.
const title = (header: HTMLElement) => [...header.childNodes]
  .filter((node) => !(node instanceof HTMLElement && node.classList.contains("property-card-summary")))
  .map((node) => node.textContent)
  .join("")
  .trim();
const headers = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>(".property-card-header")].map(title);
const header = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>(".property-card-header")].find((entry) => title(entry) === name)!;
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

function type(input: HTMLInputElement, value: string) {
  act(() => input.focus());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => input.blur());
}

/** The vase designer's tabs, its section headers and its tiles. */
const tab = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>("[role=tab]")].find((entry) => entry.textContent === name)!;
const openTab = (panel: HTMLElement, name: string) => act(() => tab(panel, name).click());
const section = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>(".vase-section-header")].find((entry) => entry.querySelector("span")?.textContent === name)!;
const openSection = (panel: HTMLElement, name: string) => {
  if (section(panel, name).getAttribute("aria-expanded") !== "true") act(() => section(panel, name).click());
};
const tile = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>(".vase-tiles button")].find((entry) => entry.textContent === name);
const buttonNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent === name);

describe("a vase in its settings", () => {
  it("is in the shape library and comes out plain, as a bottle", () => {
    const { shape } = mount();
    expect(shape.kind).toBe("vase");
    expect(shape.vase?.profile).toBe("flasche");
    expect(shape.vase?.effect).toBe("keine");
  });

  it("is one card with three tabs: Form, Pattern and Print", () => {
    const { panel } = mount();
    expect([...panel.querySelectorAll("[role=tab]")].map((entry) => entry.textContent)).toEqual(["Form", "Pattern", "Print"]);
    // The old cards are gone; everything is on the tabs.
    expect(headers(panel)).not.toEqual(expect.arrayContaining(["Form and pattern"]));
    openTab(panel, "Form");
    expect(tab(panel, "Form").getAttribute("aria-selected")).toBe("true");
    expect(tile(panel, "Bottle")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed(panel, "Edit contour")).toBeDefined();
    expect(rangeNamed(panel, "Height")).toBeDefined();
  });

  it("chooses the body shape from its tiles", () => {
    const { panel, calls } = mount();
    openTab(panel, "Form");
    act(() => tile(panel, "Bellied")!.click());
    expect(calls.updates.at(-1)?.vase?.profile).toBe("bauchig");
  });

  it("shows the rows of a choice and changes the vase's settings with it", () => {
    const { panel, calls } = mount();
    openTab(panel, "Form");
    expect(rangeNamed(panel, "Corners")).toBeUndefined();
    choose(selectNamed(panel, "Cross-section")!, "vieleck");
    expect(calls.updates.at(-1)?.vase?.section).toBe("vieleck");
    const polygon = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    openTab(polygon.panel, "Form");
    expect(rangeNamed(polygon.panel, "Corners")).toBeDefined();
  });

  it("chooses a pattern from the gallery and shows its three main sliders and the height range", () => {
    const { panel, calls } = mount();
    openTab(panel, "Pattern");
    expect(tile(panel, "None")?.getAttribute("aria-pressed")).toBe("true");
    expect(panel.querySelector(".vase-zone")).toBeNull();
    act(() => tile(panel, "Leaves")!.click());
    expect(calls.updates.at(-1)?.vase?.effect).toBe("blaetter");
    const leaves = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    openTab(leaves.panel, "Pattern");
    // The leaf shapes as tiles of their own, and only three sliders before Advanced.
    expect(tile(leaves.panel, "Ginkgo")).toBeDefined();
    expect(rangeNamed(leaves.panel, "Leaf size (%)")).toBeDefined();
    expect(rangeNamed(leaves.panel, "Relief height")).toBeDefined();
    expect(rangeNamed(leaves.panel, "Overlap (%)")).toBeDefined();
    expect(rangeNamed(leaves.panel, "Tilt (°)")).toBeUndefined();
    act(() => leaves.panel.querySelector<HTMLButtonElement>(".vase-more")!.click());
    expect(rangeNamed(leaves.panel, "Tilt (°)")).toBeDefined();
    act(() => tile(leaves.panel, "Maple")!.click());
    expect(leaves.calls.updates.at(-1)?.vase?.leafShape).toBe("ahorn");
  });

  it("sets the pattern's height range with two handles, typed numbers or a quick choice; start never passes end", () => {
    const plain = mount().shape;
    const { panel, calls } = mount({ vase: { ...plain.vase!, effect: "waben" } });
    openTab(panel, "Pattern");
    const zone = panel.querySelector<HTMLElement>(".vase-zone")!;
    expect(zone.querySelectorAll("input[type=range]")).toHaveLength(2);
    act(() => buttonNamed(zone, "Rim and foot smooth")!.click());
    expect(calls.updates.at(-1)?.vase?.zoneFrom).toBe(15);
    expect(calls.updates.at(-1)?.vase?.zoneTo).toBe(85);
    const [start, end] = [...zone.querySelectorAll<HTMLInputElement>(".vase-zone-number input")];
    type(start, "30");
    expect(calls.updates.at(-1)?.vase?.zoneFrom).toBe(30);
    // An end typed below the start: start and end swap no further than to meet.
    type(end, "-5");
    expect(calls.updates.at(-1)?.vase?.zoneTo).toBe(0);
    expect(calls.updates.at(-1)?.vase?.zoneFrom).toBe(0);
  });

  it("offers a smooth neck where a lid sits", () => {
    const plain = mount().shape;
    const { panel, calls } = mount({ vase: { ...plain.vase!, body: "hohl", effect: "waben", lidMode: "stuelp" } });
    openTab(panel, "Pattern");
    const smooth = [...panel.querySelectorAll<HTMLButtonElement>(".vase-neck-hint button")][0];
    expect(smooth.textContent).toBe("Keep the neck smooth (pattern up to 91 %)");
    act(() => smooth.click());
    expect(calls.updates.at(-1)?.vase?.zoneTo).toBe(91);
  });

  it("shows how it prints on the Print tab, and the pattern tab leads there", () => {
    const plain = mount().shape;
    const { panel } = mount({ vase: { ...plain.vase!, effect: "blaetter", printFriendly: "nein", body: "hohl", reliefDepth: 2.4 } });
    openTab(panel, "Pattern");
    const badge = panel.querySelector<HTMLButtonElement>(".vase-print-badge")!;
    expect(badge.textContent).toBe("Supports recommended");
    act(() => badge.click());
    expect(tab(panel, "Print").getAttribute("aria-selected")).toBe("true");
    expect(panel.querySelector(".vase-print-verdict")?.textContent).toBe("Supports recommended");
    expect(selectNamed(panel, "Material")?.value).toBe("pla");
  });

  it("lays its accessories out from their section on the Print tab", () => {
    const { panel, calls } = mount();
    openTab(panel, "Print");
    openSection(panel, "Accessories");
    act(() => buttonNamed(panel, "Lay out accessories")!.click());
    expect(calls.accessories).toBe(1);
  });

  it("offers a stopper with its length and an O-ring groove", () => {
    const plain = mount().shape;
    const { panel } = mount({ vase: { ...plain.vase!, body: "hohl", lidMode: "stopfen" } });
    openTab(panel, "Print");
    openSection(panel, "Accessories");
    expect(selectNamed(panel, "Lid")?.value).toBe("stopfen");
    expect(rangeNamed(panel, "Plug length")).toBeDefined();
    expect([...panel.querySelectorAll("label.check-property")].some((row) => row.textContent === "Groove for an O-ring")).toBe(true);
  });

  it("fills the teapot lid's height and the joint up to the vase's height, whichever is typed", () => {
    const plain = mount().shape;
    const teapot = (lidHeight: number) => {
      const opened = mount({ height: 140, vase: { ...plain.vase!, body: "hohl", lidMode: "kanne", lidHeight } });
      openTab(opened.panel, "Print");
      openSection(opened.panel, "Accessories");
      const field = (name: string) => rangeNamed(opened.panel, name)!.querySelector<HTMLInputElement>("input[type=text]")!;
      return { ...opened, lid: field("Lid height"), joint: field("Body up to · lid from") };
    };
    const vase = teapot(35);
    expect(Number(vase.lid.value)).toBe(35);
    expect(Number(vase.joint.value)).toBe(105);
    // The joint typed in: the lid is the rest.
    type(vase.joint, "90");
    expect(vase.calls.updates.at(-1)?.vase?.lidHeight).toBe(50);
    // The lid typed in: the joint follows.
    const typed = teapot(35);
    type(typed.lid, "42");
    expect(typed.calls.updates.at(-1)?.vase?.lidHeight).toBe(42);
    expect(Number(teapot(42).joint.value)).toBe(98);
    // At most seven tenths of the vase is the lid, and both show what is built.
    const tall = teapot(200);
    expect(Number(tall.lid.value)).toBe(98);
    expect(Number(tall.joint.value)).toBe(42);
    type(tall.joint, "10");
    expect(tall.calls.updates.at(-1)?.vase?.lidHeight).toBe(98);
  });
});
