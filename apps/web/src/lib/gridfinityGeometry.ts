import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ManifoldToplevel } from "manifold-3d";
import { loadedManifoldRuntime, requestManifoldRuntime } from "@/lib/manifoldHandle";
import type { GridfinityCompartmentLabel, GridfinityLabelCorner, GridfinityType, WorkplaneShape } from "@/types/layerling";

/*
 * Gridfinity (#381), the open storage system by Zack Freedman: bins on a 42 mm grid
 * that drop into a baseplate and stack on one another. Everything here is
 * built from the published measurements (the Gridfinity design reference
 * linked from gridfinity.xyz/specification), so a bin fits baseplates printed
 * from other designs and the other way round:
 *
 * - a grid unit is 42 x 42 mm, a bin 0.5 mm smaller (41.5 per unit), a height
 *   unit 7 mm; the stacking lip adds 4.4 mm on top;
 * - under each grid unit a bin has a foot: from the bottom 0.8 mm at 45
 *   degrees, 1.8 mm straight, 2.15 mm at 45 degrees, 4.75 mm in all;
 * - the lip on the top of the wall is the foot's counterpart: from the
 *   bottom 0.7 mm at 45 degrees, 1.8 mm straight, 1.9 mm at 45 degrees up to
 *   the outer wall;
 * - the baseplate has the same three steps as a socket in each grid unit
 *   (0.7, 1.8, 2.15), on a 0.35 mm band, 5 mm tall: a bin of more than one
 *   unit rests on the ridges between the sockets, 0.25 mm above the plate's
 *   underside, with 0.25 mm all round its feet; a bin of one unit has no
 *   ridge under it and sits down on the slopes;
 * - magnet holes for 6 x 2 mm magnets, 6.5 mm wide, 13 mm from the middle of
 *   each unit in both directions.
 *
 * The wall (0.95 mm), the floor (1.2 mm) and the depth of the magnet holes
 * (2.4 mm) are not in the specification and are fixed here. The top of the
 * lip is sharp as drawn; the edge tool rounds it. A baseplate has no magnet
 * holes: the specification's plate is an open frame with nothing to hold one.
 *
 * Every outline of the body is an inset of one rounded rectangle whose corner
 * centres stay where they are - the outer wall, the inside, each step of the
 * lip; and likewise each foot and each socket inside its grid cell. So all of
 * them share the same points: the walls are strips between neighbouring
 * outlines, point to point, and where a foot meets the bin above it the two
 * outlines have the very same edge. That keeps the mesh closed with no
 * T-junctions. The exact body (gridfinitySolid) is built from the same plan.
 *
 * A bin of three height units or more can have a label shelf along any of
 * its inner walls (#455), which the specification does not have; the
 * measures follow kennetek's gridfinity-rebuilt tab, with the 0.5 mm
 * stacking gap the Fusion 360 add-in leaves. The shelf is flat on top,
 * 0.5 mm under the feet of a bin stacked on its lip, with a 1.2 mm strip
 * straight down at the front and an underside rising at 36 degrees from the
 * wall. It runs from wall to wall, into the round corners, or is a set
 * length moved along its wall. Where two shelves meet they join where they
 * cross; where a shelf meets a wall or another shelf the corner is rounded
 * or chamfered where there is room. The shelves are pieces, prisms or
 * prisms with a round cut out, joined to the bin and cut to its inside: the
 * display mesh by Manifold's booleans (gridfinityLabelledTriangles), the
 * exact body by the kernel's, from the same pieces (gridfinityLabelPieces).
 *
 * A bin can also have a finger scoop along any of its inner walls (#455),
 * which the specification does not have either: the floor rises along a
 * quarter circle into the wall, from wall to wall, so small parts can be
 * pushed out. Unless it is set, the radius is half the height from the floor
 * up to where the lip's support leaves the wall, or to the top without the
 * lip. A bin with a scoop has every inner floor edge rounded by 2.8 mm,
 * the inner corners' radius (the wall profile's last step, filleted in the
 * exact body), and the scoop is that rounding made large on its wall.
 * The scoops come from the same pieces in both kernels (gridfinityScoopPieces):
 * joined like the shelves in the mesh, cut out of the inside in the exact body.
 *
 * A bin can also be made on a half-size grid (#455): its size counts cells of
 * 21 mm, each with a foot of its own, four to a baseplate's socket. Like the
 * common generators' half-size bins, it changes only the grid: a bin is still
 * 0.5 mm smaller than its cells, a foot has the same steps and corners (20.5 mm
 * across at the top), and the lip follows the outline. The magnet holes, one
 * under each foot, stay where a baseplate with magnets from another generator
 * has them.
 *
 * A bin's floor can be raised (#455), for a bin blank to cut shapes into: the
 * bin is solid up to it, at most to where the lip's support leaves the wall,
 * or to the top without the lip. Scoops start on the raised floor, and shelves
 * can reach less far out above it.
 *
 * A bin can also be divided into compartments (#554), across and deep, by
 * dividers that run the full height up to 0.85 mm under the top, where the
 * label shelves stop, so a bin stacked on it sits as before. They start evenly
 * spaced and can be moved one by one, measured from the inside of the wall to
 * their middle, as long as every compartment stays at least 6 mm wide: the
 * kernel's cut fails on narrower ones. A bin takes at most 4 compartments a
 * grid unit each way and 40 in all, which keep it quick to build.
 *
 * A bin can also be open on any of its sides (#682), so that bins standing side
 * by side make one long run: above the floor an open side has no wall and no
 * lip, and the walls beside it run straight out to the outline and end square
 * there, 0.5 mm from the next bin as between any two. The corners on an open
 * side are square from the top of the feet up, so the floor is flat out to the
 * edge. The inside and the compartments are cut by cutters that run on past the
 * outline far enough for their roundings to lie beyond it, and the pieces joined
 * to the walls beside an open side are cut off at the outline. A shelf or a
 * scoop set on an open side is not built.
 *
 * A baseplate can be padded on any side (#455), so that it fills a drawer that
 * is not whole units: a solid border at its height outside the grid, which
 * moves away from the padded sides. The box takes the padding in, and the units
 * are read from it less the padding. The outer cells' flat top and bottom reach
 * out to the padded outline, and a padded outer corner, whose rounding no longer
 * meets the cell's, is filled between the two.
 *
 * The lip's top can be chamfered (#780) as the edge tool would: the chamfer
 * takes its size off the outer wall and off the slope a stacked bin's feet rest
 * on. The bin keeps its height setting, and its top comes down by 0.71 times it.
 */

export const GRIDFINITY_GRID = 42;
export const GRIDFINITY_HEIGHT_UNIT = 7;
export const GRIDFINITY_LIP_HEIGHT = 4.4;
export const GRIDFINITY_BASEPLATE_HEIGHT = 5;
export const GRIDFINITY_FOOT_HEIGHT = 4.75;
export const GRIDFINITY_CLEARANCE = 0.25;
export const GRIDFINITY_BIN_RADIUS = 3.75;
export const GRIDFINITY_BASEPLATE_RADIUS = 4;
export const GRIDFINITY_WALL = 0.95;
export const GRIDFINITY_FLOOR = 1.2;
export const GRIDFINITY_MAGNET_DIAMETER = 6.5;
export const GRIDFINITY_MAGNET_DEPTH = 2.4;
export const GRIDFINITY_MAGNET_OFFSET = 13;
export const MIN_GRIDFINITY_UNITS = 1;
export const MAX_GRIDFINITY_UNITS = 6;
export const MAX_GRIDFINITY_HEIGHT_UNITS = 20;
/** The most padding on a side of a baseplate: 42 mm would be room for another unit of grid. */
export const MAX_GRIDFINITY_PADDING = GRIDFINITY_GRID - 1;
/** How much smaller than the drawer a baseplate fitted to it is, so that it drops in. */
export const GRIDFINITY_DRAWER_CLEARANCE = 0.5;
/** The smallest and largest drawer one baseplate fits: 1 unit, or 6 units and 41 mm each side. */
export const MIN_GRIDFINITY_DRAWER = MIN_GRIDFINITY_UNITS * GRIDFINITY_GRID + GRIDFINITY_DRAWER_CLEARANCE;
export const MAX_GRIDFINITY_DRAWER = MAX_GRIDFINITY_UNITS * GRIDFINITY_GRID + 2 * MAX_GRIDFINITY_PADDING + GRIDFINITY_DRAWER_CLEARANCE;
export const DEFAULT_GRIDFINITY_TYPE: GridfinityType = "bin";
export const DEFAULT_GRIDFINITY_UNITS = { x: 2, z: 1, y: 3 };
export const DEFAULT_GRIDFINITY_LIP = true;
export const DEFAULT_GRIDFINITY_MAGNETS = false;
/** A label shelf's top under the wall's top: the 0.35 mm a stacked bin's feet sink into the lip, and 0.5 mm clear of them. */
const LABEL_DROP = 0.85;
/** The straight strip at the shelf's front edge, so it does not end in a knife edge. */
const LABEL_LAND = 1.2;
/** The rise of the shelf's underside from the wall: 36 degrees. */
const LABEL_RISE = Math.tan((36 * Math.PI) / 180);
/** How far above the floor the widest shelf's underside ends, rather than on the floor's edge. */
const LABEL_FLOOR_CLEARANCE = 0.5;
/** The shortest set length; anything shorter would be a peg, not a shelf for a label. */
const LABEL_MIN_LENGTH = 10;
export const MIN_GRIDFINITY_LABEL_HEIGHT_UNITS = 3;
export const MIN_GRIDFINITY_LABEL_WIDTH = 4;
export const DEFAULT_GRIDFINITY_LABEL_WIDTH = 14;
export const DEFAULT_GRIDFINITY_LABEL_CORNER: GridfinityLabelCorner = "round";
export const DEFAULT_GRIDFINITY_LABEL_CORNER_SIZE = 2;
export const MAX_GRIDFINITY_LABEL_CORNER_SIZE = 10;
/** The smallest scoop radius: below about 3.2 mm the floor's 2.8 mm rounding (SCOOP_FLOOR_ROUNDING) still shows through the sunk scoop. */
export const MIN_GRIDFINITY_SCOOP_RADIUS = 3.5;
/** The lowest floor inside a bin, measured from the underside: the 1.2 mm floor on the feet. */
export const MIN_GRIDFINITY_FLOOR_HEIGHT = GRIDFINITY_FOOT_HEIGHT + GRIDFINITY_FLOOR;
/** A floor this close under the highest the bin takes is raised onto it, so no sliver of wall is left between them. */
const FLOOR_SNAP = 0.05;
export const DEFAULT_GRIDFINITY_DIVIDER_THICKNESS = 1.2;
export const MIN_GRIDFINITY_DIVIDER_THICKNESS = 0.8;
export const MAX_GRIDFINITY_DIVIDER_THICKNESS = 3;
/** The largest chamfer on the lip's top: it takes the top 1 mm of the 2.69 mm slope a stacked bin's feet rest on. */
export const MAX_GRIDFINITY_LIP_CHAMFER = 1;
/** The narrowest compartment: the kernel's cut fails below about 5.6 mm and leaves slivers up to 5.65. */
export const MIN_GRIDFINITY_COMPARTMENT = 6;
/** The most compartments a grid unit of 42 mm takes each way. */
export const GRIDFINITY_COMPARTMENTS_PER_UNIT = 4;
/** The most compartments a bin takes in all: at 50 with front and back scoops the exact body took up to 19.9 s to build in the browser (with labels). */
export const MAX_GRIDFINITY_COMPARTMENTS = 40;
/** The least height a divider stands above the floor. */
const MIN_GRIDFINITY_DIVIDER_HEIGHT = 3;

/** Section of a foot, a socket or the wall: inset from the outline, at a height. */
export type GridfinityStep = [inset: number, y: number];

/** From the bottom: 0.8 at 45 degrees, 1.8 straight, 2.15 at 45 degrees, inset from the bin's outline in its cell (41.5 mm, or 20.5 on the half-size grid). */
export const GRIDFINITY_FOOT: GridfinityStep[] = [[2.95, 0], [2.15, 0.8], [2.15, 2.6], [0, 4.75]];
/** The baseplate's socket, inset from the 42 mm cell: a 0.35 band, then 0.7 at 45 degrees, 1.8 straight, 2.15 at 45 degrees. */
export const GRIDFINITY_SOCKET: GridfinityStep[] = [[2.85, 0], [2.85, 0.35], [2.15, 1.05], [2.15, 2.85], [0, 5]];
/** The lip's inner face, from where it leaves the support to the sharp top on the outer wall. */
const LIP: GridfinityStep[] = [[2.6, 0], [1.9, 0.7], [1.9, 2.5], [0, 4.4]];

const CORNER_STEPS = 8;
const MAGNET_SIDES = 32;

