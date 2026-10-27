import { describe, expect, it } from "vitest";
import { DRAG_AXIS_LATCH_PIXELS, latchedDragAxis } from "@/lib/dragAxisLatch";

// A Shift drag keeps its axis once chosen; near the start it used to jump between the two (#909).
describe("the axis a Shift drag is held to", () => {
  it("lets the part wait until the pointer has gone far enough to tell the direction", () => {
    expect(latchedDragAxis(null, "x", DRAG_AXIS_LATCH_PIXELS - 1)).toEqual({ along: null, latched: null });
  });

  it("settles on the way the pointer has gone, then keeps it", () => {
    const first = latchedDragAxis(null, "x", DRAG_AXIS_LATCH_PIXELS);
    expect(first).toEqual({ along: "x", latched: "x" });
    // The pointer crosses the diagonal: the axis stays.
    expect(latchedDragAxis(first.latched, "z", 40)).toEqual({ along: "x", latched: "x" });
    expect(latchedDragAxis(first.latched, "z", 2)).toEqual({ along: "x", latched: "x" });
  });

  it("picks again after Shift was let go and held anew", () => {
    expect(latchedDragAxis(null, "z", 30)).toEqual({ along: "z", latched: "z" });
  });
});
