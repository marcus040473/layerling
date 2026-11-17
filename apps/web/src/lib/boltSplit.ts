import type { ManifoldToplevel, Mat4 } from "manifold-3d";
import { shapeToManifoldSolid } from "@/lib/editorBooleans";
import { getManifoldRuntime, type ManifoldSolid } from "@/lib/editorMeshCore";
import { t } from "@/lib/i18n";
import { createLocalId } from "@/lib/localIds";
import { splitShapeFromWorldPositions } from "@/lib/modelSplit";
import { threadSettings } from "@/lib/threadGeometry";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * A screw or a threaded rod split lengthwise for printing: a thread printed standing breaks along its layers, one printed
 * lying flat is as strong along its length as the filament. The body is cut in two through its axis, each half laid on
 * its cut face (flat on the bed, the thread's flanks rising from it, nothing to support), and the halves are glued
 * together after printing. A key lines them up and stiffens the joint: a square bar lying in a groove cut into both cut
 * faces, the square standing on a corner, so each half gets a V-groove whose sides slope at 45 degrees and prints as
 * part of the bottom without a bridge. The key prints lying on one of its flat sides, as long as the groove less a little
 * play at each end.
 */

export type BoltSplitOptions = {
  /** Cut the groove and lay out the key. */
  key: boolean;
  /** The key's play per side in its groove, mm. */
  keyPlay: number;
};

export const BOLT_SPLIT_DEFAULTS: BoltSplitOptions = { key: true, keyPlay: 0.15 };
export const BOLT_KEY_PLAY_LIMITS: readonly [number, number] = [0, 0.5];
/** The key's diagonal is this share of the thread's core diameter. */
const KEY_SHARE = 0.42;
/** A key thinner than this (its side, mm) is too weak to print; the groove is left out. */
export const BOLT_KEY_MIN_SIDE = 1.2;
/** The groove stops this far short of each end (and of the drive's floor), mm. */
const KEY_END_MARGIN = 1.5;
/** The key is shorter than its groove by this at each end, mm. */
const KEY_END_PLAY = 0.3;
/** Room between the parts as they are laid out, mm. */
const LAYOUT_GAP = 5;

export function normalizeBoltSplitOptions(value?: Partial<Record<keyof BoltSplitOptions, unknown>> | null): BoltSplitOptions {
  const play = Number(value?.keyPlay);
  return {
    key: typeof value?.key === "boolean" ? value.key : BOLT_SPLIT_DEFAULTS.key,
    keyPlay: Number.isFinite(play) ? Math.min(BOLT_KEY_PLAY_LIMITS[1], Math.max(BOLT_KEY_PLAY_LIMITS[0], play)) : BOLT_SPLIT_DEFAULTS.keyPlay,
  };
}

/** Whether the shape is a screw or a threaded rod that can be split lengthwise: a body, not a hole, not a nut. */
export function boltSplitFits(shape: WorkplaneShape) {
  if (shape.kind !== "thread" || shape.hole) return false;
  const role = shape.threadRole ?? "rod";
  return role === "rod" || role === "screw";
}

/** The key's square side for this thread (mm), or null when the core is too thin for one. */
export function boltKeySide(shape: WorkplaneShape) {
  const settings = threadSettings(shape);
  const core = settings.diameter - 2 * settings.depth;
  const side = (core * KEY_SHARE) / Math.SQRT2;
  return side >= BOLT_KEY_MIN_SIDE ? Math.round(side * 100) / 100 : null;
}

export type BoltSplitParts = {
  halves: [ManifoldSolid, ManifoldSolid];
  key: ManifoldSolid | null;
  /** The key's side and length as printed, mm; 0 without a key. */
  keySide: number;
  keyLength: number;
  /** Why there is no key although one was asked for. */
  keyLeftOut?: "tooThin" | "tooShort";
};

/** Column-major 4 x 4: the image of x, of y, of z, then the move. */
const LAY_MINUS: Mat4 = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const LAY_PLUS: Mat4 = [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];

/**
 * The halves (and the key) of a body standing upright (y up, the scene's frame) with its axis through (`cx`, `cz`),
 * reaching from `y0` to `y1`. The groove runs from `grooveLow` to `grooveHigh`. The parts come back laid out flat, in the
 * scene's frame, round the origin: the halves side by side along z, their length along x, the key beyond them.
 */
export function splitBoltSolid(
  runtime: ManifoldToplevel,
  body: ManifoldSolid,
  axis: { cx: number; cz: number },
  groove: { low: number; high: number; side: number | null },
  options: BoltSplitOptions,
  created: { delete?: () => void }[],
): BoltSplitParts {
  const keep = <T extends { delete?: () => void }>(value: T) => (created.push(value), value);
  let cut = body;
  let key: ManifoldSolid | null = null;
  let keySide = 0;
  let keyLength = 0;
  let keyLeftOut: BoltSplitParts["keyLeftOut"];
  if (options.key) {
    const length = groove.high - groove.low;
    if (groove.side === null) keyLeftOut = "tooThin";
    else if (length < 4 * groove.side) keyLeftOut = "tooShort";
    else {
      // The groove: a square bar standing on a corner along the axis; the cut through the axis halves it into two V's.
      const square = keep(keep(runtime.CrossSection.square([groove.side, groove.side], true)).rotate(45));
      const bar = keep(keep(keep(runtime.Manifold.extrude(square, length)).rotate([-90, 0, 0])).translate([axis.cx, groove.low, axis.cz]));
      cut = keep(body.subtract(bar));
      keySide = Math.round((groove.side - 2 * options.keyPlay) * 100) / 100;
      keyLength = Math.round((length - 2 * KEY_END_PLAY) * 100) / 100;
      // The key lies on a flat side, its length along x.
      key = keep(runtime.Manifold.cube([keyLength, keySide, keySide]));
    }
  }
  const plus = keep(cut.trimByPlane([1, 0, 0], axis.cx));
  const minus = keep(cut.trimByPlane([-1, 0, 0], -axis.cx));
  const laid = [minus, plus].map((half, index) => keep(keep(half.translate([-axis.cx, 0, -axis.cz])).transform(index === 0 ? LAY_MINUS : LAY_PLUS)));
  // Side by side along z, each on the bed and centred on x; the key in front of them.
  const row = [...laid, ...(key ? [key] : [])];
  const depths = row.map((part) => part.boundingBox().max[2] - part.boundingBox().min[2]);
  const total = depths.reduce((sum, depth) => sum + depth, 0) + LAYOUT_GAP * (row.length - 1);
  let z = -total / 2;
  const placed = row.map((part, index) => {
    const box = part.boundingBox();
    const moved = keep(part.translate([-(box.min[0] + box.max[0]) / 2, -box.min[1], z - box.min[2]]));
    z += depths[index] + LAYOUT_GAP;
    return moved;
  });
  return {
    halves: [placed[0], placed[1]],
    key: key ? placed[2] : null,
    keySide,
    keyLength,
    ...(keyLeftOut ? { keyLeftOut } : {}),
  };
}

export type BoltSplitShapeResult =
  | { parts: WorkplaneShape[]; keySide: number; keyLength: number; keyLeftOut?: "tooThin" | "tooShort" }
  | { parts: null; error: string };

function positionsOf(solid: ManifoldSolid) {
  const mesh = solid.getMesh();
  const positions: number[] = [];
  for (let index = 0; index < mesh.triVerts.length; index += 1) {
    const offset = mesh.triVerts[index] * mesh.numProp;
    positions.push(mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]);
  }
  return positions;
}

