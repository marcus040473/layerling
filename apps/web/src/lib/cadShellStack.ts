import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { block, moved, rimFaces, tracking } from "@/lib/cadLid";
import { DEFAULT_SHELL_STACK_HEIGHT, SHELL_STACK_FOOT_CHAMFER, SHELL_STACK_MAX_HEIGHT, SHELL_STACK_MIN_DEPTH, SHELL_STACK_MIN_HEIGHT, SHELL_STACK_MIN_WALL, SHELL_STACK_PLAY, clampShellStackHeight, shellStackFloor, shellStackInset } from "@/lib/shellStackLimits";
import { STACK_FAILED_MESSAGE, STACK_NEEDS_TOP_MESSAGE, STACK_NOT_STRAIGHT_MESSAGE, STACK_TOO_LOW_MESSAGE, STACK_WALL_THIN_MESSAGE } from "@/lib/shellStackMessages";

export { DEFAULT_SHELL_STACK_HEIGHT, SHELL_STACK_FOOT_CHAMFER, SHELL_STACK_MAX_HEIGHT, SHELL_STACK_MIN_DEPTH, SHELL_STACK_MIN_HEIGHT, SHELL_STACK_MIN_WALL, SHELL_STACK_PLAY, clampShellStackHeight, shellStackFloor, shellStackInset };
export { STACK_FAILED_MESSAGE, STACK_NEEDS_TOP_MESSAGE, STACK_NOT_STRAIGHT_MESSAGE, STACK_TOO_LOW_MESSAGE, STACK_WALL_THIN_MESSAGE };

/*
 * Stacking for a hollowed box with its top open, the way Gridfinity bins stack: the bottom is a foot, narrower than the box by
 * the wall and a little play per side, that goes into the opening of the box below; above it the box widens to its full size
 * at 45 degrees, so it prints standing on its foot without support. The floor is raised to the top of that widening and the
 * foot is solid, so nothing in it is thin. The top stays as it was: every lid fits as before. The foot's lowest edge is
 * chamfered a little against the squash of the first layer. Everything here is in the scene's frame, y up.
 */

/** The area of what the outlines of the faces at the rim enclose, in mm². */
function outerArea(cad: OcctKernel, faces: Array<{ outer: ShapeHandle }>) {
  return faces.reduce((sum, { outer }) => sum + cad.getSurfaceArea(cad.makeFace(outer)), 0);
}

/**
 * The hollowed `solid` (made from `original`, the body before, which holds the cavity as solid) with the foot. Throws an error
 * with one of the messages above where it cannot be done; the caller shows it.
 */
export function shellStackSolid(kernel: OcctKernel, solid: ShapeHandle, height: number, wall: number, original: ShapeHandle): ShapeHandle {
  const made: ShapeHandle[] = [];
  const cad = tracking(kernel, made);
  let result: ShapeHandle | null = null;
  try {
    const foot = clampShellStackHeight(height);
    if (wall < SHELL_STACK_MIN_WALL - 1e-9) throw new Error(STACK_WALL_THIN_MESSAGE);
    const box = cad.getBoundingBox(solid);
    const top = box.ymax;
    const bottom = box.ymin;
    const total = top - bottom;
    const inset = shellStackInset(wall);
    const floorTop = bottom + shellStackFloor(foot, wall);
    // The raised floor and the room above it fit into the body's height.
    if (top - floorTop < SHELL_STACK_MIN_DEPTH) throw new Error(STACK_TOO_LOW_MESSAGE);
    const rim = top - Math.min(0.3, total * 0.02);
    const faces = rimFaces(cad, solid, rim);
    if (!faces || faces.length === 0 || faces.every(({ openings }) => openings.length === 0)) throw new Error(STACK_NEEDS_TOP_MESSAGE);
    // The foot of the box above goes into the opening of the box below: the outline at the bottom as wide as at the rim.
    const footPlane = bottom + Math.min(0.3, total * 0.02);
    const footFaces = rimFaces(cad, solid, footPlane);
    if (!footFaces) throw new Error(STACK_NOT_STRAIGHT_MESSAGE);
    const topArea = outerArea(cad, faces);
    if (Math.abs(topArea - outerArea(cad, footFaces)) > 0.01 * topArea) throw new Error(STACK_NOT_STRAIGHT_MESSAGE);
    const keep: ShapeHandle[] = [];
    for (const { outer } of footFaces) {
      const footFace = moved(cad, outer, -inset);
      const lowest = moved(cad, outer, -(inset + SHELL_STACK_FOOT_CHAMFER));
      if (!footFace) throw new Error(STACK_FAILED_MESSAGE);
      const chamfer = Math.min(SHELL_STACK_FOOT_CHAMFER, foot / 2);
      if (lowest && chamfer > 0) {
        // The lowest edge: widening at 45 degrees from the chamfer's inset to the foot's.
        keep.push(cad.draftPrism(cad.translate(lowest, 0, bottom - footPlane, 0), 0, chamfer, 0, -45));
        keep.push(block(cad, footFace, footPlane, bottom + chamfer, bottom + foot));
      } else {
        keep.push(block(cad, footFace, footPlane, bottom - 1, bottom + foot));
      }
      // Above the foot, widening at 45 degrees to the full outline.
      keep.push(cad.draftPrism(cad.translate(footFace, 0, bottom + foot - footPlane, 0), 0, inset, 0, -45));
    }
    const wide = { x0: box.xmin - 1, z0: box.zmin - 1, x1: box.xmax + 1, z1: box.zmax + 1 };
    const slab = (low: number, high: number) => cad.makeBoxFromCorners({ x: wide.x0, y: low, z: wide.z0 }, { x: wide.x1, y: high, z: wide.z1 });
    keep.push(slab(bottom + foot + inset - 0.01, top + 1));
    // The floor raised to the top of the widening: the foot is solid.
    const filled = cad.fuseAll([solid, cad.common(original, slab(bottom - 1, floorTop))]);
    let body = cad.common(filled, cad.fuseAll(keep));
    body = cad.simplify(body);
    const solids = cad.isSolid(body) ? [body] : cad.getSubShapes(body, "solid");
    if (solids.length !== 1 || !cad.isValid(solids[0]) || cad.getVolume(solids[0]) <= 0) throw new Error(STACK_FAILED_MESSAGE);
    result = solids[0];
    return result;
  } finally {
    made.forEach((handle) => {
      if (handle === result) return;
      try {
        kernel.release(handle);
      } catch {
        // already gone
      }
    });
  }
}
