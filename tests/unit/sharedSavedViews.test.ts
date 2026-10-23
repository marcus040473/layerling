import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraRig } from "@/components/workplane/cameraRig";
import { saveViewInSlot, showViewInSlot } from "@/components/workplane/cameraViews";

// The 3D view and the second view's window share a design's four saved views (7, 8, 9, 0).

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

/** A camera with what the helpers read of its controls and its canvas. */
function rig(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, target: THREE.Vector3): CameraRig {
  const controls = { target, object: camera, minZoom: 0, maxZoom: Infinity, update: () => true };
  const renderer = { domElement: { clientWidth: 800, clientHeight: 600 } };
  return { camera, controls, renderer, needsRender: false, focusReach: null } as unknown as CameraRig;
}

describe("saved views in either window", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("brings a view saved in one window back in the other, projection and all", () => {
    const flat = new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 6000);
    flat.position.set(30, 90, 10);
    flat.zoom = 2;
    const main = rig(flat, new THREE.Vector3(5, 0, 5));
    expect(saveViewInSlot("design-1", main, 2)).toContain("9");

    const second = rig(new THREE.PerspectiveCamera(38, 800 / 600, 0.1, 6000), new THREE.Vector3());
    expect(showViewInSlot("design-1", second, 2)).toBeNull();
    expect(second.camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(second.camera.position.toArray()).toEqual([30, 90, 10]);
    expect(second.controls.target.toArray()).toEqual([5, 0, 5]);
    expect(second.camera.zoom).toBe(2);
    expect(second.needsRender).toBe(true);
  });

  it("says how to fill a key that holds nothing, and leaves the camera where it is", () => {
    const camera = new THREE.PerspectiveCamera(38, 800 / 600, 0.1, 6000);
    camera.position.set(1, 2, 3);
    const second = rig(camera, new THREE.Vector3());
    expect(showViewInSlot("design-1", second, 0)).toContain("7");
    expect(second.camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it("keeps each design's views apart", () => {
    const camera = new THREE.PerspectiveCamera(38, 800 / 600, 0.1, 6000);
    camera.position.set(50, 50, 50);
    saveViewInSlot("design-1", rig(camera, new THREE.Vector3()), 1);
    expect(showViewInSlot("design-2", rig(new THREE.PerspectiveCamera(), new THREE.Vector3()), 1)).toContain("8");
  });
});
