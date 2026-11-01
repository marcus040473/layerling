"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, Check, ChevronRight, Info, Minus, MousePointerClick, Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { advancedOpen, rememberAdvancedOpen, setToolSidebarTab, type ToolSidebarTab } from "@/lib/toolSidebar";

/*
 * The parts every tool in the right column is built from, in the same order (the GUI concept, section 5): what it works
 * on, its settings, the rarer ones folded away under Advanced, a status line, and the actions at the foot.
 */

/** The two tabs over the right column while a tool is docked there: the object's properties, or the tool. */
export function ToolSidebarTabs({ tab, objectHidden = false }: { tab: ToolSidebarTab; objectHidden?: boolean }) {
  const tabs: ToolSidebarTab[] = ["object", "tool"];
  return (
    <div
      className="tool-sidebar-tabs"
      role="tablist"
      aria-label={t("toolSidebar.tabs")}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        if (objectHidden) return;
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
          aria-selected={objectHidden ? option === "tool" : tab === option}
          tabIndex={(objectHidden ? option === "tool" : tab === option) ? 0 : -1}
          // Some tools hide the object's properties while they work (Fillet picks edges, Split a plane): the tab stays,
          // so every tool has the same head, but it says why it cannot be opened.
          aria-disabled={objectHidden && option === "object" ? true : undefined}
          title={objectHidden && option === "object" ? t("toolSidebar.objectHidden") : undefined}
          onClick={() => (objectHidden ? undefined : setToolSidebarTab(option))}
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

/**
 * What the tool works on, in one line: the body and how much of it ("Box · All faces"), with an action at the end
 * where the pick can be changed (Pick faces). A body chosen before the tool opened is the normal case and stays
 * neutral; only what still has to be picked (amber) or a pick the tool has checked, such as edges or a face (green,
 * `confirm`), is marked.
 */
export function ToolSelection({ ready, confirm = false, text, scope, detail, action }: {
  ready: boolean;
  confirm?: boolean;
  text: string;
  scope?: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  const state = !ready ? "needed" : confirm ? "confirmed" : "neutral";
  return (
    <div className={`tool-selection ${state}`} role="status">
      <span className="tool-selection-mark" aria-hidden="true">
        {state === "confirmed" ? <Check size={15} /> : state === "needed" ? <MousePointerClick size={15} /> : <Box size={16} />}
      </span>
      <span className="tool-selection-text">
        <strong>{text}{scope ? <span className="tool-selection-scope"> · {scope}</span> : null}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {action ? <span className="tool-selection-action">{action}</span> : null}
    </div>
  );
}

const ABBREVIATIONS = new Set(["z", "b", "ca", "bzw", "usw", "vgl", "nr", "e", "g", "i", "d", "h", "u", "a", "etc", "approx", "resp", "cf", "env", "zb", "tj", "tzn", "atd", "tzv", "npr", "itd", "dvs", "fx", "osv", "bl", "т", "е", "к", "н", "пр", "см", "др"]);

/** The first sentence of a hint and the rest, split where a sentence ends (not after "e.g." or "z. B."). */
export function hintParts(text: string): [string, string] {
  const pattern = /([.!?;:])\s+/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const end = match.index + 1;
    if (end < 24) continue;
    const word = text.slice(0, match.index).split(/[\s(]/).pop()?.toLowerCase().replace(/[^\p{L}]/gu, "") ?? "";
    if (match[1] === "." && ABBREVIATIONS.has(word)) continue;
    const rest = text.slice(match.index + match[0].length).trim();
    // A short rest reads better in one go than behind a "More".
    return rest.length < 32 ? [text, ""] : [text.slice(0, end), rest];
  }
  // One long sentence: its beginning, up to a word, and the rest behind "More".
  if (text.length > LONG_HINT) {
    const cut = text.lastIndexOf(" ", SHORT_HINT);
    if (cut > 24) return [`${text.slice(0, cut)} …`, text.slice(cut + 1)];
  }
  return [text, ""];
}

/** A hint of one sentence longer than this is cut after about SHORT_HINT characters. */
const LONG_HINT = 110;
const SHORT_HINT = 72;

/**
 * A hint under a setting: its first sentence, and the rest behind "More", so a long explanation does not push the
 * settings below it down.
 */
export function ToolHint({ text, className = "shell-openings-summary" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [first, rest] = hintParts(text);
  return (
    <span className={`${className} tool-hint`}>
      {open && first.endsWith(" …") ? first.slice(0, -2) : first}
      {rest ? (
        <>
          {open ? <> {rest}</> : null}{" "}
          <button type="button" className="tool-hint-more" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
            {t(open ? "inspector.less" : "inspector.more")}
          </button>
        </>
      ) : null}
    </span>
  );
}

/** A short note to keep in mind for the result, in a light box (the size a body needs for flexi joints). */
export function ToolNote({ text }: { text: string }) {
  return (
    <p className="tool-note">
      <Info size={15} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/** What applying the tool will do, in one line above its actions ("Box 2 gets the cavity; Box 1 stays as it is"). */
export function ToolOutcome({ text }: { text: string }) {
  return (
    <p className="tool-outcome">
      <Info size={15} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/** A whole number with − and + beside it, for counts (joints, copies): typed, or stepped one at a time. */
export function ToolStepper({ label, value, min, max, disabled = false, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    if (clamped !== value) onChange(clamped);
  };
  const commit = () => {
    if (draft === null) return;
    const typed = Number(draft.trim());
    if (Number.isFinite(typed)) set(typed);
    setDraft(null);
  };
  return (
    <label className="edge-modifier-field tool-stepper">
      <span>{label}</span>
      <span className="tool-stepper-control">
        <button type="button" aria-label={`${label} −1`} disabled={disabled || value <= min} onClick={() => set(value - 1)}><Minus size={15} /></button>
        <input
          type="text"
          inputMode="numeric"
          value={draft ?? String(value)}
          disabled={disabled}
          onFocus={(event) => { setDraft(String(value)); event.currentTarget.select(); }}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
            else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); event.currentTarget.blur(); }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              set(value + (event.key === "ArrowUp" ? 1 : -1));
              setDraft(null);
            }
          }}
        />
        <button type="button" aria-label={`${label} +1`} disabled={disabled || value >= max} onClick={() => set(value + 1)}><Plus size={15} /></button>
      </span>
    </label>
  );
}

/** How the tool works, in full: folded away under the selection, so the settings start near the top. */
export function ToolHelp({ children }: { children: ReactNode }) {
  return (
    <details className="tool-help">
      <summary>
        <ChevronRight className="tool-advanced-chevron" size={14} aria-hidden="true" />
        <span>{t("toolSidebar.howItWorks")}</span>
      </summary>
      <div className="tool-help-body">{children}</div>
    </details>
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
        {summary ? <span className="tool-advanced-summary">{summary}</span> : null}
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
