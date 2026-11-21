"use client";

import { useRef, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import * as THREE from "three";
import { SquareSplitHorizontal, SquareSplitVertical, X } from "lucide-react";
import { projectToScreen, type ThreeState } from "@/components/workplane/ViewportOverlays";
import { boxWallDragged, type BoxWallsPick } from "@/components/workplane/BoxWallsPlan";
import { boxGeneratorSplitWall, boxGeneratorWallRoom, MAX_BOX_GENERATOR_WALLS, normalizeBoxGenerator, type BoxGeneratorWall } from "@/lib/boxGeneratorGeometry";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import { t } from "@/lib/i18n";
import type { WorkplaneShape } from "@/types/layerling";

/*
 * The box generator's dividers set by hand, edited on the box itself: while such a box is the one part selected, every
 * wall has a grip on its top that moves it, the picked wall has a grip at each end that makes it shorter or longer and a
 * cross that removes it, and every compartment shows its size with two buttons that split it across or along. Only these
 * grips and buttons take the pointer; everywhere else the view is used as always. The pointer is followed on the plane of
 * the box's top, so a wall moves under it whichever way the camera looks.
 */

type Screen = { x: number; y: number };

export type BoxWallsOverlayState = {
  shapeId: string;
  walls: { index: number; dir: BoxGeneratorWall["dir"]; from: Screen; to: Screen; middle: Screen }[];
  compartments: { index: number; at: Screen; text: string; room: "none" | "label" | "buttons" }[];
  full: boolean;
  signature: string;
};

type Room = NonNullable<ReturnType<typeof boxGeneratorWallRoom>>;

// A shape is never changed in place, so the room of one is worked out once.
const rooms = new WeakMap<WorkplaneShape, { room: Room | null; walls: BoxGeneratorWall[]; divider: number }>();

function roomOf(shape: WorkplaneShape) {
  let entry = rooms.get(shape);
  if (!entry) {
    const size = { width: shapeWidth(shape), depth: shapeDepth(shape), height: shape.height };
    const box = normalizeBoxGenerator(size, shape);
    entry = { room: boxGeneratorWallRoom(size, shape), walls: box.boxWalls, divider: box.boxDivider };
    rooms.set(shape, entry);
  }
  return entry;
}

/** Whether a shape is a box whose dividers are set by hand and can be edited on it. */
export function boxWallsEditable(shape: WorkplaneShape | null | undefined): shape is WorkplaneShape {
  return Boolean(shape && shape.kind === "boxGenerator" && shape.boxPart !== "lid" && shape.boxDividerMode === "manual" && !shape.importedMesh && !shape.locked && !shape.hidden);
}

/**
 * Where the room of the dividers lies in the view: the box's mesh, and the place of the room's left back corner on the
 * top of the box in the mesh's own measures, from which x runs to the right and z to the front.
 */
function frameOf(state: ThreeState, shape: WorkplaneShape) {
  const record = state.shapeRecords.get(shape.id);
  const { room, walls, divider } = roomOf(shape);
  if (!record || !room) return null;
  let mesh: THREE.Mesh | null = null;
  record.object.traverse((child) => {
    if (!mesh && child instanceof THREE.Mesh && child.userData.shapeSurface) mesh = child;
  });
  const found = mesh as THREE.Mesh | null;
  if (!found) return null;
  if (!found.geometry.boundingBox) found.geometry.computeBoundingBox();
  const bounds = found.geometry.boundingBox;
  if (!bounds) return null;
  found.updateWorldMatrix(true, false);
  const origin = new THREE.Vector3(bounds.min.x + room.inset.x, bounds.max.y, bounds.min.z + room.inset.z);
  return { mesh: found, origin, room, walls, divider };
}

/** The place under the pointer on the top of the box, in mm from the left and the back of the room; null beside the view. */
function pointerInRoom(state: ThreeState, shape: WorkplaneShape, clientX: number, clientY: number) {
  const frame = frameOf(state, shape);
  if (!frame) return null;
  const rect = state.renderer.domElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  state.camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, state.camera);
  const a = frame.mesh.localToWorld(frame.origin.clone());
  const b = frame.mesh.localToWorld(frame.origin.clone().add(new THREE.Vector3(1, 0, 0)));
  const c = frame.mesh.localToWorld(frame.origin.clone().add(new THREE.Vector3(0, 0, 1)));
  const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
  const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  const local = frame.mesh.worldToLocal(hit);
  return { x: local.x - frame.origin.x, z: local.z - frame.origin.z };
}

