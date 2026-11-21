import * as THREE from "three";
import type { WorkplaneShape } from "@/types/layerling";
import { GRIDFINITY_BASEPLATE_HEIGHT, GRIDFINITY_BASEPLATE_RADIUS, GRIDFINITY_DRAWER_CLEARANCE, GRIDFINITY_FLOOR, GRIDFINITY_GRID, MAX_GRIDFINITY_LARGE_PLATE_UNITS, gridfinityCutSockets, gridfinityOutlineCells } from "@/lib/gridfinityGeometry";
import { loadedManifoldRuntime, requestManifoldRuntime } from "@/lib/manifoldHandle";

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
 * asked to be: from wall to wall, from a wall to somewhere inside, or standing free. Part "lid" is the lid, printed top side down: a plate, and for the style
 * "overlap" a skirt that goes down over the outside of the box, for "plug" a ring that stands up from the plate and fits
 * inside the box. Both parts take the same settings, so a box and its lid
 * are two copies of the shape with another part. The width and depth are always those of the part itself; for an
 * overlapping lid boxGeneratorMatchingLidSize gives the size that fits a box.
 *
 * The wall of an ellipse is not exactly even where width and depth differ, as the inside is cut from facets of the
 * outline, not from a true parallel curve; the difference stays under a tenth of a millimetre for ordinary boxes.
 */

export type BoxGeneratorShape = "rectangle" | "round" | "polygon";
export type BoxGeneratorPart = "box" | "lid";
export type BoxGeneratorLidStyle = "restOn" | "overlap" | "plug";
export type BoxGeneratorDividerMode = "grid" | "manual";
/**
 * A divider set by hand. `dir` "x" is a wall that runs along the width (left to right), "z" one that runs along the depth
 * (back to front). All measures are in mm from the inside of the box, from its left and its back: `at` to the middle of
 * the wall across its run, `from` and `to` where it begins and ends along its run. For a round or many-sided box the
 * inside is measured at its widest and deepest, and the wall ends where it meets the box's wall.
 */
export type BoxGeneratorWall = { dir: "x" | "z"; at: number; from: number; to: number };

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
export const MIN_BOX_GENERATOR_WALL = 0.4;
export const MIN_BOX_GENERATOR_SIDES = 3;
export const MAX_BOX_GENERATOR_SIDES = 12;
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
  boxPart?: BoxGeneratorPart;
  boxLidStyle?: BoxGeneratorLidStyle;
  boxLidPlate?: number;
  boxFit?: number;
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
  return value === "lid" ? "lid" : "box";
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
    walls.push({ dir: wall.dir, at: measure(wall.at as number), from: Math.min(a, b), to: Math.max(a, b) });
  }
  return walls;
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
  return a.length === b.length && a.every((wall, index) => wall.dir === b[index].dir && wall.at === b[index].at && wall.from === b[index].from && wall.to === b[index].to);
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
    boxPart: normalizeBoxGeneratorPart(fields.boxPart),
    boxLidStyle: normalizeBoxGeneratorLidStyle(fields.boxLidStyle),
    boxLidPlate: clamp(finite(fields.boxLidPlate, DEFAULT_BOX_GENERATOR_LID_PLATE), MIN_BOX_GENERATOR_WALL, Math.max(MIN_BOX_GENERATOR_WALL, height - 0.5)),
    boxFit: clamp(finite(fields.boxFit, DEFAULT_BOX_GENERATOR_FIT), 0, MAX_BOX_GENERATOR_FIT),
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
 * The dividers set by hand that lie inside a box whose inside is `width` by `depth` at its widest and deepest: each one
 * held inside it, and those left shorter than a wall may be, dropped. The stored list is not changed by this, so a wall
 * that a smaller box cuts short is whole again when the box grows.
 */
