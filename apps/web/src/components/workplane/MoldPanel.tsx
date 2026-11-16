"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolHelp, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { numberLocale, t } from "@/lib/i18n";
import { MOLD_DIE_MODES, MOLD_KINDS, MOLD_LIMITS, MOLD_MIN_STRONG_WALL, moldDieClearance, type MoldOptions } from "@/lib/moldTool";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

type Limited = keyof typeof MOLD_LIMITS;

/**
 * The mold and die tool: a two-part mold to cast in, a pour box for silicone, an open tray mold, or a punch and die for
 * sheet, made from the selected master and laid out beside it as they print. What each kind needs is shown for it.
 */
export function MoldPanel({
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
  settings: MoldOptions;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<MoldOptions>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("editor.tool.mold");
  const kind = settings.kind;
  const slider = (key: Limited, step: number, label = t(`mold.${key}`), unit?: string) => (
    <EdgeModifierSlider
      label={label}
      value={settings[key]}
      min={MOLD_LIMITS[key][0]}
      max={MOLD_LIMITS[key][1]}
      step={step}
      workspace={workspace}
      length={!unit}
      unit={unit}
      disabled={busy}
      onChange={(value) => onChange({ [key]: value } as Partial<MoldOptions>)}
    />
  );
  const check = (key: "keys" | "sprue" | "vents" | "ears" | "prySlots" | "pins", disabled = false) => (
    <label className="edge-modifier-field offset-copy">
      <input type="checkbox" checked={settings[key] && !disabled} disabled={busy || disabled} onChange={(event) => onChange({ [key]: event.target.checked } as Partial<MoldOptions>)} />
      <span>{t(`mold.${key}`)}</span>
    </label>
  );
  const clearance = moldDieClearance(settings.dieMode, settings.material).toLocaleString(numberLocale());
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel mold-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("mold.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink section="mold" />
          <button type="button" aria-label={t("mold.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("mold.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("mold.kind")}>
          <span>{t("mold.kind")}</span>
          <div className="shell-opening-options">
            {MOLD_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                className={kind === option ? "active" : ""}
                disabled={busy}
                onClick={() => onChange({ kind: option })}
              >
                {t(`mold.kind.${option}`)}
              </button>
            ))}
          </div>
          <ToolHint text={t(`mold.kindHint.${kind}`)} />
        </div>

        {kind === "twoPart" ? (<>
          <label className="edge-modifier-field offset-copy">
            <input type="checkbox" checked={settings.autoParting} disabled={busy} onChange={(event) => onChange({ autoParting: event.target.checked })} />
            <span>{t("mold.autoParting")}</span>
          </label>
          {settings.autoParting ? <ToolHint text={t("mold.autoPartingHint")} /> : (<>
            {slider("parting", 1, t("mold.parting"), "%")}
            <ToolHint text={t("mold.partingHint")} />
          </>)}
          {slider("wall", 0.5)}
          {settings.wall < MOLD_MIN_STRONG_WALL ? <ToolHint text={t("mold.warning.thinWall")} /> : null}
          {check("keys")}
          {check("sprue")}
          {check("vents", !settings.sprue)}
          {check("prySlots")}
          {check("ears")}
        </>) : null}

        {kind === "box" ? (<>
          {slider("gap", 0.5)}
          <ToolHint text={t("mold.gapHint")} />
          {slider("above", 0.5)}
          {slider("wall", 0.5, t("mold.frameWall"))}
          {slider("floor", 0.5, t("mold.basePlate"))}
        </>) : null}

        {kind === "tray" ? (<>
          {slider("wall", 0.5)}
          {settings.wall < MOLD_MIN_STRONG_WALL ? <ToolHint text={t("mold.warning.thinWall")} /> : null}
          {slider("floor", 0.5)}
        </>) : null}

        {kind === "die" ? (<>
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("mold.dieMode")}>
            <span>{t("mold.dieMode")}</span>
            <div className="shell-opening-options">
              {MOLD_DIE_MODES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={settings.dieMode === option}
                  className={settings.dieMode === option ? "active" : ""}
                  disabled={busy}
                  onClick={() => onChange({ dieMode: option })}
                >
                  {t(`mold.dieMode.${option}`)}
                </button>
              ))}
            </div>
          </div>
          {slider("material", 0.1)}
          <ToolHint text={t(settings.dieMode === "form" ? "mold.clearanceForm" : "mold.clearanceCut", { mm: clearance })} />
          {slider("depth", 0.5)}
          {slider("base", 0.5)}
          {check("pins")}
        </>) : null}

        {kind === "twoPart" || kind === "tray" ? <ToolHint text={t("mold.heatHint")} /> : null}
        {kind === "box" ? <ToolHint text={t("mold.siliconeHint")} /> : null}
      </ToolSection>

      {kind === "twoPart" ? (
        <ToolAdvanced tool="mold" summary={t("mold.advancedTwoPart")}>
          {settings.keys ? (<>{slider("keySize", 0.5)}{slider("keyFit", 0.05)}</>) : null}
          {settings.sprue ? slider("sprueDiameter", 0.5) : null}
          {settings.sprue && settings.vents ? slider("ventDiameter", 0.5) : null}
          {settings.ears ? slider("boltDiameter", 0.1) : null}
        </ToolAdvanced>
      ) : null}
      {kind === "die" ? (
        <ToolAdvanced tool="mold" summary={t("mold.advancedDie")}>
          {settings.dieMode === "form" ? (<>{slider("rounding", 0.1)}<ToolHint text={t("mold.roundingHint")} /></>) : null}
          {settings.pins ? (<>{slider("pinDiameter", 0.5)}{slider("pinFit", 0.05)}</>) : null}
        </ToolAdvanced>
      ) : null}

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : busy ? <ToolStatus state="working" text={t("mold.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("mold.apply")} busy={busy} busyLabel={t("mold.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
