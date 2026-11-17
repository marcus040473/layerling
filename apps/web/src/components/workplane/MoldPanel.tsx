"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolHelp, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { numberLocale, t } from "@/lib/i18n";
import { formatClearanceLength } from "@/components/workplane/ClearancePanel";
import { findingKindName, findingRemedy, findingValueText } from "@/components/workplane/findingText";
import { formatPrintCheckArea } from "@/components/workplane/PrintCheckPanel";
import { formatEstimateNumber } from "@/lib/editorBooleans";
import {
  MOLD_CAST_MATERIAL_DATA, MOLD_CAST_MATERIALS, MOLD_DIE_MODES, MOLD_DIRECTIONS, MOLD_KINDS, MOLD_LIMITS, MOLD_MIN_STRONG_WALL, MOLD_ML_PER_US_FL_OZ, MOLD_OUTERS,
  MOLD_OUTPUTS, moldDieClearance, type MoldAnalysis, type MoldOptions,
} from "@/lib/moldTool";
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
  analysis = null,
  analysing = false,
  regenerateOf = null,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  settings: MoldOptions;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  /** The live check of a two-part mold, while its settings change; null before the first. */
  analysis?: MoldAnalysis | null;
  analysing?: boolean;
  /** The master's name when the panel was opened from a part of an earlier mold, to make it again. */
  regenerateOf?: string | null;
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
  const radio = <K extends "kind" | "dieMode" | "direction" | "castMaterial" | "outer" | "output">(key: K, options: readonly MoldOptions[K][], label: (option: MoldOptions[K]) => string, extra?: (option: MoldOptions[K]) => string | null) => (
    <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t(`mold.${key}`)}>
      <span>{t(`mold.${key}`)}</span>
      <div className="shell-opening-options">
        {options.map((option) => {
          const more = extra?.(option);
          return (
            <button
              key={String(option)}
              type="button"
              role="radio"
              aria-checked={settings[key] === option}
              className={settings[key] === option ? "active" : ""}
              disabled={busy}
              onClick={() => onChange({ [key]: option } as Partial<MoldOptions>)}
            >
              {label(option)}{more ? <small className="mold-option-figure"> {more}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
  const ratingOf = (axis: string) => analysis?.ratings.find((rating) => rating.axis === axis);
  const percent = (value: number) => formatEstimateNumber(value, value < 10 ? 1 : 0);
  const best = analysis ? [...analysis.ratings].sort((a, b) => a.undercutMm2 - b.undercutMm2 || b.partingArea - a.partingArea)[0] : null;
  const length = (mm: number) => formatClearanceLength(mm, workspace);
  const vents = analysis?.highPoints.filter((point) => !point.sprue) ?? [];
  const check = (key: "keys" | "sprue" | "vents" | "ears" | "prySlots" | "pins" | "screws" | "bands", disabled = false) => (
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
          {radio("castMaterial", MOLD_CAST_MATERIALS, (option) => t(`mold.castMaterial.${option}`))}
          <ToolHint text={t("mold.castMaterialHint")} />
          {radio("direction", MOLD_DIRECTIONS, (option) => t(option === "auto" ? "mold.direction.auto" : `mold.direction.${option}`), (option) => {
            const rating = option === "auto" ? best : ratingOf(option);
            return rating ? t("mold.directionValue", { percent: percent(rating.undercutPercent) }) : null;
          })}
          {best ? <ToolHint text={t("mold.directionHint", { direction: t(`mold.direction.${best.axis}`) })} /> : null}
          <label className="edge-modifier-field offset-copy">
            <input type="checkbox" checked={settings.autoParting} disabled={busy} onChange={(event) => onChange({ autoParting: event.target.checked })} />
            <span>{t("mold.autoParting")}</span>
          </label>
          {settings.autoParting ? <ToolHint text={t("mold.autoPartingHint")} /> : (<>
            {slider("parting", 1, t("mold.parting"), "%")}
            <ToolHint text={t("mold.partingHint")} />
          </>)}
          {radio("outer", MOLD_OUTERS, (option) => t(`mold.outer.${option}`))}
          <ToolHint text={t(`mold.outerHint.${settings.outer}`)} />
          {slider("wall", 0.5)}
          {settings.wall < MOLD_MIN_STRONG_WALL ? <ToolHint text={t("mold.warning.thinWall")} /> : null}
          {check("keys")}
          {check("sprue")}
          {check("vents", !settings.sprue)}
          {settings.sprue && settings.vents && analysis ? (
            <div className="edge-modifier-field mold-vents" role="group" aria-label={t("mold.vents.title")}>
              <span>{t("mold.vents.title")}</span>
              {vents.length ? vents.map((point, index) => (
                <label key={index} className="offset-copy">
                  <input
                    type="checkbox"
                    checked={!settings.ventsOff.includes(index)}
                    disabled={busy}
                    onChange={(event) => onChange({ ventsOff: event.target.checked ? settings.ventsOff.filter((value) => value !== index) : [...settings.ventsOff, index] })}
                  />
                  <span>{t("mold.vents.item", { number: index + 1 })}</span>
                </label>
              )) : <small>{t("mold.vents.none")}</small>}
            </div>
          ) : null}
          {check("prySlots")}
          {check("ears")}
          {check("screws")}
          {settings.outer === "block" ? check("bands") : null}
          {slider("shrinkage", 0.05, t("mold.shrinkage"), "%")}
          <ToolHint text={t("mold.shrinkageHint")} />
          {radio("output", MOLD_OUTPUTS, (option) => t(`mold.output.${option}`))}
          <ToolHint text={t(`mold.outputHint.${settings.output}`)} />
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
          <ToolHint text={t(settings.dieMode === "cut" ? "mold.clearanceCut" : "mold.clearanceForm", { mm: clearance })} />
          {settings.dieMode === "relief" ? <ToolHint text={t("mold.reliefHint")} /> : slider("depth", 0.5)}
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
          {settings.screws ? slider("screwDiameter", 0.1) : null}
          {settings.sprue ? (<>{slider("sprueShiftX", 0.5)}{slider("sprueShiftY", 0.5)}</>) : null}
          {MOLD_CAST_MATERIAL_DATA[settings.castMaterial].rigid ? slider("draftLimit", 0.5, t("mold.draftLimit"), "°") : null}
          {slider("density", 0.05, t("mold.density"), "g/cm³")}
        </ToolAdvanced>
      ) : null}
      {kind === "die" ? (
        <ToolAdvanced tool="mold" summary={t("mold.advancedDie")}>
          {settings.dieMode === "form" ? (<>{slider("rounding", 0.1)}<ToolHint text={t("mold.roundingHint")} /></>) : null}
          {settings.pins ? (<>{slider("pinDiameter", 0.5)}{slider("pinFit", 0.05)}</>) : null}
        </ToolAdvanced>
      ) : null}

      {kind === "twoPart" ? (
        <ToolSection title={t("mold.analysis")}>
          {analysing && !analysis ? <ToolStatus state="working" text={t("mold.analysis.running")} /> : null}
          {analysis ? (
            <div className={`mold-analysis${analysing ? " stale" : ""}`} aria-live="polite">
              <p>{t("mold.analysis.outer", { x: formatEstimateNumber(analysis.outer[0], 1), y: formatEstimateNumber(analysis.outer[1], 1), z: length(analysis.outer[2]) })}</p>
              <p>{t("mold.analysis.volume", { ml: formatEstimateNumber(analysis.volume, 1), oz: formatEstimateNumber(analysis.volume / MOLD_ML_PER_US_FL_OZ, 2) })} · {t("mold.analysis.weight", { g: formatEstimateNumber(analysis.weightG, 0) })}</p>
              <p>{analysis.rating.undercutMm2 >= 5
                ? t("mold.analysis.undercut", { area: formatPrintCheckArea(analysis.rating.undercutMm2), percent: percent(analysis.rating.undercutPercent) })
                : t("mold.analysis.noUndercut")}</p>
              {!analysis.findings.some((finding) => finding.kind === "airTrap") && settings.sprue ? <p>{t("mold.analysis.airOk")}</p> : null}
              {analysis.findings.length ? (
                <ul className="layer-check-list" aria-label={t("layerCheck.listLabel")}>
                  {analysis.findings.map((finding) => (
                    <li key={finding.id} className={`layer-check-row ${finding.level}`} data-kind={finding.kind}>
                      <span className="layer-check-row-text">
                        <strong>{[findingKindName(finding), findingValueText(finding, workspace)].filter(Boolean).join(" ")}{finding.areaMm2 > 0 ? `, ${formatPrintCheckArea(finding.areaMm2)}` : ""}</strong>
                        <span className="layer-check-row-level">{t(`finding.level.${finding.level}`)}</span>
                        <span className="layer-check-remedy">{findingRemedy(finding, workspace)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ToolHint text={t("mold.analysis.preview")} />
            </div>
          ) : null}
        </ToolSection>
      ) : null}
      {regenerateOf ? <ToolHint text={t("mold.regenerateHint", { name: regenerateOf })} /> : null}
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : busy ? <ToolStatus state="working" text={t("mold.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={regenerateOf ? t("mold.regenerate") : t("mold.apply")} busy={busy} busyLabel={t("mold.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
