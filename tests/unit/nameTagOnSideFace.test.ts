import manifoldModule from "manifold-3d";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { carriedOntoFace } from "@/lib/carryOntoFace";
import { restoreGroupedChildren } from "@/lib/editorBooleans";
import { layeredTextShape } from "@/lib/editorTextTags";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { NAME_TAG_LAYERS } from "@/lib/nameTag";
import { textLayerShapes, textLayersOf } from "@/lib/textLayers";
import { loadTextFonts } from "@/lib/textFonts";
import type { WorkplaneShape } from "@/types/layerling";

// #696: a name tag on a side face was built again with its layers stacked up the world, not out of the face.
beforeAll(async () => {
  const runtime = await manifoldModule();
  runtime.setup();
  rememberManifoldRuntime(runtime);
  await loadTextFonts();
});

const text = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "t", name: "Text", kind: "text", color: "#ffffff", x: 0, z: 0, elevation: 0, rotation: 0,
  width: 60, depth: 20, height: 1.2, size: 60, text: "Name", font: "Sans", ...overrides,
} as WorkplaneShape);

const upOf = (shape: WorkplaneShape) => new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(shape.rotationX ?? 0), THREE.MathUtils.degToRad(shape.rotation ?? 0), THREE.MathUtils.degToRad(shape.rotationZ ?? 0), "XYZ",
));
const middleOf = (shape: WorkplaneShape) => new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);

/** Each layer's middle, measured along the stack's up from the bottom layer's underside, top layer first. */
function levels(layers: WorkplaneShape[]) {
  const up = upOf(layers[0]);
  const bottom = layers[layers.length - 1];
  const foot = middleOf(bottom).addScaledVector(up, -bottom.height / 2);
  return layers.map((layer) => middleOf(layer).sub(foot));
}

function onSideFace() {
  const tag = layeredTextShape(text(), NAME_TAG_LAYERS, [], "tag", { locked: false, hidden: false, name: "Name" });
  const patch = carriedOntoFace([tag], ["tag"], { point: { x: 10, y: 10, z: 0 }, normal: { x: 1, y: 0, z: 0 } }).get("tag")!;
  return restoreGroupedChildren({ ...tag, ...patch } as WorkplaneShape);
}

describe("a name tag on a side face", () => {
  it("stacks its layers out of the face when it is built again", () => {
    const placed = onSideFace();
    const stack = textLayersOf(placed)!;
    const rebuilt = textLayerShapes(stack.source, stack.layers, stack.ids, stack.keyring);
    rebuilt.forEach((layer, index) => {
      expect(layer.x).toBeCloseTo(placed[index].x, 2);
      expect(layer.z).toBeCloseTo(placed[index].z, 2);
      expect(layer.elevation ?? 0).toBeCloseTo(placed[index].elevation ?? 0, 2);
    });
    // Out of the face: along +x, each layer on the one below it, none shifted up or sideways.
    let below = 0;
    levels(rebuilt).reverse().forEach((offset, fromBottom) => {
      const layer = rebuilt[rebuilt.length - 1 - fromBottom];
      expect(offset.x).toBeCloseTo(below + layer.height / 2, 2);
      expect(offset.y).toBeCloseTo(0, 2);
      expect(offset.z).toBeCloseTo(0, 2);
      below += layer.height;
    });
  });

  it("reads its letters back onto the face, where the bottom layer lies", () => {
    const placed = onSideFace();
    const source = textLayersOf(placed)!.source;
    const bottom = placed[placed.length - 1];
    const up = upOf(source);
    const foot = (shape: WorkplaneShape) => middleOf(shape).addScaledVector(up, -shape.height / 2);
    expect(foot(source).distanceTo(foot(bottom))).toBeLessThan(0.01);
  });

  it("builds a lying tag as before", () => {
    const layers = textLayerShapes(text({ elevation: 4 }), NAME_TAG_LAYERS);
    expect(layers.map((layer) => layer.elevation)).toEqual([8.2, 7, 4]);
    expect(layers.every((layer) => layer.x === 0 && layer.z === 0)).toBe(true);
  });
});
