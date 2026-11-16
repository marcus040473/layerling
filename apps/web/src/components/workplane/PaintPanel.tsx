"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { Eraser, X } from "lucide-react";
import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { ToolApply, ToolHint, ToolSection, ToolSelection } from "@/components/workplane/ToolPanelParts";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { t } from "@/lib/i18n";
import { PAINT_MAX_ANGLE, PAINT_MIN_ANGLE, PAINT_MIN_DIAMETER, type PaintToolMode, type PaintToolSettings } from "@/lib/paint";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

const MODES: readonly PaintToolMode[] = ["fill", "circle", "brush", "lasso", "magnet"];

/**
 * "Paint" (paint.ts): colours on parts of the body's surface, for printing in several colours. The panel
 * holds the tool, the colour and the eraser; the strokes themselves are made in the view, a click for a
 * fill or a circle, a line drawn with the button held for the brush, a shape drawn round the place for the
 * lasso, clicks along the body's edges for the magnetic lasso. Each stroke is a step of the history, so
 * Undo takes the last one back; "Clear all" takes them all off at once.
 */
export function PaintPanel({
  targetName,
  settings,
  colors,
  strokes,
  wholeFaces,
  workspace,
  onChange,
  onClear,
  onClose,
}: {
  targetName: string;
  settings: PaintToolSettings;
  /** The colours to offer: the design's own and those painted with before. */
  colors: readonly string[];
  /** How many strokes the body carries. */
  strokes: number;
  /** The body's mesh is not closed: its circles and lassos colour whole triangles instead of being cut in. */
  wholeFaces: boolean;
  workspace: WorkplaneWorkspaceSettings;
  onChange: (patch: Partial<PaintToolSettings>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useLanguage();
  const title = t("paint.title");
  const colorInputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  // The browser's picker reports every movement; the colour counts when it is closed (the change event), as on the colour card.
  useEffect(() => {
    const input = colorInputRef.current;
    if (!input) return;
    const commit = () => changeRef.current({ color: input.value, erase: false });
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);
  useEffect(() => {
    const input = colorInputRef.current;
    if (input && input.value.toLowerCase() !== settings.color.toLowerCase()) input.value = settings.color;
  }, [settings.color]);
  const hint = settings.erase ? t(`paint.hint.erase.${settings.mode}`) : t(`paint.hint.${settings.mode}`);

  return (
    <MovableToolPanel className="edge-modifier-panel paint-panel" ariaLabel={title} dock="withObject" onClose={onClose}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("paint.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink section="paint" />
          <button type="button" aria-label={t("paint.close")} onClick={onClose}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready confirm text={targetName} detail={hint} />
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
      <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("paint.mode")}>
        <span>{t("paint.mode")}</span>
        <div className="shell-opening-options">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={settings.mode === mode}
              className={settings.mode === mode ? "active" : ""}
              title={t(`paint.mode.${mode}Hint`)}
              onClick={() => onChange({ mode })}
            >
              {t(`paint.mode.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="edge-modifier-field paint-colors">
        <span>{t("paint.color")}</span>
        <div className="paint-color-row">
          <div className="color-grid" role="radiogroup" aria-label={t("paint.color")}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={!settings.erase && settings.color === color}
                className={!settings.erase && settings.color === color ? "selected" : ""}
                style={{ "--shape-swatch": color } as CSSProperties}
                title={color.toUpperCase()}
                aria-label={t("aria.setColor", { color })}
                onClick={() => onChange({ color, erase: false })}
              />
            ))}
          </div>
          <label className="custom-color" title={t("paint.customColor")}>
            <input ref={colorInputRef} type="color" defaultValue={settings.color} aria-label={t("paint.customColor")} />
            <span>{settings.color.toUpperCase()}</span>
          </label>
        </div>
        <button
          type="button"
          className={settings.erase ? "paint-eraser active" : "paint-eraser"}
          aria-pressed={settings.erase}
          title={t("paint.eraserHint")}
          onClick={() => onChange({ erase: !settings.erase })}
        >
          <Eraser size={16} />
          {t("paint.eraser")}
        </button>
      </div>

      {settings.mode === "fill" ? (
        <EdgeModifierSlider
          label={t("paint.angle")}
          value={settings.angle}
          min={PAINT_MIN_ANGLE}
          max={PAINT_MAX_ANGLE}
          step={1}
          unit="°"
          workspace={workspace}
          onChange={(value) => onChange({ angle: value })}
        />
      ) : null}
      {settings.mode === "circle" || settings.mode === "brush" ? (
        <EdgeModifierSlider
          label={t("paint.diameter")}
          value={settings.diameter}
          min={PAINT_MIN_DIAMETER}
          max={100}
          step={0.5}
          coarse={{ step: 0.5, max: 100 }}
          workspace={workspace}
          length
          onChange={(value) => onChange({ diameter: value })}
        />
      ) : null}
      {settings.mode === "brush" ? (<>
        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={settings.pressure} onChange={(event) => onChange({ pressure: event.target.checked })} />
          <span>{t("paint.pressure")}</span>
        </label>
        <ToolHint text={t("paint.pressureHint")} />
      </>) : null}
      {settings.mode === "fill" ? <ToolHint text={t("paint.angleHint")} /> : null}
      {settings.mode === "lasso" || settings.mode === "magnet" ? (<>
        <EdgeModifierSlider
          label={t("paint.smooth")}
          value={settings.smooth}
          min={0}
          max={100}
          step={5}
          unit="%"
          workspace={workspace}
          onChange={(value) => onChange({ smooth: value })}
        />
        <ToolHint text={t("paint.smoothHint")} />
      </>) : null}
      {settings.mode === "magnet" ? <ToolHint text={t("paint.magnetHint")} /> : null}

      {wholeFaces ? <ToolHint text={t("paint.wholeFaces")} /> : null}
      <p className="cylinder-wrap-hint paint-count">
        {strokes ? t("paint.strokes", { count: strokes }) : t("paint.noStrokes")}
      </p>
      </ToolSection>

      <div className="edge-modifier-footer">
        <button type="button" className="secondary" disabled={!strokes} onClick={onClear}>
          {t("paint.clear")}
        </button>
        <ToolApply label={t("paint.done")} onClick={onClose} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
