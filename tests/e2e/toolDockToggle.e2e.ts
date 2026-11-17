// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LidPanel } from "@/components/workplane/LidPanel";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { LID_DEFAULTS } from "@/lib/lidTool";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = "layerling.editor.toolPanelPosition";

let root: Root | null = null;
let stage: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  stage?.remove();
  stage = null;
  root = null;
  window.localStorage.removeItem(STORAGE_KEY);
});

/** A tool in the editor area: docked in the right column, or a floating tool that has no place there. */
function mount(dock?: "withObject" | "alone") {
  stage = document.createElement("div");
  stage.className = "workplane-stage";
  document.body.appendChild(stage);
  root = createRoot(stage);
  act(() => {
    root!.render(createElement(MovableToolPanel, {
      className: "edge-modifier-panel",
      ariaLabel: "Test tool",
      dock,
      children: (handleProps) => createElement("div", { className: "edge-modifier-header movable", ...handleProps },
        createElement("strong", null, "Test tool"),
        createElement("div", { className: "panel-header-actions" }, createElement(ToolDockToggle))),
    }));
  });
  return stage.querySelector<HTMLElement>("aside")!;
}

const toggle = (panel: HTMLElement) => panel.querySelector<HTMLButtonElement>("button.tool-dock-toggle");

describe("a tool docked in the right column (#1113)", () => {
  it("floats by its button and docks again, and the column remembers the choice", () => {
    const panel = mount("withObject");
    expect(panel.classList.contains("docked")).toBe(true);
    expect(panel.querySelector(".tool-sidebar-tabs")).not.toBeNull();
    expect(toggle(panel)?.getAttribute("aria-label")).toBe("Detach as a free window");

    act(() => toggle(panel)!.click());
    expect(panel.classList.contains("docked")).toBe(false);
    expect(panel.classList.contains("floating")).toBe(true);
    // Floating, the tabs go: the object's properties stand beside the tool again.
    expect(panel.querySelector(".tool-sidebar-tabs")).toBeNull();
    expect(toggle(panel)?.getAttribute("aria-label")).toBe("Dock in the right column");
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    // The next tool opens where the last one was left: floating.
    act(() => root?.unmount());
    stage?.remove();
    const next = mount("alone");
    expect(next.classList.contains("floating")).toBe(true);

    act(() => toggle(next)!.click());
    expect(next.classList.contains("docked")).toBe(true);
    expect(next.classList.contains("floating")).toBe(false);
    expect(next.querySelector(".tool-sidebar-tabs")).not.toBeNull();
    expect(toggle(next)?.getAttribute("aria-label")).toBe("Detach as a free window");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("shows no such button on a tool that has no place in the column", () => {
    const panel = mount();
    expect(toggle(panel)).toBeNull();
  });

  it("is in the head of a real tool, beside its help and its close button", () => {
    stage = document.createElement("div");
    stage.className = "workplane-stage";
    document.body.appendChild(stage);
    root = createRoot(stage);
    act(() => {
      root!.render(createElement(LidPanel, {
        targetName: "Box",
        settings: LID_DEFAULTS,
        workspace: DEFAULT_WORKPLANE_WORKSPACE,
        busy: false,
        error: null,
        onChange: () => {},
        onApply: () => {},
        onCancel: () => {},
      }));
    });
    const actions = stage.querySelector(".panel-header-actions")!;
    expect(actions.querySelector("button.tool-dock-toggle")?.getAttribute("title")).toBe("Detach as a free window");
  });
});
