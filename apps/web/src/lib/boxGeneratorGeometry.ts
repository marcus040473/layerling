import * as THREE from "three";
import type { WorkplaneShape } from "@/types/layerling";
import { GRIDFINITY_BASEPLATE_HEIGHT, GRIDFINITY_BASEPLATE_RADIUS, GRIDFINITY_DRAWER_CLEARANCE, GRIDFINITY_FLOOR, GRIDFINITY_GRID, MAX_GRIDFINITY_LARGE_PLATE_UNITS, gridfinityCutSockets, gridfinityOutlineCells, manifoldOfTriangles, trianglesOfManifold } from "@/lib/gridfinityGeometry";
import { loadedManifoldRuntime, requestManifoldRuntime } from "@/lib/manifoldHandle";
import type { ManifoldToplevel } from "manifold-3d";

/*
 * The box generator: one parametric shape for a box and its lid, from a few settings instead of a fixed template.
 * Only the settings are stored; the body is rebuilt from them each time, so the same settings always give the same
 * solid.
 *
 * Seen from above the outline is one of three convex shapes: a rectangle (corners rounded by a radius), an ellipse
 * (a circle when width and depth are equal) or a regular polygon fitted into the width and depth. Because every
 * outline is convex, the wall can be made by pulling each edge inwards and keeping what is left (insetConvex), and a
 * compartment is the inner outline cut by a grid cell. No boolean kernel is needed, so the mesh is built at once and
 * is closed and consistently oriented by construction: the outside, the floor of every compartment and the walls
 * between them are each their own face set that share edges and nothing else.
 *
 * Part "box" is the open box: a floor, a wall all round and, if columns or rows are more than one, fixed dividers that
 * are one piece with the wall and floor. With the dividers set by hand (boxDividerMode "manual") the grid of columns and
 * rows gives way to a list of walls, each one running along the width or the depth, placed anywhere and as long as it is
 * asked to be: from wall to wall, from a wall to somewhere inside, or standing free. Part "insert" is the dividers as a
 * loose piece: a thin plate the size of the box's inside less the play, with the dividers standing on it, for a box that
 * is smooth inside (boxInsert). Its dividers are measured as the box's are, from the inside of the box, which lies the
 * play outside the insert all round. Part "lid" is the lid, printed top side down: a plate, and for the style
 * "overlap" a skirt that goes down over the outside of the box, for "plug" a ring that stands up from the plate and fits
 * inside the box. Both parts take the same settings, so a box and its lid
 * are two copies of the shape with another part. The width and depth are always those of the part itself; for an
 * overlapping lid boxGeneratorMatchingLidSize gives the size that fits a box.
 *
 * The wall of an ellipse is not exactly even where width and depth differ, as the inside is cut from facets of the
 * outline, not from a true parallel curve; the difference stays under a tenth of a millimetre for ordinary boxes.
 */

export type BoxGeneratorShape = "rectangle" | "round" | "polygon";
export type BoxGeneratorPart = "box" | "lid" | "insert";
export type BoxGeneratorLidStyle = "restOn" | "overlap" | "plug";
export type BoxGeneratorDividerMode = "grid" | "manual";
/**
 * A divider set by hand. `dir` "x" is a wall that runs along the width (left to right), "z" one that runs along the depth
 * (back to front). All measures are in mm from the inside of the box, from its left and its back: `at` to the middle of
 * the wall across its run, `from` and `to` where it begins and ends along its run. For a round or many-sided box the
 * inside is measured at its widest and deepest, and the wall ends where it meets the box's wall.
 *
 * A wall can stand at a slant: `slant` is how many mm its end lies further across than its beginning (further to the
 * front for "x", further to the right for "z", negative the other way), so it runs from (from, at) to (to, at + slant).
 * Unset or 0 the wall is straight. The thickness of a slanted wall is measured square to it, as of a straight one.
 */
export type BoxGeneratorWall = { dir: "x" | "z"; at: number; from: number; to: number; slant?: number };

export const DEFAULT_BOX_GENERATOR_WIDTH = 126;
export const DEFAULT_BOX_GENERATOR_DEPTH = 90;
export const DEFAULT_BOX_GENERATOR_HEIGHT = 48;
export const DEFAULT_BOX_GENERATOR_WALL = 2.4;
export const DEFAULT_BOX_GENERATOR_FLOOR = 2.4;
export const DEFAULT_BOX_GENERATOR_CORNER_RADIUS = 3;
export const DEFAULT_BOX_GENERATOR_SIDES = 6;
export const DEFAULT_BOX_GENERATOR_DIVIDER = 1.6;
export const DEFAULT_BOX_GENERATOR_LID_PLATE = 2.4;
export const DEFAULT_BOX_GENERATOR_FIT = 0.3;
/** The plate an insert's dividers stand on, in mm, when it is made for a box. */
export const DEFAULT_BOX_GENERATOR_INSERT_FLOOR = 0.8;
export const MIN_BOX_GENERATOR_WALL = 0.4;
export const MIN_BOX_GENERATOR_SIDES = 3;
export const MAX_BOX_GENERATOR_SIDES = 12;
export type BoxGeneratorScoopSide = "front" | "back" | "left" | "right";
/**
 * A finger scoop: the floor of one compartment runs up into one of its sides in a quarter round, so small parts can be
 * pushed up and out with a finger. `x` and `z` are a point in the compartment, in mm from the left and the back of the
 * inside; the scoop belongs to whichever compartment holds that point, however the walls are moved.
 */
export type BoxGeneratorScoop = { x: number; z: number; side: BoxGeneratorScoopSide };
export const DEFAULT_BOX_GENERATOR_SCOOP_RADIUS = 12;
export const MIN_BOX_GENERATOR_SCOOP_RADIUS = 2;
export const MAX_BOX_GENERATOR_SCOOP_RADIUS = 60;
export const MAX_BOX_GENERATOR_SCOOPS = 60;
const SCOOP_SEGMENTS = 16;
/**
 * A shaped pocket: the box is filled solid above its floor (boxPocketFill mm high) and the outline of a part is cut into
 * that filling, `depth` mm deep from its top, so the part lies in a pocket of its own shape. `points` are the outline in
 * mm from the left and the back of the inside of the box.
 */
export type BoxGeneratorPocket = { points: { x: number; z: number }[]; depth: number };
export const MAX_BOX_GENERATOR_POCKETS = 12;
export const MAX_BOX_GENERATOR_POCKET_POINTS = 400;
/** The least filling left between a pocket and the box's wall, in mm: two lines of a 0.4 mm nozzle. */
const POCKET_WALL_GAP = 0.8;
export const MAX_BOX_GENERATOR_COMPARTMENTS = 12;
/** The most dividers set by hand that one box takes. */
export const MAX_BOX_GENERATOR_WALLS = 40;
/** The shortest a divider set by hand may be, in mm; a shorter one is left out. */
export const MIN_BOX_GENERATOR_WALL_LENGTH = 1;
export const MAX_BOX_GENERATOR_FIT = 2;
/** Gridfinity cells across or along that the settings take, the largest baseplate Layerling makes. */
export const MAX_BOX_GENERATOR_GRIDFINITY_CELLS = 12;
export const DEFAULT_BOX_GENERATOR_STACK_HEIGHT = 3;
export const MIN_BOX_GENERATOR_STACK_HEIGHT = 1;
export const MAX_BOX_GENERATOR_STACK_HEIGHT = 10;
/** The thinnest a stacking collar or skirt may be, in mm: a thinner one is not printed as a wall. */
const MIN_STACK_RING = 0.4;
/**
 * How much deeper the groove under the wall is than the collar is high, in mm. The box then always stands on its foot and
 * the step, never on the collar's top, even where the groove's ceiling or corners print a little rough.
 */
export const STACK_GROOVE_EXTRA = 1;
/** The least width a compartment may have; a narrower cell stays solid. */
const MIN_COMPARTMENT_SPAN = 2;
const ROUND_SEGMENTS = 72;
const CORNER_SEGMENTS = 8;

export type BoxGeneratorFields = {
  boxShape?: BoxGeneratorShape;
  boxSides?: number;
  boxCornerRadius?: number;
  boxWall?: number;
  boxFloor?: number;
  boxColumns?: number;
  boxRows?: number;
  boxDivider?: number;
  boxDividerMode?: BoxGeneratorDividerMode;
  boxWalls?: BoxGeneratorWall[];
  boxScoops?: BoxGeneratorScoop[];
  boxScoopRadius?: number;
  boxPockets?: BoxGeneratorPocket[];
  /** How high the box is filled above its floor when it has shaped pockets, in mm; unset or more than fits: up to the rim. */
  boxPocketFill?: number;
  /** The box's dividers are a loose insert (part "insert"): the box itself is drawn without them, smooth inside. */
  boxInsert?: boolean;
  boxPart?: BoxGeneratorPart;
  boxLidStyle?: BoxGeneratorLidStyle;
  boxLidPlate?: number;
  boxFit?: number;
  /** A plug lid of a box with dividers reaches into every compartment (unset or true), or has one ring as for a box without (false). */
  boxLidCompartments?: boolean;
  boxGridfinity?: boolean;
  boxGridfinityColumns?: number;
  boxGridfinityRows?: number;
  boxGridfinityFloor?: boolean;
  boxGridfinityPlate?: boolean;
  boxStackable?: boolean;
  boxStackHeight?: number;
};

export type BoxGeneratorSize = { width: number; depth: number; height: number };

export type BoxGeneratorIssue =
  | { code: "wallTooThick" }
  | { code: "compartmentSolid"; count: number }
  | { code: "lidNoSkirt" }
  | { code: "stackWallThin" }
  | { code: "plateTooLow" }
  | { code: "plateNoCell" }
  | { code: "stackTooLow" };