export type GridfinityShapeFields = Pick<WorkplaneShape, "width" | "height"> & {
  depth?: number;
  gridfinityType?: GridfinityType;
  gridfinityLip?: boolean;
  gridfinityMagnets?: boolean;
  gridfinityHalfGrid?: boolean;
  gridfinityLabelBack?: boolean;
  gridfinityLabelFront?: boolean;
  gridfinityLabelLeft?: boolean;
  gridfinityLabelRight?: boolean;
  gridfinityLabelBackWidth?: number;
  gridfinityLabelBackLength?: number;
  gridfinityLabelBackOffset?: number;
  gridfinityLabelFrontWidth?: number;
  gridfinityLabelFrontLength?: number;
  gridfinityLabelFrontOffset?: number;
  gridfinityLabelLeftWidth?: number;
  gridfinityLabelLeftLength?: number;
  gridfinityLabelLeftOffset?: number;
  gridfinityLabelRightWidth?: number;
  gridfinityLabelRightLength?: number;
  gridfinityLabelRightOffset?: number;
  gridfinityLabelCorner?: GridfinityLabelCorner;
  gridfinityLabelCornerSize?: number;
  gridfinityScoopBack?: boolean;
  gridfinityScoopFront?: boolean;
  gridfinityScoopLeft?: boolean;
  gridfinityScoopRight?: boolean;
  gridfinityScoopRadius?: number;
  gridfinityFloorHeight?: number;
  gridfinityOpenBack?: boolean;
  gridfinityOpenFront?: boolean;
  gridfinityOpenLeft?: boolean;
  gridfinityOpenRight?: boolean;
  gridfinityLipChamfer?: number;
  gridfinityPaddingBack?: number;
  gridfinityPaddingFront?: number;
  gridfinityPaddingLeft?: number;
  gridfinityPaddingRight?: number;
  gridfinityCompartmentsX?: number;
  gridfinityCompartmentsZ?: number;
  gridfinityDividerThickness?: number;
  gridfinityDividerPositionsX?: number[];
  gridfinityDividerPositionsZ?: number[];
  gridfinityCompartmentLabels?: GridfinityCompartmentLabel[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGridfinityType(value?: string): GridfinityType {
  return value === "baseplate" ? "baseplate" : "bin";
}

function units(value: number | undefined, fallback: number, max: number) {
  return Number.isFinite(value) ? clamp(Math.round(value as number), MIN_GRIDFINITY_UNITS, max) : fallback;
}

/** The grid a size counts: 42 mm, or cells of 21 mm for a bin on the half-size grid. A baseplate is always 42. */
function gridfinityPitch(shape: Pick<GridfinityShapeFields, "gridfinityType" | "gridfinityHalfGrid">) {
  return normalizeGridfinityType(shape.gridfinityType) === "bin" && shape.gridfinityHalfGrid === true ? GRIDFINITY_GRID / 2 : GRIDFINITY_GRID;
}

/** The most units across or deep: 6 of 42 mm, or the same size in cells of 21 mm. */
export function gridfinityMaxUnits(shape: Pick<GridfinityShapeFields, "gridfinityType" | "gridfinityHalfGrid">) {
  return (MAX_GRIDFINITY_UNITS * GRIDFINITY_GRID) / gridfinityPitch(shape);
}

/**
 * The grid units the size stands for: across (x), deep (z) and, for a bin,
 * high (y). The height is counted from half the lip: a bin of so many units
 * reads the same with the lip and without it, so switching the lip alone
 * keeps the units and only adds or takes off the 4.4 mm.
 */
export function gridfinityUnits(shape: GridfinityShapeFields) {
  const type = normalizeGridfinityType(shape.gridfinityType);
  const margin = type === "bin" ? 2 * GRIDFINITY_CLEARANCE : 0;
  const pitch = gridfinityPitch(shape);
  const max = gridfinityMaxUnits(shape);
  const padding = gridfinityPadding(shape);
  return {
    x: units((shape.width + margin - padding.left - padding.right) / pitch, DEFAULT_GRIDFINITY_UNITS.x, max),
    z: units(((shape.depth ?? shape.width) + margin - padding.back - padding.front) / pitch, DEFAULT_GRIDFINITY_UNITS.z, max),
    y: type === "bin" ? units((shape.height - GRIDFINITY_LIP_HEIGHT / 2) / GRIDFINITY_HEIGHT_UNIT, DEFAULT_GRIDFINITY_UNITS.y, MAX_GRIDFINITY_HEIGHT_UNITS) : 1,
  };
}

/** The size of a bin or baseplate of so many units; a bin on the half-size grid counts units of 21 mm, and a baseplate's box takes its padding in. */
export function gridfinitySize(type: GridfinityType, count: { x: number; z: number; y: number }, lip = true, pitch = GRIDFINITY_GRID, padding = NO_GRIDFINITY_PADDING) {
  // To 0.01 mm, as the padding is stored, so 252 + 22.98 + 22.97 is 297.95.
  if (type === "baseplate") return { width: Math.round((count.x * GRIDFINITY_GRID + padding.left + padding.right) * 100) / 100, depth: Math.round((count.z * GRIDFINITY_GRID + padding.back + padding.front) * 100) / 100, height: GRIDFINITY_BASEPLATE_HEIGHT };
  return {
    width: count.x * pitch - 2 * GRIDFINITY_CLEARANCE,
    depth: count.z * pitch - 2 * GRIDFINITY_CLEARANCE,
    height: count.y * GRIDFINITY_HEIGHT_UNIT + (lip ? GRIDFINITY_LIP_HEIGHT : 0),
  };
}

/**
 * The size belongs to the grid: a drag on a handle writes width, depth and
 * height directly, so they are turned back into whole units here and the box
 * sits exactly on the body again.
 */
export function gridfinityFootprintPatch(shape: GridfinityShapeFields) {
  return gridfinitySize(normalizeGridfinityType(shape.gridfinityType), gridfinityUnits(shape), shape.gridfinityLip !== false, gridfinityPitch(shape), gridfinityPadding(shape));
}

/**
 * What a change of type, units, lip or grid writes to the shape: the settings
 * and the box their units make. A baseplate keeps no height units, so a
 * baseplate turned into a bin gets the default 3. A change of type or grid
 * counts the units again on the new grid, so the outline stays where it can
 * (2 whole units are 4 cells) and is rounded to the nearest units where it
 * cannot.
 */
export function gridfinityShapePatch(shape: GridfinityShapeFields, next: { type?: GridfinityType; x?: number; z?: number; y?: number; lip?: boolean; halfGrid?: boolean }) {
  const current = gridfinityUnits(shape);
  const currentType = normalizeGridfinityType(shape.gridfinityType);
  const type = next.type ?? currentType;
  const lip = next.lip ?? shape.gridfinityLip !== false;
  const halfGrid = next.halfGrid ?? shape.gridfinityHalfGrid === true;
  const grid = { gridfinityType: type, gridfinityHalfGrid: halfGrid };
  const pitch = gridfinityPitch(grid);
  const max = gridfinityMaxUnits(grid);
  // The current size read on the new grid as the new type, as canonicalizeShape reads a size given through the MCP.
  const margin = type === "bin" ? 2 * GRIDFINITY_CLEARANCE : 0;
  const regrid = pitch !== gridfinityPitch(shape);
  // A padded baseplate's box is read less its padding.
  const padding = gridfinityPadding(shape);
  const count = {
    x: units(next.x ?? (regrid ? (shape.width + margin - padding.left - padding.right) / pitch : current.x), DEFAULT_GRIDFINITY_UNITS.x, max),
    z: units(next.z ?? (regrid ? ((shape.depth ?? shape.width) + margin - padding.back - padding.front) / pitch : current.z), DEFAULT_GRIDFINITY_UNITS.z, max),
    y: units(next.y ?? (currentType === "bin" ? current.y : DEFAULT_GRIDFINITY_UNITS.y), DEFAULT_GRIDFINITY_UNITS.y, MAX_GRIDFINITY_HEIGHT_UNITS),
  };
  // A bin turned into a baseplate takes back the padding it kept.
  const size = gridfinitySize(type, count, lip, pitch, gridfinityPadding({ ...shape, ...grid }));
  return { gridfinityType: type, gridfinityLip: lip, ...(next.halfGrid !== undefined ? { gridfinityHalfGrid: halfGrid } : {}), ...size };
}

/** Each side's padding on a baseplate (#455). */
export const GRIDFINITY_PADDING_KEYS = { back: "gridfinityPaddingBack", front: "gridfinityPaddingFront", left: "gridfinityPaddingLeft", right: "gridfinityPaddingRight" } as const;
const NO_GRIDFINITY_PADDING: Record<GridfinityWall, number> = { back: 0, front: 0, left: 0, right: 0 };

/** A side's padding as stored: none for anything but a number, at most 41 mm, rounded to 0.01 mm. */
export function normalizeGridfinityPadding(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value * 100) / 100, 0, MAX_GRIDFINITY_PADDING) : 0;
}

/** A baseplate's padding on each side (#455); a bin has none and keeps the settings it is given. */
export function gridfinityPadding(shape: Pick<GridfinityShapeFields, "gridfinityType" | "gridfinityPaddingBack" | "gridfinityPaddingFront" | "gridfinityPaddingLeft" | "gridfinityPaddingRight">): Record<GridfinityWall, number> {
  if (normalizeGridfinityType(shape.gridfinityType) !== "baseplate") return NO_GRIDFINITY_PADDING;
  return { back: normalizeGridfinityPadding(shape.gridfinityPaddingBack), front: normalizeGridfinityPadding(shape.gridfinityPaddingFront), left: normalizeGridfinityPadding(shape.gridfinityPaddingLeft), right: normalizeGridfinityPadding(shape.gridfinityPaddingRight) };
}

/**
 * What a change of padding writes to a baseplate: the paddings and the box
 * they make with the same units. The box takes the padding in, so a new
 * padding read against the old box would lose a unit once it passes half of one.
 */
export function gridfinityPaddingPatch(shape: GridfinityShapeFields, next: Partial<Record<GridfinityWall, unknown>>) {
  const fields = Object.fromEntries((Object.keys(next) as GridfinityWall[]).map((wall) => [GRIDFINITY_PADDING_KEYS[wall], normalizeGridfinityPadding(next[wall])])) as Partial<Record<(typeof GRIDFINITY_PADDING_KEYS)[GridfinityWall], number>>;
  const { width, depth } = gridfinitySize("baseplate", gridfinityUnits(shape), false, GRIDFINITY_GRID, gridfinityPadding({ ...shape, ...fields }));
  return { ...fields, width, depth };
}

/** The drawer a baseplate fills (#455): its size and the 0.5 mm it leaves. */
export function gridfinityDrawerSize(shape: GridfinityShapeFields) {
  return { width: Math.round((shape.width + GRIDFINITY_DRAWER_CLEARANCE) * 100) / 100, depth: Math.round(((shape.depth ?? shape.width) + GRIDFINITY_DRAWER_CLEARANCE) * 100) / 100 };
}

/**
 * What fitting a baseplate to a drawer's inside writes on one axis: as many
 * units as fit, up to 6, and the rest split evenly into the two paddings of that
 * axis, up to 41 mm a side. A drawer that one plate cannot fill gets what it can;
 * the other axis is left as it is.
 */
export function gridfinityDrawerPatch(shape: GridfinityShapeFields, axis: "x" | "z", drawer: number) {
  const [first, second] = axis === "x" ? (["left", "right"] as const) : (["back", "front"] as const);
  // In whole hundredths, as the padding is stored, so the units and the rest are read alike.
  const unit = GRIDFINITY_GRID * 100;
  const inside = Math.round((drawer - GRIDFINITY_DRAWER_CLEARANCE) * 100);
  const count = clamp(Math.floor(inside / unit), MIN_GRIDFINITY_UNITS, MAX_GRIDFINITY_UNITS);
  const rest = Math.max(0, inside - count * unit);
  const most = MAX_GRIDFINITY_PADDING * 100;
  // An odd hundredth goes to the first side.
  const half = Math.ceil(rest / 2);
  const sides = { [GRIDFINITY_PADDING_KEYS[first]]: Math.min(most, half) / 100, [GRIDFINITY_PADDING_KEYS[second]]: Math.min(most, rest - half) / 100 } as Partial<Record<(typeof GRIDFINITY_PADDING_KEYS)[GridfinityWall], number>>;
  const { width, depth } = gridfinitySize("baseplate", { ...gridfinityUnits(shape), [axis]: count }, false, GRIDFINITY_GRID, gridfinityPadding({ ...shape, ...sides }));
  return { ...sides, width, depth };
}

/** Everything the body is built from, in the shape's own frame: x across, z deep, y up from 0, centred on x and z. */
export function gridfinityPlan(shape: GridfinityShapeFields) {
  const type = normalizeGridfinityType(shape.gridfinityType);
  const count = gridfinityUnits(shape);
  const lip = type === "bin" && shape.gridfinityLip !== false;
  const magnets = type === "bin" && Boolean(shape.gridfinityMagnets);
  const pitch = gridfinityPitch(shape);
  const padding = gridfinityPadding(shape);
  const size = gridfinitySize(type, count, lip, pitch, padding);
  // The grid moves away from the padded sides: its middle is half the difference off the box's.
  const centre = { x: (padding.left - padding.right) / 2, z: (padding.back - padding.front) / 2 };
  const cells: Array<{ x: number; z: number; i: number; j: number }> = [];
  for (let i = 0; i < count.x; i += 1) {
    for (let j = 0; j < count.z; j += 1) {
      cells.push({ i, j, x: centre.x + (i - (count.x - 1) / 2) * pitch, z: centre.z + (j - (count.z - 1) / 2) * pitch });
    }
  }
  // On the half-size grid one hole a foot, towards its cell's corner on the 42 mm grid, as far from it as on a whole unit.
  const halfOffset = pitch / 2 - (GRIDFINITY_GRID / 2 - GRIDFINITY_MAGNET_OFFSET);
  const magnetHoles = magnets
    ? pitch === GRIDFINITY_GRID
      ? cells.flatMap((cell) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: cell.x + sx * GRIDFINITY_MAGNET_OFFSET, z: cell.z + sz * GRIDFINITY_MAGNET_OFFSET }))))
      : cells.map((cell) => ({ x: cell.x + (cell.i % 2 === 0 ? -1 : 1) * halfOffset, z: cell.z + (cell.j % 2 === 0 ? -1 : 1) * halfOffset }))
    : [];
  const top = count.y * GRIDFINITY_HEIGHT_UNIT;
  const floor = floorHeight(shape.gridfinityFloorHeight, { type, top, lip });
  // Any bin but a solid block can be open on a side (#682), with no wall there above the floor.
  const fits = openFits({ type, top, lip, floor });
  const open = Object.fromEntries(LABEL_WALLS.map((wall) => [wall, fits && shape[GRIDFINITY_OPEN_WALL_KEYS[wall]] === true])) as Record<GridfinityWall, boolean>;
  // A bin with a finger scoop has every inner floor edge rounded, and the scoop is the rounding made large on its wall.
  const scooped = scoopFits({ type, top, lip, floor }) && LABEL_WALLS.some((wall) => shape[GRIDFINITY_SCOOP_WALL_KEYS[wall]] === true && !open[wall]);
  const floorRounding = scooped ? SCOOP_FLOOR_ROUNDING : 0;
  // To 0.01 mm: a chamfer of a millionth of a millimetre left the exact body's cut with no solid.
  const lipChamfer = lip ? Math.round(clampLabel(shape.gridfinityLipChamfer, 0, 0, MAX_GRIDFINITY_LIP_CHAMFER) * 100) / 100 : 0;
  return { type, count, lip, magnets, halfGrid: pitch !== GRIDFINITY_GRID, pitch, size, cells, magnetHoles, top, floor, floorRounding, open, padding, centre, lipChamfer };
}

export type GridfinityPlan = ReturnType<typeof gridfinityPlan>;

/**
 * The highest floor (#455): with the lip, where the lip's support leaves the wall, so the lip and its support stay
 * whole and a stacked bin's feet keep 1.3 mm clear; without it the top, a solid block. Never under the 1.2 mm floor.
 */
function floorMaxHeight({ type, top, lip }: { type: GridfinityType; top: number; lip: boolean }) {
  if (type !== "bin") return MIN_GRIDFINITY_FLOOR_HEIGHT;
  return Math.max(MIN_GRIDFINITY_FLOOR_HEIGHT, lip ? top - (LIP[0][0] - GRIDFINITY_WALL) : top);
}

/** The floor as it is built: its own height within what the bin takes, raised onto the highest within FLOOR_SNAP of it. */
function floorHeight(value: number | undefined, plan: { type: GridfinityType; top: number; lip: boolean }) {
  const max = floorMaxHeight(plan);
  const height = clampLabel(value, MIN_GRIDFINITY_FLOOR_HEIGHT, MIN_GRIDFINITY_FLOOR_HEIGHT, max);
  // A little over FLOOR_SNAP, as 21 - 20.95 comes out as 0.05000000000000071.
  return max - height < FLOOR_SNAP + 1e-9 ? max : height;
}

/** The highest floor this bin takes. */
export function gridfinityFloorMaxHeight(shape: GridfinityShapeFields) {
  return floorMaxHeight(gridfinityPlan(shape));
}

/** The floor's height inside the bin as it is built, measured from the underside. */
export function gridfinityFloorHeight(shape: GridfinityShapeFields) {
  return gridfinityPlan(shape).floor;
}

/** The chamfer on the lip's top as it is built (#780): none without the lip, at most 1 mm, to 0.01 mm. */
export function gridfinityLipChamfer(shape: GridfinityShapeFields) {
  return gridfinityPlan(shape).lipChamfer;
}

/** Whether the bin's floor can be raised at all: not in a bin of 1 height unit with the lip, whose support reaches the floor. */
export function gridfinityFloorFits(shape: GridfinityShapeFields) {
  return gridfinityFloorMaxHeight(shape) > MIN_GRIDFINITY_FLOOR_HEIGHT;
}

export type GridfinityWall = "back" | "front" | "left" | "right";
type FlatPoint = { x: number; z: number };

