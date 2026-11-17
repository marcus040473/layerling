import type { CrossSection, ManifoldToplevel, Mat4 } from "manifold-3d";
import { shapeToManifoldSolid } from "@/lib/editorBooleans";
import { getManifoldRuntime, type ManifoldSolid } from "@/lib/editorMeshCore";
import { numberLocale, t } from "@/lib/i18n";
import { createLocalId } from "@/lib/localIds";
import { splitShapeFromWorldPositions } from "@/lib/modelSplit";
import { canonicalizeShape, isNonSolidShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Molds and dies made from a part, the master, in one step (asked for in the Layerling User Group on Facebook):
 * - twoPart: a rigid two-part mold printed directly, for resin, plaster, wax, soap, chocolate or concrete: a block round
 *   the master, `wall` thick, parted level at `parting` % of the master's height. Cones on the lower half's parting face
 *   go into holes in the upper half (the fourth smaller, so the halves close only one way), a funnel and sprue lead in at
 *   the master's highest point, thin vents at the other high points, pry slots on the seam to get the halves apart, and
 *   clamp ears with bolt holes if asked. Both halves are laid out with the parting face up, as they print: the cavity is
 *   then open upward, the keys and the funnel need no support.
 * - box: a pour box for silicone round a printed master: a base plate with a shallow recess the master sits in and a
 *   groove the frame stands in (so it seals), and the frame `gap` away from the master, `above` mm higher than it.
 * - tray: an open one-part mold, the master's flat underside at the top, poured to the brim.
 * - die: a punch and die pair for forming, embossing or cutting thin sheet (leather, card, foil, thin aluminium): the
 *   punch is the master's outline seen from above standing on a base plate, its top edge rounded; the die is a plate with
 *   the outline as a cavity, the clearance larger all round (the material's thickness for forming, a few per cent of it for
 *   cutting, then the cavity goes through so the slug falls out), mirrored so it fits once turned over onto the punch.
 *   Guide pins on the punch's plate go into holes in the die's.
 * Warnings tell where a cast would stick (an undercut against the way it comes out) or the wall is thin. The volume of the
 * cavity (or of the silicone in a pour box) is returned in ml. Everything is worked out with Manifold, z up.
 */

export type MoldKind = "twoPart" | "box" | "tray" | "die";
export const MOLD_KINDS: readonly MoldKind[] = ["twoPart", "box", "tray", "die"];
export type MoldDieMode = "form" | "cut";
export const MOLD_DIE_MODES: readonly MoldDieMode[] = ["form", "cut"];

export type MoldOptions = {
  kind: MoldKind;
  /** twoPart and tray: the mold's wall round the cavity; box: the frame's wall. */
  wall: number;
  /** box: the room between the master and the frame, filled with silicone. */
  gap: number;
  /** twoPart: where the halves part, in % of the master's height from its bottom. */
  parting: number;
  /** twoPart: the parting found: where the master is widest and neither half has an undercut, if there is such a level. */
  autoParting: boolean;
  keys: boolean;
  keySize: number;
  keyFit: number;
  sprue: boolean;
  sprueDiameter: number;
  vents: boolean;
  ventDiameter: number;
  ears: boolean;
  boltDiameter: number;
  prySlots: boolean;
  /** tray: the floor under the cavity; box: the base plate. */
  floor: number;
  /** box: how much higher than the master the frame is. */
  above: number;
  dieMode: MoldDieMode;
  /** die: the sheet's thickness. */
  material: number;
  /** die: how high the punch stands over its plate (and how deep the die's cavity is). */
  depth: number;
  /** die: the plates' thickness. */
  base: number;
  pins: boolean;
  pinDiameter: number;
  pinFit: number;
  /** die: the radius the punch's top edge is rounded to (forming tears at a sharp edge). */
  rounding: number;
};

export const MOLD_DEFAULTS: MoldOptions = {
  kind: "twoPart", wall: 5, gap: 10, parting: 50, autoParting: true, keys: true, keySize: 8, keyFit: 0.2, sprue: true, sprueDiameter: 8, vents: true,
  ventDiameter: 2.5, ears: false, boltDiameter: 4.5, prySlots: true, floor: 3, above: 12,
  dieMode: "form", material: 1, depth: 5, base: 5, pins: true, pinDiameter: 6, pinFit: 0.25, rounding: 1,
};

/** The ranges each setting is kept to, in mm (parting in %). */
export const MOLD_LIMITS = {
  wall: [2, 20], gap: [3, 30], parting: [5, 95], keySize: [4, 20], keyFit: [0, 0.6], sprueDiameter: [4, 20], ventDiameter: [1.5, 5],
  boltDiameter: [2, 8], floor: [1.2, 10], above: [3, 40], material: [0.1, 5], depth: [1, 30], base: [3, 15], pinDiameter: [3, 10],
  pinFit: [0, 0.6], rounding: [0, 5],
} as const;
type Limited = keyof typeof MOLD_LIMITS;

/** Millilitres in a US fluid ounce. */
export const MOLD_ML_PER_US_FL_OZ = 29.5735;
/** A wall thinner than this warps or breaks under a pour, in mm. */
export const MOLD_MIN_STRONG_WALL = 3;
/** A pour box's frame stands this deep in the base's groove, with this play per side, in mm. */
const BOX_GROOVE = 2;
const BOX_GROOVE_PLAY = 0.3;
/** The recess in the base the master sits in, in mm deep, and its play. */
const BOX_SEAT = 0.6;
const BOX_SEAT_PLAY = 0.2;
/** Pry slots: this wide along the side, deep into it and tall across the seam, in mm. */
const PRY_WIDTH = 10;
const PRY_DEPTH = 3;
const PRY_TALL = 2.4;
/** Clamp ears: this wide, reaching this far out, this thick on each half, in mm. */
const EAR_WIDTH = 14;
const EAR_REACH = 12;
const EAR_THICK = 5;
/** Parts laid out beside the master this far apart, in mm. */
const LAYOUT_GAP = 15;
const SIDES = 64;

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
function flag(value: unknown, fallback: boolean) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

/** The settings kept to what is offered; anything missing or out of range takes the default or the nearest end. */
export function normalizeMoldOptions(value?: Partial<Record<keyof MoldOptions, unknown>> | null, defaults: MoldOptions = MOLD_DEFAULTS): MoldOptions {
  const raw = value ?? {};
  const kind = typeof raw.kind === "string" && (MOLD_KINDS as readonly string[]).includes(raw.kind) ? (raw.kind as MoldKind) : defaults.kind;
  const dieMode = typeof raw.dieMode === "string" && (MOLD_DIE_MODES as readonly string[]).includes(raw.dieMode) ? (raw.dieMode as MoldDieMode) : defaults.dieMode;
  const numbers = Object.fromEntries((Object.keys(MOLD_LIMITS) as Limited[]).map((key) => [key, clamp(raw[key], MOLD_LIMITS[key], defaults[key])])) as Pick<MoldOptions, Limited>;
  return {
    ...defaults,
    ...numbers,
    kind,
    dieMode,
    autoParting: flag(raw.autoParting, defaults.autoParting),
    keys: flag(raw.keys, defaults.keys),
    sprue: flag(raw.sprue, defaults.sprue),
    vents: flag(raw.vents, defaults.vents),
    ears: flag(raw.ears, defaults.ears),
    prySlots: flag(raw.prySlots, defaults.prySlots),
    pins: flag(raw.pins, defaults.pins),
  };
}

/**
 * The clearance per side between punch and die, in mm: forming and embossing need the sheet's thickness (less and the
 * sheet is squeezed and tears); cutting a few per cent of it, at least 0.05 mm, so the edges shear.
 */
export function moldDieClearance(mode: MoldDieMode, material: number) {
  return mode === "form" ? material : Math.max(0.05, Math.round(material * 0.07 * 100) / 100);
}

/** What each part is, for its name. */
export type MoldPartRole = "lower" | "upper" | "base" | "frame" | "tray" | "punch" | "die";
export type MoldWarning = "undercut" | "thinWall" | "sprueLow" | "pinsLeftOut";
export type MoldPart = { role: MoldPartRole; solid: ManifoldSolid };
export type MoldResult =
  | { parts: MoldPart[]; volume: number; warnings: MoldWarning[]; keys: number; vents: number; clearance?: number; parting?: number; partingFound?: boolean }
  | { error: "notClosed" | "tooSmall" | "empty" | "kernel"; message?: string };

const SCENE_TO_UP: Mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
const UP_TO_SCENE: Mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

function keep<T extends { delete?: () => void }>(created: { delete?: () => void }[], value: T): T {
  created.push(value);
  return value;
}

/** The points of a mesh, z up. */
function pointsOf(solid: ManifoldSolid): [number, number, number][] {
  const mesh = solid.getMesh();
  const points: [number, number, number][] = [];
  for (let index = 0; index < mesh.vertProperties.length; index += mesh.numProp) {
    points.push([mesh.vertProperties[index], mesh.vertProperties[index + 1], mesh.vertProperties[index + 2]]);
  }
  return points;
}

/**
 * Whether a cast would stick: cut at `steps` heights between `low` and `high`, each cut must fit within the next one
 * the way the cast comes out (`upward`: the cut above; else the one below). More than 1 mm² sticking out is an undercut.
 */
function hasUndercut(runtime: ManifoldToplevel, solid: ManifoldSolid, low: number, high: number, upward: boolean, created: { delete?: () => void }[]) {
  const steps = 16;
  if (high - low < 0.5) return false;
  let previous: CrossSection | null = null;
  for (let step = 0; step <= steps; step += 1) {
    const z = low + 0.15 + ((high - low - 0.3) * (upward ? step : steps - step)) / steps;
    const cut = keep(created, solid.slice(z));
    if (previous && keep(created, previous.subtract(cut)).area() > 1) return true;
    previous = cut;
  }
  void runtime;
  return false;
}

/**
 * How low a channel `r` wide coming down at (x, y) onto the master's top at `top` must reach before the master is wider
 * than it all round: stopped higher, it leaves a thin ring of the mold and a flat ceiling under it where the master's top
 * is round. Not below `floor`.
 */
function channelBottom(runtime: ManifoldToplevel, solid: ManifoldSolid, x: number, y: number, top: number, r: number, floor: number, created: { delete?: () => void }[]) {
  const circle = keep(created, keep(created, runtime.CrossSection.circle(r + 0.1, 48)).translate([x, y]));
  for (let z = top - 0.3; z > floor; z -= 0.25) {
    const cut = keep(created, solid.slice(z));
    if (keep(created, circle.subtract(cut)).area() < 0.01) return z;
  }
  return Math.max(floor, top - 0.3);
}

/** A level solid: `area` from `low` to `high`. */
function prismOf(created: { delete?: () => void }[], area: CrossSection, low: number, high: number) {
  return keep(created, keep(created, area.extrude(high - low)).translate([0, 0, low]));
}

/** A box from corner to corner. */
function block(runtime: ManifoldToplevel, created: { delete?: () => void }[], [x0, y0, z0]: number[], [x1, y1, z1]: number[]) {
  return keep(created, keep(created, runtime.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
}

/** An upright cylinder or cone round (x, y) from `low` up `height`, `r0` wide at the bottom and `r1` at the top. */
function upright(runtime: ManifoldToplevel, created: { delete?: () => void }[], x: number, y: number, low: number, height: number, r0: number, r1 = r0) {
  return keep(created, keep(created, runtime.Manifold.cylinder(height, r0, r1, SIDES)).translate([x, y, low]));
}

function unionOf(runtime: ManifoldToplevel, created: { delete?: () => void }[], parts: ManifoldSolid[]) {
  return parts.length === 1 ? parts[0] : keep(created, runtime.Manifold.union(parts));
}

/** The master's top surface seen from above: the highest point of it over each cell of a grid `cell` mm wide. */
function heightMap(solid: ManifoldSolid, cell: number) {
  const mesh = solid.getMesh();
  const heights = new Map<string, number>();
  const put = (i: number, j: number, z: number) => {
    const key = `${i},${j}`;
    const current = heights.get(key);
    if (current === undefined || z > current) heights.set(key, z);
  };
  const at = (index: number) => {
    const offset = mesh.triVerts[index] * mesh.numProp;
    return [mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]];
  };
  for (let index = 0; index < mesh.triVerts.length; index += 3) {
    const [a, b, c] = [at(index), at(index + 1), at(index + 2)];
    for (const point of [a, b, c]) put(Math.floor(point[0] / cell), Math.floor(point[1] / cell), point[2]);
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    const i0 = Math.floor(Math.min(a[0], b[0], c[0]) / cell);
    const i1 = Math.floor(Math.max(a[0], b[0], c[0]) / cell);
    const j0 = Math.floor(Math.min(a[1], b[1], c[1]) / cell);
    const j1 = Math.floor(Math.max(a[1], b[1], c[1]) / cell);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        const u = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area;
        const v = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
        const w = 1 - u - v;
        if (u >= -1e-9 && v >= -1e-9 && w >= -1e-9) put(i, j, u * a[2] + v * b[2] + w * c[2]);
      }
    }
  }
  return heights;
}

