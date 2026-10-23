import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

/*
 * Closing a gap by dragging (#698). Delete a side of a hexagon and two open ends are left; drag one
 * onto the other and they become one point, so the outline is closed again. Before, the two stayed
 * separate points lying on top of each other, and the sketch never counted as closed.
 *
 * Only an open end (a point with one side) joins another open end. A side that is already between
 * the two would be left with no length, so those two are left alone.
 */

const SAME_PLACE = 1e-6;

function sidesOf(profile: SketchProfile, pointId: string) {
  return profile.segments.filter((segment) => segment.startId === pointId || segment.endId === pointId);
}

/** The open end another open end was dragged onto, or null. */
export function openEndUnder(profile: SketchProfile, pointId: string): SketchPoint | null {
  const dragged = profile.points.find((point) => point.id === pointId);
  if (!dragged || dragged.locked) return null;
  const draggedSides = sidesOf(profile, pointId);
  if (draggedSides.length !== 1) return null;
  const joining = draggedSides[0];
  const found = profile.points.find((point) => {
    if (point.id === pointId || point.locked) return false;
    if (Math.hypot(point.x - dragged.x, point.z - dragged.z) > SAME_PLACE) return false;
    const sides = sidesOf(profile, point.id);
    if (sides.length !== 1) return false;
    // A side that runs between the two would shrink to nothing.
    return sides[0].id !== joining.id;
  });
  return found ?? null;
}

/** The other open ends of the sketch: where a dragged open end snaps to. */
export function openEndPoints(profile: SketchProfile, exceptPointId?: string | null): { x: number; z: number }[] {
  const used = new Map<string, number>();
  profile.segments.forEach((segment) => {
    used.set(segment.startId, (used.get(segment.startId) ?? 0) + 1);
    used.set(segment.endId, (used.get(segment.endId) ?? 0) + 1);
  });
  return profile.points
    .filter((point) => point.id !== exceptPointId && !point.locked && used.get(point.id) === 1)
    .map((point) => ({ x: point.x, z: point.z }));
}

/**
 * Whether the dragged point's one side can be put on `target` as it stands. A side uses the handle
 * of its start as the out handle and the handle of its end as the in handle, so two sides that both
 * start or both end at the joined point would need the same handle twice.
 */
function handlesFit(dragged: SketchPoint, draggedSide: SketchSegment, target: SketchPoint, targetSide: SketchSegment) {
  const draggedStarts = draggedSide.startId === dragged.id;
  const targetStarts = targetSide.startId === target.id;
  if (draggedStarts !== targetStarts) return true;
  return (draggedSide.kind ?? "line") === "line";
}

/**
 * The dragged open end becomes the open end it lies on. Null when there is nothing to join, or the
 * two sides would have to bend from the same handle.
 */
export function joinOpenEnds(profile: SketchProfile, pointId: string): SketchProfile | null {
  const target = openEndUnder(profile, pointId);
  if (!target) return null;
  const dragged = profile.points.find((point) => point.id === pointId)!;
  const draggedSide = sidesOf(profile, pointId)[0];
  const targetSide = sidesOf(profile, target.id)[0];
  if (!handlesFit(dragged, draggedSide, target, targetSide)) return null;
  const draggedStarts = draggedSide.startId === dragged.id;
  const draggedHandle = draggedStarts ? dragged.handleOut : dragged.handleIn;
  const targetStarts = targetSide.startId === target.id;
  const merged: SketchPoint = { ...target };
  if (draggedStarts !== targetStarts && draggedHandle) {
    if (draggedStarts) merged.handleOut = { ...draggedHandle };
    else merged.handleIn = { ...draggedHandle };
    if (merged.handleIn && merged.handleOut) merged.mode = "split";
  }
  return {
    ...profile,
    points: profile.points.filter((point) => point.id !== pointId).map((point) => (point.id === target.id ? merged : point)),
    segments: profile.segments.map((segment) => ({
      ...segment,
      startId: segment.startId === pointId ? target.id : segment.startId,
      endId: segment.endId === pointId ? target.id : segment.endId,
    })),
  };
}
