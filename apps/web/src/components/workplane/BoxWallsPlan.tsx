"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { BoxGeneratorCompartment, BoxGeneratorWall } from "@/lib/boxGeneratorGeometry";

/*
 * The box generator's dividers set by hand, drawn from above: the inside of the box with its compartments and walls, the
 * back of the box at the top. A wall is dragged to move it and dragged by an end to make it shorter or longer; a click on a
 * compartment picks it, so the next wall splits just that one. The plan only reports what was picked and how a wall
 * changed; the list of walls is its owner's.
 */

export type BoxWallsPick = { type: "wall"; index: number } | { type: "compartment"; index: number } | null;

type Room = { width: number; depth: number; outline: { x: number; z: number }[]; compartments: BoxGeneratorCompartment[] };

/** The shortest wall the plan leaves when an end is dragged, in mm. */
export const BOX_WALLS_PLAN_MIN_LENGTH = 2;
/** The step a dragged wall moves in, in mm, and how near an end must come to a side or another wall to land on it. */
const STEP = 0.5;
const CATCH = 1.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const stepped = (value: number, step: number) => Math.round(value / step) * step;

/**
 * A wall after it was dragged by `dx`, `dz` mm: moved as a whole ("move") or with one end pulled ("from", "to"). It
 * stays inside the room, moves in steps, and an end lands on a side of the room or on the middle of a wall that crosses
 * its run when it comes near.
 */
export function boxWallDragged(wall: BoxGeneratorWall, part: "move" | "from" | "to", dx: number, dz: number, room: { width: number; depth: number }, others: readonly BoxGeneratorWall[], step = STEP): BoxGeneratorWall {
  const run = wall.dir === "x" ? room.width : room.depth;
  const across = wall.dir === "x" ? room.depth : room.width;
  const alongMove = wall.dir === "x" ? dx : dz;
  const acrossMove = wall.dir === "x" ? dz : dx;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const from = clamp(wall.from, 0, run);
  const to = clamp(wall.to, 0, run);
  if (part === "move") {
    const shift = clamp(stepped(alongMove, step), -from, run - to);
    return { dir: wall.dir, at: round(clamp(stepped(wall.at + acrossMove, step), 0, across)), from: round(from + shift), to: round(to + shift) };
  }
  const stops = [0, run, ...others.filter((other) => other.dir !== wall.dir && wall.at >= other.from - CATCH && wall.at <= other.to + CATCH).map((other) => other.at)];
  const land = (value: number) => {
    const near = stops.reduce((best, stop) => (Math.abs(stop - value) < Math.abs(best - value) ? stop : best), stops[0]);
    return Math.abs(near - value) <= CATCH ? near : stepped(value, step);
  };
  return part === "from"
    ? { dir: wall.dir, at: wall.at, from: round(clamp(land(from + alongMove), 0, to - BOX_WALLS_PLAN_MIN_LENGTH)), to: round(to) }
    : { dir: wall.dir, at: wall.at, from: round(from), to: round(clamp(land(to + alongMove), from + BOX_WALLS_PLAN_MIN_LENGTH, run)) };
}