/** Each wall's own shelf settings, in the order the walls are built and listed: its switch, width, length and offset. */
export const GRIDFINITY_LABEL_WALL_KEYS = {
  back: { on: "gridfinityLabelBack", width: "gridfinityLabelBackWidth", length: "gridfinityLabelBackLength", offset: "gridfinityLabelBackOffset" },
  front: { on: "gridfinityLabelFront", width: "gridfinityLabelFrontWidth", length: "gridfinityLabelFrontLength", offset: "gridfinityLabelFrontOffset" },
  left: { on: "gridfinityLabelLeft", width: "gridfinityLabelLeftWidth", length: "gridfinityLabelLeftLength", offset: "gridfinityLabelLeftOffset" },
  right: { on: "gridfinityLabelRight", width: "gridfinityLabelRightWidth", length: "gridfinityLabelRightLength", offset: "gridfinityLabelRightOffset" },
} as const;
const LABEL_WALLS = Object.keys(GRIDFINITY_LABEL_WALL_KEYS) as GridfinityWall[];
/** The walls a shelf's two ends run into, its left end first as seen from inside the bin. */
const LABEL_SIDE_WALLS: Record<GridfinityWall, [GridfinityWall, GridfinityWall]> = { back: ["left", "right"], front: ["right", "left"], left: ["front", "back"], right: ["back", "front"] };
/** How far a shelf's piece reaches into the wall behind it and past the walls at its ends, cut off again at the bin's inside. */
const LABEL_PAST = 1;
/**
 * A set length that ends closer to a wall than this runs into it, as one does that stops this close in
 * front of a side shelf's front: a slot that narrow would not print. A side shelf meets this one only
 * when it reaches at least this far past its front.
 */
const LABEL_END_SNAP = 1;
/** The smallest a corner piece is squeezed down to, and the front left straight between two rounded front corners. */
const LABEL_MIN_FRONT = 1;
/** Kept between a corner piece and anything near it, and between a hidden end and the front of the shelf it is in. */
const LABEL_CLEARANCE = 0.5;
/** How far the lip's 45 degree support leans into the bin at the shelf's top: it starts 1.65 under the top, the shelf 0.85. */
const LABEL_LIP_LEAN = 0.8;

/**
 * A shelf's cross-section pushed along its wall from u = from to u = to; u runs left to right seen
 * from inside the bin, 0 in the middle. With `strip`, only the band of the straight front strip's
 * height, from the wall out to `width`.
 */
export type GridfinityLabelProfile = { wall: GridfinityWall; width: number; from: number; to: number; strip?: boolean };
/**
 * A corner piece over the plan: from `at`, legs of `size` along a and b; a triangle (chamfer), or
 * the square less a quarter circle (round). It reaches back beyond `at` by `reachA` against a and
 * `reachB` against b, into what it is cut from or into a wall, so that none of its faces lies exactly
 * on a face it trims or meets there.
 */
export type GridfinityLabelCornerShape = { at: FlatPoint; a: FlatPoint; b: FlatPoint; size: number; round: boolean; reachA: number; reachB: number };

/** A closed outline without the points that fall on the next one, which would be edges of no length. */
function distinctPoints<T extends { x: number; z: number }>(outline: T[]) {
  return outline.filter((p, i) => {
    const q = outline[(i + 1) % outline.length];
    return Math.hypot(p.x - q.x, p.z - q.z) > 1e-9;
  });
}

/** The corner piece's outline over the plan, and for a round one the circle taken out of it. */
export function gridfinityLabelCornerOutline(c: GridfinityLabelCornerShape) {
  const point = (u: number, v: number) => ({ x: c.at.x + c.a.x * u + c.b.x * v, z: c.at.z + c.a.z * u + c.b.z * v });
  const ra = c.reachA;
  const rb = c.reachB;
  // Both shapes stay within `size` along a and b, beyond `at` only by the reach; a reach of 0 leaves a
  // point twice, which the kernel would take for an edge of no length.
  if (!c.round) {
    const outline = [point(-ra, -rb), point(c.size, -rb), point(c.size, 0), point(0, c.size), point(-ra, c.size)];
    return { outline: distinctPoints(outline), circle: null };
  }
  return { outline: [point(-ra, -rb), point(c.size, -rb), point(c.size, c.size), point(-ra, c.size)], circle: { centre: point(c.size, c.size), radius: c.size } };
}

export type GridfinityLabelPieces = {
  top: number;
  floor: number;
  /**
   * The bin's inside the pieces are cut to: half sizes and corner radius of the inner wall, and the open sides it reaches
   * out through to the outline, the wall's 0.95 mm further (the exact body cuts them to that; the display mesh runs the
   * inside on and cuts them off at the outline); only when a side is open, so a closed bin's pieces are as before.
   */
  inside: { hx: number; hz: number; radius: number; open?: Record<GridfinityWall, boolean> };
  /** Each shelf, with the round corners taken off the front of a shelf that stops short of the walls. */
  shelves: Array<{ profile: GridfinityLabelProfile; notches: GridfinityLabelCornerShape[] }>;
  /** The rounding or chamfer where a shelf meets a wall or another shelf, trimmed to lie under the shelves it joins. */
  corners: Array<GridfinityLabelCornerShape & { under: GridfinityLabelProfile[] }>;
};

function clampLabel(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? clamp(value as number, min, max) : fallback;
}

/** The inner half sizes of a bin of this plan: from the middle to the inner wall, across and deep. */
function labelInside(plan: GridfinityPlan) {
  return { hx: plan.size.width / 2 - GRIDFINITY_WALL, hz: plan.size.depth / 2 - GRIDFINITY_WALL };
}

/**
 * The largest rounding or chamfer the shelves take: 10 mm, but never so much that a shelf of the
 * smallest width with its corner reaches within 1 mm of the middle, which only happens in a bin one
 * cell of the half-size grid wide or deep.
 */
export function gridfinityLabelMaxCornerSize(plan: GridfinityPlan) {
  const { hx, hz } = labelInside(plan);
  return Math.min(MAX_GRIDFINITY_LABEL_CORNER_SIZE, Math.min(hx, hz) - 1 - MIN_GRIDFINITY_LABEL_WIDTH);
}

/** The rounding or chamfer the shelves are set to, in mm, as it is built. */
export function gridfinityLabelCornerSize(shape: GridfinityShapeFields) {
  return clampLabel(shape.gridfinityLabelCornerSize, DEFAULT_GRIDFINITY_LABEL_CORNER_SIZE, 0, gridfinityLabelMaxCornerSize(gridfinityPlan(shape)));
}

/** The widest a shelf can be for its underside to end LABEL_FLOOR_CLEARANCE above the floor. */
function labelFloorWidth(plan: GridfinityPlan) {
  return (plan.top - LABEL_DROP - LABEL_LAND - plan.floor - LABEL_FLOOR_CLEARANCE) / LABEL_RISE;
}

/** Whether a bin can have label shelves: 3 height units or more, and room above the floor for the narrowest shelf. */
export function gridfinityLabelFits(shape: GridfinityShapeFields) {
  const plan = gridfinityPlan(shape);
  return plan.type === "bin" && plan.count.y >= MIN_GRIDFINITY_LABEL_HEIGHT_UNITS && labelFloorWidth(plan) >= MIN_GRIDFINITY_LABEL_WIDTH;
}

/**
 * The widest shelf a wall takes: its underside ends above the floor, and across the bin the
 * shelves and their corner pieces leave at least 2 mm open, between two shelves facing each
 * other or between a shelf and the wall opposite it, so the bin is never closed off.
 */
export function gridfinityLabelMaxWidth(shape: GridfinityShapeFields, wall: GridfinityWall) {
  const plan = gridfinityPlan(shape);
  const { hx, hz } = labelInside(plan);
  const size = gridfinityLabelCornerSize(shape);
  const max = labelFloorWidth(plan);
  // A shelf set on an open side is not built, so it faces nothing.
  const on = (side: GridfinityWall) => shape[GRIDFINITY_LABEL_WALL_KEYS[side].on] === true && !plan.open[side];
  const [half, facing] = wall === "back" || wall === "front" ? [hz, on(wall === "back" ? "front" : "back")] : [hx, on(wall === "left" ? "right" : "left")];
  return Math.min(max, facing ? half - 1 - size : 2 * half - 2 - size);
}

/** A wall's shelf width as it is built: its own, else 14 mm, within what the wall takes. */
export function gridfinityLabelWidth(shape: GridfinityShapeFields, wall: GridfinityWall) {
  const max = gridfinityLabelMaxWidth(shape, wall);
  return clampLabel(shape[GRIDFINITY_LABEL_WALL_KEYS[wall].width], Math.max(MIN_GRIDFINITY_LABEL_WIDTH, Math.min(DEFAULT_GRIDFINITY_LABEL_WIDTH, max)), MIN_GRIDFINITY_LABEL_WIDTH, Math.max(MIN_GRIDFINITY_LABEL_WIDTH, max));
}

/** A wall's set length as it is built: 0 for wall to wall, else at least LABEL_MIN_LENGTH. */
export function gridfinityLabelLength(shape: GridfinityShapeFields, wall: GridfinityWall) {
  const length = shape[GRIDFINITY_LABEL_WALL_KEYS[wall].length];
  return Number.isFinite(length) && (length as number) > 0 ? Math.max(LABEL_MIN_LENGTH, length as number) : 0;
}

/**
 * How close to a wall an end runs into it: LABEL_END_SNAP from the wall's face beside the shelf's top,
 * where the lip's support leans LABEL_LIP_LEAN into the bin.
 */
function labelEndSnap(plan: { lip: boolean }) {
  return LABEL_END_SNAP + (plan.lip ? LABEL_LIP_LEAN : 0);
}

/** Whether a shelf of this length on a wall of this half length runs from wall to wall: it would leave at most the snap at both ends. */
function labelFull(length: number, along: number, snap: number) {
  return length === 0 || length >= 2 * (along - snap);
}

/**
 * A wall's longest length worth setting (the wall itself), how far a shelf of its set length can
 * move in whole millimetres, as its slider steps (0 when it runs wall to wall; an end left less
 * than 1 mm from the wall runs into it anyway), and the bin's inside across the wall, the most a
 * width could be.
 */
export function gridfinityLabelLimits(shape: GridfinityShapeFields, wall: GridfinityWall) {
  const plan = gridfinityPlan(shape);
  const { hx, hz } = labelInside(plan);
  const [along, across] = wall === "back" || wall === "front" ? [hx, hz] : [hz, hx];
  const length = gridfinityLabelLength(shape, wall);
  return { length: 2 * along, offset: labelFull(length, along, labelEndSnap(plan)) ? 0 : Math.floor(along - length / 2), across: 2 * across };
}

/** A point of the bin's inside in the shape's frame from a wall's own (u along it, v out from it). */
function labelPoint(wall: GridfinityWall, hx: number, hz: number, u: number, v: number): FlatPoint {
  if (wall === "back") return { x: u, z: -hz + v };
  if (wall === "front") return { x: -u, z: hz - v };
  if (wall === "left") return { x: -hx + v, z: -u };
  return { x: hx - v, z: u };
}

/** The bin's label shelves as pieces for the mesh and the exact body, or null when it has none. */
export function gridfinityLabelPieces(shape: GridfinityShapeFields): GridfinityLabelPieces | null {
  // A bin with dividers has labels in its compartments instead (#554); its shelves' settings are kept for a bin without.
  if (!gridfinityLabelFits(shape) || gridfinityCompartments(shape)) return null;
  const plan = gridfinityPlan(shape);
  // An open side has no wall for a shelf (#682); its setting is kept for when it is closed again.
  const walls = LABEL_WALLS.filter((wall) => shape[GRIDFINITY_LABEL_WALL_KEYS[wall].on] === true && !plan.open[wall]);
  if (walls.length === 0) return null;
  const size = gridfinityLabelCornerSize(shape);
  const round = (shape.gridfinityLabelCorner ?? DEFAULT_GRIDFINITY_LABEL_CORNER) !== "chamfer";
  const { hx, hz } = labelInside(plan);
  const widthOf = (wall: GridfinityWall) => gridfinityLabelWidth(shape, wall);
  const snap = labelEndSnap(plan);
  const spanOf = (wall: GridfinityWall, along: number): LabelSpan => {
    const length = gridfinityLabelLength(shape, wall);
    if (labelFull(length, along, snap)) return { centre: 0, length: 2 * along, short: [false, false] };
    const setOffset = shape[GRIDFINITY_LABEL_WALL_KEYS[wall].offset];
    const offset = Number.isFinite(setOffset) ? (setOffset as number) : 0;
    // The offset is along the editor's axes: right on the back and front walls, towards the front on the sides.
    const sign = wall === "back" || wall === "right" ? 1 : -1;
    const centre = clamp(sign * offset, -along + length / 2, along - length / 2);
    return { centre, length, short: [centre - length / 2 > -along + snap, centre + length / 2 < along - snap] };
  };
  return labelPiecesIn({ hx, hz, walls, widthOf, spanOf, size, round, top: plan.top - LABEL_DROP, floor: plan.floor, open: plan.open });
}

/** A shelf's middle and length along its wall, and whether each end (0 at u = -along, 1 at u = along) stops short of the wall there. */
type LabelSpan = { centre: number; length: number; short: boolean[] };

/**
 * The shelves on the given walls of an inside of these half sizes as pieces, each with its span and width: how they
 * end, meet one another and the walls, and the corner pieces between them. An end at an open side runs out through it
 * as into a wall, and is cut off at the outline.
 */
