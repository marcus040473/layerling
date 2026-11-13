import * as THREE from "three";
import type { WorkplaneShape } from "@/types/layerling";
import type { ManifoldToplevel } from "manifold-3d";
import { GRIDFINITY_BASEPLATE_HEIGHT, GRIDFINITY_BASEPLATE_RADIUS, GRIDFINITY_DRAWER_CLEARANCE, GRIDFINITY_FLOOR, GRIDFINITY_GRID, MAX_GRIDFINITY_LARGE_PLATE_UNITS, gridfinityCutSockets, gridfinityOutlineCells, manifoldOfTriangles, trianglesOfManifold } from "@/lib/gridfinityGeometry";
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
 * are one piece with the wall and floor. Part "lid" is the lid, printed top side down: a plate, and for the style
 * "overlap" a skirt that goes down over the outside of the box, for "plug" a ring that stands up from the plate and fits
 * inside the box. Both parts take the same settings, so a box and its lid
 * are two copies of the shape with another part. The width and depth are always those of the part itself; for an
 * overlapping lid boxGeneratorMatchingLidSize gives the size that fits a box.
 *
 * Latches (boxLatches) are clips as on a camera battery box: the box and its lid each carry a pin held by two cheeks on the
 * outside of the wall, close to where they meet, and part "latch" is the clip, a short strip with a C-shaped socket at
 * each end that snaps over both pins. The socket over the lid's pin stays on and turns, so the clip swings down over the
 * box's pin and snaps on; pulled at its tab it comes off the box's pin and hangs from the lid. The cheeks and pins are
 * joined to the wall by Manifold: until it has loaded the part is drawn without them and asks for it. The clip is drawn
 * as it prints, on its side, with its profile on the bed, so the sockets need no support and flex along the layers.
 *
 * The wall of an ellipse is not exactly even where width and depth differ, as the inside is cut from facets of the
 * outline, not from a true parallel curve; the difference stays under a tenth of a millimetre for ordinary boxes.
 */

export type BoxGeneratorShape = "rectangle" | "round" | "polygon";
export type BoxGeneratorPart = "box" | "lid" | "latch";
export type BoxGeneratorLidStyle = "restOn" | "overlap" | "plug";
/** Which sides of the box carry latches: front and back, left and right, or all four. */
export type BoxGeneratorLatchSides = "frontBack" | "leftRight" | "all";

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
export const MAX_BOX_GENERATOR_LATCHES = 4;
export const DEFAULT_BOX_GENERATOR_LATCH_WIDTH = 12;
export const MIN_BOX_GENERATOR_LATCH_WIDTH = 6;
export const MAX_BOX_GENERATOR_LATCH_WIDTH = 40;
export const DEFAULT_BOX_GENERATOR_LATCH_GRIP = 0.3;
export const MIN_BOX_GENERATOR_LATCH_GRIP = 0.05;
export const MAX_BOX_GENERATOR_LATCH_GRIP = 1;
/** The play between a pin and its socket, mm, so the clip turns on the lid's pin. */
const LATCH_PIN_PLAY = 0.15;
/** The room between the wall and the clip's sockets, mm. */
const LATCH_WALL_GAP = 0.6;
/** The play on each side between the clip and the cheeks that hold the pin, mm. */
const LATCH_SIDE_PLAY = 0.4;
/** How far the clip reaches past the box's pin as a tab to pull it open, mm. */
const LATCH_TAB = 6;
/** How deep the cheeks reach into the wall, so they are one body with it, mm. */
const LATCH_EMBED = 0.6;
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
  boxLatches?: number;
  boxLatchSides?: BoxGeneratorLatchSides;
  boxLatchWidth?: number;
  boxLatchGrip?: number;
};

export type BoxGeneratorSize = { width: number; depth: number; height: number };

export type BoxGeneratorIssue =
  | { code: "wallTooThick" }
  | { code: "compartmentSolid"; count: number }
  | { code: "lidNoSkirt" }
  | { code: "stackWallThin" }
  | { code: "plateTooLow" }
  | { code: "plateNoCell" }
  | { code: "stackTooLow" }
  | { code: "latchLidStyle" }
  | { code: "latchOutline" }
  | { code: "latchNoRoom" }
  | { code: "latchLow" }
  | { code: "latchCurved" };

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
  return value === "lid" || value === "latch" ? value : "box";
}

