import { useSyncExternalStore } from "react";

/**
 * Which side of the right column a docked tool shows (the GUI concept's "Object / Tool"): the tool's own settings, or
 * the object's properties beneath it. A tool that opens shows itself; switching to the object keeps the tool and its
 * settings, so switching back finds them as they were.
 */
export type ToolSidebarTab = "tool" | "object";

let current: ToolSidebarTab = "tool";
const listeners = new Set<() => void>();

export function setToolSidebarTab(tab: ToolSidebarTab) {
  if (tab === current) return;
  current = tab;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useToolSidebarTab(): ToolSidebarTab {
  return useSyncExternalStore(subscribe, () => current, () => "tool");
}

/** Whether a tool's "Advanced" part was left open, per tool, in this browser (nothing when storage is not there). */
export function advancedOpen(tool: string) {
  try {
    return window.localStorage.getItem(`layerling.toolAdvanced.${tool}`) === "open";
  } catch {
    return false;
  }
}

export function rememberAdvancedOpen(tool: string, open: boolean) {
  try {
    window.localStorage.setItem(`layerling.toolAdvanced.${tool}`, open ? "open" : "closed");
  } catch {
    // Not remembered; it opens closed next time.
  }
}
