"use client";

import { useEffect, useRef } from "react";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { ArrowLeftRight, Check, LoaderCircle, X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolHelp, ToolSection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { cadModifierUserErrorMessage } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export const MAX_CUT_OUT_CLEARANCE = 10;
const CUT_OUT_STEP = 0.05;

/**
 * Cut out (#927): two solids, one of them a part that has to fit into the other (a shaft in a collar, a
 * bolt in a case). A copy of the part, grown by the clearance, is cut out of the other body; the part stays.
 */
export function CutOutPanel({
  partName,
  hostName,
  clearance,
  workspace,
  busy,
  error,
  onClearanceChange,
  onSwap,
  onApply,
  onCancel,
  onHighlight,
}: {
  partName: string;
  hostName: string;
  clearance: number;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onClearanceChange: (value: number) => void;
  onSwap: () => void;
  onApply: () => void;
  onCancel: () => void;
  /** Outlines the body of a role in the view while the pointer is on its row; null takes it off. */
  onHighlight?: (role: "part" | "host" | null) => void;
}) {
  useLanguage();
  const title = t("cutOut.title");
  const highlightRef = useRef(onHighlight);
  highlightRef.current = onHighlight;
  useEffect(() => () => highlightRef.current?.(null), []);
  const role = (which: "part" | "host", label: string, name: string) => (
    <div
      className={`cut-out-role ${which}`}
      onMouseEnter={() => onHighlight?.(which)}
      onMouseLeave={() => onHighlight?.(null)}
    >
      <span className="cut-out-role-label">{label}</span>
      <strong>{name}</strong>
    </div>
  );
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("cutOut.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="cutOut" />
          <button type="button" aria-label={t("cutOut.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <div className="cut-out-roles">
          {role("part", t("cutOut.part"), partName)}
          {role("host", t("cutOut.host"), hostName)}
          <button type="button" className="cut-out-swap" disabled={busy} onClick={onSwap}>
            <ArrowLeftRight size={16} /> {t("cutOut.swap")}
          </button>
        </div>
        <ToolHelp>{t("cutOut.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <EdgeModifierSlider
          label={t("cutOut.clearance")}
          value={clearance}
          min={0}
          max={MAX_CUT_OUT_CLEARANCE}
          step={CUT_OUT_STEP}
          workspace={workspace}
          length
          disabled={busy}
          onChange={onClearanceChange}
        />
        <span className="shell-openings-summary">{t("cutOut.clearanceHint")}</span>
      </ToolSection>

      {error ? <div className="edge-modifier-error" role="alert">{cadModifierUserErrorMessage(error)}</div> : busy ? <ToolStatus state="working" text={t("cutOut.working")} /> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("cutOut.working") : t("cutOut.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
