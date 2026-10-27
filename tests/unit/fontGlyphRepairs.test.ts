import { beforeAll, describe, expect, it } from "vitest";
import { loadTextFonts, textFont } from "@/lib/textFonts";

// The "f" of Rounded had a spur at the end of its crossbar that a DXF showed as a 0.1 mm triangle (#916).
describe("the repaired glyphs of the built-in typefaces", () => {
  beforeAll(async () => {
    await loadTextFonts();
  });

  it("gives the f of Rounded a crossbar end without a spur", () => {
    const glyph = (textFont("Rounded").data as { glyphs: Record<string, { o: string }> }).glyphs.f.o;
    expect(glyph).not.toContain("l 425 669");
    expect(glyph).toContain("q 425 665 372 659 l 425 641");
  });

  it("leaves the other typefaces' f alone", () => {
    const glyph = (textFont("Sans").data as { glyphs: Record<string, { o: string }> }).glyphs.f.o;
    expect(glyph).toBeTruthy();
    expect(glyph).not.toContain("q 425 665 372 659");
  });

  it("still builds the letter", () => {
    expect(textFont("Rounded").generateShapes("office", 20).length).toBeGreaterThan(3);
  });
});
