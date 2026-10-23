import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

/*
 * The three-point arc of the sketch (#643): a circular arc from a start to an end that runs
 * through a third point, the way Onshape and other CAD programs draw one. The sketch knows only
 * points and Bezier sides, so the arc is laid down as Bezier pieces of at most a quarter circle
 * each, with the handle length that keeps a cubic within a few ten-thousandths of the radius on
 * the circle - the same build the circle and the rounded corner use. After that it is ordinary
 * geometry: its points and sides can be moved, cut, erased or rounded like any other.
 */

export type SketchXZ = { x: number; z: number };

export type SketchArcGeometry = {
  center: SketchXZ;
  radius: number;
  /** Angle of the start, in radians, measured as atan2(z, x) around the centre. */
  startAngle: number;
  /** Signed sweep from the start to the end, through the third point. */
  sweep: number;
};

/** Points closer than this count as one, and a third point this close to the chord makes no arc. */
const EPSILON = 1e-6;
/** One Bezier piece covers at most this much of the circle. */
const MAX_PIECE = Math.PI / 2;

/**
 * The circle through `start`, `through` and `end`, and the part of it from start to end that passes
 * `through`. Null when the three lie on one line or two of them coincide: there is no arc then.
 */
export function arcThroughThreePoints(start: SketchXZ, through: SketchXZ, end: SketchXZ): SketchArcGeometry | null {
  const ax = start.x, az = start.z;
  const bx = through.x, bz = through.z;
  const cx = end.x, cz = end.z;
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  const chord = Math.hypot(cx - ax, cz - az);
  if (chord < EPSILON || Math.abs(d) < EPSILON * Math.max(1, chord * chord)) return null;
  const a2 = ax * ax + az * az;
  const b2 = bx * bx + bz * bz;
  const c2 = cx * cx + cz * cz;
  const center = {
    x: (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d,
    z: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  };
  const radius = Math.hypot(ax - center.x, az - center.z);
  const angle = (p: SketchXZ) => Math.atan2(p.z - center.z, p.x - center.x);
  const startAngle = angle(start);
  const ccw = (from: number, to: number) => {
    let delta = to - from;
    while (delta < 0) delta += 2 * Math.PI;
    while (delta >= 2 * Math.PI) delta -= 2 * Math.PI;
    return delta;
  };
  const toEnd = ccw(startAngle, angle(end));
  const toThrough = ccw(startAngle, angle(through));
  // Counter-clockwise reaches the end past the third point, or else the arc runs the other way.
  const sweep = toThrough < toEnd ? toEnd : toEnd - 2 * Math.PI;
  return { center, radius, startAngle, sweep };
}

/** Points along the arc for a preview, `steps` + 1 of them from start to end. */
export function arcPreviewPoints(arc: SketchArcGeometry, steps = 48): SketchXZ[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = arc.startAngle + (arc.sweep * index) / steps;
    return { x: arc.center.x + arc.radius * Math.cos(angle), z: arc.center.z + arc.radius * Math.sin(angle) };
  });
}

/** The arc's points with their handles, from start to end: the handles carry the curve. */
export function arcBezierPoints(arc: SketchArcGeometry): Array<SketchXZ & { handleIn?: SketchXZ; handleOut?: SketchXZ }> {
  const pieces = Math.max(1, Math.ceil(Math.abs(arc.sweep) / MAX_PIECE - 1e-9));
  const step = arc.sweep / pieces;
  const reach = (4 / 3) * Math.tan(Math.abs(step) / 4) * arc.radius;
  const sign = Math.sign(step);
  return Array.from({ length: pieces + 1 }, (_, index) => {
    const angle = arc.startAngle + step * index;
    const x = arc.center.x + arc.radius * Math.cos(angle);
    const z = arc.center.z + arc.radius * Math.sin(angle);
    // The tangent in the running direction of the arc.
    const tx = -Math.sin(angle) * sign;
    const tz = Math.cos(angle) * sign;
    return {
      x,
      z,
      ...(index > 0 ? { handleIn: { x: x - tx * reach, z: z - tz * reach } } : {}),
      ...(index < pieces ? { handleOut: { x: x + tx * reach, z: z + tz * reach } } : {}),
    };
  });
}

/** An end of the arc: a spot on the plane, or an existing point it starts or ends on. */
export type SketchArcEnd = SketchXZ & { pointId?: string };

/**
 * The profile with the arc added. An end that lands on an existing point joins it, so an outline
 * can be closed with an arc. The chain is laid in the direction that leaves the handles other sides
 * already use at those points alone. `construction` makes the arc a construction line.
 */
export function sketchProfileWithArc(
  profile: SketchProfile,
  start: SketchArcEnd,
  through: SketchXZ,
  end: SketchArcEnd,
  options: { construction?: boolean } = {},
): { profile: SketchProfile; radius: number } | null {
  const arc = arcThroughThreePoints(start, through, end);
  if (!arc) return null;
  const startPoint = start.pointId ? profile.points.find((point) => point.id === start.pointId) : undefined;
  const endPoint = end.pointId ? profile.points.find((point) => point.id === end.pointId) : undefined;
  if (startPoint && endPoint && startPoint.id === endPoint.id) return null;

  const curved = (segment: SketchSegment) => segment.kind !== "line";
  const handleOutFree = (point?: SketchPoint) => !point || !profile.segments.some((segment) => segment.startId === point.id && curved(segment));
  const handleInFree = (point?: SketchPoint) => !point || !profile.segments.some((segment) => segment.endId === point.id && curved(segment));
  const forward = handleOutFree(startPoint) && handleInFree(endPoint);
  const backward = handleOutFree(endPoint) && handleInFree(startPoint);
  const reverse = !forward && backward;

  const laid = arcBezierPoints(reverse ? { ...arc, startAngle: arc.startAngle + arc.sweep, sweep: -arc.sweep } : arc);
  const firstExisting = reverse ? endPoint : startPoint;
  const lastExisting = reverse ? startPoint : endPoint;

  const points = profile.points.map((point) => ({ ...point }));
  const ids = laid.map((spot, index) => {
    const existing = index === 0 ? firstExisting : index === laid.length - 1 ? lastExisting : undefined;
    if (existing) {
      const target = points.find((point) => point.id === existing.id)!;
      if (spot.handleOut) target.handleOut = spot.handleOut;
      if (spot.handleIn) target.handleIn = spot.handleIn;
      return existing.id;
    }
    const id = createLocalId("sketch-point");
    points.push({
      id,
      x: spot.x,
      z: spot.z,
      ...(spot.handleIn ? { handleIn: spot.handleIn } : {}),
      ...(spot.handleOut ? { handleOut: spot.handleOut } : {}),
      mode: index === 0 || index === laid.length - 1 ? "corner" : "smooth",
    });
    return id;
  });
  const segments: SketchSegment[] = [
    ...profile.segments,
    ...ids.slice(1).map((id, index) => ({
      id: createLocalId("sketch-segment"),
      startId: ids[index],
      endId: id,
      kind: "bezier" as const,
      ...(options.construction ? { construction: true } : {}),
    })),
  ];
  return { profile: { ...profile, points, segments }, radius: arc.radius };
}
