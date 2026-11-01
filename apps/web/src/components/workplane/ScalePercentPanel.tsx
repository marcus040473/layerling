"use client";

import { X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { ToolApply, ToolCancel, ToolHelp, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { t } from "@/lib/i18n";
import { isUnchangedPercent, type ScaleByPercentMode } from "@/lib/scaleByPercent";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

export type ScalePercentSettings = { percent: number; mode: ScaleByPercentMode };

const MODES: readonly ScaleByPercentMode[] = ["together", "each"];

/**
 * Scaling the selection by a percentage, the same in every direction (#179). Several parts grow
 * together, as one, or each where it stands. Nothing changes until "Scale".
 */
export function ScalePercentPanel({
  targetName,
  count,
  settings,
  workspace,
  error,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  count: number;
  settings: ScalePercentSettings;
  workspace: WorkplaneWorkspaceSettings;
  /** Why the last try did not go through, already in words. */
  error: string | null;
  onChange: (patch: Partial<ScalePercentSettings>) => void;
  /** With a percentage when Enter in the field applies it, before the state holds the typed value. */
  onApply: (percent?: number) => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("scalePercent.title");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel scale-percent-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("scalePercent.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="scaleByPercent" />
          <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready={count > 0} text={targetName} />
        <ToolHelp>{t("scalePercent.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <EdgeModifierSlider
          label={t("scalePercent.percent")}
          value={settings.percent}
          min={5}
          max={500}
          step={1}
          decimals={2}
          unit="%"
          workspace={workspace}
          autoFocus
          onEnter={(value) => { if (!isUnchangedPercent(value)) onApply(value); }}
          onChange={(value) => onChange({ percent: value })}
        />

        {count > 1 ? (
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("scalePercent.mode")}>
            <span>{t("scalePercent.mode")}</span>
            <div className="shell-opening-options">
              {MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={settings.mode === option}
                  className={settings.mode === option ? "active" : ""}
                  title={t(`scalePercent.mode.${option}Hint`)}
                  onClick={() => onChange({ mode: option })}
                >
                  {t(`scalePercent.mode.${option}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </ToolSection>

      {error ? <p className="edge-modifier-error" role="alert">{error}</p> : isUnchangedPercent(settings.percent) ? (
        <ToolStatus state="needed" text={t("toolSidebar.nothingToApply")} />
      ) : null}

      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("scalePercent.apply")} disabled={isUnchangedPercent(settings.percent)} onClick={() => onApply()} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
