"use client";

import { GuideHelpLink } from "@/components/GuideHelpLink";
import { MovableToolPanel, ToolDockToggle } from "@/components/workplane/MovableToolPanel";
import { ToolAdvanced, ToolApply, ToolCancel, ToolHelp, ToolHint, ToolSection, ToolSelection, ToolStatus } from "@/components/workplane/ToolPanelParts";
import { X } from "lucide-react";
import { EdgeFeatureHistory, EdgeModifierSlider, type EdgeHistoryOption } from "@/components/workplane/EdgeModifierPanel";
import { cadModifierUserErrorMessage } from "@/lib/cadModifierRuntime";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { DEFAULT_SHELL_STACK_HEIGHT, SHELL_STACK_MAX_HEIGHT, SHELL_STACK_MIN_HEIGHT, SHELL_STACK_MIN_WALL } from "@/lib/shellStackLimits";
import { MAX_SHELL_DIVIDERS, type ShellDividers } from "@/lib/shellGridLimits";
import { MIN_SHELL_WALL, SHELL_SIDES, shellOpeningsFor, shellOpenSides } from "@/lib/shellLimits";
import type { ShellEdges, ShellOpenings, WorkplaneWorkspaceSettings } from "@/types/layerling";

const SHELL_EDGES: readonly ShellEdges[] = ["round", "sharp"];
const MIN_WALL = MIN_SHELL_WALL;
const WALL_STEP = 0.1;

/** The panel's error in words; a wall that is too thick on a box with rounded top and bottom edges says why (#401). */
function shellErrorMessage(error: string, roundedEdgesHint?: boolean) {
  const message = cadModifierUserErrorMessage(error);
  if (roundedEdgesHint && message === t("shell.errorTooThick")) return `${message} ${t("shell.errorRoundedEdges")}`;
  return message;
}

/**
 * Hollowing a body: one wall thickness and which side stays open. The walls
 * grow inward, so the outside of the body does not move.
 */