/**
 * Where air is trapped under the mold's ceiling, as (x, y, z), the highest first: the level patches of the master's top
 * surface (within 0.2 mm) that nothing higher touches, each at the middle of its patch. A patch over `above` only.
 */
function airTraps(solid: ManifoldSolid, cell: number, above: number) {
  const heights = heightMap(solid, cell);
  const seen = new Set<string>();
  const traps: [number, number, number][] = [];
  const order = [...heights.entries()].sort((a, b) => b[1] - a[1]);
  for (const [start, level] of order) {
    if (seen.has(start) || level <= above) continue;
    const patch: string[] = [start];
    const inPatch = new Set(patch);
    seen.add(start);
    let trapped = true;
    for (let index = 0; index < patch.length; index += 1) {
      const [i, j] = patch[index].split(",").map(Number);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          const key = `${i + di},${j + dj}`;
          const z = heights.get(key);
          if (z === undefined || inPatch.has(key)) continue;
          if (z > level + 0.2) trapped = false;
          else if (z >= level - 0.2 && !seen.has(key)) {
            seen.add(key);
            inPatch.add(key);
            patch.push(key);
          }
        }
      }
    }
    if (!trapped) continue;
    const cells = patch.map((key) => key.split(",").map(Number));
    const mx = cells.reduce((sum, [i]) => sum + i, 0) / cells.length;
    const my = cells.reduce((sum, [, j]) => sum + j, 0) / cells.length;
    // The patch's cell nearest its middle, so the vent stands on it even when the patch is a ring.
    const [i, j] = cells.reduce((best, here) => (Math.hypot(here[0] - mx, here[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? here : best));
    traps.push([(i + 0.5) * cell, (j + 0.5) * cell, heights.get(`${i},${j}`) ?? level]);
  }
  return traps;
}

