import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

/*
 * Deleting one point of a sketch. A point between two sides is bridged: the two neighbours are
 * joined by one side, so an outline stays closed. A point where two lines cross - a circle cut by a
 * straight line, as when a rounded corner is built from a circle (#641) - has four sides. Those used
 * to go all four, and the rest of the circle fell apart. Now the sides that run on through the
 * point are joined in pairs: arc with arc, line with line. A side that turns away is not bridged.
 *
 * A joined curve keeps the size of its arc: the handles of two arcs of a circle are made as long as
 * one arc over both needs, so the circle stays round instead of flattening between the neighbours.
 */

type Vec = { x: number; z: number };

/** Two sides count as running on through the point when they turn by less than this (cos 150°). */
const RUNS_ON_LIMIT = -Math.cos(Math.PI / 6);
/** Beyond this one cubic no longer follows an arc closely; the handles are then kept as they were. */
const MAX_JOINED_ARC = Math.PI * 1.05;

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, z: a.z - b.z };
}

function length(v: Vec) {
  return Math.hypot(v.x, v.z);
}

function unit(v: Vec): Vec | null {
  const l = length(v);
  return l > 1e-9 ? { x: v.x / l, z: v.z / l } : null;
}

function dot(a: Vec, b: Vec) {
  return a.x * b.x + a.z * b.z;
}

/** The handle a side uses at one of its ends: handleOut at its start, handleIn at its end. */
function handleAt(point: SketchPoint, segment: SketchSegment): Vec | undefined {
  if (segment.kind === "line") return undefined;
  return segment.startId === point.id ? point.handleOut : point.handleIn;
}

/** Which way a side leaves the point: along its handle there, or else straight to its other end. */
function leavingDirection(point: SketchPoint, segment: SketchSegment, other: SketchPoint): Vec | null {
  const handle = handleAt(point, segment);
  return (handle && unit(sub(handle, point))) || unit(sub(other, point));
}

function joinedKind(a: SketchSegment, b: SketchSegment): SketchSegment["kind"] {
  if (a.kind === "line" && b.kind === "line") return "line";
  return a.kind === "smooth" || b.kind === "smooth" ? "smooth" : "bezier";
}

/**
 * The angle and radius of the arc from `end` to the removed point, read from the handle at `end`:
 * a tangent meets the chord of a circular arc at half the arc's angle.
 */
function arcFromHandle(end: SketchPoint, handle: Vec | undefined, removed: SketchPoint) {
  if (!handle) return null;
  const tangent = unit(sub(handle, end));
  const chord = sub(removed, end);
  const chordLength = length(chord);
  const chordDir = unit(chord);
  if (!tangent || !chordDir) return null;
  const half = Math.acos(Math.max(-1, Math.min(1, dot(tangent, chordDir))));
  if (half < 1e-4) return null;
  return { angle: 2 * half, radius: chordLength / (2 * Math.sin(half)) };
}

/**
 * The profile without point `id`. Sides through it are joined where they run on (see above); every
 * other side at the point goes with it.
 */
