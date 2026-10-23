import { describe, expect, it } from "vitest";
import { dragReach } from "@/lib/dragReach";

const plate = { width: 200, depth: 160 };

describe("dragReach", () => {
  it("reaches one plate width past the plate edge on an empty or small design (#80)", () => {
    expect(dragReach(plate, [])).toEqual({ x: 300, z: 240 });
    expect(dragReach(plate, [{ minX: -20, maxX: 40, minZ: -10, maxZ: 10 }])).toEqual({ x: 300, z: 240 });
  });

  it("reaches one plate width past a design that is bigger than the plate (#673)", () => {
    // A 400 mm box beside a 350 mm tube: the far side is at x = 320, so the old limit of 300 stopped it.
    const reach = dragReach(plate, [
      { minX: -175, maxX: 175, minZ: -80, maxZ: 80 },
      { minX: -80, maxX: 320, minZ: -150, maxZ: 150 },
    ]);
    expect(reach).toEqual({ x: 520, z: 310 });
  });

  it("counts a shape on the negative side as far as one on the positive side", () => {
    expect(dragReach(plate, [{ minX: -450, maxX: -250, minZ: 0, maxZ: 0 }]).x).toBe(650);
  });
});