type Point = { x: number; z: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeBoxGeneratorShape(value: unknown): BoxGeneratorShape {
  return value === "round" || value === "polygon" ? value : "rectangle";
}

export function normalizeBoxGeneratorPart(value: unknown): BoxGeneratorPart {
  return value === "lid" || value === "insert" ? value : "box";
}

export function normalizeBoxGeneratorLidStyle(value: unknown): BoxGeneratorLidStyle {
  return value === "overlap" || value === "plug" ? value : "restOn";
}

export function normalizeBoxGeneratorDividerMode(value: unknown): BoxGeneratorDividerMode {
  return value === "manual" ? "manual" : "grid";
}

/**
 * The dividers set by hand as a clean list: only walls with a direction and finite measures, none below zero, each one's
 * beginning before its end, at most MAX_BOX_GENERATOR_WALLS. Where a wall lies beyond the inside of the box is settled when
 * the box is built (boxGeneratorPlan), since that depends on its size.
 */
export function normalizeBoxGeneratorWalls(value: unknown): BoxGeneratorWall[] {
  if (!Array.isArray(value)) return [];
  const walls: BoxGeneratorWall[] = [];
  for (const entry of value) {
    if (walls.length >= MAX_BOX_GENERATOR_WALLS) break;
    if (!entry || typeof entry !== "object") continue;
    const wall = entry as Partial<BoxGeneratorWall>;
    if (wall.dir !== "x" && wall.dir !== "z") continue;
    if (![wall.at, wall.from, wall.to].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const measure = (n: number) => Math.round(clamp(n, 0, 1e4) * 1000) / 1000;
    const a = measure(wall.from as number);
    const b = measure(wall.to as number);
    const start = measure(wall.at as number);
    // The slant ends inside the measures too; given end before beginning, the wall is the same one told the other way round.
    const end = typeof wall.slant === "number" && Number.isFinite(wall.slant) ? measure(start + wall.slant) : start;
    const [at, far] = a <= b ? [start, end] : [end, start];
    const slant = Math.round((far - at) * 1000) / 1000;
    walls.push({ dir: wall.dir, at, from: Math.min(a, b), to: Math.max(a, b), ...(slant !== 0 ? { slant } : {}) });
  }
  return walls;
}

/** The shaped pockets as a clean list: outlines of at least three finite points that enclose an area, at most MAX_BOX_GENERATOR_POCKETS. */
export function normalizeBoxGeneratorPockets(value: unknown): BoxGeneratorPocket[] {
  if (!Array.isArray(value)) return [];
  const pockets: BoxGeneratorPocket[] = [];
  for (const entry of value) {
    if (pockets.length >= MAX_BOX_GENERATOR_POCKETS) break;
    if (!entry || typeof entry !== "object") continue;
    const pocket = entry as Partial<BoxGeneratorPocket>;
    if (!Array.isArray(pocket.points)) continue;
    const measure = (n: number) => Math.round(clamp(n, -1e4, 1e4) * 1000) / 1000;
    const points = pocket.points
      .filter((point) => point && typeof point === "object" && typeof point.x === "number" && typeof point.z === "number" && Number.isFinite(point.x) && Number.isFinite(point.z))
      .slice(0, MAX_BOX_GENERATOR_POCKET_POINTS)
      .map((point) => ({ x: measure(point.x), z: measure(point.z) }));
    if (points.length < 3 || Math.abs(signedArea(points)) < 1) continue;
    pockets.push({ points, depth: Math.round(clamp(finite(pocket.depth, 1e4), 0.4, 1e4) * 1000) / 1000 });
  }
  return pockets;
}

export function boxGeneratorPocketsEqual(a: readonly BoxGeneratorPocket[] | undefined, b: readonly BoxGeneratorPocket[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === 0 && (b?.length ?? 0) === 0;
  return a.length === b.length && a.every((pocket, index) => pocket.depth === b[index].depth && pocket.points.length === b[index].points.length && pocket.points.every((point, at) => point.x === b[index].points[at].x && point.z === b[index].points[at].z));
}

export function normalizeBoxGeneratorScoopSide(value: unknown): BoxGeneratorScoopSide {
  return value === "back" || value === "left" || value === "right" ? value : "front";
}

/** The finger scoops as a clean list: only points with finite measures, none below zero, at most MAX_BOX_GENERATOR_SCOOPS. */
export function normalizeBoxGeneratorScoops(value: unknown): BoxGeneratorScoop[] {
  if (!Array.isArray(value)) return [];
  const scoops: BoxGeneratorScoop[] = [];
  for (const entry of value) {
    if (scoops.length >= MAX_BOX_GENERATOR_SCOOPS) break;
    if (!entry || typeof entry !== "object") continue;
    const scoop = entry as Partial<BoxGeneratorScoop>;
    if (![scoop.x, scoop.z].every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const measure = (n: number) => Math.round(clamp(n, 0, 1e4) * 1000) / 1000;
    scoops.push({ x: measure(scoop.x as number), z: measure(scoop.z as number), side: normalizeBoxGeneratorScoopSide(scoop.side) });
  }
  return scoops;
}

export function boxGeneratorScoopsEqual(a: readonly BoxGeneratorScoop[] | undefined, b: readonly BoxGeneratorScoop[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === 0 && (b?.length ?? 0) === 0;
  return a.length === b.length && a.every((scoop, index) => scoop.x === b[index].x && scoop.z === b[index].z && scoop.side === b[index].side);
}

function pointInOutline(point: Point, outline: readonly Point[]) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i];
    const b = outline[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** The scoop of a compartment: the last one in the list whose point lies in it, or none. */
export function boxGeneratorScoopOf(compartment: { outline: readonly Point[] }, scoops: readonly BoxGeneratorScoop[]): BoxGeneratorScoop | null {
  for (let index = scoops.length - 1; index >= 0; index -= 1) if (pointInOutline(scoops[index], compartment.outline)) return scoops[index];
  return null;
}

/**
 * The scoops with one compartment's set to a side, or taken away (null): every scoop whose point lies in the compartment
 * goes, and the new one is put at the compartment's label point, well inside it.
 */
export function boxGeneratorScoopsWith(scoops: readonly BoxGeneratorScoop[], compartment: { outline: readonly Point[]; label: Point }, side: BoxGeneratorScoopSide | null): BoxGeneratorScoop[] {
  const rest = scoops.filter((scoop) => !pointInOutline(scoop, compartment.outline));
  const round = (value: number) => Math.round(value * 100) / 100;
  return side ? [...rest, { x: round(compartment.label.x), z: round(compartment.label.z), side }] : rest;
}

/** A list of walls as it was sent: the list itself, or the text of one; anything else is no list. */
export function boxGeneratorWallList(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function boxGeneratorWallsEqual(a: readonly BoxGeneratorWall[] | undefined, b: readonly BoxGeneratorWall[] | undefined) {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === 0 && (b?.length ?? 0) === 0;
  return a.length === b.length && a.every((wall, index) => wall.dir === b[index].dir && wall.at === b[index].at && wall.from === b[index].from && wall.to === b[index].to && (wall.slant ?? 0) === (b[index].slant ?? 0));
}

export type NormalizedBoxGenerator = Required<BoxGeneratorFields> & BoxGeneratorSize;

/** Every setting inside its limits, so no value can make the solid fail. */
export function normalizeBoxGenerator(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): NormalizedBoxGenerator {
  const width = Math.max(1, finite(size.width, DEFAULT_BOX_GENERATOR_WIDTH));
  const depth = Math.max(1, finite(size.depth, DEFAULT_BOX_GENERATOR_DEPTH));
  const height = Math.max(1, finite(size.height, DEFAULT_BOX_GENERATOR_HEIGHT));
  const smallest = Math.min(width, depth);
  const wall = clamp(finite(fields.boxWall, DEFAULT_BOX_GENERATOR_WALL), MIN_BOX_GENERATOR_WALL, Math.max(MIN_BOX_GENERATOR_WALL, smallest / 2 - 0.5));
  const floor = clamp(finite(fields.boxFloor, DEFAULT_BOX_GENERATOR_FLOOR), MIN_BOX_GENERATOR_WALL, Math.max(MIN_BOX_GENERATOR_WALL, height - 0.5));
  return {
    width,
    depth,
    height,
    boxShape: normalizeBoxGeneratorShape(fields.boxShape),
    boxSides: Math.round(clamp(finite(fields.boxSides, DEFAULT_BOX_GENERATOR_SIDES), MIN_BOX_GENERATOR_SIDES, MAX_BOX_GENERATOR_SIDES)),
    boxCornerRadius: clamp(finite(fields.boxCornerRadius, DEFAULT_BOX_GENERATOR_CORNER_RADIUS), 0, smallest / 2),
    boxWall: wall,
    boxFloor: floor,
    boxColumns: Math.round(clamp(finite(fields.boxColumns, 1), 1, MAX_BOX_GENERATOR_COMPARTMENTS)),
    boxRows: Math.round(clamp(finite(fields.boxRows, 1), 1, MAX_BOX_GENERATOR_COMPARTMENTS)),
    boxDivider: clamp(finite(fields.boxDivider, DEFAULT_BOX_GENERATOR_DIVIDER), MIN_BOX_GENERATOR_WALL, 20),
    boxDividerMode: normalizeBoxGeneratorDividerMode(fields.boxDividerMode),
    boxWalls: normalizeBoxGeneratorWalls(fields.boxWalls),
    boxScoops: normalizeBoxGeneratorScoops(fields.boxScoops),
    boxScoopRadius: clamp(finite(fields.boxScoopRadius, DEFAULT_BOX_GENERATOR_SCOOP_RADIUS), MIN_BOX_GENERATOR_SCOOP_RADIUS, MAX_BOX_GENERATOR_SCOOP_RADIUS),
    boxPockets: normalizeBoxGeneratorPockets(fields.boxPockets),
    boxPocketFill: clamp(finite(fields.boxPocketFill, 1e4), 1, 1e4),
    boxInsert: fields.boxInsert === true,
    boxPart: normalizeBoxGeneratorPart(fields.boxPart),
    boxLidStyle: normalizeBoxGeneratorLidStyle(fields.boxLidStyle),
    boxLidPlate: clamp(finite(fields.boxLidPlate, DEFAULT_BOX_GENERATOR_LID_PLATE), MIN_BOX_GENERATOR_WALL, Math.max(MIN_BOX_GENERATOR_WALL, height - 0.5)),
    boxFit: clamp(finite(fields.boxFit, DEFAULT_BOX_GENERATOR_FIT), 0, MAX_BOX_GENERATOR_FIT),
    boxLidCompartments: fields.boxLidCompartments !== false,
    boxGridfinity: fields.boxGridfinity === true,
    boxGridfinityColumns: Math.round(clamp(finite(fields.boxGridfinityColumns, 2), 1, MAX_BOX_GENERATOR_GRIDFINITY_CELLS)),
    boxGridfinityRows: Math.round(clamp(finite(fields.boxGridfinityRows, 2), 1, MAX_BOX_GENERATOR_GRIDFINITY_CELLS)),
    boxGridfinityFloor: fields.boxGridfinityFloor === true,
    boxGridfinityPlate: fields.boxGridfinityPlate === true,
    boxStackable: fields.boxStackable === true,
    boxStackHeight: clamp(finite(fields.boxStackHeight, DEFAULT_BOX_GENERATOR_STACK_HEIGHT), MIN_BOX_GENERATOR_STACK_HEIGHT, MAX_BOX_GENERATOR_STACK_HEIGHT),
  };
}

/** Only the box settings, normalized, as the fields a shape stores. */
export function normalizeBoxGeneratorFields(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): Required<BoxGeneratorFields> {
  const { width: _width, depth: _depth, height: _height, ...box } = normalizeBoxGenerator(size, fields);
  return box;
}

function signedArea(points: Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** The outline counter-clockwise in the x, z plane, whichever way it was given. */
function counterClockwise(points: Point[]) {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}

function roundedRectangle(width: number, depth: number, radius: number): Point[] {
  const hx = width / 2;
  const hz = depth / 2;
  if (radius <= 1e-6) return [{ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz }];
  const points: Point[] = [];
  const corners = [
    { cx: hx - radius, cz: -hz + radius, from: -90 },
    { cx: hx - radius, cz: hz - radius, from: 0 },
    { cx: -hx + radius, cz: hz - radius, from: 90 },
    { cx: -hx + radius, cz: -hz + radius, from: 180 },
  ];
  for (const corner of corners) {
    for (let step = 0; step <= CORNER_SEGMENTS; step += 1) {
      const angle = THREE.MathUtils.degToRad(corner.from + (90 * step) / CORNER_SEGMENTS);
      points.push({ x: corner.cx + Math.cos(angle) * radius, z: corner.cz + Math.sin(angle) * radius });
    }
  }
  return points;
}

/** The outer outline of the part: counter-clockwise, convex, centred on the origin. */
export function boxGeneratorOutline(settings: NormalizedBoxGenerator): Point[] {
  const { width, depth } = settings;
  if (settings.boxShape === "round") {
    return Array.from({ length: ROUND_SEGMENTS }, (_, index) => {
      const angle = (index / ROUND_SEGMENTS) * Math.PI * 2;
      return { x: (Math.cos(angle) * width) / 2, z: (Math.sin(angle) * depth) / 2 };
    });
  }
  if (settings.boxShape === "polygon") {
    const sides = settings.boxSides;
    // A corner points to the back, so a triangle stands on its base and a hexagon on a corner like a nut.
    return Array.from({ length: sides }, (_, index) => {
      const angle = -Math.PI / 2 + (index / sides) * Math.PI * 2;
      return { x: (Math.cos(angle) * width) / 2, z: (Math.sin(angle) * depth) / 2 };
    });
  }
  return roundedRectangle(width, depth, settings.boxCornerRadius);
}

/** Keeps the part of a convex outline on the left of the line a to b (the inside of a counter-clockwise outline). */
function clipHalfPlane(points: Point[], a: Point, b: Point): Point[] {
  const side = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const sc = side(current);
    const sn = side(next);
    if (sc >= 0) out.push(current);
    if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
      const t = sc / (sc - sn);
      out.push({ x: current.x + (next.x - current.x) * t, z: current.z + (next.z - current.z) * t });
    }
  }
  return out;
}

/** A convex outline pulled in by a distance on every side, or null when nothing of it is left. */
export function insetConvex(points: Point[], distance: number): Point[] | null {
  const outline = counterClockwise(points);
  let result = outline;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-9) continue;
    // The left normal of the direction a to b points into a counter-clockwise outline.
    const nx = -(b.z - a.z) / length;
    const nz = (b.x - a.x) / length;
    const shifted = { x: nx * distance, z: nz * distance };
    result = clipHalfPlane(result, { x: a.x + shifted.x, z: a.z + shifted.z }, { x: b.x + shifted.x, z: b.z + shifted.z });
    if (result.length < 3) return null;
  }
  return result.length >= 3 && signedArea(result) > 1e-6 ? dropDuplicates(result) : null;
}

function dropDuplicates(points: Point[]) {
  const kept = points.filter((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.z - point.z) > 1e-6;
  });
  return kept.length >= 3 ? kept : points;
}

function bounds(points: Point[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function boundsOf(points: Point[]) {
  const b = bounds(points);
  return { width: b.maxX - b.minX, depth: b.maxZ - b.minZ };
}

function clipRectangle(points: Point[], minX: number, maxX: number, minZ: number, maxZ: number): Point[] {
  let result = points;
  const edges: Array<[Point, Point]> = [
    [{ x: minX, z: minZ }, { x: maxX, z: minZ }],
    [{ x: maxX, z: minZ }, { x: maxX, z: maxZ }],
    [{ x: maxX, z: maxZ }, { x: minX, z: maxZ }],
    [{ x: minX, z: maxZ }, { x: minX, z: minZ }],
  ];
  for (const [a, b] of edges) {
    result = clipHalfPlane(result, a, b);
    if (result.length < 3) return [];
  }
  return result;
}

type Strip = { minX: number; maxX: number; minZ: number; maxZ: number };

/** A sorted list of coordinates without (near) repeats, held inside a range. */
function gridLines(values: number[], min: number, max: number) {
  const sorted = [min, max, ...values.filter((value) => value > min && value < max)].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > 1e-6);
}

/**
 * What is left open of a convex outline when axis-parallel strips (the dividers set by hand) are taken out of it: each
 * connected room as its outline (counter-clockwise) with the strips that stand free inside it as holes (given
 * counter-clockwise too). `solid` counts the rooms narrower than a compartment may be, which are left out and so stay solid.
 *
 * The strips' sides cut the outline's bounding box into a grid of cells that are each wholly open or wholly wall. Every
 * open cell is the outline clipped to the cell; its sides that lie on the outline or against a wall cell are the border of
 * the open room, those against another open cell are not. The border pieces are then joined end to end into loops. Where
 * two rooms meet in a single point the walk turns as far left as it can, so they stay two rooms.
 */
function openRegions(inner: Point[], strips: Strip[]): { regions: { outline: Point[]; holes: Point[][] }[]; solid: number } {
  const box = bounds(inner);
  const xs = gridLines(strips.flatMap((strip) => [strip.minX, strip.maxX]), box.minX, box.maxX);
  const zs = gridLines(strips.flatMap((strip) => [strip.minZ, strip.maxZ]), box.minZ, box.maxZ);
  const columns = xs.length - 1;
  const rows = zs.length - 1;
  const open = (column: number, row: number) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
    const x = (xs[column] + xs[column + 1]) / 2;
    const z = (zs[row] + zs[row + 1]) / 2;
    return !strips.some((strip) => x > strip.minX && x < strip.maxX && z > strip.minZ && z < strip.maxZ);
  };
  // One point for every place, however it was reached: neighbouring cells work the same crossing out a hair apart.
  const places = new Map<string, Point>();
  const keyOf = (point: Point) => `${Math.round(point.x * 1e6)},${Math.round(point.z * 1e6)}`;
  type Edge = { from: string; to: string; used: boolean };
  const leaving = new Map<string, Edge[]>();
  const edges: Edge[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (!open(column, row)) continue;
      const x0 = xs[column];
      const x1 = xs[column + 1];
      const z0 = zs[row];
      const z1 = zs[row + 1];
      const snap = (value: number, a: number, b: number) => (Math.abs(value - a) < 1e-7 ? a : Math.abs(value - b) < 1e-7 ? b : value);
      const cell = dropDuplicates(clipRectangle(inner, x0, x1, z0, z1).map((point) => ({ x: snap(point.x, x0, x1), z: snap(point.z, z0, z1) })));
      if (cell.length < 3 || signedArea(cell) < 1e-9) continue;
      for (let i = 0; i < cell.length; i += 1) {
        const a = cell[i];
        const b = cell[(i + 1) % cell.length];
        // A side on a grid line is shared with the cell beyond it; open on both sides, it is no border.
        const beyond = a.x === x0 && b.x === x0 ? open(column - 1, row)
          : a.x === x1 && b.x === x1 ? open(column + 1, row)
            : a.z === z0 && b.z === z0 ? open(column, row - 1)
              : a.z === z1 && b.z === z1 ? open(column, row + 1)
                : false;
        if (beyond) continue;
        const from = keyOf(a);
        const to = keyOf(b);
        if (from === to) continue;
        if (!places.has(from)) places.set(from, a);
        if (!places.has(to)) places.set(to, b);
        const edge = { from, to, used: false };
        edges.push(edge);
        leaving.set(from, [...(leaving.get(from) ?? []), edge]);
      }
    }
  }
  const loops: Point[][] = [];
  for (const start of edges) {
    if (start.used) continue;
    const loop: Point[] = [];
    let edge = start;
    let closed = false;
    for (let guard = 0; guard <= edges.length; guard += 1) {
      edge.used = true;
      loop.push(places.get(edge.from)!);
      const a = places.get(edge.from)!;
      const b = places.get(edge.to)!;
      const choices = (leaving.get(edge.to) ?? []).filter((next) => next === start || !next.used);
      if (choices.length === 0) break;
      // The turn furthest to the left; the open room lies on the left of every border piece.
      let best = choices[0];
      let bestTurn = -Infinity;
      for (const next of choices) {
        const c = places.get(next.to)!;
        const turn = Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z));
        if (turn > bestTurn) {
          bestTurn = turn;
          best = next;
        }
      }
      if (best === start) {
        closed = true;
        break;
      }
      edge = best;
    }
    if (!closed) continue;
    // Points in the middle of a straight run (where the grid cut it) are dropped.
    const corners = loop.filter((point, index) => {
      const before = loop[(index + loop.length - 1) % loop.length];
      const after = loop[(index + 1) % loop.length];
      const cross = (point.x - before.x) * (after.z - point.z) - (point.z - before.z) * (after.x - point.x);
      return Math.abs(cross) > 1e-9 * (1 + Math.hypot(point.x - before.x, point.z - before.z) * Math.hypot(after.x - point.x, after.z - point.z));
    });
    if (corners.length >= 3 && Math.abs(signedArea(corners)) > 1e-6) loops.push(corners);
  }
  return regionsOfLoops(loops);
}