export function normalizeBoxGeneratorLatchSides(value: unknown): BoxGeneratorLatchSides {
  return value === "leftRight" || value === "all" ? value : "frontBack";
}

export function normalizeBoxGeneratorLidStyle(value: unknown): BoxGeneratorLidStyle {
  return value === "overlap" || value === "plug" ? value : "restOn";
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
    boxLatches: Math.round(clamp(finite(fields.boxLatches, 0), 0, MAX_BOX_GENERATOR_LATCHES)),
    boxLatchSides: normalizeBoxGeneratorLatchSides(fields.boxLatchSides),
    boxLatchWidth: clamp(finite(fields.boxLatchWidth, DEFAULT_BOX_GENERATOR_LATCH_WIDTH), MIN_BOX_GENERATOR_LATCH_WIDTH, MAX_BOX_GENERATOR_LATCH_WIDTH),
    boxLatchGrip: clamp(finite(fields.boxLatchGrip, DEFAULT_BOX_GENERATOR_LATCH_GRIP), MIN_BOX_GENERATOR_LATCH_GRIP, MAX_BOX_GENERATOR_LATCH_GRIP),
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

export type BoxGeneratorPlan = {
  settings: NormalizedBoxGenerator;
  outer: Point[];
  /** The openings in the part's top: compartments of a box, the space inside the skirt of an overlapping lid. */
  cells: Point[][];
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
  /**
   * The latches of a box or a resting lid: where each pin sits on the wall (`spots`), the height of the pins above the
   * bed (`pinY`) and how the cheeks are built (the clip's measures). Null without latches or when they cannot be made.
   */
  latches: { spots: BoxGeneratorLatchSpot[]; pinY: number; measures: BoxGeneratorLatchMeasures } | null;
  /** Part "latch": the clip's profile as it lies on the bed (x along the clip, z across it), centred on the origin. */
  clip: Point[] | null;
  issues: BoxGeneratorIssue[];
};

/**
 * The measures of a latch, all from the clip's width and its grip: the pin, the clip's sockets round it, how far each pin
 * sits from where box and lid meet, and the cheeks beside the clip that hold the pin. The clip and the cheeks of box and
 * lid are made from these alone, so a clip fits every box and lid with the same latch settings.
 */
export type BoxGeneratorLatchMeasures = {
  width: number;
  grip: number;
  /** Pin radius. */
  pin: number;
  /** Radius of the socket round the pin (pin and play) and of the socket's outside. */
  socket: number;
  rim: number;
  /** Half the opening of a socket: the pin is wider than the opening by the grip. */
  opening: number;
  /** How far the pin's middle stands out from the wall. */
  reach: number;
  /** How far each pin sits from where box and lid meet; the pins are twice this apart. */
  offset: number;
  /** Radius of a cheek round the pin, and the cheek's thickness along the pin. */
  cheekRadius: number;
  cheek: number;
  /** The width along the wall that one latch takes: the clip, its play and both cheeks. */
  span: number;
  tab: number;
};

export function boxGeneratorLatchMeasures(fields: BoxGeneratorFields = {}): BoxGeneratorLatchMeasures {
  const width = clamp(finite(fields.boxLatchWidth, DEFAULT_BOX_GENERATOR_LATCH_WIDTH), MIN_BOX_GENERATOR_LATCH_WIDTH, MAX_BOX_GENERATOR_LATCH_WIDTH);
  const grip = clamp(finite(fields.boxLatchGrip, DEFAULT_BOX_GENERATOR_LATCH_GRIP), MIN_BOX_GENERATOR_LATCH_GRIP, MAX_BOX_GENERATOR_LATCH_GRIP);
  // A pin a quarter as thick as the clip is wide, 2.5 to 5 mm: 3 mm for the 12 mm clip.
  const diameter = clamp(width / 4, 2.5, 5);
  const pin = diameter / 2;
  const socket = pin + LATCH_PIN_PLAY;
  const rim = socket + clamp(diameter / 2, 1.2, 2.5);
  const opening = (diameter - grip) / 2;
  // The socket's two ends stop where its opening is as wide as the pin less the grip, the wall gap away from the wall.
  const reach = LATCH_WALL_GAP + Math.sqrt(socket * socket - opening * opening);
  const cheekRadius = pin + clamp(diameter * 0.4, 1, 2);
  const cheek = clamp(diameter * 0.8, 2, 4);
  return {
    width,
    grip,
    pin,
    socket,
    rim,
    opening,
    reach,
    offset: rim + 1.5,
    cheekRadius,
    cheek,
    span: width + 2 * (LATCH_SIDE_PLAY + cheek),
    tab: LATCH_TAB,
  };
}

/**
 * The clip's profile: a strip with a C-shaped socket at each end, the sockets open towards the wall. In the profile's own
 * frame v runs along the clip from the box's pin (v = 0) to the lid's (v = 2 x offset) and n away from the wall (the pins'
 * middles at n = reach). Below the box's pin the strip goes on as a tab. Clockwise.
 */
export function boxGeneratorLatchClipProfile(measures: BoxGeneratorLatchMeasures): Array<{ v: number; n: number }> {
  const { socket, rim, opening, reach, offset, tab } = measures;
  const length = 2 * offset;
  const below = Math.sqrt(socket * socket - opening * opening);
  const outerEnd = Math.sqrt(rim * rim - below * below);
  const out: Array<{ v: number; n: number }> = [];
  const arc = (centre: number, radius: number, from: number, to: number) => {
    const steps = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 24)));
    for (let step = 0; step <= steps; step += 1) {
      const angle = from + ((to - from) * step) / steps;
      out.push({ v: centre + Math.cos(angle) * radius, n: reach + Math.sin(angle) * radius });
    }
  };
  const lowOuter = Math.asin(below / rim);
  const lowInner = Math.asin(below / socket);
  /** One socket: down the outside on the far side, in along its end, round the inside, out along the other end, up. */
  const socketAt = (centre: number, from: number) => {
    arc(centre, rim, from, -lowOuter);
    out.push({ v: centre + outerEnd, n: reach - below });
    arc(centre, socket, -lowInner, Math.PI + lowInner);
    out.push({ v: centre - outerEnd, n: reach - below });
    arc(centre, rim, Math.PI + lowOuter, Math.PI);
  };
  out.push({ v: -rim - tab, n: reach + rim });
  // Along the outside face to the lid's socket, round it, back along the inside face to the box's socket, round it, the tab.
  socketAt(length, Math.PI / 2);
  socketAt(0, 0);
  out.push({ v: -rim - tab, n: reach });
  return out.filter((point, index) => {
    const next = out[(index + 1) % out.length];
    return Math.hypot(next.v - point.v, next.n - point.n) > 1e-6;
  });
}

