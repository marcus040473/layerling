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
 * - Bumps: refined evenly, then once more where the value jumps (the flanks).
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

export const SURFACE_TEXTURE_PATTERNS = ["grooves", "knurl", "honeycomb", "bumps"] as const;
export type SurfaceTexturePattern = (typeof SURFACE_TEXTURE_PATTERNS)[number];
/** Cross-section of a groove or joint: round (cosine), pointed (V) or flat (a flat floor with steep flanks). */
export const SURFACE_TEXTURE_PROFILES = ["round", "pointed", "flat"] as const;
export type SurfaceTextureProfile = (typeof SURFACE_TEXTURE_PROFILES)[number];
/**
 * How the pattern comes onto the body. Cylinder: around an axis, closing at the seam. All round:
 * from three sides, blended by the normal (triplanar) - for bodies that are not round. Flat: seen
 * along the axis, like a stamp.
 */
export const SURFACE_TEXTURE_PROJECTIONS = ["cylinder", "allRound", "flat"] as const;
export type SurfaceTextureProjection = (typeof SURFACE_TEXTURE_PROJECTIONS)[number];
export const SURFACE_TEXTURE_DIRECTIONS = ["inward", "outward", "both"] as const;
export type SurfaceTextureDirection = (typeof SURFACE_TEXTURE_DIRECTIONS)[number];
export const SURFACE_TEXTURE_DETAILS = ["coarse", "medium", "fine"] as const;
export type SurfaceTextureDetail = (typeof SURFACE_TEXTURE_DETAILS)[number];
/** Axes as the editor shows them: X right, Y back, Z up. */
export const SURFACE_TEXTURE_AXES = ["x", "y", "z"] as const;
export type SurfaceTextureAxis = (typeof SURFACE_TEXTURE_AXES)[number];

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
};

