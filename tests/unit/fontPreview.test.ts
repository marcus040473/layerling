import { beforeAll, describe, expect, it } from "vitest";
import { fontPreview } from "@/lib/fontPreview";
import { loadTextFonts } from "@/lib/textFonts";

// The font list draws every font in its own letters.
describe("the preview of a font", () => {
  beforeAll(async () => {
    await loadTextFonts();
  });

  it("is an outline with a width and room above and below the baseline", () => {
    const preview = fontPreview("Sans", "Max Müller", 24);
    expect(preview).not.toBeNull();
    expect(preview!.d.startsWith("M")).toBe(true);
    expect(preview!.width).toBeGreaterThan(40);
    expect(preview!.ascent).toBeGreaterThan(10);
    expect(preview!.descent).toBeGreaterThanOrEqual(0);
  });

  it("differs from one font to the next", () => {
    expect(fontPreview("Serif", "Max Müller")!.d).not.toBe(fontPreview("Sans", "Max Müller")!.d);
  });

  it("has nothing to draw for an empty text", () => {
    expect(fontPreview("Sans", "   ")).toBeNull();
  });

  it("does not fetch the Japanese face for a list entry", () => {
    expect(fontPreview("Japanese", "Max Müller")).toBeNull();
  });

  it("keeps only the start of a long text", () => {
    const long = fontPreview("Sans", "W".repeat(200))!;
    const short = fontPreview("Sans", "W".repeat(28))!;
    expect(long.width).toBeCloseTo(short.width, 1);
  });
});
