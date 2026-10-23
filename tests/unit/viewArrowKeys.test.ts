import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleViewArrowKey, panViewBy, viewArrowStep, VIEW_PAN_COARSE_STEP, VIEW_PAN_STEP, visibleViewHeight } from "@/lib/viewArrowKeys";

const key = (key: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods,
});

function stubView() {
  const orbit = vi.fn();
  const pan = vi.fn();
  vi.stubGlobal("window", { layerlingOrbitView: orbit, layerlingPanView: pan });
  return { orbit, pan };
}

afterEach(() => vi.unstubAllGlobals());

describe("view arrow keys", () => {
  it("turns the view with plain arrows, as before", () => {
    const { orbit, pan } = stubView();
    expect(handleViewArrowKey(key("ArrowLeft"), false)).toBe(true);
    expect(handleViewArrowKey(key("ArrowUp", { shiftKey: true }), false)).toBe(true);
    expect(orbit).toHaveBeenNthCalledWith(1, 15, 0);
    expect(orbit).toHaveBeenNthCalledWith(2, -0, 90);
    expect(pan).not.toHaveBeenCalled();
  });

  it("slides the view with Ctrl or Cmd and the arrows", () => {
    const { orbit, pan } = stubView();
    handleViewArrowKey(key("ArrowRight", { ctrlKey: true }), false);
    handleViewArrowKey(key("ArrowDown", { metaKey: true, shiftKey: true }), false);
    expect(pan).toHaveBeenNthCalledWith(1, VIEW_PAN_STEP, 0);
    expect(pan).toHaveBeenNthCalledWith(2, 0, -VIEW_PAN_COARSE_STEP);
    expect(orbit).not.toHaveBeenCalled();
  });

  it("leaves the keys to the selection, Alt and other keys", () => {
    const { orbit, pan } = stubView();
    expect(handleViewArrowKey(key("ArrowLeft", { ctrlKey: true }), true)).toBe(false);
    expect(handleViewArrowKey(key("ArrowLeft", { altKey: true }), false)).toBe(false);
    expect(handleViewArrowKey(key("a", { ctrlKey: true }), false)).toBe(false);
    expect(orbit).not.toHaveBeenCalled();
    expect(pan).not.toHaveBeenCalled();
  });
});

describe("panViewBy", () => {
  const viewFrom = (camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);
    return { camera, controls: { target: new THREE.Vector3(), minPolarAngle: 0, maxPolarAngle: Math.PI, update: () => true } };
  };

  it("moves camera and centre together against the key, so the model goes with it", () => {
    const view = viewFrom(new THREE.PerspectiveCamera(90, 1, 1, 1000));
    const height = visibleViewHeight(view);
    expect(height).toBeCloseTo(200);
    panViewBy(view, 0.1, 0.5);
    expect(view.camera.position.x).toBeCloseTo(-20);
    expect(view.camera.position.y).toBeCloseTo(-100);
    expect(view.camera.position.z).toBeCloseTo(100);
    expect(view.controls.target.toArray().map((v) => Math.round(v))).toEqual([-20, -100, 0]);
  });

  it("measures the flat view by its frame and zoom", () => {
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1000);
    camera.zoom = 2;
    expect(visibleViewHeight(viewFrom(camera))).toBeCloseTo(50);
  });
});

describe("the arrow key step", () => {
  const press = (key: string, modifiers: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers,
  });

  it("turns with the arrows and slides with Ctrl or Cmd, as the 3D view does with nothing selected", () => {
    expect(viewArrowStep(press("ArrowRight"))).toEqual({ orbit: [-15, 0] });
    expect(viewArrowStep(press("ArrowUp", { shiftKey: true }))?.orbit?.[1]).toBe(90);
    expect(viewArrowStep(press("ArrowLeft", { ctrlKey: true }))).toEqual({ pan: [-VIEW_PAN_STEP, 0] });
    expect(viewArrowStep(press("ArrowDown", { metaKey: true, shiftKey: true }))).toEqual({ pan: [0, -VIEW_PAN_COARSE_STEP] });
  });

  it("leaves other keys and Alt alone", () => {
    expect(viewArrowStep(press("a"))).toBeNull();
    expect(viewArrowStep(press("ArrowLeft", { altKey: true }))).toBeNull();
  });
});
