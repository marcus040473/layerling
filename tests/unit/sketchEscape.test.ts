import { describe, expect, it } from "vitest";
import { escapeWasHandled, markEscapeHandled } from "@/lib/escapeHandled";
import { sketchEscapeAction } from "@/lib/sketchEscape";

describe("Esc in the sketch (#664)", () => {
  it("puts a drawing tool down and takes Select", () => {
    for (const tool of ["line", "arc", "bezier", "smooth", "rectangle", "circle", "refine", "erase", "measure"] as const) {
      expect(sketchEscapeAction(tool)).toBe("selectTool");
    }
  });

  it("clears the selection only with Select in hand", () => {
    expect(sketchEscapeAction("select")).toBe("clearSelection");
  });

  it("leaves a key that a panel already used alone", () => {
    const event = new Event("keydown");
    expect(escapeWasHandled(event)).toBe(false);
    markEscapeHandled(event);
    expect(escapeWasHandled(event)).toBe(true);
  });
});
