import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { shellSolid } from "@/lib/cadShell";
import { STACK_NEEDS_TOP_MESSAGE, STACK_NOT_STRAIGHT_MESSAGE, STACK_TOO_LOW_MESSAGE, STACK_WALL_THIN_MESSAGE, shellStackSolid } from "@/lib/cadShellStack";

const ROTATE_Z_TO_Y: number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0];

describe("stacking a hollowed box with the real OCCT kernel", () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    kernel = await OcctKernel.init({ wasm });
  });

  function yUp(shape: ShapeHandle) {
    const turned = kernel.transform(shape, ROTATE_Z_TO_Y);
    kernel.release(shape);
    return turned;
  }

  /** The box as made from a 40 x 30 x `height` block, centred on x and z, and its hollowed body. */
  function made(wall = 2, height = 20) {
    const solid = yUp(kernel.makeBox(40, 30, height));
    const original = kernel.translate(solid, -20, 0, 15);
    return { original, hollow: shellSolid(kernel, original, wall, "top") };
  }
  const at = (shape: ShapeHandle, x: number, y: number, z: number) => kernel.containsPoint(shape, { x, y, z });

  it("stands on a foot set in by the wall and the play, widening at 45 degrees, with the floor raised over it", () => {
    const { original, hollow } = made();
    const stacked = shellStackSolid(kernel, hollow, 3, 2, original);
    expect(kernel.isValid(stacked)).toBe(true);
    expect(kernel.getSubShapes(stacked, "solid")).toHaveLength(1);
    const bounds = kernel.getBoundingBox(stacked, false);
    // The top is as it was: every lid fits.
    expect(bounds.ymax - bounds.ymin).toBeCloseTo(20, 3);
    expect(bounds.xmax - bounds.xmin).toBeCloseTo(40, 3);
    // The foot: 2.25 mm in from the outside up to 3 mm, then widening to the full size by 5.25 mm.
    expect(at(stacked, -19, 1.5, 0)).toBe(false);
    expect(at(stacked, -17.5, 1.5, 0)).toBe(true);
    expect(at(stacked, -19.6, 4.5, 0)).toBe(false);
    expect(at(stacked, -19.6, 6, 0)).toBe(true);
    // The floor is raised to 7.25 mm, solid under it; the cavity begins above.
    expect(at(stacked, 0, 7, 0)).toBe(true);
    expect(at(stacked, 0, 7.6, 0)).toBe(false);
  });

  it("makes a box whose foot goes into the opening of the one below without the two meeting", () => {
    const { original, hollow } = made();
    const stacked = shellStackSolid(kernel, hollow, 3, 2, original);
    // The box above stands on the rim of the one below: its foot reaches 3 mm into it.
    const above = kernel.translate(stacked, 0, 17, 0);
    expect(kernel.getVolume(kernel.common(stacked, above))).toBeLessThan(1e-6);
    // A plain box would stand in the walls.
    const plain = kernel.translate(hollow, 0, 17, 0);
    expect(kernel.getVolume(kernel.common(stacked, plain))).toBeGreaterThan(100);
  });

  it("says why it cannot", () => {
    const thin = made(0.6);
    expect(() => shellStackSolid(kernel, thin.hollow, 3, 0.6, thin.original)).toThrow(STACK_WALL_THIN_MESSAGE);
    const low = made(2, 9);
    expect(() => shellStackSolid(kernel, low.hollow, 3, 2, low.original)).toThrow(STACK_TOO_LOW_MESSAGE);
    const block = yUp(kernel.makeBox(40, 30, 20));
    expect(() => shellStackSolid(kernel, shellSolid(kernel, block, 2, "none"), 3, 2, block)).toThrow(STACK_NEEDS_TOP_MESSAGE);
    // A cone is wider at the bottom than at the top.
    const cone = yUp(kernel.makeCone(20, 12, 25));
    expect(() => shellStackSolid(kernel, shellSolid(kernel, cone, 2, "top"), 3, 2, cone)).toThrow(STACK_NOT_STRAIGHT_MESSAGE);
  });

  it("stacks a round box as well", () => {
    const cylinder = yUp(kernel.makeCylinder(25, 20));
    const stacked = shellStackSolid(kernel, shellSolid(kernel, cylinder, 2, "top"), 3, 2, cylinder);
    expect(kernel.isValid(stacked)).toBe(true);
    const above = kernel.translate(stacked, 0, 17, 0);
    expect(kernel.getVolume(kernel.common(stacked, above))).toBeLessThan(1e-6);
  });
});
