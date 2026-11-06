"use client";

import { useState } from "react";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolGroup, ToolHelp, ToolHint, ToolOutcome, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import {
  LID_FITS,
  LID_HANDLES,
  LID_HINGE_SIDES,
  LID_HINGE_STYLES,
  LID_HINGE_TYPES,
  LID_MAGNET_SIZES,
  LID_TYPES,
  MAX_CLICK_BUMP_HEIGHT,
  MAX_HINGE_GAP,
  MAX_HINGE_KNUCKLES,
  MAX_HINGE_PIN,
  MAX_HINGE_PIN_PLAY,
  MAX_LID_DEPTH,
  MAX_LID_GAP,
  MAX_LID_THICKNESS,
  MAX_LID_WALL,
  MAX_MAGNET_DIAMETER,
  MAX_MAGNET_GAP,
  MAX_MAGNET_HEIGHT,
  MIN_CLICK_BUMP_HEIGHT,
  MIN_HINGE_GAP,
  MIN_HINGE_PIN,
  MIN_HINGE_PIN_PLAY,
  MIN_LID_DEPTH,
  MIN_LID_THICKNESS,
  MIN_LID_WALL,
  MIN_MAGNET_DIAMETER,
  MIN_MAGNET_HEIGHT,
  hingeKnuckleRadius,
  lidClickBumpsFit,
  lidHandleFits,
  lidThicknessForMagnets,
  normalizeLidOptions,
  type LidOptions,
} from "@/lib/lidTool";
import { numberLocale, t } from "@/lib/i18n";
import { fromPrinterPlay } from "@/lib/printerPlay";
import { useLanguage } from "@/lib/useLanguage";
import { usePrinterPlay } from "@/lib/usePrinterPlay";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/**
 * A lid for a body open at the top (#1009): pushed into the opening, put over the outside, gripping the wall from both
 * sides (#1062) or laid flat on it. It comes out as a body of its own beside the one it closes, ready to print. With
 * magnets, it holds by four round magnets in the corners, in pockets in the body's rim and in the lid. With a hinge, it
 * swings open about a pin along the body's back, tight in the body's knuckles and turning in the lid's.
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
  // The gap and the pin's play say when they are still what the printer's play gave them (printerPlay.ts).
  const printerPlay = usePrinterPlay();
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
  const slider = (label: string, key: "gap" | "depth" | "wall" | "magnetDiameter" | "magnetHeight" | "magnetGap" | "hingeGap" | "hingePinPlay" | "clickBumpHeight", min: number, max: number, step: number) => (
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
  // A rim round the outside would hit the back wall as the lid swings open: the hinge goes with a lip or a flat lid.
  const hingeFits = LID_HINGE_TYPES.includes(settings.type);
  const hinged = settings.hinge && hingeFits;
  // Click bumps stand on a lip or a rim; a pivot lid has neither, nor an edge for a tab or a finger.
  const bumpsFit = lidClickBumpsFit(settings);
  const handleFits = lidHandleFits(settings);
  const handle = handleFits ? settings.handle : "none";
  // Folded, Advanced names what it holds: the gap and the lip or rim, the magnet's size and play, and the hinge's and the pin's play.
  const summary = [
    ...(lipped ? [t("lid.gap"), t(settings.type === "cap" ? "lid.depthCap" : settings.type === "both" ? "lid.depthBoth" : "lid.depth"), t(settings.type === "cap" ? "lid.wallCap" : settings.type === "both" ? "lid.wallBoth" : "lid.wall")] : []),
    ...(settings.magnets ? [t("lid.magnetDiameter"), t("lid.magnetHeight"), t("lid.magnetGap")] : []),
    ...(hinged ? [t("lid.hingeGap"), t("lid.hingePinPlay")] : []),
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
          <ToolDockToggle />
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

        <ToolGroup
          tool="lid-hinge"
          label={t("lid.hinge")}
          checked={hinged}
          disabled={busy || !hingeFits}
          summary={`${t(`lid.hingeStyle.${settings.hingeStyle}`)} · ${t(`shell.side.${settings.hingeSide}`)} · Ø ${millimetres(settings.hingePin)} mm`}
          onCheck={(hinge) => onChange({ hinge })}
        >
          {/* Where it sits: behind the back, in the wall (the box keeps its size), or a lid that turns on two pins. */}
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.hingeStyle")}>
            <span>{t("lid.hingeStyle")}</span>
            <div className="shell-opening-options">
              {LID_HINGE_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={settings.hingeStyle === style}
                  className={settings.hingeStyle === style ? "active" : ""}
                  disabled={busy}
                  onClick={() => onChange({ hingeStyle: style })}
                >
                  {t(`lid.hingeStyle.${style}`)}
                </button>
              ))}
            </div>
            <ToolHint text={t(`lid.hingeStyleHint.${settings.hingeStyle}`)} />
          </div>
          {/* The side it goes along, as in the starting view (the view cube's Front faces you). */}
          <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.hingeSide")}>
            <span>{t("lid.hingeSide")}</span>
            <div className="shell-opening-options">
              {LID_HINGE_SIDES.map((side) => (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={settings.hingeSide === side}
                  className={settings.hingeSide === side ? "active" : ""}
                  disabled={busy}
                  onClick={() => onChange({ hingeSide: side })}
                >
                  {t(`shell.side.${side}`)}
                </button>
              ))}
            </div>
          </div>
          <EdgeModifierSlider
            label={t("lid.hingePin")}
            value={settings.hingePin}
            min={MIN_HINGE_PIN}
            max={MAX_HINGE_PIN}
            step={0.05}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onChange({ hingePin: value })}
          />
          {/* A pivot lid turns on two pins and has no knuckles to count. */}
          {settings.hingeStyle === "pivot" ? null : (
            <EdgeModifierSlider
              label={t("lid.hingeKnuckles")}
              value={settings.hingeKnuckles}
              min={0}
              max={MAX_HINGE_KNUCKLES}
              step={1}
              workspace={workspace}
              decimals={0}
              disabled={busy}
              onChange={(value) => onChange({ hingeKnuckles: normalizeLidOptions({ hingeKnuckles: value }).hingeKnuckles })}
            />
          )}
          <label className="edge-modifier-field offset-copy">
            <input type="checkbox" checked={settings.hingeTeardrop} disabled={busy} onChange={(event) => onChange({ hingeTeardrop: event.target.checked })} />
            <span>{t("lid.hingeTeardrop")}</span>
          </label>
          <label className="edge-modifier-field offset-copy">
            <input type="checkbox" checked={settings.hingePrintPin} disabled={busy} onChange={(event) => onChange({ hingePrintPin: event.target.checked })} />
            <span>{t("lid.hingePrintPin")}</span>
          </label>
          <ToolHint text={t("lid.hingeHint", { diameter: millimetres(Math.round(2 * hingeKnuckleRadius(settings) * 10) / 10) })} />
        </ToolGroup>
        {!hingeFits ? <ToolHint text={t("lid.hingeTypeHint")} /> : null}

        <ToolGroup
          tool="lid-click"
          label={t("lid.clickBumps")}
          checked={settings.clickBumps && bumpsFit}
          disabled={busy || !bumpsFit}
          onCheck={(clickBumps) => onChange({ clickBumps })}
        >
          <ToolHint text={t("lid.clickBumpsHint")} />
          {/* How far they reach into the body's wall: a small box or a stiff lip wants less (#1220). */}
          {slider(t("lid.clickBumpHeight"), "clickBumpHeight", MIN_CLICK_BUMP_HEIGHT, MAX_CLICK_BUMP_HEIGHT, 0.05)}
          <ToolHint text={t("lid.clickBumpHeightHint")} />
        </ToolGroup>
        {/* Refused for a flat lid or pivot pins: the reason first, where the hint folds after one sentence. */}
        {!bumpsFit ? <ToolHint text={t("lid.error.clickBumpsNoLip")} /> : null}

        {/* On the side the lid opens at: the front, or opposite the hinge. */}
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("lid.handle")}>
          <span>{t("lid.handle")}</span>
          <div className="shell-opening-options">
            {LID_HANDLES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={handle === option}
                className={handle === option ? "active" : ""}
                disabled={busy || (!handleFits && option !== "none")}
                onClick={() => onChange({ handle: option })}
              >
                {t(`lid.handle.${option}`)}
              </button>
            ))}
          </div>
          {!handleFits ? <ToolHint text={t("lid.error.handlePivot")} /> : handle !== "none" ? <ToolHint text={t(`lid.handleHint.${handle}`)} /> : null}
        </div>
      </ToolSection>

      {summary ? (
        <ToolAdvanced tool="lid" summary={summary}>
          {lipped ? (<>
            {slider(t("lid.gap"), "gap", 0, MAX_LID_GAP, 0.05)}
            {fromPrinterPlay("lid.gap", settings.gap, printerPlay) ? <ToolHint text={t("printerPlay.fromFitTest")} /> : null}
            {slider(t(settings.type === "cap" ? "lid.depthCap" : settings.type === "both" ? "lid.depthBoth" : "lid.depth"), "depth", MIN_LID_DEPTH, MAX_LID_DEPTH, 0.5)}
            {slider(t(settings.type === "cap" ? "lid.wallCap" : settings.type === "both" ? "lid.wallBoth" : "lid.wall"), "wall", MIN_LID_WALL, MAX_LID_WALL, 0.2)}
          </>) : null}
          {settings.magnets ? (<>
            {slider(t("lid.magnetDiameter"), "magnetDiameter", MIN_MAGNET_DIAMETER, MAX_MAGNET_DIAMETER, 0.5)}
            {slider(t("lid.magnetHeight"), "magnetHeight", MIN_MAGNET_HEIGHT, MAX_MAGNET_HEIGHT, 0.5)}
            {slider(t("lid.magnetGap"), "magnetGap", 0, MAX_MAGNET_GAP, 0.05)}
          </>) : null}
          {hinged ? slider(t("lid.hingeGap"), "hingeGap", MIN_HINGE_GAP, MAX_HINGE_GAP, 0.05) : null}
          {hinged ? slider(t("lid.hingePinPlay"), "hingePinPlay", MIN_HINGE_PIN_PLAY, MAX_HINGE_PIN_PLAY, 0.05) : null}
          {hinged && fromPrinterPlay("lid.hingePinPlay", settings.hingePinPlay, printerPlay) ? <ToolHint text={t("printerPlay.fromFitTest")} /> : null}
          {/* The play is only in the lid's holes: in the body's the pin sits tight, so it does not slide out (#1220). */}
          {hinged ? <ToolHint text={t("lid.hingePinPlayHint")} /> : null}
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
