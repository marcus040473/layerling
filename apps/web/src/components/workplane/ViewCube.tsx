"use client";

import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { orbitCameraByDrag, setCameraToViewDirection, setCameraToViewFace, syncViewCube, type CameraRig } from "@/components/workplane/cameraRig";
import { t } from "@/lib/i18n";
import { capturePointer } from "@/lib/pointerCapture";
import { useLanguage } from "@/lib/useLanguage";
import {
  beginViewCubeDrag,
  moveViewCubeDrag,
  VIEW_CUBE_ZONE_SIZE,
  VIEW_CUBE_ZONE_START,
  VIEW_CUBE_ZONES,
  viewCubeZoneDirection,
  type ViewCubeDrag,
  type ViewCubeFace,
} from "@/lib/viewCubeDrag";

type ViewCubeProps = {
  /** The camera the cube turns: the 3D view's, or the second view's in its own window. */
  getRig: () => CameraRig | null;
  /** The turning part of the cube; the view's frame loop keeps it facing like the camera. */
  cubeRef: RefObject<HTMLDivElement | null>;
};

const FACES: Array<{ face: ViewCubeFace; className: string; key: string }> = [
  // The top face carries the cube-bottom class and the bottom face cube-top, as the cube's CSS places them.
  { face: "bottom", className: "cube-top", key: "6" },
  { face: "top", className: "cube-bottom", key: "5" },
  { face: "front", className: "cube-front", key: "1" },
  { face: "back", className: "cube-back", key: "2" },
  { face: "right", className: "cube-right", key: "4" },
  { face: "left", className: "cube-left", key: "3" },
];

/** The view cube: a click on a face, an edge or a corner looks from there, a drag turns the view. */
export function ViewCube({ getRig, cubeRef }: ViewCubeProps) {
  useLanguage();
  const dragRef = useRef<ViewCubeDrag | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const lookFrom = useCallback((turn: (rig: CameraRig) => void) => {
    const rig = getRig();
    if (!rig) return;
    turn(rig);
    syncViewCube(rig, cubeRef.current);
  }, [cubeRef, getRig]);

  // The bands along a face's sides and its corners look from that edge or corner (#202).
  const zones = (face: ViewCubeFace) => VIEW_CUBE_ZONES.map(([column, row]) => (
    <span
      key={`${column}:${row}`}
      className={`cube-zone ${column !== 0 && row !== 0 ? "cube-zone-corner" : "cube-zone-edge"}`}
      style={{
        left: `${VIEW_CUBE_ZONE_START[column + 1]}%`,
        top: `${VIEW_CUBE_ZONE_START[row + 1]}%`,
        width: `${VIEW_CUBE_ZONE_SIZE[column + 1]}%`,
        height: `${VIEW_CUBE_ZONE_SIZE[row + 1]}%`,
      }}
      aria-hidden="true"
      onClick={(event) => {
        event.stopPropagation();
        lookFrom((rig) => setCameraToViewDirection(rig, viewCubeZoneDirection(face, column, row)));
      }}
    />
  ));

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.button !== 0 || dragRef.current) {
      return;
    }
    suppressClickRef.current = false;
    dragRef.current = beginViewCubeDrag(event.pointerId, event.clientX, event.clientY);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const move = moveViewCubeDrag(drag, event.clientX, event.clientY);
    if (!move) {
      return;
    }
    if (move.started) {
      // Capture only once the press becomes a drag, so a plain click still
      // lands on the face button underneath.
      capturePointer(event.currentTarget, event.pointerId);
      setDragging(true);
    }
    lookFrom((rig) => orbitCameraByDrag(rig, move.dx, move.dy));
  }, [lookFrom]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (drag.dragging) {
      suppressClickRef.current = true;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // The click that ends a drag must not also snap to the face it ended on.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  return (
    <div
      className={`view-cube ${dragging ? "dragging" : ""}`}
      aria-label={t("view.cube")}
      data-help-section="viewCube"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
    >
      <div className="view-cube-inner" ref={cubeRef}>
        {FACES.map(({ face, className, key }) => (
          <button
            key={face}
            type="button"
            className={`cube-face ${className}`}
            aria-label={t(`view.${face}`)}
            aria-keyshortcuts={key}
            title={t("camera.shortcut", { label: t(`view.${face}`), keys: key })}
            onClick={() => lookFrom((rig) => setCameraToViewFace(rig, face))}
          >
            {t(`view.${face}Short`)}
            {zones(face)}
          </button>
        ))}
      </div>
    </div>
  );
}
