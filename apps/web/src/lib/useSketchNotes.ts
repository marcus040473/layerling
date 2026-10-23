import { useMemo } from "react";
import { t } from "@/lib/i18n";
import { sketchNoteNumbers } from "@/lib/sketchNotes";
import { createNoteId, NOTE_COUNT_LIMIT } from "@/lib/workplaneNotes";
import type { SketchNote, SketchProfile, WorkplaneNote } from "@/types/layerling";

/**
 * The open sketch's notes: put, changed and taken away as part of the sketch, so that each is a
 * step of the sketch's own undo. Finishing the sketch pins them to its body (`notesWithSketchNotes`).
 */
export function useSketchNotes({
  profile,
  commit,
  notes,
  editedId,
  onPlaced,
  setNotice,
}: {
  profile: SketchProfile;
  commit: (next: SketchProfile, message?: string) => void;
  /** The design's notes, as the 3D view has them. */
  notes: readonly WorkplaneNote[];
  /** The body whose sketch is open, or null for a new sketch. */
  editedId: string | null;
  /** The note tool puts one note, as in the 3D view, and is put down. */
  onPlaced: () => void;
  setNotice: (message: string) => void;
}) {
  const sketchNotes = useMemo(() => profile.notes ?? [], [profile.notes]);
  const numbers = useMemo(() => sketchNoteNumbers(notes, editedId, sketchNotes), [editedId, notes, sketchNotes]);
  const withNotes = (next: SketchNote[], message?: string) => commit({ ...profile, notes: next }, message);
  return {
    notes: sketchNotes,
    numbers,
    add: (spot: { x: number; z: number }) => {
      onPlaced();
      const elsewhere = notes.filter((note) => !editedId || note.anchor?.shapeId !== editedId).length;
      if (elsewhere + sketchNotes.length >= NOTE_COUNT_LIMIT) {
        setNotice(t("status.noteLimitReached", { count: NOTE_COUNT_LIMIT }));
        return null;
      }
      const note: SketchNote = { id: createNoteId(), text: "", x: spot.x, z: spot.z };
      withNotes([...sketchNotes, note], t("status.noteAdded"));
      return note.id;
    },
    update: (id: string, patch: Partial<SketchNote>) => withNotes(sketchNotes.map((note) => (note.id === id ? { ...note, ...patch, id } : note))),
    remove: (id: string) => withNotes(sketchNotes.filter((note) => note.id !== id), t("status.noteRemoved")),
  };
}