/** The clip as it prints: its profile on the bed, centred on the origin, and its size (the width is its length). */
export function boxGeneratorLatchClip(fields: BoxGeneratorFields = {}) {
  const measures = boxGeneratorLatchMeasures(fields);
  const profile = boxGeneratorLatchClipProfile(measures);
  let minV = Infinity;
  let maxV = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const point of profile) {
    minV = Math.min(minV, point.v);
    maxV = Math.max(maxV, point.v);
    minN = Math.min(minN, point.n);
    maxN = Math.max(maxN, point.n);
  }
  const outline = counterClockwise(profile.map((point) => ({ x: point.v - (minV + maxV) / 2, z: point.n - (minN + maxN) / 2 })));
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { measures, outline, size: { width: round(maxV - minV), depth: round(maxN - minN), height: measures.width } };
}

/**
 * One latch's place on the wall: `origin` is the point of the wall the cheeks stand on (the innermost point of the wall
 * under the latch), `normal` points out of the wall and `along` along it; `bulge` is how far the wall comes out beyond
 * the origin under the latch (a round wall), so the pin stands that much further out.
 */
export type BoxGeneratorLatchSpot = { origin: Point; normal: Point; along: Point; bulge: number };

/** How far from `origin` along `dir` the line through them leaves a convex outline, or null when it misses it. */
function reachOut(outline: Point[], origin: Point, dir: Point): number | null {
  let best: number | null = null;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const det = dir.x * -ez - dir.z * -ex;
    if (Math.abs(det) < 1e-12) continue;
    const rx = a.x - origin.x;
    const rz = a.z - origin.z;
    const lambda = (rx * -ez - rz * -ex) / det;
    const mu = (dir.x * rz - dir.z * rx) / det;
    if (mu < -1e-9 || mu > 1 + 1e-9) continue;
    if (best === null || lambda > best) best = lambda;
  }
  return best;
}

/**
 * Where the latches sit on a part's outline: `count` on each chosen side, spread evenly along it (one in the middle, two
 * at a quarter from each end, ...). Each latch faces straight out of the wall under it. A side too short for its latches
 * gets none, and a latch over a wall that curves more than the wall is thick is left out.
 */
