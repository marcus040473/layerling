"use client";

import { useEffect, type ReactNode } from "react";
import { ToolSidebarTabs } from "@/components/workplane/ToolPanelParts";
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
 * object's properties, with the tabs Object and Tool above it, or alone where a tool hides the properties while it
 * works. Dragged away, it floats as the others do.
 */
const TOOL_PANEL: MovablePanelOptions = {
  floatingStyle: { right: "auto", bottom: "auto" },
  area: (panel) => panel.ownerDocument.querySelector<HTMLElement>(".workplane-stage"),
};

export type MovableHandleProps = ReturnType<typeof useMovablePanel>["handleProps"];

export function MovableToolPanel({
  className,
  ariaLabel,
  focusOnOpen = false,
  dock,
  children,
}: {
  className: string;
  ariaLabel: string;
  /** The panel takes the keyboard focus when it opens and gives it back when it closes. */
  focusOnOpen?: boolean;
  /** Docked in the right column until dragged away: with the tabs over the object's properties, or alone. */
  dock?: "withObject" | "alone";
  /** Bekommt die Griffe fuer die Titelleiste. */
  children: (handleProps: MovableHandleProps) => ReactNode;
}) {
  const movable = useMovablePanel<HTMLElement>("layerling.editor.toolPanelPosition", TOOL_PANEL);
  const { panelRef } = movable;
  const docked = dock !== undefined && !movable.moved;
  const tabs = docked && dock === "withObject";
  const tab = useToolSidebarTab();
  // A tool that opens shows itself, not the object's properties last looked at.
  useEffect(() => setToolSidebarTab("tool"), []);
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
      className={`${className} ${movable.moved ? "floating" : ""} ${docked ? "docked" : ""} ${tabs && tab === "object" ? "show-object" : ""} ${movable.dragging ? "moving" : ""}`}
      style={movable.style}
      tabIndex={focusOnOpen ? -1 : undefined}
      aria-label={ariaLabel}
      data-help-panel={ariaLabel}
    >
      {tabs ? <ToolSidebarTabs tab={tab} /> : null}
      {children(movable.handleProps)}
    </aside>
  );
}