/** Loops sorted into rooms: each counter-clockwise loop an outline, each clockwise one a wall standing free in the room around it (given back counter-clockwise). Rooms narrower than a compartment may be are left out and counted. */
function regionsOfLoops(loops: Point[][]): { regions: { outline: Point[]; holes: Point[][] }[]; solid: number } {
  const outlines = loops.filter((loop) => signedArea(loop) > 0);
  const inside = (point: Point, outline: Point[]) => {
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
      const a = outline[i];
      const b = outline[j];
      if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  };
  const regions = outlines.map((outline) => ({ outline, holes: [] as Point[][] }));
  for (const hole of loops.filter((loop) => signedArea(loop) < 0)) {
    // A point just beside the hole's first side, in the open room around it, tells which room that is.
    const a = hole[0];
    const b = hole[1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const probe = { x: (a.x + b.x) / 2 - ((b.z - a.z) / length) * 1e-4, z: (a.z + b.z) / 2 + ((b.x - a.x) / length) * 1e-4 };
    const home = regions.find((region) => inside(probe, region.outline));
    if (home) home.holes.push([...hole].reverse());
  }
  const kept = regions.filter((region) => {
    const span = boundsOf(region.outline);
    return Math.min(span.width, span.depth) >= MIN_COMPARTMENT_SPAN;
  });
  return { regions: kept, solid: regions.length - kept.length };
}

/**
 * As openRegions, for walls at any angle: the inside less every wall's outline, worked out by the 2D kernel. Slivers
 * smaller than a hundredth of a square millimetre, which a slanted wall can leave where it meets another, are dropped.
 */
function kernelRegions(runtime: ManifoldToplevel, inner: Point[], walls: Point[][]) {
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const ring = (points: Point[]) => counterClockwise(points).map((point): [number, number] => [point.x, point.z]);
    const room = keep(new runtime.CrossSection([ring(inner)], "Positive"));
    const taken = keep(runtime.CrossSection.union(walls.map((wall) => keep(new runtime.CrossSection([ring(wall)], "Positive")))));
    const open = keep(room.subtract(taken));
    const loops = open.toPolygons().map((polygon) => dropDuplicates(polygon.map(([x, z]) => ({ x, z })))).filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) > 0.01);
    return regionsOfLoops(loops);
  } finally {
    made.forEach((value) => value.delete());
  }
}

/** The two ends of a wall's middle line, in mm from the left and the back of the inside: its beginning and its end. */
export function boxGeneratorWallEnds(wall: BoxGeneratorWall): [Point, Point] {
  const far = wall.at + (wall.slant ?? 0);
  return wall.dir === "x" ? [{ x: wall.from, z: wall.at }, { x: wall.to, z: far }] : [{ x: wall.at, z: wall.from }, { x: far, z: wall.to }];
}

export function boxGeneratorWallLength(wall: BoxGeneratorWall) {
  return Math.hypot(wall.to - wall.from, wall.slant ?? 0);
}

/**
 * The wall whose middle line runs between two points: along the width when it reaches further that way than along the
 * depth, else along the depth, beginning at the end that lies further left (or further back).
 */
export function boxGeneratorWallFromEnds(a: Point, b: Point): BoxGeneratorWall {
  const round = (value: number) => Math.round(Math.max(0, value) * 1000) / 1000;
  const dir: BoxGeneratorWall["dir"] = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? "x" : "z";
  const along = (point: Point) => (dir === "x" ? point.x : point.z);
  const across = (point: Point) => (dir === "x" ? point.z : point.x);
  const [start, end] = along(a) <= along(b) ? [a, b] : [b, a];
  const at = round(across(start));
  const slant = Math.round((round(across(end)) - at) * 1000) / 1000;
  return { dir, at, from: round(along(start)), to: round(along(end)), ...(slant !== 0 ? { slant } : {}) };
}

/**
 * The outline of a wall seen from above, `thickness` wide square to its middle line, in mm from the left and the back of
 * the inside. With `room` given, a straight wall is held inside it, and an end that lies on a side of the room or beyond
 * is drawn out past it, so that a slanted wall closes against the box's wall instead of touching it with one corner.
 */
