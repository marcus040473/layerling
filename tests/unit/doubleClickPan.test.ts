import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { panCameraTo, stepCameraTurn, type CameraRig } from "@/components/workplane/cameraRig";
import { nearestWorkplanePoint, workplanePointOnRay } from "@/components/workplane/useViewportDoubleClick";
import { horizontalPlacementWorkplane, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { pivotSlide, pivotSlidePoint, VIEW_CUBE_TURN_MS } from "@/lib/viewCubeTransition";

function rig(position: THREE.Vector3, target: THREE.Vector3): CameraRig {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(position);
  const controls = { target: target.clone(), update: () => false } as unknown as CameraRig["controls"];
  return { renderer: {} as CameraRig["renderer"], camera, controls, needsRender: false, focusReach: null };
}

const down = (x: number, z: number) => new THREE.Ray(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));

describe("a double click on the workplane slides the view there", () => {
  it("slides the pivot from where it is exactly to the spot", () => {
    const slide = pivotSlide(new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 0, -20), 1000);
    expect(pivotSlidePoint(slide, 1000).pivot.length()).toBe(0);
    expect(pivotSlidePoint(slide, 1000).done).toBe(false);
    const end = pivotSlidePoint(slide, 1000 + VIEW_CUBE_TURN_MS);
    expect(end.done).toBe(true);
    expect(end.pivot.toArray()).toEqual([40, 0, -20]);
  });

  it("carries the camera along, so the angle and the distance stay", () => {
    const view = rig(new THREE.Vector3(118, 96, 118), new THREE.Vector3(0, 0, 0));
    const offset = view.camera.position.clone().sub(view.controls.target);
    view.cameraTurn = pivotSlide(view.controls.target, new THREE.Vector3(50, 0, 30), 0);
    for (const at of [0.25, 0.5, 1]) {
      expect(stepCameraTurn(view, at * VIEW_CUBE_TURN_MS)).toBe(true);
      expect(view.camera.position.clone().sub(view.controls.target).distanceTo(offset)).toBeLessThan(1e-9);
    }
    expect(view.controls.target.toArray()).toEqual([50, 0, 30]);
    expect(view.cameraTurn).toBeNull();
  });

  it("jumps there at once when no animation is wanted", () => {
    const view = rig(new THREE.Vector3(10, 80, 10), new THREE.Vector3(5, 0, 5));
    panCameraTo(view, new THREE.Vector3(-30, 0, 12), false);
    expect(view.controls.target.toArray()).toEqual([-30, 0, 12]);
    expect(view.camera.position.toArray()).toEqual([-25, 80, 17]);
    expect(view.cameraTurn).toBeNull();
  });

  it("finds the spot inside a workplane's plate, and nothing beside it or along it", () => {
    const plate = horizontalPlacementWorkplane();
    expect(workplanePointOnRay(down(30, -40), plate, 200, 200)?.toArray()).toEqual([30, 0, -40]);
    expect(workplanePointOnRay(down(130, 0), plate, 200, 200)).toBeNull();
    expect(workplanePointOnRay(new THREE.Ray(new THREE.Vector3(0, 10, 0), new THREE.Vector3(1, 0, 0)), plate)).toBeNull();
  });

  it("finds the spot beside the plate too, on its level", () => {
    expect(nearestWorkplanePoint(down(400, -250), horizontalPlacementWorkplane(), 200, 200)?.toArray()).toEqual([400, 0, -250]);
  });

  it("lets the pivot stay on a spot beside the plate", () => {
    const view = rig(new THREE.Vector3(10, 80, 10), new THREE.Vector3(0, 0, 0));
    panCameraTo(view, new THREE.Vector3(400, 0, -250), false);
    expect(view.focusReach?.containsPoint(new THREE.Vector3(400, 0, -250))).toBe(true);
  });

  it("takes the nearer of a raised workplane and the plate", () => {
    const raised: PlacementWorkplane = { ...horizontalPlacementWorkplane(), origin: { x: 0, y: 20, z: 0 } };
    expect(nearestWorkplanePoint(down(10, 10), raised, 200, 200)?.y).toBeCloseTo(20, 9);
    // Beside the raised workplane's own plate, the base plate under it still counts.
    const shifted: PlacementWorkplane = { ...raised, origin: { x: 300, y: 20, z: 0 } };
    expect(nearestWorkplanePoint(down(10, 10), shifted, 200, 200)?.y).toBeCloseTo(0, 9);
  });
});
