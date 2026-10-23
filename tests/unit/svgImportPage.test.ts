// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decodeSvgBytes, importedShapeFromSvgWithReport, svgPageOfDrawing } from "@/lib/svgImport";

/*
 * Keeping a drawing's place on its page (#258): the layers of one document, exported as separate
 * files that share a page, line up again when they are imported one after the other.
 */
const drawing = (header: string, x: number, y: number, width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${header}><path fill="#c00" d="M${x} ${y} H${x + width} V${y + height} H${x} Z"/></svg>`;

describe("the page of a drawing", () => {
  it("reads the viewBox", () => {
    expect(svgPageOfDrawing(drawing('viewBox="0 0 1541 735" width="100%" height="100%"', 0, 0, 10, 10))).toEqual({ x: 0, y: 0, width: 1541, height: 735 });
    expect(svgPageOfDrawing(drawing('viewBox="50, 20 100,60"', 0, 0, 10, 10))).toEqual({ x: 50, y: 20, width: 100, height: 60 });
  });

  it("falls back to a width and a height in pixels", () => {
    expect(svgPageOfDrawing(drawing('width="200" height="100"', 0, 0, 10, 10))).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(svgPageOfDrawing(drawing('width="200px" height="100.5px"', 0, 0, 10, 10))).toEqual({ x: 0, y: 0, width: 200, height: 100.5 });
  });

  it("states no page when the drawing does not", () => {
    expect(svgPageOfDrawing(drawing('width="100%" height="100%"', 0, 0, 10, 10))).toBeNull();
    expect(svgPageOfDrawing(drawing('width="210mm" height="297mm"', 0, 0, 10, 10))).toBeNull();
    expect(svgPageOfDrawing(drawing("", 0, 0, 10, 10))).toBeNull();
    expect(svgPageOfDrawing(drawing('viewBox="0 0 0 10"', 0, 0, 10, 10))).toBeNull();
    expect(svgPageOfDrawing("not a drawing")).toBeNull();
  });
});

describe("an imported drawing on its page", () => {
  const page = 'viewBox="0 0 200 100"';
  const left = drawing(page, 0, 0, 100, 100);
  const right = drawing(page, 100, 0, 100, 100);
  const top = drawing(page, 50, 0, 100, 50);

  it("is centred on itself unless asked otherwise", () => {
    for (const source of [left, right, top]) {
      const { shape, pageKept } = importedShapeFromSvgWithReport("a.svg", source);
      expect([shape.x, shape.z]).toEqual([10, -10]);
      expect(pageKept).toBeNull();
    }
  });

  it("keeps each file's place on the page when asked", () => {
    const place = (source: string) => {
      const { shape, pageKept } = importedShapeFromSvgWithReport("a.svg", source, { keepPagePosition: true });
      expect(pageKept).toBe(true);
      return [shape.x, shape.z].map((value) => Math.round(value * 1000) / 1000);
    };
    // The page's middle goes where a centred drawing's middle goes: (10, -10).
    expect(place(left)).toEqual([-40, -10]);
    expect(place(right)).toEqual([60, -10]);
    // A drawing at the top of the page lies towards the back (smaller z), as the page reads from above.
    expect(place(top)).toEqual([10, -35]);
  });

  it("puts two layers of one page in the same relation as on the page", () => {
    const a = importedShapeFromSvgWithReport("a.svg", left, { keepPagePosition: true }).shape;
    const b = importedShapeFromSvgWithReport("b.svg", right, { keepPagePosition: true }).shape;
    // Their middles lie 100 apart on the page, as the two halves of it.
    expect(b.x - a.x).toBeCloseTo(100, 6);
    expect(b.z - a.z).toBeCloseTo(0, 6);
  });

  it("measures from the viewBox's own corner", () => {
    const shifted = drawing('viewBox="100 40 200 100"', 100, 40, 100, 100);
    const { shape } = importedShapeFromSvgWithReport("a.svg", shifted, { keepPagePosition: true });
    expect([shape.x, shape.z].map((value) => Math.round(value * 1000) / 1000)).toEqual([-40, -10]);
  });

  it("says so when the drawing has no page, and centres it as usual", () => {
    const { shape, pageKept } = importedShapeFromSvgWithReport("a.svg", drawing('width="100%" height="100%"', 0, 0, 100, 100), { keepPagePosition: true });
    expect(pageKept).toBe(false);
    expect([shape.x, shape.z]).toEqual([10, -10]);
  });
});

describe("an SVG saved as UTF-16 (#317)", () => {
  const text = `<?xml version="1.0" encoding="UTF-16"?>
${drawing('width="20mm" height="10mm" viewBox="0 0 20 10"', 0, 0, 20, 10)}`;
  const le = (value: string) => {
    const bytes = new Uint8Array(2 + value.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < value.length; i += 1) new DataView(bytes.buffer).setUint16(2 + i * 2, value.charCodeAt(i), true);
    return bytes;
  };
  const be = (value: string) => {
    const bytes = new Uint8Array(2 + value.length * 2);
    bytes.set([0xfe, 0xff]);
    for (let i = 0; i < value.length; i += 1) new DataView(bytes.buffer).setUint16(2 + i * 2, value.charCodeAt(i), false);
    return bytes;
  };

  it("reads the text back from either byte order, and plain UTF-8 as before", () => {
    expect(decodeSvgBytes(le(text))).toBe(text);
    expect(decodeSvgBytes(be(text))).toBe(text);
    expect(decodeSvgBytes(new TextEncoder().encode(text))).toBe(text);
  });

  it("imports the decoded drawing", () => {
    const result = importedShapeFromSvgWithReport("corel.svg", decodeSvgBytes(le(text)), {});
    expect(result.shape.width).toBeCloseTo(20, 3);
  });
});
