import { describe, expect, it } from "vitest";
import { createParaboloidGeometry } from "@/lib/roundBodyGeometry";

function vertices(geometry: ReturnType<typeof createParaboloidGeometry>) {
  const position = geometry.getAttribute("position");
  return Array.from({ length: position.count }, (_, index) => ({ x: position.getX(index), y: position.getY(index), z: position.getZ(index) }));
}

describe("paraboloid geometry (#922)", () => {
  it("stands on y = 0, comes to a tip at the height and fills the footprint", () => {
    const points = vertices(createParaboloidGeometry(30, 20, 18, 32));
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 6);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(20, 6);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(15, 3);
    expect(Math.max(...points.map((p) => p.z))).toBeCloseTo(9, 3);
  });

  it("falls with the square of the distance from the axis", () => {
    for (const { x, y, z } of vertices(createParaboloidGeometry(30, 20, 18, 32))) {
      if (y < 1e-9) continue;
      const rho = Math.hypot(x / 15, z / 9);
      expect(y).toBeCloseTo(20 * (1 - rho * rho), 4);
    }
  });

  it("is closed: the bottom cap fills the whole base", () => {
    const geometry = createParaboloidGeometry(24, 22, 24, 16);
    const position = geometry.getAttribute("position");
    let baseArea = 0;
    for (let index = 0; index < position.count; index += 3) {
      const ys = [0, 1, 2].map((offset) => position.getY(index + offset));
      if (ys.some((y) => y > 1e-9)) continue;
      const [ax, az, bx, bz, cx, cz] = [0, 1, 2].flatMap((offset) => [position.getX(index + offset), position.getZ(index + offset)]);
      baseArea += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
    }
    // a 32-gon of radius 12 is just under the circle
    expect(baseArea).toBeGreaterThan(Math.PI * 144 * 0.99);
    expect(baseArea).toBeLessThanOrEqual(Math.PI * 144);
  });
});
