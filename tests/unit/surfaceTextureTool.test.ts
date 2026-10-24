// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SurfaceTextureCard } from "@/components/workplane/ShapeInspector";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cylinder: WorkplaneShape = canonicalizeShape({
  id: "c1", name: "Cylinder", kind: "cylinder", color: "#d97813", x: 0, z: 0, elevation: 0,
  size: 30, width: 30, depth: 30, height: 20, rotation: 0,
});

// The button "Surface texture" under "Modify" and the card's own header open and close the same card.
describe("the surface texture card, opened from the toolbar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  // The editor's side: one open state, changed by the toolbar (here `toggle`) and by the card.
  let toggle: () => void = () => {};
  let changes: boolean[] = [];
  function Host() {
    const [open, setOpen] = useState(false);
    toggle = () => setOpen((current) => !current);
    return createElement(SurfaceTextureCard, {
      shape: cylinder,
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      disabled: false,
      onApply: () => {},
      open,
      onOpenChange: (next: boolean) => {
        changes.push(next);
        setOpen(next);
      },
    });
  }
  const mount = () => {
    changes = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(Host)));
  };
  const header = () => container!.querySelector<HTMLButtonElement>(".property-card-header")!;
  const body = () => container!.querySelector(`#surface-texture-${cylinder.id}`);

  it("opens and closes with the toolbar button", () => {
    mount();
    expect(body()).toBeNull();
    act(() => toggle());
    expect(header().getAttribute("aria-expanded")).toBe("true");
    expect(body()).not.toBeNull();
    act(() => toggle());
    expect(body()).toBeNull();
  });

  it("tells the editor when its own header opens or closes it, so the button shows the same", () => {
    mount();
    act(() => header().click());
    expect(changes).toEqual([true]);
    expect(body()).not.toBeNull();
    act(() => header().click());
    expect(changes).toEqual([true, false]);
    expect(body()).toBeNull();
  });

  it("keeps its own open state when nobody holds it", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(SurfaceTextureCard, { shape: cylinder, workspace: DEFAULT_WORKPLANE_WORKSPACE, disabled: false, onApply: () => {} })));
    expect(body()).toBeNull();
    act(() => header().click());
    expect(body()).not.toBeNull();
  });
});
