"use client";

import { ToolbarNoteIcon } from "@/components/toolbarIcons";
import { t } from "@/lib/i18n";

/** The note tool in the Manage section, the same in the 3D editor and in a sketch: the next click puts a note there. */
export function NoteToolButton({ active, shortcut, onClick, disabled }: { active: boolean; shortcut: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className={`action-icon-button ${active ? "active" : ""}`}
      aria-label={t("editor.tool.note")}
      aria-pressed={active}
      title={`${t("editor.tool.note")} (${shortcut})`}
      onClick={onClick}
      disabled={disabled}
    >
      <ToolbarNoteIcon />
    </button>
  );
}
