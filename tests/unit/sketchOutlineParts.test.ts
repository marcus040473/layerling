import { describe, expect, it } from "vitest";
import { sketchOutlineParts } from "@/lib/sketchOutlineParts";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/layerling";

/** A closed square outline, its points and lines named after `name`. */
function square(name: string, x: number, z: number, size: number) {
  const corners = [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];
  const points: SketchPoint[] = corners.map(([px, pz], index) => ({ id: `${name}p${index}`, x: px, z: pz }));
  const segments: SketchSegment[] = points.map((point, index) => ({ id: `${name}s${index}`, startId: point.id, endId: points[(index + 1) % 4].id, kind: "line" }));
  return { points, segments };
}

function profileOf(...outlines: Array<{ points: SketchPoint[]; segments: SketchSegment[] }>): SketchProfile {
  return { points: outlines.flatMap((outline) => outline.points), segments: outlines.flatMap((outline) => outline.segments) };
}

const ids = (part: SketchProfile) => part.segments.map((segment) => segment.id).sort();

describe("a sketch taken apart by its outlines (#669)", () => {
  it("gives one part per outline, overlapping ones too, largest first", () => {
    const parts = sketchOutlineParts(profileOf(square("base", 0, 0, 150), square("a", 140, 20, 30)));
    expect(parts).toHaveLength(2);
    expect(ids(parts[0])).toEqual(["bases0", "bases1", "bases2", "bases3"]);
    expect(ids(parts[1])).toEqual(["as0", "as1", "as2", "as3"]);
  });

  it("keeps a hole with the outline it lies in", () => {
    const parts = sketchOutlineParts(profileOf(square("base", 0, 0, 100), square("hole", 10, 10, 20), square("far", 200, 0, 30)));
    expect(parts).toHaveLength(2);
    expect(ids(parts[0])).toHaveLength(8);
    expect(ids(parts[0])).toContain("holes0");
    expect(ids(parts[1])).toEqual(["fars0", "fars1", "fars2", "fars3"]);
  });

  it("gives every part the construction lines, and the pictures to the first only", () => {
    const guide: SketchSegment = { id: "guide", startId: "g0", endId: "g1", construction: true };
    const profile: SketchProfile = {
      ...profileOf(square("a", 0, 0, 50), square("b", 100, 0, 20)),
      images: [{ id: "picture" } as NonNullable<SketchProfile["images"]>[number]],
    };
    profile.points.push({ id: "g0", x: -10, z: 25 }, { id: "g1", x: 200, z: 25 });
    profile.segments.push(guide);
    const parts = sketchOutlineParts(profile);
    expect(parts.map((part) => part.segments.some((segment) => segment.id === "guide"))).toEqual([true, true]);
    expect(parts[1].points.map((point) => point.id)).toContain("g0");
    expect(parts[0].images).toHaveLength(1);
    expect(parts[1].images).toBeUndefined();
  });

  it("leaves a single outline and a sketch built as a line alone", () => {
    expect(sketchOutlineParts(profileOf(square("a", 0, 0, 50)))).toEqual([]);
    const stroked = { ...profileOf(square("a", 0, 0, 50), square("b", 100, 0, 20)), stroke: { width: 2 } as SketchProfile["stroke"] };
    expect(sketchOutlineParts(stroked)).toEqual([]);
  });
});
