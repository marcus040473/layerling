// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { importedShapeFromSvgWithReport } from "@/lib/svgImport";

beforeAll(async () => {
  const runtime = await manifoldModule();
  runtime.setup();
  rememberManifoldRuntime(runtime);
});

describe("a stencil sheet with many fine holes (#626)", () => {
  // One path, even-odd, 13 holes: the closing of touching corners left edges of four triangles on it, and the import said
  // "no filled contours". It now builds without the closing when the closing is not clean.
  const svg = readFileSync("tests/fixtures/stencil-many-holes.svg", "utf8");

  it("imports as a solid with every hole", () => {
    const report = importedShapeFromSvgWithReport("stencil.svg", svg);
    expect(report.skippedShapes).toBe(0);
    expect(report.shape.width).toBeGreaterThan(200);
    expect(report.shape.depth).toBeGreaterThan(70);
  });
});
