import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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

/**
 * A tool in the right column that works on one body (the surface texture): open only for the body it was started for.
 * Another body selected, one added, or none closes it, and it does not open again by itself: a body that comes on screen
 * shows its properties, not a tool nobody started (#1113). When the tool's own Apply or Remove puts a new body in place
 * of the old one, `follow` keeps the tool open on that one.
 */
export function useToolForBody(selectedId: string | null) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor !== null && openFor === selectedId;
  useEffect(() => {
    if (openFor !== null && openFor !== selectedId) setOpenFor(null);
  }, [openFor, selectedId]);
  const setOpen = useCallback((next: boolean) => setOpenFor(next ? selectedId : null), [selectedId]);
  const follow = useCallback((from: string, to: string) => setOpenFor((current) => (current === from ? to : current)), []);
  return { open, setOpen, follow };
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
