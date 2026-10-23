import { describe, expect, it } from "vitest";
import { SHAPE_COLORS_BOOT_SCRIPT, SHAPE_COLORS_STORAGE_KEY, normalizeShapeColors } from "@/lib/shapeColors";

describe("the colour of the library pictures (#717)", () => {
  it("is on unless the browser stored off", () => {
    expect(normalizeShapeColors(null)).toBe(true);
    expect(normalizeShapeColors("on")).toBe(true);
    expect(normalizeShapeColors("anything")).toBe(true);
    expect(normalizeShapeColors("off")).toBe(false);
  });

  it("sets the attribute in the head only for off", () => {
    const run = (stored: string | null) => {
      const dataset: Record<string, string> = {};
      new Function("localStorage", "document", SHAPE_COLORS_BOOT_SCRIPT)(
        { getItem: (key: string) => (key === SHAPE_COLORS_STORAGE_KEY ? stored : null) },
        { documentElement: { dataset } },
      );
      return dataset.shapeColors;
    };
    expect(run("off")).toBe("off");
    expect(run(null)).toBeUndefined();
    expect(run("on")).toBeUndefined();
  });
});