export function boxGeneratorWallQuad(wall: BoxGeneratorWall, thickness: number, room?: { width: number; depth: number }, longer = 0): Point[] {
  let [a, b] = boxGeneratorWallEnds(wall);
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / length;
  const uz = (b.z - a.z) / length;
  // `longer` draws both ends out by that much, for the room a lid's plug leaves round a wall.
  a = { x: a.x - ux * longer, z: a.z - uz * longer };
  b = { x: b.x + ux * longer, z: b.z + uz * longer };
  if (room) {
    const outside = (point: Point) => point.x <= 1e-6 || point.z <= 1e-6 || point.x >= room.width - 1e-6 || point.z >= room.depth - 1e-6;
    const reach = 2 * thickness + 1;
    if (outside(a)) a = { x: a.x - ux * reach, z: a.z - uz * reach };
    if (outside(b)) b = { x: b.x + ux * reach, z: b.z + uz * reach };
  }
  const nx = (-uz * thickness) / 2;
  const nz = (ux * thickness) / 2;
  return [{ x: a.x - nx, z: a.z - nz }, { x: b.x - nx, z: b.z - nz }, { x: b.x + nx, z: b.z + nz }, { x: a.x + nx, z: a.z + nz }];
}

/**
 * The walls with a mirror image of each added: mirrored left to right ("x") or back to front ("z") about the middle of
 * the room. A wall that already has its mirror image (or is its own) gets none, and no more are added than a box takes.
 */
export function boxGeneratorMirroredWalls(walls: readonly BoxGeneratorWall[], room: { width: number; depth: number }, axis: "x" | "z"): BoxGeneratorWall[] {
  const flip = (point: Point): Point => (axis === "x" ? { x: room.width - point.x, z: point.z } : { x: point.x, z: room.depth - point.z });
  const same = (a: BoxGeneratorWall, b: BoxGeneratorWall) => a.dir === b.dir && [a.at - b.at, a.from - b.from, a.to - b.to, (a.slant ?? 0) - (b.slant ?? 0)].every((off) => Math.abs(off) < 0.01);
  // Held to the room first, so that a wall running to "the end" mirrors onto the other end and not past it.
  const held = (wall: BoxGeneratorWall): BoxGeneratorWall => {
    const run = wall.dir === "x" ? room.width : room.depth;
    return wall.slant ? wall : { ...wall, from: clamp(wall.from, 0, run), to: clamp(wall.to, 0, run) };
  };
  const result = [...walls];
  for (const wall of walls) {
    if (result.length >= MAX_BOX_GENERATOR_WALLS) break;
    const [a, b] = boxGeneratorWallEnds(held(wall));
    const mirrored = boxGeneratorWallFromEnds(flip(a), flip(b));
    if (!result.some((other) => same(held(other), mirrored))) result.push(mirrored);
  }
  return result;
}

/**
 * The outlines of shaped pockets for a part: its outlines seen from above (in mm from the left and the back of the
 * inside of the box) joined, grown by the play all round with rounded corners, and thinned out to a number of points a
 * box stores. Holes in the part are left out, the pocket being cut from above. Only what lies at least partly in a room
 * `width` by `depth` is kept; an empty list when nothing does.
 */
export function boxGeneratorPocketOutlines(runtime: ManifoldToplevel, loops: ReadonlyArray<ReadonlyArray<Point>>, clearance: number, room: { width: number; depth: number }): Point[][] {
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const joined = keep(new runtime.CrossSection(loops.filter((loop) => loop.length >= 3).map((loop) => loop.map((point): [number, number] => [point.x, point.z])), "NonZero"));
    const grown = clearance > 0 ? keep(joined.offset(clearance, "Round", 2, 32)) : joined;
    const outlines: Point[][] = [];
    for (const polygon of grown.toPolygons()) {
      let points = polygon.map(([x, z]) => ({ x, z }));
      if (signedArea(points) <= 1) continue;
      // Thinned out until it fits: first to a twentieth of a millimetre, then coarser for an outline with very many points.
      for (let tolerance = 0.05; ; tolerance *= 2) {
        const thinned = keep(keep(new runtime.CrossSection([points.map((point): [number, number] => [point.x, point.z])], "Positive")).simplify(tolerance)).toPolygons();
        const largest = thinned.sort((a, b) => b.length - a.length)[0];
        if (largest) points = largest.map(([x, z]) => ({ x, z }));
        if (points.length <= MAX_BOX_GENERATOR_POCKET_POINTS || tolerance > 5) break;
      }
      const box = bounds(points);
      if (box.maxX <= 0 || box.maxZ <= 0 || box.minX >= room.width || box.minZ >= room.depth) continue;
      const round = (value: number) => Math.round(value * 100) / 100;
      outlines.push(points.slice(0, MAX_BOX_GENERATOR_POCKET_POINTS).map((point) => ({ x: round(point.x), z: round(point.z) })));
    }
    return outlines;
  } catch {
    return [];
  } finally {
    made.forEach((value) => value.delete());
  }
}

/** Whether the box's dividers need the 2D kernel: set by hand, with a wall at a slant. */
export function boxGeneratorNeedsKernel(fields: BoxGeneratorFields) {
  // Shaped pockets are cut into the box by the kernel.
  if ((fields.boxPart ?? "box") === "box" && !fields.boxInsert && Array.isArray(fields.boxPockets) && fields.boxPockets.length > 0) return true;
  // An insert's dividers are joined to its plate by the kernel.
  if (fields.boxPart === "insert") return true;
  // Finger scoops are joined to the box by the kernel.
  if (fields.boxPart !== "lid" && Array.isArray(fields.boxScoops) && fields.boxScoops.length > 0) return true;
  if (fields.boxDividerMode !== "manual" || !Array.isArray(fields.boxWalls) || fields.boxWalls.length === 0) return false;
  // A plug lid that reaches into the compartments needs it for any compartment that is no plain convex room.
  if (fields.boxPart === "lid") return fields.boxLidStyle === "plug" && fields.boxLidCompartments !== false;
  return fields.boxWalls.some((wall) => Boolean(wall?.slant));
}

/**
 * The dividers set by hand that lie inside a box whose inside is `width` by `depth` at its widest and deepest: each one
 * held inside it, and those left shorter than a wall may be, dropped. The stored list is not changed by this, so a wall
 * that a smaller box cuts short is whole again when the box grows.
 */
export function boxGeneratorWallsInside(walls: readonly BoxGeneratorWall[], width: number, depth: number): BoxGeneratorWall[] {
  return walls.flatMap((wall) => {
    const run = wall.dir === "x" ? width : depth;
    const across = wall.dir === "x" ? depth : width;
    // A slanted wall is not cut straight at the sides: that would turn it. What lies outside is cut off when the box is built.
    if (wall.slant) return boxGeneratorWallLength(wall) < MIN_BOX_GENERATOR_WALL_LENGTH ? [] : [wall];
    const from = clamp(wall.from, 0, run);
    const to = clamp(wall.to, 0, run);
    if (to - from < MIN_BOX_GENERATOR_WALL_LENGTH || wall.at < 0 || wall.at > across) return [];
    return [{ dir: wall.dir, at: wall.at, from, to }];
  });
}

export type BoxGeneratorCompartment = {
  /** The compartment's outline, in mm from the left and the back of the inside. */
  outline: Point[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** A point well inside it, for a label. */
  label: Point;
};

/** A point inside an outline: the middle of its widest stretch on the line through the middle of its depth. */
function pointInside(outline: Point[]): Point {
  const box = bounds(outline);
  const z = (box.minZ + box.maxZ) / 2 + 1e-4;
  const crossings: number[] = [];
  outline.forEach((a, index) => {
    const b = outline[(index + 1) % outline.length];
    if ((a.z > z) !== (b.z > z)) crossings.push(a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z));
  });
  crossings.sort((p, q) => p - q);
  let best = { x: (box.minX + box.maxX) / 2, width: -1 };
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1] - crossings[i];
    if (width > best.width) best = { x: (crossings[i] + crossings[i + 1]) / 2, width };
  }
  return { x: best.x, z };
}

/**
 * The room the dividers set by hand are measured in: the inside of a box part at its widest and deepest, in mm, the
 * inside's outline measured from that room's left and back, and the compartments the dividers (of the grid or set by
 * hand) leave open in it. Null for a lid, and for a box whose wall leaves no inside.
 */
export function boxGeneratorWallRoom(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  if (settings.boxPart === "lid") return null;
  // An insert's room is the inside of its box: the insert's own outline, the play wider all round.
  const whole = counterClockwise(boxGeneratorOutline(settings));
  const inner = settings.boxPart === "insert" ? whole : insetConvex(whole, settings.boxWall);
  if (!inner) return null;
  const box = settings.boxPart === "insert" ? insertRoom(settings, whole) : bounds(inner);
  const shift = (points: Point[]) => points.map((point) => ({ x: point.x - box.minX, z: point.z - box.minZ }));
  const compartments: BoxGeneratorCompartment[] = boxGeneratorPlan(size, fields).cells.map((cell) => {
    const outline = shift(cell);
    return { outline, ...bounds(outline), label: pointInside(outline) };
  });
  const outside = bounds(boxGeneratorOutline(settings));
  // `inset` is how far the room's left and back lie inside the left and back of the whole box.
  // `origin` is the room's left back corner measured from the middle of the part's outline, as the part is drawn.
  return { width: box.maxX - box.minX, depth: box.maxZ - box.minZ, origin: { x: box.minX, z: box.minZ }, inset: { x: box.minX - outside.minX, z: box.minZ - outside.minZ }, outline: shift(inner), compartments };
}

/**
 * A wall that splits a compartment in two through its middle: across (running along the width, "x") or along (running
 * along the depth, "z"), from one side of the compartment to the other. Where the compartment ends on another divider
 * the wall reaches to that one's middle, so the two stay joined when the thickness is changed.
 */
export function boxGeneratorSplitWall(compartment: Pick<BoxGeneratorCompartment, "minX" | "maxX" | "minZ" | "maxZ">, dir: BoxGeneratorWall["dir"], room: { width: number; depth: number }, divider: number): BoxGeneratorWall {
  const round = (value: number) => Math.round(value * 100) / 100;
  const reach = (value: number, limit: number, sign: number) => (value <= 1e-6 || value >= limit - 1e-6 ? clamp(value, 0, limit) : value + (sign * divider) / 2);
  return dir === "x"
    ? { dir, at: round((compartment.minZ + compartment.maxZ) / 2), from: round(reach(compartment.minX, room.width, -1)), to: round(reach(compartment.maxX, room.width, 1)) }
    : { dir, at: round((compartment.minX + compartment.maxX) / 2), from: round(reach(compartment.minZ, room.depth, -1)), to: round(reach(compartment.maxZ, room.depth, 1)) };
}

/**
 * The dividers of the grid (columns and rows) as walls set by hand, each from wall to wall, so that switching to "by
 * hand" begins with what was there.
 */
export function boxGeneratorGridWalls(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): BoxGeneratorWall[] {
  const settings = normalizeBoxGenerator(size, fields);
  const room = boxGeneratorWallRoom(size, fields);
  if (!room) return [];
  const walls: BoxGeneratorWall[] = [];
  const round = (value: number) => Math.round(value * 100) / 100;
  const cellWidth = (room.width - (settings.boxColumns - 1) * settings.boxDivider) / settings.boxColumns;
  const cellDepth = (room.depth - (settings.boxRows - 1) * settings.boxDivider) / settings.boxRows;
  if (cellWidth > 0) for (let column = 1; column < settings.boxColumns; column += 1) walls.push({ dir: "z", at: round(column * (cellWidth + settings.boxDivider) - settings.boxDivider / 2), from: 0, to: round(room.depth) });
  if (cellDepth > 0) for (let row = 1; row < settings.boxRows; row += 1) walls.push({ dir: "x", at: round(row * (cellDepth + settings.boxDivider) - settings.boxDivider / 2), from: 0, to: round(room.width) });
  return walls;
}