/** The grips and labels on screen, kept in step with the camera and the box. */
export function syncBoxWallsOverlay(
  state: ThreeState,
  shape: WorkplaneShape | null,
  overlayRef: MutableRefObject<BoxWallsOverlayState | null>,
  setOverlay: Dispatch<SetStateAction<BoxWallsOverlayState | null>>,
) {
  const frame = shape && boxWallsEditable(shape) ? frameOf(state, shape) : null;
  const clear = () => {
    if (!overlayRef.current) return;
    overlayRef.current = null;
    setOverlay(null);
  };
  if (!shape || !frame) return clear();
  const { mesh, origin, room, walls } = frame;
  const world = (x: number, z: number) => mesh.localToWorld(origin.clone().add(new THREE.Vector3(x, 0, z)));
  // With a corner of the room behind the camera the picture of it makes no sense; nothing is drawn then.
  if (state.camera instanceof THREE.PerspectiveCamera) {
    state.camera.updateMatrixWorld();
    const behind = [[0, 0], [room.width, 0], [room.width, room.depth], [0, room.depth]].some(([x, z]) => world(x, z).applyMatrix4(state.camera.matrixWorldInverse).z > -1e-3);
    if (behind) return clear();
  }
  const screen = (x: number, z: number) => projectToScreen(world(x, z), state);
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  const next: BoxWallsOverlayState = {
    shapeId: shape.id,
    walls: walls.map((wall, index) => {
      const run = wall.dir === "x" ? room.width : room.depth;
      const from = clamp(wall.from, run);
      const to = clamp(wall.to, run);
      const point = (along: number) => (wall.dir === "x" ? screen(along, wall.at) : screen(wall.at, along));
      return { index, dir: wall.dir, from: point(from), to: point(to), middle: point((from + to) / 2) };
    }),
    compartments: room.compartments.map((compartment, index) => {
      const corners = [screen(compartment.minX, compartment.minZ), screen(compartment.maxX, compartment.minZ), screen(compartment.maxX, compartment.maxZ), screen(compartment.minX, compartment.maxZ)];
      const wide = Math.max(...corners.map((corner) => corner.x)) - Math.min(...corners.map((corner) => corner.x));
      const high = Math.max(...corners.map((corner) => corner.y)) - Math.min(...corners.map((corner) => corner.y));
      return {
        index,
        at: screen(compartment.label.x, compartment.label.z),
        text: `${Math.round(compartment.maxX - compartment.minX)} × ${Math.round(compartment.maxZ - compartment.minZ)}`,
        room: wide >= 84 && high >= 56 ? "buttons" as const : wide >= 56 && high >= 26 ? "label" as const : "none" as const,
      };
    }),
    full: walls.length >= MAX_BOX_GENERATOR_WALLS,
    signature: "",
  };
  const rounded = (point: Screen) => `${Math.round(point.x)},${Math.round(point.y)}`;
  next.signature = JSON.stringify([shape.id, next.full, next.walls.map((wall) => [wall.dir, rounded(wall.from), rounded(wall.to)]), next.compartments.map((entry) => [rounded(entry.at), entry.text, entry.room])]);
  if (overlayRef.current?.signature === next.signature) return;
  overlayRef.current = next;
  setOverlay(next);
}

