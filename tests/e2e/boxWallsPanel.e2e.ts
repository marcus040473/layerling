// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ShapeInspector } from "@/components/workplane/ShapeInspector";
import { boxWallDragged } from "@/components/workplane/BoxWallsPlan";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The box generator's dividers set by hand: the menu that switches from the even grid to walls of one's own, and the card
 * with the box from above, where a wall is put into a compartment, dragged, shortened by an end, turned and removed.
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

/** The settings panel for a box of 126 x 90 x 48 mm with square corners (inside 121.2 x 85.2), kept up to date with what it writes. */
function mount(fields: Partial<WorkplaneShape>) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "boxGenerator")!;
  let shape = { ...makeShapeFromAsset(asset, { x: 0, z: 0 }), width: 126, depth: 90, height: 48, boxCornerRadius: 0, boxWall: 2.4, ...fields } as WorkplaneShape;
  const patches: Partial<WorkplaneShape>[] = [];
  const active: boolean[] = [];
  const noteActive = (value: boolean) => active.push(value);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const render = () => root!.render(createElement(ShapeInspector, {
    shape,
    snap: DEFAULT_SNAP_GRID,
    snapOpen: false,
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    onUpdate: (patch: Partial<WorkplaneShape>) => {
      patches.push(patch);
      shape = { ...shape, ...patch };
      render();
    },
    onInteractionActiveChange: noteActive,
    onSnapChange: () => {},
    onSnapOpenChange: () => {},
  }));
  act(render);
  return { panel: container, patches, active, shape: () => shape };
}

const all = <T extends Element>(panel: HTMLElement, id: string) => [...panel.querySelectorAll<T>(`[data-testid="${id}"]`)];
const one = <T extends Element>(panel: HTMLElement, id: string) => all<T>(panel, id)[0];
const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
/** A pointer event with the place given in mm: without a layout the plan takes the pointer's numbers as they are. */
function pointer(element: Element, type: string, x = 0, z = 0) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: z, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    element.dispatchEvent(event);
  });
}
const modeMenu = (panel: HTMLElement) => [...panel.querySelectorAll("select")].find((select) => select.querySelector('option[value="manual"]'))!;
function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const names = (panel: HTMLElement) => [...panel.querySelectorAll(".range-property-name")].map((row) => row.textContent);