export function boxGeneratorLatchSpots(outer: Point[], settings: NormalizedBoxGenerator, measures: BoxGeneratorLatchMeasures, issues: BoxGeneratorIssue[]) {
  const spots: BoxGeneratorLatchSpot[] = [];
  const count = settings.boxLatches;
  const sides: Array<{ out: Point; along: Point; length: number }> = [];
  if (settings.boxLatchSides !== "leftRight") sides.push({ out: { x: 0, z: 1 }, along: { x: 1, z: 0 }, length: settings.width }, { out: { x: 0, z: -1 }, along: { x: -1, z: 0 }, length: settings.width });
  if (settings.boxLatchSides !== "frontBack") sides.push({ out: { x: 1, z: 0 }, along: { x: 0, z: -1 }, length: settings.depth }, { out: { x: -1, z: 0 }, along: { x: 0, z: 1 }, length: settings.depth });
  const half = measures.span / 2;
  let noRoom = false;
  let curved = false;
  for (const side of sides) {
    if (side.length / count < measures.span + 2) {
      noRoom = true;
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      const s = -side.length / 2 + (side.length * (index + 0.5)) / count;
      const wallAt = (t: number) => {
        const from = { x: side.along.x * t, z: side.along.z * t };
        const lambda = reachOut(outer, from, side.out);
        return lambda === null ? null : { x: from.x + side.out.x * lambda, z: from.z + side.out.z * lambda };
      };
      const a = wallAt(s - half);
      const b = wallAt(s + half);
      const middle = wallAt(s);
      if (!a || !b || !middle) {
        noRoom = true;
        continue;
      }
      // The wall under the latch, straightened: along the line between its ends, facing out.
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const along = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      let normal = { x: along.z, z: -along.x };
      if (normal.x * side.out.x + normal.z * side.out.z < 0) normal = { x: -normal.x, z: -normal.z };
      let low = Infinity;
      let high = -Infinity;
      for (let step = 0; step <= 16; step += 1) {
        const t = -half + (measures.span * step) / 16;
        const lambda = reachOut(outer, { x: middle.x + along.x * t, z: middle.z + along.z * t }, normal);
        if (lambda === null) continue;
        low = Math.min(low, lambda);
        high = Math.max(high, lambda);
      }
      if (!Number.isFinite(low) || high - low + LATCH_EMBED >= settings.boxWall) {
        curved = true;
        continue;
      }
      spots.push({ origin: { x: middle.x + normal.x * low, z: middle.z + normal.z * low }, normal, along, bulge: high - low });
    }
  }
  if (noRoom) issues.push({ code: "latchNoRoom" });
  if (curved) issues.push({ code: "latchCurved" });
  return spots;
}

/** How high a resting lid must be for its latches: the clip's socket stays on the lid, above the stacking collar if any. */
export function boxGeneratorLatchLidHeight(fields: BoxGeneratorFields = {}) {
  const measures = boxGeneratorLatchMeasures(fields);
  const stack = fields.boxStackable === true ? clamp(finite(fields.boxStackHeight, DEFAULT_BOX_GENERATOR_STACK_HEIGHT), MIN_BOX_GENERATOR_STACK_HEIGHT, MAX_BOX_GENERATOR_STACK_HEIGHT) : 0;
  return Math.ceil((measures.offset + measures.rim + 0.5 + stack) * 2) / 2;
}

/** How high a box or a resting lid must be for its latches, mm (the box: the clip with its tab below the rim, and the collar). */
export function boxGeneratorLatchHeight(fields: BoxGeneratorFields = {}) {
  if (fields.boxPart === "lid") return boxGeneratorLatchLidHeight(fields);
  const measures = boxGeneratorLatchMeasures(fields);
  const stack = fields.boxStackable === true ? clamp(finite(fields.boxStackHeight, DEFAULT_BOX_GENERATOR_STACK_HEIGHT), MIN_BOX_GENERATOR_STACK_HEIGHT, MAX_BOX_GENERATOR_STACK_HEIGHT) : 0;
  return Math.ceil((measures.offset + measures.rim + measures.tab + stack) * 2) / 2;
}