export function BoxWallsOverlay({
  overlay,
  shape,
  pick,
  threeRef,
  onPick,
  onWallsChange,
  onDragActiveChange,
}: {
  overlay: BoxWallsOverlayState;
  /** The box the overlay is about, as it is now. */
  shape: WorkplaneShape;
  pick: BoxWallsPick;
  threeRef: MutableRefObject<ThreeState | null>;
  onPick: (pick: BoxWallsPick) => void;
  onWallsChange: (walls: BoxGeneratorWall[]) => void;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const drag = useRef<{ index: number; part: "move" | "from" | "to"; x: number; z: number; wall: BoxGeneratorWall; pointer: number; moved: boolean } | null>(null);
  const { room, walls, divider } = roomOf(shape);
  if (!room || overlay.shapeId !== shape.id) return null;

  const begin = (event: ReactPointerEvent<HTMLButtonElement>, index: number, part: "move" | "from" | "to") => {
    event.stopPropagation();
    if (event.button > 0 || !walls[index]) return;
    onPick({ type: "wall", index });
    const state = threeRef.current;
    const at = state ? pointerInRoom(state, shape, event.clientX, event.clientY) : null;
    if (!at) return;
    drag.current = { index, part, x: at.x, z: at.z, wall: walls[index], pointer: event.pointerId, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows cannot be held; the drag then ends when it leaves the grip.
    }
    onDragActiveChange?.(true);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const state = threeRef.current;
    if (!current || current.pointer !== event.pointerId || !state) return;
    const at = pointerInRoom(state, shape, event.clientX, event.clientY);
    if (!at) return;
    const next = boxWallDragged(current.wall, current.part, at.x - current.x, at.z - current.z, room, walls.filter((_wall, index) => index !== current.index), event.altKey ? 0.1 : undefined);
    const now = walls[current.index];
    if (!now || (now.at === next.at && now.from === next.from && now.to === next.to)) return;
    current.moved = true;
    onWallsChange(walls.map((wall, index) => (index === current.index ? next : wall)));
  };
  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing was held.
    }
    onDragActiveChange?.(false);
  };
  const split = (index: number, dir: BoxGeneratorWall["dir"]) => {
    const compartment = room.compartments[index];
    if (!compartment || overlay.full) return;
    onWallsChange([...walls, boxGeneratorSplitWall(compartment, dir, room, divider)]);
    onPick({ type: "wall", index: walls.length });
  };
  const remove = (index: number) => {
    onWallsChange(walls.filter((_wall, position) => position !== index));
    onPick(null);
  };
  const grips = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };
  const picked = pick?.type === "wall" ? overlay.walls.find((wall) => wall.index === pick.index) : undefined;
  const name = (wall: { dir: BoxGeneratorWall["dir"]; index: number }) => t(wall.dir === "x" ? "boxGenerator.wallAcross" : "boxGenerator.wallAlong", { number: wall.index + 1 });
  // The cross stands beside the middle grip, along the wall as it is seen.
  const cross = (wall: BoxWallsOverlayState["walls"][number]) => {
    const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y) || 1;
    return { left: wall.middle.x + ((wall.to.x - wall.from.x) / length) * 24, top: wall.middle.y + ((wall.to.y - wall.from.y) / length) * 24 };
  };

  // An end's grip stands a little inside the wall: an end often lies on the middle of another wall, where that one's grip is.
  const endGrip = (wall: BoxWallsOverlayState["walls"][number], part: "from" | "to") => {
    const other = part === "from" ? wall.to : wall.from;
    const length = Math.hypot(other.x - wall[part].x, other.y - wall[part].y) || 1;
    const inward = Math.min(20, length / 4);
    return { left: wall[part].x + ((other.x - wall[part].x) / length) * inward, top: wall[part].y + ((other.y - wall[part].y) / length) * inward };
  };

  return (
    <div className="box-walls-overlay" data-testid="box-walls-overlay">
      <svg className="tape-guides" width="100%" height="100%" aria-hidden="true">
        {overlay.walls.map((wall) => (
          <line key={wall.index} className={`box-walls-overlay-line${picked?.index === wall.index ? " picked" : ""}`} x1={wall.from.x} y1={wall.from.y} x2={wall.to.x} y2={wall.to.y} />
        ))}
      </svg>
      {overlay.compartments.map((compartment) => compartment.room === "none" ? null : (
        <div key={`compartment-${compartment.index}`} className="box-walls-overlay-compartment" style={{ left: compartment.at.x, top: compartment.at.y }}>
          <span className="box-walls-overlay-size">{compartment.text}</span>
          {compartment.room === "buttons" && !overlay.full ? (
            <span className="box-walls-overlay-split">
              <button type="button" title={t("boxGenerator.wallAddAcross")} aria-label={t("boxGenerator.wallAddAcross")} data-testid="box-walls-overlay-across" onPointerDown={(event) => event.stopPropagation()} onClick={() => split(compartment.index, "x")}>
                <SquareSplitVertical size={15} strokeWidth={2.2} />
              </button>
              <button type="button" title={t("boxGenerator.wallAddAlong")} aria-label={t("boxGenerator.wallAddAlong")} data-testid="box-walls-overlay-along" onPointerDown={(event) => event.stopPropagation()} onClick={() => split(compartment.index, "z")}>
                <SquareSplitHorizontal size={15} strokeWidth={2.2} />
              </button>
            </span>
          ) : null}
        </div>
      ))}
      {overlay.walls.map((wall) => (
        <button
          key={`grip-${wall.index}`}
          type="button"
          className={`box-walls-overlay-grip move${picked?.index === wall.index ? " picked" : ""}`}
          style={{ left: wall.middle.x, top: wall.middle.y }}
          title={name(wall)}
          aria-label={name(wall)}
          aria-pressed={picked?.index === wall.index}
          data-testid="box-walls-overlay-grip"
          onPointerDown={(event) => begin(event, wall.index, "move")}
          {...grips}
        />
      ))}
      {picked ? (
        <>
          {(["from", "to"] as const).map((part) => (
            <button
              key={part}
              type="button"
              className="box-walls-overlay-grip end"
              style={endGrip(picked, part)}
              title={t(part === "from" ? "prop.boxWallStart" : "prop.boxWallEnd")}
              aria-label={t(part === "from" ? "prop.boxWallStart" : "prop.boxWallEnd")}
              data-testid={`box-walls-overlay-${part}`}
              onPointerDown={(event) => begin(event, picked.index, part)}
              {...grips}
            />
          ))}
          <button type="button" className="box-walls-overlay-remove" style={cross(picked)} title={t("boxGenerator.wallRemove")} aria-label={t("boxGenerator.wallRemove")} data-testid="box-walls-overlay-remove" onPointerDown={(event) => event.stopPropagation()} onClick={() => remove(picked.index)}>
            <X size={13} strokeWidth={3} />
          </button>
        </>
      ) : null}
    </div>
  );
}
