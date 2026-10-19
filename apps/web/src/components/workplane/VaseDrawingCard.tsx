"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { numberLocale, t, type MessageKey } from "@/lib/i18n";
import { importModelFiles } from "@/lib/modelImport";
import { useLanguage } from "@/lib/useLanguage";
import type { VaseSettings } from "@/lib/vase/vase-geometry.mjs";
import { profileEditor, sectionEditor, twistEditor, type VaseDrawingBoard, type VaseDrawingOptions } from "@/lib/vase/vase-editors.mjs";
import { vaseNote } from "@/lib/vaseNotes";
import { vaseDrawingPatch, vaseDrawingSettings } from "@/lib/vaseShape";
import { resizedImportedMeshPositions } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

type DrawingMode = "profile" | "section" | "twist";

const MODES: Array<{ mode: DrawingMode; label: MessageKey }> = [
  { mode: "profile", label: "vaseDraw.tabProfile" },
  { mode: "section", label: "vaseDraw.tabSection" },
  { mode: "twist", label: "vaseDraw.tabTwist" },
];

/**
 * A mesh file read the way the import window reads it, as triangles in the vase tool's frame
 * (z up): the drawing board takes a model vase's body form off it.
 */
async function readMeshTriangles(name: string, bytes: Uint8Array) {
  const result = await importModelFiles([new File([bytes as BlobPart], name)]);
  if (!result?.shapes.length) throw new Error(result?.failures[0]?.reason ?? t("status.importUnsupported"));
  const soup: number[] = [];
  for (const shape of result.shapes) {
    const positions = resizedImportedMeshPositions(shape);
    const lift = shape.elevation ?? 0;
    // The editor's y is up; the vase tool's z is.
    for (let i = 0; i + 2 < positions.length; i += 3) soup.push(positions[i] + shape.x, -(positions[i + 2] + shape.z), positions[i + 1] + lift);
  }
  return soup;
}

/**
 * The vase tool's drawing boards on a card of the vase: its body form from the side, its
 * cross-section from above and its twist up the height, in real millimetres. A drag is one step
 * of undo; while it lasts the vase is shown roughly (draft quality), at its end in full.
 */
export function VaseDrawingCard({
  shape,
  disabled,
  onUpdate,
  onInteractionActiveChange,
}: {
  shape: WorkplaneShape;
  disabled: boolean;
  onUpdate: (patch: Partial<WorkplaneShape>) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DrawingMode>("profile");
  return (
    <div className={`property-card ${open ? "" : "collapsed"}`}>
      <button className="property-card-header" type="button" aria-expanded={open} aria-controls={`vase-draw-${shape.id}`} onClick={() => setOpen((value) => !value)}>
        <span>{t("inspector.vaseDraw")}</span>
        <ChevronUp className={open ? "" : "collapsed"} size={25} strokeWidth={2.8} />
      </button>
      {open ? (
        <div className="property-list vase-drawing" id={`vase-draw-${shape.id}`}>
          <p className="cylinder-wrap-hint">{t("inspector.vaseDrawHint")}</p>
          <div className="vase-drawing-tabs" role="group" aria-label={t("inspector.vaseDraw")}>
            {MODES.map((entry) => (
              <button key={entry.mode} type="button" aria-pressed={mode === entry.mode} onClick={() => setMode(entry.mode)}>
                {t(entry.label)}
              </button>
            ))}
          </div>
          <VaseDrawingHost key={mode} mode={mode} shape={shape} disabled={disabled} onUpdate={onUpdate} onInteractionActiveChange={onInteractionActiveChange} />
        </div>
      ) : null}
    </div>
  );
}

function VaseDrawingHost({
  mode,
  shape,
  disabled,
  onUpdate,
  onInteractionActiveChange,
}: {
  mode: DrawingMode;
  shape: WorkplaneShape;
  disabled: boolean;
  onUpdate: (patch: Partial<WorkplaneShape>) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const language = useLanguage();
  const hostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<VaseDrawingBoard | null>(null);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const callbacks = useRef({ onUpdate, onInteractionActiveChange });
  callbacks.current = { onUpdate, onInteractionActiveChange };
  // What the board draws: the vase's settings in real millimetres, ahead of the shape while a drag runs.
  const drawingRef = useRef<VaseSettings | null>(null);
  const dragRef = useRef<{ quality: string } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    const send = (draft: boolean) => {
      frame = 0;
      const drawing = drawingRef.current;
      if (!drawing) return;
      const quality = dragRef.current?.quality ?? drawing.quality;
      callbacks.current.onUpdate(vaseDrawingPatch(shapeRef.current, { ...drawing, quality: draft ? "entwurf" : quality }));
    };
    const options: VaseDrawingOptions = {
      get: () => drawingRef.current ?? (drawingRef.current = vaseDrawingSettings(shapeRef.current)),
      set: (patch, setOptions) => {
        const current = options.get();
        const draft = Boolean(setOptions?.draft);
        if (draft && !dragRef.current) {
          dragRef.current = { quality: current.quality };
          callbacks.current.onInteractionActiveChange?.(true);
        }
        drawingRef.current = { ...current, ...patch };
        boardRef.current?.render();
        if (draft) {
          // One update per frame while dragging; the board itself follows every move.
          if (!frame) frame = requestAnimationFrame(() => send(true));
          return;
        }
        if (frame) cancelAnimationFrame(frame);
        send(false);
        if (dragRef.current) {
          dragRef.current = null;
          callbacks.current.onInteractionActiveChange?.(false);
        }
      },
      tr: (key, params) => t(key as MessageKey, params),
      note: vaseNote,
      locale: numberLocale(),
      readMesh: readMeshTriangles,
    };
    const board = mode === "profile" ? profileEditor(options) : mode === "section" ? sectionEditor(options) : twistEditor(options);
    boardRef.current = board;
    host.replaceChildren(board.el);
    const fitFrame = requestAnimationFrame(() => board.fit());
    return () => {
      cancelAnimationFrame(fitFrame);
      if (frame) cancelAnimationFrame(frame);
      if (dragRef.current) {
        dragRef.current = null;
        callbacks.current.onInteractionActiveChange?.(false);
      }
      boardRef.current = null;
      host.replaceChildren();
    };
  }, [mode, language]);

  // A change from elsewhere (a field, undo, an assistant): the board draws the vase as it is now.
  useEffect(() => {
    if (dragRef.current) return;
    drawingRef.current = vaseDrawingSettings(shape);
    boardRef.current?.render();
  }, [shape]);

  return <div ref={hostRef} className="vase-drawing-host" inert={disabled ? true : undefined} />;
}
