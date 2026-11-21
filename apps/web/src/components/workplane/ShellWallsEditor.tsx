"use client";

import { useState } from "react";
import { Eraser, FlipHorizontal2, FlipVertical2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { BOX_WALLS_PLAN_MIN_LENGTH, BoxWallsPlan, type BoxWallsPick } from "@/components/workplane/BoxWallsPlan";
import { EdgeModifierSlider } from "@/components/workplane/EdgeModifierPanel";
import { ToolHint } from "@/components/workplane/ToolPanelParts";
import { boxGeneratorMirroredWalls, boxGeneratorSplitWall, boxGeneratorWallEnds, boxGeneratorWallFromEnds, boxGeneratorWallRoom, MAX_BOX_GENERATOR_WALLS } from "@/lib/boxGeneratorGeometry";
import { t } from "@/lib/i18n";
import type { ShellDividerWall } from "@/lib/shellGridLimits";
import type { WorkplaneWorkspaceSettings } from "@/types/layerling";

/*
 * Hollow, dividers set by hand: the inside of the box from above (the same drawing the box generator has), where a wall
 * is put into the compartment that was clicked, dragged, pulled by an end and set at a slant, and for the wall that is
 * picked its measures as numbers. The inside is taken as a rectangle of the body's width and depth less the wall; the
 * kernel then builds each wall in the box's own inside and clips it to the box's real outline.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** The dividers of an even grid as walls from wall to wall, for the switch from even to by hand. */
export function shellGridWalls(across: number, along: number, width: number, depth: number): ShellDividerWall[] {
  const walls: ShellDividerWall[] = [];
  for (let i = 1; i <= across; i += 1) walls.push({ dir: "z", at: round((width * i) / (across + 1)), from: 0, to: round(depth) });
  for (let i = 1; i <= along; i += 1) walls.push({ dir: "x", at: round((depth * i) / (along + 1)), from: 0, to: round(width) });
  return walls;
}

export function ShellWallsEditor({
  width,
  depth,
  walls,
  thickness,
  workspace,
  disabled,
  onChange,
}: {
  /** The inside of the box, in mm: the body's width and depth less the wall on both sides. */
  width: number;
  depth: number;
  walls: readonly ShellDividerWall[];
  thickness: number;
  workspace: WorkplaneWorkspaceSettings;
  disabled?: boolean;
  onChange: (walls: ShellDividerWall[]) => void;
}) {
  const [pick, setPick] = useState<BoxWallsPick>(null);
  // The room as the box generator's: a plain box whose inside is this wide and deep.
  const room = boxGeneratorWallRoom({ width: width + 2, depth: depth + 2, height: 10 }, { boxWall: 1, boxFloor: 1, boxCornerRadius: 0, boxDividerMode: "manual", boxDivider: thickness, boxWalls: [...walls] });
  if (!room || width < 4 || depth < 4) return null;
  const wall = pick?.type === "wall" ? walls[pick.index] : undefined;
  const compartment = pick?.type === "compartment" ? room.compartments[pick.index] : undefined;
  const change = (index: number, next: ShellDividerWall) => onChange(walls.map((entry, position) => (position === index ? next : entry)));
  const remove = (index: number) => {
    onChange(walls.filter((_entry, position) => position !== index));
    setPick(null);
  };
  const add = (dir: ShellDividerWall["dir"]) => {
    const area = (entry: (typeof room.compartments)[number]) => (entry.maxX - entry.minX) * (entry.maxZ - entry.minZ);
    const target = compartment ?? [...room.compartments].sort((a, b) => area(b) - area(a))[0] ?? { minX: 0, maxX: room.width, minZ: 0, maxZ: room.depth };
    onChange([...walls, boxGeneratorSplitWall(target, dir, room, thickness)]);
    setPick({ type: "wall", index: walls.length });
  };
  const turn = (index: number) => {
    const [a, b] = boxGeneratorWallEnds(walls[index]);
    const middle = { x: clamp((a.x + b.x) / 2, 0, room.width), z: clamp((a.z + b.z) / 2, 0, room.depth) };
    const half = { x: -(b.z - a.z) / 2, z: (b.x - a.x) / 2 };
    const fit = Math.min(1, half.x ? Math.min(middle.x, room.width - middle.x) / Math.abs(half.x) : 1, half.z ? Math.min(middle.z, room.depth - middle.z) / Math.abs(half.z) : 1);
    const end = (sign: number) => ({ x: round(middle.x + sign * half.x * fit), z: round(middle.z + sign * half.z * fit) });
    change(index, boxGeneratorWallFromEnds(end(-1), end(1)));
  };
  const full = walls.length >= MAX_BOX_GENERATOR_WALLS;
  const plain = (value: number) => String(Math.round(value * 10) / 10);
  const run = wall ? (wall.dir === "x" ? room.width : room.depth) : 0;
  const across = wall ? (wall.dir === "x" ? room.depth : room.width) : 0;
  const from = wall ? clamp(wall.from, 0, run) : 0;
  const to = wall ? clamp(wall.to, 0, run) : 0;

  return (
    <div className="shell-walls-editor" data-testid="shell-walls-editor">
      <BoxWallsPlan
        room={room}
        walls={walls}
        thickness={thickness}
        pick={pick}
        disabled={disabled}
        label={t("boxGenerator.wallsPlan")}
        wallLabel={(entry, index) => t(entry.dir === "x" ? "boxGenerator.wallAcross" : "boxGenerator.wallAlong", { number: index + 1 })}
        compartmentLabel={(entry, index) => t("boxGenerator.compartment", { number: index + 1, width: plain(entry.maxX - entry.minX), depth: plain(entry.maxZ - entry.minZ) })}
        onPick={setPick}
        onWallChange={change}
        onWallRemove={remove}
      />
      <ToolHint text={wall && pick?.type === "wall"
        ? t(wall.dir === "x" ? "boxGenerator.wallAcross" : "boxGenerator.wallAlong", { number: pick.index + 1 })
        : compartment
          ? t("boxGenerator.compartmentPicked", { width: plain(compartment.maxX - compartment.minX), depth: plain(compartment.maxZ - compartment.minZ) })
          : t("boxGenerator.wallsHint")} />
      <div className="shell-walls-actions">
        <button type="button" disabled={disabled || full} data-testid="shell-walls-add-across" onClick={() => add("x")}><Plus size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallAddAcross")}</span></button>
        <button type="button" disabled={disabled || full} data-testid="shell-walls-add-along" onClick={() => add("z")}><Plus size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallAddAlong")}</span></button>
      </div>
      {wall && pick?.type === "wall" ? (
        <>
          <EdgeModifierSlider label={t(wall.dir === "x" ? "prop.boxWallFromBack" : "prop.boxWallFromLeft")} value={clamp(wall.at, 0, across)} min={0} max={round(across)} step={0.5} workspace={workspace} length disabled={disabled} onChange={(value) => change(pick.index, { ...wall, at: round(clamp(value, 0, across)) })} />
          <EdgeModifierSlider label={t("prop.boxWallStart")} value={from} min={0} max={round(Math.max(0, to - BOX_WALLS_PLAN_MIN_LENGTH))} step={0.5} workspace={workspace} length disabled={disabled} onChange={(value) => change(pick.index, { ...wall, from: round(clamp(value, 0, to - BOX_WALLS_PLAN_MIN_LENGTH)), to })} />
          <EdgeModifierSlider label={t("prop.boxWallEnd")} value={to} min={round(Math.min(run, from + BOX_WALLS_PLAN_MIN_LENGTH))} max={round(run)} step={0.5} workspace={workspace} length disabled={disabled} onChange={(value) => change(pick.index, { ...wall, from, to: round(clamp(value, from + BOX_WALLS_PLAN_MIN_LENGTH, run)) })} />
          <EdgeModifierSlider
            label={t("prop.boxWallSlant")}
            value={clamp(wall.slant ?? 0, -clamp(wall.at, 0, across), across - clamp(wall.at, 0, across))}
            min={-round(clamp(wall.at, 0, across))}
            max={round(across - clamp(wall.at, 0, across))}
            step={0.5}
            workspace={workspace}
            length
            disabled={disabled}
            onChange={(value) => {
              const slant = round(clamp(value, -wall.at, across - wall.at));
              const { slant: _slant, ...straight } = wall;
              change(pick.index, slant === 0 ? straight : { ...straight, slant });
            }}
          />
          <div className="shell-walls-actions">
            <button type="button" disabled={disabled} data-testid="shell-walls-turn" onClick={() => turn(pick.index)}><RefreshCw size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallTurn")}</span></button>
            <button type="button" disabled={disabled} data-testid="shell-walls-remove" onClick={() => remove(pick.index)}><Trash2 size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallRemove")}</span></button>
          </div>
        </>
      ) : null}
      {walls.length > 0 ? (
        <>
          <div className="shell-walls-actions">
            <button type="button" disabled={disabled || full} title={t("boxGenerator.wallsMirrorHint")} data-testid="shell-walls-mirror-x" onClick={() => { onChange(boxGeneratorMirroredWalls(walls, room, "x")); setPick(null); }}><FlipHorizontal2 size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallsMirrorX")}</span></button>
            <button type="button" disabled={disabled || full} title={t("boxGenerator.wallsMirrorHint")} data-testid="shell-walls-mirror-z" onClick={() => { onChange(boxGeneratorMirroredWalls(walls, room, "z")); setPick(null); }}><FlipVertical2 size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallsMirrorZ")}</span></button>
          </div>
          <div className="shell-walls-actions">
            <button type="button" disabled={disabled} data-testid="shell-walls-clear" onClick={() => { onChange([]); setPick(null); }}><Eraser size={15} strokeWidth={2.5} /><span>{t("boxGenerator.wallsClear")}</span></button>
          </div>
        </>
      ) : null}
    </div>
  );
}