export function BoxWallsPlan({
  room,
  walls,
  thickness,
  pick,
  disabled,
  label,
  wallLabel,
  compartmentLabel,
  onPick,
  onWallChange,
  onWallRemove,
  onDragActiveChange,
}: {
  room: Room;
  walls: readonly BoxGeneratorWall[];
  /** The dividers' thickness in mm. */
  thickness: number;
  pick: BoxWallsPick;
  disabled?: boolean;
  /** What the drawing is, for a screen reader. */
  label: string;
  wallLabel: (wall: BoxGeneratorWall, index: number) => string;
  compartmentLabel: (compartment: BoxGeneratorCompartment, index: number) => string;
  onPick: (pick: BoxWallsPick) => void;
  onWallChange: (index: number, wall: BoxGeneratorWall) => void;
  onWallRemove: (index: number) => void;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ index: number; part: "move" | "from" | "to"; x: number; z: number; wall: BoxGeneratorWall; pointer: number } | null>(null);
  // Screen pixels per millimetre, so that grips and labels keep their size on the screen whatever the box measures.
  const [scale, setScale] = useState(2);
  const margin = Math.max(room.width, room.depth) * 0.04 + 1;
  const viewWidth = room.width + 2 * margin;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setScale(width / viewWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [viewWidth]);

  // A drag that is cut off because the plan goes away still ends; the newest callback is told, whichever render it is from.
  const dragActive = useRef(onDragActiveChange);
  dragActive.current = onDragActiveChange;
  useEffect(() => () => {
    if (drag.current) dragActive.current?.(false);
  }, []);

  /** Where the pointer is, in mm of the drawing. Without a layout (a test) the pointer's own numbers are taken as mm. */
  const place = (event: { clientX: number; clientY: number }) => {
    const matrix = svgRef.current?.getScreenCTM?.();
    if (!matrix) return { x: event.clientX, z: event.clientY };
    const inverse = matrix.inverse();
    return { x: inverse.a * event.clientX + inverse.c * event.clientY + inverse.e, z: inverse.b * event.clientX + inverse.d * event.clientY + inverse.f };
  };

  const begin = (event: ReactPointerEvent<SVGElement>, index: number, part: "move" | "from" | "to") => {
    event.stopPropagation();
    onPick({ type: "wall", index });
    if (disabled || event.button > 0) return;
    const at = place(event);
    drag.current = { index, part, x: at.x, z: at.z, wall: walls[index], pointer: event.pointerId };
    try {
      svgRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer the browser no longer knows cannot be held; the drag then ends where the pointer leaves the drawing.
    }
    onDragActiveChange?.(true);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const at = place(event);
    const next = boxWallDragged(current.wall, current.part, at.x - current.x, at.z - current.z, room, walls.filter((_wall, index) => index !== current.index), event.altKey ? 0.1 : STEP);
    const now = walls[current.index];
    if (now && (now.at !== next.at || now.from !== next.from || now.to !== next.to)) onWallChange(current.index, next);
  };
  const end = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    try {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Nothing was held.
    }
    onDragActiveChange?.(false);
  };
  const keys = (event: ReactKeyboardEvent<SVGElement>, index: number) => {
    if (disabled) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onWallRemove(index);
      return;
    }
    const by = event.shiftKey ? 5 : STEP;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    onWallChange(index, boxWallDragged(walls[index], "move", delta[0], delta[1], room, [], STEP));
  };

  const points = (outline: { x: number; z: number }[]) => outline.map((point) => `${point.x},${point.z}`).join(" ");
  const grip = 6 / scale;
  const reach = Math.max(thickness, 14 / scale);
  const font = 11 / scale;
  const clipId = `box-walls-clip-${Math.round(room.width * 100)}-${Math.round(room.depth * 100)}-${room.outline.length}`;
  const box = (wall: BoxGeneratorWall, wide: number) => {
    const run = wall.dir === "x" ? room.width : room.depth;
    const from = clamp(wall.from, 0, run);
    const to = clamp(wall.to, 0, run);
    return wall.dir === "x"
      ? { x: from, y: wall.at - wide / 2, width: Math.max(0, to - from), height: wide }
      : { x: wall.at - wide / 2, y: from, width: wide, height: Math.max(0, to - from) };
  };
  const picked = pick?.type === "wall" ? walls[pick.index] : undefined;

  return (
    <svg
      ref={svgRef}
      className={`box-walls-plan${disabled ? " disabled" : ""}`}
      viewBox={`${-margin} ${-margin} ${viewWidth} ${room.depth + 2 * margin}`}
      role="group"
      aria-label={label}
      data-testid="box-walls-plan"
      onPointerDown={() => onPick(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <defs>
        <clipPath id={clipId}><polygon points={points(room.outline)} /></clipPath>
      </defs>
      <polygon className="box-walls-plan-box" points={points(room.outline)} strokeWidth={margin * 1.2} />
      <polygon className="box-walls-plan-floor" points={points(room.outline)} />
      {room.compartments.map((compartment, index) => {
        const wide = compartment.maxX - compartment.minX;
        const deep = compartment.maxZ - compartment.minZ;
        const text = `${Math.round(wide)} × ${Math.round(deep)}`;
        const chosen = pick?.type === "compartment" && pick.index === index;
        return (
          <g key={`compartment-${index}`}>
            <polygon
              className={`box-walls-plan-compartment${chosen ? " picked" : ""}`}
              points={points(compartment.outline)}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={compartmentLabel(compartment, index)}
              aria-pressed={chosen}
              data-testid="box-walls-compartment"
              onPointerDown={(event) => {
                event.stopPropagation();
                onPick(chosen ? null : { type: "compartment", index });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onPick(chosen ? null : { type: "compartment", index });
              }}
            />
            {wide > text.length * font * 0.62 && deep > font * 1.5 ? (
              <text className="box-walls-plan-size" x={compartment.label.x} y={compartment.label.z} fontSize={font} textAnchor="middle" dominantBaseline="central">{text}</text>
            ) : null}
          </g>
        );
      })}
      <g clipPath={`url(#${clipId})`}>
        {walls.map((wall, index) => (
          <rect key={`wall-${index}`} className={`box-walls-plan-wall${pick?.type === "wall" && pick.index === index ? " picked" : ""}`} {...box(wall, thickness)} />
        ))}
      </g>
      {walls.map((wall, index) => (
        <rect
          key={`reach-${index}`}
          className={`box-walls-plan-reach ${wall.dir === "x" ? "across" : "along"}`}
          {...box(wall, reach)}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={wallLabel(wall, index)}
          aria-pressed={pick?.type === "wall" && pick.index === index}
          data-testid="box-walls-wall"
          onPointerDown={(event) => begin(event, index, "move")}
          onFocus={() => {
            if (!drag.current && !(pick?.type === "wall" && pick.index === index)) onPick({ type: "wall", index });
          }}
          onKeyDown={(event) => keys(event, index)}
        />
      ))}
      {picked && pick?.type === "wall" && !disabled ? (["from", "to"] as const).map((part) => {
        const run = picked.dir === "x" ? room.width : room.depth;
        const along = clamp(picked[part], 0, run);
        return (
          <circle
            key={part}
            className={`box-walls-plan-grip ${picked.dir === "x" ? "across" : "along"}`}
            cx={picked.dir === "x" ? along : picked.at}
            cy={picked.dir === "x" ? picked.at : along}
            r={grip}
            strokeWidth={1.5 / scale}
            data-testid={`box-walls-grip-${part}`}
            onPointerDown={(event) => begin(event, pick.index, part)}
          />
        );
      }) : null}
    </svg>
  );
}