/** Where the master is highest: of its points within 0.2 mm of its top the one nearest their middle. */
function topSpot(points: [number, number, number][]) {
  // A loop, not Math.max(...): a fine master has hundreds of thousands of points, more than a call takes arguments.
  let top = Number.NEGATIVE_INFINITY;
  for (const point of points) if (point[2] > top) top = point[2];
  const near = points.filter((point) => point[2] >= top - 0.2);
  const mx = near.reduce((sum, point) => sum + point[0], 0) / near.length;
  const my = near.reduce((sum, point) => sum + point[1], 0) / near.length;
  // On the master itself: the middle of a ring (a torus lying flat) is not.
  const [x, y, z] = near.reduce((best, point) => (Math.hypot(point[0] - mx, point[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? point : best));
  return { x, y, z };
}

/**
 * The mold or die for `body` (in the scene's frame, y up). The parts come back in the scene's frame, laid out beside the
 * body on the workplane as they print; the body itself is not changed.
 */
export function moldForSolid(runtime: ManifoldToplevel, body: ManifoldSolid, given: MoldOptions, layout = true): MoldResult {
  const created: { delete?: () => void }[] = [];
  const handed = new Set<unknown>();
  try {
    const options = normalizeMoldOptions(given);
    const master = keep(created, body.transform(SCENE_TO_UP));
    if (master.status() !== "NoError" || master.isEmpty()) return { error: "notClosed" };
    const box = master.boundingBox();
    const [bx0, by0, bz0] = box.min;
    const [bx1, by1, bz1] = box.max;
    const height = bz1 - bz0;
    if (bx1 - bx0 < 1 || by1 - by0 < 1 || height < 0.5) return { error: "tooSmall" };
    const centre: [number, number] = [(bx0 + bx1) / 2, (by0 + by1) / 2];
    const warnings: MoldWarning[] = [];
    const parts: { role: MoldPartRole; solid: ManifoldSolid }[] = [];
    let volume = master.volume() / 1000;
    let keyCount = 0;
    let ventCount = 0;
    let clearance: number | undefined;
    let parting: number | undefined;
    let partingFound: boolean | undefined;

    if (options.kind === "twoPart") {
      const w = options.wall;
      if (w < MOLD_MIN_STRONG_WALL) warnings.push("thinWall");
      // Round the cavity the wall; on the sides room for the keys too.
      const m = Math.max(w, options.keys ? options.keySize + 4 : 0);
      const lo = [bx0 - m, by0 - m, bz0 - w];
      const hi = [bx1 + m, by1 + m, bz1 + w];
      // The parting asked for, or found: of the levels 2.5 % apart those where neither half has an undercut, the one
      // where the master is widest (of equally wide ones the nearest the middle); if every level has one, the widest.
      let zp = bz0 + (height * options.parting) / 100;
      let found: boolean | undefined;
      if (options.autoParting) {
        // The bottom and the top too: a cone parts at its base, the lower half then only a plate with the keys.
        const levels = Array.from({ length: 41 }, (_, index) => bz0 + (height * index * 2.5) / 100);
        const rated = levels.map((z) => ({ z, area: keep(created, master.slice(Math.min(bz1 - 0.05, Math.max(bz0 + 0.05, z)))).area() }));
        // Within 1 % of each other counts as equally wide: a prism parts in its middle, not where the mesh happens to be wider.
        const widest = Math.max(...rated.map((level) => level.area), 1e-9);
        const width = (area: number) => Math.round((area / widest) * 100);
        const order = [...rated].sort((a, b) => width(b.area) - width(a.area) || Math.abs(a.z - (bz0 + bz1) / 2) - Math.abs(b.z - (bz0 + bz1) / 2));
        const free = order.find(({ z }) => !hasUndercut(runtime, master, bz0, z, true, created) && !hasUndercut(runtime, master, z, bz1, false, created));
        // A free level much narrower than the widest is still better than one where the cast sticks.
        zp = (free ?? order[0]).z;
        found = Boolean(free);
      }
      parting = Math.round(((zp - bz0) / height) * 1000) / 10;
      // Never level with the master's bottom or top: the cut there leaves a film of no thickness over the cavity.
      zp = Math.min(bz1 - 0.02, Math.max(bz0 + 0.02, zp));
      partingFound = found;
      const whole = block(runtime, created, lo, hi);
      let lower = keep(created, keep(created, whole.trimByPlane([0, 0, -1], -zp)).subtract(master));
      let upper = keep(created, keep(created, whole.trimByPlane([0, 0, 1], zp)).subtract(master));
      if (options.keys) {
        // Cones at 45 degrees on the lower half, one in each corner of the band round the cavity, the fourth smaller.
        const r = options.keySize / 2;
        const corners: [number, number, number][] = [[lo[0] + m / 2, lo[1] + m / 2, r], [hi[0] - m / 2, lo[1] + m / 2, r], [hi[0] - m / 2, hi[1] - m / 2, r], [lo[0] + m / 2, hi[1] - m / 2, r * 0.6]];
        const cones = corners.map(([x, y, radius]) => upright(runtime, created, x, y, zp - 0.01, radius + 0.01, radius, 0));
        const holes = corners.map(([x, y, radius]) => upright(runtime, created, x, y, zp - 0.01, radius + options.keyFit * Math.SQRT2 + 0.01, radius + options.keyFit, 0));
        lower = keep(created, lower.add(unionOf(runtime, created, cones)));
        upper = keep(created, upper.subtract(unionOf(runtime, created, holes)));
        keyCount = corners.length;
      }
      const points = pointsOf(master);
      if (options.sprue) {
        // The sprue from the top down to the master's highest point, widening at 45 degrees into a funnel at the top.
        const spot = topSpot(points);
        if (spot.z <= zp + 0.5) warnings.push("sprueLow");
        const r = options.sprueDiameter / 2;
        const room = hi[2] - spot.z - 0.5;
        const funnel = Math.max(0, Math.min(Math.max(r + 3, 10) - r, room));
        const sprueLow = channelBottom(runtime, master, spot.x, spot.y, spot.z, r, zp, created);
        const sprue = upright(runtime, created, spot.x, spot.y, sprueLow, hi[2] - sprueLow + 1, r);
        const mouth = funnel > 0.2 ? upright(runtime, created, spot.x, spot.y, hi[2] - funnel, funnel + 0.01, r, r + funnel) : null;
        upper = keep(created, upper.subtract(mouth ? keep(created, sprue.add(mouth)) : sprue));
        if (options.vents) {
          // A vent up from each peak over the parting away from the sprue, so the air trapped there gets out; it ends at
          // the top, as high as the funnel.
          const chosen: [number, number, number][] = [];
          const cell = Math.max(1, Math.min(4, Math.max(bx1 - bx0, by1 - by0) / 60));
          for (const peak of airTraps(master, cell, zp + 1)) {
            const [x, y] = peak;
            const room = r + options.ventDiameter * 2;
            if (Math.hypot(x - spot.x, y - spot.y) > room && chosen.every(([cx, cy]) => Math.hypot(x - cx, y - cy) > options.ventDiameter * 3)) chosen.push(peak);
            if (chosen.length >= 8) break;
          }
          const vents = chosen
            .map(([x, y, z]) => {
              const low = channelBottom(runtime, master, x, y, z, options.ventDiameter / 2, zp, created);
              return upright(runtime, created, x, y, low, hi[2] - low + 1, options.ventDiameter / 2);
            });
          if (vents.length) upper = keep(created, upper.subtract(unionOf(runtime, created, vents)));
          ventCount = vents.length;
        }
      }
      if (options.prySlots) {
        // A notch across the seam in the middle of the front and the back, for a screwdriver to part the halves.
        const deep = Math.min(PRY_DEPTH, m - 1);
        if (deep > 0.5) {
          const slots = [lo[1] - 1, hi[1] - deep].map((y0) => block(runtime, created, [centre[0] - PRY_WIDTH / 2, y0, zp - PRY_TALL / 2], [centre[0] + PRY_WIDTH / 2, y0 + deep + 1, zp + PRY_TALL / 2]));
          const slot = unionOf(runtime, created, slots);
          lower = keep(created, lower.subtract(slot));
          upper = keep(created, upper.subtract(slot));
        }
      }
      if (options.ears) {
        // An ear on the left and the right on each half at the seam, with a hole for a bolt through both; on its outer
        // side a 45 degree slope back to the wall, so each half prints standing on its outside without support.
        const bolt = options.boltDiameter / 2;
        for (const side of [-1, 1]) {
          const face = side < 0 ? lo[0] : hi[0];
          const out = face + side * EAR_REACH;
          const xs = [Math.min(face, out), Math.max(face, out)];
          const ys = [centre[1] - EAR_WIDTH / 2, centre[1] + EAR_WIDTH / 2];
          const hole = upright(runtime, created, (face + out) / 2 + side * 1, centre[1], lo[2] - 1, hi[2] - lo[2] + 2, bolt);
          // The strip of the wall the ear's slope runs down to (up to, on the upper half), 0.5 mm into the wall.
          const strip = [Math.min(face, face - side * 0.5), Math.max(face, face - side * 0.5)];
          const lowEar = keep(created, runtime.Manifold.hull([
            block(runtime, created, [xs[0], ys[0], zp - EAR_THICK], [xs[1], ys[1], zp]),
            block(runtime, created, [strip[0], ys[0], Math.max(lo[2], zp - EAR_THICK - EAR_REACH)], [strip[1], ys[1], zp]),
          ]));
          const highEar = keep(created, runtime.Manifold.hull([
            block(runtime, created, [xs[0], ys[0], zp], [xs[1], ys[1], zp + EAR_THICK]),
            block(runtime, created, [strip[0], ys[0], zp], [strip[1], ys[1], Math.min(hi[2], zp + EAR_THICK + EAR_REACH)]),
          ]));
          lower = keep(created, keep(created, lower.add(lowEar)).subtract(hole));
          upper = keep(created, keep(created, upper.add(highEar)).subtract(hole));
        }
      }
      // The cast comes up out of the lower half and down out of the upper one.
      if (hasUndercut(runtime, master, bz0, Math.min(zp, bz1), true, created) || hasUndercut(runtime, master, Math.max(zp, bz0), bz1, false, created)) warnings.push("undercut");
      parts.push({ role: "lower", solid: lower }, { role: "upper", solid: upper });
    } else if (options.kind === "box") {
      const g = options.gap;
      const w = options.wall;
      const f = options.floor;
      const inner = [bx0 - g, by0 - g, bx1 + g, by1 + g];
      const outer = [inner[0] - w, inner[1] - w, inner[2] + w, inner[3] + w];
      const top = bz1 + options.above;
      // The base: a plate a little wider than the frame, the groove the frame stands in, and a shallow seat for the master.
      let base = block(runtime, created, [outer[0] - 3, outer[1] - 3, bz0 - f - BOX_GROOVE], [outer[2] + 3, outer[3] + 3, bz0]);
      const groove = keep(created, block(runtime, created, [outer[0] - BOX_GROOVE_PLAY, outer[1] - BOX_GROOVE_PLAY, bz0 - BOX_GROOVE], [outer[2] + BOX_GROOVE_PLAY, outer[3] + BOX_GROOVE_PLAY, bz0 + 1])
        .subtract(block(runtime, created, [inner[0] + BOX_GROOVE_PLAY, inner[1] + BOX_GROOVE_PLAY, bz0 - BOX_GROOVE - 1], [inner[2] - BOX_GROOVE_PLAY, inner[3] - BOX_GROOVE_PLAY, bz0 + 2])));
      base = keep(created, base.subtract(groove));
      const footprint = keep(created, master.slice(bz0 + Math.min(0.3, height / 4)));
      if (footprint.area() > 1) base = keep(created, base.subtract(prismOf(created, keep(created, footprint.offset(BOX_SEAT_PLAY, "Round", 2, 48)), bz0 - BOX_SEAT, bz0 + 1)));
      const frame = keep(created, block(runtime, created, [outer[0], outer[1], bz0 - BOX_GROOVE], [outer[2], outer[3], top])
        .subtract(block(runtime, created, [inner[0], inner[1], bz0 - BOX_GROOVE - 1], [inner[2], inner[3], top + 1])));
      // The silicone: the inside of the frame up to its top less the master.
      volume = ((inner[2] - inner[0]) * (inner[3] - inner[1]) * (top - bz0) - master.volume()) / 1000;
      parts.push({ role: "base", solid: base }, { role: "frame", solid: frame });
    } else if (options.kind === "tray") {
      const w = options.wall;
      if (w < MOLD_MIN_STRONG_WALL) warnings.push("thinWall");
      // The master turned over about the left-right axis through its middle: its underside becomes the open top, and a
      // cast turned back over is the master again (not its mirror image).
      const turned = keep(created, keep(created, keep(created, master.translate([-centre[0], -centre[1], -(bz0 + bz1) / 2])).rotate([180, 0, 0])).translate([centre[0], centre[1], (bz0 + bz1) / 2]));
      const tray = keep(created, block(runtime, created, [bx0 - w, by0 - w, bz0 - options.floor], [bx1 + w, by1 + w, bz1]).subtract(turned));
      if (hasUndercut(runtime, turned, bz0, bz1, true, created)) warnings.push("undercut");
      parts.push({ role: "tray", solid: tray });
    } else {
      // The die: the outline seen from above.
      const outline = keep(created, master.project());
      if (outline.area() < 1) return { error: "tooSmall" };
      const c = moldDieClearance(options.dieMode, options.material);
      clearance = c;
      const h = options.depth;
      const b = options.base;
      const r = options.dieMode === "cut" ? 0 : Math.min(options.rounding, h);
      const pinRoom = options.pins ? options.pinDiameter * 1.5 + 2 : 0;
      const margin = 8 + pinRoom;
      const plate = [bx0 - margin, by0 - margin, bx1 + margin, by1 + margin];
      const plateArea = keep(created, runtime.CrossSection.square([plate[2] - plate[0], plate[3] - plate[1]]).translate([plate[0], plate[1]]));
      // The punch: the outline standing on its plate, its top edge rounded in steps along a quarter circle.
      const punchParts: ManifoldSolid[] = [prismOf(created, plateArea, 0, b), prismOf(created, outline, b - 0.01, b + h - r)];
      const steps = r > 0 ? 6 : 0;
      for (let step = 0; step < steps; step += 1) {
        const z0 = (r * step) / steps;
        const z1 = (r * (step + 1)) / steps;
        const inset = r - Math.sqrt(Math.max(0, r * r - z1 * z1));
        const layer = keep(created, outline.offset(-inset, "Round", 2, 48));
        if (layer.area() < 0.01) break;
        punchParts.push(prismOf(created, layer, b + h - r + z0 - 0.001, b + h - r + z1));
      }
      let punch = unionOf(runtime, created, punchParts);
      // The die's cavity: the outline grown by the clearance and mirrored front to back about the plate's middle, so it
      // fits once the die is turned over onto the punch; its rim chamfered a little at 45 degrees (forming), or straight
      // through (cutting, so the slug falls out).
      const middleY = (plate[1] + plate[3]) / 2;
      const mirrored = keep(created, keep(created, outline.mirror([0, 1])).translate([0, 2 * middleY]));
      const hollow = keep(created, mirrored.offset(c, "Round", 2, 48));
      const cavityParts: ManifoldSolid[] = [prismOf(created, hollow, options.dieMode === "cut" ? -1 : b, b + h + 1)];
      const chamfer = options.dieMode === "cut" ? 0 : Math.min(1, r, h / 3);
      for (let step = 1; step <= 3 && chamfer > 0; step += 1) {
        const grow = (chamfer * step) / 3;
        cavityParts.push(prismOf(created, keep(created, mirrored.offset(c + grow, "Round", 2, 48)), b + h - chamfer + grow - chamfer / 3, b + h + 1));
      }
      let die = keep(created, prismOf(created, plateArea, 0, b + h).subtract(unionOf(runtime, created, cavityParts)));
      if (options.pins) {
        // A pin in each corner of the punch's plate, standing over the punch, and a hole through the die for it.
        const pr = options.pinDiameter / 2;
        const inset = pinRoom / 2 + 1;
        const corners: [number, number][] = [[plate[0] + inset, plate[1] + inset], [plate[2] - inset, plate[1] + inset], [plate[2] - inset, plate[3] - inset], [plate[0] + inset, plate[3] - inset]];
        // Only where the pin stays clear of the outline and its cavity.
        const clear = corners.filter(([x, y]) => keep(created, keep(created, runtime.CrossSection.circle(pr + options.pinFit + 1, 32).translate([x, y])).intersect(keep(created, outline.offset(c + 1, "Round", 2, 48)))).area() < 1e-3
          && keep(created, keep(created, runtime.CrossSection.circle(pr + options.pinFit + 1, 32).translate([x, y])).intersect(hollow)).area() < 1e-3);
        if (clear.length < corners.length) warnings.push("pinsLeftOut");
        if (clear.length) {
          punch = keep(created, punch.add(unionOf(runtime, created, clear.map(([x, y]) => upright(runtime, created, x, y, b - 0.01, h + 4, pr)))));
          die = keep(created, die.subtract(unionOf(runtime, created, clear.map(([x, y]) => upright(runtime, created, x, 2 * middleY - y, -1, b + h + 2, pr + options.pinFit)))));
        }
      }
      volume = 0;
      parts.push({ role: "punch", solid: punch }, { role: "die", solid: die });
    }

    // Laid out beside the master, left to right, standing on the workplane as they print (the upper half turned over,
    // its parting face up). Left where they are, as they close round the master, for the tests (`layout` false).
    let x = bx1 + LAYOUT_GAP;
    const placed: MoldPart[] = parts.map(({ role, solid: made }) => {
      if (!layout) {
        const scene = made.transform(UP_TO_SCENE);
        handed.add(scene);
        return { role, solid: scene };
      }
      const solid = role === "upper" ? keep(created, made.rotate([180, 0, 0])) : made;
      if (solid.isEmpty()) return { role, solid };
      const own = solid.boundingBox();
      const moved = keep(created, solid.translate([x - own.min[0], centre[1] - (own.min[1] + own.max[1]) / 2, -own.min[2]]));
      x += own.max[0] - own.min[0] + LAYOUT_GAP;
      const scene = moved.transform(UP_TO_SCENE);
      handed.add(scene);
      return { role, solid: scene };
    });
    if (placed.some(({ solid }) => solid.isEmpty() || solid.status() !== "NoError")) return { error: "empty" };
    return {
      parts: placed, volume: Math.max(0, volume), warnings, keys: keyCount, vents: ventCount, ...(clearance !== undefined ? { clearance } : {}),
      ...(parting !== undefined ? { parting } : {}), ...(partingFound !== undefined ? { partingFound } : {}),
    };
  } catch (error) {
    return { error: "kernel", message: error instanceof Error ? error.message : String(error ?? "") };
  } finally {
    Array.from(new Set(created)).forEach((value) => {
      if (!handed.has(value)) value.delete?.();
    });
  }
}

/** The name of a part made from the master `name`. */
export function moldPartName(role: MoldPartRole, name: string) {
  return t(`mold.part.${role}`, { name });
}

/** The message for why no mold could be made. */
export function moldErrorMessage(error: "notClosed" | "tooSmall" | "empty" | "kernel", message?: string) {
  if (error === "kernel") return t("mold.error.kernel", { message: message ?? "" });
  return t(`mold.error.${error}`);
}

/** The warnings in words, and the volume, as the status line says them. */
export function moldNotes(result: Extract<MoldResult, { parts: unknown }>, kind: MoldKind) {
  const notes: string[] = [];
  // In ml and in US fluid ounces, the unit resin and silicone are sold by in the US.
  if (kind !== "die") notes.push(t(kind === "box" ? "mold.note.silicone" : "mold.note.volume", {
    ml: (Math.round(result.volume * 10) / 10).toLocaleString(numberLocale()),
    oz: (Math.round((result.volume / MOLD_ML_PER_US_FL_OZ) * 100) / 100).toLocaleString(numberLocale()),
  }));
  if (result.parting !== undefined) notes.push(t(result.partingFound ? "mold.note.partingFound" : "mold.note.parting", { percent: result.parting.toLocaleString(numberLocale()) }));
  if (result.clearance !== undefined) notes.push(t("mold.note.clearance", { mm: result.clearance.toLocaleString(numberLocale()) }));
  for (const warning of result.warnings) notes.push(t(`mold.warning.${warning}`));
  return notes;
}

export type MoldShapeResult = { parts: WorkplaneShape[]; notes: string[] } | { parts: null; error: string };

/** The master's solid from the shapes: the bodies joined, the holes among them taken off. */
function masterOf(runtime: ManifoldToplevel, targets: readonly WorkplaneShape[], created: ManifoldSolid[]) {
  const solids = targets.filter((shape) => !shape.hole && !isNonSolidShape(shape));
  const holes = targets.filter((shape) => shape.hole);
  const ok = (part: ManifoldSolid | null): part is ManifoldSolid => Boolean(part && part.status() === "NoError" && part.numTri() > 0);
  const built = solids.map((shape) => shapeToManifoldSolid(runtime, shape, created));
  const cutters = holes.map((shape) => shapeToManifoldSolid(runtime, shape, created));
  if (!built.length || !built.every(ok) || !cutters.every(ok)) return null;
  let body = built.length === 1 ? built[0] : runtime.Manifold.union(built as ManifoldSolid[]);
  created.push(body);
  if (cutters.length) {
    const together = runtime.Manifold.union(cutters as ManifoldSolid[]);
    created.push(together);
    body = body.subtract(together);
    created.push(body);
  }
  return body;
}

/** The mold or die for the selected shapes, as new bodies beside them; the shapes stay as they are. */
export async function moldForShapes(targets: readonly WorkplaneShape[], given: MoldOptions): Promise<MoldShapeResult> {
  const solids = targets.filter((shape) => !shape.hole && !isNonSolidShape(shape));
  if (!solids.length) return { parts: null, error: t("mold.error.needsBody") };
  const created: ManifoldSolid[] = [];
  try {
    const runtime = await getManifoldRuntime();
    const master = masterOf(runtime, targets, created);
    if (!master) return { parts: null, error: moldErrorMessage("notClosed") };
    const options = normalizeMoldOptions(given);
    const result = moldForSolid(runtime, master, options);
    if ("error" in result) return { parts: null, error: moldErrorMessage(result.error, result.message) };
    created.push(...result.parts.map((part) => part.solid));
    const source = solids[0];
    const shapes: WorkplaneShape[] = [];
    for (const part of result.parts) {
      const mesh = part.solid.getMesh();
      const positions: number[] = [];
      for (let index = 0; index < mesh.triVerts.length; index += 1) {
        const offset = mesh.triVerts[index] * mesh.numProp;
        positions.push(mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]);
      }
      const shape = splitShapeFromWorldPositions(source, positions, createLocalId(`${source.id}-mold-${part.role}`), moldPartName(part.role, source.name));
      if (!shape) return { parts: null, error: moldErrorMessage("empty") };
      shapes.push(canonicalizeShape({ ...shape, hidden: false, hole: false, locked: false }));
    }
    return { parts: shapes, notes: moldNotes(result, options.kind) };
  } catch (error) {
    return { parts: null, error: moldErrorMessage("kernel", error instanceof Error ? error.message : String(error ?? "")) };
  } finally {
    Array.from(new Set(created)).forEach((value) => value.delete?.());
  }
}