export type BoxGeneratorPlan = {
  settings: NormalizedBoxGenerator;
  outer: Point[];
  /** The openings in the part's top: compartments of a box, the space inside the skirt of an overlapping lid. */
  cells: Point[][];
  /**
   * With dividers set by hand: for each cell the walls that stand free inside it, touching nothing but the floor. Each is
   * an outline of its own (counter-clockwise) that the cell's floor is left out under. Unset when there are none.
   */
  islands?: Point[][][];
  /** Height of the floor of the cells above the bottom. */
  floorTop: number;
  /**
   * With Stackable: the step round the top and a groove under the wall. The floor stays flat on the bed. `skirt` is the
   * inner face of the foot under the outer part of the wall, `groove` the outline inside which the floor begins again
   * (the cavity's outline); between them a groove of `grooveHeight` (the collar's `height` plus a millimetre of room) is cut into the underside to take the collar of the box
   * below. `collar` is the outline of the collar the wall's inner part rises above the step by `height`.
   */
  stack: { skirt: Point[]; collar: Point[]; groove: Point[]; height: number; grooveHeight: number } | null;
  /**
   * With a Gridfinity baseplate in the floor: the cells of the existing Gridfinity grid that fit the box's inside, and the
   * height the sockets stand on. The floor is as thick as a baseplate plus its closed floor, and a socket is cut into it
   * for each cell as the baseplate's own are (gridfinityCutSockets).
   */
  plate: { cells: Point[]; bottom: number } | null;
  /**
   * `loops` are the border loops of everything that stands up from the plate: the one ring's outside and inside, or for a
   * lid that reaches into the compartments (boxLidCompartments) the borders of every compartment's ring.
   */
  /** A plug lid: the ring that fits into the box (`outline`, with `hole` as the ring's inside, null for a solid plug) and the plate's thickness. */
  plug: { outline: Point[]; hole: Point[] | null; plate: number; loops: Point[][] } | null;
  /** With shaped pockets: the height of the box's own floor, which no pocket goes below, and the top of the filling they are cut into. */
  pockets?: { floor: number; top: number };
  issues: BoxGeneratorIssue[];
};

/** The 2D plan of the part: its outline, and the cells that are cut down into it from the top. */
export function boxGeneratorPlan(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): BoxGeneratorPlan {
  const settings = normalizeBoxGenerator(size, fields);
  const outer = counterClockwise(boxGeneratorOutline(settings));
  const issues: BoxGeneratorIssue[] = [];
  const inner = insetConvex(outer, settings.boxWall);

  // A stackable lid that rests on top is made like a low stackable box without compartments: its groove takes the collar of
  // the box below, and its own collar on top centres the box that stands on it.
  const stackedLid = settings.boxPart === "lid" && settings.boxLidStyle === "restOn" && settings.boxStackable;
  if (settings.boxPart === "lid" && !stackedLid) {
    if (settings.boxLidStyle === "plug") {
      // A plug lid is as large as the box: a plate, and on it a ring that fits into the box, the play (Fit) smaller than the
      // inside on each side, as thick as the wall. Printed plate down, so the ring needs no support.
      const plug = insetConvex(outer, settings.boxWall + settings.boxFit);
      if (!plug) {
        issues.push({ code: "lidNoSkirt" });
        return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
      }
      const platePart = Math.min(settings.boxLidPlate, settings.height - 0.5);
      const hole = insetConvex(plug, settings.boxWall);
      // A box with dividers: one ring would stand on them, so the lid reaches into every compartment with a ring of its own.
      const loops = settings.boxLidCompartments && hasDividers(settings) ? compartmentPlugLoops(settings, outer) : null;
      return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: { outline: plug, hole, plate: platePart, loops: loops ?? [plug, ...(hole ? [hole] : [])] }, issues };
    }
    if (settings.boxLidStyle === "restOn") return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
    if (!inner) {
      issues.push({ code: "lidNoSkirt" });
      return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
    }
    return { settings, outer, cells: [inner], floorTop: Math.min(settings.boxLidPlate, settings.height - 0.5), stack: null, plate: null, plug: null, issues };
  }

  if (settings.boxPart === "insert") {
    // The cells are what the dividers leave open of the insert's outline, for the sizes shown and the lid; the body is made in createBoxGeneratorGeometry.
    const room = insertRoom(settings, outer);
    const open = compartmentRegions(settings, outer, room, 0);
    return { settings, outer, cells: open.regions.map((region) => region.outline), floorTop: Math.min(settings.boxFloor, settings.height - 0.5), stack: null, plate: null, plug: null, issues };
  }
  // The lid of a stackable box has its plate for a floor and one open space for its cavity; so has a box whose dividers are a loose insert.
  const plain = stackedLid || settings.boxInsert;
  const use = plain ? { ...settings, boxFloor: stackedLid ? settings.boxLidPlate : settings.boxFloor, boxDividerMode: "grid" as const, boxColumns: 1, boxRows: 1, boxGridfinityPlate: stackedLid ? false : settings.boxGridfinityPlate } : settings;
  const ownFloor = Math.min(use.boxFloor, settings.height - 0.5);
  let floorTop = ownFloor;
  // Shaped pockets: the box is filled above its floor, and the pockets are cut into the filling (createBoxGeneratorGeometry).
  const pocketed = settings.boxPart === "box" && !plain && settings.boxPockets.length > 0;
  if (pocketed) floorTop = Math.min(settings.height, ownFloor + settings.boxPocketFill);
  if (!inner) {
    issues.push({ code: "wallTooThick" });
    return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
  }
  // Stackable: the wall's inner half rises above a step as a collar; the outer half of the wall's underside has a groove
  // for the collar of the box below. The floor stays flat on the print bed (a groove only a wall's width wide is bridged
  // without trouble), and a box stands on a box with its foot on the step, centred by the collar. The play is the fit.
  let stack: BoxGeneratorPlan["stack"] = null;
  if (settings.boxStackable) {
    const ring = settings.boxWall / 2 - settings.boxFit / 2;
    const h = settings.boxStackHeight;
    const skirt = ring >= MIN_STACK_RING ? insetConvex(outer, ring) : null;
    const collar = ring >= MIN_STACK_RING ? insetConvex(outer, settings.boxWall / 2 + settings.boxFit / 2) : null;
    if (!skirt || !collar) issues.push({ code: "stackWallThin" });
    else if (settings.height < 2 * h + STACK_GROOVE_EXTRA + MIN_STACK_RING) issues.push({ code: "stackTooLow" });
    else stack = { skirt, collar, groove: inner, height: h, grooveHeight: h + STACK_GROOVE_EXTRA };
  }
  // A Gridfinity baseplate in the floor: the floor is as thick as the baseplate, and the existing socket cutter does the rest.
  let plate: BoxGeneratorPlan["plate"] = null;
  if (use.boxGridfinityPlate) {
    const top = GRIDFINITY_BASEPLATE_HEIGHT + GRIDFINITY_FLOOR;
    if (top > settings.height - 1) issues.push({ code: "plateTooLow" });
    else {
      const cells = gridfinityOutlineCells(inner, MAX_GRIDFINITY_LARGE_PLATE_UNITS);
      if (cells.length === 0) issues.push({ code: "plateNoCell" });
      else {
        plate = { cells, bottom: GRIDFINITY_FLOOR };
        floorTop = Math.max(floorTop, top);
      }
    }
  }
  // Filled to the rim there is no compartment left open: the top is one flat face for the pockets to be cut into.
  const room = pocketed && floorTop > settings.height - 0.5 ? { regions: [], solid: 0 } : compartmentRegions(use, inner, bounds(inner), 0);
  if (pocketed && room.regions.length === 0) floorTop = settings.height;
  if (room.solid > 0) issues.push({ code: "compartmentSolid", count: room.solid });
  const islands = room.regions.map((region) => region.holes);
  const pockets = pocketed ? { floor: ownFloor, top: floorTop } : undefined;
  return { settings, outer, cells: room.regions.map((region) => region.outline), islands: islands.some((list) => list.length > 0) ? islands : undefined, floorTop, stack, plate, plug: null, pockets, issues };
}

/**
 * The rooms the dividers leave open in an outline: of the grid of columns and rows, or of the walls set by hand. `box` is
 * the bounds of the box's inside, which the dividers are measured from. For the box itself `cut` is its inside and `grow`
 * nothing; for a lid that reaches into the compartments `cut` is the inside less the play and `grow` the play, by which
 * every divider is taken wider and longer, so each room is the play smaller all round than its compartment.
 */
function compartmentRegions(use: NormalizedBoxGenerator, cut: Point[], box: ReturnType<typeof bounds>, grow: number): { regions: { outline: Point[]; holes: Point[][] }[]; solid: number } {
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  if (use.boxDividerMode === "manual") {
    // Dividers set by hand: what is left of the outline when every wall's strip is taken out of it.
    const half = use.boxDivider / 2 + grow;
    const straight = boxGeneratorWallsInside(use.boxWalls.filter((wall) => !wall.slant), width, depth);
    const slanted = use.boxWalls.filter((wall) => wall.slant && boxGeneratorWallLength(wall) >= MIN_BOX_GENERATOR_WALL_LENGTH);
    // Slanted walls are cut out by the 2D kernel; until it has loaded the part is drawn with its straight walls and asks for it.
    const runtime = slanted.length > 0 ? loadedManifoldRuntime() : null;
    if (slanted.length > 0 && !runtime) requestManifoldRuntime();
    return runtime
      ? kernelRegions(runtime, cut, [...straight, ...slanted].map((wall) => boxGeneratorWallQuad(wall, use.boxDivider + 2 * grow, { width, depth }, grow).map((point) => ({ x: point.x + box.minX, z: point.z + box.minZ }))))
      : openRegions(cut, straight.map((wall) => wall.dir === "x"
        ? { minX: box.minX + wall.from - grow, maxX: box.minX + wall.to + grow, minZ: box.minZ + wall.at - half, maxZ: box.minZ + wall.at + half }
        : { minX: box.minX + wall.at - half, maxX: box.minX + wall.at + half, minZ: box.minZ + wall.from - grow, maxZ: box.minZ + wall.to + grow }));
  }
  const { boxColumns: columns, boxRows: rows, boxDivider: divider } = use;
  const cellWidth = (width - (columns - 1) * divider) / columns;
  const cellDepth = (depth - (rows - 1) * divider) / rows;
  const regions: { outline: Point[]; holes: Point[][] }[] = [];
  let solid = 0;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x0 = box.minX + column * (cellWidth + divider);
      const z0 = box.minZ + row * (cellDepth + divider);
      const cell = cellWidth > 2 * grow && cellDepth > 2 * grow ? clipRectangle(cut, x0 + grow, x0 + cellWidth - grow, z0 + grow, z0 + cellDepth - grow) : [];
      const span = cell.length >= 3 ? boundsOf(cell) : { width: 0, depth: 0 };
      if (cell.length >= 3 && Math.min(span.width, span.depth) >= MIN_COMPARTMENT_SPAN) regions.push({ outline: dropDuplicates(cell), holes: [] });
      else solid += 1;
    }
  }
  return { regions, solid };
}

