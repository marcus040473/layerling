export type DragAxis = "x" | "z";

/** How far, in screen pixels, the pointer must have moved before a Shift drag settles on an axis (#909). */
export const DRAG_AXIS_LATCH_PIXELS = 10;

/**
 * The axis a Shift drag is held to. It is chosen once, from the way the pointer has gone, when it has moved far
 * enough that the direction is clear, and then kept until Shift is let go. Decided anew with every move, the
 * choice jumped between the two axes where the pointer had gone about as far along both, near the start of a
 * drag, and the part jerked diagonally. `along` is null while the pointer has not moved far enough: the part waits.
 */
export function latchedDragAxis(latched: DragAxis | null, dominant: DragAxis, pixelsMoved: number): { along: DragAxis | null; latched: DragAxis | null } {
  if (latched) return { along: latched, latched };
  if (pixelsMoved < DRAG_AXIS_LATCH_PIXELS) return { along: null, latched: null };
  return { along: dominant, latched: dominant };
}