function labelPiecesIn({ hx, hz, walls, widthOf, spanOf, size, round, top, floor, open }: {
  hx: number;
  hz: number;
  walls: GridfinityWall[];
  widthOf: (wall: GridfinityWall) => number;
  spanOf: (wall: GridfinityWall, along: number) => LabelSpan;
  size: number;
  round: boolean;
  top: number;
  floor: number;
  open?: Record<GridfinityWall, boolean>;
}): GridfinityLabelPieces {
  const alongOf = (wall: GridfinityWall) => (wall === "back" || wall === "front" ? hx : hz);
  const spans = new Map(walls.map((wall) => [wall, spanOf(wall, alongOf(wall))]));
  // The wall at an end, which end of that wall's shelf is here, and whether it has a shelf.
  const across = (wall: GridfinityWall, end: number) => {
    const side = LABEL_SIDE_WALLS[wall][end];
    return { side, sideEnd: LABEL_SIDE_WALLS[side].indexOf(wall), on: spans.has(side) };
  };
  // How far an end stops from the wall there, and how far the shelf reaches out from that wall.
  const gap = (wall: GridfinityWall, end: number) => {
    const span = spans.get(wall)!;
    const sign = end === 0 ? -1 : 1;
    return alongOf(wall) - sign * (span.centre + sign * span.length / 2);
  };
  const reach = (wall: GridfinityWall, end: number) => 2 * alongOf(wall) - gap(wall, 1 - end);
  // How far the shelf on the wall at an end reaches past this shelf's front.
  const past = (wall: GridfinityWall, end: number) => {
    const { side, sideEnd, on } = across(wall, end);
    return on ? reach(side, sideEnd) - widthOf(wall) : -Infinity;
  };
  // Whether that shelf reaches past this front, and whether this end stops on it.
  const covered = (wall: GridfinityWall, end: number) => past(wall, end) >= LABEL_END_SNAP;
  const lands = (wall: GridfinityWall, end: number) => gap(wall, end) < widthOf(across(wall, end).side) + LABEL_END_SNAP;
  // A short end is free unless it stops on the shelf at that end where that shelf runs into this wall or also stops on this one.
  const freeEnds = new Map(walls.map((wall) => [wall, [0, 1].map((end) => {
    if (!spans.get(wall)!.short[end]) return false;
    const { side, sideEnd, on } = across(wall, end);
    if (!on || !lands(wall, end)) return true;
    return spans.get(side)!.short[sideEnd] && !lands(side, sideEnd);
  })]));
  const free = (wall: GridfinityWall, end: number) => freeEnds.get(wall)![end];
  // A free end inside the shelf at the other end, which runs into this wall and past this front, is hidden: it gets no finish.
  const hiddenEnds = new Map(walls.map((wall) => [wall, [0, 1].map((end) => {
    const { side, sideEnd, on } = across(wall, 1 - end);
    return free(wall, end) && on && !free(side, sideEnd) && covered(wall, 1 - end) && reach(wall, 1 - end) < widthOf(side) + LABEL_END_SNAP;
  })]));
  const hidden = (wall: GridfinityWall, end: number) => hiddenEnds.get(wall)![end];
  // A corner piece of the size wanted where there is room for it, else as much as there is, but not below LABEL_MIN_FRONT.
  const fit = (wanted: number, room: number) => (room >= wanted ? wanted : room >= LABEL_MIN_FRONT ? room : 0);
  const notchOf = (wall: GridfinityWall) => Math.min(size, widthOf(wall) / 2, (spans.get(wall)!.length - LABEL_MIN_FRONT) / 2);
  // The front of the shelf at an end left straight past this shelf's front, less its own rounded end and LABEL_CLEARANCE.
  const straight = (wall: GridfinityWall, end: number) => {
    const { side, sideEnd } = across(wall, end);
    return past(wall, end) - (round && free(side, 1 - sideEnd) ? notchOf(side) + LABEL_CLEARANCE : 0);
  };
  const direction = (wall: GridfinityWall, du: number, dv: number) => {
    const o = labelPoint(wall, hx, hz, 0, 0);
    const p = labelPoint(wall, hx, hz, du, dv);
    return { x: p.x - o.x, z: p.z - o.z };
  };
  const fullProfile = (wall: GridfinityWall, w: number): GridfinityLabelProfile => ({ wall, width: w, from: -alongOf(wall) - LABEL_PAST, to: alongOf(wall) + LABEL_PAST });
  const shelves: GridfinityLabelPieces["shelves"] = [];
  const corners: GridfinityLabelPieces["corners"] = [];
  walls.forEach((wall) => {
    const along = alongOf(wall);
    const width = widthOf(wall);
    const point = (u: number, v: number) => labelPoint(wall, hx, hz, u, v);
    const { centre, length } = spans.get(wall)!;
    const finished = [0, 1].map((end) => free(wall, end) && !hidden(wall, end));
    const [from, to] = [0, 1].map((end) => {
      const sign = end === 0 ? -1 : 1;
      if (!free(wall, end)) return sign * (along + LABEL_PAST);
      if (!hidden(wall, end)) return centre + sign * length / 2;
      return sign * Math.min(along - gap(wall, end), widthOf(across(wall, 1 - end).side) - LABEL_CLEARANCE - along);
    });
    const notch = notchOf(wall);
    const notches: GridfinityLabelCornerShape[] = [];
    // The cuts reach out past the shelf's end and front, so no sliver of either is left standing.
    if (round && notch > 0 && finished[0]) notches.push({ at: point(from, width), a: direction(wall, 1, 0), b: direction(wall, 0, -1), size: notch, round: true, reachA: LABEL_PAST, reachB: LABEL_PAST });
    if (round && notch > 0 && finished[1]) notches.push({ at: point(to, width), a: direction(wall, -1, 0), b: direction(wall, 0, -1), size: notch, round: true, reachA: LABEL_PAST, reachB: LABEL_PAST });
    shelves.push({ profile: { wall, width, from, to }, notches });
    // Beside a finished end, against the wall: short of its rounding, of the wall there and of a shelf on that wall that comes near.
    const endSize = (end: number) => {
      const { side, sideEnd, on } = across(wall, end);
      const s = Math.min(size, width - (round ? notch : 0) - LABEL_CLEARANCE, gap(wall, end) - LABEL_CLEARANCE);
      if (!on || gap(side, sideEnd) - size >= s + LABEL_CLEARANCE) return s;
      return fit(s, gap(wall, end) - widthOf(side) - size - LABEL_CLEARANCE);
    };
    const under = [fullProfile(wall, width)];
    if (finished[0] && endSize(0) > 0) corners.push({ at: point(from, 0), a: direction(wall, -1, 0), b: direction(wall, 0, 1), size: endSize(0), round, under, reachA: 0, reachB: LABEL_PAST });
    if (finished[1] && endSize(1) > 0) corners.push({ at: point(to, 0), a: direction(wall, 1, 0), b: direction(wall, 0, 1), size: endSize(1), round, under, reachA: 0, reachB: LABEL_PAST });
    // In front of an end that runs into the wall, against the wall or the shelf there: at most half the shelf's length.
    const meetSize = Math.min(size, length / 2);
    if (meetSize <= 0) return;
    [0, 1].forEach((end) => {
      if (free(wall, end)) return;
      // An open side has no wall to meet.
      if (open?.[LABEL_SIDE_WALLS[wall][end]]) return;
      const { side, sideEnd, on } = across(wall, end);
      const meets = on && !free(side, sideEnd) && covered(wall, end) && covered(side, sideEnd);
      const sideWidth = meets ? widthOf(side) : 0;
      let cornerSize = meetSize;
      if (meets) cornerSize = fit(Math.min(meetSize, spans.get(side)!.length / 2), Math.min(straight(wall, end), straight(side, sideEnd)));
      else if (on) {
        // None where the shelf on that wall stands in front of this one; clear of it where it starts beyond.
        const start = gap(side, sideEnd);
        if (start < width && covered(wall, end)) return;
        if (start >= width) cornerSize = fit(meetSize, start - width - size - LABEL_CLEARANCE);
      }
      if (cornerSize <= 0) return;
      // Where two shelves meet, the corner between their fronts is made once, by the first of the two.
      if (meets && walls.indexOf(side) < walls.indexOf(wall)) return;
      // Kept to the shelves and a band at the front strip's height, so nothing hangs down below the front edge.
      const strips = [fullProfile(wall, width), { ...fullProfile(wall, width + cornerSize), strip: true }];
      if (meets) strips.push(fullProfile(side, sideWidth), { ...fullProfile(side, sideWidth + cornerSize), strip: true });
      const inward = end === 0 ? 1 : -1;
      corners.push({ at: point((end === 0 ? -along : along) + inward * sideWidth, width), a: direction(wall, inward, 0), b: direction(wall, 0, 1), size: cornerSize, round, under: strips, reachA: LABEL_PAST, reachB: 0 });
    });
  });
  return { top, floor, inside: { hx, hz, radius: GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL, ...(open && LABEL_WALLS.some((wall) => open[wall]) ? { open } : {}) }, shelves, corners };
}

/** The shelf's cross-section, wall side first: top, the straight strip at the front, the underside back down to the wall. */
function labelSection(pieces: GridfinityLabelPieces, width: number, strip = false): Array<[v: number, y: number]> {
  const top = pieces.top;
  if (strip) return [[-LABEL_PAST, top], [width, top], [width, top - LABEL_LAND], [-LABEL_PAST, top - LABEL_LAND]];
  const bottom = top - LABEL_LAND - width * LABEL_RISE;
  // The underside carries on into the wall, so no corner of the profile lies on the wall's face.
  return [[-LABEL_PAST, top], [width, top], [width, top - LABEL_LAND], [-LABEL_PAST, bottom - LABEL_PAST * LABEL_RISE]];
}

/** The profile's cross-section at its two ends, as points in the shape's frame (x, y, z). */
export function gridfinityLabelProfileEnds(pieces: GridfinityLabelPieces, profile: GridfinityLabelProfile) {
  const { hx, hz } = pieces.inside;
  const at = (u: number) => labelSection(pieces, profile.width, profile.strip).map(([v, y]): Vec3 => {
    const p = labelPoint(profile.wall, hx, hz, u, v);
    return [p.x, y, p.z];
  });
  return { start: at(profile.from), end: at(profile.to) };
}

/** Each wall's finger scoop switch. */
export const GRIDFINITY_SCOOP_WALL_KEYS = { back: "gridfinityScoopBack", front: "gridfinityScoopFront", left: "gridfinityScoopLeft", right: "gridfinityScoopRight" } as const;
/**
 * A scoop's circle is moved this far towards the floor and the wall, so that it crosses them at a
 * slight angle rather than touching them along a line.
 */
const SCOOP_SINK = 0.02;
/** Segments in a scoop's quarter circle in the mesh: four times the segments of the bin's corners, as a scoop is a much larger curve. */
const SCOOP_STEPS = 4 * CORNER_STEPS;
/** The straight wall kept above the largest scoop, so it does not run out in a sliver at the top of a bin without the lip. */
const SCOOP_WALL_ABOVE = 0.5;
/** The rounding of every inner floor edge of a bin with a scoop: the inner corners' radius. */
const SCOOP_FLOOR_ROUNDING = GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL;
/**
 * The radius whose sunk circle runs, on the end walls, through the point where the inner corner's rounding meets the
 * floor's, SCOOP_FLOOR_ROUNDING out from the scoop's wall and up from the floor (9.63 mm). A radius within
 * SCOOP_CORNER_CLEAR of it leaves edges shorter than 0.01 mm in the exact body, and very close the kernel's cut leaves the
 * scoop out, so it is drawn that far below.
 */
const SCOOP_CORNER_RADIUS = (SCOOP_FLOOR_ROUNDING + SCOOP_SINK) / (1 - Math.SQRT1_2);
const SCOOP_CORNER_CLEAR = 0.03;

/** How high a scoop can rise: from the floor up to the highest floor, where the lip's support leaves the wall, or the top without the lip. */
function scoopDepth(plan: { type: GridfinityType; top: number; lip: boolean; floor: number }) {
  return floorMaxHeight(plan) - plan.floor;
}

/** Whether a scoop of the smallest radius fits under the lip's support, or under the top without the lip. */
function scoopFits(plan: { type: GridfinityType; top: number; lip: boolean; floor: number }) {
  return plan.type === "bin" && scoopDepth(plan) - SCOOP_WALL_ABOVE >= MIN_GRIDFINITY_SCOOP_RADIUS;
}

/**
 * The largest radius the bin's scoops take: that depth less SCOOP_WALL_ABOVE, and across the bin at
 * least 2 mm of floor left, between two scoops facing each other or between a scoop and the wall
 * opposite it, as for the shelves.
 */
export function gridfinityScoopMaxRadius(shape: GridfinityShapeFields) {
  const plan = gridfinityPlan(shape);
  const { hx, hz } = labelInside(plan);
  const on = (wall: GridfinityWall) => shape[GRIDFINITY_SCOOP_WALL_KEYS[wall]] === true && !plan.open[wall];
  const room = (wall: GridfinityWall) => {
    const [half, facing] = wall === "back" || wall === "front" ? [hz, on(wall === "back" ? "front" : "back")] : [hx, on(wall === "left" ? "right" : "left")];
    return facing ? half - 1 : 2 * half - 2;
  };
  return Math.min(scoopDepth(plan) - SCOOP_WALL_ABOVE, ...LABEL_WALLS.filter(on).map(room));
}

/** Whether a bin of this size can have a scoop at all. */
export function gridfinityScoopFits(shape: GridfinityShapeFields) {
  return scoopFits(gridfinityPlan(shape));
}

/** The scoops' radius as it is built: its own, else half the height a scoop can rise, within what the bin takes. */
export function gridfinityScoopRadius(shape: GridfinityShapeFields) {
  const max = gridfinityScoopMaxRadius(shape);
  const plan = gridfinityPlan(shape);
  return clampLabel(shape.gridfinityScoopRadius, clamp(scoopDepth(plan) / 2, MIN_GRIDFINITY_SCOOP_RADIUS, max), MIN_GRIDFINITY_SCOOP_RADIUS, Math.max(MIN_GRIDFINITY_SCOOP_RADIUS, max));
}

/** A scoop along a wall, from u = from to u = to. */
export type GridfinityScoop = { wall: GridfinityWall; from: number; to: number };

export type GridfinityScoopPieces = {
  floor: number;
  radius: number;
  /** The scoops' circle centre in a wall's own section (v out from the wall, y up). */
  centre: [v: number, y: number];
  /** The bin's inside the scoops are cut to, as for the shelves. */
  inside: { hx: number; hz: number; radius: number };
  scoops: GridfinityScoop[];
};

/** The bin's finger scoops as pieces for the mesh and the exact body, or null when it has none. */
export function gridfinityScoopPieces(shape: GridfinityShapeFields): GridfinityScoopPieces | null {
  if (!gridfinityScoopFits(shape)) return null;
  const plan = gridfinityPlan(shape);
  const { open } = plan;
  // An open side has no wall for a scoop (#682); its setting is kept for when it is closed again.
  const walls = LABEL_WALLS.filter((wall) => shape[GRIDFINITY_SCOOP_WALL_KEYS[wall]] === true && !open[wall]);
  if (walls.length === 0) return null;
  const { hx, hz } = labelInside(plan);
  const floor = plan.floor;
  const chosen = gridfinityScoopRadius(shape);
  const radius = Math.abs(chosen - SCOOP_CORNER_RADIUS) < SCOOP_CORNER_CLEAR ? SCOOP_CORNER_RADIUS - SCOOP_CORNER_CLEAR : chosen;
  const scoops = walls.map((wall): GridfinityScoop => {
    const along = wall === "back" || wall === "front" ? hx : hz;
    // An end at an open side runs as far past the outline as the other runs into the wall.
    const [start, end] = LABEL_SIDE_WALLS[wall].map((side) => (open[side] ? GRIDFINITY_WALL : 0));
    return { wall, from: -along - start - LABEL_PAST, to: along + end + LABEL_PAST };
  });
  return { floor, radius, centre: [radius - SCOOP_SINK, floor + radius - SCOOP_SINK], inside: { hx, hz, radius: GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL }, scoops };
}

/**
 * The scoops' cross-section in a wall's own (v, y), counter-clockwise: from inside the wall and the
 * floor out to under the circle's lowest point, round the quarter circle in SCOOP_STEPS to its point
 * nearest the wall, and back into the wall; `arc` gives the arc's three points for an exact edge.
 */