/** The bounds of the box's inside as an insert sees them: the insert's own bounds, the play wider all round. */
function insertRoom(settings: NormalizedBoxGenerator, outer: Point[]) {
  const own = bounds(outer);
  return { minX: own.minX - settings.boxFit, maxX: own.maxX + settings.boxFit, minZ: own.minZ - settings.boxFit, maxZ: own.maxZ + settings.boxFit };
}

/** The dividers of a part as walls: those set by hand, or the grid's from wall to wall, measured in a room this wide and deep. */
function dividerWalls(settings: NormalizedBoxGenerator, width: number, depth: number): BoxGeneratorWall[] {
  if (settings.boxDividerMode === "manual") return settings.boxWalls.filter((wall) => boxGeneratorWallLength(wall) >= MIN_BOX_GENERATOR_WALL_LENGTH);
  const walls: BoxGeneratorWall[] = [];
  const cellWidth = (width - (settings.boxColumns - 1) * settings.boxDivider) / settings.boxColumns;
  const cellDepth = (depth - (settings.boxRows - 1) * settings.boxDivider) / settings.boxRows;
  if (cellWidth > 0) for (let column = 1; column < settings.boxColumns; column += 1) walls.push({ dir: "z", at: column * (cellWidth + settings.boxDivider) - settings.boxDivider / 2, from: 0, to: depth });
  if (cellDepth > 0) for (let row = 1; row < settings.boxRows; row += 1) walls.push({ dir: "x", at: row * (cellDepth + settings.boxDivider) - settings.boxDivider / 2, from: 0, to: width });
  return walls;
}

/**
 * An insert as closed triangles: everything inside its outline, from the bed to its height, that is plate or wall. The
 * plate is a slab and every wall a block, both reaching past the outline and past bed and top, so the outline's prism
 * cuts them cleanly and no two faces merely lie on each other. Null when Manifold cannot make it.
 */
function insertTriangles(runtime: ManifoldToplevel, settings: NormalizedBoxGenerator, outer: Point[]): Triangle[] | null {
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const room = insertRoom(settings, outer);
    const width = room.maxX - room.minX;
    const depth = room.maxZ - room.minZ;
    const floor = Math.min(settings.boxFloor, settings.height - 0.5);
    const block = (points: Point[], y0: number, y1: number) => keep(runtime.Manifold.hull(points.flatMap((point): [number, number, number][] => [[point.x, y0, point.z], [point.x, y1, point.z]])));
    const far = Math.max(width, depth) + 10;
    const parts = [block([{ x: room.minX - far, z: room.minZ - far }, { x: room.maxX + far, z: room.minZ - far }, { x: room.maxX + far, z: room.maxZ + far }, { x: room.minX - far, z: room.maxZ + far }], -1, floor)];
    for (const wall of dividerWalls(settings, width, depth)) {
      parts.push(block(boxGeneratorWallQuad(wall, settings.boxDivider, { width, depth }).map((point) => ({ x: point.x + room.minX, z: point.z + room.minZ })), floor / 2, settings.height + 1));
    }
    const prism: MeshBuilder = { positions: [], indices: [] };
    addCap(prism, outer, [], 0, "down");
    addCap(prism, outer, [], settings.height, "up");
    addWall(prism, outer, 0, settings.height, "out");
    const result = keep(keep(manifoldOfTriangles(runtime, trianglesOf(prism))).intersect(keep(runtime.Manifold.union(parts))));
    return result.status() === "NoError" && !result.isEmpty() ? trianglesOfManifold(result) : null;
  } catch {
    return null;
  } finally {
    new Set(made).forEach((value) => value.delete());
  }
}

/** Whether an outline has no corner that points inwards. */
function isConvex(points: Point[]) {
  const outline = counterClockwise(points);
  return outline.every((point, index) => {
    const before = outline[(index + outline.length - 1) % outline.length];
    const after = outline[(index + 1) % outline.length];
    return (point.x - before.x) * (after.z - point.z) - (point.z - before.z) * (after.x - point.x) >= -1e-9;
  });
}

/**
 * The plugs of a lid that reaches into every compartment, as the border loops of what stands up from the plate: for each
 * compartment a ring, the play smaller than the compartment all round and as thick as the wall, with a slot for every
 * wall that stands free in it. A compartment with a corner pointing inwards or a free wall needs the 2D kernel for its
 * ring; until that has loaded its plug is drawn solid. The loops are mirrored left to right, because the lid is drawn
 * upside down as it prints and is turned over sideways to go on the box.
 */
function compartmentPlugLoops(settings: NormalizedBoxGenerator, outer: Point[]): Point[][] | null {
  const inner = insetConvex(outer, settings.boxWall);
  const cut = insetConvex(outer, settings.boxWall + settings.boxFit);
  if (!inner || !cut) return null;
  const { regions } = compartmentRegions(settings, cut, bounds(inner), settings.boxFit);
  const loops: Point[][] = [];
  for (const region of regions) {
    if (region.holes.length === 0 && isConvex(region.outline)) {
      const hole = insetConvex(region.outline, settings.boxWall);
      loops.push(region.outline, ...(hole ? [hole] : []));
      continue;
    }
    const runtime = loadedManifoldRuntime();
    if (!runtime) {
      requestManifoldRuntime();
      loops.push(region.outline, ...region.holes);
      continue;
    }
    const made: { delete(): void }[] = [];
    const keep = <T extends { delete(): void }>(value: T) => {
      made.push(value);
      return value;
    };
    try {
      const ring = (points: Point[], clockwise = false) => {
        const turned = counterClockwise(points).map((point): [number, number] => [point.x, point.z]);
        return clockwise ? turned.reverse() : turned;
      };
      const plug = keep(new runtime.CrossSection([ring(region.outline), ...region.holes.map((hole) => ring(hole, true))], "Positive"));
      const hollow = keep(plug.offset(-settings.boxWall, "Miter", 2));
      const band = keep(plug.subtract(hollow));
      loops.push(...band.toPolygons().map((polygon) => dropDuplicates(polygon.map(([x, z]) => ({ x, z })))).filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) > 0.01));
    } catch {
      loops.push(region.outline, ...region.holes);
    } finally {
      made.forEach((value) => value.delete());
    }
  }
  return loops.map((loop) => loop.map((point) => ({ x: -point.x, z: point.z })));
}

/** Whether the part has dividers: more than one compartment in the grid, or a wall set by hand. */
function hasDividers(settings: NormalizedBoxGenerator) {
  return settings.boxDividerMode === "manual" ? settings.boxWalls.length > 0 : settings.boxColumns * settings.boxRows > 1;
}

/** Problems a person should know about; the solid is still made, the affected part left solid. */
export function boxGeneratorIssues(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): BoxGeneratorIssue[] {
  return boxGeneratorPlan(size, fields).issues;
}

/**
 * What the inside of a box part offers a Gridfinity baseplate, and only that: the box generator makes no Gridfinity of its
 * own. The Gridfinity shape (baseplate, bins) already exists in the editor and is put inside the box; this gives the room
 * to plan it with, the inside of the wall and how many cells of the Gridfinity grid fit across and along it. Only a
 * rectangular box part has a rectangular inside; anything else, and a lid, gives null.
 */
export function boxGeneratorGridfinityRoom(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  if (settings.boxPart !== "box" || settings.boxShape !== "rectangle") return null;
  const fit = boxGeneratorGridfinityFit(size, fields);
  const best = fit?.best ?? null;
  return { width: fit!.innerWidth, depth: fit!.innerDepth, columns: best?.columns ?? 0, rows: best?.rows ?? 0 };
}

/** The baseplate of a grid of Gridfinity cells, in mm: the cells of the grid and the play the drawer clearance leaves. */
function gridfinityPlate(columns: number, rows: number) {
  return { width: columns * GRIDFINITY_GRID + GRIDFINITY_DRAWER_CLEARANCE, depth: rows * GRIDFINITY_GRID + GRIDFINITY_DRAWER_CLEARANCE };
}

/**
 * How much room a baseplate needs on every side between its edge and the inside of a rectangular box, in mm. The play of
 * the drawer fit gives half of it; the rounded corners of the inside may ask for more: a plate whose corners are rounded
 * by the Gridfinity radius fits a corner rounded by `inside` only when it stands back from the straight walls by
 * (inside - radius) x (1 - 1 / sqrt 2), as the corner circles must lie within one another.
 */
export function boxGeneratorGridfinityMargin(insideCornerRadius: number) {
  const corner = Math.max(0, insideCornerRadius - GRIDFINITY_BASEPLATE_RADIUS) * (1 - Math.SQRT1_2);
  return Math.max(GRIDFINITY_DRAWER_CLEARANCE / 2, corner);
}

/**
 * The outer size of a rectangular box whose inside holds a Gridfinity baseplate of this many cells: with its play, and
 * wide enough that the plate's corners clear the rounded corners of the inside (`cornerRadius` is the outside's).
 */
export function boxGeneratorGridfinityBoxSize(columns: number, rows: number, wall: number, cornerRadius = 0) {
  const margin = boxGeneratorGridfinityMargin(Math.max(0, cornerRadius - Math.max(0, wall)));
  const grow = 2 * (Math.max(0, wall) + margin);
  return {
    // Up to a hundredth, so the rounding can never take the clearance away again.
    width: Math.ceil((Math.max(1, Math.round(columns)) * GRIDFINITY_GRID + grow) * 100 - 1e-6) / 100,
    depth: Math.ceil((Math.max(1, Math.round(rows)) * GRIDFINITY_GRID + grow) * 100 - 1e-6) / 100,
  };
}

/**
 * How a box part takes a Gridfinity baseplate (the box generator makes none: the Gridfinity shape goes inside). `fits`
 * says whether a grid of that many cells lies inside the inside of the wall, a rectangle of the cells and the play
 * centred on the box: against the sides of a rectangular box, and with its four corners inside a round or many-sided
 * outline. `best` is the grid with the most cells that fits (the squarest of equals), null when not even one cell does;
 * `maxColumns` and `maxRows` are the most cells across and along when the other is one. A lid has no inside: null.
 */
export function boxGeneratorGridfinityFit(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  if (settings.boxPart !== "box") return null;
  const outer = counterClockwise(boxGeneratorOutline(settings));
  const inner = insetConvex(outer, settings.boxWall);
  const rectangle = settings.boxShape === "rectangle";
  const innerWidth = Math.round((settings.width - 2 * settings.boxWall) * 100) / 100;
  const innerDepth = Math.round((settings.depth - 2 * settings.boxWall) * 100) / 100;
  const fits = (columns: number, rows: number) => {
    const plate = gridfinityPlate(columns, rows);
    // Against the sides of a rectangular box, and clear of the rounded corners of its inside.
    if (rectangle) return Math.min(innerWidth - plate.width, innerDepth - plate.depth) / 2 >= boxGeneratorGridfinityMargin(Math.max(0, settings.boxCornerRadius - settings.boxWall)) - GRIDFINITY_DRAWER_CLEARANCE / 2 - 0.006;
    if (!inner) return false;
    const corners: Point[] = [{ x: -plate.width / 2, z: -plate.depth / 2 }, { x: plate.width / 2, z: -plate.depth / 2 }, { x: plate.width / 2, z: plate.depth / 2 }, { x: -plate.width / 2, z: plate.depth / 2 }];
    return corners.every((corner) => inner.every((a, i) => {
      const b = inner[(i + 1) % inner.length];
      return (b.x - a.x) * (corner.z - a.z) - (b.z - a.z) * (corner.x - a.x) >= -1e-6;
    }));
  };
  let best: { columns: number; rows: number } | null = null;
  let maxColumns = 0;
  let maxRows = 0;
  for (let columns = 1; columns <= MAX_BOX_GENERATOR_GRIDFINITY_CELLS; columns += 1) {
    if (fits(columns, 1)) maxColumns = columns;
    for (let rows = 1; rows <= MAX_BOX_GENERATOR_GRIDFINITY_CELLS; rows += 1) {
      if (!fits(columns, rows)) continue;
      if (!best || columns * rows > best.columns * best.rows || (columns * rows === best.columns * best.rows && Math.abs(columns - rows) < Math.abs(best.columns - best.rows))) best = { columns, rows };
    }
  }
  for (let rows = 1; rows <= MAX_BOX_GENERATOR_GRIDFINITY_CELLS; rows += 1) if (fits(1, rows)) maxRows = rows;
  return { innerWidth, innerDepth, rectangle, fits, best, maxColumns, maxRows };
}

