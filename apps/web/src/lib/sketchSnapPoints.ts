import { circularArcCenter } from "@/lib/sketchCircularArc";
import type { SketchProfile } from "@/types/layerling";

type Plane = { x: number; z: number };

const round = (value: number) => Number(value.toFixed(4)) || 0;

/**
 * Where a new or dragged point snaps to on the sketch itself (#624): the middle of every straight
 * line, construction lines too, and the centre of every circle or rounded corner. A circle is four arcs
 * round one centre, which is listed once. With `exceptPointId`, whatever has that point as an end is left
 * out: a point that is being dragged would otherwise snap to the middle of its own line and run away.
 */
export function sketchSnapPoints(profile: SketchProfile, exceptPointId?: string | null): Plane[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const found = new Map<string, Plane>();
  const add = (point: Plane) => {
    const x = round(point.x);
    const z = round(point.z);
    found.set(`${x}:${z}`, { x, z });
  };
  profile.segments.forEach((segment) => {
    if (exceptPointId && (segment.startId === exceptPointId || segment.endId === exceptPointId)) return;
    const start = pointById.get(segment.startId);
    const end = pointById.get(segment.endId);
    if (!start || !end) return;
    const first = start.handleOut;
    const second = end.handleIn;
    if ((segment.kind ?? "line") === "line" || !first || !second) {
      add({ x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 });
      return;
    }
    const center = circularArcCenter(start, first, second, end);
    if (center) add(center);
  });
  // A middle that is a point already is not listed again; it snaps as a point.
  profile.points.forEach((point) => found.delete(`${round(point.x)}:${round(point.z)}`));
  return [...found.values()];
}

/** The middles of the sides of a shape's outline given by its corners in order, for the bodies shown underneath. */
export function outlineSideMiddles(corners: readonly Plane[]): Plane[] {
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return { x: (corner.x + next.x) / 2, z: (corner.z + next.z) / 2 };
  });
}
