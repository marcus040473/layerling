// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { BoxWallsOverlay, boxWallsEditable, syncBoxWallsOverlay, type BoxWallsOverlayState } from "@/components/workplane/BoxWallsOverlay";
import type { BoxWallsPick } from "@/components/workplane/BoxWallsPlan";
import type { ThreeState } from "@/components/workplane/ViewportOverlays";
import { createBoxGeneratorGeometryForShape, type BoxGeneratorScoop, type BoxGeneratorWall } from "@/lib/boxGeneratorGeometry";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The box generator's dividers set by hand, edited on the box in the view: a grip on every wall that moves it, grips at
 * the ends of the picked wall, a cross that removes it, and on every compartment its size with buttons that split it.
 * The view here looks straight down on a box of 126 x 90 mm (inside 121.2 x 85.2) at 2 pixels a millimetre, the middle
 * of the box at 200, 200, so a place in the room is at 78.8 + 2 x, 114.8 + 2 z on the screen.
 */
let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function boxShape(fields: Partial<WorkplaneShape>): WorkplaneShape {
  return { id: "box", name: "Box", kind: "boxGenerator", color: "#3b82f6", x: 0, z: 0, elevation: 0, size: 126, width: 126, depth: 90, height: 48, rotationX: 0, rotationY: 0, rotationZ: 0, boxCornerRadius: 0, boxWall: 2.4, boxDivider: 1.6, boxDividerMode: "manual", ...fields } as unknown as WorkplaneShape;
}

function viewOf(shape: WorkplaneShape) {
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
  camera.position.set(0, 300, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const object = new THREE.Group();
  const mesh = new THREE.Mesh(createBoxGeneratorGeometryForShape(shape));
  mesh.userData.shapeSurface = true;
  object.add(mesh);
  object.updateMatrixWorld(true);
  const state = {
    camera,
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) } },
    shapeRecords: new Map([[shape.id, { object, shape }]]),
  } as unknown as ThreeState;
  return state;
}

function overlayOf(state: ThreeState, shape: WorkplaneShape | null) {
  let overlay: BoxWallsOverlayState | null = null;
  syncBoxWallsOverlay(state, shape, { current: null }, (next) => { overlay = next as BoxWallsOverlayState | null; });
  return overlay as BoxWallsOverlayState | null;
}

/** The overlay over the view, kept up to date with the walls it writes and the wall it picks. */
function mount(walls: BoxGeneratorWall[]) {
  let shape = boxShape({ boxWalls: walls });
  let pick: BoxWallsPick = null;
  const active: boolean[] = [];
  const noteActive = (value: boolean) => active.push(value);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const threeRef = { current: viewOf(shape) };
  const render = () => root!.render(createElement(BoxWallsOverlay, {
    overlay: overlayOf(threeRef.current, shape)!,
    shape,
    pick,
    threeRef,
    onPick: (next: BoxWallsPick) => {
      pick = next;
      render();
    },
    onWallsChange: (boxWalls: BoxGeneratorWall[]) => {
      shape = boxShape({ boxWalls });
      threeRef.current = viewOf(shape);
      render();
    },
    onScoopsChange: (boxScoops: BoxGeneratorScoop[]) => {
      shape = boxShape({ boxWalls: shape.boxWalls, boxScoops });
      threeRef.current = viewOf(shape);
      render();
    },
    onDragActiveChange: noteActive,
  }));
  act(render);
  return { panel: container, walls: () => shape.boxWalls, scoops: () => shape.boxScoops, pick: () => pick, active };
}

const all = <T extends HTMLElement>(panel: HTMLElement, id: string) => [...panel.querySelectorAll<T>(`[data-testid="${id}"]`)];
function pointer(element: Element, type: string, x: number, y: number) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    element.dispatchEvent(event);
  });
}
const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const placeOf = (element: HTMLElement) => ({ x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) });

