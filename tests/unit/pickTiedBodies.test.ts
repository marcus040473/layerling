import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pickShapeAt, RENDER_LAYER_SHAPES } from "@/components/workplane/viewportPicking";
import type { ThreeState } from "@/components/workplane/ViewportOverlays";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * A copy lies exactly on its original: the ray meets both at the same distance. The press must mean
 * the one that is selected - the copy - and not the one that comes first in the list (#484).
 */

function shape(id: string): WorkplaneShape {
  return { id, name: "Box", kind: "box", color: "#d41721", x: 0, z: 0, size: 20, width: 20, depth: 20, height: 20, rotation: 0, ...(id.startsWith("hole") ? { hole: true } : {}) } as WorkplaneShape;
}

function scene(ids: string[], shift: Record<string, number> = {}) {
  const shapeLayer = new THREE.Group();
  ids.forEach((id) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial());
    mesh.position.set(0, 10 + (shift[id] ?? 0), 0);
    mesh.userData.shapeId = id;
    mesh.layers.set(RENDER_LAYER_SHAPES);
    mesh.updateMatrixWorld(true);
    shapeLayer.add(mesh);
  });
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(60, 60, 60);
  camera.lookAt(0, 10, 0);
  camera.updateMatrixWorld(true);
  const state = {
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) } },
    pointer: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
    camera,
    shapeLayer,
    sectionPlane: null,
  } as unknown as ThreeState;
  return { state, shapes: ids.map(shape) };
}

describe("a press on bodies that lie on one another (#484)", () => {
  it("takes the first body when nothing is preferred, as before", () => {
    const { state, shapes } = scene(["original", "copy"]);
    expect(pickShapeAt(state, shapes, 200, 200)).toBe("original");
  });

  it("takes the selected copy, not the original it lies on", () => {
    const { state, shapes } = scene(["original", "copy"]);
    expect(pickShapeAt(state, shapes, 200, 200, "mouse", ["copy"])).toBe("copy");
  });

  it("still takes the body in front when it is not the selected one", () => {
    // The selected body lies 5 mm behind the other one along the ray: the visible one is meant.
    const { state, shapes } = scene(["front", "selected"], { selected: -5 });
    expect(pickShapeAt(state, shapes, 200, 200, "mouse", ["selected"])).toBe("front");
  });

  it("takes a loose hole flush with the selected body's face, not the body (#774)", () => {
    // A DXF's plate and its hole: both as high, so the ray meets them at the same distance.
    const { state, shapes } = scene(["plate", "hole"]);
    expect(pickShapeAt(state, shapes, 200, 200, "mouse", ["plate"])).toBe("hole");
    expect(pickShapeAt(state, shapes, 200, 200)).toBe("hole");
  });

  it("still takes the selected one of two holes that lie on one another", () => {
    const { state, shapes } = scene(["hole-original", "hole-copy"]);
    expect(pickShapeAt(state, shapes, 200, 200, "mouse", ["hole-copy"])).toBe("hole-copy");
  });
});
