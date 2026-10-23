import { describe, expect, it } from "vitest";
import { libraryShapeAssets } from "@/lib/shapeCatalog";
import { SIMPLE_MODE_SHAPES, resolveSimpleMode, simpleModeFromParameter, simpleModeKeepsShape, simpleModeKeepsTool } from "@/lib/simpleMode";

describe("the simple mode (#695)", () => {
  it("is on when chosen, off when chosen off, and follows the server when nothing is chosen", () => {
    expect(resolveSimpleMode("on", null)).toBe(true);
    expect(resolveSimpleMode("off", null)).toBe(false);
    expect(resolveSimpleMode(null, null)).toBe(false);
    expect(resolveSimpleMode(null, "on")).toBe(true);
    expect(resolveSimpleMode("off", "on")).toBe(false);
  });

  it("cannot be switched off where the server fixes it", () => {
    expect(resolveSimpleMode("off", "always")).toBe(true);
    expect(resolveSimpleMode(null, "always")).toBe(true);
  });

  it("reads the mode parameter of a link", () => {
    expect(simpleModeFromParameter("simple")).toBe("on");
    expect(simpleModeFromParameter(" FULL ")).toBe("off");
    expect(simpleModeFromParameter("kids")).toBe(null);
    expect(simpleModeFromParameter(null)).toBe(null);
  });

  it("keeps the tools of the workshop and drops the advanced ones", () => {
    for (const id of ["copy", "paste", "duplicate", "delete", "undo", "redo", "group", "ungroup", "mirror", "chamfer", "fillet", "hollow", "align"]) {
      expect(simpleModeKeepsTool(id)).toBe(true);
    }
    for (const id of ["split", "array", "holePattern", "history", "simplify", "intersect", "mateFaces", "faceTool"]) {
      expect(simpleModeKeepsTool(id)).toBe(false);
    }
  });

  it("names only shapes the library has", () => {
    const ids = new Set(libraryShapeAssets.map((asset) => asset.id));
    for (const id of SIMPLE_MODE_SHAPES) expect(ids.has(id), id).toBe(true);
    expect(simpleModeKeepsShape("box")).toBe(true);
    expect(simpleModeKeepsShape("nameTag")).toBe(true);
    expect(simpleModeKeepsShape("gear")).toBe(false);
    expect(simpleModeKeepsShape("thread")).toBe(false);
  });
});
