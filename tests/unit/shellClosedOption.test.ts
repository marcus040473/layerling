import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShellPanel } from "@/components/workplane/ShellPanel";
import { shellOpeningsFor } from "@/lib/shellLimits";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { ShellOpenings } from "@/types/layerling";

/** Closed (cavity inside) beside the side buttons: pressed while no side is open, and it opens none (#658). */
function closedButton(openings: ShellOpenings) {
  const noop = () => {};
  const markup = renderToStaticMarkup(createElement(ShellPanel, {
    targetName: "Cylinder",
    thickness: 2,
    maxThickness: 10,
    openings,
    edges: "round",
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    busy: false,
    error: null,
    appliedFeatureCount: 0,
    reversibleFeatureCount: 0,
    historyOptions: [],
    onRemoveFeature: noop,
    onThicknessChange: noop,
    onOpeningsChange: noop,
    onEdgesChange: noop,
    onApply: noop,
    onCancel: noop,
  }));
  return markup.match(/<div class="shell-opening-options shell-closed-option"><button[^>]*>([^<]*)<\/button>/);
}

describe("the Closed button of the hollow panel", () => {
  it("is pressed while no side is open", () => {
    const match = closedButton("none");
    expect(match?.[0]).toContain('aria-pressed="true"');
    expect(match?.[1]).toBe("Closed (cavity inside)");
  });

  it("lets go when a side is open", () => {
    expect(closedButton("top")?.[0]).toContain('aria-pressed="false"');
  });

  it("closes every side", () => {
    expect(shellOpeningsFor([])).toBe("none");
  });
});
