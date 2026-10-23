import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { SweepMode, TransitionMode } from "occt-wasm";
import { cadSketchRegions, orderedCadSketchPaths, type CadSketchRegion, type OrderedCadSketchPath, type OrderedCadSketchStep } from "@/lib/sketchCadProfile";
import { circularArcMidpoint } from "@/lib/sketchCircularArc";
import { isConstructionSegment } from "@/lib/sketchConstruction";
import { pathWire } from "@/lib/sketchCadWire";
import type { SketchPoint, SketchProfile, SweepAnchor } from "@/types/layerling";

/*
 * A sketch swept along a path (#400). The closed outlines drawn as usual are the cross-section;
 * the construction line - one chain of lines and curves, open or closed - is the path.
 *
 * The path lies flat in the sketch plane. The cross-section is drawn as seen when looking along
 * the path from the end it is drawn at: the sketch's x is across the path, up on the screen is up
 * on the body. It is centred on the path across, or has its left or right edge on it (the sketch's
 * sweepAnchor, #732), and stands on the sketch plane with its lowest point. The solid is built by OpenCascade, so Fillet, Chamfer and the STEP export work on it.
 */

export type SweepProblem = "no-profile" | "no-path" | "many-paths";

export type SweepPlan = { path: OrderedCadSketchPath; regions: CadSketchRegion[] };

type Plane = { x: number; z: number };

/** The construction lines as ordinary lines, without the rest: what the path is read from. */
export function constructionOnlyProfile(profile: SketchProfile): SketchProfile {
  const segments = profile.segments.filter(isConstructionSegment).map((segment) => {
    const { construction: _construction, ...rest } = segment;
    return rest;
  });
  const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  return { ...profile, stroke: undefined, silhouette: undefined, points: profile.points.filter((point) => used.has(point.id)), segments };
}

function reversedPath(path: OrderedCadSketchPath): OrderedCadSketchPath {
  const steps: OrderedCadSketchStep[] = [...path.steps].reverse().map((step) => ({ segment: step.segment, from: step.to, to: step.from }));
  return { ...path, points: [...path.points].reverse(), steps };
}

/** A closed path started at another of its points. */
function pathStartingAt(path: OrderedCadSketchPath, pointId: string): OrderedCadSketchPath {
  const index = path.steps.findIndex((step) => step.from.id === pointId);
  if (index <= 0) return path;
  const steps = [...path.steps.slice(index), ...path.steps.slice(0, index)];
  const points = [...path.points.slice(index), ...path.points.slice(0, index)];
  return { ...path, points, steps };
}

function profileBounds(regions: CadSketchRegion[]) {
  const points = regions.flatMap((region) => [region.outer, ...region.holes].flatMap((path) => path.points));
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** The x in the sketch that runs along the path: the middle of the cross-section, or its left or right edge. */
export function sweepAnchorX(bounds: { minX: number; maxX: number }, anchor: SweepAnchor | undefined) {
  if (anchor === "left") return bounds.minX;
  if (anchor === "right") return bounds.maxX;
  return (bounds.minX + bounds.maxX) / 2;
}

/**
 * What is drawn, ready to sweep: the cross-section regions and the path started at the end the
 * cross-section stands nearest to. Null for what is missing, so the caller can say it in words.
 */
export function sweepPlan(profile: SketchProfile): { plan: SweepPlan } | { problem: SweepProblem } {
  let regions: CadSketchRegion[] = [];
  try {
    regions = cadSketchRegions(profile);
  } catch {
    regions = [];
  }
  if (regions.length === 0) return { problem: "no-profile" };
  const paths = orderedCadSketchPaths(constructionOnlyProfile(profile)).filter((path) => path.steps.length > 0);
  if (paths.length === 0) return { problem: "no-path" };
  if (paths.length > 1) return { problem: "many-paths" };
  const bounds = profileBounds(regions);
  const centre = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const distance = (point: Plane) => Math.hypot(point.x - centre.x, point.z - centre.z);
  let path = paths[0];
  if (path.closed) {
    const nearest = path.points.reduce((best, point) => (distance(point) < distance(best) ? point : best), path.points[0]);
    path = pathStartingAt(path, nearest.id);
  } else if (distance(path.steps[path.steps.length - 1].to) < distance(path.steps[0].from)) {
    path = reversedPath(path);
  }
  return { plan: { path, regions } };
}

/** The direction the path leaves its first point in, as a unit vector in the sketch plane. */
export function sweepStartDirection(path: OrderedCadSketchPath): Plane {
  const { segment, from, to } = path.steps[0];
  const forward = segment.startId === from.id;
  const first = forward ? from.handleOut : from.handleIn;
  const second = forward ? to.handleIn : to.handleOut;
  const candidates: Plane[] = segment.kind !== "line" && first && second ? [first, second, to] : [to];
  for (const target of candidates) {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length > 1e-9) return { x: dx / length, z: dz / length };
  }
  return { x: 1, z: 0 };
}

/** One outline of the cross-section as a closed wire in the plane across the path at its start. */
function sectionWire(cad: OcctKernel, outline: OrderedCadSketchPath, start: SketchPoint, direction: Plane, centreX: number, maxZ: number) {
  // Looking along the path with the sketch's up above: across is the direction turned a quarter, (-z, x).
  const across = { x: -direction.z, z: direction.x };
  const map = (point: Plane) => {
    const u = point.x - centreX;
    const v = maxZ - point.z;
    return { x: start.x + u * across.x, y: v, z: start.z + u * across.z };
  };
  const edges = outline.steps.map(({ segment, from, to }) => {
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      const middle = circularArcMidpoint(from, first, second, to);
      if (middle) return cad.makeArcEdge(map(from), map(middle), map(to));
      return cad.makeBezierEdge([map(from), map(first), map(second), map(to)]);
    }
    return cad.makeLineEdge(map(from), map(to));
  });
  return cad.makeWire(edges);
}

/**
 * The solid of a sketch swept along its construction path. Throws with a plain message when the
 * sketch has no cross-section or no single path, or when the kernel cannot sweep it.
 */
export function buildSweptSketchSolid(cad: OcctKernel, sketch: SketchProfile): ShapeHandle {
  const planned = sweepPlan(sketch);
  if ("problem" in planned) throw new Error(`sweep:${planned.problem}`);
  const { path, regions } = planned.plan;
  const start = path.steps[0].from;
  const direction = sweepStartDirection(path);
  const bounds = profileBounds(regions);
  const centreX = sweepAnchorX(bounds, sketch.sweepAnchor);
  const spine = pathWire(cad, path);
  // The cross-section keeps standing upright along the path; a corner of straight pieces is a mitre.
  const sweep = (outline: OrderedCadSketchPath) => cad.sweepAdvanced(sectionWire(cad, outline, start, direction, centreX, bounds.maxZ), spine, {
    mode: SweepMode.FixedUp,
    up: { x: 0, y: 1, z: 0 },
    transitionMode: TransitionMode.RightCorner,
  });
  const solids: ShapeHandle[] = regions.map((region) => {
    let solid = sweep(region.outer);
    region.holes.forEach((hole) => {
      solid = cad.cut(solid, sweep(hole));
    });
    return solid;
  });
  const result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
  if (!cad.isValid(result)) throw new Error("sweep:invalid");
  return result;
}
