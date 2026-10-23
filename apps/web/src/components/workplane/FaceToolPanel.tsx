"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Check, X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { FACE_TOOL_MAX_DEPTH, FACE_TOOL_MAX_INSET, FACE_TOOL_MAX_RADIUS, FACE_TOOL_MIN_DEPTH, type FaceToolDirection, type FaceToolSettings } from "@/lib/faceTool";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

const DIRECTIONS: readonly FaceToolDirection[] = ["out", "in"];

/**
 * "Face": once a flat face of the body is picked, the body it adds (out) or the pocket it cuts
 * (in) shows while the numbers change, and "Create" groups it with the body, or leaves it as a body of its own with the switch on (#750). What it adds stays
 * an ordinary sketch body.
 */
export function FaceToolPanel({
  targetName,
  step,
  settings,
  workspace,
  thickness,
  empty,
  busy,
  onChange,
  onRepick,
  onApply,
  onCancel,
}: {
  targetName: string;
  step: "pick" | "ready";
  settings: FaceToolSettings;
  workspace: WorkplaneWorkspaceSettings;
  /** How thick the body is behind the picked face; a pocket runs up to it. */
  thickness: number;
  /** The inset and the radius leave nothing of the face. */
  empty: boolean;
  busy: boolean;
  onChange: (patch: Partial<FaceToolSettings>) => void;
  onRepick: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("faceTool.title");
  const ready = step === "ready";
  const status = !ready ? t("faceTool.step.pick") : empty ? t("faceTool.empty") : t("faceTool.step.ready");
  const maxDepth = settings.direction === "in" ? Math.max(FACE_TOOL_MIN_DEPTH, Math.floor(thickness * 10) / 10) : FACE_TOOL_MAX_DEPTH / 2;

  return (
    <MovableToolPanel className="edge-modifier-panel" ariaLabel={title}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("faceTool.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="faceTool" />
          <button type="button" aria-label={t("faceTool.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <div className="edge-modifier-target">
        <strong>{targetName}</strong>
        <span role="status">{status}</span>
      </div>

      <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("faceTool.direction")}>
        <span>{t("faceTool.direction")}</span>
        <div className="shell-opening-options">
          {DIRECTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={settings.direction === option}
              className={settings.direction === option ? "active" : ""}
              onClick={() => onChange({ direction: option })}
            >
              {t(`faceTool.direction.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <EdgeModifierSlider
        label={t("faceTool.inset")}
        value={settings.inset}
        min={0}
        max={FACE_TOOL_MAX_INSET / 2}
        step={0.5}
        workspace={workspace}
        length
        onChange={(value) => onChange({ inset: value })}
      />
      <EdgeModifierSlider
        label={t("faceTool.radius")}
        value={settings.radius}
        min={0}
        max={FACE_TOOL_MAX_RADIUS / 2}
        step={0.5}
        workspace={workspace}
        length
        onChange={(value) => onChange({ radius: value })}
      />
      <EdgeModifierSlider
        label={t("faceTool.depth")}
        value={settings.depth}
        min={FACE_TOOL_MIN_DEPTH}
        max={maxDepth}
        step={0.2}
        workspace={workspace}
        length
        onChange={(value) => onChange({ depth: value })}
      />

      <label className="edge-modifier-check" title={t("faceTool.separateHint")}>
        <input type="checkbox" checked={settings.separate} onChange={(event) => onChange({ separate: event.currentTarget.checked })} />
        <span>{t("faceTool.separate")}</span>
      </label>

      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={ready ? onRepick : onCancel}>
          {ready ? t("faceTool.repick") : t("common.cancel")}
        </button>
        <button type="button" className="primary" disabled={!ready || empty || busy} onClick={onApply}>
          <Check size={17} />
          {t("faceTool.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
