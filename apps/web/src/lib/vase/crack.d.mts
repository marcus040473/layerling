// Types for crack.mjs: cracks across a surface as in kintsugi, kept the same as in the vase tool's texture tool.

/** The surface to search on: a grid over its triangles. */
export type CrackSurfaceIndex = { normals: Float64Array; cell: number };

/** The settings of one texture layer that the cracks read (the vase tool's names). */
export type CrackSettings = {
  crackStyle: "riss" | "blitz";
  crackStart: "oben" | "unten" | "aussen" | "frei";
  crackCount: number;
  /** In % of the height (from the rim to the middle: of the radius). */
  crackLength: number;
  /** Width at the start, mm. */
  crackWidth: number;
  crackBranch: number;
  crackJag: number;
  crackRough: number;
  /** Drawn lines: points [x, y, z] in the mesh's frame. */
  crackPaths?: number[][][];
  seed: number;
};

export type CrackNetwork = {
  segs: Float64Array;
  count: number;
  cell: number;
  maxHw: number;
  /** Total length of the lines, mm. */
  length: number;
  lines: Array<{ points: number[][]; level: number }>;
};

export function surfaceIndex(mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number> }): CrackSurfaceIndex;
export function crackNetwork(
  mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number> },
  settings: CrackSettings,
  context: {
    index?: CrackSurfaceIndex;
    /** 0, 1 or 2: the axis the body stands along. */
    axis: number;
    /** The axis' place across it. */
    center: [number, number];
    lo: number;
    hi: number;
    maxRadius: number;
    /** Whether a crack may grow over this face, at this point. */
    allowed?: (face: number, point: number[]) => boolean;
  },
): CrackNetwork;
/** The notch's value (0 to 1) at a point with its normal; profile "v", "flach" or round. */
export function crackValue(net: CrackNetwork, x: number, y: number, z: number, nx: number, ny: number, nz: number, profile: string): number;
/** Whether the edge a-b (points in `verts`) lies in the band round a crack, half its width plus `margin`. */
export function crackEdgeNear(net: CrackNetwork, verts: ArrayLike<number>, a: number, b: number, margin: number): boolean;
/** The body that fills the notch, its top `recess` mm below the surface: `depth` per point, `dir` the way each point moved. */
export function crackFillBody(out: ArrayLike<number>, indices: ArrayLike<number>, depth: ArrayLike<number>, dir: ArrayLike<number>, recess: number): { vertices: Float32Array; indices: Uint32Array };
export function normalizeCrackPaths(list: unknown): number[][][];
export const MAX_CRACK_PATHS: number;
export const MAX_CRACK_POINTS: number;
