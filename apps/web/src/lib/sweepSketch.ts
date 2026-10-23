import { sketchPrimitiveGeometry } from "@/lib/sketchPrimitives";
import type { SketchPoint, SketchProfile, SketchSegment, SweepAnchor } from "@/types/layerling";

/*
 * A sketch for a sweep (#400) put together from numbers, for the MCP bridge: the path as a chain of
 * construction lines and the cross-section - a rectangle or a circle, solid or hollow - as the
 * outline at the path's first point.
 */

export type SweepSectionRequest = {
  kind: "rectangle" | "circle";
  /** Across the path; the diameter of a circle. */
  width: number;
  /** Up on the body; ignored for a circle. */
  height?: number;
  /** A wall thickness makes the section hollow. */
  wall?: number;
};

export type SweepSketchRequest = {
  path: ReadonlyArray<{ x: number; z: number }>;
  closed?: boolean;
  section: SweepSectionRequest;
  /** Which part of the section runs along the path; the middle when left out (#732). */
  anchor?: SweepAnchor;
};

const MAX_SIZE = 1000;

function finiteSize(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_SIZE) throw new Error(`${label} must be a number above 0 and up to ${MAX_SIZE} mm`);
  return value;
}

/** The path points as given - [x, z] pairs or { x, z } objects - or an error sentence. */
export function sweepPathFromParams(value: unknown): Array<{ x: number; z: number }> {
  if (!Array.isArray(value) || value.length < 2) throw new Error("path must be a list of at least two points, [x, z] or { x, z }, in mm");
  return value.map((entry) => {
    const point = Array.isArray(entry) ? { x: entry[0], z: entry[1] } : (entry as { x?: unknown; z?: unknown } | null) ?? {};
    if (typeof point.x !== "number" || typeof point.z !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new Error("every path point needs numbers x and z");
    return { x: point.x, z: point.z };
  });
}

/** Which part of the section runs along the path: left, center (the default) or right, or an error sentence. */
export function sweepAnchorFromParams(value: unknown): SweepAnchor {
  if (value === undefined || value === null) return "center";
  if (value === "left" || value === "center" || value === "right") return value;
  throw new Error("anchor must be left, center or right");
}

export function sweepSectionFromParams(value: unknown): SweepSectionRequest {
  const section = (value ?? {}) as Record<string, unknown>;
  const kind = section.kind === "circle" ? "circle" : section.kind === "rectangle" ? "rectangle" : null;
  if (!kind) throw new Error("section.kind must be rectangle or circle");
  const width = finiteSize(section.width, "section.width");
  const height = kind === "rectangle" ? finiteSize(section.height ?? section.width, "section.height") : undefined;
  const wall = section.wall === undefined ? undefined : finiteSize(section.wall, "section.wall");
  if (wall !== undefined && wall * 2 >= Math.min(width, height ?? width)) throw new Error("section.wall is too thick: it must be less than half the smallest size");
  return { kind, width, height, wall };
}

/** The sketch profile: the section's outlines at the first path point, the path as construction lines. */
export function sweepSketchProfile(request: SweepSketchRequest, makeId: (prefix: string) => string): SketchProfile {
  const points: SketchPoint[] = [];
  const segments: SketchSegment[] = [];
  const first = request.path[0];
  const { section } = request;

  // z runs downwards in the sketch: the outline's foot is at bottomZ, its top a height above, at a smaller z.
  const rectangle = (width: number, height: number, bottomZ: number) => {
    const corners: Array<[number, number]> = [
      [first.x - width / 2, bottomZ - height],
      [first.x + width / 2, bottomZ - height],
      [first.x + width / 2, bottomZ],
      [first.x - width / 2, bottomZ],
    ];
    const ring = corners.map(([x, z]) => ({ id: makeId("sweep-section"), x, z, mode: "corner" as const }));
    points.push(...ring);
    ring.forEach((point, index) => segments.push({ id: makeId("sweep-section-segment"), startId: point.id, endId: ring[(index + 1) % ring.length].id, kind: "line" }));
  };
  const circle = (diameter: number, centreZ: number) => {
    const geometry = sketchPrimitiveGeometry("circle", { x: first.x, z: centreZ }, makeId, diameter);
    points.push(...geometry.points);
    segments.push(...geometry.segments);
  };

  if (section.kind === "rectangle") {
    const height = section.height ?? section.width;
    rectangle(section.width, height, first.z);
    if (section.wall) rectangle(section.width - 2 * section.wall, height - 2 * section.wall, first.z - section.wall);
  } else {
    const centreZ = first.z - section.width / 2;
    circle(section.width, centreZ);
    if (section.wall) circle(section.width - 2 * section.wall, centreZ);
  }

  const pathPoints = request.path.map((point) => ({ id: makeId("sweep-path"), x: point.x, z: point.z, mode: "corner" as const }));
  points.push(...pathPoints);
  const count = request.closed ? pathPoints.length : pathPoints.length - 1;
  for (let index = 0; index < count; index += 1) {
    segments.push({ id: makeId("sweep-path-segment"), startId: pathPoints[index].id, endId: pathPoints[(index + 1) % pathPoints.length].id, kind: "line", construction: true });
  }
  return { points, segments, images: [], ...(request.anchor && request.anchor !== "center" ? { sweepAnchor: request.anchor } : {}) };
}
