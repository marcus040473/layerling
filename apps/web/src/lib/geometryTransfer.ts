/**
 * How shapes cross to the geometry worker and back (lib/geometryWorker.ts). A structured clone
 * copies a 300,000-triangle mesh as an array of 2.7 million numbers, one by one; here each long
 * number list goes as a Float64Array whose buffer is transferred, not copied. A Float64Array
 * holds every number exactly as it was, so what comes back is the same to the last bit.
 *
 * The same list is sent once even when several shapes share it (copies of one import do), and a
 * list the worker hands back untouched is sent back as a reference: the page then keeps its own
 * array, as if the work had run on the page.
 */

/** Shorter number lists are cheaper to clone than to pack. */
const PACK_MIN_LENGTH = 256;

const PACKED = "__layerlingPacked";
const SHARED = "__layerlingShared";

type PackedMarker = { [PACKED]: number };
type SharedMarker = { [SHARED]: number };

/** `lists` are the packed arrays themselves, in buffer order: what a reference from the other side points at. */
export type PackedValue = { value: unknown; buffers: Float64Array[]; lists: unknown[][] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function numberList(value: unknown[]): Float64Array | null {
  if (value.length < PACK_MIN_LENGTH) return null;
  const packed = new Float64Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== "number") return null;
    packed[index] = entry;
  }
  return packed;
}

/**
 * Replaces every long number list in a value by a marker. `shared` names lists the other side
 * already holds (by their number there); those go as a reference instead of their numbers.
 */
export function packValue(value: unknown, shared?: ReadonlyMap<unknown[], number>): PackedValue {
  const buffers: Float64Array[] = [];
  const lists: unknown[][] = [];
  const seen = new Map<unknown[], PackedMarker | SharedMarker | null>();
  const walk = (current: unknown): unknown => {
    if (Array.isArray(current)) {
      const known = seen.get(current);
      if (known) return known;
      if (known === undefined) {
        const sharedIndex = shared?.get(current);
        if (sharedIndex !== undefined) {
          const marker: SharedMarker = { [SHARED]: sharedIndex };
          seen.set(current, marker);
          return marker;
        }
        const packed = numberList(current);
        if (packed) {
          const marker: PackedMarker = { [PACKED]: buffers.length };
          buffers.push(packed);
          lists.push(current);
          seen.set(current, marker);
          return marker;
        }
        seen.set(current, null);
      }
      return current.map(walk);
    }
    if (isPlainObject(current)) {
      const copy: Record<string, unknown> = {};
      for (const key of Object.keys(current)) copy[key] = walk(current[key]);
      return copy;
    }
    return current;
  };
  const packedValue = walk(value);
  return { value: packedValue, buffers, lists };
}

/** The transfer list for postMessage. */
export function packedTransfer(packed: PackedValue): ArrayBuffer[] {
  return packed.buffers.map((buffer) => buffer.buffer as ArrayBuffer);
}

/**
 * Turns the markers back into number lists. A reference resolves to `sharedLists[index]`, the
 * caller's own array. `received`, when given, learns which list came from which buffer, so the
 * answer can name them as references.
 */
export function unpackValue(value: unknown, buffers: readonly Float64Array[], sharedLists: readonly unknown[][] = [], received?: Map<unknown[], number>): unknown {
  const lists = new Map<number, unknown[]>();
  const walk = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(walk);
    if (isPlainObject(current)) {
      const packedIndex = current[PACKED];
      if (typeof packedIndex === "number" && Object.keys(current).length === 1) {
        let list = lists.get(packedIndex);
        if (!list) {
          // A plain loop: four times quicker than Array.from for a list of millions.
          const buffer = buffers[packedIndex];
          list = new Array<number>(buffer.length);
          for (let index = 0; index < buffer.length; index += 1) list[index] = buffer[index];
          lists.set(packedIndex, list);
          received?.set(list, packedIndex);
        }
        return list;
      }
      const sharedIndex = current[SHARED];
      if (typeof sharedIndex === "number" && Object.keys(current).length === 1) {
        const list = sharedLists[sharedIndex];
        if (!list) throw new Error(`Shared list ${sharedIndex} is missing`);
        return list;
      }
      const copy: Record<string, unknown> = {};
      for (const key of Object.keys(current)) copy[key] = walk(current[key]);
      return copy;
    }
    return current;
  };
  return walk(value);
}
