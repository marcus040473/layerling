/**
 * Surface texture: a computed relief - grooves, knurling, honeycomb, bumps -
 * laid onto the surface of any closed body, as a modification of its mesh.
 *
 * How: the body's triangles are welded into a closed mesh, refined until it
 * is fine enough for the pattern, and every point is moved along its normal
 * by depth × pattern value × weight. The weight keeps faces smooth (the
 * bottom, the top, a height band, sharp edges, inner or outer walls) and
 * fades the pattern in over a few millimetres at their border.
 *
 * Refining is what makes the relief clean, so it follows the pattern:
 * - Grooves: every triangle is cut into thin strips along the grooves, at
 *   fixed places of the groove profile (its edge, M places on the flank, its
 *   middle). Then every groove is equally deep everywhere, with a quarter of
 *   the triangles an even refinement needed.
 * - Knurling: split finely across the grooves and coarsely along them.
 * - Honeycomb: cut along the cell borders, the corner lines and M levels of
 *   the joint profile, so the joints are straight instead of jagged.
 * - Bumps: cut along spokes through every bump's middle and rings at the
 *   levels of its profile (a half ball, a cone, a soft or a flat top).
 * - Cracks (kintsugi, see vase/crack.mjs): lines that grow across the surface,
 *   with kinks, branches and a tapering width; only the band round them is
 *   refined. Their notch can be filled by a body of its own (gold, a second
 *   filament), its top a little below the surface.
 * - Text, stuck on (see vase/unfold.mjs): the surface round an anchor is rolled
 *   out like a label pressed on, and the letters' outlines are laid onto it -
 *   engraved or raised, along a vase's belly or over a box's edge. Only the
 *   window round the text is refined, and the mesh is cut along both sides of
 *   every letter's wall: the edges follow the outlines, not the grid.
 *
 * Around a cylinder the spacing is rounded so that a whole number of grooves
 * or cells goes round: the pattern closes at the seam. The axis of a round
 * body is fitted to its walls (a handle does not pull it aside).
 *
 * Millimetres. The pattern works in the frame the editor shows (z up, see
 * displayAxes.ts); positions come in and go out in the editor's inside frame.
 */

import {
  adjacency,
  baseMesh,
  EdgeTable,
  clampToBed,
  collapseShortEdges,
  dropFins,
  fadeWeights,
  faceCross,
  fixCaps,
  interpolatedNormals,
  normalsAndCreases,
  prepareSurfaceBase,
  SURFACE_MIN_EDGE,
  sliceByField,
  subdivide,
  type Adjacency,
  type SurfaceBase,
  type SurfaceMesh,
} from "@/lib/surfaceTextureMesh";
import { crackEdgeNear, crackFillBody, crackNetwork, crackValue, surfaceIndex, type CrackNetwork, type CrackSurfaceIndex } from "@/lib/vase/crack.mjs";
import { nearestSurfacePoint, unfoldSurface } from "@/lib/vase/unfold.mjs";

export const SURFACE_TEXTURE_PATTERNS = ["grooves", "knurl", "honeycomb", "bumps", "cracks", "text"] as const;
export type SurfaceTexturePattern = (typeof SURFACE_TEXTURE_PATTERNS)[number];
/** Cross-section of a groove or joint: round (cosine), pointed (V) or flat (a flat floor with steep flanks). */
/** round: a soft bell; pointed: a V (a cone on a bump); flat: a flat floor or top; dome: a half circle (half a ball on a bump). */
export const SURFACE_TEXTURE_PROFILES = ["round", "pointed", "flat", "dome"] as const;
export type SurfaceTextureProfile = (typeof SURFACE_TEXTURE_PROFILES)[number];
/**
 * How the pattern comes onto the body. Cylinder: around an axis, closing at the seam. All round:
 * from three sides, blended by the normal (triplanar) - for bodies that are not round. Flat: seen
 * along the axis, like a stamp.
 */
/** auto: around the axis on a round body, all round on an angular one (decided per body, see isRoundBody). */
export const SURFACE_TEXTURE_PROJECTIONS = ["auto", "cylinder", "allRound", "flat"] as const;
export type SurfaceTextureProjection = (typeof SURFACE_TEXTURE_PROJECTIONS)[number];
export const SURFACE_TEXTURE_DIRECTIONS = ["inward", "outward", "both"] as const;
export type SurfaceTextureDirection = (typeof SURFACE_TEXTURE_DIRECTIONS)[number];
export const SURFACE_TEXTURE_DETAILS = ["coarse", "medium", "fine"] as const;
export type SurfaceTextureDetail = (typeof SURFACE_TEXTURE_DETAILS)[number];
/** Axes as the editor shows them: X right, Y back, Z up. */
/** Cracks: a crack wanders, a lightning bolt zigzags round its way. */
export const SURFACE_TEXTURE_CRACK_STYLES = ["crack", "lightning"] as const;
export type SurfaceTextureCrackStyle = (typeof SURFACE_TEXTURE_CRACK_STYLES)[number];
/** Where cracks begin: at the top rim (a vase, a cup), at the bottom, at the rim towards the middle (a plate), anywhere. */
export const SURFACE_TEXTURE_CRACK_STARTS = ["top", "bottom", "rim", "anywhere"] as const;
export type SurfaceTextureCrackStart = (typeof SURFACE_TEXTURE_CRACK_STARTS)[number];

export const SURFACE_TEXTURE_AXES = ["x", "y", "z"] as const;
export type SurfaceTextureAxis = (typeof SURFACE_TEXTURE_AXES)[number];
/** A mask keeps the texture away from what lies inside it, or is the only place the texture goes. */
export const SURFACE_TEXTURE_MASK_MODES = ["exclude", "only"] as const;
export type SurfaceTextureMaskMode = (typeof SURFACE_TEXTURE_MASK_MODES)[number];
export const SURFACE_TEXTURE_MAX_MASKS = 20;
export const SURFACE_TEXTURE_MAX_MASK_PLANES = 2048;

/**
 * A helper body for the texture: a convex body (a box, a cylinder, a sphere, a cone) given by the
 * planes of its faces, four numbers each - the normal and the offset d, with the inside where
 * normal · point <= d - in the editor's inside frame. `box` (min x, y, z, max x, y, z), when given,
 * lets the test pass over the points far from the mask quickly.
 */
export type SurfaceTextureMask = { mode: SurfaceTextureMaskMode; planes: number[]; box?: number[] };

export type SurfaceTextureSettings = {
  pattern: SurfaceTexturePattern;
  /** Distance between grooves or cell centres, in mm (around a cylinder rounded so the pattern closes). */
  spacing: number;
  /** How far the surface moves at the deepest place, in mm. */
  depth: number;
  /** Share of the spacing a groove, joint or bump takes (0.1 to 1). */
  width: number;
  profile: SurfaceTextureProfile;
  /** Grooves and knurling: slant against the axis in degrees (0 = along the axis). */
  angle: number;
  direction: SurfaceTextureDirection;
  projection: SurfaceTextureProjection;
  axis: SurfaceTextureAxis;
  /** Faces pointing down within this many degrees stay smooth (0 = the bottom gets the pattern too). */
  bottomFree: number;
  /** Faces pointing up within this many degrees stay smooth. */
  topFree: number;
  /** Height band with the pattern, in % of the body's height. */
  zoneFrom: number;
  zoneTo: number;
  /** Sharp edges (bending by more than `edgeAngle` degrees) stay smooth. */
  keepEdges: boolean;
  edgeAngle: number;
  /** The pattern fades in over this many mm next to everything that stays smooth. */
  fade: number;
  /** And keeps this many mm away from it first. */
  margin: number;
  /** Walls facing away from the axis (outside) and towards it (inside, like the inner wall of a cup). */
  outside: boolean;
  inside: boolean;
  detail: SurfaceTextureDetail;
  /** Helper bodies: the texture stays out of every "exclude" mask and, with any "only" mask, goes only into those. */
  masks: SurfaceTextureMask[];
  /** Cracks: style, where they begin and how many. */
  crackStyle: SurfaceTextureCrackStyle;
  crackStart: SurfaceTextureCrackStart;
  crackCount: number;
  /** In % of the body's height (from the rim to the middle: of its radius). */
  crackLength: number;
  /** Width at the start, mm; the crack tapers to its end. */
  crackWidth: number;
  /** Branching, zigzag and chipped edges, each 0 to 1. */
  crackBranch: number;
  crackJag: number;
  crackRough: number;
  /** The same number, the same cracks. */
  crackSeed: number;
  /** Fill the notch with a body of its own (gold, a second filament), its top `crackRecess` mm below the surface. */
  crackGold: boolean;
  crackRecess: number;
  /** Text stuck on: the words, the font (as a text shape names it) and the height of the text's box, mm. */
  textContent: string;
  textFont: string;
  textSize: number;
  /** Where it sits: round the axis (degrees, 0 = the front, 90 = the right) and up it (% of the body's height). */
  textAround: number;
  textHeight: number;
  /** Turned on the surface, degrees. */
  textTurn: number;
  /**
   * The letters' outlines, made from the words and the font where fonts are at hand (see surfaceTextOutline.ts):
   * rings [x0, y0, x1, y1, ...] in mm, y up, the text's box centred on 0, 0. Inside by the even-odd rule.
   */
  textOutline: number[][];
};

export const SURFACE_TEXTURE_DEFAULTS: Readonly<SurfaceTextureSettings> = Object.freeze({
  pattern: "knurl",
  spacing: 3,
  depth: 0.6,
  width: 0.6,
  profile: "pointed",
  angle: 30,
  direction: "inward",
  projection: "auto",
  axis: "z",
  bottomFree: 30,
  // Around a cylinder, grooves on a level face would become rays to the middle (the inside
  // of a cup's bottom): the top stays smooth up to 30 degrees too.
  topFree: 30,
  zoneFrom: 0,
  zoneTo: 100,
  keepEdges: true,
  edgeAngle: 30,
  fade: 1,
  margin: 0,
  outside: true,
  inside: false,
  detail: "medium",
  masks: [],
  crackStyle: "crack",
  crackStart: "top",
  crackCount: 5,
  crackLength: 60,
  crackWidth: 1.5,
  crackBranch: 0.4,
  crackJag: 0.5,
  crackRough: 0.3,
  crackSeed: 1,
  crackGold: false,
  crackRecess: 0.3,
  textContent: "Layerling",
  textFont: "Multilanguage",
  textSize: 10,
  textAround: 0,
  textHeight: 50,
  textTurn: 0,
  textOutline: [],
});

type NumberKey = { [K in keyof SurfaceTextureSettings]: SurfaceTextureSettings[K] extends number ? K : never }[keyof SurfaceTextureSettings];

export const SURFACE_TEXTURE_LIMITS: Record<NumberKey, [number, number]> = {
  spacing: [0.5, 200],
  depth: [0.05, 5],
  width: [0.1, 1],
  angle: [-90, 90],
  bottomFree: [0, 90],
  topFree: [0, 90],
  zoneFrom: [0, 100],
  zoneTo: [0, 100],
  edgeAngle: [5, 90],
  fade: [0, 10],
  margin: [0, 30],
  crackCount: [0, 24],
  crackLength: [5, 300],
  crackWidth: [0.2, 8],
  crackBranch: [0, 1],
  crackJag: [0, 1],
  crackRough: [0, 1],
  crackSeed: [0, 99999],
  crackRecess: [0, 3],
  textSize: [2, 200],
  textAround: [-180, 180],
  textHeight: [0, 100],
  textTurn: [-180, 180],
};

const CHOICES = {
  pattern: SURFACE_TEXTURE_PATTERNS,
  profile: SURFACE_TEXTURE_PROFILES,
  direction: SURFACE_TEXTURE_DIRECTIONS,
  projection: SURFACE_TEXTURE_PROJECTIONS,
  axis: SURFACE_TEXTURE_AXES,
  detail: SURFACE_TEXTURE_DETAILS,
  crackStyle: SURFACE_TEXTURE_CRACK_STYLES,
  crackStart: SURFACE_TEXTURE_CRACK_STARTS,
} as const;

/** Points per half crack width, by detail (as the vase tool). */
const CRACK_STEPS: Record<SurfaceTextureDetail, number> = { coarse: 1.5, medium: 2.5, fine: 4 };
/** The crack module's names for profile, style and start. */
const CRACK_PROFILE: Record<SurfaceTextureProfile, string> = { round: "rund", pointed: "v", flat: "flach", dome: "rund" };
const CRACK_STYLE_NAMES: Record<SurfaceTextureCrackStyle, "riss" | "blitz"> = { crack: "riss", lightning: "blitz" };
const CRACK_START_NAMES: Record<SurfaceTextureCrackStart, "oben" | "unten" | "aussen" | "frei"> = { top: "oben", bottom: "unten", rim: "aussen", anywhere: "frei" };
/** Text: points per height of the text's box, by detail. */
const TEXT_STEPS: Record<SurfaceTextureDetail, number> = { coarse: 16, medium: 28, fine: 45 };
/** Settings that are free words rather than a choice, and how long they may be. */
const FREE_TEXT: Partial<Record<keyof SurfaceTextureSettings, number>> = { textContent: 200, textFont: 120 };
/** At most this many points in a text's outlines. */
export const SURFACE_TEXTURE_MAX_TEXT_POINTS = 60_000;

/** Points per groove width or joint across (grooves, knurling, honeycomb). */
const CROSS_STEPS: Record<SurfaceTextureDetail, number> = { coarse: 6, medium: 10, fine: 16 };
/** Points per spacing for the patterns refined evenly. */
const DETAIL_STEPS: Record<SurfaceTextureDetail, number> = { coarse: 3, medium: 5, fine: 8 };
/**
 * Default triangle budget of a result. The textured body is kept as a mesh in the design and in
 * every undo step, so it stays well below what a slicer would take; a preview uses less and a
 * coarser grid.
 */
export const SURFACE_TEXTURE_MAX_TRIANGLES = 600_000;
export const SURFACE_TEXTURE_PREVIEW_TRIANGLES = 200_000;

const CELL_PATTERNS: readonly SurfaceTexturePattern[] = ["honeycomb", "bumps"];
const SQRT3 = Math.sqrt(3);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Settings completed and kept within their limits; anything unknown or not a plain value falls
 * back to the default. Safe for whatever a saved file, a link or an assistant brings.
 */
export function normalizeSurfaceTexture(input: unknown): SurfaceTextureSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: SurfaceTextureSettings = { ...SURFACE_TEXTURE_DEFAULTS };
  const target = out as Record<string, unknown>;
  (Object.keys(SURFACE_TEXTURE_DEFAULTS) as (keyof SurfaceTextureSettings)[]).forEach((key) => {
    const value = source[key];
    if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") return;
    const fallback = SURFACE_TEXTURE_DEFAULTS[key];
    if (typeof fallback === "number") {
      const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
      if (Number.isFinite(n)) target[key] = n;
    } else if (FREE_TEXT[key] !== undefined) {
      if (typeof value === "string") target[key] = value.slice(0, FREE_TEXT[key]);
    } else if (typeof fallback === "boolean") {
      if (typeof value === "boolean") target[key] = value;
      else if (value === "true" || value === "false") target[key] = value === "true";
    } else if ((CHOICES[key as keyof typeof CHOICES] as readonly string[]).includes(String(value))) {
      target[key] = String(value);
    }
  });
  (Object.keys(SURFACE_TEXTURE_LIMITS) as NumberKey[]).forEach((key) => {
    out[key] = clamp(out[key], ...SURFACE_TEXTURE_LIMITS[key]);
  });
  if (out.zoneTo < out.zoneFrom) [out.zoneFrom, out.zoneTo] = [out.zoneTo, out.zoneFrom];
  out.crackCount = Math.round(out.crackCount);
  out.crackSeed = Math.round(out.crackSeed);
  // Bumps without a profile of their own are half balls; the V a groove gets by default would make them cones.
  if (out.pattern === "bumps" && source.profile === undefined) out.profile = "dome";
  out.masks = normalizeSurfaceTextureMasks(source.masks);
  out.textOutline = normalizeSurfaceTextOutline(source.textOutline);
  return out;
}

