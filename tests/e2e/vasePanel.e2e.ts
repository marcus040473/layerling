// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { normalizeVaseSettings } from "@/lib/vaseSettings";
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

  it("says what the body is for - vase, plant pot or lampshade - and shows what belongs to that use on the Form tab", () => {
    const { panel, calls } = mount();
    openTab(panel, "Form");
    const use = (target: HTMLElement, name: string) => [...target.querySelectorAll<HTMLButtonElement>(".vase-purpose-tiles button")].find((entry) => entry.textContent === name)!;
    expect([...panel.querySelectorAll(".vase-purpose-tiles button")].map((entry) => entry.textContent)).toEqual(["Vase", "Plant pot", "Lampshade"]);
    expect(use(panel, "Vase").getAttribute("aria-checked")).toBe("true");
    expect(panel.querySelector(".vase-use")).toBeNull();
    // A lampshade: hollow, hanging, with a carrier of three spokes, a lampshade's form, and the size a shade has.
    act(() => use(panel, "Lampshade").click());
    const lamp = calls.updates.at(-1)!;
    expect(lamp.vase).toMatchObject({ purpose: "lampe", body: "hohl", lamp: "haengend", lampSpokes: 3, profile: "schirmKegel", wall: 1.2 });
    expect(lamp.height).toBe(160);
    expect(Math.max(lamp.width!, lamp.depth!)).toBeCloseTo(180, 0);
    const shade = mount({ ...lamp });
    openTab(shade.panel, "Form");
    expect(use(shade.panel, "Lampshade").getAttribute("aria-checked")).toBe("true");
    for (const name of ["Cone", "Bell", "Dome", "Lantern", "Drum"]) expect(tile(shade.panel, name), name).toBeDefined();
    expect(tile(shade.panel, "Bottle")).toBeUndefined();
    // The socket and its carrier, in a block of their own under the body forms.
    const block = shade.panel.querySelector<HTMLElement>(".vase-use")!;
    expect(block.querySelector(".vase-use-title")?.textContent).toBe("Socket");
    expect(selectNamed(block, "Lampshade")).toBeDefined();
    expect(selectNamed(block, "Socket")).toBeDefined();
    expect(rangeNamed(block, "Spokes")).toBeDefined();
    expect(rangeNamed(block, "Ring width")).toBeDefined();
    expect(rangeNamed(block, "Spoke width")).toBeDefined();
    act(() => tile(shade.panel, "Drum")!.click());
    expect(shade.calls.updates.at(-1)?.vase?.profile).toBe("schirmTrommel");
    // The bulb the print check holds against the shade: common ones, or one's own measures.
    expect([...selectNamed(block, "Check the bulb")!.options].map((option) => option.textContent)).toEqual(["Do not check", "Bulb A60 (Ø 60 mm)", "Drop G45 (Ø 45 mm)", "Candle C35 (Ø 35 mm)", "Globe G95 (Ø 95 mm)", "Globe G125 (Ø 125 mm)", "Own size"]);
    expect(rangeNamed(block, "Bulb diameter")).toBeUndefined();
    choose(selectNamed(block, "Check the bulb")!, "g95");
    expect(shade.calls.updates.at(-1)?.vase).toMatchObject({ lampBulb: "g95", lampBulbDiameter: 95, lampBulbLength: 140 });
    // A shade on a base: the base's form and size, its light, the cable's slot, and a button that lays the base out.
    choose(selectNamed(block, "Lampshade")!, "sockel");
    expect(shade.calls.updates.at(-1)?.vase?.lamp).toBe("sockel");
    const standing = mount({ ...lamp, vase: { ...lamp.vase!, lamp: "sockel" } });
    openTab(standing.panel, "Form");
    const baseBlock = standing.panel.querySelector<HTMLElement>(".vase-use")!;
    expect([...selectNamed(baseBlock, "Base form")!.options].map((option) => option.textContent)).toEqual(["Belly", "Cylinder", "Cone", "Goblet", "Bell", "Step"]);
    expect([...selectNamed(baseBlock, "Light")!.options].map((option) => option.textContent)).toEqual(["LED disc", "Screw socket"]);
    for (const name of ["Base height", "Foot width (%)", "Grooves on the base", "LED disc Ø", "LED disc height"]) expect(rangeNamed(baseBlock, name), name).toBeDefined();
    expect(rangeNamed(baseBlock, "Spokes")).toBeUndefined();
    choose(selectNamed(baseBlock, "Light")!, "fassung");
    expect(standing.calls.updates.at(-1)?.vase?.lampBaseLight).toBe("fassung");
    act(() => buttonNamed(baseBlock, "Lay out the base")!.click());
    expect(standing.calls.accessories).toBe(1);
    // A shade for the wall: the screws of its back plate, and a button that lays the plate out.
    const wall = mount({ ...lamp, vase: { ...lamp.vase!, lamp: "wand" } });
    openTab(wall.panel, "Form");
    const wallBlock = wall.panel.querySelector<HTMLElement>(".vase-use")!;
    expect(selectNamed(wallBlock, "Lampshade")!.value).toBe("wand");
    expect(rangeNamed(wallBlock, "Screw hole Ø")).toBeDefined();
    expect(rangeNamed(wallBlock, "Spokes")).toBeUndefined();
    act(() => buttonNamed(wallBlock, "Lay out the wall plate")!.click());
    expect(wall.calls.accessories).toBe(1);
    // A plant pot: drain holes and a saucer, a pot's form; its drain holes stand in the block.
    act(() => use(shade.panel, "Plant pot").click());
    const pot = shade.calls.updates.at(-1)!;
    expect(pot.vase).toMatchObject({ purpose: "topf", body: "hohl", lamp: "keine", drainHoles: 3, saucerMode: "schale", profile: "topfKlassik" });
    const planter = mount({ ...lamp, ...pot });
    openTab(planter.panel, "Form");
    expect(tile(planter.panel, "Classic")).toBeDefined();
    expect(planter.panel.querySelector(".vase-use .vase-use-title")?.textContent).toBe("Drainage");
    expect(rangeNamed(planter.panel.querySelector<HTMLElement>(".vase-use")!, "Number of holes")).toBeDefined();
    // Back to a vase: no lamp, a vase's form; a size one has set oneself is kept.
    act(() => use(planter.panel, "Vase").click());
    const back = planter.calls.updates.at(-1)!;
    expect(back.vase).toMatchObject({ purpose: "vase", lamp: "keine", profile: "flasche" });
    expect(back.height).toBeUndefined();
  });

  it("gives a plant pot blocks of its own: drainage, saucer, inner pot and wall mount", () => {
    const pot = { purpose: "topf", body: "hohl", profile: "topfKlassik", drainHoles: 3, saucerMode: "schale" };
    const { panel, calls } = mount({ vase: { ...normalizeVaseSettings({}), ...pot } });
    openTab(panel, "Form");
    const blocks = () => [...panel.querySelectorAll<HTMLElement>(".vase-use")];
    const block = (name: string) => blocks().find((entry) => entry.querySelector(".vase-use-title")?.textContent === name)!;
    expect(blocks().map((entry) => entry.querySelector(".vase-use-title")?.textContent)).toEqual(["Drainage", "Saucer", "Inner pot", "Wall mount"]);
    // The drain holes are switched on and off; how many and how wide is set beside the switch.
    const holes = [...block("Drainage").querySelectorAll<HTMLLabelElement>("label.check-property")].find((entry) => entry.textContent?.includes("Drain holes"))!.querySelector("input")!;
    expect(holes.checked).toBe(true);
    expect(rangeNamed(block("Drainage"), "Number of holes")).toBeDefined();
    expect(rangeNamed(block("Drainage"), "Hole diameter")).toBeDefined();
    act(() => holes.click());
    expect(calls.updates.at(-1)?.vase?.drainHoles).toBe(0);
    const tight = mount({ vase: { ...normalizeVaseSettings({}), ...pot, drainHoles: 0 } });
    openTab(tight.panel, "Form");
    const tightBlock = [...tight.panel.querySelectorAll<HTMLElement>(".vase-use")][0];
    expect(rangeNamed(tightBlock, "Number of holes")).toBeUndefined();
    act(() => tightBlock.querySelector<HTMLInputElement>("label.check-property input")!.click());
    expect(tight.calls.updates.at(-1)?.vase?.drainHoles).toBe(3);
    // The saucer: a dish (a plate, or hugging the pot; with a slanted rim), a bowl docked under the pot, or hidden.
    expect([...selectNamed(block("Saucer"), "Saucer")!.options].map((option) => option.textContent)).toEqual(["None", "Bowl", "Docked under the pot", "Hidden in the foot"]);
    expect([...selectNamed(block("Saucer"), "Dish form")!.options].map((option) => option.textContent)).toEqual(["Plate", "Hugging the pot"]);
    for (const name of ["Saucer height", "Slanted rim", "Gap to the pot", "Saucer wall"]) expect(rangeNamed(block("Saucer"), name), name).toBeDefined();
    choose(selectNamed(block("Saucer"), "Dish form")!, "huelle");
    expect(calls.updates.at(-1)?.vase?.saucerForm).toBe("huelle");
    choose(selectNamed(block("Saucer"), "Saucer")!, "andock");
    expect(calls.updates.at(-1)?.vase?.saucerMode).toBe("andock");
    const docked = mount({ vase: { ...normalizeVaseSettings({}), ...pot, saucerMode: "andock", saucerHold: "magnet" } });
    openTab(docked.panel, "Form");
    const dock = [...docked.panel.querySelectorAll<HTMLElement>(".vase-use")][1];
    expect([...selectNamed(dock, "Held by")!.options].map((option) => option.textContent)).toEqual(["Pins", "Magnets"]);
    for (const name of ["Saucer height", "Magnet Ø", "Magnet height"]) expect(rangeNamed(dock, name), name).toBeDefined();
    expect(rangeNamed(dock, "Slanted rim")).toBeUndefined();
    // The inner pot and the wall mount; one button lays all the parts out.
    expect([...selectNamed(block("Inner pot"), "Inner pot")!.options].map((option) => option.textContent)).toEqual(["None", "Plant insert", "Self-watering", "Flower frog", "Water tube"]);
    choose(selectNamed(block("Inner pot"), "Inner pot")!, "pflanze");
    expect(calls.updates.at(-1)?.vase?.insertMode).toBe("pflanze");
    expect([...selectNamed(block("Wall mount"), "Wall mount")!.options].map((option) => option.textContent)).toEqual(["None", "Wall rail"]);
    expect(rangeNamed(block("Wall mount"), "Screw hole Ø")).toBeUndefined();
    choose(selectNamed(block("Wall mount"), "Wall mount")!, "schiene");
    expect(calls.updates.at(-1)?.vase?.wallMount).toBe("schiene");
    const hung = mount({ vase: { ...normalizeVaseSettings({}), ...pot, wallMount: "schiene" } });
    openTab(hung.panel, "Form");
    expect(rangeNamed([...hung.panel.querySelectorAll<HTMLElement>(".vase-use")][3], "Screw hole Ø")).toBeDefined();
    act(() => buttonNamed(hung.panel, "Lay out accessories")!.click());
    expect(hung.calls.accessories).toBe(1);
    // A vase keeps saucer, insert and wall mount with its accessories on the Print tab.
    const vase = mount({ vase: { ...normalizeVaseSettings({}), body: "hohl" } });
    openTab(vase.panel, "Form");
    expect(vase.panel.querySelector(".vase-use")).toBeNull();
    openTab(vase.panel, "Print");
    openSection(vase.panel, "Accessories");
    expect(selectNamed(vase.panel, "Saucer")).toBeDefined();
    expect(selectNamed(vase.panel, "Insert")).toBeDefined();
    expect(selectNamed(vase.panel, "Wall mount")).toBeDefined();
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

  it("takes one's own picture or a text as the pattern: a button to load, a text field and how it is put on", () => {
    const { panel, calls } = mount();
    openTab(panel, "Pattern");
    // The last tile of the gallery; nothing to load or type before it is chosen.
    const tiles = [...panel.querySelectorAll<HTMLButtonElement>(".vase-pattern-tiles button")];
    expect(tiles.at(-1)?.textContent).toBe("Picture or text");
    expect(panel.querySelector(".vase-own-picture")).toBeNull();
    act(() => tile(panel, "Picture or text")!.click());
    expect(calls.updates.at(-1)?.vase?.effect).toBe("bild");
    // A quarter of the way round, large enough to read.
    expect(calls.updates.at(-1)?.vase?.patternCount).toBe(4);
    const own = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    openTab(own.panel, "Pattern");
    const block = own.panel.querySelector<HTMLElement>(".vase-own-picture")!;
    expect(buttonNamed(block, "Load your own image…")).toBeDefined();
    expect(block.querySelector("input[type=file]")?.getAttribute("accept")).toBe("image/*");
    expect(block.querySelector(".cylinder-wrap-hint")?.textContent).toBe("Load a picture or type a text. Light places stand out, dark ones lie deeper.");
    // The text, how it is put on, then the three sliders; stretching and turning inside out under Advanced.
    const text = [...own.panel.querySelectorAll<HTMLLabelElement>("label.text-property")].find((row) => row.querySelector("span")?.textContent === "Text")!.querySelector("input")!;
    expect(text.maxLength).toBe(60);
    const placement = selectNamed(own.panel, "Placement")!;
    expect([...placement.options].map((option) => option.textContent)).toEqual(["All over", "A band all round", "Once"]);
    expect(rangeNamed(own.panel, "Relief height")).toBeDefined();
    expect(rangeNamed(own.panel, "Repeats around")).toBeDefined();
    expect(rangeNamed(own.panel, "Lean (°)")).toBeDefined();
    choose(placement, "einmal");
    expect(own.calls.updates.at(-1)?.vase?.patternFit).toBe("einmal");
    type(text, "Anna");
    expect(own.calls.updates.at(-1)?.vase?.patternText).toBe("Anna");
    expect(own.panel.querySelector(".vase-zone")).not.toBeNull();
  });

  it("offers the worked-out patterns as tiles, with the width of their joints under Advanced", () => {
    const { panel, calls } = mount();
    openTab(panel, "Pattern");
    for (const name of ["Honeycomb", "Bricks", "Studs", "Hammered", "Knit", "Basket weave", "Rings", "Gentle hills"]) expect(tile(panel, name), name).toBeDefined();
    act(() => tile(panel, "Bricks")!.click());
    expect(calls.updates.at(-1)?.vase?.effect).toBe("ziegel");
    const bricks = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    openTab(bricks.panel, "Pattern");
    expect(rangeNamed(bricks.panel, "Relief height")).toBeDefined();
    expect(rangeNamed(bricks.panel, "Repeats around")).toBeDefined();
    expect(rangeNamed(bricks.panel, "Lean (°)")).toBeDefined();
    // (Advanced keeps the state it was left in: opened here only if it is closed.)
    if (bricks.panel.querySelector(".vase-more")?.getAttribute("aria-expanded") !== "true") act(() => bricks.panel.querySelector<HTMLButtonElement>(".vase-more")!.click());
    expect(rangeNamed(bricks.panel, "Width (%)")).toBeDefined();
    // A pattern may keep its size where the vase narrows, as leaves may; wisp ribs run up the vase in one piece.
    const keep = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLLabelElement>("label.check-property")].find((row) => row.textContent === "Keep the same size")?.querySelector("input");
    expect(keep(bricks.panel)).toBeDefined();
    act(() => keep(bricks.panel)!.click());
    expect(bricks.calls.updates.at(-1)?.vase?.leafFixed).toBe("ja");
    const hexagons = mount({ vase: { ...bricks.shape.vase!, effect: "waben" } });
    openTab(hexagons.panel, "Pattern");
    expect(keep(hexagons.panel)).toBeDefined();
    const wisp = mount({ vase: { ...bricks.shape.vase!, effect: "wisp" } });
    openTab(wisp.panel, "Pattern");
    expect(keep(wisp.panel)).toBeUndefined();
    // Rings run round the vase: nothing to lean.
    const rings = mount({ vase: { ...bricks.shape.vase!, effect: "ringe" } });
    openTab(rings.panel, "Pattern");
    expect(rangeNamed(rings.panel, "Relief height")).toBeDefined();
    expect(rangeNamed(rings.panel, "Lean (°)")).toBeUndefined();
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

  it("has the slicer's vase mode as a switch on the Print tab, with how the vase is drawn; a shade then stands on a base", () => {
    const switchNamed = (panel: HTMLElement, name: string) => [...panel.querySelectorAll<HTMLLabelElement>("label.check-property")].find((row) => row.textContent === name)?.querySelector("input");
    const { panel, calls } = mount();
    openTab(panel, "Print");
    // A new vase is for the vase mode, and drawn as it is printed.
    expect(switchNamed(panel, "Vase mode")?.checked).toBe(true);
    expect(switchNamed(panel, "Show as printed")?.checked).toBe(true);
    expect([...panel.querySelectorAll(".vase-panel .cylinder-wrap-hint")].some((line) => line.textContent?.startsWith("The vase is a solid body, and the slicer prints a single wall of it in a spiral"))).toBe(true);
    expect(rangeNamed(panel, "Wall")).toBeUndefined();
    act(() => switchNamed(panel, "Show as printed")!.click());
    expect(calls.updates.at(-1)?.vase?.printView).toBe("nein");
    act(() => switchNamed(panel, "Vase mode")!.click());
    expect(calls.updates.at(-1)?.vase?.body).toBe("hohl");
    // With a real wall: the wall's measures, and nothing about how it is drawn.
    const hollow = mount({ vase: { ...calls.updates.at(-1)!.vase! } });
    openTab(hollow.panel, "Print");
    expect(switchNamed(hollow.panel, "Vase mode")?.checked).toBe(false);
    expect(switchNamed(hollow.panel, "Show as printed")).toBeUndefined();
    expect(rangeNamed(hollow.panel, "Wall")).toBeDefined();
    // A hanging shade has a plate of its own, which needs a real wall: in vase mode it stands on a base instead.
    const shade = mount({ vase: { ...hollow.shape.vase!, purpose: "lampe", lamp: "haengend", lampSpokes: 3 } });
    openTab(shade.panel, "Print");
    act(() => switchNamed(shade.panel, "Vase mode")!.click());
    expect(shade.calls.updates.at(-1)?.vase).toMatchObject({ body: "voll", lamp: "sockel" });
    const thin = mount({ vase: { ...shade.calls.updates.at(-1)!.vase! } });
    openTab(thin.panel, "Form");
    const block = thin.panel.querySelector<HTMLElement>(".vase-use")!;
    expect([...selectNamed(block, "Lampshade")!.options].map((option) => option.textContent)).toEqual(["None", "Over an LED puck", "On a base", "On the wall"]);
    expect(selectNamed(block, "Base form")).toBeDefined();
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
