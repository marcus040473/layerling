/* What the stacking of a hollowed box offers; no kernel in here, so the panel can use it. */

/**
 * A stackable box stands on the one below with a foot: its bottom is narrower by the wall and this play per side, so it
 * goes into the opening of the box below, `height` deep. Above the foot the box widens to its full size at 45 degrees,
 * so it prints without support. In mm.
 */
export const SHELL_STACK_PLAY = 0.25;
/** The foot's lowest edge is chamfered this much against the first layer's squash (the elephant's foot), in mm. */
export const SHELL_STACK_FOOT_CHAMFER = 0.4;
/** The room the inside keeps above the raised floor at least, in mm. */
export const SHELL_STACK_MIN_DEPTH = 3;
export const SHELL_STACK_MIN_HEIGHT = 1;
export const SHELL_STACK_MAX_HEIGHT = 10;
export const DEFAULT_SHELL_STACK_HEIGHT = 3;
/** Kept for the panel: any wall the Hollow tool makes stacks; this is the thinnest. */
export const SHELL_STACK_MIN_WALL = 0.8;

/** The height of the foot kept to what is offered. */
export function clampShellStackHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SHELL_STACK_HEIGHT;
  return Math.min(SHELL_STACK_MAX_HEIGHT, Math.max(SHELL_STACK_MIN_HEIGHT, Math.round(value * 10) / 10));
}

/** How far the foot is set in from the outside: the wall and the play. */
export function shellStackInset(wall: number) {
  return Math.max(0, wall) + SHELL_STACK_PLAY;
}

/**
 * How high the floor of a stackable box is (from its bottom): the foot, the 45 degree widening above it and the floor's own
 * thickness, the wall. The foot is solid up to there.
 */
export function shellStackFloor(height: number, wall: number) {
  return clampShellStackHeight(height) + shellStackInset(wall) + Math.max(0, wall);
}
