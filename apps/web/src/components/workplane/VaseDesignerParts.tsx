"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DRAW_PROFILE, PROFILES, profileFunction, type VaseSettings } from "@/lib/vase/vase-geometry.mjs";
import { DEFAULT_LEAF_POINTS, patternPreview } from "@/lib/vase/vase-patterns.mjs";

/*
 * The pieces of the vase designer that are drawn rather than listed: the tiles of the body shapes and of the
 * patterns, the height range with two handles beside the vase's silhouette, and the small board for one's own leaf.
 * The pattern tiles are shaded from the very height fields the core builds the vase from, so a tile shows what the
 * vase will get.
 */

/** A tile's picture, shaded from heights 0..1 with the light from the upper left, kept per pattern and setting. */
const tileCache = new Map<string, string>();

function shadedTile(settings: Record<string, unknown>, size: number) {
  const key = JSON.stringify([settings, size]);
  const known = tileCache.get(key);
  if (known) return known;
  if (typeof document === "undefined") return "";
  const heights = patternPreview(settings, size, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const image = context.createImageData(size, size);
  const at = (i: number, j: number) => heights[Math.min(size - 1, Math.max(0, j)) * size + ((i + size) % size)];
  const light = [-0.55, 0.62, 0.56];
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      // Row 0 is the bottom of the vase: drawn at the bottom of the tile.
      const dx = (at(i + 1, j) - at(i - 1, j)) * 3.2;
      const dy = (at(i, j + 1) - at(i, j - 1)) * 3.2;
      const length = Math.hypot(dx, dy, 1);
      const lit = Math.max(0, (-dx * light[0] - dy * light[1] + light[2]) / length);
      const h = at(i, j);
      const shade = (0.38 + 0.62 * lit) * (0.72 + 0.28 * h);
      const offset = ((size - 1 - j) * size + i) * 4;
      image.data[offset] = Math.round(236 * shade);
      image.data[offset + 1] = Math.round(226 * shade);
      image.data[offset + 2] = Math.round(208 * shade);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const url = canvas.toDataURL("image/png");
  tileCache.set(key, url);
  while (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value as string);
  return url;
}

/** A pattern's picture as an image; empty until it is drawn in the browser. */
export function PatternPicture({ settings, size = 56 }: { settings: Record<string, unknown>; size?: number }) {
  const [url, setUrl] = useState("");
  const key = JSON.stringify(settings);
  useEffect(() => {
    setUrl(shadedTile(JSON.parse(key) as Record<string, unknown>, size));
  }, [key, size]);
  return url ? <img className="vase-tile-picture" src={url} alt="" width={size} height={size} draggable={false} /> : <span className="vase-tile-picture" aria-hidden="true" />;
}

/** The silhouette of a body shape (control points [height 0..1, radius 0..1]) as an outline, standing in a 40 x 52 box. */
export function ProfilePicture({ points }: { points: ReadonlyArray<ReadonlyArray<number>> }) {
  const path = useMemo(() => silhouettePath(points, 40, 52, 3), [points]);
  return (
    <svg className="vase-profile-picture" viewBox="0 0 40 52" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function silhouettePath(points: ReadonlyArray<ReadonlyArray<number>>, width: number, height: number, margin: number) {
  const radius = profileFunction(points);
  const most = Math.max(...points.map((point) => point[1]), 0.01);
  const half = (width - 2 * margin) / 2;
  const steps = 40;
  const side: Array<[number, number]> = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    side.push([(Math.max(0.02, radius(t)) / most) * half, height - margin - t * (height - 2 * margin)]);
  }
  const middle = width / 2;
  const right = side.map(([r, y]) => `${(middle + r).toFixed(2)},${y.toFixed(2)}`);
  const left = [...side].reverse().map(([r, y]) => `${(middle - r).toFixed(2)},${y.toFixed(2)}`);
  return `M${right.join(" L")} L${left.join(" L")} Z`;
}

/** The vase's own profile points (a drawn one, or its preset's). */
export function vaseProfilePoints(vase: VaseSettings): ReadonlyArray<ReadonlyArray<number>> {
  if (vase.profile === "gezeichnet") return vase.profilePoints ?? DRAW_PROFILE;
  return PROFILES[vase.profile]?.points ?? PROFILES.flasche.points;
}

/**
 * The height range of the pattern: one track with a handle for the start and one for the end, the band between
 * them coloured, and beside it the vase's silhouette with the same band. The handles can be dragged, and moved by
 * the arrow keys; the numbers under them can be typed. Start never passes end. Quick choices set the common ranges.
 */
export function VaseZoneRange({
  from,
  to,
  vase,
  disabled,
  labels,
  onChange,
  onInteractionActiveChange,
}: {
  from: number;
  to: number;
  vase: VaseSettings;
  disabled?: boolean;
  labels: { title: string; start: string; end: string; presets: Array<{ label: string; from: number; to: number }> };
  onChange: (from: number, to: number) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);
  const shown = draft ?? { from, to };
  const commit = (next: { from: number; to: number }) => {
    const a = Math.round(Math.min(Math.max(0, next.from), 100));
    const b = Math.round(Math.min(Math.max(0, next.to), 100));
    onChange(Math.min(a, b), Math.max(a, b));
  };
  const points = vaseProfilePoints(vase);
  const outline = useMemo(() => silhouettePath(points, 44, 72, 2), [points]);
  const band = { top: 2 + (1 - shown.to / 100) * 68, bottom: 2 + (1 - shown.from / 100) * 68 };
  const startDrag = () => onInteractionActiveChange?.(true);
  const endDrag = () => {
    onInteractionActiveChange?.(false);
    if (draft) {
      commit(draft);
      setDraft(null);
    }
  };
  return (
    <div className="vase-zone" role="group" aria-label={labels.title}>
      <div className="vase-zone-head">
        <span>{labels.title}</span>
        <small>{shown.from} – {shown.to} %</small>
      </div>
      <div className="vase-zone-body">
        <svg className="vase-zone-silhouette" viewBox="0 0 44 72" aria-hidden="true">
          <defs>
            <clipPath id="vase-zone-clip">
              <path d={outline} />
            </clipPath>
          </defs>
          <path className="vase-zone-outline" d={outline} />
          {shown.to > shown.from ? <rect className="vase-zone-band" x="0" width="44" y={band.top} height={Math.max(0.5, band.bottom - band.top)} clipPath="url(#vase-zone-clip)" /> : null}
        </svg>
        <div className="vase-zone-controls">
          <div className="vase-zone-track" style={{ ["--from" as string]: `${shown.from}%`, ["--to" as string]: `${shown.to}%` }}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={shown.from}
              disabled={disabled}
              aria-label={labels.start}
              onPointerDown={startDrag}
              onPointerUp={endDrag}
              onKeyUp={endDrag}
              onBlur={endDrag}
              onChange={(event) => setDraft({ from: Math.min(Number(event.currentTarget.value), shown.to), to: shown.to })}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={shown.to}
              disabled={disabled}
              aria-label={labels.end}
              onPointerDown={startDrag}
              onPointerUp={endDrag}
              onKeyUp={endDrag}
              onBlur={endDrag}
              onChange={(event) => setDraft({ from: shown.from, to: Math.max(Number(event.currentTarget.value), shown.from) })}
            />
          </div>
          <div className="vase-zone-numbers">
            <label>
              <span>{labels.start}</span>
              <ZoneNumber value={shown.from} disabled={disabled} onCommit={(value) => commit({ from: Math.min(value, to), to })} />
            </label>
            <label>
              <span>{labels.end}</span>
              <ZoneNumber value={shown.to} disabled={disabled} onCommit={(value) => commit({ from, to: Math.max(value, from) })} />
            </label>
          </div>
          <div className="vase-zone-presets">
            {labels.presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                className={from === preset.from && to === preset.to ? "active" : ""}
                aria-pressed={from === preset.from && to === preset.to}
                onClick={() => onChange(preset.from, preset.to)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A percentage typed in: taken on Enter or when the field is left, kept to 0..100. */
function ZoneNumber({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const take = () => {
    const number = Number(text.replace(",", "."));
    if (Number.isFinite(number)) onCommit(Math.min(100, Math.max(0, Math.round(number))));
    else setText(String(value));
  };
  return (
    <span className="vase-zone-number">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={take}
        onKeyDown={(event) => {
          if (event.key === "Enter") take();
        }}
      />
      <small>%</small>
    </span>
  );
}

/**
 * One's own leaf: half its outline as points from the base (bottom) to the tip (top), mirrored to a whole leaf. A point
 * is dragged to change the width there and how far up it sits; the base and the tip stay at the ends.
 */
export function LeafEditor({
  points,
  disabled,
  labels,
  onChange,
  onInteractionActiveChange,
}: {
  points: number[][] | null;
  disabled?: boolean;
  labels: { title: string; hint: string; reset: string };
  onChange: (points: number[][] | null) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const own = points ?? DEFAULT_LEAF_POINTS.map((point) => [...point]);
  const [draft, setDraft] = useState<number[][] | null>(null);
  const shown = draft ?? own;
  const board = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<number | null>(null);
  const width = 120;
  const height = 150;
  const margin = 12;
  const toScreen = ([t, w]: number[]) => [width / 2 + w * (width / 2 - margin), height - margin - t * (height - 2 * margin)];
  const outline = useMemo(() => {
    const right = shown.map(toScreen);
    const left = [...shown].reverse().map(([t, w]) => toScreen([t, -w]));
    return `M${[...right, ...left].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} Z`;
    // toScreen only depends on the constants above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const index = dragging.current;
    if (index === null || !board.current) return;
    const box = board.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const y = ((event.clientY - box.top) / box.height) * height;
    const w = Math.min(1, Math.max(0, (x - width / 2) / (width / 2 - margin)));
    let t = Math.min(1, Math.max(0, (height - margin - y) / (height - 2 * margin)));
    if (index === 0) t = 0;
    else if (index === shown.length - 1) t = 1;
    else t = Math.min(shown[index + 1][0] - 0.02, Math.max(shown[index - 1][0] + 0.02, t));
    setDraft(shown.map((point, k) => (k === index ? [Math.round(t * 1000) / 1000, Math.round(w * 1000) / 1000] : point)));
  };
  const stop = () => {
    if (dragging.current === null) return;
    dragging.current = null;
    onInteractionActiveChange?.(false);
    if (draft) onChange(draft);
    setDraft(null);
  };
  return (
    <div className="vase-leaf-editor">
      <div className="vase-zone-head">
        <span>{labels.title}</span>
        <button type="button" className="vase-link-button" disabled={disabled || !points} onClick={() => onChange(null)}>{labels.reset}</button>
      </div>
      <svg ref={board} viewBox={`0 0 ${width} ${height}`} onPointerMove={move} onPointerUp={stop} onPointerLeave={stop} aria-label={labels.title}>
        <line className="vase-leaf-axis" x1={width / 2} x2={width / 2} y1={margin - 4} y2={height - margin + 4} />
        <path className="vase-leaf-outline" d={outline} />
        {shown.map((point, index) => {
          const [x, y] = toScreen(point);
          return (
            <circle
              key={index}
              className="vase-leaf-point"
              cx={x}
              cy={y}
              r={5}
              onPointerDown={(event) => {
                if (disabled) return;
                event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                dragging.current = index;
                onInteractionActiveChange?.(true);
              }}
            />
          );
        })}
      </svg>
      <p className="cylinder-wrap-hint">{labels.hint}</p>
    </div>
  );
}
