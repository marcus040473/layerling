import * as THREE from "three";
import type { WorkplaneShape } from "@/types/layerling";
import { GRIDFINITY_DRAWER_CLEARANCE, GRIDFINITY_GRID, MAX_GRIDFINITY_LARGE_PLATE_UNITS, gridfinityOutlineCells } from "@/lib/gridfinityGeometry";

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
 * "overlap" a skirt that goes down over the outside of the box. Both parts take the same settings, so a box and its lid
 * are two copies of the shape with another part. The width and depth are always those of the part itself; for an
 * overlapping lid boxGeneratorMatchingLidSize gives the size that fits a box.
 *
 * The wall of an ellipse is not exactly even where width and depth differ, as the inside is cut from facets of the
 * outline, not from a true parallel curve; the difference stays under a tenth of a millimetre for ordinary boxes.
 */

export type BoxGeneratorShape = "rectangle" | "round" | "polygon";
export type BoxGeneratorPart = "box" | "lid";
export type BoxGeneratorLidStyle = "restOn" | "overlap";

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
};

export type BoxGeneratorSize = { width: number; depth: number; height: number };

export type BoxGeneratorIssue =
  | { code: "wallTooThick" }
  | { code: "compartmentSolid"; count: number }
  | { code: "lidNoSkirt" };

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
  return value === "overlap" ? "overlap" : "restOn";
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
  issues: BoxGeneratorIssue[];
};

/** The 2D plan of the part: its outline, and the cells that are cut down into it from the top. */
export function boxGeneratorPlan(size: BoxGeneratorSize, fields: BoxGeneratorFields = {}): BoxGeneratorPlan {
  const settings = normalizeBoxGenerator(size, fields);
  const outer = counterClockwise(boxGeneratorOutline(settings));
  const issues: BoxGeneratorIssue[] = [];
  const inner = insetConvex(outer, settings.boxWall);

  if (settings.boxPart === "lid") {
    if (settings.boxLidStyle === "restOn") return { settings, outer, cells: [], floorTop: settings.height, issues };
    if (!inner) {
      issues.push({ code: "lidNoSkirt" });
      return { settings, outer, cells: [], floorTop: settings.height, issues };
    }
    return { settings, outer, cells: [inner], floorTop: Math.min(settings.boxLidPlate, settings.height - 0.5), issues };
  }

  const floorTop = Math.min(settings.boxFloor, settings.height - 0.5);
  if (!inner) {
    issues.push({ code: "wallTooThick" });
    return { settings, outer, cells: [], floorTop: settings.height, issues };
  }
  const box = bounds(inner);
  const { boxColumns: columns, boxRows: rows, boxDivider: divider } = settings;
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
  return { settings, outer, cells, floorTop, issues };
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
  const width = Math.round((settings.width - 2 * settings.boxWall) * 100) / 100;
  const depth = Math.round((settings.depth - 2 * settings.boxWall) * 100) / 100;
  return { width, depth, columns: Math.floor(width / GRIDFINITY_GRID + 1e-9), rows: Math.floor(depth / GRIDFINITY_GRID + 1e-9) };
}

/** The baseplate of a grid of Gridfinity cells, in mm: the cells of the grid and the play the drawer clearance leaves. */
function gridfinityPlate(columns: number, rows: number) {
  return { width: columns * GRIDFINITY_GRID + GRIDFINITY_DRAWER_CLEARANCE, depth: rows * GRIDFINITY_GRID + GRIDFINITY_DRAWER_CLEARANCE };
}

/** The outer size of a rectangular box whose inside holds a Gridfinity baseplate of this many cells with its play. */
export function boxGeneratorGridfinityBoxSize(columns: number, rows: number, wall: number) {
  const plate = gridfinityPlate(Math.max(1, Math.round(columns)), Math.max(1, Math.round(rows)));
  const grow = 2 * Math.max(0, wall);
  return { width: Math.round((plate.width + grow) * 100) / 100, depth: Math.round((plate.depth + grow) * 100) / 100 };
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
    if (rectangle) return plate.width <= innerWidth + 1e-6 && plate.depth <= innerDepth + 1e-6;
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
  const { outer, cells, floorTop, settings } = boxGeneratorPlan(size, fields);
  const mesh: MeshBuilder = { positions: [], indices: [] };
  addCap(mesh, outer, [], 0, "down");
  addWall(mesh, outer, 0, settings.height, "out");
  addCap(mesh, outer, cells, settings.height, "up");
  for (const cell of cells) {
    addWall(mesh, cell, floorTop, settings.height, "in");
    addCap(mesh, cell, [], floorTop, "up");
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.indices);
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
    boxPart: shape.boxPart,
    boxLidStyle: shape.boxLidStyle,
    boxLidPlate: shape.boxLidPlate,
    boxFit: shape.boxFit,
    boxGridfinity: shape.boxGridfinity,
    boxGridfinityColumns: shape.boxGridfinityColumns,
    boxGridfinityRows: shape.boxGridfinityRows,
    boxGridfinityFloor: shape.boxGridfinityFloor,
  };
}

export function createBoxGeneratorGeometryForShape(shape: Pick<WorkplaneShape, "width" | "depth" | "height"> & Partial<WorkplaneShape>) {
  return createBoxGeneratorGeometry(
    { width: shape.width, depth: shape.depth ?? shape.width, height: shape.height },
    boxGeneratorFieldsOf(shape),
  );
}
