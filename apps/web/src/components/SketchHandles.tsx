"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { rotateHandleArrow } from "@/components/workplane/transformOverlayTypes";
import type { PlateSpot, RotateHandleSpot } from "@/lib/sketchHandleSpots";

/** The radius of the arrow's arc in screen pixels, as on the 3D editor's rotate handles. */
const ARROW_RADIUS = 26 * 0.6;

/**
 * The turning arrows round a picture or a selection in the sketch: the 3D editor's rotate handle for the
 * up axis, the same arrow in the same blue, one at each spot. Drawn in screen pixels, scaled onto the plate.
 */
export function SketchRotateHandles({
  spots,
  screenUnit,
  entity,
  locked = false,
  title,
  onPointerDown,
}: {
  spots: RotateHandleSpot[];
  screenUnit: number;
  entity: string;
  /** A locked selection's arrows stay, grey and inert, as on a locked body in 3D. */
  locked?: boolean;
  title: string;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>, corner: number) => void;
}) {
  return (
    <g className="sketch-rotate-handles">
      {spots.map((spot) => {
        // Flat on the plate: the arc lies in the plate and turns about its normal.
        const arrow = rotateHandleArrow((point) => ({ x: point.x, y: point.z }), { x: 0, y: 0, z: 0 }, { x: spot.outward.x, y: 0, z: spot.outward.z }, { x: 0, y: 1, z: 0 }, ARROW_RADIUS);
        return (
          <g key={spot.corner} className={`sketch-rotate-handle ${locked ? "locked" : ""}`} data-sketch-entity={entity} transform={`translate(${spot.x} ${spot.z}) scale(${screenUnit})`} onPointerDown={(event) => onPointerDown(event, spot.corner)}>
            <title>{title}</title>
            {/* The 40px grab area of the 3D handle. */}
            <rect className="sketch-rotate-handle-hit" x={-20} y={-20} width={40} height={40} />
            <svg x={-15} y={-15} width={30} height={30} viewBox="-15 -15 30 30" overflow="visible">
              <path className="rotate-arrow-arc" d={arrow.arc} />
              <path className="rotate-arrow-heads" d={arrow.heads} />
            </svg>
          </g>
        );
      })}
    </g>
  );
}

/** The padlock on a locked picture: a click on it unlocks the picture. */
export function SketchLockBadge({
  spot,
  screenUnit,
  title,
  onPointerDown,
}: {
  spot: PlateSpot;
  screenUnit: number;
  title: string;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
}) {
  return (
    <g className="sketch-lock-badge" data-sketch-entity="image-handle" transform={`translate(${spot.x} ${spot.z}) scale(${screenUnit})`} onPointerDown={onPointerDown}>
      <title>{title}</title>
      <rect x={-12} y={-12} width={24} height={24} rx={6} />
      <LockKeyhole x={-7.5} y={-7.5} size={15} />
    </g>
  );
}
