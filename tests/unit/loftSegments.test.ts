import { describe, expect, it } from "vitest";
import { createLoftGeometry, loftFrameSize, loftStoredMeasures, normalizeLoftMeasures } from "@/lib/loftGeometry";
import type { WorkplaneShape } from "@/types/layerling";

// #755: the circles of a loft were drawn with a fixed 96 pieces; the number is a setting now.
function loft(extra: Partial<WorkplaneShape> = {}): WorkplaneShape {
  const base = {
    id: "round-loft", name: "loft", kind: "loft", x: 0, z: 0, elevation: 0, size: 76, height: 150, rotation: 0, color: "#c0703a",
    loftBottomOutline: "round", loftTopOutline: "round", loftBottomWidth: 76, loftBottomDepth: 76, loftTopWidth: 30, loftTopDepth: 30,
    loftBottomCorner: 0, loftTopCorner: 0, loftOffsetX: 0, loftOffsetZ: 0, loftWall: 3,
    ...extra,
  } as WorkplaneShape;
  const frame = loftFrameSize(loftStoredMeasures(base));
  return { ...base, width: frame.width, depth: frame.depth };
}

const triangles = (shape: WorkplaneShape) => createLoftGeometry(shape).getAttribute("position").count / 3;

describe("the segments of a loft's circles", () => {
  it("keeps 96 pieces when nothing is set", () => {
    expect(normalizeLoftMeasures({}).segments).toBe(96);
    expect(triangles(loft())).toBe(triangles(loft({ loftSegments: 96 })));
  });

  it("draws a finer circle with more segments", () => {
    expect(triangles(loft({ loftSegments: 240 }))).toBeGreaterThan(triangles(loft()) * 2);
    expect(triangles(loft({ loftSegments: 32 }))).toBeLessThan(triangles(loft()) / 2);
  });

  it("keeps the number in its range", () => {
    expect(normalizeLoftMeasures({ segments: 5 }).segments).toBe(16);
    expect(normalizeLoftMeasures({ segments: 5000 }).segments).toBe(360);
  });
});
