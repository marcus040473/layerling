import { OcctError, type ShapeHandle } from "occt-wasm";

/**
 * The ids of the selected edges a refused fillet or chamfer names: the kernel reports the edges, as
 * passed in, whose contour it could not build. Empty when it names none of them, as when a later
 * step on other edges failed (the second fillet of a chamfillet).
 */
export function cadFaultyEdgeIds(error: unknown, entries: { id: number; edge: ShapeHandle }[]) {
  if (!(error instanceof OcctError) || !error.faultyEdges) return [];
  const faulty = new Set(error.faultyEdges);
  return entries.filter((entry) => faulty.has(entry.edge)).map((entry) => entry.id);
}
