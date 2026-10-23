import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraTurn, cameraTurnOffset, prefersReducedMotion, turnEase, VIEW_CUBE_TURN_MS } from "@/lib/viewCubeTransition";

const X = new THREE.Vector3(1, 0, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const TOP = new THREE.Vector3(0, 1, 0);

describe("a turn of the camera from the view cube", () => {
  it("starts exactly where the camera stands and ends exactly on the clicked side", () => {
    const turn = cameraTurn(new THREE.Vector3(7, 9, 11), FRONT.clone().multiplyScalar(new THREE.Vector3(7, 9, 11).length()), 1000);
    const start = cameraTurnOffset(turn, 1000);
    const end = cameraTurnOffset(turn, 1000 + VIEW_CUBE_TURN_MS);
    expect(start.offset.distanceTo(new THREE.Vector3(7, 9, 11))).toBeLessThan(1e-9);
    expect(start.done).toBe(false);
    expect(end.done).toBe(true);
    expect(end.offset.clone().normalize().distanceTo(FRONT)).toBeLessThan(1e-9);
  });

  it("keeps the distance to the pivot, also halfway", () => {
    const turn = cameraTurn(new THREE.Vector3(20, 20, 20), TOP.clone().multiplyScalar(34.641), 0);
    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      const { offset } = cameraTurnOffset(turn, at * VIEW_CUBE_TURN_MS);
      expect(offset.length()).toBeCloseTo(Math.hypot(20, 20, 20), 6);
    }
  });

  it("takes the shorter way round, not the long one", () => {
    const from = new THREE.Vector3(Math.sin(3), 0, Math.cos(3)).multiplyScalar(10);
    const to = new THREE.Vector3(Math.sin(-3), 0, Math.cos(-3)).multiplyScalar(10);
    const turn = cameraTurn(from, to, 0);
    expect(turn.to.theta - turn.from.theta).toBeCloseTo(Math.PI * 2 - 6, 6);
    expect(turn.to.theta - turn.from.theta).toBeLessThan(Math.PI);
    expect(cameraTurnOffset(turn, VIEW_CUBE_TURN_MS).offset.length()).toBeCloseTo(10, 6);
  });

  it("goes round the side between opposite faces, never through the pivot", () => {
    const turn = cameraTurn(FRONT.clone().multiplyScalar(10), new THREE.Vector3(0, 0, -10), 0);
    // Half the way after easing, not half the time: the turn eases out.
    const middle = cameraTurnOffset(turn, VIEW_CUBE_TURN_MS * (1 - Math.cbrt(0.5))).offset;
    expect(middle.length()).toBeCloseTo(10, 6);
    expect(Math.abs(middle.y)).toBeLessThan(1e-9);
    expect(middle.x).toBeGreaterThan(9);
  });

  it("keeps a hair off the pole, where the view has no defined up", () => {
    const turn = cameraTurn(X.clone().multiplyScalar(10), TOP.clone().multiplyScalar(10), 0);
    const end = cameraTurnOffset(turn, VIEW_CUBE_TURN_MS).offset;
    expect(end.length()).toBeCloseTo(10, 6);
    expect(end.y).toBeGreaterThan(9.9999);
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(0);
  });

  it("eases out and never overshoots", () => {
    expect(turnEase(0)).toBe(0);
    expect(turnEase(0.5)).toBeCloseTo(0.875, 9);
    expect(turnEase(1)).toBe(1);
    let previous = 0;
    for (let step = 0; step <= 20; step += 1) {
      const value = turnEase(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  describe("reduced motion", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("is asked for by the system setting", () => {
      vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }) });
      expect(prefersReducedMotion()).toBe(true);
      vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
      expect(prefersReducedMotion()).toBe(false);
    });

    it("is off where there is no window to ask", () => {
      vi.stubGlobal("window", undefined);
      expect(prefersReducedMotion()).toBe(false);
    });
  });
});
