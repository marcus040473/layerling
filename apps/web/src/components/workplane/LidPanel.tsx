"use client";

import { useState } from "react";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolGroup, ToolHelp, ToolHint, ToolOutcome, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import {
  LID_FITS,
  LID_MAGNET_SIZES,
  LID_TYPES,
  MAX_LID_DEPTH,
  MAX_LID_GAP,
  MAX_LID_THICKNESS,
  MAX_LID_WALL,
  MAX_MAGNET_DIAMETER,
  MAX_MAGNET_GAP,
  MAX_MAGNET_HEIGHT,
  MIN_LID_DEPTH,
  MIN_LID_THICKNESS,
  MIN_LID_WALL,
  MIN_MAGNET_DIAMETER,
  MIN_MAGNET_HEIGHT,
  lidThicknessForMagnets,
  type LidOptions,
} from "@/lib/lidTool";
import { numberLocale, t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * A lid for a body open at the top (#1009): pushed into the opening, put over the outside, gripping the wall from both
 * sides (#1062) or laid flat on it. It comes out as a body of its own beside the one it closes, ready to print. With
 * magnets, it holds by four round magnets in the corners, in pockets in the body's rim and in the lid.
 */
export function LidPanel({
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
  settings: LidOptions;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<LidOptions>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("lid.title");
  // A magnet needs its pocket and a skin above it in the plate: a thinner plate is made thick enough for it.
  // Raised, it says so under the plate's thickness until that is set by hand; set thinner by hand, it says what is needed.
  const [raised, setRaised] = useState(false);
  const withMagnet = (patch: Partial<LidOptions>) => {
    const next = { ...settings, ...patch };
    const thickness = lidThicknessForMagnets(next);
    const raise = next.magnets && settings.thickness < thickness;
    if (raise) setRaised(true);
    onChange(raise ? { ...patch, thickness } : patch);
  };
  const needed = lidThicknessForMagnets(settings);
  const tooThin = settings.magnets && settings.thickness < needed - 1e-9;
  const millimetres = (value: number) => value.toLocaleString(numberLocale());
  const slider = (label: string, key: "gap" | "depth" | "wall" | "magnetDiameter" | "magnetHeight" | "magnetGap", min: number, max: number, step: number) => (
    <EdgeModifierSlider
      label={label}
      value={settings[key]}
      min={min}
      max={max}
      step={step}
      workspace={workspace}
      length
      disabled={busy}
      onChange={(value) => (key === "magnetDiameter" || key === "magnetHeight" ? withMagnet({ [key]: value }) : onChange({ [key]: value }))}
    />
  );
  const lipped = settings.type !== "flat";
  // Folded, Advanced names what it holds: the gap and the lip or rim, and the magnet's size and play.
  const summary = [
    ...(lipped ? [t("lid.gap"), t(settings.type === "cap" ? "lid.depthCap" : settings.type === "both" ? "lid.depthBoth" : "lid.depth"), t(settings.type === "cap" ? "lid.wallCap" : settings.type === "both" ? "lid.wallBoth" : "lid.wall")] : []),
    ...(settings.magnets ? [t("lid.magnetDiameter"), t("lid.magnetHeight"), t("lid.magnetGap")] : []),
  ].join(", ");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel lid-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("lid.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="lid" />
          <button type="button" aria-label={t("lid.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("lid.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.type")}>
          <span>{t("lid.type")}</span>
          <div className="shell-opening-options">
            {LID_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={settings.type === option}
                className={settings.type === option ? "active" : ""}
                title={t(`lid.type.${option}Hint`)}
                disabled={busy}
                onClick={() => onChange({ type: option })}
              >
                {t(`lid.type.${option}`)}
              </button>
            ))}
          </div>
        </div>
        <ToolHint text={t(`lid.type.${settings.type}Hint`)} />

        <EdgeModifierSlider
          label={t("lid.thickness")}
          primary
          value={settings.thickness}
          min={MIN_LID_THICKNESS}
          max={MAX_LID_THICKNESS}
          step={0.2}
          workspace={workspace}
          length
          disabled={busy}
          onChange={(value) => {
            setRaised(false);
            onChange({ thickness: value });
          }}
        />
        {tooThin ? (
          <span className="shell-openings-summary" role="status">{t("lid.error.magnetsThinLid", { thickness: millimetres(needed) })}</span>
        ) : settings.magnets && raised ? (
          <span className="shell-openings-summary" role="status">{t("lid.magnetsThicknessRaised", { thickness: millimetres(settings.thickness) })}</span>
        ) : null}

        {lipped ? (
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.fit")}>
            <span>{t("lid.fit")}</span>
            <div className="shell-opening-options">
              {LID_FITS.map((fit, index) => (
                <button
                  key={fit}
                  type="button"
                  role="radio"
                  aria-checked={Math.abs(settings.gap - fit) < 1e-9}
                  className={Math.abs(settings.gap - fit) < 1e-9 ? "active" : ""}
                  disabled={busy}
                  onClick={() => onChange({ gap: fit })}
                >
                  {t((["lid.fit.tight", "lid.fit.normal", "lid.fit.loose"] as const)[index], { gap: fit.toLocaleString(numberLocale()) })}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <ToolGroup
          tool="lid-magnets"
          label={t("lid.magnets")}
          checked={settings.magnets}
          disabled={busy}
          summary={`${t("lid.magnetSizeOption", { diameter: millimetres(settings.magnetDiameter), height: millimetres(settings.magnetHeight) })} mm`}
          onCheck={(magnets) => withMagnet({ magnets })}
        >
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.magnetSize")}>
            <span>{t("lid.magnetSize")}</span>
            <div className="shell-opening-options">
              {LID_MAGNET_SIZES.map(({ diameter, height }) => {
                const active = Math.abs(settings.magnetDiameter - diameter) < 1e-9 && Math.abs(settings.magnetHeight - height) < 1e-9;
                return (
                  <button
                    key={`${diameter}x${height}`}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={active ? "active" : ""}
                    disabled={busy}
                    onClick={() => withMagnet({ magnetDiameter: diameter, magnetHeight: height })}
                  >
                    {t("lid.magnetSizeOption", { diameter: millimetres(diameter), height: millimetres(height) })}
                  </button>
                );
              })}
            </div>
            <ToolHint text={t("lid.magnetsHint")} />
          </div>
        </ToolGroup>
      </ToolSection>

      {summary ? (
        <ToolAdvanced tool="lid" summary={summary}>
          {lipped ? (<>
            {slider(t("lid.gap"), "gap", 0, MAX_LID_GAP, 0.05)}
            {slider(t(settings.type === "cap" ? "lid.depthCap" : settings.type === "both" ? "lid.depthBoth" : "lid.depth"), "depth", MIN_LID_DEPTH, MAX_LID_DEPTH, 0.5)}
            {slider(t(settings.type === "cap" ? "lid.wallCap" : settings.type === "both" ? "lid.wallBoth" : "lid.wall"), "wall", MIN_LID_WALL, MAX_LID_WALL, 0.2)}
          </>) : null}
          {settings.magnets ? (<>
            {slider(t("lid.magnetDiameter"), "magnetDiameter", MIN_MAGNET_DIAMETER, MAX_MAGNET_DIAMETER, 0.5)}
            {slider(t("lid.magnetHeight"), "magnetHeight", MIN_MAGNET_HEIGHT, MAX_MAGNET_HEIGHT, 0.5)}
            {slider(t("lid.magnetGap"), "magnetGap", 0, MAX_MAGNET_GAP, 0.05)}
          </>) : null}
        </ToolAdvanced>
      ) : null}

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : busy ? <ToolStatus state="working" text={t("lid.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolOutcome text={t("lid.outcome")} />
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("lid.apply")} busy={busy} busyLabel={t("lid.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