describe("box generator, dividers by hand", () => {
  it("shows the compartments of every box, and the walls to set only when the dividers are set by hand; nothing for a lid", () => {
    const grid = mount({ boxColumns: 2 });
    expect(one(grid.panel, "box-walls-card")).toBeDefined();
    expect(all(grid.panel, "box-walls-compartment")).toHaveLength(2);
    expect(one(grid.panel, "box-walls-add-across")).toBeUndefined();
    expect(grid.panel.querySelector('[data-testid="box-walls-card"] .property-card-header')!.textContent).toBe("Compartments");
    act(() => root?.unmount());
    expect(one(mount({ boxDividerMode: "manual", boxPart: "lid" }).panel, "box-walls-card")).toBeUndefined();
    act(() => root?.unmount());
    const { panel } = mount({ boxDividerMode: "manual" });
    expect(one(panel, "box-walls-add-across")).toBeDefined();
    expect(panel.querySelector('[data-testid="box-walls-card"] .property-card-header')!.textContent).toBe("Dividers by hand");
    expect(names(panel)).not.toContain("Compartments across");
    expect(names(panel)).toContain("Divider thickness");
  });

  it("gives the picked compartment a finger scoop at a side, with the radius of the scoops, also with the grid's dividers", () => {
    const { panel, shape } = mount({ boxColumns: 2 });
    const scoopMenu = () => [...panel.querySelectorAll("select")].find((select) => select.querySelector('option[value="front"]'));
    expect(scoopMenu()).toBeUndefined();
    const left = all<SVGElement>(panel, "box-walls-compartment").find((entry) => entry.getAttribute("points")!.startsWith("0,"))!;
    pointer(left, "pointerdown");
    choose(scoopMenu()!, "left");
    expect(shape().boxScoops).toEqual([{ x: expect.any(Number), z: expect.any(Number), side: "left" }]);
    expect(all(panel, "box-walls-plan-scoop")).toHaveLength(1);
    expect(names(panel)).toContain("Scoop radius");
    choose(scoopMenu()!, "back");
    expect(shape().boxScoops?.map((scoop) => scoop.side)).toEqual(["back"]);
    choose(scoopMenu()!, "none");
    expect(shape().boxScoops).toBeUndefined();
    expect(all(panel, "box-walls-plan-scoop")).toHaveLength(0);
  });

  it("takes the grid's dividers over as walls when it is switched to by hand, and keeps the walls when it goes back", () => {
    const { panel, patches, shape } = mount({ boxColumns: 3, boxRows: 2 });
    choose(modeMenu(panel), "manual");
    expect(patches[0].boxDividerMode).toBe("manual");
    expect(patches[0].boxWalls).toHaveLength(3);
    expect(all(panel, "box-walls-wall")).toHaveLength(3);
    expect(all(panel, "box-walls-compartment")).toHaveLength(6);
    choose(modeMenu(panel), "grid");
    expect(shape().boxDividerMode).toBeUndefined();
    expect(shape().boxWalls).toHaveLength(3);
    expect(names(panel)).toContain("Compartments across");
    // Walls that are there are not replaced by the grid's the next time.
    choose(modeMenu(panel), "manual");
    expect(patches.at(-1)).toEqual({ boxDividerMode: "manual" });
  });

  it("puts a wall through the whole box, then one that splits only the compartment that was picked", () => {
    const { panel, shape } = mount({ boxDividerMode: "manual" });
    click(one(panel, "box-walls-add-along"));
    expect(shape().boxWalls).toEqual([{ dir: "z", at: 60.6, from: 0, to: 85.2 }]);
    expect(all(panel, "box-walls-compartment")).toHaveLength(2);
    const left = all<SVGElement>(panel, "box-walls-compartment").find((entry) => entry.getAttribute("points")!.startsWith("0,"))!;
    pointer(left, "pointerdown");
    expect(left.getAttribute("aria-pressed")).toBe("true");
    click(one(panel, "box-walls-add-across"));
    // From the left wall to the middle of the wall it ends on, half a divider past the compartment's side.
    expect(shape().boxWalls?.[1]).toEqual({ dir: "x", at: 42.6, from: 0, to: 60.6 });
    expect(all(panel, "box-walls-compartment")).toHaveLength(3);
  });

  it("moves a wall that is dragged and shortens it by an end, each drag one change in the history", () => {
    const { panel, shape, active } = mount({ boxDividerMode: "manual", boxWalls: [{ dir: "z", at: 60, from: 0, to: 85.2 }] });
    const plan = one<SVGSVGElement>(panel, "box-walls-plan");
    pointer(one(panel, "box-walls-wall"), "pointerdown", 60, 40);
    pointer(plan, "pointermove", 72.2, 41);
    expect(shape().boxWalls).toEqual([{ dir: "z", at: 72, from: 0, to: 85.2 }]);
    pointer(plan, "pointerup", 72.2, 41);
    expect(active).toEqual([true, false]);
    // The wall stays picked, with a grip at each end; the end at the front is pulled back to 50 mm.
    pointer(one(panel, "box-walls-grip-to"), "pointerdown", 72, 85.2);
    pointer(plan, "pointermove", 72, 50.1);
    pointer(plan, "pointerup", 72, 50.1);
    expect(shape().boxWalls).toEqual([{ dir: "z", at: 72, from: 0, to: 50 }]);
    expect(all(panel, "box-walls-compartment")).toHaveLength(1);
    expect(names(panel)).toEqual(expect.arrayContaining(["Distance from the left", "Start", "End"]));
  });

  it("turns the wall that is picked, removes it, and removes all", () => {
    const { panel, shape } = mount({ boxDividerMode: "manual", boxWalls: [{ dir: "z", at: 60, from: 20, to: 60 }, { dir: "x", at: 10, from: 0, to: 121.2 }] });
    expect(one(panel, "box-walls-turn")).toBeUndefined();
    pointer(one(panel, "box-walls-wall"), "pointerdown", 60, 40);
    pointer(one(panel, "box-walls-plan"), "pointerup", 60, 40);
    click(one(panel, "box-walls-turn"));
    expect(shape().boxWalls?.[0]).toEqual({ dir: "x", at: 40, from: 40, to: 80 });
    click(one(panel, "box-walls-remove"));
    expect(shape().boxWalls).toEqual([{ dir: "x", at: 10, from: 0, to: 121.2 }]);
    click(one(panel, "box-walls-clear"));
    expect(shape().boxWalls).toEqual([]);
    expect(one(panel, "box-walls-clear")).toBeUndefined();
  });

  it("holds a dragged wall inside the room and lands an end on the sides and on walls that cross it", () => {
    const room = { width: 100, depth: 80 };
    const wall = { dir: "x" as const, at: 40, from: 10, to: 60 };
    expect(boxWallDragged(wall, "move", 500, 500, room, [])).toEqual({ dir: "x", at: 80, from: 50, to: 100 });
    expect(boxWallDragged(wall, "move", 3.3, -7.2, room, [])).toEqual({ dir: "x", at: 33, from: 13.5, to: 63.5 });
    expect(boxWallDragged(wall, "to", 39.2, 0, room, [])).toEqual({ dir: "x", at: 40, from: 10, to: 100 });
    expect(boxWallDragged(wall, "to", 11.1, 0, room, [{ dir: "z", at: 72, from: 0, to: 80 }])).toEqual({ dir: "x", at: 40, from: 10, to: 72 });
    // A wall that does not reach as far as this one stands is not landed on.
    expect(boxWallDragged(wall, "to", 11.1, 0, room, [{ dir: "z", at: 72, from: 50, to: 80 }])).toEqual({ dir: "x", at: 40, from: 10, to: 71 });
    // An end pulled past the other one: the wall then runs on from there.
    expect(boxWallDragged(wall, "from", 500, 0, room, [])).toEqual({ dir: "x", at: 40, from: 60, to: 100 });
  });

  it("sets a wall at a slant when an end is pulled off its line, and keeps it straight while the end stays near the line", () => {
    const room = { width: 100, depth: 80 };
    const wall = { dir: "x" as const, at: 40, from: 10, to: 60 };
    expect(boxWallDragged(wall, "to", 20, 30.2, room, [])).toEqual({ dir: "x", at: 40, from: 10, to: 80, slant: 30 });
    // 4 mm off on a wall of 70 mm is a shaky hand, not a slant; with nothing catching (Alt) it is taken as it comes.
    expect(boxWallDragged(wall, "to", 20, 4, room, [])).toEqual({ dir: "x", at: 40, from: 10, to: 80 });
    expect(boxWallDragged(wall, "to", 20, 4, room, [], 0.1, true)).toEqual({ dir: "x", at: 40, from: 10, to: 80, slant: 4 });
    // Pulled further along the depth than the width, it is a wall along the depth; back on the line it is straight again.
    expect(boxWallDragged(wall, "to", -40, 30, room, [])).toEqual({ dir: "z", at: 10, from: 40, to: 70, slant: 10 });
    const slanted = { dir: "x" as const, at: 40, from: 10, to: 80, slant: 30 };
    expect(boxWallDragged(slanted, "to", 0, -28, room, [])).toEqual({ dir: "x", at: 40, from: 10, to: 80 });
    // Moved as a whole it keeps its slant and stays inside the room.
    expect(boxWallDragged(slanted, "move", 500, 500, room, [])).toEqual({ dir: "x", at: 50, from: 30, to: 100, slant: 30 });
  });

  it("offers the slant of the picked wall as a number", () => {
    const { panel, shape } = mount({ boxDividerMode: "manual", boxWalls: [{ dir: "x", at: 20, from: 0, to: 60, slant: 30 }] });
    pointer(one(panel, "box-walls-wall"), "pointerdown", 30, 35);
    pointer(one(panel, "box-walls-plan"), "pointerup", 30, 35);
    expect(names(panel)).toContain("Slant");
    // The slanted wall is drawn from its beginning to its end, 1.6 mm wide square to its run.
    expect(panel.querySelector(".box-walls-plan-wall")!.getAttribute("points")!.split(" ")).toHaveLength(4);
    expect(shape().boxWalls).toEqual([{ dir: "x", at: 20, from: 0, to: 60, slant: 30 }]);
    click(one(panel, "box-walls-turn"));
    expect(shape().boxWalls).toEqual([{ dir: "z", at: 45, from: 5, to: 65, slant: -30 }]);
  });
});
