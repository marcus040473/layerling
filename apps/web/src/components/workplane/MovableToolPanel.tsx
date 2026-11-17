"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { AppWindow, PanelRight } from "lucide-react";
import { ToolSidebarTabs } from "@/components/workplane/ToolPanelParts";
import { t } from "@/lib/i18n";
import { setToolSidebarTab, useToolSidebarTab } from "@/lib/toolSidebar";
import { useMovablePanel, type MovablePanelOptions } from "@/lib/useMovablePanel";

/**
 * Die Werkzeugtafeln oben rechts - Kanten verrunden und fasen, Aushoehlen,
 * Vervielfaeltigen - lassen sich an ihrer Titelleiste ueber die Arbeitsflaeche
 * ziehen. Sie stehen an derselben Stelle, also teilen sie sich auch den
 * gemerkten Platz. Ein Doppelklick auf die Titelleiste oder das Ablegen an der
 * alten Stelle bringt sie zurueck.
 *
 * A tool built for the right column (the GUI concept's right column) starts docked there instead: in place of the
 * object's properties, with the tabs Object and Tool above it (Object unavailable where a tool hides the properties
 * while it works). Dragged away, it floats as the others do. One tool at a time: one that opens closes the one before.
 * Every window stays movable (#1113): a button in the tool's head lets a docked tool float, and docks it again.
 */
const TOOL_PANEL: MovablePanelOptions = {
  floatingStyle: { right: "auto", bottom: "auto" },
  area: (panel) => panel.ownerDocument.querySelector<HTMLElement>(".workplane-stage"),
};

/** How wide a tool floats: as wide as the floating tools, which the stylesheet sets. */
const FLOATING_WIDTH = 340;

/** Whether the tool lies docked in the column, and what moves it out of it or back in; null for a tool not built for the column. */
const ToolDockContext = createContext<{ docked: boolean; float: () => void; dock: () => void } | null>(null);

/**
 * The button in a tool's head that lets a docked tool float over the editor area, beside the column, and puts a
 * floating one back into the column. Nothing for a tool that has no place in the column.
 */
export function ToolDockToggle() {
  const dock = useContext(ToolDockContext);
  if (!dock) return null;
  const label = t(dock.docked ? "toolSidebar.float" : "toolSidebar.dock");
  return (
    <button type="button" className="tool-dock-toggle" aria-label={label} title={label} onClick={dock.docked ? dock.float : dock.dock}>
      {dock.docked ? <AppWindow size={18} aria-hidden="true" /> : <PanelRight size={18} aria-hidden="true" />}
    </button>
  );
}

/** The tools open in the column, the newest last. */
const openTools: { close: () => void }[] = [];

export type MovableHandleProps = ReturnType<typeof useMovablePanel>["handleProps"];

export function MovableToolPanel({
  className,
  ariaLabel,
  focusOnOpen = false,
  dock,
  onClose,
  children,
}: {
  className: string;
  ariaLabel: string;
  /** The panel takes the keyboard focus when it opens and gives it back when it closes. */
  focusOnOpen?: boolean;
  /** Docked in the right column until dragged away: with the tabs over the object's properties, or alone. */
  dock?: "withObject" | "alone";
  /** Closes the tool, dropping what was set in it: called when another tool opens in the column. */
  onClose?: () => void;
  /** Bekommt die Griffe fuer die Titelleiste. */
  children: (handleProps: MovableHandleProps) => ReactNode;
}) {
  const movable = useMovablePanel<HTMLElement>("layerling.editor.toolPanelPosition", TOOL_PANEL);
  const { panelRef, currentPosition, floatAt, moved } = movable;
  const docked = dock !== undefined && !moved;
  // Floating, the tool stands left of the column, so the object's properties stay in view beside it. It is placed
  // once more after it has left the column: docked, it is drawn at the toolbar's size, floating at its own.
  const floatTarget = useRef<{ left: number; top: number } | null>(null);
  const float = useCallback(() => {
    const now = currentPosition();
    if (!now) return;
    const width = Math.min(FLOATING_WIDTH, window.innerWidth - 28);
    floatTarget.current = { left: now.left - width - 16, top: now.top + 14 };
    floatAt(floatTarget.current, width);
  }, [currentPosition, floatAt]);
  useLayoutEffect(() => {
    const target = floatTarget.current;
    if (!target || !moved) return;
    floatTarget.current = null;
    floatAt(target, Math.min(FLOATING_WIDTH, window.innerWidth - 28));
  }, [moved, floatAt]);
  const dockControl = dock ? { docked, float, dock: movable.dock } : null;
  const tabs = docked;
  const tab = useToolSidebarTab();
  // A tool that opens shows itself, not the object's properties last looked at.
  useEffect(() => setToolSidebarTab("tool"), []);
  // One tool at a time in the column: one that opens closes the one before, which drops what was set in it (as its
  // Cancel does), instead of both lying on top of each other.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!dock) return undefined;
    const entry = { close: () => closeRef.current?.() };
    const before = openTools.splice(0);
    openTools.push(entry);
    before.forEach((other) => other.close());
    return () => {
      const index = openTools.indexOf(entry);
      if (index >= 0) openTools.splice(index, 1);
    };
  }, [dock]);
  useEffect(() => {
    if (!focusOnOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [focusOnOpen, panelRef]);
  return (
    <aside
      ref={movable.panelRef}
      className={`${className} ${dock ? "tool-column" : ""} ${movable.moved ? "floating" : ""} ${docked ? "docked" : ""} ${docked && dock === "withObject" && tab === "object" ? "show-object" : ""} ${movable.dragging ? "moving" : ""}`}
      style={movable.style}
      tabIndex={focusOnOpen ? -1 : undefined}
      aria-label={ariaLabel}
      data-help-panel={ariaLabel}
    >
      {tabs ? <ToolSidebarTabs tab={tab} objectHidden={dock === "alone"} /> : null}
      <ToolDockContext.Provider value={dockControl}>{children(movable.handleProps)}</ToolDockContext.Provider>
    </aside>
  );
}
