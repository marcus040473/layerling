"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, MousePointerClick } from "lucide-react";
import { t } from "@/lib/i18n";
import { advancedOpen, rememberAdvancedOpen, setToolSidebarTab, type ToolSidebarTab } from "@/lib/toolSidebar";

/*
 * The parts every tool in the right column is built from, in the same order (the GUI concept, section 5): what it works
 * on, its settings, the rarer ones folded away under Advanced, a status line, and the actions at the foot.
 */

/** The two tabs over the right column while a tool is docked there: the object's properties, or the tool. */
export function ToolSidebarTabs({ tab }: { tab: ToolSidebarTab }) {
  const tabs: ToolSidebarTab[] = ["object", "tool"];
  return (
    <div
      className="tool-sidebar-tabs"
      role="tablist"
      aria-label={t("toolSidebar.tabs")}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        // The arrows switch the tab here; they must not move the selected object as well.
        event.preventDefault();
        event.stopPropagation();
        const next = tab === "object" ? "tool" : "object";
        setToolSidebarTab(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
      }}
    >
      {tabs.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          data-tab={option}
          aria-selected={tab === option}
          tabIndex={tab === option ? 0 : -1}
          onClick={() => setToolSidebarTab(option)}
        >
          {t(option === "object" ? "toolSidebar.object" : "toolSidebar.tool")}
        </button>
      ))}
    </div>
  );
}

/** A part of a tool with its heading. */
export function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tool-section" aria-label={title}>
      <h3 className="tool-section-title">{title}</h3>
      {children}
    </section>
  );
}

/** What the tool works on, and whether that is enough: a tick, or what to pick still. */
export function ToolSelection({ ready, text, detail }: { ready: boolean; text: string; detail?: ReactNode }) {
  return (
    <div className={`tool-selection ${ready ? "ready" : "needed"}`} role="status">
      <span className="tool-selection-mark" aria-hidden="true">{ready ? <Check size={16} /> : <MousePointerClick size={16} />}</span>
      <span className="tool-selection-text">
        <strong>{text}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

/**
 * The rarer settings of a tool, folded away with a short summary of what they hold. Left open or closed, it stays so
 * for that tool in this browser.
 */
export function ToolAdvanced({ tool, summary, children }: { tool: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(advancedOpen(tool)), [tool]);
  return (
    <details
      className="tool-advanced"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        rememberAdvancedOpen(tool, next);
      }}
    >
      <summary>
        <ChevronRight className="tool-advanced-chevron" size={16} aria-hidden="true" />
        <span className="tool-advanced-title">{t("toolSidebar.advanced")}</span>
        <span className="tool-advanced-summary">{summary}</span>
      </summary>
      <div className="tool-advanced-body">{children}</div>
    </details>
  );
}

/** One line on where the tool stands, always in the same place above its actions. */
export function ToolStatus({ state, text }: { state: "ready" | "working" | "needed"; text: string }) {
  return (
    <p className={`tool-status ${state}`} role="status" aria-live="polite">
      <span className="tool-status-dot" aria-hidden="true" />
      {text}
    </p>
  );
}