export function gridfinityScoopSection(pieces: GridfinityScoopPieces) {
  const [cv, cy] = pieces.centre;
  const r = pieces.radius;
  const at = (angle: number): [number, number] => [cv + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const low = pieces.floor - LABEL_PAST;
  const outline: Array<[number, number]> = [[-LABEL_PAST, low], [cv, low]];
  for (let k = 0; k <= SCOOP_STEPS; k += 1) outline.push(at(-Math.PI / 2 - (k / SCOOP_STEPS) * (Math.PI / 2)));
  outline.push([-LABEL_PAST, cy]);
  return { outline, arc: [at(-Math.PI / 2), at((-3 * Math.PI) / 4), at(Math.PI)] as Array<[number, number]> };
}

/** A point of a scoop's wall section in the shape's frame (x, y, z), at u along the wall. */
export function gridfinityScoopPoint(pieces: GridfinityScoopPieces, scoop: GridfinityScoop, u: number, [v, y]: [number, number]): Vec3 {
  const p = labelPoint(scoop.wall, pieces.inside.hx, pieces.inside.hz, u, v);
  return [p.x, y, p.z];
}

/** Each side's open switch (#682). */
export const GRIDFINITY_OPEN_WALL_KEYS = { back: "gridfinityOpenBack", front: "gridfinityOpenFront", left: "gridfinityOpenLeft", right: "gridfinityOpenRight" } as const;
/** How far a cutter that runs out through an open side stays straight past the outline before its rounding starts. */
const OPEN_CLEAR = 2;
/**
 * How far the inside's cutter and a compartment's run out through an open side: far enough that their 3.75 mm corners
 * and the floor's 2.8 mm rounding lie OPEN_CLEAR beyond the outline, where the bin is not. Scoops reach 1 mm past it
 * (LABEL_PAST) and shelves 1 mm past the inside, as into a wall, so none of them ends on a rounding of the cutter.
 */
export const GRIDFINITY_OPEN_REACH = GRIDFINITY_BIN_RADIUS + OPEN_CLEAR;

/** Whether a bin has sides to open: every bin but a solid block, one without the lip whose floor is raised to the top. */
function openFits({ type, top, lip, floor }: { type: GridfinityType; top: number; lip: boolean; floor: number }) {
  return type === "bin" && floor < (lip ? top + GRIDFINITY_LIP_HEIGHT : top);
}

/** Whether a bin of these settings has sides to open, for the settings window. */
export function gridfinityOpenFits(shape: GridfinityShapeFields) {
  return openFits(gridfinityPlan(shape));
}

/** Which of a rectangle's corners are square: those touching an open side, where it runs straight out. */
export function gridfinityOpenCorners(open: Partial<Record<GridfinityWall, boolean>> = {}) {
  return { backLeft: Boolean(open.back || open.left), backRight: Boolean(open.back || open.right), frontLeft: Boolean(open.front || open.left), frontRight: Boolean(open.front || open.right) };
}

/**
 * A rounded rectangle's half sizes and middle when it runs `reach` further out through its open sides and keeps the
 * others where they are: the inside's cutter, a compartment's, or the inside the pieces are cut to.
 */
export function gridfinityOpenGrown(hx: number, hz: number, open: Partial<Record<GridfinityWall, boolean>>, reach: number) {
  const [left, right, back, front] = (["left", "right", "back", "front"] as const).map((wall) => (open[wall] ? reach : 0));
  return { hx: hx + (left + right) / 2, hz: hz + (back + front) / 2, x: (right - left) / 2, z: (front - back) / 2 };
}

/** Across (x) or deep (z), for the compartments and the dividers between them. */
export type GridfinityAxis = "x" | "z";

/** Whether a bin has room for dividers: their top, 0.85 mm under the top like the label shelves', at least 3 mm above the floor. */
export function gridfinityDividerFits(shape: GridfinityShapeFields) {
  const plan = gridfinityPlan(shape);
  return plan.type === "bin" && plan.top - LABEL_DROP - plan.floor >= MIN_GRIDFINITY_DIVIDER_HEIGHT - 1e-9;
}

/** The most compartments a bin takes along an axis: 4 a grid unit of 42 mm, so 2 a cell of the half-size grid. */
export function gridfinityUnitCompartments(shape: GridfinityShapeFields, axis: GridfinityAxis) {
  const plan = gridfinityPlan(shape);
  return (GRIDFINITY_COMPARTMENTS_PER_UNIT * plan.count[axis] * plan.pitch) / GRIDFINITY_GRID;
}

/**
 * The compartments as built: 1 each way unless dividers fit, at most 4 a grid unit each way, and at most
 * 40 in all. Over that the number across is lowered to fit beside the number deep, always in that order,
 * so a file or an MCP call over it builds the same every time.
 */
function compartmentCounts(shape: GridfinityShapeFields) {
  if (!gridfinityDividerFits(shape)) return { x: 1, z: 1 };
  const along = (value: number | undefined, max: number) => (Number.isFinite(value) ? clamp(Math.round(value as number), 1, max) : 1);
  const z = along(shape.gridfinityCompartmentsZ, gridfinityUnitCompartments(shape, "z"));
  const x = along(shape.gridfinityCompartmentsX, Math.min(gridfinityUnitCompartments(shape, "x"), Math.floor(MAX_GRIDFINITY_COMPARTMENTS / z)));
  return { x, z };
}

/** The compartments along an axis as they are built. */
export function gridfinityCompartmentCount(shape: GridfinityShapeFields, axis: GridfinityAxis) {
  return compartmentCounts(shape)[axis];
}

/** The most compartments the settings window offers along an axis, beside those built along the other: 40 in all are never crossed by hand. */
export function gridfinityCompartmentMax(shape: GridfinityShapeFields, axis: GridfinityAxis) {
  const counts = compartmentCounts(shape);
  return Math.min(gridfinityUnitCompartments(shape, axis), Math.floor(MAX_GRIDFINITY_COMPARTMENTS / counts[axis === "x" ? "z" : "x"]));
}

/** The dividers' thickness as it is built: its own, else 1.2 mm, between 0.8 and 3. */
export function gridfinityDividerThickness(shape: GridfinityShapeFields) {
  return clampLabel(shape.gridfinityDividerThickness, DEFAULT_GRIDFINITY_DIVIDER_THICKNESS, MIN_GRIDFINITY_DIVIDER_THICKNESS, MAX_GRIDFINITY_DIVIDER_THICKNESS);
}

/** The bin's inside along an axis, from wall to wall. */
function insideLength(plan: GridfinityPlan, axis: GridfinityAxis) {
  const { hx, hz } = labelInside(plan);
  return 2 * (axis === "x" ? hx : hz);
}

/**
 * Each divider's middle along an axis as it is built, in mm from the inside of the left or the back wall.
 * Unset, or a list that does not have one fewer than the compartments, they are evenly spaced. Moved ones
 * keep their place, in order from the wall, only pushed far enough from the walls and one another for every
 * compartment to stay 6 mm wide; so they also keep it when the bin is resized.
 */
export function gridfinityDividerPositions(shape: GridfinityShapeFields, axis: GridfinityAxis) {
  const n = gridfinityCompartmentCount(shape, axis);
  if (n < 2) return [];
  const length = insideLength(gridfinityPlan(shape), axis);
  const thickness = gridfinityDividerThickness(shape);
  const stored = axis === "x" ? shape.gridfinityDividerPositionsX : shape.gridfinityDividerPositionsZ;
  if (!Array.isArray(stored) || stored.length !== n - 1 || !stored.every(Number.isFinite)) {
    const width = (length - (n - 1) * thickness) / n;
    return Array.from({ length: n - 1 }, (_, i) => (i + 1) * width + i * thickness + thickness / 2);
  }
  const step = MIN_GRIDFINITY_COMPARTMENT + thickness;
  const positions: number[] = [];
  // Each within the room the walls leave it with all the others at their closest, and past the one before it;
  // that one is at most its own room's end, a step before this one's, so pushing on never crosses the far wall.
  [...stored].sort((a, b) => a - b).forEach((p, i) => {
    const low = MIN_GRIDFINITY_COMPARTMENT + thickness / 2 + i * step;
    const high = length - MIN_GRIDFINITY_COMPARTMENT - thickness / 2 - (n - 2 - i) * step;
    positions.push(Math.max(clamp(p, low, high), i === 0 ? low : positions[i - 1] + step));
  });
  return positions;
}

/**
 * How far one divider can be moved with the others where they are, for its slider: rounded inwards onto
 * steps of 0.1 mm, as a slider whose end is off its steps steps off them, but never past where the divider
 * is, so the slider shows it and a range too narrow for a step keeps it. Null for a divider the bin does not have.
 */
export function gridfinityDividerLimits(shape: GridfinityShapeFields, axis: GridfinityAxis, index: number) {
  const positions = gridfinityDividerPositions(shape, axis);
  if (!Number.isInteger(index) || index < 0 || index >= positions.length) return null;
  const length = insideLength(gridfinityPlan(shape), axis);
  const thickness = gridfinityDividerThickness(shape);
  const min = index === 0 ? MIN_GRIDFINITY_COMPARTMENT + thickness / 2 : positions[index - 1] + thickness + MIN_GRIDFINITY_COMPARTMENT;
  const max = index === positions.length - 1 ? length - MIN_GRIDFINITY_COMPARTMENT - thickness / 2 : positions[index + 1] - thickness - MIN_GRIDFINITY_COMPARTMENT;
  const position = positions[index];
  return { min: Math.min(position, Math.ceil(min * 10 - 1e-6) / 10), max: Math.max(position, Math.floor(max * 10 + 1e-6) / 10) };
}

/** One compartment in the shape's frame: its sides, middle and half sizes, and which of the bin's walls it lies against. */
export type GridfinityCompartment = {
  column: number;
  row: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  centre: FlatPoint;
  hx: number;
  hz: number;
  onWall: Record<GridfinityWall, boolean>;
  /** The bin's open sides it lies against (#682). */
  open: Record<GridfinityWall, boolean>;
};

/**
 * The bin's compartments, counted from the back left row by row, with the dividers' top and thickness and
 * their middles in the shape's frame (centred, xs across and zs deep); null for a bin of one compartment.
 */
export function gridfinityCompartments(shape: GridfinityShapeFields) {
  const counts = compartmentCounts(shape);
  if (counts.x === 1 && counts.z === 1) return null;
  const plan = gridfinityPlan(shape);
  const { hx, hz } = labelInside(plan);
  const thickness = gridfinityDividerThickness(shape);
  const xs = gridfinityDividerPositions(shape, "x").map((p) => p - hx);
  const zs = gridfinityDividerPositions(shape, "z").map((p) => p - hz);
  // A compartment runs from the wall's inside or a divider's face to the next.
  const sides = (dividers: number[], half: number) => ({ from: [-half, ...dividers.map((d) => d + thickness / 2)], to: [...dividers.map((d) => d - thickness / 2), half] });
  const across = sides(xs, hx);
  const deep = sides(zs, hz);
  const cells: GridfinityCompartment[] = [];
  for (let row = 0; row < counts.z; row += 1) {
    for (let column = 0; column < counts.x; column += 1) {
      const [x0, x1, z0, z1] = [across.from[column], across.to[column], deep.from[row], deep.to[row]];
      cells.push({
        column, row, x0, x1, z0, z1,
        centre: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
        hx: (x1 - x0) / 2,
        hz: (z1 - z0) / 2,
        onWall: { back: row === 0, front: row === counts.z - 1, left: column === 0, right: column === counts.x - 1 },
        open: { back: row === 0 && plan.open.back, front: row === counts.z - 1 && plan.open.front, left: column === 0 && plan.open.left, right: column === counts.x - 1 && plan.open.right },
      });
    }
  }
  return { top: plan.top - LABEL_DROP, thickness, xs, zs, cells };
}

/** Every compartment's floor edges are rounded as the inner corners, with a scoop or without, so the dividers meet the floor in a curve. */
const COMPARTMENT_FLOOR_ROUNDING = SCOOP_FLOOR_ROUNDING;
/** How far each compartment's cutter reaches up into the cutter over the dividers' top, so their faces do not coincide. */
export const GRIDFINITY_DIVIDER_CUTTER_OVERLAP = 0.3;

export type GridfinityCompartmentPieces = {
  /** The dividers' top. */
  top: number;
  floor: number;
  thickness: number;
  floorRounding: number;
  /** Each compartment, its inside, its scoops and its label in its own frame, centred on its middle. */
  cells: Array<{ column: number; row: number; centre: FlatPoint; onWall: Record<GridfinityWall, boolean>; open: Record<GridfinityWall, boolean>; inside: { hx: number; hz: number; radius: number }; scoops: GridfinityScoopPieces | null; labels: GridfinityLabelPieces | null }>;
};

/**
 * A compartment's finger scoops in its own frame: the bin's, each against the wall or the divider on its side, with
 * the radius made smaller where it would leave less than 2 mm of floor, as the bin's is. Where even the smallest
 * radius would leave less, that way's scoops are left out, both of a facing pair, as a bin too low has none.
 */
function compartmentScoops(pieces: GridfinityScoopPieces, hx: number, hz: number, open?: Record<GridfinityWall, boolean>): GridfinityScoopPieces | null {
  const walls = pieces.scoops.map((scoop) => scoop.wall);
  const ways = ([[hz, ["back", "front"]], [hx, ["left", "right"]]] as const).map(([half, pair]) => {
    const on = pair.filter((wall) => walls.includes(wall));
    return { on, room: on.length === 2 ? half - 1 : 2 * half - 2 };
  }).filter((way) => way.on.length > 0 && way.room >= MIN_GRIDFINITY_SCOOP_RADIUS - 1e-9);
  if (ways.length === 0) return null;
  const chosen = Math.min(pieces.radius, ...ways.map((way) => way.room));
  const radius = Math.abs(chosen - SCOOP_CORNER_RADIUS) < SCOOP_CORNER_CLEAR ? SCOOP_CORNER_RADIUS - SCOOP_CORNER_CLEAR : chosen;
  const scoops = walls.filter((wall) => ways.some((way) => (way.on as readonly GridfinityWall[]).includes(wall))).map((wall): GridfinityScoop => {
    const along = wall === "back" || wall === "front" ? hx : hz;
    // An end at the bin's open side runs past the outline, as the bin's own scoops do.
    const [start, end] = LABEL_SIDE_WALLS[wall].map((side) => (open?.[side] ? GRIDFINITY_WALL : 0));
    return { wall, from: -along - start - LABEL_PAST, to: along + end + LABEL_PAST };
  });
  return { floor: pieces.floor, radius, centre: [radius - SCOOP_SINK, pieces.floor + radius - SCOOP_SINK], inside: { hx, hz, radius: GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL }, scoops };
}

/** A compartment label's shortest length, in per cent of its side. */
export const MIN_GRIDFINITY_COMPARTMENT_LABEL_LENGTH = 10;
/** A compartment label shorter than this (mm) would be a nub in the corner, and is not built. */
export const MIN_GRIDFINITY_COMPARTMENT_LABEL_MM = 4;
/** What a compartment label leaves open in front of it (mm), so it never closes the compartment off. */
const COMPARTMENT_LABEL_OPEN = 6;
/**
 * A label end, or its end piece's outer edge, this close to where the compartment's corner starts to round goes onto it:
 * a few thousandths of a millimetre off it left edges shorter than 0.01 mm in the exact body.
 */
const COMPARTMENT_LABEL_SNAP = 0.05;

/** The rounding or chamfer of a compartment's label, in mm: the bin's, at most what keeps its narrowest label 1 mm from the middle, as the bin's own cap. */
export function gridfinityCompartmentCornerSize(shape: GridfinityShapeFields, cell: { hx: number; hz: number }) {
  return clamp(gridfinityLabelCornerSize(shape), 0, Math.max(0, Math.min(MAX_GRIDFINITY_LABEL_CORNER_SIZE, Math.min(cell.hx, cell.hz) - 1 - MIN_GRIDFINITY_LABEL_WIDTH)));
}

/**
 * The widest label a compartment takes on a side: its underside above the floor, and 6 mm of the compartment left open
 * in front of it and its corner. None on the bin's open side, which has no wall for it.
 */
export function gridfinityCompartmentLabelMaxWidth(shape: GridfinityShapeFields, cell: { hx: number; hz: number; open?: Record<GridfinityWall, boolean> }, side: GridfinityWall) {
  if (cell.open?.[side]) return 0;
  const across = 2 * (side === "back" || side === "front" ? cell.hz : cell.hx);
  return Math.min(labelFloorWidth(gridfinityPlan(shape)), across - COMPARTMENT_LABEL_OPEN - gridfinityCompartmentCornerSize(shape, cell));
}

/**
 * A compartment's label as it is built, null when it has none or the compartment has no room for it: its side, its
 * length in per cent of that side (10 to 100), where it sits along the side and its width (14 mm unless set, within what
 * the compartment takes). The first label for a compartment counts.
 */
export function gridfinityCompartmentLabel(shape: GridfinityShapeFields, column: number, row: number) {
  if (!gridfinityLabelFits(shape)) return null;
  const cell = gridfinityCompartments(shape)?.cells.find((c) => c.column === column && c.row === row);
  const label = shape.gridfinityCompartmentLabels?.find((l) => l.column === column && l.row === row);
  if (!cell || !label || !LABEL_WALLS.includes(label.side)) return null;
  const max = gridfinityCompartmentLabelMaxWidth(shape, cell, label.side);
  if (max < MIN_GRIDFINITY_LABEL_WIDTH) return null;
  return {
    side: label.side,
    length: clampLabel(label.length, 100, MIN_GRIDFINITY_COMPARTMENT_LABEL_LENGTH, 100),
    align: label.align ?? "middle",
    width: clampLabel(label.width, Math.min(DEFAULT_GRIDFINITY_LABEL_WIDTH, max), MIN_GRIDFINITY_LABEL_WIDTH, max),
  };
}

/**
 * A compartment's label as pieces in its own frame, as a bin's shelf on one wall: run into the corners where it nearly
 * reaches them, its free ends moved onto the corner's rounding when they land within COMPARTMENT_LABEL_SNAP of it, and
 * left out under MIN_GRIDFINITY_COMPARTMENT_LABEL_MM.
 */
function compartmentLabelPieces(shape: GridfinityShapeFields, cell: GridfinityCompartment): GridfinityLabelPieces | null {
  const label = gridfinityCompartmentLabel(shape, cell.column, cell.row);
  if (!label) return null;
  const plan = gridfinityPlan(shape);
  const { side, width } = label;
  const size = gridfinityCompartmentCornerSize(shape, cell);
  const round = (shape.gridfinityLabelCorner ?? DEFAULT_GRIDFINITY_LABEL_CORNER) !== "chamfer";
  const along = side === "back" || side === "front" ? cell.hx : cell.hz;
  const length = (label.length / 100) * 2 * along;
  if (length < MIN_GRIDFINITY_COMPARTMENT_LABEL_MM) return null;
  // The lip's support leans into the bin only where the end meets the bin's wall, not a divider.
  const snapAt = (end: number) => LABEL_END_SNAP + (plan.lip && cell.onWall[LABEL_SIDE_WALLS[side][end]] ? LABEL_LIP_LEAN : 0);
  const rounding = GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL;
  // The end piece beside a free end, as labelPiecesIn makes it on a wall alone.
  const piece = Math.min(size, width - (round ? Math.min(size, width / 2, (length - LABEL_MIN_FRONT) / 2) : 0) - LABEL_CLEARANCE);
  const snapped = (gap: number) => {
    if (Math.abs(gap - rounding) < COMPARTMENT_LABEL_SNAP) return rounding;
    if (piece > 0 && gap - LABEL_CLEARANCE >= piece && Math.abs(gap - piece - rounding) < COMPARTMENT_LABEL_SNAP) return rounding + piece;
    return gap;
  };
  const spanOf = (wall: GridfinityWall, half: number): LabelSpan => {
    if (label.length >= 100 || length >= 2 * half - snapAt(0) - snapAt(1)) return { centre: 0, length: 2 * half, short: [false, false] };
    // Start and end are along the editor's axes: towards -x on the back and front sides, towards the back on the others.
    const sign = wall === "back" || wall === "right" ? 1 : -1;
    const centre = sign * (label.align === "start" ? -(half - length / 2) : label.align === "end" ? half - length / 2 : 0);
    const short = [centre - length / 2 > -half + snapAt(0), centre + length / 2 < half - snapAt(1)];
    const from = short[0] ? -half + snapped(half + centre - length / 2) : centre - length / 2;
    const to = short[1] ? half - snapped(half - centre - length / 2) : centre + length / 2;
    return { centre: (from + to) / 2, length: to - from, short };
  };
  return labelPiecesIn({ hx: cell.hx, hz: cell.hz, walls: [side], widthOf: () => width, spanOf, size, round, top: plan.top - LABEL_DROP, floor: plan.floor, open: cell.open });
}

/**
 * The compartments as pieces for the exact body and the mesh: each with the inner wall's corners and a rounded floor,
 * and the bin's finger scoops repeated against every divider that runs the same way as their wall; null for a bin of
 * one compartment.
 */
export function gridfinityCompartmentPieces(shape: GridfinityShapeFields): GridfinityCompartmentPieces | null {
  const compartments = gridfinityCompartments(shape);
  if (!compartments) return null;
  const plan = gridfinityPlan(shape);
  const scoops = gridfinityScoopPieces(shape);
  return {
    top: compartments.top,
    floor: plan.floor,
    thickness: compartments.thickness,
    floorRounding: COMPARTMENT_FLOOR_ROUNDING,
    cells: compartments.cells.map((cell) => ({
      column: cell.column,
      row: cell.row,
      centre: cell.centre,
      onWall: cell.onWall,
      open: cell.open,
      inside: { hx: cell.hx, hz: cell.hz, radius: GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL },
      scoops: scoops && compartmentScoops(scoops, cell.hx, cell.hz, cell.open),
      labels: compartmentLabelPieces(shape, cell),
    })),
  };
}

/** Whether a compartment is too narrow for some of the bin's finger scoops and is built without them, which the settings window says under the radius. */
export function gridfinityScoopsLeftOut(shape: GridfinityShapeFields) {
  const scoops = gridfinityScoopPieces(shape);
  const compartments = scoops && gridfinityCompartments(shape);
  if (!scoops || !compartments) return false;
  return compartments.cells.some((cell) => (compartmentScoops(scoops, cell.hx, cell.hz)?.scoops.length ?? 0) < scoops.scoops.length);
}

/**
 * The least volume the cutter over the dividers' top fused with the compartments' cutters can have, from their own
 * volumes: each compartment's cutter overlaps the one above by at most its section times the height it reaches over
 * the top, with the length it runs out through an open side. Less is a compartment the kernel's fuse lost.
 */
export function gridfinityCompartmentCutBound(pieces: GridfinityCompartmentPieces, volumes: { box: number; cutters: number[] }) {
  return pieces.cells.reduce((sum, { inside: { hx, hz, radius }, open }, i) => {
    const grown = gridfinityOpenGrown(hx, hz, open, GRIDFINITY_OPEN_REACH);
    return sum + volumes.cutters[i] - (4 * grown.hx * grown.hz - (4 - Math.PI) * radius ** 2) * GRIDFINITY_DIVIDER_CUTTER_OVERLAP;
  }, volumes.box);
}

/**
 * The least volume the dividers add to a bin cut to its whole inside: the inside less the compartments, each with its
 * rounded corners, standing from the floor to where the lip's support leaves the wall, and from there up to their top
 * where they are clear of the support, which leans in as far as it rises. Less is a divider the kernel's cut took
 * away. A lost stretch between two others is caught only where the scoops add little.
 */
export function gridfinityDividerBound(plan: GridfinityPlan, pieces: GridfinityCompartmentPieces) {
  const { hx, hz } = labelInside(plan);
  const support = floorMaxHeight(plan);
  // A corner touching an open side is square: the inside's cutter and a compartment's run straight out there. What the
  // dividers add between the inner wall's line and the outline is left out.
  const rounded = (x: number, z: number, open: Record<GridfinityWall, boolean>) => 4 * x * z - ((4 - Math.PI) * (GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL) ** 2 * Object.values(gridfinityOpenCorners(open)).filter((square) => !square).length) / 4;
  const area = pieces.cells.reduce((rest, cell) => rest - rounded(cell.inside.hx, cell.inside.hz, cell.open), rounded(hx, hz, plan.open));
  const lean = Math.max(0, pieces.top - support);
  // Above the support's foot: the inside kept clear of it less each compartment's rectangle there, and back the rounded
  // corners where two dividers meet, 6 mm or more from the walls.
  const span = (from: number, to: number, half: number) => Math.max(0, Math.min(to, half - lean) - Math.max(from, lean - half));
  const corner = ((4 - Math.PI) * (GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL) ** 2) / 4;
  const inner: Array<[GridfinityWall, GridfinityWall]> = [["back", "left"], ["back", "right"], ["front", "left"], ["front", "right"]];
  const clear = pieces.cells.reduce((rest, { centre, inside, onWall }) => rest
    - span(centre.x - inside.hx, centre.x + inside.hx, hx) * span(centre.z - inside.hz, centre.z + inside.hz, hz)
    + inner.filter(([a, b]) => !onWall[a] && !onWall[b]).length * corner, 4 * (hx - lean) * (hz - lean));
  return area * (Math.min(pieces.top, support) - plan.floor) + clear * lean;
}

/** How much of a floor fillet's section of radius r lies under the height h above the floor. */
function filletUnder(r: number, h: number) {
  const a = r - Math.min(h, r);
  // r h less the part of a quarter circle from a up to r: the fillet's width at y is r - sqrt(r² - (r - y)²).
  return r * Math.min(h, r) - ((Math.PI * r * r) / 4 - (a * Math.sqrt(r * r - a * a) + r * r * Math.asin(a / r)) / 2);
}

/**
 * The least volume the compartments' floors add to a bin cut to its whole inside with a sharp floor: each compartment's
 * floor rounding, along the bin's walls only up to where the lip's support leaves them, and each scoop at least its
 * square less a quarter circle along its straight part, clear of the corners and of a scoop beside it. With the
 * dividers' bound, a divider the kernel's cut took away comes out under it, unless large scoops leave more in the
 * corners than the divider held.
 */
export function gridfinityCompartmentFloorBound(plan: GridfinityPlan, pieces: GridfinityCompartmentPieces) {
  const r = pieces.floorRounding;
  const under = floorMaxHeight(plan) - plan.floor;
  const fillet = filletUnder(r, r);
  const atWall = filletUnder(r, under);
  const corners: Array<[GridfinityWall, GridfinityWall]> = [["back", "left"], ["back", "right"], ["front", "left"], ["front", "right"]];
  return pieces.cells.reduce((sum, cell) => {
    // Along each side a fillet's section; in each corner a quarter column less an eighth of a ball, at a wall only the
    // part under the support's foot, where its section at y above the floor is a quarter circle of r - y.
    // An open side has a flat floor, rounded only beyond the outline, along it and in its corners.
    const sides = LABEL_WALLS.reduce((total, side) => total + (cell.open[side] ? 0 : cell.onWall[side] ? atWall : fillet) * (2 * (side === "back" || side === "front" ? cell.inside.hx : cell.inside.hz) - 2 * r), 0);
    const rounding = corners.reduce((total, [a, b]) => total + (cell.open[a] || cell.open[b] ? 0 : (Math.PI * (r ** 3 - (r - (cell.onWall[a] || cell.onWall[b] ? Math.min(under, r) : r)) ** 3)) / 12), sides);
    const scoops = cell.scoops;
    if (!scoops) return sum + rounding;
    const [cv, cy] = scoops.centre;
    const section = Math.max(0, cv * (Math.min(cy, pieces.top) - scoops.floor) - (Math.PI * scoops.radius ** 2) / 4 - fillet);
    const walls = scoops.scoops.map((scoop) => scoop.wall);
    const clear = (side: GridfinityWall) => Math.max(r, walls.includes(side) ? cv : 0);
    return scoops.scoops.reduce((total, { wall }) => {
      const along = wall === "back" || wall === "front" ? cell.inside.hx : cell.inside.hz;
      return total + section * Math.max(0, 2 * along - clear(LABEL_SIDE_WALLS[wall][0]) - clear(LABEL_SIDE_WALLS[wall][1]));
    }, sum + rounding);
  }, 0);
}

/** What a change of the compartments along an axis writes: 1 as unset, so a bin taken back to one compartment saves as before, and that axis's dividers evenly spaced again. */
export function gridfinityCompartmentCountPatch(axis: GridfinityAxis, count: number) {
  return axis === "x"
    ? { gridfinityCompartmentsX: count > 1 ? count : undefined, gridfinityDividerPositionsX: undefined }
    : { gridfinityCompartmentsZ: count > 1 ? count : undefined, gridfinityDividerPositionsZ: undefined };
}

/**
 * What moving one divider writes: its axis's whole list, the others where they are built and this one within the
 * room they leave it. From then on that axis keeps its places in mm when the bin is resized; nothing for a divider
 * the bin does not have.
 */
export function gridfinityDividerPositionPatch(shape: GridfinityShapeFields, axis: GridfinityAxis, index: number, value: number): Pick<GridfinityShapeFields, "gridfinityDividerPositionsX" | "gridfinityDividerPositionsZ"> {
  const limits = gridfinityDividerLimits(shape, axis, index);
  if (!limits || !Number.isFinite(value)) return {};
  const positions = gridfinityDividerPositions(shape, axis).map((p, i) => (i === index ? clamp(value, limits.min, limits.max) : p));
  return axis === "x" ? { gridfinityDividerPositionsX: positions } : { gridfinityDividerPositionsZ: positions };
}

/** The largest number a saved project takes in a setting; what the MCP gives is kept within it, so the project opens again. */
const MAX_SAVED_SETTING = 1e6;
/** The most dividers along an axis: 4 compartments a grid unit across the largest bin's 6 units. */
const MAX_GRIDFINITY_DIVIDERS = GRIDFINITY_COMPARTMENTS_PER_UNIT * MAX_GRIDFINITY_UNITS - 1;
/**
 * The most labels kept: one for each compartment any count could give (24 x 24), so labels of compartments a smaller
 * count leaves out come back with it; at most 40 of them are built.
 */
const MAX_GRIDFINITY_COMPARTMENT_LABELS = (MAX_GRIDFINITY_DIVIDERS + 1) ** 2;

/** Dividers' places from outside: a list's finite numbers, at most as many as the largest bin has dividers, within what a project saves; [] for evenly spaced, undefined for no list. */
export function normalizeGridfinityDividerPositions(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((p): p is number => typeof p === "number" && Number.isFinite(p)).slice(0, MAX_GRIDFINITY_DIVIDERS).map((p) => clamp(p, 0, MAX_SAVED_SETTING));
}

/**
 * Compartment labels from outside, a list of them: each with its compartment and a known side, its own length,
 * position and width where they are numbers or known words; at most 576, one for each compartment any count could give.
 */
export function normalizeGridfinityCompartmentLabels(value: unknown): GridfinityCompartmentLabel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const labels: GridfinityCompartmentLabel[] = [];
  (value as unknown[]).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const { column, row, side, length, align, width } = entry as Record<string, unknown>;
    // No bin has a column or row past MAX_GRIDFINITY_DIVIDERS.
    if (!number(column) || !number(row) || !LABEL_WALLS.includes(side as GridfinityWall)) return;
    const [c, r] = [Math.round(column), Math.round(row)];
    if (c < 0 || r < 0 || c > MAX_GRIDFINITY_DIVIDERS || r > MAX_GRIDFINITY_DIVIDERS) return;
    const label: GridfinityCompartmentLabel = { column: c, row: r, side: side as GridfinityWall };
    // Length and width within what the label is built with, so they are saved as they are built.
    if (number(length)) label.length = clamp(length, MIN_GRIDFINITY_COMPARTMENT_LABEL_LENGTH, 100);
    if (align === "start" || align === "middle" || align === "end") label.align = align;
    if (number(width)) label.width = clamp(width, MIN_GRIDFINITY_LABEL_WIDTH, MAX_SAVED_SETTING);
    labels.push(label);
  });
  return labels.slice(0, MAX_GRIDFINITY_COMPARTMENT_LABELS);
}

