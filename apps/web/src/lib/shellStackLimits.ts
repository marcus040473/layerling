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

/**
 * How the foot of a stackable box is made. `hollow`: the foot is the wall, set in and widening at 45 degrees like the
 * outside, so the floor lies on the plate and nothing is filled; otherwise the foot is solid up to a raised floor.
 * `grip`: a finger recess this wide (mm) at the front of the bottom, `gripDepth` deep, its ceiling at 45 degrees, to lift
 * the box off the one below; 0 or missing for none.
 */
export type ShellStackFoot = { hollow?: boolean; grip?: number; gripDepth?: number };
export const SHELL_STACK_GRIP_MIN = 10;
export const SHELL_STACK_GRIP_MAX = 80;
export const DEFAULT_SHELL_STACK_GRIP = 30;
export const SHELL_STACK_GRIP_DEPTH_MIN = 2;
export const SHELL_STACK_GRIP_DEPTH_MAX = 10;
export const DEFAULT_SHELL_STACK_GRIP_DEPTH = 4;

/** The foot's settings kept to what is offered; null when it is the plain solid foot without a grip. */
export function normalizeShellStackFoot(value: unknown): ShellStackFoot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const hollow = raw.hollow === true;
  const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
  const width = number(raw.grip);
  const grip = width > 0 ? Math.min(SHELL_STACK_GRIP_MAX, Math.max(SHELL_STACK_GRIP_MIN, Math.round(width))) : 0;
  const depthRaw = number(raw.gripDepth);
  const gripDepth = Number.isNaN(depthRaw) ? DEFAULT_SHELL_STACK_GRIP_DEPTH : Math.min(SHELL_STACK_GRIP_DEPTH_MAX, Math.max(SHELL_STACK_GRIP_DEPTH_MIN, Math.round(depthRaw * 2) / 2));
  if (!hollow && !grip) return null;
  return { ...(hollow ? { hollow: true } : {}), ...(grip ? { grip, gripDepth } : {}) };
}

/**
 * How high the grip's recess reaches up the front at the outside, from the box's bottom: its depth, so its ceiling comes
 * down at 45 degrees to 1 mm above the foot, and the foot's height, so a finger finds that much room above the rim of the
 * box below.
 */
export function shellStackGripHeight(height: number, gripDepth: number) {
  return clampShellStackHeight(height) + 1 + gripDepth;
}
