"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { ArrowLeftRight, X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolApply, ToolCancel, ToolHelp, ToolHint, ToolOutcome, ToolSection, ToolStatus } from "@/components/workplane/ToolPanelParts";
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
/** The colours of the two roles, in the rows and on the bodies in the view. */
export const CUT_OUT_ROLE_COLORS = { part: "#14a3a8", host: "#8b5cf6" } as const;

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
}) {
  useLanguage();
  const title = t("cutOut.title");
  // Each role in its colour, here and on its body in the view, as long as the tool is open.
  const role = (which: "part" | "host", label: string, name: string, note: string) => (
    <div className={`cut-out-role ${which}`}>
      <span className="cut-out-swatch" style={{ background: CUT_OUT_ROLE_COLORS[which] }} aria-hidden="true" />
      <span className="cut-out-role-text">
        <span className="cut-out-role-label">{label}</span>
        <strong>{name}</strong>
        <small>{note}</small>
      </span>
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
          <ToolDockToggle />
          <GuideHelpLink section="cutOut" />
          <button type="button" aria-label={t("cutOut.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <div className="cut-out-roles">
          {role("part", t("cutOut.part"), partName, t("cutOut.partNote"))}
          {role("host", t("cutOut.host"), hostName, t("cutOut.hostNote"))}
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
        <ToolHint text={t("cutOut.clearanceHint")} />
      </ToolSection>

      {error ? <div className="edge-modifier-error" role="alert">{cadModifierUserErrorMessage(error)}</div> : busy ? <ToolStatus state="working" text={t("cutOut.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolOutcome text={t("cutOut.outcome", { host: hostName, part: partName })} />
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("cutOut.apply")} busy={busy} busyLabel={t("cutOut.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
