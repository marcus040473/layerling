"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NOTE_CARD_REACH, NoteOverlay, type NoteOverlayState } from "@/components/workplane/ViewportOverlays";
import { capturePointer } from "@/lib/pointerCapture";
import type { SketchNote, WorkplaneWorkspaceSettings } from "@/types/layerling";

type SketchSpot = { x: number; z: number };

const NO_CARD_OFFSET = { x: 0, y: 0 };

/**
 * The notes over the sketch: the same pins and cards as in the 3D view, at their spot in the
 * sketch. A pin is dragged to move the note; the move is one step back with Ctrl+Z.
 */
export function SketchNotes({
  notes,
  numbers,
  toScreen,
  toSketch,
  viewWidth,
  editingId,
  onEditingIdChange,
  onChange,
  onRemove,
  workspace,
}: {
  notes: readonly SketchNote[];
  /** Each note's number, as the 3D view counts it. */
  numbers: ReadonlyMap<string, number>;
  /** A spot in the sketch, in pixels from the top left of the plate. */
  toScreen: (spot: SketchSpot) => { x: number; y: number };
  toSketch: (event: { clientX: number; clientY: number }) => SketchSpot | null;
  viewWidth: number;
  editingId: string | null;
  onEditingIdChange: (id: string | null) => void;
  onChange: (id: string, patch: Partial<SketchNote>) => void;
  onRemove: (id: string) => void;
  workspace: WorkplaneWorkspaceSettings;
}) {
  const [dragged, setDragged] = useState<({ id: string } & SketchSpot) | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number } | null>(null);
  // After a drag, the click that follows must not fold the card open or shut as well.
  const clickSuppressedRef = useRef<string | null>(null);
  // The text being typed goes into the sketch when the field is left, as one step.
  const typedRef = useRef(new Map<string, string>());

  const overlay: NoteOverlayState = {
    notes: notes.map((note) => {
      const spot = dragged?.id === note.id ? dragged : note;
      const screen = toScreen(spot);
      return {
        id: note.id,
        index: numbers.get(note.id) ?? 0,
        text: note.text,
        collapsed: Boolean(note.collapsed),
        attached: false,
        point: false,
        x: spot.x,
        y: 0,
        z: spot.z,
        screenX: screen.x,
        screenY: screen.y,
        behind: false,
        flipped: screen.x + NOTE_CARD_REACH > viewWidth,
      };
    }),
  };

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    dragRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    capturePointer(event.currentTarget, event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!dragged && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
    const spot = toSketch(event);
    if (spot) setDragged({ id, ...spot });
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragged?.id !== id) return;
    clickSuppressedRef.current = id;
    setDragged(null);
    onChange(id, { x: dragged.x, z: dragged.z });
  };

  return (
    <NoteOverlay
      overlay={overlay}
      editingId={editingId}
      onPinPointerDown={pointerDown}
      onPinPointerMove={pointerMove}
      onPinPointerUp={pointerUp}
      onToggle={(id) => {
        if (clickSuppressedRef.current === id) {
          clickSuppressedRef.current = null;
          return;
        }
        const note = notes.find((candidate) => candidate.id === id);
        if (note) onChange(id, { collapsed: !note.collapsed });
      }}
      onTextChange={(id, text) => typedRef.current.set(id, text)}
      onTextCommit={(id) => {
        const text = typedRef.current.get(id);
        typedRef.current.delete(id);
        if (text !== undefined && text !== notes.find((note) => note.id === id)?.text) onChange(id, { text });
      }}
      onRemove={onRemove}
      onEditingIdChange={onEditingIdChange}
      workspace={workspace}
      onPointChange={() => undefined}
      pointCardOffset={NO_CARD_OFFSET}
      pointCardOffsets={{}}
      onPointCardOffsetChange={() => undefined}
    />
  );
}
