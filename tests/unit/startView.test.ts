import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_FOV, CAMERA_HOME, resetCamera, startViewOf, type CameraRig } from "@/components/workplane/cameraRig";
import { readStartView, writeStartView } from "@/lib/designView";

// #853: a start view of the user's own, for new designs and Home.
function rig(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): CameraRig {
  const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;
  return {
    camera,
    controls: { target: new THREE.Vector3(), update: () => false } as unknown as CameraRig["controls"],
    renderer: { domElement: canvas } as unknown as CameraRig["renderer"],
    needsRender: false,
    focusReach: null,
  };
}

describe("the start view (#853)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the view from the front and Home goes back to it", () => {
    const state = rig(new THREE.PerspectiveCamera(CAMERA_FOV, 4 / 3));
    state.camera.position.set(0, 80, 250);
    state.controls.target.set(0, 0, 10);
    writeStartView(startViewOf(state));

    state.camera.position.set(300, 300, 300);
    state.controls.target.set(50, 0, 0);
    resetCamera(state);
    expect(state.camera.position.toArray().map((value) => Math.round(value))).toEqual([0, 80, 250]);
    expect(state.controls.target.toArray()).toEqual([0, 0, 10]);
  });

  it("keeps the flat view as the distance that shows as much", () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 150, -150, -9000, 9000);
    camera.zoom = 2;
    camera.position.set(0, 0, 1000);
    const view = startViewOf(rig(camera));
    const distance = Math.hypot(...view.position);
    expect(distance).toBeCloseTo(75 / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)), 3);
    expect(view.orthographic).toBe(false);
  });

  it("goes back to the standard view once it is reset", () => {
    const state = rig(new THREE.PerspectiveCamera(CAMERA_FOV, 4 / 3));
    state.camera.position.set(0, 80, 250);
    writeStartView(startViewOf(state));
    expect(readStartView()).not.toBeNull();
    writeStartView(null);
    expect(readStartView()).toBeNull();
    resetCamera(state);
    expect(state.camera.position.toArray()).toEqual(CAMERA_HOME.toArray());
  });
});