/** The plan with the latches of a box or a resting lid worked out, or the issue that keeps them away. */
function withLatches(plan: Omit<BoxGeneratorPlan, "latches" | "clip">): BoxGeneratorPlan {
  const { settings, issues } = plan;
  const none = { ...plan, latches: null, clip: null };
  if (settings.boxLatches < 1 || settings.boxPart === "latch") return none;
  if (settings.boxLidStyle !== "restOn") {
    issues.push({ code: "latchLidStyle" });
    return none;
  }
  if (settings.boxShape === "polygon") {
    issues.push({ code: "latchOutline" });
    return none;
  }
  const measures = boxGeneratorLatchMeasures(settings);
  const lift = plan.stack ? plan.stack.height : 0;
  // Where box and lid meet, and which way the other part lies: the box's rim (below its collar when it stacks); a resting
  // lid printed top side down meets the box at its top, a stackable one stands on its foot and meets the box there.
  let pinY: number;
  let room: number;
  if (settings.boxPart === "box") {
    const joint = settings.height - lift;
    pinY = joint - measures.offset;
    room = joint - (measures.offset + measures.rim + measures.tab);
  } else if (plan.stack) {
    pinY = measures.offset;
    room = settings.height - lift - (measures.offset + measures.rim + 0.5);
  } else {
    pinY = settings.height - measures.offset;
    room = settings.height - (measures.offset + measures.rim + 0.5);
  }
  if (room < -1e-6) {
    issues.push({ code: "latchLow" });
    return none;
  }
  const spots = boxGeneratorLatchSpots(plan.outer, settings, measures, issues);
  return { ...plan, latches: spots.length ? { spots, pinY, measures } : null, clip: null };
}

/** The 2D plan of the part: its outline, and the cells that are cut down into it from the top. */
export function boxGeneratorPlan(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): BoxGeneratorPlan {
  const settings = normalizeBoxGenerator(size, fields);
  if (settings.boxPart === "latch") {
    const clip = boxGeneratorLatchClip(settings);
    return { settings, outer: clip.outline, cells: [], floorTop: 0, stack: null, plate: null, plug: null, latches: null, clip: clip.outline, issues: [] };
  }
  return withLatches(boxGeneratorBasePlan(settings));
}

function boxGeneratorBasePlan(settings: NormalizedBoxGenerator): Omit<BoxGeneratorPlan, "latches" | "clip"> {
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
    if (settings.boxLidStyle === "restOn") {
      // With latches the lid is a shallow tray, plate on the bed and its rim on the box's, so the cheeks have a wall to stand on.
      if (settings.boxLatches > 0 && inner && settings.boxShape !== "polygon") {
        return { settings, outer, cells: [inner], floorTop: Math.min(settings.boxLidPlate, settings.height - 0.5), stack: null, plate: null, plug: null, issues };
      }
      return { settings, outer, cells: [], floorTop: settings.height, stack: null, plate: null, plug: null, issues };
    }
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
 * style, stacking, latches) stays the box's own, so the two fit. With latches a resting lid is high enough for them.
 */
