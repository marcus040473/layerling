import { describe, expect, it } from "vitest";
import { wheelBaseStep, wheelNextValue, wheelTurn, wheelValueFactor } from "@/lib/wheelValueStep";

describe("the mouse wheel in a number field (#226)", () => {
  it("reads the turn from deltaX when Shift makes a Mac report it sideways", () => {
    expect(wheelTurn({ deltaX: 0, deltaY: -100 })).toBe(-100);
    expect(wheelTurn({ deltaX: 0, deltaY: 100, shiftKey: true })).toBe(100);
    expect(wheelTurn({ deltaX: -60, deltaY: 0, shiftKey: true })).toBe(-60);
    // A sideways turn without Shift (a trackpad) is not a notch of this field.
    expect(wheelTurn({ deltaX: -60, deltaY: 0 })).toBe(0);
  });

  it("takes a coarse step with no key and finer or coarser ones with the keys", () => {
    expect(wheelValueFactor({})).toBe(1);
    expect(wheelValueFactor({ shift: true })).toBe(10);
    expect(wheelValueFactor({ ctrl: true })).toBe(0.1);
    expect(wheelValueFactor({ alt: true })).toBe(0.01);
    // Alt is the finest, whatever else is held.
    expect(wheelValueFactor({ alt: true, shift: true })).toBe(0.01);
  });

  it("steps a whole unit on a long range, a tenth on a short one, and sixteenths for inches", () => {
    expect(wheelBaseStep(0.5, 500, 0.01)).toBe(1);
    expect(wheelBaseStep(0, 360, 0.01)).toBe(1);
    expect(wheelBaseStep(0, 5, 0.01)).toBe(0.1);
    expect(wheelBaseStep(0, 1, 0.01)).toBe(0.01);
    expect(wheelBaseStep(3, 64, 1)).toBe(1);
    expect(wheelBaseStep(0.5, 500, 0.01, true)).toBe(1 / 16);
  });

  it("steps a whole unit for the wall of a hollowed body of 40 mm, whose range runs to 19.6 (#536)", () => {
    expect(wheelBaseStep(0.4, 19.6, 0.001)).toBe(1);
    expect(wheelBaseStep(0.4, 8.4, 0.001)).toBe(1);
    expect(wheelBaseStep(0.4, 7.6, 0.001)).toBe(0.1);
  });

  it("never steps finer than the field's own step", () => {
    expect(wheelBaseStep(0, 1, 0.25)).toBe(0.25);
  });

  it("adds the notches without float noise", () => {
    expect(wheelNextValue(24.5, 1, 1, {})).toBe(25.5);
    expect(wheelNextValue(24.5, -1, 1, { shift: true })).toBe(14.5);
    expect(wheelNextValue(32.9, -1, 1, { alt: true })).toBe(32.89);
    let value = 0;
    for (let index = 0; index < 10; index += 1) value = wheelNextValue(value, 1, 1, { ctrl: true });
    expect(value).toBe(1);
  });

  it("steps by the snap grid with Shift where a field passes it, and ten steps without one (#749)", () => {
    expect(wheelNextValue(20, 1, 1, { shift: true }, 5)).toBe(25);
    expect(wheelNextValue(20, -1, 1, { shift: true }, 0.5)).toBe(19.5);
    expect(wheelNextValue(20, 1, 1, { shift: true }, undefined)).toBe(30);
    expect(wheelNextValue(20, 1, 1, { shift: true }, 0)).toBe(30);
    expect(wheelNextValue(20, 1, 1, {}, 5)).toBe(21);
    expect(wheelNextValue(20, 1, 1, { shift: true, alt: true }, 5)).toBe(20.01);
  });
});
