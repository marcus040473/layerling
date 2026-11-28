// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LidPanel } from "@/components/workplane/LidPanel";
import { t } from "@/lib/i18n";
import { LID_DEFAULTS, LID_TYPES, type LidOptions } from "@/lib/lidTool";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function unmount() {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}

afterEach(unmount);

/** The lid's panel with these settings; what it hands on comes back in `changes`. */
function mount(settings: Partial<LidOptions> = {}) {
  const changes: Partial<LidOptions>[] = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(LidPanel, {
      targetName: "Pot",
      settings: { ...LID_DEFAULTS, ...settings },
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      busy: false,
      error: null,
      onChange: (patch: Partial<LidOptions>) => changes.push(patch),
      onApply: () => {},
      onCancel: () => {},
    }));
  });
  return { panel: container, changes };
}

/** The checkbox in the label that reads `text`. */
function checkbox(panel: HTMLElement, text: string) {
  const label = Array.from(panel.querySelectorAll("label")).find((entry) => entry.textContent?.trim() === text);
  return label?.querySelector<HTMLInputElement>("input[type=checkbox]") ?? null;
}

/** Discussion #2148: a screw lid's body can be widened below the cap, so the two close flush. */
describe("the lid panel's switch for a body flush with the screw cap", () => {
  it("is there for a screw lid only, unticked to begin with, and hands on the change", () => {
    for (const type of LID_TYPES) {
      const { panel, changes } = mount({ type });
      const box = checkbox(panel, t("lid.flushBase"));
      expect([type, box !== null]).toEqual([type, type === "screw"]);
      if (box) {
        expect(box.checked).toBe(false);
        expect(panel.textContent).not.toContain(t("lid.flushBaseHint"));
        act(() => box.click());
        expect(changes).toEqual([{ flushBase: true }]);
      }
      unmount();
    }
  });

  it("explains itself when ticked, and steps aside for a tether, whose ring goes round the body below the cap", () => {
    const ticked = mount({ type: "screw", flushBase: true });
    expect(checkbox(ticked.panel, t("lid.flushBase"))?.checked).toBe(true);
    expect(ticked.panel.textContent).toContain(t("lid.flushBaseHint"));
    unmount();
    const tethered = mount({ type: "screw", flushBase: true, tether: true });
    expect(checkbox(tethered.panel, t("lid.flushBase"))).toBeNull();
    expect(checkbox(tethered.panel, t("lid.tether"))?.checked).toBe(true);
  });
});
