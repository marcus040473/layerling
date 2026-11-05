"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolHelp, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * What the panel sets before a cutter is built (#982): whether bridges or a plate hold the inner walls and how thick the plate
 * is, how big the fillets are, how much lower the inner walls are, so they press in instead of cutting out, and whether the
 * outline is mirrored. Wall, height, rim and cutting edge stay under Properties, part by part, once it is built.
 */
export type CookieCutterSettings = {
  support: "bridges" | "plate";
  plate: number;
  fillet: number;
  imprint: number;
  mirror: boolean;
};

export const COOKIE_CUTTER_SETTINGS_DEFAULTS: CookieCutterSettings = { support: "bridges", plate: 1, fillet: 1, imprint: 0, mirror: true };

const SUPPORTS: readonly CookieCutterSettings["support"][] = ["bridges", "plate"];

export function CookieCutterPanel({
  targetName,
  settings,
  workspace,
  busy,
  error,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  settings: CookieCutterSettings;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<CookieCutterSettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("editor.tool.cookieCutter");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel cookie-cutter-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("cookieCutter.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink chapter="solids" section="intersection" />
          <button type="button" aria-label={t("cookieCutter.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("cookieCutter.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("cookieCutter.support")}>
          <span>{t("cookieCutter.support")}</span>
          <div className="shell-opening-options">
            {SUPPORTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={settings.support === option}
                className={settings.support === option ? "active" : ""}
                disabled={busy}
                onClick={() => onChange({ support: option })}
              >
                {t(`cookieCutter.support.${option}`)}
              </button>
            ))}
          </div>
          <ToolHint text={t(settings.support === "plate" ? "cookieCutter.supportPlateHint" : "cookieCutter.supportBridgesHint")} />
        </div>

        {settings.support === "plate" ? (
          <EdgeModifierSlider
            label={t("cookieCutter.plate")}
            value={settings.plate}
            min={0.4}
            max={5}
            step={0.1}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onChange({ plate: value })}
          />
        ) : null}

        <EdgeModifierSlider
          label={t("cookieCutter.imprint")}
          value={settings.imprint}
          min={0}
          max={12}
          step={0.5}
          workspace={workspace}
          length
          disabled={busy}
          onChange={(value) => onChange({ imprint: value })}
        />
        <ToolHint text={t("cookieCutter.imprintHint")} />

        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={settings.mirror} disabled={busy} onChange={(event) => onChange({ mirror: event.target.checked })} />
          <span>{t("cookieCutter.mirror")}</span>
        </label>
      </ToolSection>

      <ToolAdvanced tool="cookieCutter" summary={t("cookieCutter.fillet")}>
        <EdgeModifierSlider
          label={t("cookieCutter.fillet")}
          value={settings.fillet}
          min={0}
          max={3}
          step={0.1}
          workspace={workspace}
          length
          disabled={busy}
          onChange={(value) => onChange({ fillet: value })}
        />
        <ToolHint text={t("cookieCutter.filletHint")} />
      </ToolAdvanced>

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : busy ? <ToolStatus state="working" text={t("cookieCutter.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("cookieCutter.apply")} busy={busy} busyLabel={t("cookieCutter.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