export function sketchProfileWithoutPoint(profile: SketchProfile, id: string): SketchProfile {
  const removed = profile.points.find((point) => point.id === id);
  if (!removed) return profile;
  const byId = new Map(profile.points.map((point) => [point.id, point]));
  const connected = profile.segments.filter((segment) => segment.startId === id || segment.endId === id);
  const remaining = profile.segments.filter((segment) => segment.startId !== id && segment.endId !== id);
  const otherEnd = (segment: SketchSegment) => byId.get(segment.startId === id ? segment.endId : segment.startId);

  let pairs: Array<[SketchSegment, SketchSegment]> = [];
  if (connected.length === 2) {
    // Two sides were always bridged, whatever their angle; that stays.
    pairs = [[connected[0], connected[1]]];
  } else if (connected.length === 4) {
    const turn = (a: SketchSegment, b: SketchSegment) => {
      const oa = otherEnd(a);
      const ob = otherEnd(b);
      const da = oa && leavingDirection(removed, a, oa);
      const db = ob && leavingDirection(removed, b, ob);
      // A line touching the circle runs on both ways; there the arc keeps to the arc.
      const mixed = (a.kind === "line") !== (b.kind === "line") ? 0.01 : 0;
      return da && db ? dot(da, db) + mixed : 1;
    };
    const [s0, s1, s2, s3] = connected;
    const pairings: Array<Array<[SketchSegment, SketchSegment]>> = [
      [[s0, s1], [s2, s3]],
      [[s0, s2], [s1, s3]],
      [[s0, s3], [s1, s2]],
    ];
    // Only a pair that runs on counts; the pairing that joins the most, and the straightest, wins.
    const score = (pairing: Array<[SketchSegment, SketchSegment]>) =>
      pairing.reduce((sum, [a, b]) => sum + Math.min(0, turn(a, b) - RUNS_ON_LIMIT) - (turn(a, b) <= RUNS_ON_LIMIT ? 1 : 0), 0);
    const best = pairings.reduce((winner, pairing) => (score(pairing) < score(winner) ? pairing : winner));
    pairs = best.filter(([a, b]) => turn(a, b) <= RUNS_ON_LIMIT);
  }

  const points = profile.points.filter((point) => point.id !== id).map((point) => ({ ...point }));
  const pointById = new Map(points.map((point) => [point.id, point]));
  for (const [a, b] of pairs) {
    const startSide = a.endId === id ? a : b.endId === id ? b : a;
    const endSide = startSide === a ? b : a;
    const startId = startSide.startId === id ? startSide.endId : startSide.startId;
    const endId = endSide.startId === id ? endSide.endId : endSide.startId;
    if (startId === endId) continue;
    const duplicate = remaining.some((segment) =>
      (segment.startId === startId && segment.endId === endId) || (segment.startId === endId && segment.endId === startId),
    );
    if (duplicate) continue;
    remaining.push({
      id: createLocalId("sketch-segment"),
      startId,
      endId,
      kind: joinedKind(a, b),
      ...(a.construction && b.construction ? { construction: true } : {}),
    });
    // Both halves curved, and both read as arcs of one circle: lengthen the handles to the whole arc.
    const start = pointById.get(startId);
    const end = pointById.get(endId);
    if (!start || !end || a.kind === "line" || b.kind === "line") continue;
    // Only a chain that runs one way (start -> removed -> end) hands its handles on as they are:
    // the start's handleOut and the end's handleIn then belonged to the removed sides alone.
    if (startSide.startId !== startId || endSide.endId !== endId) continue;
    const startHandle = start.handleOut;
    const endHandle = end.handleIn;
    const startArc = arcFromHandle(start, startHandle, removed);
    const endArc = arcFromHandle(end, endHandle, removed);
    if (!startArc || !endArc || !startHandle || !endHandle) continue;
    const angle = startArc.angle + endArc.angle;
    if (angle > MAX_JOINED_ARC) continue;
    // A free curve is left alone; only two halves of one circle (radii within 10 %) are rounded out.
    if (Math.abs(startArc.radius - endArc.radius) > 0.1 * Math.max(startArc.radius, endArc.radius)) continue;
    const radius = (startArc.radius + endArc.radius) / 2;
    const reach = (4 / 3) * Math.tan(angle / 4) * radius;
    const startDir = unit(sub(startHandle, start));
    const endDir = unit(sub(endHandle, end));
    if (!startDir || !endDir) continue;
    // The new side runs start -> end, so it reads handleOut at its start and handleIn at its end.
    start.handleOut = { x: start.x + startDir.x * reach, z: start.z + startDir.z * reach };
    end.handleIn = { x: end.x + endDir.x * reach, z: end.z + endDir.z * reach };
  }
  return { ...profile, points, segments: remaining };
}
