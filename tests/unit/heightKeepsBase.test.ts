import { describe, expect, it } from "vitest";
import { quaternionForShape } from "@/lib/geometryRotation";
import { heightPatchKeepingBase } from "@/lib/rotationPivot";
import { patchWithResizeAnchor } from "@/components/workplane/viewportResize";
import type { WorkplaneShape } from "@/types/layerling";
import * as THREE from "three";

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box",
    name: "Box",
    kind: "box",
    color: "#ff9e2c",
    x: 5,
    z: -3,
    elevation: 12,
    size: 20,
    width: 20,
    depth: 20,
    height: 10,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

/** The middle of the bottom face in the world: the centre less half the height along the body's own up axis. */
function baseCentre(shape: WorkplaneShape) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternionForShape(shape));
  return new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z).addScaledVector(up, -shape.height / 2);
}

describe("a height change keeps the base of a turned body in place (forum, DrJones)", () => {
  it("leaves a body that is not turned to the plain patch", () => {
    const patch = { height: 25 };
    expect(heightPatchKeepingBase(box(), patch)).toBe(patch);
  });

  it("keeps the middle of the base where it was on a body turned about X and about its own axis", () => {
    for (const turned of [{ rotationX: 45 }, { rotationX: 90, rotation: 291.8, rotationZ: 90 }, { rotationZ: 30, rotation: 20 }]) {
      const before = box(turned);
      const patch = heightPatchKeepingBase(before, { height: 25 });
      const after = { ...before, ...patch };
      const a = baseCentre(before);
      const b = baseCentre(after);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(b.z).toBeCloseTo(a.z, 6);
      expect(after.height).toBe(25);
    }
  });

  it("also keeps it when the body gets lower", () => {
    const before = box({ rotationX: 45 });
    const after = { ...before, ...heightPatchKeepingBase(before, { height: 4 }) };
    expect(baseCentre(after).distanceTo(baseCentre(before))).toBeLessThan(1e-6);
  });

  it("does not touch a patch that sets the position itself or does not change the height", () => {
    const turned = box({ rotationX: 45 });
    const placed = { height: 25, elevation: 3 };
    expect(heightPatchKeepingBase(turned, placed)).toBe(placed);
    const same = { height: 10 };
    expect(heightPatchKeepingBase(turned, same)).toBe(same);
    const width = { width: 30 };
    expect(heightPatchKeepingBase(turned, width)).toBe(width);
  });
});

/** The middle of the top face in the world. */
function topCentre(shape: WorkplaneShape) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternionForShape(shape));
  return new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z).addScaledVector(up, shape.height / 2);
}

describe("the Height field keeps the base of a turned body in place (#808)", () => {
  // The text and the box from the report: laid on a face of a pyramid, 63.43 degrees about X, 1 mm high.
  const onSlope = { x: -38, z: 67.885913, elevation: 8.846209, height: 1, rotationX: 63.43 };

  it("grows a text and a box on a slope from the middle of their base, as the handle does", () => {
    for (const kind of ["text", "box"] as const) {
      const before = box({ kind, ...onSlope, ...(kind === "text" ? { text: "TEXT", width: 6.29, depth: 2 } : {}) });
      const after = { ...before, ...patchWithResizeAnchor(before, { height: 10 }, "height", null) };
      expect(after.height).toBe(10);
      expect(baseCentre(after).distanceTo(baseCentre(before))).toBeLessThan(1e-6);
    }
  });

  it("keeps the top instead after a pull on the lower handle", () => {
    const before = box(onSlope);
    const anchor = { shapeId: before.id, handleKey: "height-bottom", signs: { x: 0, z: 0 }, pressedY: "bottom" as const };
    const after = { ...before, ...patchWithResizeAnchor(before, { height: 10 }, "height", anchor) };
    expect(topCentre(after).distanceTo(topCentre(before))).toBeLessThan(1e-6);
  });

  it("still keeps the bottom of a body that is not turned at its height and leaves x and z alone", () => {
    const before = box();
    const patch = patchWithResizeAnchor(before, { height: 25 }, "height", null);
    expect(patch.elevation).toBeCloseTo(12, 6);
    expect("x" in patch || "z" in patch).toBe(false);
  });
});
