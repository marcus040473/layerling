"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel } from "@/components/workplane/MovableToolPanel";
import { Check, LoaderCircle, X } from "lucide-react";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolAdvanced, ToolHelp, ToolHint, ToolNote, ToolOutcome, ToolSection, ToolSelection, ToolStatus, ToolStepper } from "@/components/workplane/ToolPanelParts";
import { MAX_FLEXI_CLEARANCE, MAX_FLEXI_JOINTS, MAX_FLEXI_SWING, MIN_FLEXI_CLEARANCE, MIN_FLEXI_SWING } from "@/lib/flexiJoints";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/** What the panel edits: the axis ("auto" is the body's longer side), the joints, and the knuckle's size and the end links when not left to the tool. */
export type FlexiToolSettings = {
  axis: "auto" | "x" | "z";
  joints: number;
  clearance: number;
  swing: number;
  autoSize: boolean;
  size: number;
  evenLinks: boolean;
  start: number;
  end: number;
};

const AXES: readonly FlexiToolSettings["axis"][] = ["auto", "x", "z"];

/**
 * Flexi joints (Liane's mail, 29.10.2026): a flat body cut into links along its length, with a joint printed in place
 * at every cut, so the links swing to the sides - a fish, a snake or a dragon of one's own drawing.
 */
export function FlexiPanel({
  targetName,
  settings,
  length,
  workspace,
  busy,
  error,
  onChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  settings: FlexiToolSettings;
  /** The body's length along the chosen axis, in mm: as far as the first and the last joint can lie from its ends. */
  length: number;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<FlexiToolSettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const title = t("flexi.title");
  const endMax = Math.max(1, Math.round(length / 2));
  // What the folded part holds, in a line: the clearance, and the joint's size and the end links when set by hand.
  // Folded, Advanced names what it holds: the joint size and the end links.
  const summary = [t("flexi.autoSize"), t("flexi.evenLinks")].join(", ");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel offset-panel flexi-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("flexi.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <GuideHelpLink section="flexi" />
          <button type="button" aria-label={t("flexi.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("flexi.help")}</ToolHelp>
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("flexi.axis")}>
          <span>{t("flexi.axis")}</span>
          <div className="shell-opening-options">
            {AXES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={settings.axis === option}
                className={settings.axis === option ? "active" : ""}
                disabled={busy}
                onClick={() => onChange({ axis: option })}
              >
                {t(`flexi.axis.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <ToolStepper
          label={t("flexi.joints")}
          value={settings.joints}
          min={1}
          max={MAX_FLEXI_JOINTS}
          disabled={busy}
          onChange={(joints) => onChange({ joints })}
        />

        <EdgeModifierSlider
          label={t("flexi.swing")}
          value={settings.swing}
          min={MIN_FLEXI_SWING}
          max={MAX_FLEXI_SWING}
          step={1}
          unit="°"
          workspace={workspace}
          disabled={busy}
          primary
          onChange={(value) => onChange({ swing: value })}
        />

        <EdgeModifierSlider
          label={t("flexi.clearance")}
          value={settings.clearance}
          min={MIN_FLEXI_CLEARANCE}
          max={MAX_FLEXI_CLEARANCE}
          step={0.05}
          workspace={workspace}
          length
          disabled={busy}
          onChange={(value) => onChange({ clearance: value })}
        />
        <ToolHint text={t("flexi.clearanceHint")} />
        <ToolNote text={t("flexi.sizeNote")} />
      </ToolSection>

      <ToolAdvanced tool="flexi" summary={summary}>
        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={settings.autoSize} disabled={busy} onChange={(event) => onChange({ autoSize: event.target.checked })} />
          <span>{t("flexi.autoSize")}</span>
        </label>
        {settings.autoSize ? null : (
          <EdgeModifierSlider
            label={t("flexi.size")}
            value={settings.size}
            min={4}
            max={30}
            step={0.5}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onChange({ size: value })}
          />
        )}

        <label className="edge-modifier-field offset-copy">
          <input type="checkbox" checked={settings.evenLinks} disabled={busy} onChange={(event) => onChange({ evenLinks: event.target.checked })} />
          <span>{t("flexi.evenLinks")}</span>
        </label>
        {settings.evenLinks ? null : (<>
          <EdgeModifierSlider
            label={t("flexi.start")}
            value={Math.min(settings.start, endMax)}
            min={1}
            max={endMax}
            step={0.5}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onChange({ start: value })}
          />
          <EdgeModifierSlider
            label={t("flexi.end")}
            value={Math.min(settings.end, endMax)}
            min={1}
            max={endMax}
            step={0.5}
            workspace={workspace}
            length
            disabled={busy}
            onChange={(value) => onChange({ end: value })}
          />
        </>)}
      </ToolAdvanced>

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : busy ? <ToolStatus state="working" text={t("flexi.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolOutcome text={t("flexi.outcome", { name: targetName, links: settings.joints + 1 })} />
        <button type="button" className="secondary" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="button" className="primary" disabled={busy} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          {busy ? t("flexi.working") : t("flexi.apply")}
        </button>
      </div>
      </>)}
    </MovableToolPanel>
  );
}