export const SURFACE_TEXTURE_DEFAULTS: Readonly<SurfaceTextureSettings> = Object.freeze({
  pattern: "knurl",
  spacing: 3,
  depth: 0.6,
  width: 0.6,
  profile: "pointed",
  angle: 30,
  direction: "inward",
  projection: "cylinder",
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
};

const CHOICES = {
  pattern: SURFACE_TEXTURE_PATTERNS,
  profile: SURFACE_TEXTURE_PROFILES,
  direction: SURFACE_TEXTURE_DIRECTIONS,
  projection: SURFACE_TEXTURE_PROJECTIONS,
  axis: SURFACE_TEXTURE_AXES,
  detail: SURFACE_TEXTURE_DETAILS,
} as const;

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
  const pos = [x, y, z];
  if (s.projection === "cylinder") {
    const ax = AXIS_INDEX[s.axis];
    const [i1, i2] = acrossAxes(s.axis);
    const theta = Math.atan2(pos[i2] - layout.center[1], pos[i1] - layout.center[0]);
    return patternValue(theta * layout.radius, pos[ax], s, layout);
  }
  if (s.projection === "flat") {
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
export function makeSurfaceTextureLayout(base: SurfaceBase, s: SurfaceTextureSettings, skipVertex: Uint8Array | null = null): SurfaceTextureLayout {
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
  const layout: SurfaceTextureLayout = { period: s.spacing, cell: s.spacing, around: null, angle: s.angle, center: [c1, c2], radius, rMin, rMax };
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

/* ------------------------------------------------------------------ */
/* Refining for the pattern                                            */
/* ------------------------------------------------------------------ */

/** Grooves and knurling around a cylinder or flat are cut into strips along the grooves (see sliceStripes). */
function stripesAreCut(s: SurfaceTextureSettings) {
  return (s.pattern === "grooves" || s.pattern === "knurl") && s.projection !== "allRound";
}

/** Edge length at which the pattern is cleanly resolved. */
function targetEdge(s: SurfaceTextureSettings) {
  // Honeycomb that is cut along its joints (see sliceHoneycomb) gets its detail from the cuts: the
  // grid only has to follow the body's roundness (a 1.2 mm chord on 30 mm radius: 0.006 mm).
  if (honeycombIsCut(s)) return s.spacing / 2.5;
  const narrow = s.width < 0.35 ? 0.65 : 1;
  return (s.spacing / DETAIL_STEPS[s.detail]) * narrow;
}

function honeycombIsCut(s: SurfaceTextureSettings) {
  return s.pattern === "honeycomb" && s.projection !== "allRound";
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

/**
 * Honeycomb: cut instead of refining evenly - otherwise the triangles lie at any slant to the
 * joint and their edges look jagged (flat shaded in a slicer even more). In a cell the distance
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
function sliceHoneycomb(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, steps: number, maxTriangles: number, skipBase: Uint8Array): { mesh: SurfaceMesh; reduced: boolean } {
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
  const split = (cur: SurfaceMesh, cutT: CutAt, meet: Meet | null = null): SurfaceMesh => {
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
      // Closer than SNAP (mm) to an end: the end counts as on the line - no slivers, no short edges.
      const len = Math.hypot(v[a * 3] - v[b * 3], v[a * 3 + 1] - v[b * 3 + 1], v[a * 3 + 2] - v[b * 3 + 2]);
      if (t >= 0 && t * len > SNAP && (1 - t) * len > SNAP) {
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
function refineFlanks(mesh: SurfaceMesh, s: SurfaceTextureSettings, layout: SurfaceTextureLayout, fineEdge: number, maxTriangles: number): SurfaceMesh {
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
};

export type SurfaceTextureResult = {
  /** Points in the editor's inside frame (unused points may be among them), and triangles over them. */
  vertices: Float64Array;
  indices: Uint32Array;
  stats: SurfaceTextureStats;
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
    let edge: number;
    // Grooves: the finest step across, for refining where the pattern fades in (see refineTransitions).
    let crossMax = 0;
    let raised = false;
    if (slice) {
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
    const layoutKey = JSON.stringify([s.pattern, s.spacing, s.width, s.profile, s.projection, s.axis, layout.cell, layout.period, layout.angle, layout.radius, layout.center]);
    const key = `${edge.toFixed(5)}|${smoothKey}|${maxTriangles}|${s.edgeAngle}|${s.detail}|${scale}|${layoutKey}`;
    if (cache?.key === key) return cache;
    let mesh: SurfaceMesh;
    if (slice) {
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
      mesh = subdivide(start, edge, budget, smooth.points);
      // Halving takes up to four times the triangles in one pass: when the budget stopped it half way, the grid would be
      // uneven and the pattern neither cut nor refined. Rather a little coarser all over.
      for (let tries = 0; mesh.limited && tries < 8; tries += 1) {
        edge *= 1.25;
        raised = true;
        mesh = subdivide(start, edge, budget, smooth.points);
      }
      // Carefully coarser but far under the budget: once more, finer.
      const goal = 0.6 * budget;
      if (raised && !mesh.limited && mesh.indices.length / 3 < 0.7 * goal) {
        const f = Math.sqrt(mesh.indices.length / 3 / goal);
        const again = subdivide(start, edge * f, budget, smooth.points);
        if (!again.limited) {
          mesh = again;
          edge *= f;
        }
      }
    }
    // Honeycomb (cylinder or flat): cut at cell borders and profile levels instead of refining the flanks. The preview
    // with half as many levels: each level cuts along the whole joint.
    let cellSliced = false;
    if (honeycombIsCut(s) && !mesh.limited) {
      const steps = scale > 1 ? Math.ceil(CROSS_STEPS[s.detail] / 2) : CROSS_STEPS[s.detail];
      const cut = sliceHoneycomb(mesh, s, layout, steps, maxTriangles, smooth.faces);
      if (cut.reduced) raised = true;
      mesh = { ...cut.mesh, limited: Boolean(mesh.limited || cut.mesh.indices.length / 3 > maxTriangles) };
      cellSliced = true;
    }
    if (!slice && !mesh.limited && !cellSliced) mesh = refineFlanks(mesh, s, layout, edge / 2.5, maxTriangles);
    cache = withNormals(key, mesh, edge, crossMax, raised || Boolean(mesh.limited), slice ? { smoothFace: smooth.faces } : null, s.edgeAngle);
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
    return withNormals(state.key, fine, state.edge, state.crossMax, state.limited || Boolean(fine.limited), state.slice, s.edgeAngle);
  }

  function apply(input: unknown, options: SurfaceTextureOptions = {}): SurfaceTextureResult {
    const s = normalizeSurfaceTexture(input);
    const preview = Boolean(options.preview);
    const maxTriangles = Math.max(1000, Math.round(options.maxTriangles ?? (preview ? SURFACE_TEXTURE_PREVIEW_TRIANGLES : SURFACE_TEXTURE_MAX_TRIANGLES)));
    const layout = makeSurfaceTextureLayout(base, s);
    const r = refined(s, layout, maxTriangles, preview ? 1.5 : 1);

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
        if (s.keepEdges && crease[i]) free = true;
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
      const weightKey = JSON.stringify([r.key, s.bottomFree, s.topFree, s.zoneFrom, s.zoneTo, s.keepEdges, s.edgeAngle, s.fade, s.margin, s.outside, s.inside, layout.center]);
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
    for (let i = 0; i < n; i += 1) {
      const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
      const nx = directions[i * 3], ny = directions[i * 3 + 1], nz = directions[i * 3 + 2];
      let d = 0;
      const wi = weights[i];
      if (wi > 0) {
        textured += used[i];
        const value = surfaceTextureValueAt(x, y, z, nx, ny, nz, s, layout);
        d = wi * (s.direction === "outward" ? s.depth * value : s.direction === "inward" ? -s.depth * value : s.depth * (value - 0.5));
      }
      out[i * 3] = x + nx * d;
      out[i * 3 + 1] = y + ny * d;
      out[i * 3 + 2] = z + nz * d;
    }
    // With the bottom kept smooth, nothing belongs below the bed (the slicer would cut it off, or the first layer stick
    // badly). With a patterned bottom it sinks on purpose.
    const bedClamped = s.bottomFree > 0 ? clampToBed(out, v, mesh.indices, base.min[2]) : 0;
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
      },
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