/**
 * The dividers' places and the labels an MCP action gives, each list it has as it is kept; an empty one unsets it.
 * A count it gives is written as the settings window writes it, at most the 24 the largest bin builds, which puts
 * that axis's dividers back evenly spaced unless the same action places them.
 */
export function gridfinityListPatch(params: Record<string, unknown>): Pick<GridfinityShapeFields, "gridfinityCompartmentsX" | "gridfinityCompartmentsZ" | "gridfinityDividerPositionsX" | "gridfinityDividerPositionsZ" | "gridfinityCompartmentLabels"> {
  const patch: Pick<GridfinityShapeFields, "gridfinityCompartmentsX" | "gridfinityCompartmentsZ" | "gridfinityDividerPositionsX" | "gridfinityDividerPositionsZ" | "gridfinityCompartmentLabels"> = {};
  for (const [axis, key] of [["x", "gridfinityCompartmentsX"], ["z", "gridfinityCompartmentsZ"]] as const) {
    const count = params[key];
    if (typeof count === "number" && Number.isFinite(count)) Object.assign(patch, gridfinityCompartmentCountPatch(axis, clamp(Math.round(count), 1, MAX_GRIDFINITY_DIVIDERS + 1)));
  }
  for (const key of ["gridfinityDividerPositionsX", "gridfinityDividerPositionsZ"] as const) {
    const positions = normalizeGridfinityDividerPositions(params[key]);
    if (positions) patch[key] = positions.length > 0 ? positions : undefined;
  }
  const labels = normalizeGridfinityCompartmentLabels(params.gridfinityCompartmentLabels);
  if (labels) patch.gridfinityCompartmentLabels = labels.length > 0 ? labels : undefined;
  return patch;
}

