// Types for unfold.mjs: a surface rolled out from an anchor like a label pressed on, taken from the vase tool's texture core.

/** The surface point nearest to `point`: its triangle, the point and how far it is. */
export function nearestSurfacePoint(
  mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number> },
  point: number[],
): { face: number; point: number[]; distance: number } | null;

/**
 * The surface rolled out from the anchor: per point its place in the unrolled plane (U to the right, V up, mm,
 * seen from outside; NaN where it was not reached), and the frame at the anchor. `torn`: points where two ways
 * round a corner met and do not agree.
 */
export function unfoldSurface(
  mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number> },
  anchor: number[],
  options?: {
    up?: number[] | null;
    axis?: "x" | "y" | "z";
    reach?: number;
    face?: number;
    /** Only within this window round the anchor (half width and height in mm, turned by `turn` degrees). */
    window?: { halfW: number; halfH: number; turn?: number } | null;
  },
): { U: Float64Array; V: Float64Array; reached: number; torn: number; face: number; point: number[]; normal: number[]; up: number[]; right: number[] };