/**
 * The outline of a box part's inside: a convex outline of the outside (any order, in the plane's own frame) pulled in by
 * the wall, or null when nothing is left. The Gridfinity baseplate is fitted to this, the floor the box really has.
 */
export function boxGeneratorInsideOutline(outline: readonly Point[], wall: number): Point[] | null {
  if (outline.length < 3) return null;
  return insetConvex(counterClockwise([...outline]), Math.max(0, wall));
}

/**
 * The floor of a box part for the Gridfinity baseplate that is fitted to it (the plate's own "Fit baseplate to outline"
 * does the fitting): how many whole 42 mm cells the inside holds, counted by the same function the plate uses, with the box
 * as it was given. The box is not resized. Null for a lid.
 */
export function boxGeneratorGridfinityFloor(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  if (settings.boxPart !== "box") return null;
  const inside = boxGeneratorInsideOutline(boxGeneratorOutline(settings), settings.boxWall);
  if (!inside) return { cells: 0 };
  return { cells: gridfinityOutlineCells(inside, MAX_GRIDFINITY_LARGE_PLATE_UNITS).length };
}

/** The outer size an overlapping lid needs to close a box of this outer size, with the fit on every side. */
export function boxGeneratorMatchingLidSize(box: { width: number; depth: number }, wall: number, fit: number) {
  const grow = 2 * (Math.max(0, wall) + Math.max(0, fit));
  return { width: box.width + grow, depth: box.depth + grow };
}

/**
 * What turns a box into its matching lid: the part, and the size and height the lid needs. A lid that overlaps the box is
 * wider than it by the walls and the play; a stackable lid that rests on top has room for its groove and collar, a flat one
 * is a thin plate, and a plug lid or an overlapping one is a short ring on a plate. Everything else (outline, wall, play, lid
 * style, stacking) stays the box's own, so the two fit.
 */
export function boxGeneratorMatchingLidPatch(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  const grown = settings.boxLidStyle === "overlap" ? boxGeneratorMatchingLidSize(size, settings.boxWall, settings.boxFit) : { width: size.width, depth: size.depth };
  let height = 10;
  if (settings.boxLidStyle === "restOn") {
    const room = 2 * settings.boxStackHeight + STACK_GROOVE_EXTRA + MIN_STACK_RING + 1;
    height = settings.boxStackable ? Math.ceil(room * 2) / 2 : 3;
  }
  return { boxPart: "lid" as const, width: grown.width, depth: grown.depth, height };
}

/**
 * What turns a box into its matching insert: the part, the size that fits the inside with the play all round, a height
 * that ends a little under the rim, the corner radius of the inside, and a thin plate for the dividers to stand on.
 * Dividers, their thickness and the play stay the box's own, so the insert's walls stand where the box's would.
 */
export function boxGeneratorMatchingInsertPatch(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  const shrink = 2 * (settings.boxWall + settings.boxFit);
  const floorTop = boxGeneratorPlan(size, { ...fields, boxPart: "box" }).floorTop;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    boxPart: "insert" as const,
    width: round(Math.max(1, size.width - shrink)),
    depth: round(Math.max(1, size.depth - shrink)),
    height: round(Math.max(2, settings.height - floorTop - 0.5)),
    boxCornerRadius: round(Math.max(0, settings.boxCornerRadius - settings.boxWall - settings.boxFit)),
    boxFloor: DEFAULT_BOX_GENERATOR_INSERT_FLOOR,
    boxInsert: undefined,
    boxScoops: undefined,
  };
}

type MeshBuilder = {
  positions: number[];
  indices: number[];
};

function addVertex(mesh: MeshBuilder, x: number, y: number, z: number) {
  mesh.positions.push(x, y, z);
  return mesh.positions.length / 3 - 1;
}

/** A face set of a flat region (outline with holes) at height y, facing up or down. */
function addCap(mesh: MeshBuilder, outline: Point[], holes: Point[][], y: number, facing: "up" | "down") {
  const loops = [outline, ...holes];
  const flat = loops.flat();
  const base = mesh.positions.length / 3;
  flat.forEach((point) => addVertex(mesh, point.x, y, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(
    outline.map((point) => new THREE.Vector2(point.x, point.z)),
    holes.map((hole) => hole.map((point) => new THREE.Vector2(point.x, point.z))),
  );
  const emit = (a: number, b: number, c: number) => {
    const pa = flat[a];
    const pb = flat[b];
    const pc = flat[c];
    // Looking down the y axis the normal's y is the cross product of the two edges in the x, z plane.
    const cross = (pb.z - pa.z) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.z - pa.z);
    const up = cross > 0;
    if (up === (facing === "up")) mesh.indices.push(base + a, base + b, base + c);
    else mesh.indices.push(base + a, base + c, base + b);
  };
  // The triangulation may span an edge across other vertices of the region (neighbouring cells line up).
  // Such a triangle is split at those vertices so that every edge meets its neighbour exactly.
  const onEdge = (from: number, to: number) => {
    const a = flat[from];
    const b = flat[to];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const found: { index: number; along: number }[] = [];
    flat.forEach((point, index) => {
      if (index === from || index === to) return;
      const along = ((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) / length;
      const off = Math.abs((b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x)) / length;
      if (off < 1e-6 && along > 1e-6 && along < length - 1e-6) found.push({ index, along });
    });
    return found.sort((x, y) => x.along - y.along).map((entry) => entry.index);
  };
  for (const [a, b, c] of triangles) {
    const polygon = [a, ...onEdge(a, b), b, ...onEdge(b, c), c, ...onEdge(c, a)];
    if (polygon.length === 3) {
      emit(a, b, c);
      continue;
    }
    const local = THREE.ShapeUtils.triangulateShape(polygon.map((index) => new THREE.Vector2(flat[index].x, flat[index].z)), []);
    for (const [i, j, k] of local) emit(polygon[i], polygon[j], polygon[k]);
  }
}

/** The side wall of an outline between two heights; "out" faces away from its inside, "in" towards it. */
function addWall(mesh: MeshBuilder, outline: Point[], y0: number, y1: number, facing: "out" | "in") {
  const count = outline.length;
  const base = mesh.positions.length / 3;
  outline.forEach((point) => addVertex(mesh, point.x, y0, point.z));
  outline.forEach((point) => addVertex(mesh, point.x, y1, point.z));
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    if (facing === "out") {
      mesh.indices.push(base + i, base + count + next, base + next, base + i, base + count + i, base + count + next);
    } else {
      mesh.indices.push(base + i, base + next, base + count + next, base + i, base + count + next, base + count + i);
    }
  }
}

/**
 * What stands up from a flat top: the top of `base` at height y0 with material raised to y1 on it. `loops` are the
 * material's border loops in any order and direction, none crossing another: a loop inside an even number of others is
 * the outside of a piece, one inside an odd number the border of a hollow in it. The same points are used for the tops,
 * the sides and the floor between, so every edge meets its neighbour.
 */
function addRaised(mesh: MeshBuilder, base: Point[], loops: Point[][], y0: number, y1: number) {
  const rings = loops.map((loop) => counterClockwise(loop));
  const within = (point: Point, outline: Point[]) => {
    let hit = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
      const a = outline[i];
      const b = outline[j];
      if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  };
  // A loop's parent is the smallest loop around it; loops do not cross, so one of its points tells.
  const area = rings.map((ring) => Math.abs(signedArea(ring)));
  const parent = rings.map((ring, index) => {
    let best = -1;
    rings.forEach((other, position) => {
      if (position === index || area[position] <= area[index] || !within(ring[0], other)) return;
      if (best < 0 || area[position] < area[best]) best = position;
    });
    return best;
  });
  const depth = rings.map((_ring, index) => {
    let count = 0;
    for (let at = parent[index]; at >= 0; at = parent[at]) count += 1;
    return count;
  });
  const children = (index: number) => rings.filter((_ring, position) => parent[position] === index);
  addCap(mesh, base, rings.filter((_ring, index) => parent[index] < 0), y0, "up");
  rings.forEach((ring, index) => {
    if (depth[index] % 2 === 0) {
      addWall(mesh, ring, y0, y1, "out");
      addCap(mesh, ring, children(index), y1, "up");
    } else {
      addWall(mesh, ring, y0, y1, "in");
      addCap(mesh, ring, children(index), y0, "up");
    }
  });
}

type Triangle = [number, number, number][];

function trianglesOf(mesh: MeshBuilder): Triangle[] {
  const triangles: Triangle[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    triangles.push([0, 1, 2].map((k) => [mesh.positions[mesh.indices[i + k] * 3], mesh.positions[mesh.indices[i + k] * 3 + 1], mesh.positions[mesh.indices[i + k] * 3 + 2]] as [number, number, number]));
  }
  return triangles;
}

/** How far a scoop reaches into the floor and the walls round it, in mm, so that it is joined to them and does not merely touch. */
const SCOOP_BITE = 0.05;

type ScoopPiece = { outline: Point[]; holes: Point[][]; top: number; bar: Triangle[] };

/**
 * The finger scoops, for each compartment that has one: the compartment's outline (with the walls standing free in it),
 * the height the scoop reaches to, and a bar along the chosen side of the compartment whose section is the corner
 * between floor and wall less a quarter circle. What the bar shares with the room over the compartment is the scoop. The
 * radius is held to the height above the floor and to the compartment's reach away from that side.
 */
function scoopPieces(settings: NormalizedBoxGenerator, outer: Point[], cells: Point[][], islands: Point[][][] | undefined, floorTop: number): ScoopPiece[] {
  if (settings.boxScoops.length === 0) return [];
  const inner = insetConvex(outer, settings.boxWall);
  if (!inner) return [];
  const origin = bounds(inner);
  const pieces: ScoopPiece[] = [];
  cells.forEach((cell, index) => {
    const scoop = boxGeneratorScoopOf({ outline: cell.map((point) => ({ x: point.x - origin.minX, z: point.z - origin.minZ })) }, settings.boxScoops);
    if (!scoop) return;
    const box = bounds(cell);
    const across = scoop.side === "front" || scoop.side === "back";
    const radius = Math.min(settings.boxScoopRadius, settings.height - floorTop, across ? box.maxZ - box.minZ : box.maxX - box.minX);
    if (radius < 0.5) return;
    // The bar's section: u away from the side, v up from the floor. It starts a little inside the wall and the floor, then
    // follows the quarter circle from the floor up to the wall.
    const section: [number, number][] = [[-SCOOP_BITE, -SCOOP_BITE], [radius, -SCOOP_BITE]];
    for (let step = 0; step <= SCOOP_SEGMENTS; step += 1) {
      const angle = (step / SCOOP_SEGMENTS) * (Math.PI / 2);
      section.push([radius - radius * Math.sin(angle), radius - radius * Math.cos(angle)]);
    }
    section.push([-SCOOP_BITE, radius]);
    const from = (across ? box.minX : box.minZ) - 1;
    const to = (across ? box.maxX : box.maxZ) + 1;
    const place = (u: number, v: number, w: number): [number, number, number] => {
      if (scoop.side === "front") return [w, floorTop + v, box.maxZ - u];
      if (scoop.side === "back") return [w, floorTop + v, box.minZ + u];
      if (scoop.side === "left") return [box.minX + u, floorTop + v, w];
      return [box.maxX - u, floorTop + v, w];
    };
    const bar: Triangle[] = [];
    for (let i = 1; i + 1 < section.length; i += 1) {
      bar.push([place(...section[0], from), place(...section[i], from), place(...section[i + 1], from)]);
      bar.push([place(...section[0], to), place(...section[i + 1], to), place(...section[i], to)]);
    }
    section.forEach((point, i) => {
      const next = section[(i + 1) % section.length];
      bar.push([place(...point, from), place(...point, to), place(...next, to)], [place(...point, from), place(...next, to), place(...next, from)]);
    });
    // The faces must point outwards, whichever way the side turned the bar.
    const volume = bar.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
    pieces.push({ outline: cell, holes: islands?.[index] ?? [], top: floorTop + radius, bar: volume < 0 ? bar.map(([a, b, c]) => [a, c, b] as Triangle) : bar });
  });
  return pieces;
}

/**
 * The box with its scoops joined on by Manifold; the box as it is when that fails. Each scoop is the bar cut to the room
 * over its compartment, that room taken a hair wider than the compartment and begun a hair inside the floor: a scoop that
 * only touched floor and walls would stay a body of its own lying against them.
 */
function joinScoops(runtime: ManifoldToplevel, body: Triangle[], pieces: ScoopPiece[], floorTop: number): Triangle[] {
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const scoops = pieces.flatMap((piece) => {
      const ring = (points: Point[], clockwise: boolean) => {
        const turned = counterClockwise(points).map((point): [number, number] => [point.x, point.z]);
        return clockwise ? turned.reverse() : turned;
      };
      const grown = keep(keep(new runtime.CrossSection([ring(piece.outline, false), ...piece.holes.map((hole) => ring(hole, true))], "Positive")).offset(SCOOP_BITE, "Miter", 2));
      const loops = grown.toPolygons().map((polygon) => dropDuplicates(polygon.map(([x, z]) => ({ x, z })))).filter((loop) => loop.length >= 3);
      const bar = keep(manifoldOfTriangles(runtime, piece.bar));
      return regionsOfLoops(loops).regions.map((region) => {
        const room: MeshBuilder = { positions: [], indices: [] };
        addCap(room, region.outline, region.holes, floorTop - SCOOP_BITE, "down");
        addCap(room, region.outline, region.holes, piece.top, "up");
        addWall(room, region.outline, floorTop - SCOOP_BITE, piece.top, "out");
        for (const hole of region.holes) addWall(room, hole, floorTop - SCOOP_BITE, piece.top, "in");
        return keep(keep(manifoldOfTriangles(runtime, trianglesOf(room))).intersect(bar));
      });
    });
    if (scoops.length === 0) return body;
    const result = keep(keep(manifoldOfTriangles(runtime, body)).add(keep(runtime.Manifold.union(scoops))));
    return result.status() === "NoError" && !result.isEmpty() ? trianglesOfManifold(result) : body;
  } catch {
    return body;
  } finally {
    new Set(made).forEach((value) => value.delete());
  }
}

