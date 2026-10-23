import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// The exact kernel (Manifold) loads its files relative to the page; in node they are the public folder.
(globalThis as unknown as { window: unknown }).window = { location: { href: pathToFileURL(resolve("apps/web/public") + "/").href } };
import { JSDOM } from "jsdom";
(globalThis as unknown as { DOMParser: unknown }).DOMParser = new JSDOM("").window.DOMParser;
import { buildGroupedShapeFromSelection, shapeToManifoldSolid } from "@/lib/editorBooleans";
import { getManifoldRuntime } from "@/lib/editorMeshCore";
import { importedShapeFromSvgWithReport } from "@/lib/svgImport";
import type { WorkplaneShape } from "@/types/layerling";

/** Stroke-only outlines, like a ball drawn as a panel outline with panels inside: two panels share an edge. */
const PANELS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${[
  "M10,10 H190 V90 H10 Z",
  "M30,30 H80 V70 H30 Z",
  "M80,30 H130 V70 H80 Z",
].map((d) => `<path d="${d}" style="fill:none;stroke:#000;stroke-width:0.5px"/>`).join("")}</svg>`;

describe("an SVG made by the kernel stays a clean solid (#420)", () => {
  it("builds a drawing whose panels touch, which the plain build cannot", async () => {
    // Before the kernel is loaded the plain build is used, and it leaves such a drawing out.
    expect(() => importedShapeFromSvgWithReport("panels.svg", PANELS)).toThrow();
    const runtime = await getManifoldRuntime();
    const imported = importedShapeFromSvgWithReport("panels.svg", PANELS);
    expect(imported.skippedShapes).toBe(0);
    const solid = shapeToManifoldSolid(runtime, imported.shape, []);
    expect(solid?.status()).toBe("NoError");
    expect(solid?.volume()).toBeGreaterThan(0);
    solid?.delete();
  });

  it("can be a hole in a plate", async () => {
    await getManifoldRuntime();
    const hole = { ...importedShapeFromSvgWithReport("panels.svg", PANELS).shape, id: "hole", hole: true };
    const plate = { id: "plate", name: "plate", kind: "box", color: "#d97813", x: hole.x, z: hole.z, elevation: 0, size: 200, width: 200, depth: 120, height: 4, rotation: 0 } as unknown as WorkplaneShape;
    const result = await buildGroupedShapeFromSelection([plate, hole as WorkplaneShape], 250_000);
    expect(result.group).not.toBeNull();
  });
  // The picture lost whole outlines because the rounded body had points a hair apart, which the check merged into edges of four triangles.
  for (const [file, area] of [["traced-picture-584.svg", 42_860], ["traced-picture-584b.svg", 39_350]] as const) {
    it(`brings in a traced picture whole, where its outlines meet in many corners (#584, ${file})`, async () => {
      const runtime = await getManifoldRuntime();
      const source = readFileSync(resolve("tests/fixtures", file), "utf8");
      const imported = importedShapeFromSvgWithReport("picture.svg", source);
      expect(imported.skippedShapes).toBe(0);
      const solid = shapeToManifoldSolid(runtime, imported.shape, []);
      expect(solid?.status()).toBe("NoError");
      // The area of the drawing filled even-odd, with a little for the rounding at the corners; the body is 4 mm thick.
      expect(solid?.volume()).toBeGreaterThan(4 * area * 0.98);
      expect(solid?.volume()).toBeLessThan(4 * area * 1.06);
      solid?.delete();
    });
  }
});
