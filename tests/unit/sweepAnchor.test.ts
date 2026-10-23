import { describe, expect, it } from "vitest";
import { sweepAnchorX } from "@/lib/cadSketchSweep";
import { sweepAnchorFromParams, sweepSketchProfile } from "@/lib/sweepSketch";
import { cloneSketchProfile } from "@/lib/sketchSmoothHandles";

let counter = 0;
const makeId = (prefix: string) => `${prefix}-${(counter += 1)}`;

describe("which part of a swept section runs along the path (#732)", () => {
  const bounds = { minX: -35, maxX: -25 };

  it("is the middle unless the sketch says left or right", () => {
    expect(sweepAnchorX(bounds, undefined)).toBe(-30);
    expect(sweepAnchorX(bounds, "center")).toBe(-30);
    expect(sweepAnchorX(bounds, "left")).toBe(-35);
    expect(sweepAnchorX(bounds, "right")).toBe(-25);
  });

  it("reads the anchor of the MCP call, the middle when it is left out, and names a wrong word", () => {
    expect(sweepAnchorFromParams(undefined)).toBe("center");
    expect(sweepAnchorFromParams("left")).toBe("left");
    expect(sweepAnchorFromParams("right")).toBe("right");
    expect(() => sweepAnchorFromParams("top")).toThrow(/left, center or right/);
  });

  it("puts a non-default anchor on the sketch an MCP call builds, and nothing for the middle", () => {
    const request = { path: [{ x: 0, z: 0 }, { x: 40, z: 0 }], section: { kind: "rectangle" as const, width: 10, height: 6 } };
    expect(sweepSketchProfile({ ...request, anchor: "left" }, makeId).sweepAnchor).toBe("left");
    expect(sweepSketchProfile({ ...request, anchor: "center" }, makeId)).not.toHaveProperty("sweepAnchor");
    expect(sweepSketchProfile(request, makeId)).not.toHaveProperty("sweepAnchor");
  });

  it("survives a copy of the sketch, and a middle anchor is not carried", () => {
    const profile = { points: [], segments: [], images: [], sweepAnchor: "right" as const };
    expect(cloneSketchProfile(profile).sweepAnchor).toBe("right");
    expect(cloneSketchProfile({ ...profile, sweepAnchor: "center" })).not.toHaveProperty("sweepAnchor");
  });
});
