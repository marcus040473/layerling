import { describe, expect, it } from "vitest";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import {
  cleanMyShapeName,
  myShapeNameFromFile,
  myShapesBackupFileName,
  libraryOffset,
  shapesForLibrary,
  shapesFromLibrary,
  sortMyShapes,
  type MyShapeMeta,
} from "@/lib/myShapes";
import { customShapeFileName } from "@/lib/customShapesServer";
import { CUSTOM_SHAPES_BACKUP_FOLDER, packBackup, unpackBackup, unpackCustomShapes, zipHoldsDesigns } from "@/lib/projectBackup";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { notesAttachedToShapes, notesForInsertedShapes, NOTE_COUNT_LIMIT, translateNotes } from "@/lib/workplaneNotes";
import { placeCustomShape, placeInsertedDesign } from "@/lib/customShapePackage";
import type { WorkplaneNote, WorkplaneShape } from "@/types/layerling";

function box(id: string, x: number, z: number, elevation: number, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return { id, name: id, kind: "box", color: "#d41721", x, z, elevation, size: 20, width: 20, depth: 10, height: 6, rotation: 0, locked: false, hidden: false, ...overrides };
}

describe("my shapes", () => {
  it("cleans names and takes them from files", () => {
    expect(cleanMyShapeName("  Halter \n v2  ", "Meine Form")).toBe("Halter v2");
    expect(cleanMyShapeName("   ", "Meine Form")).toBe("Meine Form");
    expect(cleanMyShapeName("x".repeat(200), "f")).toHaveLength(80);
    expect(myShapeNameFromFile("Halter v2.lyl", "f")).toBe("Halter v2");
    expect(myShapeNameFromFile("old.SKF", "f")).toBe("old");
    expect(myShapesBackupFileName(new Date(2026, 9, 5))).toBe("layerling-custom-shapes-2026-10-05.zip");
  });

  it("keeps the newest last", () => {
    const meta = (id: string, createdAt: number): MyShapeMeta => ({ id, name: id, createdAt, thumbnail: "", bodyCount: 1, byteLength: 1 });
    expect(sortMyShapes([meta("b", 2), meta("a", 1), meta("c", 3)]).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("stores bodies centred and standing on the plate, and puts them down where asked", () => {
    const parts = [box("a", 40, 10, 5), box("b", 60, 30, 5)];
    // Footprint 30..70 by 5..35, lowest point 5.
    const kept = shapesForLibrary(parts, { minX: 30, maxX: 70, minY: 5, maxY: 11, minZ: 5, maxZ: 35 });
    expect(kept.map((shape) => [shape.x, shape.z, shape.elevation])).toEqual([[-10, -10, 0], [10, 10, 0]]);
    const placed = shapesFromLibrary(kept, { x: 100, y: 2, z: -50 });
    expect(placed.map((shape) => [shape.x, shape.z, shape.elevation])).toEqual([[90, -60, 2], [110, -40, 2]]);
    // The originals are left alone.
    expect(parts[0].x).toBe(40);
  });

  it("moves a group as a whole, its parts stay relative to it", () => {
    const group = box("g", 20, 20, 0, { groupedShapes: [box("p", 3, 4, 0)] });
    const [moved] = shapesFromLibrary([group], { x: 5, y: 0, z: 5 });
    expect([moved.x, moved.z]).toEqual([25, 25]);
    expect(moved.groupedShapes?.[0].x).toBe(3);
  });

  it("survives the trip through a design package without a history", async () => {
    const kept = shapesForLibrary([box("a", 0, 0, 0), box("b", 30, 0, 0, { hole: true })], { minX: -10, maxX: 40, minY: 0, maxY: 6, minZ: -5, maxZ: 5 });
    const bytes = await exportLylProject({
      projectName: "Halter",
      createdAt: 1,
      modifiedAt: 1,
      shapes: kept,
      notes: [],
      history: [],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = await importLylProject(bytes);
    expect(restored.projectName).toBe("Halter");
    expect(restored.shapes.map((shape) => [shape.id, shape.x, shape.hole ?? false])).toEqual([["a", -15, false], ["b", 15, true]]);
  });

  it("takes the notes pinned to its bodies along, and gives them fresh ids on the way into another design", async () => {
    const parts = [box("a", 40, 10, 5), box("g", 60, 30, 5, { groupedShapes: [box("p", 3, 4, 0)] })];
    const notes: WorkplaneNote[] = [
      { id: "note-1", text: "Bohrung 4 mm", x: 40, y: 11, z: 10, anchor: { shapeId: "a", normalized: [0.5, 0.5, 0] } },
      { id: "note-2", text: "Inner part", x: 63, y: 6, z: 34, anchor: { shapeId: "p", normalized: [0, 0.5, 0] } },
      { id: "note-free", text: "Not pinned", x: 0, y: 0, z: 0 },
      { id: "note-other", text: "On another body", x: 0, y: 0, z: 0, anchor: { shapeId: "elsewhere", normalized: [0, 0, 0] } },
      { id: "point-1", text: "", x: 40, y: 11, z: 10, kind: "point" },
    ];
    const box3 = { minX: 30, maxX: 70, minY: 5, maxY: 11, minZ: 5, maxZ: 35 };
    const { dx, dy, dz } = libraryOffset(box3);
    const bytes = await exportLylProject({
      projectName: "Halter",
      createdAt: 1,
      modifiedAt: 1,
      shapes: shapesForLibrary(parts, box3),
      notes: translateNotes(notesAttachedToShapes(notes, parts), dx, dy, dz),
      history: [],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = await importLylProject(bytes);
    expect(restored.notes?.map((entry) => [entry.id, entry.x, entry.y, entry.z])).toEqual([["note-1", -10, 6, -10], ["note-2", 13, 1, 14]]);

    // The design it goes into already has a note under the same id.
    const existing: WorkplaneNote[] = [{ id: "note-1", text: "Mine", x: 1, y: 2, z: 3 }];
    const { shapes: inserted, notes: incoming, dropped } = placeCustomShape(restored, { x: 100, y: 0, z: 0 }, existing);
    expect(dropped).toBe(0);
    // The note moves with its body: it was saved over the middle of "a", 6 above its bottom.
    expect([incoming[0].x, incoming[0].y, incoming[0].z]).toEqual([inserted[0].x, (inserted[0].elevation ?? 0) + 6, inserted[0].z]);
    expect(incoming.map((entry) => entry.text)).toEqual(["Bohrung 4 mm", "Inner part"]);
    // Closed, so they do not take the click that places the shape.
    expect(incoming.every((entry) => entry.collapsed)).toBe(true);
    expect(new Set([...existing, ...incoming].map((entry) => entry.id)).size).toBe(3);
    expect(incoming[0].anchor).toEqual({ shapeId: inserted[0].id, normalized: [0.5, 0.5, 0] });
    expect(incoming[1].anchor?.shapeId).toBe(inserted[1].groupedShapes?.[0].id);
    // The package is left alone.
    expect(restored.notes?.[0].anchor?.shapeId).toBe("a");
  });

  it("inserts a whole design with all its notes and reference points, after the ones already there", () => {
    const restored = {
      shapes: [box("a", 40, 10, 5), box("g", 60, 30, 5, { groupedShapes: [box("p", 3, 4, 0)] })],
      notes: [
        { id: "note-1", text: "Pinned", x: 40, y: 11, z: 10, anchor: { shapeId: "a", normalized: [0.5, 0.5, 0] } },
        { id: "point-1", text: "", x: 1, y: 1, z: 1, kind: "point" },
        { id: "note-2", text: "Free", x: 7, y: 8, z: 9 },
        { id: "note-3", text: "Inner", x: 63, y: 6, z: 34, anchor: { shapeId: "p", normalized: [0, 0.5, 0] } },
      ] satisfies WorkplaneNote[],
    };
    const existing: WorkplaneNote[] = [{ id: "note-1", text: "Mine", x: 1, y: 2, z: 3 }];
    const { shapes, notes, dropped } = placeInsertedDesign(restored, existing);
    expect(dropped).toBe(0);
    // The bodies stay where they were saved, under fresh ids.
    expect(shapes.map((shape) => [shape.x, shape.z])).toEqual([[40, 10], [60, 30]]);
    expect(shapes[0].id).not.toBe("a");
    expect(notes.map((note) => note.text)).toEqual(["Pinned", "", "Free", "Inner"]);
    expect(notes[1].kind).toBe("point");
    expect([notes[1].x, notes[1].y, notes[1].z]).toEqual([1, 1, 1]);
    expect([notes[2].x, notes[2].y, notes[2].z]).toEqual([7, 8, 9]);
    expect(notes[0].anchor?.shapeId).toBe(shapes[0].id);
    expect(notes[2].anchor).toBeUndefined();
    expect(notes[3].anchor?.shapeId).toBe(shapes[1].groupedShapes?.[0].id);
    expect(new Set([...existing, ...notes].map((note) => note.id)).size).toBe(5);
  });

  it("brings in only as many notes as the design has room for, and lets go of a pin whose body is missing", () => {
    const existing: WorkplaneNote[] = Array.from({ length: NOTE_COUNT_LIMIT - 1 }, (_, index) => ({ id: `n${index}`, text: "", x: 0, y: 0, z: 0 }));
    const incoming: WorkplaneNote[] = [
      { id: "x", text: "lost body", x: 1, y: 2, z: 3, anchor: { shapeId: "gone", normalized: [0, 0, 0] } },
      { id: "y", text: "no room", x: 0, y: 0, z: 0, anchor: { shapeId: "a", normalized: [0, 0, 0] } },
    ];
    const { notes, dropped } = notesForInsertedShapes(incoming, new Map([["a", "a2"]]), existing);
    expect(dropped).toBe(1);
    expect(notes).toHaveLength(1);
    expect(notes[0].anchor).toBeUndefined();
    expect([notes[0].x, notes[0].y, notes[0].z]).toEqual([1, 2, 3]);
  });

  it("keeps custom shapes in their own folder of a backup", () => {
    const zip = packBackup([
      { name: "Entwurf.lyl", bytes: new Uint8Array([1]) },
      { name: `${CUSTOM_SHAPES_BACKUP_FOLDER}/Halter.lyl`, bytes: new Uint8Array([2]) },
      { name: `${CUSTOM_SHAPES_BACKUP_FOLDER}/custom-shapes.json`, bytes: new TextEncoder().encode(JSON.stringify({ shapes: [{ file: "Halter.lyl", name: "Halter" }] })) },
    ]);
    expect(unpackBackup(zip).map((entry) => entry.name)).toEqual(["Entwurf.lyl"]);
    const shapes = unpackCustomShapes(zip);
    expect(shapes.entries.map((entry) => [entry.name, entry.bytes[0]])).toEqual([["Halter.lyl", 2]]);
    expect((shapes.manifest as { shapes: Array<{ name: string }> }).shapes[0].name).toBe("Halter");
    // A backup with nothing but custom shapes still counts as a backup.
    expect(zipHoldsDesigns(packBackup([{ name: `${CUSTOM_SHAPES_BACKUP_FOLDER}/Halter.lyl`, bytes: new Uint8Array([2]) }]))).toBe(true);
  });

  it("names the file on the server after the shape, safely", () => {
    expect(customShapeFileName("Halter v2")).toBe("Halter v2.lyl");
    expect(customShapeFileName('a/b:c*"d"')).toBe("a-b-c--d-.lyl");
    expect(customShapeFileName("...")).toBe("Shape.lyl");
  });
});