/**
 * The box with its shaped pockets cut out by Manifold; the box as it is when that fails. Each pocket's outline is held
 * inside the box's inside, a little away from the wall so the wall is never cut and no fin too thin to print is left, and
 * is cut from above down to its depth, never below the box's own floor.
 */
function cutPockets(runtime: ManifoldToplevel, body: Triangle[], settings: NormalizedBoxGenerator, outer: Point[], levels: { floor: number; top: number }): Triangle[] {
  const inner = insetConvex(outer, settings.boxWall);
  const limit = insetConvex(outer, settings.boxWall + POCKET_WALL_GAP);
  if (!inner || !limit) return body;
  const origin = bounds(inner);
  const made: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const ring = (points: Point[]) => counterClockwise(points).map((point): [number, number] => [point.x, point.z]);
    const room = keep(new runtime.CrossSection([ring(limit)], "Positive"));
    const cuts = settings.boxPockets.flatMap((pocket) => {
      const outline = keep(new runtime.CrossSection([ring(pocket.points.map((point) => ({ x: point.x + origin.minX, z: point.z + origin.minZ })))], "Positive"));
      const held = keep(outline.intersect(room));
      const bottom = Math.max(levels.floor, levels.top - pocket.depth);
      const loops = held.toPolygons().map((polygon) => dropDuplicates(polygon.map(([x, z]) => ({ x, z })))).filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) > 0.5);
      return regionsOfLoops(loops).regions.map((region) => {
        const prism: MeshBuilder = { positions: [], indices: [] };
        addCap(prism, region.outline, region.holes, bottom, "down");
        addCap(prism, region.outline, region.holes, settings.height + 1, "up");
        addWall(prism, region.outline, bottom, settings.height + 1, "out");
        for (const hole of region.holes) addWall(prism, hole, bottom, settings.height + 1, "in");
        return keep(manifoldOfTriangles(runtime, trianglesOf(prism)));
      });
    });
    if (cuts.length === 0) return body;
    const result = keep(keep(manifoldOfTriangles(runtime, body)).subtract(keep(runtime.Manifold.union(cuts))));
    return result.status() === "NoError" && !result.isEmpty() ? trianglesOfManifold(result) : body;
  } catch {
    return body;
  } finally {
    new Set(made).forEach((value) => value.delete());
  }
}

/**
 * The closed solid of a part from y = 0 to the height: the bottom, the outer wall, the top face between outline and
 * cells, the cells' walls facing inward and the floor of each cell.
 */
export function createBoxGeneratorGeometry(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): THREE.BufferGeometry {
  const { outer, cells, islands, floorTop, settings, stack, plate, plug, pockets } = boxGeneratorPlan(size, fields);
  const mesh: MeshBuilder = { positions: [], indices: [] };
  if (settings.boxPart === "insert") {
    // The dividers are joined to the plate by Manifold: until it has loaded the insert is drawn as its plate alone and asks for it.
    const runtime = loadedManifoldRuntime();
    if (!runtime) requestManifoldRuntime();
    const made = runtime ? insertTriangles(runtime, settings, outer) : null;
    if (made) return geometryOf(made.flat(2), Array.from({ length: made.length * 3 }, (_, k) => k));
    addCap(mesh, outer, [], 0, "down");
    addWall(mesh, outer, 0, floorTop, "out");
    addCap(mesh, outer, [], floorTop, "up");
    return geometryOf(mesh.positions, mesh.indices);
  }
  if (plug) {
    // The plate on the bed, the ring standing up from it: its outside, its top, and its inside down to the plate.
    addCap(mesh, outer, [], 0, "down");
    addWall(mesh, outer, 0, plug.plate, "out");
    addRaised(mesh, outer, plug.loops, plug.plate, settings.height);
  } else if (stack) {
    const { skirt, collar, groove, height: lift, grooveHeight } = stack;
    // Underneath: the foot under the wall's outer part, the groove for the collar of the box below, the flat floor.
    addCap(mesh, outer, [skirt], 0, "down");
    addWall(mesh, skirt, 0, grooveHeight, "in");
    addCap(mesh, skirt, [groove], grooveHeight, "down");
    addWall(mesh, groove, 0, grooveHeight, "out");
    addCap(mesh, groove, [], 0, "down");
    // The outer wall up to the step, the step, the collar and its top (with the dividers, as high as the collar).
    addWall(mesh, outer, 0, settings.height - lift, "out");
    addCap(mesh, outer, [collar], settings.height - lift, "up");
    addWall(mesh, collar, settings.height - lift, settings.height, "out");
    addCap(mesh, collar, cells, settings.height, "up");
  } else {
    addCap(mesh, outer, [], 0, "down");
    addWall(mesh, outer, 0, settings.height, "out");
    addCap(mesh, outer, cells, settings.height, "up");
  }
  cells.forEach((cell, index) => {
    const standing = islands?.[index] ?? [];
    addWall(mesh, cell, floorTop, settings.height, "in");
    addCap(mesh, cell, standing, floorTop, "up");
    // A wall that stands free in the cell: its sides and its top, the floor left out under it.
    for (const island of standing) {
      addWall(mesh, island, floorTop, settings.height, "out");
      addCap(mesh, island, [], settings.height, "up");
    }
  });
  let { positions, indices } = mesh;
  const scooped = settings.boxPart === "box" && !plug ? scoopPieces(settings, outer, cells, islands, floorTop) : [];
  if (plate || scooped.length > 0 || pockets) {
    // The sockets and the scoops need Manifold: until it has loaded the floor is drawn plain and asks for it (manifoldRevision in the cache key).
    const runtime = loadedManifoldRuntime();
    if (!runtime) requestManifoldRuntime();
    else {
      let body: Array<[number, number, number][]> = [];
      for (let i = 0; i < indices.length; i += 3) {
        body.push([0, 1, 2].map((k) => [positions[indices[i + k] * 3], positions[indices[i + k] * 3 + 1], positions[indices[i + k] * 3 + 2]] as [number, number, number]));
      }
      if (scooped.length > 0) body = joinScoops(runtime, body, scooped, floorTop);
      if (pockets) body = cutPockets(runtime, body, settings, outer, pockets);
      // The mesh holds its heights as 32-bit numbers: the sockets' top is put on exactly the floor's, or a sliver is left between them.
      if (plate) body = gridfinityCutSockets(runtime, body, plate.cells, Math.fround(floorTop) - GRIDFINITY_BASEPLATE_HEIGHT);
      positions = body.flat(2);
      indices = Array.from({ length: positions.length / 3 }, (_, k) => k);
    }
  }
  return geometryOf(positions, indices);
}

function geometryOf(positions: number[], indices: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  // Unindexed, so every face keeps its own flat normal and the edges stay sharp.
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

export function boxGeneratorFieldsOf(shape: Partial<WorkplaneShape>): BoxGeneratorFields {
  return {
    boxShape: shape.boxShape,
    boxSides: shape.boxSides,
    boxCornerRadius: shape.boxCornerRadius,
    boxWall: shape.boxWall,
    boxFloor: shape.boxFloor,
    boxColumns: shape.boxColumns,
    boxRows: shape.boxRows,
    boxDivider: shape.boxDivider,
    boxDividerMode: shape.boxDividerMode,
    boxWalls: shape.boxWalls,
    boxScoops: shape.boxScoops,
    boxScoopRadius: shape.boxScoopRadius,
    boxPockets: shape.boxPockets,
    boxPocketFill: shape.boxPocketFill,
    boxInsert: shape.boxInsert,
    boxPart: shape.boxPart,
    boxLidStyle: shape.boxLidStyle,
    boxLidPlate: shape.boxLidPlate,
    boxFit: shape.boxFit,
    boxLidCompartments: shape.boxLidCompartments,
    boxGridfinity: shape.boxGridfinity,
    boxGridfinityColumns: shape.boxGridfinityColumns,
    boxGridfinityRows: shape.boxGridfinityRows,
    boxGridfinityFloor: shape.boxGridfinityFloor,
    boxGridfinityPlate: shape.boxGridfinityPlate,
    boxStackable: shape.boxStackable,
    boxStackHeight: shape.boxStackHeight,
  };
}

export function createBoxGeneratorGeometryForShape(shape: Pick<WorkplaneShape, "width" | "depth" | "height"> & Partial<WorkplaneShape>) {
  return createBoxGeneratorGeometry(
    { width: shape.width, depth: shape.depth ?? shape.width, height: shape.height },
    boxGeneratorFieldsOf(shape),
  );
}
