import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import { noteAnchorWorld, visibleShapeUnderPoint } from "@/lib/noteAnchoring";
import { notesWithSketchNotes, sketchNoteAnchor, sketchNoteFrame, sketchNoteNumbers, sketchNotesFromBody, sketchNoteSpot } from "@/lib/sketchNotes";
import { buildSketchRevolveMesh, normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import type { SketchNote, SketchProfile, SketchRevolveSettings, WorkplaneNote, WorkplaneShape } from "@/types/layerling";

/*
 * A note put on a sketch is pinned to the sketch body in the 3D view, and comes back to the same
 * spot when the sketch is opened again.
 */

const square: SketchProfile = {
  points: [{ id: "a", x: 10, z: 10 }, { id: "b", x: 50, z: 10 }, { id: "c", x: 50, z: 30 }, { id: "d", x: 10, z: 30 }],
  segments: [
    { id: "ab", startId: "a", endId: "b", kind: "line" },
    { id: "bc", startId: "b", endId: "c", kind: "line" },
    { id: "cd", startId: "c", endId: "d", kind: "line" },
    { id: "da", startId: "d", endId: "a", kind: "line" },
  ],
};

const ring: SketchProfile = {
  points: [{ id: "a", x: -5, z: 0 }, { id: "b", x: -10, z: 0 }, { id: "c", x: -10, z: 20 }, { id: "d", x: -5, z: 20 }],
  segments: [
    { id: "ab", startId: "a", endId: "b", kind: "line" },
    { id: "bc", startId: "b", endId: "c", kind: "line" },
    { id: "cd", startId: "c", endId: "d", kind: "line" },
    { id: "da", startId: "d", endId: "a", kind: "line" },
  ],
};

function extruded(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "body", name: "Sketch", kind: "mesh", color: "#78b96b", x: 30, z: -20, elevation: 0, size: 40, width: 40, depth: 20, height: 10, rotation: 0,
    sketchProfile: square,
    cadBrep: "brep",
    cadBrepFrame: { x: 30, z: 20, elevation: 0, width: 40, depth: 20, height: 10 },
    ...overrides,
  };
}

function near(point: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  expect(point.x).toBeCloseTo(expected.x, 4);
  expect(point.y).toBeCloseTo(expected.y, 4);
  expect(point.z).toBeCloseTo(expected.z, 4);
}

describe("a note on an extruded sketch", () => {
  const frame = sketchNoteFrame(extruded(), "extrude", square);

  it("sits on the top of the body, over the spot it was put on", () => {
    // The sketch's middle (30, 20) is the body's middle; (40, 25) is 10 right and 5 forward of it.
    const anchor = sketchNoteAnchor({ x: 40, z: 25 }, frame);
    expect(anchor).toEqual([0.25, 0.5, 0.25]);
    near(noteAnchorWorld(extruded(), anchor), { x: 40, y: 10, z: -15 });
  });

  it("comes back to the same spot in the sketch, resized in 3D as well", () => {
    const anchor = sketchNoteAnchor({ x: 12, z: 28 }, frame);
    const stretched = sketchNoteFrame(extruded({ width: 80, height: 30 }), "extrude", square);
    expect(sketchNoteSpot(anchor, stretched)).toEqual({ x: 12, z: 28 });
  });

  it("keeps the height of a note put on a side in 3D", () => {
    const spot = sketchNoteSpot([0.5, -0.1, 0], frame);
    expect(spot).toEqual({ x: 50, z: 20, offPlane: -0.1 });
    expect(sketchNoteAnchor(spot, frame)).toEqual([0.5, -0.1, 0]);
  });
});

