import { describe, expect, it } from "vitest";
import { wheelZoomDelta, WHEEL_ALONE_GAP_MS, WHEEL_NOTCH_DELTA, PINCH_WHEEL_FACTOR, pinchWheelDelta } from "@/lib/wheelZoom";

const pixels = (deltaY: number, ctrlKey = false) => ({ deltaY, deltaMode: 0, ctrlKey });

describe("wheelZoomDelta (#331)", () => {
  it("counts a small step that stands alone as a notch of 100, in its direction", () => {
    expect(wheelZoomDelta(pixels(-12), 500)).toBe(-WHEEL_NOTCH_DELTA);
    expect(wheelZoomDelta(pixels(12), 500)).toBe(WHEEL_NOTCH_DELTA);
    expect(wheelZoomDelta(pixels(-12), WHEEL_ALONE_GAP_MS)).toBe(-WHEEL_NOTCH_DELTA);
  });

  it("leaves the steps of a stream alone, as a trackpad or a smooth wheel sends them", () => {
    expect(wheelZoomDelta(pixels(-3), 16)).toBe(-3);
    expect(wheelZoomDelta(pixels(7.5), WHEEL_ALONE_GAP_MS - 1)).toBe(7.5);
  });

  it("leaves a notch of 100 or more as it comes", () => {
    expect(wheelZoomDelta(pixels(100), 500)).toBe(100);
    expect(wheelZoomDelta(pixels(-240), 500)).toBe(-240);
  });

  it("counts a pinch on a trackpad (Ctrl, small steps) ten times over, as OrbitControls would (Chrome, mail 21.10.2026)", () => {
    expect(wheelZoomDelta(pixels(-4, true), 500)).toBe(-4 * PINCH_WHEEL_FACTOR);
    expect(wheelZoomDelta(pixels(2.5, true), 16)).toBe(2.5 * PINCH_WHEEL_FACTOR);
  });

  it("leaves a mouse notch with Ctrl held alone", () => {
    expect(wheelZoomDelta(pixels(-100, true), 500)).toBe(-100);
  });

  it("counts a wheel in lines or pages in pixels: three lines or one page are a notch (Edge, one screen at a time, 22.10.2026)", () => {
    expect(wheelZoomDelta({ deltaY: -3, deltaMode: 1, ctrlKey: false }, 500)).toBeCloseTo(-WHEEL_NOTCH_DELTA);
    expect(wheelZoomDelta({ deltaY: -1, deltaMode: 2, ctrlKey: false }, 500)).toBe(-WHEEL_NOTCH_DELTA);
    expect(wheelZoomDelta({ deltaY: 1, deltaMode: 2, ctrlKey: true }, 500)).toBe(WHEEL_NOTCH_DELTA);
  });

  it("does not turn a step of zero into a notch, and takes the first step ever as one that stands alone", () => {
    expect(wheelZoomDelta(pixels(0), 500)).toBe(0);
    expect(wheelZoomDelta(pixels(-12), Number.POSITIVE_INFINITY)).toBe(-WHEEL_NOTCH_DELTA);
  });
});

describe("a pinch on a trackpad in Safari zooms as far as the wheel step it stands for (forum)", () => {
  // OrbitControls scales the distance by 0.95 ^ (zoom speed * step / 100), the step as wheelZoomDelta passes it on.
  const distanceScale = (step: number, zoomSpeed: number) =>
    Math.pow(0.95, zoomSpeed * Math.abs(wheelZoomDelta(pixels(step, true), 16)) * 0.01);

  it("a spread comes closer by the inverse of the scale it grew by", () => {
    const step = pinchWheelDelta(1.2, 1)!;
    expect(step).toBeLessThan(0);
    expect(distanceScale(step, 1)).toBeCloseTo(1 / 1.2, 6);
  });

  it("a pinch together goes away by the inverse of the scale it shrank by", () => {
    const step = pinchWheelDelta(0.8, 1)!;
    expect(step).toBeGreaterThan(0);
    expect(distanceScale(step, 1)).toBeCloseTo(0.8, 6);
  });

  it("follows the zoom speed: twice as fast, half the step", () => {
    expect(pinchWheelDelta(1.1, 2)!).toBeCloseTo(pinchWheelDelta(1.1, 1)! / 2, 9);
  });

  it("ignores no change and nonsense", () => {
    expect(pinchWheelDelta(1, 1)).toBeNull();
    expect(pinchWheelDelta(Number.NaN, 1)).toBeNull();
    expect(pinchWheelDelta(0, 1)).toBeNull();
    expect(pinchWheelDelta(1.1, 0)).toBeNull();
  });
});
