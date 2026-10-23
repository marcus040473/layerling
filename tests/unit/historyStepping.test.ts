import { describe, expect, it } from "vitest";
import { historyKeyTarget, historyWheelSteps } from "@/lib/historyStepping";

describe("historyKeyTarget (#688)", () => {
  it("jumps ten states with Page Up and Page Down, held at both ends", () => {
    expect(historyKeyTarget("PageUp", 25, 40, 40)).toBe(15);
    expect(historyKeyTarget("PageDown", 25, 40, 40)).toBe(35);
    expect(historyKeyTarget("PageUp", 4, 40, 40)).toBe(0);
    expect(historyKeyTarget("PageDown", 36, 40, 40)).toBe(40);
  });

  it("goes to the oldest state with Home and to the state the design is at with End", () => {
    expect(historyKeyTarget("Home", 25, 40, 30)).toBe(0);
    expect(historyKeyTarget("End", 5, 40, 30)).toBe(30);
  });

  it("leaves other keys to the slider", () => {
    expect(historyKeyTarget("ArrowLeft", 25, 40, 40)).toBeNull();
    expect(historyKeyTarget("a", 25, 40, 40)).toBeNull();
  });
});

describe("historyWheelSteps (#688)", () => {
  it("goes one state per mouse notch, up to an earlier one", () => {
    expect(historyWheelSteps(0, -100, 0)).toEqual({ steps: -1, carry: 0 });
    expect(historyWheelSteps(0, 120, 0)).toEqual({ steps: 1, carry: 0 });
    expect(historyWheelSteps(0, -3, 1)).toEqual({ steps: -1, carry: 0 });
  });

  it("adds up the small deltas of a touchpad", () => {
    let carry = 0;
    let steps = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = historyWheelSteps(carry, 12, 0);
      carry = result.carry;
      steps += result.steps;
    }
    expect(steps).toBe(2);
    expect(carry).toBeCloseTo(20);
  });
});