describe("a note on a revolved sketch", () => {
  let runtime: ManifoldToplevel;
  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  function revolved(settings: Partial<SketchRevolveSettings>): WorkplaneShape {
    const mesh = buildSketchRevolveMesh(runtime, ring, normalizeSketchRevolveSettings(settings));
    return {
      id: "vase", name: "Revolve", kind: "mesh", color: "#78b96b", x: 0, z: 0, elevation: 0,
      size: Math.max(mesh.width, mesh.depth), width: mesh.width, depth: mesh.depth, height: mesh.height, rotation: 0,
      importedMesh: { positions: mesh.positions, baseWidth: mesh.width, baseDepth: mesh.depth, baseHeight: mesh.height, triangleCount: mesh.triangleCount, sourceFormat: "json" },
      sketchProfile: ring, sketchOperation: "revolve", sketchRevolve: normalizeSketchRevolveSettings(settings),
    };
  }

  it.each([
    { startAngle: 0, sweepAngle: 360 },
    { startAngle: 0, sweepAngle: 90 },
    { startAngle: 30, sweepAngle: 200 },
    { startAngle: 0, sweepAngle: -120 },
  ])("lands on the outer wall it was put on ($startAngle°, $sweepAngle°)", (settings) => {
    const body = revolved(settings);
    const frame = sketchNoteFrame(body, "revolve", ring, settings);
    const world = noteAnchorWorld(body, sketchNoteAnchor({ x: -10, z: 10 }, frame));
    expect(visibleShapeUnderPoint([body], world)?.id).toBe("vase");
  });

  it("stands where it was drawn on a full turn, seen from the front", () => {
    const body = revolved({ sweepAngle: 360 });
    const frame = sketchNoteFrame(body, "revolve", ring, { sweepAngle: 360 });
    // The ring is 20 high and drawn from z 0 (its top) down to 20: z 5 is 5 above the middle.
    near(noteAnchorWorld(body, sketchNoteAnchor({ x: -10, z: 5 }, frame)), { x: -10, y: 15, z: 0 });
  });

  it("comes back to the same spot in the sketch, on either side of the axis", () => {
    const body = revolved({ startAngle: 30, sweepAngle: 200 });
    const frame = sketchNoteFrame(body, "revolve", ring, { startAngle: 30, sweepAngle: 200 });
    for (const spot of [{ x: -8, z: 4 }, { x: 6, z: 12 }]) {
      const back = sketchNoteSpot(sketchNoteAnchor(spot, frame), frame);
      expect(back.x).toBeCloseTo(spot.x, 6);
      expect(back.z).toBeCloseTo(spot.z, 6);
      expect(back.offPlane).toBeUndefined();
    }
    // Turned round the axis in 3D, the note keeps its angle.
    const turned = sketchNoteSpot(sketchNoteAnchor({ x: -8, z: 4, offPlane: 60 }, frame), frame);
    expect(turned.x).toBeCloseTo(-8, 6);
    expect(turned.offPlane).toBeCloseTo(60, 6);
  });
});

describe("the design's notes when the sketch is finished", () => {
  const body = extruded();
  const frame = sketchNoteFrame(body, "extrude", square);
  const pin = (id: string, shapeId: string): WorkplaneNote => ({ id, text: id, x: 0, y: 0, z: 0, anchor: { shapeId, normalized: [0, 0.5, 0] } });
  const notes: WorkplaneNote[] = [
    pin("n1", "other"),
    pin("n2", "body"),
    { id: "p1", text: "", x: 1, y: 2, z: 3, kind: "point" },
    pin("n3", "body"),
    { id: "n4", text: "free", x: 5, y: 0, z: 5 },
  ];

  it("shows the body's notes in the sketch", () => {
    expect(sketchNotesFromBody(notes, body, frame).map((note) => note.id)).toEqual(["n2", "n3"]);
  });

  it("puts the sketch's notes in place of the body's, the new ones last", () => {
    const sketchNotes: SketchNote[] = [
      { id: "n3", text: "kept", x: 40, z: 25, collapsed: true },
      { id: "n9", text: "new", x: 10, z: 10 },
    ];
    const next = notesWithSketchNotes(notes, "body", body, sketchNotes, frame);
    expect(next.map((note) => note.id)).toEqual(["n1", "p1", "n3", "n4", "n9"]);
    const kept = next.find((note) => note.id === "n3")!;
    expect(kept).toMatchObject({ text: "kept", collapsed: true, anchor: { shapeId: "body", normalized: [0.25, 0.5, 0.25] } });
    near(kept, { x: 40, y: 10, z: -15 });
    // Numbered as the 3D view counts them: n2 is gone, the point does not count.
    expect([...sketchNoteNumbers(notes, "body", sketchNotes)]).toEqual([["n3", 2], ["n9", 4]]);
  });

  it("leaves the others alone for a new sketch body", () => {
    const next = notesWithSketchNotes(notes, null, body, [{ id: "n9", text: "new", x: 10, z: 10 }], frame);
    expect(next.map((note) => note.id)).toEqual(["n1", "n2", "p1", "n3", "n4", "n9"]);
  });
});
