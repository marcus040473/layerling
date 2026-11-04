"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeFeatureHistory, type EdgeHistoryOption } from "@/components/workplane/EdgeModifierPanel";
import { ToolApply, ToolCancel, ToolHelp, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { cadModifierUserErrorMessage } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Deleting faces of a body (#451): the faces are clicked on the body, the
 * panel counts them, and Delete lets the faces around them close the gap.
 */
export function DeleteFacePanel({
  targetName,
  faceCount,
  thinCount,
  preparing,
  busy,
  error,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  onRemoveFeature,
  onClear,
  onApply,
  onCancel,
}: {
  targetName: string;
  faceCount: number;
  /** Hair-thin faces that go with the picked ones (cadThinFaces). */
  thinCount: number;
  /** The worker is still reading the body's faces. */
  preparing: boolean;
  busy: boolean;
  error: string | null;
  /** The treatments the body already has, to revert. */
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  onRemoveFeature: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("deleteFace.title");
  const count = faceCount === 0 ? t("deleteFace.countNone") : faceCount === 1 ? t("deleteFace.countOne") : t("deleteFace.countMany", { count: faceCount });
  return (
    <MovableToolPanel className="edge-modifier-panel delete-face-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("deleteFace.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="deleteFace" />
          <button type="button" aria-label={t("deleteFace.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready={faceCount > 0} confirm text={preparing ? t("deleteFace.preparing") : count} detail={targetName} />
        {thinCount > 0 ? <div className="edge-modifier-selection-help">{thinCount === 1 ? t("deleteFace.thinOne") : t("deleteFace.thinMany", { count: thinCount })}</div> : null}
        <ToolHelp>{t("deleteFace.help")}</ToolHelp>
        <div className="edge-modifier-quick-actions">
          <button type="button" disabled={busy || faceCount === 0} onClick={onClear}>{t("edge.clear")}</button>
        </div>
        <EdgeFeatureHistory
          appliedFeatureCount={appliedFeatureCount}
          reversibleFeatureCount={reversibleFeatureCount}
          historyOptions={historyOptions}
          onRemoveFeature={onRemoveFeature}
        />
      </ToolSection>

      {error ? <div className="edge-modifier-error" role="alert">{cadModifierUserErrorMessage(error)}</div> : (
        <ToolStatus
          state={preparing || busy ? "working" : faceCount === 0 ? "needed" : "ready"}
          text={preparing ? t("deleteFace.preparing") : busy ? t("deleteFace.working") : faceCount === 0 ? t("toolSidebar.waiting") : t("toolSidebar.ready")}
        />
      )}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("deleteFace.apply")} busy={busy} busyLabel={t("deleteFace.working")} danger disabled={busy || preparing || faceCount === 0} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
