import { boundsForShapes, meshForShape } from "@/lib/editorMeshCore";
import { projectShapesFingerprint } from "@/lib/editorHistory";
import { exportLylProject, type LylProjectExportInput } from "@/lib/lylProject";
import { libraryOffset, shapesForLibrary, shapesFromLibrary } from "@/lib/myShapes";
import { renderMyShapeThumbnail } from "@/lib/myShapeThumbnail";
import type { PlacementPoint } from "@/lib/placementWorkplane";
import { notesAttachedToShapes, notesForInsertedShapes, shapeIdMapping, translateNotes } from "@/lib/workplaneNotes";
import { canonicalizeShape, cloneWorkplaneShapeTreeWithFreshIds } from "@/lib/workplaneShapes";
import type { ProjectAsset, WorkplaneNote, WorkplaneShape } from "@/types/layerling";

/*
 * A custom shape on its way into the library and back out (#109): the bodies
 * and the notes pinned to them, packed as a small design and put down again
 * in another one. The editor only decides where they come from and where they
 * go; the browser and server stores live in myShapes and customShapesServer.
 */

type PackSettings = Pick<LylProjectExportInput, "workspace" | "snapGrid">;

/** What the library compares to tell two shapes apart: the bodies as they are kept. */
export function customShapeFingerprint(shapes: WorkplaneShape[]) {
  return projectShapesFingerprint(shapesForLibrary(shapes, boundsForShapes(shapes)));
}

/** Bodies packed as a custom shape: centred on the origin, standing on the plate, with a preview and the notes pinned to them. */
export async function packCustomShape(parts: WorkplaneShape[], name: string, assets: ProjectAsset[], notes: WorkplaneNote[], settings: PackSettings) {
  const box = boundsForShapes(parts);
  const kept = shapesForLibrary(parts, box);
  const { dx, dy, dz } = libraryOffset(box);
  const now = Date.now();
  const bytes = await exportLylProject({
    projectName: name,
    createdAt: now,
    modifiedAt: now,
    shapes: kept,
    notes: translateNotes(notesAttachedToShapes(notes, parts), dx, dy, dz),
    history: [],
    historyIndex: 0,
    assets,
    workspace: settings.workspace,
    snapGrid: settings.snapGrid,
    placementElevation: 0,
  });
  const thumbnail = renderMyShapeThumbnail(kept.map((shape) => {
    const mesh = meshForShape(shape);
    return { vertices: mesh.vertices, faces: mesh.faces, color: shape.color, hole: shape.hole };
  }), 256);
  return { bytes, thumbnail, bodyCount: kept.length, fingerprint: projectShapesFingerprint(kept), createdAt: now };
}

export type PackedCustomShape = Awaited<ReturnType<typeof packCustomShape>>;

/**
 * A kept shape put down at `target` in a design that has `existingNotes`:
 * bodies with fresh ids, and its notes pinned to them under ids of their own
 * (see `notesForInsertedShapes`). Centred again on the way in: a shape on the
 * server may have been opened and changed like a design, and moved off the
 * middle doing so.
 */
export function placeCustomShape(restored: { shapes: WorkplaneShape[]; notes?: WorkplaneNote[] }, target: PlacementPoint, existingNotes: readonly WorkplaneNote[]) {
  const box = boundsForShapes(restored.shapes);
  const shapes = shapesFromLibrary(shapesForLibrary(restored.shapes, box), target)
    .map((shape) => canonicalizeShape(cloneWorkplaneShapeTreeWithFreshIds(shape, "insert")));
  const { dx, dy, dz } = libraryOffset(box);
  const incoming = translateNotes(notesAttachedToShapes(restored.notes ?? [], restored.shapes), dx + target.x, dy + target.y, dz + target.z);
  const { notes, dropped } = notesForInsertedShapes(incoming, shapeIdMapping(restored.shapes, shapes), existingNotes);
  return { shapes, notes, dropped };
}

/**
 * A whole saved design put into one that has `existingNotes`, its bodies where
 * they were saved: as a custom shape, but every note comes along, the free ones
 * and the reference points too - they belong to these bodies' design.
 */
export function placeInsertedDesign(restored: { shapes: WorkplaneShape[]; notes?: WorkplaneNote[] }, existingNotes: readonly WorkplaneNote[]) {
  const shapes = restored.shapes.map((shape) => canonicalizeShape(cloneWorkplaneShapeTreeWithFreshIds(shape, "insert")));
  const { notes, dropped } = notesForInsertedShapes(restored.notes ?? [], shapeIdMapping(restored.shapes, shapes), existingNotes);
  return { shapes, notes, dropped };
}
