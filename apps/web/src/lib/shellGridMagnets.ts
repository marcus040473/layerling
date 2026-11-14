import { GRIDFINITY_GRID, MAX_GRIDFINITY_LARGE_PLATE_UNITS, gridfinityOutlineCells } from "@/lib/gridfinityGeometry";
import type { LidShapeMagnets } from "@/lib/lidTool";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import { MAX_SHELL_GRID_CELLS, SHELL_GRID_PLAY } from "@/lib/shellGridLimits";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * The Lid tool's magnets in the corners of a box with a Gridfinity floor: a pocket with its wall, and a post where the wall
 * cannot hold it, reach into the cavity's corners - where the cells of the floor lie when the box is just large enough for
 * them. The Lid tool says so, and the person makes the box larger or takes fewer cells.
 */

type Point = { x: number; z: number };

/** The Gridfinity floor a body was hollowed with: its wall, its most cells and the body's middle and size; null when it has none. */
export function shellGridOf(shape: WorkplaneShape) {
  const hollow = [...(shape.edgeTreatmentHistory ?? [])].reverse().find((entry) => entry.feature.kind === "shell")?.feature;
  if (!hollow?.shellGrid) return null;
  return { wall: hollow.amount, cells: hollow.shellGrid.cells };
}

/** The cells of the floor of a box `width` x `depth` with this wall, as the CAD kernel counts them (a rectangular inside), nearest the middle first. */
export function shellGridCellsOf(width: number, depth: number, wall: number, most: number): Point[] {
  const hx = width / 2 - wall, hz = depth / 2 - wall;
  if (hx <= 0 || hz <= 0) return [];
  const all = gridfinityOutlineCells([{ x: -hx, z: -hz }, { x: hx, z: -hz }, { x: hx, z: hz }, { x: -hx, z: hz }], MAX_GRIDFINITY_LARGE_PLATE_UNITS);
  const distance = (c: Point) => Math.hypot(c.x, c.z);
  return [...all].sort((p, q) => distance(p) - distance(q) || p.z - q.z || p.x - q.x).slice(0, Math.max(1, Math.min(most, MAX_SHELL_GRID_CELLS)));
}

/** Whether a rectangle turned by `turn` degrees about (x, z) meets an upright square: the separating axis test. */
function turnedMeetsSquare(x: number, z: number, width: number, depth: number, turn: number, cell: Point, half: number) {
  const a = (turn * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const box = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([u, v]) => ({ x: x + u * c - v * s, z: z + u * s + v * c }));
  const square = [{ x: cell.x - half, z: cell.z - half }, { x: cell.x + half, z: cell.z - half }, { x: cell.x + half, z: cell.z + half }, { x: cell.x - half, z: cell.z + half }];
  const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: c, z: s }, { x: -s, z: c }];
  return axes.every((axis) => {
    const project = (points: Point[]) => points.map((p) => p.x * axis.x + p.z * axis.z);
    const [lo1, hi1] = [Math.min(...project(box)), Math.max(...project(box))];
    const [lo2, hi2] = [Math.min(...project(square)), Math.max(...project(square))];
    return hi1 > lo2 + 1e-6 && hi2 > lo1 + 1e-6;
  });
}

/** Whether a circle meets an upright square. */
function circleMeetsSquare(x: number, z: number, radius: number, cell: Point, half: number) {
  const dx = Math.max(Math.abs(x - cell.x) - half, 0), dz = Math.max(Math.abs(z - cell.z) - half, 0);
  return dx * dx + dz * dz < radius * radius - 1e-9;
}

/**
 * Whether the magnets reach into a cell of the Gridfinity floor of `shape` (a body hollowed with one): the cells as the
 * kernel counts them for the body's size, a cell the square its socket opens with, and the magnets' pockets with their
 * wall and their posts (round or box-shaped bodies in the scene's frame). A pocket in the wall alone meets none.
 */
export function magnetsMeetGridCells(shape: WorkplaneShape, magnets: LidShapeMagnets, width: number, depth: number): boolean {
  const grid = shellGridOf(shape);
  if (!grid) return false;
  const half = GRIDFINITY_GRID / 2 - SHELL_GRID_PLAY / 2;
  const cells = shellGridCellsOf(width, depth, grid.wall, grid.cells).map((cell) => ({ x: cell.x + shape.x, z: cell.z + shape.z }));
  const meets = (part: WorkplaneShape, extra: number, cell: Point) => (part.kind === "box"
    ? turnedMeetsSquare(part.x, part.z, shapeWidth(part) + 2 * extra, shapeDepth(part) + 2 * extra, part.rotation ?? 0, cell, half)
    : circleMeetsSquare(part.x, part.z, shapeWidth(part) / 2 + extra, cell, half));
  return cells.some((cell) => magnets.pockets.some((part) => meets(part, 0.8, cell)) || magnets.posts.some((part) => meets(part, 0, cell)));
}
