import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { t } from "@/lib/i18n";
import { newReferencePositions, type ReferencePosition } from "@/lib/referencePoints";
import { createNoteId, NOTE_COUNT_LIMIT, patchNote, referencePoints } from "@/lib/workplaneNotes";
import type { WorkplaneNote } from "@/types/layerling";

/**
 * So lange darf eine Notiz getippt oder gezogen werden, ohne dass daraus ein
 * Schritt im Verlauf wird. Danach steht sie darin - wie ein Absatz in einem
 * Textfeld, nicht wie ein Buchstabe.
 */
const NOTE_COMMIT_IDLE_MS = 700;

/**
 * What the editor does with its notes and reference points: put, change and take them away.
 * Every way goes through `commitNotes`, so each leaves a step that undo takes back.
 */
export function useEditorNotes({
  notesRef,
  setNotes,
  commitNotes,
  setNotice,
  setNotesVisible,
}: {
  notesRef: MutableRefObject<WorkplaneNote[]>;
  setNotes: Dispatch<SetStateAction<WorkplaneNote[]>>;
  commitNotes: (next: WorkplaneNote[], message?: string) => void;
  setNotice: (message: string) => void;
  setNotesVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const noteCommitTimerRef = useRef<number | null>(null);

  const addNote = useCallback(
    (note: { x: number; y: number; z: number; anchor?: WorkplaneNote["anchor"] }) => {
      if (notesRef.current.length >= NOTE_COUNT_LIMIT) {
        setNotice(t("status.noteLimitReached", { count: NOTE_COUNT_LIMIT }));
        return null;
      }
      const created: WorkplaneNote = { id: createNoteId(), text: "", x: note.x, y: note.y, z: note.z };
      if (note.anchor) created.anchor = note.anchor;
      commitNotes([...notesRef.current, created], note.anchor ? t("status.notePinned") : t("status.noteAdded"));
      return created.id;
    },
    [commitNotes, setNotice],
  );

  /**
   * Reference points: bare marks in space that shapes snap to. They live among
   * the notes (so they are saved, undone and shared like them) but are not notes.
   */
  const addReferencePoints = useCallback(
    (positions: ReferencePosition[]) => {
      const fresh = newReferencePositions(notesRef.current, positions);
      if (fresh.length === 0) {
        setNotice(t("status.pointsExist"));
        return [] as string[];
      }
      const room = NOTE_COUNT_LIMIT - notesRef.current.length;
      if (room <= 0) {
        setNotice(t("status.noteLimitReached", { count: NOTE_COUNT_LIMIT }));
        return [] as string[];
      }
      const created: WorkplaneNote[] = fresh.slice(0, room).map((position) => ({
        id: createNoteId(),
        text: "",
        ...position,
        kind: "point",
        collapsed: true,
      }));
      setNotesVisible(true);
      commitNotes([...notesRef.current, ...created], t("status.pointsAdded", { count: created.length }));
      return created.map((point) => point.id);
    },
    [commitNotes, setNotice],
  );

  const removeAllReferencePoints = useCallback(() => {
    const points = referencePoints(notesRef.current);
    if (points.length === 0) return;
    commitNotes(notesRef.current.filter((note) => note.kind !== "point"), t("status.pointsRemoved", { count: points.length }));
  }, [commitNotes]);

  /**
   * Beim Tippen und beim Ziehen faellt pro Anschlag eine Aenderung an. Jede
   * davon in den Verlauf zu legen, machte Rueckgaengig unbrauchbar - also geht
   * ein solcher Zwischenstand nur in den Zustand, und der Verlauf bekommt ihn,
   * wenn die Hand stillhaelt oder das Feld den Fokus abgibt.
   */
  const updateNote = useCallback(
    (id: string, patch: Partial<WorkplaneNote>, transient = false) => {
      const next = patchNote(notesRef.current, id, patch);
      if (!next) return;
      if (noteCommitTimerRef.current !== null) {
        window.clearTimeout(noteCommitTimerRef.current);
        noteCommitTimerRef.current = null;
      }
      if (!transient) {
        commitNotes(next);
        return;
      }
      notesRef.current = next;
      setNotes(next);
      noteCommitTimerRef.current = window.setTimeout(() => {
        noteCommitTimerRef.current = null;
        commitNotes(notesRef.current);
      }, NOTE_COMMIT_IDLE_MS);
    },
    [commitNotes],
  );

  const removeNote = useCallback(
    (id: string) => {
      if (noteCommitTimerRef.current !== null) {
        window.clearTimeout(noteCommitTimerRef.current);
        noteCommitTimerRef.current = null;
      }
      const current = notesRef.current;
      const removed = current.find((note) => note.id === id);
      if (!removed) return;
      commitNotes(current.filter((note) => note.id !== id), t(removed.kind === "point" ? "status.pointRemoved" : "status.noteRemoved"));
    },
    [commitNotes],
  );

  return { addNote, addReferencePoints, removeAllReferencePoints, updateNote, removeNote };
}