export function boxGeneratorMatchingLidPatch(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}) {
  const settings = normalizeBoxGenerator(size, fields);
  const grown = settings.boxLidStyle === "overlap" ? boxGeneratorMatchingLidSize(size, settings.boxWall, settings.boxFit) : { width: size.width, depth: size.depth };
  let height = 10;
  if (settings.boxLidStyle === "restOn") {
    const room = 2 * settings.boxStackHeight + STACK_GROOVE_EXTRA + MIN_STACK_RING + 1;
    height = settings.boxStackable ? Math.ceil(room * 2) / 2 : 3;
    // Latches want a lid high enough for the clip's socket to sit on it.
    if (settings.boxLatches > 0 && settings.boxShape !== "polygon") height = Math.max(height, boxGeneratorLatchLidHeight(settings));
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
  const { outer, cells, floorTop, settings, stack, plate, plug, latches, clip } = boxGeneratorPlan(size, fields);
  const mesh: MeshBuilder = { positions: [], indices: [] };
  if (clip) {
    // The clip on its side: its profile on the bed, as high as the clip is wide.
    addCap(mesh, clip, [], 0, "down");
    addWall(mesh, clip, 0, settings.boxLatchWidth, "out");
    addCap(mesh, clip, [], settings.boxLatchWidth, "up");
  } else if (plug) {
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
  for (const cell of cells) {
    addWall(mesh, cell, floorTop, settings.height, "in");
    addCap(mesh, cell, [], floorTop, "up");
  }
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
  if (latches) {
    // The cheeks and pins are joined to the wall by Manifold: until it has loaded the part is drawn without them.
    const runtime = loadedManifoldRuntime();
    if (!runtime) requestManifoldRuntime();
    else {
      const body: Array<[number, number, number][]> = [];
      for (let i = 0; i < indices.length; i += 3) {
        body.push([0, 1, 2].map((k) => [positions[indices[i + k] * 3], positions[indices[i + k] * 3 + 1], positions[indices[i + k] * 3 + 2]] as [number, number, number]));
      }
      const joined = boxGeneratorJoinLatches(runtime, body, latches);
      if (joined !== body) {
        positions = joined.flat(2);
        indices = Array.from({ length: positions.length / 3 }, (_, k) => k);
      }
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

type Vec3 = [number, number, number];

/**
 * The cheeks and pin of each latch as convex point sets, in the part's own frame. A cheek is the hull of a disc round the
 * pin and the wall under it, its underside sloping down to the wall at 45° so it prints without support; it reaches a
 * little into the wall to be one body with it. The pin runs from the middle of one cheek to the middle of the other.
 */
export function boxGeneratorLatchSolids(latches: NonNullable<BoxGeneratorPlan["latches"]>): Vec3[][] {
  const { spots, pinY, measures } = latches;
  const solids: Vec3[][] = [];
  const steps = 24;
  for (const spot of spots) {
    const reach = spot.bulge + measures.reach;
    const at = (t: number, y: number, n: number): Vec3 => [
      spot.origin.x + spot.along.x * t + spot.normal.x * n,
      y,
      spot.origin.z + spot.along.z * t + spot.normal.z * n,
    ];
    const inside = measures.width / 2 + LATCH_SIDE_PLAY;
    for (const sign of [-1, 1]) {
      const t0 = sign * inside;
      const t1 = sign * (inside + measures.cheek);
      const cheek: Vec3[] = [];
      for (const t of [t0, t1]) {
        for (let step = 0; step < steps; step += 1) {
          const angle = (step / steps) * Math.PI * 2;
          cheek.push(at(t, pinY + Math.cos(angle) * measures.cheekRadius, reach + Math.sin(angle) * measures.cheekRadius));
        }
        cheek.push(at(t, pinY + measures.cheekRadius, -LATCH_EMBED));
        cheek.push(at(t, pinY - reach - LATCH_EMBED - measures.cheekRadius * Math.SQRT2, -LATCH_EMBED));
      }
      solids.push(cheek);
    }
    const pin: Vec3[] = [];
    const end = inside + measures.cheek / 2;
    for (const t of [-end, end]) {
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        pin.push(at(t, pinY + Math.cos(angle) * measures.pin, reach + Math.sin(angle) * measures.pin));
      }
    }
    solids.push(pin);
  }
  return solids;
}

/** A part's body with its latches' cheeks and pins joined on, nothing below the bed; the body as it was if that fails. */
function boxGeneratorJoinLatches(runtime: ManifoldToplevel, bodyTriangles: Vec3[][], latches: NonNullable<BoxGeneratorPlan["latches"]>): Vec3[][] {
  const { Manifold } = runtime;
  const made: Array<{ delete: () => void }> = [];
  const keep = <T extends { delete: () => void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    const body = keep(manifoldOfTriangles(runtime, bodyTriangles));
    const solids = boxGeneratorLatchSolids(latches).map((points) => keep(Manifold.hull(points)));
    const mounts = keep(keep(Manifold.union(solids)).trimByPlane([0, 1, 0], 0));
    const result = keep(Manifold.union(body, mounts));
    return result.status() === "NoError" && !result.isEmpty() ? trianglesOfManifold(result) : bodyTriangles;
  } catch {
    return bodyTriangles;
  } finally {
    new Set(made).forEach((value) => value.delete());
  }
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
    boxLatches: shape.boxLatches,
    boxLatchSides: shape.boxLatchSides,
    boxLatchWidth: shape.boxLatchWidth,
    boxLatchGrip: shape.boxLatchGrip,
  };
}

export function createBoxGeneratorGeometryForShape(shape: Pick<WorkplaneShape, "width" | "depth" | "height"> & Partial<WorkplaneShape>) {
  return createBoxGeneratorGeometry(
    { width: shape.width, depth: shape.depth ?? shape.width, height: shape.height },
    boxGeneratorFieldsOf(shape),
  );
}
