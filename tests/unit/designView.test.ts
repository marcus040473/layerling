import { describe, expect, it } from "vitest";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { normalizeDesignView, normalizeSavedViews, savedViewForKey, type DesignView, type SavedDesignViews } from "@/lib/designView";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/layerling";

// #220: a design opens the way it was left, so its view travels with it.
const view: DesignView = { orthographic: true, position: [10, 80, 40], target: [0, 5, 0], up: [0, 1, 0], zoom: 1.5 };
const box: WorkplaneShape = { id: "b", name: "Box", kind: "box", color: "#123456", x: 0, z: 0, size: 20, width: 20, depth: 20, height: 10, rotation: 0 };

function pack(extra: { view?: DesignView | null; savedViews?: SavedDesignViews | null }) {
  return exportLylProject({
    projectName: "Viewed",
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_100_000,
    shapes: [box],
    history: [editorHistoryEntry([box], [])],
    historyIndex: 0,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
    ...extra,
  });
}

describe("the view of a design (#220)", () => {
  it("only takes a camera that can look at something", () => {
    expect(normalizeDesignView(view)).toEqual(view);
    expect(normalizeDesignView({ ...view, orthographic: "yes" })).toEqual({ ...view, orthographic: false });
    expect(normalizeDesignView(null)).toBeNull();
    expect(normalizeDesignView({ ...view, position: [0, 0] })).toBeNull();
    expect(normalizeDesignView({ ...view, position: [0, Number.NaN, 0] })).toBeNull();
    expect(normalizeDesignView({ ...view, position: view.target })).toBeNull();
    expect(normalizeDesignView({ ...view, up: [0, 0, 0] })).toBeNull();
    expect(normalizeDesignView({ ...view, zoom: 0 })).toBeNull();
  });

  it("comes back out of a saved file", async () => {
    const restored = await importLylProject(await pack({ view }));
    expect(restored.view).toEqual(view);
  });

  it("is simply absent from a file saved without one", async () => {
    const restored = await importLylProject(await pack({ view: null }));
    expect(restored.view).toBeUndefined();
  });
});

describe("the views saved under 7, 8, 9 and 0", () => {
  const other: DesignView = { ...view, orthographic: false, position: [0, 0, 200] };

  it("saves with Shift and goes back without, by the key or where it sits", () => {
    expect(savedViewForKey("7", "Digit7", false)).toEqual({ slot: 0, save: false });
    expect(savedViewForKey("0", "Numpad0", false)).toEqual({ slot: 3, save: false });
    // Shift+7 types "/" or "&" on most layouts, and the digit itself on AZERTY.
    expect(savedViewForKey("/", "Digit7", true)).toEqual({ slot: 0, save: true });
    expect(savedViewForKey("9", "Digit9", true)).toEqual({ slot: 2, save: true });
    expect(savedViewForKey("è", "Digit7", false)).toEqual({ slot: 0, save: false });
    expect(savedViewForKey("1", "Digit1", false)).toBeUndefined();
    expect(savedViewForKey("Home", "Numpad7", false)).toBeUndefined();
  });

  it("keeps four slots, and nothing when none holds a view", () => {
    expect(normalizeSavedViews([null, view])).toEqual([null, view, null, null]);
    expect(normalizeSavedViews([{ ...view, zoom: -1 }, "x", null, null, other])).toBeNull();
    expect(normalizeSavedViews("views")).toBeNull();
  });

  it("travel in a saved file", async () => {
    const savedViews = [view, null, null, other];
    const restored = await importLylProject(await pack({ view, savedViews }));
    expect(restored.savedViews).toEqual(savedViews);
    expect((await importLylProject(await pack({ view, savedViews: null }))).savedViews).toBeUndefined();
  });
});
