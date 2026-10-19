import { describe, expect, it } from "vitest";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { meshForShape } from "@/lib/editorMeshCore";
import { mcpShapeSummary } from "@/lib/editorMcpSummary";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import { makeShapeFromAsset, sceneShape, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import { normalizeVaseSettings, parseVaseSettingsInput, vaseSettingsChanges } from "@/lib/vaseSettings";
import { fittedVaseMesh, vaseNaturalFrame, vaseShapePatch } from "@/lib/vaseShape";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape, workplaneShapesEqual } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

const asset = toolbarShapeAssets.find((entry) => entry.kind === "vase");

function vase(settings: Record<string, unknown> = {}, frame: Partial<WorkplaneShape> = {}): WorkplaneShape {
  if (!asset) throw new Error("no vase in the catalogue");
  const shape = makeShapeFromAsset(asset, { x: 10, z: -20 });
  return canonicalizeShape({ ...shape, ...frame, vase: normalizeVaseSettings({ ...shape.vase, quality: "entwurf", ...settings }) });
}

function soupOf(shape: WorkplaneShape) {
  const mesh = meshForShape(shape);
  return mesh.faces.flatMap((face) => face.flatMap((index) => mesh.vertices[index]));
}

function bounds(soup: number[]) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < soup.length; i += 3) {
    box.minX = Math.min(box.minX, soup[i]); box.maxX = Math.max(box.maxX, soup[i]);
    box.minY = Math.min(box.minY, soup[i + 1]); box.maxY = Math.max(box.maxY, soup[i + 1]);
    box.minZ = Math.min(box.minZ, soup[i + 2]); box.maxZ = Math.max(box.maxZ, soup[i + 2]);
  }
  return box;
}

function volume(soup: number[]) {
  let v = 0;
  for (let i = 0; i < soup.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = soup.slice(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

describe("the vase as a shape", () => {
  it("comes from the catalogue as the vase tool's bottle, 90 by 180 mm, standing where it was put", () => {
    expect(asset).toBeDefined();
    const shape = vase();
    expect(shape.kind).toBe("vase");
    expect(shape.vase?.profile).toBe("flasche");
    expect([shape.width, shape.depth, shape.height]).toEqual([90, 90, 180]);
    const soup = soupOf(shape);
    const box = bounds(soup);
    expect(box.maxX - box.minX).toBeCloseTo(90, 3);
    expect(box.maxZ - box.minZ).toBeCloseTo(90, 3);
    expect(box.maxY - box.minY).toBeCloseTo(180, 3);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(10, 3);
    expect((box.minZ + box.maxZ) / 2).toBeCloseTo(-20, 3);
    expect(box.minY).toBeCloseTo(0, 6);
    const analysis = analyzeTriangleSoup(soup);
    expect(analysis.boundaryEdges).toBe(0);
    expect(analysis.nonManifoldEdges).toBe(0);
    // Facing out: the enclosed volume is positive.
    expect(volume(soup)).toBeGreaterThan(0);
  });

  it("fills its frame: a smaller frame makes a smaller vase", () => {
    const shape = vase({}, { width: 60, depth: 60, size: 60, height: 120 });
    const box = bounds(soupOf(shape));
    expect(box.maxX - box.minX).toBeCloseTo(60, 3);
    expect(box.maxY - box.minY).toBeCloseTo(120, 3);
  });

  it("builds a closed body with every pattern, solid or hollow", () => {
    for (const effect of ["keine", "rillen", "streifen", "voronoi", "lowpoly"]) {
      for (const body of ["voll", "hohl"]) {
        const soup = soupOf(vase({ effect, body }, { width: 50, depth: 50, size: 50, height: 80 }));
        const analysis = analyzeTriangleSoup(soup);
        expect(analysis.boundaryEdges, `${effect} ${body}`).toBe(0);
        expect(analysis.nonManifoldEdges, `${effect} ${body}`).toBe(0);
      }
    }
  });

  it("is solid for the slicer's vase mode, or hollow with a wall", () => {
    const solid = volume(soupOf(vase({ effect: "keine", body: "voll" })));
    const hollow = volume(soupOf(vase({ effect: "keine", body: "hohl", wall: 2, bottom: 2 })));
    expect(hollow).toBeGreaterThan(0);
    // A 2 mm wall round a 90 mm bottle is a small share of the solid body.
    expect(hollow / solid).toBeLessThan(0.25);
  });

  it("keeps a polygon's proportions: the frame follows the outline", () => {
    const shape = vase({ section: "vieleck", polySides: 6, polyRound: 0, effect: "keine" });
    const frame = vaseNaturalFrame(shape.vase, shape.width, shape.depth, shape.height);
    expect(Math.max(frame.width, frame.depth)).toBeCloseTo(90, 6);
    // A hexagon is narrower across its flats than across its corners.
    expect(Math.min(frame.width, frame.depth) / 90).toBeCloseTo(Math.cos(Math.PI / 6), 2);
    const patch = vaseShapePatch(shape, shape.vase!);
    const fitted = canonicalizeShape({ ...shape, ...patch });
    const box = bounds(soupOf(fitted));
    expect(box.maxX - box.minX).toBeCloseTo(patch.width, 3);
    expect(box.maxZ - box.minZ).toBeCloseTo(patch.depth, 3);
  });

  it("builds a vase once for drawing, bounds and export", () => {
    const shape = vase({ effect: "rillen" });
    expect(fittedVaseMesh(shape)).toBe(fittedVaseMesh({ ...shape }));
  });

  it("counts a change of its settings as a change of the shape, and keeps them on copy", () => {
    const shape = vase();
    expect(workplaneShapesEqual(shape, { ...shape, vase: normalizeVaseSettings({ ...shape.vase, twist: 45 }) })).toBe(false);
    expect(workplaneShapesEqual(shape, { ...shape, vase: normalizeVaseSettings({ ...shape.vase }) })).toBe(true);
    expect(sceneShape(shape).vase).toEqual(shape.vase);
  });

  it("tells an assistant what makes it this vase, and takes that back", () => {
    const shape = vase({ profile: "bauchig", section: "welle", sectionWaves: 12 });
    const reported = mcpShapeSummary(shape).settings?.vase;
    expect(typeof reported).toBe("string");
    const changes = parseVaseSettingsInput(reported);
    expect(changes).toEqual(vaseSettingsChanges(shape.vase));
    expect(changes).toMatchObject({ profile: "bauchig", section: "welle", sectionWaves: 12 });
    expect(changes).not.toHaveProperty("height");
    expect(parseVaseSettingsInput("not json")).toBeUndefined();
    expect(parseVaseSettingsInput([1, 2])).toBeUndefined();
  });

  it("keeps its settings through saving and opening the project", async () => {
    const shape = vase({ profile: "fass", twist: 30, body: "hohl", wall: 2.4 });
    const exported = await exportLylProject({
      projectId: "project-vase",
      projectName: "Vase",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [shape],
      history: [editorHistoryEntry([shape], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = (await importLylProject(exported)).shapes[0];
    expect(restored.kind).toBe("vase");
    expect(restored.vase).toEqual(shape.vase);
    expect(workplaneShapesEqual(restored, shape)).toBe(true);
  });
});