export function ShellPanel({
  targetName,
  thickness,
  maxThickness,
  openings,
  edges,
  stack,
  stackOffered,
  gridCells,
  gridFit,
  gridMax,
  dividers,
  workspace,
  busy,
  error,
  roundedEdgesHint,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  onRemoveFeature,
  onEditFeature,
  onThicknessChange,
  onOpeningsChange,
  onEdgesChange,
  onStackChange,
  onGridChange,
  onDividersChange,
  onApply,
  onCancel,
}: {
  targetName: string;
  thickness: number;
  maxThickness: number;
  openings: ShellOpenings;
  edges: ShellEdges;
  /** The height in mm of the collar and the groove that let one box stand on the next; 0 for none. */
  stack: number;
  /** Stacking is offered only with the top as the one open side. */
  stackOffered: boolean;
  /** A Gridfinity baseplate in the floor with this many cells at most (0 for none), the walls fitted to the grid, and how many cells the inside holds at most. */
  gridCells: number;
  gridFit: boolean;
  gridMax: number;
  /** Dividers across (x) and along (z) the inside; null for none. */
  dividers: ShellDividers | null;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  /** A rounded box with rounded top and bottom edges: a wall that is too thick has that as its reason (#401). */
  roundedEdgesHint?: boolean;
  /** The treatments the body already has, to revert or edit (#237). */
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  onRemoveFeature: (id: string) => void;
  onEditFeature?: (id: string) => void;
  onThicknessChange: (value: number) => void;
  onOpeningsChange: (value: ShellOpenings) => void;
  onEdgesChange: (value: ShellEdges) => void;
  onStackChange: (value: number) => void;
  onGridChange: (cells: number, fit: boolean) => void;
  onDividersChange: (value: ShellDividers | null) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const openSides = shellOpenSides(openings);
  const title = t("shell.title");
  return (
    <MovableToolPanel className="edge-modifier-panel shell-panel" ariaLabel={title} dock="withObject" onClose={onCancel}>
      {(handleProps) => (<>
      <div className="edge-modifier-header movable" title={t("panel.moveHint")} {...handleProps}>
        <div>
          <strong>{title}</strong>
          <span>{t("shell.subtitle")}</span>
        </div>
        <div className="panel-header-actions">
          <ToolDockToggle />
          <GuideHelpLink section="hollowing" />
          <button type="button" aria-label={t("shell.cancel")} onClick={onCancel}><X size={20} /></button>
        </div>
      </div>

      <ToolSection title={t("toolSidebar.selection")}>
        <ToolSelection ready text={targetName} />
        <ToolHelp>{t("shell.help")}</ToolHelp>
        <EdgeFeatureHistory
          appliedFeatureCount={appliedFeatureCount}
          reversibleFeatureCount={reversibleFeatureCount}
          historyOptions={historyOptions}
          onRemoveFeature={onRemoveFeature}
          onEditFeature={onEditFeature}
        />
      </ToolSection>

      <ToolSection title={t("toolSidebar.settings")}>
        <EdgeModifierSlider
          label={t("shell.wall")}
          primary
          value={thickness}
          min={MIN_WALL}
          max={Math.max(MIN_WALL, maxThickness)}
          step={WALL_STEP}
          workspace={workspace}
          length
          disabled={busy}
          onChange={onThicknessChange}
        />

        <div className="edge-modifier-field shell-openings" role="group" aria-label={t("shell.openings")}>
          <span>{t("shell.openings")}</span>
          {/* Any set of sides; none at all seals the cavity. */}
          <div className="shell-opening-options shell-side-options">
            {SHELL_SIDES.map((side) => {
              const open = openSides.includes(side);
              return (
                <button
                  key={side}
                  type="button"
                  aria-pressed={open}
                  className={open ? "active" : ""}
                  disabled={busy}
                  onClick={() => onOpeningsChange(shellOpeningsFor(open ? openSides.filter((other) => other !== side) : [...openSides, side]))}
                >
                  {t(`shell.side.${side}`)}
                </button>
              );
            })}
          </div>
          {/* No side open, in one click: the cavity sealed inside (#658). */}
          <div className="shell-opening-options shell-closed-option">
            <button
              type="button"
              aria-pressed={openSides.length === 0}
              className={openSides.length === 0 ? "active" : ""}
              disabled={busy}
              onClick={() => onOpeningsChange(shellOpeningsFor([]))}
            >
              {t("shell.side.closed")}
            </button>
          </div>
          <span className="shell-openings-summary">{openSides.length === 0 ? t("shell.sidesNone") : t("shell.sidesHint")}</span>
        </div>
      </ToolSection>

      {stackOffered ? (<>
        <div className="edge-modifier-field shell-openings shell-grid" role="group" aria-label={t("shell.grid")}>
          <span>{t("shell.grid")}</span>
          <div className="shell-opening-options">
            <button
              type="button"
              aria-pressed={gridCells > 0}
              className={gridCells > 0 ? "active" : ""}
              disabled={busy || gridMax < 1}
              onClick={() => onGridChange(gridCells > 0 ? 0 : Math.max(1, gridMax), gridFit)}
            >
              {t("shell.grid")}
            </button>
          </div>
          {gridCells > 0 ? (<>
            <EdgeModifierSlider
              label={t("shell.gridCells")}
              value={Math.min(gridCells, Math.max(1, gridMax))}
              min={1}
              max={Math.max(1, gridMax)}
              step={1}
              workspace={workspace}
              decimals={0}
              disabled={busy}
              onChange={(value) => onGridChange(Math.round(value), gridFit)}
            />
            <label className="edge-modifier-field offset-copy">
              <input type="checkbox" checked={gridFit} disabled={busy} onChange={(event) => onGridChange(gridCells, event.target.checked)} />
              <span>{t("shell.gridFit")}</span>
            </label>
          </>) : null}
          <ToolHint text={gridMax < 1 ? t("shell.gridNoCell") : t("shell.gridHint")} />
        </div>

        <div className="edge-modifier-field shell-openings shell-dividers" role="group" aria-label={t("shell.dividers")}>
          <span>{t("shell.dividers")}</span>
          <div className="shell-opening-options">
            <button
              type="button"
              aria-pressed={dividers !== null}
              className={dividers !== null ? "active" : ""}
              disabled={busy}
              onClick={() => onDividersChange(dividers ? null : { x: 1, z: 1 })}
            >
              {t("shell.dividers")}
            </button>
          </div>
          {dividers ? (<>
            <EdgeModifierSlider
              label={t("shell.dividersAcross")}
              value={dividers.x}
              min={0}
              max={MAX_SHELL_DIVIDERS}
              step={1}
              workspace={workspace}
              decimals={0}
              disabled={busy}
              onChange={(value) => onDividersChange({ ...dividers, x: Math.round(value) })}
            />
            <EdgeModifierSlider
              label={t("shell.dividersAlong")}
              value={dividers.z}
              min={0}
              max={MAX_SHELL_DIVIDERS}
              step={1}
              workspace={workspace}
              decimals={0}
              disabled={busy}
              onChange={(value) => onDividersChange({ ...dividers, z: Math.round(value) })}
            />
          </>) : null}
          <ToolHint text={t("shell.dividersHint")} />
        </div>
      </>) : null}

      {stackOffered ? (
        <div className="edge-modifier-field shell-openings shell-stack" role="group" aria-label={t("shell.stack")}>
          <span>{t("shell.stack")}</span>
          <div className="shell-opening-options">
            <button
              type="button"
              aria-pressed={stack > 0}
              className={stack > 0 ? "active" : ""}
              disabled={busy}
              onClick={() => onStackChange(stack > 0 ? 0 : DEFAULT_SHELL_STACK_HEIGHT)}
            >
              {t("shell.stack")}
            </button>
          </div>
          {stack > 0 ? (
            <EdgeModifierSlider
              label={t("shell.stackHeight")}
              value={stack}
              min={SHELL_STACK_MIN_HEIGHT}
              max={SHELL_STACK_MAX_HEIGHT}
              step={WALL_STEP}
              workspace={workspace}
              length
              disabled={busy}
              onChange={onStackChange}
            />
          ) : null}
          <ToolHint text={thickness < SHELL_STACK_MIN_WALL && stack > 0 ? t("shell.stackWallThin", { min: SHELL_STACK_MIN_WALL }) : t("shell.stackHint")} />
        </div>
      ) : null}

      <ToolAdvanced tool="shell" summary={t("shell.edges")}>
        <div className="edge-modifier-field shell-openings" role="radiogroup" aria-label={t("shell.edges")}>
          <span>{t("shell.edges")}</span>
          <div className="shell-opening-options">
            {SHELL_EDGES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={edges === option}
                className={edges === option ? "active" : ""}
                disabled={busy}
                onClick={() => onEdgesChange(option)}
              >
                {t(`shell.edges.${option}`)}
              </button>
            ))}
          </div>
          <ToolHint text={t("shell.edgesHint")} />
        </div>
      </ToolAdvanced>

      {error ? <div className="edge-modifier-error" role="alert">{shellErrorMessage(error, roundedEdgesHint)}</div> : busy ? <ToolStatus state="working" text={t("shell.working")} /> : null}
      <div className="edge-modifier-footer">
        <ToolCancel onClick={onCancel} />
        <ToolApply label={t("shell.apply")} busy={busy} busyLabel={t("shell.working")} disabled={busy} onClick={onApply} />
      </div>
      </>)}
    </MovableToolPanel>
  );
}