/** A text's outlines kept to what can be used: rings of at least three finite points, within the limit on points. */
export function normalizeSurfaceTextOutline(input: unknown): number[][] {
  if (!Array.isArray(input)) return [];
  const out: number[][] = [];
  let budget = SURFACE_TEXTURE_MAX_TEXT_POINTS * 2;
  for (const ring of input) {
    if (!Array.isArray(ring) || ring.length < 6 || ring.length % 2 !== 0 || ring.length > budget) continue;
    if (!ring.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e5)) continue;
    out.push(ring.slice());
    budget -= ring.length;
  }
  return out;
}

/** Masks kept to what can be used: a known mode, whole planes of finite numbers with a normal, within the limits. */
export function normalizeSurfaceTextureMasks(input: unknown): SurfaceTextureMask[] {
  if (!Array.isArray(input)) return [];
  const out: SurfaceTextureMask[] = [];
  for (const entry of input.slice(0, SURFACE_TEXTURE_MAX_MASKS)) {
    if (!entry || typeof entry !== "object") continue;
    const { mode, planes, box } = entry as { mode?: unknown; planes?: unknown; box?: unknown };
    if (!SURFACE_TEXTURE_MASK_MODES.includes(mode as SurfaceTextureMaskMode) || !Array.isArray(planes)) continue;
    if (planes.length === 0 || planes.length % 4 !== 0 || planes.length > SURFACE_TEXTURE_MAX_MASK_PLANES * 4) continue;
    if (!planes.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    const clean: number[] = [];
    for (let k = 0; k < planes.length; k += 4) {
      const length = Math.hypot(planes[k], planes[k + 1], planes[k + 2]);
      if (length < 1e-9) continue;
      clean.push(planes[k] / length, planes[k + 1] / length, planes[k + 2] / length, planes[k + 3] / length);
    }
    const usableBox = Array.isArray(box) && box.length === 6 && box.every((value) => typeof value === "number" && Number.isFinite(value)) ? (box as number[]) : null;
    if (clean.length) out.push({ mode: mode as SurfaceTextureMaskMode, planes: clean, ...(usableBox ? { box: [...usableBox] } : {}) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Frames                                                              */
/* ------------------------------------------------------------------ */

/** Positions from the editor's inside frame (y up, z to the viewer) into the screen frame (z up, y back). A turn, so winding stays. */
export function insideToScreenPositions(positions: ArrayLike<number>) {
  const out = new Float64Array(positions.length - (positions.length % 3));
  for (let i = 0; i < out.length; i += 3) {
    out[i] = positions[i];
    out[i + 1] = -positions[i + 2];
    out[i + 2] = positions[i + 1];
  }
  return out;
}

/** And back. */
export function screenToInsidePositions(positions: ArrayLike<number>) {
  const out = new Float64Array(positions.length - (positions.length % 3));
  for (let i = 0; i < out.length; i += 3) {
    out[i] = positions[i];
    out[i + 1] = positions[i + 2];
    out[i + 2] = -positions[i + 1] || 0;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Patterns                                                            */
/* ------------------------------------------------------------------ */

const AXIS_INDEX: Record<SurfaceTextureAxis, number> = { x: 0, y: 1, z: 2 };

/** The two axes across `axis`, in order. */
function acrossAxes(axis: SurfaceTextureAxis): [number, number] {
  const ax = AXIS_INDEX[axis];
  return ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
}

/** Falls from the middle (t = 0, value 1) to the edge (t = 1, value 0). */
export function surfaceFalloff(t: number, profile: SurfaceTextureProfile) {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  if (profile === "pointed") return 1 - t;
  if (profile === "flat") return clamp((1 - t) / 0.25, 0, 1);
  if (profile === "dome") return Math.sqrt(1 - t * t);
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

function stripe(u: number, v: number, angleDeg: number, period: number, s: SurfaceTextureSettings) {
  const a = (angleDeg * Math.PI) / 180;
  const x = (u * Math.cos(a) - v * Math.sin(a)) / period;
  return surfaceFalloff(Math.abs(x - Math.floor(x) - 0.5) / (s.width / 2), s.profile);
}

/** Hexagon grid with centre spacing `size` (a corner up): distance to the cell's middle and to its border. */
function hexCell(u: number, v: number, size: number) {
  const c = hexSite(u, v, size);
  const ou = u - c.x, ov = v - c.y;
  const hex = Math.max(Math.abs(ou), Math.abs(ou * 0.5 + ov * (SQRT3 / 2)), Math.abs(-ou * 0.5 + ov * (SQRT3 / 2)));
  return { center: Math.hypot(ou, ov), edge: size / 2 - hex };
}

/** The middle of the hexagon at (u, v): its key and place. */
function hexSite(u: number, v: number, spacing: number) {
  const size = spacing / SQRT3;
  const q = ((SQRT3 / 3) * u - v / 3) / size;
  const r = ((2 / 3) * v) / size;
  const x = q, z = r, y = -q - r;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { key: (rx + 50000) * 100000 + (rz + 50000), x: size * SQRT3 * (rx + rz / 2), y: size * 1.5 * rz };
}

/** Normals of the hexagon's six sides (as hexCell: a corner up). */
const HEX_NORMALS = [1, 0, 0.5, SQRT3 / 2, -0.5, SQRT3 / 2, -1, 0, -0.5, -SQRT3 / 2, 0.5, -SQRT3 / 2];

/** Where the pattern lies on the body: axis, radius, and spacing after rounding (see makeLayout). */
export type SurfaceTextureLayout = {
  /** How the pattern lies on this body ("auto" decided). */
  projection: Exclude<SurfaceTextureProjection, "auto">;
  /** Grooves: distance between two grooves across them. */
  period: number;
  /** Honeycomb and bumps: centre spacing. */
  cell: number;
  /** Around a cylinder: how many grooves or cells go round, else null. */
  around: number | null;
  /** Grooves and knurling: the slant, adjusted when they lie almost level so they meet after one round. */
  angle: number;
  /** The axis' place across it (the two other coordinates). */
  center: [number, number];
  /** Mean radius of the walls with the pattern, and the smallest and largest. */
  radius: number;
  rMin: number;
  rMax: number;
  /** Cracks: their lines on the surface (set by the session, which knows the body). */
  crack?: CrackNetwork | null;
  /** Text: where it is stuck on and the window round it (set by the session). */
  text?: SurfaceTextPlacement | null;
};

/**
 * A text stuck on: the anchor on the surface (the middle of the text's box), the box (mm), the window round it (half
 * width and height with a margin) and how far the unrolling reaches.
 */
export type SurfaceTextPlacement = { point: number[]; face: number; width: number; height: number; halfW: number; halfH: number; reach: number };

/** The box round a text's outlines. */
function outlineBox(rings: number[][]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (let k = 0; k < ring.length; k += 2) {
      minX = Math.min(minX, ring[k]); maxX = Math.max(maxX, ring[k]);
      minY = Math.min(minY, ring[k + 1]); maxY = Math.max(maxY, ring[k + 1]);
    }
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/**
 * The signed distance of a point of a text's plane to its outlines, mm: below 0 inside the letters (even-odd), above
 * 0 outside, held to -`cap` .. `cap` further away. Edges are kept in rows (for the inside test) and in cells (for the
 * distance), so only the few near a point are looked at.
 */
function textDistance(rings: number[][], cap: number) {
  const box = outlineBox(rings);
  if (!box) return () => cap;
  const edges: number[] = [];
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let k = 0; k < n; k += 1) {
      const j = (k + 1) % n;
      if (ring[k * 2] === ring[j * 2] && ring[k * 2 + 1] === ring[j * 2 + 1]) continue;
      edges.push(ring[k * 2], ring[k * 2 + 1], ring[j * 2], ring[j * 2 + 1]);
    }
  }
  const E = edges.length / 4;
  const cell = Math.max(cap, (box.maxY - box.minY) / 48, 0.05);
  const cols = Math.max(1, Math.ceil((box.maxX - box.minX + 2 * cap) / cell) + 1);
  const rows = Math.max(1, Math.ceil((box.maxY - box.minY + 2 * cap) / cell) + 1);
  const x0 = box.minX - cap, y0 = box.minY - cap;
  const byRow: number[][] = Array.from({ length: rows }, () => []);
  const byCell = new Map<number, number[]>();
  for (let e = 0; e < E; e += 1) {
    const ax = edges[e * 4], ay = edges[e * 4 + 1], bx = edges[e * 4 + 2], by = edges[e * 4 + 3];
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - y0) / cell)), r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) - y0) / cell));
    for (let r = r0; r <= r1; r += 1) byRow[r].push(e);
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - cap - x0) / cell)), c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + cap - x0) / cell));
    const s0 = Math.max(0, Math.floor((Math.min(ay, by) - cap - y0) / cell)), s1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + cap - y0) / cell));
    for (let r = s0; r <= s1; r += 1) for (let c = c0; c <= c1; c += 1) {
      const key = r * cols + c;
      const list = byCell.get(key);
      if (list) list.push(e);
      else byCell.set(key, [e]);
    }
  }
  return (x: number, y: number) => {
    if (x < x0 || y < y0 || x > box.maxX + cap || y > box.maxY + cap) return cap;
    const r = Math.min(rows - 1, Math.floor((y - y0) / cell)), c = Math.min(cols - 1, Math.floor((x - x0) / cell));
    let inside = false;
    for (const e of byRow[r]) {
      const ay = edges[e * 4 + 1], by = edges[e * 4 + 3];
      if (ay > y === by > y) continue;
      const ax = edges[e * 4], bx = edges[e * 4 + 2];
      if (x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
    let d = cap;
    for (const e of byCell.get(r * cols + c) ?? []) {
      const ax = edges[e * 4], ay = edges[e * 4 + 1], dx = edges[e * 4 + 2] - ax, dy = edges[e * 4 + 3] - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1) : 0;
      d = Math.min(d, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
    return inside ? -d : d;
  };
}

/**
 * A text's signed distance per point (see textDistance) from its place in the unrolled plane, the letters turned by
 * `turn` degrees; a point the unrolling did not reach lies outside.
 */
function textField(U: Float64Array, V: Float64Array, rings: number[][], turn: number, cap: number) {
  const distance = textDistance(rings, cap);
  const a = (turn * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const out = new Float64Array(U.length).fill(cap);
  for (let i = 0; i < U.length; i += 1) if (Number.isFinite(U[i])) out[i] = distance(U[i] * c + V[i] * sn, -U[i] * sn + V[i] * c);
  return out;
}

/** Half the width of a letter's wall, mm: the mesh is cut this far either side of the outline, the wall between. */
const TEXT_WALL = 0.05;

/** A hash of a text's outlines, for knowing when they changed. */
function outlineKey(rings: number[][]) {
  let h = 2166136261;
  for (const ring of rings) {
    h = Math.imul(h ^ ring.length, 16777619);
    for (const value of ring) h = Math.imul(h ^ Math.round(value * 1000), 16777619);
  }
  return h >>> 0;
}

/** The first face a ray meets, from `from` along the unit direction `dir` (Möller–Trumbore); null when it meets none. */
function firstHit(mesh: { vertices: Float64Array; indices: Uint32Array }, from: number[], dir: number[]) {
  const v = mesh.vertices, I = mesh.indices;
  let best = Infinity, face = -1;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1x = v[b] - v[a], e1y = v[b + 1] - v[a + 1], e1z = v[b + 2] - v[a + 2];
    const e2x = v[c] - v[a], e2y = v[c + 1] - v[a + 1], e2z = v[c + 2] - v[a + 2];
    const px = dir[1] * e2z - dir[2] * e2y, py = dir[2] * e2x - dir[0] * e2z, pz = dir[0] * e2y - dir[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const sx = from[0] - v[a], sy = from[1] - v[a + 1], sz = from[2] - v[a + 2];
    const u = (sx * px + sy * py + sz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (dir[0] * qx + dir[1] * qy + dir[2] * qz) / det;
    if (w < 0 || u + w > 1) continue;
    const distance = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (distance > 0 && distance < best) {
      best = distance;
      face = t / 3;
    }
  }
  return face < 0 ? null : { face, point: [from[0] + dir[0] * best, from[1] + dir[1] * best, from[2] + dir[2] * best] };
}

/** Which way 0 degrees round the axis and 90 degrees look: the front and the right upright, the top lying (x or y). */
const TEXT_FRONT: Record<SurfaceTextureAxis, [number[], number[]]> = {
  z: [[0, -1, 0], [1, 0, 0]],
  y: [[0, 0, 1], [1, 0, 0]],
  x: [[0, 0, 1], [0, -1, 0]],
};

function patternValue(u: number, v: number, s: SurfaceTextureSettings, layout: SurfaceTextureLayout) {
  switch (s.pattern) {
    case "grooves":
      return stripe(u, v, layout.angle, layout.period, s);
    case "knurl":
      return Math.max(stripe(u, v, layout.angle, layout.period, s), stripe(u, v, -layout.angle, layout.period, s));
    case "honeycomb":
      return surfaceFalloff(hexCell(u, v, layout.cell).edge / ((layout.cell / 2) * s.width), s.profile);
    case "bumps":
      return surfaceFalloff(hexCell(u, v, layout.cell).center / ((layout.cell / 2) * s.width), s.profile);
    default:
      return 0;
  }
}

/** Pattern value 0 to 1 at a point with its normal. */
export function surfaceTextureValueAt(x: number, y: number, z: number, nx: number, ny: number, nz: number, s: SurfaceTextureSettings, layout: SurfaceTextureLayout) {
  // Cracks lie on the surface itself, not in a projection.
  if (s.pattern === "cracks") return layout.crack ? crackValue(layout.crack, x, y, z, nx, ny, nz, CRACK_PROFILE[s.profile]) : 0;
  const pos = [x, y, z];
  const projection = s.projection === "auto" ? layout.projection : s.projection;
  if (projection === "cylinder") {
    const ax = AXIS_INDEX[s.axis];
    const [i1, i2] = acrossAxes(s.axis);
    const theta = Math.atan2(pos[i2] - layout.center[1], pos[i1] - layout.center[0]);
    return patternValue(theta * layout.radius, pos[ax], s, layout);
  }
  if (projection === "flat") {
    const [i1, i2] = acrossAxes(s.axis);
    return patternValue(pos[i1], pos[i2], s, layout);
  }
  // All round: three projections, weighted by the normal.
  const wx = nx ** 4, wy = ny ** 4, wz = nz ** 4;
  const sum = wx + wy + wz || 1;
  return (wx * patternValue(y, z, s, layout) + wy * patternValue(x, z, s, layout) + wz * patternValue(x, y, s, layout)) / sum;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Centre of a circle through weighted points (algebraic fit after Kasa), robust: points far off
 * the circle (a handle, a spout) lose their weight over three rounds - measured by the weighted
 * median of the deviation, at least 2 % of the radius, so a bulging or conical body (all points
 * deviate, but evenly) loses nothing. null when the points do not make a circle.
 */
function robustCircleCenter(x: number[], y: number[], w0: number[]): [number, number] | null {
  const m = x.length;
  let w = Float64Array.from(w0);
  let total = 0;
  for (let k = 0; k < m; k += 1) total += w0[k];
  let center: [number, number] | null = null;
  for (let iter = 0; iter < 3; iter += 1) {
    let W = 0, mx = 0, my = 0;
    for (let k = 0; k < m; k += 1) {
      W += w[k];
      mx += w[k] * x[k];
      my += w[k] * y[k];
    }
    if (!(W > 0.05 * total)) break;
    mx /= W;
    my /= W;
    // About the centroid the constant term drops out and a 2×2 system is left.
    let Sxx = 0, Sxy = 0, Syy = 0, Sxz = 0, Syz = 0;
    for (let k = 0; k < m; k += 1) {
      const dx = x[k] - mx, dy = y[k] - my, z = dx * dx + dy * dy;
      Sxx += w[k] * dx * dx;
      Sxy += w[k] * dx * dy;
      Syy += w[k] * dy * dy;
      Sxz += w[k] * dx * z;
      Syz += w[k] * dy * z;
    }
    const det = Sxx * Syy - Sxy * Sxy;
    if (!(det > 1e-9 * (Sxx + Syy) ** 2)) break;
    const D = (-Sxz * Syy + Syz * Sxy) / det;
    const E = (-Syz * Sxx + Sxz * Sxy) / det;
    const cx = mx - D / 2, cy = my - E / 2;
    center = [cx, cy];
    if (iter === 2) break;
    // Deviation from the circle per point; points far off fade out (Tukey).
    const r = new Float64Array(m);
    let R = 0;
    for (let k = 0; k < m; k += 1) {
      r[k] = Math.hypot(x[k] - cx, y[k] - cy);
      R += (w[k] / W) * r[k];
    }
    const order = Array.from({ length: m }, (_, k) => k).sort((a, b) => Math.abs(r[a] - R) - Math.abs(r[b] - R));
    let acc = 0, median = 0;
    for (const k of order) {
      acc += w[k];
      if (acc >= W / 2) {
        median = Math.abs(r[k] - R);
        break;
      }
    }
    const scale = 4.685 * Math.max(1.4826 * median, 0.02 * R);
    const next = new Float64Array(m);
    for (let k = 0; k < m; k += 1) {
      const e = Math.abs(r[k] - R) / scale;
      next[k] = e < 1 ? w0[k] * (1 - e * e) ** 2 : 0;
    }
    w = next;
  }
  return center;
}

/**
 * Where the pattern goes on the body. Around a cylinder: u = arc length round on the radius of the
 * walls with the pattern, v = along the axis; spacing and groove count are rounded so the pattern
 * closes exactly at the seam.
 *
 * Axis: a circle fitted through the centroids of the side faces (weighted by area, outliers like
 * a handle faded out) - the middle of the box lay 11 mm off the axis on a cup with a handle.
 * Radius: area-weighted over the side faces that really get the pattern (outside or inside, not
 * bottom and top) - the mean over all points also counted inner walls, bottoms and densely
 * meshed roundings. `skipVertex`: points that stay smooth anyway and do not count.
 */
export function makeSurfaceTextureLayout(base: SurfaceBase, asked: SurfaceTextureSettings, skipVertex: Uint8Array | null = null): SurfaceTextureLayout {
  const s: SurfaceTextureSettings = asked.projection === "auto" ? { ...asked, projection: isRoundBody(base, asked.axis) ? "cylinder" : "allRound" } : asked;
  const ax = AXIS_INDEX[s.axis];
  const [i1, i2] = acrossAxes(s.axis);
  const v = base.vertices;
  const I = base.indices;
  const n = v.length / 3;
  const kept = new Uint8Array(n);
  let anyKept = false;
  for (let i = 0; i < n; i += 1) {
    if (skipVertex && skipVertex[i]) continue;
    kept[i] = 1;
    anyKept = true;
  }
  if (!anyKept) kept.fill(1);
  let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity;
  for (let i = 0; i < n; i += 1) {
    if (!kept[i]) continue;
    lo1 = Math.min(lo1, v[i * 3 + i1]);
    hi1 = Math.max(hi1, v[i * 3 + i1]);
    lo2 = Math.min(lo2, v[i * 3 + i2]);
    hi2 = Math.max(hi2, v[i * 3 + i2]);
  }
  // The middle of the box when nothing better is found (a single flat plate makes no circle).
  let c1 = (lo1 + hi1) / 2;
  let c2 = (lo2 + hi2) / 2;
  // Side faces: normal mostly across the axis, not bottom or top, all points kept.
  const cosBottom = Math.cos((s.bottomFree * Math.PI) / 180), cosTop = Math.cos((s.topFree * Math.PI) / 180);
  const sx: number[] = [], sy: number[] = [], sw: number[] = [], snx: number[] = [], sny: number[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (!kept[a] || !kept[b] || !kept[c]) continue;
    const [x, y, z] = faceCross(v, a, b, c);
    const l = Math.hypot(x, y, z);
    if (l === 0) continue;
    const fn = [x / l, y / l, z / l];
    if ((s.bottomFree > 0 && -fn[2] >= cosBottom) || (s.topFree > 0 && fn[2] >= cosTop)) continue;
    const h = Math.hypot(fn[i1], fn[i2]);
    if (h < 0.5) continue;
    sx.push((v[a * 3 + i1] + v[b * 3 + i1] + v[c * 3 + i1]) / 3);
    sy.push((v[a * 3 + i2] + v[b * 3 + i2] + v[c * 3 + i2]) / 3);
    sw.push(l / 2);
    snx.push(fn[i1] / h);
    sny.push(fn[i2] / h);
  }
  const fit = sx.length >= 3 ? robustCircleCenter(sx, sy, sw) : null;
  if (fit) [c1, c2] = fit;
  let areaSum = 0, rSum = 0, rMin = Infinity, rMax = 0;
  for (let k = 0; k < sx.length; k += 1) {
    const dx = sx[k] - c1, dy = sy[k] - c2;
    const rl = Math.hypot(dx, dy);
    if (rl < 1e-6) continue;
    const isInside = (snx[k] * dx + sny[k] * dy) / rl < -0.3;
    if (isInside ? !s.inside : !s.outside) continue;
    areaSum += sw[k];
    rSum += sw[k] * rl;
    rMin = Math.min(rMin, rl);
    rMax = Math.max(rMax, rl);
  }
  let radius: number;
  if (areaSum > 0) radius = rSum / areaSum;
  else {
    // No side face gets the pattern: the mean over the points.
    let sum = 0, count = 0;
    for (let i = 0; i < n; i += 1) {
      if (!kept[i]) continue;
      const r = Math.hypot(v[i * 3 + i1] - c1, v[i * 3 + i2] - c2);
      if (r > 1e-6) {
        sum += r;
        count += 1;
      }
    }
    radius = count ? sum / count : 1;
    rMin = rMax = radius;
  }
  const layout: SurfaceTextureLayout = { projection: s.projection as SurfaceTextureLayout["projection"], period: s.spacing, cell: s.spacing, around: null, angle: s.angle, center: [c1, c2], radius, rMin, rMax };
  if (s.projection !== "cylinder") return layout;
  const C = 2 * Math.PI * radius;
  if (s.pattern === "grooves" || s.pattern === "knurl") {
    const cos = Math.abs(Math.cos((s.angle * Math.PI) / 180));
    if (cos > 0.05) {
      const k = Math.max(1, Math.round((C * cos) / s.spacing));
      layout.period = (C * cos) / k;
      layout.around = k;
    } else {
      // Almost level: after one round the groove must meet a groove, or a seam stays. The spacing
      // stays and the slant is adjusted a little (k = 0: level rings).
      const k = Math.round((C * cos) / s.spacing);
      layout.angle = ((s.angle < 0 ? -1 : 1) * (Math.acos(Math.min(1, (k * s.spacing) / C)) * 180)) / Math.PI;
    }
  } else if (CELL_PATTERNS.includes(s.pattern)) {
    const k = Math.max(1, Math.round(C / s.spacing));
    layout.cell = C / k;
    layout.around = k;
  }
  return layout;
}

/**
 * Whether a body is round about `axis`: on its side faces the normal points away from the fitted axis at every corner of
 * the triangle (a cylinder of 16 segments: 11 degrees off; an octagon 22, a hexagon 30, a cube's face 45 at its corners).
 * Round when that holds within 25 degrees on three quarters of the side area. A body without side faces (a plate lying
 * flat) is not round.
 */
export function isRoundBody(base: SurfaceBase, axis: SurfaceTextureAxis) {
  const layout = makeSurfaceTextureLayout(base, { ...SURFACE_TEXTURE_DEFAULTS, projection: "cylinder", axis, outside: true, inside: true });
  const [i1, i2] = acrossAxes(axis);
  const [c1, c2] = layout.center;
  const v = base.vertices, I = base.indices;
  const cosLimit = Math.cos((25 * Math.PI) / 180);
  let side = 0, round = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [x, y, z] = faceCross(v, I[t], I[t + 1], I[t + 2]);
    const l = Math.hypot(x, y, z);
    if (l === 0) continue;
    const n = [x / l, y / l, z / l];
    const h = Math.hypot(n[i1], n[i2]);
    if (h < 0.5) continue;
    side += l;
    let ok = true;
    for (let k = 0; k < 3 && ok; k += 1) {
      const p = I[t + k];
      const dx = v[p * 3 + i1] - c1, dy = v[p * 3 + i2] - c2;
      const r = Math.hypot(dx, dy);
      // A corner on the axis (a cone's tip) says nothing.
      if (r < 1e-6) continue;
      if (Math.abs(n[i1] * dx + n[i2] * dy) / (h * r) < cosLimit) ok = false;
    }
    if (ok) round += l;
  }
  return side > 0 && round >= 0.75 * side;
}

/* ------------------------------------------------------------------ */
/* Refining for the pattern                                            */
/* ------------------------------------------------------------------ */

/**
 * All round: the input faces that look straight along an axis (|normal| within 2 degrees of it, like a box's sides),
 * by axis (0, 1, 2) - there the pattern is that axis' flat projection alone and can be cut like a flat one. 255 for the
 * rest and for faces that stay smooth; null when no face is straight.
 */
function straightFaces(base: SurfaceBase, smoothFace: Uint8Array) {
  const v = base.vertices, I = base.indices;
  const axisOf = new Uint8Array(I.length / 3).fill(255);
  let any = false;
  for (let t = 0; t < I.length; t += 3) {
    if (smoothFace[t / 3]) continue;
    const n = faceCross(v, I[t], I[t + 1], I[t + 2]);
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l === 0) continue;
    for (let k = 0; k < 3; k += 1) {
      if (Math.abs(n[k]) / l >= 0.9994) {
        axisOf[t / 3] = k;
        any = true;
      }
    }
  }
  return any ? axisOf : null;
}

/** Grooves and knurling around a cylinder or flat are cut into strips along the grooves (see sliceStripes). */
function stripesAreCut(s: SurfaceTextureSettings) {
  return (s.pattern === "grooves" || s.pattern === "knurl") && s.projection !== "allRound";
}

/** Edge length at which the pattern is cleanly resolved. */
function targetEdge(s: SurfaceTextureSettings) {
  // Honeycomb and bumps that are cut (see sliceCells) get their detail from the cuts: the grid only
  // has to follow the body's roundness (a 1.2 mm chord on 30 mm radius: 0.006 mm).
  if (cellsAreCut(s)) return s.spacing / 2.5;
  const narrow = s.width < 0.35 ? 0.65 : 1;
  return (s.spacing / DETAIL_STEPS[s.detail]) * narrow;
}

function cellsAreCut(s: SurfaceTextureSettings) {
  return CELL_PATTERNS.includes(s.pattern) && s.projection !== "allRound";
}

/**
 * The groove measure per point: across (as stripe() measures it) and along (turned by 90
 * degrees), with functions for the difference between two points that bring the angle round
 * back within half a turn first - so the difference holds across the seam too.
 */
function stripeFields(mesh: { vertices: Float64Array }, s: SurfaceTextureSettings, layout: SurfaceTextureLayout) {
  const ax = AXIS_INDEX[s.axis];
  const [i1, i2] = acrossAxes(s.axis);
  const cyl = s.projection === "cylinder";
  const iv = cyl ? ax : i2;
  const a = (layout.angle * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const R = layout.radius;
  const [c1, c2] = layout.center;
  const v = mesh.vertices;
  const n0 = v.length / 3;
  const U = new Float64Array(n0), V = new Float64Array(n0), cross = new Float64Array(n0), along = new Float64Array(n0);
  // Points on the axis have no angle: triangles at them are not cut.
  const pole = new Uint8Array(n0);
  for (let i = 0; i < n0; i += 1) {
    if (cyl && Math.hypot(v[i * 3 + i2] - c2, v[i * 3 + i1] - c1) < 1e-6) pole[i] = 1;
    U[i] = cyl ? Math.atan2(v[i * 3 + i2] - c2, v[i * 3 + i1] - c1) : v[i * 3 + i1];
    V[i] = v[i * 3 + iv];
    const u = cyl ? U[i] * R : U[i];
    cross[i] = u * ca - V[i] * sa;
    along[i] = u * sa + V[i] * ca;
  }
  const du = (i: number, j: number) => {
    if (!cyl) return U[j] - U[i];
    let d = U[j] - U[i];
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    return d * R;
  };
  return {
    cross,
    along,
    pole,
    crossDiff: (i: number, j: number) => du(i, j) * ca - (V[j] - V[i]) * sa,
    alongDiff: (i: number, j: number) => du(i, j) * sa + (V[j] - V[i]) * ca,
  };
}

/**
 * Places on the profile, as t (0 in the middle of a groove or joint, 1 at its edge), where the
 * mesh needs a line of points for the profile to come out exactly: the V of "pointed" is straight
 * from its middle to its edge and "flat" only bends where its floor ends, so one or two lines
 * are exact; "round" gets `steps` lines per flank.
 */
function profileLevels(profile: SurfaceTextureProfile, steps: number) {
  if (profile === "pointed") return [1];
  if (profile === "flat") return [0.75, 1];
  const count = Math.max(1, Math.round(steps));
  // A half circle is steep at its edge: the levels lie closer there (equal steps of the angle).
  if (profile === "dome") return Array.from({ length: count }, (_, j) => Math.sin(((j + 1) / count) * (Math.PI / 2)));
  return Array.from({ length: count }, (_, j) => (j + 1) / count);
}

/**
 * Grooves: every triangle cut along the groove into thin strips whose borders lie on fixed places
 * of the groove profile (its middle, its edges and the places between, see profileLevels) - fine
 * across, along as coarse as the mesh. Triangles of faces that surely stay smooth (`smoothFace`)
 * stay whole.
 */
function sliceStripes(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, steps: number, smoothFace: Uint8Array) {
  const P = layout.period;
  const F = stripeFields(mesh, s, layout);
  // Profile places per period: groove middle at P/2 (stripe: |x - floor(x) - 0.5|), edges at P/2 ± w P/2.
  const w = clamp(s.width, 0.05, 1);
  const offsets: number[] = [];
  [0, ...profileLevels(s.profile, steps)].forEach((t) => {
    [P * (0.5 - (t * w) / 2), P * (0.5 + (t * w) / 2)].forEach((o) => {
      if (o >= 0 && o < P - 1e-9 * P && !offsets.some((known) => Math.abs(known - o) < 1e-9 * P)) offsets.push(o);
    });
  });
  offsets.sort((a, b) => a - b);
  const I = mesh.indices;
  const sliced = new Uint8Array(I.length / 3);
  for (let f = 0; f < sliced.length; f += 1) sliced[f] = smoothFace[mesh.parents[f]] || F.pole[I[f * 3]] || F.pole[I[f * 3 + 1]] || F.pole[I[f * 3 + 2]] ? 0 : 1;
  return sliceByField(mesh, F.cross, F.crossDiff, P, offsets, sliced, F.alongDiff);
}

/**
 * Knurling is the higher of two groove families, so after both are cut into strips the surface
 * still folds where the two are equally deep - along lines through every diamond. Cut there too:
 * then the pattern is linear in every triangle and a pointed profile comes out exact. The field
 * is the difference of the two values in mm across (value × half the groove width).
 */
function sliceKnurlCrease(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, smoothFace: Uint8Array) {
  const A = stripeFields(mesh, s, layout);
  const B = stripeFields(mesh, s, { ...layout, angle: -layout.angle });
  const n = mesh.vertices.length / 3;
  const halfWidth = (layout.period * s.width) / 2;
  const value = (cross: number) => {
    const x = cross / layout.period;
    return surfaceFalloff(Math.abs(x - Math.floor(x) - 0.5) / (s.width / 2), s.profile);
  };
  const h = new Float64Array(n);
  for (let i = 0; i < n; i += 1) h[i] = (value(A.cross[i]) - value(B.cross[i])) * halfWidth;
  const I = mesh.indices;
  const sliced = new Uint8Array(I.length / 3);
  for (let f = 0; f < sliced.length; f += 1) sliced[f] = smoothFace[mesh.parents[f]] || A.pole[I[f * 3]] || A.pole[I[f * 3 + 1]] || A.pole[I[f * 3 + 2]] ? 0 : 1;
  return sliceByField(mesh, h, (i, j) => h[j] - h[i], 1e6, [0], sliced);
}

/** Cuts closer than this (mm) to a point fall onto it. */
const SNAP = 0.05;
/** The same for a bump's rim, which has to stay round (short edges there are pulled together afterwards). */
const RIM_SNAP = 0.004;

/** Bumps: points on a rim per radius, and rings inwards (fewer for a cone and a flat top, see sliceBumps). */
const BUMP_RIM_STEPS: Record<SurfaceTextureDetail, number> = { coarse: 1.6, medium: 2, fine: 3 };
/** Points on a bump's outer ring at most (the rim keeps all of its own). */
const BUMP_RING_POINTS: Record<SurfaceTextureDetail, number> = { coarse: 20, medium: 32, fine: 48 };
const BUMP_RINGS: Record<SurfaceTextureDetail, number> = { coarse: 3, medium: 5, fine: 8 };

/**
 * Honeycomb and bumps: cut instead of refining evenly - otherwise the triangles lie at any slant to
 * the joint and their edges look jagged (flat shaded in a slicer even more). Bumps: after the cell
 * borders (step 1 below), straight spokes through every bump's middle - there they meet, so the tip
 * of a cone or a ball is a point of the mesh - and rings at the profile levels, each point exactly on
 * its circle. Then every bump is a fan of facets round its middle, as round as its spokes. In a cell the distance
 * to the joint is the smallest of six distances that are linear in the unrolled surface (one per
 * side). So, in three steps:
 * 1. Cut at the cell borders (between two cell middles, the middle of the joint). Then every
 *    triangle lies in one cell.
 * 2. Cut at the corner lines, where in the corners of the joint the nearest side changes (in the
 *    joint only). Then the distance is linear in every triangle.
 * 3. Cut at the profile levels (see profileLevels; a round profile gets `steps` of them, fewer
 *    down to 2 when the triangles would not fit `maxTriangles` - counted before cutting, since
 *    the cut is the dear part). Every flank gets rows of points exactly on its contour lines.
 * `skipBase`: input triangles that surely stay smooth. Parents point at the input mesh.
 */
function sliceCells(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, steps: number, maxTriangles: number, skipBase: Uint8Array): { mesh: SurfaceMesh; reduced: boolean; fixed?: Float32Array | null } {
  const ax = AXIS_INDEX[s.axis];
  const [i1, i2] = acrossAxes(s.axis);
  const cyl = s.projection === "cylinder";
  const R = layout.radius, [c1, c2] = layout.center;
  const period = cyl ? 2 * Math.PI * R : 0;
  const cell = layout.cell;
  const hw = (cell / 2) * clamp(s.width, 0.02, 1);
  // Per point eight numbers: distance to the joint, cell key, nearest side (0 to 5), cell middle u and v, and the point's
  // own u, v and whether it lies on the axis (1).
  const REC = 8;
  const describe = (u: number, v: number, rec: Float64Array, o: number) => {
    const c = hexSite(u, v, cell);
    let lo = Infinity, kb = 0;
    for (let k = 0; k < 6; k += 1) {
      const d = cell / 2 - HEX_NORMALS[k * 2] * (u - c.x) - HEX_NORMALS[k * 2 + 1] * (v - c.y);
      if (d < lo) {
        lo = d;
        kb = k;
      }
    }
    rec[o] = lo;
    rec[o + 1] = c.key;
    rec[o + 2] = kb;
    rec[o + 3] = c.x;
    rec[o + 4] = c.y;
  };
  // Distance to the joint at (x, y) over side k of the cell with middle (sx, sy).
  const g = (sx: number, sy: number, k: number, x: number, y: number) => cell / 2 - HEX_NORMALS[k * 2] * (x - sx) - HEX_NORMALS[k * 2 + 1] * (y - sy);
  const uvOf = (verts: ArrayLike<number>, i: number): [number, number, boolean] => {
    const pos = [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
    if (!cyl) return [pos[i1], pos[i2], false];
    const r = Math.hypot(pos[i1] - c1, pos[i2] - c2);
    return [Math.atan2(pos[i2] - c2, pos[i1] - c1) * R, pos[ax], r < 1e-6];
  };
  const unwrap = (u: number, ref: number) => (period ? u + Math.round((ref - u) / period) * period : u);
  // Not cut: faces that surely stay smooth, triangles at the axis and - around a cylinder - top and bottom.
  const skipOf = (verts: Float64Array, rec: Float64Array, I: Uint32Array, parents: Uint32Array) => {
    const T = I.length / 3;
    const skip = new Uint8Array(T);
    for (let f = 0; f < T; f += 1) {
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      if (skipBase[parents[f]]) {
        skip[f] = 1;
        continue;
      }
      if (cyl && (rec[a * REC + 7] || rec[b * REC + 7] || rec[c * REC + 7])) {
        skip[f] = 1;
        continue;
      }
      const fn = faceCross(verts, a, b, c);
      const l = Math.hypot(fn[0], fn[1], fn[2]);
      if (l === 0 || (cyl && Math.abs(fn[ax]) / l > 0.8)) skip[f] = 1;
    }
    return skip;
  };
  const recordsOf = (v: Float64Array) => {
    const n = v.length / 3;
    const rec = new Float64Array(n * REC);
    for (let i = 0; i < n; i += 1) {
      const [u, w, pole] = uvOf(v, i);
      describe(u, w, rec, i * REC);
      rec[i * REC + 5] = u;
      rec[i * REC + 6] = w;
      rec[i * REC + 7] = pole ? 1 : 0;
    }
    return rec;
  };
  type CutAt = (rec: Float64Array, a: number, b: number, ua: number, va: number, ub: number, vb: number, shift: number) => number;
  type Meet = (rec: Float64Array, A: number, B: number, C: number) => [number, number, number] | null;
  // Cut edges where `cutT` gives a share t (0 to 1, else -1) - once per edge, the same for both triangles - then lay every
  // triangle anew (one, two or three cuts). `shift`: how far b lies off its own record in the unrolled surface (across the
  // seam). With three cuts the middle point goes where `meet` puts it (shares of the corners), else into the middle of the cuts.
  const split = (cur: SurfaceMesh, cutT: CutAt, meet: Meet | null = null, snap = SNAP): SurfaceMesh => {
    const v = cur.vertices, I = cur.indices, T = I.length / 3;
    const rec = recordsOf(v);
    const skip = skipOf(v, rec, I, cur.parents);
    const verts = Array.from(v);
    const cuts = new EdgeTable(T * 2);
    const cutOn = (p: number, q: number) => {
      const a = Math.min(p, q), b = Math.max(p, q);
      if (cuts.has(a, b)) return;
      const ua = rec[a * REC + 5], va = rec[a * REC + 6];
      const ub0 = rec[b * REC + 5], vb = rec[b * REC + 6];
      const ub = unwrap(ub0, ua);
      const t = cutT(rec, a, b, ua, va, ub, vb, ub - ub0);
      let id = -1;
      // Closer than `snap` (mm) to an end: the end counts as on the line - no slivers, no short edges.
      const len = Math.hypot(v[a * 3] - v[b * 3], v[a * 3 + 1] - v[b * 3 + 1], v[a * 3 + 2] - v[b * 3 + 2]);
      if (t >= 0 && t * len > snap && (1 - t) * len > snap) {
        id = verts.length / 3;
        verts.push(v[a * 3] + t * (v[b * 3] - v[a * 3]), v[a * 3 + 1] + t * (v[b * 3 + 1] - v[a * 3 + 1]), v[a * 3 + 2] + t * (v[b * 3 + 2] - v[a * 3 + 2]));
      }
      cuts.set(a, b, id);
    };
    for (let f = 0; f < T; f += 1) {
      if (skip[f]) continue;
      for (let k = 0; k < 3; k += 1) cutOn(I[f * 3 + k], I[f * 3 + ((k + 1) % 3)]);
    }
    const known = (p: number, q: number) => cuts.get(p, q);
    const out: number[] = [], outParents: number[] = [];
    const put = (a: number, b: number, c: number, parent: number) => {
      out.push(a, b, c);
      outParents.push(parent);
    };
    const d2 = (a: number, b: number) => (verts[a * 3] - verts[b * 3]) ** 2 + (verts[a * 3 + 1] - verts[b * 3 + 1]) ** 2 + (verts[a * 3 + 2] - verts[b * 3 + 2]) ** 2;
    for (let f = 0; f < T; f += 1) {
      const A = I[f * 3], B = I[f * 3 + 1], C = I[f * 3 + 2], parent = cur.parents[f];
      const X = known(A, B), Y = known(B, C), Z = known(C, A);
      const n = (X >= 0 ? 1 : 0) + (Y >= 0 ? 1 : 0) + (Z >= 0 ? 1 : 0);
      if (n === 0) put(A, B, C, parent);
      else if (n === 1) {
        // A fan from the corner opposite the cut edge.
        if (X >= 0) {
          put(C, A, X, parent);
          put(C, X, B, parent);
        } else if (Y >= 0) {
          put(A, B, Y, parent);
          put(A, Y, C, parent);
        } else {
          put(B, C, Z, parent);
          put(B, Z, A, parent);
        }
      } else if (n === 2) {
        // The corner between the two cuts lies alone on its side; the quad opposite over its shorter diagonal.
        const [r0, r1, r2, r3, r4] = Y < 0 ? [A, X, B, C, Z] : Z < 0 ? [B, Y, C, A, X] : [C, Z, A, B, Y];
        put(r0, r1, r4, parent);
        if (d2(r1, r3) <= d2(r2, r4)) {
          put(r1, r2, r3, parent);
          put(r1, r3, r4, parent);
        } else {
          put(r1, r2, r4, parent);
          put(r2, r3, r4, parent);
        }
      } else {
        // Three sides cut in one triangle: a point in the middle of the three cuts, fanned all round.
        const G = verts.length / 3;
        const w = meet ? meet(rec, A, B, C) : null;
        if (w) for (let k = 0; k < 3; k += 1) verts.push(w[0] * v[A * 3 + k] + w[1] * v[B * 3 + k] + w[2] * v[C * 3 + k]);
        else verts.push((verts[X * 3] + verts[Y * 3] + verts[Z * 3]) / 3, (verts[X * 3 + 1] + verts[Y * 3 + 1] + verts[Z * 3 + 1]) / 3, (verts[X * 3 + 2] + verts[Y * 3 + 2] + verts[Z * 3 + 2]) / 3);
        const ring = [A, X, B, Y, C, Z];
        for (let k = 0; k < 6; k += 1) put(G, ring[k], ring[(k + 1) % 6], parent);
      }
    }
    return { vertices: Float64Array.from(verts), indices: Uint32Array.from(out), parents: Uint32Array.from(outParents), limited: Boolean(mesh.limited) };
  };
  // 1. Cell borders: the cut lies on the line halfway between the two cell middles. Twice: an edge across two borders
  // (near a corner of three cells) was cut at the wrong one in the first round; its pieces then lie right.
  const border: CutAt = (rec, a, b, ua, va, ub, vb, shift) => {
    const oa = a * REC, ob = b * REC;
    if (rec[oa + 1] === rec[ob + 1]) return -1;
    // An edge only reaches over a border when both ends together are not further from it than it is long.
    if (rec[oa] + rec[ob] > Math.hypot(ub - ua, vb - va) * 1.001 + 1e-9) return -1;
    const Ax = rec[oa + 3], Ay = rec[oa + 4], Bx = rec[ob + 3] + shift, By = rec[ob + 4];
    const fa = (ua - Bx) ** 2 + (va - By) ** 2 - (ua - Ax) ** 2 - (va - Ay) ** 2;
    const fb = (ub - Bx) ** 2 + (vb - By) ** 2 - (ub - Ax) ** 2 - (vb - Ay) ** 2;
    const t = fa / (fa - fb);
    return t > 0.02 && t < 0.98 ? t : -1;
  };
  // Three cells in one triangle: the middle point on their common corner (circumcentre of the cell middles), when it lies inside.
  const triple: Meet = (rec, A, B, C) => {
    const oa = A * REC, ob = B * REC, oc = C * REC;
    if (rec[oa + 1] === rec[ob + 1] || rec[ob + 1] === rec[oc + 1] || rec[oa + 1] === rec[oc + 1]) return null;
    const ua = rec[oa + 5], va = rec[oa + 6], ub0 = rec[ob + 5], vb = rec[ob + 6], uc0 = rec[oc + 5], vc = rec[oc + 6];
    const ub = unwrap(ub0, ua), uc = unwrap(uc0, ua);
    const px = rec[oa + 3], py = rec[oa + 4], qx = rec[ob + 3] + ub - ub0, qy = rec[ob + 4], rx = rec[oc + 3] + uc - uc0, ry = rec[oc + 4];
    const D = 2 * (px * (qy - ry) + qx * (ry - py) + rx * (py - qy));
    if (Math.abs(D) < 1e-12) return null;
    const P2 = px * px + py * py, Q2 = qx * qx + qy * qy, R2 = rx * rx + ry * ry;
    const ox = (P2 * (qy - ry) + Q2 * (ry - py) + R2 * (py - qy)) / D;
    const oy = (P2 * (rx - qx) + Q2 * (px - rx) + R2 * (qx - px)) / D;
    const det = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
    if (Math.abs(det) < 1e-12) return null;
    const wa = ((vb - vc) * (ox - uc) + (uc - ub) * (oy - vc)) / det;
    const wb = ((vc - va) * (ox - uc) + (ua - uc) * (oy - vc)) / det;
    const wc = 1 - wa - wb;
    return wa > 0.01 && wb > 0.01 && wc > 0.01 ? [wa, wb, wc] : null;
  };
  // Bumps after the borders. Every bump is cut out along its rim - each point exactly on the circle - and its inside laid
  // anew: rings round a point in its middle at the levels of the profile, joined in even strips. The triangles that were
  // inside only tell where on the body a new point lies. So the tip of a cone or a ball is a point of the mesh, and no
  // sliver of the grid runs over the steep rim of a half ball. The new points carry their value (the rim 0, the middle 1).
  function sliceBumps(start: SurfaceMesh): { mesh: SurfaceMesh; reduced: boolean; fixed: Float32Array | null } {
    const own = new Float64Array(REC);
    const middleOf = (rec: Float64Array, a: number, b: number, ua: number, va: number, ub: number, vb: number): [number, number] => {
      if (rec[a * REC + 1] === rec[b * REC + 1]) return [rec[a * REC + 3], rec[a * REC + 4]];
      describe((ua + ub) / 2, (va + vb) / 2, own, 0);
      return [own[3], own[4]];
    };
    // The rim: where an edge crosses the circle, exactly (not where the distance would cross it in a straight line). An
    // edge running through the circle with both ends outside is cut in the middle of its chord first, in a pass of its
    // own; its halves then cross once each. (Both in one pass, a triangle could be cut on all three sides, and its middle
    // point would land off the circle.)
    const rim = (chords: boolean): CutAt => (rec, a, b, ua, va, ub, vb) => {
      const [cx, cy] = middleOf(rec, a, b, ua, va, ub, vb);
      const px = ua - cx, py = va - cy, dx = ub - ua, dy = vb - va;
      const fa = px * px + py * py - hw * hw, fb = (px + dx) ** 2 + (py + dy) ** 2 - hw * hw;
      const A = dx * dx + dy * dy, B = 2 * (px * dx + py * dy);
      const disc = B * B - 4 * A * fa;
      if (!(A > 0) || disc <= 0) return -1;
      const root = Math.sqrt(disc);
      const t1 = (-B - root) / (2 * A), t2 = (-B + root) / (2 * A);
      let t: number;
      if (!chords && (fa > 0) !== (fb > 0)) t = t1 >= 0 && t1 <= 1 ? t1 : t2;
      else if (chords && fa > 0 && fb > 0 && t1 > 0 && t2 < 1) t = (t1 + t2) / 2;
      else return -1;
      return t > 0 && t < 1 ? t : -1;
    };
    // How many bumps (the cells the texturable triangles reach) and what they may cost: a rim of B points and rings
    // of fewer points inwards make about 2 B (1 + sum of the levels) triangles.
    const rec0 = recordsOf(start.vertices);
    const skip0 = skipOf(start.vertices, rec0, start.indices, start.parents);
    const cells = new Set<number>();
    for (let f = 0; f < skip0.length; f += 1) if (!skip0[f]) cells.add(rec0[start.indices[f * 3] * REC + 1]);
    const room = Math.max(0, maxTriangles - 2 * start.indices.length / 3);
    const wanted = s.profile === "pointed" ? 1 : s.profile === "flat" ? 2 : steps;
    let rings = wanted;
    let rimEdge = hw / BUMP_RIM_STEPS[s.detail];
    const cost = () => {
      const levels = profileLevels(s.profile, rings);
      return cells.size * 2 * ((2 * Math.PI * hw) / rimEdge) * (1 + levels.reduce((sum, t) => sum + t, 0) - 1) * 1.3;
    };
    while (cost() > room && rings > Math.min(2, wanted)) rings -= 1;
    while (cost() > room && rimEdge < hw) rimEdge *= 1.4;
    // 1. Finer near the rims, so a rim gets its points: edges whose middle lies near one, at most rimEdge long - only on
    // faces a bump can be laid anew on (not smooth, not turned away from the projection). New points come from such
    // edges, so they count as such too.
    const n0 = start.vertices.length / 3;
    const open = new Uint8Array(n0);
    for (let f = 0; f < skip0.length; f += 1) {
      if (skip0[f]) continue;
      const a = start.indices[f * 3], b = start.indices[f * 3 + 1], c = start.indices[f * 3 + 2];
      const n = faceCross(start.vertices, a, b, c);
      const ox = (start.vertices[a * 3 + i1] + start.vertices[b * 3 + i1] + start.vertices[c * 3 + i1]) / 3 - c1;
      const oy = (start.vertices[a * 3 + i2] + start.vertices[b * 3 + i2] + start.vertices[c * 3 + i2]) / 3 - c2;
      const facing = cyl ? (n[i1] * ox + n[i2] * oy) / (Math.hypot(ox, oy) || 1) : n[ax];
      if (Math.abs(facing) < 0.5 * Math.hypot(n[0], n[1], n[2])) continue;
      open[a] = 1;
      open[b] = 1;
      open[c] = 1;
    }
    const nearRim = (verts: ArrayLike<number>, p: number, q: number) => {
      const a = Math.min(p, q), b = Math.max(p, q);
      if ((a < n0 && !open[a]) || (b < n0 && !open[b])) return false;
      const [ua, va] = uvOf(verts, a);
      const [ub0, vb] = uvOf(verts, b);
      const ub = unwrap(ub0, ua);
      const mu = (ua + ub) / 2, mv = (va + vb) / 2;
      describe(mu, mv, own, 0);
      return Math.abs(Math.hypot(mu - own[3], mv - own[4]) - hw) < 0.25 * hw;
    };
    const fine = subdivide(start, rimEdge, maxTriangles, null, null, nearRim);
    let cur: SurfaceMesh = { vertices: fine.vertices, indices: fine.indices, parents: Uint32Array.from(fine.parents, (f) => start.parents[f]), limited: Boolean(fine.limited) };
    // 2. The rims (chords first, see rim). Cut finely: a rim point snapped onto a grid line flattened the rim
    // there, and the next ring inwards stuck out of it.
    cur = split(cur, rim(true), null, RIM_SNAP);
    cur = split(cur, rim(false), null, RIM_SNAP);
    // 3. Every bump's inside anew.
    const v = cur.vertices, I = cur.indices, T = I.length / 3;
    const rec = recordsOf(v);
    const skip = skipOf(v, rec, I, cur.parents);
    // A rim point may lie this far off its circle (a point of the grid next to it, as good as on it); the ring inwards
    // keeps more room than that.
    const near = SURFACE_MIN_EDGE;
    type Bump = { cx: number; cy: number; faces: number[]; bad: boolean; at: number[] };
    // Triangles squeezed to a line face no way: they go to the bump on their side of the body afterwards.
    const flat: [number, number][] = [];
    const bumps = new Map<number, Bump>();
    const uvAt = (i: number, ref: number): [number, number] => [unwrap(rec[i * REC + 5], ref), rec[i * REC + 6]];
    for (let f = 0; f < T; f += 1) {
      const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
      const ref = rec[a * REC + 5];
      const [ua, va] = uvAt(a, ref), [ub, vb] = uvAt(b, ref), [uc, vc] = uvAt(c, ref);
      describe((ua + ub + uc) / 3, (va + vb + vc) / 3, own, 0);
      let cx = own[3];
      const cy = own[4];
      if (Math.hypot((ua + ub + uc) / 3 - cx, (va + vb + vc) / 3 - cy) >= hw) continue;
      // Around a cylinder a bump on the seam is one bump from both sides: named by its middle brought round to the front.
      if (period) {
        const front = cx - period * Math.round(cx / period);
        if (front !== cx) {
          describe(front, cy, own, 0);
          cx = own[3];
        }
      }
      // Two walls on the same place of the unrolled surface (a box's opposite sides, a cup's inner and outer wall) are
      // told apart by the way they face.
      const n = faceCross(v, a, b, c);
      const size = Math.hypot(n[0], n[1], n[2]);
      const ox = (v[a * 3 + i1] + v[b * 3 + i1] + v[c * 3 + i1]) / 3 - c1, oy = (v[a * 3 + i2] + v[b * 3 + i2] + v[c * 3 + i2]) / 3 - c2;
      const facing = cyl ? (n[i1] * ox + n[i2] * oy) / (Math.hypot(ox, oy) || 1) : n[ax];
      const longest = Math.max(...[[a, b], [b, c], [c, a]].map(([p, q]) => (v[p * 3] - v[q * 3]) ** 2 + (v[p * 3 + 1] - v[q * 3 + 1]) ** 2 + (v[p * 3 + 2] - v[q * 3 + 2]) ** 2));
      if (size < 1e-6 * longest) {
        flat.push([f, own[1]]);
        continue;
      }
      const key = own[1] * 2 + (facing > 0 ? 1 : 0);
      // A face turned away from the projection (the side of a cylinder seen flat from above) unrolls into a sliver: the
      // bump there keeps its cut grid.
      const steep = Math.abs(facing) < 0.5 * size;
      let bump = bumps.get(key);
      const at = [0, 1, 2].map((k) => (v[a * 3 + k] + v[b * 3 + k] + v[c * 3 + k]) / 3);
      if (!bump) bumps.set(key, (bump = { cx, cy, faces: [], bad: false, at }));
      // A bump reaching a face that stays smooth (or the axis) keeps its cut grid. A triangle between two rim points and one point just outside lies outside: only the rim's bulge puts its middle
      // in. One reaching from well inside to outside was not cut - the bump keeps its grid.
      const off = [[ua, va], [ub, vb], [uc, vc]].map(([u, w]) => Math.hypot(u - cx, w - cy) - hw);
      if (skip[f] || steep || (Math.max(...off) > near && Math.min(...off) < -near)) bump.bad = true;
      else if (Math.max(...off) <= near) bump.faces.push(f);
    }
    for (const [f, cell] of flat) {
      // The bump of that cell on this side: the nearer of the two walls (a box's opposite sides share their cells).
      const centre = [0, 1, 2].map((k) => (v[I[f * 3] * 3 + k] + v[I[f * 3 + 1] * 3 + k] + v[I[f * 3 + 2] * 3 + k]) / 3);
      const options = [bumps.get(cell * 2), bumps.get(cell * 2 + 1)].filter((b): b is Bump => Boolean(b));
      if (!options.length) continue;
      const dist = (b: Bump) => Math.hypot(b.at[0] - centre[0], b.at[1] - centre[1], b.at[2] - centre[2]);
      const bump = options.reduce((x, y) => (dist(y) < dist(x) ? y : x));
      const [ua, va] = uvAt(I[f * 3], bump.cx), [ub, vb] = uvAt(I[f * 3 + 1], bump.cx), [uc, vc] = uvAt(I[f * 3 + 2], bump.cx);
      const off = [[ua, va], [ub, vb], [uc, vc]].map(([u, w]) => Math.hypot(u - bump.cx, w - bump.cy) - hw);
      if (skip[f] || (Math.max(...off) > near && Math.min(...off) < -near)) bump.bad = true;
      else if (Math.max(...off) <= near) bump.faces.push(f);
    }
    const verts = Array.from(v);
    const fixed: number[] = new Array(v.length / 3).fill(NaN);
    const drop = new Uint8Array(T);
    const out: number[] = [], outParents: number[] = [];
    const levels = profileLevels(s.profile, rings).filter((t) => t < 1 - 1e-9);
    for (const bump of bumps.values()) {
      if (bump.bad || bump.faces.length < 3) continue;
      const { cx, cy, faces } = bump;
      // The rim as one closed loop of edges that only one of the bump's triangles has.
      const edges = new Map<string, [number, number]>();
      for (const f of faces) for (let k = 0; k < 3; k += 1) edges.set(`${I[f * 3 + k]},${I[f * 3 + ((k + 1) % 3)]}`, [I[f * 3 + k], I[f * 3 + ((k + 1) % 3)]]);
      const next = new Map<number, number>();
      let ok = true;
      for (const [a, b] of edges.values()) {
        if (edges.has(`${b},${a}`)) continue;
        // Two rim edges from one point: the bump touches itself there (half on a face kept smooth) - it keeps its grid.
        if (next.has(a)) ok = false;
        next.set(a, b);
      }
      if (!ok || next.size < 6) continue;
      const loop: number[] = [];
      const first = next.keys().next().value as number;
      for (let p = first; loop.length <= next.size; ) {
        loop.push(p);
        const q = next.get(p);
        if (q === undefined) break;
        p = q;
        if (p === first) break;
      }
      if (loop.length !== next.size || next.get(loop[loop.length - 1]) !== first) continue;
      const rimUv = loop.map((p) => uvAt(p, cx));
      // A rim that leaves its circle runs over the body's edge (half a bump at the top or the bottom): it keeps its grid.
      if (rimUv.some(([u, w]) => Math.abs(Math.hypot(u - cx, w - cy) - hw) > near)) continue;
      // Which way round the loop runs in the unrolled surface; angles are counted that way.
      let area = 0;
      for (let k = 0; k < loop.length; k += 1) {
        const [u0, w0] = rimUv[k], [u1, w1] = rimUv[(k + 1) % loop.length];
        area += u0 * w1 - u1 * w0;
      }
      const dir = area > 0 ? 1 : -1;
      const rimAngle: number[] = [];
      for (let k = 0; k < loop.length; k += 1) {
        let a = dir * Math.atan2(rimUv[k][1] - cy, rimUv[k][0] - cx);
        // A point a hair behind the one before (snapped onto the rim) counts as level with it.
        if (k > 0) {
          while (a < rimAngle[k - 1] - 0.2) a += 2 * Math.PI;
          a = Math.max(a, rimAngle[k - 1]);
        }
        rimAngle.push(a);
      }
      // Not around the middle once (a rim folded back): leave it as cut.
      if (rimAngle[rimAngle.length - 1] - rimAngle[0] >= 2 * Math.PI) continue;
      // Where on the body a point of the unrolled surface lies: in one of the old triangles (the one it lies in, or the
      // nearest when it lies on a border). Its place there and the old triangle's own triangle of the body.
      const corners = faces.map((f) => [I[f * 3], I[f * 3 + 1], I[f * 3 + 2]].map((p) => uvAt(p, cx)));
      const find = (u: number, w: number): [number, number[]] => {
        let best = 0, bestScore = -Infinity, bw: number[] = [1, 0, 0];
        for (let k = 0; k < faces.length; k += 1) {
          const [[u0, w0], [u1, w1], [u2, w2]] = corners[k];
          const det = (w1 - w2) * (u0 - u2) + (u2 - u1) * (w0 - w2);
          // A triangle squeezed to a line (where cuts met) holds no place: a point "in" it would land on the line.
          const longest = Math.max((u1 - u0) ** 2 + (w1 - w0) ** 2, (u2 - u1) ** 2 + (w2 - w1) ** 2, (u0 - u2) ** 2 + (w0 - w2) ** 2);
          if (Math.abs(det) < 1e-6 * longest) continue;
          const l0 = ((w1 - w2) * (u - u2) + (u2 - u1) * (w - w2)) / det;
          const l1 = ((w2 - w0) * (u - u2) + (u0 - u2) * (w - w2)) / det;
          const l2 = 1 - l0 - l1;
          const score = Math.min(l0, l1, l2);
          if (score > bestScore) {
            bestScore = score;
            best = k;
            bw = [l0, l1, l2].map((x) => Math.max(0, x));
          }
          if (score >= 0) break;
        }
        return [best, bw];
      };
      // The unrolled place of every point of the new bump, for the triangles' own old triangle below.
      const uvOfPoint = new Map<number, [number, number]>();
      loop.forEach((p, k) => uvOfPoint.set(p, rimUv[k]));
      const place = (u: number, w: number): number => {
        const [k, bw] = find(u, w);
        const total = bw[0] + bw[1] + bw[2] || 1;
        const f = faces[k];
        const id = verts.length / 3;
        for (let axis = 0; axis < 3; axis += 1) {
          let x = 0;
          for (let j = 0; j < 3; j += 1) x += (bw[j] / total) * v[I[f * 3 + j] * 3 + axis];
          verts.push(x);
        }
        uvOfPoint.set(id, [u, w]);
        return id;
      };
      // Rings inwards: as many points as keep their spacing, at least six; the first point at the angle of the rim's first.
      const ringsIn = levels.slice().reverse().map((t) => {
        const count = Math.max(6, Math.round(Math.min(loop.length, BUMP_RING_POINTS[s.detail]) * t));
        const ids: number[] = [], angles: number[] = [];
        for (let k = 0; k < count; k += 1) {
          const a = rimAngle[0] + (2 * Math.PI * k) / count;
          const real = dir * a;
          ids.push(place(cx + t * hw * Math.cos(real), cy + t * hw * Math.sin(real)));
          angles.push(a);
          fixed.push(surfaceFalloff(t, s.profile));
        }
        return { ids, angles };
      });
      const middle = place(cx, cy);
      fixed.push(1);
      // A new triangle belongs to the triangle of the body its middle lies on: the direction each point moves along is
      // interpolated over it (on a cylinder of 64 sides the neighbour's is 6 degrees off).
      const tri = (a: number, b: number, c: number) => {
        out.push(a, b, c);
        const [ua, wa] = uvOfPoint.get(a)!, [ub, wb] = uvOfPoint.get(b)!, [uc, wc] = uvOfPoint.get(c)!;
        outParents.push(cur.parents[faces[find((ua + ub + uc) / 3, (wa + wb + wc) / 3)[0]]]);
      };
      const zip = (O: number[], oa: number[], In: number[], ia: number[]) => {
        const m = O.length, n = In.length;
        const angO = (k: number) => oa[k % m] + 2 * Math.PI * Math.floor(k / m);
        const angI = (k: number) => ia[k % n] + 2 * Math.PI * Math.floor(k / n);
        let i = 0, j = 0;
        while (i < m || j < n) {
          if (j >= n || (i < m && angO(i + 1) <= angI(j + 1))) {
            tri(O[i % m], O[(i + 1) % m], In[j % n]);
            i += 1;
          } else {
            tri(O[i % m], In[(j + 1) % n], In[j % n]);
            j += 1;
          }
        }
      };
      let outer = loop, outerAngles = rimAngle;
      for (const ring of ringsIn) {
        zip(outer, outerAngles, ring.ids, ring.angles);
        outer = ring.ids;
        outerAngles = ring.angles;
      }
      for (let k = 0; k < outer.length; k += 1) tri(outer[k], outer[(k + 1) % outer.length], middle);
      for (const p of loop) fixed[p] = 0;
      for (const f of faces) drop[f] = 1;
    }
    for (let f = 0; f < T; f += 1) {
      if (drop[f]) continue;
      out.push(I[f * 3], I[f * 3 + 1], I[f * 3 + 2]);
      outParents.push(cur.parents[f]);
    }
    let result: SurfaceMesh = { vertices: Float64Array.from(verts), indices: Uint32Array.from(out), parents: Uint32Array.from(outParents) };
    for (let pass = 0; pass < 12; pass += 1) {
      const c = collapseShortEdges(result.vertices, result.indices, SURFACE_MIN_EDGE);
      if (c.merged === 0 || !c.faces) break;
      const parents = result.parents;
      result = { vertices: result.vertices, indices: c.indices, parents: Uint32Array.from(c.faces, (f) => parents[f]) };
    }
    result.limited = Boolean(mesh.limited || cur.limited);
    return { mesh: result, reduced: rings < wanted || rimEdge > hw / BUMP_RIM_STEPS[s.detail], fixed: Float32Array.from(fixed) };
  }
  // 2. Corner lines: edges whose ends are nearest to different sides are cut exactly where both are equally far - in the
  // joint only. An end on the cell border may count to the neighbour cell; then (rarely) it is measured again in the cell
  // of the edge's middle.
  const scratch = new Float64Array(REC * 3);
  const kink: CutAt = (rec, a, b, ua, va, ub, vb) => {
    let oa = a * REC, ob = b * REC;
    if (rec[oa] >= hw * 1.02 && rec[ob] >= hw * 1.02) return -1;
    if (rec[oa + 1] === rec[ob + 1] && rec[oa + 2] === rec[ob + 2]) return -1;
    let R0 = rec;
    if (rec[oa + 1] !== rec[ob + 1]) {
      describe((ua + ub) / 2, (va + vb) / 2, scratch, 0);
      const sx = scratch[3], sy = scratch[4];
      const relabel = (u: number, v: number, o: number) => {
        let lo = Infinity;
        for (let k = 0; k < 6; k += 1) {
          const d = g(sx, sy, k, u, v);
          if (d < lo) {
            lo = d;
            scratch[o + 2] = k;
          }
        }
        scratch[o] = lo;
        scratch[o + 3] = sx;
        scratch[o + 4] = sy;
      };
      relabel(ua, va, REC);
      relabel(ub, vb, REC * 2);
      R0 = scratch;
      oa = REC;
      ob = REC * 2;
      if (scratch[oa + 2] === scratch[ob + 2]) return -1;
    }
    const sx = R0[oa + 3], sy = R0[oa + 4];
    const ka = R0[oa + 2], kb = R0[ob + 2];
    const ha = g(sx, sy, ka, ua, va) - g(sx, sy, kb, ua, va), hb = g(sx, sy, ka, ub, vb) - g(sx, sy, kb, ub, vb);
    const t = ha / (ha - hb);
    if (!(t > 0.02 && t < 0.98)) return -1;
    return g(sx, sy, ka, ua + t * (ub - ua), va + t * (vb - va)) < hw * 1.02 ? t : -1;
  };
  let cur = split(mesh, border, triple);
  cur = split(cur, border, triple);
  if (s.pattern === "bumps") return sliceBumps(cur);
  cur = split(cur, kink);
  cur = split(cur, kink);
  // 3. Profile levels. Points just off a level count as on it (a fifth of the gap between levels, at most SNAP): otherwise
  // cuts would lie close to them - many short edges and slivers that would have to be merged again.
  const v = cur.vertices, n = v.length / 3;
  const rec = recordsOf(v);
  const I = cur.indices;
  const T = I.length / 3;
  const skip = skipOf(v, rec, I, cur.parents);
  const levelsFor = (count: number) => profileLevels(s.profile, count).map((t) => t * hw);
  // A triangle crossing c levels becomes a strip of about 2c + 1 triangles.
  const estimate = (levels: number[]) => {
    let count = 0;
    for (let f = 0; f < T; f += 1) {
      const da = rec[I[f * 3] * REC], db = rec[I[f * 3 + 1] * REC], dc = rec[I[f * 3 + 2] * REC];
      const lo = Math.min(da, db, dc), hi = Math.max(da, db, dc);
      let crossings = 0;
      if (!skip[f]) for (const level of levels) if (level > lo && level < hi) crossings += 1;
      count += 1 + 2 * crossings;
    }
    return count;
  };
  let count = Math.max(2, steps);
  let levels = levelsFor(count);
  while (s.profile === "round" && count > 2 && estimate(levels) > maxTriangles) levels = levelsFor((count -= 1));
  let gap = levels[0];
  for (let k = 1; k < levels.length; k += 1) gap = Math.min(gap, levels[k] - levels[k - 1]);
  const snap = Math.min(0.2 * gap, SNAP);
  const dField = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = rec[i * REC];
    dField[i] = d;
    for (const level of levels) {
      if (Math.abs(d - level) < snap) {
        dField[i] = level;
        break;
      }
    }
  }
  const sliced = new Uint8Array(T);
  for (let f = 0; f < T; f += 1) {
    if (skip[f]) continue;
    if (Math.min(dField[I[f * 3]], dField[I[f * 3 + 1]], dField[I[f * 3 + 2]]) < hw * 1.001) sliced[f] = 1;
  }
  let out = sliceByField(cur, dField, (i, j) => dField[j] - dField[i], 1e6, levels, sliced);
  // Short edges (levels close to a corner, narrow triangles at border and corner line) are pulled together here
  // already, once for all depths - otherwise the output would do it again after every move.
  for (let pass = 0; pass < 12; pass += 1) {
    const c = collapseShortEdges(out.vertices, out.indices, SURFACE_MIN_EDGE);
    if (c.merged === 0 || !c.faces) break;
    const parents = out.parents;
    out = { vertices: out.vertices, indices: c.indices, parents: Uint32Array.from(c.faces, (f) => parents[f]) };
  }
  out.limited = Boolean(mesh.limited);
  return { mesh: out, reduced: count < Math.max(2, steps) };
}

const FLANK_JUMP = 0.3;
const FLANK_ROUNDS = 3;

/**
 * Refine the flanks: where the pattern value jumps by more than FLANK_JUMP along an edge (the rim
 * of a bump or a joint), split further down to `fineEdge`, over a few rounds, each time only at
 * the points still on a flank. Faces whose normal points along a cylinder's axis (top, bottom)
 * stay out: the pattern runs together into rays there and stays smooth anyway.
 */
function refineFlanks(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, fineEdge: number, maxTriangles: number, skipBase: Uint8Array | null = null): SurfaceMesh {
  let cur = mesh;
  const fine2 = (fineEdge * 1.01) ** 2;
  const ax = AXIS_INDEX[s.axis];
  for (let round = 0; round < FLANK_ROUNDS; round += 1) {
    const v = cur.vertices;
    const I = cur.indices;
    const n = v.length / 3;
    const { normals } = normalsAndCreases(v, I, 90);
    const values = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      if (s.projection === "cylinder" && Math.abs(normals[i * 3 + ax]) > 0.8) values[i] = NaN;
      else values[i] = surfaceTextureValueAt(v[i * 3], v[i * 3 + 1], v[i * 3 + 2], normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2], s, layout);
    }
    const flags = new Uint8Array(n);
    let any = false;
    for (let t = 0; t < I.length; t += 3) {
      // Faces cut already (all round on a straight face) are exact.
      if (skipBase && skipBase[cur.parents[t / 3]]) continue;
      for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
        const dx = v[a * 3] - v[b * 3], dy = v[a * 3 + 1] - v[b * 3 + 1], dz = v[a * 3 + 2] - v[b * 3 + 2];
        if (dx * dx + dy * dy + dz * dz <= fine2) continue;
        if (Math.abs(values[a] - values[b]) > FLANK_JUMP) {
          flags[a] = 1;
          flags[b] = 1;
          any = true;
        }
      }
    }
    if (!any) break;
    const next = subdivide(cur, fineEdge, maxTriangles, null, flags);
    if (next.indices.length === cur.indices.length) break;
    const parents = Uint32Array.from(next.parents, (f) => cur.parents[f]);
    cur = { vertices: next.vertices, indices: next.indices, parents, limited: cur.limited || next.limited };
    if (next.limited) break;
  }
  return cur;
}

/**
 * Whether the masks keep a point smooth (screen frame), or null without masks. A point on a mask's
 * face counts as inside it. Inside any "exclude" mask it stays smooth; with any "only" mask, it
 * stays smooth unless it lies in one of those.
 */
function maskTest(masks: SurfaceTextureMask[]) {
  if (!masks.length) return null;
  // Into the screen frame: (x, y, z) -> (x, -z, y), for the normal as for a point; the offset stays.
  const screen = masks.map(({ mode, planes, box }) => {
    const out = new Float64Array(planes.length);
    for (let k = 0; k < planes.length; k += 4) {
      out[k] = planes[k];
      out[k + 1] = -planes[k + 2];
      out[k + 2] = planes[k + 1];
      out[k + 3] = planes[k + 3];
    }
    // The box turns the same way: x stays, the inside z becomes minus y, the inside y becomes z.
    const bounds = box ? [box[0], -box[5], box[1], box[3], -box[2], box[4]] : [-Infinity, -Infinity, -Infinity, Infinity, Infinity, Infinity];
    return { mode, planes: out, bounds };
  });
  const hasOnly = screen.some((mask) => mask.mode === "only");
  const inside = ({ planes, bounds }: (typeof screen)[number], x: number, y: number, z: number) => {
    const tolerance = 1e-6;
    if (x < bounds[0] - tolerance || y < bounds[1] - tolerance || z < bounds[2] - tolerance || x > bounds[3] + tolerance || y > bounds[4] + tolerance || z > bounds[5] + tolerance) return false;
    for (let k = 0; k < planes.length; k += 4) if (planes[k] * x + planes[k + 1] * y + planes[k + 2] * z - planes[k + 3] > tolerance) return false;
    return true;
  };
  return (x: number, y: number, z: number) => {
    let inOnly = false;
    for (const mask of screen) {
      if (!inside(mask, x, y, z)) continue;
      if (mask.mode === "exclude") return true;
      inOnly = true;
    }
    return hasOnly && !inOnly;
  };
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

type RefinedState = {
  key: string;
  mesh: SurfaceMesh;
  normals: Float64Array;
  /** The direction each point moves along (see interpolatedNormals). */
  directions: Float64Array;
  crease: Uint8Array;
  down: Float64Array;
  up: Float64Array;
  adj: Adjacency;
  edge: number;
  crossMax: number;
  limited: boolean;
  slice: { smoothFace: Uint8Array } | null;
  /** Text: the value per point (0 smooth, 1 the full depth), the mesh cut along the letters' walls, and the points torn. */
  text?: { values: Float32Array; torn: number } | null;
  /** Bumps laid anew: the value of their points (NaN: from the pattern), by point number; points added later have none. */
  fixed?: Float32Array | null;
};

export type SurfaceTextureStats = {
  triangles: number;
  /** The triangle budget made the grid coarser than the detail asked for. */
  limited: boolean;
  /** Around a cylinder: how many grooves or cells go round. */
  around: number | null;
  /** The spacing as made (rounded around a cylinder), and how far it differs on the narrowest and widest wall. */
  spacing: number;
  spacingMin: number | null;
  spacingMax: number | null;
  /** Nothing got the pattern: mostly a side is switched off that makes up the body. */
  nothing: boolean;
  /** Inward from both sides: a plate thinner than twice the depth is pierced. */
  tooDeep: boolean;
  /** Points held on the bed instead of sinking below it. */
  bedClamped: number;
  /** What was dropped or repaired while reading the body. */
  removed: SurfaceBase["removed"];
  /** Cracks: how many lines (branches count) and how long they are together, mm; null for the other patterns. */
  cracks: { lines: number; length: number } | null;
  /**
   * Text: whether letters came onto the body, and how many points of them lie where two ways round a corner met and do
   * not agree (the text tears there, as a label would); null for the other patterns.
   */
  text: { placed: boolean; torn: number } | null;
  /** How the pattern was laid on: what "auto" chose, or what was asked for. */
  projection: Exclude<SurfaceTextureProjection, "auto">;
};

export type SurfaceTextureResult = {
  /** Points in the editor's inside frame (unused points may be among them), and triangles over them. */
  vertices: Float64Array;
  indices: Uint32Array;
  stats: SurfaceTextureStats;
  /** Cracks with gold: the closed body filling their notch, in the same frame; null otherwise. */
  fill: { vertices: Float64Array; indices: Uint32Array } | null;
};

export type SurfaceTextureOptions = {
  /** A quicker, coarser result for showing while the settings change. */
  preview?: boolean;
  maxTriangles?: number;
};

/**
 * Holds the welded body and the last refinement: when only the depth, the direction or what stays
 * smooth changes, the mesh is not refined again. `positions`: the body as triangles (nine numbers
 * each), in the editor's inside frame.
 */
export function createSurfaceTextureSession(positions: ArrayLike<number>) {
  const base = prepareSurfaceBase(insideToScreenPositions(positions));
  let cache: RefinedState | null = null;
  let fadeCache: { key: string; state: RefinedState } | null = null;
  let crackIndex: CrackSurfaceIndex | null = null;
  let crackCache: { key: string; net: CrackNetwork } | null = null;

  /**
   * The cracks' lines on the body (see vase/crack.mjs). A crack grows only over faces that can get the pattern:
   * not over the bottom or the top kept smooth, a wall switched off, outside the height band or in a mask.
   */
  function crackLines(s: SurfaceTextureSettings, layout: SurfaceTextureLayout, maskFree: ((x: number, y: number, z: number) => boolean) | null) {
    const ax = AXIS_INDEX[s.axis];
    const [i1, i2] = acrossAxes(s.axis);
    const key = JSON.stringify([s.crackStyle, s.crackStart, s.crackCount, s.crackLength, s.crackWidth, s.crackBranch, s.crackJag, s.crackRough, s.crackSeed, s.axis,
      s.bottomFree, s.topFree, s.inside, s.outside, s.zoneFrom, s.zoneTo, s.masks, layout.center]);
    if (crackCache?.key === key) return crackCache.net;
    crackIndex ??= surfaceIndex(base);
    const N = crackIndex.normals;
    const v = base.vertices;
    const cosBottom = Math.cos((s.bottomFree * Math.PI) / 180), cosTop = Math.cos((s.topFree * Math.PI) / 180);
    const zFrom = base.min[2] + (s.zoneFrom / 100) * (base.size[2] || 1), zTo = base.min[2] + (s.zoneTo / 100) * (base.size[2] || 1);
    const allowed = (t: number, q: number[]) => {
      const nz = N[t * 3 + 2];
      if ((s.bottomFree > 0 && -nz >= cosBottom) || (s.topFree > 0 && nz >= cosTop)) return false;
      if (q[2] < zFrom - 1e-9 || q[2] > zTo + 1e-9) return false;
      if ((!s.outside || !s.inside) && Math.hypot(N[t * 3 + i1], N[t * 3 + i2]) >= 0.5) {
        const r1 = q[i1] - layout.center[0], r2 = q[i2] - layout.center[1];
        const rl = Math.hypot(r1, r2);
        const isInside = rl > 1e-9 && (N[t * 3 + i1] * r1 + N[t * 3 + i2] * r2) / rl < -0.3;
        if (isInside ? !s.inside : !s.outside) return false;
      }
      return !(maskFree && maskFree(q[0], q[1], q[2]));
    };
    let maxRadius = 0;
    for (let i = 0; i < v.length; i += 3) maxRadius = Math.max(maxRadius, Math.hypot(v[i + i1] - layout.center[0], v[i + i2] - layout.center[1]));
    const settings = {
      crackStyle: CRACK_STYLE_NAMES[s.crackStyle],
      crackStart: CRACK_START_NAMES[s.crackStart],
      crackCount: s.crackCount,
      crackLength: s.crackLength,
      crackWidth: s.crackWidth,
      crackBranch: s.crackBranch,
      crackJag: s.crackJag,
      crackRough: s.crackRough,
      crackPaths: [],
      seed: s.crackSeed,
    };
    const net = crackNetwork(base, settings, { index: crackIndex, axis: ax, center: layout.center, lo: base.min[ax], hi: base.max[ax], maxRadius: maxRadius || 1, allowed });
    crackCache = { key, net };
    return net;
  }

  /**
   * Where a text is stuck on: a ray from far out, `textAround` degrees round the axis (0 the front, 90 the right; lying
   * along x or y, 0 the top) and `textHeight` % up it, towards the axis - the first face it meets is the middle of the
   * text. The window round the text gets a margin: the unrolling and the finer grid reach a little beyond the letters.
   */
  function textPlacement(s: SurfaceTextureSettings, layout: SurfaceTextureLayout): SurfaceTextPlacement | null {
    const box = outlineBox(s.textOutline);
    if (!box) return null;
    const ax = AXIS_INDEX[s.axis];
    const [i1, i2] = acrossAxes(s.axis);
    const [front, right] = TEXT_FRONT[s.axis];
    const a = (s.textAround * Math.PI) / 180;
    const dir = front.map((f, k) => Math.cos(a) * f + Math.sin(a) * right[k]);
    const middle = [0, 0, 0];
    middle[ax] = base.min[ax] + clamp(s.textHeight / 100, 0.001, 0.999) * base.size[ax];
    middle[i1] = layout.center[0];
    middle[i2] = layout.center[1];
    const far = Math.hypot(...base.size) + 10;
    const hit = firstHit(base, middle.map((m, k) => m + dir[k] * far), dir.map((d) => -d)) ?? nearestSurfacePoint(base, middle.map((m, k) => m + dir[k] * layout.rMax));
    if (!hit) return null;
    const width = box.maxX - box.minX, height = box.maxY - box.minY;
    const margin = Math.max(0.05 * Math.max(width, height), 1) + 1;
    const halfW = width / 2 + margin, halfH = height / 2 + margin;
    return { point: hit.point, face: hit.face, width, height, halfW, halfH, reach: Math.hypot(halfW, halfH) + 0.5 };
  }

  /**
   * Unroll the surface round a text's anchor, only in its window (see vase/unfold.mjs). The face under the anchor is
   * looked for anew in a refined mesh: its triangles are numbered differently.
   */
  function unrolled(mesh: { vertices: Float64Array; indices: Uint32Array }, place: SurfaceTextPlacement, s: SurfaceTextureSettings, face = -1) {
    return unfoldSurface(mesh, place.point, { axis: s.axis, face, reach: place.reach, window: { halfW: place.halfW, halfH: place.halfH, turn: s.textTurn } });
  }

  /**
   * Input points that surely stay smooth after the layout: inside or outside walls, top, bottom, as
   * set. They need no fine grid. Decided per face first, and a point is smooth only when all its
   * faces are - a point on the rim belongs to the wall too and needs the grid there. The decision
   * per face comes along (`faces`): cut into groove strips, a bottom stays whole.
   */
  function smoothBaseVertices(s: SurfaceTextureSettings, layout: SurfaceTextureLayout) {
    const v = base.vertices;
    const I = base.indices;
    const cosBottom = Math.cos((s.bottomFree * Math.PI) / 180);
    const cosTop = Math.cos((s.topFree * Math.PI) / 180);
    const [i1, i2] = acrossAxes(s.axis);
    const points = new Uint8Array(v.length / 3).fill(1);
    const faces = new Uint8Array(I.length / 3);
    for (let t = 0; t < I.length; t += 3) {
      const [x, y, z] = faceCross(v, I[t], I[t + 1], I[t + 2]);
      const l = Math.hypot(x, y, z);
      if (l === 0) continue;
      const fn = [x / l, y / l, z / l];
      let smooth = false;
      if (s.bottomFree > 0 && -fn[2] >= cosBottom) smooth = true;
      else if (s.topFree > 0 && fn[2] >= cosTop) smooth = true;
      else if ((!s.outside || !s.inside) && Math.hypot(fn[i1], fn[i2]) >= 0.5) {
        const cx = (v[I[t] * 3 + i1] + v[I[t + 1] * 3 + i1] + v[I[t + 2] * 3 + i1]) / 3 - layout.center[0];
        const cy = (v[I[t] * 3 + i2] + v[I[t + 1] * 3 + i2] + v[I[t + 2] * 3 + i2]) / 3 - layout.center[1];
        const rl = Math.hypot(cx, cy);
        const isInside = rl > 1e-9 && (fn[i1] * cx + fn[i2] * cy) / rl < -0.3;
        smooth = isInside ? !s.inside : !s.outside;
      }
      if (smooth) faces[t / 3] = 1;
      else for (let k = 0; k < 3; k += 1) points[I[t + k]] = 0;
    }
    return { points, faces };
  }

  /** Area (mm²) of the input triangles that can get the pattern (a point not surely smooth). */
  function texturableArea(smooth: Uint8Array) {
    const I = base.indices;
    let area = 0;
    for (let t = 0; t < I.length; t += 3) {
      if (smooth[I[t]] && smooth[I[t + 1]] && smooth[I[t + 2]]) continue;
      area += Math.hypot(...faceCross(base.vertices, I[t], I[t + 1], I[t + 2])) / 2;
    }
    return area;
  }

  function withNormals(key: string, mesh: SurfaceMesh, edge: number, crossMax: number, limited: boolean, slice: RefinedState["slice"], edgeAngle: number): RefinedState {
    const { normals, crease, down, up } = normalsAndCreases(mesh.vertices, mesh.indices, edgeAngle);
    const directions = interpolatedNormals(base, mesh, edgeAngle);
    return { key, mesh, normals, directions, crease, down, up, adj: adjacency(mesh.vertices.length / 3, mesh.indices), edge, crossMax, limited, slice };
  }

  /** Refine for the pattern (see the top of this file). `scale` > 1 makes a preview coarser. */
  function refined(s: SurfaceTextureSettings, layout: SurfaceTextureLayout, maxTriangles: number, scale: number): RefinedState {
    const slice = stripesAreCut(s);
    const smooth = smoothBaseVertices(s, layout);
    // All round on straight faces (a box's sides): cut per axis as flat, the rest refined as before.
    const striped = s.pattern === "grooves" || s.pattern === "knurl";
    const straight = s.projection === "allRound" && (striped || CELL_PATTERNS.includes(s.pattern)) ? straightFaces(base, smooth.faces) : null;
    const axisSettings = (k: number): SurfaceTextureSettings => ({ ...s, projection: "flat", axis: SURFACE_TEXTURE_AXES[k] });
    const notOnAxis = (k: number) => Uint8Array.from(smooth.faces, (sm, f) => (sm || straight![f] !== k ? 1 : 0));
    let edge: number;
    // Grooves: the finest step across, for refining where the pattern fades in (see refineTransitions).
    let crossMax = 0;
    let raised = false;
    const cracks = s.pattern === "cracks";
    const text = s.pattern === "text";
    if (cracks) {
      // Cracks: the body's own grid, refined only in the band round the lines (below).
      edge = Math.max(0.06, s.crackWidth / 2 / CRACK_STEPS[s.detail]) * scale;
    } else if (text) {
      // Text: the body's own grid, refined only in the window round the letters (below).
      edge = Math.max(0.05, (layout.text?.height ?? s.textSize) / TEXT_STEPS[s.detail]) * scale;
    } else if (slice) {
      // Across: the places of the profile, while cutting. Along, the pattern does not change, and the body's roundness is in
      // its own rows already - at most 6 mm (a 6 mm chord on 80 mm radius strays 0.06 mm), so refining where the pattern
      // fades in does not run over huge triangles either.
      crossMax = (layout.period * clamp(s.width, 0.2, 1)) / CROSS_STEPS[s.detail];
      edge = 6 * scale;
    } else {
      edge = Math.min(targetEdge(s), 10) * scale;
      // Estimate first and rather get coarser than stop at the budget. Smooth faces stay coarse and do not count.
      const minEdge = Math.sqrt(texturableArea(smooth.points) / (0.15 * maxTriangles));
      raised = edge < minEdge;
      if (raised) edge = minEdge;
    }
    let smoothKey = 2166136261;
    for (let i = 0; i < smooth.points.length; i += 1) smoothKey = Math.imul(smoothKey ^ smooth.points[i] ^ (i & 0xff), 16777619);
    const layoutKey = cracks
      ? JSON.stringify([s.pattern, crackCache?.key ?? null])
      : text
        ? JSON.stringify([s.pattern, layout.text ? [layout.text.point, layout.text.face] : null, s.axis, s.textTurn, outlineKey(s.textOutline)])
        : JSON.stringify([s.pattern, s.spacing, s.width, s.profile, s.projection, s.axis, layout.cell, layout.period, layout.angle, layout.radius, layout.center]);
    const key = `${edge.toFixed(5)}|${smoothKey}|${maxTriangles}|${s.edgeAngle}|${s.detail}|${scale}|${layoutKey}`;
    if (cache?.key === key) return cache;
    let mesh: SurfaceMesh;
    const net = layout.crack;
    const place = layout.text;
    let unrolledText: RefinedState["text"] = null;
    if (text) {
      mesh = baseMesh(base);
      if (place) {
        // Only where the window reaches, not the inner wall of a thin vase behind it: an edge at a point of the body
        // the window does not reach is not split (new points come from edges split already, so they belong to it).
        // Not split at either end, as with smooth points: an edge never split while its neighbours are would pull
        // them into slivers.
        const first = unrolled(base, place, s, place.face);
        const nBase = base.vertices.length / 3;
        // Estimate first: the circle round the window over a triangle's area; too many - coarser.
        const budget = Math.max(1, maxTriangles - mesh.indices.length / 3);
        const estimate = (1.6 * Math.PI * place.reach ** 2) / (0.433 * edge * edge);
        if (estimate > budget) {
          edge *= Math.sqrt(estimate / budget);
          raised = true;
        }
        const [px, py, pz] = place.point;
        const reach2 = place.reach ** 2;
        // Asked the same way from both triangles of an edge, or they would split it differently.
        const near = (verts: ArrayLike<number>, p: number, q: number) => {
          const a = Math.min(p, q), b = Math.max(p, q);
          if ((a < nBase && !Number.isFinite(first.U[a])) || (b < nBase && !Number.isFinite(first.U[b]))) return false;
          const ox = verts[a * 3] - px, oy = verts[a * 3 + 1] - py, oz = verts[a * 3 + 2] - pz;
          const dx = verts[b * 3] - verts[a * 3], dy = verts[b * 3 + 1] - verts[a * 3 + 1], dz = verts[b * 3 + 2] - verts[a * 3 + 2];
          const l2 = dx * dx + dy * dy + dz * dz;
          const t = l2 > 0 ? clamp(-(ox * dx + oy * dy + oz * dz) / l2, 0, 1) : 0;
          return (ox + t * dx) ** 2 + (oy + t * dy) ** 2 + (oz + t * dz) ** 2 <= reach2;
        };
        const split = subdivide(mesh, edge, maxTriangles, null, null, near);
        mesh = { ...split, parents: Uint32Array.from(split.parents, (f) => mesh.parents[f]) };
        // The letters' edges: finer where an edge crosses a letter's wall (as at the flanks of bumps), unrolled anew each
        // round. The distance is exact up to `cap`, beyond the longest edge crossing a wall.
        const fineEdge = edge / 2.5;
        const fine2 = (fineEdge * 1.01) ** 2;
        const cap = Math.max(1.5 * edge, 4 * TEXT_WALL);
        const crosses = (F: Float64Array, a: number, b: number) => (F[a] < TEXT_WALL) !== (F[b] < TEXT_WALL) || (F[a] > -TEXT_WALL) !== (F[b] > -TEXT_WALL);
        let uv = unrolled(mesh, place, s);
        for (let round = 0; round < FLANK_ROUNDS && !mesh.limited; round += 1) {
          const F = textField(uv.U, uv.V, s.textOutline, s.textTurn, cap);
          const v = mesh.vertices, I = mesh.indices;
          const flags = new Uint8Array(v.length / 3);
          let any = false;
          for (let t = 0; t < I.length; t += 3) {
            for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
              if (!crosses(F, a, b)) continue;
              const dx = v[a * 3] - v[b * 3], dy = v[a * 3 + 1] - v[b * 3 + 1], dz = v[a * 3 + 2] - v[b * 3 + 2];
              if (dx * dx + dy * dy + dz * dz <= fine2) continue;
              flags[a] = 1;
              flags[b] = 1;
              any = true;
            }
          }
          if (!any) break;
          const next = subdivide(mesh, fineEdge, maxTriangles, null, flags);
          if (next.indices.length === mesh.indices.length) break;
          const parents = Uint32Array.from(next.parents, (f) => mesh.parents[f]);
          mesh = { vertices: next.vertices, indices: next.indices, parents, limited: Boolean(mesh.limited || next.limited) };
          uv = unrolled(mesh, place, s);
        }
        // Then cut along both sides of every wall: the letters' edges become edges of the mesh, following the outlines
        // instead of the grid (on the grid they came out as steps). Between the cuts the wall rises; points carry the
        // distance they were cut at.
        const F = textField(uv.U, uv.V, s.textOutline, s.textTurn, cap);
        const I = mesh.indices;
        const sliced = new Uint8Array(I.length / 3);
        for (let f = 0; f < sliced.length; f += 1) {
          const a = F[I[f * 3]], b = F[I[f * 3 + 1]], c = F[I[f * 3 + 2]];
          if (Math.min(a, b, c) <= TEXT_WALL && Math.max(a, b, c) >= -TEXT_WALL) sliced[f] = 1;
        }
        const cut = sliceByField(mesh, F, (i, j) => F[j] - F[i], 1e6, [-TEXT_WALL, TEXT_WALL], sliced, null, true);
        const field = cut.field ?? F;
        // A point closer to a cut than SURFACE_MIN_EDGE is not cut beside but counts as on it: it gets the cut's depth
        // too, or it pulled a little tooth into the letter's edge.
        const slope = 2 * (TEXT_WALL - SURFACE_MIN_EDGE);
        const values = new Float32Array(field.length);
        for (let i = 0; i < field.length; i += 1) values[i] = clamp(0.5 - field[i] / slope, 0, 1);
        mesh = { vertices: cut.vertices, indices: cut.indices, parents: cut.parents, limited: mesh.limited };
        unrolledText = { values, torn: uv.torn };
      }
    } else if (cracks) {
      mesh = baseMesh(base);
      if (net && net.count) {
        // Estimate first: the band (length × width and the margin) over a triangle's area; too many - coarser.
        const band = net.length * 2 * (net.maxHw + edge);
        const budget = Math.max(1, maxTriangles - mesh.indices.length / 3);
        const estimate = (1.6 * band) / (0.433 * edge * edge);
        if (estimate > budget) {
          edge *= Math.sqrt(estimate / budget);
          raised = true;
        }
        // Each edge is asked once: edges not split come back in every pass.
        const memo = new Map<number, boolean>();
        const near = (verts: ArrayLike<number>, a: number, b: number) => {
          const k = a < b ? a * 67108864 + b : b * 67108864 + a;
          let hit = memo.get(k);
          if (hit === undefined) {
            hit = crackEdgeNear(net, verts, a, b, edge);
            memo.set(k, hit);
          }
          return hit;
        };
        const split = subdivide(mesh, edge, maxTriangles, null, null, near);
        mesh = { ...split, parents: Uint32Array.from(split.parents, (f) => mesh.parents[f]) };
      }
    } else if (slice) {
      // Along first, coarse (only triangles reaching further than `edge`, smooth faces not), at contour lines rather than by
      // halving edges: the middles of diagonals would lie on chords inside the roundness. Then across.
      const F0 = stripeFields(base, s, layout);
      const I = base.indices;
      const alongSliced = new Uint8Array(I.length / 3);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        if (smooth.faces[t / 3] || F0.pole[a] || F0.pole[b] || F0.pole[c]) continue;
        const reach = Math.max(Math.abs(F0.alongDiff(a, b)), Math.abs(F0.alongDiff(b, c)), Math.abs(F0.alongDiff(c, a)));
        if (reach > edge) alongSliced[t / 3] = 1;
      }
      const coarse = sliceByField(baseMesh(base), F0.along, F0.alongDiff, edge, [0], alongSliced, F0.crossDiff);
      // A round profile gets half the places across per flank; too many triangles: fewer, at least one.
      let steps = CROSS_STEPS[s.detail] / 2;
      for (;;) {
        mesh = sliceStripes(coarse, s, layout, steps, smooth.faces);
        if (s.pattern === "knurl") {
          mesh = sliceStripes(mesh, s, { ...layout, angle: -layout.angle }, steps, smooth.faces);
          mesh = sliceKnurlCrease(mesh, s, layout, smooth.faces);
        }
        if (mesh.indices.length / 3 <= maxTriangles || s.profile !== "round" || steps <= 1) break;
        steps = Math.max(1, Math.floor(steps / 2));
        crossMax = (layout.period * clamp(s.width, 0.2, 1)) / (2 * steps);
        raised = true;
      }
      mesh.limited = mesh.indices.length / 3 > maxTriangles;
    } else {
      const start = baseMesh(base);
      // Honeycomb is cut along its joints afterwards and bumps get their flanks refined: they leave half the budget for that.
      const budget = Math.floor(maxTriangles / 2);
      // Grooves on straight faces are cut, not refined: points only on such faces (or smooth ones) stay as they are.
      let keep = smooth.points;
      if (straight && striped) {
        const other = new Uint8Array(smooth.points.length);
        for (let f = 0; f < straight.length; f += 1) {
          if (straight[f] !== 255 || smooth.faces[f]) continue;
          for (let k = 0; k < 3; k += 1) other[base.indices[f * 3 + k]] = 1;
        }
        keep = Uint8Array.from(smooth.points, (sm, i) => (sm || !other[i] ? 1 : 0));
      }
      mesh = subdivide(start, edge, budget, keep);
      // Halving takes up to four times the triangles in one pass: when the budget stopped it half way, the grid would be
      // uneven and the pattern neither cut nor refined. Rather a little coarser all over.
      for (let tries = 0; mesh.limited && tries < 8; tries += 1) {
        edge *= 1.25;
        raised = true;
        mesh = subdivide(start, edge, budget, keep);
      }
      // Carefully coarser but far under the budget: once more, finer.
      const goal = 0.6 * budget;
      if (raised && !mesh.limited && mesh.indices.length / 3 < 0.7 * goal) {
        const f = Math.sqrt(mesh.indices.length / 3 / goal);
        const again = subdivide(start, edge * f, budget, keep);
        if (!again.limited) {
          mesh = again;
          edge *= f;
        }
      }
    }
    // Honeycomb and bumps (cylinder or flat): cut at cell borders and profile levels instead of refining the flanks. The
    // preview with half as many levels: each level cuts along the whole joint or round every bump.
    let cellSliced = false;
    let fixed: Float32Array | null = null;
    const cellSteps = () => {
      const full = s.pattern === "bumps" ? BUMP_RINGS[s.detail] : CROSS_STEPS[s.detail];
      return scale > 1 ? Math.ceil(full / 2) : full;
    };
    if (cellsAreCut(s) && !mesh.limited) {
      const cut = sliceCells(mesh, s, layout, cellSteps(), maxTriangles, smooth.faces);
      if (cut.reduced) raised = true;
      fixed = cut.fixed ?? null;
      mesh = { ...cut.mesh, limited: Boolean(mesh.limited || cut.mesh.indices.length / 3 > maxTriangles) };
      cellSliced = true;
    }
    // All round on straight faces: each axis' faces cut as flat ones. Points keep their numbers from cut to cut, so the
    // bumps' values of one axis stay right after the next.
    if (straight && !mesh.limited) {
      for (let k = 0; k < 3; k += 1) {
        if (!straight.includes(k)) continue;
        const sk = axisSettings(k);
        const skip = notOnAxis(k);
        if (striped) {
          crossMax = (layout.period * clamp(s.width, 0.2, 1)) / CROSS_STEPS[s.detail];
          const F0 = stripeFields(mesh, sk, layout);
          const I = mesh.indices;
          const alongSliced = new Uint8Array(I.length / 3);
          for (let t = 0; t < I.length; t += 3) {
            if (skip[mesh.parents[t / 3]]) continue;
            const a = I[t], b = I[t + 1], c = I[t + 2];
            if (Math.max(Math.abs(F0.alongDiff(a, b)), Math.abs(F0.alongDiff(b, c)), Math.abs(F0.alongDiff(c, a))) > 6 * scale) alongSliced[t / 3] = 1;
          }
          mesh = sliceByField(mesh, F0.along, F0.alongDiff, 6 * scale, [0], alongSliced, F0.crossDiff);
          const steps = CROSS_STEPS[s.detail] / 2;
          mesh = sliceStripes(mesh, sk, layout, steps, skip);
          if (s.pattern === "knurl") {
            mesh = sliceStripes(mesh, sk, { ...layout, angle: -layout.angle }, steps, skip);
            mesh = sliceKnurlCrease(mesh, sk, layout, skip);
          }
        } else {
          const cut = sliceCells(mesh, sk, layout, cellSteps(), maxTriangles, skip);
          if (cut.reduced) raised = true;
          if (cut.fixed) {
            const merged = new Float32Array(cut.fixed.length);
            for (let i = 0; i < merged.length; i += 1) merged[i] = Number.isNaN(cut.fixed[i]) && fixed && i < fixed.length ? fixed[i] : cut.fixed[i];
            fixed = merged;
          }
          mesh = cut.mesh;
        }
        mesh.limited = mesh.indices.length / 3 > maxTriangles;
        if (mesh.limited) break;
      }
    }
    const cutFaces = straight ? Uint8Array.from(straight, (k) => (k === 255 ? 0 : 1)) : null;
    if (!slice && !cracks && !text && !mesh.limited && !cellSliced) mesh = refineFlanks(mesh, s, layout, edge / 2.5, maxTriangles, cutFaces);
    cache = { ...withNormals(key, mesh, edge, crossMax, raised || Boolean(mesh.limited), slice ? { smoothFace: smooth.faces } : null, s.edgeAngle), text: unrolledText, fixed };
    return cache;
  }

  /**
   * Refine more finely where the pattern fades in or out: points with 0 < weight < 1 and the
   * neighbours at the border. Grooves are cut along at contour lines (halving would also halve
   * across); otherwise edges at those points are split. The old state when there is nothing to do.
   */
  function refineTransitions(state: RefinedState, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, w: Float32Array, maxEdge: number, maxTriangles: number): RefinedState {
    const { mesh, adj } = state;
    const n = w.length;
    const flags = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i += 1) {
      let mark = w[i] > 0 && w[i] < 1;
      for (let e = adj.start[i]; !mark && w[i] === 0 && e < adj.start[i + 1]; e += 1) if (w[adj.nb[e]] > 0) mark = true;
      if (mark) {
        flags[i] = 1;
        any = true;
      }
    }
    if (!any) return state;
    let fine: SurfaceMesh;
    if (state.slice) {
      const F = stripeFields(mesh, s, layout);
      const I = mesh.indices;
      const sliced = new Uint8Array(I.length / 3);
      for (let f = 0; f < sliced.length; f += 1) {
        if (!(flags[I[f * 3]] || flags[I[f * 3 + 1]] || flags[I[f * 3 + 2]])) continue;
        // Smooth faces (bottom, top) and triangles at the axis only as neighbours: they take in the points on the rim.
        if (state.slice.smoothFace[mesh.parents[f]] || F.pole[I[f * 3]] || F.pole[I[f * 3 + 1]] || F.pole[I[f * 3 + 2]]) continue;
        sliced[f] = 1;
      }
      // Cutting passes the input triangles through.
      fine = sliceByField(mesh, F.along, F.alongDiff, maxEdge, [0], sliced, F.crossDiff);
      if (fine.indices.length / 3 > maxTriangles) fine.limited = true;
    } else {
      // Splitting names the triangles it split: fine -> grid -> input.
      const split = subdivide(mesh, maxEdge, maxTriangles, null, flags);
      fine = { ...split, parents: Uint32Array.from(split.parents, (f) => mesh.parents[f]) };
    }
    if (fine.indices.length === mesh.indices.length) return state;
    // Splitting adds points behind the others: the bumps' values keep their numbers.
    return { ...withNormals(state.key, fine, state.edge, state.crossMax, state.limited || Boolean(fine.limited), state.slice, s.edgeAngle), fixed: state.fixed };
  }

  // Whether the body is round, per axis: asked once, not on every change of a setting.
  const roundness = new Map<SurfaceTextureAxis, boolean>();
  function apply(input: unknown, options: SurfaceTextureOptions = {}): SurfaceTextureResult {
    const asked = normalizeSurfaceTexture(input);
    if (asked.projection === "auto" && !roundness.has(asked.axis)) roundness.set(asked.axis, isRoundBody(base, asked.axis));
    // "auto" decided for this body; everything below sees the choice.
    const s: SurfaceTextureSettings = asked.projection === "auto" ? { ...asked, projection: roundness.get(asked.axis) ? "cylinder" : "allRound" } : asked;
    const preview = Boolean(options.preview);
    const maxTriangles = Math.max(1000, Math.round(options.maxTriangles ?? (preview ? SURFACE_TEXTURE_PREVIEW_TRIANGLES : SURFACE_TEXTURE_MAX_TRIANGLES)));
    const maskFree = maskTest(s.masks);
    // Points the masks keep smooth do not count for the axis: a masked handle does not pull it aside.
    let baseSkip: Uint8Array | null = null;
    if (maskFree) {
      baseSkip = new Uint8Array(base.vertices.length / 3);
      for (let i = 0; i < baseSkip.length; i += 1) baseSkip[i] = maskFree(base.vertices[i * 3], base.vertices[i * 3 + 1], base.vertices[i * 3 + 2]) ? 1 : 0;
    }
    const layout = makeSurfaceTextureLayout(base, s, baseSkip);
    if (s.pattern === "cracks") layout.crack = crackLines(s, layout, maskFree);
    if (s.pattern === "text") layout.text = textPlacement(s, layout);
    const r = refined(s, layout, maxTriangles, preview ? 1.5 : 1);

    // A text goes where it was put: what stays smooth for a pattern all over (bottom, top, a wall, the height band, sharp
    // edges) does not hold it back - masks do.
    const placed = s.pattern === "text";
    /** Weight per point: 0 = smooth, 1 = the full pattern, faded in over `fade` mm. */
    const weightsFor = ({ mesh, normals, crease, down, up, adj }: RefinedState) => {
      const v = mesh.vertices;
      const n = v.length / 3;
      const zMin = base.min[2];
      const zH = base.size[2] || 1;
      const zFrom = zMin + (s.zoneFrom / 100) * zH;
      const zTo = zMin + (s.zoneTo / 100) * zH;
      const cosBottom = Math.cos((s.bottomFree * Math.PI) / 180);
      const cosTop = Math.cos((s.topFree * Math.PI) / 180);
      const [i1, i2] = acrossAxes(s.axis);
      const w0 = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) {
        const z = v[i * 3 + 2];
        let free = false;
        if (maskFree && maskFree(v[i * 3], v[i * 3 + 1], z)) free = true;
        else if (placed) free = false;
        else if (s.keepEdges && crease[i]) free = true;
        else if (s.bottomFree > 0 && down[i] >= cosBottom) free = true;
        else if (s.topFree > 0 && up[i] >= cosTop) free = true;
        else if ((s.zoneFrom > 0 && z < zFrom - 1e-9) || (s.zoneTo < 100 && z > zTo + 1e-9)) free = true;
        else if (!s.outside || !s.inside) {
          // A side wall (normal mostly across the axis): when it faces the axis, it is inside.
          const h1 = normals[i * 3 + i1], h2 = normals[i * 3 + i2];
          if (Math.hypot(h1, h2) >= 0.5) {
            const r1 = v[i * 3 + i1] - layout.center[0], r2 = v[i * 3 + i2] - layout.center[1];
            const rl = Math.hypot(r1, r2);
            const isInside = rl > 1e-9 && (h1 * r1 + h2 * r2) / rl < -0.3;
            if (isInside ? !s.inside : !s.outside) free = true;
          }
        }
        w0[i] = free ? 0 : 1;
      }
      return fadeWeights(v, adj, w0, s.fade, s.margin);
    };

    let state = r;
    let weights = weightsFor(state);
    // The groove grid: triangles along it are up to a few mm long. Where the pattern fades out (rim, smooth faces), the
    // fade over such a long triangle would smear and look restless. There - only there - it is refined finely.
    if (r.crossMax > 0) {
      const weightKey = JSON.stringify([r.key, s.bottomFree, s.topFree, s.zoneFrom, s.zoneTo, s.keepEdges, s.edgeAngle, s.fade, s.margin, s.outside, s.inside, layout.center, s.masks]);
      if (fadeCache?.key === weightKey) state = fadeCache.state;
      else {
        state = refineTransitions(r, s, layout, weights, Math.max(2 * r.crossMax, Math.min(0.5, Math.max(s.fade, 0.25) / 2)), maxTriangles);
        fadeCache = { key: weightKey, state };
      }
      if (state !== r) weights = weightsFor(state);
    }

    const { mesh, directions } = state;
    const v = mesh.vertices;
    const n = v.length / 3;
    const out = new Float64Array(v.length);
    // Cutting and merging can leave points no triangle uses: they do not count as textured.
    const used = new Uint8Array(n);
    for (let t = 0; t < mesh.indices.length; t += 1) used[mesh.indices[t]] = 1;
    let textured = 0;
    // Cracks with gold: how deep the notch is at each point; the points moved along `directions`.
    const gold = s.pattern === "cracks" && s.crackGold && s.direction === "inward" && Boolean(layout.crack?.count);
    const notch = gold ? new Float64Array(n) : null;
    // Text: the values come from the unrolled plane, not from a projection.
    const textValue = s.pattern === "text" && state.text ? state.text.values : null;
    const fixedValue = state.fixed ?? null;
    let lettered = 0;
    for (let i = 0; i < n; i += 1) {
      const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
      const nx = directions[i * 3], ny = directions[i * 3 + 1], nz = directions[i * 3 + 2];
      let d = 0;
      const wi = weights[i];
      if (wi > 0) {
        textured += used[i];
        const known = fixedValue && i < fixedValue.length ? fixedValue[i] : NaN;
        const value = textValue ? textValue[i] : !Number.isNaN(known) ? known : surfaceTextureValueAt(x, y, z, nx, ny, nz, s, layout);
        if (textValue && value > 0.5) lettered += used[i];
        d = wi * (s.direction === "outward" ? s.depth * value : s.direction === "inward" ? -s.depth * value : s.depth * (value - 0.5));
        if (notch) notch[i] = wi * s.depth * value;
      }
      out[i * 3] = x + nx * d;
      out[i * 3 + 1] = y + ny * d;
      out[i * 3 + 2] = z + nz * d;
    }
    // With the bottom kept smooth, nothing belongs below the bed (the slicer would cut it off, or the first layer stick
    // badly). With a patterned bottom it sinks on purpose, as does a text put on the bottom itself.
    const onBottom = placed && Boolean(layout.text && layout.text.point[2] <= base.min[2] + 1e-6);
    const bedClamped = (placed ? !onBottom : s.bottomFree > 0) ? clampToBed(out, v, mesh.indices, base.min[2]) : 0;
    // Tiny edges (left over from fitting to the profile) are pulled together: slicers merge such close points themselves
    // and throw away the triangles without area - which tore edges open.
    let indices = mesh.indices;
    let capped = false;
    for (let round = 0; round < 3; round += 1) {
      for (let pass = 0; pass < 12; pass += 1) {
        const c = collapseShortEdges(out, indices, SURFACE_MIN_EDGE);
        indices = c.indices;
        if (c.merged === 0) break;
      }
      const fixed = fixCaps(out, indices);
      if (fixed === indices) break;
      indices = fixed;
      capped = true;
    }
    if (capped) indices = dropFins(indices);
    // The gold: a closed body on the bottom of the notch, its top `crackRecess` mm below the surface.
    const fillBody = notch ? crackFillBody(out, indices, notch, directions, s.crackRecess) : null;
    const fill = fillBody && fillBody.indices.length ? { vertices: screenToInsidePositions(fillBody.vertices), indices: fillBody.indices } : null;
    const inwardDepth = s.direction === "inward" ? s.depth : s.direction === "both" ? s.depth / 2 : 0;
    const smallest = Math.min(...base.size.filter((size) => size > 0));
    const spacing = s.projection === "cylinder" ? (CELL_PATTERNS.includes(s.pattern) ? layout.cell : layout.period) : s.spacing;
    return {
      vertices: screenToInsidePositions(out),
      indices,
      stats: {
        triangles: indices.length / 3,
        limited: r.limited || state.limited,
        around: layout.around,
        spacing,
        spacingMin: layout.around ? (spacing * layout.rMin) / layout.radius : null,
        spacingMax: layout.around ? (spacing * layout.rMax) / layout.radius : null,
        nothing: textured === 0,
        tooDeep: 2 * inwardDepth > smallest,
        bedClamped,
        removed: base.removed,
        cracks: layout.crack ? { lines: layout.crack.lines.length, length: layout.crack.length } : null,
        text: s.pattern === "text" ? { placed: lettered > 0, torn: state.text?.torn ?? 0 } : null,
        projection: s.projection as Exclude<SurfaceTextureProjection, "auto">,
      },
      fill,
    };
  }

  return { base, apply };
}

export type SurfaceTextureSession = ReturnType<typeof createSurfaceTextureSession>;

/** Texture a body once: its triangles (inside frame) in, the textured triangles out. */
export function applySurfaceTexture(positions: ArrayLike<number>, settings: unknown, options: SurfaceTextureOptions = {}) {
  return createSurfaceTextureSession(positions).apply(settings, options);
}

/** A result as a flat list of triangles (nine numbers each), as an imported mesh keeps it. */
export function surfaceTexturePositions(result: Pick<SurfaceTextureResult, "vertices" | "indices">) {
  const { vertices, indices } = result;
  const out = new Array<number>(indices.length * 3);
  for (let t = 0; t < indices.length; t += 1) {
    const s = indices[t] * 3;
    out[t * 3] = vertices[s];
    out[t * 3 + 1] = vertices[s + 1];
    out[t * 3 + 2] = vertices[s + 2];
  }
  return out;
}
