import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { RENDER_LAYER_HELPERS, findShapeObject, setObjectRenderLayer, type ThreeState } from "@/components/workplane/ViewportOverlays";

/**
 * The marking of the objects picked in the History view. There are no handles
 * and no ground shadow there, so the thin selection edge alone was hard to
 * see: picked objects get a wide outline that shows through whatever stands
 * in front of them, and a tint over their surfaces.
 */

const PICK_COLOR = "#00aeea";
const PICK_OUTLINE_PX = 2;
const PICK_TINT_OPACITY = 0.28;
/** Only creases sharper than this get an outline, so a round body shows its rims, not every facet. */
const PICK_EDGE_ANGLE = 30;
/** Above this a mesh gets the tint only: its outline would take too long to work out on a click. */
const PICK_OUTLINE_TRIANGLE_LIMIT = 200_000;

const highlightLayers = new WeakMap<ThreeState, Map<string, THREE.Group>>();

/** Draws the marking for these objects, replacing what was drawn before; no ids clears it. */
export function syncHistoryPickHighlight(state: ThreeState, ids: readonly string[]) {
  syncPickHighlight(state, ids, "history-pick-highlight");
}

/**
 * The same marking in a layer of its own, so two uses do not clear each other: the History view's,
 * and the body a row of "Select other" points at (#804).
 */
export function syncPickHighlight(state: ThreeState, ids: readonly string[], name: string) {
  let layers = highlightLayers.get(state);
  if (!layers) {
    layers = new Map();
    highlightLayers.set(state, layers);
  }
  let layer = layers.get(name);
  if (!layer) {
    layer = new THREE.Group();
    layer.name = name;
    state.scene.add(layer);
    layers.set(name, layer);
  }
  clearLayer(layer);

  if (ids.length > 0) {
    const tint = new THREE.MeshBasicMaterial({
      color: PICK_COLOR,
      transparent: true,
      opacity: PICK_TINT_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });
    tint.toneMapped = false;
    const rect = state.renderer.domElement.getBoundingClientRect();
    const outline = new LineMaterial({
      color: PICK_COLOR,
      linewidth: PICK_OUTLINE_PX,
      worldUnits: false,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    });
    outline.toneMapped = false;
    outline.resolution.set(Math.max(1, rect.width), Math.max(1, rect.height));
    layer.userData.materials = [tint, outline];

    for (const id of ids) {
      const object = findShapeObject(state, id);
      if (!object) continue;
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.visible) return;
        const geometry = child.geometry as THREE.BufferGeometry;
        const surface = new THREE.Mesh(geometry, tint);
        surface.matrixAutoUpdate = false;
        surface.matrix.copy(child.matrixWorld);
        surface.renderOrder = 1004;
        layer.add(surface);

        const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute("position")?.count ?? 0) / 3;
        if (triangles > PICK_OUTLINE_TRIANGLE_LIMIT) return;
        const edges = new THREE.EdgesGeometry(geometry, PICK_EDGE_ANGLE);
        const lineGeometry = new LineSegmentsGeometry().setPositions(edges.getAttribute("position").array as Float32Array);
        edges.dispose();
        const line = new LineSegments2(lineGeometry, outline);
        line.matrixAutoUpdate = false;
        line.matrix.copy(child.matrixWorld);
        line.frustumCulled = false;
        line.renderOrder = 1005;
        line.userData.ownGeometry = true;
        layer.add(line);
      });
    }
    setObjectRenderLayer(layer, RENDER_LAYER_HELPERS);
  }
  state.needsRender = true;
}

function clearLayer(layer: THREE.Group) {
  for (const child of [...layer.children]) {
    // The tint draws the body's own geometry, which the body still needs; only the outlines own theirs.
    if (child.userData.ownGeometry && "geometry" in child) (child.geometry as THREE.BufferGeometry).dispose();
    layer.remove(child);
  }
  for (const material of (layer.userData.materials ?? []) as THREE.Material[]) material.dispose();
  layer.userData.materials = [];
}
