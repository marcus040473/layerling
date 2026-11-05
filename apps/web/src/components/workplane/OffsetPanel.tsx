"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeFeatureHistory, EdgeModifierSlider, type EdgeHistoryOption } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolHelp, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { cadModifierUserErrorMessage } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { ShellEdges, WorkplaneWorkspaceSettings } from "@/types/layerling";

const OFFSET_EDGES: readonly ShellEdges[] = ["round", "sharp"];
export const MIN_OFFSET = 0.01;
export const MAX_OFFSET = 10;
const OFFSET_STEP = 0.05;

/**
 * Offset (#919): every face of a body moves along its normal by one distance - out for the clearance of a
 * press fit (the body grown, kept as a hole to cut with), in for a shrunk one. Hollowing's other half.
 */
export function OffsetPanel({
  targetName,
  distance,
  shrink,
  sideways,
  keepCopy,
  edges,
  workspace,
  busy,
  error,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  onRemoveFeature,
  onEditFeature,
  onDistanceChange,
  onShrinkChange,
  onSidewaysChange,
  onKeepCopyChange,
  onEdgesChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  distance: number;
  shrink: boolean;
  /** Only the sides move (#1057): the body keeps its height. */
  sideways: boolean;
  keepCopy: boolean;
  edges: ShellEdges;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  /** The treatments the body already has, to revert or edit (#237). */
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  onRemoveFeature: (id: string) => void;
  onEditFeature?: (id: string) => void;
  onDistanceChange: (value: number) => void;
  onShrinkChange: (value: boolean) => void;
  onSidewaysChange: (value: boolean) => void;
  onKeepCopyChange: (value: boolean) => void;
  onEdgesChange: (value: ShellEdges) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("offset.title");
  // What the folded part holds, in a line: the outer corners, and the sides only when it is ticked.
  const summary = [t("offset.edges"), t("offset.sideways")].join(", ");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("offset.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink section="offset" />
          <button type="button" aria-label={t("offset.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("offset.help")}</ToolHelp>
        <EdgeFeatureHistory
          appliedFeatureCount={appliedFeatureCount}
          reversibleFeatureCount={reversibleFeatureCount}
          historyOptions={historyOptions}
          onRemoveFeature={onRemoveFeature}
          onEditFeature={onEditFeature}
        />
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("offset.direction")}>
          <span>{t("offset.direction")}</span>
          <div className="shell-opening-options">
            {[false, true].map((option) => (
              <button
                key={String(option)}
                type="button"
                role="radio"
                aria-checked={shrink === option}
                className={shrink === option ? "active" : ""}
                disabled={busy}
                onClick={() => onShrinkChange(option)}
              >
                {t(option ? "offset.shrink" : "offset.grow")}
              </button>
            ))}
          </div>
        </div>

        <EdgeModifierSlider
          label={t("offset.distance")}
          primary
          value={distance}
          min={MIN_OFFSET}
          max={MAX_OFFSET}
          step={OFFSET_STEP}
          workspace={workspace}
          length
          disabled={busy}
          onChange={onDistanceChange}
        />

        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={keepCopy} disabled={busy} onChange={(event) => onKeepCopyChange(event.target.checked)} />
          <span>{t("offset.copy")}</span>
        </label>
      </ToolSection>

      <ToolAdvanced tool="offset" summary={summary}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("offset.edges")}>
          <span>{t("offset.edges")}</span>
          <div className="shell-opening-options">
            {OFFSET_EDGES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={edges === option}
                className={edges === option ? "active" : ""}
                disabled={busy}
                onClick={() => onEdgesChange(option)}
              >
                {t(`shell.edges.${option}`)}
              </button>
            ))}
          </div>
          <ToolHint text={t("offset.edgesHint")} />
        </div>

        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={sideways} disabled={busy} onChange={(event) => onSidewaysChange(event.target.checked)} />
          <span>{t("offset.sideways")}</span>
        </label>
      </ToolAdvanced>

      {error ? <div className="edge-modifier-error" role="alert">{cadModifierUserErrorMessage(error)}</div> : busy ? <ToolStatus state="working" text={t("offset.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("offset.apply")} busy={busy} busyLabel={t("offset.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
