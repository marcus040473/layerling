// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { importModelFiles } from "@/lib/modelImport";
import { MAX_SVG_COLOUR_PARTS, importedColourShapesFromSvg, importedShapeFromSvgWithReport } from "@/lib/svgImport";

// #818: an SVG of several colours comes in as one body per colour, each in its colour and in its place.
const drawing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60">
  <g fill="#ff0000"><rect x="0" y="0" width="20" height="10"/><rect x="0" y="40" width="20" height="10"/></g>
  <g fill="#0000ff"><rect x="60" y="20" width="30" height="30"/></g>
</svg>`;

describe("an SVG of several colours (#818)", () => {
  it("gives one body per colour, in its colour, where it lies in the drawing", () => {
    const whole = importedShapeFromSvgWithReport("logo.svg", drawing);
    const colours = importedColourShapesFromSvg("logo.svg", drawing, whole);
    expect(colours?.parts.map((part) => part.shape.color)).toEqual(["#ff0000", "#0000ff"]);
    const [red, blue] = colours!.parts.map((part) => part.shape);
    // The red pair spans x 0..20 and y 0..50, the blue square x 60..90 and y 20..50; the whole drawing x 0..90, y 0..50.
    expect(red.width).toBeCloseTo(20, 3);
    expect(red.depth).toBeCloseTo(50, 3);
    expect(blue.width).toBeCloseTo(30, 3);
    expect(red.x - whole.shape.x).toBeCloseTo(10 - 45, 3);
    expect(blue.x - whole.shape.x).toBeCloseTo(75 - 45, 3);
    expect(red.z - whole.shape.z).toBeCloseTo(25 - 25, 3);
    expect(blue.z - whole.shape.z).toBeCloseTo(35 - 25, 3);
    expect(red.name).toBe("logo #ff0000");
  });

  it("keeps a drawing of one colour as one body", () => {
    const single = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect width="10" height="10" fill="red"/><rect x="20" width="10" height="10" fill="#f00"/></svg>`;
    expect(importedColourShapesFromSvg("one.svg", single, importedShapeFromSvgWithReport("one.svg", single))).toBeNull();
  });

  it("keeps a drawing of very many colours as one body, as a traced picture has", () => {
    const shades = Array.from({ length: MAX_SVG_COLOUR_PARTS + 1 }, (_, index) =>
      `<rect x="${index * 12}" width="10" height="10" fill="#${(index * 16).toString(16).padStart(2, "0")}0000"/>`).join("");
    const many = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20">${shades}</svg>`;
    expect(importedColourShapesFromSvg("many.svg", many, importedShapeFromSvgWithReport("many.svg", many))).toBeNull();
  });

  it("imports each colour as a body of its own that needs no file", async () => {
    const result = (await importModelFiles([new File([drawing], "logo.svg", { type: "image/svg+xml" })]))!;
    expect(result.failures).toEqual([]);
    expect(result.shapes.map((shape) => shape.color)).toEqual(["#ff0000", "#0000ff"]);
    expect(result.assets).toEqual([]);
    expect(result.shapes.every((shape) => shape.importedMesh?.sourceFormat === "json" && shape.mirrorZ)).toBe(true);
  });
});
