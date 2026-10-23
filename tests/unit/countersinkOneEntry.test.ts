import { describe, expect, it } from "vitest";
import { libraryShapeAssets, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { SHAPE_KEYWORDS } from "@/lib/commandKeywords";

describe("countersink and double countersink in one library entry (#621)", () => {
  it("lists only the countersink, and keeps the double kind in the catalogue", () => {
    expect(libraryShapeAssets.some((asset) => asset.kind === "countersink")).toBe(true);
    expect(libraryShapeAssets.some((asset) => asset.kind === "doubleCountersink")).toBe(false);
    expect(toolbarShapeAssets.some((asset) => asset.kind === "doubleCountersink")).toBe(true);
  });

  it("finds the countersink by the old name of the double one", () => {
    expect(SHAPE_KEYWORDS.countersink).toContain("double countersink");
    expect(SHAPE_KEYWORDS.countersink).toContain("doppelsenkung");
  });
});