describe("box generator, dividers by hand on the box", () => {
  it("is offered for a box, with walls to move only when its dividers are set by hand; not for a lid or a locked box", () => {
    expect(boxWallsEditable(boxShape({}))).toBe(true);
    expect(boxWallsEditable(boxShape({ boxPart: "lid" }))).toBe(false);
    expect(boxWallsEditable(boxShape({ locked: true }))).toBe(false);
    // With the grid's dividers the compartments are there, for their sizes and finger scoops, and no wall has a grip.
    const grid = boxShape({ boxDividerMode: undefined, boxColumns: 2, boxWalls: [{ dir: "x", at: 30, from: 0, to: 60 }] });
    const overlay = overlayOf(viewOf(grid), grid)!;
    expect(overlay.manual).toBe(false);
    expect(overlay.walls).toHaveLength(0);
    expect(overlay.compartments).toHaveLength(2);
    expect(overlayOf(viewOf(boxShape({})), null)).toBeNull();
  });

  it("puts each wall's grip on the wall's top and each compartment's size in the compartment", () => {
    const shape = boxShape({ boxWalls: [{ dir: "z", at: 60, from: 0, to: 85.2 }, { dir: "x", at: 30, from: 0, to: 60 }] });
    const overlay = overlayOf(viewOf(shape), shape)!;
    expect(overlay.walls).toHaveLength(2);
    expect(overlay.walls[0].middle.x).toBeCloseTo(78.8 + 120, 1);
    expect(overlay.walls[0].middle.y).toBeCloseTo(200, 1);
    expect(overlay.walls[0].from.y).toBeCloseTo(114.8, 1);
    expect(overlay.walls[1].to.x).toBeCloseTo(78.8 + 120, 1);
    expect(overlay.walls[1].middle.y).toBeCloseTo(114.8 + 60, 1);
    expect(overlay.compartments.map((entry) => entry.text).sort()).toEqual(["59 × 29", "59 × 54", "60 × 85"]);
    expect(overlay.compartments.every((entry) => entry.room === "buttons")).toBe(true);
  });

  it("moves the wall whose grip is dragged over the box, and pulls an end of the picked wall", () => {
    const { panel, walls, pick, active } = mount([{ dir: "z", at: 60, from: 0, to: 85.2 }]);
    const grip = all(panel, "box-walls-overlay-grip")[0];
    expect(placeOf(grip)).toEqual({ x: expect.closeTo(198.8, 1), y: expect.closeTo(200, 1) });
    pointer(grip, "pointerdown", 198.8, 200);
    pointer(grip, "pointermove", 218.9, 203);
    pointer(grip, "pointerup", 218.9, 203);
    expect(walls()).toEqual([{ dir: "z", at: 70, from: 0, to: 85.2 }]);
    expect(pick()).toEqual({ type: "wall", index: 0 });
    expect(active).toEqual([true, false]);
    // The end at the front is pulled back by 20 mm (40 pixels).
    const end = all(panel, "box-walls-overlay-to")[0];
    pointer(end, "pointerdown", 218.8, 280);
    pointer(end, "pointermove", 218.8, 240);
    pointer(end, "pointerup", 218.8, 240);
    expect(walls()).toEqual([{ dir: "z", at: 70, from: 0, to: 65 }]);
  });

  it("splits the compartment whose button is clicked, and removes the picked wall with the cross", () => {
    const { panel, walls, pick } = mount([{ dir: "z", at: 60, from: 0, to: 85.2 }]);
    expect(all(panel, "box-walls-overlay-remove")).toHaveLength(0);
    // The compartment on the left: its label stands left of the wall.
    const left = all(panel, "box-walls-overlay-across").find((button) => placeOf(button.closest<HTMLElement>(".box-walls-overlay-compartment")!).x < 198)!;
    click(left);
    expect(walls()?.[1]).toEqual({ dir: "x", at: 42.6, from: 0, to: 60 });
    expect(pick()).toEqual({ type: "wall", index: 1 });
    click(all(panel, "box-walls-overlay-remove")[0]);
    expect(walls()).toEqual([{ dir: "z", at: 60, from: 0, to: 85.2 }]);
    expect(pick()).toBeNull();
  });

  it("switches the finger scoop of the compartment whose hand button is clicked on and off", () => {
    const { panel, scoops } = mount([{ dir: "z", at: 60, from: 0, to: 85.2 }]);
    const buttons = () => all(panel, "box-walls-overlay-scoop");
    expect(buttons()).toHaveLength(2);
    const left = () => buttons().find((button) => placeOf(button.closest<HTMLElement>(".box-walls-overlay-compartment")!).x < 198)!;
    click(left());
    expect(scoops()).toEqual([{ x: expect.any(Number), z: expect.any(Number), side: "front" }]);
    expect(scoops()![0].x).toBeLessThan(59);
    expect(left().getAttribute("aria-pressed")).toBe("true");
    expect(buttons().filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    click(left());
    expect(scoops()).toEqual([]);
  });
});
