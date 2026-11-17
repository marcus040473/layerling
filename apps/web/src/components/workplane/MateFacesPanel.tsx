"use client";

import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolApply, ToolCancel, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { MateAxes, MateMode } from "@/lib/mateFaces";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

const MATE_MODES: readonly MateMode[] = ["against", "flush", "concentric", "point"];
const MATE_AXES = ["x", "y", "z"] as const;
const MAX_GAP = 100;

/**
 * "Align faces": a face of the selected body is brought into the plane of a
 * face of another body, face to face or side by side, with a gap if wanted;
 * or a round face onto the axis of a round face of another body (#794);
 * or a point of it onto a point of another body, along the axes switched on
 * (Discussion #1491). After the first pair of points, a second pair turns the
 * body about the first point and a third about the line through both.
 */
export function MateFacesPanel({
  targetName,
  step,
  mode,
  gap,
  axes,
  pair = 1,
  workspace,
  onModeChange,
  onGapChange,
  onAxesChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  step: "source" | "target" | "ready";
  mode: MateMode;
  gap: number;
  axes: MateAxes;
  /** Which pair of points "Point to point" is at: 2 and 3 turn the body instead of moving it. */
  pair?: 1 | 2 | 3;
  workspace: WorkplaneWorkspaceSettings;
  onModeChange: (value: MateMode) => void;
  onGapChange: (value: number) => void;
  onAxesChange: (value: MateAxes) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("mate.title");
  // Pairs 2 and 3 of "Point to point" turn the body instead of moving it.
  const turnPair = mode === "point" && pair !== 1 ? pair : null;
  const turning = turnPair !== null;
  const stepText = t(mode === "concentric" ? `mate.stepRound.${step}` : mode === "point" ? (turnPair ? `mate.stepPoint${turnPair}.${step}` : `mate.stepPoint.${step}`) : `mate.step.${step}`);
  const noAxis = mode === "point" && !(axes.x || axes.y || axes.z);
  const ready = step === "ready" && !noAxis;
  return (
    <MovableToolPanel className="edge-modifier-panel mate-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("mate.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink section="layFlat" />
          <button type="button" aria-label={t("mate.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready={step === "ready"} confirm text={targetName} detail={stepText} />
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("mate.mode")}>
          <span>{t("mate.mode")}</span>
          <div className="shell-opening-options">
            {MATE_MODES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                className={mode === option ? "active" : ""}
                onClick={() => onModeChange(option)}
              >
                {t(`mate.mode.${option}`)}
              </button>
            ))}
          </div>
        </div>

        {turning ? null : mode === "point" ? (
          <div className="edge-modifier-field shell-openings" role="group" aria-label={t("mate.axes")}>
            <span>{t("mate.axes")}</span>
            <div className="shell-opening-options punch-axis-options">
              {MATE_AXES.map((axis) => (
                <button
                  key={axis}
                  type="button"
                  aria-pressed={axes[axis]}
                  className={axes[axis] ? "active" : ""}
                  // One axis at least stays on: with none the body would not move at all.
                  onClick={() => {
                    const next = { ...axes, [axis]: !axes[axis] };
                    if (next.x || next.y || next.z) onAxesChange(next);
                  }}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ) : mode === "concentric" ? null : (
          <EdgeModifierSlider
            label={t("mate.gap")}
            value={gap}
            min={0}
            max={MAX_GAP}
            step={0.1}
            workspace={workspace}
            length
            onChange={onGapChange}
          />
        )}
        {mode === "point" ? <ToolHint text={t(turnPair ? `mate.turnHint${turnPair}` : "mate.axesHint")} /> : null}
      </ToolSection>

      <ToolStatus state={ready ? "ready" : "needed"} text={ready ? t("toolSidebar.ready") : t("toolSidebar.waiting")} />
      <div className="edge-modifier-footer">
        {turning ? <ToolCancel label={t("mate.done")} onClick={onCancel} /> : <ToolCancel onClick={onCancel} />}
        <ToolApply label={t(turning ? "mate.turn" : "mate.apply")} disabled={!ready} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