export function gridfinityDividerPositionsEqual(a: readonly number[] | undefined, b: readonly number[] | undefined) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => p === b[i]);
}

export function gridfinityCompartmentLabelsEqual(a: readonly GridfinityCompartmentLabel[] | undefined, b: readonly GridfinityCompartmentLabel[] | undefined) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((label, i) => {
    const other = b[i];
    return label.column === other.column
      && label.row === other.row
      && label.side === other.side
      && label.length === other.length
      && label.align === other.align
      && label.width === other.width;
  });
}

/** Whether the bin has pieces joined to it, label shelves, finger scoops or dividers, which need Manifold for the display mesh. */
export function gridfinityHasPieces(shape: GridfinityShapeFields) {
  return Boolean(gridfinityLabelPieces(shape) || gridfinityScoopPieces(shape) || gridfinityCompartments(shape));
}

/**
 * The bin's wall from the outside over the top to the floor inside, as insets
 * from the outline: up the outer wall, over the lip (or the flat top of a bin
 * without one), down the inside to the floor. The lip rests on a 45 degree
 * support that grows out of the wall below it. A chamfer on the lip's top
 * takes `chamfer` off the outer wall and off the slope, as the edge tool does.
 */
export function gridfinityWallProfile(plan: GridfinityPlan, floorRounding = plan.floorRounding, chamfer = plan.lipChamfer): GridfinityStep[] {
  const floor = plan.floor;
  const top = plan.top;
  // The wall down to the floor, with the floor's edge rounded along a quarter circle when there is a rounding.
  const toFloor = (): GridfinityStep[] => {
    if (floorRounding <= 0) return [[GRIDFINITY_WALL, floor]];
    const r = floorRounding;
    return Array.from({ length: CORNER_STEPS + 1 }, (_, k): GridfinityStep => {
      const angle = (k / CORNER_STEPS) * (Math.PI / 2);
      return [GRIDFINITY_WALL + r - r * Math.cos(angle), floor + r - r * Math.sin(angle)];
    });
  };
  if (!plan.lip) return [[0, GRIDFINITY_FOOT_HEIGHT], [0, top], [GRIDFINITY_WALL, top], ...toFloor()];
  const profile: GridfinityStep[] = [[0, GRIDFINITY_FOOT_HEIGHT]];
  [...LIP].reverse().forEach(([inset, y]) => profile.push([inset, top + y]));
  if (chamfer > 0) profile.splice(1, 1, [0, top + GRIDFINITY_LIP_HEIGHT - chamfer], [chamfer * Math.SQRT1_2, top + GRIDFINITY_LIP_HEIGHT - chamfer * Math.SQRT1_2]);
  const support = LIP[0][0] - GRIDFINITY_WALL;
  // A low bin has no straight wall inside: the support runs down to the floor.
  if (top - support > floor) profile.push([GRIDFINITY_WALL, top - support], ...toFloor());
  else profile.push([LIP[0][0] - (top - floor), floor]);
  return profile;
}

type LoopPoint = { x: number; z: number; nx: number; nz: number; wall?: GridfinityWall };

/**
 * A rounded rectangle centred on (cx, cz), half sizes hx and hz, corner
 * radius `radius`, set in by `inset` with its corner centres kept. The points
 * on the straight sides are the corner ends plus `breaksX` (on the two sides
 * along x) and `breaksZ`, so that outlines of one family match point for
 * point. With `open`, an open side stays on the outline at every inset and the
 * corners it touches are square, each point says which side it is on, and a
 * closed side keeps the same points at every inset, as its ends do not move
 * along it (#682).
 */
function roundedLoop(cx: number, cz: number, hx: number, hz: number, radius: number, inset: number, breaksX: number[] = [], breaksZ: number[] = [], open?: Record<GridfinityWall, boolean>): LoopPoint[] {
  const ax = hx - radius;
  const az = hz - radius;
  const r = radius - inset;
  const points: LoopPoint[] = [];
  const side = (fromX: number, fromZ: number, toX: number, toZ: number, nx: number, nz: number, breaks: number[], wall: GridfinityWall) => {
    const tag = open ? { wall } : {};
    points.push({ x: fromX, z: fromZ, nx, nz, ...tag });
    const along = fromX !== toX;
    const ordered = breaks.filter((b) => (along ? b > Math.min(fromX, toX) + 1e-9 && b < Math.max(fromX, toX) - 1e-9 : b > Math.min(fromZ, toZ) + 1e-9 && b < Math.max(fromZ, toZ) - 1e-9));
    ordered.sort((a, b) => (along ? (toX > fromX ? a - b : b - a) : toZ > fromZ ? a - b : b - a));
    ordered.forEach((b) => points.push(along ? { x: b, z: fromZ, nx, nz, ...tag } : { x: fromX, z: b, nx, nz, ...tag }));
    points.push({ x: toX, z: toZ, nx, nz, ...tag });
  };
  const corner = (ox: number, oz: number, from: number) => {
    for (let k = 1; k < CORNER_STEPS; k += 1) {
      const angle = from + (k / CORNER_STEPS) * (Math.PI / 2);
      points.push({ x: ox + r * Math.cos(angle), z: oz + r * Math.sin(angle), nx: Math.cos(angle), nz: Math.sin(angle) });
    }
  };
  const [x0, x1, z0, z1] = [open?.left ? cx - hx : cx - ax - r, open?.right ? cx + hx : cx + ax + r, open?.back ? cz - hz : cz - az - r, open?.front ? cz + hz : cz + az + r];
  const square = gridfinityOpenCorners(open);
  side(square.backLeft ? x0 : cx - ax, z0, square.backRight ? x1 : cx + ax, z0, 0, -1, breaksX, "back");
  if (!square.backRight) corner(cx + ax, cz - az, -Math.PI / 2);
  side(x1, square.backRight ? z0 : cz - az, x1, square.frontRight ? z1 : cz + az, 1, 0, breaksZ, "right");
  if (!square.frontRight) corner(cx + ax, cz + az, 0);
  side(square.frontRight ? x1 : cx + ax, z1, square.frontLeft ? x0 : cx - ax, z1, 0, 1, breaksX, "front");
  if (!square.frontLeft) corner(cx - ax, cz + az, Math.PI / 2);
  side(x0, square.frontLeft ? z1 : cz + az, x0, square.backLeft ? z0 : cz - az, -1, 0, breaksZ, "left");
  if (!square.backLeft) corner(cx - ax, cz - az, Math.PI);
  return points;
}

type Vec3 = [number, number, number];
type Box = { x0: number; x1: number; z0: number; z1: number; edge: (sign: number, axis: "x" | "z") => boolean };

/**
 * The display body as closed, watertight triangles. Walls are strips between
 * outlines of one family; the flat parts (the bin's underside between its
 * feet, the baseplate's top and bottom) are the ring between each grid cell
 * and the foot or socket in it - a strip along each side and a fan from each
 * corner of the cell, both left out where they have no width.
 */
export function gridfinityTriangles(shape: GridfinityShapeFields) {
  const plan = gridfinityPlan(shape);
  const triangles: Vec3[][] = [];
  const push = (a: Vec3, b: Vec3, c: Vec3, want: Vec3) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) return;
    triangles.push(n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? [a, b, c] : [a, c, b]);
  };
  const at = (p: { x: number; z: number }, y: number): Vec3 => [p.x, y, p.z];

  /** Strips between the outlines of a profile; `outside` is +1 where the material is inside the outline, -1 where it is outside (a socket). */
  const sweep = (loop: (inset: number) => LoopPoint[], profile: GridfinityStep[], outside: 1 | -1, wrap = true) => {
    for (let s = 0; s + 1 < profile.length; s += 1) {
      const [i0, y0] = profile[s];
      const [i1, y1] = profile[s + 1];
      if (Math.abs(i0 - i1) < 1e-12 && Math.abs(y0 - y1) < 1e-12) continue;
      const a = loop(i0);
      const b = loop(i1);
      // Walking the profile with the material on the left: the face points to the right of the walk.
      const dOut = -(i1 - i0);
      const dy = y1 - y0;
      const nOut = dy * outside;
      const nY = -dOut * outside;
      a.forEach((p, k) => {
        // A run of walls between open sides ends at its last point.
        if (!wrap && k + 1 === a.length) return;
        const q = a[(k + 1) % a.length];
        const pb = b[k];
        const qb = b[(k + 1) % b.length];
        const want: Vec3 = [p.nx * nOut, nY, p.nz * nOut];
        push(at(p, y0), at(q, y0), at(qb, y1), want);
        push(at(p, y0), at(qb, y1), at(pb, y1), want);
      });
    }
  };
  /** A flat face inside an outline, with holes. */
  const cap = (outline: Array<{ x: number; z: number }>, holes: Array<Array<{ x: number; z: number }>>, y: number, up: 1 | -1) => {
    const contour = outline.map((p) => new THREE.Vector2(p.x, p.z));
    const holeVectors = holes.map((hole) => hole.map((p) => new THREE.Vector2(p.x, p.z)));
    const all = [...outline, ...holes.flat()];
    THREE.ShapeUtils.triangulateShape(contour, holeVectors).forEach(([a, b, c]) => push(at(all[a], y), at(all[b], y), at(all[c], y), [0, up, 0]));
  };
  /**
   * The ring between a grid cell and the rounded square in it, at height y:
   * a strip along each side where the square stays clear of the cell's edge,
   * a fan from each corner of the cell to the arc in front of it. Where the
   * cell's corner is the body's own rounded corner there is no point to fan
   * from: with `outer` (the body's outline in that cell) the strip between the
   * two arcs fills it, without it the arcs are the same and nothing is left.
   * A body corner made square by an open side is fanned like any other, and
   * one beside a padded side is filled by paddedCorner.
   */
  const ring = (inner: LoopPoint[], box: Box, y: number, up: 1 | -1, outer?: LoopPoint[]) => {
    const per = inner.length / 4;
    const want: Vec3 = [0, up, 0];
    const project = (p: LoopPoint) => ({ x: p.nx > 0.5 ? box.x1 : p.nx < -0.5 ? box.x0 : p.x, z: p.nz > 0.5 ? box.z1 : p.nz < -0.5 ? box.z0 : p.z });
    const touches = (p: LoopPoint) => {
      const q = project(p);
      return Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.z - p.z) < 1e-9;
    };
    for (let s = 0; s < 4; s += 1) {
      const a = inner[s * per];
      const b = inner[s * per + 1];
      if (!touches(a)) {
        push(at(a, y), at(b, y), at(project(b), y), want);
        push(at(a, y), at(project(b), y), at(project(a), y), want);
      }
      // The corner after this side: from its end round the arc to the next side's start.
      const end = inner[s * per + 1];
      const next = inner[((s + 1) % 4) * per];
      const arc = [end, ...inner.slice(s * per + 2, (s + 1) * per), next];
      const sx = end.nx + next.nx > 0 ? 1 : -1;
      const sz = end.nz + next.nz > 0 ? 1 : -1;
      if (box.edge(sx, "x") && box.edge(sz, "z") && !plan.open[sx > 0 ? "right" : "left"] && !plan.open[sz > 0 ? "front" : "back"]) {
        if (plan.padding[sx > 0 ? "right" : "left"] > 0 || plan.padding[sz > 0 ? "front" : "back"] > 0) {
          paddedCorner(arc, project(end), project(next), y, up);
          continue;
        }
        if (!outer) continue;
        const outerArc = [outer[s * per + 1], ...outer.slice(s * per + 2, (s + 1) * per), outer[((s + 1) % 4) * per]];
        for (let k = 0; k + 1 < arc.length; k += 1) {
          push(at(arc[k], y), at(outerArc[k], y), at(outerArc[k + 1], y), want);
          push(at(arc[k], y), at(outerArc[k + 1], y), at(arc[k + 1], y), want);
        }
        continue;
      }
      const cornerPoint = { x: sx > 0 ? box.x1 : box.x0, z: sz > 0 ? box.z1 : box.z0 };
      const fan: Array<{ x: number; z: number }> = [];
      if (!touches(end)) fan.push(project(end));
      fan.push(...arc);
      if (!touches(next)) fan.push(project(next));
      for (let k = 0; k + 1 < fan.length; k += 1) push(at(cornerPoint, y), at(fan[k], y), at(fan[k + 1], y), want);
    }
  };
  /**
   * A body corner of a padded baseplate (#455), where the corner of the cell's
   * rounded square no longer meets the body's: the flat face from where the
   * square's sides meet the cell's box, along the body's outline round its
   * rounded corner, and back round the square's arc.
   */
  const paddedCorner = (arc: LoopPoint[], from: { x: number; z: number }, to: { x: number; z: number }, y: number, up: 1 | -1) => {
    const body = outline(0);
    const same = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.z - q.z) < 1e-9;
    const start = body.findIndex((p) => same(p, from));
    const stop = body.findIndex((p) => same(p, to));
    const along: Array<{ x: number; z: number }> = [];
    for (let k = start; k !== stop; k = (k + 1) % body.length) along.push(body[k]);
    along.push(body[stop]);
    cap(distinctPoints([...along, ...[...arc].reverse()]), [], y, up);
  };
  const circle = (c: { x: number; z: number }) => Array.from({ length: MAGNET_SIDES }, (_, k) => {
    const angle = (2 * Math.PI * k) / MAGNET_SIDES;
    return { x: c.x + (GRIDFINITY_MAGNET_DIAMETER / 2) * Math.cos(angle), z: c.z + (GRIDFINITY_MAGNET_DIAMETER / 2) * Math.sin(angle) };
  });

  const { size, cells, count, pitch } = plan;
  const half = (n: number) => (n * pitch) / 2;
  const cellHalf = plan.type === "bin" ? pitch / 2 - GRIDFINITY_CLEARANCE : pitch / 2;
  const radius = plan.type === "bin" ? GRIDFINITY_BIN_RADIUS : GRIDFINITY_BASEPLATE_RADIUS;
  // Points on the long sides: every grid line inside, and where each foot or socket's corner begins; off the middle with the grid of a padded baseplate.
  const breaks = (n: number, centre: number) => {
    const values: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const c = centre + (i - (n - 1) / 2) * pitch;
      values.push(c - cellHalf + radius, c + cellHalf - radius);
      if (i < n - 1) values.push(c + pitch / 2);
    }
    return values;
  };
  const breaksX = breaks(count.x, plan.centre.x);
  const breaksZ = breaks(count.z, plan.centre.z);
  const outline = (inset: number) => roundedLoop(0, 0, size.width / 2, size.depth / 2, radius, inset, breaksX, breaksZ);
  const openOutline = (inset: number) => roundedLoop(0, 0, size.width / 2, size.depth / 2, radius, inset, breaksX, breaksZ, plan.open);
  const cellOf = (cell: (typeof cells)[number], inset: number) => roundedLoop(cell.x, cell.z, cellHalf, cellHalf, radius, inset);
  // A cell's box, cut back to the body's outline at the edge; edge() says whether a side is the body's own.
  const cellBox = (cell: (typeof cells)[number]): Box => ({
    x0: cell.i === 0 ? -size.width / 2 : cell.x - pitch / 2,
    x1: cell.i === count.x - 1 ? size.width / 2 : cell.x + pitch / 2,
    z0: cell.j === 0 ? -size.depth / 2 : cell.z - pitch / 2,
    z1: cell.j === count.z - 1 ? size.depth / 2 : cell.z + pitch / 2,
    edge: (sign, axis) => (axis === "x" ? (sign > 0 ? cell.i === count.x - 1 : cell.i === 0) : sign > 0 ? cell.j === count.z - 1 : cell.j === 0),
  });

  /**
   * A bin with a side open (#682): the wall swept along each run of closed sides from a square corner on one open side
   * to one on the next, its end in the open side's plane together with the floor's edge there, and the floor out to
   * the open sides' outline.
   */
  const openBin = (wall: GridfinityStep[]) => {
    const closed = (p: LoopPoint) => !(p.wall && plan.open[p.wall]);
    const runsOf = (loop: LoopPoint[]) => {
      const start = loop.findIndex((p, k) => !closed(p) && closed(loop[(k + 1) % loop.length]));
      const turned = [...loop.slice(start + 1), ...loop.slice(0, start + 1)];
      const runs: LoopPoint[][] = [];
      turned.forEach((p, k) => {
        if (!closed(p)) return;
        if (k === 0 || !closed(turned[k - 1])) runs.push([]);
        runs[runs.length - 1].push(p);
      });
      return runs;
    };
    const runs = runsOf(openOutline(0)).length;
    for (let n = 0; n < runs; n += 1) sweep((inset) => runsOf(openOutline(inset))[n], wall, 1, false);
    const [floorInset, floorY] = wall[wall.length - 1];
    const along = (inset: number, side: GridfinityWall) => openOutline(inset).filter((p) => p.wall === side);
    LABEL_WALLS.filter((side) => plan.open[side]).forEach((side) => {
      // From the foot's top along the open side, up the end of the wall beside it, over the top and down to the floor,
      // back along the floor's edge and down the other wall's end; straight up where the side beside it is open too.
      const end = (k: 0 | 1) => (plan.open[LABEL_SIDE_WALLS[side][k]] ? [] : wall.map(([inset, y]) => {
        const points = along(inset, side);
        return at(points[k === 0 ? 0 : points.length - 1], y);
      }));
      const points = [...along(0, side).map((p) => at(p, GRIDFINITY_FOOT_HEIGHT)), ...end(1), ...along(floorInset, side).map((p) => at(p, floorY)).reverse(), ...end(0).reverse()];
      const face = points.filter((p, k) => {
        const q = points[(k + 1) % points.length];
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-9;
      });
      const across = side === "back" || side === "front";
      const outward: Vec3 = across ? [0, 0, side === "front" ? 1 : -1] : [side === "right" ? 1 : -1, 0, 0];
      THREE.ShapeUtils.triangulateShape(face.map((p) => new THREE.Vector2(across ? p[0] : p[2], p[1])), []).forEach(([a, b, c]) => push(face[a], face[b], face[c], outward));
    });
    cap(distinctPoints(openOutline(floorInset)), [], floorY, 1);
  };

  if (plan.type === "bin") {
    const wall = gridfinityWallProfile(plan);
    const opened = LABEL_WALLS.some((side) => plan.open[side]);
    if (opened) openBin(wall);
    else sweep(outline, wall, 1);
    const [floorInset, floorY] = wall[wall.length - 1];
    // A floor rounded as far as the inner corners' radius has corners of no radius, whose points coincide.
    if (!opened) cap(distinctPoints(outline(floorInset)), [], floorY, 1);
    cells.forEach((cell) => {
      sweep((inset) => cellOf(cell, inset), GRIDFINITY_FOOT, 1);
      ring(cellOf(cell, 0), cellBox(cell), GRIDFINITY_FOOT_HEIGHT, -1);
      const holes = plan.magnetHoles.filter((hole) => Math.abs(hole.x - cell.x) < half(1) && Math.abs(hole.z - cell.z) < half(1)).map(circle);
      cap(cellOf(cell, GRIDFINITY_FOOT[0][0]), holes, 0, -1);
      holes.forEach((hole) => {
        hole.forEach((p, k) => {
          const q = hole[(k + 1) % hole.length];
          const centre = { x: hole.reduce((sum, h) => sum + h.x, 0) / hole.length, z: hole.reduce((sum, h) => sum + h.z, 0) / hole.length };
          const want: Vec3 = [centre.x - p.x, 0, centre.z - p.z];
          push(at(p, 0), at(q, 0), at(q, GRIDFINITY_MAGNET_DEPTH), want);
          push(at(p, 0), at(q, GRIDFINITY_MAGNET_DEPTH), at(p, GRIDFINITY_MAGNET_DEPTH), want);
        });
        cap(hole, [], GRIDFINITY_MAGNET_DEPTH, -1);
      });
    });
  } else {
    sweep(outline, [[0, 0], [0, GRIDFINITY_BASEPLATE_HEIGHT]], 1);
    cells.forEach((cell) => {
      sweep((inset) => cellOf(cell, inset), GRIDFINITY_SOCKET, -1);
      ring(cellOf(cell, 0), cellBox(cell), GRIDFINITY_BASEPLATE_HEIGHT, 1);
      ring(cellOf(cell, GRIDFINITY_SOCKET[0][0]), cellBox(cell), 0, -1, cellOf(cell, 0));
    });
  }

  return triangles;
}

