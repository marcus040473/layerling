import { revolveBuildProfile } from "@/lib/editorSketchCad";
import { loadedManifoldRuntime } from "@/lib/manifoldHandle";
import { noteAnchorWorld } from "@/lib/noteAnchoring";
import { revolveAxisOffset } from "@/lib/revolveAxis";
import { sketchOutlineBounds } from "@/lib/sketchKeyring";
import { sketchBodyAnchor, type SketchAnchor } from "@/lib/sketchPlacement";
import { normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import { isReferencePoint } from "@/lib/workplaneNotes";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { SketchNote, SketchOperation, SketchProfile, SketchRevolveSettings, WorkplaneNote, WorkplaneShape } from "@/types/layerling";

/*
 * Notes on a sketch. While the sketch is open they are spots in its own mm; in the 3D view they
 * are ordinary notes pinned to the sketch body. Both sides are worked out in the body's own frame,
 * unscaled - the frame it was built in - so a note comes back to the same spot in the sketch, and a
 * pin is a share of the body's size, so it follows the body when it is resized in 3D.
 */

type Size = [number, number, number];

/**
 * How the sketch lies in its body. An extrusion or a sweep stands on its sketch: the sketch's x and
 * z are the body's, from the middle of the outline. A revolve turns its sketch about the axis: the
 * sketch's x is the radius (the outline lies left of the axis), its z the height, downwards.
 */
export type SketchNoteFrame =
  | { kind: "plane"; anchor: SketchAnchor; size: Size }
  | { kind: "revolve"; axis: { x: number; z: number }; middle: number; angle: number; size: Size };

/** Where a note sits off the plane when it does not say: the top, and the middle of the turn. */
const PLANE_TOP = 0.5;

function builtSize(shape: WorkplaneShape): Size {
  const frame = shape.cadBrepFrame;
  if (shape.cadBrep && frame) return [frame.width, frame.height, frame.depth];
  const mesh = shape.importedMesh;
  if (mesh) return [mesh.baseWidth, mesh.baseHeight, mesh.baseDepth];
  return [shapeWidth(shape), shape.height, shapeDepth(shape)];
}

export function sketchNoteFrame(
  body: WorkplaneShape,
  operation: SketchOperation,
  profile: SketchProfile,
  revolveSettings?: Partial<SketchRevolveSettings>,
): SketchNoteFrame {
  const size = builtSize(body);
  if (operation !== "revolve") return { kind: "plane", anchor: sketchBodyAnchor(body), size };
  // A drawn line turns as the band its stroke makes; without the runtime the outline stands in.
  const runtime = profile.stroke ? loadedManifoldRuntime() : null;
  let built = profile;
  try {
    if (runtime) built = revolveBuildProfile(runtime, profile);
  } catch {
    built = profile;
  }
  const bounds = sketchOutlineBounds(built);
  const zs = profile.points.map((point) => point.z);
  const middle = bounds ? (bounds.minZ + bounds.maxZ) / 2 : zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
  const settings = normalizeSketchRevolveSettings(revolveSettings);
  const sweep = Math.abs(settings.sweepAngle);
  const first = settings.sweepAngle < 0 ? settings.startAngle + settings.sweepAngle : settings.startAngle;
  return { kind: "revolve", axis: revolveAxisOffset(built, settings), middle, angle: first + sweep / 2, size };
}

const share = (value: number, size: number) => (Math.abs(size) > 1e-9 ? value / size : 0);
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The pin of a sketch note on its body, as a share of the body's width, height and depth. */
export function sketchNoteAnchor(note: Pick<SketchNote, "x" | "z" | "offPlane">, frame: SketchNoteFrame): [number, number, number] {
  const [width, height, depth] = frame.size;
  if (frame.kind === "plane") {
    return [share(note.x - frame.anchor.x, width), note.offPlane ?? PLANE_TOP, share(note.z - frame.anchor.z, depth)];
  }
  // The radius runs to the left of the axis; a note right of it lands on the far side of the turn.
  const radius = -note.x;
  const angle = radians(note.offPlane ?? frame.angle);
  return [
    share(frame.axis.x + radius * Math.cos(angle), width),
    share(frame.middle - note.z, height),
    share(frame.axis.z - radius * Math.sin(angle), depth),
  ];
}

/** Where a pinned note shows in the sketch: flattened onto its plane, with what it stands off it kept. */
export function sketchNoteSpot(normalized: readonly [number, number, number], frame: SketchNoteFrame): Pick<SketchNote, "x" | "z" | "offPlane"> {
  const [width, height, depth] = frame.size;
  if (frame.kind === "plane") {
    const spot = { x: frame.anchor.x + normalized[0] * width, z: frame.anchor.z + normalized[2] * depth };
    return Math.abs(normalized[1] - PLANE_TOP) > 1e-6 ? { ...spot, offPlane: normalized[1] } : spot;
  }
  const across = normalized[0] * width - frame.axis.x;
  const along = normalized[2] * depth - frame.axis.z;
  const z = frame.middle - normalized[1] * height;
  const radius = Math.hypot(across, along);
  if (radius < 1e-9) return { x: 0, z };
  let angle = (Math.atan2(-along, across) * 180) / Math.PI;
  let x = -radius;
  // Shown on the side of the axis nearer the middle of the turn: a note put right of the axis comes back there.
  const off = ((angle - frame.angle) % 360 + 540) % 360 - 180;
  if (Math.abs(off) > 90) {
    x = radius;
    angle += 180;
  }
  const turn = ((angle - frame.angle) % 360 + 540) % 360 - 180;
  return Math.abs(turn) > 0.01 ? { x, z, offPlane: frame.angle + turn } : { x, z };
}

/** The notes pinned to the sketch body, as the open sketch shows them. */
export function sketchNotesFromBody(notes: readonly WorkplaneNote[], body: WorkplaneShape, frame: SketchNoteFrame): SketchNote[] {
  return notes.flatMap((note) => {
    if (isReferencePoint(note) || note.anchor?.shapeId !== body.id) return [];
    const sketchNote: SketchNote = { id: note.id, text: note.text, ...sketchNoteSpot(note.anchor.normalized, frame) };
    if (note.collapsed) sketchNote.collapsed = true;
    return [sketchNote];
  });
}

/**
 * The design's notes once the sketch is finished: those of the body it edited (`editedId`) give way to
 * the sketch's, each where it was in the list, and the new ones come last - pinned to `body`.
 */
export function notesWithSketchNotes(
  notes: readonly WorkplaneNote[],
  editedId: string | null,
  body: WorkplaneShape,
  sketchNotes: readonly SketchNote[],
  frame: SketchNoteFrame,
): WorkplaneNote[] {
  const pinned = (sketchNote: SketchNote): WorkplaneNote => {
    const normalized = sketchNoteAnchor(sketchNote, frame);
    const note: WorkplaneNote = { id: sketchNote.id, text: sketchNote.text, ...noteAnchorWorld(body, normalized), anchor: { shapeId: body.id, normalized } };
    if (sketchNote.collapsed) note.collapsed = true;
    return note;
  };
  const byId = new Map(sketchNotes.map((note) => [note.id, note]));
  const placed = new Set<string>();
  const kept = notes.flatMap((note) => {
    if (!editedId || isReferencePoint(note) || note.anchor?.shapeId !== editedId) return [note];
    const sketchNote = byId.get(note.id);
    if (!sketchNote) return [];
    placed.add(note.id);
    return [pinned(sketchNote)];
  });
  return [...kept, ...sketchNotes.filter((note) => !placed.has(note.id)).map(pinned)];
}

/** The numbers the sketch's notes have in the 3D view, where all the design's notes are counted. */
export function sketchNoteNumbers(notes: readonly WorkplaneNote[], editedId: string | null, sketchNotes: readonly SketchNote[]) {
  const inSketch = new Set(sketchNotes.map((note) => note.id));
  const numbers = new Map<string, number>();
  let count = 0;
  for (const note of notes) {
    if (isReferencePoint(note)) continue;
    // Taken away in the sketch, the note no longer counts.
    if (editedId && note.anchor?.shapeId === editedId && !inSketch.has(note.id)) continue;
    count += 1;
    if (inSketch.has(note.id)) numbers.set(note.id, count);
  }
  for (const note of sketchNotes) if (!numbers.has(note.id)) numbers.set(note.id, ++count);
  return numbers;
}
