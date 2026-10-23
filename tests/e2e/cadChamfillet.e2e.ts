import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { chamfilletSolid } from "@/lib/cadChamfillet";

// Layerling is Y-up; OCCT primitives are built along Z.
const ROTATE_Z_TO_Y: number[] = [
  1, 0, 0, 0,
  0, 0, 1, 0,
  0, -1, 0, 0,
];

describe("chamfilleting a solid with the real OCCT kernel", () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    kernel = await OcctKernel.init({ wasm });
  });

  function yUp(shape: ShapeHandle) {
    const turned = kernel.transform(shape, ROTATE_Z_TO_Y);
    kernel.release(shape);
    return turned;
  }

  // 40 x 20 x 30 (x, y = up, z), standing on y = 0.
  function box() {
    return yUp(kernel.makeBox(40, 30, 20));
  }

  function bottomEdgesOf(solid: ShapeHandle): { bottom: ShapeHandle[]; all: ShapeHandle[] } {
    const bounds = kernel.getBoundingBox(solid, false);
    const all = kernel.getSubShapes(solid, "edge");
    const bottom = all.filter((edge) => {
      const boxBounds = kernel.getBoundingBox(edge, false);
      return Math.abs(boxBounds.ymin - bounds.ymin) < 1e-3 && Math.abs(boxBounds.ymax - bounds.ymin) < 1e-3;
    });
    return { bottom, all };
  }

  it("chamfillets all four bottom edges of a box into a valid solid with a flat bed chamfer and curved upper blend", () => {
    const solid = box();
    const { bottom, all } = bottomEdgesOf(solid);
    expect(bottom).toHaveLength(4);

    const baseChamferOnly = kernel.chamfer(solid, bottom, 1);
    const result = chamfilletSolid(kernel, solid, bottom, 2, 45);

    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    const fullVolume = 40 * 20 * 30;
    const baseChamferVolume = kernel.getVolume(baseChamferOnly);
    const chamfilletVolume = kernel.getVolume(result);
    // Rounding the upper transition removes more material than the 0.5x base chamfer starter alone.
    expect(chamfilletVolume).toBeLessThan(baseChamferVolume);
    expect(chamfilletVolume).toBeGreaterThan(fullVolume - 2000);

    // The result must contain 4 clean cylindrical upper wall blends and zero pinched bspline corner patches.
    const faces = kernel.getSubShapes(result, "face");
    const surfaceTypes = faces.map((face) => kernel.surfaceType(face));
    expect(surfaceTypes.filter((type) => type === "cylinder")).toHaveLength(4);
    expect(surfaceTypes.filter((type) => type === "bspline")).toHaveLength(0);
    faces.forEach((face) => kernel.release(face));

    all.forEach((edge) => kernel.release(edge));
    kernel.release(baseChamferOnly);
    kernel.release(result);
    kernel.release(solid);
  });

  it("chamfillets a single bottom edge of a box without trying to fillet its side end-caps", () => {
    const solid = box();
    const { bottom, all } = bottomEdgesOf(solid);
    const result = chamfilletSolid(kernel, solid, [bottom[0]], 2, 45);

    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    const faces = kernel.getSubShapes(result, "face");
    const surfaceTypes = faces.map((face) => kernel.surfaceType(face));
    expect(surfaceTypes).toContain("cylinder");
    faces.forEach((face) => kernel.release(face));

    all.forEach((edge) => kernel.release(edge));
    kernel.release(result);
    kernel.release(solid);
  });

  it("chamfillets the bottom circular edge of a cylinder", () => {
    const cylinder = yUp(kernel.makeCylinder(12, 20));
    const { bottom, all } = bottomEdgesOf(cylinder);
    expect(bottom).toHaveLength(1);

    const result = chamfilletSolid(kernel, cylinder, bottom, 2, 45);
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    // A chamfilleted cylinder bottom has a conical base chamfer and a rounded upper transition (a torus or a spline).
    const faces = kernel.getSubShapes(result, "face");
    const surfaceTypes = faces.map((face) => kernel.surfaceType(face));
    expect(surfaceTypes).toContain("cone");
    expect(surfaceTypes.some((type) => type === "torus" || type === "bspline")).toBe(true);
    faces.forEach((face) => kernel.release(face));

    all.forEach((edge) => kernel.release(edge));
    kernel.release(result);
    kernel.release(cylinder);
  });

  it("supports custom base chamfer angles", () => {
    const solid = box();
    const { bottom, all } = bottomEdgesOf(solid);
    const result = chamfilletSolid(kernel, solid, bottom, 2, 35);

    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    all.forEach((edge) => kernel.release(edge));
    kernel.release(result);
    kernel.release(solid);
  });

  it("chamfillets the foot of a cylinder at the bottom and leaves its top rim alone (#570)", () => {
    const solid = yUp(kernel.makeCylinder(15, 30));
    const { bottom, all } = bottomEdgesOf(solid);
    expect(bottom).toHaveLength(1);
    const result = chamfilletSolid(kernel, solid, bottom, 4, 45);

    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    // The chamfer sits on the plate and the blend above it; nothing is rounded at the top, where the wall still meets
    // the lid at its full radius. The wall used to be taken for a new face, so the lid's rim was rounded as well.
    const faces = kernel.getSubShapes(result, "face");
    const parts = faces.map((face) => ({ type: kernel.surfaceType(face), box: kernel.getBoundingBox(face, false) }));
    const lid = parts.find((part) => part.type === "plane" && part.box.ymin > 29.99);
    expect(lid).toBeDefined();
    expect((lid!.box.xmax - lid!.box.xmin) / 2).toBeCloseTo(15, 3);
    const chamfer = parts.find((part) => part.type === "cone");
    expect(chamfer).toBeDefined();
    expect(chamfer!.box.ymax).toBeLessThan(2);
    expect(parts.filter((part) => part.box.ymin > 25 && part.type !== "plane")).toHaveLength(0);
    faces.forEach((face) => kernel.release(face));

    all.forEach((edge) => kernel.release(edge));
    kernel.release(result);
    kernel.release(solid);
  });
  it("chamfillets the foot of a cone with a pointed tip: chamfer on the plate, blend into the wall (forum, DrJones)", () => {
    // The tip is an edge of no length; the wall used to be taken for a new face because of it, so the edge between the
    // plate and the chamfer was rounded instead of the one between the chamfer and the wall.
    const cone = yUp(kernel.makeCone(10, 0, 20));
    const { bottom, all } = bottomEdgesOf(cone);
    expect(bottom).toHaveLength(1);
    const result = chamfilletSolid(kernel, cone, bottom, 2, 45);

    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.isSolid(result)).toBe(true);

    const faces = kernel.getSubShapes(result, "face");
    const parts = faces.map((face) => ({ type: kernel.surfaceType(face), box: kernel.getBoundingBox(face, false) }));
    // The blend runs on into the wall: it ends well above the small chamfer on the plate, at the wall's own radius.
    const blend = parts.find((part) => part.type === "torus" || part.type === "bspline");
    expect(blend).toBeDefined();
    expect(blend!.box.ymax).toBeGreaterThan(1.2);
    expect((blend!.box.xmax - blend!.box.xmin) / 2).toBeGreaterThan(9.2);
    const chamfer = parts.find((part) => part.type === "cone" && part.box.ymax < 0.5);
    expect(chamfer).toBeDefined();
    faces.forEach((face) => kernel.release(face));

    all.forEach((edge) => kernel.release(edge));
    kernel.release(result);
    kernel.release(cone);
  });
});