/** Segments round a full circle in the shelves' corners and in the bin's inside the pieces are cut to. */
const LABEL_CIRCLE_SEGMENTS = 32;
/** The inside the pieces are cut to reaches this far into the wall, below the floor and above the top, so no sliver is left between the two polygons of a round corner. */
const LABEL_INSIDE_OVERLAP = 0.05;
/**
 * In the display mesh the shelf and scoop pieces are moved together by this much, differently along each axis
 * (down, so the stacking gap only grows): whole-millimetre settings put a piece's edge exactly on an
 * edge or vertex of the bin's polygon (where the wall starts to curve, the top of the lip's support,
 * or a crease on the corner's 45 degree line, where two scoops meet), which Manifold resolves into a
 * pinch. Far below anything printed; the exact body has true arcs and is not moved.
 */
const LABEL_MESH_NUDGE: Vec3 = [1.1e-3, -1.7e-3, 0.5e-3];
/**
 * At an open side (#682) the pieces are cut off this far inside the outline: cut exactly at it, a moved piece's end
 * lies in the plane of the bin's open end and Manifold leaves a sliver between them.
 */
const LABEL_OPEN_TRIM = 1e-3;
/** Slivers thinner than this, left where pieces meet exactly on the bin's own vertices, are removed. */
const LABEL_SLIVER = 1e-4;

/**
 * The bin with its label shelves and finger scoops as closed triangles: the bin's own mesh, and the
 * shelves' convex pieces and the scoops' prisms joined to it by Manifold, which keeps the result
 * closed. Without any of them it is gridfinityTriangles. A bin with dividers is filled up to their top
 * and each compartment taken out of the fill, rounded and with its scoops, as the exact body is cut.
 */
export function gridfinityLabelledTriangles(runtime: ManifoldToplevel, shape: GridfinityShapeFields): Vec3[][] {
  const base = gridfinityTriangles(shape);
  const pieces = gridfinityLabelPieces(shape);
  const compartments = gridfinityCompartmentPieces(shape);
  // A bin with dividers has its scoops in its compartments.
  const scoopPieces = compartments ? null : gridfinityScoopPieces(shape);
  if (!pieces && !scoopPieces && !compartments) return base;
  const { Manifold } = runtime;
  const made: Array<{ delete: () => void }> = [];
  const keep = <T extends { delete: () => void }>(value: T) => {
    made.push(value);
    return value;
  };
  try {
    // The bin's triangles welded into an indexed mesh (meshDataToManifoldMesh would close an import cycle here).
    const ids = new Map<string, number>();
    const vertices: number[] = [];
    const triVerts: number[] = [];
    base.forEach((triangle) => triangle.forEach((v) => {
      const key = v.map((n) => Math.round(n * 1e5)).join(",");
      if (!ids.has(key)) {
        ids.set(key, ids.size);
        vertices.push(...v);
      }
      triVerts.push(ids.get(key)!);
    }));
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(triVerts) });
    mesh.merge();
    const bin = keep(new Manifold(mesh));
    // The shelves, the scoops and the dividers are cut to the same inside, from the floor up past the highest of them.
    const { floor, inside: { hx, hz, radius } } = pieces ?? scoopPieces ?? { floor: compartments!.floor, inside: { ...labelInside(gridfinityPlan(shape)), radius: GRIDFINITY_BIN_RADIUS - GRIDFINITY_WALL } };
    const y0 = floor - LABEL_INSIDE_OVERLAP;
    const height = Math.max(pieces?.top ?? 0, scoopPieces?.centre[1] ?? 0, compartments?.top ?? 0) - y0 + LABEL_INSIDE_OVERLAP;
    // A cylinder standing on y = y0 at (x, z).
    const post = (x: number, z: number, radius: number) => {
      const lying = keep(Manifold.cylinder(height, radius, radius, LABEL_CIRCLE_SEGMENTS));
      const standing = keep(lying.rotate([-90, 0, 0]));
      return keep(standing.translate([x, y0, z]));
    };
    const r = radius + LABEL_INSIDE_OVERLAP;
    // Through an open side the inside runs out as the exact body's cutter does, and every piece is cut off at the outline (#682).
    const { open, size } = gridfinityPlan(shape);
    const grown = gridfinityOpenGrown(hx, hz, open, GRIDFINITY_OPEN_REACH);
    const inside = keep(Manifold.hull([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => post(grown.x + sx * (grown.hx - radius), grown.z + sz * (grown.hz - radius), r))));
    const trim = LABEL_WALLS.some((wall) => open[wall]) ? keep(Manifold.cube([size.width - 2 * LABEL_OPEN_TRIM, 4 * size.height, size.depth - 2 * LABEL_OPEN_TRIM], true)) : null;
    const profileOf = (of: GridfinityLabelPieces) => (p: GridfinityLabelProfile) => {
      const { start, end } = gridfinityLabelProfileEnds(of, p);
      return keep(Manifold.hull([...start, ...end]));
    };
    const cornerShape = (c: GridfinityLabelCornerShape) => {
      const { outline, circle } = gridfinityLabelCornerOutline(c);
      const block = keep(Manifold.hull(outline.flatMap((p): Vec3[] => [[p.x, y0, p.z], [p.x, y0 + height, p.z]])));
      return circle ? keep(block.subtract(post(circle.centre.x, circle.centre.z, circle.radius))) : block;
    };
    const scoopPrism = (of: GridfinityScoopPieces, scoop: GridfinityScoop) => {
      // The section is extruded along z and turned into the wall's frame: x out from the wall, z along it.
      const origin = gridfinityScoopPoint(of, scoop, scoop.from, [0, 0]);
      const outward = gridfinityScoopPoint(of, scoop, scoop.from, [1, 0]);
      const along = gridfinityScoopPoint(of, scoop, scoop.from + 1, [0, 0]);
      const prism = keep(Manifold.extrude(gridfinityScoopSection(of).outline, scoop.to - scoop.from));
      return keep(prism.transform([outward[0] - origin[0], 0, outward[2] - origin[2], 0, 0, 1, 0, 0, along[0] - origin[0], 0, along[2] - origin[2], 0, origin[0], 0, origin[2], 1]));
    };
    // The inside up to the dividers' top less each compartment: the hull of a ball in each bottom corner, so its floor is
    // rounded as much as its corners, and a post above each up past the top, less its scoops, moved into place.
    const dividers = (c: GridfinityCompartmentPieces) => {
      const r = c.floorRounding;
      const reach = c.top + GRIDFINITY_DIVIDER_CUTTER_OVERLAP - (c.floor + r);
      const cutters = c.cells.map((cell) => {
        const grown = gridfinityOpenGrown(cell.inside.hx, cell.inside.hz, cell.open, GRIDFINITY_OPEN_REACH);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]): Vec3 => [grown.x + sx * (grown.hx - r), c.floor + r, grown.z + sz * (grown.hz - r)]);
        const ball = (at: Vec3) => keep(keep(Manifold.sphere(r, LABEL_CIRCLE_SEGMENTS)).translate(at));
        const column = (at: Vec3) => keep(keep(keep(Manifold.cylinder(reach, r, r, LABEL_CIRCLE_SEGMENTS)).rotate([-90, 0, 0])).translate(at));
        const cutter = keep(Manifold.hull([...corners.map(ball), ...corners.map(column)]));
        const scooped = cell.scoops ? keep(cutter.subtract(keep(Manifold.union(cell.scoops.scoops.map((scoop) => scoopPrism(cell.scoops!, scoop)))))) : cutter;
        return keep(scooped.translate([cell.centre.x, 0, cell.centre.z]));
      });
      return keep(keep(inside.trimByPlane([0, -1, 0], -c.top)).subtract(keep(Manifold.union(cutters))));
    };
    const labelParts = (of: GridfinityLabelPieces) => {
      const profile = profileOf(of);
      return [
        ...of.shelves.map(({ profile: p, notches }) => notches.reduce((solid, notch) => keep(solid.subtract(cornerShape(notch))), profile(p))),
        ...of.corners.map((c) => keep(cornerShape(c).intersect(c.under.length === 1 ? profile(c.under[0]) : keep(Manifold.union(c.under.map(profile)))))),
      ];
    };
    // Each compartment's label, cut to its compartment's inside as the shelves are to the bin's, moved into place.
    const compartmentLabels = (c: GridfinityCompartmentPieces) => c.cells.flatMap((cell) => {
      if (!cell.labels) return [];
      const { radius: cr } = cell.inside;
      const { hx: cx, hz: cz, x: ox, z: oz } = gridfinityOpenGrown(cell.inside.hx, cell.inside.hz, cell.open, GRIDFINITY_OPEN_REACH);
      const own = keep(Manifold.hull([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => post(ox + sx * (cx - cr), oz + sz * (cz - cr), cr + LABEL_INSIDE_OVERLAP))));
      return labelParts(cell.labels).map((part) => keep(keep(part.intersect(own)).translate([cell.centre.x, 0, cell.centre.z])));
    });
    const parts = [
      ...(pieces ? labelParts(pieces) : []),
      ...(scoopPieces?.scoops ?? []).map((scoop) => scoopPrism(scoopPieces!, scoop)),
      ...(compartments ? [dividers(compartments), ...compartmentLabels(compartments)] : []),
    ].map((part) => {
      const kept = keep(keep(part.intersect(inside)).translate(LABEL_MESH_NUDGE));
      return trim ? keep(kept.intersect(trim)) : kept;
    });
    const result = keep(keep(Manifold.union([bin, ...parts])).simplify(LABEL_SLIVER));
    if (result.status() !== "NoError") return base;
    const out = result.getMesh();
    const triangles: Vec3[][] = [];
    for (let t = 0; t < out.triVerts.length; t += 3) {
      triangles.push([0, 1, 2].map((k) => {
        const i = out.triVerts[t + k] * out.numProp;
        return [out.vertProperties[i], out.vertProperties[i + 1], out.vertProperties[i + 2]] as Vec3;
      }));
    }
    return triangles;
  } catch {
    // The bin is drawn without its shelves and scoops rather than not at all.
    return base;
  } finally {
    new Set(made).forEach((value) => value.delete());
  }
}

/**
 * The bin's triangles with its label shelves and finger scoops. They need Manifold: until it has
 * loaded the bin is drawn without them and asks for it, and the viewport draws it again once it is
 * there (manifoldRevision in its cache key).
 */
function gridfinityDisplayTriangles(shape: GridfinityShapeFields) {
  if (!gridfinityHasPieces(shape)) return gridfinityTriangles(shape);
  const runtime = loadedManifoldRuntime();
  if (!runtime) {
    requestManifoldRuntime();
    return gridfinityTriangles(shape);
  }
  return gridfinityLabelledTriangles(runtime, shape);
}

/** A closed, watertight bin or baseplate from y = 0 up, centred on x and z. */
export function createGridfinityGeometry(shape: GridfinityShapeFields): THREE.BufferGeometry {
  const positions: number[] = [];
  gridfinityDisplayTriangles(shape).forEach((triangle) => triangle.forEach((vertex) => positions.push(...vertex)));
  const raw = new THREE.BufferGeometry();
  raw.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const geometry = toCreasedNormals(raw, THREE.MathUtils.degToRad(30));
  raw.dispose();
  geometry.computeBoundingBox();
  return geometry;
}