/**
 * The screw or rod `shape` split lengthwise, as new mesh bodies laid flat where it stood (its turn on the workplane does
 * not count: it is split along its own axis). The caller replaces the shape with them.
 */
export async function splitBoltForShape(shape: WorkplaneShape, given?: Partial<BoltSplitOptions> | null): Promise<BoltSplitShapeResult> {
  if (!boltSplitFits(shape)) return { parts: null, error: t("boltSplit.error.notBolt") };
  const options = normalizeBoltSplitOptions(given);
  const created: { delete?: () => void }[] = [];
  const keep = <T extends { delete?: () => void }>(value: T) => (created.push(value), value);
  try {
    const runtime = await getManifoldRuntime();
    // Upright, as it was drawn: the axis is the shape's own y.
    const upright: WorkplaneShape = { ...shape, rotation: 0, rotationX: 0, rotationZ: 0 };
    const body = shapeToManifoldSolid(runtime, upright, created as ManifoldSolid[]);
    if (!body || body.status() !== "NoError" || body.isEmpty()) return { parts: null, error: t("boltSplit.error.notClosed") };
    const box = body.boundingBox();
    const cx = (box.min[0] + box.max[0]) / 2;
    const cz = (box.min[2] + box.max[2]) / 2;
    const y0 = box.min[1];
    const y1 = box.max[1];
    const settings = threadSettings(shape);
    // The groove keeps clear of the chamfered ends; on a screw it starts above the drive's floor, on the head's side.
    let low = y0 + Math.max(settings.chamferLow, 0) + KEY_END_MARGIN;
    let high = y1 - Math.max(settings.chamfer, 0) - KEY_END_MARGIN;
    if ((shape.threadRole ?? "rod") === "screw") {
      const near = (y: number) => keep(body.slice(y)).area();
      const headLow = near(y0 + settings.headHeight / 2) >= near(y1 - settings.headHeight / 2);
      const drive = settings.drive !== "none" ? settings.driveDepth : 0;
      if (headLow) low = y0 + drive + KEY_END_MARGIN;
      else high = y1 - drive - KEY_END_MARGIN;
    }
    const split = splitBoltSolid(runtime, body, { cx, cz }, { low, high, side: boltKeySide(shape) }, options, created);
    const name = shape.name;
    const named: Array<[ManifoldSolid, string, string]> = [
      [split.halves[0], t("boltSplit.halfName", { name, number: 1 }), "half-1"],
      [split.halves[1], t("boltSplit.halfName", { name, number: 2 }), "half-2"],
      ...(split.key ? [[split.key, t("boltSplit.keyName", { name }), "key"] as [ManifoldSolid, string, string]] : []),
    ];
    const parts: WorkplaneShape[] = [];
    for (const [solid, partName, role] of named) {
      // Laid out round the origin; moved to where the shape stood.
      const placed = keep(solid.translate([cx, 0, cz]));
      const part = splitShapeFromWorldPositions(shape, positionsOf(placed), createLocalId(`${shape.id}-${role}`), partName);
      if (!part) return { parts: null, error: t("boltSplit.error.notClosed") };
      parts.push(canonicalizeShape({ ...part, hidden: false, hole: false, locked: false }));
    }
    return { parts, keySide: split.keySide, keyLength: split.keyLength, ...(split.keyLeftOut ? { keyLeftOut: split.keyLeftOut } : {}) };
  } catch (error) {
    return { parts: null, error: t("boltSplit.error.kernel", { message: error instanceof Error ? error.message : String(error ?? "") }) };
  } finally {
    Array.from(new Set(created)).forEach((value) => value.delete?.());
  }
}