export function boxGeneratorWallsInside(walls: readonly BoxGeneratorWall[], width: number, depth: number): BoxGeneratorWall[] {
  return walls.flatMap((wall) => {
    const run = wall.dir === "x" ? width : depth;
    const across = wall.dir === "x" ? depth : width;
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
  if (settings.boxPart !== "box") return null;
  const inner = insetConvex(counterClockwise(boxGeneratorOutline(settings)), settings.boxWall);
  if (!inner) return null;
  const box = bounds(inner);
  const shift = (points: Point[]) => points.map((point) => ({ x: point.x - box.minX, z: point.z - box.minZ }));
  const compartments: BoxGeneratorCompartment[] = boxGeneratorPlan(size, fields).cells.map((cell) => {
    const outline = shift(cell);
    return { outline, ...bounds(outline), label: pointInside(outline) };
  });
  return { width: box.maxX - box.minX, depth: box.maxZ - box.minZ, outline: shift(inner), compartments };
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
  /** A plug lid: the ring that fits into the box (`outline`, with `hole` as the ring's inside, null for a solid plug) and the plate's thickness. */
  plug: { outline: Point[]; hole: Point[] | null; plate: number } | null;
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
      return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: { outline: plug, hole, plate: platePart }, issues };
    }
    if (settings.boxLidStyle === "restOn") return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
    if (!inner) {
      issues.push({ code: "lidNoSkirt" });
      return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
    }
    return { settings, outer, cells: [inner], floorTop: Math.min(settings.boxLidPlate, settings.height - 0.5), stack: null, plate: null, plug: null, issues };
  }

  // The lid of a stackable box has its plate for a floor and one open space for its cavity.
  const use = stackedLid ? { ...settings, boxFloor: settings.boxLidPlate, boxColumns: 1, boxRows: 1, boxGridfinityPlate: false } : settings;
  let floorTop = Math.min(use.boxFloor, settings.height - 0.5);
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
  const box = bounds(inner);
  if (use.boxDividerMode === "manual" && !stackedLid) {
    // Dividers set by hand: what is left of the inside when every wall's strip is taken out of it.
    const half = use.boxDivider / 2;
    const strips = boxGeneratorWallsInside(use.boxWalls, box.maxX - box.minX, box.maxZ - box.minZ).map((wall) => wall.dir === "x"
      ? { minX: box.minX + wall.from, maxX: box.minX + wall.to, minZ: box.minZ + wall.at - half, maxZ: box.minZ + wall.at + half }
      : { minX: box.minX + wall.at - half, maxX: box.minX + wall.at + half, minZ: box.minZ + wall.from, maxZ: box.minZ + wall.to });
    const room = openRegions(inner, strips);
    if (room.solid > 0) issues.push({ code: "compartmentSolid", count: room.solid });
    const islands = room.regions.map((region) => region.holes);
    return { settings, outer, cells: room.regions.map((region) => region.outline), islands: islands.some((list) => list.length > 0) ? islands : undefined, floorTop, stack, plate, plug: null, issues };
  }
  const { boxColumns: columns, boxRows: rows, boxDivider: divider } = use;
  const cellWidth = (box.maxX - box.minX - (columns - 1) * divider) / columns;
  const cellDepth = (box.maxZ - box.minZ - (rows - 1) * divider) / rows;
  const cells: Point[][] = [];
  let solid = 0;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x0 = box.minX + column * (cellWidth + divider);
      const z0 = box.minZ + row * (cellDepth + divider);
      const cell = cellWidth > 0 && cellDepth > 0 ? clipRectangle(inner, x0, x0 + cellWidth, z0, z0 + cellDepth) : [];
      const span = cell.length >= 3 ? boundsOf(cell) : { width: 0, depth: 0 };
      if (cell.length >= 3 && Math.min(span.width, span.depth) >= MIN_COMPARTMENT_SPAN) cells.push(dropDuplicates(cell));
      else solid += 1;
    }
  }
  if (solid > 0) issues.push({ code: "compartmentSolid", count: solid });
  return { settings, outer, cells, floorTop, stack, plate, plug: null, issues };
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
 * The closed solid of a part from y = 0 to the height: the bottom, the outer wall, the top face between outline and
 * cells, the cells' walls facing inward and the floor of each cell.
 */
export function createBoxGeneratorGeometry(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): THREE.BufferGeometry {
  const { outer, cells, islands, floorTop, settings, stack, plate, plug } = boxGeneratorPlan(size, fields);
  const mesh: MeshBuilder = { positions: [], indices: [] };
  if (plug) {
    // The plate on the bed, the ring standing up from it: its outside, its top, and its inside down to the plate.
    addCap(mesh, outer, [], 0, "down");
    addWall(mesh, outer, 0, plug.plate, "out");
    addCap(mesh, outer, [plug.outline], plug.plate, "up");
    addWall(mesh, plug.outline, plug.plate, settings.height, "out");
    addCap(mesh, plug.outline, plug.hole ? [plug.hole] : [], settings.height, "up");
    if (plug.hole) {
      addWall(mesh, plug.hole, plug.plate, settings.height, "in");
      addCap(mesh, plug.hole, [], plug.plate, "up");
    }
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
  if (plate) {
    // The sockets need Manifold: until it has loaded the floor is drawn plain and asks for it (manifoldRevision in the cache key).
    const runtime = loadedManifoldRuntime();
    if (!runtime) requestManifoldRuntime();
    else {
      const body: Array<[number, number, number][]> = [];
      for (let i = 0; i < indices.length; i += 3) {
        body.push([0, 1, 2].map((k) => [positions[indices[i + k] * 3], positions[indices[i + k] * 3 + 1], positions[indices[i + k] * 3 + 2]] as [number, number, number]));
      }
      // The mesh holds its heights as 32-bit numbers: the sockets' top is put on exactly the floor's, or a sliver is left between them.
      const cut = gridfinityCutSockets(runtime, body, plate.cells, Math.fround(floorTop) - GRIDFINITY_BASEPLATE_HEIGHT);
      positions = cut.flat(2);
      indices = Array.from({ length: positions.length / 3 }, (_, k) => k);
    }
  }
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
    boxPart: shape.boxPart,
    boxLidStyle: shape.boxLidStyle,
    boxLidPlate: shape.boxLidPlate,
    boxFit: shape.boxFit,
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
